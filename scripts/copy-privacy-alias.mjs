// Maxfiylik siyosatini `/privacy` manzilida ham HAQIQIY fayl sifatida chiqaradi.
//
// NEGA KERAK: Google Play Console'ga `https://prolymp.uz/privacy` kiritilgan edi,
// lekin Render'da faqat SPA catch-all (`/*` → `/index.html`) qoidasi amalda
// bo'lgani uchun bu URL maxfiylik siyosati emas, landing page qaytardi — Google
// tekshiruvda "maxfiylik siyosati havolasi ishlamayapti" deb ilovani rad etdi.
//
// render.yaml'dagi `/privacy` → `/privacy.html` rewrite to'g'ri yozilgan, lekin
// blueprint route'lari mavjud servisga avtomatik qo'llanmagan (xuddi `plan`
// maydoni bilan bo'lgani kabi — render.yaml'dagi izohga qarang). Dashboard
// sozlamasiga bog'liq bo'lib qolmaslik uchun bu skript dist'ga fizik fayl
// qo'yadi: haqiqiy fayllar rewrite qoidasidan USTUN turadi (shu sababli
// `/privacy.html` allaqachon ishlaydi).
//
// Natijada `/privacy`, `/privacy/` va `/privacy.html` — uchtasi ham bir xil
// siyosatni ko'rsatadi, hosting sozlamasi qanday bo'lishidan qat'i nazar.
// Contabo/nginx uchun bu qo'shimcha himoya (nginx.conf'da rewrite bor), lekin
// zarar qilmaydi.
//
// YAGONA MANBA: public/privacy.html. Bu skript hech narsani tahrirlamaydi,
// faqat nusxalaydi — ikki fayl bir-biridan uzoqlashib ketmaydi (drift).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist', 'privacy.html');
const targetDir = join(root, 'dist', 'privacy');
const target = join(targetDir, 'index.html');

if (!existsSync(source)) {
  // Build bajarilmagan yoki public/privacy.html o'chirib yuborilgan — build'ni
  // yiqitmaymiz, lekin ovozsiz o'tib ketish xavfli (Play yana rad etadi).
  console.error(
    '[copy-privacy-alias] XATO: dist/privacy.html topilmadi. ' +
    'public/privacy.html mavjudligini tekshiring — /privacy URL buzuq qoladi.'
  );
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log('[copy-privacy-alias] dist/privacy/index.html yaratildi (/privacy uchun).');
