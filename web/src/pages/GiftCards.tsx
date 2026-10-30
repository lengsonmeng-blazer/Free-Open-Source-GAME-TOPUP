import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Gift,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { money } from '../lib/format';
import { ErrorPanel, PageLoader } from '../components/ConfigProvider';
import { ImageWithFallback, ProductCard } from '../components/cards';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '../components/ui';
import { cn } from '../components/ui';
import { useAuth } from '../components/AuthContext';

const BRANDS = [
  { id: '', label: 'All Brands', icon: Sparkles },
  { id: 'Roblox', label: 'Roblox', icon: Gift },
  { id: 'Steam', label: 'Steam', icon: Gift },
  { id: 'Apple / iTunes', label: 'Apple / iTunes', icon: Gift },
  { id: 'Google Play', label: 'Google Play', icon: Gift },
  { id: 'PlayStation', label: 'PlayStation (PSN)', icon: Gift },
  { id: 'Xbox', label: 'Xbox', icon: Gift },
  { id: 'Nintendo', label: 'Nintendo', icon: Gift },
  { id: 'Razer Gold', label: 'Razer Gold', icon: Gift },
  { id: 'Amazon', label: 'Amazon', icon: Gift },
  { id: 'Entertainment', label: 'Entertainment', icon: Gift },
];

export function GiftIndexPage() {
  const [params, setParams] = useSearchParams();
  const activeBrand = params.get('brand') || '';
  const activeCategory = Number(params.get('category') || 0);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(query, 280);

  const categoriesState = useAsync(() => api.categories(), []);
  const productsState = useAsync(
    () => api.products({ q: debounced, brand: activeBrand, category: activeCategory, page, limit: 32 }),
    [debounced, activeBrand, activeCategory, page],
  );

  const categories = useMemo(() => {
    const list = categoriesState.data?.categories ?? [];
    if (!activeBrand) return list;
    return list.filter((c) => (c.brand || '').toLowerCase() === activeBrand.toLowerCase());
  }, [categoriesState.data, activeBrand]);

  function setBrand(brandId: string) {
    const next = new URLSearchParams(params);
    if (brandId) next.set('brand', brandId);
    else next.delete('brand');
    next.delete('category');
    setParams(next, { replace: true });
    setPage(1);
  }

  function setCategory(id: number) {
    const next = new URLSearchParams(params);
    if (id) next.set('category', String(id));
    else next.delete('category');
    setParams(next, { replace: true });
    setPage(1);
  }

  const total = productsState.data?.total ?? 0;
  const totalPages = productsState.data?.totalPages ?? 1;

  return (
    <div className="container-page py-10 md:py-14">
      {/* Page Header */}
      <div className="mb-8 max-w-2xl">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-aqua-400">
          Official Digital Vouchers
        </p>
        <h1 className="font-display text-3xl font-extrabold text-white md:text-4xl">
          {activeBrand ? `${activeBrand} Gift Cards` : 'Gift Cards Catalogue'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          Instant digital delivery directly into your account vault. Filter by brand and region below.
        </p>
      </div>

      {/* Brand Tabs Rail */}
      <div className="mb-6">
        <span className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-ink-400">
          Select Brand / Platform
        </span>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {BRANDS.map((b) => {
            const isActive = activeBrand.toLowerCase() === b.id.toLowerCase();
            return (
              <button
                key={b.id || 'all'}
                onClick={() => setBrand(b.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all',
                  isActive
                    ? 'border-aqua-400 bg-aqua-400/15 text-white shadow-[0_0_15px_rgba(62,232,208,0.25)]'
                    : 'border-white/8 bg-ink-900/90 text-ink-300 hover:border-white/20 hover:text-white',
                )}
              >
                <b.icon className={cn('size-3.5', isActive ? 'text-aqua-400' : 'text-ink-400')} />
                <span>{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategory / Country Rail */}
      {categories.length > 0 && (
        <div className="mb-6 rounded-2xl border border-white/6 bg-ink-900/60 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
              {activeBrand ? `${activeBrand} Regions & Sub-categories` : 'All Regions & Categories'}
            </span>
            {activeCategory > 0 && (
              <button
                onClick={() => setCategory(0)}
                className="text-[11px] font-medium text-aqua-400 hover:underline"
              >
                Clear Region Filter
              </button>
            )}
          </div>
          <div className="no-scrollbar flex flex-wrap gap-2">
            <button
              onClick={() => setCategory(0)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                activeCategory === 0
                  ? 'bg-aqua-400/20 text-aqua-300 border border-aqua-400/30'
                  : 'bg-ink-850 text-ink-300 hover:bg-ink-800 hover:text-white',
              )}
            >
              All Regions
            </button>
            {categories.slice(0, 30).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeCategory === cat.id
                    ? 'bg-aqua-400/20 text-aqua-300 border border-aqua-400/30'
                    : 'bg-ink-850 text-ink-300 hover:bg-ink-800 hover:text-white',
                )}
              >
                {cat.title} ({cat.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Input & Status */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${activeBrand || 'all'} vouchers by denomination or name…`}
            className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/90 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-400 focus:border-aqua-400/50 focus:outline-none"
          />
        </div>
        <div className="text-xs text-ink-400">
          Showing <span className="font-semibold text-white">{total}</span> vouchers
        </div>
      </div>

      {/* Products Grid */}
      {productsState.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] rounded-2xl" />
          ))}
        </div>
      ) : productsState.error ? (
        <ErrorPanel message={productsState.error} onRetry={productsState.reload} />
      ) : (productsState.data?.products.length ?? 0) === 0 ? (
        <EmptyState
          title="No vouchers match your criteria"
          description="Try selecting another brand or region, or clear your search query."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('');
                setBrand('');
                setCategory(0);
              }}
            >
              Reset all filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {productsState.data?.products.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="px-3 text-xs text-ink-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function GiftDetailPage() {
  const { id = '' } = useParams();
  const { user, openAuth } = useAuth();
  const state = useAsync(() => api.product(Number(id)), [id]);

  const [quantity, setQuantity] = useState(1);
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const product = state.data?.product;

  useEffect(() => {
    if (user?.email && !contact) {
      setContact(user.email);
    }
  }, [user]);

  if (state.loading) return <PageLoader label="Loading voucher" />;
  if (state.error)
    return (
      <div className="container-page py-16">
        <ErrorPanel message={state.error} onRetry={state.reload} />
      </div>
    );
  if (!product)
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Voucher not found"
          action={
            <Link to="/gift-cards">
              <Button size="sm" variant="outline">
                Back to gift cards
              </Button>
            </Link>
          }
        />
      </div>
    );

  const outOfStock = product.stock === 0;
  const total = product.priceCents * quantity;

  async function handleBuy() {
    if (!product) return;
    if (!user) {
      openAuth(
        'login',
        'Account Required: Gift card voucher codes are deposited directly into your customer vault. Please sign in or register to purchase.',
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createOrder({
        kind: 'GIFTCARD',
        productId: product.id,
        quantity,
        contact: contact.trim() || user.email,
      });
      window.location.href = `/order/${res.order.id}`;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="container-page py-8 md:py-12">
      <Link
        to="/gift-cards"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-400 transition-colors hover:text-aqua-400"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All gift cards
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Header Card */}
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <ImageWithFallback
              src={product.imageUrl}
              alt={product.title}
              seed={product.categoryTitle || product.title}
              icon
              className="size-20 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-aqua-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-aqua-400 border border-aqua-400/20">
                  {product.brand || 'Digital Voucher'}
                </span>
              </div>
              <h1 className="mt-1 font-display text-xl font-bold text-white md:text-2xl">{product.title}</h1>
              <p className="mt-0.5 text-[13px] text-ink-400">{product.categoryTitle || 'Official Card'}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {outOfStock ? (
                  <Badge tone="danger">Out of stock</Badge>
                ) : (
                  <Badge tone="success">
                    <Zap className="size-3" aria-hidden /> Instant Code
                  </Badge>
                )}
                {product.faceValue ? <Badge tone="neutral">Face value ${product.faceValue}</Badge> : null}
                <Badge tone="info">
                  <ShieldCheck className="size-3" aria-hidden /> Registered Vault Delivery
                </Badge>
              </div>
            </div>
          </Card>

          {/* Strict Account Notice */}
          <div className="rounded-2xl border border-aqua-400/20 bg-aqua-400/6 p-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 size-5 shrink-0 text-aqua-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Strict Security & Code Delivery Policy</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-300">
                  Unlike guest game top-ups, all gift cards and voucher codes require an active registered account.
                  Upon payment confirmation, your unmasked digital voucher code is permanently deposited into your
                  account vault where it cannot be intercepted or lost.
                </p>
              </div>
            </div>
          </div>

          {product.description && (
            <Card className="p-5">
              <h2 className="mb-2 font-display text-[15px] font-semibold text-white">Card Details & Redemption</h2>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-300">{product.description}</p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 font-display text-[15px] font-semibold text-white">How gift card delivery works</h2>
            <ol className="space-y-2.5 text-[13.5px] text-ink-300">
              {[
                'Register or sign in with your email account.',
                'Pay the invoice with KHQR (ABA Bank / Bakong / Any banking app).',
                'The supplier generates your authentic 16-25 digit code in seconds.',
                'Your code appears on your order receipt and is saved in your account orders.',
              ].map((line, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full bg-aqua-400/12 font-mono text-[10px] font-bold text-aqua-400">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Sidebar Purchase Box */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-white/6 px-5 py-4">
              <p className="font-display text-[15px] font-semibold text-white">Buy this voucher</p>
            </div>
            <div className="space-y-3.5 px-5 py-4">
              {/* Quantity */}
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-ink-300">Quantity</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="flex size-9 items-center justify-center rounded-lg border border-white/10 text-ink-200 hover:border-white/25"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-10 text-center font-mono text-sm text-ink-100">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                    className="flex size-9 items-center justify-center rounded-lg border border-white/10 text-ink-200 hover:border-white/25"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                  <span className="ml-auto text-[11.5px] text-ink-400">max 10</span>
                </div>
              </div>

              {/* Account state check */}
              {user ? (
                <div className="rounded-xl border border-white/10 bg-ink-850 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-400">Linked Account</span>
                    <span className="font-medium text-white">{user.username}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-ink-400">Receipt Email</span>
                    <span className="font-mono text-ink-300">{user.email}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Lock className="size-3.5" />
                    <span>Registration required</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed">
                    You must sign in or register before checking out so this voucher code is tied to your account.
                  </p>
                </div>
              )}

              {user && (
                <Input
                  label="Alternative notification email (optional)"
                  name="contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={user.email}
                />
              )}

              {error && <p className="text-xs text-flare-400">{error}</p>}

              <div className="border-t border-white/6 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-ink-300">Total</span>
                  <span className="font-display text-2xl font-bold text-aqua-400">{money(total)}</span>
                </div>
              </div>

              {user ? (
                <Button
                  size="lg"
                  className="w-full bg-aqua-400 text-ink-950 hover:bg-aqua-300 font-bold"
                  disabled={outOfStock || submitting}
                  loading={submitting}
                  onClick={handleBuy}
                >
                  {outOfStock ? 'Out of stock' : 'Pay with KHQR'}
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full bg-acid-500 text-ink-950 hover:bg-acid-400 font-bold"
                  onClick={() =>
                    openAuth(
                      'login',
                      'Account required: Please sign in or register to buy gift cards. Your voucher code will be safely stored in your account.',
                    )
                  }
                >
                  <Lock className="mr-1.5 size-4" />
                  Sign In to Purchase
                </Button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
