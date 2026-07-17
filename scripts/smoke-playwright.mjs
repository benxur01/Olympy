/**
 * Minimal Playwright smoke against a running frontend URL.
 * Usage:
 *   FRONTEND_URL=https://prolymp.uz npm run smoke
 *   FRONTEND_URL=http://127.0.0.1:5173 npm run smoke
 *
 * Does not require login credentials — checks public pages and privacy policy.
 */
import { chromium } from 'playwright';

const base = (process.env.FRONTEND_URL || 'https://prolymp.uz').replace(/\/+$/, '');

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const home = await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!home || !home.ok()) fail(`home HTTP ${home?.status()}`);
    else console.log('OK home', home.status());

    const privacy = await page.goto(base + '/privacy.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!privacy || privacy.status() >= 400) fail(`privacy HTTP ${privacy?.status()}`);
    else {
      const title = await page.title();
      if (!/Maxfiylik|Privacy/i.test(title) && !/Maxfiylik|Privacy/i.test(await page.content())) {
        fail('privacy page content missing expected title');
      } else console.log('OK privacy', privacy.status());
    }

    const login = await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!login || login.status() >= 500) fail(`login HTTP ${login?.status()}`);
    else console.log('OK login route', login.status());
  } catch (e) {
    fail(String(e?.message || e));
  } finally {
    await browser.close();
  }
};

main();
