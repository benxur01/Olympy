// Webkamera proktoring — lazy loader (src/services/codemirror-loader.js naqshi).
//
// `pages/*.jsx` manba fayllari bitta entry'ga inline birlashtiriladi va ESM
// `import` qila olmaydi (faqat globallar orqali). Shu sababli bu KICHIK modul
// entry'da statik import qilinadi va `globalThis.OlympyFaceProctor.start()`
// funksiyasini ochadi.
//
// OG'IR qism (TensorFlow.js + FaceMesh + worker) faqat `start()` birinchi marta
// chaqirilganда DINAMIK `import()` orqali yuklanadi — ya'ni faqat
// `camera_proctoring_enabled` yoqilgan olimpiadada. Kamera proktoringsiz oddiy
// olimpiadalar uchun ~2-4MB model va tfjs asosiy bundle'ga UMUMAN tushmaydi.

let _modulePromise = null;

function _loadModule() {
  if (!_modulePromise) {
    _modulePromise = import('./faceMonitor.js');
  }
  return _modulePromise;
}

globalThis.OlympyFaceProctor = {
  /**
   * Face monitor'ni ishga tushiradi (lazy). Argumentlar faceMonitor.js
   * `startFaceMonitor` bilan bir xil: { stream, onWarn, onReport }.
   * @returns {Promise<{stop:()=>void}>}
   */
  start: async (opts) => {
    const mod = await _loadModule();
    return mod.startFaceMonitor(opts);
  },
};

export const OlympyFaceProctor = globalThis.OlympyFaceProctor;
