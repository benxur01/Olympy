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

const DirectorMockup = () => {
  return (
    <div className="p-5 md:p-6 text-white text-left select-none relative overflow-hidden" style={{ background: '#07080c', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
            <span>ProSkill Academy (Direktor)</span>
          </h4>
          <p className="text-[10px] md:text-xs text-white/45 mt-0.5">Tashkilot Boshqaruv & Premium Analitikasi</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-lg font-bold tracking-wide uppercase">Premium</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-lg font-bold">Reyting: #3</span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="glass p-3 rounded-xl border-t-2 border-t-indigo-500 border-x-white/5 border-b-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">O'rtacha Ball</div>
          <div className="text-lg font-black text-indigo-400 mt-1">82.4%</div>
          <div className="text-[9px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-0.5">
            <span>↑</span> 3.2% o'sish
          </div>
        </div>
        <div className="glass p-3 rounded-xl border-t-2 border-t-cyan-500 border-x-white/5 border-b-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Jami Urinishlar</div>
          <div className="text-lg font-black text-cyan-400 mt-1">1,420 ta</div>
          <div className="text-[9px] text-white/40 font-semibold mt-0.5">Ushbu oyda</div>
        </div>
        <div className="glass p-3 rounded-xl border-t-2 border-t-rose-500 border-x-white/5 border-b-white/5">
          <div className="text-[9px] text-white/40 uppercase font-bold tracking-wider">Nofaol O'quvchilar</div>
          <div className="text-lg font-black text-rose-400 mt-1">4 ta</div>
          <div className="text-[9px] text-rose-400/80 font-semibold mt-0.5">Ogohlantirish (T3)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="glass p-3.5 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="users" size={12} className="text-indigo-400" />
            <span>TOP O'quvchilar Taqqoslash (T1)</span>
          </div>
          <div className="space-y-2">
            {[
              { rank: 1, name: 'Ali Valiyev', score: 94.2, attempts: 18, color: 'bg-indigo-500' },
              { rank: 2, name: 'Sardor Aliyev', score: 88.5, attempts: 14, color: 'bg-indigo-500/80' },
              { rank: 3, name: 'Zuhra Karimova', score: 87.1, attempts: 15, color: 'bg-indigo-500/60' },
            ].map(row => (
              <div key={row.rank} className="space-y-1">
                <div className="flex justify-between text-xs text-white/80">
                  <span>{row.rank}. {row.name}</span>
                  <span className="font-semibold text-white">{row.score}% <span className="text-[10px] text-white/40">({row.attempts} ta)</span></span>
                </div>
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${row.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-3.5 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="brain" size={12} className="text-purple-400" />
            <span>Savollar Qiyinlik Analitikasi (T4)</span>
          </div>
          <div className="space-y-2">
            {[
              { id: '#12', text: 'Kombinatorika elementlari...', error: '74%' },
              { id: '#08', text: 'Eritmalarga oid masalalar...', error: '61%' },
              { id: '#22', text: 'Matnli masalalar tahlili...', error: '55%' },
            ].map((q, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs text-white/70 border-b border-white/5 pb-1 last:border-0 last:pb-0">
                <span className="truncate max-w-[110px]"><span className="text-indigo-400 font-semibold">{q.id}</span> {q.text}</span>
                <span className="bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded text-[10px] border border-rose-500/20 font-bold">{q.error} xato</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ManagerMockup = () => {
  return (
    <div className="p-5 md:p-6 text-white text-left select-none relative overflow-hidden" style={{ background: '#07080c', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />
            <span>Menejer Boshqaruv Paneli</span>
          </h4>
          <p className="text-[10px] md:text-xs text-white/45 mt-0.5">Olimpiada nazorati va arizalar</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-lg font-bold">Faol Tadbir: 1 ta</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Live Proctoring List */}
        <div className="md:col-span-7 glass p-3.5 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="eye" size={12} className="text-amber-400" />
            <span>Jonli Proctoring (Tab Nazorati)</span>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Ali Valiyev', event: 'Matematika Live', msg: 'Tab o\'zgartirdi (2 ta ogohlantirish)', time: '12:04:15', status: 'warning', color: 'text-amber-400 border-amber-500/30 bg-amber-500/5' },
              { name: 'Sardor Aliyev', event: 'Matematika Live', msg: 'Aloqa butunlay uzildi', time: '12:03:50', status: 'error', color: 'text-rose-400 border-rose-500/30 bg-rose-500/5' },
              { name: 'Zuhra Karimova', event: 'Matematika Live', msg: 'Muammosiz topshirmoqda', time: '12:04:22', status: 'success', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
            ].map((row, idx) => (
              <div key={idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${row.color}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white truncate">{row.name}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{row.msg}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="text-[9px] font-mono opacity-50 block">{row.time}</span>
                  {row.status === 'warning' && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300">Ogohlantirish</span>}
                  {row.status === 'error' && <span className="text-[9px] font-bold uppercase tracking-wider text-rose-300">Offline</span>}
                  {row.status === 'success' && <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">Online</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requests and Shop control */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3.5 rounded-xl border border-white/5 flex-1 text-xs">
            <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
              <span>Kutilayotgan arizalar</span>
              <span className="bg-amber-400/20 text-amber-300 font-bold px-1.5 py-0.5 rounded text-[8px]">2 ta</span>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Sirojiddin B.', phone: '+998 90 *** 1234' },
                { name: 'Madina K.', phone: '+998 93 *** 5678' }
              ].map((req, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{req.name}</div>
                    <div className="text-[9px] text-white/40">{req.phone}</div>
                  </div>
                  <div className="flex gap-1">
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">Tasdiqlash</span>
                    <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">Rad etish</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-3.5 rounded-xl border border-white/5 flex-1 flex flex-col justify-center text-xs">
            <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
              <Icon name="award" size={12} className="text-yellow-400" />
              <span>Markaz Do'koni (Mukofotlar)</span>
            </div>
            <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎒</span>
                <div>
                  <div className="font-bold text-white">Brendli Ryukzak</div>
                  <div className="text-[9px] text-white/40">Zaxira: 12 ta</div>
                </div>
              </div>
              <span className="text-yellow-400 font-bold font-mono">250 🪙</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TeacherMockup = () => {
  return (
    <div className="p-5 md:p-6 text-white text-left select-none relative overflow-hidden" style={{ background: '#07080c', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
            <span>O'qituvchi Boshqaruv Paneli</span>
          </h4>
          <p className="text-[10px] md:text-xs text-white/45 mt-0.5">Test yaratish, tahrirlash va baholash tizimi</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-lg font-bold">Mening Savollarim: 124 ta</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Question Creator Mockup */}
        <div className="md:col-span-7 glass p-3.5 rounded-xl border border-white/5">
          <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="sparkles" size={12} className="text-emerald-400" />
            <span>AI Savol Generatori & Savollar Banki</span>
          </div>
          <div className="space-y-3">
            <div className="glass bg-white/[0.02] p-2.5 rounded-xl border border-white/5 space-y-2">
              <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <span>🪄 Gemini AI tavsiya qilgan savol</span>
              </div>
              <div className="text-xs text-white/80 leading-relaxed font-medium">
                "Uchburchakning tomonlari 5, 12 va 13 bo'lsa, uning ichki chizilgan aylanasi radiusini toping."
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-white/5 px-2 py-1 rounded text-white/70 border border-white/5">A) 3</div>
                <div className="bg-emerald-500/10 px-2 py-1 rounded text-emerald-300 border border-emerald-500/20 font-bold">B) 2 (To'g'ri)</div>
                <div className="bg-white/5 px-2 py-1 rounded text-white/70 border border-white/5">C) 1.5</div>
                <div className="bg-white/5 px-2 py-1 rounded text-white/70 border border-white/5">D) 4</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <span className="bg-white/5 text-white/80 border border-white/10 px-2.5 py-1.5 rounded-xl text-[10px] font-bold">Qayta yaratish</span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl text-[10px] font-bold">Bankka qo'shish</span>
            </div>
          </div>
        </div>

        {/* Grading and My Events */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3.5 rounded-xl border border-white/5 flex-1 text-xs">
            <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
              <span>Baholash kutilmoqda (Essay)</span>
              <span className="bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded text-[8px]">3 ta</span>
            </div>
            <div className="space-y-2">
              {[
                { student: 'Jasur Temirov', task: 'Kombinatorika algoritmlari', val: 'Java tilida recursive yechim...' },
                { student: 'Laylo Sodiqova', task: 'Matematik isbot', val: 'Formula bo\'yicha induction usulda...' }
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-white/70 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{item.student}</span>
                    <span className="text-[9px] text-white/40 block truncate">{item.task}</span>
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded text-[9px] font-bold shrink-0 ml-2">Baholash</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-3.5 rounded-xl border border-white/5 flex-1 flex flex-col justify-center text-xs">
            <div className="text-[10px] text-white/45 uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
              <Icon name="trophy" size={12} className="text-emerald-400" />
              <span>Mening faol olimpiadalarim</span>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-white text-xs">Haftalik Matematika #4</div>
                <div className="text-[9px] text-white/40">Tugash vaqti: 18:00</div>
              </div>
              <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[9px] border border-emerald-500/20 font-bold">Faol</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


const use3DTilt = (maxRotate = 10, scale = 1.02) => {
  const ref = React.useRef(null);

  // Boshlang'ich (statik) style — faqat birinchi renderda qo'llanadi. Tilt
  // qiymatlarini har `mousemove`da React state orqali emas, to'g'ridan-to'g'ri
  // DOM `style` ustida o'zgartiramiz (pastdagi handler'lar) — shu sababli
  // mouse harakatida React qayta render qilinmaydi (Telegram WebView'da va
  // zaif qurilmalarda re-render bo'roni kadrlarni sekinlashtirardi).
  const style = React.useMemo(() => ({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    '--mouse-x': '50%',
    '--mouse-y': '50%',
  }), []);

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

    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`;
    el.style.setProperty('--mouse-x', `${mouseXPercent}%`);
    el.style.setProperty('--mouse-y', `${mouseYPercent}%`);
  };

  const handleMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };

  return { ref, style, handleMouseMove, handleMouseLeave };
};

// Telegram WebView yoki touch (coarse pointer) qurilma — og'ir
// requestAnimationFrame loop + `mousemove` ishlov beruvchini umuman ishga
// tushirmaymiz. WebView'da bu kadrlarni sekinlashtirib, telefon batareyasini
// behuda sarflaydi; touch qurilmada esa interaktiv mouse effektining ma'nosi
// ham yo'q.
const isLowPowerEnv = () => {
  if (typeof window === 'undefined') return false;
  if (window.Telegram?.WebApp?.initData) return true;
  return window.matchMedia?.('(pointer: coarse)').matches || false;
};

const InteractiveParticles = () => {
  const canvasRef = React.useRef(null);
  const skip = React.useMemo(() => isLowPowerEnv(), []);

  React.useEffect(() => {
    if (skip) return;
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
  }, [skip]);

  if (skip) return null;

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

// ─── Count-up animatsiya ────────────────────────────────────────────────────
// Raqamni 0 dan boshlab sanab chiqadi. IntersectionObserver element ko'ringanda
// requestAnimationFrame bilan ishga tushiradi — layout o'zgarmaydi, shuning
// uchun Telegram WebView'da ham xavfsiz. Bir marta ishlaydi (started ref).
const CountUp = ({ end, suffix = '', duration = 1400, className = '' }) => {
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
      {val.toLocaleString('ru-RU').replace(/ /g, ' ')}{suffix}
    </span>
  );
};

// ─── A/B test hook ──────────────────────────────────────────────────────────
// Cookie asosida doimiy variant tayinlaydi: foydalanuvchining yarmi 'A', yarmi
// 'B' ko'radi. Bir marta tanlangan variant 30 kun saqlanadi.
function useABTest(testName) {
  const [variant, setVariant] = React.useState(null);

  React.useEffect(() => {
    const cookieKey = `ab_${testName}`;
    const existing = document.cookie.split(';').find(c => c.trim().startsWith(cookieKey + '='));
    if (existing) {
      setVariant(existing.split('=')[1].trim());
    } else {
      const v = Math.random() < 0.5 ? 'A' : 'B';
      document.cookie = `${cookieKey}=${v}; max-age=${60 * 60 * 24 * 30}; path=/`;
      setVariant(v);
    }
  }, [testName]);

  return variant;
}

// A/B test event'ini backendga yuborish (fire-and-forget). API boshqa domenda
// bo'lishi mumkin, shuning uchun to'liq URL (OlympyApi.API_BASE_URL) ishlatamiz.
// `keepalive` — 'click' eventi sahifa o'zgarganda ham yuborilishini ta'minlaydi.
const trackAbEvent = (variant, event) => {
  if (!variant) return;
  const base = globalThis.OlympyApi?.API_BASE_URL || '';
  try {
    fetch(`${base}/api/ab/track/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'hero_cta', variant, event }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
};

const LandingPage = ({ onNavigate, user }) => {
  // Telegram WebView / touch qurilma — og'ir blur orblari GPU'ni to'liq
  // yuklaydi, shu sababli ularni render qilmaymiz (statik fon yetarli).
  const isLowPower = React.useMemo(() => isLowPowerEnv(), []);
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [openMobileSolutions, setOpenMobileSolutions] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState(null);
  const [activeScreen, setActiveScreen] = React.useState(0);
  const [activeOrgRole, setActiveOrgRole] = React.useState('director');
  const [imgErrors, setImgErrors] = React.useState({});
  const [todayLabel, setTodayLabel] = React.useState(formatLandingDate);
  const [dashboardSvg, setDashboardSvg] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const tabsContainerRef = React.useRef(null);
  const [paymentPlan, setPaymentPlan] = React.useState(null);
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState('');
  // Obuna rejalari backenddan yuklanadi. Yuklanmaguncha skeleton, xato bo'lsa
  // FALLBACK_PRICING ko'rsatiladi (pastdagi `pricing` ga qarang).
  const [plans, setPlans] = React.useState(null);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [planTypeFilter, setPlanTypeFilter] = React.useState('student');
  const [durationFilter, setDurationFilter] = React.useState(30);

  // A/B test: hero sarlavha va CTA matnining ikki varianti (faqat matn farq
  // qiladi, dizayn bir xil). Variant aniqlangach 'view' eventi yuboriladi.
  const heroVariant = useABTest('hero_cta');
  const heroViewSent = React.useRef(false);
  React.useEffect(() => {
    if (heroVariant && !heroViewSent.current) {
      heroViewSent.current = true;
      trackAbEvent(heroVariant, 'view');
    }
  }, [heroVariant]);

  // Hero CTA bosilganda: 'click' eventini yuborib, ro'yxatdan o'tishga o'tamiz.
  const handleHeroCta = () => {
    trackAbEvent(heroVariant, 'click');
    onNavigate('register');
  };

  const handleCreatePayment = async (provider) => {
    if (!paymentPlan) return;
    setPaymentLoading(true);
    setPaymentError('');
    try {
      const token = OlympyApi.getToken();
      const res = await OlympyApi.createCheckoutSession({
        plan_id: paymentPlan.id,
        provider: provider
      }, token);
      if (res && res.payment_url) {
        openExternalLink(res.payment_url);
      } else {
        throw new Error("To'lov havolasini olishda xatolik yuz berdi");
      }
    } catch (err) {
      setPaymentError(OlympyApi.toUserMessage?.(err) || "To'lov havolasini generatsiya qilib bo'lmadi");
    } finally {
      setPaymentLoading(false);
    }
  };

  // Obuna rejalarini backenddan yuklash. Narx raqam ('99000') ko'rinishida
  // keladi — uni '99 000 UZS' formatiga o'tkazamiz. Bepul reja (0) uchun
  // period ko'rsatilmaydi. Xato yoki bo'sh javobda fallback static qoladi.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await OlympyApi.getSubscriptionPlans();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        if (!list.length) {
          setPlans(null); // fallback ishlatiladi
          return;
        }
        const mapped = list.map((p) => {
          const priceNum = Number(p.price) || 0;
          return {
            id: p.id,
            name: p.name,
            plan_type: p.plan_type,
            price: `${priceNum.toLocaleString('ru-RU').replace(/ /g, ' ')} UZS`,
            period: priceNum > 0 ? (p.duration_days === 365 ? 'yiliga' : p.duration_days === 180 ? '6 oyga' : p.duration_days === 90 ? '3 oyga' : 'oyiga') : undefined,
            duration_days: p.duration_days,
            desc: p.description || '',
            features: Array.isArray(p.features) ? p.features : [],
            popular: !!p.is_popular,
          };
        });
        setPlans(mapped);
      } catch {
        if (!cancelled) setPlans(null); // fallback static ishlatiladi
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(totalScroll > 0 ? (window.scrollY / totalScroll) * 100 : 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const mainMockupTilt = use3DTilt(5, 1.01);

  const handleSolutionClick = (e, category, elementId, orgRole, isMobile = false) => {
    e.preventDefault();
    if (isMobile) {
      setMobileMenu(false);
    }
    if (category) {
      setSelectedCategory(category);
    }
    if (orgRole) {
      setActiveOrgRole(orgRole);
    }
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

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
  }, [plansLoading, planTypeFilter, durationFilter, selectedCategory]);

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
    { type: 'student', label: 'Dashboard', icon: 'chart', img: dashboardImgSrc, desc: 'Tadbirlar, natijalar va sertifikatlar bir joyda', glowColor: 'rgba(99, 102, 241, 0.22)' },
    { type: 'student', label: 'Olimpiada', icon: 'trophy', img: '/screenshots/test.svg', desc: 'Vaqt, savollar va javoblar uchun qulay test oynasi', glowColor: 'rgba(59, 130, 246, 0.22)' },
    { type: 'student', label: 'Mashq', icon: 'bolt', img: '/screenshots/practice.svg', desc: 'Fanlar va mavzular bo\'yicha mustaqil test mashqlari', glowColor: 'rgba(16, 185, 129, 0.22)' },
    { type: 'student', label: 'Reyting', icon: 'star', img: '/screenshots/leaderboard.svg', desc: 'Top o\'quvchilar va ballar bo\'yicha jonli reyting', glowColor: 'rgba(245, 158, 11, 0.22)' },
    { type: 'student', label: 'Xatolar', icon: 'shield', img: '/screenshots/mistakes.svg', desc: 'Xato qilingan test savollarining sun\'iy intellekt tahlili', glowColor: 'rgba(239, 68, 68, 0.22)' },
    { type: 'student', label: 'Do\'kon', icon: 'tag', img: '/screenshots/store.svg', desc: 'To\'plangan tangalar evaziga mukofotlar do\'koni', glowColor: 'rgba(234, 179, 8, 0.22)' },
    { type: 'student', label: 'Profil', icon: 'award', img: '/screenshots/profile.svg', desc: 'O\'quvchi yutuqlari, progress va sertifikatlar', glowColor: 'rgba(168, 85, 247, 0.22)' },
  ];

  // Hero metrikalar — CountUp bilan sanab chiqiladi (A).
  const heroMetrics = [
    { end: 100, suffix: '+', label: 'AI savol soniyalar ichida' },
    { end: 26, suffix: '+', label: 'premium imkoniyat' },
    { end: 9, suffix: '', label: 'modul bitta tizimda' },
  ];

  // Mobil chip qatori — desktopdagi floating badge'lar lg dan kichik
  // ekranlarda ko'rinmaydi, ularning o'rnini shu chiplar bosadi (A).
  const heroChips = [
    { icon: 'sparkles', label: 'AI Savollar', color: 'text-indigo-300 border-indigo-500/25 bg-indigo-500/10' },
    { icon: 'file', label: 'PDF Import', color: 'text-cyan-300 border-cyan-500/25 bg-cyan-500/10' },
    { icon: 'trophy', label: 'Live Reyting', color: 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10' },
  ];

  // Auto-switch tabs every 4 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      setActiveScreen(prev => (prev + 1) % screens.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeScreen]);



  const features = [
    // Center features
    // `spotlight: true` — guruhning eng kuchli 3-4 ta imkoniyati katta kartada
    // ko'rsatiladi, qolganlari kichik chip shaklida chiqadi (B).
    { category: 'center', icon: '✨', iconName: 'sparkles', title: 'AI orqali savol yaratish', desc: 'Sun\'iy intellekt yordamida sekundlar ichida yuzlab savol yarating', color: 'from-indigo-500 to-purple-600', spotlight: true },
    { category: 'center', icon: '📄', iconName: 'file', title: 'PDF\'dan test yaratish', desc: 'Darslik yoki materiallardan avtomatik test savollarini yarating', color: 'from-cyan-500 to-blue-600', spotlight: true },
    { category: 'center', icon: '📱', iconName: 'send', title: 'Telegram orqali tasdiqlash', desc: 'Manager Telegram orqali bir tugma bilan arizalarni tasdiqlaydi', color: 'from-emerald-500 to-teal-600' },
    { category: 'center', icon: '🏆', iconName: 'trophy', title: 'Online olimpiada', desc: 'Real vaqtda olimpiada o\'tkazib, Natijalarni avtomatik hisoblang', color: 'from-amber-500 to-orange-600', spotlight: true },
    { category: 'center', icon: '👁️', iconName: 'eye', title: 'Jonli Proctoring nazorati', desc: 'Test topshirayotgan o\'quvchilarning tab o\'zgarishi va ping holatini real vaqtda kuzatish', color: 'from-rose-500 to-pink-600', spotlight: true },
    { category: 'center', icon: '📈', iconName: 'chart', title: 'Tashkilot reyting dinamikasi', desc: 'Markazning global oylik reyting o\'zgarishi va ballar o\'sishini jonli grafikda kuzatish (T7)', color: 'from-blue-600 to-cyan-500' },
    { category: 'center', icon: '📊', iconName: 'grid', title: 'O\'quvchilar taqqoslash jadvali', desc: 'Guruhdagi barcha o\'quvchilarning o\'rtacha ballari, reytingi va urinishlari batafsil jadvali (T1)', color: 'from-indigo-500 to-blue-600' },
    { category: 'center', icon: '🧠', iconName: 'brain', title: 'Savollar qiyinlik tahlili', desc: 'Markaz savollarining o\'quvchilar tomonidan xato qilinish foizlari bo\'yicha qiyinlik darajasini aniqlash (T4)', color: 'from-purple-500 to-indigo-600' },
    { category: 'center', icon: '⚠️', iconName: 'info', title: 'Nofaol o\'quvchilar ogohlantirishi', desc: 'Ma\'lum muddat davomida test topshirmagan nofaol o\'quvchilarni tizimli aniqlash va eslatish (T3)', color: 'from-amber-500 to-red-500' },
    { category: 'center', icon: '🏷️', iconName: 'tag', title: 'Guruhlararo taqqoslash', desc: 'Sinf va guruh teglari kesimida faollik hamda o\'rtacha ko\'rsatkichlarni guruhlab solishtirish (T5)', color: 'from-teal-500 to-emerald-600' },
    { category: 'center', icon: '📥', iconName: 'download', title: 'Excel va CSV yig\'ma eksporti', desc: 'Markazning barcha o\'quvchilari natijalarini formatlangan Excel yoki CSV faylga bir tugma bilan yuklab olish (T6)', color: 'from-emerald-600 to-teal-500' },
    { category: 'center', icon: '📄', iconName: 'file', title: 'Tashkilot tahliliy hisoboti', desc: 'Markaz faoliyatiga oid statistika va TOP 5 o\'quvchini Pillow orqali PDF shaklida yuklash (T2)', color: 'from-pink-500 to-rose-600' },
 
    // Student features
    { category: 'student', icon: '📊', iconName: 'chart', title: 'Natijalar va reyting', desc: 'Batafsil statistika, shaxsiy grafik va global reyting jadvallarini ko\'ring', color: 'from-pink-500 to-rose-600' },
    { category: 'student', icon: '👤', iconName: 'user', title: 'O\'quvchi profili', desc: 'Har bir o\'quvchining yutuqlari, faollik oylari va natijalarini kuzating', color: 'from-violet-500 to-purple-600' },
    { category: 'student', icon: '🏋️', iconName: 'bolt', title: 'Mustaqil Mashq Rejimi', desc: 'Fanlar va mavzular bo\'yicha o\'z ustida ishlash hamda faollik (streak) tizimi', color: 'from-blue-500 to-indigo-600', spotlight: true },
    { category: 'student', icon: '📂', iconName: 'shield', title: 'AI Xatolar Sandig\'i', desc: 'Yo\'l qo\'yilgan xatolarni jamlab, sun\'iy intellekt orqali tushuntirish berish', color: 'from-amber-500 to-red-600', spotlight: true },
    { category: 'student', icon: '🪙', iconName: 'tag', title: 'Virtual Sovg\'alar Do\'koni', desc: 'Testlar va mashqlardan tangalar yig\'ib, qiziqarli mukofotlar xarid qilish', color: 'from-yellow-400 to-orange-500' },
    { category: 'student', icon: '🔮', iconName: 'sparkles', title: 'AI Muvaffaqiyat Prognostikasi', desc: 'Imtihon va olimpiadalarga kirish imkoniyatlarini AI yordamida prognozlash', color: 'from-purple-500 to-pink-600', spotlight: true },
    { category: 'student', icon: '⚔️', iconName: 'users', title: 'Raqiblar tizimi (Rivals)', desc: 'Kursdoshlarni raqib sifatida qo\'shib, ular bilan o\'rtacha ball va reytinglarni taqqoslash (O2)', color: 'from-rose-500 to-orange-500', spotlight: true },
    { category: 'student', icon: '🎯', iconName: 'award', title: 'Mavzu tayyorlik darajasi', desc: 'Har bir fan bo\'yicha o\'quvchining o\'zlashtirish foizini va tayyorgarlik darajasini ko\'rish (O3)', color: 'from-cyan-500 to-teal-500' },
    { category: 'student', icon: '🔮', iconName: 'brain', title: 'Urinishlar AI tahlili', desc: 'Har bir test urinishi yakunida Gemini AI yordamida yo\'l qo\'yilgan xatolarga tushuntirish olish (O4)', color: 'from-purple-600 to-pink-500' },
    { category: 'student', icon: '🎖️', iconName: 'star', title: 'Premium Yutuqlar', desc: 'Urinishlar soni, streaklar va eng yuqori ballarga erishganda beriladigan nishonlar (O5)', color: 'from-yellow-500 to-amber-600' },
    { category: 'student', icon: '💡', iconName: 'info', title: 'Smart Olimpiada tavsiyalari', desc: 'Zaif fanlaringizga mos ravishda navbatdagi olimpiada va mashqlarni avtomatik tavsiya etish (O7)', color: 'from-indigo-600 to-purple-600' },
    { category: 'student', icon: '🔥', iconName: 'bolt', title: 'Ketma-ketlik (Streak) tizimi', desc: 'Kunlik faollikni va eng uzun streaklarni kuzatib borish orqali uzluksiz o\'rganish motivatsiyasi (O1)', color: 'from-orange-500 to-amber-500' },
    { category: 'student', icon: '👑', iconName: 'award', title: 'Oltin avatar halqasi va unvon', desc: 'Premium o\'quvchilar uchun platformada alohida vizual oltin avatar va reytinglarda maxsus belgi', color: 'from-yellow-400 to-amber-500' },
 
    // Parent features
    { category: 'parent', icon: '📄', iconName: 'file', title: 'Ota-onalar uchun PDF hisobot', desc: 'Telegram bot orqali farzand rivojlanishi bo\'yicha haftalik PDF tahlil xabarlari', color: 'from-emerald-500 to-green-600', spotlight: true },
    { category: 'parent', icon: '📩', iconName: 'send', title: 'Ota-onaga haftalik digest', desc: 'Farzandning oxirgi 7 kundagi urinishlari, o\'rtacha bali va faollik kunlarini Telegramda olish (O6)', color: 'from-emerald-500 to-green-600', spotlight: true },
  ];

  const filteredFeatures = React.useMemo(() => {
    if (selectedCategory === 'all') return features;
    return features.filter(f => f.category === selectedCategory);
  }, [selectedCategory]);

  // Spotlight kartalar katta gridda, qolganlari kichik chip qatorida (B).
  const spotlightFeatures = filteredFeatures.filter(f => f.spotlight);
  const chipFeatures = filteredFeatures.filter(f => !f.spotlight);

  const steps = [
    { num: '01', title: 'Ro\'yxatdan o\'ting', desc: 'Maktab, o\'quv markaz yoki tashkilot sifatida platformaga qo\'shiling', icon: '🚀', iconName: 'bolt' },
    { num: '02', title: 'Savollar yarating', desc: 'AI, PDF yoki qo\'lda savollar bazasini to\'ldiring', icon: '✏️', iconName: 'edit' },
    { num: '03', title: 'Olimpiada o\'tkazing', desc: 'O\'quvchilarni qo\'shing va olimpiada boshlang', icon: '🏆', iconName: 'trophy' },
    { num: '04', title: 'Natijalarni tahlil qiling', desc: 'Avtomatik hisoblangan natijalar va reytingni ko\'ring', icon: '📈', iconName: 'chart' },
  ];

  // Narxlar backenddan (GET /api/billing/plans/) yuklanadi — yuqoridagi
  // `plans` state'iga qarang. Backend javob bermasa yoki bo'sh bo'lsa quyidagi
  // static fallback ishlatiladi (offline / API ishlamay qolgan holatlar uchun).
  const FALLBACK_PRICING = [
    // --- Students (O'quvchilar) ---
    // Standart
    { id: 1, name: 'Standart', plan_type: 'student', price: '9 999 UZS', duration_days: 30, desc: 'O\'quvchilar uchun asosiy reja (1 oy)', features: ["Barcha olimpiadalarda qatnashish", "Haftalik natijalar tahlili", "Telegram xabarnomalar"], popular: false },
    { id: 2, name: 'Standart', plan_type: 'student', price: '26 999 UZS', duration_days: 90, desc: 'O\'quvchilar uchun asosiy reja (3 oy)', features: ["Barcha olimpiadalarda qatnashish", "Haftalik natijalar tahlili", "Telegram xabarnomalar"], popular: false },
    { id: 3, name: 'Standart', plan_type: 'student', price: '47 999 UZS', duration_days: 180, desc: 'O\'quvchilar uchun asosiy reja (6 oy)', features: ["Barcha olimpiadalarda qatnashish", "Haftalik natijalar tahlili", "Telegram xabarnomalar"], popular: false },
    { id: 4, name: 'Standart', plan_type: 'student', price: '83 999 UZS', duration_days: 365, desc: 'O\'quvchilar uchun asosiy reja (1 yil)', features: ["Barcha olimpiadalarda qatnashish", "Haftalik natijalar tahlili", "Telegram xabarnomalar"], popular: false },
    // Plus
    { id: 5, name: 'Plus', plan_type: 'student', price: '19 999 UZS', duration_days: 30, desc: 'O\'quvchilar uchun kengaytirilgan reja (1 oy)', features: ["Standart reja imkoniyatlari", "AI tavsiyalar va yechimlar", "Haftalik PDF hisobotlar", "Reyting tahlili"], popular: true },
    { id: 6, name: 'Plus', plan_type: 'student', price: '53 999 UZS', duration_days: 90, desc: 'O\'quvchilar uchun kengaytirilgan reja (3 oy)', features: ["Standart reja imkoniyatlari", "AI tavsiyalar va yechimlar", "Haftalik PDF hisobotlar", "Reyting tahlili"], popular: true },
    { id: 7, name: 'Plus', plan_type: 'student', price: '95 999 UZS', duration_days: 180, desc: 'O\'quvchilar uchun kengaytirilgan reja (6 oy)', features: ["Standart reja imkoniyatlari", "AI tavsiyalar va yechimlar", "Haftalik PDF hisobotlar", "Reyting tahlili"], popular: true },
    { id: 8, name: 'Plus', plan_type: 'student', price: '167 999 UZS', duration_days: 365, desc: 'O\'quvchilar uchun kengaytirilgan reja (1 yil)', features: ["Standart reja imkoniyatlari", "AI tavsiyalar va yechimlar", "Haftalik PDF hisobotlar", "Reyting tahlili"], popular: true },
    // Pro
    { id: 9, name: 'Pro', plan_type: 'student', price: '24 999 UZS', duration_days: 30, desc: 'O\'quvchilar uchun to\'liq imkoniyatlar (1 oy)', features: ["Plus reja imkoniyatlari", "AI shaxsiy o'qituvchi", "Barcha olimpiadalar tarixi", "Cheksiz mashq qilish"], popular: false },
    { id: 10, name: 'Pro', plan_type: 'student', price: '64 999 UZS', duration_days: 90, desc: 'O\'quvchilar uchun to\'liq imkoniyatlar (3 oy)', features: ["Plus reja imkoniyatlari", "AI shaxsiy o'qituvchi", "Barcha olimpiadalar tarixi", "Cheksiz mashq qilish"], popular: false },
    { id: 11, name: 'Pro', plan_type: 'student', price: '114 999 UZS', duration_days: 180, desc: 'O\'quvchilar uchun to\'liq imkoniyatlar (6 oy)', features: ["Plus reja imkoniyatlari", "AI shaxsiy o'qituvchi", "Barcha olimpiadalar tarixi", "Cheksiz mashq qilish"], popular: false },
    { id: 12, name: 'Pro', plan_type: 'student', price: '199 999 UZS', duration_days: 365, desc: 'O\'quvchilar uchun to\'liq imkoniyatlar (1 yil)', features: ["Plus reja imkoniyatlari", "AI shaxsiy o'qituvchi", "Barcha olimpiadalar tarixi", "Cheksiz mashq qilish"], popular: false },

    // --- Organizations (Tashkilotlar) ---
    // Standart
    { id: 13, name: 'Standart', plan_type: 'organization', price: '199 999 UZS', duration_days: 30, desc: 'Kichik tashkilotlar uchun mos reja (1 oy)', features: ["Maksimal 50 ta o'quvchi", "1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], popular: false },
    { id: 14, name: 'Standart', plan_type: 'organization', price: '539 999 UZS', duration_days: 90, desc: 'Kichik tashkilotlar uchun mos reja (3 oy)', features: ["Maksimal 50 ta o'quvchi", "1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], popular: false },
    { id: 15, name: 'Standart', plan_type: 'organization', price: '959 999 UZS', duration_days: 180, desc: 'Kichik tashkilotlar uchun mos reja (6 oy)', features: ["Maksimal 50 ta o'quvchi", "1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], popular: false },
    { id: 16, name: 'Standart', plan_type: 'organization', price: '1 679 999 UZS', duration_days: 365, desc: 'Kichik tashkilotlar uchun mos reja (1 yil)', features: ["Maksimal 50 ta o'quvchi", "1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], popular: false },
    // Plus
    { id: 17, name: 'Plus', plan_type: 'organization', price: '399 999 UZS', duration_days: 30, desc: 'O\'sib borayotgan tashkilotlar uchun (1 oy)', features: ["Maksimal 200 ta o'quvchi", "Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], popular: true },
    { id: 18, name: 'Plus', plan_type: 'organization', price: '1 079 999 UZS', duration_days: 90, desc: 'O\'sib borayotgan tashkilotlar uchun (3 oy)', features: ["Maksimal 200 ta o'quvchi", "Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], popular: true },
    { id: 19, name: 'Plus', plan_type: 'organization', price: '1 919 999 UZS', duration_days: 180, desc: 'O\'sib borayotgan tashkilotlar uchun (6 oy)', features: ["Maksimal 200 ta o'quvchi", "Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], popular: true },
    { id: 20, name: 'Plus', plan_type: 'organization', price: '3 359 999 UZS', duration_days: 365, desc: 'O\'sib borayotgan tashkilotlar uchun (1 yil)', features: ["Maksimal 200 ta o'quvchi", "Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], popular: true },
    // Pro
    { id: 21, name: 'Pro', plan_type: 'organization', price: '449 999 UZS', duration_days: 30, desc: 'Yirik ta\'lim tashkilotlari uchun (1 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], popular: false },
    { id: 22, name: 'Pro', plan_type: 'organization', price: '1 199 999 UZS', duration_days: 90, desc: 'Yirik ta\'lim tashkilotlari uchun (3 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], popular: false },
    { id: 23, name: 'Pro', plan_type: 'organization', price: '2 149 999 UZS', duration_days: 180, desc: 'Yirik ta\'lim tashkilotlari uchun (6 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], popular: false },
    { id: 24, name: 'Pro', plan_type: 'organization', price: '3 749 999 UZS', duration_days: 365, desc: 'Yirik ta\'lim tashkilotlari uchun (1 yil)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], popular: false },
  ];
  // API'dan kelgan plan'lar bo'lsa shularni, aks holda fallback'ni ko'rsatamiz.
  const pricing = (plans && plans.length) ? plans : FALLBACK_PRICING;
  const filteredPricing = pricing.filter(
    (p) => (p.plan_type === planTypeFilter) && (p.duration_days === durationFilter)
  );

  // ─── Tejash kalkulyatori (D) ──────────────────────────────────────────────
  // Tanlangan muddat narxini xuddi shu rejaning 1 oylik narxi bilan solishtirib
  // (oylik narx x oylar soni - tanlangan narx), qancha tejalishini hisoblaydi.
  const parsePriceNum = (price) => Number(String(price || '').replace(/[^\d]/g, '')) || 0;
  const formatUZS = (n) => `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} UZS`;
  const getPlanSavings = (plan) => {
    if (!plan || !plan.duration_days || plan.duration_days <= 30) return 0;
    const monthly = pricing.find(
      (b) => b.plan_type === plan.plan_type && b.name === plan.name && b.duration_days === 30
    );
    if (!monthly) return 0;
    const months = Math.round(plan.duration_days / 30);
    const saved = parsePriceNum(monthly.price) * months - parsePriceNum(plan.price);
    return saved > 0 ? saved : 0;
  };
  const maxSavings = filteredPricing.reduce((max, p) => Math.max(max, getPlanSavings(p)), 0);
  const durationLabel = durationFilter === 365 ? '1 yillik' : durationFilter === 180 ? '6 oylik' : durationFilter === 90 ? '3 oylik' : '1 oylik';

  return (
    <div className="min-h-screen" style={{ background: '#050508' }}>
      {/* Scroll progress bar */}
      <div
        className="fixed top-0 left-0 h-[2px] z-[100] transition-all duration-150"
        style={{ width: `${scrollProgress}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }}
      />
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
            {/* Solutions Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer py-2 text-white/60 focus:outline-none">
                <span>Yechimlar</span>
                <Icon name="chevronDown" size={12} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-[560px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="glass rounded-2xl p-5 grid grid-cols-2 gap-3 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" style={{ background: '#0d0e12' }}>
                  <a href="#features" onClick={(e) => handleSolutionClick(e, 'all', 'features')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover/item:bg-indigo-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="sparkles" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-indigo-300 transition-colors">AI Savollar</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Sekundiga yuzlab test yarating</div>
                    </div>
                  </a>
                  <a href="#b2b-console" onClick={(e) => handleSolutionClick(e, 'center', 'b2b-console', 'manager')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover/item:bg-cyan-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="eye" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-cyan-300 transition-colors">Jonli Proctoring</div>
                      <div className="text-[10px] text-white/40 mt-0.5">O'quvchilar tab nazorati</div>
                    </div>
                  </a>
                  <a href="#features" onClick={(e) => handleSolutionClick(e, 'parent', 'features')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover/item:bg-emerald-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="users" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-emerald-300 transition-colors">Ota-ona Monitoringi</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Faollik va AI muvaffaqiyat bashorati</div>
                    </div>
                  </a>
                  <a href="#features" onClick={(e) => handleSolutionClick(e, 'student', 'features')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover/item:bg-amber-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="trophy" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-amber-300 transition-colors">Musobaqalar</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Real vaqtda online olimpiadalar</div>
                    </div>
                  </a>
                  <a href="#telegram-flow" onClick={(e) => handleSolutionClick(e, null, 'telegram-flow')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 group-hover/item:bg-rose-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="send" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-rose-300 transition-colors">Telegram Bot</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Managerlar uchun tasdiqlash boti</div>
                    </div>
                  </a>
                  <a href="#b2b-console" onClick={(e) => handleSolutionClick(e, 'center', 'b2b-console', 'director')} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-all group/item">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover/item:bg-purple-500/20 group-hover/item:scale-105 transition-all">
                      <Icon name="chart" size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover/item:text-purple-300 transition-colors">Tahliliy hisobotlar</div>
                      <div className="text-[10px] text-white/40 mt-0.5">Haftalik PDF va Excel tahlili</div>
                    </div>
                  </a>
                </div>
              </div>
            </div>
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
                {/* Collapsible Mobile Solutions */}
                <div className="flex flex-col">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenMobileSolutions(!openMobileSolutions); }}
                    className="flex items-center justify-between px-3 py-3 rounded-xl text-white/80 hover:text-white hover:bg-white/5 transition-colors text-left"
                  >
                    <span>Yechimlar</span>
                    <Icon name="chevronDown" size={16} className={`transition-transform duration-250 ${openMobileSolutions ? 'rotate-180' : 'rotate-0'}`} />
                  </button>
                  {openMobileSolutions && (
                    <div className="pl-6 pr-3 py-1 flex flex-col gap-2.5 border-l border-white/5 ml-3 my-1">
                      <a href="#features" onClick={(e) => handleSolutionClick(e, 'all', 'features', null, true)} className="text-xs text-white/50 hover:text-white flex items-center gap-2 py-1">
                        <Icon name="sparkles" size={12} className="text-indigo-400" />
                        AI Savollar
                      </a>
                      <a href="#b2b-console" onClick={(e) => handleSolutionClick(e, 'center', 'b2b-console', 'manager', true)} className="text-xs text-white/50 hover:text-white flex items-center gap-2 py-1">
                        <Icon name="eye" size={12} className="text-cyan-400" />
                        Jonli Proctoring
                      </a>
                      <a href="#features" onClick={(e) => handleSolutionClick(e, 'parent', 'features', null, true)} className="text-xs text-white/50 hover:text-white flex items-center gap-2 py-1">
                        <Icon name="users" size={12} className="text-emerald-400" />
                        Ota-ona Monitoringi
                      </a>
                      <a href="#features" onClick={(e) => handleSolutionClick(e, 'student', 'features', null, true)} className="text-xs text-white/50 hover:text-white flex items-center gap-2 py-1">
                        <Icon name="trophy" size={12} className="text-amber-400" />
                        Musobaqalar
                      </a>
                      <a href="#telegram-flow" onClick={(e) => handleSolutionClick(e, null, 'telegram-flow', null, true)} className="text-xs text-white/50 hover:text-white flex items-center gap-2 py-1">
                        <Icon name="send" size={12} className="text-rose-400" />
                        Telegram Bot
                      </a>
                    </div>
                  )}
                </div>
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
        <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.22] z-[2]" />
        <div className="absolute inset-0 pointer-events-none z-[2]" style={{ background: 'linear-gradient(180deg, rgba(5,5,8,0.1) 0%, rgba(5,5,8,0.8) 85%, #050508 100%)' }} />

        {/* Neon orbs for mesh gradient background.
            Telegram WebView va zaif qurilmalarda og'ir blur (110-130px) +
            animate-pulse-slow kombinatsiyasi kadrlarni sekinlashtirardi. Blur
            qiymatlari pasaytirildi (60/60/40px). Telegram WebView
            `prefers-reduced-motion` yubormaydi, shuning uchun
            `motion-reduce:animate-none` u yerda ishlamasdi — pulse animatsiyasi
            butunlay olib tashlandi (statik glow yetarli, kadrlarni
            sekinlashtirmaydi). */}
        {!isLowPower && (
          <>
            {/* blur radiusi 60px→40px pasaytirildi: katta blur WebView/sekin
                GPU'da har kadrda qayta hisoblanib (composite) sekinlashtiradi.
                will-change kompozitor qatlamiga ajratib silliqlashtiradi. */}
            <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full filter blur-[40px] pointer-events-none" style={{ background: 'rgba(99, 102, 241, 0.18)', willChange: 'transform' }} />
            <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] rounded-full filter blur-[40px] pointer-events-none" style={{ background: 'rgba(168, 85, 247, 0.16)', willChange: 'transform' }} />
            <div className="absolute top-10 right-10 w-[250px] h-[250px] rounded-full filter blur-[40px] pointer-events-none" style={{ background: 'rgba(34, 211, 238, 0.16)', willChange: 'transform' }} />
          </>
        )}
        
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

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight mb-5 md:mb-6" style={{ textWrap: 'balance', background: 'linear-gradient(135deg, #ffffff 40%, #c7d2fe 75%, #818cf8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {heroVariant === 'B' ? (
                <>O'zbekistonning eng yaxshi <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">olimpiada</span> platformasi</>
              ) : (
                <>Olympy — <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">online olimpiada</span> platformasi</>
              )}
            </h1>

            <p className="text-base md:text-xl text-white/70 mb-7 md:mb-9 max-w-2xl leading-relaxed">
              Ta'lim markazlari va maktablar uchun test yaratish, olimpiada o'tkazish, reyting yuritish va sertifikatlash jarayonini bitta tizimga jamlaydi.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 md:gap-4 mb-7 md:mb-9">
              <Magnetic>
                <button onClick={handleHeroCta} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-bold glow-blue w-full sm:w-auto">
                  <Icon name="bolt" size={18} />
                  {heroVariant === 'B' ? 'Bepul sinab ko\'r' : 'Boshlash'}
                </button>
              </Magnetic>
              <Magnetic>
                <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-2xl text-sm md:text-base font-semibold w-full sm:w-auto">
                  Kirish
                  <Icon name="chevronRight" size={18} />
                </button>
              </Magnetic>
            </div>

            {/* Mobil chip qatori (A) — desktopda floating badge'lar ko'rinadi */}
            <div className="flex lg:hidden flex-wrap gap-2 mb-6">
              {heroChips.map((chip) => (
                <span
                  key={chip.label}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border ${chip.color}`}
                >
                  <Icon name={chip.icon} size={13} />
                  {chip.label}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-xl relative z-20">
              {heroMetrics.map((m, idx) => {
                const textColors = ['text-purple-400', 'text-cyan-400', 'text-emerald-400'];
                return (
                  <GlowCard
                    key={m.label}
                    className="p-3.5 md:p-5 border border-white/5 rounded-2xl flex flex-col group transition-all"
                  >
                    <div className={`text-xl md:text-3xl font-black ${textColors[idx % 3]} flex items-center gap-1.5`}>
                      <CountUp end={m.end} suffix={m.suffix} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-75" />
                    </div>
                    <div className="text-[11px] md:text-sm text-white/50 leading-tight mt-1.5 group-hover:text-white/80 transition-colors">{m.label}</div>
                  </GlowCard>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Marquee Banner */}
      <div className="w-full border-y border-white/5 py-4 bg-white/[0.01] relative overflow-hidden z-20">
        {/* Left & Right fading masks */}
        <div className="absolute left-0 top-0 bottom-0 w-24 md:w-48 bg-gradient-to-r from-[#050508] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 md:w-48 bg-gradient-to-l from-[#050508] to-transparent z-10 pointer-events-none" />
        
        <div className="marquee-content flex gap-8 whitespace-nowrap min-w-full">
          {[
            { icon: 'sparkles', label: 'AI Savollar Generatsiyasi', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
            { icon: 'file', label: 'PDF\'dan Test Yaratish', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
            { icon: 'eye', label: 'Jonli Proctoring Nazorati', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
            { icon: 'trophy', label: 'Real vaqtda Reyting & Musobaqalar', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
            { icon: 'users', label: 'Ota-ona Monitoring Paneli', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { icon: 'send', label: 'Telegram orqali Tasdiqlash', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { icon: 'chart', label: 'Premium Tahliliy Hisobotlar (T2)', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { icon: 'shield', label: 'Xavfsiz Tab Nazorati Muhiti', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
            { icon: 'tag', label: 'Virtual Tangalar Do\'koni', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
          ].concat([
            { icon: 'sparkles', label: 'AI Savollar Generatsiyasi', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
            { icon: 'file', label: 'PDF\'dan Test Yaratish', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
            { icon: 'eye', label: 'Jonli Proctoring Nazorati', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
            { icon: 'trophy', label: 'Real vaqtda Reyting & Musobaqalar', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
            { icon: 'users', label: 'Ota-ona Monitoring Paneli', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { icon: 'send', label: 'Telegram orqali Tasdiqlash', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { icon: 'chart', label: 'Premium Tahliliy Hisobotlar (T2)', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { icon: 'shield', label: 'Xavfsiz Tab Nazorati Muhiti', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
            { icon: 'tag', label: 'Virtual Tangalar Do\'koni', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
          ]).map((item, idx) => (
            <div key={idx} className="inline-flex items-center gap-2 px-4 py-2 border rounded-full text-xs md:text-sm font-semibold select-none shadow-sm transition-colors duration-250 cursor-default hover:border-indigo-500/30" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
              <Icon name={item.icon} size={15} className={item.color.split(' ')[0]} />
              <span className="text-white/80">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Platforma ko'rinishi */}
      <section className="py-12 md:py-24 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #050508 0%, rgba(20,22,28,0.9) 50%, #050508 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-14 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-200 border border-cyan-500/20">
              <Icon name="eye" size={16} />
              Loyiha ekranlari
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Mahsulot qanday ko'rinadi?</h2>
            <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">Dashboard, test oynasi, reyting va profil ekranlari landing ichida ko'rinadigan qilib joylandi.</p>
          </div>

          {/* Sub-tabs for Student screens */}
          <div className="mb-6 overflow-x-auto -mx-4 md:-mx-6 scroll-mask" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="relative flex gap-1.5 md:gap-2 justify-start md:justify-center min-w-min px-4 md:px-6 py-1">
              {screens
                .map((s, i) => ({ ...s, index: i }))
                .map((s) => {
                  const active = activeScreen === s.index;
                  return (
                    <button
                      key={s.index}
                      onClick={() => setActiveScreen(s.index)}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                        active
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                          : 'bg-white/[0.02] text-white/50 border border-white/5 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon name={s.icon} size={14} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Browser window mockup */}
          <div className="perspective-1000 scroll-reveal scroll-reveal-delay-2 relative">
            <div 
              className="aura-glow animate-pulse-slow" 
              style={{ 
                background: screens[activeScreen].glowColor || 'rgba(99, 102, 241, 0.22)',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '110%',
                height: '110%',
                opacity: 0.22
              }} 
            />
            <div
              ref={mainMockupTilt.ref}
              onMouseMove={mainMockupTilt.handleMouseMove}
              onMouseLeave={mainMockupTilt.handleMouseLeave}
              className="tilt-card glass rounded-2xl overflow-hidden border border-white/10 relative z-10"
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
                  prolymp.uz/student/{screens[activeScreen].label.toLowerCase()}
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
          @keyframes pulseSlow {
            0%, 100% { transform: scale(1) translate(0, 0); opacity: 0.7; }
            50% { transform: scale(1.15) translate(30px, -20px); opacity: 0.9; }
          }
          .animate-pulse-slow {
            animation: pulseSlow 12s ease-in-out infinite alternate;
          }
          @keyframes floatBadge1 {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-8px) rotate(1deg); }
          }
          @keyframes floatBadge2 {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(-1deg); }
          }
          @keyframes floatBadge3 {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-6px) rotate(1.5deg); }
          }
          .float-badge-1 { animation: floatBadge1 6s ease-in-out infinite !important; }
          .float-badge-2 { animation: floatBadge2 7s ease-in-out infinite !important; }
          .float-badge-3 { animation: floatBadge3 8s ease-in-out infinite !important; }
          
          .marquee-content {
            display: flex;
            flex-shrink: 0;
            align-items: center;
            justify-content: space-around;
            min-width: 100%;
            gap: 2rem;
            animation: marquee 35s linear infinite;
          }
          .marquee-content:hover {
            animation-play-state: paused;
          }
          @keyframes marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* Tashkilot Boshqaruv Markazi (Futuristic Live Console) */}
      <section id="b2b-console" className="py-12 md:py-24 relative overflow-hidden" style={{ background: '#050508', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        {/* Glow grid lines in the background */}
        <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.12] z-[1]" />
        
        <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-12 md:mb-18 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-indigo-300 border border-indigo-500/20">
              <Icon name="building" size={16} className="text-indigo-400" />
              Tashkilot Boshqaruv Markazi
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">
              Tashkilot Boshqaruv Konso'li
            </h2>
            <p className="text-white/45 max-w-xl mx-auto text-sm md:text-base">
              Direktor, menejer va o'qituvchilar uchun alohida, lekin o'zaro mukammal bog'langan boshqaruv panellari.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Console: Role selectors with glowing specs */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {[
                {
                  id: 'director',
                  label: 'Tashkilot Rahbari (Direktor)',
                  desc: 'Tashkilot premium tahlillari, o\'quvchilar taqqoslash jadvali, oylik hisobotlar va white-label brend rangi sozlamasi.',
                  icon: 'building',
                  color: 'indigo',
                  accent: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/5',
                  accentActive: 'border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_20px_rgba(99,102,241,0.2)]'
                },
                {
                  id: 'manager',
                  label: 'Tashkilot Admini (Menejer)',
                  desc: 'Jonli proctoring (tab o\'zgarishi va aloqa uzilishi nazorati), o\'quvchi arizalarini bir tugma bilan Telegram orqali tasdiqlash va tangalar do\'koni.',
                  icon: 'settings',
                  color: 'amber',
                  accent: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
                  accentActive: 'border-amber-500 bg-amber-500/10 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                },
                {
                  id: 'teacher',
                  label: 'Olimpiada O\'qituvchisi',
                  desc: 'Sun\'iy intellekt (Gemini AI) yordamida tezkor savollar generatsiyasi, topshiriqlar banki va insho/kod javoblarini baholash oynasi.',
                  icon: 'book',
                  color: 'emerald',
                  accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
                  accentActive: 'border-emerald-500 bg-emerald-500/10 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                }
              ].map((role) => {
                const active = activeOrgRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setActiveOrgRole(role.id)}
                    className={`text-left p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                      active ? role.accentActive : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-300 ${active ? role.accent : 'text-white/40 border-white/10 bg-white/5'}`}>
                        <Icon name={role.icon} size={16} />
                      </div>
                      <h4 className="text-sm md:text-base font-bold">{role.label}</h4>
                    </div>
                    <p className="text-xs text-white/45 leading-relaxed pl-11">
                      {role.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Right Console: The living terminal mockup screen */}
            <div className="lg:col-span-7 relative">
              <div 
                className="aura-glow transition-all duration-500" 
                style={{ 
                  background: activeOrgRole === 'director' ? 'rgba(99, 102, 241, 0.15)' : activeOrgRole === 'manager' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '105%',
                  height: '105%',
                  opacity: 0.3,
                  filter: 'blur(50px)'
                }} 
              />
              
              <div className="glass rounded-2xl overflow-hidden border border-white/10 relative z-10 bg-[#0d0e12] shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
                {/* Browser bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="mx-4 px-3 py-1 rounded-md text-xs text-white/30 truncate bg-white/[0.04] font-mono flex items-center gap-1.5 select-none w-full max-w-[320px] justify-center">
                    <Icon name="shield" size={10} className="text-white/20" />
                    <span>prolymp.uz/dashboard/{activeOrgRole}</span>
                  </div>
                  <div className="text-white/20 text-xs flex-shrink-0">⟲</div>
                </div>

                {/* Console content */}
                <div className="relative" style={{ minHeight: '340px' }}>
                  {activeOrgRole === 'director' && <DirectorMockup />}
                  {activeOrgRole === 'manager' && <ManagerMockup />}
                  {activeOrgRole === 'teacher' && <TeacherMockup />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 md:py-24 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-10 scroll-reveal">
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-purple-300 border border-purple-500/20">✨ Xususiyatlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Platforma Imkoniyatlari</h2>
          <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Tashkilotingiz, o'quvchilar va ota-onalar uchun eng zamonaviy premium yechimlar</p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex justify-center mb-10 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
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

        {/* Spotlight — har guruhning eng kuchli imkoniyatlari katta kartada (B) yoki Bento Grid (Barchasi uchun) */}
        {selectedCategory === 'all' ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-6">
            {/* Card 1: AI Savollar va PDF Import (Span 7) */}
            <GlowCard className="p-6 md:p-8 md:col-span-7 flex flex-col justify-between group overflow-hidden border border-white/5 relative min-h-[300px]" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.06) 100%)' }}>
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="sparkles" size={10} />
                  AI Savol Generator & PDF Import
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2 group-hover:text-indigo-200 transition-colors duration-250">Sun'iy Intellekt va PDF Import</h3>
                <p className="text-xs md:text-sm text-white/50 leading-relaxed max-w-lg">Darslik yoki PDF materiallardan avtomatik test savollarini yarating. Gemini AI yordamida soniyalarda test bazangizni shakllantiren.</p>
              </div>
              
              {/* Mini AI visual mockup */}
              <div className="mt-6 glass rounded-xl p-4 border border-white/5 bg-slate-950/40 text-left relative overflow-hidden max-w-md w-full">
                <div className="flex items-center justify-between text-[10px] text-white/40 mb-2 border-b border-white/5 pb-2">
                  <span>Savollar Yaratish Sandig'i</span>
                  <span className="text-indigo-400 font-bold">Aktiv</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-3/4 bg-indigo-500/40 rounded animate-pulse" />
                  <div className="h-1.5 w-1/2 bg-white/10 rounded" />
                </div>
                <div className="flex items-center justify-between mt-4 text-[10px]">
                  <span className="text-white/30">Haftalik PDF hisobot</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">✓ Tayyor</span>
                </div>
              </div>
            </GlowCard>

            {/* Card 2: Proctoring (Span 5) */}
            <GlowCard className="p-6 md:p-8 md:col-span-5 flex flex-col justify-between group overflow-hidden border border-white/5 relative min-h-[300px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="eye" size={10} />
                  Jonli Proctoring Nazorati
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2 group-hover:text-rose-200 transition-colors duration-250">Jonli Proctoring</h3>
                <p className="text-xs md:text-sm text-white/50 leading-relaxed">Test topshirayotgan o'quvchilarning tab o'zgarishi, ping holati va faolliklarini real vaqtda kuzating.</p>
              </div>

              {/* Event stream list mockup */}
              <div className="mt-6 space-y-2 w-full font-mono text-[9px] text-white/40">
                <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                  <span className="truncate max-w-[150px]">Ali Valiyev · Tab o'zgartirdi</span>
                  <span className="text-amber-400 font-bold">Ogohlantirish</span>
                </div>
                <div className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5">
                  <span className="truncate max-w-[150px]">Sardor Aliyev · Aloqa uzildi</span>
                  <span className="text-rose-400 font-bold">Offline</span>
                </div>
              </div>
            </GlowCard>

            {/* Card 3: O'quvchi Streak & Tangalar Do'koni (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-white/5 relative min-h-[280px]">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="tag" size={10} />
                  O'yinlashtirilgan Tizim
                </span>
                <h3 className="text-lg md:text-xl font-bold text-white mb-2 group-hover:text-amber-200 transition-colors duration-250">Streak & Do'kon Tizimi</h3>
                <p className="text-xs text-white/50 leading-relaxed">O'quvchilar testlar topshirib virtual tangalar yig'adi va nishonlar, sovg'alar olishadi.</p>
              </div>
              <div className="mt-6 flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                <span className="text-orange-400 font-bold text-xs flex items-center gap-1">🔥 7 kunlik streak</span>
                <span className="text-yellow-400 font-bold text-xs flex items-center gap-1">🪙 120 tanga</span>
              </div>
            </GlowCard>

            {/* Card 4: Ota-ona Telegram Monitoringi (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-white/5 relative min-h-[280px]">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="users" size={10} />
                  Haftalik Digest
                </span>
                <h3 className="text-lg md:text-xl font-bold text-white mb-2 group-hover:text-emerald-200 transition-colors duration-250">Ota-ona Monitoringi</h3>
                <p className="text-xs text-white/50 leading-relaxed">Farzand faolligi va natijalari bo'yicha Telegram xabarnomalar va tahliliy haftalik PDF.</p>
              </div>
              <div className="mt-6 bg-emerald-500/10 text-emerald-300 text-[10px] font-bold px-3 py-2 rounded-xl border border-emerald-500/20 text-center">
                💬 Telegram Digest Faol
              </div>
            </GlowCard>

            {/* Card 5: Markaz Premium Analitikasi (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-white/5 relative min-h-[280px]" style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(99,102,241,0.04) 100%)' }}>
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="chart" size={10} />
                  Premium Analitika
                </span>
                <h3 className="text-lg md:text-xl font-bold text-white mb-2 group-hover:text-cyan-200 transition-colors duration-250">Tashkilot Analitikasi</h3>
                <p className="text-xs text-white/50 leading-relaxed">Guruhlar tahlili, o'rtacha ballar o'sish dinamikasi va TOP o'quvchilar taqqoslash jadvali.</p>
              </div>
              <div className="mt-6 flex justify-between text-[11px] text-white/50 border-t border-white/5 pt-3">
                <span>O'rtacha ball: 82.4%</span>
                <span className="text-emerald-400 font-bold">↑ 3.2%</span>
              </div>
            </GlowCard>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {spotlightFeatures.map((f, i) => (
              <GlowCard
                key={f.title}
                className="p-5 md:p-8 group"
                style={{
                  animation: 'cardEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  animationDelay: `${(i % 6) * 50}ms`
                }}
              >
                <div className="flex items-start gap-4 relative z-10">
                  <div className={`feature-icon flex-shrink-0 bg-gradient-to-br ${f.color} flex items-center justify-center text-white/90 shadow-md shadow-black/20 group-hover:scale-110 transition-transform duration-300`}>
                    {f.iconName ? <Icon name={f.iconName} size={22} /> : <span className="text-xl">{f.icon}</span>}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base md:text-xl font-bold text-white mb-1.5 md:mb-2 group-hover:text-indigo-200 transition-colors duration-250">{f.title}</h3>
                    <p className="text-sm md:text-[15px] text-white/45 leading-relaxed group-hover:text-white/65 transition-colors duration-250">{f.desc}</p>
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>
        )}

        {/* Qolgan imkoniyatlar — kichik chip qatori (B) */}
        {chipFeatures.length > 0 && (
          <div className="mt-8 md:mt-10">
            <div className="text-center text-xs md:text-sm font-semibold text-white/35 uppercase tracking-wider mb-4">
              Va yana {chipFeatures.length} ta imkoniyat
            </div>
            <div className="flex flex-wrap justify-center gap-2 md:gap-2.5">
              {chipFeatures.map((f) => (
                <span
                  key={f.title}
                  title={f.desc}
                  className="inline-flex items-center gap-1.5 px-3 md:px-3.5 py-1.5 md:py-2 rounded-full text-[11px] md:text-xs font-semibold text-white/60 border border-white/10 hover:text-white hover:border-indigo-500/40 transition-colors cursor-default"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <Icon name={f.iconName || 'sparkles'} size={13} className="text-indigo-300/80" />
                  {f.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* How it works */}
      <section id="how" className="py-12 md:py-24" style={{ background: 'linear-gradient(180deg, #050508 0%, rgba(99,102,241,0.03) 15%, rgba(99,102,241,0.03) 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-cyan-300 border border-cyan-500/20">🔄 Qanday ishlaydi</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">4 ta oson qadam</h2>
            <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Platformadan foydalanishni boshlash juda oson va tez</p>
          </div>
          
          <div className="relative grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 z-10">
            {/* Connecting line (Desktop only) */}
            <div className="hidden md:block absolute top-[44px] left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-indigo-500/20 via-purple-500/30 to-cyan-500/20 border-t border-dashed border-indigo-500/30 z-0 pointer-events-none" />
            
            {steps.map((s, i) => (
              <div key={i} className={`glass rounded-2xl p-5 md:p-6 card-hover flex flex-col items-center md:items-start text-center md:text-left scroll-reveal scroll-reveal-delay-${(i % 4) + 1} relative z-10 group`}>
                {/* Step Circle */}
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center relative shadow-lg mb-4 flex-shrink-0 group-hover:border-indigo-500/40 transition-colors duration-300">
                  {/* Step Number Badge */}
                  <span className="absolute -top-2.5 -right-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                    {s.num}
                  </span>
                  {s.iconName ? (
                    <Icon name={s.iconName} size={20} className="text-indigo-400" />
                  ) : (
                    <span className="text-xl">{s.icon}</span>
                  )}
                </div>
                
                <h3 className="text-base md:text-lg font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors duration-250">{s.title}</h3>
                <p className="text-xs md:text-sm text-white/40 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram flow */}
      <section id="telegram-flow" className="py-12 md:py-24 max-w-5xl mx-auto px-4 md:px-6 scroll-reveal">
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

      {/* Social proof — foydalanuvchilar fikrlari (C) */}
      <section className="py-12 md:py-24 max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-12 scroll-reveal">
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-amber-300 border border-amber-500/20">⭐ Fikrlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Bizga ishonishadi</h2>
          <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Platformadan foydalanayotgan markazlar va ota-onalarning fikrlari</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            { name: 'Sardorbek M.', org: 'ProSkill Academy', meta: "120 o'quvchi", stars: 5, color: 'from-indigo-500 to-purple-600', text: "AI savol generatori haftalik test tayyorlash vaqtimizni 10 barobar qisqartirdi. Olimpiada natijalarini endi qo'lda hisoblamaymiz." },
            { name: 'Dilnoza K.', org: 'Bilim Markazi', meta: "85 o'quvchi", stars: 5, color: 'from-cyan-500 to-blue-600', text: "O'quvchilar reytingi va mashq rejimi guruhdagi faollikni sezilarli oshirdi. Ota-onalar PDF hisobotlardan juda mamnun." },
            { name: 'Jasur T.', org: 'Iqtidor School', meta: "210 o'quvchi", stars: 5, color: 'from-emerald-500 to-teal-600', text: "PDF'dan test import qilish funksiyasi darsliklarimizni soniyalarda test bazasiga aylantirdi. Proctoring nazorati ham ishonchli." },
            { name: 'Nilufar A.', org: 'Ota-ona', meta: "2 farzand", stars: 4, color: 'from-rose-500 to-orange-500', text: "Telegram orqali har hafta farzandlarim natijalarini olib turaman. Qaysi fanda oqsayotganini aniq bilaman." },
          ].map((t, i) => (
            <div key={t.name} className={`glass rounded-2xl p-5 border border-white/5 hover:border-white/10 transition-colors flex flex-col scroll-reveal scroll-reveal-delay-${(i % 4) + 1}`}>
              {/* Yulduz reytingi */}
              <div className="flex gap-0.5 mb-3 text-amber-400 text-sm" aria-label={`${t.stars} yulduz`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= t.stars ? 'text-amber-400' : 'text-white/15'}>★</span>
                ))}
              </div>
              <p className="text-xs md:text-sm text-white/60 leading-relaxed flex-1 mb-4">"{t.text}"</p>
              <div className="flex items-center gap-3 border-t border-white/5 pt-3.5">
                {/* Avatar placeholder — ism bosh harflari */}
                <span className={`flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-[11px] font-black text-white shadow-md shadow-black/30`}>
                  {t.name.split(' ').map(w => w[0]).join('')}
                </span>
                <div className="min-w-0">
                  <div className="text-xs md:text-sm font-bold text-white truncate">{t.name}</div>
                  <div className="text-[10px] md:text-[11px] text-white/40 truncate">{t.org} · {t.meta}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — rejalar backenddan (GET /api/billing/plans/) yuklanadi. */}
      <section id="pricing" className="py-12 md:py-24" style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.03) 0%, rgba(99,102,241,0.03) 85%, #050508 100%)' }}>
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-12 scroll-reveal">
            <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-indigo-300 border border-indigo-500/20">💎 Narxlar</div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Qulay narxlar</h2>
            <p className="text-sm text-white/50 max-w-xl mx-auto">
              Platformamiz premium imkoniyatlaridan foydalanish uchun o'zingizga qulay rejani tanlang. Muddat qanchalik uzun bo'lsa, chegirma shunchalik yuqori bo'ladi!
            </p>
          </div>

          {/* Plan Type Switcher & Duration Selector */}
          <div className="flex flex-col items-center gap-6 mb-12 scroll-reveal scroll-reveal-delay-1">
            {/* O'quvchi vs Tashkilot */}
            <div className="inline-flex p-1 bg-white/5 rounded-2xl border border-white/10 shadow-inner">
              <button
                onClick={() => setPlanTypeFilter('student')}
                className={`flex items-center gap-2 px-5 md:px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 ${planTypeFilter === 'student' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/20' : 'text-white/60 hover:text-white'}`}
              >
                <span>👨‍🎓</span>
                <span>O'quvchilar</span>
              </button>
              <button
                onClick={() => setPlanTypeFilter('organization')}
                className={`flex items-center gap-2 px-5 md:px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 ${planTypeFilter === 'organization' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/20' : 'text-white/60 hover:text-white'}`}
              >
                <span>🏢</span>
                <span>Tashkilotlar</span>
              </button>
            </div>

            {/* Muddat selectorlari (1, 3, 6, 12 oy) */}
            <div className="flex gap-2.5 flex-wrap justify-center">
              {[
                { label: '1 oy', days: 30 },
                { label: '3 oy', days: 90, discount: '10%' },
                { label: '6 oy', days: 180, discount: '20%' },
                { label: '1 yil', days: 365, discount: '30%' },
              ].map((dur) => (
                <button
                  key={dur.days}
                  onClick={() => setDurationFilter(dur.days)}
                  className={`relative px-4 md:px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200 border ${
                    durationFilter === dur.days
                      ? 'bg-white text-indigo-950 border-white shadow-lg font-black'
                      : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {dur.label}
                  {dur.discount && (
                    <span className="absolute -top-2.5 -right-2 bg-gradient-to-r from-pink-500 to-rose-500 text-[8px] text-white px-1.5 py-0.5 rounded-md font-extrabold shadow-md animate-bounce">
                      -{dur.discount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tejash kalkulyatori banneri (D) — 1 oydan uzun muddat tanlanganda */}
            {durationFilter > 30 && maxSavings > 0 && (
              <div className="inline-flex items-center gap-2.5 px-4 md:px-5 py-2.5 rounded-2xl border border-emerald-500/25 text-xs md:text-sm font-bold text-emerald-300" style={{ background: 'rgba(16,185,129,0.08)' }}>
                <span className="text-base">💰</span>
                <span>
                  {durationLabel} rejani tanlasangiz, oyma-oy to'lovga nisbatan{' '}
                  <span className="text-emerald-400 font-black">{formatUZS(maxSavings)}</span> gacha tejaysiz
                </span>
              </div>
            )}
          </div>
          {plansLoading && !plans ? (
            // Skeleton — rejalar yuklanguncha 3 ta placeholder karta.
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass rounded-2xl p-4 md:p-6 animate-pulse">
                  <div className="h-4 w-24 bg-white/10 rounded mb-4" />
                  <div className="h-8 w-32 bg-white/10 rounded mb-2" />
                  <div className="h-3 w-40 bg-white/5 rounded mb-6" />
                  <div className="space-y-3 mb-6">
                    <div className="h-3 w-full bg-white/5 rounded" />
                    <div className="h-3 w-5/6 bg-white/5 rounded" />
                    <div className="h-3 w-4/6 bg-white/5 rounded" />
                  </div>
                  <div className="h-10 w-full bg-white/10 rounded-xl" />
                </div>
              ))}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {filteredPricing.map((p, i) => {
              const delayClass = `scroll-reveal scroll-reveal-delay-${(i % 3) + 1}`;
              // Narxi 0 bo'lgan reja bepul (API'da id farq qilishi mumkin,
              // shuning uchun narxga qarab aniqlaymiz).
              const isFree = String(p.price || '').replace(/\s/g, '').startsWith('0');
              const handleClick = () => {
                if (isFree) {
                  if (user) {
                    onNavigate(user.activeRole || 'student');
                  } else {
                    onNavigate('register');
                  }
                } else {
                  if (!user) {
                    onNavigate('login');
                  } else {
                    setPaymentPlan(p);
                  }
                }
              };
              return (
                <GlowCard 
                  key={i} 
                  className={`p-5 md:p-6 flex flex-col ${delayClass} ${p.popular ? 'glow-purple border-purple-500/30' : 'border-white/5'}`}
                  style={p.popular ? {
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(99, 102, 241, 0.08) 50%, rgba(34, 211, 238, 0.04) 100%)',
                    borderColor: 'rgba(168, 85, 247, 0.4)',
                    boxShadow: '0 20px 40px rgba(168, 85, 247, 0.1), 0 0 30px rgba(99, 102, 241, 0.06)'
                  } : {}}
                >
                  <div className="relative z-10 flex flex-col h-full">
                    {p.popular && (
                      <div className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 w-fit mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>Mashhur tanlov</span>
                      </div>
                    )}
                    <div className={`text-sm font-bold tracking-wide mb-1 ${p.popular ? 'text-purple-300' : 'text-white/50'}`}>{p.name}</div>
                    <div className="text-3xl md:text-4xl font-black mb-1.5 text-white flex items-baseline gap-1">
                      <span>{p.price}</span>
                    </div>
                    {p.period && <div className={`text-xs mb-3 font-semibold ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.period}</div>}
                    {/* Tanlangan muddatdagi tejash miqdori (D) */}
                    {getPlanSavings(p) > 0 && (
                      <div className="inline-flex items-center gap-1.5 w-fit text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 mb-3">
                        <span>💰</span>
                        <span>{formatUZS(getPlanSavings(p))} tejaysiz</span>
                      </div>
                    )}
                    <div className={`text-xs mb-5 leading-relaxed ${p.popular ? 'text-white/60' : 'text-white/40'}`}>{p.desc}</div>
                    
                    <ul className="space-y-3 flex-1 mb-6 border-t border-white/5 pt-4">
                       {p.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-xs md:text-sm text-white/75">
                          <span className={`flex-shrink-0 w-4.5 h-4.5 rounded-full ${p.popular ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'} text-[10px] flex items-center justify-center font-black mt-0.5`}>✓</span> 
                          <span className="leading-normal">{f}</span>
                        </li>
                      ))}
                    </ul>
                    
                    <Magnetic>
                      <button onClick={handleClick}
                        className={`w-full py-3 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 ${
                          p.popular 
                            ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98]' 
                            : 'btn-ghost border border-white/10 hover:border-white/20 hover:scale-[1.01] active:scale-[0.99]'
                        }`}>
                        {isFree ? (user ? 'Boshqaruv paneli' : 'Boshlash') : (user ? 'Sotib olish' : 'Kirish va ulanish')}
                      </button>
                    </Magnetic>
                  </div>
                </GlowCard>
              );
            })}
          </div>
          )}
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 scroll-reveal">
        <div className="text-center mb-10 md:mb-16">
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-3 md:mb-4 text-xs md:text-sm text-indigo-300 border border-indigo-500/20">❓ FAQ</div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Ko'p beriladigan savollar</h2>
          <p className="text-white/40 max-w-xl mx-auto text-sm md:text-base">Olympy platformasi haqida o'zingizni qiziqtirgan barcha savollarga javob oling</p>
        </div>

        <div className="space-y-4">
          {[
            {
              q: "Olympy platformasi kimlar uchun mo'ljallangan?",
              a: "Olympy — o'quv markazlari, maktablar, lisey va oliy ta'lim muassasalari uchun mo'ljallangan. U olimpiadalar o'tkazish, testlar topshirish, reytinglarni hisoblash va natijalarni tahlil qilish jarayonlarini to'liq avtomatlashtiradi."
            },
            {
              q: "AI (sun'iy intellekt) orqali qanday qilib savol yaratish mumkin?",
              a: "Platformamizga integratsiya qilingan Gemini AI darsliklar, mavzular yoki kalit so'zlar asosida bir necha soniya ichida yuzlab noyob, qiyinchilik darajasi sozlangan test savollarini avtomatik yaratib beradi."
            },
            {
              q: "Ota-onalar farzandlarining natijalarini qanday kuzatishadi?",
              a: "Ota-onalar uchun maxsus Telegram-bot ishlaydi. Bot orqali ota-onaga har hafta farzandining test urinishlari, o'rtacha ballari, faollik kunlari va rivojlanish grafigi PDF (digest) shaklida yuboriladi."
            },
            {
              q: "Premium tariflarning afzalliklari nimada?",
              a: "Premium tariflarda AI savollar generatoridan cheksiz foydalanish, PDF formatida tahliliy hisobotlarni yuklab olish, Telegram-bot orqali tasdiqlash funksiyasi, oltin unvon va reyting cheklovlarisiz ishlash imkoniyatlari mavjud."
            },
            {
              q: "To'lovlar qanday amalga oshiriladi va qanday tizimlar qo'llab-quvvatlanadi?",
              a: "Biz Click va Payme to'lov tizimlarini to'liq qo'llab-quvvatlaymiz. O'zingizga qulay obuna rejasini tanlab, Click yoki Payme orqali bir necha klikda xavfsiz to'lovni amalga oshirishingiz mumkin."
            }
          ].map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div 
                key={idx} 
                className={`glass rounded-2xl border transition-all duration-300 ${isOpen ? 'border-indigo-500/30 bg-white/[0.04]' : 'border-white/5 hover:border-white/10'}`}
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-sm md:text-base text-white hover:text-indigo-300 transition-colors select-none outline-none"
                >
                  <span>{faq.q}</span>
                  <span className={`transition-transform duration-300 text-indigo-400 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                    <Icon name="chevronDown" size={20} />
                  </span>
                </button>
                <div className={`accordion-content ${isOpen ? 'open' : ''}`}>
                  <div className="p-5 pt-0 text-xs md:text-sm text-white/50 leading-relaxed border-t border-white/5 mt-1">
                    {faq.a}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA (E) — gradient mesh fon statik radial-gradient'lar bilan chizilgan
          (filter: blur ishlatilmaydi — Telegram WebView'da xavfsiz). */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 text-center scroll-reveal">
        <div
          className="rounded-3xl p-6 md:p-12 relative overflow-hidden border border-indigo-500/20"
          style={{
            background: [
              'radial-gradient(ellipse 60% 50% at 15% 0%, rgba(99,102,241,0.22) 0%, transparent 60%)',
              'radial-gradient(ellipse 50% 50% at 85% 20%, rgba(168,85,247,0.18) 0%, transparent 60%)',
              'radial-gradient(ellipse 55% 45% at 50% 110%, rgba(34,211,238,0.14) 0%, transparent 60%)',
              'rgba(13,14,18,0.9)',
            ].join(', '),
          }}
        >
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.18]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full px-3 md:px-4 py-1.5 md:py-2 mb-4 md:mb-5 text-xs md:text-sm font-bold text-indigo-200 border border-indigo-400/25" style={{ background: 'rgba(99,102,241,0.12)' }}>
              <Icon name="bolt" size={14} />
              Ro'yxatdan o'tish 2 daqiqa vaqt oladi
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white mb-3 md:mb-4">Bugun boshlang</h2>
            <p className="text-white/45 mb-6 md:mb-8 text-sm md:text-base max-w-xl mx-auto">Tashkilotingizni raqamli olimpiada platformasiga ulang — AI savollar, jonli reyting va avtomatik hisobotlar bitta tizimda</p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center sm:justify-center gap-3 md:gap-4 mb-7 md:mb-9">
              <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-2xl text-sm md:text-base font-bold glow-blue">
                <Icon name="bolt" size={18} />
                Bepul boshlash
              </button>
              <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-2xl text-sm md:text-base font-semibold">
                Kirish
                <Icon name="chevronRight" size={18} />
              </button>
            </div>

            {/* Motivatsion mini-statlar */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-[11px] md:text-xs font-semibold text-white/50 border-t border-white/5 pt-5 md:pt-6">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sparkles" size={14} className="text-indigo-400" />
                <CountUp end={100} suffix="+" className="text-white font-black" /> AI savol soniyada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="grid" size={14} className="text-cyan-400" />
                <CountUp end={26} suffix="+" className="text-white font-black" /> premium imkoniyat
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="trophy" size={14} className="text-emerald-400" />
                Jonli reyting va sertifikatlar
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="shield" size={14} className="text-amber-400" />
                Bepul boshlash uchun karta talab qilinmaydi
              </span>
            </div>
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

      {paymentPlan && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/95 px-4">
          <div className="glass-strong rounded-3xl p-6 md:p-8 max-w-md w-full border border-indigo-500/25 relative overflow-hidden">
            <div className="hero-glow" style={{ background: '#6366f1', top: '-30%', left: '30%', opacity: 0.15 }} />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">To'lov usulini tanlang</h3>
                  <p className="text-xs text-white/50">"{paymentPlan.name}" obunasi uchun to'lov</p>
                </div>
                <button 
                  onClick={() => { setPaymentPlan(null); setPaymentError(''); }}
                  className="text-white/40 hover:text-white transition-colors text-xl font-semibold outline-none"
                >
                  ✕
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">Tanlangan reja:</span>
                  <span className="text-sm font-bold text-white">{paymentPlan.name}</span>
                </div>
                <div className="flex justify-between items-center mt-2 border-t border-white/5 pt-2">
                  <span className="text-sm text-white/60">Jami narx:</span>
                  <span className="text-lg font-black text-indigo-400">{paymentPlan.price}</span>
                </div>
              </div>

              {paymentError && (
                <div className="mb-4 text-xs font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                  {paymentError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  disabled={paymentLoading}
                  onClick={() => handleCreatePayment('click')}
                  className="flex flex-col items-center justify-center gap-3 p-4 bg-white/5 border border-white/10 hover:border-indigo-500/50 rounded-2xl transition-all hover:bg-white/10 group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-[#009cf0]/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="text-xl font-black text-[#009cf0]">C</span>
                  </div>
                  <span className="text-sm font-semibold text-white">Click</span>
                </button>

                <button
                  disabled={paymentLoading}
                  onClick={() => handleCreatePayment('payme')}
                  className="flex flex-col items-center justify-center gap-3 p-4 bg-white/5 border border-white/10 hover:border-teal-500/50 rounded-2xl transition-all hover:bg-white/10 group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-[#3cb8b6]/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <span className="text-xl font-black text-[#3cb8b6]">P</span>
                  </div>
                  <span className="text-sm font-semibold text-white">Payme</span>
                </button>
              </div>

              {paymentLoading && (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-indigo-300">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>To'lov havolasi yuklanmoqda...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { LandingPage });
