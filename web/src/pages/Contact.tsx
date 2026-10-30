import { useState } from 'react';
import { Mail, MessageCircle, Send, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useConfig } from '../components/ConfigProvider';
import { Button, Card, Input } from '../components/ui';

export function ContactPage() {
  const { config } = useConfig();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const res = await api.contact({ name, email, orderId, message });
      setSent(res.message);
      setMessage('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="container-page py-10 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-acid-500">Support</p>
        <h1 className="font-display text-3xl font-bold text-white md:text-4xl">Talk to us</h1>
        <p className="mt-2 text-sm text-ink-400">
          Missing a delivery, wrong player ID, or a payment that did not confirm — send the order ID and we will fix it.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-[1fr_260px]">
        <Card className="p-5 md:p-6">
          {sent ? (
            <div className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="mb-3 size-9 text-acid-500" aria-hidden />
              <p className="font-display text-lg font-semibold text-white">Message sent</p>
              <p className="mt-1.5 max-w-sm text-sm text-ink-300">{sent}</p>
              <Button variant="outline" size="sm" className="mt-5" onClick={() => setSent(null)}>
                Send another
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Your name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Input
                label="Order ID (optional)"
                name="orderId"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="GT-XXXXXXXX"
                className="font-mono uppercase"
              />
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-300">How can we help?</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  required
                  minLength={10}
                  placeholder="Describe the issue. Include the player ID and what you expected to receive."
                  className="w-full resize-y rounded-xl border border-white/10 bg-ink-850 px-3.5 py-3 text-sm text-ink-100 placeholder:text-ink-400 focus:border-acid-500/60 focus:outline-none"
                />
              </label>
              {error && <p className="text-[12.5px] text-flare-500">{error}</p>}
              <Button type="submit" loading={sending} disabled={message.trim().length < 10}>
                <Send className="size-4" aria-hidden />
                Send message
              </Button>
            </form>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <MessageCircle className="mb-2.5 size-5 text-acid-400" aria-hidden />
            <p className="font-display text-[14px] font-semibold text-white">Telegram</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">Fastest route — usually answered in minutes.</p>
            <a
              href={`https://t.me/${config.supportTelegram.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-acid-400 hover:text-acid-500"
            >
              @{config.supportTelegram.replace(/^@/, '')}
            </a>
          </Card>

          <Card className="p-5">
            <Mail className="mb-2.5 size-5 text-aqua-400" aria-hidden />
            <p className="font-display text-[14px] font-semibold text-white">Email</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">For receipts, refunds and invoices.</p>
            <a href={`mailto:${config.supportEmail}`} className="mt-3 block break-all text-[13px] font-semibold text-aqua-400">
              {config.supportEmail}
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
