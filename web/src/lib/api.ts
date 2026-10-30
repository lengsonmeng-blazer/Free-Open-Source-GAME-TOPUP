export interface ApiConfig {
  siteName: string;
  tagline: string;
  supportTelegram: string;
  supportEmail: string;
  currency: string;
  announcement: string;
  maintenance: boolean;
  paymentsOnline: boolean;
  demoPayments: boolean;
}

export interface GameSummary {
  code: string;
  name: string;
  imageUrl: string;
  featured: boolean;
  notes: string;
}

export interface GameDetail extends GameSummary {
  fields: string[];
  servers: Record<string, string>;
  visible: boolean;
  sortOrder: number;
}

export interface Denomination {
  id: number;
  key: string;
  name: string;
  displayName: string;
  priceCents: number;
  costCents: number;
  visible: boolean;
  sortOrder: number;
}

export interface GiftProduct {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  categoryTitle: string;
  imageUrl: string;
  priceCents: number;
  faceValue: number | null;
  stock: number;
  visible: boolean;
  sortOrder: number;
  brand?: string;
}

export interface GiftCategory {
  id: number;
  title: string;
  count: number;
  imageUrl: string;
  brand?: string;
}

export interface GiftBrand {
  brand: string;
  count: number;
  subcategories: GiftCategory[];
  imageUrl: string;
}

export interface CustomerUser {
  id: string;
  email: string;
  username: string;
  balance: number;
  orders?: {
    id: string;
    kind: 'TOPUP' | 'GIFTCARD';
    itemName: string;
    denomName: string;
    totalCents: number;
    paymentStatus: string;
    fulfillStatus: string;
    deliveryItems: string[];
    createdAt: string;
  }[];
}

export interface Order {
  id: string;
  kind: 'TOPUP' | 'GIFTCARD';
  item: { ref: string; name: string; image: string };
  denomination: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  account: Record<string, string>;
  playerName: string | null;
  contact: string;
  paymentStatus: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  fulfillStatus: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'MANUAL';
  delivery: string[] | null;
  error: string | null;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
}

export interface OrderEvent {
  kind: string;
  message: string;
  created_at: string;
}

export interface OrderResponse {
  success: boolean;
  order: Order;
  events: OrderEvent[];
  qrUrl: string | null;
  checkoutUrl: string | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('The server returned an unexpected response.', res.status);
    }
  }

  if (!res.ok) {
    const message = (json as { message?: string } | null)?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return json as T;
}

export const api = {
  config: () => request<{ success: boolean; config: ApiConfig }>('/api/config'),

  games: (q = '') =>
    request<{ success: boolean; games: GameSummary[] }>(`/api/catalog/games${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  game: (code: string) =>
    request<{ success: boolean; game: GameDetail; denominations: Denomination[]; syncWarning: string | null }>(
      `/api/catalog/games/${encodeURIComponent(code)}`,
    ),

  categories: (brand = '') =>
    request<{ success: boolean; categories: GiftCategory[]; brands: GiftBrand[] }>(
      `/api/catalog/categories${brand ? `?brand=${encodeURIComponent(brand)}` : ''}`,
    ),
  products: (params: { q?: string; category?: number; brand?: string; page?: number; limit?: number }) => {
    const search = new URLSearchParams();
    if (params.q) search.set('q', params.q);
    if (params.category) search.set('category', String(params.category));
    if (params.brand) search.set('brand', params.brand);
    if (params.page) search.set('page', String(params.page));
    if (params.limit) search.set('limit', String(params.limit));
    return request<{
      success: boolean;
      products: GiftProduct[];
      total: number;
      page: number;
      totalPages: number;
    }>(`/api/catalog/products?${search.toString()}`);
  },
  product: (id: number) => request<{ success: boolean; product: GiftProduct }>(`/api/catalog/products/${id}`),

  auth: {
    me: () => request<{ success: boolean; user: CustomerUser | null }>('/api/auth/me'),
    login: (input: { login: string; password: string }) =>
      request<{ success: boolean; user: CustomerUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    register: (input: { email: string; username: string; password: string }) =>
      request<{ success: boolean; user: CustomerUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  verifyPlayer: (input: { game: string; userId: string; serverId?: string; charname?: string }) =>
    request<{ success: boolean; valid: boolean; name: string; message: string; unavailable?: boolean }>('/api/player/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  createOrder: (input: Record<string, unknown>) =>
    request<{
      success: boolean;
      order: Order;
      payment: { checkoutUrl: string; qrUrl: string; gatewayCheckoutUrl: string };
    }>('/api/orders', { method: 'POST', body: JSON.stringify(input) }),

  order: (id: string, sync = false) =>
    request<OrderResponse>(`/api/orders/${encodeURIComponent(id)}${sync ? '?sync=1' : ''}`),
  refreshOrder: (id: string) =>
    request<{ success: boolean; order: Order; changed: boolean }>(`/api/orders/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
    }),

  contact: (input: { name: string; email: string; orderId: string; message: string }) =>
    request<{ success: boolean; message: string }>('/api/contact', { method: 'POST', body: JSON.stringify(input) }),

  admin: {
    me: () => request<{ success: boolean; authenticated: boolean; admin?: { username: string } }>('/api/admin/me'),
    login: (username: string, password: string) =>
      request<{ success: boolean; admin: { username: string } }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<{ success: boolean }>('/api/admin/logout', { method: 'POST' }),
    stats: () => request<AdminStats>('/api/admin/stats'),
    orders: (params: { status?: string; q?: string; page?: number }) => {
      const search = new URLSearchParams();
      if (params.status) search.set('status', params.status);
      if (params.q) search.set('q', params.q);
      if (params.page) search.set('page', String(params.page));
      return request<{
        success: boolean;
        orders: (Order & { paymentRef: string; supplierOrderId: string | null; attempts: number })[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/admin/orders?${search.toString()}`);
    },
    order: (id: string) =>
      request<{
        success: boolean;
        order: Order & { paymentRef: string; supplierOrderId: string | null; attempts: number };
        events: OrderEvent[];
      }>(`/api/admin/orders/${encodeURIComponent(id)}`),
    retry: (id: string) =>
      request<{ success: boolean; message: string; order: Order | null }>(
        `/api/admin/orders/${encodeURIComponent(id)}/retry`,
        { method: 'POST' },
      ),
    markPaid: (id: string) =>
      request<{ success: boolean; message: string; order: Order | null }>(
        `/api/admin/orders/${encodeURIComponent(id)}/mark-paid`,
        { method: 'POST' },
      ),
    sweep: () => request<{ success: boolean; dispatched: number; refreshed: number }>('/api/admin/orders/sweep', { method: 'POST' }),
    syncCatalog: () =>
      request<{ success: boolean; result?: { games: number; products: number; categories: number }; message?: string }>(
        '/api/admin/catalog/sync',
        { method: 'POST' },
      ),
    syncDenoms: (codes: string[] = [], force = true) =>
      request<{ success: boolean; synced: string[]; remaining: number }>('/api/admin/catalog/sync-denoms', {
        method: 'POST',
        body: JSON.stringify({ codes, force }),
      }),
    reprice: () => request<{ success: boolean; denoms: number; products: number }>('/api/admin/catalog/reprice', { method: 'POST' }),
    games: (q = '') =>
      request<{ success: boolean; games: (GameDetail & { denomCount: number })[] }>(
        `/api/admin/catalog/games${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      ),
    patchGame: (code: string, patch: Record<string, unknown>) =>
      request<{ success: boolean }>(`/api/admin/catalog/games/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    denoms: (code: string) =>
      request<{ success: boolean; denominations: Denomination[] }>(
        `/api/admin/catalog/games/${encodeURIComponent(code)}/denoms`,
      ),
    patchDenom: (id: number, patch: Record<string, unknown>) =>
      request<{ success: boolean }>(`/api/admin/catalog/denoms/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    products: (params: { q?: string; page?: number }) => {
      const search = new URLSearchParams();
      if (params.q) search.set('q', params.q);
      if (params.page) search.set('page', String(params.page));
      return request<{
        success: boolean;
        products: GiftProduct[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/admin/catalog/products?${search.toString()}`);
    },
    patchProduct: (id: number, patch: Record<string, unknown>) =>
      request<{ success: boolean }>(`/api/admin/catalog/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    settings: () => request<{ success: boolean; settings: Record<string, unknown> }>('/api/admin/settings'),
    saveSettings: (patch: Record<string, unknown>) =>
      request<{ success: boolean; settings: Record<string, unknown> }>('/api/admin/settings', {
        method: 'POST',
        body: JSON.stringify(patch),
      }),
    changePassword: (current: string, next: string) =>
      request<{ success: boolean; message: string }>('/api/admin/settings/password', {
        method: 'POST',
        body: JSON.stringify({ current, next }),
      }),
    balance: () =>
      request<{ success: boolean; balance: number | null; username?: string; message?: string }>('/api/admin/supplier/balance'),
    contacts: () => request<{ success: boolean; contacts: ContactRow[] }>('/api/admin/contacts'),
    setContactStatus: (id: string, status: string) =>
      request<{ success: boolean }>(`/api/admin/contacts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    reconcile: () => request<{ success: boolean; dispatched: number; refreshed: number }>('/api/admin/reconcile', { method: 'POST' }),
  },
};

export interface ContactRow {
  id: string;
  name: string;
  email: string;
  order_id: string;
  message: string;
  status: string;
  created_at: string;
}

export interface AdminStats {
  success: boolean;
  totals: {
    orders?: number;
    revenue_cents?: number;
    paid?: number;
    pending?: number;
    delivered?: number;
    failed?: number;
    manual?: number;
  };
  daily: { day: string; orders: number; revenue_cents: number }[];
  recent: Order[];
  newContacts: number;
  catalog: { games: number; denoms: number; gifts: number };
}
