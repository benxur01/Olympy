// Webkamera proktoring — asosiy thread orkestratori.
//
// Vazifasi:
//   - Kamera stream'iga bog'langan YASHIRIN <video> elementini boshqarish
//     (studentga yoki kimgadir HECH QACHON ko'rinmaydi).
//   - ~3fps chastotada kadrlarni OffscreenCanvas'ga chizib, ImageBitmap'ni
//     worker'ga transferable sifatida yuborish.
//   - Worker qaytargan {faceCount, gazeOffset} raqamlaridan uchta signalni
//     mustaqil debounce oynalari bilan hosil qilish va tegishli
//     ogohlantirish/report chaqiruvlarini bajarish.
//
// MUHIM (qat'iy talab): xom rasm/video/audio hech qayerga yuborilmaydi va
// saqlanmaydi — worker faqat raqam qaytaradi, bu modul faqat raqamni tahlil
// qiladi.

import {
  REASON_NO_FACE,
  REASON_MULTIPLE_FACES,
  REASON_GAZE_AWAY,
} from './reasons.js';

// Debounce/kalibratsiya oynalari — OlympiadTest.jsx dagi `HIDDEN_GRACE_MS`
// nomlash konvensiyasiga mos (aniq, ms birligida).
const SAMPLE_INTERVAL_MS = 350;          // ~3 kadr/sekund
const FRAME_WIDTH = 256;                 // kichraytirilgan kadr — tezroq inferens
const NO_FACE_GRACE_MS = 9000;           // yuz yo'q ~9s uzluksiz
const MULTIPLE_FACES_GRACE_MS = 4000;    // >=2 yuz ~4s uzluksiz
const GAZE_AWAY_GRACE_MS = 18000;        // nigoh chetда ~18s uzluksiz
const CALIBRATION_MS = 4000;             // dastlabki ~4s — baseline nigoh
const GAZE_OFFSET_THRESHOLD = 0.18;      // baseline'dan normalizatsiyalangan chetlanish

// Ogohlantirish matnlari (o'zbekcha) — aniq SABAB oshkor qilinmaydi, umumiy
// eslatma (student aniqlash chegarasini bilib olmasligi uchun).
const WARN_NO_FACE =
  "Diqqat! Yuzingiz kamerada ko'rinmayapti. Ekran oldida qoling — "
  + 'aks holda tekshiruvga yuborilishingiz mumkin.';
const WARN_GAZE_AWAY =
  "Diqqat! Ekrandan uzoq vaqt chetga qaramoqdasiz. Iltimos, ekranga qarab turing.";

/**
 * Face monitor'ni ishga tushiradi.
 * @param {Object} opts
 * @param {MediaStream} opts.stream - kamera stream'i (getUserMedia natijasi).
 * @param {(message:string)=>void} opts.onWarn - bloklamaydigan ogohlantirish.
 * @param {(reason:string)=>void} opts.onReport - cheating report (idempotent).
 * @returns {Promise<{stop:()=>void}>}
 */
export async function startFaceMonitor({ stream, onWarn, onReport }) {
  const warn = typeof onWarn === 'function' ? onWarn : () => {};
  const report = typeof onReport === 'function' ? onReport : () => {};

  // 1) Yashirin video — DOM'ga qo'shiladi, lekin ko'rinmaydi. `display:none`
  //    ba'zi brauzerlarda kadr dekodini to'xtatadi, shuning uchun ekrandan
  //    tashqariga 1px o'lchamda, ko'rinmas (opacity:0) qilib qo'yamiz. Bu
  //    ham "hech kimga ko'rinmaydi" talabini bajaradi.
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.autoplay = true;
  video.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;'
    + 'opacity:0;pointer-events:none;';
  video.srcObject = stream;
  document.body.appendChild(video);
  try {
    await video.play();
  } catch {
    /* autoplay siyosati — muted bo'lgani uchun odatda o'tadi; xato bo'lsa
       ham keyingi kadr chizishda qayta uriniladi */
  }

  const worker = new Worker(new URL('./faceWorker.js', import.meta.url), {
    type: 'module',
  });

  let canvas = null;
  let ctx = null;
  let sampleTimer = null;
  let stopped = false;

  // Har bir signal uchun mustaqil holat mashinasi.
  //   tripStart — signal shartini birinchi bo'lib qanoatlantirgan vaqt (ms).
  //   count     — signal necha marta "ishga tushgan" (warn→report eskalatsiya).
  //   latched   — hozir ishga tushgan holatda (qayta-qayta hisoblamaslik uchun).
  const noFace = { tripStart: 0, count: 0, latched: false };
  const multiFace = { tripStart: 0, latched: false };
  const gaze = { tripStart: 0, count: 0, latched: false };

  // Nigoh kalibratsiyasi — dastlabki bir necha soniyada, aynan bitta yuz
  // ko'ringanda baseline (ekranga qarash) nigoh vektorini o'rtachalaymiz.
  const startedAt = Date.now();
  let baseline = null;               // {x, y}
  let calibSumX = 0;
  let calibSumY = 0;
  let calibCount = 0;

  const handleResult = (faceCount, gazeOffset, now) => {
    // --- 1) Yuz yo'q ---
    if (faceCount === 0) {
      if (!noFace.tripStart) noFace.tripStart = now;
      if (!noFace.latched && now - noFace.tripStart >= NO_FACE_GRACE_MS) {
        noFace.latched = true;
        noFace.count += 1;
        if (noFace.count >= 2) report(REASON_NO_FACE);
        else warn(WARN_NO_FACE);
      }
    } else {
      noFace.tripStart = 0;
      noFace.latched = false;
    }

    // --- 2) Bir nechta yuz --- (yolg'on-ijobiy past — birinchi ishga tushishда
    //     to'g'ridan-to'g'ri report).
    if (faceCount >= 2) {
      if (!multiFace.tripStart) multiFace.tripStart = now;
      if (!multiFace.latched && now - multiFace.tripStart >= MULTIPLE_FACES_GRACE_MS) {
        multiFace.latched = true;
        report(REASON_MULTIPLE_FACES);
      }
    } else {
      multiFace.tripStart = 0;
      multiFace.latched = false;
    }

    // --- 3) Nigoh ekrandan chetda --- (baseline kalibratsiyasidan keyin).
    const calibrating = now - startedAt < CALIBRATION_MS;
    if (calibrating) {
      if (faceCount === 1 && gazeOffset) {
        calibSumX += gazeOffset.x;
        calibSumY += gazeOffset.y;
        calibCount += 1;
      }
      return;
    }
    if (baseline === null) {
      baseline = calibCount > 0
        ? { x: calibSumX / calibCount, y: calibSumY / calibCount }
        : { x: 0, y: 0 };
    }
    // Nigoh faqat aynan bitta yuz ko'ringanda baholanadi (0/ko'p yuz alohida
    // signal). gazeOffset bo'lmasa — o'tkazamiz.
    if (faceCount === 1 && gazeOffset) {
      const dev = Math.hypot(gazeOffset.x - baseline.x, gazeOffset.y - baseline.y);
      if (dev > GAZE_OFFSET_THRESHOLD) {
        if (!gaze.tripStart) gaze.tripStart = now;
        if (!gaze.latched && now - gaze.tripStart >= GAZE_AWAY_GRACE_MS) {
          gaze.latched = true;
          gaze.count += 1;
          if (gaze.count >= 2) report(REASON_GAZE_AWAY);
          else warn(WARN_GAZE_AWAY);
        }
      } else {
        gaze.tripStart = 0;
        gaze.latched = false;
      }
    }
  };

  worker.onmessage = (ev) => {
    const d = ev.data || {};
    if (d.type !== 'result') return;
    handleResult(d.faceCount || 0, d.gazeOffset || null, Date.now());
  };
  worker.onerror = () => { /* worker xatosi — imtihonni bloklamaymiz */ };

  const sample = () => {
    if (stopped) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;                 // kamera hali kadr bermadi
    if (!canvas) {
      const w = FRAME_WIDTH;
      const h = Math.max(1, Math.round((vh / vw) * w));
      // OffscreenCanvas mavjud bo'lsa undan (worker'ga transfer uchun ideal);
      // aks holda oddiy canvas + createImageBitmap fallback.
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
      }
      ctx = canvas.getContext('2d');
    }
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      if (typeof canvas.transferToImageBitmap === 'function') {
        const bitmap = canvas.transferToImageBitmap();
        worker.postMessage({ type: 'frame', bitmap, timestamp: Date.now() }, [bitmap]);
      } else if (typeof createImageBitmap === 'function') {
        createImageBitmap(canvas).then((bitmap) => {
          if (stopped) { try { bitmap.close(); } catch {} return; }
          worker.postMessage({ type: 'frame', bitmap, timestamp: Date.now() }, [bitmap]);
        }).catch(() => {});
      }
    } catch {
      /* kadr yuborilmasa — keyingi intervalда qayta uriniladi */
    }
  };

  sampleTimer = setInterval(sample, SAMPLE_INTERVAL_MS);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
    try { worker.terminate(); } catch {}
    try {
      const s = video.srcObject;
      if (s && typeof s.getTracks === 'function') {
        s.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {}
    try { video.srcObject = null; } catch {}
    try { video.remove(); } catch {}
  };

  return { stop };
}
