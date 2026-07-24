// Webkamera proktoring — FaceMesh Web Worker (module type).
//
// Bu worker OG'IR TensorFlow.js + FaceMesh modelini asosiy thread'dan alohida
// ishlatadi (UI muzlab qolmasligi uchun). Asosiy thread ImageBitmap yuboradi,
// worker esa FAQAT hosila raqamlarni qaytaradi:
//     { faceCount, gazeOffset: {x, y} | null, timestamp }
// Hech qachon xom rasm/piksel MA'LUMOTI asosiy thread'ga qaytarilmaydi va
// hech qanday tarmoqqa yuborilmaydi — model chiqishi shu yerda raqamga aylanadi.
//
// tfjs runtime modeli birinchi ishga tushishda Google storage'dan yuklanadi
// (statik model fayllari) — bu student rasmi EMAS, faqat model vaznlari.

import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

let detectorPromise = null;
let busy = false;

// FaceMesh keypoint indekslari (468 nuqtali model):
//   1   — burun uchi
//   33  — chap ko'z tashqi burchagi
//   263 — o'ng ko'z tashqi burchagi
// Nigoh (head-yaw/pitch) proksi: burun uchining ikki ko'z o'rtasiga nisbatan
// siljishi, ko'zlararo masofaga normalizatsiyalangan. Bu iris talab qilmaydi
// (refineLandmarks=false) va boshning burilishini yaxshi aks ettiradi.
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.setBackend('webgl');
      await tf.ready();
      const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
      return faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: false,
        // Ikkinchi (begona) yuzni ham aniqlash uchun >1 kerak.
        maxFaces: 3,
      });
    })();
  }
  return detectorPromise;
}

function computeGazeOffset(face) {
  const kp = face && face.keypoints;
  if (!kp || kp.length <= RIGHT_EYE_OUTER) return null;
  const nose = kp[NOSE_TIP];
  const le = kp[LEFT_EYE_OUTER];
  const re = kp[RIGHT_EYE_OUTER];
  if (!nose || !le || !re) return null;
  const eyeMidX = (le.x + re.x) / 2;
  const eyeMidY = (le.y + re.y) / 2;
  const interEye = Math.hypot(re.x - le.x, re.y - le.y) || 1;
  // Ko'zlararo masofaga normalizatsiya — kameradan uzoq/yaqinlik ta'sirini
  // yo'qotadi (masshtabga bog'liq emas).
  return {
    x: (nose.x - eyeMidX) / interEye,
    y: (nose.y - eyeMidY) / interEye,
  };
}

self.onmessage = async (ev) => {
  const data = ev.data || {};
  if (data.type !== 'frame' || !data.bitmap) return;
  const bitmap = data.bitmap;
  const timestamp = data.timestamp || Date.now();

  // Backpressure: oldingi kadr hali ishlanayotgan bo'lsa yangisini tashlaymiz
  // (model kadr tezligidan sekinroq bo'lsa navbat to'lib ketmasin).
  if (busy) {
    try { bitmap.close(); } catch {}
    return;
  }
  busy = true;
  try {
    const detector = await getDetector();
    const faces = await detector.estimateFaces(bitmap, { flipHorizontal: false });
    const faceCount = Array.isArray(faces) ? faces.length : 0;
    const gazeOffset = faceCount >= 1 ? computeGazeOffset(faces[0]) : null;
    self.postMessage({ type: 'result', faceCount, gazeOffset, timestamp });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err), timestamp });
  } finally {
    try { bitmap.close(); } catch {}
    busy = false;
  }
};
