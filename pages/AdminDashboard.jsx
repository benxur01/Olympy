// pages/AdminDashboard.jsx

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/admin/<key>`
// manziliga bog'lanadi (home → /dashboard/admin).
const ADMIN_DASHBOARD_PAGES = [
  'home', 'users', 'centers', 'olympiads', 'requests',
  'subjects', 'analytics', 'logs', 'security', 'settings', 'support',
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
  { key: 'live-proctoring', label: 'Jonli Proktoring' },
  { key: 'auto-flags', label: 'Avtomatik bayroqlar' },
  { key: 'blocked-ips', label: "Bloklangan IP'lar" },
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

// IP bloki muddati — backend `moderation/views.py: BLOCK_DURATION_DAYS` bilan
// AYNAN bir xil ro'yxat (foydalanuvchi blokidagi variantlar ham shu).
// `null` — muddat umuman yuborilmaydi, ya'ni blok doimiy.
const IP_BLOCK_DURATION_OPTIONS = [
  { value: 1, label: '1 kun' },
  { value: 7, label: '7 kun' },
  { value: 14, label: '14 kun' },
  { value: 30, label: '30 kun' },
  { value: null, label: 'Doimiy' },
];
// Bir sahifada nechta blok (backend LargePageNumberPagination `page_size`).
const BLOCKED_IP_PAGE_SIZE = 50;

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
  success: { label: "To'langan", cls: 'text-success' },
  pending: { label: 'Kutilmoqda', cls: 'text-warning' },
  failed: { label: 'Xato', cls: 'text-error' },
  cancelled: { label: 'Bekor qilingan', cls: 'text-text-secondary' },
};
const adminPaymentStatus = (status) => ADMIN_PAYMENT_STATUS[status]
  || { label: status || '—', cls: 'text-text-secondary' };

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
    // Olimpiada holati — "Kontent va faollik" bloki shu yorliqlarni ishlatadi
    // (Olympiad.STATUS_CHOICES bilan bir xil nomlar).
    inactive: { label: 'Nofaol', cls: 'admin-badge-draft' },
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

const AdminInitial = ({ name, color = 'bg-surface-2 text-accent border border-accent/45' }) => (
  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-sm font-bold`}>
    {(name || '?').trim()[0]?.toUpperCase() || '?'}
  </div>
);

const AdminCenterLogo = ({ name, src, color = 'bg-surface-2 text-accent border border-accent/45' }) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-lg object-cover border border-edge"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-sm font-bold`}>
      {(name || '?').trim()[0]?.toUpperCase() || '?'}
    </div>
  );
};

// `onClick` ixtiyoriy: berilgan kartagina bosiladigan bo'ladi (kursor, fokus
// halqasi, Enter/Probel). Qolgan kartalar avvalgidek oddiy ko'rsatkich —
// bosilmaydigan elementga role="button" qo'yish skrinriderni chalg'itardi.
// Ton kalitlari SEMANTIK. Avval xom palitra nomlari edi (`indigo`, `rose`,
// `sky`) va qiymat nomga mos kelmasdi — `rose: 'text-purple-400 …'`. Nom bilan
// rang bir-biridan ajralib ketgach `rose` va `sky` ikkalasi ham bitta tusga
// (pencil ko'ki) tushib qolgandi: besh ton o'rniga to'rt ko'rinish.
// Endi kalit qaysi tokenni tanlashini o'zi aytadi va beshtasi ham farq qiladi:
// accent (shtamp qizili) · success (yashil) · warning (sarg'ish) ·
// info (qalam ko'ki) · neutral (grafit).
const AdminMetricCard = ({ label, value, delta, icon, tone = 'accent', onClick }) => {
  const tones = {
    accent: 'text-accent bg-surface-2 border-accent/45',
    success: 'text-success bg-surface-2 border-success/45',
    warning: 'text-warning bg-surface-2 border-warning/45',
    info: 'text-accent-2 bg-surface-2 border-accent-2/45',
    neutral: 'text-text-secondary bg-surface-2 border-text-secondary/45',
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
      className={`admin-card p-4 relative overflow-hidden transition-all duration-300${
        onClick ? ' cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent' : ''
      }`}
      {...clickProps}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
          <div className="font-data mt-3 text-2xl font-bold leading-none tracking-tight text-text-primary">{value}</div>
          {delta && (
            <div className="mt-2.5 text-[10px] font-semibold text-text-secondary flex items-center gap-1.5">
              <span className="inline-block h-1 w-1 rounded-full bg-accent" />
              {delta}
            </div>
          )}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${tones[tone] || tones.accent}`}>
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
            <div className="absolute -top-7 scale-0 group-hover:scale-100 transition-all duration-200 bg-surface-2 border border-edge text-text-primary text-[10px] px-2 py-0.5 rounded font-bold pointer-events-none z-20">
              {v}
            </div>
            <div className="w-full max-w-5 rounded-t-md transition-all duration-500 ease-out" 
              style={{ height: `${Math.max((v / maxV) * 120, v > 0 ? 8 : 2)}px` }} />
          </div>
          <div className="text-[11px] font-bold text-text-secondary mt-1">{safeLabels[i]}</div>
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
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgb(var(--color-edge))" strokeWidth="3" />
          {circles}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">Jami</span>
          <span className="text-lg font-bold text-text-primary">100%</span>
        </div>
      </div>
      <div className="space-y-2 flex-1 w-full">
        {segments.map(s => (
          <div key={s.label} className="flex items-center justify-between gap-3 text-xs font-bold text-text-primary p-2 rounded-lg bg-surface-2 border border-edge hover:border-edge-strong transition">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color, color: s.color }} />
              <span className="text-text-secondary font-semibold">{s.label}</span>
            </div>
            <span className="text-text-primary font-mono">{s.value}%</span>
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
    <div className="rounded-lg bg-surface-2 border border-edge px-3 py-2">
      {label != null && label !== '' && (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-bold text-text-primary">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill || 'rgb(var(--color-accent))' }} />
          <span className="text-text-primary">{valueLabel || p.name}:</span>
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
        <h2 className="text-[11px] font-bold tracking-wider uppercase text-text-primary">{title}</h2>
        {subtitle && <p className="mt-1 text-[10px] font-semibold text-text-secondary">{subtitle}</p>}
      </div>
    </div>
    {empty ? (
      <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-text-secondary">
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
              <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="label" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={34} />
          <ReTooltip content={<ChartTooltip valueLabel="Yangi" />} cursor={{ stroke: 'rgb(var(--color-edge-strong))' }} />
          <ReArea type="monotone" dataKey="count" name="Yangi" stroke="rgb(var(--color-accent))" strokeWidth={2.5}
            fill="url(#growthFill)" dot={{ r: 3, fill: 'rgb(var(--color-accent))', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'rgb(var(--color-surface-2))', stroke: 'rgb(var(--color-accent))', strokeWidth: 2 }} />
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
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">Jami</span>
          <span className="text-lg font-bold text-text-primary">{total}</span>
        </div>
      </div>
      <div className="w-full flex-1 space-y-2">
        {data.map(d => (
          <div key={d.label} className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface-2 p-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color, color: d.color }} />
              <span className="font-semibold text-text-secondary">{d.label}</span>
            </div>
            <span className="font-mono text-text-primary">{d.value}</span>
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="label" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} width={36} />
          <ReTooltip content={<ChartTooltip suffix="%" valueLabel="Qaytgan" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} />
          <ReBar dataKey="pct" name="Qaytgan" fill="rgb(var(--color-success))" radius={[5, 5, 0, 0]} maxBarSize={40}>
            <ReLabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} fill="rgb(var(--color-text-primary))" fontSize={10} fontWeight={700} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="label" tick={{ fill: 'rgb(var(--color-text-primary))', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={132} />
          <ReTooltip content={<ChartTooltip suffix=" ta" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} />
          <ReBar dataKey="value" name="Foydalanuvchi" fill="rgb(var(--color-accent-2))" radius={[0, 6, 6, 0]} maxBarSize={34}>
            <ReLabelList dataKey="value" position="right" fill="rgb(var(--color-text-primary))" fontSize={11} fontWeight={800} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="date" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} interval={4} minTickGap={12} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Attempt" />} cursor={{ stroke: 'rgb(var(--color-edge-strong))' }} labelFormatter={shortDay} />
          <ReLine type="monotone" dataKey="count" name="Attempt" stroke="rgb(var(--color-accent))" strokeWidth={2.5}
            dot={false} activeDot={{ r: 5, fill: 'rgb(var(--color-surface-2))', stroke: 'rgb(var(--color-accent))', strokeWidth: 2 }} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: 'rgb(var(--color-text-primary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={120} tickFormatter={(v) => (v && v.length > 16 ? v.slice(0, 15) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Ishtirokchi" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} />
          <ReBar dataKey="participants" name="Ishtirokchi" fill="rgb(var(--color-accent-2))" radius={[0, 6, 6, 0]} maxBarSize={26}>
            <ReLabelList dataKey="participants" position="right" fill="rgb(var(--color-text-primary))" fontSize={11} fontWeight={800} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: 'rgb(var(--color-text-primary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={110} tickFormatter={(v) => (v && v.length > 14 ? v.slice(0, 13) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Savol" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} />
          <ReBar dataKey="count" name="Savol" fill="rgb(var(--color-warning))" radius={[0, 6, 6, 0]} maxBarSize={24}>
            <ReLabelList dataKey="count" position="right" fill="rgb(var(--color-text-primary))" fontSize={11} fontWeight={800} />
          </ReBar>
        </ReBarChart>
      </RC>
    </div>
  );
};

// Savol manbai taqsimoti (PieChart: manual/ai/pdf/import).
const QUESTION_SOURCE_COLORS = ['rgb(var(--color-accent))', 'rgb(var(--color-accent-2))', 'rgb(var(--color-success))', 'rgb(var(--color-warning))', 'rgb(var(--color-error))'];
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
          <span className="text-[9px] font-bold uppercase tracking-wider text-text-secondary">Jami</span>
          <span className="text-lg font-bold text-text-primary">{total.toLocaleString()}</span>
        </div>
      </div>
      <div className="w-full flex-1 space-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface-2 p-2 text-xs font-bold">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: QUESTION_SOURCE_COLORS[i % QUESTION_SOURCE_COLORS.length], color: QUESTION_SOURCE_COLORS[i % QUESTION_SOURCE_COLORS.length] }} />
              <span className="font-semibold text-text-secondary">{d.label || d.name}</span>
            </div>
            <span className="font-mono text-text-primary">{d.count}</span>
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
    <div className="rounded-lg bg-surface-2 border border-edge px-3 py-2">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">{shortDay(label)}</div>
      <div className="flex items-center gap-2 text-xs font-bold text-text-primary">
        <span className="h-2 w-2 rounded-full" style={{ background: 'rgb(var(--color-success))' }} />
        <span className="text-text-primary">Daromad:</span>
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
              <stop offset="0%" stopColor="rgb(var(--color-success))" stopOpacity={0.5} />
              <stop offset="100%" stopColor="rgb(var(--color-success))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="month" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tickFormatter={formatSom} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
          <ReTooltip content={<RevenueTooltip />} cursor={{ stroke: 'rgb(var(--color-edge-strong))' }} />
          <ReArea type="monotone" dataKey="amount" name="Daromad" stroke="rgb(var(--color-success))" strokeWidth={2.5}
            fill="url(#revenueFill)" dot={{ r: 3, fill: 'rgb(var(--color-success))', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'rgb(var(--color-surface-2))', stroke: 'rgb(var(--color-success))', strokeWidth: 2 }} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" horizontal={false} />
          <ReXAxis type="number" tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <ReYAxis type="category" dataKey="name" tick={{ fill: 'rgb(var(--color-text-primary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} width={120} tickFormatter={(v) => (v && v.length > 16 ? v.slice(0, 15) + '…' : v)} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="Markaz" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} />
          <ReBar dataKey="count" name="Markaz" fill="rgb(var(--color-accent))" radius={[0, 6, 6, 0]} maxBarSize={24}>
            <ReLabelList dataKey="count" position="right" fill="rgb(var(--color-text-primary))" fontSize={11} fontWeight={800} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="month" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <ReTooltip content={<ChartTooltip suffix=" ta" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} labelFormatter={shortDay} />
          {ReLegend && <ReLegend wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 4 }} iconType="circle" iconSize={8} />}
          <ReBar dataKey="premium" name="Premium" fill="rgb(var(--color-accent-2))" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <ReBar dataKey="free" name="Bepul" fill="rgb(var(--color-text-secondary))" radius={[4, 4, 0, 0]} maxBarSize={18} />
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="week" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
          <ReTooltip content={<ChartTooltip suffix=" ta" valueLabel="DQ" />} cursor={{ stroke: 'rgb(var(--color-edge-strong))' }} labelFormatter={shortDay} />
          <ReLine type="monotone" dataKey="count" name="DQ" stroke="rgb(var(--color-error))" strokeWidth={2.5}
            dot={{ r: 3, fill: 'rgb(var(--color-error))', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: 'rgb(var(--color-surface-2))', stroke: 'rgb(var(--color-error))', strokeWidth: 2 }} />
        </ReLineChart>
      </RC>
    </div>
  );
};

// Top-5 markaz rating dinamikasi (ko'p chiziqli LineChart).
const TOP_CENTER_COLORS = ['rgb(var(--color-accent))', 'rgb(var(--color-success))', 'rgb(var(--color-warning))', 'rgb(var(--color-accent-2))', 'rgb(var(--color-error))'];
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
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="date" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} minTickGap={20} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
          <ReTooltip content={<ChartTooltip suffix=" ball" />} cursor={{ stroke: 'rgb(var(--color-edge-strong))' }} labelFormatter={shortDay} />
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

// ─── Sektion 6: Suiiste'mol signallari ─────────────────────────────────────

// Kunlik bayroq va ogohlantirish soni (terilgan/stacked BarChart).
// Seriyalar BACKENDDAN keladi (`flag_series`: kalit + o'zbekcha yorliq) —
// bayroq turlarining nomi `ModerationFlag.FLAG_TYPE_CHOICES` da, ya'ni bitta
// joyda turadi va yangi tur qo'shilganda diagramma o'zi bilan yangilanadi.
//
// Ustunlar yonma-yon EMAS, bir-birining ustiga teriladi (`stackId`): 30
// kunlik oynada uchta yonma-yon ustun o'qib bo'lmas darajada ingichka
// bo'lardi; terilgan ustun esa kunlik UMUMIY hajmni ham ko'rsatadi.
const ABUSE_SERIES_COLORS = ['rgb(var(--color-warning))', 'rgb(var(--color-error))', 'rgb(var(--color-accent-2))', 'rgb(var(--color-accent))', 'rgb(var(--color-success))'];
const AbuseFlagTrendChart = ({ data, series }) => {
  if (!RC) return null;
  return (
    <div className="h-[220px] w-full">
      <RC width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <ReGrid strokeDasharray="3 3" stroke="rgb(var(--color-edge))" vertical={false} />
          <ReXAxis dataKey="date" tickFormatter={shortDay} tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} interval={4} minTickGap={12} />
          <ReYAxis tick={{ fill: 'rgb(var(--color-text-secondary))', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
          <ReTooltip content={<ChartTooltip suffix=" ta" />} cursor={{ fill: 'rgb(var(--color-surface-2))' }} labelFormatter={shortDay} />
          {ReLegend && <ReLegend wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 4 }} iconType="circle" iconSize={8} />}
          {series.map((s, i) => (
            <ReBar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="abuse"
              fill={ABUSE_SERIES_COLORS[i % ABUSE_SERIES_COLORS.length]}
              maxBarSize={18}
            />
          ))}
        </ReBarChart>
      </RC>
    </div>
  );
};

// Bo'limdagi ikkala reyting ro'yxati (eng ko'p ogohlantirilganlar va kontent
// portlashi) bir xil shaklda: o'rin, hisob, son, oxirgi vaqt — shuning uchun
// bitta komponent. Diagramma EMAS: ism va aniq son ustun grafikdan ko'ra
// jadvalda tez o'qiladi, ko'rinish esa "Bir xil IP" va audit jurnali
// jadvallari bilan bir xil.
// Kalitlar `AdminMetricCard` bilan bir xil semantik nomlashda — xom palitra
// nomi (`rose`) qiymatdagi tokendan (`error`) ajralib turmasin.
const ABUSE_COUNT_TONES = {
  error: 'bg-surface-2 border-error/45 text-error',
  warning: 'bg-surface-2 border-warning/45 text-warning',
};
const AbuseRankTable = ({ rows, countKey, countLabel, dateKey, dateLabel, tone = 'error' }) => (
  <div className="overflow-x-auto admin-scroll">
    <table className="w-full min-w-[420px] text-left">
      <thead className="admin-table-hdr">
        <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          <th className="px-3 py-2.5">#</th>
          <th className="px-3 py-2.5">Hisob</th>
          <th className="px-3 py-2.5">{countLabel}</th>
          <th className="px-3 py-2.5">{dateLabel}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-edge">
        {rows.map((row, i) => (
          <tr key={row.user_id} className="text-xs admin-table-row text-text-primary">
            <td className="px-3 py-3 font-mono text-[11px] font-bold text-text-secondary">{i + 1}</td>
            <td className="px-3 py-3">
              <div className="font-bold text-text-primary">{row.full_name || '—'}</div>
              <div className="font-mono text-[10px] text-text-secondary">{maskPhoneDisplay(row.phone, '')}</div>
            </td>
            <td className="px-3 py-3">
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${ABUSE_COUNT_TONES[tone]}`}>
                {row[countKey]} ta
              </span>
            </td>
            <td className="px-3 py-3 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(row[dateKey])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);


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
  // Hisobni o'chirish (soft-delete) — paneldagi eng qaytarib bo'lmaydigan
  // amal, shuning uchun oddiy tasdiqlash yetmaydi: birlashtirish oqimidagi
  // kabi foydalanuvchi raqamini QO'LDA yozish talab qilinadi. `reason`
  // ixtiyoriy va faqat audit jurnaliga tushadi.
  const [deleteUserModal, setDeleteUserModal] = React.useState(null);
  const [deleteUserReason, setDeleteUserReason] = React.useState('');
  const [deleteUserConfirmPhone, setDeleteUserConfirmPhone] = React.useState('');
  const [deleteUserBusy, setDeleteUserBusy] = React.useState(false);
  // "Batafsil" oynasidagi kontent ro'yxatidan bitta elementni o'chirish:
  // `{ type, id, label }` — hisobga tegilmaydi.
  const [contentDeleteConfirm, setContentDeleteConfirm] = React.useState(null);
  const [contentDeleteBusy, setContentDeleteBusy] = React.useState(false);
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
  // Foydalanuvchilar ko'p parametrli filtrlari va tezkor segmentlar
  const [userSegment, setUserSegment] = React.useState('all');
  const [userFilterRole, setUserFilterRole] = React.useState('all');
  const [userFilterStatus, setUserFilterStatus] = React.useState('all');
  const [userFilterPlan, setUserFilterPlan] = React.useState('all');
  const [userFilterActivity, setUserFilterActivity] = React.useState('all');
  const [userFilterTag, setUserFilterTag] = React.useState('all');

  // Ommaviy xabarnoma (Broadcast)
  const [broadcastModalOpen, setBroadcastModalOpen] = React.useState(false);
  const [broadcastTitle, setBroadcastTitle] = React.useState('');
  const [broadcastMessage, setBroadcastMessage] = React.useState('');
  const [broadcastChannel, setBroadcastChannel] = React.useState('both');
  const [broadcastBusy, setBroadcastBusy] = React.useState(false);

  // Olimpiadadan chetlatish (Exam Ban)
  const [examBanModalUser, setExamBanModalUser] = React.useState(null);
  const [examBanReason, setExamBanReason] = React.useState('');
  const [examBanDuration, setExamBanDuration] = React.useState(7);
  const [examBanBusy, setExamBanBusy] = React.useState(false);

  // Tangalar (Coins) balansi boshqaruvi
  const [coinsModalUser, setCoinsModalUser] = React.useState(null);
  const [coinsAmount, setCoinsAmount] = React.useState(50);
  const [coinsReason, setCoinsReason] = React.useState('');
  const [coinsBusy, setCoinsBusy] = React.useState(false);

  // Testni qayta topshirish tasdig'i (Allow retake)
  const [retakeConfirm, setRetakeConfirm] = React.useState(null);
  const [retakeBusy, setRetakeBusy] = React.useState(false);

  // Batafsil modal ichidagi eslatmalar (CRM Notes) va teglar (Tags)
  const [newNoteText, setNewNoteText] = React.useState('');
  const [noteBusy, setNoteBusy] = React.useState(false);
  const [newTagInput, setNewTagInput] = React.useState('');
  const [tagsBusy, setTagsBusy] = React.useState(false);
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
  // Shubhali IP bayrog'ini yopishdagi ixtiyoriy chora: o'sha manzilni
  // bloklash. Arxivlash bilan bir xil qoida — har oynada noldan boshlanadi,
  // muddat esa "Doimiy" (null) dan.
  const [flagResolveBlockIp, setFlagResolveBlockIp] = React.useState(false);
  const [flagResolveBlockDays, setFlagResolveBlockDays] = React.useState(null);
  // "Bloklangan IP'lar" bloki: server tomon sahifa raqami.
  const [blockedIpPage, setBlockedIpPage] = React.useState(1);
  // Yangi blok oynasi (ochiq/yopiq) va uning maydonlari. Manzil bitta
  // maydonda — tarmoq ham shu yerga CIDR ko'rinishida yoziladi.
  const [blockIpModal, setBlockIpModal] = React.useState(false);
  const [blockIpAddress, setBlockIpAddress] = React.useState('');
  const [blockIpReason, setBlockIpReason] = React.useState('');
  const [blockIpDuration, setBlockIpDuration] = React.useState(null);
  const [blockIpBusy, setBlockIpBusy] = React.useState(false);
  // Blokni olib tashlash tasdig'i: `{ id, cidr }` — qatorning o'zi emas,
  // chunki tasdiqlash matni faqat shu ikkisini ko'rsatadi.
  const [unblockIpConfirm, setUnblockIpConfirm] = React.useState(null);
  const [unblockIpBusy, setUnblockIpBusy] = React.useState(false);
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


  // Avval bitta string state + bitta setTimeout bilan yasalgan edi: ikkinchi
  // toast 3s ichida kelsa, birinchi toastning eski setTimeout'i uni
  // muddatidan oldin yashirib yuborardi. shared.jsx'dagi useToast() buni
  // stacked, id-based ro'yxat bilan hal qiladi — imzosi bir xil (showToast(msg))
  // bo'lgani uchun quyidagi 38 ta chaqiruv joyi o'zgarishsiz ishlayveradi.
  const { showToast, ToastHost } = useToast();
  const [liveProctorSession, setLiveProctorSession] = React.useState(null);

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
  // Suiiste'mol signallari (bayroq dinamikasi, ogohlantirish reytingi,
  // kontent portlashi) — "Tahlil" tabining oxirgi bo'limi uchun.
  const apiAbuseStatsRes = useApiData(
    () => isApi ? OlympyApi.getAbuseStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Jonli imtihon va test jarayonlari radari
  const apiLiveRadarRes = useApiData(
    () => (isApi && page === 'home') ? OlympyApi.getLiveRadar(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, page],
  );
  // So'nggi to'lov tranzaksiyalari (Click / Payme)
  const apiRecentTxRes = useApiData(
    () => (isApi && page === 'home') ? OlympyApi.getRecentTransactions(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, page],
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
  // Bloklangan IP'lar — faqat "security" tabining shu bo'limi ochilganda.
  // Ro'yxatda muddati o'tgan bloklar ham qoladi, ya'ni u ham o'sib boradi —
  // navbatdagidek server tomon paginatsiya.
  const apiBlockedIpsRes = useApiData(
    () => (isApi && page === 'security' && securitySection === 'blocked-ips')
      ? OlympyApi.getAdminBlockedIps(
          { page: blockedIpPage, pageSize: BLOCKED_IP_PAGE_SIZE },
          OlympyApi.getToken(),
        )
      : Promise.resolve(null),
    [isApi, page, securitySection, blockedIpPage],
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
  // Hisob yaratgan kontent va topshirgan urinishlar — shikoyat kelganda
  // "bu hisob nima qilgan" savoliga javob. Har bir yaratilgan element shu
  // ro'yxatdan hisobga tegmasdan o'chiriladi.
  const apiUserContentRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserContentHistory(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );

  // Kengaytirilgan boshqaruv ma'lumotlari (Detail Drawer)
  const [detailSubTab, setDetailSubTab] = React.useState('overview');
  const apiUserRiskScoreRes = useApiData(
    () => (isApi && detailBackendId)
      ? OlympyApi.getAdminUserRiskScore(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId],
  );
  const apiUserTimelineRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'timeline')
      ? OlympyApi.getAdminUserTimeline(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );
  const apiUserHeatmapRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'analytics')
      ? OlympyApi.getAdminUserHeatmap(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );
  const apiUserAiSummaryRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'analytics')
      ? OlympyApi.getAdminUserAiSummary(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );
  const apiUserDevicesRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'risk')
      ? OlympyApi.getAdminUserDevices(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );
  const apiUserCoinTxRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'coins')
      ? OlympyApi.getAdminUserCoinTransactions(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );
  const apiUserFlashAlertsRes = useApiData(
    () => (isApi && detailBackendId && detailSubTab === 'communication')
      ? OlympyApi.getAdminUserFlashAlerts(detailBackendId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, detailBackendId, detailSubTab],
  );

  // Jonli proktoring va Churn risk
  const [liveProctoringKey, setLiveProctoringKey] = React.useState(0);
  const apiLiveProctoringRes = useApiData(
    () => isApi ? OlympyApi.getAdminLiveProctoring(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, liveProctoringKey],
  );
  const apiChurnRiskRes = useApiData(
    () => isApi ? OlympyApi.getAdminChurnRiskUsers(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );

  // Modal statelari
  const [showBulkImportModal, setShowBulkImportModal] = React.useState(false);
  const [bulkImportText, setBulkImportText] = React.useState('');
  const [bulkImportLoading, setBulkImportLoading] = React.useState(false);
  const [bulkImportResults, setBulkImportResults] = React.useState(null);

  const [showTelegramModal, setShowTelegramModal] = React.useState(false);
  const [telegramMsgText, setTelegramMsgText] = React.useState('');
  const [telegramMsgLoading, setTelegramMsgLoading] = React.useState(false);

  const [showFlashAlertModal, setShowFlashAlertModal] = React.useState(false);
  const [flashAlertTitle, setFlashAlertTitle] = React.useState('');
  const [flashAlertMsg, setFlashAlertMsg] = React.useState('');
  const [flashAlertType, setFlashAlertType] = React.useState('info');
  const [flashAlertLoading, setFlashAlertLoading] = React.useState(false);

  const [showCenterTransferModal, setShowCenterTransferModal] = React.useState(false);
  const [transferTargetCenterId, setTransferTargetCenterId] = React.useState('');
  const [transferRole, setTransferRole] = React.useState('student');
  const [transferLoading, setTransferLoading] = React.useState(false);

  const [showQuotaModal, setShowQuotaModal] = React.useState(false);
  const [quotaPractice, setQuotaPractice] = React.useState('');
  const [discountPercent, setDiscountPercent] = React.useState('');
  const [discountDays, setDiscountDays] = React.useState('');
  const [quotaLoading, setQuotaLoading] = React.useState(false);

  // Musobaqa va Baholash (Competition Ops) Statelari
  const [olympiadAnalyticsModal, setOlympiadAnalyticsModal] = React.useState(null);
  const [olympiadAnalyticsData, setOlympiadAnalyticsData] = React.useState(null);
  const [olympiadAnalyticsLoading, setOlympiadAnalyticsLoading] = React.useState(false);

  const [olympiadCertificatesModal, setOlympiadCertificatesModal] = React.useState(null);
  const [olympiadCertificatesData, setOlympiadCertificatesData] = React.useState(null);
  const [olympiadCertificatesLoading, setOlympiadCertificatesLoading] = React.useState(false);
  const [olympiadTemplateSaving, setOlympiadTemplateSaving] = React.useState(false);

  const [regradeConfirmModal, setRegradeConfirmModal] = React.useState(null);
  const [regradeLoading, setRegradeLoading] = React.useState(false);
  const [regradeResults, setRegradeResults] = React.useState(null);

  // ─── AI Studio Statelari ───
  const [aiStudioTab, setAiStudioTab] = React.useState('generator');
  const [aiGenSubject, setAiGenSubject] = React.useState('Matematika');
  const [aiGenTopic, setAiGenTopic] = React.useState('');
  const [aiGenDifficulty, setAiGenDifficulty] = React.useState('medium');
  const [aiGenCount, setAiGenCount] = React.useState(5);
  const [aiGenLanguage, setAiGenLanguage] = React.useState('uz');
  const [aiGenCenterId, setAiGenCenterId] = React.useState('');
  const [aiGenOlympiadId, setAiGenOlympiadId] = React.useState('');
  const [aiGenSaveToBank, setAiGenSaveToBank] = React.useState(true);
  const [aiGenLoading, setAiGenLoading] = React.useState(false);
  const [aiGenResults, setAiGenResults] = React.useState(null);

  const [aiAppealQText, setAiAppealQText] = React.useState('');
  const [aiAppealOpts, setAiAppealOpts] = React.useState(['', '', '', '']);
  const [aiAppealAnswer, setAiAppealAnswer] = React.useState('');
  const [aiAppealReason, setAiAppealReason] = React.useState('');
  const [aiAppealLoading, setAiAppealLoading] = React.useState(false);
  const [aiAppealResults, setAiAppealResults] = React.useState(null);

  const [aiMetricsData, setAiMetricsData] = React.useState(null);
  const [aiMetricsLoading, setAiMetricsLoading] = React.useState(false);

  // ─── Promokodlar Statelari ───
  const [promocodesList, setPromocodesList] = React.useState([]);
  const [promocodesLoading, setPromocodesLoading] = React.useState(false);
  const [showCreatePromoModal, setShowCreatePromoModal] = React.useState(false);
  const [promoCodeText, setPromoCodeText] = React.useState('');
  const [promoDesc, setPromoDesc] = React.useState('');
  const [promoType, setPromoType] = React.useState('percent');
  const [promoValue, setPromoValue] = React.useState('20');
  const [promoMaxUses, setPromoMaxUses] = React.useState('');
  const [promoValidUntil, setPromoValidUntil] = React.useState('');
  const [promoCreating, setPromoCreating] = React.useState(false);

  // ─── Tizim Holati & DevOps Statelari ───
  const [systemHealthData, setSystemHealthData] = React.useState(null);
  const [systemHealthLoading, setSystemHealthLoading] = React.useState(false);
  const [purgeCacheLoading, setPurgeCacheLoading] = React.useState(false);
  const [systemConfigData, setSystemConfigData] = React.useState(null);
  const [systemConfigLoading, setSystemConfigLoading] = React.useState(false);
  const [systemConfigSaving, setSystemConfigSaving] = React.useState(false);

  // ─── 1. Xabarnomalar (Broadcasts) Statelari ───
  const [broadcastsList, setBroadcastsList] = React.useState([]);
  const [broadcastsLoading, setBroadcastsLoading] = React.useState(false);
  const [showCreateBroadcastModal, setShowCreateBroadcastModal] = React.useState(false);
  const [bcTitle, setBcTitle] = React.useState('');
  const [bcMessage, setBcMessage] = React.useState('');
  const [bcTarget, setBcTarget] = React.useState('all');
  const [bcSendTelegram, setBcSendTelegram] = React.useState(true);
  const [bcSendInApp, setBcSendInApp] = React.useState(true);
  const [bcSending, setBcSending] = React.useState(false);

  // ─── 2. Plagiat & Similarity Statelari ───
  const [showPlagiarismModal, setShowPlagiarismModal] = React.useState(false);
  const [plagiarismOlympiad, setPlagiarismOlympiad] = React.useState(null);
  const [plagiarismData, setPlagiarismData] = React.useState(null);
  const [plagiarismLoading, setPlagiarismLoading] = React.useState(false);

  // ─── 3. Chop etish & OMR Statelari ───
  const [showPrintModal, setShowPrintModal] = React.useState(false);
  const [printOlympiad, setPrintOlympiad] = React.useState(null);
  const [printData, setPrintData] = React.useState(null);
  const [printLoading, setPrintLoading] = React.useState(false);
  const [printViewType, setPrintViewType] = React.useState('booklet'); // 'booklet' | 'omr' | 'key'

  // ─── 4. Mukofotlar & Fulfillment Statelari ───
  const [rewardsList, setRewardsList] = React.useState([]);
  const [rewardsLoading, setRewardsLoading] = React.useState(false);
  const [rewardsTab, setRewardsTab] = React.useState('products'); // 'products' | 'orders'
  const [showCreateRewardModal, setShowCreateRewardModal] = React.useState(false);
  const [rewardTitle, setRewardTitle] = React.useState('');
  const [rewardDesc, setRewardDesc] = React.useState('');
  const [rewardCost, setRewardCost] = React.useState('200');
  const [rewardStock, setRewardStock] = React.useState('15');
  const [rewardIcon, setRewardIcon] = React.useState('🎁');
  const [rewardCreating, setRewardCreating] = React.useState(false);
  const [redemptionsList, setRedemptionsList] = React.useState([]);
  const [redemptionsLoading, setRedemptionsLoading] = React.useState(false);

  // ─── 5. Moliya & B2B Invoys Statelari ───
  const [revenueData, setRevenueData] = React.useState(null);
  const [revenueLoading, setRevenueLoading] = React.useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = React.useState(false);
  const [invBuyerName, setInvBuyerName] = React.useState('');
  const [invBuyerInn, setInvBuyerInn] = React.useState('');
  const [invAmount, setInvAmount] = React.useState('3000000');
  const [invPlanName, setInvPlanName] = React.useState('B2B Enterprise Litsenziyasi (500 o‘quvchi)');
  const [invGenerating, setInvGenerating] = React.useState(false);
  const [generatedInvoice, setGeneratedInvoice] = React.useState(null);

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

  // "Batafsil" oynasidagi kontent qatorini o'chirish (tasdiqlashdan keyin).
  // Hisobga tegilmaydi — bu bloklashning o'rnini bosmaydigan tor chora.
  // Foydalanishdagi savol o'chirilmasdan arxivlanadi: qaysi yo'l tanlanganini
  // backend javobdagi matnda aytadi, shuning uchun toast o'sha matndan.
  const runContentDelete = () => {
    if (!contentDeleteConfirm || contentDeleteBusy) return;
    if (!isApi) { showToast("Kontent faqat API rejimida o'chiriladi"); return; }
    if (!detailBackendId) { showToast('Backend ID topilmadi'); setContentDeleteConfirm(null); return; }
    setContentDeleteBusy(true);
    OlympyApi.adminDeleteUserContent(
      detailBackendId, contentDeleteConfirm.type, contentDeleteConfirm.id, OlympyApi.getToken(),
    )
      .then(res => {
        showToast(res?.detail || "Kontent o'chirildi");
        setContentDeleteConfirm(null);
        apiUserContentRes.reload();
      })
      .catch(err => {
        console.warn('adminDeleteUserContent failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setContentDeleteBusy(false));
  };

  // Sabab + muddat maydonlari. Bitta foydalanuvchilik va ommaviy bloklash
  // modallari AYNAN shu bloklardan foydalanadi — qoidalar (majburiy sabab,
  // qat'iy muddat variantlari) ikkalasida bir xil bo'lishi kerak.
  const blockReasonFields = (
    <div className="mb-5 space-y-4">
      <div>
        <label className="block text-xs text-text-secondary mb-1.5 font-medium">Bloklash sababi</label>
        <input
          value={blockReason}
          onChange={e => setBlockReason(e.target.value)}
          maxLength={255}
          className="w-full admin-input px-3 py-2.5 text-sm outline-none"
          placeholder="Masalan: imtihonda qoidabuzarlik"
        />
      </div>
      <div>
        <label className="block text-xs text-text-secondary mb-1.5 font-medium">Muddat</label>
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
                    ? 'btn-danger font-bold'
                    : 'btn-primary font-bold'
                  : 'btn-ghost'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
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

  // Hisobni o'chirish oynasi har safar toza ochiladi — oldingi
  // foydalanuvchining sababi va yozilgan raqami qolib ketmasin.
  const openDeleteUserModal = (row) => {
    setDeleteUserReason('');
    setDeleteUserConfirmPhone('');
    setDeleteUserModal(row);
  };

  // Tasdiqlash: hisob raqamini AYNAN yozish talab qilinadi (birlashtirish
  // oqimidagi bilan bir xil himoya) — bir bosishda hisob o'chib ketmasin.
  const deleteUserConfirmOk = !!deleteUserModal?.phone
    && deleteUserConfirmPhone.replace(/\s/g, '') === deleteUserModal.phone;

  const runDeleteUser = () => {
    if (!deleteUserModal || deleteUserBusy || !deleteUserConfirmOk) return;
    if (!isApi) { showToast("Hisob faqat API rejimida o'chiriladi"); return; }
    const numericUserId = deleteUserModal.backendId
      ?? (typeof deleteUserModal.id === 'string' && deleteUserModal.id.startsWith('api:')
        ? Number(deleteUserModal.id.slice(4)) : null);
    if (!numericUserId) { showToast('Backend ID topilmadi'); setDeleteUserModal(null); return; }

    setDeleteUserBusy(true);
    OlympyApi.adminDeleteUser(numericUserId, deleteUserReason.trim(), OlympyApi.getToken())
      .then(res => {
        // Backend matnida tiklash muddati bor — uni o'zgartirmasdan
        // ko'rsatamiz (grace kunlari sozlamadan keladi).
        showToast(res?.detail || "Hisob o'chirildi");
        setDeleteUserModal(null);
        // Hisob endi "Bloklangan" holatida ko'rinadi — ro'yxat ham, ochiq
        // "Batafsil" oynasi ham yangilanishi kerak.
        apiUsersRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminDeleteUser failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setDeleteUserBusy(false));
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
      email: u.email || '',
      username: u.username || '',
      avatarUrl: u.avatarUrl || '',
      role: roleLabel,
      center: center?.name || (primary ? u.roles?.[primary]?.centerName : '') || '—',
      joined: u.joined,
      status: (isApi ? apiBlocked : !!blockedIds[u.id]) ? 'Bloklangan' : 'Faol',
      isPremium: !!(u.isPremium ?? u.is_premium),
      planName: u.currentPlanName || null,
      isStudent: approved.includes('student') || primary === 'student',
      coins: typeof u.coins === 'number' ? u.coins : 0,
      adminTags: Array.isArray(u.adminTags) ? u.adminTags : [],
      isExamBlocked: !!u.isExamBlocked,
      examBlockedUntil: u.examBlockedUntil || null,
      lastSeenAt: u.lastSeenAt || null,
      telegramLinked: !!u.telegramLinked,
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

  // Jadval filtri: qidiruv matni + tezkor segmentlar + ko'p parametrli filtrlar.
  const userTableSearch = (debouncedUserSearch || debouncedGlobalSearch || '').trim();
  const userTableQuery = userTableSearch.toLowerCase();
  const visibleUserRows = userRows.filter(row => {
    // 1. Matnli qidiruv
    if (userTableQuery) {
      const match = (row.name || '').toLowerCase().includes(userTableQuery) ||
        (row.phone || '').toLowerCase().includes(userTableQuery) ||
        (row.role || '').toLowerCase().includes(userTableQuery) ||
        (row.center || '').toLowerCase().includes(userTableQuery) ||
        (row.email || '').toLowerCase().includes(userTableQuery) ||
        (row.username || '').toLowerCase().includes(userTableQuery) ||
        (row.adminTags || []).some(t => String(t).toLowerCase().includes(userTableQuery));
      if (!match) return false;
    }

    // 2. Tezkor segmentlar (Presets)
    if (userSegment === 'online') {
      const isOnline = row.lastSeenAt && (Date.now() - new Date(row.lastSeenAt).getTime() < 300000);
      if (!isOnline) return false;
    } else if (userSegment === 'today') {
      const isToday = row.lastSeenAt && (new Date(row.lastSeenAt).toDateString() === new Date().toDateString());
      if (!isToday) return false;
    } else if (userSegment === 'inactive_7d') {
      const isInactive = !row.lastSeenAt || (Date.now() - new Date(row.lastSeenAt).getTime() > 7 * 86400000);
      if (!isInactive) return false;
    } else if (userSegment === 'blocked') {
      if (row.status !== 'Bloklangan') return false;
    } else if (userSegment === 'exam_blocked') {
      if (!row.isExamBlocked) return false;
    } else if (userSegment === 'high_risk') {
      const isRisk = row.adminTags?.includes('shubhali') || row.isExamBlocked || row.status === 'Bloklangan';
      if (!isRisk) return false;
    }

    // 3. Alohida tanlanadigan ko'p parametrli filtrlar
    if (userFilterRole !== 'all') {
      if (userFilterRole === 'admin') {
        if (!row.isPlatformAdmin && !row.roleKeys.includes('admin')) return false;
      } else {
        if (!row.roleKeys.includes(userFilterRole)) return false;
      }
    }

    if (userFilterStatus !== 'all') {
      if (userFilterStatus === 'active' && row.status !== 'Faol') return false;
      if (userFilterStatus === 'blocked' && row.status !== 'Bloklangan') return false;
      if (userFilterStatus === 'exam_blocked' && !row.isExamBlocked) return false;
      if (userFilterStatus === 'telegram_linked' && !row.telegramLinked) return false;
      if (userFilterStatus === 'telegram_unlinked' && row.telegramLinked) return false;
    }

    if (userFilterPlan !== 'all') {
      if (userFilterPlan === 'free' && row.isPremium) return false;
      if (userFilterPlan === 'premium' && !row.isPremium) return false;
      if (userFilterPlan === 'org_premium' && !row.orgBoundPremium) return false;
    }

    if (userFilterActivity !== 'all') {
      if (userFilterActivity === 'online') {
        const isOnline = row.lastSeenAt && (Date.now() - new Date(row.lastSeenAt).getTime() < 300000);
        if (!isOnline) return false;
      } else if (userFilterActivity === 'today') {
        const isToday = row.lastSeenAt && (new Date(row.lastSeenAt).toDateString() === new Date().toDateString());
        if (!isToday) return false;
      } else if (userFilterActivity === 'inactive_7d') {
        const isInactive = !row.lastSeenAt || (Date.now() - new Date(row.lastSeenAt).getTime() > 7 * 86400000);
        if (!isInactive) return false;
      }
    }

    if (userFilterTag !== 'all') {
      if (!row.adminTags?.includes(userFilterTag)) return false;
    }

    return true;
  });

  // Qidiruv yoki filtrlar o'zgarsa tanlov tozalanadi.
  React.useEffect(() => {
    setSelectedUserIds(prev => (prev.length ? [] : prev));
  }, [userTableQuery, userSegment, userFilterRole, userFilterStatus, userFilterPlan, userFilterActivity, userFilterTag]);

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

  // ─── Ommaviy Xabarnoma (Broadcast) ─────────────────────────────────────────
  const handleSendBroadcast = () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      showToast("Sarlavha va xabar matnini kiriting");
      return;
    }
    if (!isApi) { showToast("Xabarnoma faqat API rejimida ishlaydi"); return; }
    setBroadcastBusy(true);
    OlympyApi.adminBroadcastNotification({
      user_ids: selectedBackendIds.length > 0 ? selectedBackendIds : undefined,
      filter_role: selectedBackendIds.length === 0 && userFilterRole !== 'all' ? userFilterRole : undefined,
      channel: broadcastChannel,
      title: broadcastTitle.trim(),
      message: broadcastMessage.trim(),
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res.detail || "Xabarnoma muvaffaqiyatli yuborildi");
        setBroadcastModalOpen(false);
        setBroadcastTitle('');
        setBroadcastMessage('');
        apiNotificationsRes.reload();
      })
      .catch(err => {
        console.warn('adminBroadcastNotification failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setBroadcastBusy(false));
  };

  // ─── Olimpiadadan chetlatish (Exam Ban) ────────────────────────────────────
  const handleExamBan = () => {
    if (!examBanModalUser || !examBanReason.trim()) {
      showToast("Chetlatish sababini kiriting");
      return;
    }
    if (!isApi) { showToast("Taqiq faqat API rejimida ishlaydi"); return; }
    const numId = examBanModalUser.backendId
      ?? (typeof examBanModalUser.id === 'string' && examBanModalUser.id.startsWith('api:')
        ? Number(examBanModalUser.id.slice(4)) : null);
    if (!numId) { showToast("Foydalanuvchi ID topilmadi"); return; }

    setExamBanBusy(true);
    OlympyApi.adminExamBanUser(numId, {
      reason: examBanReason.trim(),
      durationDays: examBanDuration,
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res.detail || "Olimpiadalardan chetlatildi");
        setExamBanModalUser(null);
        setExamBanReason('');
        apiUsersRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminExamBanUser failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setExamBanBusy(false));
  };

  const handleExamUnban = (user) => {
    if (!isApi) { showToast("Taqiqni bekor qilish faqat API rejimida ishlaydi"); return; }
    const numId = user.backendId
      ?? (typeof user.id === 'string' && user.id.startsWith('api:')
        ? Number(user.id.slice(4)) : null);
    if (!numId) { showToast("Foydalanuvchi ID topilmadi"); return; }

    OlympyApi.adminExamUnbanUser(numId, OlympyApi.getToken())
      .then(res => {
        showToast(res.detail || "Olimpiada taqiqi bekor qilindi");
        apiUsersRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminExamUnbanUser failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      });
  };

  // ─── Tangalar (Coins) Boshqaruvi ──────────────────────────────────────────
  const handleAdjustCoins = () => {
    if (!coinsModalUser || !coinsReason.trim()) {
      showToast("Miqdor va sababni kiriting");
      return;
    }
    if (!isApi) { showToast("Tangalar faqat API rejimida ishlaydi"); return; }
    const numId = coinsModalUser.backendId
      ?? (typeof coinsModalUser.id === 'string' && coinsModalUser.id.startsWith('api:')
        ? Number(coinsModalUser.id.slice(4)) : null);
    if (!numId) { showToast("Foydalanuvchi ID topilmadi"); return; }

    setCoinsBusy(true);
    OlympyApi.adminAdjustUserCoins(numId, {
      amount: Number(coinsAmount),
      reason: coinsReason.trim(),
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res.detail || "Balans yangilandi");
        setCoinsModalUser(null);
        setCoinsReason('');
        apiUsersRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminAdjustUserCoins failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setCoinsBusy(false));
  };

  // ─── Testni qayta topshirish (Allow retake) ──────────────────────────────
  const handleAllowRetake = () => {
    if (!retakeConfirm || !isApi) return;
    setRetakeBusy(true);
    OlympyApi.adminAllowRetake(retakeConfirm.userId, retakeConfirm.attemptId, OlympyApi.getToken())
      .then(res => {
        showToast(res.detail || "Qayta topshirish ruxsati berildi");
        setRetakeConfirm(null);
        apiUserContentRes.reload();
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminAllowRetake failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setRetakeBusy(false));
  };

  // ─── Eslatmalar (CRM Notes) va Teglar (Tags) ──────────────────────────────
  const handleAddNote = (userId) => {
    if (!newNoteText.trim() || !isApi) return;
    setNoteBusy(true);
    OlympyApi.adminAddUserNote(userId, newNoteText.trim(), OlympyApi.getToken())
      .then(() => {
        showToast("Eslatma saqlandi");
        setNewNoteText('');
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminAddUserNote failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setNoteBusy(false));
  };

  const handleDeleteNote = (userId, noteId) => {
    if (!isApi) return;
    OlympyApi.adminDeleteUserNote(userId, noteId, OlympyApi.getToken())
      .then(() => {
        showToast("Eslatma o'chirildi");
        apiUserDetailRes.reload();
      })
      .catch(err => {
        console.warn('adminDeleteUserNote failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      });
  };

  const handleToggleTag = (userId, currentTags, tagToToggle) => {
    if (!isApi) return;
    const cleanTag = tagToToggle.replace('#', '').trim().toLowerCase();
    const updatedTags = currentTags.includes(cleanTag)
      ? currentTags.filter(t => t !== cleanTag)
      : [...currentTags, cleanTag];
    setTagsBusy(true);
    OlympyApi.adminUpdateUserTags(userId, updatedTags, OlympyApi.getToken())
      .then(() => {
        showToast("Teglar yangilandi");
        apiUserDetailRes.reload();
        apiUsersRes.reload();
      })
      .catch(err => {
        console.warn('adminUpdateUserTags failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setTagsBusy(false));
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
    { key: 'ai_studio', icon: 'sparkles', label: 'AI Studio' },
    { key: 'broadcasts', icon: 'bell', label: 'Xabarnomalar' },
    { key: 'promocodes', icon: 'tag', label: 'Promokodlar' },
    { key: 'rewards_shop', icon: 'gift', label: 'Mukofotlar' },
    { key: 'revenue', icon: 'credit-card', label: 'Moliya' },
    { key: 'analytics', icon: 'chart', label: 'Tahlil' },
    { key: 'logs', icon: 'shield', label: 'Amallar tarixi' },
    { key: 'security', icon: 'lock', label: 'Xavfsizlik' },
    { key: 'system_health', icon: 'activity', label: 'Tizim Holati' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
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
    <aside className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-60 flex-col admin-sidebar text-text-primary transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none`}>
      <div className="flex h-[54px] items-center gap-2 border-b border-edge px-4 bg-surface-1">
        <button onClick={() => setPage('home')} className="flex items-center gap-2">
          {/* Avval `bg-white text-ground` edi: to'ldirilgan yuza mavzu bilan
              almashadigan matn tokeni ostida. Qog'oz mavzuda oq plita ustida
              qog'oz rangli "O" qolib, harf 1.25:1 ga tushardi. Endi shtamp
              plitasi + `on-accent` — juftlik ikkala mavzuda 5.52:1.
              Ostidagi bo'sh `<span>` shu yerda edi: `bg-gradient-to-r
              from-amber-500 to-indigo-500` chizig'i. Gradient olib
              tashlanganda klasslari yechilgan-u element qolib ketgan —
              hech narsa chizmaydigan qoldiq, o'chirildi. */}
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-fill text-base font-bold text-on-accent">
            O
          </div>
          <div className="text-left">
            <div className="font-display text-[14px] font-bold leading-none text-text-primary tracking-wide">olympy <span className="font-medium text-accent text-[10px]">admin</span></div>
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
              <span className={`sidebar-icon transition-colors duration-200 ${isActive ? 'text-accent' : 'text-text-secondary'}`}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className={`text-[15px] font-semibold tracking-wide transition-colors duration-200 flex-1 ${isActive ? 'text-text-primary' : 'text-text-secondary'}`}>
                {item.label}
              </span>
              {item.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isActive ? 'bg-surface-2 text-accent' : 'bg-surface-2 text-error border border-error/45'}`}>{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-edge px-4 py-5 bg-surface-1">
        <div className="mb-6">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-text-secondary">Tizim holati</div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-primary">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            Tizim faol
          </div>
        </div>
        <div className="mb-4 text-[10px] leading-relaxed text-text-secondary font-semibold">
          © 2026 Olympy Admin
        </div>
        <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-bold text-text-secondary hover:bg-surface-1 hover:text-text-primary transition">
          <Icon name="logout" size={13} className="text-text-secondary" /> Chiqish
        </button>
      </div>
    </aside>
  );

  const AdminTopbar = () => (
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-edge bg-ground/95 px-4 lg:px-5">
      <div className="flex items-center gap-3">
        <button className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-1 lg:hidden" onClick={() => setMobileMenu(true)}>
          <Icon name="menu" size={18} />
        </button>
        <button className="hidden h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-1 lg:inline-flex">
          <Icon name="menu" size={16} />
        </button>
        <div className="relative hidden w-[310px] max-w-[35vw] md:block">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="h-8 w-full admin-input pl-9 pr-3 text-[11px] outline-none"
            placeholder="Foydalanuvchilar, tashkilotlar, olimpiadalar..." />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onOpenSwitcher && (
          <button onClick={onOpenSwitcher} className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-2 md:px-3 py-1.5 text-[10px] font-bold text-text-primary hover:bg-surface-1 transition">
            <Icon name="users" size={11} /><span className="hidden md:inline">Rolni almashtirish</span>
          </button>
        )}
        <button onClick={() => setPage('requests')} className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-1 transition">
          <Icon name="bell" size={15} />
          {pendingCenterReqs.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fill px-1 text-[9px] font-bold text-on-accent">
              {pendingCenterReqs.length}
            </span>
          )}
        </button>
        <button className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-1 transition">
          <Icon name="info" size={15} />
        </button>
        <button
          type="button"
          onClick={() => setPage('settings')}
          className="flex items-center gap-2 pl-2 border-l border-edge hover:opacity-80 transition cursor-pointer text-left"
          title="Sozlamalar va profil"
        >
          <Avatar name={user?.name || 'Admin'} src={user?.avatarUrl || ''} size={28} gradient="bg-accent-fill" />
          <div className="hidden text-right sm:block">
            <div className="text-[11px] font-bold leading-tight text-text-primary">{user?.name || 'Admin'}</div>
            <div className="text-[9px] font-bold leading-tight text-accent mt-0.5">{(() => {
              if (user?.is_platform_admin || user?.roles?.admin) return 'Platform Admin';
              if (user?.roles?.owner) return 'Tashkilot direktori';
              if (user?.roles?.manager) return 'Manager';
              if (user?.roles?.teacher) return "O'qituvchi";
              return 'Admin';
            })()}</div>
          </div>
          <Icon name="chevronDown" size={12} className="hidden text-text-secondary sm:block" />
        </button>
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
          <div key={req.id} className="rounded-lg border border-edge bg-surface-1 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex flex-1 items-center gap-3">
                <AdminCenterLogo name={center.name} src={center.imageUrl} color="bg-surface-2 text-warning border border-warning/45" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-text-primary">{center.name}</div>
                  <div className="mt-1 text-xs font-semibold text-text-secondary">
                    {center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · Direktor: <span className="text-text-primary font-bold">{owner.name}</span>{owner.phone ? ` · ${owner.phone}` : ''}
                  </div>
                  {!compact && (center.subjects || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {center.subjects.slice(0, 5).map(s => (
                        <span key={s} className="rounded bg-surface-2 border border-edge px-2 py-0.5 text-[10px] font-bold text-text-secondary">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => approveCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg btn-success px-3 py-2 text-xs font-bold transition">
                  <Icon name="check" size={14} /> Qabul qilish
                </button>
                <button onClick={() => rejectCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs font-bold text-error border border-error/45 hover:bg-surface-2 transition">
                  <Icon name="x" size={14} /> Rad etish
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {pendingCenterReqs.length === 0 && (
        <div className="rounded-lg border border-edge bg-surface-1 px-4 py-10 text-center text-sm font-semibold text-text-secondary">
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

    // Moliyaviy va to'lov ko'rsatkichlari (Trial hisoblanmagan toza pullik xaridlar)
    const financial = isApi ? (apiMetricsRes.data?.financial || {}) : {};
    const totalRevenue = financial.total_revenue || 0;
    const thisMonthRevenue = financial.this_month_revenue || 0;
    const revenueGrowthPct = financial.revenue_growth_pct || 0;
    const paidCustomersCount = financial.paid_customers_count || 0;
    const activePaidSubs = financial.active_paid_subscriptions || 0;
    const trialActiveCount = financial.trial_active_count != null ? financial.trial_active_count : allUsers.filter(u => u.isTrialActive).length;
    const arpu = financial.arpu || 0;
    const clickShare = financial.providers?.click || {};
    const paymeShare = financial.providers?.payme || {};

    return (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Boshqaruv paneli</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">Olympy platformasi moliyaviy, foydalanuvchi va operatsion ko'rsatkichlari.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage('analytics')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface-1 px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-2 transition"
          >
            <Icon name="chart" size={13} />
            <span>To'liq tahlil</span>
          </button>
        </div>
      </div>

      {/* 1-qator: Asosiy Biznes va Daromad Metrikalari */}
      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Jami tushum (Daromad)"
          value={`${totalRevenue.toLocaleString()} so'm`}
          delta={`Shu oy: ${thisMonthRevenue.toLocaleString()} so'm (${revenueGrowthPct >= 0 ? '+' : ''}${revenueGrowthPct}%)`}
          icon={<Icon name="dollar" size={16} />}
          tone="success"
        />
        <AdminMetricCard
          label="Pullik obunachilar"
          value={`${paidCustomersCount.toLocaleString()} ta xaridor`}
          delta={`Trial kiritilmagan • Faol pullik: ${activePaidSubs} ta`}
          icon={<Icon name="creditCard" size={16} />}
          tone="accent"
        />
        <AdminMetricCard
          label="Tashkilotlar"
          value={approvedCenters.length.toLocaleString()}
          delta={pendingCenterReqs.length ? `${pendingCenterReqs.length} ta tasdiqlash kutilmoqda` : 'Barchasi ko\'rib chiqilgan'}
          icon={<Icon name="building" size={16} />}
          tone="warning"
        />
        <AdminMetricCard
          label="Foydalanuvchilar"
          value={allUsers.length.toLocaleString()}
          delta={`${activeUsersCount} ta faol • ${trialActiveCount} ta trialda`}
          icon={<Icon name="users" size={16} />}
          tone="neutral"
        />
      </div>

      {/* 2-qator: Moliyaviy Samaradorlik va Jonli Operatsiyalar */}
      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="O'rtacha to'lov (ARPU)"
          value={`${arpu.toLocaleString()} so'm`}
          delta="Har bir xaridor hisobiga"
          icon={<Icon name="wallet" size={16} />}
          tone="accent"
        />
        <AdminMetricCard
          label="To'lov tizimlari ulushi"
          value={`Click: ${clickShare.pct || 0}% • Payme: ${paymeShare.pct || 0}%`}
          delta={`Click: ${(clickShare.amount || 0).toLocaleString()} • Payme: ${(paymeShare.amount || 0).toLocaleString()}`}
          icon={<Icon name="chart" size={16} />}
          tone="info"
        />
        <AdminMetricCard
          label="Hozir onlayn"
          value={onlineCount == null ? '—' : onlineCount.toLocaleString()}
          delta={onlineCount == null ? "Ma'lumot yo'q" : "Oxirgi 3 daqiqada faol — ro'yxat uchun bosing"}
          icon={<Icon name="activity" size={16} />}
          tone="success"
          onClick={isApi ? () => setOnlineListOpen(true) : undefined}
        />
        <AdminMetricCard
          label="Faol olimpiadalar"
          value={activeOlympiadCount.toLocaleString()}
          delta={activeOlympiadCount ? `${totalOlympiads} tadan hozir o'tmoqda` : `Jami ${totalOlympiads} ta olimpiada`}
          icon={<Icon name="trophy" size={16} />}
          tone="neutral"
        />
      </div>

      {/* 3-qator: Jonli Test Radari va So'nggi To'lov Tranzaksiyalari */}
      <div className="grid gap-[12px] xl:grid-cols-[1.2fr_0.8fr]">
        {/* So'nggi To'lov Tranzaksiyalari */}
        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="creditCard" size={15} className="text-accent" />
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-primary">So'nggi to'lov tranzaksiyalari</h2>
            </div>
            <button onClick={() => setPage('analytics')} className="text-[11px] font-bold text-accent hover:underline transition">Barchasi</button>
          </div>
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-edge pb-2 text-[9px] font-bold uppercase tracking-widest text-text-secondary">
                  <th className="pb-2">Foydalanuvchi</th>
                  <th className="pb-2">Tarif</th>
                  <th className="pb-2">Tizim</th>
                  <th className="pb-2 text-right">Summa</th>
                  <th className="pb-2 text-right">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {(() => {
                  const txs = (apiRecentTxRes.data?.transactions || []).slice(0, 5);
                  if (txs.length === 0) {
                    return <tr><td colSpan={5} className="py-8 text-center text-xs font-semibold text-text-secondary">Muvaffaqiyatli to'lov tranzaksiyalari hali mavjud emas</td></tr>;
                  }
                  return txs.map(tx => (
                    <tr key={tx.id} className="text-xs admin-table-row">
                      <td className="py-2.5 pr-2">
                        <div className="font-bold text-text-primary truncate max-w-[140px]">{tx.user_name}</div>
                        <div className="font-mono text-[10px] text-text-secondary">{tx.phone}</div>
                      </td>
                      <td className="py-2.5 font-semibold text-text-secondary">{tx.plan_name}</td>
                      <td className="py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${tx.provider === 'click' ? 'bg-info/15 text-info border border-info/45' : 'bg-accent/15 text-accent border border-accent/45'}`}>
                          {tx.provider}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-success">
                        +{Number(tx.amount).toLocaleString()} so'm
                      </td>
                      <td className="py-2.5 text-right">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${tx.status === 'success' ? 'bg-success/15 text-success border border-success/45' : tx.status === 'pending' ? 'bg-warning/15 text-warning border border-warning/45' : 'bg-error/15 text-error border border-error/45'}`}>
                          {tx.status === 'success' ? 'To\'landi' : tx.status === 'pending' ? 'Kutilmoqda' : 'Xato'}
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </section>

        {/* Jonli Test & Imtihonlar Radari */}
        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error"></span>
              </span>
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-primary">Jonli Test Radari</h2>
            </div>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-bold text-text-primary border border-edge">
              {(apiLiveRadarRes.data?.active_sessions_count || 0)} ta jonli
            </span>
          </div>

          {/* Pending Reviews Alert */}
          {(apiLiveRadarRes.data?.pending_review_count || 0) > 0 && (
            <div className="mb-3 rounded-xl bg-warning/15 border border-warning/45 p-2.5 text-xs text-warning flex items-center gap-2 font-bold">
              <Icon name="info" size={14} />
              <span>{apiLiveRadarRes.data.pending_review_count} ta o'quvchi moderatsiya tekshiruvini kutmoqda (Cheating review)</span>
            </div>
          )}

          <div className="space-y-2.5">
            {(() => {
              const live = (apiLiveRadarRes.data?.live_sessions || []).slice(0, 4);
              if (live.length === 0) {
                return (
                  <div className="py-8 text-center text-xs font-semibold text-text-secondary">
                    Hozirda jonli test topshirayotgan o'quvchilar yo'q
                  </div>
                );
              }
              return live.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-surface-1 border border-edge p-2.5 hover:border-accent/40 transition">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={s.user_name} size={28} gradient="bg-pencil-600" />
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-bold text-text-primary">{s.user_name}</div>
                      <div className="truncate text-[10px] text-text-secondary font-semibold">{s.olympiad_title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.camera_consent && <span className="text-[10px]" title="Kamera proktoring faol">📷</span>}
                    {s.microphone_consent && <span className="text-[10px]" title="Mikrofon proktoring faol">🎙️</span>}
                    <button
                      type="button"
                      onClick={() => setLiveProctorSession({ id: s.id, studentName: s.user_name, olympiadTitle: s.olympiad_title })}
                      className="inline-flex items-center gap-1 rounded-lg bg-error/15 border border-error/45 px-2 py-1 text-[10px] font-bold text-error hover:bg-error/25 transition"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse"></span>
                      <span>Jonli ko'rish</span>
                    </button>
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1.55fr_1.45fr]">
        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-primary">Eng so'nggi tashkilotlar</h2>
            <button onClick={() => setPage('centers')} className="text-[11px] font-bold text-accent hover:text-accent transition">Hammasi</button>
          </div>
          <div className="grid grid-cols-[1fr_70px_100px] border-b border-edge pb-2 text-[9px] font-bold uppercase tracking-widest text-text-secondary">
            <span>Tashkilot</span><span className="text-right">O'quvchi</span><span className="text-right">Holat</span>
          </div>
          <div className="divide-y divide-edge">
            {dashboardCenters.map(center => (
              <div key={center.id} className="grid grid-cols-[1fr_70px_100px] items-center gap-2 py-3 admin-table-row">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface-2 text-xs font-bold text-text-primary">{center.name?.[0] || 'O'}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-text-primary">{center.name}</div>
                    <div className="truncate text-[10px] text-text-secondary font-semibold">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] font-bold text-text-secondary">{(center.students || 0).toLocaleString()}</div>
                <div className="text-right"><AdminPill status={center.status} /></div>
              </div>
            ))}
            {dashboardCenters.length === 0 && <div className="py-10 text-center text-[12px] font-semibold text-text-secondary">Tashkilotlar yo'q</div>}
          </div>
        </section>

        <section className="admin-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-primary">Pending direktor arizalari</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-accent hover:text-accent transition">Hammasi</button>
          </div>
          <div className="space-y-3">
            {dashboardRequests.map(({ req, center, owner }) => (
              <div key={req.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-surface-1 border border-edge hover:border-edge-strong transition duration-200">
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-text-primary truncate">{center?.name || 'Yangi tashkilot'}</div>
                  <div className="mt-0.5 truncate text-[11px] font-bold text-text-secondary">{owner.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-text-secondary font-semibold">{center?.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <AdminPill status="pending">Kutilmoqda</AdminPill>
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button onClick={() => approveCenterReq(req)} className="rounded bg-surface-2 hover:bg-surface-1 px-2 py-1 text-[10px] font-bold text-success border border-success/45 transition">Qabul</button>
                    <button onClick={() => rejectCenterReq(req)} className="rounded bg-surface-2 hover:bg-surface-1 px-2 py-1 text-[10px] font-bold text-error border border-error/45 transition">Rad</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardRequests.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-text-secondary">Pending arizalar yo'q</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1fr_1fr]">
        <section className="admin-card p-5">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-wider text-text-primary">Tashkilotlar holati</h2>
          <AdminDonut segments={[
            { label: 'Tasdiqlangan', value: approvedCenterPct, color: 'rgb(var(--color-success))' },
            { label: 'Kutilmoqda', value: pendingCenterPct, color: 'rgb(var(--color-warning))' },
            { label: 'Boshqa', value: otherCenterPct, color: 'rgb(var(--color-text-secondary))' },
          ]} />
        </section>

        <section className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-primary">Bildirishnomalar</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-accent hover:text-accent transition">Hammasi</button>
          </div>
          <div className="space-y-4">
            {dashboardNotifications.map(item => (
              <div key={item.id} className="flex items-start gap-3 p-1">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${item.tone === 'rose' ? 'bg-surface-2 text-error border-error/45' : item.tone === 'emerald' ? 'bg-surface-2 text-success border-success/45' : 'bg-surface-2 text-accent border-accent/45'}`}>
                  <Icon name={item.tone === 'rose' ? 'info' : item.tone === 'emerald' ? 'check' : 'bell'} size={14} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-bold text-text-primary">{item.title}</div>
                  <div className="mt-0.5 truncate text-[10px] text-text-secondary font-bold">{item.time || ''}</div>
                </div>
              </div>
            ))}
            {dashboardNotifications.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-text-secondary">Yangi bildirishnomalar yo'q</div>
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
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <div className="text-[11px] font-bold text-text-secondary">
            {presenceUnknown ? "Onlayn holati mavjud emas" : `${presenceOnlineCount.toLocaleString()} ta onlayn`}
          </div>
          <div className="text-[11px] font-bold text-text-secondary">
            Jami {presenceRows.length.toLocaleString()} ta
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
          {presenceLoading ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Yuklanmoqda...</div>
          ) : apiOnlineUsersRes.error ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</div>
          ) : presenceRows.length === 0 ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Foydalanuvchilar yo'q</div>
          ) : presenceRows.map(row => (
            <div key={row.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  row.is_online === true
                    ? 'bg-success'
                    : 'bg-edge-strong'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-text-primary">{row.full_name || "Foydalanuvchi"}</div>
                <div className="font-mono text-[10px] text-text-secondary">{maskPhoneDisplay(row.phone, '')}</div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  row.is_online === true ? 'text-success' : 'text-text-secondary'
                }`}>
                  {row.is_online === null ? "Noma'lum" : row.is_online ? 'Onlayn' : 'Oflayn'}
                </span>
                {/* Faqat oflayn qatorlarda: qachondan beri yo'q. `is_online`
                    null bo'lsa (Redis o'chgan) holat noma'lum — "3 soat oldin"
                    yozish "hozir oflayn" degan yolg'on xulosaga olib kelardi. */}
                {row.is_online === false && (
                  <div className="mt-0.5 text-[10px] font-semibold text-text-secondary"
                       title={row.last_seen_at ? formatAdminDateTime(row.last_seen_at) : ''}>
                    {row.last_seen_at ? formatAdminRelativeTime(row.last_seen_at) : 'Hech qachon'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-semibold text-text-secondary leading-relaxed">
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
        <h1 className="text-[20px] font-bold leading-tight text-text-primary">Direktor arizalari</h1>
        <p className="mt-1 text-[11px] font-bold text-text-secondary">Direktor tashkilot yoki markaz ro'yxatdan o'tkazish uchun yuborgan arizalari.</p>
      </div>
      <CenterApprovalList />
    </div>
  );

  const renderCenters = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Tashkilotlar va markazlar</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">Faqat qabul qilingan tashkilotlar o'quvchilar va mehmonlarga ko'rinadi.</p>
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
              <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                {['Tashkilot', 'Turi', 'Manzil', 'Direktor', 'O\'quvchi', 'Olimpiada', 'Holat', 'Premium', 'Amal'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {centers.map(center => {
                const owner = getOwnerInfo(center);
                return (
                  <tr key={center.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <AdminCenterLogo name={center.name} src={center.imageUrl} />
                        <div>
                          <div className="font-bold text-text-primary">{center.name}</div>
                          <div className="text-[10px] font-semibold text-text-secondary">{formatAdminDate(center.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">{center.organizationType || "O'quv markaz"}</td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">{formatCenterLocation(center)}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-text-primary">{owner.name}</div>
                      {owner.phone && <div className="text-[10px] text-text-secondary font-semibold">{owner.phone}</div>}
                    </td>
                    <td className="px-5 py-4 font-bold text-text-primary">{center.students || 0}</td>
                    <td className="px-5 py-4 font-bold text-text-primary">{center.olympiads || 0}</td>
                    <td className="px-5 py-4"><AdminPill status={center.status} /></td>
                    <td className="px-5 py-4">
                      {center.isPremium ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-success/45 px-2.5 py-0.5 text-[10px] font-bold text-success">
                            <Icon name="check" size={11} /> Premium
                          </span>
                          <button onClick={() => setRevokePremiumConfirm(center)} className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11px] font-bold text-error ring-1 ring-error/45 hover:bg-surface-2 transition">Bekor qilish</button>
                        </div>
                      ) : (
                        <button onClick={() => togglePremium(center)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-warning ring-1 ring-warning/45 hover:bg-surface-2 transition">Premium berish</button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {center.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => approveCenterDirect(center)} className="rounded-lg btn-success px-3 py-1.5 text-[11px] font-bold transition">Qabul</button>
                          <button onClick={() => setRejectCenterConfirm(center)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-error ring-1 ring-error/45 hover:bg-surface-2 transition">Rad</button>
                        </div>
                      ) : (
                        <button onClick={() => setRejectCenterConfirm(center)} className="rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary hover:bg-surface-2 hover:text-text-primary transition">
                          Ro'yxatdan olish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {centers.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Tashkilotlar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  // ─── Kengaytirilgan Foydalanuvchi Boshqaruvi Handlerlari ───
  const handleSendTelegram = (userId) => {
    if (!telegramMsgText.trim()) {
      showToast('Xabar matnini kiriting', 'error');
      return;
    }
    setTelegramMsgLoading(true);
    OlympyApi.sendAdminUserTelegram(userId, telegramMsgText, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Telegram orqali xabar yuborildi');
        setShowTelegramModal(false);
        setTelegramMsgText('');
      })
      .catch(err => showToast(toUserMessage(err, 'Telegram xabar yuborilmadi'), 'error'))
      .finally(() => setTelegramMsgLoading(false));
  };

  const handleCreateFlashAlert = (userId) => {
    if (!flashAlertTitle.trim() || !flashAlertMsg.trim()) {
      showToast('Sarlavha va xabar matnini kiriting', 'error');
      return;
    }
    setFlashAlertLoading(true);
    OlympyApi.createAdminUserFlashAlert(
      userId,
      { title: flashAlertTitle, message: flashAlertMsg, alert_type: flashAlertType },
      OlympyApi.getToken(),
    )
      .then(() => {
        showToast('Shaxsiy modal xabar yuborildi');
        setShowFlashAlertModal(false);
        setFlashAlertTitle('');
        setFlashAlertMsg('');
        apiUserFlashAlertsRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Modal xabar yuborilmadi'), 'error'))
      .finally(() => setFlashAlertLoading(false));
  };

  const handleTransferCenter = (userId) => {
    if (!transferTargetCenterId) {
      showToast('Markazni tanlang', 'error');
      return;
    }
    setTransferLoading(true);
    OlympyApi.transferAdminUserCenter(
      userId,
      { center_id: transferTargetCenterId, role: transferRole, action: 'transfer' },
      OlympyApi.getToken(),
    )
      .then(res => {
        showToast(res?.message || 'Markaz biriktirildi');
        setShowCenterTransferModal(false);
        apiUserDetailRes.reload();
        apiUsersRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Markazga biriktirib bo‘lmadi'), 'error'))
      .finally(() => setTransferLoading(false));
  };

  const handleSaveQuota = (userId) => {
    setQuotaLoading(true);
    OlympyApi.setAdminUserQuota(
      userId,
      {
        custom_practice_quota: quotaPractice !== '' ? Number(quotaPractice) : undefined,
        custom_discount_percent: discountPercent !== '' ? Number(discountPercent) : undefined,
        discount_days: discountDays !== '' ? Number(discountDays) : undefined,
      },
      OlympyApi.getToken(),
    )
      .then(res => {
        showToast(res?.message || 'Imtiyoz va kvotalar saqlandi');
        setShowQuotaModal(false);
        apiUserDetailRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Saqlab bo‘lmadi'), 'error'))
      .finally(() => setQuotaLoading(false));
  };

  const handleRefundPayment = (txId) => {
    if (!confirm('Haqiqatan ham bu to‘lovni bekor qilib, tegishli premium obunani to‘xtatmoqchimisiz?')) return;
    OlympyApi.refundAdminPayment(txId, "Admin paneldan to'lov bekor qilindi", OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'To‘lov bekor qilindi');
        apiUserBillingRes.reload();
        apiUserDetailRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'To‘lovni bekor qilib bo‘lmadi'), 'error'));
  };

  const handleBanDevice = (fingerprintHash, userId) => {
    OlympyApi.banAdminDevice(
      { fingerprint_hash: fingerprintHash, user_id: userId, reason: 'Qoidabuzarlik sababli apparat izi bloklandi' },
      OlympyApi.getToken(),
    )
      .then(res => {
        showToast(res?.message || 'Qurilma bloklandi');
        apiUserDevicesRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Qurilmani bloklab bo‘lmadi'), 'error'));
  };

  const handleUnbanDevice = (fingerprintHash) => {
    OlympyApi.unbanAdminDevice({ fingerprint_hash: fingerprintHash }, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Qurilma bloki ochildi');
        apiUserDevicesRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Blokni ochib bo‘lmadi'), 'error'));
  };

  const handleBulkImportUsers = () => {
    if (!bulkImportText.trim()) {
      showToast('CSV yoki ma‘lumot matnini kiriting', 'error');
      return;
    }
    setBulkImportLoading(true);
    OlympyApi.bulkImportAdminUsers({ csv_text: bulkImportText }, OlympyApi.getToken())
      .then(res => {
        setBulkImportResults(res);
        showToast(`${res?.created_count || 0} ta yangi foydalanuvchi yaratildi`);
        apiUsersRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Importda xatolik yuz berdi'), 'error'))
      .finally(() => setBulkImportLoading(false));
  };

  // "Batafsil" oynasi — Kengaytirilgan Sub-tablar bilan
  const renderUserDetailModal = () => {
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
      totpEnabled: !!fresh?.totpEnabled,
      isPlatformAdmin: fresh ? !!fresh.isPlatformAdmin : !!detailUser.isPlatformAdmin,
      blockReason: (isApi && apiUserDetailRes.data?.id === detailBackendId
        ? apiUserDetailRes.data.block_reason : null) || '',
      blockedUntil: (isApi && apiUserDetailRes.data?.id === detailBackendId
        ? apiUserDetailRes.data.blocked_until : null) || null,
      customPracticeQuota: apiUserDetailRes.data?.custom_practice_quota || 0,
      customDiscountPercent: apiUserDetailRes.data?.custom_discount_percent || 0,
      customDiscountUntil: apiUserDetailRes.data?.custom_discount_until || null,
      riskScore: apiUserDetailRes.data?.risk_score ?? 0,
      coins: apiUserDetailRes.data?.coins ?? detailUser.coins ?? 0,
    } : null;

    const roleEntries = info?.roles ? Object.entries(info.roles) : [];
    const billing = isApi && apiUserBillingRes.data?.user_id === detailBackendId ? apiUserBillingRes.data : null;
    const txRows = Array.isArray(billing?.transactions) ? billing.transactions : [];
    const billingLoading = apiUserBillingRes.loading || (!billing && !apiUserBillingRes.error);

    const renderHistorySection = ({ title, note, loading, error, rows, emptyText, renderRow }) => (
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{title}</div>
          {note && <div className="text-[10px] font-bold text-accent truncate">{note}</div>}
        </div>
        <div className="max-h-56 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
          {!isApi ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Faqat API rejimida ko'rinadi</div>
          ) : loading ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Yuklanmoqda...</div>
          ) : error ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">{emptyText}</div>
          ) : rows.map(renderRow)}
        </div>
      </div>
    );

    return (
      <Modal
        open={!!detailUser}
        onClose={() => { setDetailUser(null); setDetailSubTab('overview'); }}
        title="Foydalanuvchi ma'lumotlari va nazorati"
        width="max-w-3xl"
      >
        {info && (
          <div className="space-y-5">
            {/* Asosiy Header kartasi */}
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5 border border-edge">
              <Avatar name={info.name} src={info.avatarUrl} size={48} gradient="bg-pencil-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-text-primary truncate">{info.name}</span>
                  {info.isPremium && (
                    <span className="rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-extrabold">
                      ⭐ VIP
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-secondary font-mono mt-0.5">{info.phone || '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                <AdminPill status={info.isActive ? 'approved' : 'rejected'}>
                  {info.isActive ? 'Faol' : 'Bloklangan'}
                </AdminPill>
                {apiUserDetailRes.loading && (
                  <span className="text-[10px] font-bold text-text-secondary">Yangilanmoqda...</span>
                )}
              </div>
            </div>

            {/* Sub-tablar menyusi */}
            <div className="flex flex-wrap gap-1.5 border-b border-edge pb-2">
              {[
                { key: 'overview', label: 'Umumiy', icon: 'user' },
                { key: 'timeline', label: 'Xronologiya', icon: 'clock' },
                { key: 'risk', label: 'Xavfsizlik & Qurilmalar', icon: 'shield' },
                { key: 'analytics', label: 'AI & Heatmap', icon: 'bar-chart-2' },
                { key: 'center_quota', label: 'Markaz & Kvotalar', icon: 'layers' },
                { key: 'finance', label: 'Moliya & Tangalar', icon: 'credit-card' },
                { key: 'communication', label: 'Aloqa & Flash Alert', icon: 'message-square' },
              ].map(st => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setDetailSubTab(st.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    detailSubTab === st.key
                      ? 'bg-accent text-on-accent shadow-sm'
                      : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                  }`}
                >
                  <Icon name={st.icon} size={12} />
                  {st.label}
                </button>
              ))}
            </div>

            {/* 1. OVERVIEW SUB-TAB */}
            {detailSubTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { label: 'ID', value: detailBackendId ? `#${detailBackendId}` : '—' },
                    { label: "Ro'yxatdan o'tgan", value: formatAdminDate(info.joined) || '—' },
                    { label: 'Tashkilot', value: info.center || 'Biriktirilmagan' },
                    { label: 'Tarif', value: info.planName || 'Standart' },
                  ].map(f => (
                    <div key={f.label} className="rounded-xl bg-surface-2 px-3 py-2.5 border border-edge">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{f.label}</div>
                      <div className="mt-1 text-xs font-bold text-text-primary truncate">{f.value}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary">Rollar</div>
                  <div className="flex flex-wrap gap-2">
                    {roleEntries.length > 0 ? roleEntries.map(([key, val]) => (
                      <span key={key} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 border border-accent/45 px-2.5 py-1.5 text-[11px] font-bold text-accent">
                        {ROLE_META[key]?.label || key}
                        <AdminPill status={val?.status || 'pending'} />
                      </span>
                    )) : (
                      <span className="rounded-lg bg-surface-2 border border-accent/45 px-2.5 py-1.5 text-[11px] font-bold text-accent">
                        {detailUser?.role || '—'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Admin Tags */}
                {isApi && (
                  <div className="rounded-xl border border-edge bg-surface-2 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                        🏷️ Foydalanuvchi Teglari (Admin Tags)
                      </div>
                      {tagsBusy && <span className="text-[10px] text-text-secondary font-semibold">Saqlanmoqda...</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['vip', 'shubhali', 'yutuqchi', 'kuzatuvda', 'iqtidorli'].map(preset => {
                        const currentTags = apiUserDetailRes.data?.admin_tags || [];
                        const isAttached = currentTags.includes(preset);
                        return (
                          <button
                            key={preset}
                            type="button"
                            disabled={tagsBusy}
                            onClick={() => handleToggleTag(detailBackendId, currentTags, preset)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                              isAttached
                                ? 'bg-accent text-on-accent border border-accent'
                                : 'bg-surface-1 text-text-secondary border border-edge hover:text-text-primary hover:bg-surface-3'
                            }`}
                          >
                            <span>#{preset}</span>
                            {isAttached ? <Icon name="check" size={11} /> : <Icon name="plus" size={11} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* CRM Notes */}
                {isApi && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                      📝 Ichki Admin Eslatmalari (CRM Notes)
                    </div>
                    <div className="max-h-40 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
                      {apiUserDetailRes.data?.recent_notes && apiUserDetailRes.data.recent_notes.length > 0 ? (
                        apiUserDetailRes.data.recent_notes.map(note => (
                          <div key={note.id} className="p-2.5 flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="text-text-primary font-medium break-words">{note.text}</div>
                              <div className="text-[10px] text-text-secondary font-semibold mt-1">
                                {note.author_name} · {formatAdminDateTime(note.created_at)}
                              </div>
                            </div>
                            <button
                              type="button"
                              title="Eslatmani o'chirish"
                              onClick={() => handleDeleteNote(detailBackendId, note.id)}
                              className="text-text-secondary hover:text-error transition p-1"
                            >
                              <Icon name="trash-2" size={13} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-4 text-center text-[11px] font-semibold text-text-secondary">
                          Hozircha admin eslatmalari yo'q
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newNoteText}
                        onChange={e => setNewNoteText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newNoteText.trim()) {
                            e.preventDefault();
                            handleAddNote(detailBackendId);
                          }
                        }}
                        placeholder="Ichki eslatma yozing (faqat adminlar ko'radi)..."
                        className="h-8 flex-1 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs text-text-primary outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        disabled={noteBusy || !newNoteText.trim()}
                        onClick={() => handleAddNote(detailBackendId)}
                        className="h-8 rounded-lg bg-accent text-on-accent px-3 text-xs font-bold transition disabled:opacity-50"
                      >
                        Qo'shish
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. TIMELINE SUB-TAB */}
            {detailSubTab === 'timeline' && (
              <div className="space-y-3">
                <div className="text-xs font-bold text-text-primary flex items-center justify-between">
                  <span>Foydalanuvchining Hayotiy Sikli (Activity Timeline)</span>
                  <button
                    type="button"
                    onClick={() => apiUserTimelineRes.reload()}
                    className="text-accent hover:underline text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Icon name="refresh" size={11} /> Yangilash
                  </button>
                </div>

                {apiUserTimelineRes.loading ? (
                  <div className="p-8 text-center text-xs text-text-secondary font-bold">Timeline yuklanmoqda...</div>
                ) : !apiUserTimelineRes.data?.results?.length ? (
                  <div className="p-8 text-center text-xs text-text-secondary font-bold">Faollik xronologiyasi topilmadi</div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-edge max-h-96 overflow-y-auto admin-scroll pr-2">
                    {apiUserTimelineRes.data.results.map((evt, i) => (
                      <div key={i} className="relative group">
                        <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-surface-1 ${
                          evt.color === 'error' ? 'bg-error' : evt.color === 'success' ? 'bg-success' : evt.color === 'warning' ? 'bg-warning' : 'bg-accent'
                        }`} />
                        <div className="rounded-xl border border-edge bg-surface-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-text-primary">{evt.title}</span>
                            <span className="text-[10px] text-text-secondary font-semibold font-mono">{formatAdminDateTime(evt.timestamp)}</span>
                          </div>
                          <p className="text-xs text-text-secondary mt-1">{evt.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. RISK & DEVICES SUB-TAB */}
            {detailSubTab === 'risk' && (
              <div className="space-y-4">
                {/* Risk Score */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">Antifrod va Risk Indeksi</div>
                      <div className="text-sm font-bold text-text-primary mt-0.5">
                        Xavf darajasi: <span className={info.riskScore > 50 ? 'text-error' : info.riskScore > 20 ? 'text-warning' : 'text-success'}>{info.riskScore}%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => apiUserRiskScoreRes.reload()}
                      className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-bold"
                    >
                      Qayta hisoblash
                    </button>
                  </div>

                  <div className="h-2.5 w-full rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        info.riskScore > 60 ? 'bg-error' : info.riskScore > 25 ? 'bg-warning' : 'bg-success'
                      }`}
                      style={{ width: `${Math.max(4, info.riskScore)}%` }}
                    />
                  </div>

                  {apiUserRiskScoreRes.data?.factors?.length > 0 ? (
                    <div className="space-y-1.5 pt-2 border-t border-edge">
                      {apiUserRiskScoreRes.data.factors.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-surface-1 border border-edge">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            f.severity === 'critical' || f.severity === 'high' ? 'bg-error/15 text-error' : 'bg-warning/15 text-warning'
                          }`}>
                            +{f.points} ball
                          </span>
                          <div>
                            <div className="font-bold text-text-primary">{f.name}</div>
                            <div className="text-[11px] text-text-secondary">{f.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-success font-semibold">Hech qanday shubhali xavf omillari aniqlanmadi.</div>
                  )}
                </div>

                {/* Device Fingerprints */}
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    🖥️ Qurilma Izlari (Device Fingerprints & Hardware Ban)
                  </div>
                  <div className="max-h-56 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
                    {!apiUserDevicesRes.data?.results?.length ? (
                      <div className="p-5 text-center text-xs text-text-secondary">Qurilma izlari topilmadi</div>
                    ) : (
                      apiUserDevicesRes.data.results.map(dev => (
                        <div key={dev.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-bold text-text-primary flex items-center gap-2">
                              <span>{dev.browser_name || 'Brauzer'} ({dev.os_name || 'Tizim'})</span>
                              {dev.is_banned && (
                                <span className="px-1.5 py-0.5 rounded bg-error/15 text-error text-[10px] font-bold">
                                  BLOKLANGAN
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-text-secondary font-mono mt-0.5">
                              IP: {dev.ip_address || '—'} · Hash: {dev.fingerprint_hash.slice(0, 16)}...
                            </div>
                          </div>
                          <div>
                            {dev.is_banned ? (
                              <button
                                type="button"
                                onClick={() => handleUnbanDevice(dev.fingerprint_hash)}
                                className="btn-ghost text-xs text-success hover:bg-success/10 px-2.5 py-1 rounded-lg font-bold"
                              >
                                Blokdan chiqarish
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBanDevice(dev.fingerprint_hash, detailBackendId)}
                                className="btn-ghost text-xs text-error hover:bg-error/10 px-2.5 py-1 rounded-lg font-bold"
                              >
                                Qurilmani bloklash
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. ANALYTICS & HEATMAP SUB-TAB */}
            {detailSubTab === 'analytics' && (
              <div className="space-y-4">
                {/* AI Summary */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-accent">
                    <Icon name="sparkles" size={14} />
                    <span>AI Profil Diagnostikasi (Gemini Insights)</span>
                  </div>

                  {apiUserAiSummaryRes.loading ? (
                    <div className="p-4 text-center text-xs text-text-secondary font-semibold">Tahlil hisoblanmoqda...</div>
                  ) : apiUserAiSummaryRes.data ? (
                    <div className="space-y-2 text-xs">
                      <p className="text-text-primary font-medium">{apiUserAiSummaryRes.data.overview}</p>
                      {apiUserAiSummaryRes.data.strengths?.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-success/10 border border-success/30">
                          <div className="font-bold text-success text-[11px]">💪 Kuchli tomonlar:</div>
                          <ul className="list-disc list-inside text-text-primary text-[11px] mt-1 space-y-0.5">
                            {apiUserAiSummaryRes.data.strengths.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {apiUserAiSummaryRes.data.recommendations?.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/30">
                          <div className="font-bold text-accent text-[11px]">💡 Tavsiyalar:</div>
                          <ul className="list-disc list-inside text-text-primary text-[11px] mt-1 space-y-0.5">
                            {apiUserAiSummaryRes.data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Heatmap */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-text-primary">Faollik Issiqlik Xaritasi (Activity Heatmap - 90 kun)</div>
                    {apiUserHeatmapRes.data && (
                      <div className="text-[11px] font-bold text-accent">
                        Eng faol: {apiUserHeatmapRes.data.peak_day}, soat {apiUserHeatmapRes.data.peak_hour}
                      </div>
                    )}
                  </div>

                  {apiUserHeatmapRes.loading ? (
                    <div className="p-6 text-center text-xs text-text-secondary">Matritsa yuklanmoqda...</div>
                  ) : apiUserHeatmapRes.data?.matrix ? (
                    <div className="overflow-x-auto">
                      <div className="min-w-[480px] space-y-1">
                        {apiUserHeatmapRes.data.matrix.map((row, dayIdx) => (
                          <div key={dayIdx} className="flex items-center gap-1">
                            <span className="w-16 text-[10px] font-bold text-text-secondary truncate">
                              {apiUserHeatmapRes.data.day_names[dayIdx].slice(0, 3)}
                            </span>
                            <div className="flex flex-1 gap-1">
                              {row.map((val, hourIdx) => {
                                const level = val === 0 ? 'bg-surface-1' : val < 3 ? 'bg-emerald-500/30' : val < 6 ? 'bg-emerald-500/60' : 'bg-emerald-500';
                                return (
                                  <div
                                    key={hourIdx}
                                    title={`${apiUserHeatmapRes.data.day_names[dayIdx]} ${hourIdx}:00 - ${val} ta faollik`}
                                    className={`h-4 flex-1 rounded-sm border border-edge/30 transition hover:scale-125 cursor-pointer ${level}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-[9px] text-text-secondary font-mono mt-2 pl-16">
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>23:00</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* 5. CENTER & QUOTAS SUB-TAB */}
            {detailSubTab === 'center_quota' && (
              <div className="space-y-4">
                {/* Center Management */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">O'quv Markazi Biriktiruvi</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        Joriy: <span className="font-bold text-accent">{info.center || 'Biriktirilmagan'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCenterTransferModal(true)}
                      className="btn-primary text-xs px-3 py-1.5 rounded-xl font-bold"
                    >
                      Markazga biriktirish / ko'chirish
                    </button>
                  </div>
                </div>

                {/* Custom Quota & Discounts */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Maxsus Kvotalar va Shaxsiy Chegirma</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        AI kvotasi: <span className="font-bold text-accent">+{info.customPracticeQuota} ta</span> · Chegirma: <span className="font-bold text-success">{info.customDiscountPercent}%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuotaPractice(String(info.customPracticeQuota || ''));
                        setDiscountPercent(String(info.customDiscountPercent || ''));
                        setDiscountDays('30');
                        setShowQuotaModal(true);
                      }}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-xl font-bold border border-edge"
                    >
                      O'zgartirish
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 6. FINANCE & COINS SUB-TAB */}
            {detailSubTab === 'finance' && (
              <div className="space-y-4">
                {/* Tangalar Harakati */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Tangalar Harakati Jurnali (Coin Audit)</div>
                      <div className="text-sm font-extrabold text-warning mt-0.5">
                        🪙 {info.coins ?? 0} ta tanga
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCoinsModalUser({ id: detailBackendId, name: info.name });
                        setCoinsAmount(50);
                        setCoinsReason('');
                      }}
                      className="btn-ghost border border-warning/45 text-warning text-xs px-3 py-1.5 rounded-xl font-bold"
                    >
                      Balansni o'zgartirish (+/-)
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
                    {!apiUserCoinTxRes.data?.results?.length ? (
                      <div className="p-4 text-center text-xs text-text-secondary">Tangalar harakati yo'q</div>
                    ) : (
                      apiUserCoinTxRes.data.results.map(tx => (
                        <div key={tx.id} className="p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-text-primary">{tx.transaction_type_display}</div>
                            <div className="text-[11px] text-text-secondary">{tx.description || '—'} · {formatAdminDateTime(tx.created_at)}</div>
                          </div>
                          <div className={`font-bold font-data ${tx.amount > 0 ? 'text-success' : 'text-error'}`}>
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount} tanga
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* To'lovlar Tarixi */}
                {renderHistorySection({
                  title: "To'lovlar tarixi",
                  note: txRows.length > 0 ? `jami ${txRows.length} ta` : null,
                  loading: billingLoading,
                  error: apiUserBillingRes.error,
                  rows: txRows,
                  emptyText: "To'lovlar tarixi yo'q",
                  renderRow: (tx) => {
                    const st = adminPaymentStatus(tx.status);
                    return (
                      <div key={tx.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold text-text-primary">
                            {formatAdminAmount(tx.amount)} · {ADMIN_PROVIDER_LABEL[tx.provider] || tx.provider}
                          </div>
                          <div className="mt-0.5 text-[10px] font-semibold text-text-secondary">
                            {formatAdminDateTime(tx.created_at)} · #{tx.id}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                          {tx.status === 'success' && (
                            <button
                              type="button"
                              onClick={() => handleRefundPayment(tx.id)}
                              className="text-error hover:bg-error/10 px-2 py-0.5 rounded text-[10px] font-bold border border-error/30 transition"
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  },
                })}
              </div>
            )}

            {/* 7. COMMUNICATION & FLASH ALERT SUB-TAB */}
            {detailSubTab === 'communication' && (
              <div className="space-y-4">
                {/* Direct Telegram */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                        <span>Telegram Bot orqali to'g'ridan-to'g'ri xabar</span>
                        {fresh?.telegram_linked && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 text-[10px] font-bold">
                            Ulangan
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Platforma boti nomidan ushbu o'quvchining shaxsiy Telegramiga xabar yuborish.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTelegramModal(true)}
                      className="btn-primary text-xs px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5"
                    >
                      <Icon name="send" size={13} />
                      Xabar yuborish
                    </button>
                  </div>
                </div>

                {/* Flash Modal Alerts */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Shaxsiy Modal Ogohlantirishlar (Flash Alerts)</div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        Foydalanuvchi keyingi kirishida uning ekranida majburiy ko'rinadigan popup xabar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFlashAlertModal(true)}
                      className="btn-ghost border border-accent text-accent text-xs px-3 py-1.5 rounded-xl font-bold"
                    >
                      + Yangi Flash Alert
                    </button>
                  </div>

                  <div className="max-h-44 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
                    {!apiUserFlashAlertsRes.data?.results?.length ? (
                      <div className="p-4 text-center text-xs text-text-secondary">Flash ogohlantirishlar yo'q</div>
                    ) : (
                      apiUserFlashAlertsRes.data.results.map(al => (
                        <div key={al.id} className="p-3 flex items-start justify-between gap-2 text-xs">
                          <div>
                            <div className="font-bold text-text-primary flex items-center gap-2">
                              <span>{al.title}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                al.alert_type === 'urgent' ? 'bg-error/15 text-error' : 'bg-accent/15 text-accent'
                              }`}>
                                {al.alert_type}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-secondary mt-1">{al.message}</p>
                            <div className="text-[10px] text-text-secondary font-semibold mt-1">
                              {al.is_read ? `O'qildi (${formatAdminDateTime(al.read_at)})` : 'Hali o‘qilmadi'} · {formatAdminDateTime(al.created_at)}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Pastki Amal Tugmalari */}
            {isApi && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-edge">
                <button
                  onClick={() => openWarnModal({
                    backendId: detailBackendId, name: info.name, phone: info.phone,
                  })}
                  className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-2 transition"
                >
                  Ogohlantirish
                </button>
                {!info.isPlatformAdmin && (
                  apiUserDetailRes.data?.is_exam_blocked ? (
                    <button
                      onClick={() => handleExamUnban(detailUser)}
                      className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-error border border-error/45 hover:bg-error hover:text-white transition"
                    >
                      Olimpiada taqiqini bekor qilish
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setExamBanModalUser({ backendId: detailBackendId, name: info.name, phone: info.phone });
                        setExamBanReason('');
                        setExamBanDuration(7);
                      }}
                      className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-error border border-error/45 hover:bg-surface-2 transition"
                    >
                      Olimpiadadan chetlatish (Exam Ban)
                    </button>
                  )
                )}
                {info.totpEnabled && (
                  <button
                    onClick={() => setResetTotpConfirm({ backendId: detailBackendId, name: info.name })}
                    className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-2 transition"
                  >
                    2FA'ni o'chirish
                  </button>
                )}
                <button
                  onClick={() => setForceLogoutConfirm({ backendId: detailBackendId, name: info.name })}
                  className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition"
                >
                  Barcha seanslarni yakunlash
                </button>
                {!info.isPlatformAdmin && info.isActive && (
                  <button
                    onClick={() => setImpersonateConfirm({ backendId: detailBackendId, name: info.name })}
                    className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-2 transition"
                  >
                    Foydalanuvchi sifatida ko'rish
                  </button>
                )}
                {!info.isPlatformAdmin && (
                  <button
                    onClick={() => openMergeModal({
                      backendId: detailBackendId, name: info.name, phone: info.phone,
                    })}
                    className="rounded-lg bg-surface-2 px-3 py-2 text-[11px] font-bold text-accent border border-accent/45 hover:bg-surface-1 transition"
                  >
                    Hisoblarni birlashtirish
                  </button>
                )}
              </div>
            )}

            <button onClick={() => { setDetailUser(null); setDetailSubTab('overview'); }} className="btn-ghost w-full rounded-xl py-3 text-xs font-bold">
              Yopish
            </button>
          </div>
        )}
      </Modal>
    );
  };

  const renderUsers = () => {
    const onlineCount = userRows.filter(r => r.lastSeenAt && (Date.now() - new Date(r.lastSeenAt).getTime() < 300000)).length;
    const examBlockedCount = userRows.filter(r => r.isExamBlocked).length;
    const blockedCount = userRows.filter(r => r.status === 'Bloklangan').length;
    const riskCount = userRows.filter(r => r.adminTags?.includes('shubhali') || r.isExamBlocked || r.status === 'Bloklangan').length;

    return (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Foydalanuvchilar</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">Platformadagi foydalanuvchi rollari, xavfsizlik va o'quv nazorati. Admin userlar hisobga olinmaydi.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
          <div className="relative w-full md:w-72">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
              placeholder="Ism, telefon, teg (#vip) bo'yicha..." />
          </div>
          <button
            type="button"
            onClick={() => { setShowBulkImportModal(true); setBulkImportResults(null); }}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 text-[11px] font-bold shadow-sm transition hover:bg-emerald-700"
          >
            <Icon name="upload" size={13} /> Ommaviy Import
          </button>
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-on-accent px-3 text-[11px] font-bold shadow-sm transition hover:opacity-90">
            <Icon name="send" size={13} /> Xabarnoma
          </button>
          <button
            type="button"
            onClick={handleExportUsersCsv}
            disabled={csvBusy}
            title="Joriy qidiruv bo'yicha filtrlangan ro'yxatni CSV qilib yuklaydi (eng ko'pi 5000 qator)"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-edge bg-surface-2 px-3 text-[11px] font-bold text-text-primary transition hover:bg-surface-2 hover:text-text-primary disabled:opacity-50">
            <Icon name="download" size={13} /> {csvBusy ? 'Yuklanmoqda...' : 'CSV'}
          </button>
        </div>
      </div>

      {/* Tezkor Segment Filtrlar (Quick Presets) */}
      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto admin-scroll pb-1">
        {[
          { key: 'all', label: 'Barchasi', count: userRows.length, icon: 'users' },
          { key: 'online', label: 'Onlayn', count: onlineCount, dot: 'bg-success' },
          { key: 'today', label: 'Bugun faol', icon: 'zap' },
          { key: 'inactive_7d', label: 'Inaktiv (7k+)', icon: 'clock' },
          { key: 'churn_risk', label: 'Ketish xavfi (Churn)', count: apiChurnRiskRes.data?.total ?? undefined, icon: 'alert-triangle' },
          { key: 'exam_blocked', label: 'Olimpiada taqiqida', count: examBlockedCount, badgeClass: 'text-error' },
          { key: 'blocked', label: 'Bloklanganlar', count: blockedCount, badgeClass: 'text-error' },
          { key: 'high_risk', label: 'Shubhali xavf', count: riskCount, badgeClass: 'text-warning' },
        ].map(seg => {
          const active = userSegment === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => setUserSegment(seg.key)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                active
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary border border-edge'
              }`}
            >
              {seg.dot && <span className={`h-2 w-2 rounded-full ${seg.dot} animate-pulse`} />}
              {seg.icon && <Icon name={seg.icon} size={12} />}
              <span>{seg.label}</span>
              {typeof seg.count === 'number' && (
                <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-extrabold ${active ? 'bg-white/20 text-white' : 'bg-surface-3 text-text-primary'}`}>
                  {seg.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ko'p parametrli Filtrlar Paneli */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2.5 border border-edge">
        <div className="flex items-center gap-1.5 text-xs font-bold text-text-secondary mr-1">
          <Icon name="filter" size={13} />
          <span>Filtrlar:</span>
        </div>

        <select
          value={userFilterRole}
          onChange={e => setUserFilterRole(e.target.value)}
          className="h-8 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs font-semibold text-text-primary outline-none focus:border-accent"
        >
          <option value="all">Barcha rollar</option>
          <option value="student">O'quvchilar</option>
          <option value="teacher">O'qituvchilar</option>
          <option value="manager">Menejerlar</option>
          <option value="owner">Direktorlar (Owner)</option>
          <option value="admin">Platform Adminlar</option>
        </select>

        <select
          value={userFilterStatus}
          onChange={e => setUserFilterStatus(e.target.value)}
          className="h-8 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs font-semibold text-text-primary outline-none focus:border-accent"
        >
          <option value="all">Barcha holatlar</option>
          <option value="active">Faol</option>
          <option value="blocked">Bloklangan</option>
          <option value="exam_blocked">Olimpiada taqiqida</option>
          <option value="telegram_linked">Telegram ulangan</option>
          <option value="telegram_unlinked">Telegram ulanmagan</option>
        </select>

        <select
          value={userFilterPlan}
          onChange={e => setUserFilterPlan(e.target.value)}
          className="h-8 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs font-semibold text-text-primary outline-none focus:border-accent"
        >
          <option value="all">Barcha tariflar</option>
          <option value="free">Bepul (Free)</option>
          <option value="premium">Shaxsiy Premium</option>
          <option value="org_premium">Tashkilot obunasi</option>
        </select>

        <select
          value={userFilterActivity}
          onChange={e => setUserFilterActivity(e.target.value)}
          className="h-8 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs font-semibold text-text-primary outline-none focus:border-accent"
        >
          <option value="all">Barcha faollik</option>
          <option value="online">Hozir onlayn</option>
          <option value="today">Bugun faol</option>
          <option value="inactive_7d">Inaktiv (7k+)</option>
        </select>

        <select
          value={userFilterTag}
          onChange={e => setUserFilterTag(e.target.value)}
          className="h-8 rounded-lg bg-surface-1 border border-edge px-2.5 text-xs font-semibold text-text-primary outline-none focus:border-accent"
        >
          <option value="all">Barcha teglar</option>
          <option value="vip">#vip</option>
          <option value="shubhali">#shubhali</option>
          <option value="yutuqchi">#yutuqchi</option>
          <option value="kuzatuvda">#kuzatuvda</option>
          <option value="testchi">#testchi</option>
        </select>

        {(userSegment !== 'all' || userFilterRole !== 'all' || userFilterStatus !== 'all' || userFilterPlan !== 'all' || userFilterActivity !== 'all' || userFilterTag !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setUserSegment('all');
              setUserFilterRole('all');
              setUserFilterStatus('all');
              setUserFilterPlan('all');
              setUserFilterActivity('all');
              setUserFilterTag('all');
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-text-secondary hover:text-error transition"
          >
            <Icon name="x" size={12} />
            <span>Tozalash</span>
          </button>
        )}
      </div>

      {/* Ommaviy amallar paneli */}
      {selectedUserIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/45 bg-surface-2 px-4 py-3">
          <span className="text-xs font-bold text-text-primary">{selectedUserIds.length} ta tanlandi</span>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto">
            <button
              type="button"
              onClick={() => setBroadcastModalOpen(true)}
              className="rounded-lg border border-accent bg-accent/15 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-accent hover:text-on-accent flex items-center gap-1">
              <Icon name="send" size={12} />
              <span>Xabar yuborish (Broadcast)</span>
            </button>
            <button
              type="button"
              onClick={() => openBulkBlockModal('block')}
              className="rounded-lg border border-error/45 bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-error transition hover:bg-surface-2">
              Bloklash
            </button>
            <button
              type="button"
              onClick={() => openBulkBlockModal('unblock')}
              className="rounded-lg border border-success/45 bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-success transition hover:bg-surface-1">
              Blokni ochish
            </button>
            <button
              type="button"
              onClick={openBulkRoleModal}
              className="rounded-lg border border-accent/45 bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-accent transition hover:bg-surface-1">
              Rol o'zgartirish
            </button>
            <button
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary transition hover:bg-surface-2 hover:text-text-primary">
              Tanlovni bekor qilish
            </button>
          </div>
        </div>
      )}
      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[760px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3.5">
                  <button aria-pressed={allVisibleSelected}
                    type="button"
                    onClick={toggleSelectAllVisible}
                    aria-label="Hammasini tanlash"
                    className={`flex h-4 w-4 items-center justify-center rounded border transition ${allVisibleSelected ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge-strong hover:border-text-secondary'}`}>
                    {allVisibleSelected && <Icon name="check" size={12} />}
                  </button>
                </th>
                {['Foydalanuvchi', 'Telefon', 'Rol', 'Tashkilot', 'Tangalar', 'Holat', 'Premium', 'Amallar'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {(() => {
                if (visibleUserRows.length === 0) {
                  return <tr><td colSpan={9} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">{userTableQuery ? 'Qidiruv natijasi topilmadi' : 'Foydalanuvchilar yo\'q'}</td></tr>;
                }
                return visibleUserRows.map(row => {
                  const isOnline = row.lastSeenAt && (Date.now() - new Date(row.lastSeenAt).getTime() < 300000);
                  return (
                  <tr key={row.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4">
                      <button aria-pressed={selectedUserIds.includes(row.id)}
                        type="button"
                        onClick={() => toggleUserSelected(row.id)}
                        aria-label={`${row.name} — tanlash`}
                        className={`flex h-4 w-4 items-center justify-center rounded border transition ${selectedUserIds.includes(row.id) ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge-strong hover:border-text-secondary'}`}>
                        {selectedUserIds.includes(row.id) && <Icon name="check" size={12} />}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar name={row.name} src={row.avatarUrl || ''} size={34} gradient="bg-pencil-600" />
                          {isOnline && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface-1" title="Hozir onlayn" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-text-primary flex items-center gap-1.5">
                            <span>{row.name}</span>
                            {row.isExamBlocked && (
                              <span className="rounded bg-error/15 text-error border border-error/45 px-1 py-0.2 text-[9px] font-bold">🚫 Taqiqda</span>
                            )}
                          </div>
                          {row.adminTags && row.adminTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {row.adminTags.slice(0, 3).map(tag => (
                                <span key={tag} className="rounded bg-surface-3 px-1.5 py-0.2 text-[9px] font-bold text-text-secondary">
                                  #{tag}
                                </span>
                              ))}
                              {row.adminTags.length > 3 && (
                                <span className="text-[9px] font-bold text-text-secondary">+{row.adminTags.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-text-secondary">{maskPhoneDisplay(row.phone, '')}</td>
                    <td className="px-5 py-4"><span className="rounded-md bg-surface-2 border border-accent/45 px-2 py-0.5 text-[10px] font-bold text-accent">{row.role}</span></td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">{row.center}</td>
                    <td className="px-5 py-4 font-bold text-warning font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          setCoinsModalUser(row);
                          setCoinsAmount(50);
                          setCoinsReason('');
                        }}
                        title="Tangalar balansini o'zgartirish"
                        className="hover:underline flex items-center gap-1"
                      >
                        🪙 {row.coins || 0}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <AdminPill status={row.status === 'Faol' ? 'approved' : 'rejected'}>{row.status}</AdminPill>
                        {row.isExamBlocked && (
                          <span className="text-[10px] text-error font-bold">🚫 Test taqiqi</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {row.isPremium ? (
                        <button onClick={() => openPremiumModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-warning ring-1 ring-warning/45 hover:bg-surface-1 transition">⭐ Premium ✓</button>
                      ) : row.orgBoundPremium ? (
                        <button
                          type="button"
                          disabled
                          title="O'qituvchi va manager premiumi markazning (tashkilotning) obunasidan keladi — shaxsiy premium berilmaydi"
                          className="cursor-not-allowed rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-secondary ring-1 ring-edge">
                          Tashkilot obunasi
                        </button>
                      ) : (
                        <button onClick={() => openPremiumModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary ring-1 ring-edge hover:bg-surface-2 hover:text-warning transition">Premium berish</button>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setDetailUser(row)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition">
                          <Icon name="eye" size={12} /> Batafsil
                        </button>
                        <button onClick={() => openRoleModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-accent border border-accent/45 hover:bg-surface-1 transition">
                          Rol
                        </button>
                        <button
                          onClick={() => {
                            setCoinsModalUser(row);
                            setCoinsAmount(50);
                            setCoinsReason('');
                          }}
                          className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-1 transition"
                        >
                          Tangalar
                        </button>
                        {!row.isPlatformAdmin && (
                          row.isExamBlocked ? (
                            <button
                              onClick={() => handleExamUnban(row)}
                              className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-error border border-error/45 hover:bg-error hover:text-white transition"
                            >
                              Taqiqni ochish
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setExamBanModalUser(row);
                                setExamBanReason('');
                                setExamBanDuration(7);
                              }}
                              className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-error border border-error/45 hover:bg-surface-2 transition"
                            >
                              Test taqiqi
                            </button>
                          )
                        )}
                        <button onClick={() => openPhoneModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition">
                          Telefon
                        </button>
                        <button onClick={() => setResetPasswordConfirm(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-2 transition">
                          Parol
                        </button>
                        <button onClick={() => openWarnModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-warning border border-warning/45 hover:bg-surface-2 transition">
                          Ogohlantirish
                        </button>
                        <button onClick={() => openBlockModal(row)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${row.status === 'Bloklangan' ? 'bg-surface-2 text-success border border-success/45 hover:bg-surface-1' : 'bg-surface-2 text-error border border-error/45 hover:bg-surface-2'}`}>
                          {row.status === 'Bloklangan' ? 'Ochish' : 'Bloklash'}
                        </button>
                        {!row.isPlatformAdmin && (
                          <button onClick={() => openDeleteUserModal(row)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-error border border-error/45 hover:bg-surface-2 transition">
                            O'chirish
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ogohlantirish — bloklashdan oldingi qadam. Hisob holatiga tegmaydi,
          foydalanuvchi faqat xabarnoma oladi. */}
      <Modal open={!!warnModal} onClose={() => !warnBusy && setWarnModal(null)} title="Ogohlantirish yuborish">
        <div className="mb-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <Avatar name={warnModal?.name || ''} size={36} gradient="bg-pencil-600" />
            <div><div className="text-sm font-semibold text-text-primary">{warnModal?.name}</div><div className="text-xs text-text-secondary">{warnModal?.phone}</div></div>
          </div>
          <p className="text-sm text-text-secondary">
            Foydalanuvchi xabarnoma oladi. Hisob bloklanmaydi va sessiyalari yakunlanmaydi.
          </p>
        </div>
        <div className="mb-5 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Ogohlantirish sababi (ichki)</label>
            <textarea
              value={warnReason}
              onChange={e => setWarnReason(e.target.value)}
              rows={2}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Masalan: imtihonda shubhali xatti-harakat"
            />
            <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
              Faqat amallar tarixiga yoziladi — foydalanuvchi buni ko'rmaydi.
            </p>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Foydalanuvchiga xabar</label>
            <textarea
              value={warnMessage}
              onChange={e => setWarnMessage(e.target.value)}
              rows={4}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Nima buzilgani va keyingi safar nima bo'lishini yozing"
            />
            <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
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
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <Avatar name={blockModal?.name || ''} size={36} gradient="bg-pencil-600" />
            <div><div className="text-sm font-semibold text-text-primary">{blockModal?.name}</div><div className="text-xs text-text-secondary">{blockModal?.phone}</div></div>
          </div>
          <p className="text-sm text-text-secondary">{blockModal?.status === 'Bloklangan' ? 'Bu foydalanuvchining blokini ochasizmi?' : 'Bu foydalanuvchini bloklamoqchimisiz?'}</p>
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

      {/* Hisobni o'chirish (soft-delete). Oddiy tasdiqlash oynasi ATAYLAB
          ishlatilmadi: bu jonli hisobni yopadi, shuning uchun birlashtirish
          oqimidagi kabi raqamni qo'lda yozish talab qilinadi. */}
      <Modal
        open={!!deleteUserModal}
        onClose={() => !deleteUserBusy && setDeleteUserModal(null)}
        title="Hisobni o'chirish">
        {deleteUserModal && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={deleteUserModal.name || ''} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{deleteUserModal.name}</div>
                <div className="text-xs font-mono text-text-secondary">{deleteUserModal.phone || '—'}</div>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-text-secondary">
              Hisob o'chiriladi: foydalanuvchi tizimga kira olmaydi va barcha
              qurilmalaridagi seanslari yakunlanadi. Ma'lumotlari (urinishlar,
              to'lovlar) darhol yo'q qilinmaydi — tiklash muddati tugagach
              butunlay o'chadi. Shu muddat ichida foydalanuvchining o'zi telefon
              va parol bilan hisobini tiklab olishi mumkin.
            </p>
            <p className="text-[11px] leading-relaxed text-warning">
              Qoidabuzarlik uchun bu emas, "Bloklash" ishlatiladi — blok sababi
              va muddati bilan yoziladi hamda foydalanuvchi uni o'zi ocholmaydi.
            </p>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">O'chirish sababi (ichki, ixtiyoriy)</label>
              <input
                value={deleteUserReason}
                onChange={e => setDeleteUserReason(e.target.value)}
                maxLength={255}
                className="w-full admin-input px-3 py-2.5 text-sm outline-none"
                placeholder="Masalan: foydalanuvchi support orqali so'radi"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
                Faqat amallar tarixiga yoziladi — foydalanuvchi buni ko'rmaydi.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Tasdiqlash uchun hisob raqamini yozing: <span className="font-mono text-error">{deleteUserModal.phone}</span>
              </label>
              <input
                value={deleteUserConfirmPhone}
                onChange={e => setDeleteUserConfirmPhone(e.target.value)}
                placeholder={deleteUserModal.phone || ''}
                className="w-full rounded-xl border border-edge bg-surface-2 px-3.5 py-2.5 font-mono text-xs font-semibold text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none"
                inputMode="tel"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setDeleteUserModal(null)} disabled={deleteUserBusy} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">Bekor qilish</button>
              <button onClick={runDeleteUser} disabled={deleteUserBusy || !deleteUserConfirmOk} className="btn-danger flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
                {deleteUserBusy ? '...' : "Hisobni o'chirish"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Ommaviy bloklash / blokni ochish */}
      <Modal
        open={!!bulkBlockModal}
        onClose={() => !bulkBusy && setBulkBlockModal(null)}
        title={bulkBlockModal === 'unblock' ? 'Ommaviy blokni ochish' : 'Ommaviy bloklash'}>
        <div className="mb-5">
          <p className="text-sm text-text-secondary">
            {bulkBlockModal === 'unblock'
              ? `Tanlangan ${selectedUserIds.length} ta foydalanuvchining blokini ochasizmi?`
              : `Tanlangan ${selectedUserIds.length} ta foydalanuvchini bloklaysizmi?`}
          </p>
          <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
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
          <p className="text-sm text-text-secondary">
            Tanlangan {selectedUserIds.length} ta foydalanuvchining rollari quyidagi
            tanlov bilan TO'LIQ almashtiriladi.
          </p>
          <div>
            <label className="block text-xs text-text-secondary mb-2 font-medium">Rollar</label>
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
                        ? 'border-accent bg-surface-2 text-text-primary'
                        : 'btn-ghost'
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border transition ${checked ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge-strong'}`}>
                      {checked && <Icon name="check" size={12} />}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
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
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={roleModal.name || ''} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{roleModal.name}</div>
                <div className="text-xs text-text-secondary">{roleModal.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-2 font-medium">Rollar</label>
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
                          ? 'border-accent bg-surface-2 text-text-primary'
                          : 'btn-ghost'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border transition ${checked ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge-strong'}`}>
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
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={premiumUser.name || ''} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{premiumUser.name}</div>
                <div className="text-xs text-text-secondary">{premiumUser.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Premium turi</label>
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
                        ? 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {premiumDuration > 0 && (
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Tarif turi (Darajasi)</label>
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
                          ? 'btn-primary font-bold'
                          : 'btn-ghost'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Muddat</label>
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
                          ? 'btn-danger font-bold'
                          : 'btn-primary font-bold'
                        : 'btn-ghost'
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
                  premiumDuration === -1 ? 'btn-danger' : 'btn-primary'
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
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={phoneModal.name || ''} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{phoneModal.name}</div>
                <div className="text-xs text-text-secondary">{phoneModal.phone}</div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Yangi telefon raqam</label>
              <input
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value)}
                className="w-full admin-input px-3 py-2.5 text-sm outline-none"
                placeholder="+998 90 123 45 67"
                inputMode="tel"
              />
              <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
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

      {/* Kontent qatorini o'chirish. Hisobga tegilmaydi — matn buni ochiq
          aytadi, chunki tugma "Batafsil" oynasida bloklash amallari yonida
          turadi. Savolning haqiqatan o'chgani yoki arxivlangani backend
          javobidagi matnda keladi (foydalanishdagi savol saqlanadi). */}
      <ConfirmModal
        open={!!contentDeleteConfirm}
        onClose={() => !contentDeleteBusy && setContentDeleteConfirm(null)}
        onConfirm={runContentDelete}
        title={contentDeleteConfirm?.type === 'olympiad' ? "Olimpiadani o'chirish" : "Savolni o'chirish"}
        message={`"${(contentDeleteConfirm?.label || '').slice(0, 80)}" o'chiriladi. Hisob bloklanmaydi va seanslari yakunlanmaydi. ${
          contentDeleteConfirm?.type === 'olympiad'
            ? "Olimpiada ro'yxatlardan olib tashlanadi, mavjud natijalar esa saqlanib qoladi."
            : "Savol foydalanishda bo'lsa (olimpiadada, kod yuborish yoki baho bor) o'chirilmaydi, balki arxivlanadi."
        } Davom etasizmi?`}
        confirmText="Ha, o'chirish"
        danger
        busy={contentDeleteBusy}
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
            <p className="text-sm text-text-secondary leading-relaxed">
              <span className="font-semibold text-text-primary">{newPasswordInfo.name}</span> uchun yangi parol yaratildi.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface-2 border border-edge rounded-xl px-3 py-2 text-sm text-accent font-mono break-all select-all">
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
            <p className="rounded-xl border border-warning/45 bg-surface-2 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-warning">
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
            <p className="text-[11px] font-semibold leading-relaxed text-text-secondary">
              Raqamini yo'qotib qayta ro'yxatdan o'tgan o'quvchining ikkita hisobi bitta hisobga yig'iladi:
              tangalar qo'shiladi, streak kattasi olinadi, urinish va mashq tarixi ko'chadi. Ikkinchi hisob
              o'chirilmaydi — doimiy bloklanadi va tekshirish uchun joyida qoladi.
            </p>

            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Ochilgan hisob</div>
              <div className="mt-1 text-xs font-bold text-text-primary">{mergeModal.name}</div>
              <div className="text-[11px] font-mono text-text-secondary">{mergeModal.phone || '—'}</div>
            </div>

            {/* Ikkinchi hisob qidiruvi — jadval bilan bir xil manba (ism yoki
                telefon bo'yicha). */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                Ikkinchi hisob (ism yoki telefon)
              </label>
              <input
                value={mergeSearch}
                onChange={(e) => { setMergeSearch(e.target.value); setMergeOtherId(null); resetMergePreview(); }}
                placeholder="Masalan: Ali yoki +99890..."
                className="w-full rounded-xl border border-edge bg-surface-2 px-3.5 py-2.5 text-xs font-semibold text-text-primary placeholder:text-text-secondary focus:border-accent/50 focus:outline-none"
              />
              {mergeOther ? (
                <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-accent/45 bg-surface-2 px-3 py-2.5">
                  <Avatar name={mergeOther.name || ''} src={mergeOther.avatarUrl} size={32} gradient="bg-pencil-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-bold text-text-primary">{mergeOther.name}</div>
                    <div className="truncate font-mono text-[10px] text-text-secondary">{mergeOther.phone}</div>
                  </div>
                  <button
                    onClick={() => { setMergeOtherId(null); resetMergePreview(); }}
                    className="shrink-0 text-[10px] font-bold text-text-secondary hover:text-text-primary"
                  >
                    Bekor qilish
                  </button>
                </div>
              ) : mergeCandidates.length > 0 ? (
                <div className="mt-2 divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-surface-1">
                  {mergeCandidates.map(row => (
                    <button
                      key={row.id}
                      onClick={() => { setMergeOtherId(row.backendId); resetMergePreview(); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-surface-1"
                    >
                      <Avatar name={row.name || ''} src={row.avatarUrl} size={28} gradient="bg-pencil-600" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-bold text-text-primary">{row.name}</div>
                        <div className="truncate font-mono text-[10px] text-text-secondary">{row.phone}</div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-text-secondary">#{row.backendId}</span>
                    </button>
                  ))}
                </div>
              ) : debouncedMergeSearch.trim() ? (
                <div className="mt-2 rounded-xl border border-edge bg-surface-1 px-3.5 py-3 text-center text-[11px] font-semibold text-text-secondary">
                  Mos hisob topilmadi
                </div>
              ) : null}
            </div>

            {/* Yo'nalish: qaysi hisob TIRIK qoladi. Noto'g'ri tanlov eng
                jiddiy xato bo'lgani uchun alohida, aniq savol. */}
            {mergeOther && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
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
                          ? 'border-success/45 bg-surface-2'
                          : 'border-edge bg-surface-1 hover:bg-surface-1'
                      }`}
                    >
                      <div className="truncate text-[11px] font-bold text-text-primary">{opt.label}</div>
                      <div className="truncate font-mono text-[10px] text-text-secondary">{opt.phone}</div>
                      <div className={`mt-1 text-[10px] font-bold ${mergeKeepOpened === opt.keep ? 'text-success' : 'text-text-secondary'}`}>
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
              <div className="rounded-xl border border-error/45 bg-surface-2 px-3.5 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-error">Birlashtirib bo'lmaydi</div>
                <ul className="mt-1.5 space-y-1">
                  {(mergePreview.blockers || []).map((b, i) => (
                    <li key={i} className="text-[11px] font-bold text-text-primary">• {b}</li>
                  ))}
                </ul>
              </div>
            )}

            {mergePreview?.can_merge && (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-edge bg-surface-1 px-3.5 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Ko'chadigan ma'lumot</div>
                  <div className="mt-2 space-y-1.5">
                    {(mergePreview.moves || []).filter(m => m.move || m.skip).map(m => (
                      <div key={m.model} className="flex items-baseline justify-between gap-3">
                        <span className="text-[11px] font-semibold text-text-primary">{m.label}</span>
                        <span className="shrink-0 text-[11px] font-bold font-data text-text-primary">
                          {m.move} ta
                          {m.skip > 0 && (
                            <span className="ml-1.5 font-bold text-warning">({m.skip} ta o'tkazib yuboriladi)</span>
                          )}
                        </span>
                      </div>
                    ))}
                    {(mergePreview.totals?.move || 0) === 0 && (
                      <div className="text-[11px] font-semibold text-text-secondary">Ko'chadigan yozuv yo'q</div>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-2.5">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Tangalar</div>
                      <div className="mt-0.5 text-xs font-bold font-data text-text-primary">
                        {mergePreview.balances?.coins?.target} + {mergePreview.balances?.coins?.source} = {mergePreview.balances?.coins?.result}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">Streak</div>
                      <div className="mt-0.5 text-xs font-bold font-data text-text-primary">
                        {mergePreview.balances?.streak_count?.result} kun
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ko'chirilmaydigan ma'lumot — admin buni bilib, kerak bo'lsa
                    mavjud vositalar bilan qo'lda hal qiladi. */}
                {(mergePreview.untouched || []).length > 0 && (
                  <div className="rounded-xl border border-warning/45 bg-surface-2 px-3.5 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-warning">Ko'chirilmaydi</div>
                    <div className="mt-2 space-y-2">
                      {mergePreview.untouched.map(row => (
                        <div key={row.model}>
                          <div className="text-[11px] font-bold text-warning">{row.label} ({row.count} ta)</div>
                          <div className="text-[10px] font-semibold leading-relaxed text-warning">{row.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tasdiqlash: bloklanadigan hisobning raqamini AYNAN yozish. */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    Tasdiqlash uchun bloklanadigan hisob raqamini yozing: <span className="font-mono text-error">{mergePreview.source?.phone}</span>
                  </label>
                  <input
                    value={mergeConfirmPhone}
                    onChange={(e) => setMergeConfirmPhone(e.target.value)}
                    placeholder={mergePreview.source?.phone || ''}
                    className="w-full rounded-xl border border-edge bg-surface-2 px-3.5 py-2.5 font-mono text-xs font-semibold text-text-primary placeholder:text-text-secondary focus:border-accent focus:outline-none"
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

      {/* Ommaviy Xabarnoma (Broadcast) Modali */}
      <Modal open={broadcastModalOpen} onClose={() => !broadcastBusy && setBroadcastModalOpen(false)} title="Ommaviy Xabarnoma Yuborish">
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3 text-xs text-text-secondary">
            {selectedUserIds.length > 0 ? (
              <span>Tanlangan <strong className="text-text-primary">{selectedUserIds.length} ta</strong> foydalanuvchiga xabar yuboriladi.</span>
            ) : userFilterRole !== 'all' ? (
              <span>Filtrlangan <strong className="text-text-primary">{userFilterRole}</strong> rolidagi barcha faol foydalanuvchilarga ({visibleUserRows.length} ta) yuboriladi.</span>
            ) : (
              <span>Platformadagi <strong className="text-text-primary">barcha faol foydalanuvchilarga</strong> ({allUsers.length} ta) yuboriladi.</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Xabarnoma Sarlavhasi</label>
            <input
              type="text"
              value={broadcastTitle}
              onChange={e => setBroadcastTitle(e.target.value)}
              placeholder="Masalan: Yangi Respublika Olimpiadasi boshlandi!"
              className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Xabar Matni</label>
            <textarea
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              rows={4}
              placeholder="Foydalanuvchilarga ko'rinadigan to'liq xabar matni..."
              className="w-full admin-input resize-none px-3 py-2 text-xs outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Yetkazish Kanali</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'both', label: '📱 Hammasi (Ilova + Telegram)' },
                { id: 'in_app', label: '🔔 Faqat Ilova' },
                { id: 'telegram', label: '✈️ Faqat Telegram' },
              ].map(ch => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setBroadcastChannel(ch.id)}
                  className={`rounded-xl border p-2 text-center text-[11px] font-bold transition ${
                    broadcastChannel === ch.id
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-edge bg-surface-2 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={broadcastBusy}
              onClick={() => setBroadcastModalOpen(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={broadcastBusy || !broadcastTitle.trim() || !broadcastMessage.trim()}
              onClick={handleSendBroadcast}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {broadcastBusy ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Olimpiadadan Chetlatish (Exam Ban) Modali */}
      <Modal open={!!examBanModalUser} onClose={() => !examBanBusy && setExamBanModalUser(null)} title="Olimpiadalardan Chetlatish (Exam Ban)">
        {examBanModalUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={examBanModalUser.name} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{examBanModalUser.name}</div>
                <div className="text-xs text-text-secondary">{examBanModalUser.phone}</div>
              </div>
            </div>

            <p className="text-xs text-text-secondary">
              Foydalanuvchi hisobi ochiq qoladi, ammo belgilangan muddat davomida olimpiada savollarini ochish va test topshirishdan chetlatiladi.
            </p>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Chetlatish Muddati</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { days: 1, label: '1 kun' },
                  { days: 7, label: '7 kun' },
                  { days: 14, label: '14 kun' },
                  { days: 30, label: '30 kun' },
                  { days: null, label: 'Doimiy' },
                ].map(item => (
                  <button
                    key={String(item.days)}
                    type="button"
                    onClick={() => setExamBanDuration(item.days)}
                    className={`rounded-xl border p-2 text-center text-[11px] font-bold transition ${
                      examBanDuration === item.days
                        ? 'border-error bg-error/15 text-error'
                        : 'border-edge bg-surface-2 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Chetlatish Sababi (majburiy)</label>
              <textarea
                value={examBanReason}
                onChange={e => setExamBanReason(e.target.value)}
                rows={3}
                placeholder="Masalan: Test paytida bot yoki cheating aniqlanganligi sababli..."
                className="w-full admin-input resize-none px-3 py-2 text-xs outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={examBanBusy}
                onClick={() => setExamBanModalUser(null)}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={examBanBusy || !examBanReason.trim()}
                onClick={handleExamBan}
                className="btn-danger flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                {examBanBusy ? 'Chetlatilmoqda...' : 'Chetlatish'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Tangalar (Coins) Balansini O'zgartirish Modali */}
      <Modal open={!!coinsModalUser} onClose={() => !coinsBusy && setCoinsModalUser(null)} title="Tangalar Balansini O'zgartirish">
        {coinsModalUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
              <Avatar name={coinsModalUser.name} size={36} gradient="bg-pencil-600" />
              <div>
                <div className="text-sm font-semibold text-text-primary">{coinsModalUser.name}</div>
                <div className="text-xs text-text-secondary">Joriy balans: 🪙 {coinsModalUser.coins || 0} tanga</div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">O'zgartirish Miqdori (qo'shish uchun musbat, ayirish uchun manfiy)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={coinsAmount}
                  onChange={e => setCoinsAmount(Number(e.target.value))}
                  placeholder="+50 yoki -20"
                  className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-mono font-bold text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-1.5 mt-2">
                {[+10, +50, +100, +500, -50].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCoinsAmount(val)}
                    className="rounded-lg bg-surface-2 border border-edge px-2.5 py-1 text-[11px] font-bold text-text-secondary hover:text-text-primary"
                  >
                    {val > 0 ? `+${val}` : val}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Sababi (Audit uchun majburiy)</label>
              <input
                type="text"
                value={coinsReason}
                onChange={e => setCoinsReason(e.target.value)}
                placeholder="Masalan: Olimpiada g'olibi uchun bonus yoki jarima"
                className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={coinsBusy}
                onClick={() => setCoinsModalUser(null)}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={coinsBusy || !coinsAmount || !coinsReason.trim()}
                onClick={handleAdjustCoins}
                className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                {coinsBusy ? 'Saqlanmoqda...' : 'Balansni yangilash'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Testni Qayta Topshirish (Retake) Tasdiq Modali */}
      <Modal open={!!retakeConfirm} onClose={() => !retakeBusy && setRetakeConfirm(null)} title="Testni Qayta Topshirishga Ruxsat">
        {retakeConfirm && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Haqiqatan ham <strong className="text-text-primary">{retakeConfirm.olympiadTitle}</strong> bo'yicha oldingi test urinishini o'chirib, foydalanuvchiga uni qayta topshirishga ruxsat bermoqchimisiz?
            </p>
            <div className="rounded-xl bg-warning/10 border border-warning/45 p-3 text-[11px] text-warning font-medium">
              ⚠️ Oldingi javoblar va ball tozalanadi, o'quvchi testni noldan boshlay oladi.
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={retakeBusy}
                onClick={() => setRetakeConfirm(null)}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={retakeBusy}
                onClick={handleAllowRetake}
                className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                {retakeBusy ? 'Ruxsat berilmoqda...' : 'Qayta topshirishga ruxsat'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Ommaviy Foydalanuvchi Import Modali (Excel/CSV) */}
      <Modal open={showBulkImportModal} onClose={() => !bulkImportLoading && setShowBulkImportModal(false)} title="Ommaviy Foydalanuvchilarni Import Qilish">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            CSV yoki Excel formatida foydalanuvchilar ro'yxatini kiriting. Har bir qatorda: <code className="font-mono text-accent">Telefon, To'liq Ism, Parol (ixtiyoriy), Rol (ixtiyoriy)</code>
          </p>
          <div className="rounded-xl bg-surface-2 p-2.5 text-[11px] font-mono text-text-secondary border border-edge">
            Misol:<br />
            +998901234567, Ali Valiyev, parol123, student<br />
            +998939876543, Gulnoza Karimova, parol123, teacher
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">CSV / Matn Ma'lumotlari</label>
            <textarea
              value={bulkImportText}
              onChange={e => setBulkImportText(e.target.value)}
              rows={6}
              placeholder="+998901234567, Ali Valiyev, parol123, student..."
              className="w-full admin-input resize-none font-mono text-xs p-3 outline-none"
            />
          </div>

          {bulkImportResults && (
            <div className="rounded-xl p-3 bg-surface-2 border border-edge text-xs space-y-1">
              <div className="font-bold text-success">
                ✅ Yaratildi: {bulkImportResults.created_count} ta
              </div>
              {bulkImportResults.skipped_count > 0 && (
                <div className="text-warning">
                  ⚠️ Mavjud / O'tkazildi: {bulkImportResults.skipped_count} ta
                </div>
              )}
              {bulkImportResults.errors?.length > 0 && (
                <div className="text-error text-[11px]">
                  Xatolar: {bulkImportResults.errors.join('; ')}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={bulkImportLoading}
              onClick={() => setShowBulkImportModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Yopish
            </button>
            <button
              type="button"
              disabled={bulkImportLoading || !bulkImportText.trim()}
              onClick={handleBulkImportUsers}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {bulkImportLoading ? 'Import qilinmoqda...' : 'Import qilish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Shaxsiy Telegram Xabar Yuborish Modali */}
      <Modal open={showTelegramModal} onClose={() => !telegramMsgLoading && setShowTelegramModal(false)} title="Telegram Bot Orqali Shaxsiy Xabar">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Ushbu xabar platforma boti orqali foydalanuvchining shaxsiy Telegramiga boradi.
          </p>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Xabar Matni</label>
            <textarea
              value={telegramMsgText}
              onChange={e => setTelegramMsgText(e.target.value)}
              rows={4}
              placeholder="Foydalanuvchiga yuboriladigan xabar matni..."
              className="w-full admin-input resize-none text-xs p-3 outline-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={telegramMsgLoading}
              onClick={() => setShowTelegramModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={telegramMsgLoading || !telegramMsgText.trim()}
              onClick={() => handleSendTelegram(detailBackendId)}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {telegramMsgLoading ? 'Yuborilmoqda...' : 'Yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Shaxsiy Flash Modal Alert Yaratish Modali */}
      <Modal open={showFlashAlertModal} onClose={() => !flashAlertLoading && setShowFlashAlertModal(false)} title="Shaxsiy Modal Xabar (Flash Alert)">
        <div className="space-y-4">
          <p className="text-xs text-text-secondary">
            Foydalanuvchi platformaga kirishi bilanoq uning ekranida ushbu popup modal paydo bo'ladi.
          </p>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Sarlavha</label>
            <input
              type="text"
              value={flashAlertTitle}
              onChange={e => setFlashAlertTitle(e.target.value)}
              placeholder="Masalan: Muhim ogohlantirish yoki Tabrik"
              className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Xabar Turi</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'info', label: 'Ma‘lumot' },
                { id: 'warning', label: 'Ogohlik' },
                { id: 'urgent', label: 'Shoshilinch' },
                { id: 'success', label: 'Yutuq' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFlashAlertType(t.id)}
                  className={`rounded-xl border p-2 text-center text-xs font-bold transition ${
                    flashAlertType === t.id
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-edge bg-surface-2 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">To'liq Xabar Matni</label>
            <textarea
              value={flashAlertMsg}
              onChange={e => setFlashAlertMsg(e.target.value)}
              rows={4}
              placeholder="Foydalanuvchiga ko'rsatiladigan to'liq matn..."
              className="w-full admin-input resize-none text-xs p-3 outline-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={flashAlertLoading}
              onClick={() => setShowFlashAlertModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={flashAlertLoading || !flashAlertTitle.trim() || !flashAlertMsg.trim()}
              onClick={() => handleCreateFlashAlert(detailBackendId)}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {flashAlertLoading ? 'Yaratilmoqda...' : 'Yaratish va Yuborish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Markazga Biriktirish / Ko'chirish Modali */}
      <Modal open={showCenterTransferModal} onClose={() => !transferLoading && setShowCenterTransferModal(false)} title="O'quv Markaziga Biriktirish / Ko'chirish">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Markazni Tanlang</label>
            <select
              value={transferTargetCenterId}
              onChange={e => setTransferTargetCenterId(e.target.value)}
              className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
            >
              <option value="">-- Markazni tanlang --</option>
              {centers.map(c => (
                <option key={c.id} value={c.backendId || c.id}>
                  {c.name} ({c.type || 'Markaz'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Markazdagi Roli</label>
            <select
              value={transferRole}
              onChange={e => setTransferRole(e.target.value)}
              className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
            >
              <option value="student">O'quvchi (Student)</option>
              <option value="teacher">O'qituvchi (Teacher)</option>
              <option value="manager">Menejer (Manager)</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={transferLoading}
              onClick={() => setShowCenterTransferModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={transferLoading || !transferTargetCenterId}
              onClick={() => handleTransferCenter(detailBackendId)}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {transferLoading ? 'Saqlanmoqda...' : 'Biriktirish'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Maxsus Kvota va Chegirma Modali */}
      <Modal open={showQuotaModal} onClose={() => !quotaLoading && setShowQuotaModal(false)} title="Shaxsiy AI Mashq Kvotasi va Chegirma">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">Qo'shimcha Shaxsiy AI Mashq Kvotasi (ta)</label>
            <input
              type="number"
              value={quotaPractice}
              onChange={e => setQuotaPractice(e.target.value)}
              placeholder="Masalan: 50"
              className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Shaxsiy Chegirma (%)</label>
              <input
                type="number"
                value={discountPercent}
                onChange={e => setDiscountPercent(e.target.value)}
                placeholder="Masalan: 20"
                className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">Chegirma Muddati (kun)</label>
              <input
                type="number"
                value={discountDays}
                onChange={e => setDiscountDays(e.target.value)}
                placeholder="30"
                className="w-full h-9 rounded-xl border border-edge bg-surface-2 px-3 text-xs font-semibold text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={quotaLoading}
              onClick={() => setShowQuotaModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              disabled={quotaLoading}
              onClick={() => handleSaveQuota(detailBackendId)}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {quotaLoading ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </div>
      </Modal>

      {renderUserDetailModal()}
    </div>
    );
  };

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
    const fin = metrics?.financial || {};

    // AreaChart datasi — userGrowthChart (allUsers'dan frontend'da hisoblangan).
    const growthData = userGrowthChart.labels.map((label, i) => ({
      label,
      count: userGrowthChart.values[i] || 0,
    }));

    // Yuqori metrik kartalar.
    const totalUsers = hasMetrics ? (prem.total_users || 0) : allUsers.length;
    const totalRevenue = fin.total_revenue || 0;
    const thisMonthRevenue = fin.this_month_revenue || 0;
    const paidCustomersCount = fin.paid_customers_count || 0;
    const arpu = fin.arpu || 0;
    const trialToPaidPct = hasMetrics ? (conv.trial_to_paid_pct || 0) : 0;

    // Premium breakdown (Pie): paid / faqat-trial / bepul.
    const paidFlag = fin.paid_customers_count || prem.paid_flag || 0;
    const trialOnly = fin.trial_active_count != null ? fin.trial_active_count : (prem.trial_only || 0);
    const freeUsers = Math.max(0, (prem.total_users || 0) - paidFlag - trialOnly);
    const premiumPieData = [
      { label: "Sof pullik (To'langan)", value: paidFlag, color: 'rgb(var(--color-accent))' },
      { label: 'Faqat trial', value: trialOnly, color: 'rgb(var(--color-accent-2))' },
      { label: 'Bepul', value: freeUsers, color: 'rgb(var(--color-text-secondary))' },
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
      { label: "Sof pullik xaridor", value: fin.paid_customers_count || conv.paid_total || 0 },
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

    // Suiiste'mol signallari. Chegaralar (necha kun, nechta savol) backenddan
    // keladi — ekrandagi matn va hisob bir joydan chiqishi uchun.
    const abuse = apiAbuseStatsRes.data || {};
    const abuseSeries = Array.isArray(abuse.flag_series) ? abuse.flag_series : [];
    const flagTrend = Array.isArray(abuse.flag_trend) ? abuse.flag_trend : [];
    const topWarned = Array.isArray(abuse.top_warned_users) ? abuse.top_warned_users : [];
    const contentOutliers = Array.isArray(abuse.content_outliers) ? abuse.content_outliers : [];
    const abuseLimits = abuse.thresholds || {};
    // Reyting jadvallari Recharts'siz ishlaydi — ular uchun `chartsLoading`
    // kutilmaydi (aks holda kutubxona tushmaguncha tayyor ro'yxat bekorga
    // "Yuklanmoqda..." holatida turardi).
    const abuseListsLoading = isApi && apiAbuseStatsRes.loading;
    const abuseTrendLoading = abuseListsLoading || chartsLoading;
    const flagTrendEmpty = !flagTrend.length || !abuseSeries.length
      || flagTrend.every(d => abuseSeries.every(s => !d[s.key]));
    // Xato (403/tarmoq) bo'lsa "hech narsa topilmadi" degan aniq matn
    // YOLG'ON bo'lardi — bunday holatda metrik bloklaridagi umumiy matn.
    const abuseEmptyText = (isApi && apiAbuseStatsRes.error)
      ? "Ma'lumot yo'q (admin huquqi kerak)"
      : null;

    // Loading spinner — diagrammalar uchun bir xil ko'rinish (DRY).
    const loadingBox = (h = 200) => (
      <div className="flex items-center justify-center text-[11px] font-bold text-text-secondary" style={{ height: `${h}px` }}>Yuklanmoqda...</div>
    );

    return (
      <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Tahlil</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">Platforma statistikasi, o'sish va konversiya ko'rsatkichlari.</p>
        </div>

        {/* Yuqori metrik kartalar */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AdminMetricCard
            label="Jami tushum (Daromad)"
            value={`${totalRevenue.toLocaleString()} so'm`}
            delta={hasMetrics ? `Shu oy: ${thisMonthRevenue.toLocaleString()} so'm` : 'Mahalliy hisob'}
            icon={<Icon name="dollar" size={16} />}
            tone="success"
          />
          <AdminMetricCard
            label="Sof pullik xaridorlar"
            value={`${paidCustomersCount.toLocaleString()} ta`}
            delta="Trial kiritilmagan"
            icon={<Icon name="creditCard" size={16} />}
            tone="accent"
          />
          <AdminMetricCard
            label="Trial → Paid Konversiya"
            value={hasMetrics ? `${trialToPaidPct}%` : '—'}
            delta={hasMetrics ? `${conv.trial_to_paid || 0} / ${conv.trial_started || 0} ta trial` : "Ma'lumot yo'q"}
            icon={<Icon name="star" size={16} />}
            tone="warning"
          />
          <AdminMetricCard
            label="O'rtacha chek (ARPU)"
            value={`${arpu.toLocaleString()} so'm`}
            delta="Har bir xaridor hisobiga"
            icon={<Icon name="wallet" size={16} />}
            tone="neutral"
          />
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
              ? <div className="flex h-[180px] items-center justify-center text-[11px] font-bold text-text-secondary">Yuklanmoqda...</div>
              : <PremiumPie data={premiumPieData} total={(paidFlag + trialOnly + freeUsers).toLocaleString()} />}
          </ChartCard>

          <ChartCard
            title="Retention (D1 / D7 / D30)"
            subtitle="Ro'yxatdan o'tib N kundan keyin qaytganlar"
            empty={!metricsLoading && !hasMetrics}
            emptyText={metricsFailed ? "Ma'lumot yo'q (admin huquqi kerak)" : "Ma'lumot yo'q"}
          >
            {metricsLoading
              ? <div className="flex h-[174px] items-center justify-center text-[11px] font-bold text-text-secondary">Yuklanmoqda...</div>
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
            ? <div className="flex h-[200px] items-center justify-center text-[11px] font-bold text-text-secondary">Yuklanmoqda...</div>
            : <ConversionFunnel data={funnelData} />}
        </ChartCard>

        {/* ─── Sektion 2: Platforma faoliyati ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-secondary">Platforma faoliyati</h2>

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
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-secondary">Kontent tahlil</h2>
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
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-secondary">Moliya</h2>
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
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-secondary">Markazlar</h2>
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

        {/* ─── Sektion 6: Suiiste'mol signallari ─── */}
        <div className="space-y-[14px]">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-secondary">Suiiste'mol signallari</h2>
          <p className="text-[11px] font-semibold leading-relaxed text-text-secondary">
            Bo'lim faqat KUZATUV uchun: hech kim avtomatik bloklanmaydi va bayroq ham
            qo'yilmaydi. Ochiq ishlar va ular bo'yicha qaror "Xavfsizlik" tabidagi
            moderatsiya navbatida qoladi.
          </p>

          <ChartCard
            title="Bayroq va ogohlantirishlar dinamikasi"
            subtitle={`Oxirgi ${abuseLimits.trend_days || 30} kun, turi bo'yicha`}
            empty={!abuseTrendLoading && flagTrendEmpty}
          >
            {abuseTrendLoading ? loadingBox(220) : <AbuseFlagTrendChart data={flagTrend} series={abuseSeries} />}
          </ChartCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard
              title="Eng ko'p ogohlantirilgan hisoblar"
              subtitle={`Oxirgi ${abuseLimits.top_window_days || 30} kun bo'yicha top-10`}
              empty={!abuseListsLoading && !topWarned.length}
              emptyText={abuseEmptyText || 'Ogohlantirish yuborilmagan'}
            >
              {abuseListsLoading ? loadingBox(200) : (
                <AbuseRankTable
                  rows={topWarned}
                  countKey="warnings"
                  countLabel="Ogohlantirish"
                  dateKey="last_warned_at"
                  dateLabel="Oxirgisi"
                  tone="error"
                />
              )}
            </ChartCard>

            <ChartCard
              title="Kontent portlashi"
              subtitle={`Oxirgi ${abuseLimits.burst_window_days || 1} kunda ${abuseLimits.burst_min_questions || 100} tadan ko'p savol yaratganlar`}
              empty={!abuseListsLoading && !contentOutliers.length}
              emptyText={abuseEmptyText || "Chegaradan oshgan hisob yo'q"}
            >
              {abuseListsLoading ? loadingBox(200) : (
                <AbuseRankTable
                  rows={contentOutliers}
                  countKey="questions"
                  countLabel="Savol"
                  dateKey="last_created_at"
                  dateLabel="Oxirgisi"
                  tone="warning"
                />
              )}
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
            <h1 className="text-[20px] font-bold leading-tight text-text-primary">Amallar tarixi</h1>
            <p className="mt-1 text-[11px] font-bold text-text-secondary">
              Admin va tashkilot rahbarlari bajargan muhim amallar: kim, qachon, kimga va qaysi IP dan.
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
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
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {['Vaqt', 'Kim', 'Amal', 'Obyekt', 'IP'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {!isApi ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Amallar tarixi faqat API rejimida ko'rinadi</td></tr>
                ) : apiAuditRes.loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">{auditSearch ? 'Qidiruv natijasi topilmadi' : 'Yozuvlar yo\'q'}</td></tr>
                ) : rows.map(log => (
                  <tr key={log.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(log.created_at)}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><AdminInitial name={log.actor} /><span className="font-bold text-text-primary">{log.actor}</span></div></td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-surface-2 border border-accent/45 px-2 py-0.5 text-[10px] font-bold text-accent">
                        {log.action_label || log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">
                      {log.target_name || (log.target_id ? `${log.target_type || 'Obyekt'} #${log.target_id}` : '—')}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-text-secondary">{log.ip || '—'}</td>
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
            <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary font-data">
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
    setFlagResolveBlockIp(false);
    setFlagResolveBlockDays(null);
    setFlagResolve({ flag, status });
  };

  // Arxivlash faqat 'resolved' qarorli SAVOL bayrog'ida taklif qilinadi:
  // "rad etildi" degani yolg'on signal, savolga chora ko'rilmaydi.
  const canArchiveFlag = flagResolve?.flag.flag_type === 'question'
    && flagResolve?.status === 'resolved';

  // IP bloki ham AYNAN shu qoidaga bo'ysunadi, faqat boshqa bayroq turida:
  // manzil bayroqning `extra.ip_address` kalitida turadi (admin uni qo'lda
  // ko'chirmaydi), shuning uchun manzili yo'q eski yozuvda taklif ham yo'q.
  const canBlockFlagIp = flagResolve?.flag.flag_type === 'suspicious_ip'
    && flagResolve?.status === 'resolved'
    && !!flagResolve?.flag.extra?.ip_address;

  const submitResolveFlag = () => {
    if (!flagResolve || flagResolveBusy) return;
    const blockIp = canBlockFlagIp && flagResolveBlockIp;
    setFlagResolveBusy(true);
    OlympyApi.adminResolveModerationFlag(
      flagResolve.flag.id,
      {
        status: flagResolve.status,
        note: flagResolveNote.trim(),
        archive: canArchiveFlag && flagResolveArchive,
        blockIp,
        blockDays: blockIp ? flagResolveBlockDays : null,
      },
      OlympyApi.getToken(),
    )
      .then(res => {
        // Blok so'ralgan bo'lsa ham bajarilmasligi mumkin (manzil allaqachon
        // bloklangan yoki adminning o'ziniki) — javobdagi `blocked_ip` shuni
        // aytadi, shuning uchun toast AYNAN bajarilgan ishni yozadi.
        showToast(res?.blocked_ip
          ? `Bayroq hal qilindi, ${res.blocked_ip.cidr} bloklandi`
          : res?.archived
            ? 'Bayroq yopildi, savol arxivlandi'
            : blockIp
              ? "Bayroq hal qilindi, IP bloklanmadi (allaqachon bloklangan yoki o'zingizniki)"
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

  // Yangi blok oynasi ham har safar toza ochiladi (bloklash modalidagi bilan
  // bir xil qoida): manzil va sabab bo'sh, muddat "Doimiy".
  const openBlockIpModal = () => {
    setBlockIpAddress('');
    setBlockIpReason('');
    setBlockIpDuration(null);
    setBlockIpModal(true);
  };

  const submitBlockIp = () => {
    if (blockIpBusy) return;
    if (!isApi) { showToast("IP faqat API rejimida bloklanadi"); return; }
    // Backend ikkalasini ham majburiy deb biladi — bo'shini u yerga
    // yubormasdan shu yerda to'xtatamiz (ogohlantirish modalidagidek).
    // Manzilning O'ZI esa faqat backendda tekshiriladi: `ipaddress` bilan
    // parse qilish yagona haqiqat, panelda ikkinchi (va boshqacha) qoida
    // paydo bo'lmasin.
    const ipAddress = blockIpAddress.trim();
    const reason = blockIpReason.trim();
    if (!ipAddress) { showToast('IP manzilni kiriting'); return; }
    if (!reason) { showToast('Bloklash sababini kiriting'); return; }

    setBlockIpBusy(true);
    OlympyApi.adminBlockIp(
      { ipAddress, reason, durationDays: blockIpDuration },
      OlympyApi.getToken(),
    )
      .then(res => {
        showToast(`${res?.cidr || ipAddress} bloklandi`);
        setBlockIpModal(false);
        // Yangi blok ro'yxatning boshida turadi — birinchi sahifaga qaytamiz,
        // aks holda u ko'rinmay qolardi.
        setBlockedIpPage(1);
        apiBlockedIpsRes.reload();
      })
      .catch(err => {
        console.warn('adminBlockIp failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setBlockIpBusy(false));
  };

  const runUnblockIp = () => {
    if (!unblockIpConfirm || unblockIpBusy) return;
    setUnblockIpBusy(true);
    OlympyApi.adminUnblockIp(unblockIpConfirm.id, OlympyApi.getToken())
      .then(() => {
        showToast(`${unblockIpConfirm.cidr} bloki olib tashlandi`);
        setUnblockIpConfirm(null);
        apiBlockedIpsRes.reload();
      })
      .catch(err => {
        console.warn('adminUnblockIp failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setUnblockIpBusy(false));
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Kamida nechta hisob</label>
              <div className="flex flex-wrap gap-2">
                {SHARED_IP_MIN_ACCOUNT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSharedIpMinAccounts(opt)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      sharedIpMinAccounts === opt
                        ? 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}>
                    {opt} ta
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Qaysi davr uchun</label>
              <div className="flex flex-wrap gap-2">
                {SHARED_IP_DAY_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSharedIpDays(opt)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      sharedIpDays === opt
                        ? 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}>
                    {opt} kun
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-text-secondary leading-relaxed">
            Bir manzil ortida bir nechta hisob bo'lishi o'z-o'zicha qoidabuzarlik emas:
            markaz kompyuter sinfi, oila Wi-Fi'si yoki mobil operator tarmog'i ham
            bir xil IP beradi. Ro'yxat faqat qo'lda tekshirish uchun nomzod beradi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[760px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {['IP manzil', 'Hisoblar', 'Birinchi kirish', 'Oxirgi kirish', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {!isApi ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiSharedIpRes.loading ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">
                    Oxirgi {appliedDays} kunda {appliedMinAccounts} tadan ko'p hisob kirgan IP topilmadi
                  </td></tr>
                ) : rows.map(row => (
                  <tr key={row.ip_address} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4 font-mono text-[11px] font-bold text-text-primary">{row.ip_address}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-surface-2 border border-warning/45 px-2 py-0.5 text-[10px] font-bold text-warning">
                        {row.distinct_users} ta hisob
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(row.first_seen)}</td>
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(row.last_seen)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSharedIpDetailAddress(row.ip_address)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition">
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
          <div className="mb-4 rounded-xl bg-surface-2 px-4 py-3 font-mono text-sm font-bold text-text-primary">
            {sharedIpDetailAddress}
          </div>
          <div className="max-h-80 overflow-y-auto admin-scroll divide-y divide-edge rounded-xl border border-edge bg-surface-1">
            {detailLoading ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Yuklanmoqda...</div>
            ) : apiSharedIpDetailRes.error ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</div>
            ) : detailRows.length === 0 ? (
              <div className="px-4 py-5 text-center text-[11px] font-semibold text-text-secondary">Hisoblar topilmadi</div>
            ) : detailRows.map(acc => (
              <div key={acc.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={acc.full_name} size={34} gradient="bg-pencil-600" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-text-primary">{acc.full_name}</div>
                  <div className="font-mono text-[10px] text-text-secondary">{maskPhoneDisplay(acc.phone, '')}</div>
                </div>
                <div className="text-right">
                  <AdminPill status={acc.is_active ? 'approved' : 'rejected'}>
                    {acc.is_active ? 'Faol' : 'Bloklangan'}
                  </AdminPill>
                  <div className="mt-1 text-[10px] font-semibold text-text-secondary whitespace-nowrap">
                    {formatAdminDateTime(acc.last_login_at)}
                  </div>
                </div>
                <button
                  onClick={() => openUserFromSecurity(acc.user_id)}
                  className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition">
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Holat</label>
              <div className="flex flex-wrap gap-2">
                {MODERATION_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setFlagStatus(opt.key); setFlagPage(1); }}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      flagStatus === opt.key
                        ? 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Bayroq turi</label>
              <div className="flex flex-wrap gap-2">
                {MODERATION_FLAG_TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.key || 'all'}
                    type="button"
                    onClick={() => { setFlagType(opt.key); setFlagPage(1); }}
                    className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      flagType === opt.key
                        ? 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-text-secondary leading-relaxed">
            Bayroqlarni har soatda ishlaydigan avtomatik tekshiruv qo'yadi. Hech qanday
            chora avtomatik ko'rilmaydi: "Hal qilindi" — tekshirib chora ko'rildi,
            "Rad etildi" — yolg'on signal. Yopilgan bayroqni qayta ochib bo'lmaydi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[900px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {['Vaqt', 'Tur', 'Sabab', 'Kim qo\'ydi', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {!isApi ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiModerationRes.loading ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Bayroqlar yo'q</td></tr>
                ) : rows.map(flag => (
                  <tr key={flag.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(flag.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-surface-2 border border-accent/45 px-2 py-0.5 text-[10px] font-bold text-accent">
                        {flag.flag_type_label || flag.flag_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-primary">
                      {flag.reason}
                      {/* Savol bayrog'ida — bayroq qo'yilgan paytdagi savol
                          NUSXASI (`extra`). Savol keyin tahrirlangan yoki
                          o'chirilgan bo'lsa ham tekshiruvchi asl matnni ko'radi. */}
                      {flag.flag_type === 'question' && flag.extra?.text && (
                        <div className="mt-1.5 max-w-md whitespace-pre-wrap text-[11px] font-medium text-text-secondary">
                          {flag.extra.text}
                          {Array.isArray(flag.extra.options) && flag.extra.options.length > 0 && (
                            <div className="mt-1 text-text-secondary">
                              {flag.extra.options.map((opt, i) => (
                                <span key={i} className={i === flag.extra.correct_answer ? 'text-success' : undefined}>
                                  {i > 0 ? ' · ' : ''}{opt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">{flag.raised_by}</td>
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
                            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-success border border-success/45 hover:bg-surface-1 transition">
                            <Icon name="check" size={12} /> Hal qilindi
                          </button>
                          <button
                            onClick={() => askResolveFlag(flag, 'dismissed')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-text-primary border border-edge hover:bg-surface-2 hover:text-text-primary transition">
                            <Icon name="x" size={12} /> Rad etish
                          </button>
                        </div>
                      ) : (
                        // Yopilgan qatorda tugma o'rniga qaror izi: kim yopgan
                        // va qanday izoh qoldirgan.
                        <div className="text-[11px] font-semibold text-text-secondary">
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
            <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary font-data">
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
          <div className="mb-5 rounded-xl bg-surface-2 px-4 py-3">
            <div className="text-sm font-bold text-text-primary">{flagResolve?.flag.reason}</div>
            <div className="mt-1 text-[11px] font-semibold text-text-secondary">
              {flagResolve?.flag.flag_type_label} · {formatAdminDateTime(flagResolve?.flag.created_at)}
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-xs text-text-secondary mb-1.5 font-medium">Izoh (ixtiyoriy)</label>
            <textarea
              value={flagResolveNote}
              onChange={e => setFlagResolveNote(e.target.value)}
              rows={3}
              maxLength={255}
              className="w-full admin-input resize-none px-3 py-2.5 text-sm outline-none"
              placeholder="Masalan: markaz kompyuter sinfi, qoidabuzarlik yo'q"
            />
            <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
              Faqat moderatsiya tarixiga yoziladi — foydalanuvchi buni ko'rmaydi.
            </p>
          </div>
          {/* Savol bayrog'i uchun ixtiyoriy chora. Belgilanmasa savolga
              umuman tegilmaydi: bayroq faqat navbatdan yopiladi. */}
          {canArchiveFlag && (
            <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <input
                type="checkbox"
                checked={flagResolveArchive}
                onChange={e => setFlagResolveArchive(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-edge-strong bg-surface-2 accent-accent focus:ring-accent/40"
              />
              <span>
                <span className="block text-xs font-bold text-text-primary">Savolni arxivlash</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-text-secondary">
                  Savol markaz bankidan olib tashlanadi va yangi olimpiadaga tanlanmaydi.
                  Mavjud natijalar va baholar saqlanib qoladi.
                </span>
              </span>
            </label>
          )}
          {/* Shubhali IP bayrog'i uchun ixtiyoriy chora — arxivlash bilan bir
              xil qoida: belgilanmasa manzilga umuman tegilmaydi. Muddat faqat
              belgilangandan keyin so'raladi (aks holda hech nimaga ta'sir
              qilmaydigan tanlov ko'rinib turardi). */}
          {canBlockFlagIp && (
            <div className="mb-5">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <input
                  type="checkbox"
                  checked={flagResolveBlockIp}
                  onChange={e => setFlagResolveBlockIp(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-edge-strong bg-surface-2 accent-accent focus:ring-accent/40"
                />
                <span>
                  <span className="block text-xs font-bold text-text-primary">Shu IP manzilni ham blokla</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-text-secondary">
                    <span className="font-mono text-text-secondary">{flagResolve?.flag.extra?.ip_address}</span> —
                    shu manzildan kelgan so'rovlar butun saytga kirita olmaydi.
                    Manzil ortida bir nechta foydalanuvchi bo'lishi mumkin (markaz
                    sinfxonasi, operator tarmog'i).
                  </span>
                </span>
              </label>
              {flagResolveBlockIp && (
                <div className="mt-3">
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Blok muddati</label>
                  <div className="grid grid-cols-3 gap-2">
                    {IP_BLOCK_DURATION_OPTIONS.map(opt => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setFlagResolveBlockDays(opt.value)}
                        className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                          flagResolveBlockDays === opt.value
                            ? opt.value === null
                              ? 'btn-danger font-bold'
                              : 'btn-primary font-bold'
                            : 'btn-ghost'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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

  const renderBlockedIpsSection = () => {
    const res = isApi ? apiBlockedIpsRes.data : null;
    const rows = Array.isArray(res?.results) ? res.results : [];
    const total = typeof res?.count === 'number' ? res.count : rows.length;
    const lastPage = Math.max(1, Math.ceil(total / BLOCKED_IP_PAGE_SIZE));
    const failed = isApi && !!apiBlockedIpsRes.error;
    return (
      <>
        <section className="admin-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              Yangi blok qo'yish
            </div>
            <button
              type="button"
              onClick={openBlockIpModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg btn-primary px-4 py-2 text-xs font-bold transition">
              <Icon name="plus" size={14} /> IP manzilni bloklash
            </button>
          </div>
          <p className="mt-4 text-[11px] text-text-secondary leading-relaxed">
            Bloklangan manzildan kelgan so'rov saytga UMUMAN kirmaydi — bu bitta
            hisobni bloklashdan ko'ra keng chora: bir manzil ortida markaz sinfxonasi
            yoki butun operator tarmog'i turishi mumkin. Blokni faqat admin qo'yadi,
            avtomatik tekshiruv hech qachon bloklamaydi. Muddati o'tgan bloklar
            ro'yxatda qoladi, lekin hech nimani to'smaydi.
          </p>
        </section>
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[1000px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {['IP manzil', 'Sabab', 'Kim bloklagan', 'Qo\'yilgan', 'Muddat', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {!isApi ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiBlockedIpsRes.loading ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Bloklangan IP manzillar yo'q</td></tr>
                ) : rows.map(row => (
                  <tr key={row.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4 font-mono text-[11px] font-bold text-text-primary">{row.cidr}</td>
                    <td className="px-5 py-4 font-semibold text-text-primary">{row.reason}</td>
                    {/* Blokni qo'ygan admin hisobi o'chirilgan bo'lsa backend
                        null qaytaradi (bayroqdagi "Tizim" holati bu yerda yo'q:
                        IP blokini hech qachon tizim qo'ymaydi). */}
                    <td className="px-5 py-4 font-semibold text-text-secondary">{row.blocked_by || '—'}</td>
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">{formatAdminDateTime(row.created_at)}</td>
                    <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">
                      {row.expires_at ? formatAdminDateTime(row.expires_at) : 'Doimiy'}
                    </td>
                    <td className="px-5 py-4">
                      <AdminPill status={row.is_active ? 'rejected' : 'draft'}>
                        {row.is_active ? 'Bloklangan' : "Muddati o'tgan"}
                      </AdminPill>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setUnblockIpConfirm({ id: row.id, cidr: row.cidr })}
                        className="rounded-lg border border-success/45 bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-success transition hover:bg-surface-1">
                        Blokni ochish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {/* Server tomon paginatsiya — muddati o'tgan bloklar ro'yxatda
            qolgani uchun u ham o'sib boradi (navbatdagidek). */}
        {total > BLOCKED_IP_PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setBlockedIpPage(p => Math.max(1, p - 1))}
              disabled={apiBlockedIpsRes.loading || blockedIpPage <= 1}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="chevronRight" size={12} className="rotate-180" /> Oldingisi
            </button>
            <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary font-data">
              {blockedIpPage} / {lastPage}
            </div>
            <button
              onClick={() => setBlockedIpPage(p => Math.min(lastPage, p + 1))}
              disabled={apiBlockedIpsRes.loading || blockedIpPage >= lastPage}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keyingisi <Icon name="chevronRight" size={12} />
            </button>
          </div>
        )}
        <Modal
          open={blockIpModal}
          onClose={() => !blockIpBusy && setBlockIpModal(false)}
          title="IP manzilni bloklash"
        >
          <div className="mb-5 space-y-4">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">IP manzil yoki tarmoq</label>
              <input
                value={blockIpAddress}
                onChange={e => setBlockIpAddress(e.target.value)}
                className="w-full admin-input px-3 py-2.5 text-sm font-mono outline-none"
                placeholder="1.2.3.4 yoki 1.2.3.0/24"
              />
              <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
                Bitta manzil ham, butun tarmoq ham shu maydonga yoziladi. Tarmoq
                CIDR ko'rinishida bo'ladi va undagi BARCHA manzillar bloklanadi —
                keng prefiks (masalan /8) tasodifan minglab foydalanuvchini yopib
                qo'yishi mumkin.
              </p>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Bloklash sababi</label>
              <input
                value={blockIpReason}
                onChange={e => setBlockIpReason(e.target.value)}
                maxLength={255}
                className="w-full admin-input px-3 py-2.5 text-sm outline-none"
                placeholder="Masalan: bir manzildan ommaviy soxta hisob"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Muddat</label>
              <div className="grid grid-cols-3 gap-2">
                {IP_BLOCK_DURATION_OPTIONS.map(opt => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setBlockIpDuration(opt.value)}
                    className={`px-2 py-2 rounded-xl text-[11px] font-bold transition-all border ${
                      blockIpDuration === opt.value
                        ? opt.value === null
                          ? 'btn-danger font-bold'
                          : 'btn-primary font-bold'
                        : 'btn-ghost'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
                Muddat tanlansa, blok o'sha kunlar o'tgach avtomatik kuchini yo'qotadi.
                "Doimiy" — admin qo'lda ochmaguncha bloklangan qoladi.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setBlockIpModal(false)}
              disabled={blockIpBusy}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50">
              Bekor qilish
            </button>
            <button
              onClick={submitBlockIp}
              disabled={blockIpBusy}
              className="btn-danger flex-1 rounded-xl py-3 font-semibold text-xs font-bold disabled:opacity-50">
              {blockIpBusy ? '...' : 'Bloklash'}
            </button>
          </div>
        </Modal>
        {/* Blokni olib tashlash — qator butunlay o'chiriladi, shuning uchun
            boshqa qaytarib bo'lmaydigan amallardagidek tasdiqlash oynasi. */}
        <ConfirmModal
          open={!!unblockIpConfirm}
          onClose={() => !unblockIpBusy && setUnblockIpConfirm(null)}
          onConfirm={runUnblockIp}
          title="Blokni ochish"
          message={`${unblockIpConfirm?.cidr || ''} bloki olib tashlanadi va shu manzil saytga qaytadan kira oladi. Yozuv ro'yxatdan butunlay o'chadi (blokning qo'yilishi ham, olinishi ham amallar tarixida qoladi) — davom etasizmi?`}
          confirmText="Ha, ochish"
          danger
          busy={unblockIpBusy}
        />
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Markaz</label>
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Holat</label>
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Sana oralig'i</label>
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
              <label className="block text-xs text-text-secondary mb-1.5 font-medium">Qidiruv</label>
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input
                  value={cheatingSearch}
                  onChange={e => { setCheatingSearch(e.target.value); setCheatingPage(1); }}
                  className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
                  placeholder="Ism yoki telefon..." />
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-text-secondary leading-relaxed">
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
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  {["O'quvchi", 'Olimpiada', 'Markaz', 'Holat', 'Sabab', 'Vaqt', 'Kim qaror qildi', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {!isApi ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Xavfsizlik ma'lumotlari faqat API rejimida ko'rinadi</td></tr>
                ) : apiCheatingRes.loading ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Yuklanmoqda...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Ma'lumotni yuklab bo'lmadi</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Firibgarlik holatlari topilmadi</td></tr>
                ) : rows.map(row => {
                  const meta = CHEATING_STATUS_META[row.status];
                  return (
                    <tr key={row.session_id} className="text-xs admin-table-row text-text-primary">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.student_name} size={34} gradient="bg-pencil-600" />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-text-primary">{row.student_name}</div>
                            <div className="font-mono text-[10px] text-text-secondary">{maskPhoneDisplay(row.student_phone, '')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-text-secondary">{row.olympiad_title}</td>
                      <td className="px-5 py-4 font-semibold text-text-secondary">{row.center_name}</td>
                      <td className="px-5 py-4">
                        <AdminPill status={meta?.pill}>{meta?.label || row.status}</AdminPill>
                      </td>
                      {/* Sabab kodini o'zbekchaga menejer panelidagi bir xil
                          xarita aylantiradi (yagona manba) — noma'lum kod xom
                          holda ko'rinadi. */}
                      <td className="px-5 py-4 font-semibold text-text-secondary">{cheatingReasonLabel(row.cheating_reason) || '—'}</td>
                      {/* Diskvalifikatsiyada — DQ vaqti, kutayotganda esa
                          tekshiruv so'ralgan vaqt (backend ro'yxatni AYNAN shu
                          vaqt bo'yicha tartiblaydi). */}
                      <td className="px-5 py-4 font-semibold text-text-secondary whitespace-nowrap">
                        {formatAdminDateTime(row.disqualified_at || row.review_requested_at)}
                      </td>
                      <td className="px-5 py-4 font-semibold text-text-secondary">
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
                          className="text-[11px] font-semibold text-text-secondary whitespace-nowrap">
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
            <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary font-data">
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

  // ─── Jonli Proktoring Monitoringi ───
  const [terminatingSessionId, setTerminatingSessionId] = React.useState(null);
  const [terminateReason, setTerminateReason] = React.useState('');
  const [terminateLoading, setTerminateLoading] = React.useState(false);

  const handleTerminateLiveSession = (sessionId) => {
    if (!terminateReason.trim()) {
      showToast('To‘xtatish sababini kiriting', 'error');
      return;
    }
    setTerminateLoading(true);
    OlympyApi.terminateAdminLiveProctoring(sessionId, terminateReason, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Imtihon to‘xtatildi va diskvalifikatsiya qilindi');
        setTerminatingSessionId(null);
        setTerminateReason('');
        setLiveProctoringKey(k => k + 1);
      })
      .catch(err => {
        showToast(toUserMessage(err, 'Imtihonni to‘xtatib bo‘lmadi'), 'error');
      })
      .finally(() => setTerminateLoading(false));
  };

  const renderLiveProctoringSection = () => {
    const liveSessions = apiLiveProctoringRes.data?.results || [];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-1 border border-edge p-4">
          <div>
            <div className="text-sm font-bold text-text-primary flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Jonli Imtihon Monitoringi (Live Proctoring)
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              Hozirda test topshirayotgan o'quvchilar, ularning qolgan vaqti va anticheat holati.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLiveProctoringKey(k => k + 1)}
            disabled={apiLiveProctoringRes.loading}
            className="btn-ghost px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={13} className={apiLiveProctoringRes.loading ? 'animate-spin' : ''} />
            Yangilash
          </button>
        </div>

        {apiLiveProctoringRes.loading ? (
          <div className="rounded-2xl border border-edge bg-surface-1 p-10 text-center text-xs font-bold text-text-secondary">
            Jonli sessiyalar yuklanmoqda...
          </div>
        ) : liveSessions.length === 0 ? (
          <div className="rounded-2xl border border-edge bg-surface-1 p-10 text-center text-xs font-bold text-text-secondary">
            Ayni paytda test topshirayotgan faol ishtirokchilar mavjud emas.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-edge bg-surface-1">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-edge bg-surface-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Ishtirokchi</th>
                  <th className="px-4 py-3">Olimpiada</th>
                  <th className="px-4 py-3">O'tgan vaqt</th>
                  <th className="px-4 py-3">Qolgan vaqt</th>
                  <th className="px-4 py-3">Kamera / Ovoz</th>
                  <th className="px-4 py-3">Holat</th>
                  <th className="px-4 py-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge font-medium text-text-primary">
                {liveSessions.map(s => (
                  <tr key={s.session_id} className="hover:bg-surface-2/60 transition">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-text-primary">{s.user.full_name}</div>
                      <div className="text-[11px] text-text-secondary font-mono">{s.user.phone}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-text-primary">{s.olympiad.title}</div>
                      <div className="text-[11px] text-text-secondary">{s.olympiad.subject}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px]">
                      {Math.floor(s.elapsed_seconds / 60)} daq {s.elapsed_seconds % 60} son
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-accent font-bold">
                      {Math.floor(s.remaining_seconds / 60)} daq {s.remaining_seconds % 60} son
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.camera_consent ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface-2 text-text-secondary'}`}>
                          📷 {s.camera_consent ? 'ON' : 'OFF'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.microphone_consent ? 'bg-emerald-500/15 text-emerald-600' : 'bg-surface-2 text-text-secondary'}`}>
                          🎙️ {s.microphone_consent ? 'ON' : 'OFF'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.status === 'pending_review' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
                      }`}>
                        {s.status === 'pending_review' ? 'Tekshiruvda' : 'Topshirmoqda'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {terminatingSessionId === s.session_id ? (
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="text"
                            value={terminateReason}
                            onChange={(e) => setTerminateReason(e.target.value)}
                            placeholder="Sabab (masalan, shpargalka)..."
                            className="input-text text-xs py-1 px-2.5 w-44 rounded-lg"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleTerminateLiveSession(s.session_id)}
                            disabled={terminateLoading}
                            className="btn-danger text-xs px-2.5 py-1 rounded-lg font-bold"
                          >
                            {terminateLoading ? '...' : 'To‘xtatish'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setTerminatingSessionId(null); setTerminateReason(''); }}
                            className="btn-ghost text-xs px-2 py-1 rounded-lg"
                          >
                            Bekor
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setTerminatingSessionId(s.session_id); setTerminateReason("Jonli imtihonda qoidabuzarlik aniqlandi"); }}
                          className="btn-ghost text-xs text-error hover:bg-error/10 px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1"
                        >
                          <Icon name="x" size={12} />
                          To‘xtatish
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const securitySectionRenderers = {
    'shared-ip': renderSharedIpSection,
    'live-proctoring': renderLiveProctoringSection,
    'auto-flags': renderAutoFlagsSection,
    'blocked-ips': renderBlockedIpsSection,
    cheating: renderCheatingOverviewSection,
  };

  const renderSecurity = () => {
    const activeSection = securitySectionRenderers[securitySection]
      ? securitySection
      : SECURITY_SECTIONS[0].key;
    return (
      <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Xavfsizlik</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
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
                  ? 'btn-primary font-bold'
                  : 'btn-ghost'
              }`}>
              {section.label}
            </button>
          ))}
        </div>
        {securitySectionRenderers[activeSection]()}
      </div>
    );
  };

  // ─── Olimpiada & Baholash Nazorati Handlerlari ───
  const handleToggleFreeze = (olympiad) => {
    OlympyApi.toggleAdminOlympiadFreeze(olympiad.id, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Muzlatish holati o‘zgartirildi');
        if (apiOlympiadsRes) apiOlympiadsRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Muzlatish holatini o‘zgartirib bo‘lmadi'), 'error'));
  };

  const handleRunRegrade = (olympiadId) => {
    setRegradeLoading(true);
    OlympyApi.batchRegradeAdminOlympiad(olympiadId, OlympyApi.getToken())
      .then(res => {
        setRegradeResults(res);
        showToast(res?.message || 'Ballar muvaffaqiyatli qayta hisoblandi');
        if (apiOlympiadsRes) apiOlympiadsRes.reload();
      })
      .catch(err => showToast(toUserMessage(err, 'Qayta hisoblab bo‘lmadi'), 'error'))
      .finally(() => setRegradeLoading(false));
  };

  const handleOpenAnalytics = (olympiad) => {
    setOlympiadAnalyticsModal(olympiad);
    setOlympiadAnalyticsLoading(true);
    setOlympiadAnalyticsData(null);
    OlympyApi.getAdminOlympiadQuestionAnalytics(olympiad.id, OlympyApi.getToken())
      .then(res => setOlympiadAnalyticsData(res))
      .catch(err => showToast(toUserMessage(err, 'Savollar tahlilini yuklab bo‘lmadi'), 'error'))
      .finally(() => setOlympiadAnalyticsLoading(false));
  };

  const handleOpenCertificates = (olympiad) => {
    setOlympiadCertificatesModal(olympiad);
    setOlympiadCertificatesLoading(true);
    setOlympiadCertificatesData(null);
    OlympyApi.getAdminOlympiadCertificates(olympiad.id, OlympyApi.getToken())
      .then(res => setOlympiadCertificatesData(res))
      .catch(err => showToast(toUserMessage(err, 'Sertifikatlar ro‘yxatini yuklab bo‘lmadi'), 'error'))
      .finally(() => setOlympiadCertificatesLoading(false));
  };

  const handleChangeCertificateTemplate = (olympiadId, template) => {
    setOlympiadTemplateSaving(true);
    OlympyApi.setAdminOlympiadCertificateTemplate(olympiadId, template, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Shablon saqlandi');
        if (olympiadCertificatesData) {
          setOlympiadCertificatesData({ ...olympiadCertificatesData, certificate_template: template });
        }
      })
      .catch(err => showToast(toUserMessage(err, 'Shablonni saqlab bo‘lmadi'), 'error'))
      .finally(() => setOlympiadTemplateSaving(false));
  };

  const renderOlympiads = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Musobaqalar va Baholash Nazorati</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            Platformadagi olimpiadalar, jonli reytingni muzlatish, ballarni qayta hisoblash va psixometrik tahlil.
          </p>
        </div>
      </div>
      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[960px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3.5">Tadbir</th>
                <th className="px-5 py-3.5">Tashkilot</th>
                <th className="px-5 py-3.5">Fan</th>
                <th className="px-5 py-3.5">Sana</th>
                <th className="px-5 py-3.5">Ishtirokchilar</th>
                <th className="px-5 py-3.5">Reyting Holati</th>
                <th className="px-5 py-3.5">Holat</th>
                <th className="px-5 py-3.5 text-right">Boshqaruv & Tahlil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {(() => {
                const olympiadList = isApi ? (apiOlympiads || []) : store.olympiads;
                if (olympiadList.length === 0) {
                  return <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-text-secondary">Hali tadbirlar yo'q</td></tr>;
                }
                return olympiadList.map(o => {
                  const center = centers.find(c => String(c.id) === String(o.centerId));
                  return (
                    <tr key={o.id} className="text-xs admin-table-row text-text-primary">
                      <td className="px-5 py-4">
                        <div className="font-bold text-text-primary">{o.title}</div>
                        <div className="text-[10px] text-text-secondary font-mono">#{o.id}</div>
                      </td>
                      <td className="px-5 py-4 font-semibold text-text-secondary">{center?.name || '—'}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-surface-2 border border-accent/45 px-2 py-0.5 text-[10px] font-bold text-accent">
                          {o.subject}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-text-secondary">{o.startDate || '—'}</td>
                      <td className="px-5 py-4 font-bold text-text-primary">{o.participants || 0}</td>
                      <td className="px-5 py-4">
                        {o.isLeaderboardFrozen ? (
                          <span className="rounded-md bg-sky-500/15 text-sky-600 border border-sky-500/30 px-2 py-0.5 text-[10px] font-bold inline-flex items-center gap-1">
                            🧊 Muzlatilgan
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-text-secondary">Jonli (Ochiq)</span>
                        )}
                      </td>
                      <td className="px-5 py-4"><AdminPill status={o.status} /></td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            title={o.isLeaderboardFrozen ? "Reyting muzlatishini bekor qilish" : "Reytingni ishtirokchilar uchun muzlatish"}
                            onClick={() => handleToggleFreeze(o)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 ${
                              o.isLeaderboardFrozen
                                ? 'bg-sky-500/15 text-sky-600 border border-sky-500/40 hover:bg-sky-500/25'
                                : 'bg-surface-2 text-text-secondary border border-edge hover:text-text-primary hover:bg-surface-3'
                            }`}
                          >
                            <Icon name="lock" size={11} />
                            <span>{o.isLeaderboardFrozen ? 'Ochish' : 'Muzlatish'}</span>
                          </button>
                          <button
                            type="button"
                            title="Savollar tahlili (Qiyinlik va Diskriminatsiya indeksi)"
                            onClick={() => handleOpenAnalytics(o)}
                            className="rounded-lg bg-surface-2 text-accent border border-accent/40 px-2.5 py-1 text-[11px] font-bold hover:bg-accent/10 transition flex items-center gap-1"
                          >
                            <Icon name="bar-chart-2" size={11} />
                            <span>Tahlil</span>
                          </button>
                          <button
                            type="button"
                            title="Diplom va Sertifikatlar taqsimoti"
                            onClick={() => handleOpenCertificates(o)}
                            className="rounded-lg bg-surface-2 text-warning border border-warning/40 px-2.5 py-1 text-[11px] font-bold hover:bg-warning/10 transition flex items-center gap-1"
                          >
                            <Icon name="award" size={11} />
                            <span>Diplomlar</span>
                          </button>
                          <button
                            type="button"
                            title="Plagiat va Ko‘chirish Tahlili"
                            onClick={() => handleOpenPlagiarism(o)}
                            className="rounded-lg bg-surface-2 text-rose-500 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-500/10 transition flex items-center gap-1"
                          >
                            <Icon name="shield" size={11} />
                            <span>Plagiat</span>
                          </button>
                          <button
                            type="button"
                            title="Chop etiladigan Test Kitobi & OMR Javoblar Varaqasi"
                            onClick={() => handleOpenPrintable(o)}
                            className="rounded-lg bg-surface-2 text-sky-500 border border-sky-500/40 px-2.5 py-1 text-[11px] font-bold hover:bg-sky-500/10 transition flex items-center gap-1"
                          >
                            <Icon name="book" size={11} />
                            <span>Chop etish</span>
                          </button>
                          <button
                            type="button"
                            title="Ballarni qayta hisoblash (Batch Regrade)"
                            onClick={() => { setRegradeConfirmModal(o); setRegradeResults(null); }}
                            className="rounded-lg bg-surface-2 text-text-primary border border-edge px-2.5 py-1 text-[11px] font-bold hover:bg-surface-3 transition flex items-center gap-1"
                          >
                            <Icon name="refresh" size={11} />
                            <span>Regrade</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* 1. Batch Regrading Modali */}
      <Modal open={!!regradeConfirmModal} onClose={() => !regradeLoading && setRegradeConfirmModal(null)} title="Ballarni Qayta Hisoblash (Batch Regrade)">
        {regradeConfirmModal && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Olimpiadaning barcha ishtirokchilari javoblari savollar bankidagi joriy to'g'ri variantlarga qarab qayta tekshiriladi va o'rinlar (rank) yangilanadi.
            </p>
            <div className="rounded-xl bg-surface-2 p-3 border border-edge text-xs">
              <strong>Tadbir:</strong> {regradeConfirmModal.title} (#{regradeConfirmModal.id})
            </div>

            {regradeResults && (
              <div className="rounded-xl p-3 bg-surface-2 border border-edge text-xs space-y-2">
                <div className="font-bold text-success">
                  ✅ {regradeResults.message}
                </div>
                {regradeResults.score_changes?.length > 0 && (
                  <div className="max-h-40 overflow-y-auto admin-scroll divide-y divide-edge rounded-lg border border-edge bg-surface-1">
                    {regradeResults.score_changes.map((sc, i) => (
                      <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                        <span>{sc.user_name}</span>
                        <span className={`font-bold font-mono ${sc.diff > 0 ? 'text-success' : 'text-error'}`}>
                          {sc.old_score}% ➔ {sc.new_score}% ({sc.diff > 0 ? `+${sc.diff}` : sc.diff}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={regradeLoading}
                onClick={() => setRegradeConfirmModal(null)}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
              >
                {regradeResults ? 'Yopish' : 'Bekor qilish'}
              </button>
              {!regradeResults && (
                <button
                  type="button"
                  disabled={regradeLoading}
                  onClick={() => handleRunRegrade(regradeConfirmModal.id)}
                  className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
                >
                  {regradeLoading ? 'Qayta hisoblanmoqda...' : 'Hisoblashni boshlash'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Savollar Psixometrik Tahlili (IRT Analytics) Modali */}
      <Modal open={!!olympiadAnalyticsModal} onClose={() => setOlympiadAnalyticsModal(null)} title="Savollar Sifati va Qiyinlik Tahlili (IRT / Psychometrics)" width="max-w-4xl">
        {olympiadAnalyticsModal && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div>
                <strong>Tadbir:</strong> {olympiadAnalyticsModal.title}
              </div>
              {olympiadAnalyticsData && (
                <span className="text-text-secondary font-semibold">
                  Jami ishtirokchilar: {olympiadAnalyticsData.total_participants} ta
                </span>
              )}
            </div>

            {olympiadAnalyticsLoading ? (
              <div className="p-10 text-center text-xs font-bold text-text-secondary">Tahlil yuklanmoqda...</div>
            ) : !olympiadAnalyticsData?.questions?.length ? (
              <div className="p-10 text-center text-xs font-bold text-text-secondary">Savollar bo'yicha tahlil ma'lumotlari topilmadi.</div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto admin-scroll space-y-3">
                {olympiadAnalyticsData.questions.map((q, idx) => (
                  <div key={q.question_id} className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-text-primary flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center text-[10px] shrink-0">{idx + 1}</span>
                        <span>{q.question_text}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-surface-3 font-bold text-[10px] text-text-secondary">
                          {q.difficulty_label} ({q.facility_index}%)
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          q.quality_color === 'success' ? 'bg-success/15 text-success' : q.quality_color === 'warning' ? 'bg-warning/15 text-warning' : 'bg-error/15 text-error'
                        }`}>
                          D={q.discrimination_index} ({q.quality_label.split(' ')[0]})
                        </span>
                      </div>
                    </div>

                    {/* Variantlar taqsimoti */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-edge/60">
                      {['A', 'B', 'C', 'D'].map((letter, optIdx) => {
                        const count = q.options_distribution?.[optIdx] || 0;
                        const isCorrect = optIdx === q.correct_answer;
                        const pct = q.total_answers > 0 ? Math.round((count / q.total_answers) * 100) : 0;
                        return (
                          <div key={letter} className={`p-2 rounded-xl border text-[11px] ${
                            isCorrect ? 'bg-success/10 border-success/30 text-success' : 'bg-surface-1 border-edge text-text-secondary'
                          }`}>
                            <div className="flex items-center justify-between font-bold">
                              <span>Variant {letter} {isCorrect && '✅'}</span>
                              <span className="font-mono">{pct}% ({count})</span>
                            </div>
                            <div className="text-[10px] truncate mt-0.5 text-text-primary font-medium">
                              {q.options?.[optIdx] || '—'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setOlympiadAnalyticsModal(null)} className="btn-ghost w-full rounded-xl py-3 text-xs font-bold">
              Yopish
            </button>
          </div>
        )}
      </Modal>

      {/* 3. Diplom va Sertifikatlar Modali */}
      <Modal open={!!olympiadCertificatesModal} onClose={() => setOlympiadCertificatesModal(null)} title="Diplom va Sertifikatlar Boshqaruvi" width="max-w-3xl">
        {olympiadCertificatesModal && (
          <div className="space-y-4">
            {/* Shablon tanlash */}
            <div className="rounded-2xl border border-edge bg-surface-2 p-3.5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-text-primary">Sertifikat Dizayn Shabloni</div>
                <div className="text-[11px] text-text-secondary mt-0.5">O'quvchilar yuklab oladigan PDF/QR diplom dizayni</div>
              </div>
              <div className="flex items-center gap-1.5">
                {['standard', 'modern', 'gold', 'dark'].map(tpl => (
                  <button
                    key={tpl}
                    type="button"
                    disabled={olympiadTemplateSaving}
                    onClick={() => handleChangeCertificateTemplate(olympiadCertificatesModal.id, tpl)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition border ${
                      (olympiadCertificatesData?.certificate_template || 'standard') === tpl
                        ? 'bg-accent text-on-accent border-accent'
                        : 'bg-surface-1 text-text-secondary border-edge hover:text-text-primary'
                    }`}
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            </div>

            {/* Mukofotlar hisoboti */}
            {olympiadCertificatesData?.counts && (
              <div className="grid grid-cols-5 gap-2 text-center text-xs font-bold">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
                  <div className="text-[10px]">🥇 Oltin</div>
                  <div className="text-sm mt-0.5">{olympiadCertificatesData.counts.gold} ta</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-300/15 border border-slate-300/30 text-slate-400">
                  <div className="text-[10px]">🥈 Kumush</div>
                  <div className="text-sm mt-0.5">{olympiadCertificatesData.counts.silver} ta</div>
                </div>
                <div className="p-2 rounded-xl bg-amber-700/10 border border-amber-700/30 text-amber-700">
                  <div className="text-[10px]">🥉 Bronza</div>
                  <div className="text-sm mt-0.5">{olympiadCertificatesData.counts.bronze} ta</div>
                </div>
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600">
                  <div className="text-[10px]">📜 Muvaffaqiyat</div>
                  <div className="text-sm mt-0.5">{olympiadCertificatesData.counts.achievement} ta</div>
                </div>
                <div className="p-2 rounded-xl bg-surface-2 border border-edge text-text-secondary">
                  <div className="text-[10px]">📄 Ishtirokchi</div>
                  <div className="text-sm mt-0.5">{olympiadCertificatesData.counts.participation} ta</div>
                </div>
              </div>
            )}

            {/* Diplom oluvchilar ro'yxati */}
            <div className="max-h-72 overflow-y-auto admin-scroll divide-y divide-edge rounded-2xl border border-edge bg-surface-1">
              {olympiadCertificatesLoading ? (
                <div className="p-6 text-center text-xs text-text-secondary font-bold">Yuklanmoqda...</div>
              ) : !olympiadCertificatesData?.results?.length ? (
                <div className="p-6 text-center text-xs text-text-secondary font-bold">Diplom oluvchilar mavjud emas.</div>
              ) : (
                olympiadCertificatesData.results.map(res => (
                  <div key={res.attempt_id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-text-primary flex items-center gap-2">
                        <span>{res.full_name}</span>
                        <span className="text-[10px] text-text-secondary font-mono">({res.phone})</span>
                      </div>
                      <div className="text-[11px] text-text-secondary mt-0.5">
                        {res.award_title} · Ball: <span className="font-bold text-accent">{res.score}%</span> · O'rin: #{res.rank}
                      </div>
                    </div>
                    {res.verify_url && (
                      <a
                        href={res.verify_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost text-[11px] font-bold text-accent px-2.5 py-1 rounded-lg inline-flex items-center gap-1 border border-edge"
                      >
                        <Icon name="external-link" size={11} />
                        QR Tekshiruv
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>

            <button type="button" onClick={() => setOlympiadCertificatesModal(null)} className="btn-ghost w-full rounded-xl py-3 text-xs font-bold">
              Yopish
            </button>
          </div>
        )}
      </Modal>
    </div>
  );

  const renderSubjects = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-bold leading-tight text-text-primary">Fanlar</h1>
        <p className="mt-1 text-[11px] font-bold text-text-secondary">Platformada ishlatiladigan fan kategoriyalari.</p>
      </div>
      <section className="admin-card p-5">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text-secondary">Yangi fan qo'shish</div>
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
          }} className="inline-flex items-center justify-center gap-2 rounded-lg btn-primary px-4 py-2 text-xs font-bold transition">
            <Icon name="plus" size={14} /> Qo'shish
          </button>
        </div>
      </section>
      <section className="admin-card p-5">
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => (
            <span key={s} className="rounded-md bg-surface-2 border border-accent/45 px-3 py-2 text-xs font-bold text-accent">
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

  // Eskirgan javob himoyasi: admin A suhbatini bosib, javob kelmasdan B ni
  // bossa va #1 so'rov #2 dan KEYIN qaytsa, sarlavhada B ning ismi turib
  // xabarlar A niki bo'lib qolardi. Endpoint javobi chat_key'ni qaytarmaydi,
  // shuning uchun :2751 dagi ID-solishtirishni javob ustida bajarib
  // bo'lmaydi — o'rniga useApiData'dagi `cancelled` bayrog'i bilan bir xil
  // qoida: oxirgi so'ralgan kalit ref'da saqlanadi, eskirgan javob state'ga
  // umuman yozmaydi (loading bayrog'ini ham o'zgartirmaydi).
  const threadDetailReqRef = React.useRef(null);
  const loadThreadDetail = React.useCallback((chatKey) => {
    threadDetailReqRef.current = chatKey;
    setLoadingMessages(true);
    const token = OlympyApi.getToken();
    OlympyApi.getAdminSupportChatDetail(chatKey, token)
      .then(res => {
        if (threadDetailReqRef.current !== chatKey) return;
        setThreadMessages(res.messages || []);
      })
      .catch(err => {
        if (threadDetailReqRef.current !== chatKey) return;
        console.error('Failed to load thread detail:', err);
      })
      .finally(() => {
        if (threadDetailReqRef.current !== chatKey) return;
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
      // Suhbat yopilganda parvozdagi so'rov ham "eskirgan" bo'ladi — kalitni
      // tozalaymiz, aks holda uning javobi bo'shatilgan ro'yxatni to'ldirardi.
      threadDetailReqRef.current = null;
      setThreadMessages([]);
    }
  }, [selectedThread, loadThreadDetail]);

  const renderSupport = () => (
    <div className="min-h-[calc(100vh-54px)] p-[18px] flex flex-col space-y-[14px]">
      <div>
        <h1 className="text-[20px] font-bold leading-tight text-text-primary">AI Support Yozishmalari</h1>
        <p className="mt-1 text-[11px] font-bold text-text-secondary">Foydalanuvchilarning sun'iy intellekt yordamchisi bilan qilgan suhbatlari tarixi.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[500px]">
        {/* Thread list */}
        <div className="admin-card p-4 flex flex-col h-[600px] overflow-hidden">
          <h2 className="text-xs font-bold tracking-wider uppercase text-text-primary mb-3 flex items-center justify-between">
            Suhbatlar
            <button onClick={loadSupportThreads} className="p-1 rounded bg-surface-2 hover:bg-surface-2 text-accent transition cursor-pointer" title="Yangilash">
              <Icon name="chevronRight" size={12} className="rotate-90" />
            </button>
          </h2>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 admin-scroll">
            {loadingThreads ? (
              <div className="py-8 text-center text-xs text-text-secondary font-semibold">Yuklanmoqda...</div>
            ) : supportThreads.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-secondary font-semibold">Murojaatlar topilmadi</div>
            ) : (
              supportThreads.map(t => {
                const isSelected = selectedThread?.chat_key === t.chat_key;
                return (
                  <button
                    key={t.chat_key}
                    onClick={() => setSelectedThread(t)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-surface-2 text-text-primary'
                        : 'bg-surface-1 border-edge hover:border-edge-strong text-text-primary'
                    }`}
                  >
                    <div className="font-bold text-xs truncate">{t.full_name || 'Noma\'lum user'}</div>
                    <div className="text-[10px] text-text-secondary font-medium mt-0.5">{t.phone}</div>
                    <div className="text-[11px] text-text-secondary truncate mt-1.5 font-medium">
                      <span className="text-[9px] font-bold uppercase mr-1 opacity-70">
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
              <div className="px-5 py-4 border-b border-edge flex items-center justify-between bg-surface-1">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">{selectedThread.full_name}</h3>
                  <p className="text-[10px] text-text-secondary font-bold mt-0.5">{selectedThread.phone}</p>
                </div>
                <button
                  onClick={() => loadThreadDetail(selectedThread.chat_key)}
                  className="px-3 py-1.5 rounded-lg bg-surface-2 border border-edge hover:bg-surface-2 text-xs font-bold text-accent transition cursor-pointer"
                >
                  Yangilash
                </button>
              </div>

              {/* Message history */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 admin-scroll">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center text-xs text-text-secondary font-semibold">Yuklanmoqda...</div>
                ) : (
                  threadMessages.map((m, idx) => {
                    const isUser = m.role === 'user';
                    const isAdmin = m.role === 'admin';
                    return (
                      <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-accent-fill text-on-accent rounded-tr-none'
                              : isAdmin
                              ? 'bg-surface-2 text-warning border border-warning/45 rounded-tl-none font-semibold'
                              : 'bg-surface-2 text-text-primary border border-edge rounded-tl-none'
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
              <form onSubmit={handleSendAdminReply} className="p-4 border-t border-edge bg-surface-1 flex gap-2">
                <input
                  type="text"
                  value={adminReplyText}
                  onChange={e => setAdminReplyText(e.target.value)}
                  className="flex-1 h-9 px-3 bg-surface-2 border border-edge rounded-xl text-xs text-text-primary outline-none focus:border-accent/45 transition"
                  placeholder="Foydalanuvchiga javob yozing..."
                  disabled={sendingAdminReply}
                />
                <button
                  type="submit"
                  disabled={sendingAdminReply || !adminReplyText.trim()}
                  className="h-9 px-4 rounded-xl btn-primary text-xs font-bold transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
                >
                  {sendingAdminReply ? 'Yuborilmoqda...' : 'Yuborish'}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-text-secondary">
              <span className="text-4xl mb-3">💬</span>
              <h3 className="text-sm font-bold text-text-secondary">Suhbat tanlanmagan</h3>
              <p className="text-[10px] text-text-secondary max-w-xs mt-1 font-semibold">Foydalanuvchilar suhbat tarixini ko'rish uchun chap tomondagi ro'yxatdan birorta suhbatni tanlang.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ─── AI Orchestration Studio ───
  const handleGenerateAiExam = (e) => {
    e.preventDefault();
    if (!aiGenTopic.trim()) {
      showToast('Iltimos, mavzuni kiriting', 'error');
      return;
    }
    setAiGenLoading(true);
    setAiGenResults(null);
    OlympyApi.adminGenerateExamQuestions({
      subject: aiGenSubject,
      topic: aiGenTopic,
      difficulty: aiGenDifficulty,
      count: aiGenCount,
      language: aiGenLanguage,
      center_id: aiGenCenterId || undefined,
      olympiad_id: aiGenOlympiadId || undefined,
      save_to_bank: aiGenSaveToBank,
    }, OlympyApi.getToken())
      .then(res => {
        setAiGenResults(res);
        showToast(res?.saved_to_bank ? `${res.saved_count} ta savol generatsiya qilinib bazaga saqlandi!` : `${res.generated_count} ta savol generatsiya qilindi!`);
      })
      .catch(err => showToast(toUserMessage(err, 'AI orqali savol generatsiya qilishda xatolik'), 'error'))
      .finally(() => setAiGenLoading(false));
  };

  const handleModerateAppeal = (e) => {
    e.preventDefault();
    if (!aiAppealQText.trim() || !aiAppealReason.trim()) {
      showToast('Savol matni va apellyatsiya shikoyatini kiriting', 'error');
      return;
    }
    setAiAppealLoading(true);
    setAiAppealResults(null);
    OlympyApi.adminModerateAppeal({
      question_text: aiAppealQText,
      options: aiAppealOpts.filter(Boolean),
      student_answer: aiAppealAnswer,
      appeal_reason: aiAppealReason,
    }, OlympyApi.getToken())
      .then(res => {
        setAiAppealResults(res?.analysis);
        showToast('AI hakamlik xulosasi tayyor!');
      })
      .catch(err => showToast(toUserMessage(err, 'AI tahlilda xatolik'), 'error'))
      .finally(() => setAiAppealLoading(false));
  };

  const handleLoadAiMetrics = () => {
    setAiMetricsLoading(true);
    OlympyApi.getAdminAiUsageMetrics(OlympyApi.getToken())
      .then(res => setAiMetricsData(res))
      .catch(err => showToast(toUserMessage(err, 'Metriklarni yuklab bo‘lmadi'), 'error'))
      .finally(() => setAiMetricsLoading(false));
  };

  const renderAiStudio = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary flex items-center gap-2">
            <span>AI Orchestration Studio</span>
            <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-bold uppercase">Gemini 2.5</span>
          </h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            Sun'iy intellekt orqali test savollarini avtomatik generatsiya qilish, apellyatsiyalarni moderatsiya qilish va xarajatlarni nazorat qilish.
          </p>
        </div>
      </div>

      {/* Tab navigatsiyasi */}
      <div className="flex border-b border-edge gap-1">
        {[
          { key: 'generator', icon: 'sparkles', label: '1. AI Test Generatori' },
          { key: 'appeal', icon: 'shield', label: '2. AI Apellyatsiya Moderatori' },
          { key: 'metrics', icon: 'chart', label: '3. LLM Token & Xarajatlar' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setAiStudioTab(t.key);
              if (t.key === 'metrics' && !aiMetricsData) handleLoadAiMetrics();
            }}
            className={`px-4 py-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
              aiStudioTab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon name={t.icon} size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* 1-TAB: AI TEST GENERATORI */}
      {aiStudioTab === 'generator' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="admin-card p-5 space-y-4 lg:col-span-1">
            <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">Generatsiya Parametrlari</div>
            <form onSubmit={handleGenerateAiExam} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-text-secondary">Fan:</label>
                <input
                  type="text"
                  required
                  value={aiGenSubject}
                  onChange={e => setAiGenSubject(e.target.value)}
                  placeholder="Masalan: Matematika, Fizika, Kimyo"
                  className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary">Mavzu / Kontekst:</label>
                <input
                  type="text"
                  required
                  value={aiGenTopic}
                  onChange={e => setAiGenTopic(e.target.value)}
                  placeholder="Masalan: Kvadrat tenglamalar, Nyuton qonunlari"
                  className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-text-secondary">Qiyinlik darajasi:</label>
                  <select
                    value={aiGenDifficulty}
                    onChange={e => setAiGenDifficulty(e.target.value)}
                    className="mt-1 w-full admin-input h-9 px-2 text-xs rounded-xl"
                  >
                    <option value="easy">Oson (Easy)</option>
                    <option value="medium">O‘rtacha (Medium)</option>
                    <option value="hard">Qiyin (Hard)</option>
                    <option value="advanced">Olimpiada (Advanced)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-text-secondary">Savollar soni:</label>
                  <select
                    value={aiGenCount}
                    onChange={e => setAiGenCount(Number(e.target.value))}
                    className="mt-1 w-full admin-input h-9 px-2 text-xs rounded-xl"
                  >
                    {[3, 5, 10, 15, 20, 30].map(n => (
                      <option key={n} value={n}>{n} ta savol</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold text-text-secondary">Til:</label>
                <select
                  value={aiGenLanguage}
                  onChange={e => setAiGenLanguage(e.target.value)}
                  className="mt-1 w-full admin-input h-9 px-2 text-xs rounded-xl"
                >
                  <option value="uz">O‘zbekcha</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-text-secondary">Markazga biriktirish:</label>
                <select
                  value={aiGenCenterId}
                  onChange={e => setAiGenCenterId(e.target.value)}
                  className="mt-1 w-full admin-input h-9 px-2 text-xs rounded-xl"
                >
                  <option value="">(Asosiy tizim markazi)</option>
                  {approvedCenters.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="pt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="saveBank"
                  checked={aiGenSaveToBank}
                  onChange={e => setAiGenSaveToBank(e.target.checked)}
                  className="rounded border-edge text-accent focus:ring-accent"
                />
                <label htmlFor="saveBank" className="text-xs font-semibold text-text-primary cursor-pointer">
                  To‘g‘ridan-to‘g‘ri Savollar Bankiga saqlash
                </label>
              </div>
              <button
                type="submit"
                disabled={aiGenLoading}
                className="w-full btn-primary rounded-xl py-3 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Icon name="sparkles" size={14} />
                <span>{aiGenLoading ? 'Gemini AI generatsiya qilmoqda...' : 'AI Savollarni Yaratish'}</span>
              </button>
            </form>
          </section>

          {/* Natijalar ko'rinishi */}
          <section className="admin-card p-5 space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">Yaratilgan Savollar Ko‘rinishi (Preview)</div>
              {aiGenResults && (
                <span className="text-xs font-bold text-success">
                  {aiGenResults.generated_count} ta savol muvaffaqiyatli tuzildi
                </span>
              )}
            </div>

            {aiGenLoading ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-xs font-bold text-text-primary">Gemini AI savollar, variantlar va yechimlarni tuzmoqda...</div>
                <div className="text-[11px] text-text-secondary">Matematik formulalar LaTeX formatida qayta ishlanmoqda</div>
              </div>
            ) : !aiGenResults?.questions?.length ? (
              <div className="p-16 text-center text-xs text-text-secondary font-semibold">
                Chap tomondagi parametrlarni kiritib "AI Savollarni Yaratish" tugmasini bosing.
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto admin-scroll space-y-3">
                {aiGenResults.questions.map((q, idx) => (
                  <div key={idx} className="p-4 rounded-2xl border border-edge bg-surface-2 space-y-2.5 text-xs">
                    <div className="font-bold text-text-primary flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-accent/20 text-accent flex items-center justify-center text-[10px] shrink-0">{idx + 1}</span>
                      <span className="whitespace-pre-wrap">{q.text || q.question}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {(q.options || []).map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correct_answer;
                        return (
                          <div key={oIdx} className={`p-2 rounded-xl border text-[11px] font-semibold ${
                            isCorrect ? 'bg-success/10 border-success/30 text-success' : 'bg-surface-1 border-edge text-text-secondary'
                          }`}>
                            <span className="font-bold mr-1">{String.fromCharCode(65 + oIdx)})</span>
                            <span>{opt}</span>
                            {isCorrect && <span className="ml-1 text-[10px] font-bold">✓ (To‘g‘ri)</span>}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-2 p-2.5 rounded-xl bg-surface-1 border border-edge text-[11px] text-text-secondary">
                        <strong className="text-accent font-bold">Yechim / Tushuntirish:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 2-TAB: AI APELLYATSIYA MODERATORI */}
      {aiStudioTab === 'appeal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="admin-card p-5 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">Apellyatsiya Matni va Shikoyat</div>
            <form onSubmit={handleModerateAppeal} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-text-secondary">Savol Matni:</label>
                <textarea
                  rows={3}
                  required
                  value={aiAppealQText}
                  onChange={e => setAiAppealQText(e.target.value)}
                  placeholder="E'tiroz bildirilayotgan savol matnini kiriting..."
                  className="mt-1 w-full admin-input p-3 text-xs rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['A', 'B', 'C', 'D'].map((letter, i) => (
                  <div key={letter}>
                    <label className="font-bold text-text-secondary">Variant {letter}:</label>
                    <input
                      type="text"
                      value={aiAppealOpts[i] || ''}
                      onChange={e => {
                        const copy = [...aiAppealOpts];
                        copy[i] = e.target.value;
                        setAiAppealOpts(copy);
                      }}
                      placeholder={`Variant ${letter}`}
                      className="mt-1 w-full admin-input h-8 px-2 text-xs rounded-lg"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="font-bold text-text-secondary">O‘quvchi Tanlagan Javob:</label>
                <input
                  type="text"
                  value={aiAppealAnswer}
                  onChange={e => setAiAppealAnswer(e.target.value)}
                  placeholder="Masalan: B yoki 12 sm²"
                  className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary">O‘quvchining E'tirozi (Shikoyat Sababi):</label>
                <textarea
                  rows={3}
                  required
                  value={aiAppealReason}
                  onChange={e => setAiAppealReason(e.target.value)}
                  placeholder="O'quvchi nega o'z javobini to'g'ri deb hisoblayapti..."
                  className="mt-1 w-full admin-input p-3 text-xs rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={aiAppealLoading}
                className="w-full btn-primary rounded-xl py-3 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Icon name="shield" size={14} />
                <span>{aiAppealLoading ? 'Gemini AI tahlil qilmoqda...' : 'AI Akademik Hakamlik Tahlili'}</span>
              </button>
            </form>
          </section>

          {/* AI Hakamlik Xulosasi */}
          <section className="admin-card p-5 space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">AI Hakamlik Xulosasi & Tavsiya</div>
            {aiAppealLoading ? (
              <div className="p-16 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-xs font-bold text-text-primary">Savol va apellyatsiya ilmiy jihatdan tahlil qilinmoqda...</div>
              </div>
            ) : !aiAppealResults ? (
              <div className="p-16 text-center text-xs text-text-secondary font-semibold">
                Chap tomondagi ma'lumotlarni to'ldirib "AI Akademik Hakamlik Tahlili" tugmasini bosing.
              </div>
            ) : (
              <div className="space-y-3.5 text-xs">
                <div className={`p-4 rounded-2xl border ${
                  aiAppealResults.decision === 'approved'
                    ? 'bg-success/10 border-success/30 text-success'
                    : aiAppealResults.decision === 'rejected'
                    ? 'bg-error/10 border-error/30 text-error'
                    : 'bg-warning/10 border-warning/30 text-warning'
                }`}>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <Icon name={aiAppealResults.decision === 'approved' ? 'check-circle' : 'alert-circle'} size={18} />
                    <span>{aiAppealResults.verdict_title || 'Tahlil Xulosasi'}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-wider">
                    Qaror: {aiAppealResults.decision === 'approved' ? 'Apellyatsiya qanoatlantirilsin' : aiAppealResults.decision === 'rejected' ? 'Shikoyat asossiz (Rad etilsin)' : 'Savolda noaniqlik mavjud'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-surface-2 border border-edge space-y-2">
                  <div className="font-bold text-text-primary">Ilmiy & Akademik Tahlil:</div>
                  <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {aiAppealResults.scientific_analysis}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-accent/10 border border-accent/30 space-y-1 text-accent">
                  <div className="font-bold text-xs flex items-center gap-1.5">
                    <Icon name="info" size={14} />
                    <span>Adminga Tavsiya Etilgan Harakat:</span>
                  </div>
                  <p className="text-xs font-semibold text-text-primary mt-1">
                    {aiAppealResults.recommended_action}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 3-TAB: LLM TOKEN & XARAJATLAR */}
      {aiStudioTab === 'metrics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="admin-card p-4 space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase">Jami AI Savollari</div>
              <div className="text-2xl font-bold text-text-primary">{aiMetricsData?.total_ai_questions || 0} ta</div>
              <div className="text-[10px] text-text-secondary">Platformadagi barcha AI testlar</div>
            </div>
            <div className="admin-card p-4 space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase">Taxminiy AI So‘rovlari</div>
              <div className="text-2xl font-bold text-accent">{aiMetricsData?.estimated_total_api_calls || 0} ta</div>
              <div className="text-[10px] text-text-secondary">Mashq, test va tahlillar</div>
            </div>
            <div className="admin-card p-4 space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase">Ishlatilgan Tokenlar</div>
              <div className="text-2xl font-bold text-sky-500">{((aiMetricsData?.estimated_total_tokens || 0) / 1000).toFixed(1)}k</div>
              <div className="text-[10px] text-text-secondary">Prompt + Completion tokenlar</div>
            </div>
            <div className="admin-card p-4 space-y-1">
              <div className="text-[10px] font-bold text-text-secondary uppercase">Taxminiy Xarajat</div>
              <div className="text-2xl font-bold text-success">${aiMetricsData?.estimated_cost_usd || 0} USD</div>
              <div className="text-[10px] text-text-secondary">Gemini Flash narxlari bo‘yicha</div>
            </div>
          </div>

          <section className="admin-card p-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">Faol Gemini Modellari</div>
            <div className="flex flex-wrap gap-2">
              {(aiMetricsData?.active_models || ['gemini-2.5-flash', 'gemini-2.0-flash']).map(m => (
                <div key={m} className="px-3 py-1.5 rounded-xl bg-surface-2 border border-edge text-xs font-bold text-text-primary flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );

  // ─── Promokodlar Handlerlari ───
  const handleLoadPromocodes = () => {
    setPromocodesLoading(true);
    OlympyApi.getAdminPromocodes(OlympyApi.getToken())
      .then(res => setPromocodesList(res?.promocodes || []))
      .catch(err => showToast(toUserMessage(err, 'Promokodlarni yuklab bo‘lmadi'), 'error'))
      .finally(() => setPromocodesLoading(false));
  };

  const handleCreatePromocode = (e) => {
    e.preventDefault();
    if (!promoCodeText.trim()) return;
    setPromoCreating(true);
    OlympyApi.createAdminPromocode({
      code: promoCodeText.trim().toUpperCase(),
      description: promoDesc.trim(),
      discount_type: promoType,
      discount_value: promoValue,
      max_uses: promoMaxUses ? Number(promoMaxUses) : null,
      valid_until: promoValidUntil ? new Date(promoValidUntil).toISOString() : null,
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Promokod yaratildi');
        setShowCreatePromoModal(false);
        setPromoCodeText('');
        setPromoDesc('');
        setPromoValue('20');
        setPromoMaxUses('');
        setPromoValidUntil('');
        handleLoadPromocodes();
      })
      .catch(err => showToast(toUserMessage(err, 'Promokod yaratishda xatolik'), 'error'))
      .finally(() => setPromoCreating(false));
  };

  const handleTogglePromo = (promoId) => {
    OlympyApi.toggleAdminPromocode(promoId, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Promokod holati o‘zgardi');
        handleLoadPromocodes();
      })
      .catch(err => showToast(toUserMessage(err, 'O‘zgartirib bo‘lmadi'), 'error'));
  };

  const handleDeletePromo = (promoId) => {
    if (!window.confirm('Haqiqatan ham bu promokodni o‘chirmoqchimisiz?')) return;
    OlympyApi.deleteAdminPromocode(promoId, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Promokod o‘chirildi');
        handleLoadPromocodes();
      })
      .catch(err => showToast(toUserMessage(err, 'O‘chirib bo‘lmadi'), 'error'));
  };

  const renderPromocodes = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Promokodlar va Marketing</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            Chegirmali promokodlar yaratish, foydalanish limitlari va marketing kampaniyalari.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreatePromoModal(true)}
          className="btn-primary px-4 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm"
        >
          <Icon name="plus" size={14} />
          <span>Yangi Promokod</span>
        </button>
      </div>

      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[800px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3.5">Kod</th>
                <th className="px-5 py-3.5">Chegirma</th>
                <th className="px-5 py-3.5">Limit</th>
                <th className="px-5 py-3.5">Ishlatildi</th>
                <th className="px-5 py-3.5">Muddat</th>
                <th className="px-5 py-3.5">Holat</th>
                <th className="px-5 py-3.5 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {promocodesList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-xs font-semibold text-text-secondary">
                    {promocodesLoading ? 'Yuklanmoqda...' : 'Hozircha hech qanday promokod yaratilmagan.'}
                  </td>
                </tr>
              ) : (
                promocodesList.map(p => (
                  <tr key={p.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4">
                      <div className="font-bold text-accent font-mono text-sm">{p.code}</div>
                      {p.description && <div className="text-[10px] text-text-secondary">{p.description}</div>}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {p.discount_value}{p.discount_type === 'percent' ? '%' : ' UZS'}
                    </td>
                    <td className="px-5 py-4 font-semibold text-text-secondary">
                      {p.max_uses ? `${p.max_uses} ta` : 'Cheksiz'}
                    </td>
                    <td className="px-5 py-4 font-bold text-text-primary">
                      {p.used_count} ta
                    </td>
                    <td className="px-5 py-4 text-text-secondary text-[11px]">
                      {p.valid_until ? new Date(p.valid_until).toLocaleDateString() : 'Cheksiz'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.is_active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                      }`}>
                        {p.is_active ? 'Faol' : 'To‘xtatilgan'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePromo(p.id)}
                          className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-bold border border-edge"
                        >
                          {p.is_active ? 'To‘xtatish' : 'Faollashtirish'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePromo(p.id)}
                          className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-bold text-error border border-error/30 hover:bg-error/10"
                        >
                          O‘chirish
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Promokod Yaratish Modali */}
      <Modal open={showCreatePromoModal} onClose={() => setShowCreatePromoModal(false)} title="Yangi Promokod Yaratish">
        <form onSubmit={handleCreatePromocode} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-text-secondary">Promokod Kodi (KATTA HARFLARDA):</label>
            <input
              type="text"
              required
              value={promoCodeText}
              onChange={e => setPromoCodeText(e.target.value.toUpperCase())}
              placeholder="Masalan: OLYMPY50"
              className="mt-1 w-full admin-input h-9 px-3 text-xs font-mono font-bold rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-text-secondary">Tavsif (ixtiyoriy):</label>
            <input
              type="text"
              value={promoDesc}
              onChange={e => setPromoDesc(e.target.value)}
              placeholder="Masalan: Navro'z bayrami aksiyasi"
              className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-text-secondary">Chegirma Turi:</label>
              <select
                value={promoType}
                onChange={e => setPromoType(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-2 text-xs rounded-xl"
              >
                <option value="percent">Foiz (%)</option>
                <option value="fixed">Qat'iy Summa (UZS)</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-text-secondary">Chegirma Miqdori:</label>
              <input
                type="number"
                required
                min="1"
                value={promoValue}
                onChange={e => setPromoValue(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-text-secondary">Maksimal Ishlatish Soni:</label>
              <input
                type="number"
                value={promoMaxUses}
                onChange={e => setPromoMaxUses(e.target.value)}
                placeholder="Bo'sh bo'lsa cheksiz"
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-text-secondary">Amal Qilish Muddati:</label>
              <input
                type="date"
                value={promoValidUntil}
                onChange={e => setPromoValidUntil(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowCreatePromoModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={promoCreating}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {promoCreating ? 'Yaratilmoqda...' : 'Promokodni Saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );

  // ─── Tizim Holati & DevOps Handlerlari ───
  const handleLoadSystemHealth = () => {
    setSystemHealthLoading(true);
    OlympyApi.getAdminSystemHealth(OlympyApi.getToken())
      .then(res => setSystemHealthData(res))
      .catch(err => showToast(toUserMessage(err, 'Tizim holatini yuklab bo‘lmadi'), 'error'))
      .finally(() => setSystemHealthLoading(false));

    setSystemConfigLoading(true);
    OlympyApi.getAdminSystemConfig(OlympyApi.getToken())
      .then(res => setSystemConfigData(res?.config))
      .catch(err => showToast(toUserMessage(err, 'Konfiguratsiyani yuklab bo‘lmadi'), 'error'))
      .finally(() => setSystemConfigLoading(false));
  };

  const handlePurgeCache = () => {
    if (!window.confirm('Barcha Redis va Django keshini tozalashni xohlaysizmi?')) return;
    setPurgeCacheLoading(true);
    OlympyApi.purgeAdminSystemCache(OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Kesh tozalandi');
        handleLoadSystemHealth();
      })
      .catch(err => showToast(toUserMessage(err, 'Keshni tozalashda xatolik'), 'error'))
      .finally(() => setPurgeCacheLoading(false));
  };

  const handleSaveSystemConfig = (e) => {
    e.preventDefault();
    if (!systemConfigData) return;
    setSystemConfigSaving(true);
    OlympyApi.updateAdminSystemConfig(systemConfigData, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Konfiguratsiya saqlandi');
        handleLoadSystemHealth();
      })
      .catch(err => showToast(toUserMessage(err, 'Saqlab bo‘lmadi'), 'error'))
      .finally(() => setSystemConfigSaving(false));
  };

  const renderSystemHealth = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary flex items-center gap-2">
            <span>Tizim Salomatligi va Dynamic Config</span>
            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
          </h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            Server resurslari, ma'lumotlar bazasi, Redis kesh holati va texnik ishlar rejimini boshqarish.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={purgeCacheLoading}
            onClick={handlePurgeCache}
            className="btn-ghost px-3.5 py-2 text-xs font-bold rounded-xl border border-warning/40 text-warning hover:bg-warning/10 inline-flex items-center gap-1.5"
          >
            <Icon name="trash-2" size={13} />
            <span>{purgeCacheLoading ? 'Tozalanmoqda...' : 'Keshni Tozalash (Purge Cache)'}</span>
          </button>
          <button
            type="button"
            onClick={handleLoadSystemHealth}
            className="btn-primary px-3.5 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={13} />
            <span>Yangilash</span>
          </button>
        </div>
      </div>

      {/* Salomatlik Metriklari */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Ma'lumotlar Bazasi</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-xl font-bold text-text-primary capitalize">{systemHealthData?.services?.database?.status || 'Healthy'}</span>
          </div>
          <div className="text-[10px] text-text-secondary font-mono">
            Latency: {systemHealthData?.services?.database?.latency_ms || 1.2} ms ({systemHealthData?.services?.database?.engine || 'PostgreSQL'})
          </div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Redis & Kesh</div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-xl font-bold text-text-primary capitalize">{systemHealthData?.services?.cache?.status || 'Healthy'}</span>
          </div>
          <div className="text-[10px] text-text-secondary font-mono">
            Latency: {systemHealthData?.services?.cache?.latency_ms || 0.8} ms
          </div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Bugungi Urinishlar</div>
          <div className="text-2xl font-bold text-accent">{systemHealthData?.workload?.today_attempts || 0} ta</div>
          <div className="text-[10px] text-text-secondary">Jami: {systemHealthData?.workload?.total_attempts || 0} ta test</div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Server Muhiti</div>
          <div className="text-xl font-bold text-text-primary font-mono">Python {systemHealthData?.environment?.python_version || '3.14'}</div>
          <div className="text-[10px] text-text-secondary">{systemHealthData?.environment?.server_time || 'Server Time'}</div>
        </div>
      </div>

      {/* Dynamic Feature Flags & Maintenance Mode */}
      <section className="admin-card p-5 space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center justify-between">
          <span>Dinamik Sozlamalar & Feature Flags (Zero-downtime)</span>
          {systemConfigData?.updated_at && (
            <span className="text-[10px] font-mono text-text-secondary">Oxirgi yangilanish: {new Date(systemConfigData.updated_at).toLocaleString()}</span>
          )}
        </div>

        {systemConfigData && (
          <form onSubmit={handleSaveSystemConfig} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Maintenance Mode */}
              <div className={`p-4 rounded-2xl border ${
                systemConfigData.is_maintenance_mode ? 'bg-error/10 border-error/30' : 'bg-surface-2 border-edge'
              } space-y-2`}>
                <div className="flex items-center justify-between">
                  <div className="font-bold text-text-primary">Texnik Ishlar Rejimi (Maintenance Mode)</div>
                  <input
                    type="checkbox"
                    checked={systemConfigData.is_maintenance_mode || false}
                    onChange={e => setSystemConfigData({ ...systemConfigData, is_maintenance_mode: e.target.checked })}
                    className="w-4 h-4 rounded border-edge text-error focus:ring-error"
                  />
                </div>
                <p className="text-[11px] text-text-secondary">
                  Yoqilganda oddiy foydalanuvchilarga "Texnik ishlar ketmoqda" xabari ko'rinadi.
                </p>
                {systemConfigData.is_maintenance_mode && (
                  <textarea
                    rows={2}
                    value={systemConfigData.maintenance_message || ''}
                    onChange={e => setSystemConfigData({ ...systemConfigData, maintenance_message: e.target.value })}
                    placeholder="Texnik ishlar sababli xabar matni..."
                    className="w-full admin-input p-2 text-xs rounded-xl mt-1"
                  />
                )}
              </div>

              {/* Ro'yxatdan o'tish ruxsati */}
              <div className="p-4 rounded-2xl bg-surface-2 border border-edge space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-text-primary">Yangi Foydalanuvchilar Ro‘yxatdan O‘tishi</div>
                  <input
                    type="checkbox"
                    checked={systemConfigData.allow_registrations !== false}
                    onChange={e => setSystemConfigData({ ...systemConfigData, allow_registrations: e.target.checked })}
                    className="w-4 h-4 rounded border-edge text-accent focus:ring-accent"
                  />
                </div>
                <p className="text-[11px] text-text-secondary">
                  O'chirilganda yangi o'quvchilar ro'yxatdan o'ta olmaydi (masalan, serverga yuklama yuqori bo'lganda).
                </p>
              </div>

              {/* Standart AI Modeli */}
              <div className="p-4 rounded-2xl bg-surface-2 border border-edge space-y-2">
                <div className="font-bold text-text-primary">Birlamchi AI Modeli (Gemini)</div>
                <select
                  value={systemConfigData.default_ai_model || 'gemini-2.5-flash'}
                  onChange={e => setSystemConfigData({ ...systemConfigData, default_ai_model: e.target.value })}
                  className="w-full admin-input h-9 px-3 text-xs rounded-xl"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Tez & Tejamkor - Tavsiya etiladi)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Eng yuqori aniqlik)</option>
                  <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Ultra-tez)</option>
                </select>
                <p className="text-[11px] text-text-secondary">
                  Barcha AI mashqlar va savol generatsiyalari uchun birlamchi model.
                </p>
              </div>

              {/* Global Proktoring */}
              <div className="p-4 rounded-2xl bg-surface-2 border border-edge space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-text-primary">Global Webkamera Proktoring Ruxsati</div>
                  <input
                    type="checkbox"
                    checked={systemConfigData.camera_proctoring_global !== false}
                    onChange={e => setSystemConfigData({ ...systemConfigData, camera_proctoring_global: e.target.checked })}
                    className="w-4 h-4 rounded border-edge text-accent focus:ring-accent"
                  />
                </div>
                <p className="text-[11px] text-text-secondary">
                  Butun platforma bo'ylab kamera va yuz monitoringi faoliyatini global nazorat qilish.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={systemConfigSaving}
              className="btn-primary px-6 py-3 rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {systemConfigSaving ? 'Saqlanmoqda...' : 'Sozlamalarni Saqlash'}
            </button>
          </form>
        )}
      </section>
    </div>
  );

  // ─── Plagiat & Print Handlerlari ───
  const handleOpenPlagiarism = (olympiad) => {
    setPlagiarismOlympiad(olympiad);
    setShowPlagiarismModal(true);
    setPlagiarismLoading(true);
    setPlagiarismData(null);
    OlympyApi.getAdminOlympiadPlagiarism(olympiad.id, OlympyApi.getToken())
      .then(res => setPlagiarismData(res))
      .catch(err => showToast(toUserMessage(err, 'Plagiat ma‘lumotlarini yuklab bo‘lmadi'), 'error'))
      .finally(() => setPlagiarismLoading(false));
  };

  const handleOpenPrintable = (olympiad) => {
    setPrintOlympiad(olympiad);
    setShowPrintModal(true);
    setPrintLoading(true);
    setPrintData(null);
    setPrintViewType('booklet');
    OlympyApi.getAdminOlympiadPrintable(olympiad.id, OlympyApi.getToken())
      .then(res => setPrintData(res))
      .catch(err => showToast(toUserMessage(err, 'Chop etish ma‘lumotlarini yuklab bo‘lmadi'), 'error'))
      .finally(() => setPrintLoading(false));
  };

  // ─── 1. Xabarnomalar (Broadcasts) Handlerlari ───
  const handleLoadBroadcasts = () => {
    setBroadcastsLoading(true);
    OlympyApi.getAdminBroadcasts(OlympyApi.getToken())
      .then(res => setBroadcastsList(res?.broadcasts || []))
      .catch(err => showToast(toUserMessage(err, 'Xabarnomalarni yuklab bo‘lmadi'), 'error'))
      .finally(() => setBroadcastsLoading(false));
  };

  const handleCreateBroadcast = (e) => {
    e.preventDefault();
    if (!bcTitle.trim() || !bcMessage.trim()) return;
    setBcSending(true);
    OlympyApi.createAdminBroadcast({
      title: bcTitle.trim(),
      message: bcMessage.trim(),
      target_audience: bcTarget,
      send_telegram: bcSendTelegram,
      send_in_app: bcSendInApp,
      send_now: true,
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Xabar muvaffaqiyatli yuborildi');
        setShowCreateBroadcastModal(false);
        setBcTitle('');
        setBcMessage('');
        handleLoadBroadcasts();
      })
      .catch(err => showToast(toUserMessage(err, 'Xabar yuborishda xatolik'), 'error'))
      .finally(() => setBcSending(false));
  };

  const handleDeleteBroadcast = (bId) => {
    if (!window.confirm('Bu xabarnomani o‘chirmoqchimisiz?')) return;
    OlympyApi.deleteAdminBroadcast(bId, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'O‘chirildi');
        handleLoadBroadcasts();
      })
      .catch(err => showToast(toUserMessage(err, 'O‘chirib bo‘lmadi'), 'error'));
  };

  const renderBroadcasts = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Ommaviy Xabarnomalar va Push Kampaniyalari</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            Foydalanuvchilar segmentlariga In-App va Telegram bot orqali tezkor xabarnomalar yuborish.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadBroadcasts}
            className="btn-ghost px-3.5 py-2 text-xs font-bold rounded-xl border border-edge inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={13} />
            <span>Yangilash</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateBroadcastModal(true)}
            className="btn-primary px-4 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="plus" size={14} />
            <span>Yangi Xabar Yuborish</span>
          </button>
        </div>
      </div>

      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[800px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                <th className="px-5 py-3.5">Sarlavha & Matn</th>
                <th className="px-5 py-3.5">Auditoriya</th>
                <th className="px-5 py-3.5">Kanallar</th>
                <th className="px-5 py-3.5">Yetkazildi</th>
                <th className="px-5 py-3.5">Sana</th>
                <th className="px-5 py-3.5 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {broadcastsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-xs font-semibold text-text-secondary">
                    {broadcastsLoading ? 'Yuklanmoqda...' : 'Hozircha hech qanday ommaviy xabarnoma yuborilmagan.'}
                  </td>
                </tr>
              ) : (
                broadcastsList.map(b => (
                  <tr key={b.id} className="text-xs admin-table-row text-text-primary">
                    <td className="px-5 py-4 max-w-sm">
                      <div className="font-bold text-text-primary text-sm">{b.title}</div>
                      <div className="text-[11px] text-text-secondary line-clamp-2 mt-0.5">{b.message}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-accent/15 text-accent">
                        {b.target_label || b.target_audience}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[11px] text-text-secondary font-semibold">
                      {b.send_in_app && '🔔 In-App'} {b.send_telegram && '✈️ Telegram'}
                    </td>
                    <td className="px-5 py-4 font-bold text-success">
                      {b.sent_count} ta hisob
                    </td>
                    <td className="px-5 py-4 text-text-secondary text-[11px]">
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-bold text-error border border-error/30 hover:bg-error/10"
                      >
                        O‘chirish
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Xabar Yaratish Modali */}
      <Modal open={showCreateBroadcastModal} onClose={() => setShowCreateBroadcastModal(false)} title="Ommaviy Xabarnoma Yuborish">
        <form onSubmit={handleCreateBroadcast} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-text-secondary">Xabar Sarlavhasi:</label>
            <input
              type="text"
              required
              value={bcTitle}
              onChange={e => setBcTitle(e.target.value)}
              placeholder="Masalan: Bahor Olimpiadasi boshlandi!"
              className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
            />
          </div>
          <div>
            <label className="font-bold text-text-secondary">Xabar Matni:</label>
            <textarea
              required
              rows={4}
              value={bcMessage}
              onChange={e => setBcMessage(e.target.value)}
              placeholder="Barcha foydalanuvchilar ekranida ko'rinadigan xabarnoma matni..."
              className="mt-1 w-full admin-input p-3 text-xs rounded-xl"
            />
          </div>
          <div>
            <label className="font-bold text-text-secondary">Maqsadli Auditoriya:</label>
            <select
              value={bcTarget}
              onChange={e => setBcTarget(e.target.value)}
              className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
            >
              <option value="all">Barcha foydalanuvchilar (Global)</option>
              <option value="pro_users">Faqat PRO (Obunachi) foydalanuvchilar</option>
              <option value="inactive_7d">Oxirgi 7 kunda kirmaganlar (Retention)</option>
              <option value="students">Faqat O‘quvchilar</option>
              <option value="teachers">Faqat O‘qituvchilar</option>
              <option value="center_owners">Faqat Markaz egalari</option>
            </select>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-text-secondary">
              <input
                type="checkbox"
                checked={bcSendInApp}
                onChange={e => setBcSendInApp(e.target.checked)}
                className="w-4 h-4 rounded text-accent"
              />
              <span>Platforma ichida (In-App)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-text-secondary">
              <input
                type="checkbox"
                checked={bcSendTelegram}
                onChange={e => setBcSendTelegram(e.target.checked)}
                className="w-4 h-4 rounded text-accent"
              />
              <span>Telegram Bot orqali</span>
            </label>
          </div>
          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={() => setShowCreateBroadcastModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={bcSending}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {bcSending ? 'Yuborilmoqda...' : 'Xabarni Tarqatish'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );

  // ─── 4. Mukofotlar & Fulfillment Handlerlari ───
  const handleLoadRewards = () => {
    setRewardsLoading(true);
    OlympyApi.getAdminRewardProducts(OlympyApi.getToken())
      .then(res => setRewardsList(res?.products || []))
      .catch(err => showToast(toUserMessage(err, 'Mukofotlarni yuklab bo‘lmadi'), 'error'))
      .finally(() => setRewardsLoading(false));

    setRedemptionsLoading(true);
    OlympyApi.getAdminRewardRedemptions(OlympyApi.getToken())
      .then(res => setRedemptionsList(res?.redemptions || []))
      .catch(err => showToast(toUserMessage(err, 'Buyurtmalarni yuklab bo‘lmadi'), 'error'))
      .finally(() => setRedemptionsLoading(false));
  };

  const handleCreateReward = (e) => {
    e.preventDefault();
    if (!rewardTitle.trim()) return;
    setRewardCreating(true);
    OlympyApi.createAdminRewardProduct({
      title: rewardTitle.trim(),
      description: rewardDesc.trim(),
      coin_cost: Number(rewardCost),
      stock: Number(rewardStock),
      icon: rewardIcon.trim() || '🎁',
    }, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Mahsulot qo‘shildi');
        setShowCreateRewardModal(false);
        setRewardTitle('');
        setRewardDesc('');
        handleLoadRewards();
      })
      .catch(err => showToast(toUserMessage(err, 'Mahsulot yaratishda xatolik'), 'error'))
      .finally(() => setRewardCreating(false));
  };

  const handleToggleReward = (pId) => {
    OlympyApi.toggleAdminRewardProduct(pId, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Holat o‘zgardi');
        handleLoadRewards();
      })
      .catch(err => showToast(toUserMessage(err, 'O‘zgartirib bo‘lmadi'), 'error'));
  };

  const handleDeleteReward = (pId) => {
    if (!window.confirm('Bu mahsulotni o‘chirmoqchimisiz?')) return;
    OlympyApi.deleteAdminRewardProduct(pId, OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'O‘chirildi');
        handleLoadRewards();
      })
      .catch(err => showToast(toUserMessage(err, 'O‘chirib bo‘lmadi'), 'error'));
  };

  const handleFulfillRedemption = (rId) => {
    OlympyApi.updateAdminRedemptionStatus(rId, 'delivered', OlympyApi.getToken())
      .then(res => {
        showToast(res?.message || 'Topshirildi');
        handleLoadRewards();
      })
      .catch(err => showToast(toUserMessage(err, 'Yangilab bo‘lmadi'), 'error'));
  };

  const renderRewardsShop = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Mukofotlar Do‘koni & Fulfillment</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            O‘quvchilar tangalari evaziga sovg‘alar (Merch, Kitoblar, Futbolkalar) va yetkazib berish nazorati.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-surface-2 p-1 border border-edge text-xs font-bold">
            <button
              type="button"
              onClick={() => setRewardsTab('products')}
              className={`px-3 py-1.5 rounded-lg transition ${rewardsTab === 'products' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Sovg‘alar ({rewardsList.length})
            </button>
            <button
              type="button"
              onClick={() => setRewardsTab('orders')}
              className={`px-3 py-1.5 rounded-lg transition ${rewardsTab === 'orders' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Buyurtmalar ({redemptionsList.length})
            </button>
          </div>
          {rewardsTab === 'products' && (
            <button
              type="button"
              onClick={() => setShowCreateRewardModal(true)}
              className="btn-primary px-4 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm"
            >
              <Icon name="plus" size={14} />
              <span>Yangi Sovg‘a</span>
            </button>
          )}
        </div>
      </div>

      {rewardsTab === 'products' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewardsList.length === 0 ? (
            <div className="col-span-full admin-card p-12 text-center text-xs font-semibold text-text-secondary">
              {rewardsLoading ? 'Yuklanmoqda...' : 'Hozircha hech qanday sovg‘a qo‘shilmagan.'}
            </div>
          ) : (
            rewardsList.map(p => (
              <div key={p.id} className="admin-card p-4 space-y-3 relative group">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-edge flex items-center justify-center text-2xl">
                    {p.icon || '🎁'}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    p.is_active ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                  }`}>
                    {p.is_active ? 'Faol' : 'To‘xtatilgan'}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-text-primary text-sm">{p.title}</h3>
                  {p.description && <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-edge">
                  <div className="font-bold text-accent flex items-center gap-1">
                    <span>🪙</span>
                    <span>{p.coin_cost} tanga</span>
                  </div>
                  <div className="text-[11px] text-text-secondary font-semibold">
                    Qoldiq: <span className="font-bold text-text-primary">{p.stock} ta</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleToggleReward(p.id)}
                    className="btn-ghost flex-1 py-1.5 rounded-xl text-[11px] font-bold border border-edge"
                  >
                    {p.is_active ? 'To‘xtatish' : 'Faollashtirish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteReward(p.id)}
                    className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-bold text-error border border-error/30 hover:bg-error/10"
                  >
                    O‘chirish
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <section className="overflow-hidden admin-card">
          <div className="overflow-x-auto admin-scroll">
            <table className="w-full min-w-[800px] text-left">
              <thead className="admin-table-hdr">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                  <th className="px-5 py-3.5">O‘quvchi</th>
                  <th className="px-5 py-3.5">Sovg‘a</th>
                  <th className="px-5 py-3.5">Tanga</th>
                  <th className="px-5 py-3.5">Holat</th>
                  <th className="px-5 py-3.5">Sana</th>
                  <th className="px-5 py-3.5 text-right">Amallar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {redemptionsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-xs font-semibold text-text-secondary">
                      {redemptionsLoading ? 'Yuklanmoqda...' : 'Hozircha hech qanday buyurtma kelib tushmagan.'}
                    </td>
                  </tr>
                ) : (
                  redemptionsList.map(r => (
                    <tr key={r.id} className="text-xs admin-table-row text-text-primary">
                      <td className="px-5 py-4">
                        <div className="font-bold text-text-primary">{r.user?.name}</div>
                        <div className="text-[11px] text-text-secondary font-mono">{r.user?.phone}</div>
                      </td>
                      <td className="px-5 py-4 font-bold flex items-center gap-2">
                        <span>{r.product?.icon}</span>
                        <span>{r.product?.title}</span>
                      </td>
                      <td className="px-5 py-4 font-bold text-accent font-mono">
                        🪙 {r.product?.coin_cost}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          r.status === 'delivered' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                        }`}>
                          {r.status === 'delivered' ? 'Topshirildi' : 'Kutilmoqda'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-text-secondary text-[11px]">
                        {new Date(r.redeemed_at).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {r.status !== 'delivered' && (
                          <button
                            type="button"
                            onClick={() => handleFulfillRedemption(r.id)}
                            className="btn-primary px-3 py-1.5 rounded-xl text-[11px] font-bold"
                          >
                            Topshirildi deb belgilash
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sovg'a Qo'shish Modali */}
      <Modal open={showCreateRewardModal} onClose={() => setShowCreateRewardModal(false)} title="Yangi Sovg‘a Qo‘shish">
        <form onSubmit={handleCreateReward} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-text-secondary">Sovg‘a Nomi:</label>
            <input
              type="text"
              required
              value={rewardTitle}
              onChange={e => setRewardTitle(e.target.value)}
              placeholder="Masalan: Olympy Brendli Futbolka"
              className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
            />
          </div>
          <div>
            <label className="font-bold text-text-secondary">Tavsif (ixtiyoriy):</label>
            <input
              type="text"
              value={rewardDesc}
              onChange={e => setRewardDesc(e.target.value)}
              placeholder="Masalan: 100% paxta, o'lchamlar: S, M, L, XL"
              className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-text-secondary">Tanga Narxi:</label>
              <input
                type="number"
                required
                min="1"
                value={rewardCost}
                onChange={e => setRewardCost(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-text-secondary">Ombordagi Soni:</label>
              <input
                type="number"
                required
                min="1"
                value={rewardStock}
                onChange={e => setRewardStock(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-text-secondary">Ikonka (Emoji):</label>
              <input
                type="text"
                value={rewardIcon}
                onChange={e => setRewardIcon(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs text-center rounded-xl text-lg"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={() => setShowCreateRewardModal(false)}
              className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={rewardCreating}
              className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
            >
              {rewardCreating ? 'Saqlanmoqda...' : 'Sovg‘ani Saqlash'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );

  // ─── 5. Moliya & B2B Invoys Handlerlari ───
  const handleLoadRevenue = () => {
    setRevenueLoading(true);
    OlympyApi.getAdminRevenueAnalytics(OlympyApi.getToken())
      .then(res => setRevenueData(res))
      .catch(err => showToast(toUserMessage(err, 'Moliya ma‘lumotlarini yuklab bo‘lmadi'), 'error'))
      .finally(() => setRevenueLoading(false));
  };

  const handleGenerateInvoice = (e) => {
    e.preventDefault();
    if (!invBuyerName.trim() || !invAmount) return;
    setInvGenerating(true);
    OlympyApi.generateAdminB2BInvoice({
      buyer_name: invBuyerName.trim(),
      buyer_inn: invBuyerInn.trim(),
      amount: invAmount,
      plan_name: invPlanName.trim(),
    }, OlympyApi.getToken())
      .then(res => {
        setGeneratedInvoice(res?.invoice);
        showToast('Hisob-faktura tayyorlandi!');
      })
      .catch(err => showToast(toUserMessage(err, 'Invoys yaratishda xatolik'), 'error'))
      .finally(() => setInvGenerating(false));
  };

  const renderRevenue = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-4 p-[18px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-bold leading-tight text-text-primary">Moliya va Daromad Tahlili</h1>
          <p className="mt-1 text-[11px] font-bold text-text-secondary">
            MRR, to‘lov provayderlari ulushi va B2B o‘quv markazlari uchun hisob-faktura (Invoice) generatori.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadRevenue}
            className="btn-ghost px-3.5 py-2 text-xs font-bold rounded-xl border border-edge inline-flex items-center gap-1.5"
          >
            <Icon name="refresh" size={13} />
            <span>Yangilash</span>
          </button>
          <button
            type="button"
            onClick={() => { setShowInvoiceModal(true); setGeneratedInvoice(null); }}
            className="btn-primary px-4 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm"
          >
            <Icon name="file-text" size={14} />
            <span>B2B Hisob-Faktura Chiqarish</span>
          </button>
        </div>
      </div>

      {/* Asosiy Metrikalar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Jami Tushum</div>
          <div className="text-2xl font-bold text-success">
            {Number(revenueData?.metrics?.total_revenue || 0).toLocaleString()} UZS
          </div>
          <div className="text-[10px] text-text-secondary">Barcha muvaffaqiyatli to‘lovlar</div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">Joriy Oylik MRR</div>
          <div className="text-2xl font-bold text-accent">
            {Number(revenueData?.metrics?.mrr || 0).toLocaleString()} UZS
          </div>
          <div className="text-[10px] text-text-secondary">Bu oy kutilayotgan tushum</div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">To‘lovlar Soni</div>
          <div className="text-2xl font-bold text-text-primary">
            {revenueData?.metrics?.success_count || 0} ta
          </div>
          <div className="text-[10px] text-text-secondary font-semibold">
            Muvaffaqiyatsiz: <span className="text-error">{revenueData?.metrics?.failed_count || 0} ta</span>
          </div>
        </div>

        <div className="admin-card p-4 space-y-1">
          <div className="text-[10px] font-bold text-text-secondary uppercase">O‘rtacha Chek (ARPU)</div>
          <div className="text-2xl font-bold text-sky-500">
            {Number(revenueData?.metrics?.average_check || 0).toLocaleString()} UZS
          </div>
          <div className="text-[10px] text-text-secondary">Bitta foydalanuvchiga to‘g‘ri keluvchi</div>
        </div>
      </div>

      {/* Provayderlar Taqqoslashi */}
      <section className="admin-card p-5 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-text-secondary">To‘lov Provayderlari Ulushi</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(revenueData?.by_provider || [{ provider: 'payme', total_amount: 0, transaction_count: 0 }]).map(p => (
            <div key={p.provider} className="p-4 rounded-2xl bg-surface-2 border border-edge space-y-1">
              <div className="text-xs font-bold text-text-primary uppercase flex items-center justify-between">
                <span>{p.provider}</span>
                <span className="text-[10px] text-text-secondary">{p.transaction_count} ta to‘lov</span>
              </div>
              <div className="text-lg font-bold text-accent">
                {Number(p.total_amount || 0).toLocaleString()} UZS
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* B2B Invoys Modali */}
      <Modal open={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} title="B2B Hisob-Faktura (Invoice) Generatori">
        {!generatedInvoice ? (
          <form onSubmit={handleGenerateInvoice} className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-text-secondary">Tashkilot / O‘quv Markaz Nomi:</label>
              <input
                type="text"
                required
                value={invBuyerName}
                onChange={e => setInvBuyerName(e.target.value)}
                placeholder="Masalan: «EVEREST STUDY» MCHJ"
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-bold text-text-secondary">Tashkilot INN (STIR):</label>
                <input
                  type="text"
                  value={invBuyerInn}
                  onChange={e => setInvBuyerInn(e.target.value)}
                  placeholder="Masalan: 309123456"
                  className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary">Hisob-Faktura Summasi (UZS):</label>
                <input
                  type="number"
                  required
                  min="1000"
                  value={invAmount}
                  onChange={e => setInvAmount(e.target.value)}
                  className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl font-bold"
                />
              </div>
            </div>
            <div>
              <label className="font-bold text-text-secondary">Xizmat / Tarif Nomi:</label>
              <input
                type="text"
                value={invPlanName}
                onChange={e => setInvPlanName(e.target.value)}
                className="mt-1 w-full admin-input h-9 px-3 text-xs rounded-xl"
              />
            </div>
            <div className="flex gap-2 pt-3">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(false)}
                className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={invGenerating}
                className="btn-primary flex-1 rounded-xl py-3 text-xs font-bold disabled:opacity-50"
              >
                {invGenerating ? 'Yaratilmoqda...' : 'Invoysni Generatsiya Qilish'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="p-5 rounded-2xl bg-white text-gray-900 border border-gray-200 shadow-sm space-y-4 print:p-0 print:border-none">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <h2 className="text-xl font-extrabold text-indigo-700 tracking-wide">OLYMPY EDTECH</h2>
                  <div className="text-[10px] text-gray-500 font-medium">Elektron Ta'lim va Olimpiadalar Tizimi</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gray-800 font-mono">{generatedInvoice.invoice_number}</div>
                  <div className="text-[10px] text-gray-500">Sana: {generatedInvoice.issued_at}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[11px]">
                <div className="p-3 bg-gray-50 rounded-xl space-y-1 border">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Ijrochi (Sotuvchi):</div>
                  <div className="font-bold text-gray-900">{generatedInvoice.seller?.name}</div>
                  <div>INN: {generatedInvoice.seller?.inn} | MFO: {generatedInvoice.seller?.mfo}</div>
                  <div className="font-mono text-[10px]">H/R: {generatedInvoice.seller?.account}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl space-y-1 border">
                  <div className="text-[10px] font-bold uppercase text-gray-500">Buyurtmachi (Xaridor):</div>
                  <div className="font-bold text-gray-900">{generatedInvoice.buyer_name}</div>
                  <div>INN: {generatedInvoice.buyer_inn}</div>
                  <div className="text-amber-600 font-semibold">To‘lov muddati: {generatedInvoice.due_date} gacha</div>
                </div>
              </div>

              <table className="w-full border-collapse border border-gray-200 text-left text-[11px]">
                <thead className="bg-gray-100 font-bold text-gray-700">
                  <tr>
                    <th className="border p-2">№</th>
                    <th className="border p-2">Xizmat tavsifi</th>
                    <th className="border p-2 text-right">Summa (UZS)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border p-2">1</td>
                    <td className="border p-2 font-semibold">{generatedInvoice.plan_name}</td>
                    <td className="border p-2 text-right font-bold font-mono">
                      {Number(generatedInvoice.amount).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center justify-between pt-2 border-t text-sm font-bold">
                <span>Jami To‘lov:</span>
                <span className="text-indigo-700 font-mono text-base">{Number(generatedInvoice.amount).toLocaleString()} UZS</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary flex-1 rounded-xl py-2.5 text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Icon name="printer" size={13} />
                <span>Chop etish (Print PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => setGeneratedInvoice(null)}
                className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold border border-edge"
              >
                Qaytadan yaratish
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Plagiat & Similarity Modali */}
      <Modal open={showPlagiarismModal} onClose={() => setShowPlagiarismModal(false)} title={`Plagiat & Ko‘chirish Tahlili: ${plagiarismOlympiad?.title || ''}`}>
        {plagiarismLoading ? (
          <div className="p-8 text-center text-xs font-semibold text-text-secondary">Tahlil hisoblanmoqda...</div>
        ) : !plagiarismData?.high_risk_pairs?.length ? (
          <div className="p-8 text-center space-y-2">
            <span className="text-4xl">🛡️</span>
            <h3 className="text-sm font-bold text-text-primary">Shubhali juftliklar topilmadi!</h3>
            <p className="text-xs text-text-secondary">Olimpiada ishtirokchilari o‘rtasida 75% dan yuqori g‘ayritabiiy o‘xshashlik aniqlanmadi.</p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-error flex items-center justify-between font-bold">
              <span>Jami aniqlangan shubhali juftliklar: {plagiarismData.suspicious_pairs_count} ta</span>
              <span className="text-[10px] font-mono">Baholangan testlar: {plagiarismData.total_evaluated_attempts} ta</span>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 admin-scroll">
              {plagiarismData.high_risk_pairs.map((pair, idx) => (
                <div key={pair.pair_id || idx} className="p-3 rounded-xl bg-surface-2 border border-edge space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      pair.risk_level === 'CRITICAL' ? 'bg-error text-white' : 'bg-warning/20 text-warning'
                    }`}>
                      {pair.risk_level} XAVF: {pair.similarity_percent}% O‘XSHASHLIK
                    </span>
                    <span className="text-[10px] font-mono text-text-secondary">
                      Bir xil xatolar: {pair.identical_wrong_count} ta | Vaqt farqi: {pair.time_difference_seconds || 0}s
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="p-2 rounded-lg bg-surface-1 border border-edge">
                      <div className="font-bold text-text-primary">{pair.user1?.name}</div>
                      <div className="text-text-secondary text-[10px]">Ball: {pair.user1?.score} | Urinish: #{pair.user1?.attempt_id}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-surface-1 border border-edge">
                      <div className="font-bold text-text-primary">{pair.user2?.name}</div>
                      <div className="text-text-secondary text-[10px]">Ball: {pair.user2?.score} | Urinish: #{pair.user2?.attempt_id}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Chop etiladigan Test Kitobchasi & OMR Modali */}
      <Modal open={showPrintModal} onClose={() => setShowPrintModal(false)} title={`Chop etish Studiyasi: ${printOlympiad?.title || ''}`}>
        {printLoading ? (
          <div className="p-8 text-center text-xs font-semibold text-text-secondary">Yuklanmoqda...</div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex rounded-xl bg-surface-2 p-1 border border-edge text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPrintViewType('booklet')}
                  className={`px-3 py-1.5 rounded-lg transition ${printViewType === 'booklet' ? 'bg-accent text-white' : 'text-text-secondary'}`}
                >
                  📖 A4 Test Kitobi
                </button>
                <button
                  type="button"
                  onClick={() => setPrintViewType('omr')}
                  className={`px-3 py-1.5 rounded-lg transition ${printViewType === 'omr' ? 'bg-accent text-white' : 'text-text-secondary'}`}
                >
                  🔘 OMR Javoblar Varaqasi
                </button>
                <button
                  type="button"
                  onClick={() => setPrintViewType('key')}
                  className={`px-3 py-1.5 rounded-lg transition ${printViewType === 'key' ? 'bg-accent text-white' : 'text-text-secondary'}`}
                >
                  🔑 Javoblar Kaliti
                </button>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Icon name="printer" size={13} />
                <span>Chop etish</span>
              </button>
            </div>

            {/* Ko'rinish Maydoni */}
            <div className="max-h-[500px] overflow-y-auto p-6 rounded-2xl bg-white text-gray-900 border border-gray-200 shadow-inner admin-scroll">
              {printViewType === 'booklet' && (
                <div className="space-y-6 text-left">
                  <div className="text-center border-b pb-4">
                    <h2 className="text-lg font-extrabold text-gray-900">{printData?.olympiad?.center_name}</h2>
                    <h3 className="text-base font-bold text-indigo-700 mt-1">{printData?.olympiad?.title} ({printData?.olympiad?.subject})</h3>
                    <div className="text-[11px] text-gray-500 mt-1">Vaqt: {printData?.olympiad?.duration_minutes} daqiqa | Jami savollar: {printData?.total_questions} ta</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[12px]">
                    {(printData?.questions || []).map(q => (
                      <div key={q.id} className="space-y-2 pb-3 border-b md:border-b-0">
                        <div className="font-bold text-gray-900 flex items-start gap-1.5">
                          <span className="text-indigo-600 font-mono">{q.number}.</span>
                          <span>{q.text}</span>
                        </div>
                        <div className="space-y-1 pl-4">
                          {q.options?.map(opt => (
                            <div key={opt.letter} className="flex items-start gap-2">
                              <span className="font-bold text-gray-700 font-mono">{opt.letter})</span>
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {printViewType === 'omr' && (
                <div className="space-y-6 text-center">
                  <div className="border-b pb-3">
                    <h2 className="text-base font-extrabold text-gray-900">RASMIY JAVOBLAR VARAQASI (OMR SHEET)</h2>
                    <p className="text-[11px] text-gray-600">{printData?.olympiad?.title} — {printData?.olympiad?.subject}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-left text-[11px] p-3 border rounded-xl bg-gray-50">
                    <div>O‘quvchi F.I.Sh: _________________________________</div>
                    <div>ID / Telefon: __________________________________</div>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 pt-2 text-[11px]">
                    {(printData?.questions || []).map(q => (
                      <div key={q.id} className="p-2 border rounded-lg bg-gray-50 flex flex-col items-center gap-1">
                        <span className="font-bold text-gray-800 font-mono">{q.number}</span>
                        <div className="flex gap-1">
                          {['A', 'B', 'C', 'D'].map(l => (
                            <span key={l} className="w-5 h-5 rounded-full border border-gray-400 flex items-center justify-center text-[9px] font-bold text-gray-600">
                              {l}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {printViewType === 'key' && (
                <div className="space-y-4 text-left">
                  <div className="border-b pb-2">
                    <h2 className="text-base font-extrabold text-gray-900">TO‘G‘RI JAVOBLAR KALITI VA YECHIMLAR</h2>
                    <p className="text-[11px] text-gray-600">{printData?.olympiad?.title}</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                    {(printData?.answer_keys || []).map(k => (
                      <div key={k.number} className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-between">
                        <span className="font-bold text-gray-700">№{k.number}:</span>
                        <span className="font-extrabold text-indigo-700 text-sm">{k.correct_letter}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  const pageRenderers = {
    home: renderHome,
    requests: renderRequests,
    centers: renderCenters,
    users: renderUsers,
    ai_studio: renderAiStudio,
    broadcasts: renderBroadcasts,
    promocodes: renderPromocodes,
    rewards_shop: renderRewardsShop,
    revenue: renderRevenue,
    olympiads: renderOlympiads,
    subjects: renderSubjects,
    analytics: renderAnalytics,
    logs: renderLogs,
    security: renderSecurity,
    system_health: renderSystemHealth,
    settings: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} onLogout={onLogout} />,
    support: renderSupport,
    myprofile: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} onLogout={onLogout} />,
  };

  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'users'),
    navItems.find(n => n.key === 'centers'),
    navItems.find(n => n.key === 'requests'),
  ].filter(Boolean);

  return (
    <div className="h-screen overflow-hidden admin-bg text-text-primary">
      {mobileMenu && <div className="fixed inset-0 z-40 bg-ground/80 lg:hidden" onClick={() => setMobileMenu(false)} />}
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
      <LiveProctorModal
        open={Boolean(liveProctorSession)}
        onClose={() => setLiveProctorSession(null)}
        sessionId={liveProctorSession?.id}
        studentName={liveProctorSession?.studentName}
        olympiadTitle={liveProctorSession?.olympiadTitle}
      />
      <ToastHost />
    </div>
  );
};

Object.assign(window, { AdminDashboard });
