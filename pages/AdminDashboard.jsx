// pages/AdminDashboard.jsx

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/admin/<key>`
// manziliga bog'lanadi (home → /dashboard/admin).
const ADMIN_DASHBOARD_PAGES = [
  'home', 'users', 'centers', 'olympiads', 'requests',
  'subjects', 'analytics', 'logs', 'security', 'settings', 'myprofile', 'support',
];
const adminDashUrl = makeDashboardUrlSync('/dashboard/admin', ADMIN_DASHBOARD_PAGES);

// Rol o'zgartirish modalidagi checkboxlar. `admin` — platform admin huquqi
// (User.roles emas, is_platform_admin flag'i); qolganlari markazsiz
// system-wide rollar (backend ALLOWED_ROLE_KEYS bilan mos).
const ROLE_MODAL_KEYS = [
  { value: 'student', label: "O'quvchi (Student)" },
  { value: 'teacher', label: "O'qituvchi (Teacher)" },
  { value: 'manager', label: 'Manager' },
  { value: 'owner', label: 'Direktor (Owner)' },
  { value: 'admin', label: 'Platform Admin' },
];

// Amallar tarixi (audit jurnali) bir sahifada nechta yozuv ko'rsatadi.
// Backend LargePageNumberPagination'ga `page_size` sifatida yuboriladi.
const AUDIT_PAGE_SIZE = 50;

// "Xavfsizlik" tabining ichki bo'limlari. Tab bir nechta mustaqil kuzatuv
// blokini birlashtiradi — yangisini qo'shish uchun shu ro'yxatga element va
// `securitySectionRenderers` ga o'sha kalitli renderer qo'shiladi, tabning
// qolgan qismi (segment tugmalari, sarlavha, tanlov holati) o'zgarmaydi.
const SECURITY_SECTIONS = [
  { key: 'shared-ip', label: "Bir xil IP'dan kirish" },
  { key: 'auto-flags', label: 'Avtomatik bayroqlar' },
  { key: 'cheating', label: 'Firibgarlik holatlari' },
];

// "Bir xil IP" bloki filtrlari — backend ham AYNAN shu chegaralarga clamp
// qiladi (accounts/views_security.py), bu yerdagilar shunchaki tayyor
// variantlar.
const SHARED_IP_MIN_ACCOUNT_OPTIONS = [2, 3, 5, 10, 20];
const SHARED_IP_DAY_OPTIONS = [7, 30, 90, 365];

// "Avtomatik bayroqlar" bloki filtrlari. Kalitlar backend
// `ModerationFlag.FLAG_TYPE_CHOICES` / `STATUS_CHOICES` bilan bir xil.
// Bo'sh satr — "tur filtri yo'q"; holat uchun esa 'all' kerak, chunki
// bo'sh qoldirilsa backend default sifatida `pending` ni qo'llaydi.
const MODERATION_FLAG_TYPE_OPTIONS = [
  { key: '', label: 'Barcha turlar' },
  { key: 'suspicious_ip', label: 'Shubhali IP' },
  { key: 'question', label: 'Savol' },
];
const MODERATION_STATUS_OPTIONS = [
  { key: 'pending', label: 'Kutilmoqda' },
  { key: 'resolved', label: 'Hal qilindi' },
  { key: 'dismissed', label: 'Rad etildi' },
  { key: 'all', label: 'Barchasi' },
];
// Bir sahifada nechta bayroq (backend LargePageNumberPagination `page_size`).
const MODERATION_PAGE_SIZE = 50;
// Bayroq holati → AdminPill rangi. Ko'rinadigan matn backenddan keladi
// (`status_label`), bu yerda faqat rang tanlanadi.
const MODERATION_STATUS_PILL = {
  pending: 'pending',
  resolved: 'approved',
  dismissed: 'rejected',
};

// "Firibgarlik holatlari" bloki filtrlari. Kalitlar backend
// `TestSession.STATUS_*` bilan bir xil; bo'sh satr — ikkala holat ham
// (ro'yxatning o'zi allaqachon shu ikkitasi bilan chegaralangan).
const CHEATING_STATUS_OPTIONS = [
  { key: '', label: 'Barchasi' },
  { key: 'pending_review', label: 'Tekshiruv kutilmoqda' },
  { key: 'disqualified', label: 'Diskvalifikatsiya' },
];
// Sessiya holati → AdminPill rangi va o'zbekcha yorlig'i. Backend bu ro'yxatda
// xom kod qaytaradi (jonli kuzatuv ekranidagi kabi), yorliq esa panelniki.
const CHEATING_STATUS_META = {
  pending_review: { pill: 'pending', label: 'Tekshiruv kutilmoqda' },
  disqualified: { pill: 'rejected', label: 'Diskvalifikatsiya' },
};
// Bir sahifada nechta qator (backend LargePageNumberPagination `page_size`).
const CHEATING_PAGE_SIZE = 50;

const formatAdminDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Audit jurnali uchun: sana + soat (formatAdminDate faqat sanani beradi,
// "kim nima qildi" tarixida esa soat/daqiqa muhim).
const formatAdminDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ');
  return d.toLocaleString('uz-UZ', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

// "Oxirgi ko'rilgan" — nisbiy vaqt ("5 daqiqa oldin"). Oflayn foydalanuvchi
// qachondan beri yo'qligini aniq sana/soatdan ko'ra tezroq o'qitadi.
// Loyihada sana kutubxonasi (date-fns/dayjs) yo'q va faqat shu bitta joy
// uchun qo'shilmaydi. Qiymat yo'q bo'lsa "" — chaqiruvchi o'zi hal qiladi.
// Serverdan kelgan vaqt brauzer soatidan bir oz oldinda bo'lishi mumkin
// (soat farqi) — manfiy oraliq ham "Hozirgina" bo'lib chiqadi.
const formatAdminRelativeTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'Hozirgina';
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
};

// To'lov summasi — "149 000 so'm" ko'rinishida (panelning boshqa joylaridagi
// daromad tooltipi bilan bir xil format).
const formatAdminAmount = (amount) => `${(Number(amount) || 0).toLocaleString('uz-UZ')} so'm`;

// Backend PaymentTransaction.STATUS_CHOICES → o'zbekcha yorliq + rang.
// Noma'lum kod kelsa xom qiymat ko'rsatiladi (yashirib qo'yilmaydi).
const ADMIN_PAYMENT_STATUS = {
  success: { label: "To'langan", cls: 'text-emerald-400' },
  pending: { label: 'Kutilmoqda', cls: 'text-amber-400' },
  failed: { label: 'Xato', cls: 'text-rose-400' },
  cancelled: { label: 'Bekor qilingan', cls: 'text-slate-400' },
};
const adminPaymentStatus = (status) => ADMIN_PAYMENT_STATUS[status]
  || { label: status || '—', cls: 'text-slate-400' };

// To'lov provayderi kodi → ko'rsatish nomi (backend 'click' / 'payme' yozadi).
const ADMIN_PROVIDER_LABEL = { click: 'Click', payme: 'Payme' };
const adminProviderLabel = (provider) => ADMIN_PROVIDER_LABEL[provider]
  || (provider ? provider[0].toUpperCase() + provider.slice(1) : '—');

// User-Agent satri juda uzun (250 belgigacha) — jadvalga sig'maydi. Eng
// muhim qismini ajratamiz: qurilma turi + brauzer. Tanib bo'lmasa satrning
// boshi qaytariladi (ma'lumot butunlay yo'qolmasin, `title` da to'lig'i bor).
const adminDeviceLabel = (userAgent) => {
  const ua = String(userAgent || '').trim();
  if (!ua) return "Noma'lum qurilma";
  const platform = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : '';
  // Tartib muhim: Edge/Opera ham "Chrome" ni, Chrome esa "Safari" ni o'z
  // UA satrida saqlaydi — aniqrog'idan boshlab tekshiramiz.
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Telegram/i.test(ua) ? 'Telegram'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : '';
  const parts = [platform, browser].filter(Boolean);
  return parts.length ? parts.join(' · ') : ua.slice(0, 40);
};

const adminStatusMeta = (status) => {
  const map = {
    approved: { label: 'Tasdiqlandi', cls: 'admin-badge-active' },
    pending: { label: 'Kutilmoqda', cls: 'admin-badge-pending' },
    rejected: { label: 'Rad etildi', cls: 'admin-badge-rejected' },
    active: { label: 'Faol', cls: 'admin-badge-active' },
    draft: { label: 'Draft', cls: 'admin-badge-draft' },
    finished: { label: 'Tugagan', cls: 'admin-badge-draft' },
  };
  return map[status] || map.draft;
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

const AdminPill = ({ status, children }) => {
  const meta = adminStatusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${meta.cls}`}>
      {children || meta.label}
    </span>
  );
};

const AdminInitial = ({ name, color = 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/20' }) => (
  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-sm font-bold shadow-[0_0_10px_rgba(99,102,241,0.05)]`}>
    {(name || '?').trim()[0]?.toUpperCase() || '?'}
  </div>
);

const AdminCenterLogo = ({ name, src, color = 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/20' }) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-lg object-cover border border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-sm font-bold shadow-[0_0_10px_rgba(99,102,241,0.05)]`}>
      {(name || '?').trim()[0]?.toUpperCase() || '?'}
    </div>
  );
};

// `onClick` ixtiyoriy: berilgan kartagina bosiladigan bo'ladi (kursor, fokus
// halqasi, Enter/Probel). Qolgan kartalar avvalgidek oddiy ko'rsatkich —
// bosilmaydigan elementga role="button" qo'yish skrinriderni chalg'itardi.
const AdminMetricCard = ({ label, value, delta, icon, tone = 'indigo', onClick }) => {
  const tones = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]',
    rose: 'text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.05)]',
  };
  const clickProps = onClick ? {
    onClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
    },
    role: 'button',
    tabIndex: 0,
  } : {};
  return (
    <GlowCard
      className={`admin-card p-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5${
        onClick ? ' cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60' : ''
      }`}
      {...clickProps}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{label}</div>
          <div className="mt-3 text-2xl font-black leading-none tracking-tight text-white">{value}</div>
          {delta && (
            <div className="mt-2.5 text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-indigo-400 shadow-[0_0_4px_#6366f1]" />
              {delta}
            </div>
          )}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tones[tone] || tones.indigo}`}>
          {icon}
        </div>
      </div>
    </GlowCard>
  );
};

const AdminBarChart = ({ values = [], labels = [] }) => {
  const safe = Array.isArray(values) && values.length > 0 ? values : [0, 0, 0, 0, 0, 0];
  const safeLabels = (labels && labels.length === safe.length) ? labels : ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn'].slice(0, safe.length);
  const maxV = Math.max(1, ...safe);
  return (
    <div className="flex h-[172px] items-end gap-4 px-2">
      {safe.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2 group">
          <div className="relative w-full flex justify-center">
            {/* Tooltip on hover */}
            <div className="absolute -top-7 scale-0 group-hover:scale-100 transition-all duration-200 bg-slate-900 border border-white/10 text-white text-[10px] px-2 py-0.5 rounded font-bold pointer-events-none z-20">
              {v}
            </div>
            <div className="w-full max-w-5 rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all duration-500 ease-out hover:from-purple-500 hover:to-indigo-400" 
              style={{ height: `${Math.max((v / maxV) * 120, v > 0 ? 8 : 2)}px` }} />
          </div>
          <div className="text-[11px] font-bold text-slate-400 mt-1">{safeLabels[i]}</div>
        </div>
      ))}
    </div>
  );
};

const AdminDonut = ({ segments }) => {
  let offset = 25;
  const circles = segments.map((s, i) => {
    const dash = `${s.value} ${100 - s.value}`;
    const circle = (
      <circle key={s.label} cx="18" cy="18" r="15.9" fill="none" stroke={s.color} strokeWidth="3"
        strokeDasharray={dash} strokeDashoffset={offset} className="transition-all duration-500 hover:stroke-[4]" />
    );
    offset -= s.value;
    return circle;
  });
  return (
    <div className="flex flex-col sm:flex-row items-center gap-8">
      <div className="relative flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="3" />
          {circles}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Jami</span>
          <span className="text-lg font-black text-white">100%</span>
        </div>
      </div>
      <div className="space-y-2 flex-1 w-full">
        {segments.map(s => (
          <div key={s.label} className="flex items-center justify-between gap-3 text-xs font-bold text-slate-300 p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: s.color, color: s.color }} />
              <span className="text-slate-400 font-semibold">{s.label}</span>
            </div>
            <span className="text-white font-mono">{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Recharts-asoslangan Tahlil diagrammalari ──────────────────────────────
// Recharts LAZY yuklanadi: `globalThis.OlympyRecharts.load()`
// (src/services/recharts-loader.js) dinamik `import()` qiladi, ya'ni
// kutubxona alohida chunkda qoladi va faqat "Tahlil" bo'limi ochilganda
// tushadi. Modul kelgunicha quyidagi o'zgaruvchilar `undefined` bo'ladi
// (diagrammalar o'rniga "Yuklanmoqda..." ko'rinadi); kelgach `bindRecharts`
// ularni to'ldiradi va `useRecharts` hook'i qayta renderni boshlaydi.
// pages/*.jsx ESM import qila olmaydi (blok ichida konkatenatsiya qilinadi),
// shuning uchun React/OlympyApi bilan bir xil global pattern ishlatiladi.
let RC;
let ReAreaChart;
let ReArea;
let ReBarChart;
let ReBar;
let ReLineChart;
let ReLine;
let RePieChart;
let RePie;
let ReCell;
let ReXAxis;
let ReYAxis;
let ReGrid;
let ReTooltip;
let ReLegend;
let ReLabelList;

const bindRecharts = (R) => {
  RC = R.ResponsiveContainer;
  ReAreaChart = R.AreaChart;
  ReArea = R.Area;
  ReBarChart = R.BarChart;
  ReBar = R.Bar;
  ReLineChart = R.LineChart;
  ReLine = R.Line;
  RePieChart = R.PieChart;
  RePie = R.Pie;
  ReCell = R.Cell;
  ReXAxis = R.XAxis;
  ReYAxis = R.YAxis;
  ReGrid = R.CartesianGrid;
  ReTooltip = R.Tooltip;
  ReLegend = R.Legend;
  ReLabelList = R.LabelList;
};

// Recharts'ni (bir marta) yuklaydi va tayyor bo'lganini qaytaradi.
// `enabled` false bo'lsa hech narsa yuklanmaydi — admin boshqa bo'limlarda
// ishlayotganda diagramma kutubxonasi umuman so'ralmaydi.
const useRecharts = (enabled) => {
  const [ready, setReady] = React.useState(() => !!RC);
  React.useEffect(() => {
    if (!enabled || ready) return undefined;
    const loader = globalThis.OlympyRecharts;
    if (!loader) return undefined;
    let alive = true;
    loader.load()
      .then((R) => {
        bindRecharts(R);
        if (alive) setReady(true);
      })
      .catch((err) => { console.warn('Recharts yuklanmadi:', err); });
    return () => { alive = false; };
  }, [enabled, ready]);
  return ready;
};

// So'm formatlash — daromad diagrammasi tooltip va o'qlarida ishlatiladi.
// 1 250 000 → "1.25M", 450 000 → "450K", kichik son shundayligicha.
const formatSom = (v) => {
  const n = Number(v) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
};

// Sana yorlig'ini qisqartirish (YYYY-MM-DD → "01.06" yoki YYYY-MM → "06.25").
const shortDay = (iso) => {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  if (parts.length === 2) return `${parts[1]}.${parts[0].slice(2)}`;
  return String(iso);
};

// Dark tema tooltip — barcha diagrammalarda bir xil ko'rinish.
const ChartTooltip = ({ active, payload, label, suffix = '', valueLabel }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2 shadow-xl">
      {label != null && label !== '' && (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-bold text-white">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill || '#6366f1' }} />
          <span className="text-slate-300">{valueLabel || p.name}:</span>
          <span className="font-mono">{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
};

// Diagramma sarlavhasi + bo'sh/yo'q holatlari uchun yengil wrapper.
const ChartCard = ({ title, subtitle, children, empty, emptyText = "Ma'lumot yo'q" }) => (
  <section className="admin-card p-5">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[11px] font-black tracking-wider uppercase text-slate-300">{title}</h2>
        {subtitle && <p className="mt-1 text-[10px] font-semibold text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {empty ? (
      <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-slate-500">
        <Icon name="chart" size={22} className="opacity-40" />
        <span className="text-[11px] font-bold">{emptyText}</span>
      </div>
    ) : children}
  </section>
);

// Diagramma 1 — Foydalanuvchi o'sishi (AreaChart, indigo gradient).
const UserGrowthArea = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[200px] w-full">
      <RC width="100%" height="100%">
        <ReAreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={34} />
          <ReTooltip content={<ChartTooltip valueLabel="Yangi" />} cursor={{ stroke: 'rgba(99,102,241,0.3)' }} />
          <ReArea type="monotone" dataKey="count" name="Yangi" stroke="#818cf8" strokeWidth={2.5}
            fill="url(#growthFill)" dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#a5b4fc', stroke: '#6366f1', strokeWidth: 2 }} />
        </ReAreaChart>
      </RC>
    </div>
  );
};

// Diagramma 2 (chap) — Premium breakdown (PieChart: paid / trial / bepul).
const PremiumPie = ({ data, total }) => {
  if (!RC) return null;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <RC width="100%" height="100%">
          <RePieChart>
            <RePie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%"
              innerRadius={48} outerRadius={68} paddingAngle={3} stroke="none">
              {data.map((d, i) => <ReCell key={i} fill={d.color} />)}
            </RePie>
            <ReTooltip content={<ChartTooltip suffix=" ta" />} />
          </RePieChart>
        </RC>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Jami</span>
          <span className="text-lg font-black text-white">{total}</span>
        </div>
      </div>
      <div className="w-full flex-1 space-y-2">
        {data.map(d => (
          <div key={d.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: d.color, color: d.color }} />
              <span className="font-semibold text-slate-400">{d.label}</span>
            </div>
            <span className="font-mono text-white">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Diagramma 2 (o'ng) — Retention D1/D7/D30 (vertikal BarChart, emerald).
const RetentionBars = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[174px] w-full">
      <RC width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 16, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="retentionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} width={36} />
          <ReTooltip content={<ChartTooltip suffix="%" valueLabel="Qaytgan" />} cursor={{ fill: 'rgba(52,211,153,0.08)' }} />
          <ReBar dataKey="pct" name="Qaytgan" fill="url(#retentionFill)" radius={[5, 5, 0, 0]} maxBarSize={40}>
            <ReLabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} fill="#cbd5e1" fontSize={10} fontWeight={700} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// Diagramma 3 — Konversiya funnel (horizontal BarChart).
const ConversionFunnel = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[200px] w-full">
      <RC width="100%" height="100%">
        <ReBarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="funnelFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={132} />
          <ReTooltip content={<ChartTooltip suffix=" ta" />} cursor={{ fill: 'rgba(168,85,247,0.08)' }} />
          <ReBar dataKey="value" name="Foydalanuvchi" fill="url(#funnelFill)" radius={[0, 6, 6, 0]} maxBarSize={34}>
            <ReLabelList dataKey="value" position="right" fill="#e2e8f0" fontSize={11} fontWeight={800} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// ─── Sektion 2: Platforma faoliyati ────────────────────────────────────────

// Oxirgi 30 kun kunlik attemptlar (LineChart, indigo/purple).
const AttemptsTrendChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[220px] w-full">
      <RC width="100%" height="100%">
        <ReLineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="date" tickFormatter={shortDay} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} interval={4} minTickGap={12} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Attempt" />} cursor={{ stroke: 'rgba(129,140,248,0.3)' }} labelFormatter={shortDay} />
          <ReLine type="monotone" dataKey="count" name="Attempt" stroke="#818cf8" strokeWidth={2.5}
            dot={false} activeDot={{ r: 5, fill: '#a5b4fc', stroke: '#6366f1', strokeWidth: 2 }} />
        </ReLineChart>
      </RC>
    </div>
  );
};

// Top-10 olimpiada — ishtirokchilar soni (horizontal BarChart, purple).
const OlympiadParticipationChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="w-full" style={{ height: `${Math.max(200, data.length * 30 + 24)}px` }}>
      <RC width="100%" height="100%">
        <ReBarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="olympPartFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={120} tickFormatter={(v) => (v && v.length > 16 ? v.slice(0, 15) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Ishtirokchi" />} cursor={{ fill: 'rgba(168,85,247,0.08)' }} />
          <ReBar dataKey="participants" name="Ishtirokchi" fill="url(#olympPartFill)" radius={[0, 6, 6, 0]} maxBarSize={26}>
            <ReLabelList dataKey="participants" position="right" fill="#e2e8f0" fontSize={11} fontWeight={800} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// ─── Sektion 3: Kontent tahlil ─────────────────────────────────────────────

// Fan bo'yicha savol soni (horizontal BarChart, amber).
const QuestionBySubjectChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="w-full" style={{ height: `${Math.max(200, data.length * 28 + 24)}px` }}>
      <RC width="100%" height="100%">
        <ReBarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="qSubjectFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#f97316" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={110} tickFormatter={(v) => (v && v.length > 14 ? v.slice(0, 13) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Savol" />} cursor={{ fill: 'rgba(245,158,11,0.08)' }} />
          <ReBar dataKey="count" name="Savol" fill="url(#qSubjectFill)" radius={[0, 6, 6, 0]} maxBarSize={24}>
            <ReLabelList dataKey="count" position="right" fill="#e2e8f0" fontSize={11} fontWeight={800} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// Savol manbai taqsimoti (PieChart: manual/ai/pdf/import).
const QUESTION_SOURCE_COLORS = ['#6366f1', '#a855f7', '#34d399', '#f59e0b', '#f43f5e'];
const QuestionBySourceChart = ({ data }) => {
  if (!RC) return null;
  const total = data.reduce((s, d) => s + (d.count || 0), 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <RC width="100%" height="100%">
          <RePieChart>
            <RePie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%"
              innerRadius={48} outerRadius={68} paddingAngle={3} stroke="none">
              {data.map((d, i) => <ReCell key={i} fill={QUESTION_SOURCE_COLORS[i % QUESTION_SOURCE_COLORS.length]} />)}
            </RePie>
            <ReTooltip content={<ChartTooltip suffix=" ta" />} />
          </RePieChart>
        </RC>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Jami</span>
          <span className="text-lg font-black text-white">{total.toLocaleString()}</span>
        </div>
      </div>
      <div className="w-full flex-1 space-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 p-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: QUESTION_SOURCE_COLORS[i % QUESTION_SOURCE_COLORS.length], color: QUESTION_SOURCE_COLORS[i % QUESTION_SOURCE_COLORS.length] }} />
              <span className="font-semibold text-slate-400">{d.label || d.name}</span>
            </div>
            <span className="font-mono text-white">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Sektion 4: Moliya ─────────────────────────────────────────────────────

// Daromad tooltip — so'm bilan to'liq formatlangan qiymat.
const RevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const v = Number(payload[0].value) || 0;
  return (
    <div className="rounded-lg bg-slate-800 border border-white/10 px-3 py-2 shadow-xl">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{shortDay(label)}</div>
      <div className="flex items-center gap-2 text-xs font-bold text-white">
        <span className="h-2 w-2 rounded-full" style={{ background: '#34d399' }} />
        <span className="text-slate-300">Daromad:</span>
        <span className="font-mono">{v.toLocaleString('uz-UZ')} so'm</span>
      </div>
    </div>
  );
};

// Oylik daromad (AreaChart, emerald).
const RevenueTrendChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[220px] w-full">
      <RC width="100%" height="100%">
        <ReAreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="month" tickFormatter={shortDay} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tickFormatter={formatSom} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
          <ReTooltip content={<RevenueTooltip />} cursor={{ stroke: 'rgba(52,211,153,0.3)' }} />
          <ReArea type="monotone" dataKey="amount" name="Daromad" stroke="#10b981" strokeWidth={2.5}
            fill="url(#revenueFill)" dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#6ee7b7', stroke: '#059669', strokeWidth: 2 }} />
        </ReAreaChart>
      </RC>
    </div>
  );
};

// ─── Sektion 5: Markazlar ──────────────────────────────────────────────────

// Viloyat bo'yicha markazlar soni (horizontal BarChart, indigo).
const CentersByRegionChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="w-full" style={{ height: `${Math.max(200, data.length * 28 + 24)}px` }}>
      <RC width="100%" height="100%">
        <ReBarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="regionFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#818cf8" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={120} tickFormatter={(v) => (v && v.length > 16 ? v.slice(0, 15) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Markaz" />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
          <ReBar dataKey="count" name="Markaz" fill="url(#regionFill)" radius={[0, 6, 6, 0]} maxBarSize={24}>
            <ReLabelList dataKey="count" position="right" fill="#e2e8f0" fontSize={11} fontWeight={800} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// Premium vs Free markazlar oylik olimpiada soni (grouped BarChart).
const PremiumVsFreeChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[220px] w-full">
      <RC width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="month" tickFormatter={shortDay} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <ReTooltip content={<ChartTooltip suffix=" ta" />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} labelFormatter={shortDay} />
          {ReLegend && <ReLegend wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 4 }} iconType="circle" iconSize={8} />}
          <ReBar dataKey="premium" name="Premium" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <ReBar dataKey="free" name="Bepul" fill="#475569" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </ReBarChart>
      </RC>
    </div>
  );
};

// Haftalik diskvalifikatsiya/cheating holatlari (LineChart, rose).
const DqTrendChart = ({ data }) => {
  if (!RC) return null;
  return (
    <div className="h-[220px] w-full">
      <RC width="100%" height="100%">
        <ReLineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="week" tickFormatter={shortDay} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="DQ" />} cursor={{ stroke: 'rgba(244,63,94,0.3)' }} labelFormatter={shortDay} />
          <ReLine type="monotone" dataKey="count" name="DQ" stroke="#f43f5e" strokeWidth={2.5}
            dot={{ r: 3, fill: '#e11d48', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#fb7185', stroke: '#e11d48', strokeWidth: 2 }} />
        </ReLineChart>
      </RC>
    </div>
  );
};

// Top-5 markaz rating dinamikasi (ko'p chiziqli LineChart).
const TOP_CENTER_COLORS = ['#6366f1', '#34d399', '#f59e0b', '#a855f7', '#f43f5e'];
const TopCentersRatingChart = ({ series }) => {
  if (!RC) return null;
  // Har markaz {points:[{date,score}]} — barcha sanalarni birlashtirib, har
  // sana uchun {date, [center_id]: score} qatorlarini tuzamiz (recharts
  // ko'p chiziq uchun bitta umumiy data massivini kutadi).
  const dateSet = new Set();
  series.forEach(s => (s.points || []).forEach(p => dateSet.add(p.date)));
  const dates = [...dateSet].sort();
  const rows = dates.map(date => {
    const row = { date };
    series.forEach(s => {
      const pt = (s.points || []).find(p => p.date === date);
      if (pt) row[`c${s.center_id}`] = pt.score;
    });
    return row;
  });
  return (
    <div className="h-[240px] w-full">
      <RC width="100%" height="100%">
        <ReLineChart data={rows} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <ReGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <ReXAxis dataKey="date" tickFormatter={shortDay} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} minTickGap={20} />
          <ReYAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
          <ReTooltip content={<ChartTooltip suffix=" ball" />} cursor={{ stroke: 'rgba(148,163,184,0.2)' }} labelFormatter={shortDay} />
          {ReLegend && <ReLegend wrapperStyle={{ fontSize: 9, fontWeight: 700, paddingTop: 4 }} iconType="circle" iconSize={7} />}
          {series.map((s, i) => (
            <ReLine
              key={s.center_id}
              type="monotone"
              dataKey={`c${s.center_id}`}
              name={s.name && s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
              stroke={TOP_CENTER_COLORS[i % TOP_CENTER_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              activeDot={{ r: 4 }}
            />
          ))}
        </ReLineChart>
      </RC>
    </div>
  );
};


const AdminDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = adminDashUrl.usePageState();
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [blockModal, setBlockModal] = React.useState(null);
  const [blocking, setBlocking] = React.useState(false);
  const [blockedIds, setBlockedIds] = React.useState({});
  // Bloklash sababi (majburiy) va muddati (null = doimiy). Modal har ochilganda
  // tozalanadi — oldingi foydalanuvchining sababi qolib ketmasin.
  const [blockReason, setBlockReason] = React.useState('');
  const [blockDuration, setBlockDuration] = React.useState(null);
  // Ogohlantirish — bloklashdan OLDINGI qadam: hisob holati o'zgarmaydi,
  // foydalanuvchi faqat xabarnoma oladi. `warnReason` ichki izoh (audit
  // jurnaliga tushadi), `warnMessage` esa foydalanuvchi o'qiydigan matn.
  const [warnModal, setWarnModal] = React.useState(null);
  const [warnReason, setWarnReason] = React.useState('');
  const [warnMessage, setWarnMessage] = React.useState('');
  const [warnBusy, setWarnBusy] = React.useState(false);
  // Yakunlanayotgan seansning `login_event_id`si — faqat o'sha qatordagi
  // tugma bloklanadi (bitta umumiy bayroq butun ro'yxatni o'chirib qo'yardi).
  const [sessionLogoutId, setSessionLogoutId] = React.useState(null);
  // Markaz rad etish / premium bekor qilish — destruktiv/qaytarib
  // bo'lmaydigan amallar avval tasdiqlashsiz zudlik bilan bajarilardi.
  const [rejectCenterConfirm, setRejectCenterConfirm] = React.useState(null);
  const [revokePremiumConfirm, setRevokePremiumConfirm] = React.useState(null);
  const [centerActionBusy, setCenterActionBusy] = React.useState(false);
  const [premiumUser, setPremiumUser] = React.useState(null);
  const [roleModal, setRoleModal] = React.useState(null);
  const [roleSelection, setRoleSelection] = React.useState([]);
  const [roleSaving, setRoleSaving] = React.useState(false);
  const [premiumDuration, setPremiumDuration] = React.useState(30);
  const [premiumPlanType, setPremiumPlanType] = React.useState('student');
  const [premiumPlanName, setPremiumPlanName] = React.useState('Pro');
  const [premiumSaving, setPremiumSaving] = React.useState(false);
  // Hisobni qo'lda tiklash (support): telefon raqamini yo'qotgan va email
  // bog'lamagan foydalanuvchi uchun o'z-o'ziga xizmat yo'li yo'q.
  const [phoneModal, setPhoneModal] = React.useState(null);
  const [phoneInput, setPhoneInput] = React.useState('');
  const [phoneSaving, setPhoneSaving] = React.useState(false);
  const [resetPasswordConfirm, setResetPasswordConfirm] = React.useState(null);
  const [resetPasswordBusy, setResetPasswordBusy] = React.useState(false);
  // 2FA'ni majburan o'chirish (autentifikatorini yo'qotgan foydalanuvchi) va
  // bloklamasdan barcha seanslarni yakunlash — ikkalasi ham "Batafsil"
  // oynasidan, tasdiqlash bilan.
  const [resetTotpConfirm, setResetTotpConfirm] = React.useState(null);
  const [resetTotpBusy, setResetTotpBusy] = React.useState(false);
  const [forceLogoutConfirm, setForceLogoutConfirm] = React.useState(null);
  const [forceLogoutBusy, setForceLogoutBusy] = React.useState(false);
  // "Foydalanuvchi sifatida ko'rish" (support): eng nozik amal, shuning uchun
  // alohida tasdiqlash oynasi va faqat "Batafsil" oynasidan chaqiriladi.
  const [impersonateConfirm, setImpersonateConfirm] = React.useState(null);
  const [impersonateBusy, setImpersonateBusy] = React.useState(false);
  // Takrorlangan hisoblarni birlashtirish: SIM raqamini yo'qotib yangi raqam
  // bilan qayta ro'yxatdan o'tgan o'quvchida ikkita hisob qoladi. Oqim ikki
  // bosqichli — avval quruq yurish (`preview`, hech narsa o'zgarmaydi), keyin
  // manba raqamini qo'lda yozib tasdiqlash va `commit`.
  const [mergeModal, setMergeModal] = React.useState(null);
  const [mergeSearch, setMergeSearch] = React.useState('');
  const [mergeOtherId, setMergeOtherId] = React.useState(null);
  // "Batafsil" oynasidan ochilgan hisob SAQLANADIMI (maqsadli) yoki
  // birlashtiriladimi (manba). Standart — saqlanadi.
  const [mergeKeepOpened, setMergeKeepOpened] = React.useState(true);
  const [mergePreview, setMergePreview] = React.useState(null);
  const [mergeConfirmPhone, setMergeConfirmPhone] = React.useState('');
  const [mergeBusy, setMergeBusy] = React.useState(false);
  // Ommaviy amallar: jadvalda belgilangan qatorlar (row.id bo'yicha) va ochiq
  // ommaviy modal. Sabab/muddat maydonlari bitta foydalanuvchilik oqim bilan
  // BO'LISHILADI (`blockReason`/`blockDuration`) — bir vaqtda faqat bitta
  // modal ochiq bo'ladi va qoidalar ham bir xil.
  const [selectedUserIds, setSelectedUserIds] = React.useState([]);
  const [bulkBlockModal, setBulkBlockModal] = React.useState(null); // 'block' | 'unblock'
  const [bulkRoleModal, setBulkRoleModal] = React.useState(false);
  const [bulkRoleSelection, setBulkRoleSelection] = React.useState([]);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [csvBusy, setCsvBusy] = React.useState(false);
  // Yangi parol backenddan faqat BIR MARTA ochiq matnda keladi — uni hech
  // qayerda saqlamaymiz, modal yopilishi bilan state'dan ham o'chiriladi.
  const [newPasswordInfo, setNewPasswordInfo] = React.useState(null);
  // "Batafsil" oynasi — bitta foydalanuvchining to'liq ko'rinishi (jadval
  // qatori faqat qisqacha ma'lumot beradi).
  const [detailUser, setDetailUser] = React.useState(null);
  const [newSubjectName, setNewSubjectName] = React.useState('');
  // Amallar tarixi (audit jurnali) — server tomonda sahifalanadi, chunki
  // jurnal cheksiz o'sadi (boshqa admin ro'yxatlaridagidek hammasini bir
  // yo'la yuklab bo'lmaydi).
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditSearch, setAuditSearch] = React.useState('');
  // Topbar global qidiruv — foydalanuvchi/tashkilot/olimpiada nomi bo'yicha
  // joriy ko'rinayotgan jadvalga ta'sir qiladi (avval onChange yo'q edi).
  const [globalSearch, setGlobalSearch] = React.useState('');
  // Foydalanuvchilar sahifasi uchun alohida qidiruv input.
  const [userSearch, setUserSearch] = React.useState('');
  // Debounce: har bosishda emas, foydalanuvchi to'xtaganidan keyin filtr ishlaydi
  // (katta foydalanuvchilar jadvalini har harfda qayta filtrlamaslik uchun).
  const debouncedUserSearch = useDebounce(userSearch, 300);
  const debouncedGlobalSearch = useDebounce(globalSearch, 300);
  // Audit qidiruvi backendga ketadi (server tomon filtr) — har bosishda
  // so'rov yubormaslik uchun u ham debounce qilinadi.
  const debouncedAuditSearch = useDebounce(auditSearch, 300);
  // Xavfsizlik tabi: qaysi ichki bo'lim ochiq (SECURITY_SECTIONS kalitlari).
  const [securitySection, setSecuritySection] = React.useState(SECURITY_SECTIONS[0].key);
  // "Bir xil IP" bloki filtrlari — o'zgarsa ro'yxat qayta so'raladi.
  const [sharedIpMinAccounts, setSharedIpMinAccounts] = React.useState(5);
  const [sharedIpDays, setSharedIpDays] = React.useState(30);
  // "Ko'rish" bosilgan IP — shu manzil ortidagi hisoblar oynasi uchun.
  const [sharedIpDetailAddress, setSharedIpDetailAddress] = React.useState(null);
  // "Avtomatik bayroqlar" bloki: filtrlar + server tomon sahifa raqami.
  const [flagType, setFlagType] = React.useState('');
  const [flagStatus, setFlagStatus] = React.useState('pending');
  const [flagPage, setFlagPage] = React.useState(1);
  // Yopish oynasi: `{ flag, status }` — qaysi bayroq va qaysi qaror bilan.
  const [flagResolve, setFlagResolve] = React.useState(null);
  const [flagResolveNote, setFlagResolveNote] = React.useState('');
  const [flagResolveBusy, setFlagResolveBusy] = React.useState(false);
  // Savol bayrog'ini yopishdagi ixtiyoriy chora: savolni arxivlash. Har
  // oynada noldan boshlanadi — arxivlash tasodifan "yodda qolmasin".
  const [flagResolveArchive, setFlagResolveArchive] = React.useState(false);
  // "Firibgarlik holatlari" bloki: filtrlar + server tomon sahifa raqami.
  // Sana filtrlari `<input type="date">` dan YYYY-MM-DD ko'rinishida keladi —
  // backend ham aynan shu formatni kutadi.
  const [cheatingCenterId, setCheatingCenterId] = React.useState('');
  const [cheatingStatus, setCheatingStatus] = React.useState('');
  const [cheatingDateFrom, setCheatingDateFrom] = React.useState('');
  const [cheatingDateTo, setCheatingDateTo] = React.useState('');
  const [cheatingSearch, setCheatingSearch] = React.useState('');
  const [cheatingPage, setCheatingPage] = React.useState(1);
  // Qidiruv backendga ketadi — har bosishda so'rov yubormaslik uchun debounce
  // (audit jurnalidagi bilan bir xil).
  const debouncedCheatingSearch = useDebounce(cheatingSearch, 300);

  // Profile settings state
  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editUsername, setEditUsername] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);

  // Password settings state
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [savingPassword, setSavingPassword] = React.useState(false);

  React.useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || user.first_name || '');
      setEditLastName(user.lastName || user.last_name || '');
      setEditUsername(user.username || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      if (isApi) {
        const token = OlympyApi.getToken();
        const payload = {
          first_name: editFirstName,
          last_name: editLastName,
          username: editUsername
        };
        const updated = await OlympyApi.updateProfile(payload, token);
        showToast("Profil ma'lumotlari muvaffaqiyatli saqlandi!");
        if (updated) {
          const mapped = OlympyApi.mapBackendUser(updated);
          onUserUpdate?.(mapped);
        }
      } else {
        showToast("Profil ma'lumotlari yangilandi (Mock)!");
      }
    } catch (err) {
      const errMsg = OlympyApi.toUserMessage?.(err) || err?.detail || "Xatolik yuz berdi";
      showToast(`Xatolik: ${errMsg}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      showToast("Barcha parollarni kiriting!");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Yangi parollar bir-biriga mos kelmadi!");
      return;
    }
    if (newPassword.length < 8) {
      showToast("Parol kamida 8 belgi bo'lishi kerak!");
      return;
    }
    setSavingPassword(true);
    try {
      if (isApi) {
        const token = OlympyApi.getToken();
        await OlympyApi.changePassword({
          old_password: oldPassword,
          new_password: newPassword
        }, token);
        showToast("Parol muvaffaqiyatli o'zgartirildi!");
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showToast("Parol o'zgartirildi (Mock)!");
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      const errMsg = OlympyApi.toUserMessage?.(err) || err?.detail || "Xatolik yuz berdi";
      showToast(`Xatolik: ${errMsg}`);
    } finally {
      setSavingPassword(false);
    }
  };

  // Avval bitta string state + bitta setTimeout bilan yasalgan edi: ikkinchi
  // toast 3s ichida kelsa, birinchi toastning eski setTimeout'i uni
  // muddatidan oldin yashirib yuborardi. shared.jsx'dagi useToast() buni
  // stacked, id-based ro'yxat bilan hal qiladi — imzosi bir xil (showToast(msg))
  // bo'lgani uchun quyidagi 38 ta chaqiruv joyi o'zgarishsiz ishlayveradi.
  const { showToast, ToastHost } = useToast();

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getAdminCenters(null, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiNotificationsRes = useApiData(
    () => isApi ? OlympyApi.getNotifications(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiUsersRes = useApiData(
    () => isApi ? OlympyApi.getAdminUsers(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiSubjectsRes = useApiData(
    () => isApi ? OlympyApi.getSubjects(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Tahlil tabi uchun backend metrikalari (retention/conversion/premium).
  // Faqat platforma admini ko'ra oladi — 403 bo'lsa graceful fallback
  // (diagrammalar o'rniga "Ma'lumot yo'q") renderAnalytics ichida boshqariladi.
  const apiMetricsRes = useApiData(
    () => isApi ? OlympyApi.getAdminMetrics(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Tahlil tabi — kengaytirilgan diagrammalar uchun alohida backend
  // endpoint'lari. Har biri mustaqil fetch qiladi; faqat platforma admini
  // ko'radi (403 → graceful fallback renderAnalytics ichida). Bo'sh jadvalda
  // backend bo'sh massiv qaytaradi.
  const apiAttemptsTrendRes = useApiData(
    () => isApi ? OlympyApi.getAttemptsTrend(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadStatsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiadAnalytics(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiQuestionStatsRes = useApiData(
    () => isApi ? OlympyApi.getQuestionStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiRevenueTrendRes = useApiData(
    () => isApi ? OlympyApi.getRevenueTrend(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiCenterAnalyticsRes = useApiData(
    () => isApi ? OlympyApi.getCenterAnalytics(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Recharts kutubxonasi — faqat "Tahlil" tabi ochilganda lazy yuklanadi
  // (backend so'rovlari bilan bir xil mantiq: kerak bo'lmasa so'ralmaydi).
  const rechartsReady = useRecharts(page === 'analytics');
  // Amallar tarixi — faqat "logs" tabi ochilganda so'raladi (boshqa tablarda
  // keraksiz so'rov bo'lmasin). Sahifa/qidiruv o'zgarganda qayta yuklanadi.
  const apiAuditRes = useApiData(
    () => (isApi && page === 'logs')
      ? OlympyApi.getAdminAuditLog(
          { page: auditPage, pageSize: AUDIT_PAGE_SIZE, search: debouncedAuditSearch },
          OlympyApi.getToken(),
        )
      : Promise.resolve(null),
    [isApi, page, auditPage, debouncedAuditSearch],
  );
  // Bir xil IP'dan kirgan hisoblar — faqat "security" tabining shu bo'limi
  // ochilganda so'raladi (agregat so'rov arzon emas). Filtr o'zgarsa qayta
  // yuklanadi.
  const apiSharedIpRes = useApiData(
    () => (isApi && page === 'security' && securitySection === 'shared-ip')
      ? OlympyApi.getAdminSharedIpAccounts(
          { minAccounts: sharedIpMinAccounts, days: sharedIpDays },
          OlympyApi.getToken(),
        )
      : Promise.resolve(null),
    [isApi, page, securitySection, sharedIpMinAccounts, sharedIpDays],
  );
  // Tanlangan IP ortidagi hisoblar — oyna ochilgandagina so'raladi.
  const apiSharedIpDetailRes = useApiData(
    () => (isApi && sharedIpDetailAddress)
      ? OlympyApi.getAdminSharedIpDetail(sharedIpDetailAddress, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, sharedIpDetailAddress],
  );
  // Moderatsiya navbati — faqat "security" tabining shu bo'limi ochilganda.
  // Ro'yxat cheksiz o'sadi (soatlik detektor), shuning uchun audit
  // jurnalidagidek server tomon paginatsiya.
  const apiModerationRes = useApiData(
    () => (isApi && page === 'security' && securitySection === 'auto-flags')
      ? OlympyApi.getAdminModerationQueue(
          {
            flagType, status: flagStatus,
            page: flagPage, pageSize: MODERATION_PAGE_SIZE,
          },
          OlympyApi.getToken(),
        )
      : Promise.resolve(null),
    [isApi, page, securitySection, flagType, flagStatus, flagPage],
  );
  // Barcha markazlar bo'yicha firibgarlik holatlari — faqat "security"
  // tabining shu bo'limi ochilganda. Bu ham cheksiz o'sadigan ro'yxat, ya'ni
  // server tomon paginatsiya (filtr o'zgarsa birinchi sahifaga qaytamiz).
  const apiCheatingRes = useApiData(
    () => (isApi && page === 'security' && securitySection === 'cheating')
      ? OlympyApi.getAdminCheatingOverview(
          {
            centerId: cheatingCenterId, status: cheatingStatus,
            dateFrom: cheatingDateFrom, dateTo: cheatingDateTo,
            search: debouncedCheatingSearch,
            page: cheatingPage, pageSize: CHEATING_PAGE_SIZE,
          },
          OlympyApi.getToken(),
        )
      : Promise.resolve(null),
    [
      isApi, page, securitySection, cheatingCenterId, cheatingStatus,
      cheatingDateFrom, cheatingDateTo, debouncedCheatingSearch, cheatingPage,
    ],
  );
  // "Batafsil" oynasi ochilganda o'sha foydalanuvchining to'liq profili.
  const detailBackendId = detailUser?.backendId
    ?? (typeof detailUser?.id === 'string' && detailUser.id.startsWith('api:') ? Number(detailUser.id.slice(4)) : null);
  const apiUserDetailRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserDetail(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );
  // To'lovlar va kirish tarixi — profildan alohida so'rovlar, faqat oyna
  // ochilganda ketadi (foydalanuvchilar jadvalini yuklashda emas). Profil
  // ularni kutmaydi: har biri o'z yuklanish/xato holatini ko'rsatadi.
  const apiUserBillingRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserBillingHistory(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );
  const apiUserLoginsRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserLoginHistory(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );
  // Yuborilgan ogohlantirishlar — bloklash qarorini qabul qilishdan oldin
  // admin bu hisob avval necha marta ogohlantirilganini ko'radi.
  const apiUserWarningsRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserWarnings(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );
  // Faol seanslar — kirish tarixidan farqli o'laroq HOZIRGI holat: qaysi
  // qurilma hali hisobga kira oladi va uni alohida yakunlash mumkin.
  const apiUserSessionsRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserSessions(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );

  // "Hozir onlayn" sanog'i — Boshqaruv panelidagi karta uchun. `useApiData`
  // ishlatilmaydi: unda poll yo'q, bu ko'rsatkich esa doim yangi bo'lishi
  // kerak. ManagerDashboard'dagi bilan bir xil naqsh — interval faqat tab
  // ko'rinib turganda ishlaydi (fon tabda batareya/trafik sarflamaslik uchun)
  // va unmount'da tozalanadi. null = "ma'lumot yo'q" (403, tarmoq xatosi yoki
  // backendda Redis sozlanmagan) — karta "—" ko'rsatadi.
  const [onlineCount, setOnlineCount] = React.useState(null);
  React.useEffect(() => {
    if (!isApi) return undefined;
    let cancelled = false;
    const refresh = () => {
      OlympyApi.getOnlineCount(OlympyApi.getToken())
        .then(res => {
          if (!cancelled) {
            setOnlineCount(typeof res?.online_count === 'number' ? res.online_count : null);
          }
        })
        .catch(err => {
          if (!cancelled) {
            console.warn('getOnlineCount failed:', err);
            setOnlineCount(null);
          }
        });
    };
    refresh();
    const intervalId = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refresh();
      }
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isApi]);

  // "Hozir onlayn" kartasi bosilganda ochiladigan ro'yxat: barcha
  // foydalanuvchilar onlayn/oflayn belgisi bilan. So'rov FAQAT oyna ochilganda
  // ketadi — ro'yxat to'liq (bir necha sahifa) va kartadagi 15 soniyalik
  // pollingdan ancha og'ir.
  const [onlineListOpen, setOnlineListOpen] = React.useState(false);
  const apiOnlineUsersRes = useApiData(
    () => (isApi && onlineListOpen)
      ? OlympyApi.getOnlineUsers(OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, onlineListOpen],
  );

  const apiCenters = isApi && Array.isArray(apiCentersRes.data)
    ? apiCentersRes.data.map(mapApiCenter)
    : null;
  const rawCenters = apiCenters || store.centers;
  const centers = rawCenters.filter(c => c.status !== 'rejected');
  const approvedCenters = centers.filter(c => c.status === 'approved');
  const pendingCenters = centers.filter(c => c.status === 'pending');
  // getAdminUsers backend sahifalarini yig'ib {results, count} qaytaradi —
  // allUsers global statistika/qidiruv uchun TO'LIQ ro'yxatga tayanadi.
  const apiUsersList = isApi && apiUsersRes.data && Array.isArray(apiUsersRes.data.results)
    ? apiUsersRes.data.results
    : (isApi && Array.isArray(apiUsersRes.data) ? apiUsersRes.data : null);
  const apiAllUsers = apiUsersList
    ? apiUsersList.map(OlympyApi.mapBackendUser)
    : null;
  // Platform adminlar statistika va ro'yxatlarda hisoblanmasin. Backend
  // admin_users_list ularni allaqachon chiqarib tashlaydi; bu zaxira filtr
  // mock/store fallback uchun ham adminlarni statistikadan ajratib turadi.
  const allUsers = (apiAllUsers || store.users).filter(u => !u.isPlatformAdmin);
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data)
    ? apiOlympiadsRes.data.map(mapApiOlympiad)
    : null;
  const subjects = isApi
    ? (Array.isArray(apiSubjectsRes.data) ? apiSubjectsRes.data : [])
    : store.subjects;

  const notifications = isApi && Array.isArray(apiNotificationsRes.data)
    ? apiNotificationsRes.data.map(mapApiNotification)
    : notificationsForUser(store, user?.id);

  const pendingCenterReqs = isApi
    ? pendingCenters.map(c => ({
        id: `api:center:${c.id}`,
        type: 'center',
        userId: c.ownerId,
        centerId: c.id,
        status: 'pending',
        _apiCenter: c,
      }))
    : store.requests.filter(r => r.type === 'center' && r.status === 'pending');

  const donutTotal = Math.max(rawCenters.length, 1);
  const approvedCenterPct = Math.round((approvedCenters.length / donutTotal) * 100);
  const pendingCenterPct = Math.round((pendingCenters.length / donutTotal) * 100);
  const otherCenterPct = Math.max(0, 100 - approvedCenterPct - pendingCenterPct);

  const resolveCenterFromRequest = (req) =>
    req?._apiCenter || centers.find(c => String(c.id) === String(req.centerId)) || null;

  const getOwnerInfo = (center, req) => {
    const owner = center?.ownerId ? allUsers.find(u => String(u.id) === String(center.ownerId)) : null;
    const requestUser = req?.userId ? allUsers.find(u => String(u.id) === String(req.userId)) : null;
    return {
      name: center?.ownerName || owner?.name || requestUser?.name || 'Direktor',
      phone: center?.ownerPhone || owner?.phone || requestUser?.phone || '',
    };
  };

  const reloadAdminData = () => {
    apiCentersRes.reload();
    apiNotificationsRes.reload();
  };

  const approveCenterDirect = (center) => {
    if (isApi) {
      const backendCenterId = center?.backendId;
      if (!backendCenterId) { showToast('Tashkilot ID topilmadi'); return; }
      OlympyApi.adminApproveCenter(backendCenterId, OlympyApi.getToken())
        .then(() => { showToast('Tashkilot public ro\'yxatga qo\'shildi'); reloadAdminData(); })
        .catch(err => { console.warn('adminApproveCenter failed:', err); showToast('Tasdiqlab bo\'lmadi'); });
      return;
    }
    const req = store.requests.find(r => r.type === 'center' && r.centerId === center.id && r.status === 'pending');
    if (req) OlympyStore.approveRequest(req.id);
    else OlympyStore.updateCenter(center.id, { status: 'approved' });
    showToast('Tashkilot public ro\'yxatga qo\'shildi');
  };

  const rejectCenterDirect = (center) => {
    if (isApi) {
      const backendCenterId = center?.backendId;
      if (!backendCenterId) { showToast('Tashkilot ID topilmadi'); return; }
      return OlympyApi.adminRejectCenter(backendCenterId, OlympyApi.getToken())
        .then(() => { showToast('Tashkilot rad etildi va ro\'yxatlardan olib tashlandi'); reloadAdminData(); })
        .catch(err => { console.warn('adminRejectCenter failed:', err); showToast('Rad etib bo\'lmadi'); });
      return;
    }
    const req = store.requests.find(r => r.type === 'center' && r.centerId === center.id && r.status === 'pending');
    if (req) OlympyStore.rejectRequest(req.id);
    else OlympyStore.updateCenter(center.id, { status: 'rejected' });
    showToast('Tashkilot rad etildi va ro\'yxatlardan olib tashlandi');
  };

  const togglePremium = (center) => {
    if (!isApi) {
      showToast('Premium faqat API rejimida boshqariladi');
      return;
    }
    const backendCenterId = center?.backendId;
    if (!backendCenterId) { showToast('Tashkilot ID topilmadi'); return; }
    const next = !center.isPremium;
    // Optimistic: ro'yxat darhol yangilanadi (xom backend data'da is_premium),
    // xato bo'lsa avvalgi holatga qaytaramiz.
    apiCentersRes.mutate(prev => Array.isArray(prev)
      ? prev.map(c => (c?.id === backendCenterId ? { ...c, is_premium: next } : c))
      : prev);
    return OlympyApi.updateCenter(backendCenterId, { is_premium: next }, OlympyApi.getToken())
      .then(() => {
        showToast(next ? 'Premium berildi' : 'Premium bekor qilindi');
        apiCentersRes.reload();
      })
      .catch(err => {
        console.warn('togglePremium failed:', err);
        apiCentersRes.mutate(prev => Array.isArray(prev)
          ? prev.map(c => (c?.id === backendCenterId ? { ...c, is_premium: center.isPremium } : c))
          : prev);
        showToast(OlympyApi.toUserMessage(err));
      });
  };

  const approveCenterReq = (req) => {
    const center = resolveCenterFromRequest(req);
    if (center) approveCenterDirect(center);
  };

  const rejectCenterReq = (req) => {
    const center = resolveCenterFromRequest(req);
    if (center) rejectCenterDirect(center);
  };

  // Bloklash modali har safar toza ochiladi: sabab bo'sh, muddat "Doimiy".
  const openBlockModal = (row) => {
    setBlockReason('');
    setBlockDuration(null);
    setBlockModal(row);
  };

  const toggleBlock = (row) => {
    if (blocking) return;
    const nextActive = row.status === 'Bloklangan';
    // Sabab faqat bloklashda kerak (backend ham bo'shini rad etadi) —
    // blokni ochishda hech narsa so'ralmaydi.
    const reason = blockReason.trim();
    if (!nextActive && !reason) { showToast('Bloklash sababini kiriting'); return; }
    if (isApi) {
      const numericUserId = row?.backendId ?? (typeof row?.id === 'string' && row.id.startsWith('api:') ? Number(row.id.slice(4)) : null);
      if (!numericUserId) { showToast("Backend ID topilmadi"); setBlockModal(null); return; }
      setBlocking(true);
      OlympyApi.adminSetUserActive(
        numericUserId,
        nextActive,
        { reason, durationDays: blockDuration },
        OlympyApi.getToken(),
      )
        .then(() => { showToast('Foydalanuvchi holati yangilandi'); apiUsersRes.reload(); })
        .catch(err => { console.warn('adminSetUserActive failed:', err); showToast(OlympyApi.toUserMessage(err)); })
        .finally(() => { setBlocking(false); setBlockModal(null); });
      return;
    }
    setBlockedIds(prev => ({ ...prev, [row.id]: !prev[row.id] }));
    setBlockModal(null);
    showToast('Foydalanuvchi holati yangilandi');
  };

  // Ogohlantirish modali ham har safar toza ochiladi (oldingi foydalanuvchining
  // matni qolib ketmasin).
  const openWarnModal = (row) => {
    setWarnReason('');
    setWarnMessage('');
    setWarnModal(row);
  };

  const sendWarning = () => {
    if (!warnModal || warnBusy) return;
    if (!isApi) { showToast('Ogohlantirish faqat API rejimida yuboriladi'); return; }
    const numericUserId = warnModal?.backendId ?? (typeof warnModal?.id === 'string' && warnModal.id.startsWith('api:') ? Number(warnModal.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); setWarnModal(null); return; }
    // Backend ikkalasini ham majburiy deb biladi — bo'shini u yerga
    // yubormasdan shu yerda to'xtatamiz.
    const reason = warnReason.trim();
    const message = warnMessage.trim();
    if (!reason) { showToast('Ogohlantirish sababini kiriting'); return; }
    if (!message) { showToast('Foydalanuvchiga yuboriladigan matnni kiriting'); return; }

    setWarnBusy(true);
    OlympyApi.adminWarnUser(numericUserId, { reason, message }, OlympyApi.getToken())
      .then(() => {
        showToast('Ogohlantirish yuborildi');
        setWarnModal(null);
        // "Batafsil" oynasi ochiq bo'lsa, tarix bloki darhol yangilansin.
        apiUserWarningsRes.reload();
      })
      .catch(err => {
        console.warn('adminWarnUser failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setWarnBusy(false));
  };

  // Bitta seansni yakunlash. "Barcha seanslarni yakunlash" dan farqli
  // o'laroq tasdiqlash modali yo'q: amal tor (faqat shu qurilma), qaytarib
  // bo'lmaydigan zarari yo'q va foydalanuvchi qayta kira oladi.
  const endUserSession = (loginEventId) => {
    if (!isApi || sessionLogoutId) return;
    if (!detailBackendId) { showToast('Backend ID topilmadi'); return; }
    setSessionLogoutId(loginEventId);
    OlympyApi.adminForceLogoutSession(detailBackendId, loginEventId, OlympyApi.getToken())
      .then(() => {
        showToast('Seans yakunlandi');
        apiUserSessionsRes.reload();
      })
      .catch(err => {
        console.warn('adminForceLogoutSession failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setSessionLogoutId(null));
  };

  // Sabab + muddat maydonlari. Bitta foydalanuvchilik va ommaviy bloklash
  // modallari AYNAN shu bloklardan foydalanadi — qoidalar (majburiy sabab,
  // qat'iy muddat variantlari) ikkalasida bir xil bo'lishi kerak.
  const blockReasonFields = (
    <div className="mb-5 space-y-4">
      <div>
        <label className="block text-xs text-white/50 mb-1.5 font-medium">Bloklash sababi</label>
        <input
          value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          maxLength={255}
          className="w-full admin-input px-3 py-2.5 text-sm outline-none"
          placeholder="Masalan: imtihonda qoidabuzarlik"
        />
      </div>
      <div>
        <label className="block text-xs text-white/50 mb-1.5 font-medium">Muddat</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 1, label: '1 kun' },
            { value: 7, label: '7 kun' },
            { value: 14, label: '14 kun' },
            { value: 30, label: '30 kun' },
            { value: null, label: 'Doimiy' },
          ].map(opt => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setBlockDuration(opt.value)}
              className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                blockDuration === opt.value
                  ? opt.value === null
                    ? 'bg-rose-600 text-white border-rose-600 font-extrabold shadow'
                    : 'bg-amber-500 text-indigo-950 border-amber-500 font-extrabold shadow'
                  : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
          Muddat tanlansa, blok o'sha kunlar o'tgach avtomatik ochiladi. "Doimiy" —
          admin qo'lda ochmaguncha bloklangan qoladi.
        </p>
      </div>
    </div>
  );

  const openPremiumModal = (row) => {
    setPremiumUser(row);
    setPremiumDuration(30);
    setPremiumPlanType(row.role?.toLowerCase()?.includes('o\'quvchi') || row.role?.toLowerCase()?.includes('student') ? 'student' : 'organization');
    setPremiumPlanName(row.planName || 'Pro');
  };

  const handleSavePremium = () => {
    if (!premiumUser) return;
    if (!isApi) {
      showToast('Premium faqat API rejimida boshqariladi');
      return;
    }
    const numericUserId = premiumUser?.backendId ?? (typeof premiumUser?.id === 'string' && premiumUser.id.startsWith('api:') ? Number(premiumUser.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); return; }

    setPremiumSaving(true);
    OlympyApi.adminToggleUserPremium(numericUserId, {
      duration: premiumDuration,
      plan_type: premiumPlanType,
      plan_name: premiumPlanName
    }, OlympyApi.getToken())
      .then(() => {
        showToast('Premium holati yangilandi');
        setPremiumUser(null);
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminToggleUserPremium failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setPremiumSaving(false));
  };

  // Rol modali: foydalanuvchining joriy rollarini (admin = platform admin
  // flag'i) checkboxlar uchun boshlang'ich tanlovga aylantiramiz.
  const openRoleModal = (row) => {
    const selected = (row.roleKeys || []).filter(r => ROLE_MODAL_KEYS.some(k => k.value === r));
    if (row.isPlatformAdmin && !selected.includes('admin')) selected.push('admin');
    setRoleSelection(selected);
    setRoleModal(row);
  };

  const toggleRoleCheckbox = (value) => {
    setRoleSelection(prev => prev.includes(value)
      ? prev.filter(r => r !== value)
      : [...prev, value]);
  };

  const handleSaveRoles = () => {
    if (!roleModal) return;
    if (!isApi) { showToast('Rollar faqat API rejimida boshqariladi'); return; }
    const numericUserId = roleModal?.backendId ?? (typeof roleModal?.id === 'string' && roleModal.id.startsWith('api:') ? Number(roleModal.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); return; }

    // `admin` checkboxi User.roles ga emas, is_platform_admin flag'iga ketadi.
    const isPlatformAdmin = roleSelection.includes('admin');
    const roles = roleSelection.filter(r => r !== 'admin');

    setRoleSaving(true);
    OlympyApi.adminSetUserRoles(numericUserId, { roles, isPlatformAdmin }, OlympyApi.getToken())
      .then(() => {
        showToast('Rollar yangilandi');
        setRoleModal(null);
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminSetUserRoles failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setRoleSaving(false));
  };

  const openPhoneModal = (row) => {
    setPhoneInput('');
    setPhoneModal(row);
  };

  const handleSavePhone = () => {
    if (!phoneModal) return;
    if (!isApi) { showToast('Telefon raqam faqat API rejimida o\'zgartiriladi'); return; }
    const numericUserId = phoneModal?.backendId ?? (typeof phoneModal?.id === 'string' && phoneModal.id.startsWith('api:') ? Number(phoneModal.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); return; }
    const phone = phoneInput.trim();
    if (!phone) { showToast('Yangi telefon raqamni kiriting'); return; }

    setPhoneSaving(true);
    OlympyApi.adminChangeUserPhone(numericUserId, phone, OlympyApi.getToken())
      .then(() => {
        showToast('Telefon raqam yangilandi');
        setPhoneModal(null);
        setPhoneInput('');
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminChangeUserPhone failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setPhoneSaving(false));
  };

  const handleResetPassword = () => {
    if (!resetPasswordConfirm) return;
    if (!isApi) { showToast('Parol faqat API rejimida tiklanadi'); return; }
    const row = resetPasswordConfirm;
    const numericUserId = row?.backendId ?? (typeof row?.id === 'string' && row.id.startsWith('api:') ? Number(row.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); setResetPasswordConfirm(null); return; }

    setResetPasswordBusy(true);
    OlympyApi.adminResetUserPassword(numericUserId, OlympyApi.getToken())
      .then(res => {
        // Parol faqat shu javobda keladi — darhol ko'rsatamiz (loglamaymiz).
        setNewPasswordInfo({ name: row.name, password: res?.new_password || '' });
        setResetPasswordConfirm(null);
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminResetUserPassword failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setResetPasswordBusy(false));
  };

  const handleResetTotp = () => {
    if (!resetTotpConfirm) return;
    if (!isApi) { showToast("2FA faqat API rejimida o'chiriladi"); return; }
    const numericUserId = resetTotpConfirm.backendId;
    if (!numericUserId) { showToast('Backend ID topilmadi'); setResetTotpConfirm(null); return; }

    setResetTotpBusy(true);
    OlympyApi.adminResetUserTotp(numericUserId, OlympyApi.getToken())
      .then(() => {
        showToast("2FA o'chirildi — foydalanuvchi kodsiz kira oladi");
        setResetTotpConfirm(null);
        // "Batafsil" oynasidagi 2FA tugmasi darhol yo'qolishi uchun profilni
        // qayta o'qiymiz (ro'yxatda bu holat ko'rsatilmaydi).
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminResetUserTotp failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setResetTotpBusy(false));
  };

  const handleForceLogout = () => {
    if (!forceLogoutConfirm) return;
    if (!isApi) { showToast('Seanslar faqat API rejimida yakunlanadi'); return; }
    const numericUserId = forceLogoutConfirm.backendId;
    if (!numericUserId) { showToast('Backend ID topilmadi'); setForceLogoutConfirm(null); return; }

    setForceLogoutBusy(true);
    OlympyApi.adminForceLogoutUser(numericUserId, OlympyApi.getToken())
      .then(() => {
        showToast('Barcha seanslar yakunlandi');
        setForceLogoutConfirm(null);
      })
      .catch(err => {
        console.warn('adminForceLogoutUser failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setForceLogoutBusy(false));
  };

  const handleImpersonate = () => {
    if (!impersonateConfirm) return;
    if (!isApi) { showToast("Bu rejim faqat API rejimida ishlaydi"); return; }
    const numericUserId = impersonateConfirm.backendId;
    if (!numericUserId) { showToast('Backend ID topilmadi'); setImpersonateConfirm(null); return; }

    setImpersonateBusy(true);
    OlympyApi.startImpersonation(numericUserId)
      .then(() => {
        // To'liq qayta yuklash ATAYIN: admin panelida yig'ilgan holat
        // (foydalanuvchilar ro'yxati, ochiq modallar) impersonatsiya seansiga
        // o'tib ketmasin. Bosh sahifa foydalanuvchining o'z rolidagi
        // dashboardga olib boradi (app.jsx roleHomePage).
        window.location.assign('/');
      })
      .catch(err => {
        console.warn('startImpersonation failed:', err);
        showToast(OlympyApi.toUserMessage(err));
        setImpersonateBusy(false);
        setImpersonateConfirm(null);
      });
  };

  const userRows = allUsers.map(u => {
    const approved = getApprovedRoles(u);
    // Avval foydalanuvchi tasdiqlanmagan rollarda bo'lsa, fallback "student"
    // qaytarib jadvalda noto'g'ri "O'quvchi" deb ko'rsatardi. Endi tasdiqlangan
    // rol bo'lmasa boshqa har qanday mavjud rol-ni, u ham bo'lmasa "—" qiyofa
    // ko'rsatamiz.
    const roleKeys = Object.keys(u.roles || {});
    const anyRole = roleKeys[0];
    const primary = (u.activeRole && approved.includes(u.activeRole))
      ? u.activeRole
      : (approved[0] || anyRole || null);
    const roleLabel = primary ? (ROLE_META[primary]?.label || primary) : '—';
    const centerId = primary ? u.roles?.[primary]?.centerId : null;
    const center = centerId ? centers.find(c => String(c.id) === String(centerId)) : null;
    const apiBlocked = isApi ? (u.isActive === false) : false;
    return {
      id: u.id,
      backendId: u.backendId,
      name: u.name,
      phone: u.phone,
      avatarUrl: u.avatarUrl || '',
      role: roleLabel,
      center: center?.name || (primary ? u.roles?.[primary]?.centerName : '') || '—',
      joined: u.joined,
      status: (isApi ? apiBlocked : !!blockedIds[u.id]) ? 'Bloklangan' : 'Faol',
      isPremium: !!(u.isPremium ?? u.is_premium),
      planName: u.currentPlanName || null,
      isStudent: approved.includes('student') || primary === 'student',
      // Rol o'zgartirish modali uchun: foydalanuvchidagi xom rol kalitlari va
      // platform admin flag'i (checkboxlarni joriy holat bo'yicha belgilaymiz).
      roleKeys,
      // O'qituvchi/manager hisobiga shaxsiy premium ta'sir qilmaydi — ularning
      // premium funksiyalari markazning obunasidan keladi (backend ham bunday
      // grantni 400 bilan rad etadi). Direktor (owner) bundan mustasno: unga
      // berilgan premium markazga ham tarqaladi.
      orgBoundPremium: roleKeys.some(r => r === 'teacher' || r === 'manager')
        && !roleKeys.some(r => r === 'student' || r === 'owner'),
      isPlatformAdmin: !!(u.isPlatformAdmin ?? u.is_platform_admin),
    };
  });

  // Jadval filtri. Avval bu hisob-kitob jadval ichidagi IIFE'da edi — endi
  // ommaviy amallar paneli, "hammasini tanlash" va CSV eksporti ham AYNAN shu
  // to'plamga tayanadi (ko'rinmayotgan qator amalga tushib qolmasin).
  const userTableSearch = (debouncedUserSearch || debouncedGlobalSearch || '').trim();
  const userTableQuery = userTableSearch.toLowerCase();
  const visibleUserRows = userTableQuery
    ? userRows.filter(row =>
        (row.name || '').toLowerCase().includes(userTableQuery) ||
        (row.phone || '').toLowerCase().includes(userTableQuery) ||
        (row.role || '').toLowerCase().includes(userTableQuery) ||
        (row.center || '').toLowerCase().includes(userTableQuery))
    : userRows;

  // Qidiruv o'zgarsa tanlov tozalanadi: aks holda filtrdan chiqib ketgan
  // (ekranda ko'rinmaydigan) foydalanuvchi ommaviy amalga bilinmay tushardi.
  React.useEffect(() => {
    setSelectedUserIds(prev => (prev.length ? [] : prev));
  }, [userTableQuery]);

  const selectedUserRows = visibleUserRows.filter(row => selectedUserIds.includes(row.id));
  const allVisibleSelected = visibleUserRows.length > 0
    && visibleUserRows.every(row => selectedUserIds.includes(row.id));

  const toggleUserSelected = (rowId) => setSelectedUserIds(prev => prev.includes(rowId)
    ? prev.filter(id => id !== rowId)
    : [...prev, rowId]);

  const toggleSelectAllVisible = () => setSelectedUserIds(
    allVisibleSelected ? [] : visibleUserRows.map(row => row.id),
  );

  // Ommaviy so'rovlar backend (numeric) id bilan ishlaydi — jadval qatorining
  // id'si esa API rejimida `api:<id>` ko'rinishida keladi.
  const selectedBackendIds = selectedUserRows
    .map(row => row.backendId
      ?? (typeof row.id === 'string' && row.id.startsWith('api:') ? Number(row.id.slice(4)) : null))
    .filter(Boolean);

  // Ommaviy endpointlar QISMAN muvaffaqiyat qaytaradi:
  // { succeeded: [...], failed: [{ id, reason }] }. Admin nima o'tkazib
  // yuborilganini (admin hisobi, o'chirilgan foydalanuvchi) ko'rishi kerak.
  const showBulkResult = (res, successText) => {
    const ok = (res?.succeeded || []).length;
    const failed = res?.failed || [];
    const base = `${ok} ta foydalanuvchi ${successText}`;
    showToast(failed.length
      ? `${base}. ${failed.length} tasi o'tkazib yuborildi (${failed[0]?.reason || 'xatolik'})`
      : base);
  };

  // Ommaviy modallar ham har safar toza ochiladi (oldingi sabab qolib ketmasin).
  const openBulkBlockModal = (mode) => {
    setBlockReason('');
    setBlockDuration(null);
    setBulkBlockModal(mode);
  };

  const openBulkRoleModal = () => {
    setBulkRoleSelection([]);
    setBulkRoleModal(true);
  };

  const runBulkSetActive = () => {
    if (bulkBusy) return;
    const nextActive = bulkBlockModal === 'unblock';
    // Sabab faqat bloklashda kerak — bitta foydalanuvchilik oqim bilan bir xil
    // qoida (backend ham bo'shini rad etadi).
    const reason = blockReason.trim();
    if (!nextActive && !reason) { showToast('Bloklash sababini kiriting'); return; }
    if (!isApi) { showToast('Ommaviy amallar faqat API rejimida ishlaydi'); return; }
    if (!selectedBackendIds.length) { showToast('Backend ID topilmadi'); return; }
    setBulkBusy(true);
    OlympyApi.adminBulkSetUserActive(
      selectedBackendIds,
      nextActive,
      { reason, durationDays: blockDuration },
      OlympyApi.getToken(),
    )
      .then(res => {
        showBulkResult(res, nextActive ? 'blokdan chiqarildi' : 'bloklandi');
        setSelectedUserIds([]);
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminBulkSetUserActive failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => { setBulkBusy(false); setBulkBlockModal(null); });
  };

  const runBulkSetRoles = () => {
    if (bulkBusy) return;
    if (!isApi) { showToast('Ommaviy amallar faqat API rejimida ishlaydi'); return; }
    if (!selectedBackendIds.length) { showToast('Backend ID topilmadi'); return; }
    setBulkBusy(true);
    // Platform admin huquqi ATAYLAB yo'q: backend ham uni ommaviy amalda qabul
    // qilmaydi, u bitta foydalanuvchilik rol modalida qoladi.
    OlympyApi.adminBulkSetUserRoles(selectedBackendIds, bulkRoleSelection, OlympyApi.getToken())
      .then(res => {
        showBulkResult(res, 'roli yangilandi');
        setSelectedUserIds([]);
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminBulkSetUserRoles failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => { setBulkBusy(false); setBulkRoleModal(false); });
  };

  // CSV eksporti: backend AYNAN shu qidiruv matnini `admin_users_list` bilan
  // bir xil filtr sifatida qo'llaydi (ism/telefon), ya'ni admin ekranda ko'rgan
  // to'plam yuklab olinadi. 5000 qatordan ko'pi kesiladi — bunda ogohlantirish.
  const handleExportUsersCsv = () => {
    if (csvBusy) return;
    if (!isApi) { showToast('Eksport faqat API rejimida ishlaydi'); return; }
    setCsvBusy(true);
    OlympyApi.downloadAdminUsersCsv(userTableSearch, OlympyApi.getToken())
      .then(({ truncated }) => showToast(truncated
        ? "CSV yuklandi — faqat birinchi 5000 qator. Qidiruv bilan toraytiring."
        : 'CSV yuklab olindi'))
      .catch(err => {
        console.warn('downloadAdminUsersCsv failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setCsvBusy(false));
  };

  // ─── Takrorlangan hisoblarni birlashtirish ───────────────────────────────
  // Ikkinchi hisob qidiruvi to'liq yuklangan `userRows` ustidan (jadval bilan
  // BIR XIL manba) — alohida endpoint kerak emas. Ochilgan hisobning o'zi va
  // adminlar ro'yxatdan chiqariladi; ko'p natija chiqib ketmasligi uchun 6 ta.
  const debouncedMergeSearch = useDebounce(mergeSearch, 300);
  const mergeCandidates = (() => {
    if (!mergeModal) return [];
    const q = debouncedMergeSearch.trim().toLowerCase();
    if (!q) return [];
    return userRows
      .filter(row => row.backendId && row.backendId !== mergeModal.backendId && !row.isPlatformAdmin)
      .filter(row => (row.name || '').toLowerCase().includes(q)
        || (row.phone || '').toLowerCase().includes(q))
      .slice(0, 6);
  })();
  const mergeOther = mergeOtherId
    ? userRows.find(row => row.backendId === mergeOtherId) || null
    : null;
  // Yo'nalish: "saqlanadigan" hisob — maqsadli, ikkinchisi — manba (bloklanadi).
  const mergeSourceId = mergeModal
    ? (mergeKeepOpened ? mergeOtherId : mergeModal.backendId)
    : null;
  const mergeTargetId = mergeModal
    ? (mergeKeepOpened ? mergeModal.backendId : mergeOtherId)
    : null;
  // Tasdiqlash: manba raqamini AYNAN yozish talab qilinadi (amal
  // qaytarilmaydigandek his qilinadi). Preview javobidagi normalizatsiya
  // qilingan raqam bilan solishtiramiz, bo'shliqlarni tashlab.
  const mergeConfirmOk = !!mergePreview?.can_merge
    && !!mergePreview?.source?.phone
    && mergeConfirmPhone.replace(/\s/g, '') === mergePreview.source.phone;

  const openMergeModal = (row) => {
    setMergeModal(row);
    setMergeSearch('');
    setMergeOtherId(null);
    setMergeKeepOpened(true);
    setMergePreview(null);
    setMergeConfirmPhone('');
  };

  // Ikkinchi hisob yoki yo'nalish o'zgarsa quruq yurish natijasi eskiradi —
  // tasdiqlash ham nolga qaytadi (eski preview bilan commit ketib qolmasin).
  const resetMergePreview = () => {
    setMergePreview(null);
    setMergeConfirmPhone('');
  };

  const runMergePreview = () => {
    if (mergeBusy || !mergeSourceId || !mergeTargetId) return;
    if (!isApi) { showToast('Birlashtirish faqat API rejimida ishlaydi'); return; }
    setMergeBusy(true);
    OlympyApi.adminMergeUsersPreview(mergeSourceId, mergeTargetId, OlympyApi.getToken())
      .then(res => { setMergePreview(res); setMergeConfirmPhone(''); })
      .catch(err => {
        console.warn('adminMergeUsersPreview failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setMergeBusy(false));
  };

  const runMergeCommit = () => {
    if (mergeBusy || !mergeConfirmOk || !mergeSourceId || !mergeTargetId) return;
    setMergeBusy(true);
    OlympyApi.adminMergeUsersCommit(mergeSourceId, mergeTargetId, OlympyApi.getToken())
      .then(res => {
        const moved = Object.values(res?.moved || {}).reduce((a, b) => a + b, 0);
        showToast(`Hisoblar birlashtirildi — ${moved} ta yozuv va ${res?.coins_moved || 0} tanga ko'chirildi`);
        setMergeModal(null);
        setMergePreview(null);
        setMergeConfirmPhone('');
        // Manba bloklandi, maqsadli hisobning balansi o'zgardi — ikkalasi ham
        // ro'yxatda va ochiq "Batafsil" oynasida yangilanishi kerak.
        apiUsersRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminMergeUsersCommit failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setMergeBusy(false));
  };

  // Foydalanuvchi o'sishi: oxirgi 6 oy bo'yicha ro'yxatdan o'tganlar soni.
  // Avval bu chart hardcoded [38, 55, 64, 77, 90, 100] qiymatlarni ko'rsatardi.
  const userGrowthChart = (() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('uz-UZ', { month: 'short' }),
        count: 0,
      });
    }
    allUsers.forEach(u => {
      const joined = (u.joined || '').slice(0, 7);
      const bucket = months.find(m => m.key === joined);
      if (bucket) bucket.count += 1;
    });
    return {
      values: months.map(m => m.count),
      labels: months.map(m => m.label),
    };
  })();

  const recentActivity = [
    ...pendingCenterReqs.map(req => {
      const center = resolveCenterFromRequest(req);
      const owner = getOwnerInfo(center, req);
      return {
        id: `pending:${req.id}`,
        title: 'Yangi direktor arizasi',
        message: `${owner.name} · ${center?.name || 'Tashkilot'} · ${center?.organizationType || "O'quv markaz"} · ${formatCenterLocation(center)}`,
        time: formatAdminDate(center?.createdAt),
        tone: 'amber',
      };
    }),
    ...notifications.map(n => ({
      id: `n:${n.id}`,
      title: n.title,
      message: n.message,
      time: formatAdminDate(n.createdAt),
      tone: n.type?.includes('rejected') ? 'rose' : n.type?.includes('approved') ? 'emerald' : 'indigo',
    })),
  ].slice(0, 5);

  // Avval sidebar shablon admin paneldan ko'chirilgan va Products / Orders /
  // Inventory / Payments kabi mavjud bo'lmagan sahifalarga link qo'yardi.
  // Olympy ehtiyojiga mos sahifalarni qoldiramiz; renderer'i bo'lmagan
  // tugmalarni olib tashlaymiz.
  // Avval sidebar'da reports/payments/marketing/content/system/logs/support
  // bo'ladi va hammasi renderAnalytics yoki renderSettings ga redirect
  // qilardi. Ular hali backend'da yo'q sahifalar — chalkashlik kelmasligi
  // uchun olib tashladik. Qo'shilgan rea sahifalar qoldi.
  const navItems = [
    { key: 'home', icon: 'grid', label: 'Dashboard' },
    { key: 'users', icon: 'users', label: 'Foydalanuvchilar' },
    { key: 'centers', icon: 'building', label: 'Tashkilotlar', badge: pendingCenterReqs.length || undefined },
    { key: 'olympiads', icon: 'trophy', label: 'Olimpiadalar' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCenterReqs.length || undefined },
    { key: 'subjects', icon: 'book', label: 'Fanlar' },
    { key: 'analytics', icon: 'chart', label: 'Tahlil' },
    { key: 'logs', icon: 'shield', label: 'Amallar tarixi' },
    { key: 'security', icon: 'lock', label: 'Xavfsizlik' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
    { key: 'myprofile', icon: 'user', label: 'Mening profilim' },
    { key: 'support', icon: 'sparkles', label: 'AI Support' },
  ];

  const dashboardCenters = (approvedCenters.length ? approvedCenters : centers).slice(0, 5);
  const dashboardRequests = pendingCenterReqs.slice(0, 5).map(req => {
    const center = resolveCenterFromRequest(req);
    const owner = getOwnerInfo(center, req);
    return { req, center, owner };
  });
  const dashboardNotifications = recentActivity.slice(0, 4);
  const AdminSidebar = () => (
    <aside className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-60 flex-col admin-sidebar text-slate-300 shadow-2xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none`}>
      <div className="flex h-[54px] items-center gap-2 border-b border-white/5 px-4 bg-white/[0.01]">
        <button onClick={() => setPage('home')} className="flex items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-white text-base font-black text-[#050508]">
            O
            <span className="absolute -bottom-1 left-1 h-1 w-5 rounded-full bg-gradient-to-r from-amber-500 to-indigo-500" />
          </div>
          <div className="text-left">
            <div className="text-[14px] font-black leading-none text-white tracking-wide">olympy <span className="font-medium text-indigo-400 text-[10px]">admin</span></div>
          </div>
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4 admin-scroll">
        {navItems.map(item => {
          const isActive = page === item.key;
          return (
            <button key={item.key}
              onClick={() => { setPage(item.key); setMobileMenu(false); }}
              className={`sidebar-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left ${isActive ? 'active' : ''}`}>
              <span className={`sidebar-icon transition-colors duration-200 ${isActive ? 'text-indigo-400' : 'text-white/40'}`}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-colors duration-200 flex-1 ${isActive ? 'text-white' : 'text-white/65'}`}>
                {item.label}
              </span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-white/5 px-4 py-5 bg-white/[0.01]">
        <div className="mb-6">
          <div className="mb-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Tizim holati</div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Tizim faol
          </div>
        </div>
        <div className="mb-4 text-[10px] leading-relaxed text-slate-600 font-semibold">
          © 2026 Olympy Admin
        </div>
        <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-bold text-slate-400 hover:bg-white/5 hover:text-white transition">
          <Icon name="logout" size={13} className="text-slate-500" /> Chiqish
        </button>
      </div>
    </aside>
  );

  const AdminTopbar = () => (
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-white/5 bg-[#050508]/95 px-4 lg:px-5">
      <div className="flex items-center gap-3">
        <button className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 lg:hidden" onClick={() => setMobileMenu(true)}>
          <Icon name="menu" size={18} />
        </button>
        <button className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 lg:inline-flex">
          <Icon name="menu" size={16} />
        </button>
        <div className="relative hidden w-[310px] max-w-[35vw] md:block">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="h-8 w-full admin-input pl-9 pr-3 text-[11px] outline-none"
            placeholder="Foydalanuvchilar, tashkilotlar, olimpiadalar..." />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onOpenSwitcher && (
          <button onClick={onOpenSwitcher} className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 px-2 md:px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-white/5 transition">
            <Icon name="users" size={11} /><span className="hidden md:inline">Rolni almashtirish</span>
          </button>
        )}
        <button onClick={() => setPage('requests')} className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 transition">
          <Icon name="bell" size={15} />
          {pendingCenterReqs.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]">
              {pendingCenterReqs.length}
            </span>
          )}
        </button>
        <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 transition">
          <Icon name="info" size={15} />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-white/5">
          <Avatar name={user?.name || 'Admin'} src={user?.avatarUrl || ''} size={28} gradient="from-indigo-600 to-purple-600" />
          <div className="hidden text-right sm:block">
            <div className="text-[11px] font-black leading-tight text-white">{user?.name || 'Admin'}</div>
            <div className="text-[9px] font-bold leading-tight text-indigo-400 mt-0.5">{(() => {
              if (user?.is_platform_admin || user?.roles?.admin) return 'Platform Admin';
              if (user?.roles?.owner) return 'Tashkilot direktori';
              if (user?.roles?.manager) return 'Manager';
              if (user?.roles?.teacher) return "O'qituvchi";
              return 'Admin';
            })()}</div>
          </div>
          <Icon name="chevronDown" size={12} className="hidden text-slate-500 sm:block" />
        </div>
      </div>
    </header>
  );

  const CenterApprovalList = ({ compact = false }) => (
    <div className="space-y-3">
      {pendingCenterReqs.map(req => {
        const center = resolveCenterFromRequest(req);
        const owner = getOwnerInfo(center, req);
        if (!center) return null;
        return (
          <div key={req.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex flex-1 items-center gap-3">
                <AdminCenterLogo name={center.name} src={center.imageUrl} color="bg-amber-500/20 text-amber-400 border border-amber-500/30" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-white">{center.name}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    {center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · Direktor: <span className="text-slate-300 font-bold">{owner.name}</span>{owner.phone ? ` · ${owner.phone}` : ''}
                  </div>
                  {!compact && (center.subjects || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {center.subjects.slice(0, 5).map(s => (
                        <span key={s} className="rounded bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => approveCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                  <Icon name="check" size={14} /> Qabul qilish
                </button>
                <button onClick={() => rejectCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition">
                  <Icon name="x" size={14} /> Rad etish
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {pendingCenterReqs.length === 0 && (
        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-4 py-10 text-center text-sm font-semibold text-slate-400">
          Hozircha tasdiqlash kutilayotgan direktor arizasi yo'q
        </div>
      )}
    </div>
  );

  const renderHome = () => {
    const olympiadList = isApi ? (apiOlympiads || []) : store.olympiads;
    const activeOlympiadCount = olympiadList.filter(o => o.status === 'active').length;
    const totalOlympiads = olympiadList.length;
    const activeUsersCount = allUsers.filter(u => u.isActive !== false).length;
    const studentCount = allUsers.filter(u => {
      const r = u.roles || {};
      return r.student?.status === 'approved';
    }).length;
    // "Hozir onlayn" oynasi. Backend onlaynlarni ro'yxat boshiga qo'yib
    // qaytaradi — bu yerda qayta saralash shart emas.
    const presenceRows = Array.isArray(apiOnlineUsersRes.data) ? apiOnlineUsersRes.data : [];
    // `res.loading` yolg'iz yetarli emas: useApiData effekti render'dan KEYIN
    // ishga tushadi, ya'ni oyna ochilgan birinchi kadrda bayroq hali `false`
    // va bir lahza "bo'sh ro'yxat" ko'rinib qolardi ("Batafsil" oynasidagi
    // bloklar bilan bir xil naqsh).
    const presenceLoading = apiOnlineUsersRes.loading
      || (!apiOnlineUsersRes.data && !apiOnlineUsersRes.error);
    // Redis javob bermasa backend HAR qatorga `is_online: null` qo'yadi —
    // hammani "oflayn" deb ko'rsatish yolg'on bo'lardi.
    const presenceUnknown = presenceRows.some(row => row.is_online === null);
    const presenceOnlineCount = presenceRows.filter(row => row.is_online === true).length;
    return (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Boshqaruv paneli</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Olympy platformasi ko'rsatkichlari va arizalar holati.</p>
        </div>
      </div>

      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Tashkilotlar" value={approvedCenters.length.toLocaleString()} delta={pendingCenterReqs.length ? `${pendingCenterReqs.length} ta tasdiqlash kutilmoqda` : 'Barchasi ko\'rib chiqilgan'} icon={<Icon name="building" size={16} />} tone="indigo" />
        <AdminMetricCard label="Pending arizalar" value={pendingCenterReqs.length.toLocaleString()} delta={pendingCenterReqs.length ? "Ko'rib chiqish kerak" : "Bo'sh"} icon={<Icon name="bell" size={16} />} tone="emerald" />
        <AdminMetricCard label="Foydalanuvchilar" value={allUsers.length.toLocaleString()} delta={`${activeUsersCount} ta faol`} icon={<Icon name="users" size={16} />} tone="amber" />
        <AdminMetricCard label="Olimpiadalar" value={totalOlympiads.toLocaleString()} delta={`${activeOlympiadCount} ta faol`} icon={<Icon name="trophy" size={16} />} tone="rose" />
      </div>

      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="O'quvchilar" value={studentCount.toLocaleString()} delta="Tasdiqlangan" icon={<Icon name="users" size={16} />} tone="indigo" />
        <AdminMetricCard label="Faol olimpiadalar" value={activeOlympiadCount.toLocaleString()} delta={activeOlympiadCount ? "Hozir o'tmoqda" : "Hech qaysi faol emas"} icon={<Icon name="bolt" size={16} />} tone="emerald" />
        {/* Yagona bosiladigan karta: ro'yxat faqat API rejimida mavjud
            (mock store'da onlayn holati yo'q), shuning uchun onClick ham
            shundagina beriladi — aks holda karta bosilar-u, hech narsa
            ochilmasdi. */}
        <AdminMetricCard label="Hozir onlayn" value={onlineCount == null ? '—' : onlineCount.toLocaleString()} delta={onlineCount == null ? "Ma'lumot yo'q" : "Oxirgi 3 daqiqada faol — ro'yxat uchun bosing"} icon={<Icon name="users" size={16} />} tone="sky" onClick={isApi ? () => setOnlineListOpen(true) : undefined} />
        <AdminMetricCard label="Tasdiqlangan tashkilotlar foizi" value={`${approvedCenterPct}%`} delta="Hammasi ichidan" icon={<Icon name="chart" size={16} />} tone="rose" />
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1.55fr_1.45fr]">
        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-300">Eng so'nggi tashkilotlar</h2>
            <button onClick={() => setPage('centers')} className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition">Hammasi</button>
          </div>
          <div className="grid grid-cols-[1fr_70px_100px] border-b border-white/5 pb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <span>Tashkilot</span><span className="text-right">O'quvchi</span><span className="text-right">Holat</span>
          </div>
          <div className="divide-y divide-white/5">
            {dashboardCenters.map(center => (
              <div key={center.id} className="grid grid-cols-[1fr_70px_100px] items-center gap-2 py-3 admin-table-row">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-xs font-black text-white">{center.name?.[0] || 'O'}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-slate-200">{center.name}</div>
                    <div className="truncate text-[10px] text-slate-500 font-semibold">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] font-bold text-slate-400">{(center.students || 0).toLocaleString()}</div>
                <div className="text-right"><AdminPill status={center.status} /></div>
              </div>
            ))}
            {dashboardCenters.length === 0 && <div className="py-10 text-center text-[12px] font-semibold text-slate-500">Tashkilotlar yo'q</div>}
          </div>
        </section>

        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-300">Pending direktor arizalari</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition">Hammasi</button>
          </div>
          <div className="space-y-3">
            {dashboardRequests.map(({ req, center, owner }) => (
              <div key={req.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-white/[0.01] border border-white/5 hover:border-white/10 transition duration-200">
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-slate-200 truncate">{center?.name || 'Yangi tashkilot'}</div>
                  <div className="mt-0.5 truncate text-[11px] font-bold text-slate-400">{owner.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500 font-semibold">{center?.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <AdminPill status="pending">Kutilmoqda</AdminPill>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button onClick={() => approveCenterReq(req)} className="rounded bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 text-[10px] font-bold text-emerald-400 border border-emerald-500/20 transition">Qabul</button>
                    <button onClick={() => rejectCenterReq(req)} className="rounded bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-400 border border-rose-500/20 transition">Rad</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardRequests.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-slate-500">Pending arizalar yo'q</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1fr_1fr]">
        <section className="admin-card p-5">
          <h2 className="mb-4 text-[12px] font-black uppercase tracking-wider text-slate-300">Tashkilotlar holati</h2>
          <AdminDonut segments={[
            { label: 'Tasdiqlangan', value: approvedCenterPct, color: '#6366f1' },
            { label: 'Kutilmoqda', value: pendingCenterPct, color: '#f59e0b' },
            { label: 'Boshqa', value: otherCenterPct, color: '#10b981' },
          ]} />
        </section>

        <section className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-300">Bildirishnomalar</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition">Hammasi</button>
          </div>
          <div className="space-y-4">
            {dashboardNotifications.map(item => (
              <div key={item.id} className="flex items-start gap-3 p-1">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${item.tone === 'rose' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : item.tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]'}`}>
                  <Icon name={item.tone === 'rose' ? 'info' : item.tone === 'emerald' ? 'check' : 'bell'} size={14} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold text-slate-200">{item.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500 font-bold">{item.time || ''}</div>
                </div>
              </div>
            ))}
            {dashboardNotifications.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-slate-500">Yangi bildirishnomalar yo'q</div>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={onlineListOpen}
        onClose={() => setOnlineListOpen(false)}
        title="Foydalanuvchilar holati"
        width="max-w-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
          <div className="text-[11px] font-bold text-white/60">
            {presenceUnknown ? "Onlayn holati mavjud emas" : `${presenceOnlineCount.toLocaleString()} ta onlayn`}
          </div>
          <div className="text-[11px] font-bold text-white/40">
            Jami {presenceRows.length.toLocaleString()} ta
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto admin-scroll divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
          {presenceLoading ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Yuklanmoqda...</div>
          ) : apiOnlineUsersRes.error ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</div>
          ) : presenceRows.length === 0 ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Foydalanuvchilar yo'q</div>
          ) : presenceRows.map(row => (
            <div key={row.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  row.is_online === true
                    ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                    : 'bg-slate-600'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{row.full_name || "Foydalanuvchi"}</div>
                <div className="font-mono text-[10px] text-white/40">{maskPhoneDisplay(row.phone, '')}</div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  row.is_online === true ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {row.is_online === null ? "Noma'lum" : row.is_online ? 'Onlayn' : 'Oflayn'}
                </span>
                {/* Faqat oflayn qatorlarda: qachondan beri yo'q. `is_online`
                    null bo'lsa (Redis o'chgan) holat noma'lum — "3 soat oldin"
                    yozish "hozir oflayn" degan yolg'on xulosaga olib kelardi. */}
                {row.is_online === false && (
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500"
                       title={row.last_seen_at ? formatAdminDateTime(row.last_seen_at) : ''}>
                    {row.last_seen_at ? formatAdminRelativeTime(row.last_seen_at) : 'Hech qachon'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold text-slate-500 leading-relaxed">
          "Onlayn" — oxirgi 3 daqiqada kamida bitta so'rov yuborgan foydalanuvchi.
          Sahifani ochib qo'yib, hech narsa qilmayotgan foydalanuvchi bir necha
          daqiqadan keyin oflayn ko'rinadi. Oflayn qatordagi vaqt — oxirgi
          faollikdan beri o'tgan muddat; "Hech qachon" hisob yaratilgandan
          keyin ilovaga umuman kirmaganini bildiradi.
        </p>
        <button
          onClick={() => setOnlineListOpen(false)}
          className="btn-ghost mt-5 w-full rounded-xl py-3 text-xs font-bold">
          Yopish
        </button>
      </Modal>
    </div>
    );
  };

  const renderRequests = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Direktor arizalari</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Direktor tashkilot yoki markaz ro'yxatdan o'tkazish uchun yuborgan arizalari.</p>
      </div>
      <CenterApprovalList />
    </div>
  );

  const renderCenters = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Tashkilotlar va markazlar</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Faqat qabul qilingan tashkilotlar o'quvchilar va mehmonlarga ko'rinadi.</p>
        </div>
        <div className="flex gap-2">
          <AdminPill status="approved">{approvedCenters.length} tasdiqlangan</AdminPill>
          <AdminPill status="pending">{pendingCenters.length} kutilmoqda</AdminPill>
        </div>
      </div>

      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[1120px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {['Tashkilot', 'Turi', 'Manzil', 'Direktor', 'O\'quvchi', 'Olimpiada', 'Holat', 'Premium', 'Amal'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {centers.map(center => {
                const owner = getOwnerInfo(center);
                return (
                  <tr key={center.id} className="text-xs admin-table-row text-slate-300">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <AdminCenterLogo name={center.name} src={center.imageUrl} />
                        <div>
                          <div className="font-bold text-white">{center.name}</div>
                          <div className="text-[10px] font-semibold text-slate-500">{formatAdminDate(center.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-400">{center.organizationType || "O'quv markaz"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-400">{formatCenterLocation(center)}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-300">{owner.name}</div>
                      {owner.phone && <div className="text-[10px] text-slate-500 font-semibold">{owner.phone}</div>}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-300">{center.students || 0}</td>
                    <td className="px-5 py-4 font-bold text-slate-300">{center.olympiads || 0}</td>
                    <td className="px-5 py-4"><AdminPill status={center.status} /></td>
                    <td className="px-5 py-4">
                      {center.isPremium ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                            <Icon name="check" size={11} /> Premium
                          </span>
                          <button onClick={() => setRevokePremiumConfirm(center)} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/20 hover:bg-rose-500/10 transition">Bekor qilish</button>
                        </div>
                      ) : (
                        <button onClick={() => togglePremium(center)} className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20 transition">Premium berish</button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {center.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => approveCenterDirect(center)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)] transition">Qabul</button>
                          <button onClick={() => setRejectCenterConfirm(center)} className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/20 hover:bg-rose-500/20 transition">Rad</button>
                        </div>
                      ) : (
                        <button onClick={() => setRejectCenterConfirm(center)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/10 hover:text-white transition">
                          Ro'yxatdan olish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {centers.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Tashkilotlar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  // "Batafsil" oynasi. Jadval qatoridagi ma'lumot darhol ko'rsatiladi,
  // backenddan kelgan to'liq profil (yangiroq holat, rollar detali, obuna)
  // ustidan yoziladi; to'lovlar va kirish tarixi alohida so'rovlar bilan
  // keladi va profilni kutdirmaydi.
  const renderUserDetailModal = () => {
    // ID tekshiruvi majburiy: useApiData yangi so'rov ketayotganda eski
    // data'ni saqlab turadi — busiz ketma-ket ochilgan ikkinchi foydalanuvchi
    // oynasida bir lahza BIRINCHISINING holati/premiumi ko'rinardi. Shu sabab
    // tarix endpointlari ham javobda `user_id` qaytaradi.
    const fresh = isApi && apiUserDetailRes.data && apiUserDetailRes.data.id === detailBackendId
      ? OlympyApi.mapBackendUser(apiUserDetailRes.data)
      : null;
    const info = detailUser ? {
      name: fresh?.name || detailUser.name,
      phone: fresh?.phone || detailUser.phone,
      avatarUrl: fresh?.avatarUrl || detailUser.avatarUrl || '',
      joined: fresh?.joined || detailUser.joined,
      isActive: fresh ? fresh.isActive !== false : detailUser.status !== 'Bloklangan',
      isPremium: fresh ? !!fresh.isPremium : !!detailUser.isPremium,
      planName: fresh?.currentPlanName || detailUser.planName || '',
      center: detailUser.center,
      roles: fresh?.roles || null,
      // 2FA holati faqat backend profilida keladi (jadval qatorida yo'q) —
      // "2FA'ni o'chirish" tugmasi shu bayroqqa qarab ko'rsatiladi.
      totpEnabled: !!fresh?.totpEnabled,
      // Boshqa admin ustidan bajarib bo'lmaydigan amallar (masalan
      // "sifatida ko'rish") uchun — yangi profil kelgan bo'lsa o'shandan.
      isPlatformAdmin: fresh ? !!fresh.isPlatformAdmin : !!detailUser.isPlatformAdmin,
      // Blok sababi/muddati `mapBackendUser` dan o'tmaydi: ular faqat shu
      // admin endpoint javobida bo'ladi (UserSerializer'ga qo'shilmagan).
      blockReason: (isApi && apiUserDetailRes.data?.id === detailBackendId
        ? apiUserDetailRes.data.block_reason : null) || '',
      blockedUntil: (isApi && apiUserDetailRes.data?.id === detailBackendId
        ? apiUserDetailRes.data.blocked_until : null) || null,
    } : null;
    const roleEntries = info?.roles ? Object.entries(info.roles) : [];
    const billing = isApi && apiUserBillingRes.data?.user_id === detailBackendId
      ? apiUserBillingRes.data
      : null;
    const logins = isApi && apiUserLoginsRes.data?.user_id === detailBackendId
      ? apiUserLoginsRes.data
      : null;
    const warnings = isApi && apiUserWarningsRes.data?.user_id === detailBackendId
      ? apiUserWarningsRes.data
      : null;
    const sessions = isApi && apiUserSessionsRes.data?.user_id === detailBackendId
      ? apiUserSessionsRes.data
      : null;
    const txRows = Array.isArray(billing?.transactions) ? billing.transactions : [];
    const loginRows = Array.isArray(logins?.events) ? logins.events : [];
    const warningRows = Array.isArray(warnings?.warnings) ? warnings.warnings : [];
    const sessionRows = Array.isArray(sessions?.sessions) ? sessions.sessions : [];
    const activeSessionCount = sessionRows.filter(s => s.is_active).length;
    // `res.loading` yolg'iz yetarli emas: useApiData effekti render'dan KEYIN
    // ishga tushadi, ya'ni oyna ochilgan birinchi kadrda bayroq hali `false`
    // va bir lahza "bo'sh" holat ko'rinib qolardi. Javob hali shu
    // foydalanuvchiniki bo'lmagan holat ham yuklanish deb qaraladi.
    const billingLoading = apiUserBillingRes.loading || (!billing && !apiUserBillingRes.error);
    const loginsLoading = apiUserLoginsRes.loading || (!logins && !apiUserLoginsRes.error);
    const warningsLoading = apiUserWarningsRes.loading || (!warnings && !apiUserWarningsRes.error);
    const sessionsLoading = apiUserSessionsRes.loading || (!sessions && !apiUserSessionsRes.error);
    // Ikkala tarix bloki bir xil holatlarni boshqaradi (API emas / yuklanmoqda
    // / xato / bo'sh / ro'yxat) — bitta o'ram orqali.
    const renderHistorySection = ({ title, note, loading, error, rows, emptyText, renderRow }) => (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{title}</div>
          {note && <div className="text-[10px] font-bold text-indigo-400 truncate">{note}</div>}
        </div>
        <div className="max-h-56 overflow-y-auto admin-scroll divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
          {!isApi ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Faqat API rejimida ko'rinadi</div>
          ) : loading ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Yuklanmoqda...</div>
          ) : error ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">{emptyText}</div>
          ) : rows.map(renderRow)}
        </div>
      </div>
    );
    return (
      <Modal
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        title="Foydalanuvchi ma'lumotlari"
        width="max-w-2xl"
      >
        {info && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name={info.name} src={info.avatarUrl} size={44} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{info.name}</div>
                <div className="text-xs text-white/40 font-mono">{info.phone || '—'}</div>
              </div>
              {apiUserDetailRes.loading && (
                <span className="ml-auto text-[10px] font-bold text-white/30">Yuklanmoqda...</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'ID', value: detailBackendId ? `#${detailBackendId}` : '—' },
                { label: "Ro'yxatdan o'tgan", value: formatAdminDate(info.joined) || '—' },
                { label: 'Tashkilot', value: info.center || '—' },
                { label: 'Tarif', value: info.planName || '—' },
              ].map(f => (
                <div key={f.label} className="rounded-xl bg-white/5 px-3 py-2.5">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{f.label}</div>
                  <div className="mt-1 text-xs font-bold text-white break-words">{f.value}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Rollar</div>
              <div className="flex flex-wrap gap-2">
                {roleEntries.length > 0 ? roleEntries.map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 text-[11px] font-bold text-indigo-400">
                    {ROLE_META[key]?.label || key}
                    <AdminPill status={val?.status || 'pending'} />
                  </span>
                )) : (
                  <span className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 text-[11px] font-bold text-indigo-400">
                    {detailUser?.role || '—'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <AdminPill status={info.isActive ? 'approved' : 'rejected'}>
                {info.isActive ? 'Faol' : 'Bloklangan'}
              </AdminPill>
              <AdminPill status={info.isPremium ? 'active' : 'draft'}>
                {info.isPremium ? 'Premium' : 'Premium yo\'q'}
              </AdminPill>
            </div>

            {/* Blok sababi va muddati — faqat hozir bloklangan foydalanuvchida.
                Muddat ko'rsatilmagan bo'lsa blok doimiy. */}
            {!info.isActive && info.blockReason && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300/70">Bloklash sababi</div>
                <div className="mt-1 text-xs font-bold text-rose-100 break-words">{info.blockReason}</div>
                <div className="mt-2 text-[11px] font-semibold text-rose-300/80">
                  {info.blockedUntil
                    ? `Ochilish vaqti: ${formatAdminDateTime(info.blockedUntil)}`
                    : 'Muddat: doimiy (admin qo\'lda ochadi)'}
                </div>
              </div>
            )}

            {renderHistorySection({
              title: "To'lovlar tarixi",
              // Sarlavha yonida joriy obuna: tarix o'tmishni, bu esa hozirgi
              // holatni ko'rsatadi (bekor qilingan to'lovdan keyin ham obuna
              // amal qilib turishi mumkin).
              note: billing?.subscription
                ? `${billing.subscription.plan_name} · ${billing.subscription.days_remaining} kun qoldi`
                : null,
              loading: billingLoading,
              error: apiUserBillingRes.error,
              rows: txRows,
              emptyText: "To'lovlar hali yo'q",
              renderRow: (tx) => {
                const st = adminPaymentStatus(tx.status);
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-white">{tx.plan_name}</div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                        {formatAdminDateTime(tx.created_at)} · {adminProviderLabel(tx.provider)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-bold tabular-nums text-white">{formatAdminAmount(tx.amount)}</div>
                      <div className={`mt-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</div>
                    </div>
                  </div>
                );
              },
            })}

            {renderHistorySection({
              title: 'Kirish tarixi',
              loading: loginsLoading,
              error: apiUserLoginsRes.error,
              rows: loginRows,
              // Kirishlar faqat shu funksiya ishga tushirilgandan keyin
              // yozila boshlagan — eskilarini tiklab bo'lmaydi, shuning uchun
              // bo'sh ro'yxat xato emas.
              emptyText: "Kirish tarixi hali bo'sh — faqat yangi kirishlar yoziladi",
              renderRow: (event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold text-white" title={event.user_agent || ''}>
                      {adminDeviceLabel(event.user_agent)}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {formatAdminDateTime(event.created_at)}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[10px] text-slate-400">{event.ip || '—'}</div>
                </div>
              ),
            })}

            {/* Faol seanslar — yuqoridagi "Kirish tarixi" O'TMISHNI ko'rsatadi,
                bu esa HOZIRGI holatni: qaysi qurilma hali hisobga kira oladi.
                Bitta qatorni yakunlash faqat o'sha qurilmani chiqaradi
                ("Barcha seanslarni yakunlash" esa hammasini). Eski, jti'siz
                kirishlar bu ro'yxatga tushmaydi — ularni alohida yakunlash
                imkoni yo'q, shuning uchun ro'yxat kirish tarixidan qisqaroq
                bo'lishi normal. */}
            {renderHistorySection({
              title: 'Faol seanslar',
              note: activeSessionCount > 0 ? `${activeSessionCount} ta faol` : null,
              loading: sessionsLoading,
              error: apiUserSessionsRes.error,
              rows: sessionRows,
              emptyText: "Yakunlash mumkin bo'lgan seans yo'q",
              renderRow: (session) => {
                const busy = sessionLogoutId === session.login_event_id;
                return (
                  <div key={session.login_event_id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-white" title={session.user_agent || ''}>
                        {adminDeviceLabel(session.user_agent)}
                      </div>
                      <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                        {formatAdminDateTime(session.created_at)} · <span className="font-mono">{session.ip_address || '—'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-[10px] font-bold ${session.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {session.is_active ? 'Faol' : 'Tugagan'}
                      </span>
                      {/* Tugagan seansda yakunlaydigan narsa yo'q — backend ham
                          uni 400 bilan rad etadi, shuning uchun tugma faqat
                          faol qatorlarda. */}
                      {session.is_active && (
                        <button
                          onClick={() => endUserSession(session.login_event_id)}
                          disabled={busy}
                          className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50"
                        >
                          {busy ? '...' : 'Yakunlash'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              },
            })}

            {/* Ogohlantirishlar tarixi — bloklashdan oldin bu hisob avval
                necha marta ogohlantirilganini ko'rsatadi. Ichki sabab bu
                yerda yo'q (u faqat audit jurnalida): ro'yxatda foydalanuvchi
                o'qigan matnning o'zi turadi. */}
            {renderHistorySection({
              title: 'Ogohlantirishlar tarixi',
              note: warningRows.length > 0 ? `${warningRows.length} ta` : null,
              loading: warningsLoading,
              error: apiUserWarningsRes.error,
              rows: warningRows,
              emptyText: 'Ogohlantirishlar yuborilmagan',
              renderRow: (warn) => (
                <div key={warn.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white break-words">{warn.message}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {formatAdminDateTime(warn.created_at)} · {warn.title}
                    </div>
                  </div>
                  <div className={`shrink-0 text-[10px] font-bold ${warn.is_read ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {warn.is_read ? "O'qilgan" : "O'qilmagan"}
                  </div>
                </div>
              ),
            })}

            {/* Xavfsizlik amallari. Ikkalasi ham "Batafsil" oynasida: jadval
                qatoridagi tugmalar allaqachon to'lib ketgan va bularning
                ikkalasi ham kundalik emas, aniq holat uchun kerak. */}
            {isApi && (
              <div className="flex flex-wrap gap-2">
                {/* Bloklashdan oldingi eng yumshoq chora — shu sabab birinchi. */}
                <button
                  onClick={() => openWarnModal({
                    backendId: detailBackendId, name: info.name, phone: info.phone,
                  })}
                  className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition"
                >
                  Ogohlantirish
                </button>
                {info.totpEnabled && (
                  <button
                    onClick={() => setResetTotpConfirm({ backendId: detailBackendId, name: info.name })}
                    className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition"
                  >
                    2FA'ni o'chirish
                  </button>
                )}
                <button
                  onClick={() => setForceLogoutConfirm({ backendId: detailBackendId, name: info.name })}
                  className="rounded-lg bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition"
                >
                  Barcha seanslarni yakunlash
                </button>
                {/* Boshqa adminni yoki bloklangan hisobni bu yo'l bilan ochib
                    bo'lmaydi (backend 400 qaytaradi) — tugmani ham
                    ko'rsatmaymiz. */}
                {!info.isPlatformAdmin && info.isActive && (
                  <button
                    onClick={() => setImpersonateConfirm({ backendId: detailBackendId, name: info.name })}
                    className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition"
                  >
                    Foydalanuvchi sifatida ko'rish
                  </button>
                )}
                {/* Takrorlangan hisob: raqamini yo'qotib qayta ro'yxatdan
                    o'tgan o'quvchining ikkinchi hisobi bilan birlashtirish.
                    Admin hisobiga qo'llanmaydi (backend ham rad etadi). */}
                {!info.isPlatformAdmin && (
                  <button
                    onClick={() => openMergeModal({
                      backendId: detailBackendId, name: info.name, phone: info.phone,
                    })}
                    className="rounded-lg bg-indigo-500/10 px-3 py-2 text-[11px] font-bold text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition"
                  >
                    Hisoblarni birlashtirish
                  </button>
                )}
              </div>
            )}

            <button onClick={() => setDetailUser(null)} className="btn-ghost w-full rounded-xl py-3 text-xs font-bold">
              Yopish
            </button>
          </div>
        )}
      </Modal>
    );
  };

  const renderUsers = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Foydalanuvchilar</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Platformadagi foydalanuvchi rollari va holati. Admin userlar hisobga olinmaydi.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
          <div className="relative w-full md:w-72">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
              placeholder="Ism, telefon, rol bo'yicha qidirish..." />
          </div>
          <button
            type="button"
            onClick={handleExportUsersCsv}
            disabled={csvBusy}
            title="Joriy qidiruv bo'yicha filtrlangan ro'yxatni CSV qilib yuklaydi (eng ko'pi 5000 qator)"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50">
            <Icon name="download" size={13} /> {csvBusy ? 'Yuklanmoqda...' : 'CSV yuklab olish'}
          </button>
        </div>
      </div>

      {/* Ommaviy amallar paneli — kamida bitta qator belgilanganda ko'rinadi.
          2FA tiklash / seanslarni yakunlash / premium ATAYLAB yo'q: ular bitta
          foydalanuvchilik amallar bo'lib qoladi. */}
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3">
          <span className="text-xs font-extrabold text-white">{selectedUserIds.length} ta tanlandi</span>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <button
              type="button"
              onClick={() => openBulkBlockModal('block')}
              className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 transition hover:bg-rose-500/20">
              Bloklash
            </button>
            <button
              type="button"
              onClick={() => openBulkBlockModal('unblock')}
              className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-400 transition hover:bg-emerald-500/20">
              Blokni ochish
            </button>
            <button
              type="button"
              onClick={openBulkRoleModal}
              className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-bold text-indigo-400 transition hover:bg-indigo-500/20">
              Rol o'zgartirish
            </button>
            <button
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white">
              Tanlovni bekor qilish
            </button>
          </div>
        </div>
      )}
      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[760px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5">
                  {/* Faqat ko'rinayotgan (filtrlangan) qatorlarni tanlaydi. */}
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    aria-label="Hammasini tanlash"
                    className={`flex h-4 w-4 items-center justify-center rounded border transition ${allVisibleSelected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/25 hover:border-white/50'}`}>
                    {allVisibleSelected && <Icon name="check" size={12} />}
                  </button>
                </th>
                {['Foydalanuvchi', 'Telefon', 'Rol', 'Tashkilot', 'Qo\'shilgan', 'Holat', 'Premium', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(() => {
                if (visibleUserRows.length === 0) {
                  return <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">{userTableQuery ? 'Qidiruv natijasi topilmadi' : 'Foydalanuvchilar yo\'q'}</td></tr>;
                }
                return visibleUserRows.map(row => (
                <tr key={row.id} className="text-xs admin-table-row text-slate-300">
                  <td className="px-5 py-4">
                    <button
                      type="button"
                      onClick={() => toggleUserSelected(row.id)}
                      aria-label={`${row.name} — tanlash`}
                      className={`flex h-4 w-4 items-center justify-center rounded border transition ${selectedUserIds.includes(row.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/25 hover:border-white/50'}`}>
                      {selectedUserIds.includes(row.id) && <Icon name="check" size={12} />}
                    </button>
                  </td>
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={row.name} src={row.avatarUrl || ''} size={34} /><span className="font-bold text-white">{row.name}</span></div></td>
                  <td className="px-5 py-4 font-mono text-[11px] text-slate-400">{maskPhoneDisplay(row.phone, '')}</td>
                  <td className="px-5 py-4"><span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">{row.role}</span></td>
                  <td className="px-5 py-4 font-semibold text-slate-400">{row.center}</td>
                  <td className="px-5 py-4 font-semibold text-slate-400">{row.joined}</td>
                  <td className="px-5 py-4"><AdminPill status={row.status === 'Faol' ? 'approved' : 'rejected'}>{row.status}</AdminPill></td>
                  <td className="px-5 py-4">
                    {row.isPremium ? (
                      <button onClick={() => openPremiumModal(row)} className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/30 hover:bg-amber-500/25 transition">⭐ Premium ✓</button>
                    ) : row.orgBoundPremium ? (
                      <button
                        type="button"
                        disabled
                        title="O'qituvchi va manager premiumi markazning (tashkilotning) obunasidan keladi — shaxsiy premium berilmaydi"
                        className="cursor-not-allowed rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-500 ring-1 ring-white/10">
                        Tashkilot obunasi
                      </button>
                    ) : (
                      <button onClick={() => openPremiumModal(row)} className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 ring-1 ring-white/10 hover:bg-amber-500/10 hover:text-amber-400 transition">Premium berish</button>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setDetailUser(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition">
                        <Icon name="eye" size={12} /> Batafsil
                      </button>
                      <button onClick={() => openRoleModal(row)} className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[11px] font-bold text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition">
                        Rol
                      </button>
                      <button onClick={() => openPhoneModal(row)} className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition">
                        Telefon raqamini o'zgartirish
                      </button>
                      <button onClick={() => setResetPasswordConfirm(row)} className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition">
                        Parolni tiklash
                      </button>
                      {/* Bloklashdan oldingi qadam — tugma ham aynan "Bloklash"
                          yonida turadi. */}
                      <button onClick={() => openWarnModal(row)} className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition">
                        Ogohlantirish
                      </button>
                      <button onClick={() => openBlockModal(row)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${row.status === 'Bloklangan' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'}`}>
                        {row.status === 'Bloklangan' ? 'Ochish' : 'Bloklash'}
                      </button>
                    </div>
                  </td>
                </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ogohlantirish — bloklashdan oldingi qadam. Hisob holatiga tegmaydi,
          foydalanuvchi faqat xabarnoma oladi. */}
      <Modal open={!!warnModal} onClose={() => !warnBusy && setWarnModal(null)} title="Ogohlantirish yuborish">
        <div className="mb-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Avatar name={warnModal?.name || ''} size={36} />
            <div><div className="text-sm font-semibold text-white">{warnModal?.name}</div><div className="text-xs text-white/40">{warnModal?.phone}</div></div>
          </div>
          <p className="text-sm text-white/60">
            Foydalanuvchi xabarnoma oladi. Hisob bloklanmaydi va sessiyalari yakunlanmaydi.
          </p>
        </div>
        <div className="mb-5 space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Ogohlantirish sababi (ichki)</label>
            <textarea
              value={warnReason}
              onChange={e => setWarnReason(e.target.value)}
              rows={2}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Masalan: imtihonda shubhali xatti-harakat"
            />
            <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
              Faqat amallar tarixiga yoziladi — foydalanuvchi buni ko'rmaydi.
            </p>
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Foydalanuvchiga xabar</label>
            <textarea
              value={warnMessage}
              onChange={e => setWarnMessage(e.target.value)}
              rows={4}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Nima buzilgani va keyingi safar nima bo'lishini yozing"
            />
            <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
              Shu matn foydalanuvchining xabarnomalarida "Ogohlantirish" sarlavhasi bilan ko'rinadi.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setWarnModal(null)} disabled={warnBusy} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
          <button onClick={sendWarning} disabled={warnBusy} className="btn-primary flex-1 rounded-xl py-3 font-semibold text-xs font-bold disabled:opacity-50">
            {warnBusy ? '...' : 'Yuborish'}
          </button>
        </div>
      </Modal>

      <Modal open={!!blockModal} onClose={() => !blocking && setBlockModal(null)} title={blockModal?.status === 'Bloklangan' ? 'Blokni ochish' : 'Foydalanuvchini bloklash'}>
        <div className="mb-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Avatar name={blockModal?.name || ''} size={36} />
            <div><div className="text-sm font-semibold text-white">{blockModal?.name}</div><div className="text-xs text-white/40">{blockModal?.phone}</div></div>
          </div>
          <p className="text-sm text-white/60">{blockModal?.status === 'Bloklangan' ? 'Bu foydalanuvchining blokini ochasizmi?' : 'Bu foydalanuvchini bloklamoqchimisiz?'}</p>
        </div>
        {/* Sabab va muddat faqat bloklashda so'raladi — ochishda backend
            ikkalasini ham o'zi tozalaydi. */}
        {blockModal?.status !== 'Bloklangan' && blockReasonFields}
        <div className="flex gap-3">
          <button onClick={() => setBlockModal(null)} disabled={blocking} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
          <button onClick={() => toggleBlock(blockModal)} disabled={blocking} className={`flex-1 rounded-xl py-3 font-semibold text-xs font-bold disabled:opacity-50 ${blockModal?.status === 'Bloklangan' ? 'btn-success' : 'btn-danger'}`}>
            {blocking ? '...' : (blockModal?.status === 'Bloklangan' ? 'Blokni ochish' : 'Bloklash')}
          </button>
        </div>
      </Modal>

      {/* Ommaviy bloklash / blokni ochish */}
      <Modal
        open={!!bulkBlockModal}
        onClose={() => !bulkBusy && setBulkBlockModal(null)}
        title={bulkBlockModal === 'unblock' ? 'Ommaviy blokni ochish' : 'Ommaviy bloklash'}>
        <div className="mb-5">
          <p className="text-sm text-white/60">
            {bulkBlockModal === 'unblock'
              ? `Tanlangan ${selectedUserIds.length} ta foydalanuvchining blokini ochasizmi?`
              : `Tanlangan ${selectedUserIds.length} ta foydalanuvchini bloklaysizmi?`}
          </p>
          <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
            Admin hisoblari va o'zingiz amaldan chetda qoladi — natijada nechtasi
            o'tkazib yuborilgani ko'rsatiladi.
          </p>
        </div>
        {bulkBlockModal === 'block' && blockReasonFields}
        <div className="flex gap-3">
          <button onClick={() => setBulkBlockModal(null)} disabled={bulkBusy} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
          <button onClick={runBulkSetActive} disabled={bulkBusy} className={`flex-1 rounded-xl py-3 font-semibold text-xs font-bold disabled:opacity-50 ${bulkBlockModal === 'unblock' ? 'btn-success' : 'btn-danger'}`}>
            {bulkBusy ? '...' : (bulkBlockModal === 'unblock' ? 'Blokni ochish' : 'Bloklash')}
          </button>
        </div>
      </Modal>

      {/* Ommaviy rol o'zgartirish. Platform Admin varianti ATAYLAB yo'q:
          backend ham bu huquqni ommaviy amalda qabul qilmaydi. */}
      <Modal open={bulkRoleModal} onClose={() => !bulkBusy && setBulkRoleModal(false)} title="Ommaviy rol o'zgartirish">
        <div className="space-y-5">
          <p className="text-sm text-white/60">
            Tanlangan {selectedUserIds.length} ta foydalanuvchining rollari quyidagi
            tanlov bilan TO'LIQ almashtiriladi.
          </p>
          <div>
            <label className="block text-xs text-white/50 mb-2 font-medium">Rollar</label>
            <div className="space-y-2">
              {ROLE_MODAL_KEYS.filter(opt => opt.value !== 'admin').map(opt => {
                const checked = bulkRoleSelection.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBulkRoleSelection(prev => prev.includes(opt.value)
                      ? prev.filter(r => r !== opt.value)
                      : [...prev, opt.value])}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all ${
                      checked
                        ? 'bg-indigo-500/15 text-white border-indigo-500/40'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border transition ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-white/25'}`}>
                      {checked && <Icon name="check" size={12} />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
              Hech biri tanlanmasa, tanlangan hisoblarning barcha rollari olib tashlanadi.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setBulkRoleModal(false)} disabled={bulkBusy} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
            <button onClick={runBulkSetRoles} disabled={bulkBusy} className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
              {bulkBusy ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!rejectCenterConfirm}
        onClose={() => !centerActionBusy && setRejectCenterConfirm(null)}
        onConfirm={() => {
          setCenterActionBusy(true);
          Promise.resolve(rejectCenterDirect(rejectCenterConfirm))
            .finally(() => { setCenterActionBusy(false); setRejectCenterConfirm(null); });
        }}
        title="Tashkilotni rad etish"
        message={`"${rejectCenterConfirm?.name || ''}" tashkilotini rad etasizmi? U darhol ro'yxatlardan olib tashlanadi.`}
        confirmText="Ha, rad etish"
        danger
        busy={centerActionBusy}
      />

      <ConfirmModal
        open={!!revokePremiumConfirm}
        onClose={() => !centerActionBusy && setRevokePremiumConfirm(null)}
        onConfirm={() => {
          setCenterActionBusy(true);
          Promise.resolve(togglePremium(revokePremiumConfirm))
            .finally(() => { setCenterActionBusy(false); setRevokePremiumConfirm(null); });
        }}
        title="Premiumni bekor qilish"
        message={`"${revokePremiumConfirm?.name || ''}" tashkilotining premium holatini bekor qilasizmi?`}
        confirmText="Ha, bekor qilish"
        danger
        busy={centerActionBusy}
      />

      {/* Rol o'zgartirish modali */}
      <Modal open={!!roleModal} onClose={() => setRoleModal(null)} title="Rol o'zgartirish">
        {roleModal && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name={roleModal.name || ''} size={36} />
              <div>
                <div className="text-sm font-semibold text-white">{roleModal.name}</div>
                <div className="text-xs text-white/40">{roleModal.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-2 font-medium">Rollar</label>
              <div className="space-y-2">
                {ROLE_MODAL_KEYS.map(opt => {
                  const checked = roleSelection.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleRoleCheckbox(opt.value)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all ${
                        checked
                          ? 'bg-indigo-500/15 text-white border-indigo-500/40'
                          : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border transition ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-white/25'}`}>
                        {checked && <Icon name="check" size={12} />}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setRoleModal(null)} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold">Bekor qilish</button>
              <button onClick={handleSaveRoles} disabled={roleSaving} className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
                {roleSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Premium sozlash modali */}
      <Modal open={!!premiumUser} onClose={() => setPremiumUser(null)} title="Premium hisobni boshqarish">
        {premiumUser && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name={premiumUser.name || ''} size={36} />
              <div>
                <div className="text-sm font-semibold text-white">{premiumUser.name}</div>
                <div className="text-xs text-white/40">{premiumUser.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Premium turi</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'student', label: "O'quvchi (Student)" },
                  { value: 'organization', label: 'Tashkilot (Organization)' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPremiumPlanType(opt.value)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      premiumPlanType === opt.value
                        ? 'bg-indigo-500 text-white border-indigo-500 font-extrabold'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {premiumDuration > 0 && (
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Tarif turi (Darajasi)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'Standart', label: 'Standart' },
                    { value: 'Plus', label: 'Plus' },
                    { value: 'Pro', label: 'Pro' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPremiumPlanName(opt.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                        premiumPlanName === opt.value
                          ? 'bg-indigo-500 text-white border-indigo-500 font-extrabold shadow'
                          : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Muddat</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 30, label: '1 oy (30 kun)' },
                  { value: 90, label: '3 oy (90 kun)' },
                  { value: 180, label: '6 oy (180 kun)' },
                  { value: 365, label: '1 yil (365 kun)' },
                  { value: 0, label: 'Umrbod (Cheksiz)' },
                  { value: -1, label: 'Bekor qilish' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPremiumDuration(opt.value)}
                    className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      premiumDuration === opt.value
                        ? opt.value === -1
                          ? 'bg-rose-600 text-white border-rose-600 font-extrabold shadow'
                          : 'bg-amber-500 text-indigo-950 border-amber-500 font-extrabold shadow'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setPremiumUser(null)} disabled={premiumSaving} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold">Bekor qilish</button>
              <button
                onClick={handleSavePremium}
                disabled={premiumSaving}
                className={`flex-1 rounded-xl py-3 font-semibold text-xs font-bold ${
                  premiumDuration === -1 ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'btn-primary'
                }`}
              >
                {premiumSaving ? 'Saqlanmoqda...' : premiumDuration === -1 ? 'O\'chirish' : 'Saqlash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Telefon raqamini o'zgartirish (support) modali */}
      <Modal open={!!phoneModal} onClose={() => !phoneSaving && setPhoneModal(null)} title="Telefon raqamini o'zgartirish">
        {phoneModal && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
              <Avatar name={phoneModal.name || ''} size={36} />
              <div>
                <div className="text-sm font-semibold text-white">{phoneModal.name}</div>
                <div className="text-xs text-white/40">{phoneModal.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Yangi telefon raqam</label>
              <input
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                className="w-full admin-input px-3 py-2.5 text-sm outline-none"
                placeholder="+998 90 123 45 67"
                inputMode="tel"
              />
              <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
                Foydalanuvchi shu raqam bilan tizimga kiradi. Amal bajarilgandan keyin
                uning barcha joriy sessiyalari bekor qilinadi.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPhoneModal(null)} disabled={phoneSaving} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
              <button onClick={handleSavePhone} disabled={phoneSaving} className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
                {phoneSaving ? 'Saqlanmoqda...' : "O'zgartirish"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!resetPasswordConfirm}
        onClose={() => !resetPasswordBusy && setResetPasswordConfirm(null)}
        onConfirm={handleResetPassword}
        title="Parolni tiklash"
        message="Bu foydalanuvchining joriy paroli bekor qilinadi va yangi parol yaratiladi — davom etasizmi?"
        confirmText="Ha, tiklash"
        danger
        busy={resetPasswordBusy}
      />

      <ConfirmModal
        open={!!resetTotpConfirm}
        onClose={() => !resetTotpBusy && setResetTotpConfirm(null)}
        onConfirm={handleResetTotp}
        title="2FA'ni o'chirish"
        message={`"${resetTotpConfirm?.name || ''}" uchun ikki bosqichli tasdiq o'chiriladi va barcha seanslari yakunlanadi. Foydalanuvchi kodsiz kira oladi va uni profilidan qaytadan yoqishi kerak — davom etasizmi?`}
        confirmText="Ha, o'chirish"
        danger
        busy={resetTotpBusy}
      />

      <ConfirmModal
        open={!!forceLogoutConfirm}
        onClose={() => !forceLogoutBusy && setForceLogoutConfirm(null)}
        onConfirm={handleForceLogout}
        title="Barcha seanslarni yakunlash"
        message={`"${forceLogoutConfirm?.name || ''}" barcha qurilmalardan chiqariladi va qaytadan kirishi kerak bo'ladi. Hisob bloklanmaydi — davom etasizmi?`}
        confirmText="Ha, yakunlash"
        danger
        busy={forceLogoutBusy}
      />

      <ConfirmModal
        open={!!impersonateConfirm}
        onClose={() => !impersonateBusy && setImpersonateConfirm(null)}
        onConfirm={handleImpersonate}
        title="Foydalanuvchi sifatida ko'rish"
        message={`Ilova "${impersonateConfirm?.name || ''}" hisobiga o'tadi: siz uning ekranini ko'rasiz va uning nomidan amal qila olasiz. Bu faqat qo'llab-quvvatlash uchun; seansning boshlanishi ham, yakunlanishi ham audit jurnaliga yoziladi. Kirish 15 daqiqadan keyin o'zi tugaydi, undan oldin tepadagi "Admin panelga qaytish" tugmasi bilan yakunlanadi — davom etasizmi?`}
        confirmText="Ha, ko'rish"
        danger
        busy={impersonateBusy}
      />

      {/* Yangi parol BIR MARTA ko'rsatiladi — modal yopilishi bilan state
          tozalanadi, boshqa hech qayerda saqlanmaydi. */}
      <Modal open={!!newPasswordInfo} onClose={() => setNewPasswordInfo(null)} title="Yangi parol">
        {newPasswordInfo && (
          <div className="space-y-4">
            <p className="text-sm text-white/60 leading-relaxed">
              <span className="font-semibold text-white">{newPasswordInfo.name}</span> uchun yangi parol yaratildi.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-indigo-200 font-mono break-all select-all">
                {newPasswordInfo.password}
              </code>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(newPasswordInfo.password); }}
                className="btn-ghost text-xs px-3 py-2 rounded-xl flex items-center gap-1.5"
                title="Nusxalash"
              >
                <Icon name="copy" size={13} />
              </button>
            </div>
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-300">
              Diqqat: bu parol qayta ko'rsatilmaydi, uni foydalanuvchiga xavfsiz yo'l bilan yetkazing.
            </p>
            <button onClick={() => setNewPasswordInfo(null)} className="btn-primary w-full rounded-xl py-3 text-xs font-bold">
              Yopdim, nusxaladim
            </button>
          </div>
        )}
      </Modal>

      {/* Takrorlangan hisoblarni birlashtirish. Oqim ataylab ikki bosqichli:
          quruq yurish (`preview`) hech narsani o'zgartirmaydi va nima
          ko'chishini ko'rsatadi, keyin manba raqamini qo'lda yozib tasdiqlash
          talab qilinadi. */}
      <Modal
        open={!!mergeModal}
        onClose={() => !mergeBusy && setMergeModal(null)}
        title="Hisoblarni birlashtirish"
        width="max-w-2xl"
      >
        {mergeModal && (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold leading-relaxed text-slate-400">
              Raqamini yo'qotib qayta ro'yxatdan o'tgan o'quvchining ikkita hisobi bitta hisobga yig'iladi:
              tangalar qo'shiladi, streak kattasi olinadi, urinish va mashq tarixi ko'chadi. Ikkinchi hisob
              o'chirilmaydi — doimiy bloklanadi va tekshirish uchun joyida qoladi.
            </p>

            <div className="rounded-xl bg-white/5 px-3.5 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Ochilgan hisob</div>
              <div className="mt-1 text-xs font-bold text-white">{mergeModal.name}</div>
              <div className="text-[11px] font-mono text-white/40">{mergeModal.phone || '—'}</div>
            </div>

            {/* Ikkinchi hisob qidiruvi — jadval bilan bir xil manba (ism yoki
                telefon bo'yicha). */}
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Ikkinchi hisob (ism yoki telefon)
              </label>
              <input
                value={mergeSearch}
                onChange={(e) => { setMergeSearch(e.target.value); setMergeOtherId(null); resetMergePreview(); }}
                placeholder="Masalan: Ali yoki +99890..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none"
              />
              {mergeOther ? (
                <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5">
                  <Avatar name={mergeOther.name || ''} src={mergeOther.avatarUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-white">{mergeOther.name}</div>
                    <div className="truncate font-mono text-[10px] text-white/40">{mergeOther.phone}</div>
                  </div>
                  <button
                    onClick={() => { setMergeOtherId(null); resetMergePreview(); }}
                    className="shrink-0 text-[10px] font-bold text-slate-400 hover:text-white"
                  >
                    Bekor qilish
                  </button>
                </div>
              ) : mergeCandidates.length > 0 ? (
                <div className="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                  {mergeCandidates.map(row => (
                    <button
                      key={row.id}
                      onClick={() => { setMergeOtherId(row.backendId); resetMergePreview(); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/5"
                    >
                      <Avatar name={row.name || ''} src={row.avatarUrl} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold text-white">{row.name}</div>
                        <div className="truncate font-mono text-[10px] text-white/40">{row.phone}</div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-slate-500">#{row.backendId}</span>
                    </button>
                  ))}
                </div>
              ) : debouncedMergeSearch.trim() ? (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 text-center text-[11px] font-semibold text-slate-500">
                  Mos hisob topilmadi
                </div>
              ) : null}
            </div>

            {/* Yo'nalish: qaysi hisob TIRIK qoladi. Noto'g'ri tanlov eng
                jiddiy xato bo'lgani uchun alohida, aniq savol. */}
            {mergeOther && (
              <div>
                <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Qaysi hisob saqlanadi?
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { keep: true, label: mergeModal.name, phone: mergeModal.phone },
                    { keep: false, label: mergeOther.name, phone: mergeOther.phone },
                  ].map(opt => (
                    <button
                      key={String(opt.keep)}
                      onClick={() => { setMergeKeepOpened(opt.keep); resetMergePreview(); }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        mergeKeepOpened === opt.keep
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                      }`}
                    >
                      <div className="truncate text-[11px] font-bold text-white">{opt.label}</div>
                      <div className="truncate font-mono text-[10px] text-white/40">{opt.phone}</div>
                      <div className={`mt-1 text-[10px] font-bold ${mergeKeepOpened === opt.keep ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {mergeKeepOpened === opt.keep ? 'Saqlanadi' : 'Bloklanadi'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mergeOther && !mergePreview && (
              <button
                onClick={runMergePreview}
                disabled={mergeBusy}
                className="btn-primary w-full rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                {mergeBusy ? '...' : 'Tekshirish (hech narsa o\'zgarmaydi)'}
              </button>
            )}

            {/* Quruq yurish natijasi */}
            {mergePreview && !mergePreview.can_merge && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300/70">Birlashtirib bo'lmaydi</div>
                <ul className="mt-1.5 space-y-1">
                  {(mergePreview.blockers || []).map((b, i) => (
                    <li key={i} className="text-[11px] font-bold text-rose-100">• {b}</li>
                  ))}
                </ul>
              </div>
            )}

            {mergePreview?.can_merge && (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Ko'chadigan ma'lumot</div>
                  <div className="mt-2 space-y-1.5">
                    {(mergePreview.moves || []).filter(m => m.move || m.skip).map(m => (
                      <div key={m.model} className="flex items-baseline justify-between gap-3">
                        <span className="text-[11px] font-semibold text-slate-300">{m.label}</span>
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-white">
                          {m.move} ta
                          {m.skip > 0 && (
                            <span className="ml-1.5 font-bold text-amber-400">({m.skip} ta o'tkazib yuboriladi)</span>
                          )}
                        </span>
                      </div>
                    ))}
                    {(mergePreview.totals?.move || 0) === 0 && (
                      <div className="text-[11px] font-semibold text-slate-500">Ko'chadigan yozuv yo'q</div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-2.5">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Tangalar</div>
                      <div className="mt-0.5 text-xs font-bold tabular-nums text-white">
                        {mergePreview.balances?.coins?.target} + {mergePreview.balances?.coins?.source} = {mergePreview.balances?.coins?.result}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Streak</div>
                      <div className="mt-0.5 text-xs font-bold tabular-nums text-white">
                        {mergePreview.balances?.streak_count?.result} kun
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ko'chirilmaydigan ma'lumot — admin buni bilib, kerak bo'lsa
                    mavjud vositalar bilan qo'lda hal qiladi. */}
                {(mergePreview.untouched || []).length > 0 && (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300/70">Ko'chirilmaydi</div>
                    <div className="mt-2 space-y-2">
                      {mergePreview.untouched.map(row => (
                        <div key={row.model}>
                          <div className="text-[11px] font-bold text-amber-100">{row.label} ({row.count} ta)</div>
                          <div className="text-[10px] font-semibold leading-relaxed text-amber-200/70">{row.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasdiqlash: bloklanadigan hisobning raqamini AYNAN yozish. */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Tasdiqlash uchun bloklanadigan hisob raqamini yozing: <span className="font-mono text-rose-300">{mergePreview.source?.phone}</span>
                  </label>
                  <input
                    value={mergeConfirmPhone}
                    onChange={(e) => setMergeConfirmPhone(e.target.value)}
                    placeholder={mergePreview.source?.phone || ''}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 font-mono text-xs font-semibold text-white placeholder:text-slate-600 focus:border-rose-500/50 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setMergeModal(null)}
                disabled={mergeBusy}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                Bekor qilish
              </button>
              {mergePreview?.can_merge && (
                <button
                  onClick={runMergeCommit}
                  disabled={mergeBusy || !mergeConfirmOk}
                  className="btn-danger flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
                >
                  {mergeBusy ? '...' : 'Birlashtirish'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {renderUserDetailModal()}
    </div>
  );

  const renderAnalytics = () => {
    // Recharts lazy chunk hali tushmagan bo'lsa, barcha diagrammalar
    // "Yuklanmoqda..." holatida turadi (metrik kartalar esa darrov ko'rinadi).
    const chartsLoading = !rechartsReady;
    const metrics = isApi ? apiMetricsRes.data : null;
    const metricsLoading = (isApi && apiMetricsRes.loading) || chartsLoading;
    // 403 (admin emas) yoki boshqa xato — backend diagrammalar o'rniga
    // "Ma'lumot yo'q" ko'rsatamiz. Foydalanuvchi o'sishi (frontend hisob)
    // baribir ishlaydi.
    const metricsFailed = isApi && !!apiMetricsRes.error;
    const hasMetrics = !!metrics && !metricsFailed;

    const prem = metrics?.premium || {};
    const conv = metrics?.conversion || {};
    const ret = metrics?.retention || {};
    const signups = metrics?.signups || {};

    // AreaChart datasi — userGrowthChart (allUsers'dan frontend'da hisoblangan).
    const growthData = userGrowthChart.labels.map((label, i) => ({
      label,
      count: userGrowthChart.values[i] || 0,
    }));

    // Yuqori metrik kartalar.
    const totalUsers = hasMetrics ? (prem.total_users || 0) : allUsers.length;
    const todayNew = hasMetrics ? (signups.last_1d || 0) : 0;
    const premiumPct = hasMetrics ? (prem.premium_pct || 0) : 0;
    const trialToPaidPct = hasMetrics ? (conv.trial_to_paid_pct || 0) : 0;

    // Premium breakdown (Pie): paid / faqat-trial / bepul.
    const paidFlag = prem.paid_flag || 0;
    const trialOnly = prem.trial_only || 0;
    const freeUsers = Math.max(0, (prem.total_users || 0) - paidFlag - trialOnly);
    const premiumPieData = [
      { label: 'Pullik', value: paidFlag, color: '#6366f1' },
      { label: 'Faqat trial', value: trialOnly, color: '#a855f7' },
      { label: 'Bepul', value: freeUsers, color: '#334155' },
    ];
    const premiumPieEmpty = !hasMetrics || (paidFlag + trialOnly + freeUsers) === 0;

    // Retention D1/D7/D30.
    const retentionData = [
      { label: 'D1', pct: ret.d1?.pct || 0 },
      { label: 'D7', pct: ret.d7?.pct || 0 },
      { label: 'D30', pct: ret.d30?.pct || 0 },
    ];

    // Konversiya funnel: Ro'yxatdan → Trial → Paid.
    const funnelData = [
      { label: "Ro'yxatdan o'tgan", value: prem.total_users || 0 },
      { label: 'Trial boshlagan', value: conv.trial_started || 0 },
      { label: "Paid bo'lgan", value: conv.paid_total || 0 },
    ];

    // ─── Kengaytirilgan diagrammalar uchun backend datasi ───
    // Har bir endpoint mustaqil: loading/error/empty alohida boshqariladi.
    // 403 (admin emas) yoki tarmoq xatosi → "Ma'lumot yo'q" ko'rsatamiz.
    const attemptsTrend = Array.isArray(apiAttemptsTrendRes.data) ? apiAttemptsTrendRes.data : [];
    const attemptsLoading = (isApi && apiAttemptsTrendRes.loading) || chartsLoading;
    const attemptsEmpty = !attemptsTrend.length || attemptsTrend.every(d => !d.count);

    const olympiadStats = Array.isArray(apiOlympiadStatsRes.data) ? apiOlympiadStatsRes.data : [];
    const olympiadStatsLoading = (isApi && apiOlympiadStatsRes.loading) || chartsLoading;

    const qStats = apiQuestionStatsRes.data || {};
    const qBySubject = Array.isArray(qStats.by_subject) ? qStats.by_subject : [];
    const qBySource = Array.isArray(qStats.by_source) ? qStats.by_source : [];
    const qStatsLoading = (isApi && apiQuestionStatsRes.loading) || chartsLoading;

    const revenueTrend = Array.isArray(apiRevenueTrendRes.data) ? apiRevenueTrendRes.data : [];
    const revenueLoading = (isApi && apiRevenueTrendRes.loading) || chartsLoading;
    const revenueEmpty = !revenueTrend.length || revenueTrend.every(d => !d.amount);

    const centerAnalytics = apiCenterAnalyticsRes.data || {};
    const byRegion = Array.isArray(centerAnalytics.by_region) ? centerAnalytics.by_region : [];
    const premiumVsFree = Array.isArray(centerAnalytics.premium_vs_free) ? centerAnalytics.premium_vs_free : [];
    const dqTrend = Array.isArray(centerAnalytics.dq_trend) ? centerAnalytics.dq_trend : [];
    const topCentersRating = Array.isArray(centerAnalytics.top_centers_rating) ? centerAnalytics.top_centers_rating : [];
    const centerAnalyticsLoading = (isApi && apiCenterAnalyticsRes.loading) || chartsLoading;
    const pvfEmpty = !premiumVsFree.length || premiumVsFree.every(d => !d.premium && !d.free);
    const dqEmpty = !dqTrend.length || dqTrend.every(d => !d.count);
    const ratingEmpty = !topCentersRating.length || topCentersRating.every(s => !(s.points || []).length);

    // Loading spinner — diagrammalar uchun bir xil ko'rinish (DRY).
    const loadingBox = (h = 200) => (
      <div className="flex items-center justify-center text-[11px] font-bold text-slate-500" style={{ height: `${h}px` }}>Yuklanmoqda...</div>
    );

    return (
      <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Tahlil</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Platforma statistikasi, o'sish va konversiya ko'rsatkichlari.</p>
        </div>

        {/* Yuqori metrik kartalar */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminMetricCard label="Jami foydalanuvchilar" value={totalUsers.toLocaleString()} delta={hasMetrics ? `${prem.active_users || 0} ta faol` : 'Mahalliy hisob'} icon={<Icon name="users" size={16} />} tone="indigo" />
          <AdminMetricCard label="Bugun yangi" value={hasMetrics ? todayNew.toLocaleString() : '—'} delta={hasMetrics ? `7 kunda ${signups.last_7d || 0} ta` : "Ma'lumot yo'q"} icon={<Icon name="chart" size={16} />} tone="emerald" />
          <AdminMetricCard label="Premium %" value={hasMetrics ? `${premiumPct}%` : '—'} delta={hasMetrics ? `${prem.premium_active || 0} ta faol premium` : "Ma'lumot yo'q"} icon={<Icon name="star" size={16} />} tone="amber" />
          <AdminMetricCard label="Trial → Paid" value={hasMetrics ? `${trialToPaidPct}%` : '—'} delta={hasMetrics ? `${conv.trial_to_paid || 0} / ${conv.trial_started || 0}` : "Ma'lumot yo'q"} icon={<Icon name="chart" size={16} />} tone="rose" />
        </div>

        {/* Diagramma 1 — Foydalanuvchi o'sishi (AreaChart) */}
        <ChartCard title="Foydalanuvchi o'sishi" subtitle="Oxirgi 6 oy bo'yicha yangi ro'yxatlar">
          {chartsLoading ? loadingBox(200) : <UserGrowthArea data={growthData} />}
        </ChartCard>

        {/* Diagramma 2 — Premium breakdown + Retention */}
        <div className="grid gap-5 xl:grid-cols-2">
          <ChartCard
            title="Premium taqsimoti"
            subtitle="Pullik / faqat trial / bepul nisbati"
            empty={!metricsLoading && premiumPieEmpty}
            emptyText={metricsFailed ? "Ma'lumot yo'q (admin huquqi kerak)" : "Ma'lumot yo'q"}
          >
            {metricsLoading
              ? <div className="flex h-[180px] items-center justify-center text-[11px] font-bold text-slate-500">Yuklanmoqda...</div>
              : <PremiumPie data={premiumPieData} total={(paidFlag + trialOnly + freeUsers).toLocaleString()} />}
          </ChartCard>

          <ChartCard
            title="Retention (D1 / D7 / D30)"
            subtitle="Ro'yxatdan o'tib N kundan keyin qaytganlar"
            empty={!metricsLoading && !hasMetrics}
            emptyText={metricsFailed ? "Ma'lumot yo'q (admin huquqi kerak)" : "Ma'lumot yo'q"}
          >
            {metricsLoading
              ? <div className="flex h-[174px] items-center justify-center text-[11px] font-bold text-slate-500">Yuklanmoqda...</div>
              : <RetentionBars data={retentionData} />}
          </ChartCard>
        </div>

        {/* Diagramma 3 — Konversiya funnel */}
        <ChartCard
          title="Konversiya funnel"
          subtitle="Ro'yxatdan o'tgan → Trial boshlagan → Paid bo'lgan"
          empty={!metricsLoading && !hasMetrics}
          emptyText={metricsFailed ? "Ma'lumot yo'q (admin huquqi kerak)" : "Ma'lumot yo'q"}
        >
          {metricsLoading
            ? <div className="flex h-[200px] items-center justify-center text-[11px] font-bold text-slate-500">Yuklanmoqda...</div>
            : <ConversionFunnel data={funnelData} />}
        </ChartCard>

        {/* ─── Sektion 2: Platforma faoliyati ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-500">Platforma faoliyati</h2>

          {/* Kunlik attemptlar — to'liq kenglik */}
          <ChartCard
            title="Kunlik test urinishlari"
            subtitle="Oxirgi 30 kun bo'yicha topshirilgan testlar"
            empty={!attemptsLoading && attemptsEmpty}
          >
            {attemptsLoading ? loadingBox(220) : <AttemptsTrendChart data={attemptsTrend} />}
          </ChartCard>

          {/* Top-10 olimpiada ishtiroki */}
          <ChartCard
            title="Eng faol olimpiadalar"
            subtitle="Ishtirokchilar soni bo'yicha top-10"
            empty={!olympiadStatsLoading && !olympiadStats.length}
          >
            {olympiadStatsLoading ? loadingBox(220) : <OlympiadParticipationChart data={olympiadStats} />}
          </ChartCard>
        </div>

        {/* ─── Sektion 3: Kontent tahlil ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-500">Kontent tahlil</h2>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Fan bo'yicha savollar"
              subtitle="Eng ko'p savol bo'lgan fanlar"
              empty={!qStatsLoading && !qBySubject.length}
            >
              {qStatsLoading ? loadingBox(200) : <QuestionBySubjectChart data={qBySubject} />}
            </ChartCard>

            <ChartCard
              title="Savol manbalari"
              subtitle="Qo'lda / AI / PDF / Import nisbati"
              empty={!qStatsLoading && !qBySource.length}
            >
              {qStatsLoading ? loadingBox(200) : <QuestionBySourceChart data={qBySource} />}
            </ChartCard>
          </div>
        </div>

        {/* ─── Sektion 4: Moliya ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-500">Moliya</h2>
          <ChartCard
            title="Oylik daromad"
            subtitle="Oxirgi 12 oy muvaffaqiyatli to'lovlar (so'm)"
            empty={!revenueLoading && revenueEmpty}
          >
            {revenueLoading ? loadingBox(220) : <RevenueTrendChart data={revenueTrend} />}
          </ChartCard>
        </div>

        {/* ─── Sektion 5: Markazlar ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-black uppercase tracking-wider text-slate-500">Markazlar</h2>
          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Viloyat bo'yicha markazlar"
              subtitle="Tasdiqlangan markazlar soni"
              empty={!centerAnalyticsLoading && !byRegion.length}
            >
              {centerAnalyticsLoading ? loadingBox(200) : <CentersByRegionChart data={byRegion} />}
            </ChartCard>

            <ChartCard
              title="Premium vs Bepul faollik"
              subtitle="Oxirgi 6 oy oylik olimpiada soni"
              empty={!centerAnalyticsLoading && pvfEmpty}
            >
              {centerAnalyticsLoading ? loadingBox(220) : <PremiumVsFreeChart data={premiumVsFree} />}
            </ChartCard>

            <ChartCard
              title="Diskvalifikatsiya dinamikasi"
              subtitle="Oxirgi 8 hafta cheating/DQ holatlari"
              empty={!centerAnalyticsLoading && dqEmpty}
            >
              {centerAnalyticsLoading ? loadingBox(220) : <DqTrendChart data={dqTrend} />}
            </ChartCard>

            <ChartCard
              title="Top markazlar reytingi"
              subtitle="Eng yuqori 5 markaz rating dinamikasi"
              empty={!centerAnalyticsLoading && ratingEmpty}
            >
              {centerAnalyticsLoading ? loadingBox(240) : <TopCentersRatingChart series={topCentersRating} />}
            </ChartCard>
          </div>
        </div>
      </div>
    );
  };

  // Amallar tarixi (audit jurnali). Backend AuditLog'ni server tomonda
  // sahifalaydi va filtrlaydi — bu yerda mahalliy filtr yo'q, aks holda
  // faqat joriy sahifa ichida qidirilgan bo'lardi.
  const renderLogs = () => {
    const res = isApi ? apiAuditRes.data : null;
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const total = typeof res?.count === 'number' ? res.count : rows.length;
    const lastPage = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    const failed = isApi && !!apiAuditRes.error;
    return (
      <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-[20px] font-black leading-tight text-white">Amallar tarixi</h1>
            <p className="mt-1 text-[11px] font-bold text-slate-400">
              Admin va tashkilot rahbarlari bajargan muhim amallar: kim, qachon, kimga va qaysi IP dan.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={auditSearch}
              onChange={e => { setAuditSearch(e.target.value); setAuditPage(1); }}
              className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
              placeholder="Ism, amal kodi, IP yoki ID bo'yicha..." />
          </div>
        </div>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[860px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {['Vaqt', 'Kim', 'Amal', 'Obyekt', 'IP'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {!isApi ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Amallar tarixi faqat API rejimida ko'rinadi</td></tr>
                ) : apiAuditRes.loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">{auditSearch ? 'Qidiruv natijasi topilmadi' : 'Yozuvlar yo\'q'}</td></tr>
                ) : rows.map(log => (
                  <tr key={log.id} className="text-xs admin-table-row text-slate-300">
                    <td className="px-5 py-4 font-semibold text-slate-400 whitespace-nowrap">{formatAdminDateTime(log.created_at)}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><AdminInitial name={log.actor} /><span className="font-bold text-white">{log.actor}</span></div></td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                        {log.action_label || log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-400">
                      {log.target_name || (log.target_id ? `${log.target_type || 'Obyekt'} #${log.target_id}` : '—')}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-slate-400">{log.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/* Server tomon paginatsiya — jurnal cheksiz o'sadi, hammasi bir yo'la yuklanmaydi. */}
        {total > AUDIT_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setAuditPage(p => Math.max(1, p - 1))}
              disabled={apiAuditRes.loading || auditPage <= 1}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="chevronRight" size={12} className="rotate-180" /> Oldingisi
            </button>
            <div className="px-3 py-2 rounded-xl bg-white/5 text-[11px] font-bold text-white/60 tabular-nums">
              {auditPage} / {lastPage}
            </div>
            <button
              onClick={() => setAuditPage(p => Math.min(lastPage, p + 1))}
              disabled={apiAuditRes.loading || auditPage >= lastPage}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingisi <Icon name="chevronRight" size={12} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Xavfsizlik tabi ───────────────────────────────────────────────────────
  // Tab bir nechta MUSTAQIL kuzatuv blokini birlashtiradi. Umumiy qobiq
  // (sarlavha + segment tugmalari + tanlangan bo'lim) bitta joyda turadi,
  // har bir blok esa o'z renderer'ida: yangisini qo'shish uchun
  // SECURITY_SECTIONS ga element va quyidagi `securitySectionRenderers` ga
  // o'sha kalitli funksiya qo'shiladi, qobiqqa tegilmaydi.

  // Ro'yxatdagi hisobni "Foydalanuvchilar" tabining "Batafsil" oynasida
  // ochadi. Bu yerda alohida profil oynasi yasalmaydi: blok, ogohlantirish,
  // seanslar — hammasi o'sha oynada, ikkinchi nusxasi ajralib qolardi.
  const openUserFromSecurity = (userId) => {
    const row = userRows.find(r => r.backendId === userId);
    if (!row) {
      // Platforma adminlari `allUsers` ga umuman kirmaydi (ro'yxat ularni
      // chiqarib tashlaydi) — bunday hisob uchun "Batafsil" oynasi yo'q.
      showToast("Bu hisob foydalanuvchilar ro'yxatida yo'q");
      return;
    }
    setSharedIpDetailAddress(null);
    setDetailUser(row);
    setPage('users');
  };

  // Bayroqni yopish. Tasdiqlash oynasi bor: backend yopilgan bayroqni qayta
  // ochishga ruxsat bermaydi (400), ya'ni amal qaytarilmaydi — va aynan shu
  // oyna ixtiyoriy izohni yozib qolish uchun yagona joy.
  const askResolveFlag = (flag, status) => {
    setFlagResolveNote('');
    setFlagResolveArchive(false);
    setFlagResolve({ flag, status });
  };

  // Arxivlash faqat 'resolved' qarorli SAVOL bayrog'ida taklif qilinadi:
  // "rad etildi" degani yolg'on signal, savolga chora ko'rilmaydi.
  const canArchiveFlag = flagResolve?.flag.flag_type === 'question'
    && flagResolve?.status === 'resolved';

  const submitResolveFlag = () => {
    if (!flagResolve || flagResolveBusy) return;
    setFlagResolveBusy(true);
    OlympyApi.adminResolveModerationFlag(
      flagResolve.flag.id,
      {
        status: flagResolve.status,
        note: flagResolveNote.trim(),
        archive: canArchiveFlag && flagResolveArchive,
      },
      OlympyApi.getToken(),
    )
      .then(res => {
        showToast(res?.archived
          ? 'Bayroq yopildi, savol arxivlandi'
          : flagResolve.status === 'resolved' ? 'Bayroq hal qilindi' : 'Bayroq rad etildi');
        setFlagResolve(null);
        apiModerationRes.reload();
      })
      .catch(err => {
        console.warn('adminResolveModerationFlag failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setFlagResolveBusy(false));
  };

  const renderSharedIpSection = () => {
    const res = isApi ? apiSharedIpRes.data : null;
    const rows = Array.isArray(res?.results) ? res.results : [];
    const failed = isApi && !!apiSharedIpRes.error;
    // Backend filtrni o'z chegaralariga siqishi mumkin — ekranda AYNAN
    // qo'llanilgan qiymat ko'rsatiladi.
    const appliedMinAccounts = res?.min_accounts ?? sharedIpMinAccounts;
    const appliedDays = res?.window_days ?? sharedIpDays;
    // Oyna uchun javob AYNAN ochilgan IP'niki ekanini tekshiramiz: ketma-ket
    // ochilgan IP'larda eski ro'yxat ko'rinib qolmasin. `res.loading` yolg'iz
    // yetarli emas — useApiData effekti render'dan KEYIN ishga tushadi
    // ("Batafsil" oynasidagi bloklar bilan bir xil naqsh).
    const detail = isApi && apiSharedIpDetailRes.data?.ip_address === sharedIpDetailAddress
      ? apiSharedIpDetailRes.data
      : null;
    const detailRows = Array.isArray(detail?.accounts) ? detail.accounts : [];
    const detailLoading = apiSharedIpDetailRes.loading || (!detail && !apiSharedIpDetailRes.error);
    return (
      <>
        <section className="admin-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Kamida nechta hisob</label>
              <div className="flex flex-wrap gap-2">
                {SHARED_IP_MIN_ACCOUNT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSharedIpMinAccounts(opt)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      sharedIpMinAccounts === opt
                        ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}>
                    {opt} ta
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Qaysi davr uchun</label>
              <div className="flex flex-wrap gap-2">
                {SHARED_IP_DAY_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSharedIpDays(opt)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      sharedIpDays === opt
                        ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}>
                    {opt} kun
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/40 leading-relaxed">
            Bir manzil ortida bir nechta hisob bo'lishi o'z-o'zicha qoidabuzarlik emas:
            markaz kompyuter sinfi, oila Wi-Fi'si yoki mobil operator tarmog'i ham
            bir xil IP beradi. Ro'yxat faqat qo'lda tekshirish uchun nomzod beradi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[760px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {['IP manzil', 'Hisoblar', 'Birinchi kirish', 'Oxirgi kirish', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {!isApi ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiSharedIpRes.loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                    Oxirgi {appliedDays} kunda {appliedMinAccounts} tadan ko'p hisob kirgan IP topilmadi
                  </td></tr>
                ) : rows.map(row => (
                  <tr key={row.ip_address} className="text-xs admin-table-row text-slate-300">
                    <td className="px-5 py-4 font-mono text-[11px] font-bold text-white">{row.ip_address}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        {row.distinct_users} ta hisob
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-400 whitespace-nowrap">{formatAdminDateTime(row.first_seen)}</td>
                    <td className="px-5 py-4 font-semibold text-slate-400 whitespace-nowrap">{formatAdminDateTime(row.last_seen)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSharedIpDetailAddress(row.ip_address)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition">
                        <Icon name="eye" size={12} /> Ko'rish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <Modal
          open={!!sharedIpDetailAddress}
          onClose={() => setSharedIpDetailAddress(null)}
          title="Shu IP'dan kirgan hisoblar"
          width="max-w-xl"
        >
          <div className="mb-4 rounded-xl bg-white/5 px-4 py-3 font-mono text-sm font-bold text-white">
            {sharedIpDetailAddress}
          </div>
          <div className="max-h-80 overflow-y-auto admin-scroll divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
            {detailLoading ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Yuklanmoqda...</div>
            ) : apiSharedIpDetailRes.error ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</div>
            ) : detailRows.length === 0 ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-slate-500">Hisoblar topilmadi</div>
            ) : detailRows.map(acc => (
              <div key={acc.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={acc.full_name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-white">{acc.full_name}</div>
                  <div className="font-mono text-[10px] text-white/40">{maskPhoneDisplay(acc.phone, '')}</div>
                </div>
                <div className="text-right">
                  <AdminPill status={acc.is_active ? 'approved' : 'rejected'}>
                    {acc.is_active ? 'Faol' : 'Bloklangan'}
                  </AdminPill>
                  <div className="mt-1 text-[10px] font-semibold text-slate-500 whitespace-nowrap">
                    {formatAdminDateTime(acc.last_login_at)}
                  </div>
                </div>
                <button
                  onClick={() => openUserFromSecurity(acc.user_id)}
                  className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition">
                  Batafsil
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setSharedIpDetailAddress(null)}
            className="btn-ghost mt-5 w-full rounded-xl py-3 text-xs font-bold">
            Yopish
          </button>
        </Modal>
      </>
    );
  };

  const renderAutoFlagsSection = () => {
    const res = isApi ? apiModerationRes.data : null;
    const rows = Array.isArray(res?.results) ? res.results : [];
    const total = typeof res?.count === 'number' ? res.count : rows.length;
    const lastPage = Math.max(1, Math.ceil(total / MODERATION_PAGE_SIZE));
    const failed = isApi && !!apiModerationRes.error;
    return (
      <>
        <section className="admin-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Holat</label>
              <div className="flex flex-wrap gap-2">
                {MODERATION_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setFlagStatus(opt.key); setFlagPage(1); }}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      flagStatus === opt.key
                        ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Bayroq turi</label>
              <div className="flex flex-wrap gap-2">
                {MODERATION_FLAG_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.key || 'all'}
                    type="button"
                    onClick={() => { setFlagType(opt.key); setFlagPage(1); }}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      flagType === opt.key
                        ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/40 leading-relaxed">
            Bayroqlarni har soatda ishlaydigan avtomatik tekshiruv qo'yadi. Hech qanday
            chora avtomatik ko'rilmaydi: "Hal qilindi" — tekshirib chora ko'rildi,
            "Rad etildi" — yolg'on signal. Yopilgan bayroqni qayta ochib bo'lmaydi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[900px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {['Vaqt', 'Tur', 'Sabab', 'Kim qo\'ydi', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {!isApi ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiModerationRes.loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Bayroqlar yo'q</td></tr>
                ) : rows.map(flag => (
                  <tr key={flag.id} className="text-xs admin-table-row text-slate-300">
                    <td className="px-5 py-4 font-semibold text-slate-400 whitespace-nowrap">{formatAdminDateTime(flag.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                        {flag.flag_type_label || flag.flag_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-white">
                      {flag.reason}
                      {/* Savol bayrog'ida — bayroq qo'yilgan paytdagi savol
                          NUSXASI (`extra`). Savol keyin tahrirlangan yoki
                          o'chirilgan bo'lsa ham tekshiruvchi asl matnni ko'radi. */}
                      {flag.flag_type === 'question' && flag.extra?.text && (
                        <div className="mt-1.5 max-w-md whitespace-pre-wrap text-[11px] font-medium text-slate-400">
                          {flag.extra.text}
                          {Array.isArray(flag.extra.options) && flag.extra.options.length > 0 && (
                            <div className="mt-1 text-slate-500">
                              {flag.extra.options.map((opt, i) => (
                                <span key={i} className={i === flag.extra.correct_answer ? 'text-emerald-400' : undefined}>
                                  {i > 0 ? ' · ' : ''}{opt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-400">{flag.raised_by}</td>
                    <td className="px-5 py-4">
                      <AdminPill status={MODERATION_STATUS_PILL[flag.status]}>
                        {flag.status_label || flag.status}
                      </AdminPill>
                    </td>
                    <td className="px-5 py-4">
                      {flag.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => askResolveFlag(flag, 'resolved')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition">
                            <Icon name="check" size={12} /> Hal qilindi
                          </button>
                          <button
                            onClick={() => askResolveFlag(flag, 'dismissed')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white transition">
                            <Icon name="x" size={12} /> Rad etish
                          </button>
                        </div>
                      ) : (
                        // Yopilgan qatorda tugma o'rniga qaror izi: kim yopgan
                        // va qanday izoh qoldirgan.
                        <div className="text-[11px] font-semibold text-slate-500">
                          {flag.resolved_by || '—'}
                          {flag.resolution_note ? ` · ${flag.resolution_note}` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/* Server tomon paginatsiya — navbat cheksiz o'sadi (amallar tarixidagidek). */}
        {total > MODERATION_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setFlagPage(p => Math.max(1, p - 1))}
              disabled={apiModerationRes.loading || flagPage <= 1}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="chevronRight" size={12} className="rotate-180" /> Oldingisi
            </button>
            <div className="px-3 py-2 rounded-xl bg-white/5 text-[11px] font-bold text-white/60 tabular-nums">
              {flagPage} / {lastPage}
            </div>
            <button
              onClick={() => setFlagPage(p => Math.min(lastPage, p + 1))}
              disabled={apiModerationRes.loading || flagPage >= lastPage}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingisi <Icon name="chevronRight" size={12} />
            </button>
          </div>
        )}
        <Modal
          open={!!flagResolve}
          onClose={() => !flagResolveBusy && setFlagResolve(null)}
          title={flagResolve?.status === 'resolved' ? 'Bayroqni yopish' : 'Bayroqni rad etish'}
        >
          <div className="mb-5 rounded-xl bg-white/5 px-4 py-3">
            <div className="text-sm font-bold text-white">{flagResolve?.flag.reason}</div>
            <div className="mt-1 text-[11px] font-semibold text-white/40">
              {flagResolve?.flag.flag_type_label} · {formatAdminDateTime(flagResolve?.flag.created_at)}
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-xs text-white/50 mb-1.5 font-medium">Izoh (ixtiyoriy)</label>
            <textarea
              value={flagResolveNote}
              onChange={e => setFlagResolveNote(e.target.value)}
              rows={3}
              maxLength={255}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Masalan: markaz kompyuter sinfi, qoidabuzarlik yo'q"
            />
            <p className="mt-2 text-[11px] text-white/40 leading-relaxed">
              Faqat moderatsiya tarixiga yoziladi — foydalanuvchi buni ko'rmaydi.
            </p>
          </div>
          {/* Savol bayrog'i uchun ixtiyoriy chora. Belgilanmasa savolga
              umuman tegilmaydi: bayroq faqat navbatdan yopiladi. */}
          {canArchiveFlag && (
            <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl bg-white/5 px-4 py-3">
              <input
                type="checkbox"
                checked={flagResolveArchive}
                onChange={e => setFlagResolveArchive(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-white/15 bg-white/5 text-indigo-500 focus:ring-indigo-500/30"
              />
              <span>
                <span className="block text-xs font-bold text-white">Savolni arxivlash</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/40">
                  Savol markaz bankidan olib tashlanadi va yangi olimpiadaga tanlanmaydi.
                  Mavjud natijalar va baholar saqlanib qoladi.
                </span>
              </span>
            </label>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setFlagResolve(null)}
              disabled={flagResolveBusy}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
              Bekor qilish
            </button>
            <button
              onClick={submitResolveFlag}
              disabled={flagResolveBusy}
              className="btn-primary flex-1 rounded-xl py-3 font-semibold text-xs font-bold disabled:opacity-50">
              {flagResolveBusy ? '...' : 'Tasdiqlash'}
            </button>
          </div>
        </Modal>
      </>
    );
  };

  const renderCheatingOverviewSection = () => {
    const res = isApi ? apiCheatingRes.data : null;
    const rows = Array.isArray(res?.results) ? res.results : [];
    const total = typeof res?.count === 'number' ? res.count : rows.length;
    const lastPage = Math.max(1, Math.ceil(total / CHEATING_PAGE_SIZE));
    const failed = isApi && !!apiCheatingRes.error;
    return (
      <>
        <section className="admin-card p-5">
          {/* Har bir filtr o'zgarishida birinchi sahifaga qaytamiz — aks holda
              3-sahifada turib filtrlansa bo'sh ro'yxat ko'rinardi. */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Markaz</label>
              <select
                value={cheatingCenterId}
                onChange={e => { setCheatingCenterId(e.target.value); setCheatingPage(1); }}
                className="h-9 w-full admin-input px-2 text-xs outline-none">
                <option value="">Barcha markazlar</option>
                {centers.map(c => (
                  <option key={c.id} value={c.backendId ?? c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Holat</label>
              <select
                value={cheatingStatus}
                onChange={e => { setCheatingStatus(e.target.value); setCheatingPage(1); }}
                className="h-9 w-full admin-input px-2 text-xs outline-none">
                {CHEATING_STATUS_OPTIONS.map(opt => (
                  <option key={opt.key || 'all'} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Sana oralig'i</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={cheatingDateFrom}
                  onChange={e => { setCheatingDateFrom(e.target.value); setCheatingPage(1); }}
                  className="h-9 w-full admin-input px-2 text-xs outline-none" />
                <input
                  type="date"
                  value={cheatingDateTo}
                  onChange={e => { setCheatingDateTo(e.target.value); setCheatingPage(1); }}
                  className="h-9 w-full admin-input px-2 text-xs outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Qidiruv</label>
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={cheatingSearch}
                  onChange={e => { setCheatingSearch(e.target.value); setCheatingPage(1); }}
                  className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
                  placeholder="Ism yoki telefon..." />
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-white/40 leading-relaxed">
            Barcha markazlar bo'yicha diskvalifikatsiya qilingan va tekshiruv kutayotgan
            sessiyalar. Ro'yxat faqat ko'rish uchun: qaror (diskvalifikatsiya yoki davom
            ettirish) o'sha olimpiadaning menejer panelidagi jonli kuzatuv ekranida
            qabul qilinadi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[1100px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {["O'quvchi", 'Olimpiada', 'Markaz', 'Holat', 'Sabab', 'Vaqt', 'Kim qaror qildi', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {!isApi ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiCheatingRes.loading ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Firibgarlik holatlari topilmadi</td></tr>
                ) : rows.map(row => {
                  const meta = CHEATING_STATUS_META[row.status];
                  return (
                    <tr key={row.session_id} className="text-xs admin-table-row text-slate-300">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.student_name} size={34} />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-white">{row.student_name}</div>
                            <div className="font-mono text-[10px] text-white/40">{maskPhoneDisplay(row.student_phone, '')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-400">{row.olympiad_title}</td>
                      <td className="px-5 py-4 font-semibold text-slate-400">{row.center_name}</td>
                      <td className="px-5 py-4">
                        <AdminPill status={meta?.pill}>{meta?.label || row.status}</AdminPill>
                      </td>
                      {/* Sabab kodini o'zbekchaga menejer panelidagi bir xil
                          xarita aylantiradi (yagona manba) — noma'lum kod xom
                          holda ko'rinadi. */}
                      <td className="px-5 py-4 font-semibold text-slate-400">{cheatingReasonLabel(row.cheating_reason) || '—'}</td>
                      {/* Diskvalifikatsiyada — DQ vaqti, kutayotganda esa
                          tekshiruv so'ralgan vaqt (backend ro'yxatni AYNAN shu
                          vaqt bo'yicha tartiblaydi). */}
                      <td className="px-5 py-4 font-semibold text-slate-400 whitespace-nowrap">
                        {formatAdminDateTime(row.disqualified_at || row.review_requested_at)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-400">
                        {row.reviewed_by_name || (row.reviewed_at ? 'Tizim' : '—')}
                      </td>
                      {/* Jonli kuzatuv ekraniga to'g'ridan-to'g'ri havola yo'q:
                          u menejer panelining ichki holati (`liveOlympiadId`),
                          URL'ga yozilmaydi va menejer huquqini talab qiladi.
                          Shuning uchun havola o'rniga qayerga borishni
                          ko'rsatamiz — buzilgan link berishdan ko'ra aniqroq. */}
                      <td className="px-5 py-4">
                        <span
                          title={`Olimpiada: ${row.olympiad_title} (markaz: ${row.center_name})`}
                          className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                          Menejer panelida ko'ring
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {/* Server tomon paginatsiya — ro'yxat platforma o'sishi bilan cheksiz
            o'sadi (moderatsiya navbatidagidek). */}
        {total > CHEATING_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setCheatingPage(p => Math.max(1, p - 1))}
              disabled={apiCheatingRes.loading || cheatingPage <= 1}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="chevronRight" size={12} className="rotate-180" /> Oldingisi
            </button>
            <div className="px-3 py-2 rounded-xl bg-white/5 text-[11px] font-bold text-white/60 tabular-nums">
              {cheatingPage} / {lastPage}
            </div>
            <button
              onClick={() => setCheatingPage(p => Math.min(lastPage, p + 1))}
              disabled={apiCheatingRes.loading || cheatingPage >= lastPage}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingisi <Icon name="chevronRight" size={12} />
            </button>
          </div>
        )}
      </>
    );
  };

  const securitySectionRenderers = {
    'shared-ip': renderSharedIpSection,
    'auto-flags': renderAutoFlagsSection,
    cheating: renderCheatingOverviewSection,
  };

  const renderSecurity = () => {
    const activeSection = securitySectionRenderers[securitySection]
      ? securitySection
      : SECURITY_SECTIONS[0].key;
    return (
      <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Xavfsizlik</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            Foydalanuvchi hisoblari bo'yicha kuzatuv bloklari. Hech bir blok avtomatik
            chora ko'rmaydi — qaror adminniki.
          </p>
        </div>
        {/* Bo'limlar segmenti. Bitta bo'limda ham ko'rinadi: tab bir nechta
            blokdan iborat ekani darhol o'qiladi va keyingisi qo'shilganda
            joylashuv o'zgarmaydi. */}
        <div className="flex flex-wrap gap-2">
          {SECURITY_SECTIONS.map(section => (
            <button
              key={section.key}
              type="button"
              onClick={() => setSecuritySection(section.key)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                activeSection === section.key
                  ? 'bg-indigo-600 text-white border-indigo-600 font-extrabold shadow'
                  : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
              }`}>
              {section.label}
            </button>
          ))}
        </div>
        {securitySectionRenderers[activeSection]()}
      </div>
    );
  };

  const renderOlympiads = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Musobaqalar</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Platformadagi olimpiada va musobaqalar ro'yxati.</p>
      </div>
      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[860px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {['Tadbir', 'Tashkilot', 'Fan', 'Daraja', 'Test turi', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(() => {
                const olympiadList = isApi ? (apiOlympiads || []) : store.olympiads;
                if (olympiadList.length === 0) {
                  return <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Hali tadbirlar yo'q</td></tr>;
                }
                return olympiadList.map(o => {
                  const center = centers.find(c => String(c.id) === String(o.centerId));
                  return (
                    <tr key={o.id} className="text-xs admin-table-row text-slate-300">
                      <td className="px-5 py-4 font-bold text-white">{o.title}</td>
                      <td className="px-5 py-4 font-semibold text-slate-400">{center?.name || '—'}</td>
                      <td className="px-5 py-4"><span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">{o.subject}</span></td>
                      <td className="px-5 py-4">{o.testLevel ? <span className="rounded-md bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400">{o.testLevel}</span> : <span className="text-slate-500">—</span>}</td>
                      <td className="px-5 py-4">{o.testType ? <span className="rounded-md bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">{testTypeLabel(o.testType)}</span> : <span className="text-slate-500">—</span>}</td>
                      <td className="px-5 py-4 font-semibold text-slate-400">{o.startDate || '—'}</td>
                      <td className="px-5 py-4 font-bold text-slate-300">{o.participants || 0}</td>
                      <td className="px-5 py-4"><AdminPill status={o.status} /></td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderSubjects = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Fanlar</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Platformada ishlatiladigan fan kategoriyalari.</p>
      </div>
      <section className="admin-card p-5">
        <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Yangi fan qo'shish</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="h-10 flex-1 admin-input px-3 text-xs outline-none"
            placeholder="Fan nomi" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} />
          <button onClick={() => {
            const name = newSubjectName.trim();
            if (!name) return;
            if (subjects.includes(name)) { showToast(`"${name}" allaqachon mavjud`); return; }
            if (isApi) {
              OlympyApi.createSubject(name, OlympyApi.getToken())
                .then(() => { apiSubjectsRes.reload(); setNewSubjectName(''); showToast(`"${name}" qo'shildi`); })
                .catch(err => { console.warn('createSubject failed:', err); showToast(OlympyApi.toUserMessage(err)); });
              return;
            }
            OlympyStore.addSubject(name);
            setNewSubjectName('');
            showToast(`"${name}" qo'shildi`);
          }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)] transition">
            <Icon name="plus" size={14} /> Qo'shish
          </button>
        </div>
      </section>
      <section className="admin-card p-5">
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <span key={s} className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-xs font-bold text-indigo-400">
              {s}
            </span>
          ))}
        </div>
      </section>
    </div>
  );

  // AI Support States & Hooks
  const [supportThreads, setSupportThreads] = React.useState([]);
  const [selectedThread, setSelectedThread] = React.useState(null);
  const [threadMessages, setThreadMessages] = React.useState([]);
  const [loadingThreads, setLoadingThreads] = React.useState(false);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [adminReplyText, setAdminReplyText] = React.useState('');
  const [sendingAdminReply, setSendingAdminReply] = React.useState(false);

  const handleSendAdminReply = async (e) => {
    if (e) e.preventDefault();
    if (!adminReplyText.trim() || !selectedThread) return;
    setSendingAdminReply(true);
    const token = OlympyApi.getToken();
    try {
      await OlympyApi.sendAdminSupportReply(selectedThread.chat_key, adminReplyText, token);
      setAdminReplyText('');
      // Xabarlar ro'yxatini yangilaymiz
      loadThreadDetail(selectedThread.chat_key);
    } catch (err) {
      console.error('Failed to send admin reply:', err);
      // Telegram WebView'da alert() window.confirm() kabi ishonchsiz —
      // boshqa xato holatlari kabi toast ishlatiladi.
      showToast(OlympyApi.toUserMessage?.(err) || 'Javob yuborishda xatolik yuz berdi.');
    } finally {
      setSendingAdminReply(false);
    }
  };

  const loadSupportThreads = React.useCallback(() => {
    setLoadingThreads(true);
    const token = OlympyApi.getToken();
    OlympyApi.getAdminSupportChats(token)
      .then(res => {
        setSupportThreads(res.threads || []);
      })
      .catch(err => {
        console.error('Failed to load support threads:', err);
      })
      .finally(() => {
        setLoadingThreads(false);
      });
  }, []);

  const loadThreadDetail = React.useCallback((userId) => {
    setLoadingMessages(true);
    const token = OlympyApi.getToken();
    OlympyApi.getAdminSupportChatDetail(userId, token)
      .then(res => {
        setThreadMessages(res.messages || []);
      })
      .catch(err => {
        console.error('Failed to load thread detail:', err);
      })
      .finally(() => {
        setLoadingMessages(false);
      });
  }, []);

  React.useEffect(() => {
    if (page === 'support') {
      loadSupportThreads();
    }
  }, [page, loadSupportThreads]);

  React.useEffect(() => {
    if (selectedThread) {
      loadThreadDetail(selectedThread.chat_key);
    } else {
      setThreadMessages([]);
    }
  }, [selectedThread, loadThreadDetail]);

  const renderSupport = () => (
    <div className="min-h-[calc(100vh-54px)] p-[18px] flex flex-col space-y-[14px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">AI Support Yozishmalari</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Foydalanuvchilarning sun'iy intellekt yordamchisi bilan qilgan suhbatlari tarixi.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[500px]">
        {/* Thread list */}
        <div className="admin-card p-4 flex flex-col h-[600px] overflow-hidden">
          <h2 className="text-xs font-black tracking-wider uppercase text-slate-300 mb-3 flex items-center justify-between">
            Suhbatlar
            <button onClick={loadSupportThreads} className="p-1 rounded bg-white/5 hover:bg-white/10 text-indigo-400 transition cursor-pointer" title="Yangilash">
              <Icon name="chevronRight" size={12} className="rotate-90" />
            </button>
          </h2>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 admin-scroll">
            {loadingThreads ? (
              <div className="py-8 text-center text-xs text-slate-500 font-semibold">Yuklanmoqda...</div>
            ) : supportThreads.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-semibold">Murojaatlar topilmadi</div>
            ) : (
              supportThreads.map(t => {
                const isSelected = selectedThread?.chat_key === t.chat_key;
                return (
                  <button
                    key={t.chat_key}
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/10 border-indigo-500/30 text-white'
                        : 'bg-white/[0.01] border-white/5 hover:border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs truncate">{t.full_name || 'Noma\'lum user'}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{t.phone}</div>
                    <div className="text-[11px] text-slate-400 truncate mt-1.5 font-medium">
                      <span className="text-[9px] font-extrabold uppercase mr-1 opacity-70">
                        {t.last_message_role === 'user' ? 'Foydalanuvchi' : 'AI Yordamchi'}:
                      </span>
                      {t.last_message}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="admin-card flex flex-col h-[600px] overflow-hidden p-0">
          {selectedThread ? (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div>
                  <h3 className="text-sm font-extrabold text-white">{selectedThread.full_name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">{selectedThread.phone}</p>
                </div>
                <button
                  onClick={() => loadThreadDetail(selectedThread.chat_key)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-xs font-bold text-indigo-400 transition cursor-pointer"
                >
                  Yangilash
                </button>
              </div>

              {/* Message history */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 admin-scroll">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500 font-semibold">Yuklanmoqda...</div>
                ) : (
                  threadMessages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    const isAdmin = m.role === 'admin';
                    return (
                      <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : isAdmin
                              ? 'bg-amber-600/10 text-amber-200 border border-amber-500/20 rounded-tl-none font-semibold'
                              : 'bg-white/5 text-slate-300 border border-white/5 rounded-tl-none'
                          }`}
                        >
                          <div className="font-semibold mb-1 opacity-60 text-[9px] uppercase tracking-wider">
                            {isUser ? 'Foydalanuvchi' : isAdmin ? 'Platform Admin (Siz)' : 'AI Yordamchi'} · {new Date(m.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          {m.text.split('\n').map((line, lIdx) => (
                            <React.Fragment key={lIdx}>
                              {line}
                              {lIdx < m.text.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendAdminReply} className="p-4 border-t border-white/5 bg-white/[0.01] flex gap-2">
                <input
                  type="text"
                  value={adminReplyText}
                  onChange={e => setAdminReplyText(e.target.value)}
                  className="flex-1 h-9 px-3 bg-white/5 border border-white/5 rounded-xl text-xs text-white outline-none focus:border-indigo-500/30 transition"
                  placeholder="Foydalanuvchiga javob yozing..."
                  disabled={sendingAdminReply}
                />
                <button
                  type="submit"
                  disabled={sendingAdminReply || !adminReplyText.trim()}
                  className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {sendingAdminReply ? 'Yuborilmoqda...' : 'Yuborish'}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <span className="text-4xl mb-3">💬</span>
              <h3 className="text-sm font-extrabold text-slate-400">Suhbat tanlanmagan</h3>
              <p className="text-[10px] text-slate-500 max-w-xs mt-1 font-semibold">Foydalanuvchilar suhbat tarixini ko'rish uchun chap tomondagi ro'yxatdan birorta suhbatni tanlang.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Sozlamalar</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Profil ma'lumotlari va parolni o'zgartirish.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Profil Sozlamalari */}
        <section className="admin-card p-5 space-y-4">
          <h2 className="text-xs font-black tracking-wider uppercase text-slate-300 mb-2 flex items-center gap-2">
            <Icon name="edit" size={14} className="text-indigo-400" />
            Profil Sozlamalari
          </h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Ism</label>
              <input
                type="text"
                value={editFirstName}
                onChange={e => setEditFirstName(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Ismingizni kiriting"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Familiya</label>
              <input
                type="text"
                value={editLastName}
                onChange={e => setEditLastName(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Familiyangizni kiriting"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Username</label>
              <input
                type="text"
                value={editUsername}
                onChange={e => setEditUsername(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Username kiriting"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Telefon Raqami</label>
              <input
                type="text"
                value={user?.phone || ''}
                readOnly
                disabled
                className="h-9 w-full admin-input px-3 text-xs outline-none opacity-60 cursor-not-allowed"
                placeholder="+998901234567"
              />
              <div className="text-[10px] text-slate-500 mt-1">Telefon raqamini tasdiqsiz o'zgartirib bo'lmaydi.</div>
            </div>
            <button
              type="submit"
              disabled={savingProfile}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-xs font-bold transition disabled:opacity-50"
            >
              {savingProfile ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </form>
        </section>

        {/* Parolni Yangilash */}
        <section className="admin-card p-5 space-y-4">
          <h2 className="text-xs font-black tracking-wider uppercase text-slate-300 mb-2 flex items-center gap-2">
            <Icon name="shield" size={14} className="text-emerald-400" />
            Parolni O'zgartirish
          </h2>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Joriy Parol</label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Joriy parolingizni kiriting"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Yangi Parol</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Yangi parol kiriting"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Yangi Parolni Tasdiqlash</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="Yangi parolni qayta kiriting"
              />
            </div>
            <button
              type="submit"
              disabled={savingPassword}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-bold transition disabled:opacity-50"
            >
              {savingPassword ? "Yangilanmoqda..." : "Parolni Yangilash"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );

  const pageRenderers = {
    home: renderHome,
    requests: renderRequests,
    centers: renderCenters,
    users: renderUsers,
    analytics: renderAnalytics,
    logs: renderLogs,
    security: renderSecurity,
    olympiads: renderOlympiads,
    subjects: renderSubjects,
    settings: renderSettings,
    support: renderSupport,
    myprofile: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} />,
  };

  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'users'),
    navItems.find(n => n.key === 'centers'),
    navItems.find(n => n.key === 'requests'),
  ].filter(Boolean);

  return (
    <div className="h-screen overflow-hidden admin-bg text-slate-100">
      {mobileMenu && <div className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" onClick={() => setMobileMenu(false)} />}
      <div className="flex h-full">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main className="flex-1 overflow-x-hidden overflow-y-auto mobile-content-pad admin-scroll">
            {(pageRenderers[page] || renderHome)()}
          </main>
          <MobileBottomNav items={mobileNavItems} activePage={page} setPage={setPage} />
        </div>
      </div>
      <ToastHost />
    </div>
  );
};

Object.assign(window, { AdminDashboard });
