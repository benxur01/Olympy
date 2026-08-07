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

    // 2) XAVFSIZLIK SARLAVHALARI — asosiy HTML hujjat javobida.
    //
    //    NIMA UCHUN BU TEKSHIRUV BOR: 2026-08-06/07 holatida `render.yaml`da
    //    X-Frame-Options, X-Content-Type-Options, Referrer-Policy va CSP
    //    YOZILGAN edi, lekin `curl https://prolymp.uz/` javobida ULARDAN
    //    FAQAT `x-content-type-options` bor edi — CSP, X-Frame-Options,
    //    Referrer-Policy, HSTS va Permissions-Policy umuman yuborilmayotgan
    //    edi. Ya'ni konfiguratsiya "sozlangan" ko'rinardi, lekin hech kim
    //    HAQIQATDA yuborilayotganini tekshirmagan. Taqqoslash uchun backend
    //    (olympy-api) o'sha paytda to'liq to'plamni yuborardi, ya'ni nuqson
    //    faqat static site qatlamida edi. Shu sababli endi bu MAJBURIY smoke
    //    tekshiruvi — konfiguratsiya fayli emas, HAQIQIY javob tekshiriladi.
    if (home) {
      const h = home.headers(); // Playwright kalitlarni kichik harfda beradi.
      const isHttps = base.startsWith('https://');

      // Mavjud bo'lishi SHART bo'lgan sarlavhalar.
      for (const name of [
        'content-security-policy',
        'x-frame-options',
        'referrer-policy',
        'x-content-type-options',
        'permissions-policy',
      ]) {
        if (!h[name]) fail(`xavfsizlik sarlavhasi YO'Q: ${name} (asosiy HTML javobida)`);
        else ok(`header ${name}`);
      }

      // HSTS faqat HTTPS'da ma'noga ega — brauzerlar shifrlanmagan ulanishda
      // uni e'tiborsiz qoldiradi, shuning uchun http:// bazada talab qilmaymiz.
      if (isHttps) {
        if (!h['strict-transport-security']) fail("xavfsizlik sarlavhasi YO'Q: strict-transport-security");
        else ok('header strict-transport-security');
      }

      // Sarlavha BOR bo'lishi yetarli emas — QIYMATI ham himoya qilishi kerak
      // (masalan `default-src *` bo'lgan CSP mavjud, lekin foydasiz).
      const csp = h['content-security-policy'] || '';
      if (csp) {
        if (!/default-src\s+'self'/.test(csp)) fail(`CSP: default-src 'self' yo'q -> ${csp.slice(0, 120)}`);
        else ok("CSP default-src 'self'");
        if (!/frame-ancestors\s+'none'/.test(csp)) fail("CSP: frame-ancestors 'none' yo'q (clickjacking)");
        else ok("CSP frame-ancestors 'none'");
        // `unsafe-eval` KERAK EMAS: tfjs faqat WebGL backend ishlatadi.
        // Paydo bo'lsa — kimdir CSP'ni bo'shashtirgan, XSS zarari oshadi.
        if (/unsafe-eval/.test(csp)) fail('CSP: unsafe-eval paydo bo`ldi (kerak emas — tfjs WebGL backend)');
        else ok('CSP unsafe-eval yo`q');
      }

      const xfo = h['x-frame-options'] || '';
      if (xfo && !/^DENY$/i.test(xfo.trim())) fail(`X-Frame-Options DENY emas: ${xfo}`);

      // Permissions-Policy IKKI TOMONLAMA tekshiriladi: kamera/mikrofon `self`
      // BO'LISHI shart (aks holda kamera va ovoz proktoringi getUserMedia
      // bilan ishlamaydi), geolocation esa YOPIQ bo'lishi kerak.
      const pp = h['permissions-policy'] || '';
      if (pp) {
        for (const feature of ['camera', 'microphone']) {
          if (!new RegExp(`${feature}=\\(self\\)`).test(pp)) {
            fail(`Permissions-Policy: ${feature}=(self) yo'q — proktoring ishlamaydi -> ${pp}`);
          } else ok(`Permissions-Policy ${feature}=(self)`);
        }
        if (!/geolocation=\(\)/.test(pp)) fail(`Permissions-Policy: geolocation yopiq emas -> ${pp}`);
        else ok('Permissions-Policy geolocation=()');
      }
    }

    // 3) PROKTORING MODEL FAYLLARI — o'zimizda hosting qilinadi
    //    (public/models/ -> dist/models/). Ikkala model ham KERAK: face-mesh
    //    (keypoint) va face-detector-short (BlazeFace yuz detektori) — paket
    //    ikkinchisini ichkarida yuklaydi, faqat bittasi berilsa qolgani yana
    //    tfhub.dev'ga ketadi va CSP uni bloklaydi.
    //
    //    Privacy tekshiruvi bilan BIR XIL sabab: SPA catch-all (`/*` ->
    //    `/index.html`) tufayli fayl YO'Q bo'lsa ham HTTP 200 qaytadi —
    //    o'shanda tfjs `model.json` deb HTML o'qiydi, detektor yuklanmaydi va
    //    kamera proktoringi JIMGINA o'chadi (o'qituvchi buni sezmaydi).
    //    Shuning uchun status EMAS, MAZMUN tekshiriladi.
    for (const model of ['face-mesh', 'face-detector-short']) {
      const url = `${base}/models/${model}/model.json`;
      const res = await page.request.get(url).catch(() => null);
      if (!res || res.status() !== 200) { fail(`model ${model}: HTTP ${res?.status()} (${url})`); continue; }
      const json = await res.json().catch(() => null);
      if (!json) { fail(`model ${model}: JSON emas — SPA index.html qaytdi? (${url})`); continue; }
      if (json.format !== 'graph-model' || !Array.isArray(json.weightsManifest)) {
        fail(`model ${model}: model.json shakli noto'g'ri (format=${json.format})`);
        continue;
      }
      // Vazn (shard) fayllari ham yetib borishi kerak — model.json yolg'iz
      // holda foydasiz.
      let shardsOk = true;
      for (const group of json.weightsManifest) {
        for (const p of group.paths || []) {
          const sres = await page.request.get(`${base}/models/${model}/${p}`).catch(() => null);
          const ctype = sres?.headers()['content-type'] || '';
          if (!sres || sres.status() !== 200 || /text\/html/i.test(ctype)) {
            fail(`model ${model}: shard yetib bormadi: ${p} (HTTP ${sres?.status()}, ${ctype})`);
            shardsOk = false;
          }
        }
      }
      if (shardsOk) ok(`model ${model} (model.json + shard fayllar)`);
    }

    // 4) Privacy policy (Google Play) — UCHTA manzil ham siyosatni ko'rsatishi
    //    SHART. 2026-08-06: `/privacy` SPA catch-all tufayli landing page
    //    qaytargani uchun Google ilovani Play'dan olib tashlagan edi ("неактивная
    //    ссылка на политику конфиденциальности"). HTTP 200 yetarli emas — sahifa
    //    MAZMUNI tekshiriladi, chunki buzuq holatda ham 200 qaytgan.
    for (const path of ['/privacy.html', '/privacy', '/privacy/']) {
      const privacy = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      if (!privacy || privacy.status() >= 400) fail(`privacy ${path} HTTP ${privacy?.status()}`);
      else {
        const body = await page.content();
        // Landing page'da ham "Maxfiylik siyosati" havolasi bor, shuning uchun
        // faqat siyosat sahifasida uchraydigan bo'lim sarlavhasini tekshiramiz.
        if (!/Qanday ma’lumotlarni yig‘amiz|Information we collect/i.test(body)) {
          fail(`privacy ${path}: siyosat mazmuni yo'q (landing page qaytdi?)`);
        } else ok(`privacy ${path} ${privacy.status()}`);
      }
    }

    // 5) Hisobni o'chirish sahifasi (Google Play "Account deletion" URL uchun
    //    ALOHIDA maydon — maxfiylik siyosatidan mustaqil tekshiriladi).
    //    Privacy bilan bir xil sabab: SPA catch-all (`/*` → `/index.html`)
    //    tufayli buzuq holatda ham HTTP 200 qaytadi, shuning uchun sahifa
    //    MAZMUNI ham tekshiriladi. Faqat `.html` manzil tekshiriladi — Play
    //    Console'ga aynan shu URL kiritilgan (extension'siz `/account-deletion`
    //    uchun alias yo'q, u SPA'ga tushadi).
    {
      const path = '/account-deletion.html';
      const del = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
      if (!del || del.status() >= 400) fail(`account-deletion ${path} HTTP ${del?.status()}`);
      else {
        const body = await page.content();
        // Faqat shu sahifada uchraydigan bo'lim sarlavhalari (ikki til ham
        // HTML ichida — inglizcha blok `hidden` klass bilan turadi).
        if (!/Xavfli zona|Danger zone/i.test(body) || !/DELETE \/api\/auth\/me\//i.test(body)) {
          fail(`account-deletion ${path}: sahifa mazmuni yo'q (landing page qaytdi?)`);
        } else ok(`account-deletion ${path} ${del.status()}`);
      }
    }

    // 6) Login route + form controls
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

    // 7) Register route
    const reg = await page.goto(base + '/register', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    if (!reg || reg.status() >= 500) fail(`register HTTP ${reg?.status()}`);
    else ok(`register route ${reg.status()}`);

    // 8) Optional real login
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

    // 9) API health (public shape)
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
