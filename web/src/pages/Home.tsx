import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gamepad2,
  Gift,
  Lock,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, useDebounced } from '../lib/hooks';
import { GameCard } from '../components/cards';
import { Button, Skeleton } from '../components/ui';
import { cn } from '../components/ui';

interface HeroSlide {
  badge: string;
  title: string;
  subtitle: string;
  accent: string;
  gameCode?: string;
  giftBrand?: string;
  chips: { label: string; price: string; path: string }[];
  targetPath: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    badge: '🔥 HOT EVENT · FAST & SAFE',
    title: 'Robux Official Instant Delivery',
    subtitle: 'Get genuine Robux delivered instantly to your username or account. 100% verified & safe.',
    accent: '#c9ff3f',
    gameCode: 'roblox',
    chips: [
      { label: '800 Robux', price: '$9.99', path: '/topup/roblox' },
      { label: '1,000 Robux', price: '$11.99', path: '/topup/roblox' },
      { label: '2,000 Robux', price: '$23.99', path: '/topup/roblox' },
      { label: '4,500 Robux', price: '$49.99', path: '/topup/roblox' },
    ],
    targetPath: '/topup/roblox',
  },
  {
    badge: '⚡ POPULAR · DOUBLE DIAMONDS',
    title: 'Mobile Legends: Bang Bang',
    subtitle: 'Weekly Diamond Pass, Starlight Member and bonus diamonds recharged straight to your User ID & Zone ID.',
    accent: '#3ee8d0',
    gameCode: 'mlbb',
    chips: [
      { label: 'Weekly Pass', price: '$1.99', path: '/topup/mlbb' },
      { label: '50+5 💎', price: '$1.00', path: '/topup/mlbb' },
      { label: '250+25 💎', price: '$4.80', path: '/topup/mlbb' },
      { label: '500+65 💎', price: '$9.50', path: '/topup/mlbb' },
    ],
    targetPath: '/topup/mlbb',
  },
  {
    badge: '🎁 DIGITAL VAULT · OFFICIAL VOUCHERS',
    title: 'Steam & PlayStation Gift Cards',
    subtitle: '100% authentic digital codes deposited directly into your customer vault upon KHQR confirmation.',
    accent: '#7c9cff',
    giftBrand: 'Steam',
    chips: [
      { label: '$5 Steam', price: '$5.30', path: '/gift-cards?brand=Steam' },
      { label: '$10 Steam', price: '$10.60', path: '/gift-cards?brand=Steam' },
      { label: '$20 PSN', price: '$21.20', path: '/gift-cards?brand=PlayStation' },
      { label: '$50 Steam', price: '$53.00', path: '/gift-cards?brand=Steam' },
    ],
    targetPath: '/gift-cards?brand=Steam',
  },
];

const EVENT_DEALS = [
  {
    title: 'MLBB Weekly Pass',
    category: 'Mobile Legends',
    badge: '🔥 BESTSELLER',
    badgeTone: 'bg-flare-500/15 text-flare-400 border-flare-500/25',
    price: '$1.99',
    oldPrice: '$2.50',
    link: '/topup/mlbb',
    image: 'https://cdn.g2bulk.com/images/games/mlbb.png',
  },
  {
    title: 'PUBG Mobile 600+60 UC',
    category: 'PUBG Mobile',
    badge: '⚡ +10% BONUS',
    badgeTone: 'bg-acid-500/15 text-acid-400 border-acid-500/25',
    price: '$9.50',
    oldPrice: '$10.99',
    link: '/topup/pubgm',
    image: 'https://cdn.g2bulk.com/images/games/pubgm.png',
  },
  {
    title: 'Genshin Impact Welkin Moon',
    category: 'Genshin Impact',
    badge: '⭐ POPULAR DEAL',
    badgeTone: 'bg-aqua-400/15 text-aqua-400 border-aqua-400/25',
    price: '$4.99',
    oldPrice: '$5.99',
    link: '/topup/genshin',
    image: 'https://cdn.g2bulk.com/images/games/genshin.png',
  },
  {
    title: 'Free Fire 1080 Diamonds',
    category: 'Free Fire',
    badge: '💎 MEGA PACK',
    badgeTone: 'bg-amber-400/15 text-amber-400 border-amber-400/25',
    price: '$9.80',
    oldPrice: '$11.50',
    link: '/topup/freefire',
    image: 'https://cdn.g2bulk.com/images/games/freefire.png',
  },
];

const BRAND_SPOTLIGHT = [
  { name: 'Roblox', count: '77 Cards', path: '/gift-cards?brand=Roblox', color: 'from-red-500/20 to-ink-900' },
  { name: 'Steam', count: '190 Cards', path: '/gift-cards?brand=Steam', color: 'from-blue-500/20 to-ink-900' },
  { name: 'Apple / iTunes', count: '146 Cards', path: '/gift-cards?brand=Apple%20%2F%20iTunes', color: 'from-slate-400/20 to-ink-900' },
  { name: 'Google Play', count: '88 Cards', path: '/gift-cards?brand=Google%20Play', color: 'from-emerald-500/20 to-ink-900' },
  { name: 'PlayStation', count: '197 Cards', path: '/gift-cards?brand=PlayStation', color: 'from-indigo-500/20 to-ink-900' },
  { name: 'Xbox', count: '115 Cards', path: '/gift-cards?brand=Xbox', color: 'from-green-500/20 to-ink-900' },
  { name: 'Razer Gold', count: '61 Cards', path: '/gift-cards?brand=Razer%20Gold', color: 'from-lime-500/20 to-ink-900' },
  { name: 'Amazon', count: '62 Cards', path: '/gift-cards?brand=Amazon', color: 'from-orange-500/20 to-ink-900' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 280);

  const gamesState = useAsync(() => api.games(), []);

  // Auto-advance hero slides
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const slide = HERO_SLIDES[currentSlide];

  const popularGames = useMemo(() => {
    const list = gamesState.data?.games ?? [];
    const q = debounced.trim().toLowerCase();
    if (q) {
      return list.filter((g) => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q)).slice(0, 18);
    }
    // Pick top priority titles first if they exist
    const topCodes = ['mlbb', 'pubgm', 'freefire', 'genshin', 'roblox', 'ragnarok_origin', 'honkai', '8_ball_pool', 'fcmobile'];
    const top = list.filter((g) => topCodes.some((code) => g.code.includes(code)));
    const rest = list.filter((g) => !topCodes.some((code) => g.code.includes(code)));
    return [...top, ...rest].slice(0, 18);
  }, [gamesState.data, debounced]);

  return (
    <div className="space-y-12 pb-16">
      {/* ------------------------------------------------------------- 1. HERO PROMO BANNER (KIRA STYLE) */}
      <section className="container-page pt-6 md:pt-8">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-ink-900 via-ink-950 to-ink-950 p-6 md:p-10 shadow-2xl">
          {/* Ambient Glow */}
          <div
            className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full opacity-20 blur-[100px] transition-all duration-700"
            style={{ background: slide.accent }}
            aria-hidden
          />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            {/* Left Copy & Denomination Chips */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur">
                <span>{slide.badge}</span>
              </div>

              <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl leading-[1.1]">
                {slide.title}
              </h1>

              <p className="mt-3 text-sm leading-relaxed text-ink-300 md:text-base max-w-xl">
                {slide.subtitle}
              </p>

              {/* Denomination Quick Select Chips (Like Image 1) */}
              <div className="mt-6">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Quick Select Denomination
                </span>
                <div className="flex flex-wrap gap-2">
                  {slide.chips.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(chip.path)}
                      className="group flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:border-acid-500/60 hover:bg-acid-500/10"
                    >
                      <span>{chip.label}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono text-acid-400 group-hover:bg-acid-500/20">
                        {chip.price}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary CTA Button */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="bg-acid-500 text-ink-950 hover:bg-acid-400 font-bold"
                  onClick={() => navigate(slide.targetPath)}
                >
                  <Zap className="mr-1.5 size-4" />
                  Top Up Now
                </Button>
                <Link
                  to="/topup"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-ink-200 hover:bg-white/10 transition-colors"
                >
                  Browse 230+ Games
                </Link>
              </div>
            </div>

            {/* Right Graphic / Interactive Showcase */}
            <div className="hidden lg:flex flex-col items-center justify-center p-6 rounded-2xl border border-white/5 bg-ink-900/50 backdrop-blur">
              <div className="relative size-44 rounded-2xl border border-white/10 bg-ink-850/80 p-4 shadow-xl flex flex-col items-center justify-center text-center">
                <div className="size-16 rounded-xl bg-acid-500/10 border border-acid-500/20 flex items-center justify-center text-acid-400 mb-2">
                  <Gamepad2 className="size-8" />
                </div>
                <span className="font-bold text-white text-sm">G2Bulk Powered</span>
                <span className="text-[11px] text-acid-400 font-mono mt-0.5">Automated 24/7 API</span>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3.5 text-acid-400" /> ID Verified
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5 text-acid-400" /> KHQR Banking
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Zap className="size-3.5 text-acid-400" /> Instant
                </span>
              </div>
            </div>
          </div>

          {/* Slider Pagination Dots & Arrows */}
          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-2">
              {HERO_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    currentSlide === idx ? 'w-8 bg-acid-500' : 'w-2 bg-white/20 hover:bg-white/40',
                  )}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 text-ink-300 hover:bg-white/5 hover:text-white transition-colors"
                aria-label="Previous slide"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length)}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 text-ink-300 hover:bg-white/5 hover:text-white transition-colors"
                aria-label="Next slide"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- 2. CATEGORY SHORTCUT PILLS (GAME & GIFTCARD) */}
      <section className="container-page">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {/* Game Top Up Shortcut Card */}
          <Link
            to="/topup"
            className="group relative flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-ink-900 to-ink-950 p-4 transition-all hover:border-acid-500/50 hover:shadow-[0_0_20px_rgba(201,255,63,0.15)] sm:p-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-acid-500/10 border border-acid-500/20 text-acid-400 group-hover:scale-110 transition-transform">
              <Gamepad2 className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-base font-bold text-white sm:text-lg">Game</span>
                <span className="rounded bg-acid-500/20 px-1.5 py-0.5 text-[10px] font-bold text-acid-400 uppercase">
                  Direct Top-Up
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-400 truncate">
                Mobile Legends, Free Fire, PUBG & 230 games
              </p>
            </div>
            <ArrowRight className="ml-auto hidden size-5 text-ink-400 group-hover:text-acid-400 sm:block transition-colors" />
          </Link>

          {/* Gift Card Shortcut Card */}
          <Link
            to="/gift-cards"
            className="group relative flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-ink-900 to-ink-950 p-4 transition-all hover:border-aqua-400/50 hover:shadow-[0_0_20px_rgba(62,232,208,0.15)] sm:p-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-aqua-400/10 border border-aqua-400/20 text-aqua-400 group-hover:scale-110 transition-transform">
              <Gift className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-base font-bold text-white sm:text-lg">Giftcard</span>
                <span className="rounded bg-aqua-400/20 px-1.5 py-0.5 text-[10px] font-bold text-aqua-300 uppercase">
                  Digital Codes
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-400 truncate">
                Roblox, Steam, PSN, iTunes & 10 Brand Vaults
              </p>
            </div>
            <ArrowRight className="ml-auto hidden size-5 text-ink-400 group-hover:text-aqua-400 sm:block transition-colors" />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------- 3. EVENTS UPCOMING & LIVE EVENTS (IMAGE 1) */}
      <section className="container-page">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="size-5 text-flare-400" />
            <h2 className="font-display text-lg font-bold text-white sm:text-xl">
              Events Upcoming & Live Events
            </h2>
          </div>
          <Link to="/topup" className="text-xs font-semibold text-acid-400 hover:underline">
            View All Deals →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {EVENT_DEALS.map((deal, i) => (
            <Link
              key={i}
              to={deal.link}
              className="group relative flex flex-col justify-between rounded-2xl border border-white/8 bg-ink-900/80 p-3.5 transition-all hover:border-acid-500/40 hover:bg-ink-850"
            >
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold border', deal.badgeTone)}>
                    {deal.badge}
                  </span>
                </div>
                <h3 className="font-display text-sm font-bold text-white group-hover:text-acid-400 transition-colors">
                  {deal.title}
                </h3>
                <p className="text-[11px] text-ink-400 mt-0.5">{deal.category}</p>
              </div>

              <div className="mt-4 flex items-baseline justify-between border-t border-white/5 pt-2.5">
                <div>
                  <span className="font-mono text-sm font-bold text-acid-400">{deal.price}</span>
                  <span className="ml-1.5 font-mono text-[11px] text-ink-500 line-through">{deal.oldPrice}</span>
                </div>
                <span className="text-[11px] font-semibold text-ink-300 group-hover:text-white">Buy →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- 4. TRENDING GAME (GRID SECTION) */}
      <section className="container-page">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-acid-400" />
              <h2 className="font-display text-xl font-bold text-white sm:text-2xl">Trending Game</h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-400">
              Instant automated player recharge — verify ID first, pay with KHQR
            </p>
          </div>
          <Link
            to="/topup"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-300 hover:text-acid-400 transition-colors"
          >
            <span>See 230 games</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Live Filter Search within Trending */}
        <div className="mb-5 max-w-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 size-3.5 text-ink-400 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Quick search game..."
              className="h-9 w-full rounded-xl border border-white/10 bg-ink-900 pl-8 pr-3 text-xs text-ink-100 placeholder:text-ink-400 focus:border-acid-500/50 focus:outline-none"
            />
          </div>
        </div>

        {gamesState.loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3.35] rounded-2xl" />
            ))}
          </div>
        ) : popularGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-400">
            No games found matching "{query}".
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {popularGames.map((game, i) => (
              <GameCard key={game.code} game={game} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- 5. GIFT CARDS CATEGORIZED BY BRAND */}
      <section className="border-t border-white/6 bg-ink-950/60 py-10">
        <div className="container-page">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Gift className="size-5 text-aqua-400" />
                <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
                  Gift Cards by Platform & Brand
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-ink-400">
                Categorized by brand vault · Registration required for secure voucher delivery
              </p>
            </div>
            <Link to="/gift-cards" className="text-xs font-semibold text-aqua-400 hover:underline">
              All 1,200+ Vouchers →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BRAND_SPOTLIGHT.map((b, i) => (
              <Link
                key={i}
                to={b.path}
                className={cn(
                  'group flex flex-col justify-between rounded-2xl border border-white/8 bg-gradient-to-br p-4 transition-all hover:border-aqua-400/40 hover:scale-[1.02]',
                  b.color,
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-base font-bold text-white group-hover:text-aqua-300 transition-colors">
                    {b.name}
                  </span>
                  <Gift className="size-4 text-aqua-400 opacity-60 group-hover:opacity-100" />
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
                  <span>{b.count}</span>
                  <span className="font-semibold text-aqua-400 group-hover:translate-x-0.5 transition-transform">
                    Open →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- 6. TRUST & BENEFITS FOOTER STRIP */}
      <section className="container-page">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3.5 rounded-2xl border border-white/7 bg-ink-900/60 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acid-500/10 border border-acid-500/20 text-acid-400">
              <Zap className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-xs">Instant Automated Delivery</h3>
              <p className="text-[11px] text-ink-400">Direct integration with official supplier APIs</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-white/7 bg-ink-900/60 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acid-500/10 border border-acid-500/20 text-acid-400">
              <Lock className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-xs">Secure KHQR Checkout</h3>
              <p className="text-[11px] text-ink-400">ABA Bank & Bakong zero-fee payment scans</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-white/7 bg-ink-900/60 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acid-500/10 border border-acid-500/20 text-acid-400">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-xs">Permanent Digital Vault</h3>
              <p className="text-[11px] text-ink-400">Gift codes secured under your account</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
