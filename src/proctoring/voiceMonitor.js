// Ovoz (mikrofon) proktoring — asosiy thread orkestratori.
//
// Vazifasi:
//   - Mikrofon stream'iga Web Audio API (`AudioContext` + `AnalyserNode`)
//     orqali ulanib, ~4 marta/sekund vaqt-domenli namunalarni o'qish.
//   - Har namunada RMS (energiya) hisoblanadi. Dastlabki bir necha soniyada
//     xona shovqin darajasi (noise floor) o'lchanadi va shundan yuqori
//     chegara belgilanadi.
//   - Chegaradan yuqori energiya (gapirish/ovoz) UZLUKSIZ saqlanib qolsa
//     (so'zlar orasidagi qisqa pauzalar "hangover" bilan yumshatiladi) —
//     bitta signal hosil bo'ladi va tegishli ogohlantirish/report chaqiriladi.
//
// MUHIM (qat'iy talab): xom audio, audio bufer yoki tanib olinadigan audio
// kontent HECH QAYERGA yuborilmaydi va saqlanmaydi. Bu modul FAQAT qurilmada
// (on-device) energiyani o'lchaydi va faqat boolean-shaklidagi hosila signalni
// yuboradi. Bu nutqni tanib olish/transkripsiya EMAS — faqat "ovoz bor edimi"
// degan qo'pol ikkilik signal (VAD/energiya aniqlash).
//
// Yuz proktoringidan (faceMonitor.js) farqli — bu yerda og'ir model/worker
// KERAK EMAS: RMS hisoblash yengil, shuning uchun asosiy thread'da bajariladi.

import { REASON_AMBIENT_SPEECH } from './voiceReasons.js';

// Debounce/kalibratsiya oynalari — faceMonitor.js nomlash konvensiyasiga mos
// (aniq, ms birligida).
const SAMPLE_INTERVAL_MS = 250;          // ~4 namuna/sekund
const CALIBRATION_MS = 4000;             // dastlabki ~4s — xona shovqin darajasi
const HANGOVER_MS = 1200;                // so'zlar orasidagi pauzalarni yumshatish
const AMBIENT_SPEECH_GRACE_MS = 6000;    // ovoz ~6s uzluksiz (hangover bilan)
const FFT_SIZE = 2048;                   // vaqt-domen namunasi kengligi
// Ovoz chegarasi = noise_floor * SPEECH_RMS_FACTOR, lekin ABS_MIN_RMS'dan kam
// emas. ABS_MIN_RMS jimjit xonada chegarani nolga tushib ketishdan saqlaydi
// (aks holda arzimas shovqin ham "ovoz" deb hisoblanardi).
const SPEECH_RMS_FACTOR = 3.5;
const ABS_MIN_RMS = 0.02;

// Ogohlantirish matni (o'zbekcha) — aniq SABAB oshkor qilinmaydi, umumiy
// eslatma (student aniqlash chegarasini bilib olmasligi uchun).
const WARN_AMBIENT_SPEECH =
  "Diqqat! Atrofingizdan gapirish yoki ovoz eshitilmoqda. Imtihon vaqtida "
  + "jim muhitda bo'ling — aks holda tekshiruvga yuborilishingiz mumkin.";

/**
 * Voice monitor'ni ishga tushiradi.
 * @param {Object} opts
 * @param {MediaStream} opts.stream - mikrofon stream'i (getUserMedia natijasi).
 * @param {(message:string)=>void} opts.onWarn - bloklamaydigan ogohlantirish.
 * @param {(reason:string)=>void} opts.onReport - cheating report (idempotent).
 * @returns {Promise<{stop:()=>void}>}
 */
export async function startVoiceMonitor({ stream, onWarn, onReport }) {
  const warn = typeof onWarn === 'function' ? onWarn : () => {};
  const report = typeof onReport === 'function' ? onReport : () => {};

  // Web Audio grafi: mikrofon manbasi → analizator. Analizator faqat o'qish
  // uchun — hech qanday chiqishga (dinamik) ulanmaydi, ovoz eshittirilmaydi.
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) throw new Error('no_audio_api');
  const audioCtx = new AudioCtx();
  // getUserMedia'dan keyin kontekst ba'zan "suspended" bo'ladi — ochib qo'yamiz.
  try { await audioCtx.resume(); } catch { /* resume xatosi — pastda kadr o'qishда qayta uriniladi */ }
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);
  const timeBuf = new Float32Array(analyser.fftSize);

  let sampleTimer = null;
  let stopped = false;

  // Signal holat mashinasi (faceMonitor.js bilan bir xil naqsh).
  //   tripStart — ovoz shartini birinchi bo'lib qanoatlantirgan vaqt (ms).
  //   count     — signal necha marta "ishga tushgan" (warn→report eskalatsiya).
  //   latched   — hozir ishga tushgan holatda (qayta-qayta hisoblamaslik uchun).
  const speech = { tripStart: 0, count: 0, latched: false };
  // "Hangover": ovoz oxirgi marta chegaradan yuqori bo'lgan vaqt. So'zlar
  // orasidagi qisqa jimjitlik tripStart'ni tiklab yubormasligi uchun.
  let lastActiveAt = 0;

  // Shovqin darajasi kalibratsiyasi — dastlabki bir necha soniyada RMS
  // o'rtachalanadi va ovoz chegarasi shundan hosil qilinadi.
  const startedAt = Date.now();
  let noiseSumRms = 0;
  let noiseCount = 0;
  let threshold = ABS_MIN_RMS;
  let calibrated = false;

  const computeRms = () => {
    // getFloatTimeDomainData ~[-1, 1] namunalar beradi. RMS — signal
    // energiyasining oddiy o'lchovi (nutqni tanimaydi, faqat balandligi).
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(timeBuf);
    } else {
      // Eski brauzerlar uchun fallback: byte-domen → normallashtirilgan.
      const byteBuf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(byteBuf);
      for (let i = 0; i < byteBuf.length; i += 1) {
        timeBuf[i] = (byteBuf[i] - 128) / 128;
      }
    }
    let sumSq = 0;
    for (let i = 0; i < timeBuf.length; i += 1) {
      const v = timeBuf[i];
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / timeBuf.length);
  };

  const sample = () => {
    if (stopped) return;
    // Kontekst suspend bo'lib qolsa (masalan tab yashiringanda) — ochamiz.
    if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch {} }
    const now = Date.now();
    const rms = computeRms();

    // --- Kalibratsiya: xona shovqin darajasini o'rtachalash ---
    if (now - startedAt < CALIBRATION_MS) {
      noiseSumRms += rms;
      noiseCount += 1;
      return;
    }
    if (!calibrated) {
      const noiseFloor = noiseCount > 0 ? noiseSumRms / noiseCount : 0;
      threshold = Math.max(ABS_MIN_RMS, noiseFloor * SPEECH_RMS_FACTOR);
      calibrated = true;
    }

    // --- Ovoz faolligi (VAD) + hangover ---
    if (rms > threshold) lastActiveAt = now;
    // Hangover: oxirgi faollikdan HANGOVER_MS o'tmaган bo'lsa "faol" deб
    // hisoblaymiz — so'zlar orasidagi qisqa pauzalar tripni uzmasin.
    const voiceActive = lastActiveAt && (now - lastActiveAt) < HANGOVER_MS;

    if (voiceActive) {
      if (!speech.tripStart) speech.tripStart = now;
      if (!speech.latched && now - speech.tripStart >= AMBIENT_SPEECH_GRACE_MS) {
        speech.latched = true;
        speech.count += 1;
        if (speech.count >= 2) report(REASON_AMBIENT_SPEECH);
        else warn(WARN_AMBIENT_SPEECH);
      }
    } else {
      speech.tripStart = 0;
      speech.latched = false;
    }
  };

  sampleTimer = setInterval(sample, SAMPLE_INTERVAL_MS);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
    try { source.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    try { audioCtx.close(); } catch {}
    try {
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {}
  };

  return { stop };
}
