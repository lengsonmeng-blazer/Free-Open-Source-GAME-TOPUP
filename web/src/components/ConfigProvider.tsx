import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type ApiConfig } from '../lib/api';
import { Spinner } from './ui';

const fallback: ApiConfig = {
  siteName: 'Ahnajak TopUp',
  tagline: 'Instant game top-ups & digital gift cards',
  supportTelegram: 'kesorcloud_support',
  supportEmail: 'support@ahnajak.tech',
  currency: 'USD',
  announcement: '',
  maintenance: false,
  paymentsOnline: false,
  demoPayments: false,
};

interface ConfigContextValue {
  config: ApiConfig;
  ready: boolean;
  setConfig: (value: ApiConfig) => void;
}

const ConfigContext = createContext<ConfigContextValue>({
  config: fallback,
  ready: false,
  setConfig: () => {},
});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ApiConfig>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .config()
      .then((res) => setConfig({ ...fallback, ...res.config }))
      .catch(() => setConfig(fallback))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    document.title = `${config.siteName} — ${config.tagline}`;
  }, [config.siteName, config.tagline]);

  return <ConfigContext.Provider value={{ config, ready, setConfig }}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  return useContext(ConfigContext);
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-ink-400">
      <Spinner className="size-7" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-flare-500/25 bg-flare-500/6 px-6 py-8 text-center">
      <p className="font-display text-lg font-semibold text-ink-100">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-300">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-xl border border-white/12 px-4 py-2 text-sm text-ink-100 transition-colors hover:border-acid-500/60 hover:text-acid-400"
        >
          Try again
        </button>
      )}
    </div>
  );
}
