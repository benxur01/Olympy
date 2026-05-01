// pages/Landing.jsx

const LandingPage = ({ onNavigate }) => {
  const [mobileMenu, setMobileMenu] = React.useState(false);

  const features = [
    { icon: '✨', title: 'AI orqali savol yaratish', desc: 'Sun\'iy intellekt yordamida sekundlar ichida yuzlab savol yarating', color: 'from-indigo-500 to-purple-600' },
    { icon: '📄', title: 'PDF\'dan test yaratish', desc: 'Darslik yoki materiallardan avtomatik test savollarini yarating', color: 'from-cyan-500 to-blue-600' },
    { icon: '📱', title: 'Telegram orqali tasdiqlash', desc: 'Manager Telegram orqali bir tugma bilan arizalarni tasdiqlaydi', color: 'from-emerald-500 to-teal-600' },
    { icon: '🏆', title: 'Online olimpiada', desc: 'Real vaqtda olimpiada o\'tkazib, natijalarni avtomatik hisoblang', color: 'from-amber-500 to-orange-600' },
    { icon: '📊', title: 'Natijalar va reyting', desc: 'Batafsil statistika, grafik va reyting jadvallarini ko\'ring', color: 'from-pink-500 to-rose-600' },
    { icon: '👤', title: 'O\'quvchi profili', desc: 'Har bir o\'quvchining yutuqlari va natijalarini kuzating', color: 'from-violet-500 to-purple-600' },
  ];

  const stats = [
    { value: '120+', label: 'O\'quv markaz', icon: '🏫' },
    { value: '15 000+', label: 'O\'quvchi', icon: '👥' },
    { value: '50 000+', label: 'Test savollari', icon: '📝' },
    { value: '98%', label: 'Qoniqish darajasi', icon: '⭐' },
  ];

  const steps = [
    { num: '01', title: 'Ro\'yxatdan o\'ting', desc: 'O\'quv markaz sifatida platformaga qo\'shiling va markazingizni sozlang', icon: '🚀' },
    { num: '02', title: 'Savollar yarating', desc: 'AI, PDF yoki qo\'lda savollar bazasini to\'ldiring', icon: '✏️' },
    { num: '03', title: 'Olimpiada o\'tkazing', desc: 'O\'quvchilarni qo\'shing va olimpiada boshlang', icon: '🏆' },
    { num: '04', title: 'Natijalarni tahlil qiling', desc: 'Avtomatik hisoblangan natijalar va reytingni ko\'ring', icon: '📈' },
  ];

  const pricing = [
    { name: 'Boshlang\'ich', price: 'Bepul', desc: 'Kichik o\'quv markazlar uchun', features: ['5 ta olimpiada/oy', '50 ta o\'quvchi', 'Asosiy hisobotlar', 'Email qo\'llab-quvvatlash'], popular: false },
    { name: 'Professional', price: '199 000 so\'m', period: '/oy', desc: 'O\'sib borayotgan markazlar uchun', features: ['Cheksiz olimpiada', '500 ta o\'quvchi', 'AI savol yaratish', 'PDF import', 'Telegram bot', 'Batafsil tahlil'], popular: true },
    { name: 'Enterprise', price: 'Narxlashish', desc: 'Yirik ta\'lim tarmoqlari uchun', features: ['Cheksiz hamma narsa', 'Maxsus integratsiya', 'Shaxsiy menejer', 'API kirish', 'SLA kafolati'], popular: false },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#060818' }}>
      {/* Navbar */}
      <nav className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo(0,0)}>
            <div className="gradient-bg w-9 h-9 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-base">O</span>
            </div>
            <span className="gradient-text font-black text-xl tracking-tight">Olympy</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors cursor-pointer">Xususiyatlar</a>
            <a href="#how" className="hover:text-white transition-colors cursor-pointer">Qanday ishlaydi</a>
            <a href="#pricing" className="hover:text-white transition-colors cursor-pointer">Narxlar</a>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('login')} className="hidden md:block btn-ghost px-4 py-2 rounded-xl text-sm font-medium">Kirish</button>
            <button onClick={() => onNavigate('register')} className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold">Boshlash</button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', top: '-100px', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', top: '100px', right: '10%' }} />
        <div className="hero-glow" style={{ background: '#22d3ee', bottom: '-50px', left: '5%', opacity: 0.08 }} />

        {/* Orbit rings */}
        <div className="orbit" style={{ width: 600, height: 600, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        <div className="orbit" style={{ width: 900, height: 900, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', animationDuration: '30s', animationDirection: 'reverse' }} />

        <div className="max-w-5xl mx-auto px-6 pt-28 pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-8 text-sm text-indigo-300 border border-indigo-500/20">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse-slow"></span>
            O'zbekistonning #1 olimpiada platformasi
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-6" style={{ textWrap: 'balance' }}>
            O'quv markazlar uchun<br/>
            <span className="gradient-text">zamonaviy olimpiada</span><br/>
            platformasi
          </h1>

          <p className="text-lg md:text-xl text-white/50 mb-10 max-w-2xl mx-auto leading-relaxed">
            Test yarating, olimpiada o'tkazing, o'quvchilarni baholang va natijalarni avtomatik kuzating.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <button onClick={() => onNavigate('register')} className="btn-primary px-8 py-3.5 rounded-2xl text-base font-bold glow-blue">
              🚀 Boshlash
            </button>
            <button onClick={() => onNavigate('login')} className="btn-ghost px-8 py-3.5 rounded-2xl text-base font-semibold">
              Demo ko'rish →
            </button>
            <button onClick={() => onNavigate('register')} className="btn-ghost px-6 py-3.5 rounded-2xl text-base font-medium border-indigo-500/30 text-indigo-300">
              🏫 O'quv markaz qo'shish
            </button>
          </div>

          {/* Hero dashboard preview */}
          <div className="relative mx-auto max-w-4xl">
            <div className="glass-strong rounded-3xl p-1 glow-blue" style={{ background: 'rgba(99,102,241,0.05)' }}>
              <div className="rounded-2xl overflow-hidden" style={{ background: '#0d0f23' }}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/60"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/60"></div>
                  <div className="ml-4 flex-1 glass rounded-lg px-3 py-1 text-xs text-white/30">olympy.uz/dashboard</div>
                </div>
                <div className="p-6 grid grid-cols-3 gap-4">
                  {[
                    { label: 'Faol olimpiadalar', val: '12', color: 'indigo' },
                    { label: 'Jami o\'quvchilar', val: '348', color: 'purple' },
                    { label: 'O\'rtacha ball', val: '78.4', color: 'cyan' },
                  ].map((s, i) => (
                    <div key={i} className="glass rounded-xl p-4">
                      <div className={`text-2xl font-black text-${s.color}-400 mb-1`}>{s.val}</div>
                      <div className="text-xs text-white/40">{s.label}</div>
                    </div>
                  ))}
                  <div className="col-span-2 glass rounded-xl p-4">
                    <div className="text-xs text-white/40 mb-3">Haftalik natijalar</div>
                    <div className="flex items-end gap-1 h-12">
                      {[40, 65, 45, 80, 60, 90, 70].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: 'linear-gradient(180deg, #6366f1, #a855f7)', opacity: 0.6 }} />
                      ))}
                    </div>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <div className="text-xs text-white/40 mb-2">Top fan</div>
                    <div className="text-sm font-bold text-white">Matematika</div>
                    <div className="text-xs text-emerald-400 mt-1">↑ +12%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-white/5" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className="text-3xl md:text-4xl font-black gradient-text mb-1">{s.value}</div>
              <div className="text-sm text-white/40">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-4 text-sm text-purple-300 border border-purple-500/20">✨ Xususiyatlar</div>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Hammasi bir joyda</h2>
          <p className="text-white/40 max-w-xl mx-auto">O'quv markazingizni raqamlashtirishning eng zamonaviy yechimi</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div key={i} className="glass rounded-2xl p-6 card-hover group">
              <div className={`feature-icon bg-gradient-to-br ${f.color} mb-4 text-2xl`}>{f.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-24" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-4 text-sm text-cyan-300 border border-cyan-500/20">🔄 Qanday ishlaydi</div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">4 ta oson qadam</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {steps.map((s, i) => (
              <div key={i} className="glass rounded-2xl p-6 card-hover flex gap-4">
                <div className="gradient-text font-black text-4xl opacity-30 flex-shrink-0">{s.num}</div>
                <div>
                  <div className="text-xl mb-2">{s.icon}</div>
                  <h3 className="text-lg font-bold text-white mb-1">{s.title}</h3>
                  <p className="text-sm text-white/40 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram flow */}
      <section className="py-24 max-w-5xl mx-auto px-6">
        <div className="glass rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-4 text-sm text-emerald-300 border border-emerald-500/20">📱 Telegram integratsiya</div>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-4">Bir tugma bilan tasdiqlash</h2>
            <p className="text-white/40 leading-relaxed mb-6">O'quvchi ariza yuborganida, manager Telegram botida bildirishnoma oladi va bir tugma bosish bilan tasdiqlaydi.</p>
            <div className="flex gap-3">
              <button onClick={() => onNavigate('register')} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold">Sinab ko'ring</button>
            </div>
          </div>
          <div className="flex-shrink-0">
            <TelegramMockup studentName="Ali Valiyev" centerName="ProSkill Academy" onApprove={() => {}} onReject={() => {}} />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-4 text-sm text-indigo-300 border border-indigo-500/20">💎 Narxlar</div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">Qulay narxlar</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricing.map((p, i) => (
              <div key={i} className={`rounded-2xl p-6 flex flex-col ${p.popular ? 'gradient-bg glow-blue' : 'glass'}`}>
                {p.popular && <div className="text-xs font-bold text-white bg-white/20 rounded-full px-3 py-1 w-fit mb-4">⭐ Mashhur</div>}
                <div className={`text-sm font-medium mb-1 ${p.popular ? 'text-white/70' : 'text-white/50'}`}>{p.name}</div>
                <div className={`text-3xl font-black mb-1 ${p.popular ? 'text-white' : 'gradient-text'}`}>{p.price}</div>
                {p.period && <div className={`text-sm mb-2 ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.period}</div>}
                <div className={`text-xs mb-6 ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.desc}</div>
                <ul className="space-y-2 flex-1 mb-6">
                  {p.features.map((f, j) => (
                    <li key={j} className={`flex items-center gap-2 text-sm ${p.popular ? 'text-white/80' : 'text-white/60'}`}>
                      <span className={p.popular ? 'text-white' : 'text-indigo-400'}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => onNavigate('register')}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${p.popular ? 'bg-white text-indigo-600 hover:bg-white/90' : 'btn-ghost'}`}>
                  Boshlash
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 max-w-4xl mx-auto px-6 text-center">
        <div className="glass rounded-3xl p-12 relative overflow-hidden">
          <div className="hero-glow" style={{ background: '#6366f1', top: '-50%', left: '30%', opacity: 0.12 }} />
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4 relative">Bugun boshlang</h2>
          <p className="text-white/40 mb-8 relative">O'quv markazingizni raqamli olimpiada platformasiga ulang</p>
          <div className="flex flex-wrap items-center justify-center gap-4 relative">
            <button onClick={() => onNavigate('register')} className="btn-primary px-8 py-4 rounded-2xl text-base font-bold glow-blue">
              🚀 Bepul boshlash
            </button>
            <button onClick={() => onNavigate('login')} className="btn-ghost px-8 py-4 rounded-2xl text-base font-semibold">
              Kirish →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="gradient-bg w-7 h-7 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xs">O</span>
            </div>
            <span className="gradient-text font-black">Olympy</span>
          </div>
          <div className="text-sm text-white/30">© 2026 Olympy. Barcha huquqlar himoyalangan.</div>
          <div className="flex gap-6 text-sm text-white/40">
            <span className="hover:text-white/70 cursor-pointer">Maxfiylik</span>
            <span className="hover:text-white/70 cursor-pointer">Shartlar</span>
            <span className="hover:text-white/70 cursor-pointer">Aloqa</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

Object.assign(window, { LandingPage });
