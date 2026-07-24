// Ovoz (mikrofon) proktoring — lazy loader (proctorLoader.js naqshi).
//
// `pages/*.jsx` manba fayllari bitta entry'ga inline birlashtiriladi va ESM
// `import` qila olmaydi (faqat globallar orqali). Shu sababli bu KICHIK modul
// entry'da statik import qilinadi va `globalThis.OlympyVoiceProctor.start()`
// funksiyasini ochadi.
//
// Asosiy VAD moduli (voiceMonitor.js) faqat `start()` birinchi marta
// chaqirilganda DINAMIK `import()` orqali yuklanadi — ya'ni faqat
// `voice_proctoring_enabled` yoqilgan olimpiadada. Ovoz nazoratisiz oddiy
// olimpiadalar uchun bu kod asosiy bundle'ga UMUMAN tushmaydi. Ovoz nazorati
// kamera nazoratidan MUSTAQIL yoqiladi (alohida bayroq va alohida rozilik).

let _modulePromise = null;

function _loadModule() {
  if (!_modulePromise) {
    _modulePromise = import('./voiceMonitor.js');
  }
  return _modulePromise;
}

globalThis.OlympyVoiceProctor = {
  /**
   * Voice monitor'ni ishga tushiradi (lazy). Argumentlar voiceMonitor.js
   * `startVoiceMonitor` bilan bir xil: { stream, onWarn, onReport }.
   * @returns {Promise<{stop:()=>void}>}
   */
  start: async (opts) => {
    const mod = await _loadModule();
    return mod.startVoiceMonitor(opts);
  },
};

export const OlympyVoiceProctor = globalThis.OlympyVoiceProctor;
