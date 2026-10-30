# 🎮 Free-Open-Source-GAME-TOPUP 💎

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-3ee8d0?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Status" />
  <img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-f38020?style=for-the-badge&logo=cloudflareworkers&logoColor=white" alt="Cloudflare" />
  <img src="https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%207-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Payments-Ahnajak%20Pay%20(ABA%20KHQR)-0f5c3a?style=for-the-badge" alt="Payments" />
  <img src="https://img.shields.io/badge/Supplier-G2Bulk%20API-7c9cff?style=for-the-badge" alt="G2Bulk" />
  <img src="https://img.shields.io/badge/License-MIT-c9ff3f?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>A modern, high-converting, open-source game top-up & digital gift card e-commerce platform.</b><br />
  Engineered by <a href="https://lengsonmeng.pages.dev"><b>Leng Son Meng</b></a> with an edge-native stack on <b>Cloudflare Workers</b>, <b>D1 SQL Database</b>, <b>Hono v4</b>, <b>React 19</b>, <b>Tailwind CSS v4</b>, and <b>Ahnajak Pay (ABA PayWay / Bakong KHQR)</b>.
</p>

<p align="center">
  <a href="#-architect--ecosystem-spotlight">Architect Spotlight</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture--data-flow">Architecture</a> •
  <a href="#-quick-start-local-development">Quick Start</a> •
  <a href="#-testing--verification">Tests (35/35)</a> •
  <a href="#-production-deployment">Deploy</a>
</p>

---

## 🌟 Architect & Ecosystem Spotlight

This project is built and maintained as part of **Leng Son Meng's** production ecosystem:

- 🌐 **Interactive Portfolio**: [**lengsonmeng.pages.dev**](https://lengsonmeng.pages.dev)  
  *Explore interactive 3D WebGL experiences, live Phnom Penh infrastructure telemetry, real-time GitHub workbench integration, and engineering case studies.*
- 💳 **Payment Rail Engine — ABA Ahnajak Pay**: [**aba.ahnajak.cyou**](https://aba.ahnajak.cyou)  
  *The underlying production fintech payment gateway that powers this top-up platform. Features real-time ABA PayWay link generation, Bakong KHQR scans, 3x automated webhook reconciliation, HMAC-signed session security, and a 3D settled ledger editorial.*
- 🐙 **GitHub Profile**: [**@lengsonmeng-blazer**](https://github.com/lengsonmeng-blazer)  
  *Full-stack software engineering, game infrastructure, and fintech automation.*

---

## ✨ Key Features

### 1. 🎯 Kira-Inspired High-Converting Storefront
- **Dynamic Promo Hero Slider**: Multi-slide event banner with fast-action denomination chips (e.g., *800 Robux for $9.99*, *MLBB Weekly Pass for $1.99*, *Steam $10 for $10.60*).
- **Category Shortcut Cards**: High-contrast, tactile shortcut pills for **Game Top-Up** and **Giftcard Vault**.
- **Upcoming & Live Event Deals**: Real-time sales tags, original price strike-throughs, and 1-click purchase actions.
- **Trending Games Matrix**: High-density 6-column game grid with debounced, instant client-side search across 230+ titles.

### 2. 🎁 Gift Card Vault & Platform Categorization
- **1,216 Official Digital Vouchers**: Categorized into 11 dedicated brand platforms:
  - **Roblox, Steam, Apple / iTunes, Google Play, PlayStation (PSN), Xbox, Nintendo, Razer Gold, Amazon, Entertainment**.
- **Regional Subcategories**: Filter by region and country (US, Global, EU, TR, SEA, etc.) in one click.
- **Strict Account Security Policy**:
  - **Gift Cards**: Require customer registration/login. Voucher codes are unmasked and deposited directly into the customer's permanent account vault (`/api/auth/me`).
  - **Game Top-Up**: Fully supports instant **Guest Checkout** (Player ID + Server ID + receipt email) or logged-in account linkage.

### 3. 🛡️ Universal In-Game Player ID Verification
- Real-time pre-payment player account lookups powered by G2Bulk API:
  - **Single ID games**: PUBG Mobile, Free Fire, Roblox, 8 Ball Pool.
  - **2-ID games**: Mobile Legends: Bang Bang (User ID + Zone ID).
  - **Server Selection games**: Genshin Impact, Honkai: Star Rail (User ID + Server dropdown: America, Europe, Asia, TW/HK/MO).
  - **Character Name lookups**: Ragnarok Origin, Dragon Nest.
- Displays the verified in-game nickname before taking payment to prevent mistakes.

### 4. ⚡ Native Cambodia KHQR & ABA PayWay Checkout
- Integrated with [Ahnajak Pay](https://aba.ahnajak.cyou) to render real dynamic SVG KHQR codes compatible with **ABA Mobile**, **Bakong**, and all Cambodian banking apps.
- Instant client-side status polling, automated 1-minute cron reconciliation, and terminal failure guards.

### 5. 🔄 Dual Fulfillment Engine
- **Live G2Bulk Fulfillment**: Purchases from official suppliers in seconds after payment confirmation.
- **Demo Mode Simulator**: Test payments and end-to-end fulfillment without spending real money or requiring live API credit.

### 6. 📊 Full-Featured Admin Dashboard (`/admin`)
- Real-time gross revenue, completed orders, and delivery metrics.
- Comprehensive order ledger with manual retry, supplier error diagnostics, and refund controls.
- Dynamic catalog management: toggle game/voucher visibility, custom sort ordering, and global profit margin percentage markups.
- Customer support ticket inbox with status tracking.

---

## 🧱 Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER STOREFRONT                             │
│       React 19 SPA • Tailwind CSS v4 • Kira Store Promo Engine        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
            (1) Guest Top-Up               (2) Gift Card Purchase
                    │                                │
                    ▼                                ▼
       [Player ID Verification]             [Customer Auth Gate]
         G2Bulk API Validator             PBKDF2 WebCrypto Vault
                    │                                │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    AHNAJAK PAY GATEWAY      │
                      │  ABA PayWay & Bakong KHQR   │
                      └──────────────┬──────────────┘
                                     │
                             (Payment Settled)
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │   DUAL FULFILLMENT ENGINE   │
                      ├─────────────────────────────┤
                      │ • Live Mode: G2Bulk API     │
                      │ • Demo Mode: Simulator      │
                      └──────────────┬──────────────┘
                                     │
                    ┌────────────────┴───────────────┐
                    │                                │
                    ▼                                ▼
          [Direct Game Credit]             [Encrypted Digital Vault]
          MLBB / UC / Diamonds               Roblox / Steam Codes
```

### Technology Matrix

| Layer | Technology | Description |
|---|---|---|
| **Edge Serverless** | [Cloudflare Workers](https://workers.cloudflare.com/) + [Hono v4](https://hono.dev/) | Sub-millisecond global execution with zero cold starts |
| **Edge Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) | Serverless SQLite with automatic replication and migrations |
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite 7](https://vitejs.dev/) | Ultra-fast client SPA with single-page application routing |
| **Styling & Icons** | [Tailwind CSS v4](https://tailwindcss.com/) + Lucide | High-performance cyber glassmorphic theme |
| **Supplier Engine** | [G2Bulk](https://g2bulk.com/) Open API | 230+ Games & 1,216 Digital Gift Cards |
| **Payment Rail** | [Ahnajak Pay](https://aba.ahnajak.cyou/) | Native ABA PayWay, Bakong KHQR, and WebCrypto HMAC verification |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js** >= 20.x
- **pnpm** >= 9.x
- **Google Chrome** (for headless browser testing)

### 2. Clone and Install
```bash
git clone https://github.com/lengsonmeng-blazer/Free-Open-Source-GAME-TOPUP.git
cd Free-Open-Source-GAME-TOPUP
pnpm install
```

### 3. Setup Environment Variables
Create a local `.dev.vars` file (or copy from `.env.example`):
```bash
cp .env.example .dev.vars
```
Add your G2Bulk API key:
```env
G2BULK_API_KEY=your_g2bulk_api_key_here
```

### 4. Initialize Local D1 Database & Sync Catalog
```bash
# 1. Apply D1 SQLite schema migrations (users, orders, games, denoms, vouchers)
pnpm db:migrate:local

# 2. Sync 230+ games and 1,216 gift card denominations from G2Bulk
pnpm db:seed:catalog
```

### 5. Build and Launch
```bash
# Compile React frontend bundle
pnpm build

# Start local worker with D1 and asset serving
pnpm dev:worker
```

Visit **`http://localhost:8787`** in your browser:
- **Storefront**: `http://localhost:8787`
- **Gift Cards**: `http://localhost:8787/gift-cards`
- **Admin Control Panel**: `http://localhost:8787/admin`
  - *Default Username*: `admin`
  - *Default Password*: `admin12345`

---

## 🧪 Testing & Verification

The codebase includes two automated test suites covering **35 total assertions**:

```bash
# 1. Run strict TypeScript compiler verification (worker + web)
pnpm typecheck

# 2. Run backend API & D1 integration tests (24 assertions)
pnpm test

# 3. Run real headless Chrome end-to-end browser tests (11 assertions)
pnpm test:browser

# 4. Run full test suite
pnpm test:all
```

### Verified Test Coverage
```
  ✓ GET /api/health returns status ok and database info
  ✓ GET /api/config returns site settings and payment capabilities
  ✓ GET /api/catalog/games returns catalog with pagination
  ✓ GET /api/catalog/games/8_ball_pool returns game detail and denoms
  ✓ GET /api/catalog/products and /api/catalog/categories return vouchers & brand platforms
  ✓ POST /api/player/verify handles single-ID valid player check
  ✓ POST /api/player/verify handles invalid ID gracefully without crashing
  ✓ POST /api/player/verify handles 2-ID games (MLBB User + Zone ID)
  ✓ POST /api/player/verify handles server select games (Genshin UID + Server)
  ✓ POST /api/orders creates game top-up order with KHQR SVG
  ✓ GET /api/orders/:id and /api/orders/:id/qr
  ✓ POST /api/payment/demo-pay/:id settles payment and fulfills top-up
  ✓ POST /api/orders strictly rejects guest gift card checkout with HTTP 401
  ✓ POST /api/auth/register creates customer account and session
  ✓ POST /api/orders allows authenticated customer gift card checkout and fulfills order
  ✓ POST /api/contact submits support inquiry
  ✓ POST /api/admin/login authenticates with default credentials
  ✓ GET /api/admin/stats loads metrics and recent orders
  ✓ GET /api/admin/orders and /api/admin/orders/:id/events
  ✓ GET /api/admin/settings returns redacted credentials
  ✓ PATCH /api/admin/catalog/games/:code updates visibility and sort
  ✓ GET /api/admin/contacts and PATCH /api/admin/contacts/:id
  ✓ POST /api/admin/logout terminates session
  ✓ GET / and SPA fallback serve compiled index.html
  ✓ Browser loads Home Page with hero, live ticker and game cards
  ✓ Browser loads Topup catalog and filters games in real-time
  ✓ Browser loads Gift Cards catalog and renders voucher categories
  ✓ Browser loads Contact Support page with validation form
  ✓ Browser loads Order Tracking page
  ✓ Browser selects game denom, checks out, and simulates payment fulfillment
  ✓ Browser loads Mobile Legends page and renders User ID + Zone ID fields
  ✓ Browser loads Genshin Impact page and renders Server dropdown with options
  ✓ Browser authenticates to Admin panel and verifies dashboard tabs
  ✓ Browser enforces account registration for gift card purchases and opens AuthModal
  ✓ Verify zero unhandled runtime page errors occurred throughout browser testing
================================================================
  All 35 End-to-End Tests Passed with 0 Errors!
================================================================
```

---

## ⚙️ Production Deployment

### 1. Create Remote Cloudflare D1 Database
```bash
npx wrangler d1 create g2topup-db
```
Update `wrangler.jsonc` with your new `database_id`:
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "g2topup-db",
    "database_id": "<YOUR_D1_DATABASE_ID>"
  }
]
```

### 2. Apply Migrations & Seed Production Catalog
```bash
# Apply schema to remote Cloudflare D1
pnpm db:migrate:remote

# Seed live G2Bulk catalogue into remote D1
node scripts/sync-catalog.mjs --remote
```

### 3. Deploy to Cloudflare Workers
```bash
pnpm deploy
```

### 4. Configure Gateway Settings
Log in to your live `/admin` panel -> **Settings**:
1. **Ahnajak Pay**: Add your `Profile ID` and `Secret Key` (from [aba.ahnajak.cyou](https://aba.ahnajak.cyou)).
2. **G2Bulk API**: Add your G2Bulk `API Key`.
3. Set **Payment Demo** to off when ready to accept real money.
4. Set **Demo Fulfillment** to off when your G2Bulk balance is funded.

---

## 🔒 Security Highlights

- **HMAC-SHA256 Signed Session Cookies**: Customer and admin sessions use cryptographically secure PBKDF2 WebCrypto hashing with server-side cookie signatures (`SESSION_SECRET`).
- **Gift Card Vault Protection**: Digital voucher codes are never delivered via unauthenticated guest checkout, preventing code theft or loss.
- **SSRF & Parameter Sanitization**: All supplier API and gateway requests enforce strict URL allowlisting and parameter validation.
- **D1 Attempt Throttling**: Built-in rate limiting defends against brute-force attacks on login, registration, and player ID validation endpoints.

---

## 👤 Author & Credits

- **Creator**: [**Leng Son Meng**](https://lengsonmeng.pages.dev) ([@lengsonmeng-blazer](https://github.com/lengsonmeng-blazer))
- **Live Portfolio**: [lengsonmeng.pages.dev](https://lengsonmeng.pages.dev)
- **Payment Gateway**: [aba.ahnajak.cyou](https://aba.ahnajak.cyou)
- **Email**: `lengsonmeng8@gmail.com`

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information. Free for personal, commercial, and educational use.
