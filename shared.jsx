// shared.jsx — Global shared components

const { useState, useEffect, useRef, useContext, createContext } = React;

// E.164 chegaralari — ITU-T bo'yicha raqamlar soni maksimal 15 ta.
const PHONE_E164_MIN_DIGITS = 8;
const PHONE_E164_MAX_DIGITS = 15;
const UZ_DIAL_CODE = '998';
const UZ_LOCAL_DIGITS = 9;

// Tez tanlash uchun mashhur davlat kodlari ro'yxati. Default — O'zbekiston.
// Foydalanuvchi ro'yxatdan tanlashi yoki qo'lda '+' bilan boshlab boshqa
// kodni kiritishi mumkin. (Maxsus kutubxona shart emas — qo'lda E.164.)
const COUNTRY_DIAL_CODES = [
  { code: '998', flag: '🇺🇿', name: "O'zbekiston" },
  { code: '7',   flag: '🇷🇺', name: 'Rossiya / Qozogʻiston' },
  { code: '996', flag: '🇰🇬', name: 'Qirgʻiziston' },
  { code: '992', flag: '🇹🇯', name: 'Tojikiston' },
  { code: '993', flag: '🇹🇲', name: 'Turkmaniston' },
  { code: '90',  flag: '🇹🇷', name: 'Turkiya' },
  { code: '1',   flag: '🇺🇸', name: 'AQSH / Kanada' },
  { code: '44',  flag: '🇬🇧', name: 'Buyuk Britaniya' },
  { code: '49',  flag: '🇩🇪', name: 'Germaniya' },
  { code: '971', flag: '🇦🇪', name: 'BAA' },
  { code: '966', flag: '🇸🇦', name: 'Saudiya Arabistoni' },
  { code: '82',  flag: '🇰🇷', name: 'Janubiy Koreya' },
  { code: '86',  flag: '🇨🇳', name: 'Xitoy' },
];

// Eski format: inputni majburan O'zbekiston (+998) shakliga keltiradi.
// Orqaga moslik uchun saqlanadi (login formasi va boshqa joylar shuni
// ishlatadi). Yangi/xalqaro kiritma uchun `formatPhoneInput` ishlatiladi.
const formatUzPhoneInput = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  let local = digits.startsWith(UZ_DIAL_CODE) ? digits.slice(UZ_DIAL_CODE.length) : digits;
  if (local.length > UZ_LOCAL_DIGITS) local = local.slice(-UZ_LOCAL_DIGITS);
  return '+' + UZ_DIAL_CODE + local.slice(0, UZ_LOCAL_DIGITS);
};

// ─── O'quvchi premium tier (Standart/Plus/Pro) yordamchilari ───
// Backend 3 ta ierarxik tier joriy qildi: Pro ⊇ Plus ⊇ Standart ⊇ free.
// Ba'zi funksiyalar (competitor-analysis, study-plan, weekly-report) Plus+ ni,
// boshqalari (olympiad-prep-plan, AI audio, 365-kunlik timeline, cheksiz mashq)
// Pro ni talab qiladi. UI shu yordamchilar orqali qulflangan/upgrade holatini
// ko'rsatadi. Reyting kaliti Pricing.jsx'dagi `_tierKey` bilan bir xil mantiq.
const STUDENT_TIER_ORDER = { free: 0, standart: 1, standard: 1, plus: 2, pro: 3 };

// Plan nomi satridan tier kalitini ajratamiz ("Plus (3 oy)" -> "plus").
// Pricing.jsx'dagi `_tierKey` bilan aynan bir xil naqsh (qayta ixtiro emas).
const studentTierKey = (planName) => {
  const low = (planName || '').toLowerCase();
  if (low.includes('standart') || low.includes('standard')) return 'standart';
  if (low.includes('plus')) return 'plus';
  if (low.includes('pro')) return 'pro';
  return '';
};

// Foydalanuvchining amaldagi tier'i. Asosiy manba — backend hisoblagan
// `studentTier` (billing.services.resolve_student_tier). Uni plan NOMIDAN
// chiqarish MUMKIN EMAS: tashkilot (markaz) planlari o'quvchi planlari bilan
// aynan bir xil nomlanadi ("Pro (1 yil)"), lekin markaz obunasi o'quvchi
// tarifini bermaydi — aks holda markaz egasiga barcha Pro o'quvchi
// imkoniyatlari bepul ochilib ketardi.
//
// Fallback (eski backend `student_tier` yubormasa): premium bo'lmasa 'free',
// plan nomi aniqlanmasa (legacy/qo'lda berilgan grant) — backend'dagi
// PREMIUM_NO_PLAN_DEFAULT_TIER='pro' mantig'iga mos ravishda 'pro'.
const userTier = (user) => {
  if (!user || !user.isPremium) return 'free';
  if (user.studentTier) return user.studentTier;
  return studentTierKey(user.currentPlanName) || 'pro';
};

// Foydalanuvchi tier'i kamida `minTier` darajasidami? (ierarxik taqqoslash).
const tierAtLeast = (user, minTier) =>
  (STUDENT_TIER_ORDER[userTier(user)] || 0) >= (STUDENT_TIER_ORDER[minTier] || 0);

// Xalqaro input formatlash. `dialCode` — tanlangan davlat kodi (default 998).
// Foydalanuvchi '+' bilan boshlab boshqa kod yozsa, uni hurmat qilamiz; aks
// holda tanlangan davlat kodi prefiksini qo'yamiz. Natija doim '+' bilan
// boshlanadi va E.164 max uzunligida cheklanadi. O'zbekiston tanlangan
// bo'lsa, abonent raqamini 9 xona bilan cheklab eski xulqni saqlaymiz.
const formatPhoneInput = (raw, dialCode = UZ_DIAL_CODE) => {
  const text = String(raw || '').trim();
  const startedPlus = text.startsWith('+');
  const digits = text.replace(/\D/g, '');
  const cc = String(dialCode || UZ_DIAL_CODE).replace(/\D/g, '') || UZ_DIAL_CODE;

  // Foydalanuvchi aniq '+' bilan to'liq xalqaro raqam yozyapti — davlat
  // kodini saqlaymiz, faqat E.164 max uzunligida kesamiz.
  if (startedPlus) {
    return '+' + digits.slice(0, PHONE_E164_MAX_DIGITS);
  }

  // '+' yo'q — tanlangan davlat kodiga moslaymiz. Avval ortiqcha takror
  // kiritilgan davlat kodini olib tashlaymiz (masalan dialCode=998 va
  // foydalanuvchi 998901234567 ni nusxa qilib qo'ydi).
  let local = digits;
  if (local.startsWith(cc)) local = local.slice(cc.length);

  if (cc === UZ_DIAL_CODE) {
    // O'zbekiston: abonent raqami aniq 9 xona.
    local = local.slice(-UZ_LOCAL_DIGITS).slice(0, UZ_LOCAL_DIGITS);
  } else {
    // Boshqa davlatlar: umumiy E.164 chegarasi.
    local = local.slice(0, Math.max(0, PHONE_E164_MAX_DIGITS - cc.length));
  }
  return '+' + cc + local;
};

// Telefonni ko'rsatish uchun qisman yashirish (DISPLAY-only). O'zbekiston
// va xalqaro raqamlar uchun ham ishlaydi: boshini (`+` + 3..5 raqam) va
// oxirgi 4 raqamni ochib, oradagini `***` bilan almashtiradi. Mos kelmasa
// (yoki backend allaqachon maskalagan bo'lsa) qiymatni o'zgarishsiz qaytaradi.
const maskPhoneDisplay = (raw, sep = ' ') => {
  const phone = String(raw || '');
  const m = phone.match(/^(\+\d{3,5})(\d+)(\d{4})$/);
  return m ? `${m[1]}${sep}***${sep}${m[3]}` : phone;
};

// Berilgan to'liq raqamdan davlat kodini taxmin qiladi (ro'yxatdagi eng
// uzun mos prefiks bo'yicha). Topilmasa default qaytaradi.
const detectDialCode = (raw, fallback = UZ_DIAL_CODE) => {
  const text = String(raw || '');
  const digits = text.replace(/\D/g, '');
  if (!digits) return fallback;
  let best = '';
  for (const { code } of COUNTRY_DIAL_CODES) {
    if (digits.startsWith(code) && code.length > best.length) best = code;
  }
  if (best) return best;
  // Ro'yxatda yo'q davlat kodi. Foydalanuvchi '+' bilan to'liq xalqaro raqam
  // kiritgan bo'lsa (masalan +33...), abonent qismi ~9 raqam deb hisoblab,
  // qolganini davlat kodi sifatida ajratamiz (1..4 raqam). Aks holda fallback.
  if (text.trim().startsWith('+') && digits.length > 9) {
    return digits.slice(0, Math.min(4, digits.length - 9));
  }
  return fallback;
};

// ─── PhoneField ────────────────────────────────────────────────────────────────
// Davlat kodi tanlash dropdown + xalqaro telefon input. Defolt O'zbekiston
// (+998). `value` — to'liq E.164 string (masalan '+998901234567'); `onChange`
// shu formatdagi yangilangan stringni qaytaradi.
const PhoneField = ({ value, onChange, className = '', placeholder = '901234567', autoComplete = 'tel', maxLength, disabled = false, inputRef: externalRef }) => {
  const innerRef = React.useRef(null);
  const ref = externalRef || innerRef;
  const dial = detectDialCode(value, UZ_DIAL_CODE);
  // Inputda faqat davlat kodidan keyingi qism ko'rsatiladi.
  const localPart = (() => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith(dial)) return digits.slice(dial.length);
    return digits;
  })();

  const handleDialChange = (e) => {
    const newCode = e.target.value;
    // Davlat kodi o'zgarganda mavjud abonent raqamini saqlab, yangi kod
    // prefiksini qo'yamiz.
    const next = formatPhoneInput(localPart, newCode);
    onChange(next);
  };

  const handleLocalChange = (e) => {
    const raw = e.target.value;
    // Foydalanuvchi inputga '+' bilan boshlab to'liq xalqaro raqam ham
    // yozishi mumkin — formatPhoneInput buni hurmat qiladi. Controlled input
    // bo'lgani uchun React kursor pozitsiyasini o'zi to'g'ri saqlaydi; qo'lda
    // setSelectionRange/requestAnimationFrame ishlatmaymiz (mobil/Telegram
    // WebView yumshoq klaviaturasi bilan raqobatga kirib kiritishni buzadi).
    const next = formatPhoneInput(raw.startsWith('+') ? raw : (dial + raw.replace(/\D/g, '')), dial);
    onChange(next);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        value={dial}
        onChange={handleDialChange}
        disabled={disabled}
        className="input-field flex-shrink-0 w-[104px] pr-2"
        aria-label="Davlat kodi"
      >
        {COUNTRY_DIAL_CODES.map(c => (
          <option key={c.code} value={c.code}>{c.flag} +{c.code}</option>
        ))}
        {/* Ro'yxatda yo'q kod qo'lda kiritilgan bo'lsa, uni ham ko'rsatamiz */}
        {!COUNTRY_DIAL_CODES.some(c => c.code === dial) && (
          <option value={dial}>+{dial}</option>
        )}
      </select>
      <input
        ref={ref}
        className="input-field flex-1"
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        value={localPart}
        onChange={handleLocalChange}
        disabled={disabled}
      />
    </div>
  );
};

// Tashqi havolani ochish. Muvaffaqiyatli ochilsa true qaytaradi.
// 1) Telegram Mini App ichida window.open/location.href ishonchsiz —
//    rasmiy WebApp API (openTelegramLink / openLink) ishlatiladi;
// 2) oddiy brauzerda yangi oynada ochiladi — SPA holati (forma, OTP
//    bosqichi, to'lov polling) yo'qolmaydi;
// 3) popup bloklansa: fallbackRedirect=true bo'lsa joriy oynada ochiladi,
//    aks holda false qaytadi — chaqiruvchi ko'rinadigan havola ko'rsatadi.
const openExternalLink = (url, { fallbackRedirect = true } = {}) => {
  if (!url) return false;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.initData) {
    try {
      if (tg.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) {
        tg.openTelegramLink(url);
        return true;
      }
      if (tg.openLink) {
        tg.openLink(url);
        return true;
      }
    } catch (_) { /* WebApp API ishlamasa pastdagi oddiy yo'lga o'tamiz */ }
  }
  // Eslatma: 'noopener' feature'i bilan window.open har doim null qaytaradi
  // (spec bo'yicha) — blok aniqlash uchun avval ochib, keyin opener uziladi.
  const win = window.open(url, '_blank');
  if (win) {
    try { win.opener = null; } catch (_) { /* cross-origin bo'lsa ham zarari yo'q */ }
    return true;
  }
  if (fallbackRedirect) {
    window.location.href = url;
    return true;
  }
  return false;
};

// ─── Icons (inline SVG helpers) ───────────────────────────────────────────────
// Noma'lum ikon nomi haqida BIR MARTA ogohlantirish uchun (render loop'da
// konsolni to'ldirmasligi kerak) — pastdagi izohga qarang.
const _warnedIconNames = new Set();

const Icon = ({ name, size = 18, className = '' }) => {
  // Modern line icons in the Lucide visual language (MIT-licensed): 24×24 grid,
  // stroke-based, uniform 2px stroke, round caps/joins, no fill. Only the SVG
  // geometry lives here — the <Icon name=… /> API is unchanged.
  const icons = {
    home: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 21v-8a1 1 0 00-1-1h-4a1 1 0 00-1 1v8" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10a2 2 0 01.709-1.528l7-5.999a2 2 0 012.582 0l7 5.999A2 2 0 0121 10v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></>,
    users: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    user: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    trophy: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0012 0V2z" /></>,
    bolt: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14a1 1 0 01-.78-1.63l9.9-10.2a.5.5 0 01.86.46l-1.92 6.02A1 1 0 0013 10h7a1 1 0 01.78 1.63l-9.9 10.2a.5.5 0 01-.86-.46l1.92-6.02A1 1 0 0011 14z" />,
    // `bolt` bilan bir xil geometriya, Lucide'dagi nomi bo'yicha taxallus
    // (`creditCard` / `credit-card` juftligidagi kabi).
    zap: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14a1 1 0 01-.78-1.63l9.9-10.2a.5.5 0 01.86.46l-1.92 6.02A1 1 0 0013 10h7a1 1 0 01.78 1.63l-9.9 10.2a.5.5 0 01-.86-.46l1.92-6.02A1 1 0 0011 14z" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v16a2 2 0 002 2h16M18 17V9M13 17V5M8 17v-3" />,
    settings: <><circle cx="12" cy="12" r="3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" /></>,
    bell: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.268 21a2 2 0 003.464 0" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.262 15.326A1 1 0 004 17h16a1 1 0 00.74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 006 8c0 4.499-1.411 5.956-2.738 7.326" /></>,
    search: <><circle cx="11" cy="11" r="8" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.34-4.34" /></>,
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5v14" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 6L9 17l-5-5" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />,
    book: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
    eye: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.062 12.348a1 1 0 010-.696 10.75 10.75 0 0119.876 0 1 1 0 010 .696 10.75 10.75 0 01-19.876 0" /><circle cx="12" cy="12" r="3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    eyeOff: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.733 5.076a10.744 10.744 0 0111.205 6.575 1 1 0 010 .696 10.747 10.747 0 01-1.444 2.49" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.084 14.158a3 3 0 01-4.242-4.242" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.479 17.499a10.75 10.75 0 01-15.417-5.151 1 1 0 010-.696 10.75 10.75 0 014.446-5.143" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 2l20 20" /></>,
    upload: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l-5-5-5 5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12" /></>,
    download: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10l5 5 5-5" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15V3" /></>,
    star: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.525 2.295a.53.53 0 01.95 0l2.31 4.679a2.123 2.123 0 001.595 1.16l5.166.756a.53.53 0 01.294.904l-3.736 3.638a2.123 2.123 0 00-.611 1.878l.882 5.14a.53.53 0 01-.771.56l-4.618-2.428a2.122 2.122 0 00-1.973 0L6.396 21.01a.53.53 0 01-.77-.56l.881-5.139a2.122 2.122 0 00-.611-1.879L2.16 9.795a.53.53 0 01.294-.906l5.165-.755a2.122 2.122 0 001.597-1.16z" />,
    award: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.477 12.89l1.515 8.526a.5.5 0 01-.81.47l-3.58-2.687a1 1 0 00-1.197 0l-3.586 2.686a.5.5 0 01-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    logout: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /></>,
    menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />,
    chevronRight: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6" />,
    chevronDown: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />,
    sparkles: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.937 15.5A2 2 0 008.5 14.063l-6.135-1.582a.5.5 0 010-.962L8.5 9.936A2 2 0 009.937 8.5l1.582-6.135a.5.5 0 01.963 0L14.063 8.5A2 2 0 0015.5 9.937l6.135 1.581a.5.5 0 010 .964L15.5 14.063a2 2 0 00-1.437 1.437l-1.582 6.135a.5.5 0 01-.963 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 3v4M22 5h-4M4 17v2M5 18H3" /></>,
    file: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2v4a2 2 0 002 2h4" /></>,
    clock: <><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    filter: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20a1 1 0 00.553.895l2 1A1 1 0 0014 21v-7a2 2 0 01.517-1.341L21.74 4.67A1 1 0 0021 3H3a1 1 0 00-.742 1.67l7.225 7.989A2 2 0 0110 14z" />,
    shield: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 01-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 011-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 011.52 0C14.51 3.81 17 5 19 5a1 1 0 011 1z" />,
    brain: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5a3 3 0 10-5.997.125 4 4 0 00-2.526 5.77 4 4 0 00.556 6.588A4 4 0 1012 18z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5a3 3 0 115.997.125 4 4 0 012.526 5.77 4 4 0 01-.556 6.588A4 4 0 1112 18z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a4.5 4.5 0 01-3-4 4.5 4.5 0 01-3 4M17.599 6.5a3 3 0 00.399-1.375M6.003 5.125A3 3 0 006.401 6.5M3.477 10.896a4 4 0 01.585-.396M19.938 10.5a4 4 0 01.585.396M6 18a4 4 0 01-1.967-.516M19.967 17.484A4 4 0 0118 18" /></>,
    send: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.536 21.686a.5.5 0 00.937-.024l6.5-19a.496.496 0 00-.635-.635l-19 6.5a.5.5 0 00-.024.937l7.93 3.18a2 2 0 011.112 1.11z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.854 2.147l-10.94 10.939" /></>,
    building: <><rect x="4" y="2" width="16" height="20" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></>,
    tag: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.586 2.586A2 2 0 0011.172 2H4a2 2 0 00-2 2v7.172a2 2 0 00.586 1.414l8.704 8.704a2.426 2.426 0 003.42 0l6.58-6.58a2.426 2.426 0 000-3.42z" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></>,
    edit: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.375 2.625a1 1 0 013 3l-9.013 9.014a2 2 0 01-.853.505l-2.873.84a.5.5 0 01-.62-.62l.84-2.873a2 2 0 01.506-.852z" /></>,
    trash: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 11v6M14 11v6" /></>,
    copy: <><rect x="8" y="8" width="14" height="14" rx="2" ry="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    info: <><circle cx="12" cy="12" r="10" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4M12 8h.01" /></>,
    arrowLeft: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />,
    play: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3a1 1 0 011.514-.857l13.999 8.999a1 1 0 010 1.716l-14 9A1 1 0 016 21z" />,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11V7a5 5 0 0110 0v4" /></>,
    mic: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 10v1a7 7 0 01-14 0v-1M12 18v4M8 22h8" /></>,
    creditCard: <><rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10h20" /></>,
    'credit-card': <><rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 10h20" /></>,
    gift: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12v10H4V12" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 7h20v5H2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22V7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></>,
    printer: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    refresh: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M23 4v6h-6M1 20v-6h6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>,
    'bar-chart-2': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 20V10M12 20V4M6 20v-6" />,
    'trash-2': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></>,
    'file-text': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><line x1="16" y1="13" x2="8" y2="13" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><line x1="16" y1="17" x2="8" y2="17" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><polyline points="10 9 9 9 8 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></>,
    dollar: <><line x1="12" y1="1" x2="12" y2="23" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>,
    'alert-triangle': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21.73 18l-8-14a2 2 0 00-3.48 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4M12 17h.01" /></>,
    layers: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.83 2.18a2 2 0 00-1.66 0L2.6 6.08a1 1 0 000 1.83l8.58 3.91a2 2 0 001.66 0l8.58-3.9a1 1 0 000-1.83z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 12a1 1 0 00.58.91l8.6 3.91a2 2 0 001.65 0l8.58-3.9A1 1 0 0022 12" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 17a1 1 0 00.58.91l8.6 3.91a2 2 0 001.65 0l8.58-3.9A1 1 0 0022 17" /></>,
    'message-square': <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 17a2 2 0 01-2 2H6l-4 4V5a2 2 0 012-2h16a2 2 0 012 2z" />,
    'external-link': <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6v6M10 14L21 3" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /></>,
    code: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 18l6-6-6-6M8 6l-6 6 6 6" />,
    wallet: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12V8H6a2 2 0 01-2-2V4a2 2 0 012-2h12v4M4 6v14a2 2 0 002 2h14v-4M18 12a2 2 0 100 4h4v-4h-4z" /></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />,
    sun: <><circle cx="12" cy="12" r="4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
    moon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3a6 6 0 009 9 9 9 0 11-9-9z" />,
  };
  // Xaritada yo'q nom BO'SH <svg> chizadi: element o'z joyini egallaydi,
  // lekin hech narsa ko'rinmaydi va konsolda ham xato bo'lmaydi. Sidebar'dagi
  // "Mukofotlar" (`gift`) va "Moliya" (`credit-card`) aynan shu sababli
  // ikonsiz turgan edi — nav bandlari qo'shilgan, ikonlar esa xaritaga
  // qo'shilmagan. Nomni jimgina yutish o'rniga bir marta ogohlantiramiz,
  // shunda keyingi safar ikon qo'shishni unutish darhol bilinadi.
  const glyph = icons[name] || null;
  if (!glyph && name && !_warnedIconNames.has(name)) {
    _warnedIconNames.add(name);
    console.warn(`[Icon] "${name}" ikoni shared.jsx dagi 'icons' xaritasida yo'q — bo'sh SVG chizildi.`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      {glyph}
    </svg>
  );
};

// ─── Mavzu (theme): light / dark ──────────────────────────────────────────────
// Holat ikki qismdan iborat:
//
//   preference — foydalanuvchi tanlovi ('light' | 'dark'), localStorage'da
//                saqlanadi. Default 'dark' (hozirgi ko'rinish).
//   locked     — joriy yuza hali light uchun tayyor emas (rol dashboardlari,
//                test, savol yaratish va h.k.). Bunda ekran MAJBURIY dark
//                bo'ladi, lekin tanlov saqlanib qoladi: foydalanuvchi
//                theme-ready sahifaga qaytishi bilan light qayta tiklanadi.
//
//   effektiv mavzu = locked ? 'dark' : preference
//
// Qaysi yuza theme-ready ekanini app.jsx belgilaydi (`THEME_READY_PAGES`) va
// `OlympyTheme.setLocked` orqali shu yerga uzatadi. Boshlang'ich qo'llash esa
// React'dan oldin `public/theme-init.js` da bajariladi (FOUC oldini olish) —
// bu yerdagi kod o'sha holatni davom ettiradi, qaytadan boshlamaydi.
const THEME_STORAGE_KEY = 'olympy:theme';
const THEME_META_COLORS = { dark: '#14161C', light: '#E7E4DC' };

const OlympyTheme = (() => {
  const listeners = new Set();
  let locked = false;
  let preference = (() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'dark';
    } catch { return 'dark'; }
  })();

  const getEffective = () => (locked ? 'dark' : preference);

  const apply = () => {
    const theme = getEffective();
    try {
      document.documentElement.dataset.theme = theme;
      // Brauzer chrome rangi sahifa fonidan farq qilmasin.
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_META_COLORS[theme]);
    } catch {}
    listeners.forEach(fn => { try { fn(); } catch {} });
  };

  const setPreference = (next) => {
    if (next !== 'light' && next !== 'dark') return;
    if (next === preference) return;
    preference = next;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
    apply();
  };

  const setLocked = (next) => {
    if (!!next === locked) return;
    locked = !!next;
    apply();
  };

  return {
    getPreference: () => preference,
    getEffective,
    isLocked: () => locked,
    setPreference,
    setLocked,
    toggle: () => setPreference(preference === 'dark' ? 'light' : 'dark'),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

const useTheme = () => {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => OlympyTheme.subscribe(force), []);
  return {
    theme: OlympyTheme.getEffective(),
    locked: OlympyTheme.isLocked(),
    setTheme: OlympyTheme.setPreference,
    toggle: OlympyTheme.toggle,
  };
};

// ─── ThemeToggle ──────────────────────────────────────────────────────────────
// Theme-ready bo'lmagan yuzalarda UMUMAN ko'rsatilmaydi: bosilganda hech narsa
// o'zgarmaydigan tugma yo'qligidan yomonroq.
// Ko'rinish `.theme-toggle` (src/index.css) da: gradient/glow/translateY yo'q,
// faqat chegara va fon o'zgaradi; klaviatura fokusi ko'rinadi.
const ThemeToggle = ({ className = '' }) => {
  const { theme, locked, toggle } = useTheme();
  if (locked) return null;

  const goingLight = theme === 'dark';
  const label = goingLight ? "Yorug' mavzuga o'tish" : "To'q mavzuga o'tish";
  return (
    <button
      type="button"
      onClick={toggle}
      className={`theme-toggle ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon name={goingLight ? 'sun' : 'moon'} size={15} />
      <span>{goingLight ? "Yorug'" : "To'q"}</span>
    </button>
  );
};

// ─── Yengil sintaksis highlighter — dasturlash kodini ranglash ────────────────
// Telegram WebView'da og'ir kutubxonalar (highlight.js, prism) sekin ishlaydi,
// shuning uchun qo'shimcha bundle yuki bermaydigan, regex-asosli yengil
// highlighter ishlatamiz. Bir nechta keng tarqalgan til (Python, C/C++, Java,
// JS, va h.k.) sintaksisi uchun umumiy token to'plami yetarli — IT
// olimpiadasidagi kodlar uchun. Highlighting faqat kosmetik: matn HTML-escape
// qilinadi, keyin tokenlar <span> bilan ranglanadi.

// Ko'p tilda uchraydigan kalit so'zlar (umumiy to'plam — bitta tilga bog'lanmaydi).
const CODE_KEYWORDS = new Set([
  'abstract','and','as','assert','async','await','bool','boolean','break','byte',
  'case','catch','char','class','const','constexpr','continue','def','default',
  'del','delete','do','double','elif','else','end','enum','export','extends',
  'extern','false','final','finally','float','for','from','func','function',
  'global','goto','if','implements','import','in','include','inline','instanceof',
  'int','interface','is','lambda','let','long','namespace','new','nil','none',
  'not','null','nullptr','operator','or','package','pass','private','protected',
  'public','raise','return','self','short','signed','sizeof','static','std',
  'string','struct','super','switch','template','this','throw','throws','true',
  'try','typedef','typename','typeof','union','unsigned','using','var','virtual',
  'void','volatile','while','with','yield',
]);

const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Bitta kod satrini token-token ranglaydi va HTML qaytaradi. Matn avval
// escape qilinadi (XSS xavfsiz), tartib: kommentlar va stringlar butun
// boshli, keyin raqamlar va kalit so'zlar.
const highlightCodeToHtml = (code) => {
  // Token regex tartibi muhim: avval kommentariya/string (ichidagi narsa
  // ranglanmasligi uchun), keyin raqam, keyin so'zlar.
  const TOKEN_RE = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d.]*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    last = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) {
      out += `<span class="tok-comment">${escapeHtml(m[1])}</span>`;
    } else if (m[2] !== undefined) {
      out += `<span class="tok-string">${escapeHtml(m[2])}</span>`;
    } else if (m[3] !== undefined) {
      out += `<span class="tok-number">${escapeHtml(m[3])}</span>`;
    } else if (m[4] !== undefined) {
      const word = m[4];
      if (CODE_KEYWORDS.has(word)) {
        out += `<span class="tok-keyword">${escapeHtml(word)}</span>`;
      } else if (code[TOKEN_RE.lastIndex] === '(') {
        // Funksiya chaqiruvi/ta'rifi (so'zdan keyin '(').
        out += `<span class="tok-function">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    }
  }
  out += escapeHtml(code.slice(last));
  return out;
};

// ─── MathText — kod bloklari + matematik ifodalarni render qiladi ─────────────
// AI savollar va variantlarda uch xil maxsus bo'lak bo'lishi mumkin:
//   1) ```...``` — fenced kod bloki (ixtiyoriy til nomi bilan), <pre><code>;
//   2) `...`     — inline kod, <code>;
//   3) $...$ / $$...$$ — matematik LaTeX, KaTeX bilan render.
// Kod bo'laklari BIRINCHI ajratiladi — ular ichidagi '$' matematik deb
// hisoblanmaydi (PHP, shell kodida $ literal qoladi). Qolgan oddiy matn
// o'zgartirilmaydi (eski savollar: 1/2, x^2). Render xatosi hech qachon
// savol ko'rsatishni buzmaydi — har bir bo'lak alohida fallback'ga ega.
const MATH_SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
// ```lang\n...\n``` (fenced) yoki `...` (inline). Fenced birinchi tekshiriladi.
const CODE_SPLIT_RE = /(```[\s\S]*?```|`[^`\n]+?`)/g;

// Faqat matematikani render qiladi (kod bo'laklari allaqachon ajratilgan).
// `k` — yuklab bo'lingan katex moduli yoki null (hali kelmagan bo'lsa; u
// holda ifoda oddiy matn ko'rinishida chiqadi).
const renderMathParts = (raw, keyBase, k) => {
  if (!k || raw.indexOf('$') === -1) {
    return [<React.Fragment key={`${keyBase}t`}>{raw}</React.Fragment>];
  }
  const nodes = [];
  const parts = raw.split(MATH_SPLIT_RE);
  parts.forEach((part, index) => {
    if (!part) return;
    const isBlock = part.length >= 4 && part.startsWith('$$') && part.endsWith('$$');
    const isInline = !isBlock && part.length >= 2 && part.startsWith('$') && part.endsWith('$');
    if (isBlock || isInline) {
      const latex = isBlock ? part.slice(2, -2) : part.slice(1, -1);
      try {
        const html = k.renderToString(latex, { displayMode: isBlock, throwOnError: false, strict: false });
        nodes.push(
          <span
            key={`${keyBase}-${index}`}
            className={isBlock ? 'katex-block' : 'katex-inline'}
            dangerouslySetInnerHTML={{ __html: html }}
          />,
        );
        return;
      } catch (err) {
        nodes.push(<React.Fragment key={`${keyBase}-${index}`}>{part}</React.Fragment>);
        return;
      }
    }
    nodes.push(<React.Fragment key={`${keyBase}-${index}`}>{part}</React.Fragment>);
  });
  return nodes;
};

// KaTeX moduli LAZY yuklanadi (src/services/katex-loader.js) — matnda `$`
// bo'lgan birinchi MathText render'ida so'raladi va alohida chunkda tushadi.
const olympyKatex = () => (globalThis.OlympyKatex ? globalThis.OlympyKatex.get() : null);

// React.memo — OlympiadTest.jsx'da har sekundlik timer tick butun daraxtni
// qayta render qiladi; savol matni/variantlar o'zgarmagan bo'lsa ham MathText
// memo qilinmagan holda har safar KaTeX'ni qaytadan renderToString qilardi
// (og'ir, sinxron). Memo bilan `text`/`className` o'zgarmasa qayta hisoblanmaydi.
const MathText = React.memo(({ text, className }) => {
  const raw = text == null ? '' : String(text);
  const hasCode = raw.indexOf('`') !== -1;
  const hasMath = raw.indexOf('$') !== -1;

  // KaTeX kelmaguncha matematik ifoda oddiy matn ($x^2$) sifatida chiqadi;
  // modul tayyor bo'lgach state o'zgarib qayta render bo'ladi va ifoda
  // chiroyli ko'rinishga o'tadi. (Hook'lar har doim chaqiriladi — quyidagi
  // erta `return`lardan OLDIN.)
  const [katexReady, setKatexReady] = useState(() => !!olympyKatex());
  useEffect(() => {
    if (!hasMath || katexReady) return undefined;
    const loader = globalThis.OlympyKatex;
    if (!loader) return undefined;
    let alive = true;
    loader.load()
      .then(() => { if (alive) setKatexReady(true); })
      .catch((err) => { console.warn('KaTeX yuklanmadi:', err); });
    return () => { alive = false; };
  }, [hasMath, katexReady]);
  const katexModule = katexReady ? olympyKatex() : null;

  if (!raw) {
    return className ? <span className={className} /> : null;
  }

  // Maxsus belgi bo'lmasa — tezkor yo'l, oddiy matn.
  if (!hasCode && !hasMath) {
    return <span className={className}>{raw}</span>;
  }

  // Kod yo'q bo'lsa — to'g'ridan-to'g'ri matematikani render qilamiz.
  if (!hasCode) {
    return <span className={className}>{renderMathParts(raw, 'm', katexModule)}</span>;
  }

  // Avval kod bo'laklarini ajratamiz.
  const segments = raw.split(CODE_SPLIT_RE);
  const nodes = [];
  segments.forEach((seg, index) => {
    if (!seg) return;
    const isFenced = seg.length >= 6 && seg.startsWith('```') && seg.endsWith('```');
    const isInlineCode = !isFenced && seg.length >= 2 && seg.startsWith('`') && seg.endsWith('`');

    if (isFenced) {
      let body = seg.slice(3, -3);
      // Birinchi qatordagi til nomini (```python) olib tashlaymiz.
      const nl = body.indexOf('\n');
      let lang = '';
      if (nl !== -1) {
        const firstLine = body.slice(0, nl).trim();
        if (/^[A-Za-z0-9+#._-]{0,20}$/.test(firstLine)) {
          lang = firstLine;
          body = body.slice(nl + 1);
        }
      }
      // Boshi/oxiridagi ortiqcha bo'sh qatorlarni tozalaymiz.
      body = body.replace(/^\n+/, '').replace(/\n+$/, '');
      try {
        const html = highlightCodeToHtml(body);
        nodes.push(
          <pre key={`c-${index}`} className="code-block">
            {lang ? <span className="code-lang">{lang}</span> : null}
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>,
        );
      } catch (err) {
        nodes.push(<pre key={`c-${index}`} className="code-block"><code>{body}</code></pre>);
      }
      return;
    }

    if (isInlineCode) {
      const body = seg.slice(1, -1);
      nodes.push(<code key={`ic-${index}`} className="code-inline">{body}</code>);
      return;
    }

    // Oddiy matn bo'lagi — ichida matematika bo'lishi mumkin.
    nodes.push(
      <React.Fragment key={`s-${index}`}>{renderMathParts(seg, `m${index}`, katexModule)}</React.Fragment>,
    );
  });

  return <span className={className}>{nodes}</span>;
});

const BRAND_ASSET_BASE = window.location.protocol === 'file:' ? 'public/brand' : '/brand';
const BRAND_LOGO_SRC = `${BRAND_ASSET_BASE}/olympy-brand.png`;
const BRAND_LOGO_SRC_WEBP = `${BRAND_ASSET_BASE}/olympy-brand.webp`;

// Brend rasmi to'q fonga chizilgan: "OLYMPY" so'zi va tog' cho'qqisi oq, fon
// esa shaffof. Qog'oz (light) mavzuda oq matn yo'qoladi, `mixBlendMode:'screen'`
// esa qolganini ham fon rangiga yuvib yuboradi.
//
// Ikkita yo'l bor edi:
//   (a) light'da `wordmark` variantiga o'tish — lekin mavzu almashtirilganda
//       brend butunlay boshqa belgiga aylanadi (tog' belgisi yo'qoladi);
//   (b) rasmning YORQINLIGINI ag'darish: `invert(1) hue-rotate(180deg)`.
//       Bu klassik juftlik — invert rangni ham teskari qiladi, hue-rotate esa
//       tovushni (hue) joyiga qaytaradi. Natijada ko'k halqa ko'k qoladi, oq
//       "OLYMPY" esa siyoh rangga o'tadi.
// (b) tanlandi: bitta brend belgisi ikkala mavzuda ham saqlanadi. Dark mavzuda
// hech narsa o'zgarmaydi (screen blend avvalgidek) — majburiy dark
// dashboardlarda regressiya yo'q.
const BrandLogo = ({ compact = false, size = 'md', className = '', variant = 'default', onDark = false }) => {
  const { theme } = useTheme();
  // `onDark` — element QOG'OZ mavzuda ham to'q yuzada turganini bildiradi
  // (masalan `TelegramMockup` ning #2b5278 sarlavhasi). Bunday joyda light
  // ishlovi rasmni to'q fonga to'q qilib qo'yadi, shuning uchun chetlab
  // o'tamiz va dark ishlovini (screen blend) ishlatamiz.
  const light = theme === 'light' && !onDark;
  const sizes = {
    xs: { width: 48, height: 32, mark: 28 },
    sm: { width: 84, height: 56, mark: 32 },
    md: { width: 108, height: 72, mark: 36 },
    lg: { width: 126, height: 84, mark: 44 },
    xl: { width: 156, height: 104, mark: 72 },
  };
  const current = sizes[size] || sizes.md;

  // Faqat matnli wordmark — rasmsiz joylar uchun (masalan chop etiladigan
  // sarlavha yoki juda tor panel). Avval Duolingo yashili (#58CC02) qattiq
  // yozilgan edi va `--duo-green` hech qayerda e'lon qilinmagan — endi akcent
  // tokeniga ulangan, rangli soya olib tashlandi.
  if (variant === 'wordmark') {
    const fontSizes = { xs: 22, sm: 28, md: 34, lg: 40, xl: 52 };
    const fs = fontSizes[size] || fontSizes.md;
    const dot = Math.round(fs * 0.42);
    return (
      <span className={`inline-flex items-center flex-shrink-0 ${className}`}
        style={{ gap: Math.round(fs * 0.18) }}>
        <span
          className="bg-accent flex-shrink-0"
          style={{ width: dot, height: dot, borderRadius: '50%' }}
        />
        <span className="font-display text-text-primary" style={{
          fontWeight: 700,
          fontSize: fs,
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}>Olympy</span>
      </span>
    );
  }
  // Rasm ikki qismdan iborat: OQ "OLYMPY" so'zi va KO'K tog' belgisi
  // (piksel tahlili: ustun ranglar #E0E0E0 va #0040E0/#0060E0/#00C0E0).
  //
  // `invert(1) hue-rotate(180deg)` oq so'zni siyohga aylantiradi — to'g'ri —
  // lekin ko'k belgini OQISH-kulrangga chiqaradi (invert → #FFBF1F, hue-rotate
  // uni yorqinligicha qoldiradi). To'liq o'lchamda buni sezilmaydi, chunki
  // belgini o'qishning hojati yo'q: yonida to'q "OLYMPY" so'zi turadi. Lekin
  // `compact` da so'z 48px ga siqiladi va o'qilmay qoladi — ko'zga faqat o'sha
  // oqargan belgi tashlanadi, ya'ni logotip qog'ozda deyarli yo'qoladi.
  //
  // `compact` uchun shuning uchun boshqa yo'l: `brightness(0)` — butun rasmni
  // alfa kanali bo'yicha bitta siyoh siluetiga aylantiradi (bosma shtamp kabi,
  // yo'nalishga mos). Qog'ozda 15:1 dan yuqori, har qanday o'lchamda o'qiladi.
  // To'liq va `wordmark` variantlar to'g'ri ishlayapti — ularga tegilmadi.
  const lightFilter = compact
    ? 'brightness(0) opacity(0.92)'
    : 'saturate(1.08) contrast(1.02) invert(1) hue-rotate(180deg)';
  const imageBlend = light
    ? {
        // Qog'ozda blend rejimi kerak emas — rasmda allaqachon alfa kanali bor.
        filter: lightFilter,
        opacity: 1,
        backgroundColor: 'transparent',
      }
    : {
        mixBlendMode: 'screen',
        filter: 'saturate(1.08) contrast(1.02)',
        opacity: 0.96,
        backgroundColor: 'transparent',
      };
  const style = compact
    ? {
        ...imageBlend,
        width: Math.round(current.mark * 1.5),
        height: current.mark,
        objectFit: 'contain',
      }
    : {
        ...imageBlend,
        width: current.width,
        height: current.height,
        objectFit: 'contain',
      };
  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`}>
      <picture>
        <source srcSet={BRAND_LOGO_SRC_WEBP} type="image/webp" />
        <img src={BRAND_LOGO_SRC} alt="Olympy" className="block" style={style} />
      </picture>
    </span>
  );
};

// ─── Avatar ────────────────────────────────────────────────────────────────────
// `premium` true bo'lsa avatar atrofida oltin glow halqa (.avatar-premium) ko'rinadi.
//
// `gradient` prop nomi tarixiy (chaqiruv joylari ko'p) — endi u tekis token
// klassini oladi, gradient emas. Standart qiymat avval
// `'from-indigo-500 to-purple-600'` edi: remap'dan keyin u qizil→ko'k gradientga
// aylanardi va prop berilmagan yagona joyda (SidebarContent) shu ko'rinardi.
const Avatar = ({ name = '', size = 36, gradient = 'bg-pencil-600', src = '', premium = false }) => {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`rounded-full object-cover flex-shrink-0 ${premium ? 'avatar-premium' : ''}`}
        style={{ width: size, height: size }}
        onError={() => setHasError(true)}
      />
    );
  }
  // `text-white` bu yerda TO'G'RI: initsiallar rangli (to'q) chip ustida
  // turadi, mavzu fonida emas. `gradient` chaqiruvchi sahifadan keladi.
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${premium ? 'avatar-premium' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
};

// ─── Badge ─────────────────────────────────────────────────────────────────────
// Avval 'Tugagan' va 'Tugadi' qizil (badge-rejected) ko'rinardi — finished
// olympiad'lar xato xolatga o'xshab ko'rinardi. Endi tugagan tadbirlar uchun
// alohida ko'k 'badge-finished' rangi ishlatiladi.
const Badge = ({ status }) => {
  const map = {
    'Kutilmoqda': 'badge-pending', 'Tasdiqlandi': 'badge-approved', 'Rad etildi': 'badge-rejected',
    'Faol': 'badge-active', 'Qoralama': 'badge-draft', 'Nofaol': 'badge-pending',
    'Tugagan': 'badge-finished', 'Tugadi': 'badge-finished',
    'active': 'badge-active', 'inactive': 'badge-pending', 'pending': 'badge-pending',
    'approved': 'badge-approved', 'rejected': 'badge-rejected', 'finished': 'badge-finished',
    'draft': 'badge-draft',
  };
  return <span className={`chip ${map[status] || 'badge-draft'}`}>{status}</span>;
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────
// `color` prop nomi tarixiy (26 ta chaqiruv joyi) — endi u tekis token
// klassini oladi, gradient emas. Standart qiymat avval
// `'from-indigo-500 to-purple-600'` edi va `bg-gradient-to-br` ostiga
// qo'yilardi: remap'dan keyin u qizil→ko'k gradient berardi. Bugun hamma
// chaqiruv `color=` uzatadi, ya'ni ko'rinadigan xato yo'q edi — lekin
// `color` siz qo'shilgan yangi karta o'sha gradientni olib qolardi.
const StatCard = ({ label, value, sub, icon, color = 'bg-surface-2 text-text-secondary', glow }) => (
  <div className={`stat-card glass rounded-2xl p-5 card-hover ${glow || ''}`}>
    <div className="flex items-start justify-between mb-4">
      <div className={`feature-icon ${color} opacity-90`}>{icon}</div>
      {sub && <span className="text-xs text-success font-medium font-data">{sub}</span>}
    </div>
    {/* `font-data` — qiymat almashganda ustun sakramasin (tabular-nums). */}
    <div className="text-2xl font-bold font-data text-text-primary mb-1">{value}</div>
    <div className="text-sm text-text-secondary">{label}</div>
  </div>
);

// ─── Dashboard ichki navigatsiyasi ↔ URL (umumiy yordamchi) ───────────────────
// StudentDashboard'da yozilgan URL-sync namunasini (PAGE_TO_PATH / PATH_TO_PAGE,
// pushState, popstate) barcha rol dashboardlari (owner/manager/admin/teacher/
// parent) uchun qayta ishlatish mumkin bo'lsin deb bitta joyga chiqarildi.
//
// Foydalanish:
//   const dashUrl = makeDashboardUrlSync('/dashboard/owner', ['home','requests',...]);
//   const [page, setPage] = dashUrl.usePageState();   // URL-aware page state
//
// Semantikasi StudentDashboard bilan bir xil:
//  • `home` (ro'yxatdagi birinchi/maxsus kalit) base URL'iga to'g'ri keladi
//    (masalan /dashboard/owner), qolganlari /dashboard/owner/<key> bo'ladi.
//  • Faqat ro'yxatdagi kalitlar URL'ga yoziladi. Noma'lum/maxsus kalitlar
//    (masalan 'analytics' — app-level alohida sahifa) state'ni o'zgartiradi-yu,
//    URL'ga tegmaydi (pushState chaqirilmaydi).
//  • Brauzer orqaga/oldinga (popstate) ichki tab'ni tiklaydi, lekin faqat URL
//    hali shu dashboard namespace'ida bo'lsa; aks holda app-level router boshqaradi.
const makeDashboardUrlSync = (base, pageKeys, homeKey = 'home') => {
  const cleanBase = base.replace(/\/+$/, '') || '/';
  const PAGE_TO_PATH = pageKeys.reduce((acc, key) => {
    acc[key] = key === homeKey ? cleanBase : `${cleanBase}/${key}`;
    return acc;
  }, {});
  const PATH_TO_PAGE = Object.fromEntries(
    Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page])
  );
  // Joriy URL pathname'idan dashboard sub-sahifasini aniqlaydi. Aniq mos
  // kelmasa, lekin URL shu base namespace'ida bo'lsa — homeKey'ga tushadi.
  const pageFromPath = () => {
    try {
      const raw = (window.location.pathname || cleanBase).replace(/\/+$/, '') || cleanBase;
      return PATH_TO_PAGE[raw] || homeKey;
    } catch {
      return homeKey;
    }
  };
  // URL hali shu dashboard namespace'ida ekanini tekshiradi (popstate filtri).
  const inNamespace = () => {
    try {
      const path = (window.location.pathname || '').replace(/\/+$/, '') || '/';
      return path === cleanBase || path.startsWith(`${cleanBase}/`);
    } catch {
      return false;
    }
  };
  // URL-aware page state hook. setPage(key) state'ni o'zgartiradi va (kalit
  // ro'yxatda bo'lsa) manzil satrini pushState bilan yangilaydi.
  // `initialResolver` — ixtiyoriy: boshlang'ich tab'ni URL'dan boshqa manbadan
  // (masalan sessionStorage deep-link) aniqlash uchun. `null`/`undefined`
  // qaytarsa, URL'dan olinadi. Qaytgan kalit ro'yxatda bo'lsa, URL ham mos
  // ravishda replaceState bilan yangilanadi (manzil satri to'g'ri ko'rinsin).
  const usePageState = (initialResolver) => {
    const [page, setPageState] = React.useState(() => {
      try {
        const override = typeof initialResolver === 'function' ? initialResolver() : null;
        if (override && PAGE_TO_PATH[override]) {
          try {
            const path = PAGE_TO_PATH[override];
            if (window.location.pathname.replace(/\/+$/, '') !== path) {
              window.history.replaceState({ dashboardBase: cleanBase, dashboardPage: override }, '', path);
            }
          } catch {}
          return override;
        }
      } catch {}
      return pageFromPath();
    });
    const setPage = React.useCallback((key) => {
      setPageState(key);
      const path = PAGE_TO_PATH[key];
      if (!path) return; // noma'lum/maxsus kalit — URL'ga tegmaymiz
      try {
        if (window.location.pathname.replace(/\/+$/, '') !== path) {
          window.history.pushState({ dashboardBase: cleanBase, dashboardPage: key }, '', path);
        }
      } catch {}
    }, []);
    React.useEffect(() => {
      const onPop = () => {
        if (inNamespace()) setPageState(pageFromPath());
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);
    return [page, setPage, setPageState];
  };
  return { base: cleanBase, PAGE_TO_PATH, PATH_TO_PAGE, pageFromPath, inNamespace, usePageState };
};

// ─── Sidebar inner content (shared between desktop + mobile drawer) ────────────
const SidebarContent = ({ items, activePage, setPage, user, onLogout, logoClick, collapsed, setCollapsed, onItemClick }) => (
  <>
    {/* Logo */}
    <div className={`relative flex items-center py-5 border-b border-edge cursor-pointer flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'}`} onClick={logoClick}>
      <BrandLogo compact={collapsed} size={collapsed ? 'sm' : 'md'} />
      {setCollapsed && (
        <button
          className={`${collapsed ? 'absolute right-1 bottom-1' : 'ml-auto'} text-text-secondary hover:text-text-primary transition-colors`}
          onClick={e => { e.stopPropagation(); setCollapsed(!collapsed); }}
          aria-label={collapsed ? 'Panelni kengaytirish' : 'Panelni yig\'ish'}
        >
          <Icon name="menu" size={16} />
        </button>
      )}
    </div>

    {/* Nav items */}
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
      {items.map(item => (
        item.divider
          ? <div key={item.key} className="my-2 border-t border-edge" />
          : <button key={item.key}
              className={`sidebar-item group w-full flex items-center rounded-xl text-left transition-all duration-200 ${
                collapsed ? 'justify-center px-0 py-3' : 'gap-3.5 px-4 py-3'
              } ${activePage === item.key ? 'active' : ''}`}
              onClick={() => { setPage(item.key); onItemClick && onItemClick(); }}>
              {/* Faol belgi: gradient va rangli soya o'rniga qattiq akcent
                  yuza. To'ldirilgan va ustida ikonka bor — demak `accent` emas,
                  `accent-fill` + `on-accent` (`.btn-primary` bilan bir xil
                  juftlik). */}
              <span className={`sidebar-icon flex items-center justify-center flex-shrink-0 w-9 h-9 rounded-full transition-colors duration-200 ${activePage === item.key ? 'bg-accent-fill text-on-accent' : 'bg-surface-1 text-text-secondary group-hover:bg-surface-2'}`}>
                <Icon name={item.icon} size={17} />
              </span>
              {!collapsed && (
                <span className={`text-[15px] font-semibold tracking-wide transition-colors duration-200 ${activePage === item.key ? 'text-text-primary' : 'text-text-secondary'}`}>
                  {item.label}
                </span>
              )}
              {!collapsed && item.badge && (
                <span className="ml-auto bg-accent/15 text-accent text-[11px] font-bold font-data px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
      ))}
    </nav>

    {/* User footer */}
    <div className="p-3 border-t border-edge flex-shrink-0">
      <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-surface-1 cursor-pointer">
        <Avatar name={user?.name || 'U'} src={user?.avatarUrl || ''} size={32} />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{user?.name}</div>
            <div className="text-xs text-text-secondary truncate">{user?.role}</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={onLogout} className="text-text-secondary hover:text-error transition-colors p-1" aria-label="Chiqish">
            <Icon name="logout" size={16} />
          </button>
        )}
      </div>
    </div>
  </>
);

// ─── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({ items, activePage, setPage, user, onLogout, logoClick, mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const sharedProps = { items, activePage, setPage, user, onLogout, logoClick };

  return (
    <>
      {/* Desktop sidebar — hidden below lg */}
      {/* Avval qattiq `rgba(5,5,8,0.95)` edi — mobil drawer (`.mobile-drawer`)
          esa allaqachon `ground` ishlatardi, ya'ni ikkita panel har xil to'qlikda
          chiqardi. Endi ikkalasi ham bitta token'da. */}
      <aside
        className={`sidebar-desktop flex flex-col bg-ground border-r border-edge h-screen sticky top-0 flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
        <SidebarContent {...sharedProps} collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      {/* Mobile drawer — shown below lg when mobileOpen */}
      {mobileOpen && (
        <>
          <div className="mobile-drawer-backdrop lg:hidden" onClick={onMobileClose} />
          <div className="mobile-drawer lg:hidden">
            <SidebarContent {...sharedProps} collapsed={false} setCollapsed={null} onItemClick={onMobileClose} />
          </div>
        </>
      )}
    </>
  );
};

// ─── Mobile Bottom Navigation ──────────────────────────────────────────────────
const MobileBottomNav = ({ items, activePage, setPage }) => {
  // Pastki panel haqiqiy nav ro'yxatidan render bo'ladi (divider'lardan tashqari).
  // Avval bu yerda `.slice(0, 5)` qattiq kesish bor edi — u nav ro'yxati 5 tadan
  // uzun bo'lganda qolgan bo'limlarni mobil panelda umuman ko'rsatmasdi
  // (yashirin qolardi). Har bir dashboard endi mobil uchun aynan mos (<=5 ta)
  // ro'yxat uzatadi, shuning uchun kesish keraksiz — panel to'g'ri "by
  // construction".
  const mainItems = items.filter(i => !i.divider);
  return (
    <nav className="mobile-bottom-nav lg:hidden">
      {mainItems.map(item => (
        <button key={item.key} onClick={() => setPage(item.key)}
          className={`mobile-bottom-nav-item ${activePage === item.key ? 'active' : ''}`}>
          {/* To'ldirilgan pill va badge — ustida ikonka/raqam bor, shuning uchun
              `accent` emas, `accent-fill` + `on-accent`. */}
          <span className={`flex items-center justify-center transition-colors duration-200 ${activePage === item.key ? 'w-8 h-8 rounded-full bg-accent-fill text-on-accent' : ''}`}>
            <Icon name={item.icon} size={activePage === item.key ? 16 : 20} />
          </span>
          <span className="label truncate w-full text-center block">{item.label}</span>
          {item.badge && activePage !== item.key && (
            <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-accent-fill rounded-full text-on-accent text-[9px] font-data flex items-center justify-center font-bold">{item.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
};

// ─── Topbar ────────────────────────────────────────────────────────────────────
const Topbar = ({ title, subtitle, actions, user, onMenuClick }) => {
  const Bell = typeof NotificationsBell !== 'undefined' ? NotificationsBell : (window && window.NotificationsBell);
  return (
    <header className="glass px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex min-w-0 items-center gap-3">
        <button className="lg:hidden flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary" onClick={onMenuClick} aria-label="Menyu"><Icon name="menu" size={20} /></button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold text-text-primary">{title}</h1>
          {subtitle && <p className="truncate text-xs text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {actions}
        {user && Bell ? <Bell user={user} /> : (
          <button className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary" aria-label="Bildirishnomalar">
            <Icon name="bell" size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full"></span>
          </button>
        )}
      </div>
    </header>
  );
};

// ─── Modal ─────────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children, width = 'max-w-lg', style, contentClassName = '' }) => {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${width} ${contentClassName}`} onClick={e => e.stopPropagation()} style={style}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors" aria-label="Yopish"><Icon name="x" size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ─── ConfirmModal ────────────────────────────────────────────────────────────
// Telegram WebApp ichida window.confirm() bloklanadi yoki tashqi oynada
// ochiladi — foydalanuvchi savolni ko'rmaydi. Shu sabab inline tasdiqlash
// modali ishlatiladi. `open` true bo'lganda Modal ustida "Ha / Yo'q"
// tugmalarini ko'rsatadi; onConfirm yoki onClose chaqiriladi.
const ConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title = 'Tasdiqlaysizmi?',
  message = '',
  confirmText = 'Ha',
  cancelText = "Yo'q",
  danger = false,
  busy = false,
}) => {
  if (!open) return null;
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} width="max-w-sm">
      {message && <p className="text-sm text-text-secondary leading-relaxed mb-5">{message}</p>}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="btn-ghost text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`font-semibold rounded-xl py-2.5 px-5 text-sm disabled:opacity-50 ${
            danger ? 'btn-danger' : 'btn-primary'
          }`}
        >
          {busy ? '...' : confirmText}
        </button>
      </div>
    </Modal>
  );
};

// ─── LiveProctorModal (Jonli Video, Ekran & Ovoz Nazorati) ───────────────────
const LiveProctorModal = ({
  open,
  onClose,
  sessionId,
  studentName = "O'quvchi",
  olympiadTitle = 'Olimpiada',
  onDisqualify,
  onWarning,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [warningSent, setWarningSent] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [viewMode, setViewMode] = useState('both'); // 'both' | 'camera' | 'screen'
  const pollTimerRef = useRef(null);

  const fetchLiveFrame = async () => {
    if (!sessionId) return;
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const res = await globalThis.OlympyApi.getLiveProctorFrame(sessionId, token);
      setData(res);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !sessionId) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      setData(null);
      setLoading(true);
      setWarningSent(false);
      return;
    }

    fetchLiveFrame();
    pollTimerRef.current = setInterval(fetchLiveFrame, 1200);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      try {
        const token = globalThis.OlympyApi?.getToken?.();
        globalThis.OlympyApi.sendProctorSignal(sessionId, { action: 'stop_stream' }, token).catch(() => {});
      } catch {}
    };
  }, [open, sessionId]);

  const handleSendWarning = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      await globalThis.OlympyApi.sendProctorSignal(sessionId, {
        action: 'warning',
        payload: { message: "Nazoratchi ogohlantirishi: Iltimos, test oynasidan chiqmang va kameraga qarang!" }
      }, token);
      setWarningSent(true);
      setTimeout(() => setWarningSent(false), 4000);
      if (onWarning) onWarning(sessionId);
    } catch (err) {
      alert("Ogohlantirish yuborishda xatolik: " + err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDisqualify = async () => {
    if (!confirm(`${studentName || "O'quvchi"}ni qoidabuzarlik (cheating) sababli imtihondan chetlatishni tasdiqlaysizmi?`)) {
      return;
    }
    setActionBusy(true);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      await globalThis.OlympyApi.reviewCheatingCase(sessionId, 'disqualify', token);
      alert("O'quvchi imtihondan chetlatildi (Disqualified).");
      if (onDisqualify) onDisqualify(sessionId);
      onClose();
    } catch (err) {
      alert("Chetlatishda xatolik: " + err.message);
    } finally {
      setActionBusy(false);
    }
  };

  if (!open) return null;

  const audioLevel = data?.audio_level || 0;
  const hasLiveFrame = Boolean(data?.frame);
  const hasScreenFrame = Boolean(data?.screen_frame);
  const faceDetected = data?.face_detected ?? true;
  const speechDetected = data?.speech_detected ?? (audioLevel > 35);
  const isSwitchedAway = Boolean(data?.app_switched || data?.is_in_background);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jonli Proktoring & Ekran Nazorati"
      width="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Header Info Banner */}
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 border border-edge">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-primary truncate">{data?.student_name || studentName}</h3>
              <span className="rounded bg-accent/15 border border-accent/45 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                {data?.phone || 'Online'}
              </span>
              {data?.tab_escapes > 0 && (
                <span className="rounded bg-warning/15 border border-warning/45 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                  ⚠️ {data.tab_escapes} ta chiqish
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-secondary font-medium truncate">{data?.olympiad_title || olympiadTitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 border border-error/45 px-2.5 py-1 text-[10px] font-bold text-error animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-error"></span>
              JONLI EFIR
            </span>
          </div>
        </div>

        {/* Real-time App/Tab Switch Alert Banner */}
        {isSwitchedAway && (
          <div className="rounded-xl bg-error/20 border-2 border-error p-3.5 text-xs text-error flex items-center justify-between gap-3 animate-pulse shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-bounce">🚨</span>
              <div>
                <div className="font-black text-sm uppercase tracking-wide">O'QUVCHI HOZIR TESTDAN CHIQDI!</div>
                <div className="text-[11px] text-error/90 font-semibold mt-0.5">
                  Boshqa ilova yoki saytga o'tgan. Chiqishlar soni: {data?.tab_escapes || 1} marta.
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDisqualify}
              className="px-3.5 py-2 rounded-xl bg-error text-white font-black text-xs hover:bg-error/90 transition shrink-0 shadow-md"
            >
              Chetlatish ⛔
            </button>
          </div>
        )}

        {/* View Switcher Tabs (agar ham kamera, ham ekran mavjud bo'lsa) */}
        {hasScreenFrame && (
          <div className="flex items-center justify-center gap-1.5 p-1 bg-surface-2 rounded-xl border border-edge">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'both' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              🔲 Kamera + Ekran
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'camera' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              📷 Faqat Kamera
            </button>
            <button
              type="button"
              onClick={() => setViewMode('screen')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${viewMode === 'screen' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              🖥️ Faqat Ekran
            </button>
          </div>
        )}

        {/* Video / Screen Stream Displays */}
        <div className={`grid gap-3 ${viewMode === 'both' && hasScreenFrame ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {/* Camera Feed */}
          {(viewMode === 'camera' || viewMode === 'both' || !hasScreenFrame) && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-edge shadow-inner flex items-center justify-center">
              {loading && !hasLiveFrame && (
                <div className="flex flex-col items-center gap-2 text-white/70 text-xs font-bold">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
                  <span>Kameraga ulanmoqda...</span>
                </div>
              )}

              {!loading && !hasLiveFrame && (
                <div className="flex flex-col items-center gap-2 text-center p-6 text-white/60">
                  <span className="text-3xl">📷</span>
                  <p className="text-xs font-bold text-white">Kamera signali kutilmoqda</p>
                  <p className="text-[11px] text-white/50 max-w-xs">
                    O'quvchi kamerasini yoqqanda video shu yerda ko'rinadi.
                  </p>
                </div>
              )}

              {hasLiveFrame && (
                <img
                  src={data.frame}
                  alt="Live Proctor Feed"
                  className="h-full w-full object-contain transition-opacity duration-200"
                />
              )}

              {hasLiveFrame && (
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <span className="rounded-md bg-black/60 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-white/10">
                    <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                    Kamera
                  </span>
                  {!faceDetected && (
                    <span className="rounded-md bg-error/80 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-error">
                      ⚠️ Yuz ko'rinmayapti
                    </span>
                  )}
                </div>
              )}

              {/* Audio meter */}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3 rounded-xl bg-black/75 backdrop-blur-md p-2 border border-white/10 text-white">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsAudioMuted(!isAudioMuted)}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${isAudioMuted ? 'bg-surface-2 text-text-secondary border-edge' : 'bg-accent text-white border-accent'}`}
                    title={isAudioMuted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                  >
                    <Icon name="mic" size={13} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-white/80">Mikrofon</span>
                      <span className={speechDetected ? 'text-warning font-extrabold' : 'text-white/60'}>
                        {isAudioMuted ? "O'chirilgan" : speechDetected ? 'Ovoz 🎙️' : `${Math.round(audioLevel)}%`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-28 md:w-36 overflow-hidden rounded-full bg-white/20">
                      <div
                        className={`h-full transition-all duration-200 ${audioLevel > 60 ? 'bg-error' : audioLevel > 30 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${isAudioMuted ? 0 : Math.min(100, Math.max(5, audioLevel))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[10px] font-mono text-white/50 shrink-0">
                  {data?.updated_at ? new Date(data.updated_at).toLocaleTimeString() : '...'}
                </div>
              </div>
            </div>
          )}

          {/* Screen Share Feed */}
          {(viewMode === 'screen' || viewMode === 'both') && hasScreenFrame && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-edge shadow-inner flex items-center justify-center">
              <img
                src={data.screen_frame}
                alt="Live Student Screen"
                className="h-full w-full object-contain transition-opacity duration-200"
              />
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="rounded-md bg-accent/80 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 border border-accent">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                  🖥️ O'quvchi Ekrani
                </span>
              </div>
            </div>
          )}
        </div>

        {warningSent && (
          <div className="rounded-xl bg-success/15 border border-success/45 p-3 text-xs font-bold text-success flex items-center gap-2 animate-fadeIn">
            <Icon name="check" size={15} />
            <span>O'quvchi ekraniga ogohlantirish xabari muvaffaqiyatli yetkazildi!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-edge">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLiveFrame}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-edge bg-surface-1 px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-2 transition"
            >
              <Icon name="sparkles" size={13} />
              <span>Yangilash</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleSendWarning}
              className="inline-flex items-center gap-1.5 rounded-xl border border-warning/45 bg-warning/15 px-3.5 py-2 text-xs font-bold text-warning hover:bg-warning/25 transition disabled:opacity-50"
            >
              <Icon name="info" size={13} />
              <span>Ogohlantirish yuborish</span>
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleDisqualify}
              className="inline-flex items-center gap-1.5 rounded-xl border border-error/45 bg-error/15 px-3.5 py-2 text-xs font-bold text-error hover:bg-error/25 transition disabled:opacity-50"
            >
              <Icon name="trash" size={13} />
              <span>Chetlatish (Disqualify)</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ─── AvatarCropModal ───────────────────────────────────────────────────────────
const AvatarCropModal = ({ open, onClose, imageSrc, onCropComplete }) => {
  if (!open || !imageSrc) return null;
  const V = 260; // Viewport size
  const C = 400; // Output Canvas size

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageElementRef = useRef(null);

  // Load image dimensions
  useEffect(() => {
    if (!imageSrc) return;
    setImgLoaded(false);
    setImgDimensions(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const scaleFactor = Math.max(V / img.naturalWidth, V / img.naturalHeight);
      const baseWidth = img.naturalWidth * scaleFactor;
      const baseHeight = img.naturalHeight * scaleFactor;
      setImgDimensions({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        baseWidth,
        baseHeight
      });
      setImgLoaded(true);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
  }, [imageSrc]);

  const clampOffset = (x, y, currentScale, baseW, baseH, viewportSize) => {
    const W_scaled = baseW * currentScale;
    const H_scaled = baseH * currentScale;
    const limitX = Math.max(0, (W_scaled - viewportSize) / 2);
    const limitY = Math.max(0, (H_scaled - viewportSize) / 2);
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y))
    };
  };

  // Restrict offset when scale changes
  const handleScaleChange = (newScale) => {
    setScale(newScale);
    if (imgDimensions) {
      setOffset(prev => clampOffset(prev.x, prev.y, newScale, imgDimensions.baseWidth, imgDimensions.baseHeight, V));
    }
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    dragStart.current = { x: clientX - offset.x, y: clientY - offset.y };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rawX = clientX - dragStart.current.x;
      const rawY = clientY - dragStart.current.y;
      if (imgDimensions) {
        const clamped = clampOffset(rawX, rawY, scale, imgDimensions.baseWidth, imgDimensions.baseHeight, V);
        setOffset(clamped);
      }
    };

    const handleGlobalUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isDragging, imgDimensions, scale]);

  const handleSave = () => {
    if (!imgDimensions || !imageElementRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = C;
    canvas.height = C;
    const ctx = canvas.getContext('2d');

    const canvasScale = C / V;
    const W_scaled = imgDimensions.baseWidth * scale;
    const H_scaled = imgDimensions.baseHeight * scale;
    const left_edge = (V / 2 + offset.x) - W_scaled / 2;
    const top_edge = (V / 2 + offset.y) - H_scaled / 2;

    ctx.drawImage(
      imageElementRef.current,
      left_edge * canvasScale,
      top_edge * canvasScale,
      W_scaled * canvasScale,
      H_scaled * canvasScale
    );

    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <Modal open={open} onClose={onClose} title="Rasm joylashuvini sozlang" width="max-w-md">
      <div className="flex flex-col items-center gap-6">
        {/* The cropper viewport */}
        <div
          className="relative overflow-hidden bg-surface-2 rounded-2xl cursor-grab active:cursor-grabbing touch-none border border-edge"
          style={{ width: V, height: V, touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          {imgLoaded && imgDimensions && (
            <img
              ref={imageElementRef}
              src={imageSrc}
              alt="Crop preview"
              className="absolute select-none pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                width: imgDimensions.baseWidth,
                height: imgDimensions.baseHeight,
                maxWidth: 'none',
                maxHeight: 'none',
              }}
            />
          )}
          
          {/* SVG circular overlay */}
          <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
            <defs>
              {/* `white`/`black` — RANG EMAS, mask yorqinligi: oq = qoplanadi,
                  qora = teshik (kesish doirasi). Token'ga o'tkazilmaydi. */}
              <mask id="cropMask">
                <rect width="100%" height="100%" fill="white" />
                <circle cx="50%" cy="50%" r="48%" fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" style={{ fill: 'rgb(var(--color-ground) / 0.7)' }} mask="url(#cropMask)" />
            <circle cx="50%" cy="50%" r="48%" fill="none" style={{ stroke: 'rgb(var(--color-accent))' }} strokeWidth="2" strokeDasharray="4 4" />
          </svg>
        </div>

        {/* Slider Controls */}
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Kattalashtirish</span>
            <span className="font-data">{Math.round(scale * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleScaleChange(Math.max(1, scale - 0.2))}
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Kichraytirish"
            >
              <Icon name="search" size={16} />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={scale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="flex-1 accent-accent bg-surface-2 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleScaleChange(Math.min(3, scale + 0.2))}
              className="text-text-secondary hover:text-text-primary transition-colors"
              aria-label="Kattalashtirish"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 w-full mt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 py-2.5 rounded-xl text-sm"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-semibold"
          >
            Saqlash
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Spinner ───────────────────────────────────────────────────────────────────
// `border-current` — halqa atrofdagi MATN rangini oladi, ya'ni qaysi yuzada
// tursa o'sha yerda o'qiladi (qog'oz fonda ham, siyoh fonda ham, akcent tugma
// ichida ham). Avval qattiq `border-white/20 border-t-white` edi va light
// mavzuda ko'rinmasdi.
const Spinner = ({ size = 20, className = '' }) => (
  <span
    className={`inline-block flex-shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);

// ─── Button ──────────────────────────────────────────────────────────────────
// `loading` true bo'lsa: (1) tugma avtomatik disabled bo'ladi (double-submit
// himoyasi — bir nechta joyda buni qo'lda unutib qo'yishardi), (2) spinner
// ko'rsatiladi. `variant` — 'primary' | 'ghost' | 'danger'.
// `primary` avval `gradient-bg text-white` edi. `.gradient-bg` endi gradient
// emas, oddiy `surface-2` yuzasi — ya'ni oq matn och mavzuda yuzaga qo'shilib
// ketardi. Uchala variant ham endi `src/index.css` dagi tugma klasslaridan
// keladi (bitta joyda: fon, chegara, hover, fokus).
const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};
const Button = ({
  children, onClick, type = 'button', loading = false, disabled = false,
  variant = 'primary', className = '', ...rest
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-sm px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary} ${className}`}
    {...rest}
  >
    {loading && <Spinner size={14} />}
    {children}
  </button>
);

// ─── ErrorBanner ────────────────────────────────────────────────────────────
const ErrorBanner = ({ message, className = '' }) => {
  if (!message) return null;
  return (
    <div className={`rounded-xl border border-error/35 bg-error/10 text-error text-sm px-4 py-3 ${className}`} role="alert">
      {message}
    </div>
  );
};

// ─── useToast ────────────────────────────────────────────────────────────────
// Ko'p joyda (AdminDashboard va h.k.) toast bitta string state + bitta
// setTimeout bilan yasalgan edi: ikkinchi toast 3s ichida kelsa, birinchi
// toastning eski setTimeout'i uni muddatidan oldin yashirib yuborardi.
// useToast() bir nechta toastni id bo'yicha alohida kuzatadi — stacked
// ko'rsatiladi, biri ikkinchisini o'chirmaydi.
let _toastSeq = 0;
const useToast = () => {
  const [toasts, setToasts] = React.useState([]);
  const showToast = React.useCallback((message, { duration = 3000, variant = 'default' } = {}) => {
    const id = ++_toastSeq;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);
  const ToastHost = () => (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`glass rounded-xl px-4 py-3 text-sm text-text-primary shadow-2xl max-w-sm ${t.variant === 'error' ? 'border border-error/40' : 'border border-edge'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
  return { showToast, ToastHost };
};

// ─── Empty State ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon, title, desc, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-text-secondary mb-4">
      <Icon name={icon} size={28} />
    </div>
    <div className="text-text-primary font-medium mb-1">{title}</div>
    {desc && <div className="text-text-secondary text-sm mb-4">{desc}</div>}
    {action}
  </div>
);

// ─── DonutChart ───────────────────────────────────────────────────────────────
const DonutChart = ({ value, max = 100, color = '#C0362C', size = 80, label }) => {
  const r = 28, cx = 40, cy = 40, circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" style={{ stroke: 'rgb(var(--color-edge))' }} strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          strokeLinecap="round" strokeDashoffset={circ * 0.25} className="donut-ring"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        <text x="50%" y="50%" textAnchor="middle" dy=".3em" className="font-data"
          style={{ fill: 'rgb(var(--color-text-primary))' }} fontSize="14" fontWeight="700">{Math.round(pct * 100)}%</text>
      </svg>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </div>
  );
};

// ─── BarChart ─────────────────────────────────────────────────────────────────
const BarChart = ({ data }) => {
  // Pastki chegara 1 — barcha qiymat 0 bo'lganda (masalan o'quvchining hamma
  // oyi uchun average_score = 0) `max` 0 bo'lib qolardi va `0 / 0` → NaN,
  // ya'ni `height: "NaNpx"`. MonthBarChart/AdminBarChart bilan bir xil naqsh.
  const max = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          {/* Shaffoflik ATAYIN bir xil: avval `0.7 + i * 0.05` edi, ya'ni
              o'ngdagi ustun chapdagisidan yorqinroq chiqardi. Bu ma'lumot
              emas — qiymat farqi balandlikda beriladi; o'zgaruvchi shaffoflik
              esa yolg'on ikkinchi o'lcham yasardi. */}
          <div className="w-full rounded-t-md transition-all duration-700"
            style={{ height: `${(d.value / max) * 80}px`, background: 'rgb(var(--color-accent))' }} />
          <span className="text-xs text-text-secondary">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── SvgLineChart ─────────────────────────────────────────────────────────────
// Kutubxonasiz oddiy SVG line chart. `points` = [{ label, value (0..100), title }].
// Har bir nuqtaga hover'da `<title>` orqali tooltip ko'rinadi.
//
// viewBox konteynerning haqiqiy piksel kengligiga tenglashtiriladi (1:1 masshtab),
// shuning uchun SVG cho'zilmaydi. Ilgari qat'iy 320px viewBox + preserveAspectRatio="none"
// ishlatilardi: keng kartochkada butun rasm gorizontal 2-3 barobar cho'zilib,
// X o'qi yorliqlari va nuqtalar qiyshaygan/yamalgan ko'rinardi.
//
// Yagona natija (n === 1) alohida ishlanadi: bunday holda chiziq path'i faqat
// "M x,y" bo'lib hech narsa chizmasdi va grafik bo'sh maydonda "osilib qolgan"
// bitta nuqtaga aylanardi. Endi tekis punktir daraja ko'rsatiladi.
const SvgLineChart = ({ points = [], height = 160, stroke = '#C0362C' }) => {
  const wrapRef = useRef(null);
  const [boxW, setBoxW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBoxW(Math.round(el.clientWidth || 0));
    measure();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const n = points.length;
  const W = Math.max(240, boxW || 320), H = height, padX = 14, padTop = 14, padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const baseY = padTop + innerH;
  const xAt = (i) => n <= 1 ? W / 2 : padX + (innerW * i) / (n - 1);
  const yAt = (v) => baseY - (innerH * Math.max(0, Math.min(100, v))) / 100;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${baseY.toFixed(1)} L${xAt(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  const flatY = n === 1 ? yAt(points[0].value) : 0;
  // Yorliqlar ustma-ust tushmasligi uchun qadam: joy yetmasa bir nechtasi
  // o'tkazib yuboriladi (oxirgisi doim ko'rinadi).
  const LABEL_FONT = 9;
  const maxLabelChars = points.reduce((m, p) => Math.max(m, String(p.label ?? '').length), 0);
  const labelW = Math.max(20, maxLabelChars * LABEL_FONT * 0.62 + 8);
  const labelStep = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / labelW))));
  return (
    <div ref={wrapRef} className="w-full">
      {n === 0 ? (
        <div className="text-center text-text-secondary text-sm py-8">Hozircha ma'lumot yo'q</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: H }}>
          {[0, 25, 50, 75, 100].map(g => (
            <line key={g} x1={padX} x2={W - padX} y1={yAt(g)} y2={yAt(g)} style={{ stroke: 'rgb(var(--color-edge))' }} strokeWidth="1" />
          ))}
          {n > 1 ? (
            <>
              <path d={areaPath} fill={stroke} opacity="0.12" />
              <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x={padX} y={flatY} width={innerW} height={Math.max(0, baseY - flatY)} fill={stroke} opacity="0.1" />
              <line x1={padX} x2={W - padX} y1={flatY} y2={flatY} stroke={stroke} strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" opacity="0.6" />
            </>
          )}
          {points.map((p, i) => {
            // Chekka yorliqlar SVG'dan chiqib ketmasligi uchun boshi/oxiri
            // chetiga tiraladi (start/end anchor).
            const isFirst = n > 1 && i === 0;
            const isLast = n > 1 && i === n - 1;
            const labelX = isFirst ? padX : isLast ? W - padX : xAt(i);
            return (
              <g key={i}>
                {/* Nuqta atrofidagi halqa fon rangida — chiziqdan ajratib turadi. */}
                <circle cx={xAt(i)} cy={yAt(p.value)} r="4" fill={stroke}
                  style={{ stroke: 'rgb(var(--color-ground))' }} strokeWidth="1.5">
                  <title>{p.title || `${p.label}: ${p.value}%`}</title>
                </circle>
                {(n - 1 - i) % labelStep === 0 && (
                  <text x={labelX} y={H - 6} textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                    className="font-data" style={{ fill: 'rgb(var(--color-text-secondary))' }} fontSize={LABEL_FONT}>{p.label}</text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};

// ─── MonthBarChart ────────────────────────────────────────────────────────────
// `data` = [{ label, value }]. Ustun tepasida son ko'rsatiladi (dinamika).
const MonthBarChart = ({ data = [] }) => {
  if (!data.length) {
    return <div className="text-center text-text-secondary text-sm py-8">Hozircha ma'lumot yo'q</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="flex items-end gap-2 md:gap-3 h-40 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
          <span className="text-[10px] md:text-xs font-bold font-data text-text-primary">{d.value}</span>
          <div className="w-full rounded-t-lg transition-all duration-500"
            style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, background: 'rgb(var(--color-accent))' }} />
          <span className="text-[9px] md:text-[10px] text-text-secondary truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── SubjectBadge ─────────────────────────────────────────────────────────────
// Avval har fan o'z gradient chipiga ega edi (`from-blue-500/20 … text-blue-300`)
// va matn rangi ATAYIN och tanlangan — ya'ni faqat to'q fonga hisoblangan.
// Qog'oz mavzuda o'lchov: Matematika 1.53:1, Fizika/Informatika 1.87:1.
//
// Endi chip neytral: yuza `surface-2`, matn `text-primary` (dark 11.89:1,
// light 13.06:1). Fan bo'yicha farq CHEGARA rangida qoldi — chegara dekorativ
// (ma'noni fan NOMI o'zi olib yuradi), shuning uchun unga AA sharti qo'yilmaydi,
// lekin baribir semantik tokenlardan olingani uchun ikkala mavzuda ko'rinadi.
// Gradient qaytarilmadi.
//
// 9 fanga 6 token to'g'ri keladi — takrorlanish ataylab: yaqin fanlar bir
// chegarani bo'lishadi (til fanlari, tabiiy fanlar, ijtimoiy fanlar).
const subjectColors = {
  'Matematika': 'border-accent-2/60',
  'Ingliz tili': 'border-success/60',
  'Ona tili': 'border-warning/60',
  'Informatika': 'border-accent/60',
  'Fizika': 'border-error/60',
  'Kimyo': 'border-text-secondary/60',
  'Biologiya': 'border-success/60',
  'Tarix': 'border-warning/60',
  'Geografiya': 'border-accent-2/60',
};
const SubjectBadge = ({ subject }) => {
  const border = subjectColors[subject] || 'border-edge-strong';
  return <span className={`chip border bg-surface-2 text-text-primary ${border}`}>{subject}</span>;
};

// ─── TelegramMockup ───────────────────────────────────────────────────────────
// DIQQAT: bu Olympy interfeysi EMAS — Telegram ilovasining ko'rinishini
// takrorlaydigan illyustratsiya (skrinshotga o'xshash). Shu sabab Telegram'ning
// o'z ranglari (#17212b, #2b5278) va ular ustidagi oq matn ATAYIN qattiq
// yozilgan: mavzu bilan almashsa, mockup Telegram'ga o'xshamay qoladi.
// Token'ga o'tkazilmaydi.
//
// Kontrast tuzatildi, Telegram ranglari SAQLANGAN holda:
//   • "✅ Tasdiqlash" 2.62:1 edi — yashil #2EB82E yorug' yuza, ustiga oq matn
//     qo'yish xato juftlik. Fon o'sha-o'sha, matn siyohga o'tdi → 6.59:1.
//   • "❌ Rad etish" 4.23:1 edi — qizil to'q yuza, oq matn to'g'ri, faqat fon
//     bir tish to'qlashtirildi (#E53935 → #DF3330, ΔL 0.016) → 4.51:1.
//   • "online" 2.72:1 va "12:45 ✓✓" 1.95:1 — oq matnning alfasi ko'tarildi.
const TelegramMockup = ({ studentName, centerName, onApprove, onReject }) => (
  <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#17212b', maxWidth: 340, width: '100%', fontFamily: 'system-ui' }}>
    <div style={{ background: '#2b5278', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <BrandLogo compact size="sm" onDark />
      <div>
        <div className="text-white font-semibold text-sm">Olympy Bot</div>
        <div className="text-white/70 text-xs">online</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div style={{ background: '#2b5278', borderRadius: '4px 12px 12px 12px', padding: '10px 14px', marginBottom: 8 }}>
        <div className="text-white/80 text-sm leading-relaxed">
          🎓 <strong>Yangi o'quvchi ariza yubordi!</strong><br/>
          <br/>
          👤 O'quvchi: <strong>{studentName}</strong><br/>
          🏫 O'quv markaz: <strong>{centerName}</strong><br/>
          📅 Sana: {new Date().toLocaleDateString('uz-UZ')}<br/>
          <br/>
          Tasdiqlaysizmi?
        </div>
        <div className="text-white/70 text-xs mt-2 text-right">12:45 ✓✓</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onApprove} style={{ flex: 1, background: '#2eb82e', color: '#0b1f0b', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ✅ Tasdiqlash
        </button>
        <button onClick={onReject} style={{ flex: 1, background: '#df3330', color: 'white', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ❌ Rad etish
        </button>
      </div>
    </div>
  </div>
);

// ─── Universal API data hook ──────────────────────────────────────────────
// Use for any read-only fetch from the backend. Returns { data, loading,
// error, reload }. Pass deps to refetch when they change. Cancels stale
// state if the component unmounts mid-fetch.
const useApiData = (fetcher, deps = []) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick(t => t + 1), []);
  // Optimistic UI uchun: serverga so'rov yubormasdan, mahalliy data'ni darhol
  // yangilash imkonini beradi (xato bo'lsa avvalgi data'ga qaytarish mumkin).
  const mutate = React.useCallback((updater) => {
    setData(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fetcher())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload, mutate };
};

// ─── Unmount'da uzoq so'rovni bekor qilish hook'i ─────────────────────────
// AI/polling chaqiruvlari (`generateAiQuestions`, `extractPdfQuestions`,
// `runCode`, `explainQuestion`, `getStudyPlan` ...) backend Celery task'ini
// 2 soniyada bir so'rab turadi — 150 urinishgacha, ya'ni 5 daqiqagacha.
// Komponent unmount bo'lsa bu loop O'Z-O'ZIDAN TO'XTAMAYDI: `signal`
// berilmasa foydalanuvchi sahifadan chiqib ketganidan keyin ham backend va
// Gemini/Judge0 ga so'rov ketaveradi. Shu hook o'sha signalni beradi.
//
// Foydalanish:
//   const abort = useAbortOnUnmount();
//   const res = await OlympyApi.generateAiQuestions(payload, token, abort.getSignal());
//   ... catch (err) { if (abort.isAborted()) return; /* keyin xatoni ko'rsatish */ }
//
// Bitta komponentning barcha so'rovlari bitta controller'ni bo'lishadi —
// u FAQAT unmount'da bekor qilinadi, shuning uchun parallel so'rovlar
// bir-birini uzmaydi.
function useAbortOnUnmount() {
  const ref = React.useRef(null);
  // Lazy init (React'ning rasmiy naqshi) — controller birinchi render'da
  // yaratiladi, keyingi render'larda o'sha-o'zi qoladi.
  if (!ref.current) ref.current = new AbortController();
  React.useEffect(() => {
    // StrictMode qayta mount qilganda avvalgi controller allaqachon bekor
    // qilingan bo'ladi — yangisiga almashtiramiz.
    if (ref.current.signal.aborted) ref.current = new AbortController();
    return () => ref.current.abort();
  }, []);
  return {
    getSignal: () => ref.current.signal,
    // Xato abort sababli chiqdimi (ya'ni komponent unmount bo'ldimi)?
    // api.js abort'da native `AbortError` emas, `ApiError('aborted')` otadi —
    // shuning uchun xato obyektiga emas, signal holatiga qaraymiz.
    isAborted: () => ref.current.signal.aborted,
  };
}

// useDebounce — qiymat o'zgarganidan keyin `delay` ms kutib, eng oxirgi
// qiymatni qaytaradi. Qidiruv input'larida foydalaniladi: har bosishda
// emas, foydalanuvchi to'xtaganidan keyingina filtr/so'rov ishlaydi.
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// VirtualList — uzun ro'yxatlarni (100+ element) virtual scroll bilan
// ko'rsatadi: faqat ekranda ko'rinadigan elementlar DOM'da bo'ladi. Qisqa
// ro'yxatlarda shart emas — oddiy .map() ishlatilsin.
function VirtualList({ items, itemHeight = 60, containerHeight = 400, renderItem }) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
  const endIdx = Math.min(items.length, startIdx + visibleCount);
  const visibleItems = items.slice(startIdx, endIdx);

  return (
    <div
      style={{ height: containerHeight, overflowY: 'auto', position: 'relative' }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIdx * itemHeight, width: '100%' }}>
          {visibleItems.map((item, i) => renderItem(item, startIdx + i))}
        </div>
      </div>
    </div>
  );
}

// ─── To'lov tasdiqlash polling hook'i ─────────────────────────────────────────
// Foydalanuvchi to'lovni amalga oshirgach (Click/Payme), provayder webhook'i
// obunani aktivlashtirgancha bir necha soniya/daqiqa ketishi mumkin. Bu hook
// backend /api/billing/subscription/status/ ni davriy so'rab, premium faollashgani
// bilinishi bilan modal holatini 'success' ga o'tkazadi — foydalanuvchi reload
// qilmasdan natijani ko'radi.
//
// Holatlar: 'idle' (boshlanmagan) | 'checking' (tekshirilmoqda) |
//           'success' (premium faollashdi) | 'timeout' (vaqt tugadi, hali yo'q).
//
// start(onSuccess): pollingni boshlaydi. onSuccess — premium faollashganda bir
//   marta chaqiriladi (user state'ini yangilash uchun). reset(): holatni tozalab,
//   intervalni to'xtatadi (modal yopilganda). Component unmount bo'lganda interval
//   avtomatik tozalanadi.
const POLL_INTERVAL_MS = 3000;   // har 3 soniyada
const POLL_MAX_ATTEMPTS = 40;    // 40 × 3s = 2 daqiqa
function usePaymentPolling() {
  const [status, setStatus] = React.useState('idle');
  // setInterval id, urinishlar soni va parallel so'rovga qarshi guard'ni
  // ref'da saqlaymiz — bular qayta render keltirib chiqarmasligi kerak.
  const intervalRef = React.useRef(null);
  const attemptsRef = React.useRef(0);
  const inFlightRef = React.useRef(false);
  const onSuccessRef = React.useRef(null);

  const stop = React.useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = React.useCallback(() => {
    stop();
    attemptsRef.current = 0;
    inFlightRef.current = false;
    onSuccessRef.current = null;
    setStatus('idle');
  }, [stop]);

  const start = React.useCallback((onSuccess) => {
    // Avvalgi sessiya qolgan bo'lsa tozalaymiz.
    stop();
    attemptsRef.current = 0;
    inFlightRef.current = false;
    onSuccessRef.current = typeof onSuccess === 'function' ? onSuccess : null;
    setStatus('checking');

    const tick = async () => {
      // Oldingi so'rov hali tugamagan bo'lsa bu turni o'tkazib yuboramiz —
      // sekin tarmoqda so'rovlar bir-birining ustiga chiqib ketmasin.
      if (inFlightRef.current) return;
      attemptsRef.current += 1;
      inFlightRef.current = true;
      try {
        const token = OlympyApi.getToken();
        const res = await OlympyApi.getSubscriptionStatus(token);
        if (res && res.is_premium) {
          stop();
          setStatus('success');
          if (onSuccessRef.current) {
            try { onSuccessRef.current(res); } catch {}
            onSuccessRef.current = null;
          }
          return;
        }
      } catch {
        // Tarmoq/serverda vaqtinchalik xato — pollingni to'xtatmaymiz, keyingi
        // urinishda qayta so'raymiz (urinishlar limiti baribir ishlaydi).
      } finally {
        inFlightRef.current = false;
      }
      if (attemptsRef.current >= POLL_MAX_ATTEMPTS) {
        stop();
        setStatus('timeout');
      }
    };

    // Darhol bir marta tekshiramiz (webhook tez kelgan bo'lishi mumkin),
    // keyin har POLL_INTERVAL_MS da takrorlaymiz.
    tick();
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
  }, [stop]);

  // Unmount bo'lganda intervalni tozalaymiz (memory leak / setState-after-unmount
  // bo'lmasin).
  React.useEffect(() => stop, [stop]);

  return { status, start, reset };
}

// Export all
Object.assign(window, { Icon, BrandLogo, Avatar, Badge, StatCard, Sidebar, MobileBottomNav, Topbar, Modal, ConfirmModal, EmptyState, DonutChart, BarChart, SvgLineChart, MonthBarChart, SubjectBadge, TelegramMockup, subjectColors, useApiData, AvatarCropModal, useDebounce, VirtualList, formatUzPhoneInput, formatPhoneInput, detectDialCode, maskPhoneDisplay, COUNTRY_DIAL_CODES, PhoneField, Spinner, Button, ErrorBanner, useToast, usePaymentPolling });
