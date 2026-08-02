// Recharts lazy loader (src/services/codemirror-loader.js naqshi).
//
// `pages/*.jsx` manba fayllari `type="text/babel"` rejimida ishlaydi va ESM
// `import` qila olmaydi (faqat globallar — React, OlympyApi, DOMPurify orqali).
// Shu sababli bu KICHIK modul entry'da statik import qilinadi va
// `globalThis.OlympyRecharts.load()` funksiyasini ochadi.
//
// OG'IR qism (recharts + d3/redux bog'liqliklari) faqat `load()` birinchi
// marta chaqirilganda DINAMIK `import()` orqali tushadi — ya'ni faqat admin
// "Tahlil" bo'limini ochganda. Qolgan barcha sahifalar diagrammalarni qo'lda
// yozilgan komponentlar bilan chizadi (shared.jsx `BarChart`/`MonthBarChart`,
// AdminDashboard.jsx `AdminBarChart`), shuning uchun ular uchun recharts
// umuman yuklanmaydi.

let _modulePromise = null;

function _loadModule() {
  if (!_modulePromise) {
    _modulePromise = import('recharts');
  }
  return _modulePromise;
}

globalThis.OlympyRecharts = {
  /**
   * Recharts modulini (lazy) yuklaydi. Takroriy chaqiruvlar bitta va o'sha
   * promise'ni qaytaradi — import qayta ishga tushmaydi.
   * @returns {Promise<typeof import('recharts')>}
   */
  load: _loadModule,
};

export const OlympyRecharts = globalThis.OlympyRecharts;
