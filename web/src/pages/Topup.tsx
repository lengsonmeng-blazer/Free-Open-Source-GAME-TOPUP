import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, CircleAlert, Gamepad2, Search, UserCheck, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { money } from '../lib/format';
import { ErrorPanel, PageLoader, useConfig } from '../components/ConfigProvider';
import { GameCard, ImageWithFallback } from '../components/cards';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '../components/ui';
import { cn } from '../components/ui';
import { useAuth } from '../components/AuthContext';

export function TopupIndexPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const debounced = useDebounced(query, 250);
  const state = useAsync(() => api.games(), []);

  const games = useMemo(() => {
    const list = state.data?.games ?? [];
    const q = debounced.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
  }, [state.data, debounced]);

  return (
    <div className="container-page py-10 md:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-acid-500">Catalogue</p>
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">Game top-up</h1>
        <p className="mt-2 text-sm text-ink-400">
          {state.data ? `${state.data.games.length} titles` : 'Loading titles'} straight from the official supplier
          catalogue. Prices update automatically with the supplier.
        </p>
      </div>

      <div className="mb-7 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3">
        <Search className="size-4 shrink-0 text-ink-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('q', e.target.value);
            else next.delete('q');
            setParams(next, { replace: true });
          }}
          placeholder="Search games…"
          aria-label="Search games"
          className="h-11 w-full bg-transparent text-sm text-ink-100 placeholder:text-ink-400 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="text-[12px] font-medium text-ink-400 hover:text-ink-200"
          >
            Clear
          </button>
        )}
      </div>

      {state.loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 18 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3.35] rounded-2xl" />
          ))}
        </div>
      ) : state.error ? (
        <ErrorPanel message={state.error} onRetry={state.reload} />
      ) : games.length === 0 ? (
        <EmptyState
          title="No games found"
          description="The catalogue may still be syncing. An administrator can run the first sync from the admin panel."
          action={
            <Link to="/gift-cards">
              <Button variant="outline" size="sm">
                Browse gift cards instead
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {games.map((game, i) => (
            <GameCard key={game.code} game={game} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TopupGamePage() {
  const { code = '' } = useParams();
  const { config } = useConfig();
  const { user } = useAuth();
  const state = useAsync(() => api.game(code), [code]);

  const [serverId, setServerId] = useState('');
  const [userId, setUserId] = useState('');
  const [charname, setCharname] = useState('');
  const [contact, setContact] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    name: string;
    message: string;
    unavailable?: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.email && !contact) {
      setContact(user.email);
    }
  }, [user]);

  const game = state.data?.game;
  const denoms = state.data?.denominations ?? [];
  const fields = game?.fields && game.fields.length > 0 ? game.fields : ['userid'];
  const needsServer = fields.includes('serverid');
  const needsCharname = fields.includes('charname');
  const servers = game?.servers ?? {};
  const serverOptions = Object.entries(servers);
  const hasServerDropdown = serverOptions.length > 0;

  const isMlbb = game?.code.includes('mlbb') || game?.name.toLowerCase().includes('mobile legends');
  const isGenshin = ['genshin', 'star_rail', 'honkai', 'zenless'].some((k) => game?.code.includes(k));
  const isPubg = game?.code.includes('pubg');
  const isFreefire = game?.code.includes('freefire');

  const userIdLabel = isMlbb
    ? 'User ID'
    : isGenshin
    ? 'UID'
    : isPubg
    ? 'Character ID (Numeric)'
    : isFreefire
    ? 'Player ID'
    : needsCharname
    ? 'Player ID'
    : 'Player / User ID';

  const userIdPlaceholder = isMlbb
    ? 'e.g. 12345678'
    : isGenshin
    ? 'e.g. 800000000'
    : isPubg
    ? 'e.g. 5123456789'
    : isFreefire
    ? 'e.g. 123456789'
    : 'Enter Player ID';

  const serverLabel = hasServerDropdown ? 'Select Server / Region' : isMlbb ? 'Zone ID' : 'Server / Zone ID';
  const serverPlaceholder = isMlbb ? 'e.g. 2001 (in brackets beside ID)' : 'e.g. 2001 or Server ID';

  const selectedDenom = denoms.find((d) => d.key === selected) ?? null;

  async function verify() {
    if (!game) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.verifyPlayer({
        game: game.code,
        userId: userId.trim(),
        serverId: serverId.trim() || undefined,
        charname: charname.trim() || undefined,
      });
      setVerifyResult({
        valid: res.valid,
        name: res.name,
        message: res.message,
        unavailable: res.unavailable,
      });
    } catch (err) {
      setVerifyResult({ valid: false, name: '', message: (err as Error).message });
    } finally {
      setVerifying(false);
    }
  }

  async function buy() {
    if (!game || !selectedDenom) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createOrder({
        kind: 'TOPUP',
        gameCode: game.code,
        denomName: selectedDenom.name,
        userId: userId.trim(),
        serverId: serverId.trim() || undefined,
        charname: charname.trim() || undefined,
        contact: contact.trim(),
      });
      window.location.href = `/order/${res.order.id}`;
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (state.loading) return <PageLoader label="Loading game" />;
  if (state.error) return <div className="container-page py-16"><ErrorPanel message={state.error} onRetry={state.reload} /></div>;
  if (!game) return <div className="container-page py-16"><EmptyState title="Game not found" /></div>;

  const canBuy =
    !!selectedDenom &&
    userId.trim().length > 0 &&
    (!needsServer || serverId.trim().length > 0) &&
    (!needsCharname || charname.trim().length > 0) &&
    contact.trim().length >= 3 &&
    !submitting;

  return (
    <div className="container-page py-8 md:py-12">
      <Link
        to="/topup"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-400 transition-colors hover:text-acid-400"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All games
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* header */}
          <Card className="flex items-center gap-4 p-4">
            <ImageWithFallback
              src={game.imageUrl}
              alt={game.name}
              seed={game.name}
              className="size-16 shrink-0 rounded-xl"
            />
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold text-white md:text-2xl">{game.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone="success">
                  <Zap className="size-3" aria-hidden /> Instant
                </Badge>
                <Badge tone="info">
                  <BadgeCheck className="size-3" aria-hidden /> ID verified
                </Badge>
              </div>
            </div>
          </Card>

          {game.notes && (
            <div className="flex gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/6 px-4 py-3 text-[12.5px] leading-relaxed text-amber-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{game.notes}</p>
            </div>
          )}

          {state.data?.syncWarning && (
            <div className="rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-[12px] text-ink-400">
              Catalogue refresh warning: {state.data.syncWarning}
            </div>
          )}

          {/* step 1 — account */}
          <Card className="p-5">
            <StepHeader step={1} title="Account details" hint="We check the ID before you pay." />
            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <Input
                label={userIdLabel}
                name="userId"
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value);
                  setVerifyResult(null);
                }}
                placeholder={userIdPlaceholder}
                inputMode={isMlbb || isPubg || isFreefire ? 'numeric' : 'text'}
                autoComplete="off"
              />
              {needsServer &&
                (hasServerDropdown ? (
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-ink-300">{serverLabel}</span>
                    <select
                      value={serverId}
                      onChange={(e) => {
                        setServerId(e.target.value);
                        setVerifyResult(null);
                      }}
                      className="h-11 w-full rounded-xl border border-white/10 bg-ink-850 px-3 text-sm text-ink-100 focus:border-acid-500/60 focus:outline-none"
                    >
                      <option value="">Select server…</option>
                      {serverOptions.map(([serverName, sId]) => (
                        <option key={sId || serverName} value={sId || serverName}>
                          {serverName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <Input
                    label={serverLabel}
                    name="serverId"
                    value={serverId}
                    onChange={(e) => {
                      setServerId(e.target.value);
                      setVerifyResult(null);
                    }}
                    placeholder={serverPlaceholder}
                    inputMode={isMlbb ? 'numeric' : 'text'}
                    autoComplete="off"
                  />
                ))}
              {needsCharname && (
                <div className="space-y-1 sm:col-span-2">
                  <Input
                    label="Character name / Role ID"
                    name="charname"
                    value={charname}
                    onChange={(e) => {
                      setCharname(e.target.value);
                      setVerifyResult(null);
                    }}
                    placeholder="Exact in-game character name"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-ink-400">
                    Character name must match your in-game name exactly (case-sensitive) to guarantee delivery.
                  </p>
                </div>
              )}
              {isMlbb && (
                <p className="text-[11.5px] text-ink-400 sm:col-span-2">
                  Your Mobile Legends ID has two parts: User ID and 4-digit Zone ID in parentheses, e.g.{' '}
                  <span className="font-mono text-ink-200">12345678 (2001)</span>. Enter them in the separate fields above.
                </p>
              )}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={verify}
                loading={verifying}
                disabled={!userId.trim() || (needsServer && !serverId.trim()) || (needsCharname && !charname.trim())}
              >
                <Zap className="mr-1.5 size-3.5 text-acid-400" />
                Check ID
              </Button>
              {verifyResult && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium border',
                    verifyResult.valid
                      ? 'bg-acid-500/10 text-acid-400 border-acid-500/20'
                      : verifyResult.unavailable
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                      : 'bg-flare-500/10 text-flare-400 border-flare-500/20',
                  )}
                >
                  {verifyResult.valid ? <BadgeCheck className="size-4 shrink-0 text-acid-400" /> : <CircleAlert className="size-4 shrink-0" />}
                  <span>
                    {verifyResult.valid
                      ? verifyResult.name === 'No validation required'
                        ? 'Direct delivery (live check not required)'
                        : `Verified: ${verifyResult.name}`
                      : verifyResult.message}
                  </span>
                </span>
              )}
            </div>
          </Card>

          {/* step 2 — package */}
          <Card className="p-5">
            <StepHeader step={2} title="Choose a package" hint={`${denoms.length} options`} />
            {denoms.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-ink-400">
                No packages published for this game yet. Try again in a minute — the catalogue refreshes automatically.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {denoms.map((denom) => {
                  const active = selected === denom.key;
                  return (
                    <button
                      key={denom.key}
                      onClick={() => setSelected(denom.key)}
                      aria-pressed={active}
                      className={cn(
                        'group relative flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all',
                        active
                          ? 'border-acid-500 bg-acid-500/10 shadow-[0_0_0_1px_rgba(201,255,63,0.4)]'
                          : 'border-white/8 bg-ink-850 hover:border-white/20',
                      )}
                    >
                      <span className={cn('text-[13px] font-semibold', active ? 'text-white' : 'text-ink-100')}>
                        {denom.displayName}
                      </span>
                      <span className={cn('font-display text-[15px] font-bold', active ? 'text-acid-400' : 'text-ink-300')}>
                        {money(denom.priceCents)}
                      </span>
                      {active && <BadgeCheck className="absolute right-2.5 top-2.5 size-4 text-acid-400" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* step 3 — contact */}
          <Card className="p-5">
            <StepHeader step={3} title="Where do we send the receipt?" />
            {user ? (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-acid-500/20 bg-acid-500/8 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-4 text-acid-400" />
                  <span className="text-ink-200">
                    Logged in as <strong className="text-white">{user.username}</strong> ({user.email})
                  </span>
                </div>
                <span className="rounded bg-acid-500/20 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-acid-400">
                  Account Linked
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
                <span className="font-semibold text-acid-400">⚡ Guest Checkout:</span>
                <span>No registration required for game top-ups. Just enter receipt details below.</span>
              </div>
            )}
            <div className="mt-3.5">
              <Input
                label="Email or Telegram username"
                name="contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="you@example.com or @username"
                autoComplete="email"
                hint="Used only for this order — receipt and delivery details stay permanently on your order page."
              />
            </div>
          </Card>
        </div>

        {/* --------------------------------------------------------- summary */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-white/6 px-5 py-4">
              <p className="font-display text-[15px] font-semibold text-white">Order summary</p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <Row label="Game" value={game.name} />
              <Row label="Package" value={selectedDenom?.displayName ?? '—'} />
              <Row label="Player ID" value={userId || '—'} mono />
              {needsServer && <Row label="Server" value={serverId || '—'} mono />}
              {needsCharname && <Row label="Character" value={charname || '—'} />}
              <div className="border-t border-white/6 pt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-ink-300">Total</span>
                  <span className="font-display text-2xl font-bold text-acid-400">
                    {money(selectedDenom?.priceCents ?? 0)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-400">Paid in USD · KHQR · no extra fees</p>
              </div>

              {error && (
                <div className="rounded-lg border border-flare-500/25 bg-flare-500/8 px-3 py-2 text-[12.5px] text-flare-500">
                  {error}
                </div>
              )}

              <Button full size="lg" onClick={buy} disabled={!canBuy} loading={submitting}>
                {submitting ? 'Creating order…' : 'Proceed to payment'}
                {!submitting && <ArrowRight className="size-4" aria-hidden />}
              </Button>

              {!config.paymentsOnline && (
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/6 px-3 py-2 text-[11.5px] leading-relaxed text-amber-200">
                  Card payments are not configured yet — an administrator still needs to add the Ahnajak Pay profile.
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-ink-400">
                By continuing you agree to the{' '}
                <Link to="/terms" className="text-ink-300 underline decoration-white/20 hover:text-acid-400">
                  terms
                </Link>{' '}
                and confirm the player ID is correct. Top-ups cannot be reversed once delivered.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function StepHeader({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-acid-500/12 font-mono text-[11px] font-bold text-acid-400">
        {step}
      </span>
      <h2 className="font-display text-[15px] font-semibold text-white">{title}</h2>
      {hint && <span className="ml-auto text-[11.5px] text-ink-400">{hint}</span>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12.5px] text-ink-400">{label}</span>
      <span className={cn('max-w-[62%] truncate text-right text-[13px] font-medium text-ink-100', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}

export function TopupIcon() {
  return <Gamepad2 className="size-4" aria-hidden />;
}
