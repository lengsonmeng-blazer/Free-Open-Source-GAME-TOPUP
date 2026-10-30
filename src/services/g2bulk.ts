/**
 * G2Bulk API client — https://api.g2bulk.com
 *
 * Public endpoints (catalogue) need no key; ordering endpoints require `X-API-Key`.
 * Docs: https://api.g2bulk.com/docs  ·  OpenAPI: https://api.g2bulk.com/openapi.json
 */

export interface G2Game {
  id: number;
  code: string;
  name: string;
  image_url: string;
}

export interface G2Denom {
  id: number;
  name: string;
  amount: number;
}

export interface G2Product {
  id: number;
  title: string;
  description: string;
  category_id: number;
  category_title: string;
  unit_price: number;
  face_value: number | null;
  stock: number;
  image_url?: string | null;
}

export interface G2Category {
  id: number;
  title: string;
  description: string;
  image_url: string | null;
  product_count: number;
}

export interface G2GameFields {
  code: string;
  info: { fields: Array<'userid' | 'serverid' | 'charname'>; notes: string };
}

export interface G2PlayerCheck {
  name: string;
  valid: 'valid' | 'invalid';
  openid?: string;
}

export interface G2GameOrderSummary {
  order_id: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  game: string;
  catalogue: string;
  player_id: string;
  player_name?: string;
  server_id?: string;
  price: number;
  remark?: string;
  message?: string;
  callback_url?: string | null;
}

export interface G2PurchaseResult {
  success: boolean;
  order_id: number;
  product_id: number;
  product_title: string;
  status: 'COMPLETED' | 'PENDING';
  delivery_items?: string[] | null;
  poll_url?: string;
  transaction_id?: number;
}

export interface G2Delivery {
  success: boolean;
  order_id: number;
  product_id: number;
  product_title: string;
  quantity: number;
  status: string;
  delivery_items: string[] | null;
  refunded: boolean;
  message?: string;
}

export class G2BulkError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 502, code?: string) {
    super(message);
    this.name = 'G2BulkError';
    this.status = status;
    this.code = code;
  }
}

export interface G2ClientOptions {
  baseUrl: string;
  apiKey?: string;
}

async function request<T>(
  opts: G2ClientOptions,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean } = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const needAuth = init.auth !== false && !!opts.apiKey;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'g2topup/1.0 (+https://github.com)',
    ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  };
  if (needAuth) headers['x-api-key'] = opts.apiKey as string;

  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl.replace(/\/+$/, '')}${path}`, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (err) {
    throw new G2BulkError(`Cannot reach the supplier API: ${(err as Error).message}`, 502, 'network');
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new G2BulkError(`Supplier returned a non-JSON response (HTTP ${res.status})`, 502, 'bad_json');
  }

  if (!res.ok) {
    const message =
      (json as { message?: string } | null)?.message ||
      (res.status === 401 ? 'Supplier rejected the API key (401).' : `Supplier error HTTP ${res.status}`);
    throw new G2BulkError(message, res.status, String(res.status));
  }

  return json as T;
}

export function createG2Client(opts: G2ClientOptions) {
  return {
    hasKey: () => !!opts.apiKey,

    listGames: () => request<{ success: boolean; games: G2Game[] }>(opts, '/v1/games', { auth: false }),

    gameCatalogue: (code: string) =>
      request<{ success: boolean; game: G2Game & { code: string }; catalogues: G2Denom[] }>(
        opts,
        `/v1/games/${encodeURIComponent(code)}/catalogue`,
        { auth: false },
      ),

    gameFields: (code: string) =>
      request<G2GameFields>(opts, '/v1/games/fields', { method: 'POST', body: { game: code }, auth: false }),

    /** Returns `{}` when the game has no server list (the API answers 403, which is not an error). */
    gameServers: async (code: string): Promise<Record<string, string>> => {
      try {
        const r = await request<{ code: string; servers: Record<string, string> }>(opts, '/v1/games/servers', {
          method: 'POST',
          body: { game: code },
          auth: false,
        });
        return r?.servers ?? {};
      } catch (err) {
        if (err instanceof G2BulkError && (err.status === 403 || err.status === 404)) return {};
        throw err;
      }
    },

    checkPlayerId: async (input: {
      game: string;
      user_id: string;
      server_id?: string;
      charname?: string;
    }): Promise<G2PlayerCheck> => {
      try {
        return await request<G2PlayerCheck>(opts, '/v1/games/checkPlayerId', {
          method: 'POST',
          body: input,
          auth: false,
        });
      } catch (err) {
        if (err instanceof G2BulkError && (err.status === 400 || err.status === 404)) {
          return { valid: 'invalid', name: '' };
        }
        throw err;
      }
    },

    listProducts: () =>
      request<{ success: boolean; products: G2Product[] }>(opts, '/v1/products', { auth: false }),

    listCategories: () =>
      request<{ success: boolean; categories: G2Category[] }>(opts, '/v1/category', { auth: false }),

    createTopupOrder: (
      game: string,
      input: {
        catalogue_name: string;
        player_id: string;
        server_id?: string;
        charname?: string;
        remark?: string;
        callback_url?: string;
      },
      idempotencyKey: string,
    ) =>
      request<{ success: boolean; message?: string; order: G2GameOrderSummary }>(
        opts,
        `/v1/games/${encodeURIComponent(game)}/order`,
        { method: 'POST', body: input, headers: { 'x-idempotency-key': idempotencyKey } },
      ),

    topupStatus: (game: string, orderId: number) =>
      request<{ success: boolean; order: G2GameOrderSummary }>(opts, '/v1/games/order/status', {
        method: 'POST',
        body: { game, order_id: orderId },
      }),

    purchaseProduct: (
      productId: number,
      quantity: number,
      extra: { description?: string; callback_url?: string } = {},
      idempotencyKey: string,
    ) =>
      request<G2PurchaseResult>(opts, `/v1/products/${productId}/purchase`, {
        method: 'POST',
        body: { quantity, ...extra },
        headers: { 'x-idempotency-key': idempotencyKey },
      }),

    delivery: (orderId: number) =>
      request<G2Delivery>(opts, `/v1/orders/${orderId}/delivery`, { method: 'GET' }),

    me: () => request<{ success: boolean; balance: number; username: string }>(opts, '/v1/getMe'),
  };
}

export type G2Client = ReturnType<typeof createG2Client>;

/** "55" -> "55 Diamonds", "86" -> "86 Diamonds", "Weekly Elite Pack" stays as-is. */
export function prettyDenomName(rawName: string, gameName = ''): string {
  const name = String(rawName || '').trim();
  if (/^\d+(\.\d+)?$/.test(name)) {
    const lower = gameName.toLowerCase();
    if (lower.includes('mobile legends') || lower.includes('mlbb')) return `${name} Diamonds`;
    if (lower.includes('free fire')) return `${name} Diamonds`;
    if (lower.includes('pubg')) return `${name} UC`;
    if (lower.includes('genshin')) return `${name} Genesis Crystals`;
    if (lower.includes('valorant')) return `${name} VP`;
    if (lower.includes('call of duty')) return `${name} CP`;
    if (lower.includes('roblox')) return `${name} Robux`;
    if (lower.includes('clash')) return `${name} Gems`;
    if (lower.includes('honor of kings')) return `${name} Tokens`;
    return `${name} Credits`;
  }
  return name;
}
