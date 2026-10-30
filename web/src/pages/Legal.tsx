import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Home as HomeIcon } from 'lucide-react';
import { Button } from '../components/ui';
import { useConfig } from '../components/ConfigProvider';

function LegalShell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const { config } = useConfig();
  return (
    <div className="container-page max-w-3xl py-10 md:py-16">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-400 transition-colors hover:text-acid-400"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to shop
      </Link>
      <h1 className="font-display text-3xl font-bold text-white md:text-4xl">{title}</h1>
      <p className="mt-2 text-[13px] text-ink-400">
        Last updated {updated} · {config.siteName}
      </p>
      <div className="mt-8 space-y-6 text-[13.5px] leading-relaxed text-ink-300 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-1.5 [&_strong]:text-ink-100 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <div className="mt-12 rounded-2xl border border-white/8 bg-ink-900 px-5 py-4 text-[12.5px] text-ink-400">
        Questions about this policy? Email{' '}
        <a href={`mailto:${config.supportEmail}`} className="text-ink-200 underline decoration-white/20 hover:text-acid-400">
          {config.supportEmail}
        </a>{' '}
        or message{' '}
        <a
          href={`https://t.me/${config.supportTelegram.replace(/^@/, '')}`}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink-200 underline decoration-white/20 hover:text-acid-400"
        >
          @{config.supportTelegram.replace(/^@/, '')}
        </a>
        .
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="30 October 2026">
      <p>
        These terms govern every purchase made on this store. By placing an order you confirm that you have read them and
        that the account details you enter are correct.
      </p>

      <h2>1. What we sell</h2>
      <p>
        We resell digital game top-ups and gift card / voucher codes purchased from wholesale suppliers. We are not the
        publisher of any game and we are not affiliated with the brands shown. All trademarks belong to their owners.
      </p>

      <h2>2. Player ID accuracy is the buyer&apos;s responsibility</h2>
      <ul>
        <li>You must enter the correct player ID, server / zone and character name for the game you are topping up.</li>
        <li>We show an in-game nickname check before payment where the supplier supports it — use it.</li>
        <li>
          A top-up delivered to the ID you submitted is complete and final, even if that account was not yours. We cannot
          reverse a top-up once the supplier has processed it.
        </li>
      </ul>

      <h2>3. Delivery</h2>
      <ul>
        <li>Game top-ups are dispatched automatically after payment clears, usually within 60 seconds.</li>
        <li>Gift card codes are shown on the order page the moment the supplier releases them.</li>
        <li>
          If the supplier is temporarily out of stock or an order needs manual review, we retry automatically and our team
          follows up. You can always message support with the order ID.
        </li>
        <li>Keep your order link — it is the only place your voucher code and delivery status live.</li>
      </ul>

      <h2>4. Payments</h2>
      <ul>
        <li>All prices are in US dollars. The KHQR amount is settled through ABA PayWay via our payment gateway.</li>
        <li>An order is only paid once the gateway confirms the transaction. A scanned QR is not a confirmed payment.</li>
        <li>Payment windows expire; an expired order must be recreated to get a fresh QR.</li>
      </ul>

      <h2>5. Refunds</h2>
      <ul>
        <li>
          <strong>Digital goods are non-refundable once delivered.</strong> Voucher codes cannot be returned after they
          are revealed.
        </li>
        <li>If the supplier fails the order, the order is marked failed and we refund you in full.</li>
        <li>
          If you paid but the order never delivered, contact support with the order ID and the payment reference. Confirmed
          payments that were never delivered are refunded.
        </li>
      </ul>

      <h2>6. Fraud and abuse</h2>
      <p>
        Orders placed with stolen payment instruments are cancelled, and the account details are reported. We may refuse or
        cancel any order that looks fraudulent.
      </p>

      <h2>7. Availability</h2>
      <p>
        The store is provided as-is. Supplier catalogues, prices and stock change without notice. We may pause the store
        for maintenance.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="30 October 2026">
      <p>
        We keep the smallest amount of data needed to deliver your order and support you afterwards. We do not sell data
        and we do not run advertising trackers.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Order record</strong> — item, amount, the player ID / server you entered, and the supplier order reference.</li>
        <li><strong>Contact</strong> — the email address or Telegram handle you give us for the receipt.</li>
        <li><strong>Payment reference</strong> — the gateway transaction id and its status (never your card or bank credentials).</li>
        <li><strong>Delivery codes</strong> — stored so you can retrieve a voucher after closing the page.</li>
        <li><strong>Support messages</strong> — what you send through the contact form or Telegram.</li>
      </ul>

      <h2>What we never store</h2>
      <ul>
        <li>Bank account numbers, card numbers, PINs or one-time codes.</li>
        <li>Passwords for game accounts — we only ever need the public player ID.</li>
      </ul>

      <h2>Who sees it</h2>
      <ul>
        <li>Our staff, when an order needs manual handling or you ask for support.</li>
        <li>The wholesale supplier, only the minimum needed to deliver your order (player ID, package, or a voucher code being issued).</li>
        <li>The payment gateway, for the amount and reference of the transaction.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        Visitors get no tracking cookies. A single signed cookie is set on the staff dashboard when an administrator
        signs in, and it is removed when they sign out.
      </p>

      <h2>Retention</h2>
      <p>
        Order records are kept for accounting and support. Voucher delivery is available for as long as the order exists;
        the supplier itself keeps issued codes for 30 days. You can ask us to delete your contact details at any time
        without affecting the order record.
      </p>

      <h2>Security</h2>
      <p>
        Traffic is served over HTTPS. Order data lives in Cloudflare D1 and every payment is verified server-side against
        the gateway before delivery is triggered.
      </p>
    </LegalShell>
  );
}

export function NotFoundPage() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-7xl font-black text-white/8">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-white">This page does not exist</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        The link may be old, or the item was removed from the catalogue.
      </p>
      <Link to="/" className="mt-6">
        <Button>
          <HomeIcon className="size-4" aria-hidden />
          Back to the shop
        </Button>
      </Link>
    </div>
  );
}
