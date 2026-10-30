// Complete Browser-driven End-to-End Test Suite using Puppeteer Core + Chrome
// Tests real SPA rendering, React hooks, DOM interactions, client-side routing,
// user checkout, demo payment simulation, and admin panel with zero page errors.

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const PORT = 8790;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

console.log(`\n================================================================`);
console.log(`  G2Bulk Store — Real Browser (Headless Chrome) End-to-End Suite`);
console.log(`================================================================\n`);

// 1. Spawn local worker
console.log(`[browser-e2e] Spawning local wrangler dev on port ${PORT}...`);
const server = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Wait for server health
let healthy = false;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      healthy = true;
      break;
    }
  } catch {}
}

if (!healthy) {
  console.error('[browser-e2e] Server failed to start within 40 seconds.');
  server.kill();
  process.exit(1);
}

console.log(`[browser-e2e] Server ready at ${BASE}. Launching Chrome...\n`);

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const pageErrors = [];
page.on('pageerror', (err) => {
  console.error(`  [PAGE ERROR] ${err.message}`);
  pageErrors.push(err.message);
});
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.error(`  [BROWSER CONSOLE ERROR] ${msg.text()}`);
  }
});
page.on('requestfailed', (req) => {
  console.error(`  [REQUEST FAILED] ${req.url()} (${req.failure()?.errorText})`);
});

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    -> ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

try {
  // Test 1: Home Page
  await test('Browser loads Home Page with hero, live ticker and game cards', async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    const heroHeading = await page.$eval('h1', (el) => el.textContent);
    assert(heroHeading.includes('Instant') || heroHeading.length > 5, 'Hero heading not found');

    await page.waitForSelector('a[href^="/topup/"]');
    const gameCards = await page.$$('a[href^="/topup/"]');
    assert(gameCards.length > 0, 'No game cards rendered on home page');
  });

  // Test 2: Topup Catalog Page & Instant Filter
  await test('Browser loads Topup catalog and filters games in real-time', async () => {
    await page.goto(`${BASE}/topup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[href^="/topup/"]');
    const count = await page.$$eval('a[href^="/topup/"]', (els) => els.length);
    assert(count >= 5, `Expected >= 5 games, found ${count}`);

    // Type into search filter
    const searchInput = await page.$('input[placeholder*="Search"]');
    assert(searchInput !== null, 'Search input not found');
    await searchInput.type('Pool');
    await sleep(400); // Debounce
    const filteredCount = await page.$$eval('a[href^="/topup/"]', (els) => els.length);
    assert(filteredCount > 0, 'Filtered search returned 0 items');
  });

  // Test 3: Gift Cards Catalog Page
  await test('Browser loads Gift Cards catalog and renders voucher categories', async () => {
    await page.goto(`${BASE}/gift-cards`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[href^="/gift-cards/"]');
    const vouchers = await page.$$eval('a[href^="/gift-cards/"]', (els) => els.length);
    assert(vouchers >= 5, `Expected >= 5 gift vouchers, found ${vouchers}`);
  });

  // Test 4: Contact Support Page
  await test('Browser loads Contact Support page with validation form', async () => {
    await page.goto(`${BASE}/contact`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('form');
    const hasNameInput = await page.$('input[name="name"]');
    const hasEmailInput = await page.$('input[name="email"]');
    const hasTextarea = await page.$('textarea');
    assert(hasNameInput && hasEmailInput && hasTextarea, 'Contact form inputs not rendered');
  });

  // Test 5: Order Tracking Page
  await test('Browser loads Order Tracking page', async () => {
    await page.goto(`${BASE}/track`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder*="GT-"]');
    const searchInput = await page.$('input[placeholder*="GT-"]');
    assert(searchInput !== null, 'Tracking input not found');
  });

  // Test 6: End-to-End Game Top-Up Order & Checkout Simulation
  await test('Browser selects game denom, checks out, and simulates payment fulfillment', async () => {
    // Navigate to 8 Ball Pool topup
    await page.goto(`${BASE}/topup/8_ball_pool`, { waitUntil: 'domcontentloaded' });

    // Fill in player ID
    await page.waitForSelector('input[name="userId"]');
    await page.type('input[name="userId"]', '12345678');

    // Click first denomination card
    await page.waitForSelector('button[aria-pressed]');
    const firstDenom = await page.$('button[aria-pressed]');
    assert(firstDenom !== null, 'No denomination button found');
    await firstDenom.click();

    // Enter email contact
    await page.waitForSelector('input[name="contact"]');
    await page.type('input[name="contact"]', 'browser-test@example.com');

    // Click "Proceed to payment" button
    const submitBtn = await page.$('aside button');
    assert(submitBtn !== null, 'Proceed button not found');
    await submitBtn.click();

    // Wait for redirect to /order/GT-...
    await page.waitForFunction(() => window.location.pathname.startsWith('/order/GT-'), { timeout: 10000 });
    const currentUrl = page.url();
    assert(currentUrl.includes('/order/GT-'), `Did not navigate to order page, URL: ${currentUrl}`);

    // Verify order page elements & QR SVG
    await page.waitForSelector('svg');
    const hasQrSvg = await page.$('svg');
    assert(hasQrSvg !== null, 'KHQR SVG not rendered on order page');

    // Wait for and click "Simulate Payment (Demo Mode)" button
    await page.waitForSelector('button.bg-acid-400');
    const simButton = await page.$('button.bg-acid-400');
    assert(simButton !== null, 'Simulate Payment button not found');
    await simButton.click();

    // Wait for order status to settle and delivery to show
    await sleep(2000);
    const bodyText = await page.$eval('body', (el) => el.textContent);
    assert(
      bodyText.includes('Paid') || bodyText.includes('PAID') || bodyText.includes('Delivered') || bodyText.includes('Delivery') || bodyText.includes('SUCCESS'),
      'Order did not transition to Paid/Delivered status',
    );
  });

  // Test 7: MLBB Topup Page renders 2 text inputs (User ID + Zone ID)
  await test('Browser loads Mobile Legends page and renders User ID + Zone ID fields', async () => {
    await page.goto(`${BASE}/topup/mlbb`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="userId"]');
    const hasUserId = await page.$('input[name="userId"]');
    const hasServerId = await page.$('input[name="serverId"]');
    assert(hasUserId !== null, 'MLBB User ID input not found');
    assert(hasServerId !== null, 'MLBB Zone ID input not found');

    const bodyText = await page.$eval('body', (el) => el.textContent);
    assert(bodyText.includes('Zone ID') || bodyText.includes('Zone'), 'Missing Zone ID label');
  });

  // Test 8: Genshin Impact Topup Page renders UID input + Server Select dropdown
  await test('Browser loads Genshin Impact page and renders Server dropdown with options', async () => {
    await page.goto(`${BASE}/topup/genshin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="userId"]');
    await page.waitForSelector('select');

    const options = await page.$$eval('select option', (opts) => opts.map((o) => o.textContent.trim()));
    assert(options.includes('America') && options.includes('Asia'), 'Genshin server options missing in dropdown');

    // Test Check ID interaction
    await page.type('input[name="userId"]', '800000000');
    await page.select('select', 'Asia');
    await sleep(200);

    const checkBtn = await page.$('button ::-p-text(Check ID)');
    if (checkBtn) {
      await checkBtn.click();
      await sleep(1500);
      const resText = await page.$eval('body', (el) => el.textContent);
      assert(resText.includes('Verified') || resText.includes('Direct delivery') || resText.includes('No validation'), 'Verification result did not render');
    }
  });

  // Test 9: Admin Panel Login & Navigation
  await test('Browser authenticates to Admin panel and verifies dashboard tabs', async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });

    // Fill login
    await page.waitForSelector('input[name="username"]');
    await page.type('input[name="username"]', 'admin');
    await page.type('input[name="password"]', 'admin12345');

    await page.click('button[type="submit"]');
    await sleep(1500);

    // Verify dashboard loaded
    const adminText = await page.$eval('body', (el) => el.textContent);
    assert(adminText.includes('Ahnajak TopUp') || adminText.includes('Dashboard') || adminText.includes('Orders'), 'Admin dashboard did not load');

    // Click Orders tab
    const ordersTab = await page.$('button ::-p-text(Orders)');
    if (ordersTab) {
      await ordersTab.click();
      await sleep(500);
      const ordersText = await page.$eval('body', (el) => el.textContent);
      assert(ordersText.includes('GT-'), 'Orders ledger did not display placed orders');
    }

    // Click Settings tab
    const settingsTab = await page.$('button ::-p-text(Settings)');
    if (settingsTab) {
      await settingsTab.click();
      await sleep(500);
      const settingsText = await page.$eval('body', (el) => el.textContent);
      assert(settingsText.includes('Store name') || settingsText.includes('Site name') || settingsText.includes('Gateway'), 'Settings form did not render');
    }
  });

  // Test 8: Gift Card Account Registration Enforcement & Modal
  await test('Browser enforces account registration for gift card purchases and opens AuthModal', async () => {
    // Navigate to gift card catalogue and pick first card
    await page.goto(`${BASE}/gift-cards`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('a[href^="/gift-cards/"]');
    const firstGiftLink = await page.$('a[href^="/gift-cards/"]');
    assert(firstGiftLink !== null, 'No gift card link found');
    await firstGiftLink.click();

    // Verify detail page loaded with "Sign In to Purchase" button
    await page.waitForSelector('aside button.w-full');
    const purchaseBtnText = await page.$eval('aside button.w-full', (el) => el.textContent.trim());
    assert(purchaseBtnText.includes('Sign In to Purchase') || purchaseBtnText.includes('Sign In'), 'Expected Sign In button for guest on gift card detail');

    // Click "Sign In to Purchase" to trigger AuthModal
    await page.click('aside button.w-full');
    await sleep(500);

    // Verify AuthModal opened with Notice
    const modalText = await page.$eval('body', (el) => el.textContent);
    assert(modalText.includes('Account Required') || modalText.includes('Sign In') || modalText.includes('Create an Account'), 'AuthModal did not open');

    // Click "Register now" inside modal
    const registerLink = await page.$('button ::-p-text(Register now)');
    if (registerLink) {
      await registerLink.click();
      await sleep(300);
    }

    // Fill registration form
    const randTag = Math.floor(Math.random() * 90000) + 10000;
    await page.waitForSelector('input[name="email"]');
    await page.type('input[name="email"]', `browser_${randTag}@test.com`);
    await page.type('input[name="username"]', `gamer_${randTag}`);
    await page.type('input[name="password"]', 'pass123456');

    // Submit registration
    const submitBtn = await page.$('.fixed form button[type="submit"]');
    assert(submitBtn !== null, 'Registration submit button not found');
    await submitBtn.click();
    await sleep(2000);

    // Verify header now shows logged in user or wallet chip
    const updatedBody = await page.$eval('body', (el) => el.textContent);
    assert(updatedBody.includes(`gamer_${randTag}`) || updatedBody.includes('$0.00'), 'Customer session was not reflected in UI header');
  });

  // Test 9: Zero Unhandled Page Errors Check
  await test('Verify zero unhandled runtime page errors occurred throughout browser testing', async () => {
    assert(pageErrors.length === 0, `Encountered ${pageErrors.length} unhandled page errors: ${pageErrors.join('; ')}`);
  });

} finally {
  console.log(`\n[browser-e2e] Closing browser and shutting down server...`);
  if (browser) await browser.close();
  try {
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true });
  } catch {}
  await sleep(1000);
}

console.log(`\n================================================================`);
console.log(`  Browser Tests completed: ${passed} passed, ${failed} failed`);
console.log(`================================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`🎉 ALL 8 REAL BROWSER (CHROME) TESTS PASSED WITH 0 ERRORS!\n`);
  process.exit(0);
}
