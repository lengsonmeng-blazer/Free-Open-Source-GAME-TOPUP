import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-acid-500 text-ink-950 hover:bg-acid-400 active:bg-acid-600 shadow-[0_10px_30px_-12px_rgba(201,255,63,0.6)] font-semibold',
  secondary: 'bg-ink-700 text-ink-100 hover:bg-ink-600 border border-white/8',
  ghost: 'bg-transparent text-ink-200 hover:bg-white/6 hover:text-white',
  danger: 'bg-flare-500 text-white hover:bg-flare-600 font-semibold',
  outline: 'border border-white/12 text-ink-100 hover:border-acid-500/60 hover:text-acid-400 bg-transparent',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-lg gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 text-[15px] rounded-xl gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, full, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        buttonVariants[variant],
        buttonSizes[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/7 bg-ink-900/70 backdrop-blur-sm',
        'shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(
  function Input({ label, hint, className, id, ...rest }, ref) {
    const inputId = id || rest.name;
    return (
      <label className="block" htmlFor={inputId}>
        {label && <span className="mb-1.5 block text-[13px] font-medium text-ink-300">{label}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-11 w-full rounded-xl border border-white/10 bg-ink-850 px-3.5 text-sm text-ink-100',
            'placeholder:text-ink-400 transition-colors',
            'focus:border-acid-500/60 focus:bg-ink-800 focus:outline-none',
            className,
          )}
          {...rest}
        />
        {hint && <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>}
      </label>
    );
  },
);

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-white/6 text-ink-300 border-white/8',
    success: 'bg-acid-500/12 text-acid-400 border-acid-500/25',
    warning: 'bg-amber-400/12 text-amber-300 border-amber-400/25',
    danger: 'bg-flare-500/12 text-flare-500 border-flare-500/25',
    info: 'bg-aqua-400/12 text-aqua-400 border-aqua-400/25',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-5 animate-spin rounded-full border-2 border-ink-600 border-t-acid-500', className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg', className)} aria-hidden />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-ink-100">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-400">{description}</p>}
      {action}
    </div>
  );
}

export function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <span className={cn('text-sm text-ink-100', mono && 'font-mono text-[13px]')}>{value}</span>
    </div>
  );
}
