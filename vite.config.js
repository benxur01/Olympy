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
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
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
    // Eslatma: sahifalar (pages/*.jsx) `type="text/babel"` rejimida yozilgan
    // va o'zaro global `var` (moduleScope) orqali bog'langan, ES `import`
    // ishlatmaydi + aylanma bog'liqliklari bor. Shu sababli ularni
    // route-based `React.lazy()` bilan ajratib bo'lmaydi (alohida modul
    // scope'da globallar ko'rinmay qoladi). CodeMirror esa allaqachon
    // src/services/codemirror-loader.js orqali dinamik import bilan
    // lazy yuklanadi — kod savollari ochilgandagina tushadi.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-dompurify': ['dompurify'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
