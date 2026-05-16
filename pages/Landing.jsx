// pages/Landing.jsx

const LandingPage = ({ onNavigate }) => {
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [activeScreen, setActiveScreen] = React.useState(0);
  const [imgErrors, setImgErrors] = React.useState({});

  const screens = [
    { label: 'Dashboard', icon: 'chart', img: '/screenshots/dashboard.svg', desc: 'Tadbirlar, natijalar va sertifikatlar bir joyda' },
    { label: 'Olimpiada', icon: 'trophy', img: '/screenshots/test.svg', desc: 'Vaqt, savollar va javoblar uchun qulay test oynasi' },
    { label: 'Reyting', icon: 'star', img: '/screenshots/leaderboard.svg', desc: 'Top o\'quvchilar va ballar bo\'yicha jonli reyting' },
    { label: 'Profil', icon: 'award', img: '/screenshots/profile.svg', desc: 'O\'quvchi yutuqlari, progress va sertifikatlar' },
  ];

  const heroMetrics = [
    { value: 'AI', label: 'savol yaratish' },
    { value: 'PDF', label: 'import' },
    { value: 'Live', label: 'reyting' },
  ];

  const features = [
    { icon: '✨', title: 'AI orqali savol yaratish', desc: 'Sun\'iy intellekt yordamida sekundlar ichida yuzlab savol yarating', color: 'from-indigo-500 to-purple-600' },
    { icon: '📄', title: 'PDF\'dan test yaratish', desc: 'Darslik yoki materiallardan avtomatik test savollarini yarating', color: 'from-cyan-500 to-blue-600' },
    { icon: '📱', title: 'Telegram orqali tasdiqlash', desc: 'Manager Telegram orqali bir tugma bilan arizalarni tasdiqlaydi', color: 'from-emerald-500 to-teal-600' },
    { icon: '🏆', title: 'Online olimpiada', desc: 'Real vaqtda olimpiada o\'tkazib, natijalarni avtomatik hisoblang', color: 'from-amber-500 to-orange-600' },
    { icon: '📊', title: 'Natijalar va reyting', desc: 'Batafsil statistika, grafik va reyting jadvallarini ko\'ring', color: 'from-pink-500 to-rose-600' },
    { icon: '👤', title: 'O\'quvchi profili', desc: 'Har bir o\'quvchining yutuqlari va natijalarini kuzating', color: 'from-violet-500 to-purple-600' },
  ];

  // Platforma yangi ishga tushgan — soxta marketing raqamlari o'rniga
  // platforma imkoniyatlari ko'rsatkichlari turadi.
  const stats = [
    { value: 'AI', label: 'Savol generator', icon: '✨' },
    { value: 'PDF', label: 'Avtomatik import', icon: '📄' },
    { value: 'Telegram', label: 'Bot integratsiyasi', icon: '💬' },
    { value: '24/7', label: 'Online platforma', icon: '⚡' },
  ];

  const steps = [
    { num: '01', title: 'Ro\'yxatdan o\'ting', desc: 'Maktab, o\'quv markaz yoki tashkilot sifatida platformaga qo\'shiling', icon: '🚀' },
    { num: '02', title: 'Savollar yarating', desc: 'AI, PDF yoki qo\'lda savollar bazasini to\'ldiring', icon: '✏️' },
    { num: '03', title: 'Olimpiada o\'tkazing', desc: 'O\'quvchilarni qo\'shing va olimpiada boshlang', icon: '🏆' },
    { num: '04', title: 'Natijalarni tahlil qiling', desc: 'Avtomatik hisoblangan natijalar va reytingni ko\'ring', icon: '📈' },
  ];

  // Backend'da subscription/plan modeli hali yo'q — narxlar faqat
  // ko'rsatma tariqasida turadi, "Boshlash" tugmasi mailto orqali
  // direktorlar bilan bog'lanish uchun. Real to'lov-modul tayyor bo'lganda
  // bu blok dynamicga o'zgartiriladi.
  const pricing = [
    { name: 'Boshlang\'ich', price: 'Bepul', desc: 'Kichik tashkilotlar uchun', features: ['5 ta olimpiada/oy', '50 ta o\'quvchi', 'Asosiy hisobotlar', 'Email qo\'llab-quvvatlash'], popular: false },
    { name: 'Professional', price: 'Bog\'laning', desc: 'O\'sib borayotgan tashkilotlar uchun', features: ['Cheksiz olimpiada', '500 ta o\'quvchi', 'AI savol yaratish', 'PDF import', 'Telegram bot', 'Batafsil tahlil'], popular: true },
    { name: 'Enterprise', price: 'Bog\'laning', desc: 'Yirik ta\'lim tarmoqlari uchun', features: ['Cheksiz hamma narsa', 'Maxsus integratsiya', 'Shaxsiy menejer', 'API kirish', 'SLA kafolati'], popular: false },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#060818' }}>
      {/* Navbar — Telegram WebView'da backdrop-filter sekin ishlaydi, shu sababli
          backdropFilter olib tashlangan va solid background ishlatilgan. */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer min-w-0" onClick={() => window.scrollTo(0,0)}>
            <BrandLogo size="md" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors cursor-pointer">Xususiyatlar</a>
            <a href="#how" className="hover:text-white transition-colors cursor-pointer">Qanday ishlaydi</a>
            <a href="#pricing" className="hover:text-white transition-colors cursor-pointer">Narxlar</a>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <button onClick={() => onNavigate('login')} className="hidden md:block btn-ghost px-4 py-1.5 rounded-xl text-sm font-medium">Kirish</button>
            <button onClick={() => onNavigate('register')} className="btn-primary px-3 md:px-4 py-1.5 rounded-xl text-xs md:text-sm font-semibold">Boshlash</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          minHeight: 'min(700px, calc(100svh - 96px))',
          backgroundImage: "linear-gradient(90deg, rgba(6,8,24,0.99) 0%, rgba(6,8,24,0.95) 48%, rgba(6,8,24,0.72) 72%, rgba(6,8,24,0.36) 100%), url('/screenshots/dashboard.svg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(6,8,24,0.1) 0%, rgba(6,8,24,0.9) 100%)' }} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-24 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-5 md:mb-6 text-xs md:text-sm text-cyan-100 border border-cyan-300/20" style={{ background: 'rgba(8,145,178,0.16)' }}>
              <Icon name="shield" size={16} />
              Online olimpiada, test va natija boshqaruvi
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-white leading-tight mb-5 md:mb-6" style={{ textWrap: 'balance' }}>
              PROLYMP — online olimpiada platformasi
            </h1>

            <p className="text-base md:text-xl text-white/70 mb-7 md:mb-9 max-w-2xl leading-relaxed">
              Ta'lim markazlari va maktablar uchun test yaratish, olimpiada o'tkazish, reyting yuritish va sertifikatlash jarayonini bitta tizimga jamlaydi.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 md:gap-4 mb-7 md:mb-9">
              <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-bold glow-blue">
                <Icon name="bolt" size={18} />
                Boshlash
              </button>
              <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-semibold">
                Kirish
                <Icon name="chevronRight" size={18} />
              </button>
              <button onClick={() => onNavigate('register')} className="btn-ghost inline-flex items-center justify-center gap-2 px-5 md:px-6 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-medium border-cyan-500/30 text-cyan-200">
                <Icon name="building" size={18} />
                Tashkilot qo'shish
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 md:gap-4 max-w-xl">
              {heroMetrics.map((m) => (
                <div key={m.label} className="rounded-2xl px-3 md:px-4 py-3 md:py-4 border border-white/10" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="text-xl md:text-3xl font-black text-white">{m.value}</div>
                  <div className="text-[11px] md:text-sm text-white/50 leading-tight">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Platforma ko'rinishi */}
      <section className="py-12 md:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(6,8,24,1) 0%, rgba(13,25,38,0.9) 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-14">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-200 border border-cyan-500/20">
              <Icon name="eye" size={16} />
              Loyiha ekranlari
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Mahsulot qanday ko'rinadi?</h2>
            <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">Dashboard, test oynasi, reyting va profil ekranlari landing ichida ko'rinadigan qilib joylandi.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-7 md:mb-10">
            {screens.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveScreen(i)}
                className="group text-left rounded-2xl overflow-hidden border border-white/10 transition-all hover:-translate-y-1"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div className="aspect-[16/10] overflow-hidden" style={{ background: '#071124' }}>
                  <img src={s.img} alt={s.label} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-cyan-200" style={{ background: 'rgba(34,211,238,0.12)' }}>
                    <Icon name={s.icon} size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{s.label}</div>
                    <div className="text-xs text-white/40 truncate">{s.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Tabs */}
          <div className="mb-6 md:mb-8 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex gap-2 md:gap-3 md:justify-center min-w-min">
              {screens.map((s, i) => {
                const active = activeScreen === i;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveScreen(i)}
                    className={`flex-shrink-0 flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl text-sm md:text-base font-semibold transition-all ${active ? 'text-white glow-blue' : 'glass text-white/60 hover:text-white'}`}
                    style={active ? { background: 'linear-gradient(135deg, #2563eb 0%, #0891b2 55%, #10b981 100%)' } : {}}
                  >
                    <Icon name={s.icon} size={18} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browser window mockup */}
          <div className="glass rounded-2xl overflow-hidden border border-white/10" style={{ background: '#0a0d1f' }}>
            {/* Browser chrome */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#ff5f57' }} />
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#febc2e' }} />
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#28c840' }} />
              </div>
              <div className="flex-1 mx-2 md:mx-4 px-3 py-1 md:py-1.5 rounded-md text-xs text-white/40 truncate" style={{ background: 'rgba(255,255,255,0.04)' }}>
                prolymp.uz/{screens[activeScreen].label.toLowerCase()}
              </div>
              <div className="hidden md:flex gap-1 text-white/20 text-xs flex-shrink-0">
                <span>⟲</span>
              </div>
            </div>

            {/* Screen content */}
            <div className="relative" style={{ minHeight: '260px' }}>
              <div
                key={activeScreen}
                className="screen-fade"
                style={{ animation: 'screenFade 0.4s ease-out' }}
              >
                {imgErrors[activeScreen] ? (
                  <div
                    className="flex flex-col items-center justify-center text-center px-6 py-16 md:py-24"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.08) 50%, rgba(34,211,238,0.06) 100%)',
                      minHeight: '320px',
                    }}
                  >
                    <div className="text-5xl md:text-6xl mb-4 spinner-icon" style={{ animation: 'spin 2s linear infinite', display: 'inline-block' }}>⏳</div>
                    <div className="text-lg md:text-xl font-bold text-white/80 mb-2">Tez orada</div>
                    <div className="text-sm text-white/40">Rasm yuklanmoqda...</div>
                  </div>
                ) : (
                  <img
                    src={screens[activeScreen].img}
                    alt={screens[activeScreen].label}
                    onError={() => setImgErrors(prev => ({ ...prev, [activeScreen]: true }))}
                    className="w-full block"
                    style={{
                      aspectRatio: '16 / 10',
                      objectFit: 'contain',
                      background: '#071124',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Caption */}
          <div className="text-center mt-5 md:mt-6">
            <div className="text-sm md:text-base text-white/60">
              <span className="text-white/90 font-semibold">{screens[activeScreen].label}</span>
              <span className="mx-2 text-white/20">·</span>
              <span>{screens[activeScreen].desc}</span>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes screenFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </section>

      {/* Stats */}
      <section className="py-10 md:py-16 border-y border-white/5" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
          {stats.map((s, i) => (
            <div key={i} className="text-center min-w-0">
              <div className="text-2xl md:text-3xl mb-1.5 md:mb-2">{s.icon}</div>
              <div className="text-2xl md:text-4xl font-black gradient-text mb-0.5 md:mb-1 truncate">{s.value}</div>
              <div className="text-xs md:text-sm text-white/40 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 md:py-24 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-16">
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-purple-300 border border-purple-500/20">✨ Xususiyatlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Hammasi bir joyda</h2>
          <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Tashkilotingizni raqamlashtirishning eng zamonaviy yechimi</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {features.map((f, i) => (
            <div key={i} className="glass rounded-2xl p-4 md:p-6 card-hover group">
              <div className={`feature-icon bg-gradient-to-br ${f.color} mb-3 md:mb-4 text-2xl`}>{f.icon}</div>
              <h3 className="text-base md:text-lg font-bold text-white mb-1.5 md:mb-2">{f.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-12 md:py-24" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-16">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-300 border border-cyan-500/20">🔄 Qanday ishlaydi</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">4 ta oson qadam</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={i} className="glass rounded-2xl p-4 md:p-6 card-hover flex gap-3 md:gap-4">
                <div className="gradient-text font-black text-3xl md:text-4xl opacity-30 flex-shrink-0">{s.num}</div>
                <div className="min-w-0">
                  <div className="text-xl mb-1.5 md:mb-2">{s.icon}</div>
                  <h3 className="text-base md:text-lg font-bold text-white mb-1">{s.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram flow */}
      <section className="py-12 md:py-24 max-w-5xl mx-auto px-4 md:px-6">
        <div className="glass rounded-3xl p-5 md:p-12 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="flex-1 min-w-0 text-center md:text-left">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-emerald-300 border border-emerald-500/20">📱 Telegram integratsiya</div>
            <h2 className="text-xl md:text-3xl font-black text-white mb-3 md:mb-4">Bir tugma bilan tasdiqlash</h2>
            <p className="text-white/40 leading-relaxed mb-5 md:mb-6 text-sm md:text-base">O'quvchi ariza yuborganida, manager Telegram botida bildirishnoma oladi va bir tugma bosish bilan tasdiqlaydi.</p>
            <div className="flex gap-3 justify-center md:justify-start">
              <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold">
                <Icon name="send" size={16} />
                Sinab ko'ring
              </button>
            </div>
          </div>
          <div className="flex-shrink-0">
            <TelegramMockup studentName="Ali Valiyev" centerName="ProSkill Academy" onApprove={() => {}} onReject={() => {}} />
          </div>
        </div>
      </section>

      {/* Pricing
          TODO: backend'da subscription/plan modeli hali yo'q. Bu blok faqat
          ko'rsatma. To'lov-modul tayyor bo'lganda dynamic ga o'zgartiriladi. */}
      <section id="pricing" className="py-12 md:py-24" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-16">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-indigo-300 border border-indigo-500/20">💎 Narxlar</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Qulay narxlar</h2>
            <p className="text-sm text-white/50 max-w-xl mx-auto">
              Hozircha platforma erkin foydalanish bosqichida. Yakuniy rejalar va to'lov modullari tez orada e'lon qilinadi — batafsil ma'lumot uchun bog'laning.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {pricing.map((p, i) => {
              // Bepul plan to'g'ridan-to'g'ri ro'yxatdan o'tishga, qolgan
              // ikkita plan esa email orqali bog'lanish uchun.
              const isFree = p.price === 'Bepul';
              const handleClick = () => {
                if (isFree) onNavigate('register');
                else window.location.href = `mailto:sanjarruzmetov017@gmail.com?subject=PROLYMP ${p.name} reja haqida`;
              };
              return (
                <div key={i} className={`rounded-2xl p-4 md:p-6 flex flex-col ${p.popular ? 'gradient-bg glow-blue' : 'glass'}`}>
                  {p.popular && <div className="text-xs font-bold text-white bg-white/20 rounded-full px-3 py-1 w-fit mb-3 md:mb-4">⭐ Mashhur</div>}
                  <div className={`text-sm font-medium mb-1 ${p.popular ? 'text-white/70' : 'text-white/50'}`}>{p.name}</div>
                  <div className={`text-2xl md:text-3xl font-black mb-1 ${p.popular ? 'text-white' : 'gradient-text'}`}>{p.price}</div>
                  {p.period && <div className={`text-sm mb-2 ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.period}</div>}
                  <div className={`text-xs mb-4 md:mb-6 ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.desc}</div>
                  <ul className="space-y-2 flex-1 mb-6">
                    {p.features.map((f, j) => (
                      <li key={j} className={`flex items-center gap-2 text-sm ${p.popular ? 'text-white/80' : 'text-white/60'}`}>
                        <span className={p.popular ? 'text-white' : 'text-indigo-400'}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleClick}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${p.popular ? 'bg-white text-indigo-600 hover:bg-white/90' : 'btn-ghost'}`}>
                    {isFree ? 'Boshlash' : "Bog'lanish"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 text-center">
        <div className="glass rounded-3xl p-6 md:p-12 relative overflow-hidden">
          <div className="hero-glow" style={{ background: '#6366f1', top: '-50%', left: '30%', opacity: 0.12 }} />
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4 relative">Bugun boshlang</h2>
          <p className="text-white/40 mb-6 md:mb-8 relative text-sm md:text-base">Tashkilotingizni raqamli olimpiada platformasiga ulang</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center sm:justify-center gap-3 md:gap-4 relative">
            <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-2xl text-sm md:text-base font-bold glow-blue">
              <Icon name="bolt" size={18} />
              Bepul boshlash
            </button>
            <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-2xl text-sm md:text-base font-semibold">
              Kirish
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 md:py-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
          </div>
          <div className="text-xs md:text-sm text-white/30">© {new Date().getFullYear()} PROLYMP. Barcha huquqlar himoyalangan.</div>
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6 text-xs md:text-sm text-white/40">
            {/* Maxfiylik / Shartlar uchun alohida sahifa hozircha yo'q —
                shu sababli ko'rsatilmaydi/disabled. Aloqa esa to'g'ridan
                mailto orqali ochiladi. */}
            <span className="cursor-not-allowed opacity-50" title="Tez orada">Maxfiylik</span>
            <span className="cursor-not-allowed opacity-50" title="Tez orada">Shartlar</span>
            <a href="mailto:sanjarruzmetov017@gmail.com" className="hover:text-white/70 transition-colors">Aloqa</a>
            <span className="w-px h-4 bg-white/10" aria-hidden="true" />
            <a href="https://t.me/proskilluz" target="_blank" rel="noreferrer noopener"
               className="text-white/40 hover:text-indigo-400 transition-colors flex items-center"
               aria-label="Telegram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.06-.2-.07-.06-.18-.04-.26-.02-.11.02-1.85 1.18-5.22 3.47-.5.34-.94.51-1.34.5-.44-.01-1.29-.25-1.92-.46-.78-.25-1.39-.39-1.34-.83.03-.23.32-.47.85-.71 3.36-1.46 5.59-2.43 6.71-2.89 3.19-1.33 3.86-1.56 4.29-1.57.1 0 .31.02.45.13.12.09.15.21.17.3-.01.06.01.24 0 .38z"/>
              </svg>
            </a>
            <a href="https://www.instagram.com/proskilluz/" target="_blank" rel="noreferrer noopener"
               className="text-white/40 hover:text-pink-400 transition-colors flex items-center"
               aria-label="Instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

Object.assign(window, { LandingPage });
