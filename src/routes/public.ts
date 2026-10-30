import { Hono } from 'hono';
import type { AppEnv, Env } from '../env';
import { getOrder, logEvent, newOrderId, newPaymentRef, publicOrder, saveContact } from '../lib/orders';
import { getSettings } from '../lib/settings';
import { createG2Client } from '../services/g2bulk';
import { createCheckout } from '../services/ahnajakpay';
import { abaConfigFromSettings, markPaid, syncOrderPayment } from '../services/payments';
import { parseDenom, parseGame, parseGift, syncGameDenoms, type DenomRow, type GameRow, type GiftRow } from '../services/catalog';
import {
  clientIp,
  tooManyAttempts,
  recordAttempt,
  createCustomerSession,
  attachCustomerSessionCookie,
  destroyCustomerSession,
  resolveCustomer,
} from '../lib/auth';
import { uuid, hashPassword, verifyPassword } from '../lib/crypto';

export const publicRoutes = new Hono<AppEnv>();

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getBrandName(categoryTitle: string): string {
  const t = categoryTitle.toLowerCase();
  if (t.includes('roblox')) return 'Roblox';
  if (t.includes('steam')) return 'Steam';
  if (t.includes('itunes') || t.includes('apple')) return 'Apple / iTunes';
  if (t.includes('google play') || t.includes('google')) return 'Google Play';
  if (t.includes('playstation') || t.includes('psn')) return 'PlayStation';
  if (t.includes('xbox')) return 'Xbox';
  if (t.includes('nintendo')) return 'Nintendo';
  if (t.includes('razer')) return 'Razer Gold';
  if (t.includes('amazon')) return 'Amazon';
  if (t.includes('netflix') || t.includes('discord') || t.includes('spotify')) return 'Entertainment';
  return 'Other Vouchers';
}

/* -------------------------------------------------------- customer auth */

publicRoutes.post('/auth/register', async (c) => {
  const env = c.env as Env;
  const ip = clientIp(c);
  if (await tooManyAttempts(env, `cust_reg:${ip}`, 10, 15)) {
    return c.json({ success: false, message: 'Too many registration attempts. Please wait a bit.' }, 429);
  }
  await recordAttempt(env, `cust_reg:${ip}`);

  interface RegisterBody {
    email?: string;
    username?: string;
    password?: string;
  }
  const body = await c.req.json<RegisterBody>().catch(() => ({} as RegisterBody));
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!email || !email.includes('@') || email.length < 5) {
    return c.json({ success: false, message: 'Please enter a valid email address.' }, 400);
  }
  if (!username || username.length < 3 || username.length > 30) {
    return c.json({ success: false, message: 'Username must be between 3 and 30 characters.' }, 400);
  }
  if (!password || password.length < 6) {
    return c.json({ success: false, message: 'Password must be at least 6 characters.' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, message: 'An account with that email already exists.' }, 409);
  }

  const userId = uuid();
  const passHash = await hashPassword(password);
  const now = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO users (id, email, username, password_hash, balance_cents, created_at) VALUES (?, ?, ?, ?, 0, ?)',
  )
    .bind(userId, email, username, passHash, now)
    .run();

  const sessId = await createCustomerSession(env, userId);
  await attachCustomerSessionCookie(c, env, sessId);

  return c.json({
    success: true,
    user: {
      id: userId,
      email,
      username,
      balance: 0,
    },
  });
});

publicRoutes.post('/auth/login', async (c) => {
  const env = c.env as Env;
  const ip = clientIp(c);
  if (await tooManyAttempts(env, `cust_login:${ip}`, 15, 10)) {
    return c.json({ success: false, message: 'Too many login attempts. Please wait a few minutes.' }, 429);
  }
  await recordAttempt(env, `cust_login:${ip}`);

  interface LoginBody {
    login?: string;
    password?: string;
  }
  const body = await c.req.json<LoginBody>().catch(() => ({} as LoginBody));
  const login = String(body.login || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!login || !password) {
    return c.json({ success: false, message: 'Enter your email/username and password.' }, 400);
  }

  const user = await env.DB.prepare(
    'SELECT id, email, username, password_hash, balance_cents FROM users WHERE email = ? OR username = ?',
  )
    .bind(login, login)
    .first<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      balance_cents: number;
    }>();

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ success: false, message: 'Incorrect email/username or password.' }, 401);
  }

  const sessId = await createCustomerSession(env, user.id);
  await attachCustomerSessionCookie(c, env, sessId);

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      balance: Number(user.balance_cents || 0) / 100,
    },
  });
});

publicRoutes.get('/auth/me', async (c) => {
  const env = c.env as Env;
  const customer = await resolveCustomer(c);
  if (!customer) {
    return c.json({ success: true, user: null });
  }

  const { results: recentOrders } = await env.DB.prepare(
    'SELECT id, kind, item_name, denom_name, total_cents, payment_status, fulfill_status, delivery_json, created_at FROM orders WHERE user_id = ? OR customer_contact = ? ORDER BY created_at DESC LIMIT 15',
  )
    .bind(customer.id, customer.email)
    .all<{
      id: string;
      kind: string;
      item_name: string;
      denom_name: string;
      total_cents: number;
      payment_status: string;
      fulfill_status: string;
      delivery_json: string | null;
      created_at: string;
    }>();

  return c.json({
    success: true,
    user: {
      id: customer.id,
      email: customer.email,
      username: customer.username,
      balance: customer.balanceCents / 100,
      orders: (recentOrders ?? []).map((o) => ({
        id: o.id,
        kind: o.kind,
        itemName: o.item_name,
        denomName: o.denom_name,
        totalCents: o.total_cents,
        paymentStatus: o.payment_status,
        fulfillStatus: o.fulfill_status,
        deliveryItems: safeJson<string[]>(o.delivery_json, []),
        createdAt: o.created_at,
      })),
    },
  });
});

publicRoutes.post('/auth/logout', async (c) => {
  await destroyCustomerSession(c);
  return c.json({ success: true });
});

/* ---------------------------------------------------------------- config */

publicRoutes.get('/config', async (c) => {
  const settings = await getSettings(c.env as Env);
  return c.json({
    success: true,
    config: {
      siteName: settings.site_name,
      tagline: settings.site_tagline,
      supportTelegram: settings.support_telegram,
      supportEmail: settings.support_email,
      currency: settings.currency,
      announcement: settings.announcement,
      maintenance: settings.maintenance === 1,
      paymentsOnline: !!(settings.aba_profile_id && settings.aba_secret_key) || settings.payment_demo === 1,
      demoPayments: settings.payment_demo === 1,
    },
  });
});

/* ---------------------------------------------------------------- games */

publicRoutes.get('/catalog/games', async (c) => {
  const env = c.env as Env;
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const limit = Math.min(Number(c.req.query('limit') || 500), 500);

  const { results } = await env.DB.prepare(
    'SELECT * FROM games WHERE visible = 1 ORDER BY featured DESC, sort_order ASC, name ASC LIMIT ?',
  )
    .bind(limit)
    .all<GameRow>();

  const games = (results ?? [])
    .map(parseGame)
    .filter((g) => !q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
    .map(({ code, name, imageUrl, featured, notes }) => ({ code, name, imageUrl, featured, notes }));

  return c.json({ success: true, games });
});

publicRoutes.get('/catalog/games/:code', async (c) => {
  const env = c.env as Env;
  const code = c.req.param('code');

  // Pull a fresh catalogue when the cache is cold or stale (never blocks a broken page).
  let syncError: string | null = null;
  try {
    await syncGameDenoms(env, code);
  } catch (err) {
    syncError = (err as Error).message;
  }

  const game = await env.DB.prepare('SELECT * FROM games WHERE code = ?').bind(code).first<GameRow>();
  if (!game || !game.visible) return c.json({ success: false, message: 'Game not found.' }, 404);

  const denoms = await env.DB.prepare(
    'SELECT * FROM game_denoms WHERE game_code = ? AND visible = 1 ORDER BY sort_order ASC, cost_cents ASC',
  )
    .bind(code)
    .all<DenomRow>();

  const parsed = parseGame(game);
  if (!parsed.fields.length) {
    // Fallback so a game with no cached field info still renders a usable form.
    parsed.fields = ['userid'];
  }

  return c.json({
    success: true,
    game: parsed,
    denominations: (denoms.results ?? []).map(parseDenom),
    syncWarning: syncError,
  });
});

/* --------------------------------------------------------- gift cards */

publicRoutes.get('/catalog/categories', async (c) => {
  const env = c.env as Env;
  const brandParam = (c.req.query('brand') || '').trim();
  const { results } = await env.DB.prepare(
    `SELECT category_id, category_title, COUNT(*) AS n, MIN(image_url) AS image_url
     FROM gift_products WHERE visible = 1 AND category_id IS NOT NULL
     GROUP BY category_id, category_title ORDER BY category_title ASC`,
  ).all<{ category_id: number; category_title: string; n: number; image_url: string }>();

  const allCategories = (results ?? []).map((r) => ({
    id: r.category_id,
    title: r.category_title,
    count: r.n,
    brand: getBrandName(r.category_title),
    imageUrl: r.image_url || '',
  }));

  const brandMap = new Map<string, { brand: string; count: number; subcategories: typeof allCategories; imageUrl: string }>();
  for (const cat of allCategories) {
    const b = cat.brand;
    const existing = brandMap.get(b);
    if (!existing) {
      brandMap.set(b, {
        brand: b,
        count: cat.count,
        subcategories: [cat],
        imageUrl: cat.imageUrl,
      });
    } else {
      existing.count += cat.count;
      existing.subcategories.push(cat);
      if (!existing.imageUrl && cat.imageUrl) existing.imageUrl = cat.imageUrl;
    }
  }

  const brands = Array.from(brandMap.values()).sort((a, b) => b.count - a.count);
  const filteredCategories = brandParam
    ? allCategories.filter((cat) => cat.brand.toLowerCase() === brandParam.toLowerCase())
    : allCategories;

  return c.json({
    success: true,
    brands,
    categories: filteredCategories,
  });
});

publicRoutes.get('/catalog/products', async (c) => {
  const env = c.env as Env;
  const q = (c.req.query('q') || '').trim();
  const brand = (c.req.query('brand') || '').trim();
  const category = Number(c.req.query('category') || 0);
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const limit = Math.min(Math.max(1, Number(c.req.query('limit') || 24)), 60);
  const offset = (page - 1) * limit;

  const where: string[] = ['visible = 1'];
  const binds: unknown[] = [];
  if (q) {
    where.push('(title LIKE ? OR category_title LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    where.push('category_id = ?');
    binds.push(category);
  } else if (brand) {
    const b = brand.toLowerCase();
    if (b === 'roblox') {
      where.push('category_title LIKE ?');
      binds.push('%roblox%');
    } else if (b === 'steam') {
      where.push('category_title LIKE ?');
      binds.push('%steam%');
    } else if (b.includes('itunes') || b.includes('apple')) {
      where.push('(category_title LIKE ? OR category_title LIKE ?)');
      binds.push('%itunes%', '%apple%');
    } else if (b.includes('google')) {
      where.push('category_title LIKE ?');
      binds.push('%google%');
    } else if (b.includes('playstation') || b.includes('psn')) {
      where.push('(category_title LIKE ? OR category_title LIKE ?)');
      binds.push('%playstation%', '%psn%');
    } else if (b === 'xbox') {
      where.push('category_title LIKE ?');
      binds.push('%xbox%');
    } else if (b === 'nintendo') {
      where.push('category_title LIKE ?');
      binds.push('%nintendo%');
    } else if (b.includes('razer')) {
      where.push('category_title LIKE ?');
      binds.push('%razer%');
    } else if (b === 'amazon') {
      where.push('category_title LIKE ?');
      binds.push('%amazon%');
    } else if (b.includes('entertainment')) {
      where.push('(category_title LIKE ? OR category_title LIKE ? OR category_title LIKE ?)');
      binds.push('%netflix%', '%discord%', '%spotify%');
    } else {
      where.push('category_title LIKE ?');
      binds.push(`%${brand}%`);
    }
  }
  const clause = where.join(' AND ');

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM gift_products WHERE ${clause}`)
    .bind(...binds)
    .first<{ n: number }>();
  const { results } = await env.DB.prepare(
    `SELECT * FROM gift_products WHERE ${clause} ORDER BY sort_order ASC, title ASC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<GiftRow>();

  return c.json({
    success: true,
    page,
    limit,
    total: totalRow?.n ?? 0,
    totalPages: Math.max(1, Math.ceil((totalRow?.n ?? 0) / limit)),
    products: (results ?? [])
      .map(parseGift)
      .map(({ costCents, ...rest }) => ({ ...rest, brand: getBrandName(rest.categoryTitle) })),
  });
});

publicRoutes.get('/catalog/products/:id', async (c) => {
  const env = c.env as Env;
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ success: false, message: 'Invalid product.' }, 400);
  const row = await env.DB.prepare('SELECT * FROM gift_products WHERE id = ? AND visible = 1').bind(id).first<GiftRow>();
  if (!row) return c.json({ success: false, message: 'Product not found.' }, 404);
  const { costCents, ...product } = parseGift(row);
  return c.json({ success: true, product: { ...product, brand: getBrandName(product.categoryTitle) } });
});

/* --------------------------------------------------- player validation */

publicRoutes.post('/player/verify', async (c) => {
  const env = c.env as Env;
  const ip = clientIp(c);
  if (await tooManyAttempts(env, `verify:${ip}`, 40, 1)) {
    return c.json({ success: false, message: 'Too many checks. Please wait a minute.' }, 429);
  }
  await recordAttempt(env, `verify:${ip}`);

  const body = await c.req.json<{ game?: string; userId?: string; serverId?: string; charname?: string }>();
  const game = String(body.game || '').trim();
  const userId = String(body.userId || '').trim();
  if (!game || !userId) return c.json({ success: false, message: 'Game and user ID are required.' }, 400);

  const settings = await getSettings(env);
  const g2 = createG2Client({ baseUrl: settings.g2bulk_base_url, apiKey: settings.g2bulk_api_key });

  try {
    const result = await g2.checkPlayerId({
      game,
      user_id: userId,
      server_id: body.serverId ? String(body.serverId).trim() : undefined,
      charname: body.charname ? String(body.charname).trim() : undefined,
    });
    const valid = result.valid === 'valid';
    return c.json({
      success: true,
      valid,
      name: result.name || '',
      message: valid
        ? result.name === 'No validation required'
          ? 'Direct delivery — live verification not required for this game'
          : `Account verified: ${result.name}`
        : 'Could not find that account. Please double-check your ID and Server.',
    });
  } catch (err) {
    return c.json({
      success: true,
      valid: false,
      unavailable: true,
      name: '',
      message: 'Player verification temporarily unavailable. You can proceed if your details are correct.',
    });
  }
});

/* ------------------------------------------------------------- ordering */

interface CreateOrderBody {
  kind?: 'TOPUP' | 'GIFTCARD';
  gameCode?: string;
  denomName?: string;
  productId?: number;
  quantity?: number;
  userId?: string;
  serverId?: string;
  charname?: string;
  contact?: string;
  note?: string;
}

publicRoutes.post('/orders', async (c) => {
  const env = c.env as Env;
  const settings = await getSettings(env);

  if (settings.maintenance === 1) {
    return c.json({ success: false, message: 'We are doing maintenance. Please try again shortly.' }, 503);
  }

  const customer = await resolveCustomer(c);
  const body = await c.req.json<CreateOrderBody>().catch(() => ({} as CreateOrderBody));
  const kind = body.kind === 'GIFTCARD' ? 'GIFTCARD' : 'TOPUP';

  // Strict policy: Gift cards require an account for digital voucher delivery
  if (kind === 'GIFTCARD' && !customer) {
    return c.json(
      {
        success: false,
        requireAuth: true,
        message: 'Account required: Gift Card purchases strictly require registration so your voucher codes are safely deposited in your account vault. Please sign in or register to continue.',
      },
      401,
    );
  }

  const contact = String(body.contact || customer?.email || '').trim();
  if (contact.length < 3) {
    return c.json({ success: false, message: 'Enter an email or Telegram handle so we can send your receipt.' }, 400);
  }

  const cfg = await abaConfigFromSettings(env);
  const demoPayments = settings.payment_demo === 1;
  if (!cfg && !demoPayments) {
    return c.json(
      {
        success: false,
        message: 'Card payments are not configured yet. An administrator must add the Ahnajak Pay profile ID and secret key.',
      },
      503,
    );
  }

  const orderId = newOrderId();
  const paymentRef = newPaymentRef();

  let itemRef = '';
  let itemName = '';
  let itemImage = '';
  let denomRef = '';
  let denomName = '';
  let unitPriceCents = 0;
  let quantity = 1;
  let account: Record<string, string> = {};

  if (kind === 'TOPUP') {
    const gameCode = String(body.gameCode || '').trim();
    const denomNameRaw = String(body.denomName || '').trim();
    const userId = String(body.userId || '').trim();

    if (!gameCode || !denomNameRaw) return c.json({ success: false, message: 'Choose a game and a package.' }, 400);
    if (!userId) return c.json({ success: false, message: 'Player ID is required.' }, 400);

    const game = await env.DB.prepare('SELECT * FROM games WHERE code = ? AND visible = 1')
      .bind(gameCode)
      .first<GameRow>();
    if (!game) return c.json({ success: false, message: 'Game not found.' }, 404);

    const fields = parseGame(game).fields;
    const denom = await env.DB.prepare(
      'SELECT * FROM game_denoms WHERE game_code = ? AND g2_name = ? AND visible = 1',
    )
      .bind(gameCode, denomNameRaw)
      .first<DenomRow>();
    if (!denom) return c.json({ success: false, message: 'That package is no longer available.' }, 404);

    if (fields.includes('serverid') && !String(body.serverId || '').trim()) {
      return c.json({ success: false, message: 'Server / Zone ID is required for this game.' }, 400);
    }
    if (fields.includes('charname') && !String(body.charname || '').trim()) {
      return c.json({ success: false, message: 'Character name is required for this game.' }, 400);
    }

    itemRef = gameCode;
    itemName = game.name;
    itemImage = game.image_url;
    denomRef = denom.g2_name;
    denomName = denom.display_name;
    unitPriceCents = denom.price_cents;
    account = {
      user_id: userId,
      ...(body.serverId ? { server_id: String(body.serverId).trim() } : {}),
      ...(body.charname ? { charname: String(body.charname).trim() } : {}),
    };
  } else {
    const productId = Number(body.productId);
    quantity = Math.min(Math.max(1, Math.trunc(Number(body.quantity) || 1)), 10);
    if (!Number.isFinite(productId)) return c.json({ success: false, message: 'Choose a gift card.' }, 400);

    const product = await env.DB.prepare('SELECT * FROM gift_products WHERE id = ? AND visible = 1')
      .bind(productId)
      .first<GiftRow>();
    if (!product) return c.json({ success: false, message: 'That gift card is no longer available.' }, 404);
    if (product.stock === 0) return c.json({ success: false, message: 'That gift card is out of stock.' }, 409);

    const parsed = parseGift(product);
    itemRef = String(product.id);
    itemName = product.title;
    itemImage = parsed.imageUrl;
    denomRef = String(product.id);
    denomName = product.title;
    unitPriceCents = product.price_cents;
  }

  const totalCents = unitPriceCents * quantity;
  if (!Number.isFinite(totalCents) || totalCents < 1) {
    return c.json({ success: false, message: 'That amount cannot be charged.' }, 400);
  }

  const origin = new URL(c.req.url).origin;
  let checkout: { txId: string; checkoutUrl: string };
  if (cfg) {
    try {
      checkout = await createCheckout(cfg, {
        transactionId: paymentRef,
        amount: totalCents / 100,
        successUrl: `${origin}/order/${orderId}?paid=1`,
        remark: `${settings.site_name} ${orderId}`,
      });
    } catch (err) {
      return c.json({ success: false, message: `Payment gateway error: ${(err as Error).message}` }, 502);
    }
  } else {
    // Test mode: no gateway call, no money can move. A staff member confirms the order manually.
    checkout = { txId: `DEMO-${paymentRef}`, checkoutUrl: '' };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO orders (
      id, user_id, kind, item_ref, item_name, item_image, denom_ref, denom_name, quantity,
      unit_price_cents, total_cents, currency, account_json, player_name, customer_contact, note,
      payment_status, payment_ref, aba_tx_id, aba_checkout_url, paid_at,
      fulfill_status, supplier_order_id, delivery_json, supplier_error, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, NULL, 'PENDING', NULL, NULL, NULL, 0, ?, ?)`,
  )
    .bind(
      orderId,
      customer?.id ?? null,
      kind,
      itemRef,
      itemName,
      itemImage,
      denomRef,
      denomName,
      quantity,
      unitPriceCents,
      totalCents,
      'USD',
      JSON.stringify(account),
      null,
      contact,
      String(body.note || '').slice(0, 300),
      paymentRef,
      checkout.txId,
      checkout.checkoutUrl,
      now,
      now,
    )
    .run();

  await logEvent(env, orderId, 'created', `${kind} order created for ${totalCents / 100} USD${customer ? ` (user ${customer.username})` : ' (guest)'}`);

  const created = await getOrder(env, orderId);
  return c.json(
    {
      success: true,
      order: created ? publicOrder(created) : null,
      payment: {
        checkoutUrl: `${origin}/api/payment/redirect/${orderId}`,
        qrUrl: `/api/orders/${orderId}/qr`,
        gatewayCheckoutUrl: checkout.checkoutUrl,
        demo: !cfg,
      },
    },
    201,
  );
});

/* ------------------------------------------------------------ order read */

publicRoutes.get('/orders/:id', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const wantSync = c.req.query('sync') === '1';

  let order = await getOrder(env, c.req.param('id'));
  if (!order) return c.json({ success: false, message: 'Order not found.' }, 404);

  if (wantSync && order.payment_status === 'PENDING') {
    const synced = await syncOrderPayment(env, origin, order.id);
    if (synced) order = synced.order;
  }

  const { results: events } = await env.DB.prepare(
    'SELECT kind, message, created_at FROM order_events WHERE order_id = ? ORDER BY id ASC',
  )
    .bind(order.id)
    .all<{ kind: string; message: string; created_at: string }>();

  return c.json({
    success: true,
    order: publicOrder(order),
    events: events ?? [],
    qrUrl: order.payment_status === 'PENDING' ? `/api/orders/${order.id}/qr` : null,
    checkoutUrl: order.payment_status === 'PENDING' ? `/api/payment/redirect/${order.id}` : null,
  });
});

/** Streams the gateway QR image so the browser never talks to a third-party origin. */
publicRoutes.get('/orders/:id/qr', async (c) => {
  const env = c.env as Env;
  const order = await getOrder(env, c.req.param('id'));
  if (!order) return c.text('Order not found', 404);
  if (order.payment_status !== 'PENDING') return c.text('Payment already closed', 410);

  if (String(order.aba_tx_id || '').startsWith('DEMO-')) {
    // Test mode: never draw a fake QR that could be mistaken for a real payment code.
    return new Response(demoQrSvg(order.id, order.total_cents), {
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const cfg = await abaConfigFromSettings(env);
  if (!cfg || !order.aba_tx_id) return c.text('Payment gateway unavailable', 503);

  const upstream = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/api/payment/qr/${order.aba_tx_id}`, {
    headers: { accept: 'image/svg+xml', 'user-agent': 'g2topup/1.0' },
  });
  if (!upstream.ok) return c.text('QR unavailable', 502);

  return new Response(upstream.body, {
    headers: {
      'content-type': upstream.headers.get('content-type') || 'image/svg+xml',
      'cache-control': 'public, max-age=60',
    },
  });
});

/** Lets the customer force a reconciliation right after they paid. */
publicRoutes.post('/orders/:id/refresh', async (c) => {
  const env = c.env as Env;
  const origin = new URL(c.req.url).origin;
  const synced = await syncOrderPayment(env, origin, c.req.param('id'));
  if (!synced) return c.json({ success: false, message: 'Order not found.' }, 404);
  return c.json({ success: true, order: publicOrder(synced.order), changed: synced.changed });
});

/* -------------------------------------------------------------- contact */

publicRoutes.post('/contact', async (c) => {
  const env = c.env as Env;
  const ip = clientIp(c);
  if (await tooManyAttempts(env, `contact:${ip}`, 5, 10)) {
    return c.json({ success: false, message: 'Too many messages. Please try again later.' }, 429);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    orderId?: string;
    message?: string;
  };
  const message = String(body.message || '').trim();
  if (message.length < 10) return c.json({ success: false, message: 'Please describe your issue.' }, 400);

  await recordAttempt(env, `contact:${ip}`);
  const id = await saveContact(env, {
    name: String(body.name || '').slice(0, 120),
    email: String(body.email || '').slice(0, 160),
    orderId: String(body.orderId || '').slice(0, 40),
    message: message.slice(0, 4000),
  });

  return c.json({ success: true, id, message: 'Thanks — we received your message and will reply soon.' });
});

/** Demo payment simulator: triggers markPaid and fulfillment when payment_demo === 1 */
publicRoutes.post('/payment/demo-pay/:id', async (c) => {
  const env = c.env as Env;
  const settings = await getSettings(env);
  if (settings.payment_demo !== 1) {
    return c.json({ success: false, message: 'Demo mode is disabled.' }, 403);
  }
  const id = c.req.param('id');
  const order = await getOrder(env, id);
  if (!order) return c.json({ success: false, message: 'Order not found.' }, 404);
  if (order.payment_status === 'PAID') {
    return c.json({ success: true, message: 'Order is already paid.' });
  }

  const origin = new URL(c.req.url).origin;
  const ok = await markPaid(env, origin, id, 'Demo payment simulator');
  if (!ok) return c.json({ success: false, message: 'Could not mark order paid.' }, 400);

  return c.json({ success: true, message: 'Order marked paid and fulfillment initiated.' });
});

/* ------------------------------------------------- gateways / redirects */

/** Redirects the browser to the hosted gateway checkout (fallback for the QR modal). */
publicRoutes.get('/payment/redirect/:id', async (c) => {
  const env = c.env as Env;
  const order = await getOrder(env, c.req.param('id'));
  if (!order || !order.aba_checkout_url) return c.redirect('/');
  return c.redirect(order.aba_checkout_url);
});

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      default:
        return '&quot;';
    }
  });
}

/** Test-mode marker shown instead of a QR — deliberately not scannable. */
function demoQrSvg(orderId: string, totalCents: number): string {
  const amount = `$${(totalCents / 100).toFixed(2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300" role="img" aria-label="Test mode - no real payment code">
  <rect width="300" height="300" rx="18" fill="#0b0d11"/>
  <rect x="10" y="10" width="280" height="280" rx="12" fill="none" stroke="#c9ff3f" stroke-width="2" stroke-dasharray="8 8" opacity="0.6"/>
  <text x="150" y="104" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" fill="#8f98ab" letter-spacing="3">TEST MODE</text>
  <text x="150" y="152" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="700" fill="#c9ff3f">${escapeXml(amount)}</text>
  <text x="150" y="186" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" fill="#e6e9f0">${escapeXml(orderId)}</text>
  <text x="150" y="224" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#6b7488">No QR is generated in test mode.</text>
  <text x="150" y="242" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#6b7488">A staff member confirms the order.</text>
</svg>`;
}
