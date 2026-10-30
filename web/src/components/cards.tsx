import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Package } from 'lucide-react';
import type { GameSummary, GiftProduct } from '../lib/api';
import { money } from '../lib/format';
import { cn } from './ui';

function fallbackTint(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(145deg, hsl(${hash} 62% 22%), hsl(${(hash + 48) % 360} 55% 12%))`;
}

export function ImageWithFallback({
  src,
  alt,
  seed,
  className,
  icon,
}: {
  src: string;
  alt: string;
  seed: string;
  className?: string;
  icon?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        style={{ background: fallbackTint(seed) }}
        aria-hidden
      >
        {icon ? (
          <Package className="size-1/3 text-white/70" />
        ) : (
          <span className="font-display text-lg font-bold text-white/80">{seed.slice(0, 2).toUpperCase()}</span>
        )}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('object-cover', className)}
    />
  );
}

export function GameCard({ game, index = 0 }: { game: GameSummary; index?: number }) {
  return (
    <Link
      to={`/topup/${game.code}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/7 bg-ink-900 transition-all duration-300 hover:-translate-y-1 hover:border-acid-500/40 hover:shadow-[0_20px_50px_-24px_rgba(201,255,63,0.45)]"
      style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-850">
        <ImageWithFallback
          src={game.imageUrl}
          alt={game.name}
          seed={game.name}
          className="size-full transition-transform duration-500 group-hover:scale-108"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/20 to-transparent" />
        {game.featured && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-acid-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-950">
            Hot
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3.5 pt-1">
        <span className="truncate text-[13.5px] font-semibold text-ink-100 transition-colors group-hover:text-white">
          {game.name}
        </span>
        <ArrowRight
          className="size-4 shrink-0 text-ink-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-acid-400"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function ProductCard({ product, index = 0 }: { product: GiftProduct; index?: number }) {
  return (
    <Link
      to={`/gift-cards/${product.id}`}
      className="group flex items-center gap-3.5 rounded-2xl border border-white/7 bg-ink-900 p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-acid-500/35 hover:shadow-[0_16px_40px_-24px_rgba(201,255,63,0.4)]"
      style={{ animationDelay: `${Math.min(index, 16) * 20}ms` }}
    >
      <ImageWithFallback
        src={product.imageUrl}
        alt={product.title}
        seed={product.categoryTitle || product.title}
        icon
        className="size-14 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink-100 group-hover:text-white">{product.title}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-400">{product.categoryTitle || 'Digital voucher'}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-display text-[15px] font-bold text-acid-400">{money(product.priceCents)}</span>
          {product.stock === 0 ? (
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-flare-500">Out of stock</span>
          ) : (
            <span className="text-[10.5px] font-medium uppercase tracking-wide text-aqua-400">Instant</span>
          )}
        </div>
      </div>
    </Link>
  );
}
