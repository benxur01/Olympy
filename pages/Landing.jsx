// pages/Landing.jsx

const formatLandingDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Samarkand',
  }).formatToParts(new Date());
  const day = parts.find(part => part.type === 'day')?.value || '';
  const month = parts.find(part => part.type === 'month')?.value || '';
  const year = parts.find(part => part.type === 'year')?.value || '';
  return `${day} ${month} ${year}`.trim();
};

const escapeSvgText = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const TashkilotMockup = () => {
  return (
    <div className="p-4 md:p-6 text-white text-left select-none" style={{ background: '#090a0f', minHeight: '320px' }}>
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-white flex items-center gap-1.5">
            <Icon name="building" size={16} className="text-indigo-400" />
            <span>ProSkill Academy</span>
          </h4>
          <p className="text-[10px] md:text-xs text-white/40">Tashkilot Boshqaruv & Premium Analitikasi</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-lg border border-indigo-500/30 font-semibold">Premium Markaz</span>
          <span className="text-[10px] md:text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-lg font-semibold">Reyting: #3</span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="glass p-3 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase">O'rtacha Ball</div>
          <div className="text-lg font-black text-indigo-400">82.4%</div>
          <div className="text-[9px] text-emerald-400">↑ 3.2% o'sish</div>
        </div>
        <div className="glass p-3 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase">Jami Urinishlar</div>
          <div className="text-lg font-black text-cyan-400">1,420 ta</div>
          <div className="text-[9px] text-white/40">Ushbu oyda</div>
        </div>
        <div className="glass p-3 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase">Nofaol O'quvchilar</div>
          <div className="text-lg font-black text-rose-400">4 ta</div>
          <div className="text-[9px] text-rose-400/80">Ogohlantirish (T3)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="glass p-3 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase mb-2 flex items-center gap-1">
            <Icon name="users" size={12} className="text-indigo-400" />
            <span>TOP O'quvchilar Taqqoslash (T1)</span>
          </div>
          <div className="space-y-2">
            {[
              { rank: 1, name: 'Ali Valiyev', score: '94.2%', attempts: 18 },
              { rank: 2, name: 'Sardor Aliyev', score: '88.5%', attempts: 14 },
              { rank: 3, name: 'Zuhra Karimova', score: '87.1%', attempts: 15 },
            ].map(row => (
              <div key={row.rank} className="flex justify-between text-xs text-white/70 border-b border-white/5 pb-1">
                <span>{row.rank}. {row.name}</span>
                <span className="font-semibold text-white">{row.score} <span className="text-[10px] text-white/40">({row.attempts} ta)</span></span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-3 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase mb-2 flex items-center gap-1">
            <Icon name="brain" size={12} className="text-purple-400" />
            <span>Savollar Qiyinlik Analitikasi (T4)</span>
          </div>
          <div className="space-y-2">
            {[
              { id: '#12', text: 'Kombinatorika elementlari...', error: '74%' },
              { id: '#08', text: 'Eritmalarga oid masalalar...', error: '61%' },
              { id: '#22', text: 'Matnli masalalar tahlili...', error: '55%' },
            ].map((q, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs text-white/70">
                <span className="truncate max-w-[120px]"><span className="text-indigo-400">{q.id}</span> {q.text}</span>
                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[10px] border border-rose-500/20 font-semibold">{q.error} xato</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const OtaOnaMockup = () => {
  return (
    <div className="p-4 md:p-6 text-white text-left select-none" style={{ background: '#090a0f', minHeight: '320px' }}>
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-white flex items-center gap-1.5">
            <Icon name="award" size={16} className="text-cyan-400" />
            <span>Farzand: Shahzod Valiyev</span>
          </h4>
          <p className="text-[10px] md:text-xs text-white/40">Ota-ona monitoringi va AI tahlil paneli</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] md:text-xs bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-lg border border-emerald-500/30 flex items-center gap-1 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Telegram Digest Faol
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Success predictions */}
        <div className="md:col-span-7 glass p-3.5 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/40 uppercase mb-2.5 flex items-center gap-1.5">
            <Icon name="sparkles" size={12} className="text-cyan-400" />
            <span>AI Muvaffaqiyat Prognostikasi</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Prezident maktablari imtihoni', val: 78, color: 'bg-indigo-500' },
              { label: 'Al-Xorazmiy olimpiadasi', val: 85, color: 'bg-cyan-500' },
              { label: 'DTM Davlat imtihonlari', val: 94, color: 'bg-emerald-500' },
            ].map(row => (
              <div key={row.label} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/60">{row.label}</span>
                  <span className="font-bold text-white">{row.val}% imkoniyat</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${row.val}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly stats and digest preview */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3 rounded-xl border border-white/5 flex-1">
            <div className="text-[10px] text-white/40 uppercase mb-1">Farzand faolligi</div>
            <div className="text-xl font-black text-orange-400 flex items-center gap-1">
              <span>🔥</span>
              <span>7 kunlik streak</span>
            </div>
            <div className="text-[10px] text-white/50 mt-1">Uzluksiz kunlik mashq (O1)</div>
          </div>
          <div className="glass p-3 rounded-xl border border-white/5 flex-1">
            <div className="text-[10px] text-white/40 uppercase mb-1">Nishonlar (Badges)</div>
            <div className="flex gap-2.5 mt-1 text-base">
              <span title="7 kun faol" className="cursor-help">🔥</span>
              <span title="10 ta test topshirgan" className="cursor-help">🎖️</span>
              <span title="90% dan yuqori natija" className="cursor-help">🎯</span>
              <span title="Premium talaba" className="cursor-help">👑</span>
            </div>
            <div className="text-[9px] text-white/30 mt-1.5">To'plangan nishonlar: 4 ta (O5)</div>
          </div>
        </div>
      </div>

      <div className="glass p-3.5 rounded-xl border border-white/5 mt-4">
        <div className="text-[10px] text-white/40 uppercase mb-1.5">Haftalik PDF hisobot (Pillow PDF)</div>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Icon name="file" size={16} className="text-indigo-400" />
            <div>
              <span className="font-semibold text-white">olympy-hisobot-Shahzod-week.pdf</span>
              <span className="text-[10px] text-white/30 ml-2">1.2 MB</span>
            </div>
          </div>
          <span className="bg-indigo-600/20 text-indigo-300 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-indigo-500/25 flex items-center gap-1">
            <Icon name="download" size={10} />
            <span>Yuklangan</span>
          </span>
        </div>
      </div>
    </div>
  );
};

const use3DTilt = (maxRotate = 10, scale = 1.02) => {
  const ref = React.useRef(null);
  const [style, setStyle] = React.useState({});

  const handleMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const xc = (x / w) - 0.5;
    const yc = (y / h) - 0.5;

    const rotateX = -yc * maxRotate;
    const rotateY = xc * maxRotate;

    const mouseXPercent = (x / w) * 100;
    const mouseYPercent = (y / h) * 100;

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`,
      '--mouse-x': `${mouseXPercent}%`,
      '--mouse-y': `${mouseYPercent}%`,
    });
  };

  const handleMouseLeave = () => {
    setStyle({
      transform: `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
    });
  };

  return { ref, style, handleMouseMove, handleMouseLeave };
};

const InteractiveParticles = () => {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    const particles = [];
    const particleCount = Math.min(60, Math.floor((width * height) / 25000));
    
    const mouse = { x: null, y: null, radius: 150 };

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    const parentEl = canvas.parentElement;
    if (parentEl) {
      parentEl.addEventListener('mousemove', handleMouseMove);
      parentEl.addEventListener('mouseleave', handleMouseLeave);
    }

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.radius = Math.random() * 2 + 1;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;

        // Mouse interaction (attraction)
        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.hypot(dx, dy);
          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            this.vx += (dx / dist) * force * 0.02;
            this.vy += (dy / dist) * force * 0.02;
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 1.2) {
              this.vx = (this.vx / speed) * 1.2;
              this.vy = (this.vy / speed) * 1.2;
            }
          }
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.45)';
        ctx.fill();
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        p1.update();
        p1.draw();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 100) {
            const alpha = ((100 - dist) / 100) * 0.15;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        if (mouse.x !== null && mouse.y !== null) {
          const dx = p1.x - mouse.x;
          const dy = p1.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < mouse.radius) {
            const alpha = ((mouse.radius - dist) / mouse.radius) * 0.25;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (parentEl) {
        parentEl.removeEventListener('mousemove', handleMouseMove);
        parentEl.removeEventListener('mouseleave', handleMouseLeave);
      }
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="particles-canvas" />;
};

const Magnetic = ({ children }) => {
  const ref = React.useRef(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    setPosition({ x: x * 0.35, y: y * 0.35 });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="magnetic-item"
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
    >
      {children}
    </div>
  );
};

const GlowCard = ({ children, className = '', style = {}, ...props }) => {
  const ref = React.useRef(null);
  const [coords, setCoords] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCoords({ x, y });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`glow-card ${className}`}
      style={{
        ...style,
        '--mouse-x': `${coords.x}px`,
        '--mouse-y': `${coords.y}px`,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

const LandingPage = ({ onNavigate }) => {
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [activeScreen, setActiveScreen] = React.useState(0);
  const [imgErrors, setImgErrors] = React.useState({});
  const [todayLabel, setTodayLabel] = React.useState(formatLandingDate);
  const [dashboardSvg, setDashboardSvg] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const mainMockupTilt = use3DTilt(5, 1.01);

  React.useEffect(() => {
    const timer = setInterval(() => setTodayLabel(formatLandingDate()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );

    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach(el => observer.observe(el));

    // Force hero elements to animate in
    setTimeout(() => {
      const heroElements = document.querySelectorAll('.hero-reveal');
      heroElements.forEach(el => el.classList.add('active'));
    }, 50);

    return () => {
      elements.forEach(el => observer.unobserve(el));
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const src = window.location.protocol === 'file:' ? 'public/screenshots/dashboard.svg' : '/screenshots/dashboard.svg';
    fetch(src)
      .then(res => res.ok ? res.text() : '')
      .then(svg => { if (!cancelled && svg) setDashboardSvg(svg); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dashboardImgSrc = React.useMemo(() => {
    if (!dashboardSvg) return '/screenshots/dashboard.svg';
    const svg = dashboardSvg.replace(
      /(<text id="landing-date"[^>]*>)[^<]*(<\/text>)/,
      `$1${escapeSvgText(todayLabel)}$2`,
    );
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }, [dashboardSvg, todayLabel]);

  const screens = [
    { label: 'Dashboard', icon: 'chart', img: dashboardImgSrc, desc: 'Tadbirlar, natijalar va sertifikatlar bir joyda' },
    { label: 'Olimpiada', icon: 'trophy', img: '/screenshots/test.svg', desc: 'Vaqt, savollar va javoblar uchun qulay test oynasi' },
    { label: 'Mashq', icon: 'bolt', img: '/screenshots/practice.svg', desc: 'Fanlar va mavzular bo\'yicha mustaqil test mashqlari' },
    { label: 'Reyting', icon: 'star', img: '/screenshots/leaderboard.svg', desc: 'Top o\'quvchilar va ballar bo\'yicha jonli reyting' },
    { label: 'Xatolar', icon: 'shield', img: '/screenshots/mistakes.svg', desc: 'Xato qilingan test savollarining sun\'iy intellekt tahlili' },
    { label: 'Do\'kon', icon: 'tag', img: '/screenshots/store.svg', desc: 'To\'plangan tangalar evaziga mukofotlar do\'koni' },
    { label: 'Profil', icon: 'award', img: '/screenshots/profile.svg', desc: 'O\'quvchi yutuqlari, progress va sertifikatlar' },
    { label: 'Tashkilot', icon: 'building', isMock: true, desc: 'Tashkilot premium analitikasi, o\'quvchilar taqqoslash jadvali va tahliliy hisobotlar' },
    { label: 'Ota-ona', icon: 'users', isMock: true, desc: 'Farzandning AI muvaffaqiyat bashorati, yutuqlari va Telegram hisobot sozlamalari' },
  ];

  const heroMetrics = [
    { value: 'AI', label: 'savol yaratish' },
    { value: 'PDF', label: 'import' },
    { value: 'Live', label: 'reyting' },
  ];

  const features = [
    // Center features
    { category: 'center', icon: '✨', title: 'AI orqali savol yaratish', desc: 'Sun\'iy intellekt yordamida sekundlar ichida yuzlab savol yarating', color: 'from-indigo-500 to-purple-600' },
    { category: 'center', icon: '📄', title: 'PDF\'dan test yaratish', desc: 'Darslik yoki materiallardan avtomatik test savollarini yarating', color: 'from-cyan-500 to-blue-600' },
    { category: 'center', icon: '📱', title: 'Telegram orqali tasdiqlash', desc: 'Manager Telegram orqali bir tugma bilan arizalarni tasdiqlaydi', color: 'from-emerald-500 to-teal-600' },
    { category: 'center', icon: '🏆', title: 'Online olimpiada', desc: 'Real vaqtda olimpiada o\'tkazib, Natijalarni avtomatik hisoblang', color: 'from-amber-500 to-orange-600' },
    { category: 'center', icon: '👁️', title: 'Jonli Proctoring nazorati', desc: 'Test topshirayotgan o\'quvchilarning tab o\'zgarishi va ping holatini real vaqtda kuzatish', color: 'from-rose-500 to-pink-600' },
    { category: 'center', icon: '📈', title: 'Tashkilot reyting dinamikasi', desc: 'Markazning global oylik reyting o\'zgarishi va ballar o\'sishini jonli grafikda kuzatish (T7)', color: 'from-blue-600 to-cyan-500' },
    { category: 'center', icon: '📊', title: 'O\'quvchilar taqqoslash jadvali', desc: 'Guruhdagi barcha o\'quvchilarning o\'rtacha ballari, reytingi va urinishlari batafsil jadvali (T1)', color: 'from-indigo-500 to-blue-600' },
    { category: 'center', icon: '🧠', title: 'Savollar qiyinlik tahlili', desc: 'Markaz savollarining o\'quvchilar tomonidan xato qilinish foizlari bo\'yicha qiyinlik darajasini aniqlash (T4)', color: 'from-purple-500 to-indigo-600' },
    { category: 'center', icon: '⚠️', title: 'Nofaol o\'quvchilar ogohlantirishi', desc: 'Ma\'lum muddat davomida test topshirmagan nofaol o\'quvchilarni tizimli aniqlash va eslatish (T3)', color: 'from-amber-500 to-red-500' },
    { category: 'center', icon: '🏷️', title: 'Guruhlararo taqqoslash', desc: 'Sinf va guruh teglari kesimida faollik hamda o\'rtacha ko\'rsatkichlarni guruhlab solishtirish (T5)', color: 'from-teal-500 to-emerald-600' },
    { category: 'center', icon: '📥', title: 'Excel va CSV yig\'ma eksporti', desc: 'Markazning barcha o\'quvchilari natijalarini formatlangan Excel yoki CSV faylga bir tugma bilan yuklab olish (T6)', color: 'from-emerald-600 to-teal-500' },
    { category: 'center', icon: '📄', title: 'Tashkilot tahliliy hisoboti', desc: 'Markaz faoliyatiga oid statistika va TOP 5 o\'quvchini Pillow orqali PDF shaklida yuklash (T2)', color: 'from-pink-500 to-rose-600' },

    // Student features
    { category: 'student', icon: '📊', title: 'Natijalar va reyting', desc: 'Batafsil statistika, shaxsiy grafik va global reyting jadvallarini ko\'ring', color: 'from-pink-500 to-rose-600' },
    { category: 'student', icon: '👤', title: 'O\'quvchi profili', desc: 'Har bir o\'quvchining yutuqlari, faollik oylari va natijalarini kuzating', color: 'from-violet-500 to-purple-600' },
    { category: 'student', icon: '🏋️', title: 'Mustaqil Mashq Rejimi', desc: 'Fanlar va mavzular bo\'yicha o\'z ustida ishlash hamda faollik (streak) tizimi', color: 'from-blue-500 to-indigo-600' },
    { category: 'student', icon: '📂', title: 'AI Xatolar Sandig\'i', desc: 'Yo\'l qo\'yilgan xatolarni jamlab, sun\'iy intellekt orqali tushuntirish berish', color: 'from-amber-500 to-red-600' },
    { category: 'student', icon: '🪙', title: 'Virtual Sovg\'alar Do\'koni', desc: 'Testlar va mashqlardan tangalar yig\'ib, qiziqarli mukofotlar xarid qilish', color: 'from-yellow-400 to-orange-500' },
    { category: 'student', icon: '🔮', title: 'AI Muvaffaqiyat Prognostikasi', desc: 'Imtihon va olimpiadalarga kirish imkoniyatlarini AI yordamida prognozlash', color: 'from-purple-500 to-pink-600' },
    { category: 'student', icon: '⚔️', title: 'Raqiblar tizimi (Rivals)', desc: 'Kursdoshlarni raqib sifatida qo\'shib, ular bilan o\'rtacha ball va reytinglarni taqqoslash (O2)', color: 'from-rose-500 to-orange-500' },
    { category: 'student', icon: '🎯', title: 'Mavzu tayyorlik darajasi', desc: 'Har bir fan bo\'yicha o\'quvchining o\'zlashtirish foizini va tayyorgarlik darajasini ko\'rish (O3)', color: 'from-cyan-500 to-teal-500' },
    { category: 'student', icon: '🔮', title: 'Urinishlar AI tahlili', desc: 'Har bir test urinishi yakunida Gemini AI yordamida yo\'l qo\'yilgan xatolarga tushuntirish olish (O4)', color: 'from-purple-600 to-pink-500' },
    { category: 'student', icon: '🎖️', title: 'Premium Yutuqlar', desc: 'Urinishlar soni, streaklar va eng yuqori ballarga erishganda beriladigan nishonlar (O5)', color: 'from-yellow-500 to-amber-600' },
    { category: 'student', icon: '💡', title: 'Smart Olimpiada tavsiyalari', desc: 'Zaif fanlaringizga mos ravishda navbatdagi olimpiada va mashqlarni avtomatik tavsiya etish (O7)', color: 'from-indigo-600 to-purple-600' },
    { category: 'student', icon: '🔥', title: 'Ketma-ketlik (Streak) tizimi', desc: 'Kunlik faollikni va eng uzun streaklarni kuzatib borish orqali uzluksiz o\'rganish motivatsiyasi (O1)', color: 'from-orange-500 to-amber-500' },
    { category: 'student', icon: '👑', title: 'Oltin avatar halqasi va unvon', desc: 'Premium o\'quvchilar uchun platformada alohida vizual oltin avatar va reytinglarda maxsus belgi', color: 'from-yellow-400 to-amber-500' },

    // Parent features
    { category: 'parent', icon: '📄', title: 'Ota-onalar uchun PDF hisobot', desc: 'Telegram bot orqali farzand rivojlanishi bo\'yicha haftalik PDF tahlil xabarlari', color: 'from-emerald-500 to-green-600' },
    { category: 'parent', icon: '📩', title: 'Ota-onaga haftalik digest', desc: 'Farzandning oxirgi 7 kundagi urinishlari, o\'rtacha bali va faollik kunlarini Telegramda olish (O6)', color: 'from-emerald-500 to-green-600' },
  ];

  const filteredFeatures = React.useMemo(() => {
    if (selectedCategory === 'all') return features;
    return features.filter(f => f.category === selectedCategory);
  }, [selectedCategory]);

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
    { name: 'Boshlang\'ich', price: 'Hozir bepul', desc: 'Barcha imkoniyatlar ochiq, to\'lov moduli tez orada', features: ['Asosiy hisobotlar', 'Email qo\'llab-quvvatlash'], popular: false },
    { name: 'Professional', price: 'Bog\'laning', desc: 'O\'sib borayotgan tashkilotlar uchun', features: ['Cheksiz olimpiada', '500 ta o\'quvchi', 'AI savol yaratish', 'PDF import', 'Telegram bot', 'Batafsil tahlil'], popular: true },
    { name: 'Enterprise', price: 'Bog\'laning', desc: 'Yirik ta\'lim tarmoqlari uchun', features: ['Cheksiz hamma narsa', 'Maxsus integratsiya', 'Shaxsiy menejer', 'API kirish', 'SLA kafolati'], popular: false },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#050508' }}>
      {/* Navbar — Telegram WebView'da backdrop-filter sekin ishlaydi, shu sababli
          backdropFilter olib tashlangan va solid background ishlatilgan. */}
      <nav
        className="sticky top-0 z-50"
        style={{
          background: 'rgba(13, 14, 18, 0.95)',
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
            <button
              onClick={() => setMobileMenu(v => !v)}
              className="md:hidden btn-ghost inline-flex items-center justify-center w-9 h-9 rounded-xl text-white/80"
              aria-label="Menyu"
              aria-expanded={mobileMenu}
            >
              {mobileMenu ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {mobileMenu && (
          <div
            className="md:hidden fixed inset-0 z-40"
            onClick={() => setMobileMenu(false)}
            style={{ top: '52px', background: 'rgba(5, 5, 8, 0.85)' }}
          >
            <div
              className="absolute left-0 right-0 top-0 border-b border-white/10"
              style={{ background: 'rgba(13, 14, 18, 0.98)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1 text-sm">
                <a
                  href="#features"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Xususiyatlar
                </a>
                <a
                  href="#how"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Qanday ishlaydi
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Narxlar
                </a>
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

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          minHeight: 'min(700px, calc(100svh - 96px))',
          backgroundImage: `linear-gradient(90deg, rgba(5,5,8,0.99) 0%, rgba(5,5,8,0.95) 48%, rgba(5,5,8,0.72) 72%, rgba(5,5,8,0.36) 100%), url("${dashboardImgSrc}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}
      >
        <InteractiveParticles />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(5,5,8,0.1) 0%, rgba(5,5,8,0.9) 100%)' }} />
        
        {/* Floating 3D badges on the right (desktop only) */}
        <div className="hidden lg:block absolute right-16 top-1/4 w-[400px] h-[300px] pointer-events-none z-10 preserve-3d" style={{ perspective: '1000px' }}>
          <div className="absolute right-0 top-0 glass rounded-2xl p-4 border border-white/10 float-badge-1 flex items-center gap-3" style={{ background: 'rgba(13, 14, 18, 0.88)' }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 font-bold text-xl">✨</span>
            <div>
              <div className="text-sm font-bold text-white">AI Savollar</div>
              <div className="text-xs text-white/55">Sekundiga 100+ test</div>
            </div>
          </div>
          
          <div className="absolute right-28 top-32 glass rounded-2xl p-4 border border-white/10 float-badge-2 flex items-center gap-3" style={{ background: 'rgba(13, 14, 18, 0.88)' }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300 font-bold text-xl">📱</span>
            <div>
              <div className="text-sm font-bold text-white">Telegram Tasdiqlash</div>
              <div className="text-xs text-white/55">Oson va xavfsiz</div>
            </div>
          </div>

          <div className="absolute right-8 top-64 glass rounded-2xl p-4 border border-white/10 float-badge-3 flex items-center gap-3" style={{ background: 'rgba(13, 14, 18, 0.88)' }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xl">🏆</span>
            <div>
              <div className="text-sm font-bold text-white">Jonli Reyting</div>
              <div className="text-xs text-white/55">Avtomatik hisob-kitob</div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-14 md:py-24 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-5 md:mb-6 text-xs md:text-sm text-cyan-100 border border-cyan-300/20" style={{ background: 'rgba(8,145,178,0.16)' }}>
              <Icon name="shield" size={16} />
              Online olimpiada, test va natija boshqaruvi
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-5 md:mb-6" style={{ textWrap: 'balance' }}>
              Olympy — online olimpiada platformasi
            </h1>

            <p className="text-base md:text-xl text-white/70 mb-7 md:mb-9 max-w-2xl leading-relaxed">
              Ta'lim markazlari va maktablar uchun test yaratish, olimpiada o'tkazish, reyting yuritish va sertifikatlash jarayonini bitta tizimga jamlaydi.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 md:gap-4 mb-7 md:mb-9">
              <Magnetic>
                <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-bold glow-blue w-full sm:w-auto">
                  <Icon name="bolt" size={18} />
                  Boshlash
                </button>
              </Magnetic>
              <Magnetic>
                <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-semibold w-full sm:w-auto">
                  Kirish
                  <Icon name="chevronRight" size={18} />
                </button>
              </Magnetic>
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
      <section className="py-12 md:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(5,5,8,1) 0%, rgba(20,22,28,0.9) 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-14 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-200 border border-cyan-500/20">
              <Icon name="eye" size={16} />
              Loyiha ekranlari
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Mahsulot qanday ko'rinadi?</h2>
            <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">Dashboard, test oynasi, reyting va profil ekranlari landing ichida ko'rinadigan qilib joylandi.</p>
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
          <div className="perspective-1000 scroll-reveal scroll-reveal-delay-2">
            <div
              ref={mainMockupTilt.ref}
              onMouseMove={mainMockupTilt.handleMouseMove}
              onMouseLeave={mainMockupTilt.handleMouseLeave}
              className="tilt-card glass rounded-2xl overflow-hidden border border-white/10"
              style={{ ...mainMockupTilt.style, background: '#0d0e12' }}
            >
              <div className="tilt-glow" />
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
              <div className="relative tilt-inner" style={{ minHeight: '260px' }}>
              <div
                key={activeScreen}
                className="screen-fade"
                style={{ animation: 'screenFade 0.4s ease-out' }}
              >
                {screens[activeScreen].isMock ? (
                  screens[activeScreen].label === 'Tashkilot' ? (
                    <TashkilotMockup />
                  ) : (
                    <OtaOnaMockup />
                  )
                ) : imgErrors[activeScreen] ? (
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
                      background: '#050508',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    }}
                  />
                )}
              </div>
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
          @keyframes cardEntrance {
            from {
              opacity: 0;
              transform: translateY(16px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      </section>

      {/* Features */}
      <section id="features" className="py-12 md:py-24 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-10 scroll-reveal">
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-purple-300 border border-purple-500/20">✨ Xususiyatlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Platforma Imkoniyatlari</h2>
          <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Tashkilotingiz, o'quvchilar va ota-onalar uchun eng zamonaviy premium yechimlar</p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex justify-center mb-10 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2 p-1.5 rounded-2xl border border-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
            {[
              { id: 'all', label: 'Barchasi', icon: 'grid' },
              { id: 'center', label: 'Tashkilotlar uchun', icon: 'building' },
              { id: 'student', label: 'O\'quvchilar uchun', icon: 'award' },
              { id: 'parent', label: 'Ota-onalar uchun', icon: 'users' },
            ].map(cat => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all duration-300 ${
                    active ? 'text-white shadow-lg shadow-indigo-500/20' : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                  style={active ? { background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' } : {}}
                >
                  <Icon name={cat.icon} size={15} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredFeatures.map((f, i) => (
            <GlowCard 
              key={f.title} 
              className="p-4 md:p-6 group"
              style={{
                animation: 'cardEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                animationDelay: `${(i % 6) * 50}ms`
              }}
            >
              <div className={`feature-icon bg-gradient-to-br ${f.color} mb-3 md:mb-4 text-2xl relative z-10`}>{f.icon}</div>
              <h3 className="text-base md:text-lg font-bold text-white mb-1.5 md:mb-2 relative z-10">{f.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed relative z-10">{f.desc}</p>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-12 md:py-24" style={{ background: 'rgba(99,102,241,0.03)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-300 border border-cyan-500/20">🔄 Qanday ishlaydi</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">4 ta oson qadam</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {steps.map((s, i) => (
              <div key={i} className={`glass rounded-2xl p-4 md:p-6 card-hover flex gap-3 md:gap-4 scroll-reveal scroll-reveal-delay-${(i % 2) + 1}`}>
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
      <section className="py-12 md:py-24 max-w-5xl mx-auto px-4 md:px-6 scroll-reveal">
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
          <div className="text-center mb-8 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-indigo-300 border border-indigo-500/20">💎 Narxlar</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Qulay narxlar</h2>
            <p className="text-sm text-white/50 max-w-xl mx-auto">
              Hozircha platforma erkin foydalanish bosqichida. Yakuniy rejalar va to'lov modullari tez orada e'lon qilinadi — batafsil ma'lumot uchun bog'laning.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {pricing.map((p, i) => {
              const delayClass = `scroll-reveal scroll-reveal-delay-${(i % 3) + 1}`;
              // Bepul plan to'g'ridan-to'g'ri ro'yxatdan o'tishga, qolgan
              // ikkita plan esa email orqali bog'lanish uchun.
              const isFree = typeof p.price === 'string' && p.price.toLowerCase().includes('bepul');
              const handleClick = () => {
                if (isFree) onNavigate('register');
                else window.location.href = `mailto:sanjarruzmetov017@gmail.com?subject=Olympy ${p.name} reja haqida`;
              };
              return (
                <GlowCard key={i} className={`p-4 md:p-6 flex flex-col ${delayClass} ${p.popular ? 'gradient-bg glow-blue' : ''}`}>
                  <div className="relative z-10 flex flex-col h-full">
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
                    <Magnetic>
                      <button onClick={handleClick}
                        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${p.popular ? 'bg-white text-indigo-600 hover:bg-white/90' : 'btn-ghost'}`}>
                        {isFree ? 'Boshlash' : "Bog'lanish"}
                      </button>
                    </Magnetic>
                  </div>
                </GlowCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 text-center scroll-reveal">
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
          <div className="text-xs md:text-sm text-white/30">© {new Date().getFullYear()} Olympy. Barcha huquqlar himoyalangan.</div>
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6 text-xs md:text-sm text-white/40">
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
