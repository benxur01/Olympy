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
