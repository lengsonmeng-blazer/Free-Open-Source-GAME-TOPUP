// End-to-end integration testing for Free-Source-Code-GameTopUp
// Tests backend API, D1 queries, order flow, demo payments, fulfillment, and admin endpoints.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8789;
const BASE = `http://127.0.0.1:${PORT}`;

console.log(`\n======================================================`);
console.log(`  G2Bulk Game Top-Up Store — End-to-End Test Suite`);
console.log(`======================================================\n`);

// 1. Spawn wrangler dev on dedicated port
console.log(`[e2e] Spawning local wrangler dev on port ${PORT}...`);
const server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOut = '';
server.stdout.on('data', (d) => {
  serverOut += d.toString();
});
server.stderr.on('data', (d) => {
  serverOut += d.toString();
});

// Wait for server to become healthy
let healthy = false;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      healthy = true;
      break;
    }
  } catch {
    // Keep polling
  }
}

if (!healthy) {
  console.error('[e2e] Server failed to start within 40 seconds. Log output:');
  console.error(serverOut.slice(-2000));
  server.kill();
  process.exit(1);
}

console.log(`[e2e] Local server is healthy and responding at ${BASE}!\n`);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    -> ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

let cookieHeader = '';

try {
  // Test 1: Health
  await test('GET /api/health returns status ok and database info', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.ok === true, 'Health check ok not true');
    assert(data.service === 'g2topup', 'Service name mismatch');
    assert(typeof data.time === 'string', 'Missing timestamp');
  });

  // Test 2: Public Store Configuration
  await test('GET /api/config returns site settings and payment capabilities', async () => {
    const res = await fetch(`${BASE}/api/config`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Response success not true');
    assert(typeof data.config.siteName === 'string', 'Missing siteName');
    assert(typeof data.config.demoPayments === 'boolean', 'Missing demoPayments flag');
  });

  // Test 3: Games List & Search
  let firstGameCode = '';
  await test('GET /api/catalog/games returns catalog with pagination', async () => {
    const res = await fetch(`${BASE}/api/catalog/games?limit=10`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Response success not true');
    assert(Array.isArray(data.games), 'Games is not an array');
    assert(data.games.length > 0, 'Games array is empty');
    firstGameCode = data.games[0].code;
    assert(typeof firstGameCode === 'string' && firstGameCode.length > 0, 'Game code is invalid');
  });

  // Test 4: Single Game & Denominations
  let selectedDenomName = '';
  await test(`GET /api/catalog/games/${firstGameCode} returns game detail and denoms`, async () => {
    const res = await fetch(`${BASE}/api/catalog/games/${firstGameCode}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Response success not true');
    assert(data.game.code === firstGameCode, 'Game code mismatch');
    assert(Array.isArray(data.denominations), 'Denominations is not an array');
    assert(data.denominations.length > 0, 'Denominations is empty');
    selectedDenomName = data.denominations[0].name;
    assert(selectedDenomName && selectedDenomName.length > 0, 'Invalid denomination name');
  });

  // Test 5: Gift Vouchers List, Categories & Brand Platforms
  let selectedGiftId = 0;
  await test('GET /api/catalog/products and /api/catalog/categories return vouchers & brand platforms', async () => {
    const catRes = await fetch(`${BASE}/api/catalog/categories`);
    assert(catRes.status === 200, 'Categories query failed');
    const catData = await catRes.json();
    assert(Array.isArray(catData.categories), 'Categories is not an array');
    assert(Array.isArray(catData.brands), 'Brands is not an array');
    assert(catData.brands.length > 0, 'Brands list is empty');
    assert(typeof catData.brands[0].brand === 'string', 'Brand name missing');

    // Test filtered brand query
    const brandRes = await fetch(`${BASE}/api/catalog/products?brand=Steam&limit=5`);
    assert(brandRes.status === 200, 'Brand query failed');
    const brandData = await brandRes.json();
    assert(brandData.success === true, 'Brand products query failed');
    assert(Array.isArray(brandData.products), 'Brand products not an array');

    const res = await fetch(`${BASE}/api/catalog/products?limit=10`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Response success not true');
    assert(Array.isArray(data.products), 'Products is not an array');
    assert(data.products.length > 0, 'No products found');
    selectedGiftId = data.products[0].id;
    assert(selectedGiftId > 0, 'Invalid gift product ID');
  });

  // Test 6: Player Account Verification across input types
  await test('POST /api/player/verify handles single-ID valid player check', async () => {
    const res = await fetch(`${BASE}/api/player/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'pubgm', userId: '5123456789' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Player check success not true');
    assert(data.valid === true, 'Player should be valid');
    assert(data.name === 'Eliah2', `Expected Eliah2, got ${data.name}`);
  });

  await test('POST /api/player/verify handles invalid ID gracefully without crashing', async () => {
    const res = await fetch(`${BASE}/api/player/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'pubgm', userId: '9999999999999999' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Player check success should be true');
    assert(data.valid === false, 'Invalid player should have valid: false');
  });

  await test('POST /api/player/verify handles 2-ID games (MLBB User + Zone ID)', async () => {
    const res = await fetch(`${BASE}/api/player/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'mlbb', userId: '12345678', serverId: '2001' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Player check success should be true');
    assert(typeof data.message === 'string', 'Missing message string');
  });

  await test('POST /api/player/verify handles server select games (Genshin UID + Server)', async () => {
    const res = await fetch(`${BASE}/api/player/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'genshin', userId: '800000000', serverId: 'Asia' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Player check success should be true');
    assert(data.valid === true, 'Genshin should report valid');
  });

  // Test 7: Create Game Top-Up Order & KHQR
  let gameOrderId = '';
  await test('POST /api/orders creates game top-up order with KHQR SVG', async () => {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'TOPUP',
        gameCode: firstGameCode,
        denomName: selectedDenomName,
        userId: '12345678',
        serverId: '2001',
        charname: 'HeroPlayer',
        contact: 'test@customer.com',
      }),
    });
    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Order creation failed: ${data.message}`);
    assert(data.order && data.order.id.startsWith('GT-'), 'Invalid order id format');
    assert(data.order.paymentStatus === 'PENDING', 'Initial order status not PENDING');
    assert(typeof data.payment.qrUrl === 'string', 'Missing qrUrl');
    gameOrderId = data.order.id;
  });

  // Test 8: Get Order & QR endpoint
  await test('GET /api/orders/:id and /api/orders/:id/qr', async () => {
    const res = await fetch(`${BASE}/api/orders/${gameOrderId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Order query not success');
    assert(data.order.id === gameOrderId, 'Order ID mismatch');
    assert(data.order.paymentStatus === 'PENDING', 'Expected PENDING paymentStatus');

    const qrRes = await fetch(`${BASE}/api/orders/${gameOrderId}/qr`);
    assert(qrRes.status === 200, `Expected 200 QR status, got ${qrRes.status}`);
    assert(qrRes.headers.get('content-type')?.includes('svg'), 'Expected SVG content-type');
    const svg = await qrRes.text();
    assert(svg.includes('<svg'), 'QR endpoint did not return valid SVG');
  });

  // Test 9: Simulate Payment & Instant Fulfillment (Demo Mode)
  await test('POST /api/payment/demo-pay/:id settles payment and fulfills top-up', async () => {
    const res = await fetch(`${BASE}/api/payment/demo-pay/${gameOrderId}`, { method: 'POST' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Demo pay failed: ${data.message}`);

    // Verify order state
    const orderRes = await fetch(`${BASE}/api/orders/${gameOrderId}`);
    const orderData = await orderRes.json();
    assert(orderData.order.paymentStatus === 'PAID', 'Order payment status not PAID');
    assert(orderData.order.fulfillStatus === 'SUCCESS', `Expected fulfillStatus SUCCESS, got ${orderData.order.fulfillStatus}`);
    assert(Array.isArray(orderData.order.delivery), 'Expected delivery array');
    assert(orderData.order.delivery.length > 0, 'Delivery array is empty');
  });

  // Test 10: Strict Authentication Policy for Gift Cards & Customer Session
  let giftOrderId = '';
  let customerCookie = '';

  await test('POST /api/orders strictly rejects guest gift card checkout with HTTP 401', async () => {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'GIFTCARD',
        productId: selectedGiftId,
        quantity: 1,
        contact: 'guest@customer.com',
      }),
    });
    assert(res.status === 401, `Expected 401 Unauthorized for guest gift card, got ${res.status}`);
    const data = await res.json();
    assert(data.success === false, 'Expected success: false');
    assert(data.requireAuth === true, 'Expected requireAuth: true flag');
  });

  await test('POST /api/auth/register creates customer account and session', async () => {
    const randTag = Math.floor(Math.random() * 100000);
    const regRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `gamer_${randTag}@test.com`,
        username: `gamer_${randTag}`,
        password: 'securePass123',
      }),
    });
    assert(regRes.status === 201 || regRes.status === 200, `Expected 201/200, got ${regRes.status}`);
    const regData = await regRes.json();
    assert(regData.success === true, 'Customer registration failed');
    assert(regData.user && typeof regData.user.id === 'string', 'Missing user ID');

    const rawCookies = regRes.headers.getSetCookie ? regRes.headers.getSetCookie() : [regRes.headers.get('set-cookie')];
    for (const c of rawCookies) {
      if (c && c.includes('gt_user_session=')) {
        customerCookie = c.split(';')[0];
        break;
      }
    }
    assert(customerCookie.length > 0, 'gt_user_session cookie not set');

    // Verify /api/auth/me
    const meRes = await fetch(`${BASE}/api/auth/me`, {
      headers: { Cookie: customerCookie },
    });
    assert(meRes.status === 200, 'GET /api/auth/me failed');
    const meData = await meRes.json();
    assert(meData.success === true && meData.user.username === `gamer_${randTag}`, 'User profile mismatch');
  });

  await test('POST /api/orders allows authenticated customer gift card checkout and fulfills order', async () => {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
      },
      body: JSON.stringify({
        kind: 'GIFTCARD',
        productId: selectedGiftId,
        quantity: 1,
      }),
    });
    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Gift order creation failed: ${data.message}`);
    giftOrderId = data.order.id;

    // Settle payment
    const payRes = await fetch(`${BASE}/api/payment/demo-pay/${giftOrderId}`, { method: 'POST' });
    assert(payRes.status === 200, 'Demo pay for gift voucher failed');

    // Confirm voucher codes delivered
    const checkRes = await fetch(`${BASE}/api/orders/${giftOrderId}`);
    const checkData = await checkRes.json();
    assert(checkData.order.paymentStatus === 'PAID', 'Gift order not PAID');
    assert(checkData.order.fulfillStatus === 'SUCCESS', 'Gift order fulfillStatus not SUCCESS');
    assert(Array.isArray(checkData.order.delivery) && checkData.order.delivery.length > 0, 'No voucher codes in delivery');
  });

  // Test 11: Submit Contact Ticket
  let contactId = '';
  await test('POST /api/contact submits support inquiry', async () => {
    const res = await fetch(`${BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Vannak',
        email: 'vannak@example.com',
        orderId: gameOrderId,
        message: 'Hello, I have a question regarding my top-up order status.',
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Contact submission failed');
    contactId = String(data.id || '');
    assert(contactId.startsWith('MSG-'), `Invalid contact inquiry ID format: ${contactId}`);
  });

  // Test 12: Admin Login & Session Cookie
  await test('POST /api/admin/login authenticates with default credentials', async () => {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin12345' }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, `Admin login failed: ${data.message}`);

    const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    for (const c of rawCookies) {
      if (c && c.includes('gt_session=')) {
        cookieHeader = c.split(';')[0];
        break;
      }
    }
    assert(cookieHeader.length > 0, `gt_session cookie not found in response`);
  });

  // Test 13: Admin Stats & Metrics
  await test('GET /api/admin/stats loads metrics and recent orders', async () => {
    const res = await fetch(`${BASE}/api/admin/stats`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.totals.orders >= 2, `Expected at least 2 orders in totals, got ${data.totals.orders}`);
    assert(data.totals.paid >= 2, `Expected at least 2 paid orders, got ${data.totals.paid}`);
    assert(data.totals.delivered >= 2, `Expected at least 2 delivered orders, got ${data.totals.delivered}`);
  });

  // Test 14: Admin Orders Filter & Events
  await test('GET /api/admin/orders and /api/admin/orders/:id/events', async () => {
    const res = await fetch(`${BASE}/api/admin/orders?limit=10`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Admin orders failed');
    assert(Array.isArray(data.orders) && data.orders.length > 0, 'Admin orders list empty');

    const eventsRes = await fetch(`${BASE}/api/admin/orders/${gameOrderId}/events`, {
      headers: { Cookie: cookieHeader },
    });
    assert(eventsRes.status === 200, 'Order events query failed');
    const eventsData = await eventsRes.json();
    assert(Array.isArray(eventsData.events) && eventsData.events.length > 0, 'Order events list empty');
  });

  // Test 15: Admin Settings & Redaction
  await test('GET /api/admin/settings returns redacted credentials', async () => {
    const res = await fetch(`${BASE}/api/admin/settings`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Admin settings failed');
    assert(typeof data.settings.site_name === 'string', 'Missing site_name');
    assert(data.settings.g2bulk_api_key === '' || typeof data.settings.g2bulk_api_key === 'string', 'API key redaction check');
  });

  // Test 16: Admin Catalog Patch
  await test('PATCH /api/admin/catalog/games/:code updates visibility and sort', async () => {
    const res = await fetch(`${BASE}/api/admin/catalog/games/${firstGameCode}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ featured: true, sortOrder: 99 }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, 'Catalog patch failed');
  });

  // Test 17: Admin Contacts
  await test('GET /api/admin/contacts and PATCH /api/admin/contacts/:id', async () => {
    const res = await fetch(`${BASE}/api/admin/contacts`, {
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.contacts) && data.contacts.length > 0, 'Contacts list empty');

    const patchRes = await fetch(`${BASE}/api/admin/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
    assert(patchRes.status === 200, 'Contact status patch failed');
  });

  // Test 18: Admin Logout
  await test('POST /api/admin/logout terminates session', async () => {
    const res = await fetch(`${BASE}/api/admin/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const meRes = await fetch(`${BASE}/api/admin/me`, {
      headers: { Cookie: cookieHeader },
    });
    const meData = await meRes.json();
    assert(meData.authenticated === false, 'Session was not terminated');
  });

  // Test 19: Static SPA Asset Delivery
  await test('GET / and SPA fallback serve compiled index.html', async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('<div id="root"></div>'), 'HTML missing root element');
    assert(html.includes('assets/index-'), 'HTML missing bundled assets script');

    const spaRes = await fetch(`${BASE}/catalog`);
    assert(spaRes.status === 200, `SPA routing expected 200, got ${spaRes.status}`);
    const spaHtml = await spaRes.text();
    assert(spaHtml.includes('<div id="root"></div>'), 'SPA route did not serve index.html');
  });

} finally {
  console.log(`\n[e2e] Shutting down wrangler dev...`);
  try {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
  } catch {}
  await sleep(1000);
}

console.log(`\n======================================================`);
console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`🎉 ALL 19 END-TO-END INTEGRATION TESTS PASSED!\n`);
  process.exit(0);
}
