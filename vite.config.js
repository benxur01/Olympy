import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      ignored: ['**/backend/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 4KB dan kichik rasm/asset'lar base64 inline bo'ladi — qo'shimcha HTTP
    // so'rovlarsiz yuklanadi. Kattaroqlari odatdagidek alohida fayl bo'ladi.
    assetsInlineLimit: 4096,
    // Keng brauzer qamrovi: es2015 target eski mobil brauzerlarni
    // (Telegram WebView ichidagi qadimiy WebView'lar) ham qo'llab-quvvatlaydi.
    target: 'es2015',
    // Minifikatsiya: esbuild o'rniga terser. esbuild tez, lekin terser
    // kuchliroq siqadi (o'lik kod, ifoda soddalashtirish, takror nomlar).
    // Bizning asosiy bundle ulkan (yagona global-scope ilova kodi), shuning
    // uchun terser'ning qo'shimcha siqishi sezilarli foyda beradi.
    minify: 'terser',
    terserOptions: {
      compress: {
        // Productionda debug chiqishini olib tashlaymiz. Loyihada faqat
        // console.warn ishlatilgan (debug ogohlantirishlari, foydalanuvchiga
        // ko'rinmaydi) — ularni pure_funcs orqali o'lik kod sifatida
        // tozalaymiz. console.error ataylab QOLDIRILADI (haqiqiy xatolarni
        // log qilish uchun), shu sababli drop_console: true ishlatilmadi.
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
      },
    },
    // CSS'ni ham siqamiz.
    cssMinify: true,
    // Har bir lazy chunk uchun CSS'ni alohida fayllarga ajratamiz — faqat
    // kerakli sahifa CSS'i yuklanadi. (Vite default'i ham true, aniqlik
    // uchun ochiq yozildi.)
    cssCodeSplit: true,
    // Asosiy bundle hajmini kamaytirish uchun katta `node_modules`
    // kutubxonalarni alohida chunklarga ajratamiz. Bu chunklar kamdan-kam
    // o'zgaradi, shuning uchun brauzer ularni uzoq muddat keshlaydi va
    // ilova kodi o'zgarganda qayta yuklab o'tirmaydi.
    //
    // Eslatma: sahifalar (pages/*.jsx) `scripts/generate-vite-entry.mjs`
    // tomonidan bitta `src/olympy-entry.jsx` faylga inline birlashtiriladi
    // va o'zaro global `var` (moduleScope) orqali bog'langan, ES `import`
    // ishlatmaydi + aylanma bog'liqliklari bor. Shu sababli har bir page'ni
    // alohida chunkka ajratib bo'lmaydi (ular bitta modulning bir qismi,
    // mustaqil modul emas). Buning o'rniga vendor (node_modules)
    // kutubxonalarini alohida chunklarga ajratamiz — bu asosiy app
    // bundle'ini yengillashtiradi va vendor kodi kamdan-kam o'zgargani
    // uchun brauzer keshini yaxshilaydi. CodeMirror esa allaqachon
    // src/services/codemirror-loader.js orqali dinamik import bilan
    // lazy yuklanadi — kod savollari ochilgandagina tushadi.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // React yadrosi — eng barqaror, alohida uzoq-keshlanadigan chunk.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          // CodeMirror — faqat kod savollarida kerak, dinamik import orqali
          // lazy tushadi; o'z chunkida qolib boshqa vendor bilan aralashmasin.
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@lezer')) {
            return 'vendor-codemirror';
          }
          // Sentry — yiriq monitoring kutubxonasi.
          if (id.includes('node_modules/@sentry')) {
            return 'vendor-sentry';
          }
          if (id.includes('node_modules/dompurify')) {
            return 'vendor-dompurify';
          }
          // Qolgan barcha uchinchi-tomon kutubxonalar.
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
