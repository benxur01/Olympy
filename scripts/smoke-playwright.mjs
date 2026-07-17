/**
 * Playwright smoke / light E2E against a running frontend URL.
 * Usage:
 *   FRONTEND_URL=https://prolymp.uz npm run smoke
 *   FRONTEND_URL=http://127.0.0.1:5173 npm run smoke
 *
 * Optional credentials for login smoke (does not assert dashboard data):
 *   SMOKE_PHONE=+998901234567 SMOKE_PASSWORD=secret npm run smoke
 */
import { chromium } from 'playwright';

const base = (process.env.FRONTEND_URL || 'https://prolymp.uz').replace(/\/+$/, '');
const smokePhone = (process.env.SMOKE_PHONE || '').trim();
const smokePassword = (process.env.SMOKE_PASSWORD || '').trim();

let failed = 0;
const fail = (msg) => {
  console.error('FAIL:', msg);
  failed += 1;
};
const ok = (msg) => console.log('OK', msg);

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // 1) Landing
    const home = await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!home || home.status() >= 500) fail(`home HTTP ${home?.status()}`);
    else ok(`home ${home.status()}`);

    // 2) Privacy policy (Google Play)
    const privacy = await page.goto(base + '/privacy.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!privacy || privacy.status() >= 400) fail(`privacy HTTP ${privacy?.status()}`);
    else {
      const body = await page.content();
      if (!/Maxfiylik|Privacy Policy/i.test(body)) fail('privacy content missing');
      else ok(`privacy ${privacy.status()}`);
    }

    // 3) Login route + form controls
    const login = await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
    if (!login || login.status() >= 500) fail(`login HTTP ${login?.status()}`);
    else {
      ok(`login route ${login.status()}`);
      await page.waitForTimeout(800);
      const hasPassword = await page.locator('input[type="password"]').count();
      if (hasPassword < 1) fail('login: password input missing');
      else ok('login: password field present');
      const submit = page.getByRole('button', { name: /Kirish/i });
      if ((await submit.count()) < 1) fail('login: Kirish button missing');
      else ok('login: Kirish button present');
    }

    // 4) Register route
    const reg = await page.goto(base + '/register', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    if (!reg || reg.status() >= 500) fail(`register HTTP ${reg?.status()}`);
    else ok(`register route ${reg.status()}`);

    // 5) Optional real login
    if (smokePhone && smokePassword) {
      await page.goto(base + '/login', { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(500);
      // Phone field may be custom; fill password + try phone inputs
      const phoneInputs = page.locator('input').filter({ hasNot: page.locator('[type="password"]') });
      const n = await phoneInputs.count();
      if (n > 0) {
        // last non-password often local digits; fill all text-like
        for (let i = 0; i < n; i++) {
          const el = phoneInputs.nth(i);
          const type = await el.getAttribute('type');
          if (type === 'password' || type === 'checkbox' || type === 'hidden') continue;
          try {
            await el.fill(smokePhone.replace(/^\+998/, '').replace(/\D/g, '').slice(-9) || smokePhone);
            break;
          } catch { /* next */ }
        }
      }
      await page.locator('input[type="password"]').first().fill(smokePassword);
      await page.getByRole('button', { name: /Kirish/i }).first().click();
      await page.waitForTimeout(3000);
      const url = page.url();
      if (/login/i.test(url) && !(await page.locator('text=/dashboard|Profil|Olimpiada|Xush/i').count())) {
        // Still on login — may be wrong creds or 2FA; soft fail
        const err = await page.locator('.text-red-400, [class*="red"]').first().textContent().catch(() => '');
        fail(`login with SMOKE_* did not leave login page (${err || url})`);
      } else {
        ok(`authenticated smoke (${url})`);
      }
    } else {
      ok('skip credential login (set SMOKE_PHONE + SMOKE_PASSWORD to enable)');
    }

    // 6) API health (public shape)
    const apiBase = (process.env.API_BASE_URL || process.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
    if (apiBase) {
      const res = await page.request.get(apiBase + '/api/health/');
      const json = await res.json().catch(() => ({}));
      if (res.status() !== 200) fail(`health HTTP ${res.status()}`);
      else if (!json.status) fail('health missing status');
      else if (json.db || json.redis || json.celery) {
        // Public should not leak internals without token
        fail('health leaked detailed fields publicly');
      } else ok(`health public ${json.status}`);
    }
  } catch (e) {
    fail(String(e?.message || e));
  } finally {
    await browser.close();
  }
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed');
};

main();
