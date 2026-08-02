// KaTeX lazy loader (src/services/codemirror-loader.js naqshi).
//
// `pages/*.jsx` va `shared.jsx` manba fayllari `type="text/babel"` rejimida
// ishlaydi va ESM `import` qila olmaydi (faqat globallar orqali). Shu sababli
// bu KICHIK modul entry'da statik import qilinadi va
// `globalThis.OlympyKatex.load()` funksiyasini ochadi.
//
// OG'IR qism (katex JS + CSS + shrift jadvallari) faqat `load()` birinchi
// marta chaqirilganda DINAMIK `import()` orqali tushadi — ya'ni faqat matnida
// `$...$` / `$$...$$` matematik ifodasi BOR savol/natija ko'rsatilganda
// (shared.jsx `MathText`). Matematikasiz sahifalar uchun katex umuman
// yuklanmaydi.

let _modulePromise = null;
let _katex = null;

function _loadModule() {
  if (!_modulePromise) {
    _modulePromise = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([mod]) => {
      _katex = mod.default || mod;
      return _katex;
    });
  }
  return _modulePromise;
}

globalThis.OlympyKatex = {
  /**
   * KaTeX modulini (bir marta) yuklaydi.
   * @returns {Promise<typeof import('katex')>}
   */
  load: _loadModule,
  /**
   * Yuklab bo'lingan katex moduli yoki `null` (hali kelmagan bo'lsa).
   * Render paytida SINXRON o'qish uchun — `MathText` modul kelmaguncha
   * ifodani oddiy matn sifatida ko'rsatadi.
   */
  get: () => _katex,
};

export const OlympyKatex = globalThis.OlympyKatex;
