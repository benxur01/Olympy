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
    <div className="p-5 md:p-6 text-text-primary text-left select-none relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-edge pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-text-primary flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span>ProSkill Academy (Direktor)</span>
          </h4>
          <p className="text-[10px] md:text-xs text-text-secondary mt-0.5">Tashkilot Boshqaruv & Premium Analitikasi</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-accent-fill text-on-accent px-2 py-0.5 rounded font-bold tracking-wide uppercase">Premium</span>
          <span className="text-[10px] bg-success/12 text-success border border-success/35 px-2 py-0.5 rounded-lg font-bold">Reyting: #3</span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="glass p-3 rounded-xl border-t-2 border-t-accent border-x-edge border-b-edge">
          <div className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">O'rtacha Ball</div>
          <div className="text-lg font-black text-accent mt-1">82.4%</div>
          <div className="text-[9px] text-success font-semibold mt-0.5 flex items-center gap-0.5">
            <span>↑</span> 3.2% o'sish
          </div>
        </div>
        <div className="glass p-3 rounded-xl border-t-2 border-t-accent-2 border-x-edge border-b-edge">
          <div className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">Jami Urinishlar</div>
          <div className="text-lg font-black text-accent-2 mt-1">1,420 ta</div>
          <div className="text-[9px] text-text-secondary font-semibold mt-0.5">Ushbu oyda</div>
        </div>
        <div className="glass p-3 rounded-xl border-t-2 border-t-error border-x-edge border-b-edge">
          <div className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">Nofaol O'quvchilar</div>
          <div className="text-lg font-black text-error mt-1">4 ta</div>
          <div className="text-[9px] text-error/80 font-semibold mt-0.5">Ogohlantirish (T3)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="glass p-3.5 rounded-xl">
          <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="users" size={12} className="text-accent" />
            <span>TOP O'quvchilar Taqqoslash (T1)</span>
          </div>
          <div className="space-y-2">
            {[
              { rank: 1, name: 'Ali Valiyev', score: 94.2, attempts: 18, color: 'bg-accent' },
              { rank: 2, name: 'Sardor Aliyev', score: 88.5, attempts: 14, color: 'bg-accent/80' },
              { rank: 3, name: 'Zuhra Karimova', score: 87.1, attempts: 15, color: 'bg-accent/60' },
            ].map(row => (
              <div key={row.rank} className="space-y-1">
                <div className="flex justify-between text-xs text-text-primary">
                  <span>{row.rank}. {row.name}</span>
                  <span className="font-semibold text-text-primary">{row.score}% <span className="text-[10px] text-text-secondary">({row.attempts} ta)</span></span>
                </div>
                <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${row.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass p-3.5 rounded-xl">
          <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="brain" size={12} className="text-accent-2" />
            <span>Savollar Qiyinlik Analitikasi (T4)</span>
          </div>
          <div className="space-y-2">
            {[
              { id: '#12', text: 'Kombinatorika elementlari...', error: '74%' },
              { id: '#08', text: 'Eritmalarga oid masalalar...', error: '61%' },
              { id: '#22', text: 'Matnli masalalar tahlili...', error: '55%' },
            ].map((q, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs text-text-secondary border-b border-edge pb-1 last:border-0 last:pb-0">
                <span className="truncate max-w-[110px]"><span className="text-accent font-semibold">{q.id}</span> {q.text}</span>
                <span className="bg-error/12 text-error px-1.5 py-0.5 rounded text-[10px] border border-error/35 font-bold">{q.error} xato</span>
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
    <div className="p-5 md:p-6 text-text-primary text-left select-none relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-edge pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-text-primary flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-warning" />
            <span>Menejer Boshqaruv Paneli</span>
          </h4>
          <p className="text-[10px] md:text-xs text-text-secondary mt-0.5">Olimpiada nazorati va arizalar</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-warning/12 text-warning border border-warning/35 px-2 py-0.5 rounded-lg font-bold">Faol Tadbir: 1 ta</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Live Proctoring List */}
        <div className="md:col-span-7 glass p-3.5 rounded-xl">
          <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="eye" size={12} className="text-warning" />
            <span>Jonli Proctoring (Tab Nazorati)</span>
          </div>
          <div className="space-y-2">
            {[
              { name: 'Ali Valiyev', event: 'Matematika Live', msg: 'Tab o\'zgartirdi (2 ta ogohlantirish)', time: '12:04:15', status: 'warning', color: 'text-warning border-warning/35 bg-warning/12' },
              { name: 'Sardor Aliyev', event: 'Matematika Live', msg: 'Aloqa butunlay uzildi', time: '12:03:50', status: 'error', color: 'text-error border-error/35 bg-error/12' },
              { name: 'Zuhra Karimova', event: 'Matematika Live', msg: 'Muammosiz topshirmoqda', time: '12:04:22', status: 'success', color: 'text-success border-success/35 bg-success/12' },
            ].map((row, idx) => (
              <div key={idx} className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${row.color}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-text-primary truncate">{row.name}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{row.msg}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <span className="text-[9px] font-mono opacity-50 block">{row.time}</span>
                  {row.status === 'warning' && <span className="text-[9px] font-bold uppercase tracking-wider text-warning">Ogohlantirish</span>}
                  {row.status === 'error' && <span className="text-[9px] font-bold uppercase tracking-wider text-error">Offline</span>}
                  {row.status === 'success' && <span className="text-[9px] font-bold uppercase tracking-wider text-success">Online</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Requests and Shop control */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3.5 rounded-xl flex-1 text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
              <span>Kutilayotgan arizalar</span>
              <span className="bg-warning/12 text-warning font-bold px-1.5 py-0.5 rounded text-[8px]">2 ta</span>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Sirojiddin B.', phone: '+998 90 *** 1234' },
                { name: 'Madina K.', phone: '+998 93 *** 5678' }
              ].map((req, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded border border-edge">
                  <div className="min-w-0">
                    <div className="font-bold text-text-primary truncate">{req.name}</div>
                    <div className="text-[9px] text-text-secondary">{req.phone}</div>
                  </div>
                  <div className="flex gap-1">
                    <span className="bg-success/12 text-success border border-success/35 px-1.5 py-0.5 rounded text-[9px] font-bold">Tasdiqlash</span>
                    <span className="bg-error/12 text-error border border-error/35 px-1.5 py-0.5 rounded text-[9px] font-bold">Rad etish</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-3.5 rounded-xl flex-1 flex flex-col justify-center text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
              <Icon name="award" size={12} className="text-warning" />
              <span>Markaz Do'koni (Mukofotlar)</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded border border-edge">
              <div className="flex items-center gap-2">
                <Icon name="tag" size={16} className="text-accent" />
                <div>
                  <div className="font-bold text-text-primary">Brendli Ryukzak</div>
                  <div className="text-[9px] text-text-secondary">Zaxira: 12 ta</div>
                </div>
              </div>
              <span className="text-warning font-bold font-mono">250 tanga</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TeacherMockup = () => {
  return (
    <div className="p-5 md:p-6 text-text-primary text-left select-none relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-edge pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-text-primary flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span>O'qituvchi Boshqaruv Paneli</span>
          </h4>
          <p className="text-[10px] md:text-xs text-text-secondary mt-0.5">Test yaratish, tahrirlash va baholash tizimi</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-success/12 text-success border border-success/35 px-2 py-0.5 rounded-lg font-bold">Mening Savollarim: 124 ta</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Question Creator Mockup */}
        <div className="md:col-span-7 glass p-3.5 rounded-xl">
          <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="sparkles" size={12} className="text-success" />
            <span>AI Savol Generatori & Savollar Banki</span>
          </div>
          <div className="space-y-3">
            <div className="glass bg-surface-1 p-2.5 rounded-xl space-y-2">
              <div className="text-[10px] text-success font-bold flex items-center gap-1">
                <span>Gemini AI tavsiya qilgan savol</span>
              </div>
              <div className="text-xs text-text-primary leading-relaxed font-medium">
                "Uchburchakning tomonlari 5, 12 va 13 bo'lsa, uning ichki chizilgan aylanasi radiusini toping."
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="px-2 py-1 rounded text-text-primary border border-edge">A) 3</div>
                <div className="bg-success/12 px-2 py-1 rounded text-success border border-success/35 font-bold">B) 2 (To'g'ri)</div>
                <div className="px-2 py-1 rounded text-text-primary border border-edge">C) 1.5</div>
                <div className="px-2 py-1 rounded text-text-primary border border-edge">D) 4</div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <span className="text-text-primary border border-edge px-2.5 py-1.5 rounded text-[10px] font-bold">Qayta yaratish</span>
              <span className="bg-success/12 text-success border border-success/35 px-2.5 py-1.5 rounded-xl text-[10px] font-bold">Bankka qo'shish</span>
            </div>
          </div>
        </div>

        {/* Grading and My Events */}
        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3.5 rounded-xl flex-1 text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
              <span>Baholash kutilmoqda (Essay)</span>
              <span className="bg-success/12 text-success font-bold px-1.5 py-0.5 rounded text-[8px]">3 ta</span>
            </div>
            <div className="space-y-2">
              {[
                { student: 'Jasur Temirov', task: 'Kombinatorika algoritmlari', val: 'Java tilida recursive yechim...' },
                { student: 'Laylo Sodiqova', task: 'Matematik isbot', val: 'Formula bo\'yicha induction usulda...' }
              ].map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-text-secondary border-b border-edge pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="font-bold text-text-primary block truncate">{item.student}</span>
                    <span className="text-[9px] text-text-secondary block truncate">{item.task}</span>
                  </div>
                  <span className="bg-success/12 text-success border border-success/35 px-2 py-1 rounded text-[9px] font-bold shrink-0 ml-2">Baholash</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-3.5 rounded-xl flex-1 flex flex-col justify-center text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
              <Icon name="trophy" size={12} className="text-success" />
              <span>Mening faol olimpiadalarim</span>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <div className="font-bold text-text-primary text-xs">Haftalik Matematika #4</div>
                <div className="text-[9px] text-text-secondary">Tugash vaqti: 18:00</div>
              </div>
              <span className="bg-success/12 text-success px-2 py-0.5 rounded text-[9px] border border-success/35 font-bold">Faol</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ParentMockup = () => {
  return (
    <div className="p-5 md:p-6 text-text-primary text-left select-none relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', minHeight: '340px' }}>
      <div className="flex items-center justify-between border-b border-edge pb-3.5 mb-4">
        <div>
          <h4 className="text-sm md:text-base font-bold text-text-primary flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-2" />
            <span>Ota-ona Boshqaruv Nazorati</span>
          </h4>
          <p className="text-[10px] md:text-xs text-text-secondary mt-0.5">Farzandlar natijalari, o'sish dinamikasi va Telegram xabarlari</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-accent-2/10 text-accent-2 border border-accent-2/40 px-2 py-0.5 rounded-lg font-bold">Farzand: Ali Valiyev</span>
          <span className="text-[10px] bg-success/12 text-success border border-success/35 px-2 py-0.5 rounded-lg font-bold">Streak: 14 kun</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7 glass p-3.5 rounded-xl">
          <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2.5 flex items-center gap-1.5">
            <Icon name="chart" size={12} className="text-accent-2" />
            <span>O'sish Dinamikasi va Test Natijalari</span>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2.5 rounded border border-edge">
              <div>
                <div className="text-xs font-bold text-text-primary">Respublika Matematika Olimpiadasi</div>
                <div className="text-[9px] text-text-secondary">Kecha · 24-iyul, 2026</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-success">96 / 100 ball</span>
                <span className="text-[9px] text-accent-2 block">1-o'rin</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded border border-edge">
              <div>
                <div className="text-xs font-bold text-text-primary">Haftalik Fizika Test #3</div>
                <div className="text-[9px] text-text-secondary">20-iyul, 2026</div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-accent">88 / 100 ball</span>
                <span className="text-[9px] text-text-secondary block">3-o'rin</span>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-5 flex flex-col gap-3">
          <div className="glass p-3.5 rounded-xl flex-1 text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2 flex items-center justify-between">
              <span>Telegram Xabarnomalar</span>
              <span className="bg-success/12 text-success font-bold px-1.5 py-0.5 rounded text-[8px]">Ulangan</span>
            </div>
            <div className="space-y-2">
              <div className="bg-success/12 p-2 rounded-lg border border-success/35 text-[10px]">
                <span className="text-success font-bold block">Bildirishnoma:</span>
                <span className="text-text-secondary">"Farzandingiz Ali Valiyev Matematika testida 96 ball to'pladi va 1-o'rinni egalladi!"</span>
              </div>
            </div>
          </div>

          <div className="glass p-3.5 rounded-xl flex-1 flex flex-col justify-center text-xs">
            <div className="text-[10px] text-text-secondary uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
              <Icon name="award" size={12} className="text-warning" />
              <span>QR Sertifikat va Yutuqlar</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded border border-edge">
              <div className="flex items-center gap-2">
                <Icon name="award" size={16} className="text-accent" />
                <div>
                  <div className="font-bold text-text-primary text-xs">I darajali Diplom</div>
                  <div className="text-[9px] text-success font-mono">QR: #OL-88421</div>
                </div>
              </div>
              <span className="bg-accent-2/15 text-accent-2 border border-accent-2/40 px-2 py-0.5 rounded text-[9px] font-bold">Tekshirilgan</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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

// ─── Mahsulot ekranlari ─────────────────────────────────────────────────────
// Skrinshotlar `img` orqali EMAS, DOM ichiga inline SVG bo'lib qo'yiladi.
// Sabab: `img` bilan yuklangan SVG alohida hujjat sifatida chiziladi va
// sahifaning CSS'ini — jumladan `:root` dagi rang tokenlarini — umuman
// ko'rmaydi, shuning uchun mavzu almashganda u o'zgarmasdan qolardi.
// Inline holatda esa `:root` o'zgaruvchilari SVG ichiga meros bo'ladi va
// `data-theme` almashishi bilan skrinshot ham o'zi qayta bo'yaladi
// (fayllar `currentColor` va `var(--color-*)` ga bog'langan).
const LANDING_SCREENS = [
  { type: 'student', label: 'Dashboard', icon: 'chart', src: '/screenshots/dashboard.svg', desc: 'Musobaqalar, natijalar va sertifikatlar bir joyda' },
  { type: 'student', label: 'Olimpiada', icon: 'trophy', src: '/screenshots/test.svg', desc: 'Vaqt, savollar va javoblar uchun qulay test oynasi' },
  { type: 'student', label: 'Mashq', icon: 'bolt', src: '/screenshots/practice.svg', desc: 'Fanlar va mavzular bo\'yicha mustaqil test mashqlari' },
  { type: 'student', label: 'Reyting', icon: 'star', src: '/screenshots/leaderboard.svg', desc: 'Top o\'quvchilar va ballar bo\'yicha jonli reyting' },
  { type: 'student', label: 'Xatolar', icon: 'shield', src: '/screenshots/mistakes.svg', desc: 'Xato qilingan test savollarining sun\'iy intellekt tahlili' },
  { type: 'student', label: 'Do\'kon', icon: 'tag', src: '/screenshots/store.svg', desc: 'To\'plangan tangalar evaziga mukofotlar do\'koni' },
  { type: 'student', label: 'Profil', icon: 'award', src: '/screenshots/profile.svg', desc: 'O\'quvchi yutuqlari, progress va sertifikatlar' },
];

const LandingPage = ({ onNavigate, user, onUserUpdate }) => {
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [openMobileSolutions, setOpenMobileSolutions] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState(null);
  const [activeScreen, setActiveScreen] = React.useState(0);
  const [activeOrgRole, setActiveOrgRole] = React.useState('director');
  const [imgErrors, setImgErrors] = React.useState({});
  const [todayLabel, setTodayLabel] = React.useState(formatLandingDate);
  // Yuklab olingan skrinshot markup'i, yo'l bo'yicha keshlanadi.
  // undefined — hali yuklanmagan, string — tayyor, null — yuklab bo'lmadi.
  const [screenSvgs, setScreenSvgs] = React.useState({});
  const requestedScreens = React.useRef(new Set());
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [verifyInput, setVerifyInput] = React.useState('OL-88421');
  const [verifyResult, setVerifyResult] = React.useState(null);
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const tabsContainerRef = React.useRef(null);
  const [paymentPlan, setPaymentPlan] = React.useState(null);
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState('');
  // To'lov tasdiqlash polling'i (shared.jsx'dagi umumiy hook) — to'lov havolasi
  // ochilgach backend webhook'i obunani faollashtirishini kutadi.
  const payPolling = usePaymentPolling();
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
        // To'lov sahifasi ochildi — backend webhook'i obunani faollashtirishini
        // polling orqali kutamiz (modal "tekshirilmoqda" holatiga o'tadi).
        payPolling.start(async () => {
          // Premium faollashdi. user state'ini yangilaymiz: avval optimistik
          // is_premium=true, keyin serverdan to'liq /me ni olib keshga yozamiz
          // (boshqa premium maydonlar ham sinxron bo'lsin).
          if (onUserUpdate) onUserUpdate({ isPremium: true, is_premium: true });
          try {
            const token2 = OlympyApi.getToken();
            const me = await OlympyApi.getMe(token2);
            if (me) {
              const next = OlympyApi.mapBackendUser(me);
              try { OlympyApi.saveAuth({ token: token2, user: next }); } catch {}
              if (onUserUpdate) onUserUpdate(next);
            }
          } catch {}
        });
      } else {
        throw new Error("To'lov havolasini olishda xatolik yuz berdi");
      }
    } catch (err) {
      setPaymentError(OlympyApi.toUserMessage?.(err) || "To'lov havolasini generatsiya qilib bo'lmadi");
    } finally {
      setPaymentLoading(false);
    }
  };

  // To'lov muvaffaqiyatli tasdiqlangach modalni 2 soniyadan keyin avtomatik
  // yopamiz (foydalanuvchi "muvaffaqiyatli" xabarini ko'rib ulguradi).
  React.useEffect(() => {
    if (payPolling.status !== 'success') return;
    const t = setTimeout(() => {
      setPaymentPlan(null);
      setPaymentError('');
      payPolling.reset();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payPolling.status]);

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

  // Faol ekran birinchi marta ko'rsatilganda uning SVG'i yuklanadi va
  // keshlanadi (har yo'l uchun bir marta — `requestedScreens`). Yuklab
  // bo'lmasa null yoziladi va pastda `img` zaxirasiga o'tiladi: `file://`
  // rejimida fetch bloklangan bo'ladi.
  React.useEffect(() => {
    const path = LANDING_SCREENS[activeScreen].src;
    if (requestedScreens.current.has(path)) return;
    requestedScreens.current.add(path);
    let cancelled = false;
    fetch(window.location.protocol === 'file:' ? `public${path}` : path)
      .then(res => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(svg => { if (!cancelled) setScreenSvgs(prev => ({ ...prev, [path]: svg })); })
      .catch(() => { if (!cancelled) setScreenSvgs(prev => ({ ...prev, [path]: null })); });
    return () => { cancelled = true; };
  }, [activeScreen]);

  // Dashboard skrinshotidagi sanani joriy kunga almashtiramiz. Qolgan
  // ekranlarda bu joy yo'q — regex shunchaki mos kelmaydi.
  const activeScreenSvg = React.useMemo(() => {
    const markup = screenSvgs[LANDING_SCREENS[activeScreen].src];
    if (!markup) return markup;
    return markup.replace(
      /(<text id="landing-date"[^>]*>)[^<]*(<\/text>)/,
      `$1${escapeSvgText(todayLabel)}$2`,
    );
  }, [screenSvgs, activeScreen, todayLabel]);

  const screens = LANDING_SCREENS;

  // Hero metrikalar — CountUp bilan sanab chiqiladi (A).
  const heroMetrics = [
    { end: 100, suffix: '+', label: 'AI savol soniyalar ichida' },
    { end: 26, suffix: '+', label: 'premium imkoniyat' },
    { end: 9, suffix: '', label: 'modul bitta tizimda' },
  ];

  // Hero yon ustuni. Avval bu ro'yxat faqat mobil chip qatori edi (desktopda
  // o'rniga suzuvchi badge'lar ko'rinardi); suzuvchi badge'lar olib tashlangani
  // uchun bitta ro'yxat ikkala kenglikda ishlatiladi, shu sababli har bandga
  // izoh matni qo'shildi.
  const heroChips = [
    { icon: 'sparkles', label: 'AI Savollar', desc: 'Sekundiga 100+ test' },
    { icon: 'file', label: 'PDF Import', desc: 'Darslikdan avtomatik savol' },
    { icon: 'trophy', label: 'Jonli Reyting', desc: 'Avtomatik hisob-kitob' },
  ];

  const features = [
    // Center features
    { category: 'center', iconName: 'sparkles', title: 'AI orqali savol yaratish', desc: 'Sun\'iy intellekt (Gemini AI) yordamida sekundlar ichida yuzlab savol yarating', spotlight: true },
    { category: 'center', iconName: 'file', title: 'PDF\'dan test yaratish', desc: 'Darslik yoki PDF materiallardan avtomatik test va kalitlarni ajratish', spotlight: true },
    { category: 'center', iconName: 'eye', title: 'Ko\'p bosqichli AI Proktorin', desc: 'Webcam AI yuz nazorati, Tab switch detection, majburiy Fullscreen va copy lock', spotlight: true },
    { category: 'center', iconName: 'send', title: 'Telegram Manager & Auth Bot', desc: 'Arizalarni Telegram orqali tasdiqlash, photo/PDF upload va 1-soniyalik OTP login', spotlight: true },
    { category: 'center', iconName: 'award', title: 'QR Sertifikat va Portfolio Tekshiruvi', desc: 'Har bir sertifikatda va o\'quvchi portfoliosida davlat va uchinchi taraflar uchun 1 soniyalik QR tekshiruv havolasi', spotlight: true },
    { category: 'center', iconName: 'trophy', title: 'Online olimpiada', desc: 'Real vaqtda olimpiada o\'tkazib, Natijalarni avtomatik hisoblang' },
    { category: 'center', iconName: 'edit', title: 'LaTeX & MathJax Formulalar', desc: 'Matematika, fizika va kimyo olimpiadalari uchun formulalar va tenglamalar redaktori' },
    { category: 'center', iconName: 'code', title: 'Dasturlash Redaktori (Code Runner)', desc: 'Python, C++, JS dagi savollarni kod yozib Time Limit nazorati bilan avto-baholash' },
    { category: 'center', iconName: 'chart', title: 'Tashkilot reyting dinamikasi', desc: 'Markazning global oylik reyting o\'zgarishi va ballar o\'sishini jonli grafikda kuzatish (T7)' },
    { category: 'center', iconName: 'grid', title: 'O\'quvchilar taqqoslash jadvali', desc: 'Guruhdagi barcha o\'quvchilarning o\'rtacha ballari, reytingi va urinishlari batafsil jadvali (T1)' },
    { category: 'center', iconName: 'brain', title: 'Savollar qiyinlik tahlili', desc: 'Markaz savollarining o\'quvchilar tomonidan xato qilinish foizlari bo\'yicha qiyinlik darajasini aniqlash (T4)' },
    { category: 'center', iconName: 'info', title: 'Nofaol o\'quvchilar ogohlantirishi', desc: 'Ma\'lum muddat davomida test topshirmagan nofaol o\'quvchilarni tizimli aniqlash va eslatish (T3)' },
    { category: 'center', iconName: 'download', title: 'Excel va CSV yig\'ma eksporti', desc: 'Markazning barcha o\'quvchilari natijalarini formatlangan Excel yoki CSV faylga bir tugma bilan yuklab olish (T6)' },
    { category: 'center', iconName: 'book', title: 'Word\'dan Savol Importi', desc: 'Tayyor .docx shablonni to\'ldiring va tizim savol, variant hamda to\'g\'ri javoblarni avtomatik ajratib olsin', spotlight: true },
    { category: 'center', iconName: 'grid', title: 'Excel\'dan Ommaviy Import', desc: 'Minglab savolni bitta .xlsx jadval orqali savollar bazasiga bir zumda yuklang' },
    { category: 'center', iconName: 'mic', title: 'Ovozli AI Proktoring', desc: 'Mikrofon nazorati test paytida begona ovoz va suhbatni aniqlab, ogohlantirishlarni yozib boradi' },
    { category: 'center', iconName: 'building', title: 'Markaz Brendingi (White-Label)', desc: 'O\'z logotipingiz, firma ranglaringiz va oq yorliqli sertifikatlar bilan platformani o\'zingizniki qiling' },
    { category: 'center', iconName: 'brain', title: 'Ketish Xavfi (Churn) Prognozi', desc: 'Faolligi tushayotgan o\'quvchilarni ular markazni tark etishidan oldin AI prognozi bilan aniqlang' },
    { category: 'center', iconName: 'filter', title: 'Guruh va Sinf Taqqoslashi', desc: 'O\'quvchilarga guruh yoki sinf tegini bering va guruhlar natijalarini yonma-yon solishtiring' },
    { category: 'center', iconName: 'upload', title: 'Oflayn Natijalarni Import', desc: 'Tashqarida o\'tkazilgan olimpiada natijalarini tizimga yuklab, umumiy reyting va portfolioga qo\'shing' },
    { category: 'center', iconName: 'clock', title: 'Menejerlar Harakat Jurnali', desc: 'Har bir menejer va o\'qituvchi qaysi amalni qachon bajarganini shaffof audit jurnalida ko\'ring' },
    { category: 'center', iconName: 'file', title: 'Markaz PDF Hisoboti', desc: 'Markazning to\'liq statistikasini tayyor PDF hisobot ko\'rinishida yuklab olib, rahbariyatga taqdim eting' },
    { category: 'center', iconName: 'play', title: 'Sinov Olimpiadasi Yaratish', desc: 'Rasmiy olimpiadadan oldin o\'quvchilarni chiniqtirish uchun mashqiy sinov olimpiadalarini tuzing' },
    { category: 'center', iconName: 'tag', title: 'Markaz Sovg\'a Do\'koni', desc: 'O\'z mukofotlaringizni joylang va o\'quvchilar yiqqan tangalariga aynan sizning sovg\'alaringizni tanlasin' },
    { category: 'center', iconName: 'star', title: 'Viloyat Bo\'yicha Reyting', desc: 'Markazingiz o\'z viloyati va hududidagi boshqa markazlar orasida nechanchi o\'rinda ekanini kuzating' },
    { category: 'center', iconName: 'edit', title: 'Insho Javoblarini AI Baholash', desc: 'Ochiq insho javoblariga sun\'iy intellekt izohli baho beradi, o\'qituvchi esa uni bir bosishda tasdiqlaydi' },

    // Student features
    { category: 'student', iconName: 'bolt', title: 'Ketma-ketlik (Streak) Tizimi', desc: 'Kunlik faollikni va eng uzun streaklarni kuzatib borish orqali uzluksiz o\'rganish motivatsiyasi (O1)', spotlight: true },
    { category: 'student', iconName: 'tag', title: 'Virtual Sovg\'alar Do\'koni (Shop)', desc: 'Testlar va mashqlardan tangalar yig\'ib, qiziqarli brendli mukofotlar xarid qilish', spotlight: true },
    { category: 'student', iconName: 'shield', title: 'AI Xatolar Sandig\'i', desc: 'Yo\'l qo\'yilgan xatolarni jamlab, sun\'iy intellekt orqali tushuntirish berish', spotlight: true },
    { category: 'student', iconName: 'sparkles', title: 'AI Muvaffaqiyat Prognostikasi', desc: 'Imtihon va olimpiadalarga kirish imkoniyatlarini AI yordamida prognozlash', spotlight: true },
    { category: 'student', iconName: 'award', title: 'Rasmiy Ochiq QR-Portfolio', desc: 'O\'quvchining yutuqlari, medallari va olimpiadalar tarixi ko\'rinadigan unikal QR portfolyo (/verify/portfolio)', spotlight: true },
    { category: 'student', iconName: 'users', title: 'Raqiblar tizimi (Rivals)', desc: 'Kursdoshlarni raqib sifatida qo\'shib, ular bilan o\'rtacha ball va reytinglarni taqqoslash (O2)' },
    { category: 'student', iconName: 'bolt', title: 'Mustaqil Mashq Rejimi', desc: 'Fanlar va mavzular bo\'yicha o\'z ustida ishlash hamda faollik (streak) tizimi' },
    { category: 'student', iconName: 'code', title: 'Dasturlash Kod Redaktori', desc: 'Python, JS, C++ da topshiriqlarni interaktiv yechish' },
    { category: 'student', iconName: 'star', title: 'Premium Yutuqlar & Nishonlar', desc: 'Urinishlar soni, streaklar va eng yuqori ballarga erishganda beriladigan nishonlar (O5)' },
    { category: 'student', iconName: 'brain', title: 'AI Shaxsiy O\'quv Rejasi', desc: 'Sun\'iy intellekt natijalaringizni tahlil qilib, nimani qachon o\'qish kerakligini kunlik reja qilib beradi', spotlight: true },
    { category: 'student', iconName: 'book', title: 'Kunlik Savollar', desc: 'Har kuni yangi savollarga javob berib, kuniga bir necha daqiqada bilimingizni mustahkamlang' },
    { category: 'student', iconName: 'check', title: 'Kunlik Maqsad', desc: 'Kuniga nechta savol yechishni o\'zingiz belgilang va maqsad bajarilishini jonli kuzatib boring' },
    { category: 'student', iconName: 'play', title: 'Mock Olimpiada Rejimi', desc: 'Haqiqiy olimpiada muhitini vaqt chegarasi bilan mashq qilib, asosiy imtihonga bemalol tayyorlaning' },
    { category: 'student', iconName: 'settings', title: 'Shaxsiy Test Generatori', desc: 'Fan, mavzu va savollar sonini o\'zingiz sozlab, faqat o\'zingiz uchun noyob test to\'plamini yarating' },
    { category: 'student', iconName: 'chart', title: 'Zaif Mavzular Tahlili', desc: 'Eng ko\'p xato qilayotgan mavzularingiz va olimpiadaga tayyorgarlik darajangiz foizda ko\'rsatiladi' },
    { category: 'student', iconName: 'download', title: 'Haftalik PDF Hisobot', desc: 'Bir haftalik natijalaringiz jamlangan chiroyli PDF hisobotni istalgan payt yuklab oling' },
    { category: 'student', iconName: 'clock', title: 'Olimpiadalar Kalendari', desc: 'Yaqinlashib kelayotgan barcha olimpiadalar sanasini bitta kalendarda ko\'rib, hech birini o\'tkazib yubormang' },
    { category: 'student', iconName: 'trophy', title: 'Haftalik Konkurs', desc: 'Har hafta yangi musobaqada qatnashib, g\'oliblar ro\'yxatiga chiqish uchun ball to\'plang' },
    { category: 'student', iconName: 'users', title: 'Sinfdoshlar Reytingi', desc: 'O\'z sinfdoshlaringiz orasidagi o\'rningizni va tengdoshlar bilan taqqoslash tahlilini ko\'ring' },
    { category: 'student', iconName: 'send', title: '24/7 AI Yordamchi Chat', desc: 'Savolingiz bo\'lsa, sun\'iy intellekt yordamchisi kechayu kunduz bir zumda javob beradi' },
    { category: 'student', iconName: 'search', title: 'Boshlang\'ich Daraja Testi', desc: 'Ro\'yxatdan o\'tishda qisqa mini-test darajangizni aniqlaydi va sizga mos olimpiadalarni tavsiya qiladi' },
    { category: 'student', iconName: 'plus', title: 'Do\'stni Taklif Qilish', desc: 'Taklif kodingiz orqali do\'stingizni chaqiring va ikkalangiz ham bonus tangalarga ega bo\'ling' },

    // Parent features
    { category: 'parent', iconName: 'users', title: 'Ota-ona Profilini Ulash (Parent Link)', desc: 'Maxsus kod orqali farzand profiliga ulanib, test natijalarini realtime kuzatish', spotlight: true },
    { category: 'parent', iconName: 'send', title: 'Telegram Avto-Hisobotlar', desc: 'Farzandning har bir olimpiada natijasi va streak holati haqida Telegram orqali lahzalik xabarnomalar', spotlight: true },
    { category: 'parent', iconName: 'chart', title: 'Farzand O\'sish Dinamikasi', desc: 'Farzandning fanlar bo\'yicha o\'sish foizlari va o\'zlashtirish tahlilini ko\'rish', spotlight: true },

    // Platform & xavfsizlik features (hamma foydalanuvchilar uchun)
    { category: 'platform', iconName: 'upload', title: 'Offline Test Rejimi', desc: 'Internet uzilib qolsa ham javoblaringiz saqlanadi va aloqa tiklanishi bilan avtomatik yuboriladi', spotlight: true },
    { category: 'platform', iconName: 'lock', title: 'Ikki Bosqichli Himoya (2FA)', desc: 'TOTP kodlar bilan hisobingizni himoyalang, parolni bilgan odam ham ruxsatsiz kira olmaydi', spotlight: true },
    { category: 'platform', iconName: 'bell', title: 'Push Bildirishnomalar', desc: 'Yangi olimpiada, natija va eslatmalar to\'g\'ridan-to\'g\'ri brauzeringizga push xabar bo\'lib keladi' },
    { category: 'platform', iconName: 'user', title: 'Google Orqali Kirish', desc: 'Parol o\'ylab topmasdan, Google hisobingiz bilan bir bosishda tizimga kiring' },
    { category: 'platform', iconName: 'tag', title: 'Click va Payme To\'lovlari', desc: 'Tarif va obunalarni Click yoki Payme orqali xavfsiz, bir necha soniyada to\'lang' },
  ];

  const filteredFeatures = React.useMemo(() => {
    if (selectedCategory === 'all') return features;
    return features.filter(f => f.category === selectedCategory);
  }, [selectedCategory]);

  // Spotlight kartalar katta gridda, qolganlari kichik chip qatorida (B).
  const spotlightFeatures = filteredFeatures.filter(f => f.spotlight);
  const chipFeatures = filteredFeatures.filter(f => !f.spotlight);

  const steps = [
    { num: '01', title: 'Ro\'yxatdan o\'ting', desc: 'Maktab, o\'quv markaz yoki tashkilot sifatida platformaga qo\'shiling', iconName: 'bolt' },
    { num: '02', title: 'Savollar yarating', desc: 'AI, PDF yoki qo\'lda savollar bazasini to\'ldiring', iconName: 'edit' },
    { num: '03', title: 'Olimpiada o\'tkazing', desc: 'O\'quvchilarni qo\'shing va olimpiada boshlang', iconName: 'trophy' },
    { num: '04', title: 'Natijalarni tahlil qiling', desc: 'Avtomatik hisoblangan natijalar va reytingni ko\'ring', iconName: 'chart' },
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
    { id: 21, name: 'Pro', plan_type: 'organization', price: '449 999 UZS', duration_days: 30, desc: 'Yirik ta\'lim tashkilotlari uchun (1 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash"], popular: false },
    { id: 22, name: 'Pro', plan_type: 'organization', price: '1 199 999 UZS', duration_days: 90, desc: 'Yirik ta\'lim tashkilotlari uchun (3 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash"], popular: false },
    { id: 23, name: 'Pro', plan_type: 'organization', price: '2 149 999 UZS', duration_days: 180, desc: 'Yirik ta\'lim tashkilotlari uchun (6 oy)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash"], popular: false },
    { id: 24, name: 'Pro', plan_type: 'organization', price: '3 749 999 UZS', duration_days: 365, desc: 'Yirik ta\'lim tashkilotlari uchun (1 yil)', features: ["Cheksiz o'quvchi qo'shish", "Plus reja imkoniyatlari", "Cheksiz olimpiada", "API kirish", "Maxsus qo'llab-quvvatlash"], popular: false },
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
    <div className="min-h-screen" style={{ background: 'rgb(var(--color-ground))' }}>
      {/* Scroll progress bar */}
      <div
        className="fixed top-0 left-0 h-[2px] z-[100] transition-all duration-150"
        style={{ width: `${scrollProgress}%`, background: 'rgb(var(--color-accent))' }}
      />
      {/* Navbar — Telegram WebView'da backdrop-filter sekin ishlaydi, shu sababli
          backdropFilter olib tashlangan va solid background ishlatilgan.
          Fon endi qattiq yozilgan qora emas, token: qog'oz mavzuda navbar
          sahifadan ajralib turgan qora orol bo'lib qolmasligi uchun. */}
      <nav className="sticky top-0 z-50 bg-ground border-b border-edge">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 md:py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer min-w-0" onClick={() => window.scrollTo(0,0)}>
            <BrandLogo size="md" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            {/* Solutions Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 hover:text-text-primary transition-colors cursor-pointer py-2 text-text-secondary focus:outline-none">
                <span>Yechimlar</span>
                <Icon name="chevronDown" size={12} className="group-hover:rotate-180 transition-transform duration-200" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-[560px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                {/* Har bir bandga alohida rang berilardi (indigo/cyan/amber/rose)
                    — amber "ogohlantirish", rose esa "xato" ma'nosini beradi,
                    holbuki bular oddiy menyu bandlari. Endi hammasi bir xil
                    neytral kataklarda, farq faqat ikonkada. */}
                <div className="rounded-xl p-4 grid grid-cols-2 gap-1 bg-surface-1 border border-edge-strong shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                  {[
                    { href: '#features', args: ['all', 'features'], icon: 'sparkles', title: 'AI Savollar', desc: 'Sekundiga yuzlab test yarating' },
                    { href: '#b2b-console', args: ['center', 'b2b-console', 'manager'], icon: 'eye', title: 'Jonli Proctoring', desc: "O'quvchilar tab nazorati" },
                    { href: '#features', args: ['student', 'features'], icon: 'trophy', title: 'Musobaqalar', desc: 'Real vaqtda online olimpiadalar' },
                    { href: '#telegram-flow', args: [null, 'telegram-flow'], icon: 'send', title: 'Telegram Bot', desc: 'Managerlar uchun tasdiqlash boti' },
                    { href: '#b2b-console', args: ['center', 'b2b-console', 'director'], icon: 'chart', title: 'Tahliliy hisobotlar', desc: 'Haftalik PDF va Excel tahlili' },
                  ].map((item) => (
                    <a
                      key={item.title}
                      href={item.href}
                      onClick={(e) => handleSolutionClick(e, ...item.args)}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-transparent hover:bg-surface-2 hover:border-edge transition-colors"
                    >
                      <span className="w-9 h-9 rounded-md border border-edge flex items-center justify-center text-accent flex-shrink-0">
                        <Icon name={item.icon} size={16} />
                      </span>
                      <span className="block">
                        <span className="block text-xs font-bold text-text-primary">{item.title}</span>
                        <span className="block text-[11px] text-text-secondary mt-0.5">{item.desc}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <a href="#features" className="hover:text-text-primary transition-colors cursor-pointer">Xususiyatlar</a>
            <a href="#how" className="hover:text-text-primary transition-colors cursor-pointer">Qanday ishlaydi</a>
            <a href="#pricing" className="hover:text-text-primary transition-colors cursor-pointer">Narxlar</a>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {/* Mavzu almashtirgich navbarning o'ng tomonida, "Kirish" dan oldin:
                bu sahifa sozlamasi, harakat (CTA) emas — shuning uchun tugmalar
                juftligidan chapda va ohangi pastroq turadi. */}
            <ThemeToggle />
            <button onClick={() => onNavigate('login')} className="hidden md:block btn-ghost px-4 py-1.5 rounded-xl text-sm font-medium">Kirish</button>
            <button onClick={() => onNavigate('register')} className="btn-primary px-3 md:px-4 py-1.5 rounded-xl text-xs md:text-sm font-semibold">Boshlash</button>
            <button
              onClick={() => setMobileMenu(v => !v)}
              className="md:hidden btn-ghost inline-flex items-center justify-center w-9 h-9 rounded-xl text-text-primary"
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
            style={{ top: '52px', background: 'rgb(var(--color-ground) / 0.82)' }}
          >
            <div
              className="absolute left-0 right-0 top-0 border-b border-edge bg-ground"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1 text-sm">
                {/* Collapsible Mobile Solutions */}
                <div className="flex flex-col">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenMobileSolutions(!openMobileSolutions); }}
                    className="flex items-center justify-between px-3 py-3 rounded-xl text-text-primary hover:text-text-primary hover:bg-surface-2 transition-colors text-left"
                  >
                    <span>Yechimlar</span>
                    <Icon name="chevronDown" size={16} className={`transition-transform duration-250 ${openMobileSolutions ? 'rotate-180' : 'rotate-0'}`} />
                  </button>
                  {openMobileSolutions && (
                    <div className="pl-6 pr-3 py-1 flex flex-col gap-2.5 border-l border-edge ml-3 my-1">
                      <a href="#features" onClick={(e) => handleSolutionClick(e, 'all', 'features', null, true)} className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-2 py-1">
                        <Icon name="sparkles" size={12} className="text-accent" />
                        AI Savollar
                      </a>
                      <a href="#b2b-console" onClick={(e) => handleSolutionClick(e, 'center', 'b2b-console', 'manager', true)} className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-2 py-1">
                        <Icon name="eye" size={12} className="text-accent-2" />
                        Jonli Proctoring
                      </a>
                      <a href="#features" onClick={(e) => handleSolutionClick(e, 'student', 'features', null, true)} className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-2 py-1">
                        <Icon name="trophy" size={12} className="text-warning" />
                        Musobaqalar
                      </a>
                      <a href="#telegram-flow" onClick={(e) => handleSolutionClick(e, null, 'telegram-flow', null, true)} className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-2 py-1">
                        <Icon name="send" size={12} className="text-error" />
                        Telegram Bot
                      </a>
                    </div>
                  )}
                </div>
                <a
                  href="#features"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-text-primary hover:text-text-primary hover:bg-surface-2 transition-colors"
                >
                  Xususiyatlar
                </a>
                <a
                  href="#how"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-text-primary hover:text-text-primary hover:bg-surface-2 transition-colors"
                >
                  Qanday ishlaydi
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenu(false)}
                  className="px-3 py-3 rounded-xl text-text-primary hover:text-text-primary hover:bg-surface-2 transition-colors"
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

      {/* Hero — imtihon byulletenining birinchi sahifasi.
          Avval bu yerda dashboard rasmi fon sifatida qo'yilib, ustidan qora
          gradient parda tortilgan, uch dona neon "orb" va suzuvchi kartalar
          turardi. Qog'oz mavzuda parda ham, orblar ham ishlamaydi (matn
          ko'rinmay qoladi), qolaversa yo'nalish ambient bezakni taqiqlaydi.
          Endi: tekis qog'oz, katakli fon va bosma sarlavha bloki. */}
      <section className="relative border-b border-edge bg-ground">
        <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-40" aria-hidden="true" />

        <div className="max-w-7xl mx-auto px-4 md:px-6 py-12 md:py-20 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-7">
              {/* Byulleten "grifi" — chiziq ustidagi kichik xizmat qatori. */}
              <div className="flex items-center gap-3 mb-5 md:mb-7 pb-3 border-b border-edge">
                <Icon name="shield" size={15} className="text-accent flex-shrink-0" />
                <span className="text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
                  Online olimpiada, test va natija boshqaruvi
                </span>
              </div>

              <h1
                className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold leading-[1.05] tracking-tight text-text-primary mb-5 md:mb-6"
                style={{ textWrap: 'balance' }}
              >
                {heroVariant === 'B' ? (
                  <>O'zbekistonning eng yaxshi <span className="text-accent">olimpiada</span> platformasi</>
                ) : (
                  <>Olympy — <span className="text-accent">online olimpiada</span> platformasi</>
                )}
              </h1>

              {/* ~65 belgi kenglik: `max-w-[46ch]` uzun qatorni bo'lib beradi. */}
              <p className="text-base md:text-lg text-text-primary mb-7 md:mb-9 max-w-[46ch] leading-relaxed">
                Ta'lim markazlari va maktablar uchun test yaratish, olimpiada o'tkazish, reyting yuritish va sertifikatlash jarayonini bitta tizimga jamlaydi.
              </p>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 md:gap-3">
                <button onClick={handleHeroCta} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-7 py-3 md:py-3.5 rounded-lg text-sm md:text-base font-bold w-full sm:w-auto">
                  <Icon name="bolt" size={18} />
                  {heroVariant === 'B' ? 'Bepul sinab ko\'r' : 'Boshlash'}
                </button>
                <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-7 py-3 md:py-3.5 rounded-lg text-sm md:text-base font-semibold w-full sm:w-auto">
                  Kirish
                  <Icon name="chevronRight" size={18} />
                </button>
              </div>
            </div>

            {/* O'ng ustun — avval suzuvchi (animatsiyali) kartalar edi; endi
                varaqning yon ustuni: tik jadval, faqat chegara chizig'i bilan. */}
            <div className="lg:col-span-5 w-full">
              {/* Bitta ramka: ro'yxat va metrikalar bir varaqning ikki bo'limi,
                  shuning uchun chegara ham bitta — ichkarida faqat ajratuvchi
                  chiziqlar. */}
              <div className="border border-edge rounded-lg bg-surface-1 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-edge">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-secondary">
                    Tizim tarkibi
                  </span>
                </div>
                <ul>
                  {heroChips.map((chip) => (
                    <li key={chip.label} className="flex items-start gap-3 px-4 py-3 border-b border-edge">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-edge text-accent">
                        <Icon name={chip.icon} size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-text-primary">{chip.label}</span>
                        <span className="block text-xs text-text-secondary mt-0.5">{chip.desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Metrikalar — raqamli ustun, shuning uchun `.font-data`. */}
                <div className="grid grid-cols-3">
                  {heroMetrics.map((m) => (
                    <div key={m.label} className="p-3 md:p-4 border-r border-edge last:border-r-0">
                      <div className="font-data text-xl md:text-2xl font-bold text-text-primary">
                        <CountUp end={m.end} suffix={m.suffix} />
                      </div>
                      <div className="text-[11px] text-text-secondary leading-tight mt-1">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Imkoniyatlar sarhisobi.
          Avval bu cheksiz suriladigan "marquee" lenta edi: to'xtovsiz harakat
          ambient animatsiya hisoblanadi va ro'yxatni o'qib bo'lmasdi (chetlari
          gradient niqob bilan so'nardi). Endi statik jadval — barcha bandlar
          bir vaqtda ko'rinadi va ustunlarga tekislanadi. */}
      <div className="w-full border-y border-edge bg-surface-1">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-2.5">
            {[
              { icon: 'sparkles', label: 'AI savollar generatsiyasi' },
              { icon: 'file', label: "PDF'dan test yaratish" },
              { icon: 'eye', label: 'Jonli proctoring nazorati' },
              { icon: 'trophy', label: 'Real vaqtda reyting' },
              { icon: 'send', label: 'Telegram orqali tasdiqlash' },
              { icon: 'chart', label: 'Tahliliy hisobotlar' },
              { icon: 'shield', label: 'Xavfsiz tab nazorati' },
              { icon: 'tag', label: "Virtual tangalar do'koni" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2.5 text-xs md:text-sm text-text-primary">
                <Icon name={item.icon} size={15} className="text-accent flex-shrink-0" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Platforma ko'rinishi */}
      <section className="py-12 md:py-24 relative overflow-hidden bg-ground">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-14 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
              <Icon name="eye" size={14} className="text-accent flex-shrink-0" />
              Loyiha ekranlari
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">Mahsulot qanday ko'rinadi?</h2>
            <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">Dashboard, test oynasi, reyting va profil ekranlari landing ichida ko'rinadigan qilib joylandi.</p>
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
                          ? 'bg-accent-fill text-on-accent border border-accent-fill'
                          : 'bg-surface-1 text-text-secondary border border-edge hover:text-text-primary hover:bg-surface-2'
                      }`}
                    >
                      <Icon name={s.icon} size={14} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Browser window mockup.
              Sichqoncha ostida 3D burilish (tilt) va uning ustidagi yorug'lik
              dog'i olib tashlandi: bosma varaqa qiyshaymaydi, qolaversa
              hover holati faqat chegara/fon bilan ko'rsatiladi. */}
          <div className="scroll-reveal scroll-reveal-delay-2 relative">
            <div className="rounded-lg overflow-hidden border border-edge relative z-10 bg-surface-1">
              {/* Browser chrome */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-edge bg-surface-2">
                <div className="flex gap-1.5 md:gap-2 flex-shrink-0">
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#ff5f57' }} />
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#febc2e' }} />
                  <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ background: '#28c840' }} />
                </div>
                <div className="flex-1 mx-2 md:mx-4 px-3 py-1 md:py-1.5 rounded border border-edge text-xs text-text-secondary truncate bg-ground">
                  prolymp.uz/student/{screens[activeScreen].label.toLowerCase()}
                </div>
                <div className="hidden md:flex gap-1 text-text-primary text-xs flex-shrink-0" aria-hidden="true">
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
                      className="flex flex-col items-center justify-center text-center px-6 py-16 md:py-24 bg-ground"
                      style={{ minHeight: '320px' }}
                    >
                      {/* Bu onError'dan keyin, ya'ni rasm YUKLANMAY QOLGANDA ko'rinadi
                          (hali yuklanayotganda emas) — avval "Tez orada"/"Rasm
                          yuklanmoqda..." aylanuvchi belgi bilan ko'rsatilardi, bu esa
                          buzilgan rasmni "hali tayyor emas" degan taassurot berardi. */}
                      <Icon name="file" size={40} className="text-text-secondary mb-4" />
                      <div className="text-lg md:text-xl font-bold text-text-primary mb-2">Rasm mavjud emas</div>
                      <div className="text-sm text-text-secondary">Skrinshot vaqtincha ko'rsatilmayapti</div>
                    </div>
                  ) : activeScreenSvg ? (
                    // Inline SVG — sahifaning rang tokenlarini meros oladi,
                    // shuning uchun mavzu almashganda o'zi qayta bo'yaladi.
                    // Markup o'zimizning statik assetimiz (same-origin).
                    // Nomlash SVG ichida: uning o'z `role="img"` va
                    // `aria-labelledby` (title + desc) juftligi bu yerdagi
                    // qisqa yorliqdan ko'ra ko'proq narsa aytadi.
                    <div
                      className="screen-svg"
                      style={{ background: 'rgb(var(--color-ground))' }}
                      dangerouslySetInnerHTML={{ __html: activeScreenSvg }}
                    />
                  ) : activeScreenSvg === null ? (
                    // Fetch ishlamadi (masalan file:// rejimi) — asset o'zining
                    // ichki zaxira ranglari bilan chiziladi.
                    <img
                      src={screens[activeScreen].src}
                      alt={screens[activeScreen].label}
                      onError={() => setImgErrors(prev => ({ ...prev, [activeScreen]: true }))}
                      className="w-full block"
                      style={{
                        aspectRatio: '16 / 10',
                        objectFit: 'contain',
                        background: 'rgb(var(--color-ground))',
                      }}
                    />
                  ) : (
                    // Yuklanmoqda — joyni band qilib turadigan bo'sh maydon.
                    <div style={{ aspectRatio: '16 / 10', background: 'rgb(var(--color-ground))' }} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Caption */}
          <div className="text-center mt-5 md:mt-6">
            <div className="text-sm md:text-base text-text-secondary">
              <span className="text-text-primary font-semibold">{screens[activeScreen].label}</span>
              <span className="mx-2 text-text-secondary">·</span>
              <span>{screens[activeScreen].desc}</span>
            </div>
          </div>
        </div>

        {/* Bu blokda avval `pulseSlow`, `floatBadge1..3` va `marquee`
            animatsiyalari ham bo'lgan. `src/index.css` ularni `animation: none`
            bilan o'chirgan edi, lekin bu yerdagi `!important` o'sha o'chirishni
            bekor qilib, suzuvchi bloklar yana harakatlanib turardi. Endi
            ularning JSX chaqiruvlari ham, ta'riflari ham yo'q.
            Qolganlari — bir martalik kirish (entrance) effektlari; harakatni
            kamaytirish so'ralganda o'chadi. */}
        <style>{`
          /* Inline skrinshot SVG'i idish kengligiga moslanadi. viewBox 1440x900
             (16:10) bo'lgani uchun balandlik o'zi to'g'ri chiqadi. */
          .screen-svg svg {
            display: block;
            width: 100%;
            height: auto;
          }
          @keyframes screenFade {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes cardEntrance {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .screen-fade,
            .feature-card-entrance { animation: none !important; }
          }
        `}</style>
      </section>

      {/* Tashkilot Boshqaruv Markazi (Futuristic Live Console) */}
      <section id="b2b-console" className="py-12 md:py-24 relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', borderTop: '1px solid rgb(var(--color-edge))' }}>
        {/* Glow grid lines in the background */}
        <div className="absolute inset-0 grid-backdrop pointer-events-none opacity-[0.12] z-[1]" />
        
        <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-12 md:mb-18 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
              <Icon name="building" size={14} className="text-accent flex-shrink-0" />
              Tashkilot Boshqaruv Markazi
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">
              Tashkilot Boshqaruv Konso'li
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">
              Direktor, menejer va o'qituvchilar uchun alohida, lekin o'zaro mukammal bog'langan boshqaruv panellari.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Console: Role selectors with glowing specs */}
            {/* Har bir rolga o'z rangi berilgan edi: direktor — indigo, menejer
                — amber, o'qituvchi — emerald, ota-ona — binafsha. Amber va
                emerald tizimda "ogohlantirish" va "muvaffaqiyat" ma'nosini
                bildiradi, ya'ni menejer roli ogohlantirishdek ko'rinardi.
                Rollar teng, shuning uchun rang farqi olib tashlandi — tanlangan
                bandni qalin akcent chegarasi ajratadi. */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {[
                {
                  id: 'director',
                  label: 'Tashkilot Rahbari (Direktor)',
                  desc: 'Tashkilot premium tahlillari, o\'quvchilar taqqoslash jadvali, oylik hisobotlar va white-label brend rangi sozlamasi.',
                  icon: 'building',
                },
                {
                  id: 'manager',
                  label: 'Tashkilot Admini (Menejer)',
                  desc: 'Jonli proctoring (tab o\'zgarishi va aloqa uzilishi nazorati), o\'quvchi arizalarini bir tugma bilan Telegram orqali tasdiqlash va tangalar do\'koni.',
                  icon: 'settings',
                },
                {
                  id: 'teacher',
                  label: 'Olimpiada O\'qituvchisi',
                  desc: 'Sun\'iy intellekt (Gemini AI) yordamida tezkor savollar generatsiyasi, topshiriqlar banki va insho/kod javoblarini baholash oynasi.',
                  icon: 'book',
                },
                {
                  id: 'parent',
                  label: 'Ota-ona Nazorati',
                  desc: 'Farzand profilini Parent-Code orqali ulab, test natijalari, o\'sish dinamikasi va Telegram xabarnomalarini realtime kuzatish.',
                  icon: 'users',
                }
              ].map((role) => {
                const active = activeOrgRole === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setActiveOrgRole(role.id)}
                    aria-pressed={active}
                    className={`text-left p-5 rounded-lg bg-surface-1 cursor-pointer transition-colors ${
                      active ? 'border-2 border-accent' : 'border border-edge hover:border-edge-strong hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`w-8 h-8 rounded border flex items-center justify-center flex-shrink-0 ${
                        active ? 'border-accent text-accent' : 'border-edge text-text-secondary'
                      }`}>
                        <Icon name={role.icon} size={16} />
                      </span>
                      <h4 className="text-sm md:text-base font-bold text-text-primary">{role.label}</h4>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed pl-11 max-w-[60ch]">
                      {role.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Right Console: The living terminal mockup screen */}
            <div className="lg:col-span-7 relative">
              <div className="glass rounded-lg overflow-hidden relative z-10 bg-surface-1">
                {/* Browser bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-surface-1">
                  <div className="flex gap-1.5 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="mx-4 px-3 py-1 rounded-md text-xs text-text-secondary truncate bg-surface-1 font-mono flex items-center gap-1.5 select-none w-full max-w-[320px] justify-center">
                    <Icon name="shield" size={10} className="text-text-secondary" />
                    <span>prolymp.uz/dashboard/{activeOrgRole}</span>
                  </div>
                  <div className="text-text-primary text-xs flex-shrink-0" aria-hidden="true">⟲</div>
                </div>

                {/* Console content */}
                <div className="relative" style={{ minHeight: '340px' }}>
                  {activeOrgRole === 'director' && <DirectorMockup />}
                  {activeOrgRole === 'manager' && <ManagerMockup />}
                  {activeOrgRole === 'teacher' && <TeacherMockup />}
                  {activeOrgRole === 'parent' && <ParentMockup />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 md:py-24 max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-8 md:mb-10 scroll-reveal">
          <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="sparkles" size={14} className="text-accent flex-shrink-0" />Xususiyatlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">Platforma Imkoniyatlari</h2>
          <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">Tashkilotingiz, o'quvchilar va ota-onalar uchun eng zamonaviy premium yechimlar</p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex justify-center mb-10 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-1 p-1 rounded-lg border border-edge bg-surface-1">
            {[
              { id: 'all', label: 'Barchasi', icon: 'grid' },
              { id: 'center', label: 'Tashkilotlar uchun', icon: 'building' },
              { id: 'student', label: 'O\'quvchilar uchun', icon: 'award' },
              { id: 'parent', label: 'Ota-onalar uchun', icon: 'users' },
              { id: 'platform', label: 'Platforma & Xavfsizlik', icon: 'shield' },
            ].map(cat => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  aria-pressed={active}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-md text-xs md:text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-accent-fill text-on-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
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
            <GlowCard className="p-6 md:p-8 md:col-span-7 flex flex-col justify-between group overflow-hidden border border-edge relative min-h-[300px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-accent bg-accent/10 border border-accent/40 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="sparkles" size={10} />
                  AI Savol Generator & PDF Import
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-text-primary mb-2 group-hover:text-accent transition-colors duration-250">Sun'iy Intellekt va PDF Import</h3>
                <p className="text-xs md:text-sm text-text-secondary leading-relaxed max-w-lg">Darslik yoki PDF materiallardan avtomatik test savollarini yarating. Gemini AI yordamida soniyalarda test bazangizni shakllantiren.</p>
              </div>
              
              {/* Mini AI visual mockup */}
              <div className="mt-6 rounded p-4 border border-edge text-left relative overflow-hidden max-w-md w-full">
                <div className="flex items-center justify-between text-[10px] text-text-secondary mb-2 border-b border-edge pb-2">
                  <span>Savollar Yaratish Sandig'i</span>
                  <span className="text-accent font-bold">Aktiv</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 w-3/4 bg-accent/15 rounded" />
                  <div className="h-1.5 w-1/2 bg-surface-2 rounded" />
                </div>
                <div className="flex items-center justify-between mt-4 text-[10px]">
                  <span className="text-text-secondary">Haftalik PDF hisobot</span>
                  <span className="text-success font-bold">Tayyor</span>
                </div>
              </div>
            </GlowCard>

            {/* Card 2: Proctoring (Span 5) */}
            <GlowCard className="p-6 md:p-8 md:col-span-5 flex flex-col justify-between group overflow-hidden border border-edge relative min-h-[300px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-error bg-error/12 border border-error/35 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="eye" size={10} />
                  Jonli Proctoring Nazorati
                </span>
                <h3 className="text-xl md:text-2xl font-bold text-text-primary mb-2 group-hover:text-error transition-colors duration-250">Jonli Proctoring</h3>
                <p className="text-xs md:text-sm text-text-secondary leading-relaxed">Test topshirayotgan o'quvchilarning tab o'zgarishi, ping holati va faolliklarini real vaqtda kuzating.</p>
              </div>

              {/* Event stream list mockup */}
              <div className="mt-6 space-y-2 w-full font-mono text-[9px] text-text-secondary">
                <div className="flex justify-between items-center p-2 rounded border border-edge">
                  <span className="truncate max-w-[150px]">Ali Valiyev · Tab o'zgartirdi</span>
                  <span className="text-warning font-bold">Ogohlantirish</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded border border-edge">
                  <span className="truncate max-w-[150px]">Sardor Aliyev · Aloqa uzildi</span>
                  <span className="text-error font-bold">Offline</span>
                </div>
              </div>
            </GlowCard>

            {/* Card 3: QR Sertifikat va Portfolio Tekshiruvi (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-edge relative min-h-[280px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-accent-2 bg-accent-2/10 border border-accent-2/40 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="award" size={10} />
                  QR Sertifikat & Portfolio
                </span>
                <h3 className="text-lg md:text-xl font-bold text-text-primary mb-2 group-hover:text-accent-2 transition-colors duration-250">QR Tekshiruv & Portfolio</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Har bir sertifikatda QR-kod mavjud. O'quvchilar yutuqlari ochiq portfolio havolasida saqlanadi.</p>
              </div>
              <div className="mt-6 flex items-center justify-between p-3 rounded border border-edge">
                <span className="text-text-primary font-bold text-xs flex items-center gap-1.5"><Icon name="award" size={13} className="text-accent" />Verifikatsiya havolasi</span>
                <span className="text-success font-bold text-xs">HAQIQIY</span>
              </div>
            </GlowCard>

            {/* Card 4: Ota-onalar Nazorati (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-edge relative min-h-[280px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-success bg-success/12 border border-success/35 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="users" size={10} />
                  Ota-onalar Nazorati
                </span>
                <h3 className="text-lg md:text-xl font-bold text-text-primary mb-2 group-hover:text-success transition-colors duration-250">Ota-onalar Nazorati</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Farzandining test natijalari, ballari va ketma-ketligini Telegram bot orqali realtime kuzatish.</p>
              </div>
              <div className="mt-6 flex items-center justify-between p-3 rounded border border-edge">
                <span className="text-text-primary font-bold text-xs flex items-center gap-1.5"><Icon name="send" size={13} className="text-accent" />Telegram Xabarnomalar</span>
                <span className="text-xs text-text-secondary">Lahzalik xabar</span>
              </div>
            </GlowCard>

            {/* Card 5: Dasturlash Olimpiadalari (Span 4) */}
            <GlowCard className="p-6 md:p-8 md:col-span-4 flex flex-col justify-between group border border-edge relative min-h-[280px]">
              <div className="relative z-10">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-accent-2 bg-accent-2/10 border border-accent-2/40 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="code" size={10} />
                  Kod Redaktori & Runner
                </span>
                <h3 className="text-lg md:text-xl font-bold text-text-primary mb-2 group-hover:text-accent-2 transition-colors duration-250">Dasturlash Redaktori</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Python, C++, JS tillarida kod yozish va Time Limit nazorati bilan avto-baholash.</p>
              </div>
              <div className="mt-6 flex items-center justify-between p-3 rounded border border-edge font-mono text-xs">
                <span className="text-accent-2">python solution.py</span>
                <span className="text-success font-bold">10/10 PASS</span>
              </div>
            </GlowCard>

            {/* Card 6: Streak & Tangalar Do'koni (Span 6) */}
            <GlowCard className="p-6 md:p-8 md:col-span-6 flex flex-col justify-between group border border-edge relative min-h-[280px]">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-warning bg-warning/12 border border-warning/35 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="tag" size={10} />
                  O'yinlashtirilgan Tizim
                </span>
                <h3 className="text-lg md:text-xl font-bold text-text-primary mb-2 group-hover:text-warning transition-colors duration-250">Streak & Sovrinlar Do'koni Tizimi</h3>
                <p className="text-xs text-text-secondary leading-relaxed">O'quvchilar kunlik testlar topshirib virtual tangalar yig'adi hamda brendli ryukzak, kitoblar va sovg'alar xarid qilishadi.</p>
              </div>
              <div className="mt-6 flex items-center justify-between p-3 rounded border border-edge">
                <span className="text-text-primary font-bold text-xs flex items-center gap-1.5"><Icon name="bolt" size={13} className="text-accent" />14 kunlik streak</span>
                <span className="font-data text-text-primary font-bold text-xs">450 tanga</span>
              </div>
            </GlowCard>

            {/* Card 7: Markaz Premium Analitikasi (Span 6) */}
            <GlowCard className="p-6 md:p-8 md:col-span-6 flex flex-col justify-between group border border-edge relative min-h-[280px]">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-wider uppercase text-accent-2 bg-accent-2/10 border border-accent-2/40 px-3 py-1 w-fit rounded-full mb-4">
                  <Icon name="chart" size={10} />
                  Premium Analitika
                </span>
                <h3 className="text-lg md:text-xl font-bold text-text-primary mb-2 group-hover:text-accent-2 transition-colors duration-250">Tashkilot Analitikasi</h3>
                <p className="text-xs text-text-secondary leading-relaxed">Guruhlar tahlili, o'rtacha ballar o'sish dinamikasi va TOP o'quvchilar taqqoslash jadvali.</p>
              </div>
              <div className="mt-6 flex justify-between text-[11px] text-text-secondary border-t border-edge pt-3">
                <span>O'rtacha ball: 82.4%</span>
                <span className="text-success font-bold">↑ 3.2%</span>
              </div>
            </GlowCard>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {/* Har bir kartaga o'z gradienti berilardi (39 ta imkoniyat = 39 xil
                ikki tonli gradient) — aynan shu "rangli klaster" AI ko'rinish
                belgisi edi. Endi hamma karta bir xil: neytral kvadrat katak,
                akcent rangli glif. */}
            {spotlightFeatures.map((f, i) => (
              <GlowCard
                key={f.title}
                className="feature-card-entrance p-5 md:p-8 group"
                style={{
                  animation: 'cardEntrance 0.4s ease-out forwards',
                  animationDelay: `${(i % 6) * 40}ms`
                }}
              >
                <div className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-11 h-11 rounded-md border border-edge flex items-center justify-center text-accent">
                    <Icon name={f.iconName || 'sparkles'} size={20} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base md:text-lg font-bold text-text-primary mb-1.5 md:mb-2">{f.title}</h3>
                    <p className="text-sm text-text-secondary leading-relaxed max-w-[60ch]">{f.desc}</p>
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>
        )}

        {/* Qolgan imkoniyatlar.
            Avval bu markazga tekislangan "chip buluti" edi — 39 ta yumaloq
            pilyula tartibsiz qatorlarda; qog'oz fonda esa umuman ko'rinmasdi
            (oq matn + deyarli shaffof oq fon). Endi ro'yxat: chegara bilan
            ajratilgan ustunlar, chapga tekislangan — skanerlash oson. */}
        {chipFeatures.length > 0 && (
          <div className="mt-10 md:mt-12 border-t border-edge pt-6 md:pt-8">
            <div className="text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary mb-4">
              Va yana {chipFeatures.length} ta imkoniyat
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
              {chipFeatures.map((f) => (
                <li
                  key={f.title}
                  title={f.desc}
                  className="flex items-start gap-2.5 py-2.5 border-b border-edge text-xs md:text-sm text-text-primary"
                >
                  <Icon name={f.iconName || 'sparkles'} size={14} className="text-accent flex-shrink-0 mt-0.5" />
                  <span>{f.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Multi-Layer AI Proctoring Suite Section */}
      <section id="proctoring-suite" className="py-12 md:py-20 relative overflow-hidden" style={{ background: 'rgb(var(--color-ground))', borderTop: '1px solid rgb(var(--color-edge))' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-10 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
              <Icon name="eye" size={14} className="text-accent flex-shrink-0" />
              Anti-Cheat Majmuasi
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">
              Ko'p Bosqichli AI Proktorin
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">
              Test xolisligi va shaffofligini 100% kafolatlovchi sun'iy intellekt nazorati
            </p>
          </div>

          {/* Uchala kartaning ikonka katagi avval uch xil rangda edi
              (qizil / sariq / binafsha) — bu uchta himoya qatlamini uch xil
              OGOHLANTIRISH darajasidek ko'rsatardi, holbuki ular teng. Endi
              katak bir xil neytral; rang faqat pastdagi holat yorlig'ida, u
              yerda rang haqiqatan holatni bildiradi. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: 'eye', title: 'Veb-kamera AI Yuz Nazorati', tone: 'success', state: 'Face Presence OK',
                desc: "Kamera orqali o'quvchining shaxsini, joyidaligini hamda xonada begona shaxslar borligini sun'iy intellekt real vaqtda aniqlaydi." },
              { icon: 'file', title: 'Tab & Oyna Almashtirish Detektori', tone: 'warning', state: 'Tab Switch Alert',
                desc: "Test paytida boshqa brauzer oynasiga o'tilsa, tizim soniya aniqligida ogohlantirish beradi va takrorlansa testni avto-yakunlaydi." },
              { icon: 'lock', title: "To'liq Ekran & Nusxalash Blokirovkasi", tone: 'success', state: 'Fullscreen Enforced',
                desc: 'Test majburiy Fullscreen rejimida ishlaydi. Matn belgilash, nusxalash (Copy-Paste) va F12 (DevTools) tugmalari bloklanadi.' },
            ].map((c) => (
              <div key={c.title} className="p-6 rounded-lg bg-surface-1 border border-edge space-y-3">
                <span className="w-10 h-10 rounded border border-edge flex items-center justify-center text-accent">
                  <Icon name={c.icon} size={18} />
                </span>
                <h3 className="text-lg font-bold text-text-primary">{c.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed max-w-[60ch]">{c.desc}</p>
                <div className={`text-[10px] font-bold px-2 py-1 rounded border w-fit ${
                  c.tone === 'success'
                    ? 'text-success bg-success/10 border-success/35'
                    : 'text-warning bg-warning/10 border-warning/35'
                }`}>
                  {c.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive QR Certificate & Portfolio Verification Showcase */}
      <section id="verification-suite" className="py-12 md:py-24 relative overflow-hidden bg-ground">
        <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center mb-10 md:mb-14 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
              <Icon name="award" size={14} className="text-accent flex-shrink-0" />
              Davlat va Xalqaro Verifikatsiya
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">
              Sertifikat va Portfolio QR Tekshiruvi
            </h2>
            <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">
              Har bir Olympy sertifikati va o'quvchi yutuqlari unikal QR-kod hamda ochiq portfolio havolasiga ega. Qalbaki hujjatlarga yo'l qo'yilmaydi!
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left: Interactive Verification Search Demo */}
            <div className="lg:col-span-6 glass p-6 md:p-8 rounded-3xl space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-accent-2 uppercase tracking-wider">
                <Icon name="search" size={14} className="text-accent flex-shrink-0" /><span>Bir Zumda Tekshirib Ko'ring</span>
              </div>
              <p className="text-xs md:text-sm text-text-secondary">
                Quyida sertifikat kodi yoki foydalanuvchi nomini kiriting va rasmiy haqiqiyligini tekshiring:
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={verifyInput}
                  onChange={(e) => setVerifyInput(e.target.value)}
                  placeholder="Masalan: OL-88421"
                  className="flex-1 bg-surface-2 border border-edge rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-2"
                />
                <button
                  onClick={() => {
                    if (!verifyInput) return;
                    setVerifyResult({
                      code: verifyInput.toUpperCase(),
                      studentName: 'Ali Valiyev',
                      olympiad: 'Respublika Matematika Olimpiadasi',
                      rank: '1-o\'rin (Oltin Medal)',
                      score: '96 / 100 ball',
                      issuedDate: '24-iyul, 2026',
                      verified: true,
                      issuer: 'ProSkill Academy & Olympy Platformasi'
                    });
                  }}
                  className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold shrink-0"
                >
                  Tekshirish
                </button>
              </div>

              <div className="flex gap-2 text-[10px]">
                <span className="text-text-secondary">Kodni tanlang:</span>
                {['OL-88421', 'OL-99201', 'OL-44102'].map(code => (
                  <button
                    key={code}
                    onClick={() => {
                      setVerifyInput(code);
                      setVerifyResult({
                        code: code,
                        studentName: code === 'OL-88421' ? 'Ali Valiyev' : code === 'OL-99201' ? 'Sardor Aliyev' : 'Zuhra Karimova',
                        olympiad: 'Olimpiada Test Sertifikati',
                        rank: 'I-darajali Diplom',
                        score: '94 / 100 ball',
                        issuedDate: '2026-07-24',
                        verified: true,
                        issuer: 'Olympy Rasmiy Tizimi'
                      });
                    }}
                    className="text-accent-2 hover:text-text-primary underline cursor-pointer"
                  >
                    #{code}
                  </button>
                ))}
              </div>

              {verifyResult && (
                <div className="mt-4 p-4 rounded-2xl bg-success/12 border border-success/35 text-left space-y-2 animate-fade-in motion-reduce:animate-none">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-success flex items-center gap-1.5">
                      <Icon name="check" size={13} /> SERTIFIKAT HAQIQIY (VERIFIED)
                    </span>
                    <span className="text-[10px] text-success font-mono">{verifyResult.code}</span>
                  </div>
                  <div className="text-xs text-text-primary space-y-1 pt-1 border-t border-success/35">
                    <div><span className="text-text-secondary">O'quvchi:</span> <strong className="text-text-primary">{verifyResult.studentName}</strong></div>
                    <div><span className="text-text-secondary">Tadbir:</span> {verifyResult.olympiad}</div>
                    <div><span className="text-text-secondary">Natija:</span> <span className="text-warning font-bold">{verifyResult.rank}</span> ({verifyResult.score})</div>
                    <div><span className="text-text-secondary">Beruvchi:</span> {verifyResult.issuer}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Certificate Mockup Card */}
            <div className="lg:col-span-6 relative">
              <div className="glass p-6 md:p-8 rounded-3xl relative z-10 bg-surface-1 text-left space-y-4">
                <div className="flex justify-between items-start border-b border-edge pb-4">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-accent-2 font-bold">Olympy Official Certificate</span>
                    <h3 className="text-lg font-black text-text-primary mt-1">I DARAJALI DIPLOM</h3>
                    <p className="text-[10px] text-text-secondary">ID: OL-88421 · Respublika Matematika Olimpiadasi</p>
                  </div>
                  <div className="w-14 h-14 rounded border border-edge flex flex-col items-center justify-center text-center p-1 font-mono text-[8px] text-accent-2">
                    <Icon name="grid" size={16} className="text-accent" />
                    <span>QR OK</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-text-primary py-2">
                  <p className="leading-relaxed">
                    Ushbu sertifikat egasi <strong className="text-text-primary text-sm">Ali Valiyev</strong> Matematika fani bo'yicha Respublika Online Olimpiadasida <strong className="text-success">96 ball</strong> to'plagan holda faol ishtirok etgani va faxrli <strong className="text-warning">1-o'rinni</strong> egallagani uchun berildi.
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-edge pt-4 text-[10px] text-text-secondary">
                  <span>Sana: 24.07.2026</span>
                  <span className="text-success font-bold flex items-center gap-1">
                    <Icon name="shield" size={12} />
                    prolymp.uz/verify/cert/OL-88421
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-12 md:py-24 bg-ground">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="play" size={14} className="text-accent flex-shrink-0" />Qanday ishlaydi</div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">4 ta oson qadam</h2>
            <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">Platformadan foydalanishni boshlash juda oson va tez</p>
          </div>
          
          {/* Bu bo'lim haqiqiy ketma-ketlik, shuning uchun 01–04 raqamlari
              o'rinli va asosiy belgi rolini o'ynaydi (avval ular gradientli
              kichik nishonda, ikonka ustida osilib turardi). Bosqichlarni
              bog'lovchi gradient chiziq o'rniga oddiy chegara chizig'i. */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-t border-edge">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`p-5 md:p-6 border-b md:border-b-0 border-r-0 md:border-r border-edge last:border-r-0 scroll-reveal scroll-reveal-delay-${(i % 4) + 1}`}
              >
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="font-data text-2xl md:text-3xl font-bold text-accent leading-none">{s.num}</span>
                  <span className="h-px flex-1 bg-edge" aria-hidden="true" />
                </div>
                <h3 className="text-base md:text-lg font-bold text-text-primary mb-2">{s.title}</h3>
                <p className="text-xs md:text-sm text-text-secondary leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram flow */}
      <section id="telegram-flow" className="py-12 md:py-24 max-w-5xl mx-auto px-4 md:px-6 scroll-reveal">
        <div className="glass rounded-3xl p-5 md:p-12 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="flex-1 min-w-0 text-center md:text-left">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="send" size={14} className="text-accent flex-shrink-0" />Telegram integratsiya</div>
            <h2 className="text-xl md:text-3xl font-black text-text-primary mb-3 md:mb-4">Bir tugma bilan tasdiqlash</h2>
            <p className="text-text-secondary leading-relaxed mb-5 md:mb-6 text-sm md:text-base">O'quvchi ariza yuborganida, manager Telegram botida bildirishnoma oladi va bir tugma bosish bilan tasdiqlaydi.</p>
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
          <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="star" size={14} className="text-accent flex-shrink-0" />Fikrlar</div>
          <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">Bizga ishonishadi</h2>
          <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">Platformadan foydalanayotgan markazlarning fikrlari</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            { name: 'Sardorbek M.', org: 'ProSkill Academy', meta: "120 o'quvchi", stars: 5, text: "AI savol generatori haftalik test tayyorlash vaqtimizni 10 barobar qisqartirdi. Olimpiada natijalarini endi qo'lda hisoblamaymiz." },
            { name: 'Dilnoza K.', org: 'Bilim Markazi', meta: "85 o'quvchi", stars: 5, text: "O'quvchilar reytingi va mashq rejimi guruhdagi faollikni sezilarli oshirdi. Natijalar tahlili juda qulay." },
            { name: 'Jasur T.', org: 'Iqtidor School', meta: "210 o'quvchi", stars: 5, text: "PDF'dan test import qilish funksiyasi darsliklarimizni soniyalarda test bazasiga aylantirdi. Proctoring nazorati ham ishonchli." },
          ].map((t, i) => (
            <div key={t.name} className={`glass rounded-2xl p-5 border border-transparent hover:border-edge-strong transition-colors flex flex-col scroll-reveal scroll-reveal-delay-${(i % 4) + 1}`}>
              {/* Yulduz reytingi */}
              <div className="flex gap-0.5 mb-3 text-warning text-sm" aria-label={`${t.stars} yulduz`}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= t.stars ? 'text-warning' : 'text-text-secondary'}>★</span>
                ))}
              </div>
              <p className="text-xs md:text-sm text-text-primary leading-relaxed flex-1 mb-4">"{t.text}"</p>
              <div className="flex items-center gap-3 border-t border-edge pt-3.5">
                {/* Avatar o'rnida ism bosh harflari. Avval har birida o'z
                    gradienti bor edi — endi bir xil neytral katak. */}
                <span className="flex-shrink-0 w-9 h-9 rounded-md border border-edge bg-surface-2 flex items-center justify-center text-[11px] font-bold text-text-primary">
                  {t.name.split(' ').map(w => w[0]).join('')}
                </span>
                <div className="min-w-0">
                  <div className="text-xs md:text-sm font-bold text-text-primary truncate">{t.name}</div>
                  <div className="text-[10px] md:text-[11px] text-text-secondary truncate">{t.org} · {t.meta}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — rejalar backenddan (GET /api/billing/plans/) yuklanadi. */}
      <section id="pricing" className="py-12 md:py-24 bg-ground">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-12 scroll-reveal">
            <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="tag" size={14} className="text-accent flex-shrink-0" />Narxlar</div>
            <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">Qulay narxlar</h2>
            <p className="text-sm text-text-secondary max-w-xl mx-auto">
              Platformamiz premium imkoniyatlaridan foydalanish uchun o'zingizga qulay rejani tanlang. Muddat qanchalik uzun bo'lsa, chegirma shunchalik yuqori bo'ladi!
            </p>
          </div>

          {/* Plan Type Switcher & Duration Selector */}
          <div className="flex flex-col items-center gap-6 mb-12 scroll-reveal scroll-reveal-delay-1">
            {/* O'quvchi vs Tashkilot — segment tugmasi. Faol holat gradient
                to'ldirish bilan emas, qattiq akcent yuzasi bilan (matn
                `on-accent`, kontrast token juftligi kafolatlaydi). */}
            <div className="inline-flex p-1 bg-surface-1 rounded-lg border border-edge">
              {[
                { id: 'student', icon: 'users', label: "O'quvchilar" },
                { id: 'organization', icon: 'building', label: 'Tashkilotlar' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPlanTypeFilter(t.id)}
                  aria-pressed={planTypeFilter === t.id}
                  className={`flex items-center gap-2 px-5 md:px-6 py-2.5 rounded-md font-bold text-xs md:text-sm transition-colors ${
                    planTypeFilter === t.id
                      ? 'bg-accent-fill text-on-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  <Icon name={t.icon} size={15} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Muddat selectorlari (1, 3, 6, 12 oy) */}
            <div className="flex gap-2 flex-wrap justify-center">
              {[
                { label: '1 oy', days: 30 },
                { label: '3 oy', days: 90, discount: '10%' },
                { label: '6 oy', days: 180, discount: '20%' },
                { label: '1 yil', days: 365, discount: '30%' },
              ].map((dur) => (
                <button
                  key={dur.days}
                  onClick={() => setDurationFilter(dur.days)}
                  aria-pressed={durationFilter === dur.days}
                  className={`px-4 md:px-5 py-2 rounded-md text-xs font-bold transition-colors border ${
                    durationFilter === dur.days
                      ? 'bg-accent-fill text-on-accent border-accent-fill'
                      : 'bg-surface-1 text-text-secondary border-edge hover:text-text-primary hover:bg-surface-2'
                  }`}
                >
                  {dur.label}
                  {dur.discount && (
                    <span className={`ml-1.5 font-data ${durationFilter === dur.days ? 'text-on-accent' : 'text-success'}`}>
                      −{dur.discount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tejash kalkulyatori banneri (D) — 1 oydan uzun muddat tanlanganda */}
            {durationFilter > 30 && maxSavings > 0 && (
              <div className="inline-flex items-center gap-2.5 px-4 md:px-5 py-2.5 rounded-lg border border-success/35 bg-success/10 text-xs md:text-sm font-bold text-text-primary">
                <Icon name="tag" size={15} className="text-success flex-shrink-0" />
                <span>
                  {durationLabel} rejani tanlasangiz, oyma-oy to'lovga nisbatan{' '}
                  <span className="text-success font-black">{formatUZS(maxSavings)}</span> gacha tejaysiz
                </span>
              </div>
            )}
          </div>
          {plansLoading && !plans ? (
            // Skeleton — rejalar yuklanguncha 3 ta placeholder karta.
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass rounded-2xl p-4 md:p-6 animate-pulse motion-reduce:animate-none">
                  <div className="h-4 w-24 bg-surface-2 rounded mb-4" />
                  <div className="h-8 w-32 bg-surface-2 rounded mb-2" />
                  <div className="h-3 w-40 bg-surface-2 rounded mb-6" />
                  <div className="space-y-3 mb-6">
                    <div className="h-3 w-full bg-surface-2 rounded" />
                    <div className="h-3 w-5/6 bg-surface-2 rounded" />
                    <div className="h-3 w-4/6 bg-surface-2 rounded" />
                  </div>
                  <div className="h-10 w-full bg-surface-2 rounded-xl" />
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
                /* "Mashhur" reja avval uch tonli gradient fon + ikki qavat
                   rangli soya bilan ajratilardi. Endi u faqat qalinroq chegara
                   va yuqoridagi akcent chizig'i bilan ajraladi — bosma
                   varaqadagi qalin ramka kabi. */
                <div
                  key={i}
                  className={`relative p-5 md:p-6 flex flex-col rounded-lg bg-surface-1 ${delayClass} ${
                    p.popular ? 'border-2 border-accent' : 'border border-edge'
                  }`}
                >
                  <div className="flex flex-col h-full">
                    {p.popular && (
                      <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent mb-3">
                        Mashhur tanlov
                      </div>
                    )}
                    <div className="text-sm font-bold tracking-wide mb-1 text-text-secondary">{p.name}</div>
                    <div className="font-data text-3xl md:text-4xl font-black mb-1.5 text-text-primary">
                      {p.price}
                    </div>
                    {p.period && <div className="text-xs mb-3 font-semibold text-text-secondary">{p.period}</div>}
                    {/* Tanlangan muddatdagi tejash miqdori (D) */}
                    {getPlanSavings(p) > 0 && (
                      <div className="inline-flex items-center gap-1.5 w-fit text-[11px] font-bold text-text-primary bg-success/10 border border-success/35 rounded px-2.5 py-1 mb-3">
                        <Icon name="tag" size={12} className="text-success flex-shrink-0" />
                        <span className="font-data">{formatUZS(getPlanSavings(p))} tejaysiz</span>
                      </div>
                    )}
                    <div className="text-xs mb-5 leading-relaxed text-text-secondary">{p.desc}</div>

                    <ul className="flex-1 mb-6 border-t border-edge">
                       {p.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-2.5 py-2.5 border-b border-edge text-xs md:text-sm text-text-primary">
                          <Icon name="check" size={14} className="text-accent flex-shrink-0 mt-0.5" />
                          <span className="leading-normal">{f}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={handleClick}
                      className={`w-full py-3 rounded-lg font-bold text-xs md:text-sm ${p.popular ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {isFree ? (user ? 'Boshqaruv paneli' : 'Boshlash') : (user ? 'Sotib olish' : 'Kirish va ulanish')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 scroll-reveal">
        <div className="text-center mb-10 md:mb-16">
          <div className="inline-flex items-center gap-2 mb-3 md:mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary"><Icon name="info" size={14} className="text-accent flex-shrink-0" />FAQ</div>
          <h2 className="text-2xl md:text-4xl font-black text-text-primary mb-3 md:mb-4">Ko'p beriladigan savollar</h2>
          <p className="text-text-secondary max-w-xl mx-auto text-sm md:text-base">Olympy platformasi haqida o'zingizni qiziqtirgan barcha savollarga javob oling</p>
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
                className={`glass rounded-2xl border transition-all duration-300 ${isOpen ? 'border-accent/40 bg-surface-1' : 'border-edge hover:border-edge-strong'}`}
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-sm md:text-base text-text-primary hover:text-accent transition-colors select-none outline-none"
                >
                  <span>{faq.q}</span>
                  <span className={`transition-transform duration-300 text-accent ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                    <Icon name="chevronDown" size={20} />
                  </span>
                </button>
                <div className={`accordion-content ${isOpen ? 'open' : ''}`}>
                  <div className="p-5 pt-0 text-xs md:text-sm text-text-secondary leading-relaxed border-t border-edge mt-1">
                    {faq.a}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Yakuniy chaqiruv.
          Avval bu yerda uchta radial "mesh" dog'i (indigo/binafsha/moviy) qora
          yuza ustiga chizilgan edi — qog'oz sahifadagi eng katta AI-ko'rinish
          belgisi. Endi oddiy ramka: qalin akcent chegara va tekis yuza. */}
      <section className="py-12 md:py-24 max-w-4xl mx-auto px-4 md:px-6 scroll-reveal">
        <div className="rounded-lg p-6 md:p-10 border-2 border-accent bg-surface-1 text-center">
          <div className="inline-flex items-center gap-2 mb-4 text-[11px] md:text-xs font-bold uppercase tracking-[0.14em] text-text-secondary">
            <Icon name="bolt" size={14} className="text-accent flex-shrink-0" />
            Ro'yxatdan o'tish 2 daqiqa vaqt oladi
          </div>
          <h2 className="font-display text-3xl md:text-5xl font-bold text-text-primary mb-3 md:mb-4" style={{ textWrap: 'balance' }}>Bugun boshlang</h2>
          <p className="text-text-primary mb-7 md:mb-9 text-sm md:text-base max-w-[52ch] mx-auto leading-relaxed">
            Tashkilotingizni raqamli olimpiada platformasiga ulang — AI savollar, jonli reyting va avtomatik hisobotlar bitta tizimda.
          </p>

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center sm:justify-center gap-3 mb-8 md:mb-10">
            <button onClick={() => onNavigate('register')} className="btn-primary inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-lg text-sm md:text-base font-bold">
              <Icon name="bolt" size={18} />
              Bepul boshlash
            </button>
            <button onClick={() => onNavigate('login')} className="btn-ghost inline-flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-3.5 rounded-lg text-sm md:text-base font-semibold">
              Kirish
              <Icon name="chevronRight" size={18} />
            </button>
          </div>

          {/* Motivatsion mini-statlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 border-t border-edge pt-2 text-left">
            {[
              { icon: 'sparkles', node: <><CountUp end={100} suffix="+" className="font-data font-bold" /> AI savol soniyada</> },
              { icon: 'grid', node: <><CountUp end={26} suffix="+" className="font-data font-bold" /> premium imkoniyat</> },
              { icon: 'trophy', node: 'Jonli reyting va sertifikatlar' },
              { icon: 'shield', node: 'Bepul boshlash uchun karta talab qilinmaydi' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-2.5 border-b border-edge text-xs md:text-sm text-text-primary">
                <Icon name={item.icon} size={14} className="text-accent flex-shrink-0" />
                <span>{item.node}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-edge py-8 md:py-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
          </div>
          <div className="text-xs md:text-sm text-text-secondary">© {new Date().getFullYear()} Olympy. Barcha huquqlar himoyalangan.</div>
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6 text-xs md:text-sm text-text-secondary">
            <a href="/privacy.html" className="hover:text-text-primary transition-colors">Maxfiylik siyosati</a>
            <span className="w-px h-4 bg-surface-2" aria-hidden="true" />
            <a href="mailto:sanjarruzmetov017@gmail.com" className="hover:text-text-primary transition-colors">Aloqa</a>
            <span className="w-px h-4 bg-surface-2" aria-hidden="true" />
            <a href="https://t.me/proskilluz" target="_blank" rel="noreferrer noopener"
               className="text-text-secondary hover:text-accent transition-colors flex items-center"
               aria-label="Telegram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.06-.2-.07-.06-.18-.04-.26-.02-.11.02-1.85 1.18-5.22 3.47-.5.34-.94.51-1.34.5-.44-.01-1.29-.25-1.92-.46-.78-.25-1.39-.39-1.34-.83.03-.23.32-.47.85-.71 3.36-1.46 5.59-2.43 6.71-2.89 3.19-1.33 3.86-1.56 4.29-1.57.1 0 .31.02.45.13.12.09.15.21.17.3-.01.06.01.24 0 .38z"/>
              </svg>
            </a>
            <a href="https://www.instagram.com/proskilluz/" target="_blank" rel="noreferrer noopener"
               className="text-text-secondary hover:text-error transition-colors flex items-center"
               aria-label="Instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {paymentPlan && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ground/90 px-4">
          <div className="glass-strong rounded-3xl p-6 md:p-8 max-w-md w-full border border-accent/40 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-text-primary mb-1">
                    {payPolling.status === 'success' ? "To'lov muvaffaqiyatli!"
                      : payPolling.status === 'timeout' ? "To'lov tekshirilmoqda"
                      : payPolling.status === 'checking' ? "To'lov tekshirilmoqda..."
                      : "To'lov usulini tanlang"}
                  </h3>
                  <p className="text-xs text-text-secondary">"{paymentPlan.name}" obunasi uchun to'lov</p>
                </div>
                <button
                  onClick={() => { setPaymentPlan(null); setPaymentError(''); payPolling.reset(); }}
                  className="text-text-secondary hover:text-text-primary transition-colors text-xl font-semibold outline-none"
                >
                  ✕
                </button>
              </div>

              {payPolling.status === 'success' ? (
                // Premium faollashdi — 2 soniyadan keyin modal avtomatik yopiladi.
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-success/12 border border-success/35 flex items-center justify-center">
                    <Icon name="check" size={26} className="text-success" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-text-primary">To'lov muvaffaqiyatli!</p>
                    <p className="mt-1.5 text-sm text-text-secondary">
                      Obunangiz faollashtirildi. Endi barcha imkoniyatlardan foydalanishingiz mumkin.
                    </p>
                  </div>
                  <button
                    onClick={() => { setPaymentPlan(null); setPaymentError(''); payPolling.reset(); }}
                    className="btn-ghost w-full py-3 rounded-lg text-sm font-bold"
                  >
                    Yopish
                  </button>
                </div>
              ) : payPolling.status === 'timeout' ? (
                // 2 daqiqa o'tdi, hali tasdiqlanmadi.
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-warning/12 border border-warning/35 flex items-center justify-center">
                    <Icon name="clock" size={26} className="text-warning" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-text-primary">To'lov hali tasdiqlanmadi</p>
                    <p className="mt-1.5 text-sm text-text-secondary">
                      Bir oz kuting yoki qo'llab-quvvatlash bilan bog'laning. Obunangiz
                      tasdiqlangach sahifani yangilaganingizda faol bo'ladi.
                    </p>
                  </div>
                  <button
                    onClick={() => { setPaymentPlan(null); setPaymentError(''); payPolling.reset(); }}
                    className="btn-ghost w-full py-3 rounded-lg text-sm font-bold"
                  >
                    Yopish
                  </button>
                </div>
              ) : payPolling.status === 'checking' ? (
                // To'lov sahifasi ochildi — tasdiqlanishini kutmoqdamiz (polling).
                <div className="space-y-4 py-2 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center">
                    <Icon name="clock" size={26} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-text-primary">To'lov tekshirilmoqda...</p>
                    <p className="mt-1.5 text-sm text-text-secondary">
                      To'lovingiz qabul qilindi. Obunangiz tasdiqlanishini kutmoqdamiz —
                      bu odatda bir necha soniya davom etadi.
                    </p>
                  </div>
                  <button
                    onClick={() => { setPaymentPlan(null); setPaymentError(''); payPolling.reset(); }}
                    className="btn-ghost w-full py-3 rounded-lg text-sm font-bold"
                  >
                    Yopish
                  </button>
                </div>
              ) : (
              <>
              <div className="border border-edge rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">Tanlangan reja:</span>
                  <span className="text-sm font-bold text-text-primary">{paymentPlan.name}</span>
                </div>
                <div className="flex justify-between items-center mt-2 border-t border-edge pt-2">
                  <span className="text-sm text-text-secondary">Jami narx:</span>
                  <span className="text-lg font-black text-accent">{paymentPlan.price}</span>
                </div>
              </div>

              {paymentError && (
                <div className="mb-4 text-xs font-semibold text-error bg-error/12 border border-error/35 rounded-xl p-3">
                  {paymentError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  disabled={paymentLoading}
                  onClick={() => handleCreatePayment('click')}
                  className="flex flex-col items-center justify-center gap-3 p-4 border border-edge hover:border-accent hover:bg-surface-2 rounded-lg transition-colors group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-[#009cf0]/10 rounded-full flex items-center justify-center transition-transform">
                    <span className="text-xl font-black text-[#009cf0]">C</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">Click</span>
                </button>

                <button
                  disabled={paymentLoading}
                  onClick={() => handleCreatePayment('payme')}
                  className="flex flex-col items-center justify-center gap-3 p-4 border border-edge hover:border-accent-2 hover:bg-surface-2 rounded-lg transition-colors group disabled:opacity-50"
                >
                  <div className="w-12 h-12 bg-[#3cb8b6]/10 rounded-full flex items-center justify-center transition-transform">
                    <span className="text-xl font-black text-[#3cb8b6]">P</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">Payme</span>
                </button>
              </div>

              {paymentLoading && (
                <div className="mt-6 flex items-center justify-center gap-2 text-sm text-accent">
                  <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
                  <span>To'lov havolasi yuklanmoqda...</span>
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { LandingPage });
