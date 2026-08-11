// render.yaml dagi static site konfiguratsiyasini — xavfsizlik sarlavhalari
// (`headers:`) va redirect/rewrite qoidalari (`routes:`) — Render'dagi MAVJUD
// servisga API orqali qo'llaydi.
//
// NEGA KERAK: Render blueprint o'zgarishini allaqachon yaratilgan servisga
// avtomatik qo'llamaydi (aynan shu cheklov render.yaml'da `plan` maydoni uchun
// ham izohlangan). Natijada konfiguratsiya faylda to'g'ri ko'rinardi, lekin
// production'da HOLAT boshqacha edi:
//   • https://prolymp.uz/ javobida sarlavhalardan FAQAT x-content-type-options
//     bor edi — CSP, X-Frame-Options, Referrer-Policy, HSTS va
//     Permissions-Policy umuman yuborilmasdi;
//   • `/privacy` (slashsiz) live servisdagi `/*` catch-all'ga tushib landing
//     page qaytarardi — `/privacy/` va `/privacy.html` to'g'ri ishlagani holda.
//     Google ilovani Play'dan aynan shu sababli olib tashlagan edi.
//
// `public/_headers` yoki `public/_redirects` fayllari BU MUAMMONI YECHMAYDI:
// Render ularni konfiguratsiya sifatida o'qimaydi, oddiy statik fayl sifatida
// beradi (https://prolymp.uz/_redirects hozir ham 114 baytlik matn fayli bo'lib
// ochiladi, ya'ni repoda turgan `_redirects` prod'da hech qanday ta'sirga ega
// emas). Yagona yo'l — servis konfiguratsiyasini o'zgartirish.
//
// YAGONA MANBA: render.yaml. Bu skript hech qanday qiymatni o'zi yozmaydi,
// faqat o'sha fayldan o'qib yuboradi — ikki joy bir-biridan uzoqlashib
// ketmaydi (drift).
//
// Ishlatish:
//   RENDER_API_TOKEN=... RENDER_STATIC_SERVICE_ID=srv-... \
//     node scripts/sync-render-static-config.mjs
//   node scripts/sync-render-static-config.mjs --dry-run   # tokensiz tekshiruv
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const renderYamlPath = join(root, 'render.yaml');

const dryRun = process.argv.includes('--dry-run');
const token = (process.env.RENDER_API_TOKEN || '').trim();
const serviceId = (process.env.RENDER_STATIC_SERVICE_ID || '').trim();

const log = (msg) => console.log(`[sync-render-static-config] ${msg}`);
const die = (msg) => {
  console.error(`[sync-render-static-config] XATO: ${msg}`);
  process.exit(1);
};

// ── render.yaml o'qish ──────────────────────────────────────────────────────
// YAML kutubxonasi ATAYIN ishlatilmadi: bu skript CI'ning `deploy` job'ida
// `npm ci`siz ishlaydi (u yerda node_modules umuman yo'q va faqat shu skript
// uchun butun bog'liqlik daraxtini o'rnatish ortiqcha). Shuning uchun parser
// render.yaml'ning AYNAN shu tuzilishiga mo'ljallangan va kutilmagan narsa
// uchrasa jimgina o'tib ketmasdan xato beradi — noto'g'ri sarlavha prod'ga
// yuborilgandan ko'ra deploy yiqilgani afzal.
const lines = readFileSync(renderYamlPath, 'utf8').split('\n');

const serviceStart = lines.findIndex((line) => /^ {2}- type: static_site\s*$/.test(line));
if (serviceStart === -1) die('render.yaml ichida `- type: static_site` servisi topilmadi.');

let serviceEnd = lines.length;
for (let i = serviceStart + 1; i < lines.length; i += 1) {
  if (/^ {2}- /.test(lines[i])) {
    serviceEnd = i;
    break;
  }
}
const block = lines.slice(serviceStart, serviceEnd);

// YAML skalyari: qo'shtirnoq ichidagi qiymat ochiladi, qolgani AYNAN o'zicha
// olinadi (CSP kabi qiymatlarda `;`, `'` va `,` bor — ular o'zgarmasligi shart).
const scalar = (raw, key, field) => {
  const text = raw.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  // Tirnoqsiz qiymatdagi `#` ni YAML izoh deb kesadi, bu parser esa kesmaydi —
  // ikki xil talqin prod'ga noto'g'ri sarlavha yuborishi mumkin.
  if (/\s#/.test(text)) {
    die(`render.yaml \`${key}\` -> \`${field}\` qiymatida izoh belgisi bor — qiymatni qo'shtirnoqqa oling: ${text}`);
  }
  return text;
};

// Bitta elementda bir maydon IKKI marta yozilishi (yomon merge yoki o'chirilmay
// qolgan eski qator) — eng xavfli holat: hech qanday xato bo'lmasdan oxirgi
// qiymat g'olib chiqadi. Masalan X-Frame-Options elementida `value:` ikki marta
// bo'lsa, prod'ga DENY o'rniga jimgina SAMEORIGIN ketardi. `normalize()` buni
// tutmaydi — u faqat yetishmagan/ortiqcha MAYDONNI ko'radi, takrorini emas.
const assign = (item, field, raw, key, lineNumber) => {
  if (Object.prototype.hasOwnProperty.call(item, field)) {
    die(`render.yaml \`${key}\` ro'yxatida \`${field}\` maydoni takrorlangan (${lineNumber}-qator) — bitta elementda u faqat bir marta bo'lishi kerak.`);
  }
  item[field] = scalar(raw, key, field);
};

// `    <key>:` bo'limidan keyingi `      - ...` elementlarini o'qiydi.
const parseList = (key) => {
  const head = block.findIndex((line) => new RegExp(`^ {4}${key}:\\s*$`).test(line));
  if (head === -1) die(`render.yaml static_site blokida \`${key}:\` bo'limi topilmadi.`);

  const items = [];
  let current = null;
  for (let i = head + 1; i < block.length; i += 1) {
    const line = block[i];
    if (!line.trim() || /^\s*#/.test(line)) continue; // bo'sh qator yoki izoh

    // Xato xabarida render.yaml'ning HAQIQIY qator raqami ko'rinsin: `block`
    // faylning bir bo'lagi, shuning uchun boshlanish siljishi qo'shiladi.
    const lineNumber = serviceStart + i + 1;

    const itemStart = line.match(/^ {6}- ([A-Za-z]+): (.*)$/);
    if (itemStart) {
      current = {};
      items.push(current);
      assign(current, itemStart[1], itemStart[2], key, lineNumber);
      continue;
    }
    const itemField = line.match(/^ {8}([A-Za-z]+): (.*)$/);
    if (itemField && current) {
      assign(current, itemField[1], itemField[2], key, lineNumber);
      continue;
    }
    // Indent 4 yoki undan kichik — ro'yxat tugadi, yangi kalit boshlandi.
    if (/^ {0,4}\S/.test(line)) break;

    die(`render.yaml \`${key}\` ro'yxatida tushunarsiz qator: ${JSON.stringify(line)}`);
  }

  if (!items.length) die(`render.yaml \`${key}:\` bo'limi bo'sh.`);
  return items;
};

// Har bir element AYNAN kutilgan maydonlardan iborat bo'lishi kerak: ortiqcha
// maydon paydo bo'lsa parser qatorlarni noto'g'ri biriktirgan bo'ladi.
const normalize = (items, fields, key) =>
  items.map((item, index) => {
    for (const field of fields) {
      if (!item[field]) die(`render.yaml \`${key}\` ro'yxatidagi ${index + 1}-element to'liq emas (\`${field}\` yo'q).`);
    }
    const extra = Object.keys(item).filter((name) => !fields.includes(name));
    if (extra.length) die(`render.yaml \`${key}\` ro'yxatidagi ${index + 1}-elementda kutilmagan maydon: ${extra.join(', ')}`);
    return Object.fromEntries(fields.map((field) => [field, item[field]]));
  });

const headers = normalize(parseList('headers'), ['path', 'name', 'value'], 'headers');
const routes = normalize(parseList('routes'), ['type', 'source', 'destination'], 'routes');

for (const [index, route] of routes.entries()) {
  if (route.type !== 'redirect' && route.type !== 'rewrite') {
    die(`render.yaml \`routes\` ${index + 1}-elementida noto'g'ri \`type\`: ${route.type} (redirect yoki rewrite)`);
  }
}

// Render prioritetni RO'YXAT TARTIBI bo'yicha beradi (birinchisi eng kuchli).
// SPA catch-all oxirida turmasa `/privacy` yana landing page qaytaradi — aynan
// shu xato tuzatilyapti, shuning uchun tartib tekshirib qo'yiladi.
const catchAll = routes.findIndex((route) => route.source === '/*');
if (catchAll !== -1 && catchAll !== routes.length - 1) {
  die(`render.yaml \`routes\`: SPA catch-all (\`/*\`) ${catchAll + 1}-o'rinda turibdi, u ENG OXIRIDA bo'lishi kerak — aks holda undan keyingi qoidalar (masalan /privacy) hech qachon ishlamaydi.`);
}

log(`render.yaml o'qildi: ${headers.length} ta sarlavha, ${routes.length} ta route.`);
for (const route of routes) log(`  route: ${route.type} ${route.source} -> ${route.destination}`);
for (const name of [...new Set(headers.map((h) => h.name))]) log(`  header: ${name}`);

if (dryRun) {
  log('--dry-run: API chaqirilmadi. Yuboriladigan JSON:');
  console.log(JSON.stringify({ headers, routes }, null, 2));
  process.exit(0);
}

if (!token) die("RENDER_API_TOKEN yo'q. GitHub: Settings -> Secrets -> Actions.");
if (!serviceId) die("RENDER_STATIC_SERVICE_ID yo'q (Render static site servis ID'si, `srv-...`).");

// Ikkala endpoint ham "replace all" semantikasiga ega: so'rovga kirmagan eski
// qoidalar O'CHIRILADI. Shuning uchun har safar TO'LIQ ro'yxat yuboriladi —
// qisman yangilash mumkin emas.
//
// Qayta urinish shu workflow'ning normasi: backend deploy trigger ham, smoke
// test ham 5 martadan urinadi. Bu qadam esa polling siklidagi o'nlab
// so'rovdan KEYIN turadi, ya'ni 429 (rate limit) ehtimoli real — bitta
// urinishda yiqilsa `deploy` job tushadi va `smoke` (needs: deploy) umuman
// ishlamay qoladi.
//
// FAQAT vaqtinchalik xatolar qayta urinilsin: 429, 5xx va tarmoq uzilishi.
// Boshqa 4xx (401 — noto'g'ri token, 404 — noto'g'ri servis ID, 400 — buzuq
// body) qayta urinishdan tuzalmaydi; takrorlash faqat xatoni yashiradi va
// job'ni bekorga cho'zadi.
const MAX_ATTEMPTS = 5;
const applied = [];

const put = async (resource, payload) => {
  const url = `https://api.render.com/v1/services/${serviceId}/${resource}`;
  // Render'da atomik ko'p-resurs yangilash yo'q: birinchi PUT o'tib ikkinchisi
  // yiqilsa servis aralash holatda qoladi. Buni to'liq oldini olib bo'lmaydi,
  // lekin xato xabarida aniq ko'rinsa qo'lda tiklash osonlashadi.
  const mixed = applied.length
    ? `\nDIQQAT: bu chaqiruvgacha ${applied.join(' + ')} MUVAFFAQIYATLI qo'llangan — servis aralash holatda (yangi ${applied.join('+')}, eski ${resource}). Qadamni qayta ishga tushiring.`
    : '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let reason = '';
    let retryAfter = 0;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      // Tarmoq uzilishi — vaqtinchalik, qayta urinamiz.
      reason = `so'rov yuborilmadi — ${err?.message || err}`;
      return null;
    });

    if (res) {
      const body = await res.text().catch(() => '');
      if (res.ok) {
        applied.push(resource);
        log(`${resource}: qo'llandi (HTTP ${res.status}${attempt > 1 ? `, ${attempt}-urinishda` : ''}).`);
        return;
      }
      if (res.status !== 429 && res.status < 500) {
        die(`Render API ${resource}: HTTP ${res.status} ${res.statusText} — qayta urinilmaydi (konfiguratsiya xatosi).\n${body.slice(0, 500)}${mixed}`);
      }
      reason = `HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`;
      retryAfter = Number.parseInt(res.headers.get('retry-after') || '', 10) || 0;
    }

    if (attempt === MAX_ATTEMPTS) {
      die(`Render API ${resource}: ${MAX_ATTEMPTS} urinishdan keyin ham muvaffaqiyatsiz — ${reason}${mixed}`);
    }

    // Eksponensial backoff: 5s, 10s, 20s, 40s. 429 bo'lsa serverning
    // `Retry-After` ko'rsatmasi ustun turadi (60s bilan cheklangan).
    const waitSeconds = Math.min(retryAfter || (5 * 2 ** (attempt - 1)), 60);
    log(`${resource}: ${attempt}/${MAX_ATTEMPTS} urinish muvaffaqiyatsiz (${reason}). ${waitSeconds}s kutib qayta urinilmoqda...`);
    await new Promise((resolve) => { setTimeout(resolve, waitSeconds * 1000); });
  }
};

await put('headers', headers);
await put('routes', routes);
log('Tayyor — live servis konfiguratsiyasi render.yaml bilan mos.');
