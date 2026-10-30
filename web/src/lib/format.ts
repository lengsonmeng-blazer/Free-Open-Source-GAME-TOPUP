export function money(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

export function moneyFromUsd(usd: number): string {
  return `$${Number(usd).toFixed(2)}`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Awaiting payment';
    case 'PAID':
      return 'Paid';
    case 'EXPIRED':
      return 'Expired';
    case 'FAILED':
      return 'Failed';
    case 'PROCESSING':
      return 'Processing';
    case 'SUCCESS':
      return 'Delivered';
    case 'MANUAL':
      return 'Needs review';
    default:
      return status;
  }
}

export function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
