// pages/Landing.jsx
//
// avtomato.uz uslubidagi sodda, toza landing sahifa. To'q indigo/qora gradient
// fon, katta gradient hero sarlavha, minimalist dizayn. Telegram WebView'da
// backdrop-blur va og'ir animatsiyalar SEKIN ishlaydi — shu sababli faqat
// yengil CSS transition/keyframes ishlatiladi (particles/tilt/magnetic YO'Q).
//
// Auth routing: onNavigate('register') va onNavigate('login') — URL'lar app.jsx
// PAGE_URLS dan (/register, /login). Icon nomlari shared.jsx Icon komponentidan.

// ─── Count-up animatsiya ────────────────────────────────────────────────────
// Raqamni 0 dan sanab chiqadi. IntersectionObserver element ko'ringanda
// requestAnimationFrame bilan ishga tushiradi — layout o'zgarmaydi, Telegram
// WebView'da ham xavfsiz. Bir marta ishlaydi (startedRef).
const LandingCountUp = ({ end, suffix = '', duration = 1400, className = '' }) => {
  const ref = React.useRef(null);
  const startedRef = React.useRef(false);
  const [val, setVal] = React.useState(0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVal(end);
      return;
    }
    let rafId;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();
        const startTime = performance.now();
        const tick = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          setVal(Math.round(end * eased));
          if (progress < 1) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [end, duration]);

  return (
    <span ref={ref} className={className}>
      {val.toLocaleString('ru-RU').replace(/ /g, ' ')}{suffix}
    </span>
  );
};

const LandingPage = ({ onNavigate, user }) => {
  const [mobileMenu, setMobileMenu] = React.useState(false);

  // Kirgan foydalanuvchi uchun navbar'da "Boshlash" o'rniga dashboard'ga
  // o'tish tugmasi ko'rsatamiz (aks holda yana ro'yxatdan o'tishga yuborardi).
  const goPrimary = () => {
    if (user) onNavigate(user.activeRole || 'student');
    else onNavigate('register');
  };
  const primaryLabel = user ? 'Boshqaruv paneli' : 'Boshlash';

  // Hero stats (count-up). avtomato.uz uslubida 3-4 ta yirik raqam.
  const stats = [
    { end: 100, suffix: '+', label: 'AI savol soniyalar ichida' },
    { end: 9, suffix: '', label: 'modul bitta tizimda' },
    { end: 26, suffix: '+', label: 'premium imkoniyat' },
    { end: 4, suffix: '', label: 'oson qadamda ishga tushirish' },
  ];

  // 6 ta asosiy feature karta — har birida Icon va gradient halqa.
  const features = [
    {
      iconName: 'sparkles',
      title: 'AI savollar',
      desc: 'Sun\'iy intellekt yordamida soniyalar ichida yuzlab test savollarini avtomatik yarating.',
      grad: 'from-indigo-500 to-purple-600',
    },
    {
      iconName: 'chart',
      title: 'Progress tracking',
      desc: 'Har bir o\'quvchining o\'zlashtirishi, faollik kunlari va fanlar bo\'yicha o\'sishini kuzating.',
      grad: 'from-cyan-500 to-blue-600',
    },
    {
      iconName: 'award',
      title: 'Sertifikatlar',
      desc: 'Olimpiada g\'oliblariga QR-kodli rasmiy sertifikatlarni avtomatik tarzda taqdim eting.',
      grad: 'from-amber-500 to-orange-600',
    },
    {
      iconName: 'building',
      title: 'Guruh analitikasi',
      desc: 'Guruh va sinflarning o\'rtacha ballari, reytingi va savollar qiyinligini batafsil tahlil qiling.',
      grad: 'from-emerald-500 to-teal-600',
    },
    {
      iconName: 'trophy',
      title: 'Reyting tizimi',
      desc: 'Top o\'quvchilar va ballar bo\'yicha jonli, real vaqtda yangilanadigan reyting jadvali.',
      grad: 'from-rose-500 to-pink-600',
    },
    {
      iconName: 'shield',
      title: 'Olimpiadalar',
      desc: 'Online olimpiada o\'tkazing, proctoring bilan nazorat qiling va natijalarni avtomatik hisoblang.',
      grad: 'from-violet-500 to-indigo-600',
    },
  ];

  // 3 qadam — "Qanday ishlaydi".
  const steps = [
    {
      num: '01',
      iconName: 'edit',
      title: 'Ro\'yxatdan o\'ting',
      desc: 'Maktab, o\'quv markaz yoki tashkilot sifatida bir necha daqiqada platformaga qo\'shiling.',
    },
    {
      num: '02',
      iconName: 'sparkles',
      title: 'Savollar yarating',
      desc: 'AI, PDF yoki qo\'lda savollar bazasini to\'ldiring va olimpiada tashkil eting.',
    },
    {
      num: '03',
      iconName: 'chart',
      title: 'Natijani tahlil qiling',
      desc: 'O\'quvchilarni qo\'shing, olimpiada o\'tkazing va avtomatik hisoblangan reytingni ko\'ring.',
    },
  ];

  const navLinks = [
    { href: '#features', label: 'Imkoniyatlar' },
    { href: '#how', label: 'Qanday ishlaydi' },
    { href: '#stats', label: 'Natijalar' },
  ];

  // Scroll-reveal: elementlar ko'ringanda `.active` qo'shiladi (CSS index.css).
  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('active');
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    const els = document.querySelectorAll('.scroll-reveal');
    els.forEach((el) => observer.observe(el));
    // Hero elementlarini darhol ko'rsatamiz (observer kutmasdan).
    const heroEls = document.querySelectorAll('.hero-reveal');
    heroEls.forEach((el) => el.classList.add('active'));
    return () => els.forEach((el) => observer.unobserve(el));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#050510' }}>
      {/* ─── Navbar ─────────────────────────────────────────────────────────
          Telegram WebView'da backdrop-filter sekin — solid yarim-shaffof fon. */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(8, 8, 20, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 md:py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer border-0 bg-transparent p-0 min-w-0"
            onClick={() => window.scrollTo(0, 0)}
            aria-label="Olympy"
          >
            <BrandLogo size="md" />
          </button>

          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-white transition-colors">{l.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <button
              onClick={() => onNavigate('login')}
              className="hidden md:block btn-ghost px-4 py-1.5 rounded-xl text-sm font-medium"
            >
              Kirish
            </button>
            <button
              onClick={goPrimary}
              className="btn-primary px-3.5 md:px-5 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-bold"
            >
              {primaryLabel}
            </button>
            <button
              onClick={() => setMobileMenu((v) => !v)}
              className="md:hidden btn-ghost inline-flex items-center justify-center w-9 h-9 rounded-xl text-white/80"
              aria-label="Menyu"
              aria-expanded={mobileMenu}
            >
              <Icon name={mobileMenu ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div
            className="md:hidden fixed inset-0 z-40"
            onClick={() => setMobileMenu(false)}
            style={{ top: '56px', background: 'rgba(5, 5, 16, 0.85)' }}
          >
            <div
              className="absolute left-0 right-0 top-0 border-b border-white/10"
              style={{ background: 'rgba(8, 8, 20, 0.98)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1 text-sm">
                {navLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileMenu(false)}
                    className="px-3 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
                <button
                  onClick={() => { setMobileMenu(false); onNavigate('login'); }}
                  className="btn-ghost mt-2 px-4 py-2.5 rounded-xl text-sm font-medium text-left"
                >
                  Kirish
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ─── Hero ───────────────────────────────────────────────────────────
          To'q indigo gradient mesh fon — statik radial-gradient'lar (blur YO'Q,
          Telegram WebView'da xavfsiz). Katta gradient sarlavha + 2 CTA. */}
      <section
        className="relative overflow-hidden"
        style={{
          background: [
            'radial-gradient(ellipse 70% 60% at 20% 0%, rgba(99,102,241,0.22) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 55% at 85% 10%, rgba(168,85,247,0.18) 0%, transparent 55%)',
            'radial-gradient(ellipse 65% 50% at 50% 100%, rgba(34,211,238,0.10) 0%, transparent 60%)',
            '#050510',
          ].join(', '),
        }}
      >
        <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.18]" />

        <div className="max-w-4xl mx-auto px-4 md:px-6 py-20 md:py-32 relative z-10 text-center flex flex-col items-center">
          <div className="hero-reveal scroll-reveal inline-flex items-center gap-2 rounded-full px-4 py-2 mb-7 text-xs md:text-sm font-semibold text-indigo-200 border border-indigo-400/25" style={{ background: 'rgba(99,102,241,0.12)' }}>
            <Icon name="bolt" size={15} />
            Online olimpiada va test boshqaruv platformasi
          </div>

          <h1
            className="hero-reveal scroll-reveal text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.08] mb-6"
            style={{ textWrap: 'balance' }}
          >
            <span style={{ color: '#fff' }}>Ta'limni </span>
            <span className="gradient-text">avtomatlashtiring</span>
            <br className="hidden sm:block" />
            <span style={{ color: '#fff' }}> Olympy bilan</span>
          </h1>

          <p className="hero-reveal scroll-reveal text-base md:text-xl text-white/65 mb-9 max-w-2xl leading-relaxed">
            AI savollar, online olimpiada, jonli reyting, sertifikatlar va guruh analitikasi — barchasi bitta zamonaviy tizimda. Maktablar va o'quv markazlari uchun.
          </p>

          <div className="hero-reveal scroll-reveal flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 md:gap-4 w-full sm:w-auto">
            <button
              onClick={goPrimary}
              className="btn-primary inline-flex items-center justify-center gap-2 px-7 md:px-9 py-3.5 md:py-4 rounded-2xl text-sm md:text-base font-bold glow-blue w-full sm:w-auto"
            >
              <Icon name="bolt" size={18} />
              {user ? 'Boshqaruv paneli' : 'Bepul boshlash'}
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="btn-ghost inline-flex items-center justify-center gap-2 px-7 md:px-9 py-3.5 md:py-4 rounded-2xl text-sm md:text-base font-semibold w-full sm:w-auto"
            >
              <Icon name="eye" size={18} />
              Demo ko'rish
            </button>
          </div>

          <div className="hero-reveal scroll-reveal mt-7 text-xs md:text-sm text-white/40 inline-flex items-center gap-2">
            <Icon name="shield" size={14} className="text-emerald-400" />
            Bepul boshlash uchun karta talab qilinmaydi
          </div>
        </div>
      </section>

      {/* ─── Stats ──────────────────────────────────────────────────────────── */}
      <section id="stats" className="py-12 md:py-20 border-y border-white/5" style={{ background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`text-center scroll-reveal scroll-reveal-delay-${(i % 4) + 1}`}
              >
                <div className="text-3xl md:text-5xl font-black gradient-text mb-1.5">
                  <LandingCountUp end={s.end} suffix={s.suffix} />
                </div>
                <div className="text-xs md:text-sm text-white/50 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-16 md:py-28 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-12 md:mb-16 scroll-reveal">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 text-xs md:text-sm font-semibold text-purple-200 border border-purple-400/25" style={{ background: 'rgba(168,85,247,0.1)' }}>
            <Icon name="grid" size={15} />
            Imkoniyatlar
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-4" style={{ textWrap: 'balance' }}>
            Bitta tizimda hammasi
          </h2>
          <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">
            Tashkilotingiz, o'quvchilar va ota-onalar uchun zamonaviy yechimlar
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((f, i) => (
            <div
              key={f.title}
              className={`glass card-hover rounded-2xl p-6 md:p-8 flex flex-col group scroll-reveal scroll-reveal-delay-${(i % 4) + 1}`}
            >
              <div className={`feature-icon flex-shrink-0 bg-gradient-to-br ${f.grad} flex items-center justify-center text-white shadow-lg shadow-black/30 mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <Icon name={f.iconName} size={24} />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white mb-2.5 group-hover:text-indigo-200 transition-colors">{f.title}</h3>
              <p className="text-sm md:text-[15px] text-white/50 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Qanday ishlaydi (3 qadam) ──────────────────────────────────────── */}
      <section
        id="how"
        className="py-16 md:py-28"
        style={{ background: 'linear-gradient(180deg, #050510 0%, rgba(99,102,241,0.04) 50%, #050510 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-4 text-xs md:text-sm font-semibold text-cyan-200 border border-cyan-400/25" style={{ background: 'rgba(34,211,238,0.1)' }}>
              <Icon name="bolt" size={15} />
              Qanday ishlaydi
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4">3 ta oson qadam</h2>
            <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">
              Platformadan foydalanishni boshlash juda oson va tez
            </p>
          </div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 z-10">
            {/* Ulovchi chiziq (faqat desktop) */}
            <div className="hidden md:block absolute top-[40px] left-[16%] right-[16%] h-px bg-gradient-to-r from-indigo-500/20 via-purple-500/30 to-cyan-500/20 z-0 pointer-events-none" />

            {steps.map((s, i) => (
              <div
                key={s.num}
                className={`glass card-hover rounded-2xl p-6 md:p-8 flex flex-col items-center text-center relative z-10 group scroll-reveal scroll-reveal-delay-${(i % 3) + 1}`}
              >
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative mb-5 flex-shrink-0 group-hover:scale-105 transition-transform duration-300" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <span className="absolute -top-2.5 -right-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md">
                    {s.num}
                  </span>
                  <Icon name={s.iconName} size={22} className="text-indigo-300" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-white mb-2.5 group-hover:text-indigo-200 transition-colors">{s.title}</h3>
                <p className="text-sm md:text-[15px] text-white/45 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────────── */}
      <section className="py-16 md:py-28 max-w-4xl mx-auto px-4 md:px-6 scroll-reveal">
        <div
          className="rounded-3xl p-8 md:p-14 relative overflow-hidden border border-indigo-500/20 text-center"
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 15% 0%, rgba(99,102,241,0.22) 0%, transparent 60%)',
              'radial-gradient(ellipse 50% 50% at 85% 20%, rgba(168,85,247,0.18) 0%, transparent 60%)',
              'radial-gradient(ellipse 55% 45% at 50% 110%, rgba(34,211,238,0.14) 0%, transparent 60%)',
              'rgba(10,10,22,0.92)',
            ].join(', '),
          }}
        >
          <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.15]" />
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4" style={{ textWrap: 'balance' }}>
              Bugun boshlang
            </h2>
            <p className="text-white/55 mb-8 text-sm md:text-lg max-w-xl mx-auto leading-relaxed">
              Tashkilotingizni raqamli olimpiada platformasiga ulang — ro'yxatdan o'tish atigi 2 daqiqa vaqt oladi.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 md:gap-4 w-full sm:w-auto">
              <button
                onClick={goPrimary}
                className="btn-primary inline-flex items-center justify-center gap-2 px-8 md:px-10 py-3.5 md:py-4 rounded-2xl text-sm md:text-base font-bold glow-blue w-full sm:w-auto"
              >
                <Icon name="bolt" size={18} />
                {user ? 'Boshqaruv paneli' : 'Bepul boshlash'}
              </button>
              <button
                onClick={() => onNavigate('login')}
                className="btn-ghost inline-flex items-center justify-center gap-2 px-8 md:px-10 py-3.5 md:py-4 rounded-2xl text-sm md:text-base font-semibold w-full sm:w-auto"
              >
                Kirish
                <Icon name="chevronRight" size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer (minimalist) ────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-8 md:py-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <BrandLogo size="sm" />
          <div className="text-xs md:text-sm text-white/30">
            © {new Date().getFullYear()} Olympy. Barcha huquqlar himoyalangan.
          </div>
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6 text-xs md:text-sm text-white/40">
            <a href="mailto:sanjarruzmetov017@gmail.com" className="hover:text-white/70 transition-colors">Aloqa</a>
            <span className="w-px h-4 bg-white/10" aria-hidden="true" />
            <a
              href="https://t.me/proskilluz"
              target="_blank"
              rel="noreferrer noopener"
              className="text-white/40 hover:text-indigo-400 transition-colors flex items-center"
              aria-label="Telegram"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.06-.2-.07-.06-.18-.04-.26-.02-.11.02-1.85 1.18-5.22 3.47-.5.34-.94.51-1.34.5-.44-.01-1.29-.25-1.92-.46-.78-.25-1.39-.39-1.34-.83.03-.23.32-.47.85-.71 3.36-1.46 5.59-2.43 6.71-2.89 3.19-1.33 3.86-1.56 4.29-1.57.1 0 .31.02.45.13.12.09.15.21.17.3-.01.06.01.24 0 .38z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/proskilluz/"
              target="_blank"
              rel="noreferrer noopener"
              className="text-white/40 hover:text-pink-400 transition-colors flex items-center"
              aria-label="Instagram"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

Object.assign(window, { LandingPage });
