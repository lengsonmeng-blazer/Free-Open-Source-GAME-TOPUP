import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Check,
  ChevronRight,
  CircleDollarSign,
  Gamepad2,
  Gift,
  Inbox,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import type { AdminStats, ContactRow, Denomination, Order, OrderEvent } from '../lib/api';
import { api } from '../lib/api';
import { dateTime, money, relativeTime, statusLabel } from '../lib/format';
import { useConfig } from '../components/ConfigProvider';
import { Badge, Button, Card, EmptyState, Field, Input, Skeleton, cn } from '../components/ui';

type Tab = 'overview' | 'orders' | 'catalog' | 'settings' | 'contacts';

const TABS: { key: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'catalog', label: 'Catalogue', icon: Gamepad2 },
  { key: 'contacts', label: 'Inbox', icon: Inbox },
  { key: 'settings', label: 'Settings', icon: Settings2 },
];

export function AdminPage() {
  const [authState, setAuthState] = useState<'checking' | 'out' | 'in'>('checking');
  const [username, setUsername] = useState('');

  useEffect(() => {
    api.admin
      .me()
      .then((res) => {
        if (res.authenticated && res.admin) {
          setUsername(res.admin.username);
          setAuthState('in');
        } else {
          setAuthState('out');
        }
      })
      .catch(() => setAuthState('out'));
  }, []);

  if (authState === 'checking') {
    return (
      <div className="container-page py-20">
        <Skeleton className="mx-auto h-40 max-w-md rounded-2xl" />
      </div>
    );
  }

  if (authState === 'out') {
    return <LoginCard onSuccess={(name) => { setUsername(name); setAuthState('in'); }} />;
  }

  return <Dashboard username={username} onLogout={() => setAuthState('out')} />;
}

function LoginCard({ onSuccess }: { onSuccess: (username: string) => void }) {
  const { config } = useConfig();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.admin.login(username.trim(), password);
      onSuccess(res.admin.username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[70vh] max-w-md flex-col justify-center py-16">
      <div className="mb-6 text-center">
        <ShieldCheck className="mx-auto mb-3 size-8 text-acid-500" aria-hidden />
        <h1 className="font-display text-2xl font-bold text-white">Staff sign in</h1>
        <p className="mt-1.5 text-[13px] text-ink-400">Manage orders, catalogue and settings for {config.siteName}.</p>
      </div>
      <Card className="p-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            label="Username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="text-[12.5px] text-flare-500">{error}</p>}
          <Button full type="submit" loading={loading} disabled={!username || !password}>
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-[11.5px] text-ink-400">
        First run? The seeded account is <span className="font-mono text-ink-300">admin / admin12345</span> — change it in
        Settings immediately.
      </p>
    </div>
  );
}

function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');

  async function logout() {
    await api.admin.logout().catch(() => {});
    onLogout();
  }

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-acid-500">Admin</p>
          <h1 className="font-display text-2xl font-bold text-white">Control room</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-lg border border-white/8 px-3 py-1.5 text-[12px] text-ink-300 sm:block">
            {username}
          </span>
          <Link to="/">
            <Button variant="ghost" size="sm">
              View store
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="size-3.5" aria-hidden />
            Sign out
          </Button>
        </div>
      </div>

      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto border-b border-white/7 pb-px">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-t-lg px-3.5 py-2.5 text-[13px] font-medium transition-colors',
              tab === item.key
                ? 'border-b-2 border-acid-500 text-white'
                : 'border-b-2 border-transparent text-ink-400 hover:text-ink-200',
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'catalog' && <CatalogTab />}
      {tab === 'contacts' && <ContactsTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

/* ------------------------------------------------------------- overview */

function OverviewTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [balance, setBalance] = useState<{ balance: number | null; message?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.admin.stats().catch(() => null),
      api.admin.balance().catch(() => null),
    ])
      .then(([s, b]) => {
        setStats(s);
        setBalance(b);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage(await fn());
      load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const maxRevenue = useMemo(
    () => Math.max(1, ...(stats?.daily ?? []).map((d) => d.revenue_cents)),
    [stats],
  );

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  const totals = stats?.totals ?? {};

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label="Revenue (30d)"
          value={money(totals.revenue_cents ?? 0)}
          tone="acid"
          sub={`${totals.paid ?? 0} paid orders`}
        />
        <StatCard
          icon={Package}
          label="Orders (30d)"
          value={String(totals.orders ?? 0)}
          sub={`${totals.pending ?? 0} awaiting payment`}
        />
        <StatCard
          icon={Check}
          label="Delivered"
          value={String(totals.delivered ?? 0)}
          tone="aqua"
          sub={`${totals.failed ?? 0} failed · ${totals.manual ?? 0} review`}
        />
        <StatCard
          icon={Wallet}
          label="Supplier wallet"
          value={balance?.balance != null ? money(Math.round(balance.balance * 100)) : '—'}
          tone={balance?.balance != null && balance.balance < 20 ? 'amber' : 'neutral'}
          sub={balance?.message || 'G2Bulk balance'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold text-white">Revenue, last 30 days</h2>
            <BarChart3 className="size-4 text-ink-400" aria-hidden />
          </div>
          {(stats?.daily.length ?? 0) === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-400">No orders yet.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {stats?.daily.map((day) => {
                const height = Math.max(4, Math.round((day.revenue_cents / maxRevenue) * 100));
                return (
                  <div key={day.day} className="group relative flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-acid-500/25 to-acid-500 transition-colors group-hover:to-acid-400"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[9px] text-ink-400">{day.day.slice(5)}</span>
                    <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded bg-ink-800 px-2 py-1 text-[10px] text-ink-100 group-hover:block">
                      {money(day.revenue_cents)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold text-white">Quick actions</h2>
          <div className="space-y-2">
            <Button
              variant="secondary"
              full
              size="sm"
              onClick={() => run('sync', async () => {
                const res = await api.admin.syncCatalog();
                return res.success
                  ? `Catalogue synced: ${res.result?.games} games, ${res.result?.products} vouchers.`
                  : res.message || 'Sync failed';
              })}
              loading={busy === 'sync'}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Sync catalogue from supplier
            </Button>
            <Button
              variant="secondary"
              full
              size="sm"
              onClick={() => run('denoms', async () => {
                const res = await api.admin.syncDenoms();
                return `Pulled prices for ${res.synced.length} games · ${res.remaining} still without prices.`;
              })}
              loading={busy === 'denoms'}
            >
              <Gamepad2 className="size-3.5" aria-hidden />
              Pull game prices (batch)
            </Button>
            <Button
              variant="secondary"
              full
              size="sm"
              onClick={() => run('sweep', async () => {
                const res = await api.admin.sweep();
                return `Reconciled: ${res.dispatched} dispatched, ${res.refreshed} refreshed.`;
              })}
              loading={busy === 'sweep'}
            >
              <Package className="size-3.5" aria-hidden />
              Retry undelivered orders
            </Button>
            <Button
              variant="secondary"
              full
              size="sm"
              onClick={() => run('reprice', async () => {
                const res = await api.admin.reprice();
                return `Repriced ${res.denoms} packages and ${res.products} vouchers.`;
              })}
              loading={busy === 'reprice'}
            >
              <CircleDollarSign className="size-3.5" aria-hidden />
              Re-apply markup to all prices
            </Button>
          </div>
          {message && <p className="mt-3 rounded-lg bg-ink-850 px-3 py-2 text-[12px] text-ink-300">{message}</p>}

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/6 pt-4 text-center">
            <MiniStat label="Games" value={stats?.catalog.games ?? 0} />
            <MiniStat label="Packages" value={stats?.catalog.denoms ?? 0} />
            <MiniStat label="Vouchers" value={stats?.catalog.gifts ?? 0} />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
          <h2 className="font-display text-[15px] font-semibold text-white">Latest orders</h2>
          <span className="text-[11.5px] text-ink-400">Auto-refreshes on reload</span>
        </div>
        {(stats?.recent.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-400">No orders yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {stats?.recent.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-mono text-[12px] text-ink-300">{order.id}</span>
                <span className="text-[12.5px] text-ink-200">{order.item.name}</span>
                <span className="text-[12px] text-ink-400">{order.denomination}</span>
                <span className="ml-auto font-mono text-[12.5px] text-acid-400">{money(order.totalCents)}</span>
                <StatusPill order={order} />
                <span className="w-16 text-right text-[11px] text-ink-400">{relativeTime(order.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'acid' | 'aqua' | 'amber';
}) {
  const tones = {
    neutral: 'text-ink-300 bg-white/6',
    acid: 'text-acid-400 bg-acid-500/12',
    aqua: 'text-aqua-400 bg-aqua-400/12',
    amber: 'text-amber-300 bg-amber-400/12',
  } as const;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-white">{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11.5px] text-ink-400">{sub}</p>}
        </div>
        <span className={cn('flex size-9 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-display text-lg font-bold text-white">{value}</p>
      <p className="text-[10.5px] uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}

function StatusPill({ order }: { order: Order }) {
  if (order.fulfillStatus === 'SUCCESS') return <Badge tone="success">Delivered</Badge>;
  if (order.fulfillStatus === 'FAILED') return <Badge tone="danger">Failed</Badge>;
  if (order.fulfillStatus === 'MANUAL') return <Badge tone="warning">Review</Badge>;
  if (order.fulfillStatus === 'PROCESSING') return <Badge tone="info">Processing</Badge>;
  if (order.paymentStatus === 'PAID') return <Badge tone="info">Paid</Badge>;
  if (order.paymentStatus === 'EXPIRED') return <Badge tone="warning">Expired</Badge>;
  return <Badge tone="neutral">Pending</Badge>;
}

/* --------------------------------------------------------------- orders */

const ORDER_FILTERS = ['ALL', 'PENDING', 'PAID', 'PROCESSING', 'SUCCESS', 'FAILED', 'MANUAL', 'EXPIRED'];

function OrdersTab() {
  const [status, setStatus] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    orders: (Order & { paymentRef: string; supplierOrderId: string | null; attempts: number })[];
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ order: Order & { paymentRef: string; supplierOrderId: string | null; attempts: number }; events: OrderEvent[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.admin
      .orders({ status, q: query, page })
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, page]);

  async function openDetail(id: string) {
    setBusy(true);
    try {
      const res = await api.admin.order(id);
      setDetail(res);
    } catch (err) {
      setFlash((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(kind: 'retry' | 'markPaid') {
    if (!detail) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = kind === 'retry' ? await api.admin.retry(detail.order.id) : await api.admin.markPaid(detail.order.id);
      setFlash(res.message);
      const fresh = await api.admin.order(detail.order.id);
      setDetail(fresh);
      load();
    } catch (err) {
      setFlash((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3">
          <Search className="size-4 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                load();
              }
            }}
            placeholder="Search order ID, item or buyer…"
            aria-label="Search orders"
            className="h-10 w-full bg-transparent text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setPage(1); load(); }}>
          Search
        </Button>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {ORDER_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setStatus(f);
              setPage(1);
            }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide transition-colors',
              status === f
                ? 'border-acid-500/50 bg-acid-500/12 text-acid-400'
                : 'border-white/8 text-ink-400 hover:text-ink-200',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {flash && (
        <div className="rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-[12.5px] text-ink-300">{flash}</div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (data?.orders.length ?? 0) === 0 ? (
          <EmptyState title="No orders in this view" />
        ) : (
          <div className="divide-y divide-white/5">
            {data?.orders.map((order) => (
              <button
                key={order.id}
                onClick={() => openDetail(order.id)}
                className="flex w-full flex-wrap items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/3"
              >
                <span className="font-mono text-[12px] text-ink-300">{order.id}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">
                  {order.item.name} · {order.denomination}
                </span>
                <Badge tone="neutral">{order.kind === 'TOPUP' ? 'Top-up' : 'Voucher'}</Badge>
                <span className="font-mono text-[12.5px] text-acid-400">{money(order.totalCents)}</span>
                <StatusPill order={order} />
                <span className="hidden w-16 text-right text-[11px] text-ink-400 sm:block">{relativeTime(order.createdAt)}</span>
                <ChevronRight className="size-4 text-ink-400" aria-hidden />
              </button>
            ))}
          </div>
        )}
      </Card>

      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="px-3 text-[12.5px] text-ink-400">
            {page} / {data?.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-white/10 bg-ink-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-white/8 bg-ink-900 px-5 py-3.5">
              <div>
                <p className="font-mono text-[12px] text-ink-400">{detail.order.id}</p>
                <p className="font-display text-[15px] font-semibold text-white">{detail.order.item.name}</p>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Close" className="text-ink-400 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <StatusPill order={detail.order} />
                <Badge tone="neutral">{detail.order.kind}</Badge>
                <Badge tone="neutral">{money(detail.order.totalCents)}</Badge>
              </div>

              <div className="grid gap-3 rounded-xl bg-ink-850 p-3.5">
                <Field label="Package" value={detail.order.denomination} mono />
                <Field label="Account" value={JSON.stringify(detail.order.account)} mono />
                {detail.order.playerName && <Field label="Player name" value={detail.order.playerName} />}
                <Field label="Contact" value={detail.order.contact} />
                <Field label="Payment ref" value={detail.order.paymentRef} mono />
                <Field label="Supplier order" value={detail.order.supplierOrderId || '—'} mono />
                <Field label="Attempts" value={String(detail.order.attempts)} />
                <Field label="Created" value={dateTime(detail.order.createdAt)} />
                {detail.order.paidAt && <Field label="Paid" value={dateTime(detail.order.paidAt)} />}
                {detail.order.error && <Field label="Last error" value={detail.order.error} />}
              </div>

              {detail.order.delivery && (
                <div className="rounded-xl border border-acid-500/25 bg-acid-500/6 p-3.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-acid-400">Delivered</p>
                  {detail.order.delivery.map((code, i) => (
                    <code key={i} className="block break-all font-mono text-[12px] text-ink-100">
                      {code}
                    </code>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {detail.order.paymentStatus !== 'PAID' && (
                  <Button size="sm" variant="primary" loading={busy} onClick={() => act('markPaid')}>
                    Mark paid & deliver
                  </Button>
                )}
                <Button size="sm" variant="secondary" loading={busy} onClick={() => act('retry')}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  Retry delivery
                </Button>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Events</p>
                <ul className="space-y-1.5">
                  {detail.events.map((ev, i) => (
                    <li key={i} className="rounded-lg bg-ink-850 px-3 py-2 text-[11.5px]">
                      <span className="font-mono text-ink-400">{dateTime(ev.created_at)}</span>
                      <span className="ml-2 text-ink-200">{ev.kind}</span>
                      {ev.message && <p className="mt-0.5 text-ink-400">{ev.message}</p>}
                    </li>
                  ))}
                  {detail.events.length === 0 && <li className="text-[12px] text-ink-400">No events recorded.</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- catalog */

function CatalogTab() {
  const [mode, setMode] = useState<'games' | 'gifts'>('games');
  const [games, setGames] = useState<(Awaited<ReturnType<typeof api.admin.games>>)['games']>([]);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof api.admin.products>> | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [denomPanel, setDenomPanel] = useState<{ code: string; name: string; denoms: Denomination[] } | null>(null);

  const load = () => {
    setLoading(true);
    if (mode === 'games') {
      api.admin
        .games(query)
        .then((res) => setGames(res.games))
        .catch(() => setGames([]))
        .finally(() => setLoading(false));
    } else {
      api.admin
        .products({ q: query })
        .then((res) => setProducts(res))
        .catch(() => setProducts(null))
        .finally(() => setLoading(false));
    }
  };

  useEffect(load, [mode]);

  async function patchGame(code: string, patch: Record<string, unknown>) {
    await api.admin.patchGame(code, patch);
    setFlash(`Updated game ${code}`);
    load();
  }

  async function openDenoms(code: string, name: string) {
    setBusy('denoms');
    try {
      const res = await api.admin.denoms(code);
      setDenomPanel({ code, name, denoms: res.denominations });
    } finally {
      setBusy(null);
    }
  }

  async function patchDenom(id: number, patch: Record<string, unknown>) {
    await api.admin.patchDenom(id, patch);
    setFlash(`Updated denomination #${id}`);
    if (denomPanel) {
      const res = await api.admin.denoms(denomPanel.code);
      setDenomPanel({ ...denomPanel, denoms: res.denominations });
    }
  }

  async function patchProduct(id: number, patch: Record<string, unknown>) {
    await api.admin.patchProduct(id, patch);
    setFlash(`Updated voucher #${id}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-white/8 p-1">
          <button
            onClick={() => setMode('games')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              mode === 'games' ? 'bg-acid-500 text-ink-950' : 'text-ink-400 hover:text-ink-200',
            )}
          >
            <Gamepad2 className="size-3.5" aria-hidden /> Games
          </button>
          <button
            onClick={() => setMode('gifts')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
              mode === 'gifts' ? 'bg-acid-500 text-ink-950' : 'text-ink-400 hover:text-ink-200',
            )}
          >
            <Gift className="size-3.5" aria-hidden /> Vouchers
          </button>
        </div>
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/10 bg-ink-900 px-3">
          <Search className="size-3.5 text-ink-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Filter…"
            aria-label="Filter catalogue"
            className="h-9 w-full bg-transparent text-[13px] text-ink-100 placeholder:text-ink-400 focus:outline-none"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Apply
        </Button>
      </div>

      {flash && <div className="rounded-xl bg-ink-850 px-4 py-2.5 text-[12.5px] text-ink-300">{flash}</div>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : mode === 'games' ? (
          games.length === 0 ? (
            <EmptyState
              title="Catalogue is empty"
              description="Run “Sync catalogue from supplier” on the Overview tab first."
            />
          ) : (
            <div className="divide-y divide-white/5">
              {games.map((game) => (
                <div key={game.code} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{game.name}</span>
                  <span className="font-mono text-[11px] text-ink-400">{game.code}</span>
                  <Badge tone={game.denomCount > 0 ? 'info' : 'warning'}>{game.denomCount} pkg</Badge>
                  <button
                    onClick={() => patchGame(game.code, { featured: !game.featured })}
                    aria-label="Toggle featured"
                    className={cn('rounded p-1', game.featured ? 'text-acid-400' : 'text-ink-500 hover:text-ink-300')}
                    style={game.featured ? undefined : { color: '#4a5364' }}
                  >
                    <Star className="size-4" fill={game.featured ? 'currentColor' : 'none'} aria-hidden />
                  </button>
                  <button
                    onClick={() => patchGame(game.code, { visible: !game.visible })}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase',
                      game.visible ? 'bg-acid-500/15 text-acid-400' : 'bg-white/6 text-ink-400',
                    )}
                  >
                    {game.visible ? 'Live' : 'Hidden'}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => openDenoms(game.code, game.name)} loading={busy === 'denoms'}>
                    Prices
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : (products?.products.length ?? 0) === 0 ? (
          <EmptyState title="No vouchers" description="Run a catalogue sync first." />
        ) : (
          <div className="divide-y divide-white/5">
            {products?.products.map((product) => (
              <div key={product.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{product.title}</span>
                <span className="text-[11px] text-ink-400">{product.categoryTitle}</span>
                <PriceEditor
                  cents={product.priceCents}
                  onSave={(value) => patchProduct(product.id, { priceCents: value })}
                />
                <Badge tone={product.stock === 0 ? 'danger' : 'neutral'}>{product.stock === -1 ? '∞' : product.stock}</Badge>
                <button
                  onClick={() => patchProduct(product.id, { visible: !product.visible })}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase',
                    product.visible ? 'bg-acid-500/15 text-acid-400' : 'bg-white/6 text-ink-400',
                  )}
                >
                  {product.visible ? 'Live' : 'Hidden'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {denomPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <div>
                <p className="font-display text-[15px] font-semibold text-white">{denomPanel.name}</p>
                <p className="text-[11.5px] text-ink-400">{denomPanel.denoms.length} packages · click a price to override</p>
              </div>
              <button onClick={() => setDenomPanel(null)} aria-label="Close" className="text-ink-400 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {denomPanel.denoms.map((denom) => (
                <div key={denom.key} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{denom.displayName}</span>
                  <span className="font-mono text-[11px] text-ink-400">cost {money(denom.costCents)}</span>
                  <PriceEditor cents={denom.priceCents} onSave={(value) => patchDenom(denom.id, { priceCents: value })} />
                </div>
              ))}
              {denomPanel.denoms.length === 0 && (
                <p className="px-5 py-8 text-center text-[12.5px] text-ink-400">No packages cached for this game yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceEditor({ cents, onSave }: { cents: number; onSave: (value: number | null) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((cents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue((cents / 100).toFixed(2));
          setEditing(true);
        }}
        className="rounded-md px-2 py-1 font-mono text-[12px] text-acid-400 transition-colors hover:bg-acid-500/10"
      >
        {money(cents)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="h-7 w-20 rounded border border-white/15 bg-ink-850 px-2 font-mono text-[12px] text-ink-100 focus:border-acid-500/60 focus:outline-none"
        aria-label="Price in dollars"
      />
      <button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const parsed = Number(value);
          await onSave(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null);
          setSaving(false);
          setEditing(false);
        }}
        className="rounded bg-acid-500 p-1 text-ink-950"
        aria-label="Save price"
      >
        <Check className="size-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="rounded p-1 text-ink-400 hover:text-white" aria-label="Cancel">
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------- contacts */

function ContactsTab() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.admin
      .contacts()
      .then((res) => setRows(res.contacts))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
        <h2 className="font-display text-[15px] font-semibold text-white">Support inbox</h2>
        <Button variant="ghost" size="sm" onClick={load}>
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Inbox is empty" description="Messages from the contact page land here." />
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map((row) => (
            <div key={row.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] text-ink-400">{row.id}</span>
                <span className="text-[12.5px] font-medium text-ink-100">{row.name || 'Guest'}</span>
                {row.email && <span className="text-[11.5px] text-ink-400">{row.email}</span>}
                {row.order_id && <Badge tone="neutral">{row.order_id}</Badge>}
                <span className="ml-auto text-[11px] text-ink-400">{relativeTime(row.created_at)}</span>
                <button
                  onClick={async () => {
                    await api.admin.setContactStatus(row.id, row.status === 'NEW' ? 'DONE' : 'NEW');
                    load();
                  }}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase',
                    row.status === 'NEW' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/6 text-ink-400',
                  )}
                >
                  {row.status}
                </button>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-300">{row.message}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- settings */

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [currentPw, setCurrentPw] = useState('');
  const [nextPw, setNextPw] = useState('');

  useEffect(() => {
    api.admin
      .settings()
      .then((res) => {
        setSettings(res.settings);
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.settings)) next[k] = v == null ? '' : String(v);
        setForm(next);
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Record<string, unknown>, note: string) {
    setSaving(true);
    setFlash(null);
    try {
      const res = await api.admin.saveSettings(patch);
      setSettings(res.settings);
      setFlash(note);
    } catch (err) {
      setFlash((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!settings)
    return <EmptyState title="Settings unavailable" description="The database may still be bootstrapping. Reload in a moment." />;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-4 font-display text-[15px] font-semibold text-white">Storefront</h2>
        <div className="space-y-3.5">
          <Input label="Store name" value={form.site_name ?? ''} onChange={(e) => setForm({ ...form, site_name: e.target.value })} />
          <Input label="Tagline" value={form.site_tagline ?? ''} onChange={(e) => setForm({ ...form, site_tagline: e.target.value })} />
          <Input
            label="Announcement bar (blank hides it)"
            value={form.announcement ?? ''}
            onChange={(e) => setForm({ ...form, announcement: e.target.value })}
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input
              label="Support Telegram"
              value={form.support_telegram ?? ''}
              onChange={(e) => setForm({ ...form, support_telegram: e.target.value })}
            />
            <Input
              label="Support email"
              value={form.support_email ?? ''}
              onChange={(e) => setForm({ ...form, support_email: e.target.value })}
            />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input
              label="Markup %"
              type="number"
              value={form.markup_percent ?? ''}
              onChange={(e) => setForm({ ...form, markup_percent: e.target.value })}
              hint="Applied to supplier cost when prices sync."
            />
            <label className="flex items-center gap-2.5 pt-6 text-[13px] text-ink-200">
              <input
                type="checkbox"
                checked={form.maintenance === '1'}
                onChange={(e) => setForm({ ...form, maintenance: e.target.checked ? '1' : '0' })}
                className="size-4 accent-[#c9ff3f]"
              />
              Maintenance mode
            </label>
          </div>
          <Button
            size="sm"
            loading={saving}
            onClick={() =>
              save(
                {
                  site_name: form.site_name,
                  site_tagline: form.site_tagline,
                  announcement: form.announcement,
                  support_telegram: form.support_telegram,
                  support_email: form.support_email,
                  markup_percent: Number(form.markup_percent),
                  maintenance: Number(form.maintenance || 0),
                },
                'Storefront settings saved.',
              )
            }
          >
            Save storefront
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold text-white">Integrations</h2>
        <p className="mb-4 text-[11.5px] text-ink-400">Secrets are stored in D1 and never sent back to the browser.</p>
        <div className="space-y-3.5">
          <Input
            label="G2Bulk base URL"
            value={form.g2bulk_base_url ?? ''}
            onChange={(e) => setForm({ ...form, g2bulk_base_url: e.target.value })}
          />
          <Input
            label={`G2Bulk API key ${settings.g2bulk_api_key_set ? '· saved' : '· not set'}`}
            type="password"
            placeholder={settings.g2bulk_api_key_set ? '•••••••• (leave blank to keep)' : 'paste the key from @G2BULKBOT'}
            value={form.g2bulk_api_key ?? ''}
            onChange={(e) => setForm({ ...form, g2bulk_api_key: e.target.value })}
          />
          <Input
            label="Ahnajak Pay base URL"
            value={form.aba_base_url ?? ''}
            onChange={(e) => setForm({ ...form, aba_base_url: e.target.value })}
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input
              label="Ahnajak profile ID"
              value={form.aba_profile_id ?? ''}
              onChange={(e) => setForm({ ...form, aba_profile_id: e.target.value })}
            />
            <Input
              label={`Secret key ${settings.aba_secret_key_set ? '· saved' : '· not set'}`}
              type="password"
              placeholder={settings.aba_secret_key_set ? '•••••••• (leave blank to keep)' : 'merchant secret'}
              value={form.aba_secret_key ?? ''}
              onChange={(e) => setForm({ ...form, aba_secret_key: e.target.value })}
            />
          </div>
          <label className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/6 px-3.5 py-3 text-[12px] text-amber-200">
            <input
              type="checkbox"
              checked={form.demo_fulfillment === '1'}
              onChange={(e) => setForm({ ...form, demo_fulfillment: e.target.checked ? '1' : '0' })}
              className="mt-0.5 size-4 accent-[#c9ff3f]"
            />
            <span>
              <strong className="font-semibold">Demo fulfillment</strong> — mark every paid order as delivered with a fake
              code. Use only for testing; turn it off before selling.
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/6 px-3.5 py-3 text-[12px] text-amber-200">
            <input
              type="checkbox"
              checked={form.payment_demo === '1'}
              onChange={(e) => setForm({ ...form, payment_demo: e.target.checked ? '1' : '0' })}
              className="mt-0.5 size-4 accent-[#c9ff3f]"
            />
            <span>
              <strong className="font-semibold">Test payments</strong> — create orders without calling the gateway and
              show a clearly-labelled test panel instead of a QR. Staff confirm each order manually. Never leave this on
              while selling.
            </span>
          </label>
          <Button
            size="sm"
            loading={saving}
            onClick={() =>
              save(
                {
                  g2bulk_base_url: form.g2bulk_base_url,
                  g2bulk_api_key: form.g2bulk_api_key,
                  aba_base_url: form.aba_base_url,
                  aba_profile_id: form.aba_profile_id,
                  aba_secret_key: form.aba_secret_key,
                  demo_fulfillment: Number(form.demo_fulfillment || 0),
                  payment_demo: Number(form.payment_demo || 0),
                },
                'Integration settings saved.',
              )
            }
          >
            Save integrations
          </Button>
        </div>
      </Card>

      <Card className="p-5 lg:col-span-2">
        <h2 className="mb-4 font-display text-[15px] font-semibold text-white">Change password</h2>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <Input
            label="Current password"
            type="password"
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={nextPw}
            onChange={(e) => setNextPw(e.target.value)}
            autoComplete="new-password"
            hint="At least 8 characters."
          />
          <div className="flex items-end">
            <Button
              size="sm"
              full
              disabled={!currentPw || nextPw.length < 8}
              onClick={async () => {
                setSaving(true);
                setFlash(null);
                try {
                  const res = await api.admin.changePassword(currentPw, nextPw);
                  setFlash(res.message);
                  setCurrentPw('');
                  setNextPw('');
                } catch (err) {
                  setFlash((err as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Update password
            </Button>
          </div>
        </div>
      </Card>

      {flash && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-4 py-2.5 text-[12.5px] text-ink-300 lg:col-span-2">
          <TriangleAlert className="size-3.5 text-acid-400" aria-hidden />
          {flash}
        </div>
      )}
    </div>
  );
}

export function AdminStatusLabel({ status }: { status: string }) {
  return <span className="text-[12px] text-ink-300">{statusLabel(status)}</span>;
}
