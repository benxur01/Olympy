import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor sozlamasi — Olympy frontend'ini Android (va kelajakda iOS) ilova
// ichiga o'rash uchun. Web build `dist/` ga chiqadi (vite.config.js: outDir).
//
// MUHIM: vite.config.js da `base: './'` o'rnatilgan. Capacitor ilovani
// `file://` (yoki `https://localhost`) sxemasi orqali yuklaydi, shuning uchun
// `/assets/...` kabi absolyut yo'llar topilmaydi — nisbiy (`./assets/...`)
// yo'llar kerak. `base: './'` shuni ta'minlaydi va Render web-deploy uchun ham
// muammosiz (index.html root'dan serve qilinadi).
const config: CapacitorConfig = {
  appId: 'uz.olympy.app',
  appName: 'Olympy',
  webDir: 'dist',
  server: {
    // Android emulatorda HTTPS sxemasi — zamonaviy web API'lar (clipboard,
    // service worker registratsiyasi va h.k.) "secure context" talab qiladi.
    androidScheme: 'https',
    // Live reload (dev): emulator host mashinadagi Vite serveriga ulanadi.
    // `npm run cap:dev` (`cap run android --livereload --external`) ishga
    // tushganda Capacitor CLI bu URL'ni avtomatik LAN IP bilan TO'LDIRADI,
    // shuning uchun bu yerda statik yozish SHART EMAS. Faqat qo'lda override
    // qilmoqchi bo'lsangiz CAP_SERVER_URL env bilan bering, masalan:
    //   CAP_SERVER_URL=http://192.168.1.10:5173 npm run cap:sync
    // E'tibor bering: oddiy production sync uchun bu o'rnatilmagan bo'lishi
    // kerak — aks holda ilova lokal serverга bog'lanib qoladi.
    ...(process.env.CAP_SERVER_URL
      ? { url: process.env.CAP_SERVER_URL, cleartext: true }
      : {}),
  },
};

export default config;
