// Ovoz (mikrofon) proktoring cheating-sabab satrlari — YAGONA MANBA.
//
// Ishlab chiqaruvchi (src/proctoring/voiceMonitor.js) va ko'rsatuvchi
// (pages/ManagerDashboard.jsx `CHEATING_REASON_LABELS`) bir xil satrlardan
// foydalanadi, shu sababli ular hech qachon bir-biridan uzoqlashmaydi (drift).
//
// Webkamera signallari (src/proctoring/reasons.js) bilan bir xil konvensiya —
// alohida fayl, chunki ovoz nazorati kameradan MUSTAQIL yoqiladi.
//
// Backend `TestSession.cheating_reason` — free-text `CharField(max_length=120)`
// (choices enum EMAS), shuning uchun bu satr migratsiyasiz oddiy string
// sifatida saqlanadi — mavjud `tab_or_app_left`, `no_face_detected` va h.k.
// bilan bir xil konvensiya.
//
// MUHIM: bu yerda faqat hosila SIGNAL nomi — hech qanday audio/ovoz namunasi
// yoki tanib olinadigan audio kontent hech qachon yuborilmaydi yoki saqlanmaydi.
// Faqat qurilmada (on-device) energiya asosidagi ovoz-faolligi aniqlanadi.
export const REASON_AMBIENT_SPEECH = 'ambient_speech_detected';
