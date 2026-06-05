// pages/Splash.jsx — Duolingo uslubidagi Splash + Onboarding + tanlash ekrani.
//
// Oqim: Splash (1.5s, Olympy logo) → 3 ta onboarding slayd (progress dots,
// Skip) → "Boshlash" → tanlash (Kirish / Ro'yxatdan o'tish).
//
// Onboarding faqat BIRINCHI marta ko'rsatiladi: localStorage `onboarding_done`
// flag. Keyingi kirishlarda app.jsx bu komponentni umuman render qilmaydi.
//
// Telegram WebView: backdrop-blur va og'ir animatsiyalar YO'Q — faqat
// transform/opacity transitionlar (CSS, 0.2s ease). Mobile-first.

const ONBOARDING_DONE_KEY = 'onboarding_done';

const isOnboardingDone = () => {
  try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch { return false; }
};
const markOnboardingDone = () => {
  try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch {}
};

// 3 ta slayd. Rasm o'rnida yengil emoji-art (tashqi rasm yuklamaydi —
// WebView'da tez ochiladi). Keyinchalik PNG/SVG bilan almashtirsa bo'ladi.
const ONBOARDING_SLIDES = [
  {
    art: '🏆',
    bg: '#E8FBD9',
    title: "Olimpiadalarda g'olib bo'l",
    text: "O'z markazing va butun mamlakat bo'ylab musobaqalarda qatnash, yutuqlarga erish.",
  },
  {
    art: '📈',
    bg: '#E3F4FF',
    title: "O'z darajangni bil",
    text: "Har bir testdan keyin natijang, xatolaring va o'sishing — hammasi bir joyda.",
  },
  {
    art: '🎓',
    bg: '#F6ECFF',
    title: "Eng yaxshi markazni top",
    text: "O'quv markazlar reytingi orqali o'zingga mos joyni tanla va birga o's.",
  },
];

const SplashOnboarding = ({ onFinish }) => {
  const { useState, useEffect } = React;
  // 'splash' → 'slides' → 'choice'
  const [stage, setStage] = useState('splash');
  const [slide, setSlide] = useState(0);

  // Splash 1.5 sekund ko'rsatiladi, so'ng slaydlarga o'tadi.
  useEffect(() => {
    if (stage !== 'splash') return;
    const t = setTimeout(() => setStage('slides'), 1500);
    return () => clearTimeout(t);
  }, [stage]);

  // Onboarding tugadi — flag yozamiz va tanlangan sahifaga (login/register)
  // yoki tanlash ekraniga o'tamiz.
  const finish = (dest) => {
    markOnboardingDone();
    onFinish(dest);
  };

  const skip = () => setStage('choice');

  const nextSlide = () => {
    if (slide < ONBOARDING_SLIDES.length - 1) setSlide(s => s + 1);
    else setStage('choice');
  };

  // ─── Splash ───────────────────────────────────────────────────────────────
  if (stage === 'splash') {
    return (
      <div className="duo-splash">
        <div className="duo-splash-mark flex flex-col items-center gap-4">
          <BrandLogo size="xl" variant="wordmark" />
        </div>
      </div>
    );
  }

  // ─── Tanlash ekrani (Kirish / Ro'yxatdan o'tish) ───────────────────────────
  if (stage === 'choice') {
    return (
      <div className="duo-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-6">
            <BrandLogo size="xl" variant="wordmark" />
          </div>
          <h1 className="text-[26px] font-extrabold mb-2" style={{ color: 'var(--duo-text)' }}>
            Olympy bilan boshlang
          </h1>
          <p className="text-base mb-10 max-w-xs" style={{ color: 'var(--duo-text-secondary)' }}>
            Olimpiadalar, testlar va reytinglar — bir ilovada.
          </p>
          <div className="w-full max-w-sm space-y-3">
            <button type="button" className="duo-btn duo-btn--green" onClick={() => finish('register')}>
              Yangi hisob yaratish
            </button>
            <button type="button" className="duo-btn duo-btn--ghost" onClick={() => finish('login')}>
              Hisobim bor
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Onboarding slaydlari ──────────────────────────────────────────────────
  const s = ONBOARDING_SLIDES[slide];
  const isLast = slide === ONBOARDING_SLIDES.length - 1;
  return (
    <div className="duo-screen">
      {/* Yuqori qator: Skip (o'ngda) */}
      <div className="flex items-center justify-end px-4 pt-4" style={{ minHeight: 48 }}>
        <button type="button" className="duo-skip" onClick={skip}>
          O'tkazib yuborish
        </button>
      </div>

      {/* Slayd kontenti */}
      <div className="duo-slide" key={slide}>
        <div className="duo-slide-art" style={{ background: s.bg }}>
          <span role="img" aria-hidden="true">{s.art}</span>
        </div>
        <h2 className="duo-slide-title">{s.title}</h2>
        <p className="duo-slide-text">{s.text}</p>
      </div>

      {/* Pastki qism: progress dots + tugma */}
      <div className="px-6 pb-8 space-y-6">
        <div className="duo-dots">
          {ONBOARDING_SLIDES.map((_, i) => (
            <span key={i} className={`duo-dot ${i === slide ? 'duo-dot--active' : ''}`} />
          ))}
        </div>
        <div className="max-w-sm mx-auto w-full">
          <button type="button" className="duo-btn duo-btn--green" onClick={nextSlide}>
            {isLast ? 'Boshlash' : 'Davom etish'}
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SplashOnboarding, isOnboardingDone, markOnboardingDone });
