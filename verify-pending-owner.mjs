import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// Mapped user (as mapBackendUser would produce)
const MAPPED_USER = {
  id: 'api:1', backendId: 1,
  name: 'Test Owner', username: 'testowner',
  roles: { owner: { status: 'pending', centerId: '22', centerName: 'Test Markaz' } },
  activeRole: 'owner',
  onboardingCenterCompleted: false,
  onboardingCompleted: true,
  isActive: true, isPremium: false,
  streakCount: 0, coins: 0,
  _api: true
};

// Raw backend user (as API returns)
const RAW_USER = {
  id: 1, full_name: 'Test Owner', username: 'testowner',
  roles: ['owner'],
  roles_detail: {
    owner: { status: 'pending', center_id: 22, center_name: 'Test Markaz' }
  },
  is_active: true, onboarding_center_completed: false,
  is_premium_active: false, streak_count: 0
};

await context.route('http://localhost:8000/**', async route => {
  const url = route.request().url();
  const method = route.request().method();

  if (url.includes('/api/me/center-onboarding') && method === 'PATCH') {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ onboarding_center_completed: true }) });
  }
  if (url.includes('/branding') && method === 'PATCH') {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ brand_color: '#ff6600', custom_domain: '' }) });
  }
  if (url.includes('/api/centers/') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: 22, name: 'Test Markaz', status: 'pending',
        organization_type: "O'quv markaz", city: 'Toshkent',
        brand_color: '#6366f1', custom_domain: ''
      }]) });
  }
  if (/\/api\/me\/?$/.test(url) && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(RAW_USER) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const page = await context.newPage();
page.on('pageerror', err => console.error(`PAGE_ERR: ${err.message}`));

// Set mapped user in sessionStorage
await page.addInitScript((user) => {
  sessionStorage.setItem('currentUser', JSON.stringify(user));
}, MAPPED_USER);

await page.goto('http://127.0.0.1:5175/dashboard/owner');
await page.waitForTimeout(3500);

await page.screenshot({ path: '/tmp/v3-pending-owner.png', fullPage: true });

const bodyText = await page.evaluate(() => document.body.innerText);
const hasOnboarding = bodyText.includes('nimalar qila olasiz') || bodyText.includes('Olimpiada yarating') || bodyText.includes('Markazingizni sozlang');
const hasBranding  = bodyText.includes('Brendingni sozlang');
const hasPending   = bodyText.includes('kutilmoqda') || bodyText.includes('Tasdig') || bodyText.includes('Tasdiqlash');

console.log(JSON.stringify({ hasOnboarding, hasBranding, hasPending }));
console.log('SNIPPET:', bodyText.slice(0, 500));

// Try clicking "Tushunarli"
const btn = await page.$('button:has-text("Tushunarli")');
if (btn) {
  await btn.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v3-after-onboarding.png' });
  console.log('CLICKED: Tushunarli');
} else { console.log('NO Tushunarli button'); }

// Try branding save
const colorInput = await page.$('input[type="color"]');
if (colorInput) {
  await colorInput.evaluate(el => { el.value = '#e74c3c'; el.dispatchEvent(new Event('input', {bubbles:true})); });
  await page.waitForTimeout(300);
  const saveBtn = await page.$('button:has-text("Saqlash")');
  if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: '/tmp/v3-branding.png' });
  console.log('BRANDING: color input found' + (saveBtn ? ' + saved' : ''));
} else { console.log('NO color input'); }

await browser.close();
