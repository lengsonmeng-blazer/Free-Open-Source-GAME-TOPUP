import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  PackageCheck,
  QrCode,
  RefreshCw,
  Search,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { api, type Order, type OrderEvent } from '../lib/api';
import { copyText, dateTime, money, statusLabel } from '../lib/format';
import { ErrorPanel, PageLoader, useConfig } from '../components/ConfigProvider';
import { Badge, Button, Card, EmptyState, Field } from '../components/ui';
import { cn } from '../components/ui';

const POLL_MS = 3000;
const QR_TTL_SECONDS = 300;

export function OrderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { config } = useConfig();

  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const pollRef = useRef<number | null>(null);

  const load = async (sync: boolean) => {
    const res = await api.order(id, sync);
    setOrder(res.order);
    setEvents(res.events);
    return res.order;
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load(false)
      .catch((err) => {
        if (alive) setError((err as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll while the invoice is open so the customer never has to refresh.
  useEffect(() => {
    if (!order) return;
    const needsPolling = order.paymentStatus === 'PENDING' || order.fulfillStatus === 'PROCESSING';
    if (!needsPolling) {
      if (pollRef.current) window.clearTimeout(pollRef.current);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.order(id, order.paymentStatus === 'PENDING');
        if (cancelled) return;
        setOrder(res.order);
        setEvents(res.events);
      } catch {
        /* keep the last known state */
      }
      if (!cancelled) pollRef.current = window.setTimeout(tick, POLL_MS);
    };

    pollRef.current = window.setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order?.paymentStatus, order?.fulfillStatus]);

  // Soft countdown for the QR window.
  useEffect(() => {
    if (!order || order.paymentStatus !== 'PENDING') return;
    const created = new Date(order.createdAt).getTime();
    const update = () => {
      const elapsed = Math.floor((Date.now() - created) / 1000);
      setSecondsLeft(Math.max(0, QR_TTL_SECONDS - elapsed));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [order?.createdAt, order?.paymentStatus, order]);

  async function manualCheck() {
    setChecking(true);
    setNotice(null);
    try {
      const res = await api.refreshOrder(id);
      setOrder(res.order);
      if (res.order.paymentStatus === 'PENDING') {
        setNotice('No confirmed payment yet. If you just paid, give it a few seconds and check again.');
      } else {
        setNotice(null);
      }
      const fresh = await api.order(id, false);
      setEvents(fresh.events);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <PageLoader label="Loading order" />;
  if (error) return <div className="container-page py-16"><ErrorPanel message={error} onRetry={() => window.location.reload()} /></div>;
  if (!order)
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Order not found"
          description="Check the link, or open a support ticket if you paid for this order."
          action={<Link to="/contact"><Button size="sm" variant="outline">Contact support</Button></Link>}
        />
      </div>
    );

  const isPaid = order.paymentStatus === 'PAID';
  const isDelivered = order.fulfillStatus === 'SUCCESS';
  const isExpired = order.paymentStatus === 'EXPIRED' || order.paymentStatus === 'FAILED';
  const justPaid = params.get('paid') === '1';

  const steps = [
    { key: 'placed', label: 'Order placed', done: true, active: false },
    { key: 'paid', label: 'Payment confirmed', done: isPaid, active: !isPaid && !isExpired },
    {
      key: 'processing',
      label: order.kind === 'TOPUP' ? 'Top-up dispatched' : 'Voucher purchased',
      done: isDelivered,
      active: isPaid && !isDelivered && order.fulfillStatus !== 'FAILED',
    },
    { key: 'done', label: isDelivered ? 'Delivered' : 'Delivery', done: isDelivered, active: false },
  ];

  return (
    <div className="container-page py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to={order.kind === 'TOPUP' ? `/topup/${order.item.ref}` : '/gift-cards'}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-400 transition-colors hover:text-acid-400"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {order.kind === 'TOPUP' ? order.item.name : 'Gift cards'}
          </Link>
          <h1 className="font-display text-2xl font-bold text-white md:text-3xl">
            Order <span className="font-mono text-acid-400">{order.id}</span>
          </h1>
          <p className="mt-1 text-[13px] text-ink-400">Created {dateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge order={order} />
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {justPaid && isPaid && !isDelivered && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-aqua-400/25 bg-aqua-400/8 px-4 py-3 text-[13px] text-aqua-400">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Payment received. Delivery is running now — this page updates on its own.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {/* progress */}
          <Card className="p-5">
            <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
              {steps.map((step, i) => (
                <li key={step.key} className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                  <div className="flex flex-col items-center sm:w-full">
                    <div className="flex items-center sm:w-full">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-colors',
                          step.done
                            ? 'border-acid-500 bg-acid-500 text-ink-950'
                            : step.active
                              ? 'border-acid-500 bg-acid-500/10 text-acid-400'
                              : 'border-white/12 bg-ink-850 text-ink-400',
                        )}
                      >
                        {step.done ? <Check className="size-4" /> : step.active ? <Loader2 className="size-4 animate-spin" /> : i + 1}
                      </span>
                      {i < steps.length - 1 && (
                        <span
                          className={cn('mx-1 hidden h-0.5 flex-1 rounded sm:block', step.done ? 'bg-acid-500' : 'bg-white/8')}
                          aria-hidden
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'mt-2 text-[12.5px] font-medium',
                        step.done ? 'text-ink-100' : step.active ? 'text-acid-400' : 'text-ink-400',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* delivery */}
          {isDelivered && order.delivery && (
            <Card className="border-acid-500/30 p-5">
              <div className="mb-3 flex items-center gap-2">
                <PackageCheck className="size-5 text-acid-400" aria-hidden />
                <h2 className="font-display text-[15px] font-semibold text-white">
                  {order.kind === 'GIFTCARD' ? 'Your voucher code' : 'Delivery confirmed'}
                </h2>
              </div>
              <div className="space-y-2">
                {order.delivery.map((code, i) => (
                  <DeliveryCode key={i} code={code} />
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-ink-400">
                Keep this page bookmarked. We also keep the code here for future reference.
              </p>
            </Card>
          )}

          {order.fulfillStatus === 'FAILED' && (
            <Card className="border-flare-500/30 p-5">
              <div className="mb-2 flex items-center gap-2">
                <XCircle className="size-5 text-flare-500" aria-hidden />
                <h2 className="font-display text-[15px] font-semibold text-white">Delivery failed</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-300">
                {order.error || 'The supplier rejected this order and refunded our wallet.'}
              </p>
              <Link to="/contact" className="mt-4 inline-block">
                <Button size="sm" variant="outline">
                  Contact support for a refund
                </Button>
              </Link>
            </Card>
          )}

          {order.fulfillStatus === 'MANUAL' && (
            <Card className="border-amber-400/30 p-5">
              <div className="mb-2 flex items-center gap-2">
                <TriangleAlert className="size-5 text-amber-300" aria-hidden />
                <h2 className="font-display text-[15px] font-semibold text-white">Under manual review</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-ink-300">
                Payment is confirmed but the supplier call did not go through. Our team is retrying it — no action needed
                from you. {order.error ? `Last error: ${order.error}` : ''}
              </p>
            </Card>
          )}

          {/* timeline */}
          {events.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-white">Activity</h2>
              <ul className="space-y-2.5">
                {events.map((event, i) => (
                  <li key={i} className="flex items-start gap-3 text-[12.5px]">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-acid-500/70" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-ink-200">{event.message || event.kind.replace(/_/g, ' ')}</p>
                      <p className="text-[11px] text-ink-400">{dateTime(event.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------------ side */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {order.paymentStatus === 'PENDING' && (
            <Card className="overflow-hidden border-acid-500/25">
              <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <QrCode className="size-4 text-acid-400" aria-hidden />
                  <p className="font-display text-[14px] font-semibold text-white">Scan to pay</p>
                </div>
                <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-300">
                  <Clock className="size-3.5" aria-hidden />
                  {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
                </span>
              </div>

              <div className="flex flex-col items-center px-5 py-6">
                <div className="rounded-2xl bg-white p-3 shadow-[0_10px_40px_-16px_rgba(201,255,63,0.5)]">
                  <img
                    src={`/api/orders/${order.id}/qr`}
                    alt="KHQR payment code"
                    width={220}
                    height={220}
                    className="size-[220px]"
                  />
                </div>
                <p className="mt-4 font-display text-3xl font-bold text-white">{money(order.totalCents)}</p>
                <p className="mt-1 text-[12px] text-ink-400">KHR equivalent is shown in your banking app</p>

                <ol className="mt-5 w-full space-y-1.5 text-[12px] text-ink-400">
                  <li>1. Open ABA Mobile or any Bakong-enabled app.</li>
                  <li>2. Scan the code and confirm the amount.</li>
                  <li>3. This page updates automatically.</li>
                </ol>

                <Button variant="outline" full size="sm" className="mt-5" onClick={manualCheck} loading={checking}>
                  I have paid — check now
                </Button>
                {config.demoPayments ? (
                  <div className="mt-3 space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      full
                      className="bg-acid-400 font-semibold text-ink-950 hover:bg-acid-300"
                      onClick={async () => {
                        setChecking(true);
                        try {
                          const res = await fetch(`/api/payment/demo-pay/${order.id}`, { method: 'POST' });
                          const data = await res.json();
                          if (data.success) {
                            manualCheck();
                          } else {
                            setNotice(data.message || 'Demo payment failed');
                          }
                        } catch (err) {
                          setNotice((err as Error).message);
                        } finally {
                          setChecking(false);
                        }
                      }}
                      loading={checking}
                    >
                      Simulate Payment (Demo Mode)
                    </Button>
                    <p className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-center text-[11.5px] leading-relaxed text-amber-200">
                      Test mode is active — click above to simulate customer payment and instant fulfillment.
                    </p>
                  </div>
                ) : (
                  <a
                    href={`/api/payment/redirect/${order.id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-200"
                  >
                    <ExternalLink className="size-3" aria-hidden />
                    Open the hosted checkout instead
                  </a>
                )}

                {secondsLeft === 0 && (
                  <p className="mt-3 text-center text-[11.5px] leading-relaxed text-amber-300">
                    This code may have expired. If your payment went through it will still settle here — otherwise start
                    a new order.
                  </p>
                )}

                {notice && <p className="mt-3 text-center text-[11.5px] text-ink-400">{notice}</p>}
              </div>
            </Card>
          )}

          {isExpired && (
            <Card className="border-flare-500/25 p-5 text-center">
              <XCircle className="mx-auto mb-2 size-6 text-flare-500" aria-hidden />
              <p className="font-display text-[15px] font-semibold text-white">Payment window closed</p>
              <p className="mt-1.5 text-[12.5px] text-ink-400">
                No payment was confirmed in time. If money left your account, contact support with this order ID.
              </p>
              <Link to={order.kind === 'TOPUP' ? `/topup/${order.item.ref}` : '/gift-cards'} className="mt-4 block">
                <Button size="sm" full>
                  Start a new order
                </Button>
              </Link>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3.5 font-display text-[15px] font-semibold text-white">Order details</h2>
            <div className="grid gap-3.5">
              <Field label="Item" value={order.item.name} />
              <Field label="Package" value={order.denomination} />
              <Field label="Quantity" value={String(order.quantity)} />
              <Field
                label={order.kind === 'TOPUP' ? 'Player ID' : 'Delivery'}
                value={
                  order.kind === 'TOPUP'
                    ? [order.account.user_id, order.account.server_id].filter(Boolean).join(' · ')
                    : 'Digital code'
                }
                mono={order.kind === 'TOPUP'}
              />
              {order.playerName && <Field label="Verified name" value={order.playerName} />}
              <Field label="Receipt to" value={order.contact} />
              <Field label="Total" value={money(order.totalCents)} />
              {order.paidAt && <Field label="Paid at" value={dateTime(order.paidAt)} />}
            </div>
          </Card>

          <p className="px-1 text-[11px] leading-relaxed text-ink-400">
            Need help? Message{' '}
            <a
              href={`https://t.me/${config.supportTelegram.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-ink-200 underline decoration-white/20 hover:text-acid-400"
            >
              @{config.supportTelegram.replace(/^@/, '')}
            </a>{' '}
            with order {order.id}.
          </p>
        </aside>
      </div>
    </div>
  );
}

function OrderStatusBadge({ order }: { order: Order }) {
  if (order.fulfillStatus === 'SUCCESS') {
    return (
      <Badge tone="success">
        <CheckCircle2 className="size-3" aria-hidden /> {statusLabel('SUCCESS')}
      </Badge>
    );
  }
  if (order.fulfillStatus === 'FAILED') {
    return (
      <Badge tone="danger">
        <XCircle className="size-3" aria-hidden /> Delivery failed
      </Badge>
    );
  }
  if (order.fulfillStatus === 'MANUAL') {
    return (
      <Badge tone="warning">
        <TriangleAlert className="size-3" aria-hidden /> Review
      </Badge>
    );
  }
  if (order.paymentStatus === 'PAID') {
    return (
      <Badge tone="info">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Processing
      </Badge>
    );
  }
  if (order.paymentStatus === 'EXPIRED' || order.paymentStatus === 'FAILED') {
    return <Badge tone="warning">Expired</Badge>;
  }
  return (
    <Badge tone="warning">
      <Clock className="size-3" aria-hidden /> Awaiting payment
    </Badge>
  );
}

function DeliveryCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5">
      <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed text-acid-400">{code}</code>
      <button
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-ink-300 transition-colors hover:border-acid-500/50 hover:text-acid-400"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function TrackPage() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const id = useMemo(() => value.trim().toUpperCase(), [value]);

  async function track() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      await api.order(id);
      window.location.href = `/order/${id}`;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="container-page flex min-h-[60vh] max-w-lg flex-col justify-center py-16">
      <div className="mb-6 text-center">
        <Search className="mx-auto mb-3 size-8 text-acid-500" aria-hidden />
        <h1 className="font-display text-2xl font-bold text-white">Track an order</h1>
        <p className="mt-1.5 text-sm text-ink-400">Enter the order ID from your receipt, e.g. GT-ABCD1234.</p>
      </div>
      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            track();
          }}
          className="space-y-3"
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="GT-XXXXXXXX"
            aria-label="Order ID"
            className="h-11 w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 font-mono text-sm uppercase text-ink-100 placeholder:text-ink-400 focus:border-acid-500/60 focus:outline-none"
          />
          {error && <p className="text-[12.5px] text-flare-500">{error}</p>}
          <Button full type="submit" loading={loading} disabled={!id}>
            Open order
          </Button>
        </form>
      </Card>
    </div>
  );
}
