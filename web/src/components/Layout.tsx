import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  Lock,
  LogOut,
  Mail,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from './ui';
import { useConfig } from './ConfigProvider';
import { useAuth } from './AuthContext';

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden role="img">
      <defs>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9ff3f" />
          <stop offset="55%" stopColor="#3ee8d0" />
          <stop offset="100%" stopColor="#7c9cff" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="#0b0d11" stroke="url(#brandGrad)" strokeWidth="1.6" />
      <path d="M13 26.5 20 12l7 14.5h-3.6L20 19.2l-3.4 7.3H13Z" fill="url(#brandGrad)" />
      <circle cx="20" cy="29.2" r="1.9" fill="#c9ff3f" />
    </svg>
  );
}

const NAV = [
  { to: '/topup', label: 'Game Top-Up', icon: Gamepad2 },
  { to: '/gift-cards', label: 'Gift Cards', icon: Sparkles },
  { to: '/track', label: 'Track Order', icon: Search },
  { to: '/contact', label: 'Contact', icon: Mail },
];

export function Layout() {
  const { config } = useConfig();
  const { user, openAuth, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [headerQuery, setHeaderQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    api.admin
      .me()
      .then((res) => {
        if (alive) setIsAdmin(!!res.authenticated);
      })
      .catch(() => {
        if (alive) setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleHeaderSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!headerQuery.trim()) return;
    navigate(`/topup?q=${encodeURIComponent(headerQuery.trim())}`);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0b0e14] text-ink-100">
      {config.announcement && (
        <div className="border-b border-acid-500/20 bg-acid-500/8 px-4 py-1.5 text-center text-[12.5px] font-medium text-acid-400">
          <Zap className="mr-1.5 inline size-3.5" aria-hidden />
          {config.announcement}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-white/7 bg-[#0b0e14]/90 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center justify-between gap-3 lg:gap-6">
          {/* Logo */}
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <BrandMark className="size-9 transition-transform duration-300 group-hover:rotate-6" />
            <div className="leading-none">
              <span className="font-display text-[17px] font-bold tracking-tight text-white">{config.siteName}</span>
              <span className="mt-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.2em] text-acid-400">
                Official Store
              </span>
            </div>
          </Link>

          {/* Quick Search Bar (Kira Game style) */}
          <form
            onSubmit={handleHeaderSearch}
            className="relative hidden max-w-xs flex-1 items-center sm:flex md:max-w-sm"
          >
            <Search className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              placeholder="Search game, item, voucher..."
              className="h-9 w-full rounded-full border border-white/10 bg-ink-900/90 pl-9 pr-3 text-xs text-ink-100 placeholder:text-ink-400 transition-colors focus:border-acid-500/50 focus:bg-ink-850 focus:outline-none"
            />
          </form>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'text-white' : 'text-ink-300 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className="size-3.5" aria-hidden />
                    {item.label}
                    {isActive && (
                      <span className="absolute inset-x-2.5 -bottom-[15px] h-[2px] rounded-full bg-acid-500" aria-hidden />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right Action / Auth & Wallet */}
          <div className="flex items-center gap-2.5">
            {user ? (
              <div className="flex items-center gap-2">
                {/* Wallet Balance Chip */}
                <div className="flex items-center gap-1.5 rounded-full border border-acid-500/25 bg-acid-500/10 px-3 py-1 text-xs font-semibold text-acid-400">
                  <Wallet className="size-3.5" />
                  <span>${user.balance.toFixed(2)}</span>
                </div>

                {/* User Profile Chip */}
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-850 px-2.5 py-1 text-xs">
                  <div className="flex size-5 items-center justify-center rounded-full bg-acid-500 text-ink-950 font-bold text-[10px]">
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="hidden font-medium text-ink-200 sm:inline">{user.username}</span>
                  <button
                    onClick={() => logout()}
                    title="Sign Out"
                    className="ml-1 text-ink-400 hover:text-flare-400 transition-colors"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuth('login')}
                  className="rounded-lg border border-white/10 bg-ink-850 px-3 py-1.5 text-xs font-semibold text-ink-200 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuth('register')}
                  className="hidden rounded-lg bg-acid-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-acid-400 transition-colors sm:block"
                >
                  Register
                </button>
              </div>
            )}

            {isAdmin && (
              <Link
                to="/admin"
                className="hidden items-center gap-1 rounded-lg border border-acid-500/30 bg-acid-500/10 px-2.5 py-1.5 text-xs font-semibold text-acid-400 transition-colors hover:bg-acid-500/16 md:flex"
              >
                <ShieldCheck className="size-3.5" aria-hidden />
                Admin
              </Link>
            )}

            {/* Mobile menu trigger */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="flex size-9 items-center justify-center rounded-lg border border-white/10 text-ink-200 lg:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {open && (
          <div className="border-t border-white/7 bg-[#0b0e14] p-4 lg:hidden">
            <form onSubmit={handleHeaderSearch} className="relative mb-3 flex items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-ink-400" />
              <input
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
                placeholder="Search game, item, voucher..."
                className="h-10 w-full rounded-xl border border-white/10 bg-ink-900 pl-9 pr-3 text-xs text-ink-100 placeholder:text-ink-400"
              />
            </form>

            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                      isActive ? 'bg-white/6 text-white' : 'text-ink-300',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </NavLink>
              ))}
              {!user && (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
                  <button
                    onClick={() => {
                      setOpen(false);
                      openAuth('login');
                    }}
                    className="rounded-xl border border-white/10 bg-ink-850 py-2 text-center text-xs font-semibold text-ink-100"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setOpen(false);
                      openAuth('register');
                    }}
                    className="rounded-xl bg-acid-500 py-2 text-center text-xs font-semibold text-ink-950"
                  >
                    Register
                  </button>
                </div>
              )}
              {isAdmin && (
                <NavLink to="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-acid-400">
                  <ShieldCheck className="size-4" aria-hidden />
                  Admin dashboard
                </NavLink>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 border-t border-white/7 bg-ink-900/60">
        <div className="container-page grid gap-10 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <span className="font-display text-base font-bold text-white">{config.siteName}</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              {config.tagline}. Delivered straight from official supplier APIs to your player ID or inbox in under a
              minute.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1">
                <Lock className="size-3" aria-hidden /> Secure KHQR checkout
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 px-2.5 py-1">
                <Zap className="size-3" aria-hidden /> Instant delivery
              </span>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Shop</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/topup" className="text-ink-300 transition-colors hover:text-acid-400">
                  Game top-up
                </Link>
              </li>
              <li>
                <Link to="/gift-cards" className="text-ink-300 transition-colors hover:text-acid-400">
                  Gift cards
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-ink-300 transition-colors hover:text-acid-400">
                  Contact support
                </Link>
              </li>
              <li>
                <Link to="/track" className="text-ink-300 transition-colors hover:text-acid-400">
                  Track an order
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Legal & help</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/terms" className="text-ink-300 transition-colors hover:text-acid-400">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-ink-300 transition-colors hover:text-acid-400">
                  Privacy policy
                </Link>
              </li>
              <li>
                <a
                  href={`https://t.me/${config.supportTelegram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-ink-300 transition-colors hover:text-acid-400"
                >
                  Telegram support
                </a>
              </li>
              <li>
                <a href={`mailto:${config.supportEmail}`} className="text-ink-300 transition-colors hover:text-acid-400">
                  {config.supportEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/6">
          <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-ink-400 sm:flex-row">
            <p>
              © {new Date().getFullYear()} {config.siteName}. All prices in USD.
            </p>
            <div className="flex items-center gap-4">
              <span>Open source · self-hostable</span>
              <Link
                to="/admin"
                aria-label={isAdmin ? 'Admin dashboard' : 'Staff sign in'}
                className="flex items-center gap-1 text-ink-400 transition-colors hover:text-ink-200"
              >
                <Lock className="size-3" aria-hidden />
                {isAdmin ? 'Admin' : 'Staff'}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
