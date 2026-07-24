// Webkamera proktoring cheating-sabab satrlari — YAGONA MANBA.
//
// Ishlab chiqaruvchi (src/proctoring/faceMonitor.js) va ko'rsatuvchi
// (pages/ManagerDashboard.jsx `CHEATING_REASON_LABELS`) bir xil satrlardan
// foydalanadi, shu sababli ular hech qachon bir-biridan uzoqlashmaydi (drift).
//
// Backend `TestSession.cheating_reason` — free-text `CharField(max_length=120)`
// (choices enum EMAS), shuning uchun bu satrlar migratsiyasiz oddiy string
// sifatida saqlanadi — mavjud `tab_or_app_left`, `copy_paste_attempt` va h.k.
// bilan bir xil konvensiya.
//
// MUHIM: bu yerda faqat hosila SIGNAL nomlari — hech qanday video/rasm/audio
// hech qachon yuborilmaydi yoki saqlanmaydi.
export const REASON_NO_FACE = 'no_face_detected';
export const REASON_MULTIPLE_FACES = 'multiple_faces_detected';
export const REASON_GAZE_AWAY = 'gaze_away_sustained';
