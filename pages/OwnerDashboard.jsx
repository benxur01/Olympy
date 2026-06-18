// pages/OwnerDashboard.jsx — Center director panel scoped to one center

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/owner/<key>`
// manziliga bog'lanadi (home → /dashboard/owner).
// MUHIM: `analytics` ro'yxatda YO'Q — u app-level alohida sahifa
// (setPageOrSpecial → onNavigate('analytics')). `proctoring` ham YO'Q — u
// `liveOlympiadId` runtime state'iga bog'liq drill-down ko'rinish.
const OWNER_DASHBOARD_PAGES = [
  'home', 'requests', 'staff', 'students', 'olympiads', 'questionbank',
  'shop', 'statistics', 'ranking', 'center', 'premium', 'settings', 'myprofile',
];
const ownerDashUrl = makeDashboardUrlSync('/dashboard/owner', OWNER_DASHBOARD_PAGES);

const ownerFormatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
};

const OwnerStatusPill = ({ status, children }) => {
  const map = {
    approved: 'badge-approved',
    pending: 'badge-pending',
    rejected: 'badge-rejected',
    active: 'badge-active',
    draft: 'badge-draft',
  };
  return (
    <span className={`chip ${map[status] || map.draft}`}>
      {children || statusLabel(status)}
    </span>
  );
};

const OwnerMetric = ({ label, value, hint, icon, tone = 'indigo', glow }) => {
  const tones = {
    indigo: { grad: 'from-indigo-500 to-purple-600', glowCls: 'glow-purple' },
    purple: { grad: 'from-purple-500 to-pink-500', glowCls: 'glow-purple' },
    cyan: { grad: 'from-cyan-500 to-sky-500', glowCls: 'glow-cyan' },
    amber: { grad: 'from-amber-500 to-orange-500', glowCls: '' },
    emerald: { grad: 'from-emerald-500 to-teal-500', glowCls: '' },
    rose: { grad: 'from-rose-500 to-red-500', glowCls: '' },
  };
  const t = tones[tone] || tones.indigo;
  return (
    <div className={`stat-card glass-strong rounded-2xl p-5 card-hover ${glow ? t.glowCls : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`feature-icon bg-gradient-to-br ${t.grad} text-white shadow-lg`}>{icon}</div>
        {hint && <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{hint}</span>}
      </div>
      <div className="text-3xl font-black text-white mb-1 tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-white/50">{label}</div>
    </div>
  );
};

const OwnerSidebarItem = ({ item, active, onClick }) => (
  <button
    onClick={onClick}
    className={`sidebar-item w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-left ${
      active ? 'active' : ''
    }`}
  >
    <span className={`sidebar-icon transition-colors duration-200 ${active ? 'text-indigo-400' : 'text-white/40'}`}>
      <Icon name={item.icon} size={20} />
    </span>
    <span className={`text-[15px] font-semibold tracking-wide transition-colors duration-200 flex-1 ${active ? 'text-white' : 'text-white/65'}`}>
      {item.label}
    </span>
    {item.badge && (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
        active
          ? 'bg-indigo-500/20 text-indigo-300'
          : 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30'
      }`}>
        {item.badge}
      </span>
    )}
  </button>
);

const FALLBACK_ORGANIZATION_PRICING = [
  { id: 13, name: 'Standart (1 oy)', plan_type: 'organization', price: 199999, duration_days: 30, description: 'Kichik tashkilotlar uchun mos reja (1 oy)', features: ["1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], is_popular: false },
  { id: 14, name: 'Standart (3 oy)', plan_type: 'organization', price: 539999, duration_days: 90, description: 'Kichik tashkilotlar uchun mos reja (3 oy)', features: ["1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], is_popular: false },
  { id: 15, name: 'Standart (6 oy)', plan_type: 'organization', price: 959999, duration_days: 180, description: 'Kichik tashkilotlar uchun mos reja (6 oy)', features: ["1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], is_popular: false },
  { id: 16, name: 'Standart (1 yil)', plan_type: 'organization', price: 1679999, duration_days: 365, description: 'Kichik tashkilotlar uchun mos reja (1 yil)', features: ["1 ta tashkilot qo'shish", "Menejer boshqaruv paneli", "Olimpiadalar o'tkazish", "Asosiy tahlillar"], is_popular: false },

  { id: 17, name: 'Plus (1 oy)', plan_type: 'organization', price: 399999, duration_days: 30, description: 'O\'sib borayotgan tashkilotlar uchun (1 oy)', features: ["Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], is_popular: true },
  { id: 18, name: 'Plus (3 oy)', plan_type: 'organization', price: 1079999, duration_days: 90, description: 'O\'sib borayotgan tashkilotlar uchun (3 oy)', features: ["Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], is_popular: true },
  { id: 19, name: 'Plus (6 oy)', plan_type: 'organization', price: 1919999, duration_days: 180, description: 'O\'sib borayotgan tashkilotlar uchun (6 oy)', features: ["Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], is_popular: true },
  { id: 20, name: 'Plus (1 yil)', plan_type: 'organization', price: 3359999, duration_days: 365, description: 'O\'sib borayotgan tashkilotlar uchun (1 yil)', features: ["Standart reja imkoniyatlari", "PDF hisobotlarni yuklash", "AI savollar generatori", "Batafsil tahlillar", "Telegram bot integratsiyasi"], is_popular: true },

  { id: 21, name: 'Pro (1 oy)', plan_type: 'organization', price: 799999, duration_days: 30, description: 'Yirik ta\'lim tashkilotlari uchun (1 oy)', features: ["Plus reja imkoniyatlari", "Cheksiz olimpiada va o'quvchilar", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], is_popular: false },
  { id: 22, name: 'Pro (3 oy)', plan_type: 'organization', price: 2159999, duration_days: 90, description: 'Yirik ta\'lim tashkilotlari uchun (3 oy)', features: ["Plus reja imkoniyatlari", "Cheksiz olimpiada va o'quvchilar", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], is_popular: false },
  { id: 23, name: 'Pro (6 oy)', plan_type: 'organization', price: 3839999, duration_days: 180, description: 'Yirik ta\'lim tashkilotlari uchun (6 oy)', features: ["Plus reja imkoniyatlari", "Cheksiz olimpiada va o'quvchilar", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], is_popular: false },
  { id: 24, name: 'Pro (1 yil)', plan_type: 'organization', price: 6719999, duration_days: 365, description: 'Yirik ta\'lim tashkilotlari uchun (1 yil)', features: ["Plus reja imkoniyatlari", "Cheksiz olimpiada va o'quvchilar", "API kirish", "Maxsus qo'llab-quvvatlash", "Ota-onalar paneli"], is_popular: false },
];

const OwnerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  // Boshlang'ich tab: avval sessionStorage deep-link'ini (masalan boshqa
  // dashboarddan "premium"ga o'tish), keyin URL'ni hisobga oladi.
  const [page, setPage] = ownerDashUrl.usePageState(() => {
    try {
      const saved = sessionStorage.getItem('owner_dashboard_initial_tab');
      if (saved) {
        sessionStorage.removeItem('owner_dashboard_initial_tab');
        return saved;
      }
    } catch {}
    return null;
  });
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [paymentPlan, setPaymentPlan] = React.useState(null);
  const [paymentLoading, setPaymentLoading] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState('');
  const [plans, setPlans] = React.useState([]);
  const [plansLoading, setPlansLoading] = React.useState(true);
  const [durationFilter, setDurationFilter] = React.useState(30);
  // Obuna limitlari + joriy foydalanish (Talabalar: 45/50, progress bar).
  // GET /api/billing/limits/ dan yuklanadi (premium sahifasi ochilganda).
  const [limits, setLimits] = React.useState(null);
  const [toast, setToast] = React.useState('');
  // Tasdiqlash modali — Telegram WebApp'da window.confirm() bloklanadi.
  // { title, message, confirmText, onConfirm } yoki null.
  const [confirmDialog, setConfirmDialog] = React.useState(null);
  const askConfirm = (opts) => setConfirmDialog(opts);
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  const [pendingManagers, setPendingManagers] = React.useState([]);
  const [apiStaff, setApiStaff] = React.useState([]);
  const [createdStaff, setCreatedStaff] = React.useState([]);
  const [staffModal, setStaffModal] = React.useState(false);
  const [staffRole, setStaffRole] = React.useState('manager');
  const [staffSaving, setStaffSaving] = React.useState(false);
  const [removingMembershipId, setRemovingMembershipId] = React.useState(null);
  // Rolni o'zgartirish modali: tanlangan a'zolik, yangi rol, holatlar.
  const [roleModalRow, setRoleModalRow] = React.useState(null);
  const [roleModalNewRole, setRoleModalNewRole] = React.useState('manager');
  const [roleModalSaving, setRoleModalSaving] = React.useState(false);
  const [roleModalError, setRoleModalError] = React.useState('');
  const emptyStaffForm = { full_name: '', phone: '+998', password: '', subject: '' };
  const [staffForm, setStaffForm] = React.useState(emptyStaffForm);
  const emptyCenterForm = {
    name: '',
    organizationType: "O'quv markaz",
    customOrganizationType: '',
    country: "O'zbekiston",
    region: '',
    district: '',
    subjects: [],
  };
  const [centerModal, setCenterModal] = React.useState(false);
  const [editingCenterId, setEditingCenterId] = React.useState(null);
  const [centerSaving, setCenterSaving] = React.useState(false);
  const [centerForm, setCenterForm] = React.useState(emptyCenterForm);
  const [centerImageOverrides, setCenterImageOverrides] = React.useState({});
  const [centerImageLoading, setCenterImageLoading] = React.useState(false);
  const centerImageInputRef = React.useRef(null);

  // O'quvchilar bo'limi holatlari.
  const [students, setStudents] = React.useState([]);
  const [studentsLoading, setStudentsLoading] = React.useState(false);
  const [studentsError, setStudentsError] = React.useState('');
  const [studentStatusFilter, setStudentStatusFilter] = React.useState('all');
  const [studentSearch, setStudentSearch] = React.useState('');
  // Debounce: o'quvchilar ro'yxati katta — har bosishda emas, foydalanuvchi
  // to'xtaganidan keyin filtrlaymiz.
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  const [studentActionId, setStudentActionId] = React.useState(null);
  // Guruh tegi tahrirlash holati: { membershipId, value }.
  const [groupTagEdit, setGroupTagEdit] = React.useState(null);

  // Live Proctoring states
  const [proctoringData, setProctoringData] = React.useState([]);
  const [proctoringLoading, setProctoringLoading] = React.useState(false);
  const [proctoringError, setProctoringError] = React.useState('');
  const [proctoringSearch, setProctoringSearch] = React.useState('');
  const debouncedProctoringSearch = useDebounce(proctoringSearch, 300);
  const [liveOlympiadId, setLiveOlympiadId] = React.useState(null);

  // Savol banki (9-funksiya) holatlari.
  const [questionBank, setQuestionBank] = React.useState([]);
  const [questionBankLoading, setQuestionBankLoading] = React.useState(false);
  const [qbSaving, setQbSaving] = React.useState(false);
  const emptyQbForm = { text: '', subject: '', difficulty: 'medium', options: [{ text: '', correct: true }, { text: '', correct: false }] };
  const [qbForm, setQbForm] = React.useState(emptyQbForm);

  // Markaz do'koni (Mukofotlar) holatlari.
  const [shopProducts, setShopProducts] = React.useState([]);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [shopSaving, setShopSaving] = React.useState(false);
  const [shopModal, setShopModal] = React.useState(null); // null | 'new' | product obyekti (tahrir)
  const emptyShopForm = { title: '', description: '', coin_cost: 100, icon: '🎁', stock: 10, is_active: true, features: [], imageFile: null, image_url: '' };
  const [shopForm, setShopForm] = React.useState(emptyShopForm);

  // F1: B2B markaz onboarding sehrgari (owner birinchi kirganda 3 qadamli modal).
  // Faqat backend aniq `false` qaytarganda ochiladi (eski/undefined holatda emas).
  const [onboardingStep, setOnboardingStep] = React.useState(0);
  const [onboardingOpen, setOnboardingOpen] = React.useState(false);
  const [onboardingSaving, setOnboardingSaving] = React.useState(false);
  React.useEffect(() => {
    if (isApi && user?.onboardingCenterCompleted === false) {
      setOnboardingOpen(true);
      setOnboardingStep(0);
    }
    // user obyekti yangilanganda (onboardingCenterCompleted=true) qayta ochilmaydi.
  }, [isApi, user?.onboardingCenterCompleted]);

  // F6: Branding (white-label) — joriy markaz brand rangi.
  const [brandColorInput, setBrandColorInput] = React.useState('#6366f1');
  const [brandSaving, setBrandSaving] = React.useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const loadProctoring = React.useCallback(() => {
    if (!isApi || !liveOlympiadId) {
      setProctoringData([]);
      return Promise.resolve();
    }
    return OlympyApi.getOlympiadLiveProctoring(liveOlympiadId, OlympyApi.getToken())
      .then(res => {
        setProctoringData(Array.isArray(res) ? res : []);
        setProctoringError('');
      })
      .catch(err => {
        console.warn('getOlympiadLiveProctoring failed:', err);
        setProctoringError("Jonli nazorat ma'lumotlarini yuklab bo'lmadi.");
      });
  }, [isApi, liveOlympiadId]);

  React.useEffect(() => {
    if (page !== 'proctoring' || !liveOlympiadId) return undefined;
    setProctoringLoading(true);
    loadProctoring().finally(() => setProctoringLoading(false));

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadProctoring();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [page, liveOlympiadId, loadProctoring]);


  const ownerRole = user.roles?.owner;
  const ownerRoleCenters = Array.isArray(ownerRole?.centers) ? ownerRole.centers : [];
  const selectedCenterStorageKey = `olympy_owner_center_${user?.id || 'guest'}`;
  const defaultOwnerCenterId = ownerRole?.centerId || ownerRoleCenters.find(c => c.status === 'approved')?.centerId || ownerRoleCenters[0]?.centerId || null;
  const [selectedOwnerCenterId, setSelectedOwnerCenterId] = React.useState(() => {
    try { return localStorage.getItem(selectedCenterStorageKey) || defaultOwnerCenterId; } catch { return defaultOwnerCenterId; }
  });
  const ownerCenterId = selectedOwnerCenterId || defaultOwnerCenterId;
  const centerOrganizationTypes = typeof ORGANIZATION_TYPES !== 'undefined'
    ? ORGANIZATION_TYPES
    : ["O'quv markaz", 'Maktab', 'Universitet/Kollej', 'Tashkilot', 'Online academy', 'Boshqa'];
  const centerRegions = typeof UZBEKISTAN_REGIONS !== 'undefined' ? UZBEKISTAN_REGIONS : [];
  const centerDistricts = typeof UZBEKISTAN_DISTRICTS !== 'undefined' ? UZBEKISTAN_DISTRICTS : {};
  const centerDistrictOptions = centerDistricts[centerForm.region] || [];
  const selectedCenterType = centerForm.organizationType === 'Boshqa'
    ? centerForm.customOrganizationType.trim()
    : centerForm.organizationType;

  const loadPendingStaff = React.useCallback(() => {
    if (!isApi || !ownerCenterId) {
      setPendingTeachers([]);
      setPendingManagers([]);
      return Promise.resolve();
    }
    const token = OlympyApi.getToken();
    return Promise.all([
      OlympyApi.getPendingMemberships(ownerCenterId, 'teacher', token),
      OlympyApi.getPendingMemberships(ownerCenterId, 'manager', token),
    ]).then(([teachers, managers]) => {
      setPendingTeachers(Array.isArray(teachers) ? teachers : []);
      setPendingManagers(Array.isArray(managers) ? managers : []);
    });
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => loadPendingStaff().catch(err => {
      if (!cancelled) {
        console.warn('getPendingMemberships failed:', err);
        setPendingTeachers([]);
        setPendingManagers([]);
      }
    });
    refresh();
    // Avval owner pending arizalarni faqat sahifa qayta ochilganda olardi.
    // Endi ManagerDashboard kabi har 15 soniyada poll qilamiz, shunda yangi
    // o'qituvchi/manager arizalari real vaqtda chiqadi. Fon tab'da to'xtaymiz.
    const intervalId = (isApi && ownerCenterId)
      ? setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            refresh();
          }
        }, 15000)
      : null;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadPendingStaff, isApi, ownerCenterId]);

  const loadApiStaff = React.useCallback(() => {
    if (!isApi || !ownerCenterId) {
      setApiStaff([]);
      return Promise.resolve();
    }
    const token = OlympyApi.getToken();
    return OlympyApi.getStaffMemberships(ownerCenterId, null, token)
      .then(rows => setApiStaff(Array.isArray(rows) ? rows : []));
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    loadApiStaff().catch(err => {
      if (!cancelled) {
        console.warn('getStaffMemberships failed:', err);
        setApiStaff([]);
      }
    });
    return () => { cancelled = true; };
  }, [loadApiStaff]);

  // O'quvchilar ro'yxatini status filteri bo'yicha yuklaydi. "all" tanlanganda
  // statusFilter bo'sh yuboriladi va backend barcha statuslarni qaytaradi.
  const loadStudents = React.useCallback(() => {
    if (!isApi || !ownerCenterId) {
      setStudents([]);
      return Promise.resolve();
    }
    const token = OlympyApi.getToken();
    const statusFilter = studentStatusFilter === 'all' ? '' : studentStatusFilter;
    return OlympyApi.getStudentMemberships(ownerCenterId, statusFilter, token)
      .then(rows => {
        setStudents(Array.isArray(rows) ? rows : []);
        setStudentsError('');
      });
  }, [isApi, ownerCenterId, studentStatusFilter]);

  React.useEffect(() => {
    let cancelled = false;
    setStudentsLoading(true);
    setStudentsError('');
    loadStudents()
      .catch(err => {
        if (!cancelled) {
          console.warn('getStudentMemberships failed:', err);
          setStudents([]);
          setStudentsError("O'quvchilar ro'yxatini yuklab bo'lmadi.");
        }
      })
      .finally(() => { if (!cancelled) setStudentsLoading(false); });
    return () => { cancelled = true; };
  }, [loadStudents]);

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getMyCenters(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiRankingRes = useApiData(
    () => isApi ? OlympyApi.getCenterRanking(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Premium markaz statistikasi: o'quvchilar dinamikasi va top o'quvchilar.
  const apiDynamicsRes = useApiData(
    () => (isApi && ownerCenterId && page === 'statistics') ? OlympyApi.getStudentDynamics(ownerCenterId, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, ownerCenterId, page === 'statistics'],
  );
  const apiTopStudentsRes = useApiData(
    () => (isApi && ownerCenterId && page === 'statistics') ? OlympyApi.getTopStudents(ownerCenterId, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, ownerCenterId, page === 'statistics'],
  );
  // Markaz faollik trendi (oylik o'rtacha ball) va hudud bo'yicha anonim o'rin.
  const apiActivityTrendRes = useApiData(
    () => (isApi && ownerCenterId && page === 'statistics') ? OlympyApi.getCenterActivityTrend(ownerCenterId, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, ownerCenterId, page === 'statistics'],
  );
  const apiRegionRankRes = useApiData(
    () => (isApi && ownerCenterId && page === 'statistics') ? OlympyApi.getCenterRegionRank(ownerCenterId, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, ownerCenterId, page === 'statistics'],
  );

  React.useEffect(() => {
    if (page === 'premium') {
      let cancelled = false;
      setPlansLoading(true);
      (async () => {
        try {
          const data = await OlympyApi.getSubscriptionPlans();
          if (cancelled) return;
          const list = Array.isArray(data) ? data.filter(p => p.plan_type === 'organization') : [];
          setPlans(list);
        } catch {
        } finally {
          if (!cancelled) setPlansLoading(false);
        }
      })();
      // Limit indikatorlari uchun joriy foydalanish (alohida so'rov — plans
      // yuklanmay qolsa ham limitlar ko'rinadi va aksincha).
      if (isApi && ownerCenterId) {
        (async () => {
          try {
            const data = await OlympyApi.getBillingLimits(OlympyApi.getToken(), ownerCenterId);
            if (!cancelled) setLimits(data || null);
          } catch {
            if (!cancelled) setLimits(null);
          }
        })();
      }
      return () => { cancelled = true; };
    }
  }, [page, isApi, ownerCenterId]);

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
  const applyCenterImageOverride = (c) => {
    const override = centerImageOverrides[String(c.id)] || centerImageOverrides[String(c.backendId)];
    return override ? { ...c, imageUrl: override } : c;
  };
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter).map(applyCenterImageOverride) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const roleOwnerCentersAsCenters = ownerRoleCenters.filter(c => c.centerId != null).map(c => ({
    id: String(c.centerId),
    backendId: c.centerId,
    name: c.centerName,
    organizationType: c.organizationType || "O'quv markaz",
    country: c.country || "O'zbekiston",
    region: c.region || '',
    district: c.district || '',
    city: c.city || c.district || c.region || '',
    status: c.status || 'pending',
    subjects: [],
    imageUrl: c.imageUrl || '',
    rating: 0,
    students: 0,
    olympiads: 0,
    createdAt: c.createdAt || '',
    _api: true,
  }));
  const baseCenters = isApi
    ? (apiCenters || roleOwnerCentersAsCenters)
    : store.centers.filter(c => c.ownerId === user.id || String(c.id) === String(defaultOwnerCenterId));
  const ownerCenters = baseCenters.slice().sort((a, b) => {
    const priority = { approved: 3, pending: 2, rejected: 1 };
    return (priority[b.status] || 0) - (priority[a.status] || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  const center = ownerCenterId ? baseCenters.find(c => String(c.id) === String(ownerCenterId)) : null;

  React.useEffect(() => {
    if (!ownerCenters.length) return;
    const exists = ownerCenterId && ownerCenters.some(c => String(c.id) === String(ownerCenterId));
    if (exists) return;
    const next = ownerCenters.find(c => c.status === 'approved') || ownerCenters[0];
    if (!next) return;
    setSelectedOwnerCenterId(String(next.id));
  }, [ownerCenters.map(c => `${c.id}:${c.status}`).join('|'), ownerCenterId]);

  React.useEffect(() => {
    if (!ownerCenterId) return;
    try { localStorage.setItem(selectedCenterStorageKey, String(ownerCenterId)); } catch {}
  }, [ownerCenterId, selectedCenterStorageKey]);

  // F6: Markaz brand rangi o'zgarganda input'ni va CSS --brand-color o'zgaruvchisini
  // sinxronlash. Sahifa yuklanganda ham markaz rangi bo'lsa darhol qo'llanadi.
  React.useEffect(() => {
    if (center?.brandColor) {
      setBrandColorInput(center.brandColor);
      try { document.documentElement.style.setProperty('--brand-color', center.brandColor); } catch {}
    }
  }, [center?.brandColor]);

  // F1: Onboarding sehrgarini tugatish/o'tkazib yuborish — backendni yangilab,
  // user state'ni ham (onUserUpdate orqali) sinxronlaymiz va modalni yopamiz.
  const finishCenterOnboarding = () => {
    setOnboardingSaving(true);
    OlympyApi.completeCenterOnboarding(OlympyApi.getToken())
      .then(() => {
        if (onUserUpdate) onUserUpdate({ ...user, onboardingCenterCompleted: true });
      })
      .catch(err => { console.warn('completeCenterOnboarding failed:', err); })
      .finally(() => {
        setOnboardingSaving(false);
        setOnboardingOpen(false);
      });
  };

  // F6: Brand rangini saqlash. Saqlangach CSS o'zgaruvchini darhol qo'llaymiz
  // va apiCenters'ni qayta yuklaymiz (yangi rang keyingi render'da ham qoladi).
  const saveBranding = () => {
    const centerId = center?.backendId ?? center?.id;
    if (!centerId) return;
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColorInput)) {
      showToast("⚠ Rang #RRGGBB formatida bo'lishi kerak");
      return;
    }
    setBrandSaving(true);
    OlympyApi.updateCenterBranding(centerId, { brand_color: brandColorInput }, OlympyApi.getToken())
      .then(() => {
        try { document.documentElement.style.setProperty('--brand-color', brandColorInput); } catch {}
        showToast('✓ Brand rangi saqlandi');
        apiCentersRes.reload?.();
      })
      .catch(err => {
        console.warn('updateCenterBranding failed:', err);
        showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Brendni saqlab bo'lmadi"}`);
      })
      .finally(() => setBrandSaving(false));
  };

  // Savol banki va do'kon yuklovchilari: bu hook'lar early return'dan (pastdagi
  // PendingAccessCard) OLDIN, shartsiz chaqilishi shart — aks holda tasdiqlangan
  // va tasdiqlanmagan markaz render'lari orasida hook soni o'zgarib, "Rules of
  // Hooks" buziladi (komponent crash bo'ladi).
  const loadQuestionBank = React.useCallback(() => {
    if (!isApi || !ownerCenterId) { setQuestionBank([]); return Promise.resolve(); }
    return OlympyApi.getCenterQuestionBank(ownerCenterId, OlympyApi.getToken())
      .then(rows => { setQuestionBank(Array.isArray(rows) ? rows : []); });
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    if (page !== 'questionbank') return undefined;
    let cancelled = false;
    setQuestionBankLoading(true);
    loadQuestionBank()
      .catch(() => { if (!cancelled) setQuestionBank([]); })
      .finally(() => { if (!cancelled) setQuestionBankLoading(false); });
    return () => { cancelled = true; };
  }, [page, loadQuestionBank]);

  const loadShopProducts = React.useCallback(() => {
    if (!isApi || !ownerCenterId) { setShopProducts([]); return Promise.resolve(); }
    return OlympyApi.getCenterShopProducts(OlympyApi.getToken(), ownerCenterId)
      .then(rows => { setShopProducts(Array.isArray(rows) ? rows : []); });
  }, [isApi, ownerCenterId]);

  React.useEffect(() => {
    if (page !== 'shop') return undefined;
    let cancelled = false;
    setShopLoading(true);
    loadShopProducts()
      .catch(() => { if (!cancelled) setShopProducts([]); })
      .finally(() => { if (!cancelled) setShopLoading(false); });
    return () => { cancelled = true; };
  }, [page, loadShopProducts]);

  const handleCenterImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !center || !isApi) return;
    setCenterImageLoading(true);
    try {
      const token = OlympyApi.getToken();
      const data = await OlympyApi.uploadCenterImage(center.backendId ?? center.id, file, token);
      const mapped = mapApiCenter(data);
      setCenterImageOverrides(prev => ({
        ...prev,
        [String(center.id)]: mapped.imageUrl,
        [String(center.backendId ?? center.id)]: mapped.imageUrl,
      }));
      showToast('Tashkilot rasmi yangilandi');
    } catch (err) {
      console.warn('uploadCenterImage failed:', err);
      showToast(OlympyApi.toUserMessage?.(err) || 'Rasm yuklanmadi');
    } finally {
      setCenterImageLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  if (!center || center.status !== 'approved') {
    const approvedFallback = ownerCenters.find(c => c.status === 'approved');
    // F1/F6: Markaz hali tasdiqlanmagan bo'lsa ham — owner onboarding bilan
    // tanishishi va brendni oldindan sozlashi mumkin bo'lsin. Bu bloklar
    // PendingAccessCard'ning `extra` qismida (tasdiqlash kutilayotgan paytda)
    // ko'rsatiladi; tasdiqlash xabari va boshqa elementlar joyida qoladi.
    const showCenterOnboarding = isApi && user?.onboardingCenterCompleted === false;
    const canPreviewBranding = !!center && center.status !== 'rejected';
    return (
      <PendingAccessCard
        title={center?.status === 'rejected' ? 'Tashkilot arizasi rad etildi' : 'Tashkilot tasdig\'i kutilmoqda'}
        status={center?.status || 'pending'}
        message={
          center?.status === 'rejected'
            ? "Tashkilot ro'yxatdan o'tkazish arizangiz Platform Admin tomonidan rad etildi. Yangi ariza yuborish uchun support bilan bog'laning."
            : "Direktor paneliga kirish uchun Platform Admin tashkilotingizni tasdiqlashi kerak. Tasdiqlangach direktor paneli ochiladi."
        }
        extra={(
          <div className="space-y-3">
            {center && (
              <div className="glass rounded-2xl p-4 inline-flex items-center gap-3">
                <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{center.name[0]}</div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-white">{center.name}</div>
                  <div className="text-xs text-white/40">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                </div>
                <span className={`chip ${center.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
                  {statusLabel(center.status)}
                </span>
              </div>
            )}

            {/* F1: B2B onboarding bilan tanishtiruvchi banner — tasdiqlash
                kutilayotganda ham ko'rinadi. Bu yerda dashboard tablar hali
                ochilmagani uchun faqat 3 qadamni ko'rsatamiz va "Tushunarli"
                tugmasi onboarding'ni yakunlaydi (backend + user state). */}
            {showCenterOnboarding && (
              <div className="glass-strong rounded-2xl p-5 text-left border border-indigo-500/25 max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <Icon name="trophy" size={18} />
                  </div>
                  <div className="text-sm font-black text-white">Olympy'da nimalar qila olasiz</div>
                </div>
                <div className="space-y-2.5">
                  {[
                    { icon: 'building', t: 'Markazingizni sozlang', d: "Nomi, logosi va joylashuvi o'quvchilarga ko'rinadi." },
                    { icon: 'trophy', t: 'Olimpiada yarating', d: "O'quvchilaringiz qatnashishi uchun musobaqalar tashkil qiling." },
                    { icon: 'users', t: "O'quvchilarni qo'shing", d: 'Ular arizalarini yuborib markazingizga qo\'shiladi.' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl glass p-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/8 text-indigo-300">
                        <Icon name={s.icon} size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">{s.t}</div>
                        <div className="text-[11px] font-medium text-white/45 leading-relaxed">{s.d}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={finishCenterOnboarding}
                  disabled={onboardingSaving}
                  className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {onboardingSaving ? 'Saqlanmoqda...' : 'Tushunarli'}
                </button>
              </div>
            )}

            {/* F6: Brending (white-label) minimal sozlamasi — tasdiqlash
                kutilayotganda ham brend rangini oldindan tanlab saqlash mumkin. */}
            {canPreviewBranding && (
              <div className="glass-strong rounded-2xl p-5 text-left border border-fuchsia-500/20 max-w-md mx-auto">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white">
                    <Icon name="sparkles" size={15} />
                  </div>
                  <div className="text-sm font-black text-white">Brendingni sozlang</div>
                </div>
                <div className="text-[11px] font-medium text-white/45 mb-3">Markazingiz brend rangini hozircha tanlab qo'ying.</div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandColorInput}
                      onChange={e => setBrandColorInput(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                      aria-label="Brend rangi"
                    />
                    <input
                      type="text"
                      value={brandColorInput}
                      onChange={e => setBrandColorInput(e.target.value)}
                      className="input-field w-28 font-mono uppercase"
                      placeholder="#6366F1"
                      maxLength={7}
                    />
                  </div>
                  <div className="h-10 w-10 rounded-xl border border-white/10" style={{ background: brandColorInput }} title="Oldindan ko'rish" />
                  <button
                    type="button"
                    onClick={saveBranding}
                    disabled={brandSaving}
                    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {brandSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </div>
              </div>
            )}

            {ownerCenters.length > 1 && (
              <select value={ownerCenterId || ''} onChange={e => setSelectedOwnerCenterId(e.target.value)} className="input-field max-w-sm">
                {ownerCenters.map(c => <option key={c.id} value={c.id}>{c.name} — {statusLabel(c.status)}</option>)}
              </select>
            )}
            {approvedFallback && (
              <button onClick={() => setSelectedOwnerCenterId(String(approvedFallback.id))} className="btn-ghost px-4 py-2.5 rounded-xl text-sm font-bold">
                Tasdiqlangan tashkilotga qaytish
              </button>
            )}
          </div>
        )}
        onBack={() => {
          if (approvedFallback) setSelectedOwnerCenterId(String(approvedFallback.id));
          else onNavigate('landing');
        }}
      />
    );
  }

  const apiStaffRequests = [
    ...pendingManagers.map(m => ({
      id: `api:manager:${m.membership_id}`,
      type: 'manager',
      status: 'pending',
      date: (m.created_at || '').slice(0, 10),
      membership_id: m.membership_id,
      user: m.user,
      _api: true,
    })),
    ...pendingTeachers.map(m => ({
      id: `api:teacher:${m.membership_id}`,
      type: 'teacher',
      status: 'pending',
      subject: m.subject,
      date: (m.created_at || '').slice(0, 10),
      membership_id: m.membership_id,
      user: m.user,
      _api: true,
    })),
  ];
  const centerRequests = isApi ? apiStaffRequests : store.requests.filter(r => r.centerId === center.id);
  const pendingManagerReqs = centerRequests.filter(r => r.type === 'manager' && r.status === 'pending');
  const pendingTeacherReqs = centerRequests.filter(r => r.type === 'teacher' && r.status === 'pending');
  const pendingCount = pendingManagerReqs.length + pendingTeacherReqs.length;

  const apiStaffRows = apiStaff.map(m => ({
    id: `api:${m.role}:${m.membership_id}`,
    membershipId: m.membership_id,
    centerId: String(center.id),
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
    role: m.role,
    subject: m.subject || '',
    status: m.status || 'approved',
    _api: true,
  }));
  const localApiStaff = createdStaff.filter(m => String(m.centerId) === String(center.id));
  const mockStaffRows = store.users
    .filter(u =>
      (u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id) ||
      (u.roles?.teacher?.status === 'approved' && u.roles.teacher.centerId === center.id)
    )
    .map(u => {
      const isManager = u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id;
      return {
        id: u.id,
        centerId: center.id,
        name: u.name,
        phone: u.phone,
        avatarUrl: u.avatarUrl || '',
        role: isManager ? 'manager' : 'teacher',
        subject: u.roles?.teacher?.subject || '',
        status: 'approved',
      };
    });
  const myStaff = isApi
    ? [
        ...apiStaffRows,
        ...localApiStaff.filter(m => !apiStaffRows.some(row => row.phone === m.phone)),
      ]
    : mockStaffRows;
  const centerOlympiads = isApi
    ? (apiOlympiads || []).filter(o => String(o.centerId) === String(center.id))
    : olympiadsForCenter(store, center.id);
  const activeOlympiads = centerOlympiads.filter(o => o.status === 'active');

  const requestUser = (req) => req?._api
    ? {
        name: req.user?.full_name || req.user?.name || '—',
        phone: req.user?.normalized_phone || req.user?.phone || '—',
        avatarUrl: req.user?.avatar_url || req.user?.avatarUrl || '',
      }
    : store.users.find(x => x.id === req.userId);

  const callApiApproval = (req, decision) => {
    const token = OlympyApi.getToken();
    const backendCenterId = center?.backendId ?? center?.id;
    const membershipId = req?.membership_id ?? req?.membershipId ?? req?.backendId;
    if (!membershipId || !backendCenterId) return Promise.reject(new Error('membership_id missing'));
    const fn = req.type === 'manager' ? OlympyApi.approveManager : OlympyApi.approveTeacher;
    return fn(backendCenterId, { membership_id: membershipId, decision }, token);
  };

  const approve = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (!req) { showToast('Ariza topilmadi'); return; }
      callApiApproval(req, 'approved')
        .then(() => loadPendingStaff())
        .then(() => showToast('Ariza tasdiqlandi'))
        .catch(err => { console.warn('approve failed:', err); showToast("Tasdiqlab bo'lmadi"); });
      return;
    }
    OlympyStore.approveRequest(id);
    showToast('Ariza tasdiqlandi');
  };

  const reject = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (!req) { showToast('Ariza topilmadi'); return; }
      callApiApproval(req, 'rejected')
        .then(() => loadPendingStaff())
        .then(() => showToast('Ariza rad etildi'))
        .catch(err => { console.warn('reject failed:', err); showToast("Rad etib bo'lmadi"); });
      return;
    }
    OlympyStore.rejectRequest(id);
    showToast('Ariza rad etildi');
  };

  const removeStaffMember = (row) => {
    if (!row) return;
    if (!isApi) {
      showToast("Demo rejimida a'zolikni o'chirib bo'lmaydi");
      return;
    }
    const membershipId = row.membershipId;
    if (!membershipId) {
      showToast("A'zolik ma'lumotlari topilmadi");
      return;
    }
    const roleLabel = row.role === 'manager' ? 'menejerni' : "o'qituvchini";
    askConfirm({
      title: 'A\'zolikni bekor qilish',
      message: `${row.name || 'Foydalanuvchi'} — bu ${roleLabel} markazdan chiqarishni tasdiqlaysizmi?`,
      confirmText: 'Chiqarish',
      onConfirm: () => {
        const backendCenterId = center?.backendId ?? center?.id;
        const token = OlympyApi.getToken();
        setRemovingMembershipId(membershipId);
        return OlympyApi.removeMembership(backendCenterId, membershipId, token)
          .then(() => {
            loadApiStaff().catch(() => null);
            showToast("A'zolik bekor qilindi");
          })
          .catch(err => {
            console.warn('removeMembership failed:', err);
            showToast(OlympyApi.toUserMessage(err) || "A'zolikni o'chirib bo'lmadi");
          })
          .finally(() => setRemovingMembershipId(null));
      },
    });
  };

  // O'quvchini tasdiqlash yoki rad etish (approveStudent decision payload).
  const decideStudent = (row, decision) => {
    if (!row) return;
    if (!isApi) {
      showToast("Demo rejimida o'quvchini boshqarib bo'lmaydi");
      return;
    }
    const membershipId = row.membershipId;
    if (!membershipId) {
      showToast("A'zolik ma'lumotlari topilmadi");
      return;
    }
    const backendCenterId = center?.backendId ?? center?.id;
    const token = OlympyApi.getToken();
    setStudentActionId(membershipId);
    OlympyApi.approveStudent(backendCenterId, { membership_id: membershipId, decision }, token)
      .then(() => loadStudents())
      .then(() => showToast(decision === 'approved' ? "O'quvchi tasdiqlandi" : 'Ariza rad etildi'))
      .catch(err => {
        console.warn('approveStudent failed:', err);
        showToast(OlympyApi.toUserMessage?.(err) || "Amalni bajarib bo'lmadi");
      })
      .finally(() => setStudentActionId(null));
  };

  // O'quvchini markazdan chiqarish — removeMembership chaqiradi.
  const removeStudentMember = (row) => {
    if (!row) return;
    if (!isApi) {
      showToast("Demo rejimida a'zolikni o'chirib bo'lmaydi");
      return;
    }
    const membershipId = row.membershipId;
    if (!membershipId) {
      showToast("A'zolik ma'lumotlari topilmadi");
      return;
    }
    askConfirm({
      title: 'O\'quvchini chiqarish',
      message: `${row.name || "O'quvchi"}ni markazdan chiqarishni tasdiqlaysizmi?`,
      confirmText: 'Chiqarish',
      onConfirm: () => {
        const backendCenterId = center?.backendId ?? center?.id;
        const token = OlympyApi.getToken();
        setStudentActionId(membershipId);
        return OlympyApi.removeMembership(backendCenterId, membershipId, token)
          .then(() => loadStudents())
          .then(() => showToast("O'quvchi markazdan chiqarildi"))
          .catch(err => {
            console.warn('removeMembership failed:', err);
            showToast(OlympyApi.toUserMessage?.(err) || "Chiqarib bo'lmadi");
          })
          .finally(() => setStudentActionId(null));
      },
    });
  };

  // Guruh tegini saqlash (10-funksiya) — group olimpiadalar uchun.
  const saveGroupTag = (row, value) => {
    if (!row || !isApi || !row.membershipId) { setGroupTagEdit(null); return; }
    const backendCenterId = center?.backendId ?? center?.id;
    const token = OlympyApi.getToken();
    const trimmed = (value || '').trim();
    if (trimmed === (row.groupTag || '')) { setGroupTagEdit(null); return; }
    setStudentActionId(row.membershipId);
    OlympyApi.setMemberGroupTag(backendCenterId, row.membershipId, trimmed, token)
      .then(() => loadStudents())
      .then(() => showToast('Guruh tegi yangilandi'))
      .catch(err => {
        console.warn('setMemberGroupTag failed:', err);
        showToast(OlympyApi.toUserMessage?.(err) || "Guruhni saqlab bo'lmadi");
      })
      .finally(() => { setStudentActionId(null); setGroupTagEdit(null); });
  };

  // Savol banki: qo'shish, o'chirish. (loadQuestionBank hook'i early return'dan
  // oldin yuqorida e'lon qilingan — Rules of Hooks talabi.)
  const addQbQuestion = () => {
    if (!isApi || !ownerCenterId) { showToast("Demo rejimida ishlamaydi"); return; }
    const text = (qbForm.text || '').trim();
    const options = (qbForm.options || []).filter(o => (o.text || '').trim());
    if (!text) { showToast('Savol matnini kiriting'); return; }
    if (options.length < 2) { showToast('Kamida 2 ta variant kiriting'); return; }
    if (!options.some(o => o.correct)) { showToast("To'g'ri variantni belgilang"); return; }
    setQbSaving(true);
    OlympyApi.addCenterQuestion(ownerCenterId, {
      text,
      subject: (qbForm.subject || '').trim(),
      difficulty: qbForm.difficulty || 'medium',
      options: options.map(o => ({ text: o.text.trim(), correct: !!o.correct })),
    }, OlympyApi.getToken())
      .then(() => { setQbForm(emptyQbForm); return loadQuestionBank(); })
      .then(() => showToast('Savol bankka qo\'shildi'))
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "Saqlab bo'lmadi"))
      .finally(() => setQbSaving(false));
  };

  const deleteQbQuestion = (qId) => {
    if (!isApi || !ownerCenterId) return;
    askConfirm({
      title: 'Savolni o\'chirish',
      message: "Savolni bankdan o'chirasizmi?",
      confirmText: "O'chirish",
      onConfirm: () =>
        OlympyApi.deleteCenterQuestion(ownerCenterId, qId, OlympyApi.getToken())
          .then(() => loadQuestionBank())
          .then(() => showToast("Savol o'chirildi"))
          .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi")),
    });
  };

  // Markaz do'koni: qo'shish, tahrirlash, o'chirish. (loadShopProducts hook'i
  // early return'dan oldin yuqorida e'lon qilingan — Rules of Hooks talabi.)
  const openShopModal = (product) => {
    if (product) {
      setShopForm({
        title: product.title || '',
        description: product.description || '',
        coin_cost: product.coin_cost ?? 0,
        icon: product.icon || '🎁',
        stock: product.stock ?? 0,
        is_active: product.is_active !== false,
        features: Array.isArray(product.features) ? product.features.map(f => (typeof f === 'string' ? f : (f?.value || ''))).filter(Boolean) : [],
        imageFile: null,
        image_url: product.image_url || '',
      });
      setShopModal(product);
    } else {
      setShopForm(emptyShopForm);
      setShopModal('new');
    }
  };
  const closeShopModal = () => { setShopModal(null); setShopForm(emptyShopForm); };

  const submitShopProduct = () => {
    if (!isApi || !ownerCenterId) { showToast("Demo rejimida ishlamaydi"); return; }
    const title = (shopForm.title || '').trim();
    if (!title) { showToast('Mahsulot nomini kiriting'); return; }
    const coinCost = parseInt(shopForm.coin_cost, 10);
    if (!Number.isFinite(coinCost) || coinCost < 0) { showToast("Tanga narxini to'g'ri kiriting"); return; }
    const stock = parseInt(shopForm.stock, 10);
    const features = (shopForm.features || []).map(f => (typeof f === 'string' ? f.trim() : f)).filter(Boolean);

    // Rasm bo'lsa multipart/form-data, aks holda JSON.
    let body;
    if (shopForm.imageFile) {
      body = new FormData();
      body.append('title', title);
      body.append('description', (shopForm.description || '').trim());
      body.append('coin_cost', String(coinCost));
      body.append('icon', shopForm.icon || '🎁');
      body.append('stock', String(Number.isFinite(stock) ? stock : 0));
      body.append('is_active', shopForm.is_active ? 'true' : 'false');
      body.append('features', JSON.stringify(features));
      body.append('image', shopForm.imageFile);
    } else {
      body = {
        title,
        description: (shopForm.description || '').trim(),
        coin_cost: coinCost,
        icon: shopForm.icon || '🎁',
        stock: Number.isFinite(stock) ? stock : 0,
        is_active: !!shopForm.is_active,
        features,
      };
    }

    setShopSaving(true);
    const token = OlympyApi.getToken();
    const isEdit = shopModal && shopModal !== 'new';
    const req = isEdit
      ? OlympyApi.updateCenterShopProduct(shopModal.id, body, token, ownerCenterId)
      : OlympyApi.createCenterShopProduct(body, token, ownerCenterId);
    req
      .then(() => { closeShopModal(); return loadShopProducts(); })
      .then(() => showToast(isEdit ? 'Mahsulot yangilandi' : "Mahsulot qo'shildi"))
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "Saqlab bo'lmadi"))
      .finally(() => setShopSaving(false));
  };

  const deleteShopProduct = (productId) => {
    if (!isApi || !ownerCenterId) return;
    askConfirm({
      title: 'Mahsulotni o\'chirish',
      message: "Mahsulotni do'kondan o'chirasizmi?",
      confirmText: "O'chirish",
      onConfirm: () =>
        OlympyApi.deleteCenterShopProduct(productId, OlympyApi.getToken(), ownerCenterId)
          .then(() => loadShopProducts())
          .then(() => showToast("Mahsulot o'chirildi"))
          .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi")),
    });
  };

  const toggleShopActive = (product) => {
    if (!isApi || !ownerCenterId) return;
    const next = !product.is_active;
    // Optimistic: UI darhol yangilanadi, xato bo'lsa eski holatga qaytadi.
    setShopProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: next } : p)));
    OlympyApi.updateCenterShopProduct(product.id, { is_active: next }, OlympyApi.getToken(), ownerCenterId)
      .then(() => loadShopProducts())
      .catch(err => {
        setShopProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: product.is_active } : p)));
        showToast(OlympyApi.toUserMessage?.(err) || "O'zgartirib bo'lmadi");
      });
  };

  const openRoleModal = (row) => {
    if (!row) return;
    if (!isApi) {
      showToast("Demo rejimida rolni o'zgartirib bo'lmaydi");
      return;
    }
    if (!row.membershipId) {
      showToast("A'zolik ma'lumotlari topilmadi");
      return;
    }
    // Boshlang'ich tanlov: hozirgi roldan farqli birinchi variant.
    const firstOther = ['student', 'teacher', 'manager'].find(r => r !== row.role) || 'manager';
    setRoleModalRow(row);
    setRoleModalNewRole(firstOther);
    setRoleModalError('');
    setRoleModalSaving(false);
  };

  const closeRoleModal = () => {
    if (roleModalSaving) return;
    setRoleModalRow(null);
    setRoleModalError('');
  };

  const submitRoleChange = () => {
    if (!roleModalRow || roleModalSaving) return;
    const membershipId = roleModalRow.membershipId;
    if (!membershipId) {
      setRoleModalError("A'zolik ma'lumotlari topilmadi");
      return;
    }
    if (roleModalNewRole === roleModalRow.role) {
      setRoleModalError("Yangi rol joriy rol bilan bir xil");
      return;
    }
    const backendCenterId = center?.backendId ?? center?.id;
    const token = OlympyApi.getToken();
    setRoleModalSaving(true);
    setRoleModalError('');
    OlympyApi.changeMemberRole(backendCenterId, membershipId, roleModalNewRole, token)
      .then(() => {
        setRoleModalRow(null);
        loadApiStaff().catch(() => null);
        loadStudents().catch(() => null);
        showToast("Rol muvaffaqiyatli o'zgartirildi");
      })
      .catch(err => {
        console.warn('changeMemberRole failed:', err);
        setRoleModalError(OlympyApi.toUserMessage(err) || "Rolni o'zgartirib bo'lmadi");
      })
      .finally(() => setRoleModalSaving(false));
  };

  const openStaffModal = (role = 'manager') => {
    setStaffRole(role);
    setStaffForm(emptyStaffForm);
    setStaffModal(true);
  };

  const closeStaffModal = () => {
    if (staffSaving) return;
    setStaffModal(false);
    setStaffForm(emptyStaffForm);
  };

  const updateStaffForm = (key, value) => {
    setStaffForm(prev => ({ ...prev, [key]: value }));
  };

  const submitStaff = (event) => {
    event.preventDefault();
    const payload = {
      full_name: staffForm.full_name.trim(),
      phone: staffForm.phone.trim(),
      password: staffForm.password,
      subject: staffForm.subject.trim(),
    };
    const normalizedPhone = OlympyStore.normalizePhone(payload.phone);
    if (!payload.full_name || !normalizedPhone || payload.password.length < 6) {
      showToast("Ism, telefon va kamida 6 belgili parol kiriting");
      return;
    }
    payload.phone = normalizedPhone;
    if (isApi) {
      const token = OlympyApi.getToken();
      const backendCenterId = center?.backendId ?? center?.id;
      const createFn = staffRole === 'teacher' ? OlympyApi.createTeacher : OlympyApi.createManager;
      setStaffSaving(true);
      createFn(backendCenterId, payload, token)
        .then(res => {
          const apiUser = res?.user || {};
          setCreatedStaff(prev => [{
            id: `api:${staffRole}:${res?.membership?.id || apiUser.id || Date.now()}`,
            centerId: String(center.id),
            name: apiUser.full_name || payload.full_name,
            phone: apiUser.normalized_phone || apiUser.phone || payload.phone,
            role: staffRole,
            subject: staffRole === 'teacher' ? payload.subject : '',
            status: 'approved',
            _api: true,
          }, ...prev]);
          loadApiStaff().catch(err => console.warn('refresh staff failed:', err));
          setStaffModal(false);
          setStaffForm(emptyStaffForm);
          showToast(staffRole === 'teacher' ? 'Ustoz login/paroli yaratildi' : 'Menejer login/paroli yaratildi');
        })
        .catch(err => {
          console.warn('create staff failed:', err);
          showToast(OlympyApi.toUserMessage(err));
        })
        .finally(() => setStaffSaving(false));
      return;
    }
    try {
      const created = OlympyStore.createUser({
        name: payload.full_name,
        phone: payload.phone,
        password: payload.password,
      });
      OlympyStore.setRole(created.id, staffRole, {
        status: 'approved',
        centerId: center.id,
        ...(staffRole === 'teacher' ? { subject: payload.subject } : {}),
      });
      OlympyStore.setActiveRole(created.id, staffRole);
      setStaffModal(false);
      setStaffForm(emptyStaffForm);
      showToast(staffRole === 'teacher' ? 'Ustoz login/paroli yaratildi' : 'Menejer login/paroli yaratildi');
    } catch (err) {
      showToast(err?.message || "Xodim yaratib bo'lmadi");
    }
  };

  const openCenterModal = () => {
    setEditingCenterId(null);
    setCenterForm(emptyCenterForm);
    setCenterModal(true);
  };

  const openEditCenterModal = () => {
    if (!center) return;
    const knownTypes = Array.isArray(centerOrganizationTypes) ? centerOrganizationTypes : [];
    const currentType = center.organizationType || "O'quv markaz";
    const isKnown = knownTypes.includes(currentType);
    setEditingCenterId(center.id);
    setCenterForm({
      name: center.name || '',
      organizationType: isKnown ? currentType : 'Boshqa',
      customOrganizationType: isKnown ? '' : currentType,
      country: center.country || "O'zbekiston",
      region: center.region || '',
      district: center.district || center.city || '',
      subjects: Array.isArray(center.subjects) ? [...center.subjects] : [],
    });
    setCenterModal(true);
  };

  const closeCenterModal = () => {
    if (centerSaving) return;
    setCenterModal(false);
    setEditingCenterId(null);
    setCenterForm(emptyCenterForm);
  };

  const updateCenterForm = (key, value) => {
    setCenterForm(prev => ({ ...prev, [key]: value }));
  };

  const submitCenter = (event) => {
    event.preventDefault();
    const payload = {
      name: centerForm.name.trim(),
      organization_type: selectedCenterType || "O'quv markaz",
      country: centerForm.country || "O'zbekiston",
      region: centerForm.region,
      district: centerForm.district,
      city: centerForm.district || centerForm.region,
      subjects: centerForm.subjects || [],
    };
    if (!payload.name || !payload.region || !payload.district || !payload.organization_type) {
      showToast('Turi, manzil va nomini to‘liq kiriting');
      return;
    }

    const isEditing = !!editingCenterId;

    if (isEditing) {
      if (isApi) {
        const editTarget = ownerCenters.find(c => String(c.id) === String(editingCenterId));
        const backendId = editTarget?.backendId ?? editingCenterId;
        const token = OlympyApi.getToken();
        setCenterSaving(true);
        OlympyApi.updateCenter(backendId, payload, token)
          .then(() => {
            apiCentersRes.reload();
            return OlympyApi.getMe(token).then(me => {
              const mapped = OlympyApi.mapBackendUser(me);
              onUserUpdate?.(mapped);
            }).catch(() => null);
          })
          .then(() => {
            setCenterModal(false);
            setEditingCenterId(null);
            setCenterForm(emptyCenterForm);
            showToast('Tashkilot ma\'lumotlari yangilandi');
          })
          .catch(err => {
            console.warn('updateCenter failed:', err);
            showToast(OlympyApi.toUserMessage(err));
          })
          .finally(() => setCenterSaving(false));
        return;
      }
      try {
        OlympyStore.updateCenter(editingCenterId, {
          name: payload.name,
          organizationType: payload.organization_type,
          country: payload.country,
          region: payload.region,
          district: payload.district,
          city: payload.city,
          subjects: payload.subjects,
        });
        setCenterModal(false);
        setEditingCenterId(null);
        setCenterForm(emptyCenterForm);
        showToast('Tashkilot ma\'lumotlari yangilandi');
      } catch (err) {
        showToast(err?.message || "Yangilab bo'lmadi");
      }
      return;
    }

    if (isApi) {
      const token = OlympyApi.getToken();
      setCenterSaving(true);
      OlympyApi.registerCenter(payload, token)
        .then(() => {
          apiCentersRes.reload();
          return OlympyApi.getMe(token).then(me => {
            const mapped = OlympyApi.mapBackendUser(me);
            onUserUpdate?.(mapped);
          }).catch(() => null);
        })
        .then(() => {
          setCenterModal(false);
          setCenterForm(emptyCenterForm);
          showToast('Yangi tashkilot arizasi adminga yuborildi');
        })
        .catch(err => {
          console.warn('registerCenter failed:', err);
          showToast(OlympyApi.toUserMessage(err));
        })
        .finally(() => setCenterSaving(false));
      return;
    }
    try {
      const created = OlympyStore.createCenter({
        name: payload.name,
        organizationType: payload.organization_type,
        country: payload.country,
        region: payload.region,
        district: payload.district,
        city: payload.city,
        subjects: payload.subjects,
        ownerId: user.id,
      });
      OlympyStore.createRequest({ type: 'center', userId: user.id, centerId: created.id });
      setSelectedOwnerCenterId(created.id);
      setCenterModal(false);
      setCenterForm(emptyCenterForm);
      showToast('Yangi tashkilot arizasi adminga yuborildi');
    } catch (err) {
      showToast(err?.message || "Tashkilot yaratib bo'lmadi");
    }
  };

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'staff', icon: 'users', label: 'Xodimlar' },
    { key: 'students', icon: 'users', label: "O'quvchilar" },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'questionbank', icon: 'file', label: 'Savol banki' },
    { key: 'shop', icon: 'award', label: "Do'kon" },
    { key: 'statistics', icon: 'grid', label: 'Statistika' },
    { key: 'ranking', icon: 'star', label: 'Reyting' },
    { key: 'analytics', icon: 'chart', label: 'Analitika' },
    { key: 'center', icon: 'building', label: 'Profil' },
    { key: 'premium', icon: 'award', label: 'Premium Obuna' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
    { key: 'myprofile', icon: 'user', label: 'Mening profilim' },
  ];

  // Analytics tugmasini sahifa darajasiga yo'naltirish.
  const setPageOrSpecial = (key) => {
    if (key === 'analytics') { onNavigate('analytics'); return; }
    setPage(key);
  };

  const requestRows = centerRequests.filter(r => r.type === 'manager' || r.type === 'teacher');
  const recentRequests = requestRows.filter(r => r.status === 'pending').slice(0, 4);

  const Sidebar = () => (
    <aside
      className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-white/5 transition-transform duration-200 lg:static lg:translate-x-0`}
      style={{ background: 'rgba(5,5,8,0.99)' }}
    >
      <div className="border-b border-white/5 px-5 py-5">
        <button onClick={() => setPage('home')} className="flex w-full items-center gap-3 text-left">
          {center.imageUrl ? (
            <img
              src={center.imageUrl}
              alt={center.name}
              className="h-11 w-11 rounded-xl object-cover shadow-lg shadow-indigo-900/40"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-bg text-base font-black text-white shadow-lg shadow-indigo-900/40">
              {center.name[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{center.name}</div>
            <div className="truncate text-[11px] font-semibold text-white/40">
              {center.organizationType || "O'quv markaz"} · Direktor paneli
            </div>
          </div>
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <OwnerSidebarItem
            key={item.key}
            item={item}
            active={page === item.key}
            onClick={() => { setPageOrSpecial(item.key); setMobileMenu(false); }}
          />
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/5 p-3">
        {ownerCenters.length > 1 && (
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-white/35">Tashkilot</span>
            <select
              value={ownerCenterId || ''}
              onChange={e => { setSelectedOwnerCenterId(e.target.value); setPage('home'); }}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-2 text-xs font-bold text-white/80 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              {ownerCenters.map(c => (
                <option key={c.id} value={c.id} style={{ background: '#12141a' }}>{c.name} · {statusLabel(c.status)}</option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={openCenterModal}
          className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black"
        >
          <Icon name="plus" size={14} /> Yangi tashkilot
        </button>
        <div className="rounded-xl glass p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Tashkilot faol
          </div>
          <div className="mt-1 text-[10px] font-medium leading-relaxed text-white/40">
            Faqat {center.name} ma'lumotlari ko'rsatiladi.
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/55 transition-colors hover:bg-white/5 hover:text-rose-300"
        >
          <Icon name="logout" size={14} /> Chiqish
        </button>
      </div>
    </aside>
  );

  const Topbar = () => (
    <header
      className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-white/5 px-4 lg:px-6"
      style={{ background: 'rgba(13, 14, 18, 0.97)' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          onClick={() => setMobileMenu(true)}
        >
          <Icon name="menu" size={20} />
        </button>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-black text-white">{navItems.find(n => n.key === page)?.label || 'Asosiy'}</div>
          <div className="truncate text-[11px] font-semibold text-white/40">
            {center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {ownerCenters.length > 1 && (
          <select
            value={ownerCenterId || ''}
            onChange={e => { setSelectedOwnerCenterId(e.target.value); setPage('home'); }}
            className="hidden h-9 max-w-[220px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/80 outline-none transition hover:bg-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 md:block"
          >
            {ownerCenters.map(c => (
              <option key={c.id} value={c.id} style={{ background: '#12141a' }}>{c.name} · {statusLabel(c.status)}</option>
            ))}
          </select>
        )}
        <button
          onClick={openCenterModal}
          className="btn-primary hidden rounded-xl px-3 py-2 text-xs font-black md:inline-flex"
        >
          Yangi tashkilot
        </button>
        {onOpenSwitcher && (
          <button
            onClick={onOpenSwitcher}
            className="btn-ghost inline-flex items-center gap-1.5 rounded-xl px-2 md:px-3 py-2 text-xs font-bold"
          >
            <Icon name="users" size={13} /><span className="hidden md:inline">Rolni almashtirish</span>
          </button>
        )}
        <button
          onClick={() => setPage('requests')}
          className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="bell" size={18} />
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 px-1 text-[10px] font-black text-white shadow-lg shadow-amber-900/40">
              {pendingCount}
            </span>
          )}
        </button>
        <div className="ml-2 flex items-center gap-2">
          <Avatar name={user?.name || 'Director'} src={user?.avatarUrl || ''} size={34} />
          <div className="hidden text-right sm:block">
            <div className="text-xs font-black text-white">{user?.name || 'Direktor'}</div>
            <div className="text-[10px] font-semibold text-white/40">Direktor</div>
          </div>
        </div>
      </div>
    </header>
  );

  const RequestCard = ({ req }) => {
    const u = requestUser(req);
    const isManager = req.type === 'manager';
    return (
      <div className="glass rounded-2xl p-4 transition-all hover:border-white/15 hover:bg-white/[0.06]">
        <div className="flex items-start gap-3">
          <Avatar
            name={u?.name || '?'}
            src={u?.avatarUrl || ''}
            size={42}
            gradient={isManager ? 'from-indigo-500 to-purple-600' : 'from-cyan-500 to-sky-600'}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-black text-white">{u?.name || 'Noma\'lum'}</div>
              <OwnerStatusPill status={req.status} />
            </div>
            <div className="mt-1 text-xs font-semibold text-white/55">
              {isManager ? 'Manager arizasi' : `O'qituvchi arizasi${req.subject ? ` · ${req.subject}` : ''}`}
            </div>
            <div className="mt-1 text-[11px] font-medium text-white/35">
              {u?.phone || '—'} · {ownerFormatDate(req.date)}
            </div>
          </div>
          {req.status === 'pending' && (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => approve(req.id)}
                className="btn-success rounded-xl px-3 py-2 text-xs font-black"
              >
                Qabul
              </button>
              <button
                onClick={() => reject(req.id)}
                className="btn-danger rounded-xl px-3 py-2 text-xs font-black"
              >
                Rad
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Hero card */}
      <section className="relative overflow-hidden rounded-3xl border border-white/8 glass-strong">
        {/* Decorative glows */}
        <div className="hero-glow" style={{ background: '#6366f1', top: '-200px', left: '-100px' }} />
        <div className="hero-glow" style={{ background: '#a855f7', bottom: '-220px', right: '-120px' }} />

        <div className="relative grid gap-0 lg:grid-cols-[1.3fr_.7fr]">
          <div className="p-6 lg:p-8">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <OwnerStatusPill status="approved">Tasdiqlangan tashkilot</OwnerStatusPill>
              <span className="chip badge-draft">{center.region || center.city}</span>
              <span className="chip badge-draft">{center.organizationType || "O'quv markaz"}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl break-words">
              <span className="gradient-text">{center.name}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/55">
              Direktor paneli faqat shu tashkilotga tegishli xodimlar, arizalar va ko'rsatkichlarni boshqaradi.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {(center.subjects || []).slice(0, 6).map(s => <SubjectBadge key={s} subject={s} />)}
              {(!center.subjects || center.subjects.length === 0) && (
                <span className="text-xs font-semibold text-white/35">Fanlar kiritilmagan</span>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 p-6 lg:border-l lg:border-t-0 lg:p-8" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-[10px] font-black uppercase tracking-wider text-white/40">Bugungi vazifalar</div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl glass p-3">
                <span className="text-sm font-bold text-white/70">Xodim arizalari</span>
                <span className="text-xl font-black text-amber-300">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl glass p-3">
                <span className="text-sm font-bold text-white/70">Faol tadbirlar</span>
                <span className="text-xl font-black text-cyan-300">{activeOlympiads.length}</span>
              </div>
              <button
                onClick={() => setPage('requests')}
                className="btn-primary w-full rounded-xl px-4 py-3 text-sm font-black"
              >
                Arizalarni ko'rish
              </button>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => openStaffModal('manager')}
                  className="btn-ghost rounded-xl px-3 py-3 text-xs font-black"
                >
                  Menejer yaratish
                </button>
                <button
                  onClick={() => openStaffModal('teacher')}
                  className="btn-ghost rounded-xl px-3 py-3 text-xs font-black"
                >
                  Ustoz yaratish
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KPI metrics */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OwnerMetric
          label="Xodimlar"
          value={myStaff.length}
          hint="Tasdiqlangan"
          icon={<Icon name="users" size={20} />}
          tone="indigo"
          glow
        />
        <OwnerMetric
          label="Kutilayotgan arizalar"
          value={pendingCount}
          hint={pendingCount ? 'Qaror kerak' : "Bo'sh"}
          icon={<Icon name="bell" size={20} />}
          tone="amber"
        />
        <OwnerMetric
          label="Tadbirlar"
          value={centerOlympiads.length}
          hint={`${activeOlympiads.length} faol`}
          icon={<Icon name="trophy" size={20} />}
          tone="cyan"
        />
        <OwnerMetric
          label="Reyting"
          value={center.rating || '—'}
          hint="Profil"
          icon={<Icon name="star" size={20} />}
          tone="purple"
        />
      </div>


      {/* Pending requests + status panel */}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-white">Kutilayotgan xodim arizalari</h2>
              <p className="mt-1 text-xs font-semibold text-white/45">Manager va o'qituvchi arizalarini shu yerdan tasdiqlang.</p>
            </div>
            <button
              onClick={() => setPage('requests')}
              className="text-xs font-black text-indigo-300 transition-colors hover:text-indigo-200"
            >
              Barchasi →
            </button>
          </div>
          <div className="space-y-3">
            {recentRequests.map(r => <RequestCard key={r.id} req={r} />)}
            {recentRequests.length === 0 && (
              <EmptyState
                icon="check"
                title="Hozircha yangi ariza yo'q"
                desc="Yangi xodim arizalari kelganda shu yerda chiqadi."
              />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-black text-white">Tashkilot holati</h2>
            <OwnerStatusPill status={center.status} />
          </div>
          <div className="space-y-4">
            {[
              { label: 'Profil', pct: 100, color: '#10b981' },
              { label: 'Xodimlar', pct: Math.min(100, myStaff.length * 25), color: '#22d3ee' },
              { label: 'Fanlar', pct: Math.min(100, (center.subjects || []).length * 18), color: '#6366f1' },
              { label: 'Olimpiadalar', pct: Math.min(100, (centerOlympiads.length) * 20), color: '#a855f7' },
            ].map(row => (
              <div key={row.label}>
                <div className="mb-1.5 flex justify-between text-xs font-bold">
                  <span className="text-white/60">{row.label}</span>
                  <span style={{ color: row.color }}>{row.pct}%</span>
                </div>
                <div className="progress-bar h-2">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${row.pct}%`, background: `linear-gradient(90deg, ${row.color}, #a855f7)` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Xodim arizalari</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">Bu ro'yxat faqat {center.name} uchun.</p>
        </div>
        <OwnerStatusPill status="pending">{pendingCount} ta kutilmoqda</OwnerStatusPill>
      </div>
      <div className="grid gap-3">
        {requestRows.map(r => <RequestCard key={r.id} req={r} />)}
        {requestRows.length === 0 && (
          <div className="rounded-2xl border border-white/8 glass-strong px-4 py-10 md:py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full glass text-white/30">
              <Icon name="bell" size={22} />
            </div>
            <div className="text-sm font-black text-white/70">Arizalar yo'q</div>
            <div className="mt-1 text-xs font-semibold text-white/40">Yangi arizalar kelishi bilan shu yerda paydo bo'ladi.</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderStaff = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Xodimlar</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">Tasdiqlangan manager va o'qituvchilar.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => openStaffModal('manager')}
            className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black"
          >
            <Icon name="plus" size={16} /> Menejer yaratish
          </button>
          <button
            onClick={() => openStaffModal('teacher')}
            className="btn-ghost inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black"
          >
            <Icon name="plus" size={16} /> Ustoz yaratish
          </button>
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/8 glass-strong">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr className="text-[10px] font-black uppercase tracking-wider text-white/40">
                {['Ism', 'Telefon', 'Rol', 'Fan', 'Holat', 'Amal'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myStaff.map(row => {
                const canRemove = isApi && !!row.membershipId && (row.status || 'approved') === 'approved';
                const removing = removingMembershipId === row.membershipId;
                // Owner a'zoligi uchun rol o'zgartirish tugmasi ko'rsatilmaydi.
                const canChangeRole = isApi && !!row.membershipId
                  && (row.status || 'approved') === 'approved'
                  && row.role !== 'owner';
                return (
                  <tr key={row.id} className="olympy-row text-sm">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.name} src={row.avatarUrl || ''} size={36} gradient={row.role === 'manager' ? 'from-indigo-500 to-purple-600' : 'from-cyan-500 to-sky-600'} />
                        <span className="font-black text-white">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-white/55">
                      {maskPhoneDisplay(row.phone, '')}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`chip ${row.role === 'manager' ? 'badge-active' : 'badge-approved'}`}>
                        {row.role === 'manager' ? 'Manager' : "O'qituvchi"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white/60">{row.subject || '—'}</td>
                    <td className="px-5 py-4">
                      <OwnerStatusPill status={row.status || 'approved'} />
                    </td>
                    <td className="px-5 py-4">
                      {(canRemove || canChangeRole) ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {canChangeRole && (
                            <button
                              onClick={() => openRoleModal(row)}
                              disabled={removing}
                              className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
                            >
                              Rolni o'zgartir
                            </button>
                          )}
                          {canRemove && (
                            <button
                              onClick={() => removeStaffMember(row)}
                              disabled={removing}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                            >
                              {removing ? '...' : 'Chiqarish'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {myStaff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 md:py-16 text-center text-sm font-bold text-white/40">
                    Hali tasdiqlangan xodimlar yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderStudents = () => {
    const studentRows = students.map(m => ({
      id: `api:student:${m.membership_id}`,
      membershipId: m.membership_id,
      name: m.user?.full_name || m.user?.name || '—',
      phone: m.user?.normalized_phone || m.user?.phone || '—',
      avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
      joined: (m.created_at || '').slice(0, 10),
      role: m.role || 'student',
      status: m.status || 'approved',
      groupTag: m.group_tag || '',
      isPremium: !!(m.user?.is_premium ?? m.user?.isPremium),
    }));
    const query = (debouncedStudentSearch || '').trim().toLowerCase();
    const filteredStudents = query
      ? studentRows.filter(s =>
          String(s.name).toLowerCase().includes(query) ||
          String(s.phone).toLowerCase().includes(query))
      : studentRows;
    const statusTabs = [
      { key: 'all', label: 'Barchasi' },
      { key: 'approved', label: 'Tasdiqlangan' },
      { key: 'pending', label: 'Kutilmoqda' },
    ];
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">O'quvchilar</h1>
            <p className="mt-1 text-sm font-semibold text-white/50">{center.name} ga a'zo o'quvchilar ro'yxati.</p>
          </div>
          <button
            onClick={() => { setStudentsLoading(true); loadStudents().finally(() => setStudentsLoading(false)); }}
            disabled={studentsLoading}
            className="btn-ghost inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
          >
            <Icon name="bolt" size={14} /> {studentsLoading ? 'Yangilanmoqda...' : 'Yangilash'}
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStudentStatusFilter(tab.key)}
                className={`rounded-xl px-4 py-2 text-xs font-black transition-colors ${
                  studentStatusFilter === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'border border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              className="input-field w-full py-2 pl-10 text-sm"
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
            />
          </div>
        </div>

        {studentsError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300">
            {studentsError}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-white/8 glass-strong">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                <tr className="text-[10px] font-black uppercase tracking-wider text-white/40">
                  {['Ism', 'Telefon', 'Guruh', "Qo'shilgan sana", 'Holat', 'Amal'].map(h => (
                    <th key={h} className="px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {studentsLoading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 md:py-16 text-center text-sm font-bold text-white/40">
                      Yuklanmoqda...
                    </td>
                  </tr>
                )}
                {!studentsLoading && filteredStudents.map(row => {
                  const busy = studentActionId === row.membershipId;
                  const isPending = (row.status || 'approved') === 'pending';
                  const canChangeRole = isApi && !!row.membershipId && (row.status || 'approved') === 'approved';
                  return (
                    <tr key={row.id} className="olympy-row text-sm">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.name} src={row.avatarUrl || ''} size={36} gradient="from-emerald-500 to-teal-600" premium={!!row.isPremium} />
                          <span className="font-black text-white">{row.isPremium && <span title="Premium o'quvchi">⭐ </span>}{row.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-white/55">
                        {maskPhoneDisplay(row.phone, '')}
                      </td>
                      <td className="px-5 py-4">
                        {groupTagEdit && groupTagEdit.membershipId === row.membershipId ? (
                          <input
                            autoFocus
                            className="input-field w-24 py-1 text-xs"
                            value={groupTagEdit.value}
                            placeholder="9-A"
                            maxLength={50}
                            onChange={e => setGroupTagEdit({ membershipId: row.membershipId, value: e.target.value })}
                            onBlur={() => saveGroupTag(row, groupTagEdit.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveGroupTag(row, groupTagEdit.value); if (e.key === 'Escape') setGroupTagEdit(null); }}
                          />
                        ) : (
                          <button
                            onClick={() => isApi && row.membershipId && setGroupTagEdit({ membershipId: row.membershipId, value: row.groupTag || '' })}
                            className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors ${row.groupTag ? 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25' : 'border border-dashed border-white/15 text-white/35 hover:text-white/60'}`}
                            title="Guruh/sinf tegini tahrirlash"
                          >
                            {row.groupTag || '+ guruh'}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-white/55">{row.joined ? ownerFormatDate(row.joined) : '—'}</td>
                      <td className="px-5 py-4">
                        <OwnerStatusPill status={row.status || 'approved'} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => decideStudent(row, 'approved')}
                                disabled={busy}
                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                {busy ? '...' : 'Tasdiqlash'}
                              </button>
                              <button
                                onClick={() => decideStudent(row, 'rejected')}
                                disabled={busy}
                                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                              >
                                Rad etish
                              </button>
                            </>
                          )}
                          {canChangeRole && (
                            <button
                              onClick={() => openRoleModal(row)}
                              disabled={busy}
                              className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
                            >
                              Rolni o'zgartir
                            </button>
                          )}
                          {isApi && !!row.membershipId && (
                            <button
                              onClick={() => removeStudentMember(row)}
                              disabled={busy}
                              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                            >
                              {busy ? '...' : 'Chiqarib yuborish'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!studentsLoading && filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 md:py-16 text-center text-sm font-bold text-white/40">
                      {query ? "Mos keladigan o'quvchilar topilmadi" : "O'quvchilar yo'q"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  const renderOlympiads = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Tadbirlar</h1>
        <p className="mt-1 text-sm font-semibold text-white/50">Direktor uchun tashkilotdagi olimpiada va musobaqalar ko'rinishi.</p>
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/8 glass-strong">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left">
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr className="text-[10px] font-black uppercase tracking-wider text-white/40">
                {['Nomi', 'Turi', 'Fan', 'Daraja', 'Test turi', 'Sana', 'Ishtirokchilar', 'Holat', 'Amal'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centerOlympiads.map(o => (
                <tr key={o.id} className="olympy-row text-sm">
                  <td className="px-5 py-4 font-black text-white">{o.title}</td>
                  <td className="px-5 py-4">
                    <span className={`chip ${o.eventType === 'olympiad' ? 'badge-active' : 'badge-pending'}`}>
                      {eventTypeLabel(o.eventType || 'competition')}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <SubjectBadge subject={o.subject} />
                  </td>
                  <td className="px-5 py-4">
                    {o.testLevel
                      ? <span className="chip badge-draft">{o.testLevel}</span>
                      : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    {o.testType
                      ? <span className="chip badge-active">{testTypeLabel(o.testType)}</span>
                      : <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-5 py-4 text-white/55">{o.startDate || '—'}</td>
                  <td className="px-5 py-4 font-bold text-white/75">{o.participants || 0}</td>
                  <td className="px-5 py-4">
                    <OwnerStatusPill status={o.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      {isApi ? (
                        <>
                          {/* CSV — universal import (Google Sheets/Excel). XLSX —
                              formatlangan tayyor fayl. Owner ikkala endpointga
                              ham kira oladi (backend ruxsati bir xil rollar),
                              shuning uchun ikkala tugma ham ko'rsatiladi. */}
                          <button
                            type="button"
                            onClick={() => {
                              OlympyApi.exportOlympiadResults(o.id, OlympyApi.getToken())
                                .then(() => showToast('✓ CSV fayl yuklandi'))
                                .catch(err => {
                                  console.warn('csv export failed:', err);
                                  showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "CSV yuklab bo'lmadi"}`);
                                });
                            }}
                            className="btn-ghost text-xs px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1"
                            title="Natijalarni CSV faylga eksport qilish"
                          >
                            <Icon name="download" size={12} /> CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              OlympyApi.exportOlympiadResultsXlsx(o.id, OlympyApi.getToken())
                                .then(() => showToast('✓ Excel fayl yuklandi'))
                                .catch(err => {
                                  console.warn('xlsx export failed:', err);
                                  showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Excel yuklab bo'lmadi"}`);
                                });
                            }}
                            className="btn-ghost text-xs px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1"
                            title="Natijalarni Excel (.xlsx) faylga eksport qilish"
                          >
                            <Icon name="download" size={12} /> XLSX
                          </button>
                        </>
                      ) : (
                        <span className="text-white/30 text-xs">—</span>
                      )}
                      {isApi && o.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => {
                            setLiveOlympiadId(o.id);
                            setPage('proctoring');
                          }}
                          className="btn-primary text-[11px] px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1 font-semibold"
                        >
                          <Icon name="eye" size={12} /> Jonli
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {centerOlympiads.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 md:py-16 text-center text-sm font-bold text-white/40">
                    Hali tadbirlar yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderProctoring = () => {
    const activeOlym = centerOlympiads.find(o => String(o.id) === String(liveOlympiadId));
    const searchQuery = (debouncedProctoringSearch || '').trim().toLowerCase();
    
    const filteredProctoring = searchQuery
      ? proctoringData.filter(p => {
          const name = String(p.student_name || '').toLowerCase();
          const phone = String(p.phone || '').toLowerCase();
          const reason = String(p.cheating_reason || '').toLowerCase();
          return name.includes(searchQuery) || phone.includes(searchQuery) || reason.includes(searchQuery);
        })
      : proctoringData;

    // Stats
    const totalCount = proctoringData.length;
    const onlineCount = proctoringData.filter(p => p.is_online).length;
    const completedCount = proctoringData.filter(p => p.status === 'completed').length;
    const disqualifiedCount = proctoringData.filter(p => p.status === 'disqualified').length;

    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in text-white">
        {/* Back and title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setPage('olympiads'); setLiveOlympiadId(null); }}
              className="btn-ghost p-2 rounded-xl"
              title="Orqaga"
            >
              <Icon name="arrowLeft" size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">Jonli nazorat paneli</h2>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">LIVE</span>
              </div>
              <p className="text-white/40 text-xs mt-0.5">{activeOlym?.title || 'Tadbir'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProctoring}
              disabled={proctoringLoading}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1.5"
            >
              <Icon name="bolt" size={13} /> {proctoringLoading ? 'Yangilanmoqda...' : 'Yangilash'}
            </button>
          </div>
        </div>

        {/* Stats summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 font-medium font-bold">Jami faol</div>
              <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Icon name="users" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 font-medium font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Onlayn
              </div>
              <div className="text-2xl font-black text-white mt-1">{onlineCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Icon name="check" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 font-medium font-bold text-slate-300">Tugatganlar</div>
              <div className="text-2xl font-black text-white mt-1">{completedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/45">
              <Icon name="trophy" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-white/40 font-medium font-bold text-rose-400">Diskvalifikatsiya</div>
              <div className="text-2xl font-black text-rose-400 mt-1">{disqualifiedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Icon name="info" size={18} />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex justify-between items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              className="input-field pl-10 py-2 w-full text-sm text-white bg-white/5 border border-white/10 rounded-xl"
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              value={proctoringSearch}
              onChange={e => setProctoringSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Proctoring table */}
        <div className="glass rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/2 text-[11px] font-bold text-white/40 uppercase tracking-wider">
                  {["Ism / Telefon", 'Boshlash vaqti', 'Holati', 'Javoblar', 'Tab almashish', 'Natija / Sarflangan vaqt'].map(h => (
                    <th key={h} className="text-left px-5 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProctoring.map(p => {
                  const percent = p.total_questions > 0 ? Math.round((p.answered_count / p.total_questions) * 100) : 0;
                  
                  // Status and online rendering
                  let statusBadge = null;
                  let onlineIndicator = null;
                  
                  if (p.status === 'disqualified') {
                    statusBadge = (
                      <span className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-1 text-xs font-bold text-rose-400 inline-flex items-center gap-1">
                        ⚠️ Diskvalifikatsiya
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        Qizil chiroq
                      </span>
                    );
                  } else if (p.status === 'completed') {
                    statusBadge = (
                      <span className="rounded-lg bg-indigo-500/15 border border-indigo-500/30 px-2 py-1 text-xs font-bold text-indigo-300 inline-flex items-center gap-1">
                        ✓ Yakunlandi
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs text-white/30">
                        <span className="w-2 h-2 rounded-full bg-white/20"></span>
                        Oflayn
                      </span>
                    );
                  } else {
                    // active
                    statusBadge = (
                      <span className="rounded-lg bg-cyan-500/10 border border-cyan-500/25 px-2 py-1 text-xs font-bold text-cyan-300">
                        Faol topshirmoqda
                      </span>
                    );
                    if (p.is_online) {
                      onlineIndicator = (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          Yashil chiroq (Onlayn)
                        </span>
                      );
                    } else {
                      onlineIndicator = (
                        <span className="inline-flex items-center gap-1.5 text-xs text-white/40">
                          <span className="w-2 h-2 rounded-full bg-white/30"></span>
                          Oflayn (Aloqa yo'q)
                        </span>
                      );
                    }
                  }

                  // Warnings highlighting
                  const hasEscapes = p.tab_escapes > 0;
                  const escapeTone = hasEscapes
                    ? (p.tab_escapes >= 60
                        ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                        : 'text-amber-400 bg-amber-500/10 border border-amber-500/20')
                    : 'text-white/40 bg-white/5';

                  const formattedStart = p.started_at
                    ? new Date(p.started_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '—';

                  const formattedTimeSpent = p.time_spent != null
                    ? `${Math.floor(p.time_spent / 60)} daqiqa`
                    : '—';

                  return (
                    <tr key={p.student_id} className="olympy-row hover:bg-white/1.5 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white text-sm">{p.student_name}</div>
                        <div className="text-xs text-white/40 mt-0.5">{p.phone}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-white/60">
                        {formattedStart}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div>{statusBadge}</div>
                          <div>{onlineIndicator}</div>
                          {p.cheating_reason && (
                            <div className="text-[10px] text-rose-300/80 bg-rose-950/20 px-2 py-0.5 rounded border border-rose-900/30 max-w-[200px] truncate" title={p.cheating_reason}>
                              Sabab: {p.cheating_reason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white/80">{p.answered_count} / {p.total_questions}</span>
                          <span className="text-[10px] text-white/40 font-medium">({percent}%)</span>
                        </div>
                        <div className="w-32 h-1.5 bg-white/5 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-1 ${escapeTone}`}>
                          <Icon name="info" size={11} /> {p.tab_escapes} soniya
                        </span>
                        {hasEscapes && (
                          <div className="text-[9px] text-amber-300 mt-1 font-semibold">
                            ⚠️ Tashqarida bo'lgan
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {p.status === 'completed' ? (
                          <div>
                            <span className="font-extrabold text-emerald-400 text-base">{p.score}%</span>
                            <div className="text-[10px] text-white/40 mt-0.5">Sarflandi: {formattedTimeSpent}</div>
                          </div>
                        ) : p.status === 'disqualified' ? (
                          <span className="font-bold text-rose-400 text-xs">Natija bekor qilingan</span>
                        ) : (
                          <span className="text-white/30 text-xs">Test topshirilmoqda...</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredProctoring.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-white/40 text-sm">
                      {searchQuery ? "Mos keladigan ishtirokchilar topilmadi" : "Ushbu tadbirda faol ishtirokchilar hozircha mavjud emas"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderRanking = () => {
    const rankingData = isApi && Array.isArray(apiRankingRes.data) ? apiRankingRes.data : [];
    const rankingLoading = isApi && apiRankingRes.loading && !apiRankingRes.data;
    const myCenterIds = new Set(ownerCenters.map(c => String(c.backendId ?? c.id)));
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Markazlar reytingi</h1>
            <p className="mt-1 text-sm font-semibold text-white/50">Platformadagi barcha tasdiqlangan tashkilotlar o'rtacha ball bo'yicha.</p>
          </div>
          <button
            onClick={() => apiRankingRes.reload?.()}
            className="btn-ghost inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold"
          >
            <Icon name="bolt" size={13} /> Yangilash
          </button>
        </div>
        {rankingLoading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
        <section className="overflow-hidden rounded-2xl border border-white/8 glass-strong">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                <tr className="text-[10px] font-black uppercase tracking-wider text-white/40">
                  {["O'rin", 'Markaz nomi', "O'quvchilar", 'Urinishlar', "O'rt. ball", 'Eng yuqori'].map(h => (
                    <th key={h} className="px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankingData.map(row => {
                  const isMine = myCenterIds.has(String(row.center_id));
                  return (
                    <tr
                      key={row.center_id}
                      className={`olympy-row text-sm ${isMine ? 'bg-indigo-500/10' : ''}`}
                    >
                      <td className="px-5 py-4 font-black text-white">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black ${
                          row.rank === 1 ? 'bg-amber-500/25 text-amber-300' :
                          row.rank === 2 ? 'bg-slate-400/25 text-slate-200' :
                          row.rank === 3 ? 'bg-orange-500/25 text-orange-300' :
                          'bg-white/5 text-white/55'
                        }`}>{row.rank}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-black text-white">{row.center_name}</div>
                        <div className="text-[11px] font-semibold text-white/40">
                          {row.organization_type || "Tashkilot"}{row.region ? ` · ${row.region}` : ''}{isMine ? " · Sizning markazingiz" : ''}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-bold text-white/75">{row.student_count}</td>
                      <td className="px-5 py-4 text-white/60">{row.total_attempts}</td>
                      <td className="px-5 py-4">
                        <span className={`font-black ${
                          row.average_score >= 80 ? 'text-emerald-400' :
                          row.average_score >= 60 ? 'text-cyan-400' :
                          row.average_score >= 40 ? 'text-amber-400' : 'text-white/45'
                        }`}>{row.average_score}%</span>
                      </td>
                      <td className="px-5 py-4 text-white/80 font-bold">{row.top_score}%</td>
                    </tr>
                  );
                })}
                {rankingData.length === 0 && !rankingLoading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 md:py-16 text-center text-sm font-bold text-white/40">
                      Reyting ma'lumotlari mavjud emas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  const renderCenter = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Tashkilot profili</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">O'z tashkilotingiz bo'yicha asosiy ma'lumotlar.</p>
        </div>
        {center?.status === 'approved' && (
          <button onClick={openEditCenterModal}
            className="btn-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold">
            <Icon name="edit" size={14} /> Tahrirlash
          </button>
        )}
      </div>
      <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="relative h-16 w-16 flex-shrink-0">
            {center.imageUrl ? (
              <img src={center.imageUrl} alt={center.name} className="h-16 w-16 rounded-2xl object-cover"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }} />
            ) : null}
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white ${center.imageUrl ? 'hidden' : ''}`}>{center.name[0]}</div>
            {isApi && (
              <>
                <input ref={centerImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleCenterImageUpload} />
                <button
                  onClick={() => centerImageInputRef.current?.click()}
                  disabled={centerImageLoading}
                  className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white shadow-lg hover:bg-emerald-600 disabled:opacity-60"
                  title="Tashkilot rasmini yuklash"
                >
                  <Icon name="upload" size={14} />
                </button>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-white">{center.name}</h2>
            <p className="mt-1 text-sm font-semibold text-white/50">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}</p>
          </div>
          <OwnerStatusPill status={center.status} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <OwnerMetric label="O'quvchi" value={center.students || 0} icon={<Icon name="users" size={17} />} tone="emerald" />
          <OwnerMetric label="Tadbir" value={centerOlympiads.length} icon={<Icon name="trophy" size={17} />} tone="cyan" />
          <OwnerMetric label="Xodim" value={myStaff.length} icon={<Icon name="shield" size={17} />} tone="indigo" />
          <OwnerMetric label="Reyting" value={center.rating || '—'} icon={<Icon name="star" size={17} />} tone="amber" />
        </div>
        <div className="mt-6">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-white/40">Yo'naltirilgan fanlar</div>
          <div className="flex flex-wrap gap-2">
            {(center.subjects || []).map(s => <span key={s} className="rounded-lg glass px-3 py-2 text-xs font-black text-white/70">{s}</span>)}
            {(!center.subjects || center.subjects.length === 0) && <span className="text-sm font-semibold text-white/30">Fanlar kiritilmagan</span>}
          </div>
        </div>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Sozlamalar</h1>
        <p className="mt-1 text-sm font-semibold text-white/50">Direktor paneli sozlamalari.</p>
      </div>
      <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl glass p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="feature-icon bg-gradient-to-br from-indigo-500 to-purple-600 text-white" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>
                <Icon name="shield" size={16} />
              </div>
              <div className="text-sm font-black text-white">Scope</div>
            </div>
            <div className="text-sm font-medium text-white/55">Direktor faqat o'z tashkiloti ma'lumotlarini ko'radi.</div>
          </div>
          <div className="rounded-xl glass p-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="feature-icon bg-gradient-to-br from-cyan-500 to-sky-500 text-white" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>
                <Icon name="users" size={16} />
              </div>
              <div className="text-sm font-black text-white">Xodim tasdig'i</div>
            </div>
            <div className="text-sm font-medium text-white/55">Manager va o'qituvchi arizalari direktor qarori bilan yakunlanadi.</div>
          </div>
        </div>
      </section>

      {/* F6: Branding (white-label) — markaz brend rangi. */}
      {center && (
        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="feature-icon bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white" style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}>
              <Icon name="sparkles" size={16} />
            </div>
            <div>
              <div className="text-sm font-black text-white">Brending</div>
              <div className="text-xs font-medium text-white/45">Markazingiz brend rangini sozlang.</div>
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Brend rangi</span>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColorInput}
                  onChange={e => setBrandColorInput(e.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
                  aria-label="Brend rangi"
                />
                <input
                  type="text"
                  value={brandColorInput}
                  onChange={e => setBrandColorInput(e.target.value)}
                  className="input-field w-32 font-mono uppercase"
                  placeholder="#6366F1"
                  maxLength={7}
                />
              </div>
            </label>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl border border-white/10" style={{ background: brandColorInput }} title="Oldindan ko'rish" />
              <button
                type="button"
                onClick={saveBranding}
                disabled={brandSaving}
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {brandSaving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  // ─── Statistika: o'quvchilar dinamikasi + top o'quvchilar ───────────────
  const renderStatistics = () => {
    const isStatisticsLocked = center ? !center.isPremium : false;

    // Use dummy data if statistics are locked to show a preview (teaser)
    const dummyDynamics = [
      { month: '2026-01', joined: 5, total: 20 },
      { month: '2026-02', joined: 8, total: 28 },
      { month: '2026-03', joined: 12, total: 40 },
      { month: '2026-04', joined: 15, total: 55 },
      { month: '2026-05', joined: 22, total: 77 },
      { month: '2026-06', joined: 30, total: 107 },
    ];
    const dummyTopStudents = [
      { rank: 1, name: "Aliyev Vali (Teaser)", attempts: 12, avg_score: 95.5 },
      { rank: 2, name: "Karimova Zilola (Teaser)", attempts: 10, avg_score: 92.3 },
      { rank: 3, name: "Rustamov Dilshod (Teaser)", attempts: 11, avg_score: 88.7 },
    ];
    const dummyTrend = [
      { month: '2026-01', avg_score: 64.2, attempts: 18 },
      { month: '2026-02', avg_score: 68.5, attempts: 24 },
      { month: '2026-03', avg_score: 71.1, attempts: 30 },
      { month: '2026-04', avg_score: 73.8, attempts: 41 },
      { month: '2026-05', avg_score: 77.4, attempts: 52 },
      { month: '2026-06', avg_score: 81.0, attempts: 60 },
    ];
    const dummyRegionRank = {
      average_score: 81.0, region: 'Toshkent',
      region_rank: 4, region_total: 38, global_rank: 27, global_total: 540,
    };

    const rawDynamics = Array.isArray(apiDynamicsRes.data) ? apiDynamicsRes.data : [];
    const rawTopStudents = Array.isArray(apiTopStudentsRes.data) ? apiTopStudentsRes.data : [];
    const rawTrend = Array.isArray(apiActivityTrendRes.data) ? apiActivityTrendRes.data : [];
    const rawRegionRank = (apiRegionRankRes.data && typeof apiRegionRankRes.data === 'object') ? apiRegionRankRes.data : null;

    const dynamics = isStatisticsLocked ? dummyDynamics : rawDynamics;
    const topStudents = isStatisticsLocked ? dummyTopStudents : rawTopStudents;
    const trend = isStatisticsLocked ? dummyTrend : rawTrend;
    const regionRank = isStatisticsLocked ? dummyRegionRank : rawRegionRank;

    const monthNamesShort = ['', 'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
    // SvgLineChart [{label, value (0..100), title}] formatini kutadi.
    const trendPoints = trend.map(t => {
      const [, m] = (t.month || '').split('-');
      const label = monthNamesShort[parseInt(m, 10)] || t.month;
      return { label, value: t.avg_score || 0, title: `${label}: ${t.avg_score || 0} ball (${t.attempts || 0} urinish)` };
    });
    const lastTrend = trend.length ? trend[trend.length - 1] : null;
    const prevTrend = trend.length > 1 ? trend[trend.length - 2] : null;
    const trendDelta = (lastTrend && prevTrend)
      ? Math.round((lastTrend.avg_score - prevTrend.avg_score) * 10) / 10
      : null;

    const barData = dynamics.map(d => {
      const [, m] = (d.month || '').split('-');
      const monthNames = ['', 'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
      return { label: monthNames[parseInt(m, 10)] || d.month, value: d.joined || 0 };
    });
    const medalClass = (rank) =>
      rank === 1 ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
        : rank === 2 ? 'bg-slate-300/15 text-slate-200 border border-slate-300/30'
          : rank === 3 ? 'bg-amber-700/15 text-amber-500 border border-amber-700/30'
            : 'glass text-white/40 border border-white/5';
    return (
      <div className="space-y-5 p-4 lg:p-6 relative">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Statistika</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">{center.name} bo'yicha o'sish va eng yaxshi o'quvchilar.</p>
        </div>

        <div className={`space-y-5 ${isStatisticsLocked ? 'blur-[6px] select-none pointer-events-none' : ''}`}>
          {/* Markaz faollik trendi — oylik o'rtacha ball */}
          <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-white">Markaz faollik trendi</h2>
              <span className="text-xs font-semibold text-white/45">Oylik o'rtacha ball</span>
            </div>
            {apiActivityTrendRes.loading && !isStatisticsLocked ? (
              <div className="text-center text-white/40 text-sm py-8">Yuklanmoqda...</div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-end gap-x-6 gap-y-2">
                  <div>
                    <div className="text-2xl font-black text-white">{lastTrend ? lastTrend.avg_score : 0}</div>
                    <div className="text-[11px] font-semibold text-white/40">joriy oy o'rt. ball</div>
                  </div>
                  {trendDelta !== null && (
                    <div className={`flex items-center gap-1 text-sm font-black ${trendDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <span>{trendDelta >= 0 ? '▲' : '▼'}</span>
                      {trendDelta >= 0 ? '+' : ''}{trendDelta}
                      <span className="text-[11px] font-semibold text-white/40">o'tgan oyga nisbatan</span>
                    </div>
                  )}
                </div>
                <SvgLineChart points={trendPoints} height={170} stroke="#a855f7" />
              </>
            )}
          </section>

          {/* Hudud bo'yicha anonim o'rin */}
          {regionRank && (
            <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-white">Reytingdagi o'rningiz</h2>
                <span className="text-xs font-semibold text-white/45">{regionRank.average_score} o'rt. ball asosida</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-gradient-to-br from-indigo-500/15 to-purple-500/10 border border-indigo-400/20 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-300/80">
                    {regionRank.region ? `${regionRank.region} hududida` : 'Hudud ko\'rsatilmagan'}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white">{regionRank.region_rank ? `#${regionRank.region_rank}` : '—'}</span>
                    {regionRank.region_total ? <span className="text-sm font-semibold text-white/45">/ {regionRank.region_total} markaz</span> : null}
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/8 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-white/45">Umumiy reytingda</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-3xl font-black text-white">{regionRank.global_rank ? `#${regionRank.global_rank}` : '—'}</span>
                    {regionRank.global_total ? <span className="text-sm font-semibold text-white/45">/ {regionRank.global_total} markaz</span> : null}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-white/35">
                O'rin o'rtacha ball bo'yicha aniqlanadi. Boshqa markazlar nomi yashirin.
              </p>
            </section>
          )}

          {/* 6. O'quvchilar dinamikasi grafigi */}
          <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-white">O'quvchilar dinamikasi</h2>
              <span className="text-xs font-semibold text-white/45">Oxirgi 6 oyda qo'shilganlar</span>
            </div>
            {apiDynamicsRes.loading && !isStatisticsLocked
              ? <div className="text-center text-white/40 text-sm py-8">Yuklanmoqda...</div>
              : <MonthBarChart data={barData} />}
            {dynamics.length > 0 && (
              <div className="mt-3 text-xs font-semibold text-white/45">
                Jami tasdiqlangan o'quvchilar: <span className="text-white font-black">{dynamics[dynamics.length - 1]?.total || 0}</span>
              </div>
            )}
          </section>

          {/* 7. Top-10 o'quvchi karti */}
          <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-black text-white">Top o'quvchilar</h2>
              <span className="text-xs font-semibold text-white/45">O'rtacha ball bo'yicha</span>
            </div>
            {apiTopStudentsRes.loading && !isStatisticsLocked ? (
              <div className="text-center text-white/40 text-sm py-8">Yuklanmoqda...</div>
            ) : topStudents.length === 0 ? (
              <EmptyState icon="trophy" title="Hali natijalar yo'q" desc="O'quvchilar olimpiadalarda qatnashgach shu yerda chiqadi." />
            ) : (
              <div className="space-y-2.5">
                {topStudents.map(s => (
                  <div key={s.rank} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/5 p-3">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-black ${medalClass(s.rank)}`}>
                      {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-white">{s.name}</div>
                      <div className="text-[11px] font-semibold text-white/40">{s.attempts} ta tadbir</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-base font-black text-indigo-300">{s.avg_score}</div>
                      <div className="text-[10px] font-semibold text-white/40">o'rt. ball</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {isStatisticsLocked && (
          <div className="absolute inset-x-4 bottom-4 top-24 z-10 flex flex-col items-center justify-center bg-slate-900/80 rounded-2xl p-6 text-center border border-white/5 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/20 mb-4 animate-bounce">
              <Icon name="star" size={32} />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Tashkilot tahlillari faqat Premium obunachilar uchun ochiq</h3>
            <p className="text-white/75 text-sm max-w-sm mx-auto mb-6 leading-relaxed">
              O'quvchilar o'sish dinamikasi, top o'quvchilar reytingi va boshqa ko'rsatkichlarni ko'rish uchun Premium obunani faollashtiring.
            </p>
            <button
              onClick={() => setPage('premium')}
              className="btn-primary px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-sm shadow-xl shadow-indigo-600/30 hover:scale-105 transition-transform animate-pulse"
            >
              <Icon name="star" size={16} /> Premium Obuna sahifasiga o'tish
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Savol banki (9-funksiya) ───────────────────────────────────────────
  const renderQuestionBank = () => {
    const setOpt = (idx, patch) => setQbForm(f => ({
      ...f,
      options: f.options.map((o, i) => i === idx ? { ...o, ...patch } : o),
    }));
    const addOpt = () => setQbForm(f => ({ ...f, options: [...f.options, { text: '', correct: false }] }));
    const removeOpt = (idx) => setQbForm(f => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
    const setCorrect = (idx) => setQbForm(f => ({ ...f, options: f.options.map((o, i) => ({ ...o, correct: i === idx })) }));
    const difficultyLabel = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin' };
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Savol banki</h1>
          <p className="mt-1 text-sm font-semibold text-white/50">{center.name} ning shaxsiy savollar zaxirasi.</p>
        </div>

        {/* Savol qo'shish forma */}
        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6 space-y-3">
          <h2 className="text-base font-black text-white">Yangi savol</h2>
          <textarea
            className="input-field w-full py-2.5 text-sm"
            rows={2}
            placeholder="Savol matni..."
            value={qbForm.text}
            onChange={e => setQbForm(f => ({ ...f, text: e.target.value }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="input-field w-full py-2 text-sm"
              placeholder="Fan (masalan: Matematika)"
              value={qbForm.subject}
              onChange={e => setQbForm(f => ({ ...f, subject: e.target.value }))}
            />
            <select
              className="input-field w-full py-2 text-sm"
              value={qbForm.difficulty}
              onChange={e => setQbForm(f => ({ ...f, difficulty: e.target.value }))}
            >
              <option value="easy">Oson</option>
              <option value="medium">O'rta</option>
              <option value="hard">Qiyin</option>
            </select>
          </div>
          <div className="space-y-2">
            {qbForm.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrect(i)}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-black ${o.correct ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'border border-white/15 text-white/40'}`}
                  title="To'g'ri variant"
                >
                  {o.correct ? '✓' : ''}
                </button>
                <input
                  className="input-field w-full py-1.5 text-sm"
                  placeholder={`${i + 1}-variant`}
                  value={o.text}
                  onChange={e => setOpt(i, { text: e.target.value })}
                />
                {qbForm.options.length > 2 && (
                  <button type="button" onClick={() => removeOpt(i)} className="flex-shrink-0 text-rose-300 hover:text-rose-200">
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={addOpt} className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-bold">+ Variant qo'shish</button>
          </div>
          <button onClick={addQbQuestion} disabled={qbSaving} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-black disabled:opacity-50">
            {qbSaving ? 'Saqlanmoqda...' : 'Bankka qo\'shish'}
          </button>
        </section>

        {/* Saqlangan savollar */}
        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
          <h2 className="mb-4 text-base font-black text-white">Saqlangan savollar ({questionBank.length})</h2>
          {questionBankLoading ? (
            <div className="text-center text-white/40 text-sm py-8">Yuklanmoqda...</div>
          ) : questionBank.length === 0 ? (
            <EmptyState icon="file" title="Bank bo'sh" desc="Yuqoridagi forma orqali savol qo'shing." />
          ) : (
            <div className="space-y-3">
              {questionBank.map(q => (
                <div key={q.id} className="rounded-xl bg-white/5 border border-white/5 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white break-words">{q.text}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(q.options || []).map((o, i) => (
                          <span key={i} className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${o.correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-white/50'}`}>
                            {o.correct ? '✓ ' : ''}{o.text}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-white/35">
                        {q.subject && <span>{q.subject}</span>}
                        <span>{difficultyLabel[q.difficulty] || q.difficulty}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteQbQuestion(q.id)} className="flex-shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20">
                      O'chirish
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderShop = () => {
    const addFeature = () => setShopForm(f => ({ ...f, features: [...(f.features || []), ''] }));
    const setFeature = (idx, val) => setShopForm(f => ({ ...f, features: (f.features || []).map((x, i) => i === idx ? val : x) }));
    const removeFeature = (idx) => setShopForm(f => ({ ...f, features: (f.features || []).filter((_, i) => i !== idx) }));
    const onPickImage = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('Rasm 5 MB dan oshmasligi kerak'); return; }
      setShopForm(f => ({ ...f, imageFile: file, image_url: URL.createObjectURL(file) }));
    };
    const isEdit = shopModal && shopModal !== 'new';
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Mukofotlar do'koni</h1>
            <p className="mt-1 text-sm font-semibold text-white/50">{center.name} o'quvchilari tangalarini almashtiradigan sovg'alar.</p>
          </div>
          <button onClick={() => openShopModal(null)} className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black self-start">
            <Icon name="plus" size={15} /> Yangi mahsulot
          </button>
        </div>

        <section className="rounded-2xl border border-white/8 glass-strong p-5 lg:p-6">
          <h2 className="mb-4 text-base font-black text-white">Mahsulotlar ({shopProducts.length})</h2>
          {shopLoading ? (
            <div className="text-center text-white/40 text-sm py-8">Yuklanmoqda...</div>
          ) : shopProducts.length === 0 ? (
            <EmptyState icon="award" title="Do'kon bo'sh" desc="Yuqoridagi tugma orqali birinchi mahsulotni qo'shing." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shopProducts.map(p => {
                const features = Array.isArray(p.features) ? p.features : [];
                return (
                  <div key={p.id} className={`rounded-xl border p-3.5 flex flex-col gap-3 ${p.is_active ? 'border-white/8 bg-white/5' : 'border-white/5 bg-white/[0.02] opacity-70'}`}>
                    <div className="flex items-start gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{p.icon || '🎁'}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-black text-white">{p.title}</div>
                          {!p.is_active && <span className="flex-shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-black uppercase text-white/40">Nofaol</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-white/40">
                          <span className="text-amber-300">🪙 {p.coin_cost}</span>
                          <span>·</span>
                          <span>Zaxira: {p.stock}</span>
                        </div>
                      </div>
                    </div>
                    {p.description && <p className="text-xs leading-relaxed text-white/45 line-clamp-2">{p.description}</p>}
                    {features.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {features.map((f, i) => (
                          <span key={i} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">
                            {typeof f === 'string' ? f : (f?.value || '')}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-2 border-t border-white/5 pt-3">
                      <button onClick={() => openShopModal(p)} className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10">
                        Tahrirlash
                      </button>
                      <button onClick={() => toggleShopActive(p)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/10" title={p.is_active ? 'Nofaol qilish' : 'Faollashtirish'}>
                        {p.is_active ? 'Yashirish' : "Ko'rsatish"}
                      </button>
                      <button onClick={() => deleteShopProduct(p.id)} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {shopModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeShopModal}>
            <div className="modal w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <h2 className="text-lg font-black text-white">{isEdit ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
                <button type="button" onClick={closeShopModal} className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white">
                  <Icon name="x" size={18} />
                </button>
              </div>
              <div className="space-y-4">
                {/* Rasm */}
                <div className="flex items-center gap-3">
                  {shopForm.image_url ? (
                    <img src={shopForm.image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-white/5 text-2xl">{shopForm.icon || '🎁'}</div>
                  )}
                  <label className="btn-ghost cursor-pointer rounded-lg px-3 py-2 text-xs font-bold">
                    Rasm yuklash
                    <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                  </label>
                  {shopForm.image_url && (
                    <button type="button" onClick={() => setShopForm(f => ({ ...f, imageFile: null, image_url: '' }))} className="text-xs font-bold text-rose-300 hover:text-rose-200">O'chirish</button>
                  )}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Nom</span>
                  <input value={shopForm.title} onChange={e => setShopForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="Masalan, ProSkill futbolkasi" autoFocus />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tavsif</span>
                  <textarea value={shopForm.description} onChange={e => setShopForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={2} placeholder="Mahsulot haqida qisqacha..." />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tanga</span>
                    <input type="number" min={0} value={shopForm.coin_cost} onChange={e => setShopForm(f => ({ ...f, coin_cost: e.target.value }))} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Zaxira</span>
                    <input type="number" min={0} value={shopForm.stock} onChange={e => setShopForm(f => ({ ...f, stock: e.target.value }))} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Belgi</span>
                    <input value={shopForm.icon} onChange={e => setShopForm(f => ({ ...f, icon: e.target.value }))} className="input-field text-center" maxLength={4} placeholder="🎁" />
                  </label>
                </div>
                {/* Xususiyatlar */}
                <div className="space-y-2">
                  <span className="block text-xs font-black uppercase text-white/40">Xususiyatlar</span>
                  {(shopForm.features || []).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={typeof f === 'string' ? f : (f?.value || '')} onChange={e => setFeature(i, e.target.value)} className="input-field w-full py-1.5 text-sm" placeholder="Masalan, Hajmi: L" />
                      <button type="button" onClick={() => removeFeature(i)} className="flex-shrink-0 text-rose-300 hover:text-rose-200">
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addFeature} className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-bold">+ Xususiyat qo'shish</button>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={!!shopForm.is_active} onChange={e => setShopForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded accent-indigo-500" />
                  <span className="text-sm font-bold text-white/70">Faol (o'quvchilarga ko'rinadi)</span>
                </label>
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={submitShopProduct} disabled={shopSaving} className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-black disabled:opacity-50">
                  {shopSaving ? 'Saqlanmoqda...' : (isEdit ? 'Saqlash' : "Qo'shish")}
                </button>
                <button onClick={closeShopModal} className="btn-ghost rounded-xl px-5 py-2.5 text-sm font-bold">Bekor qilish</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPremium = () => {
    const pricing = (plans && plans.length) ? plans : FALLBACK_ORGANIZATION_PRICING;
    const activePlans = pricing.filter(p => p.duration_days === durationFilter);
    return (
      <div className="space-y-6 p-4 lg:p-6 animate-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass rounded-3xl p-6 border border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-purple-500/5">
          <div>
            <h2 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
              <span>Tashkilot Premium Obuna</span>
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md">ORGANIZATION</span>
            </h2>
            <p className="text-white/40 text-xs mt-0.5">Tashkilotingizni premium qilish orqali cheksiz olimpiadalar, tahlillar va AI savollar bazasini ishga tushiring.</p>
          </div>
          <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 px-4 py-2.5 rounded-2xl self-start sm:self-auto shadow-md">
            <span className="text-lg">🏢</span>
            <div className="min-w-0">
              <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-black leading-none">Tashkilot holati</div>
              <div className="text-sm font-black text-indigo-300 leading-none mt-1">
                {center?.isPremium ? "Faol (Premium 👑)" : "Bepul rejim"}
              </div>
            </div>
          </div>
        </div>

        {/* Limit indikatorlari: Talabalar/Ustozlar/Olimpiadalar — joriy/limit
            progress bar bilan. 80% dan oshganda "Limit tugayapti" ogohlantirishi. */}
        {limits && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { key: 'students', label: "Talabalar", icon: '🎓' },
              { key: 'teachers', label: "Ustozlar", icon: '👨‍🏫' },
              { key: 'olympiads', label: "Olimpiadalar (oy)", icon: '🏆' },
            ].map(({ key, label, icon }) => {
              const b = limits[key] || {};
              const used = b.used || 0;
              const unlimited = !!b.unlimited;
              const limit = b.limit;
              const pct = (!unlimited && limit > 0) ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              const near = !!b.near_limit;
              const full = !unlimited && limit > 0 && used >= limit;
              const barColor = full ? 'bg-rose-500' : near ? 'bg-amber-500' : 'bg-indigo-500';
              return (
                <div key={key} className="glass rounded-2xl p-4 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white/60 flex items-center gap-1.5">
                      <span>{icon}</span> {label}
                    </span>
                    <span className="text-sm font-black text-white">
                      {used}{unlimited ? '' : ` / ${limit}`}
                      {unlimited && <span className="ml-1 text-indigo-300">∞</span>}
                    </span>
                  </div>
                  {!unlimited && (
                    <div className="mt-2.5 h-2 w-full rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  {near && !full && (
                    <div className="mt-2 text-[10px] font-bold text-amber-300">⚠️ Limit tugayapti</div>
                  )}
                  {full && (
                    <div className="mt-2 text-[10px] font-bold text-rose-300">Limit to'ldi — tarifni yangilang</div>
                  )}
                  {unlimited && (
                    <div className="mt-2 text-[10px] font-bold text-indigo-300">Cheksiz</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Muddat selectorlari (1, 3, 6, 12 oy) */}
        <div className="flex gap-2.5 flex-wrap justify-start">
          {[
            { label: '1 oy', days: 30 },
            { label: '3 oy', days: 90, discount: '10%' },
            { label: '6 oy', days: 180, discount: '20%' },
            { label: '1 yil', days: 365, discount: '30%' },
          ].map((dur) => (
            <button
              key={dur.days}
              type="button"
              onClick={() => setDurationFilter(dur.days)}
              className={`relative px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                durationFilter === dur.days
                  ? 'bg-white text-indigo-950 border-white shadow-lg font-black'
                  : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
              }`}
            >
              {dur.label}
              {dur.discount && (
                <span className="absolute -top-2 -right-2 bg-gradient-to-r from-pink-500 to-rose-500 text-[7px] text-white px-1 py-0.2 rounded font-extrabold shadow animate-pulse">
                  -{dur.discount}
                </span>
              )}
            </button>
          ))}
        </div>

        {plansLoading ? (
          <div className="text-center py-12 text-white/40 text-sm">Tariflar yuklanmoqda...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {activePlans.map((p, i) => {
              const priceNum = Number(p.price) || 0;
              const formattedPrice = `${priceNum.toLocaleString('ru-RU').replace(/ /g, ' ')} UZS`;
              const features = Array.isArray(p.features) ? p.features : [];
              return (
                <div 
                  key={i} 
                  className={`glass rounded-2xl p-5 flex flex-col justify-between border ${p.is_popular ? 'border-indigo-500/40 bg-indigo-500/5 shadow-[0_12px_24px_rgba(99,102,241,0.06)]' : 'border-white/5'}`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-white">{p.name.split(' ')[0]}</div>
                      {p.is_popular && <span className="bg-indigo-500/20 text-indigo-300 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-indigo-500/30">Mashhur</span>}
                    </div>
                    <div className="text-2xl font-black text-indigo-400">{formattedPrice}</div>
                    <p className="text-white/40 text-xs">{p.description}</p>
                    <ul className="space-y-2 border-t border-white/5 pt-4">
                      {features.map((f, idx) => (
                        <li key={idx} className="text-xs text-white/60 flex items-center gap-1.5">
                          <span className="text-indigo-400 font-bold">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentPlan(p)}
                    className="w-full mt-6 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 transition-colors"
                  >
                    Sotib olish
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const pagesMap = {
    home: renderHome,
    requests: renderRequests,
    staff: renderStaff,
    students: renderStudents,
    olympiads: renderOlympiads,
    questionbank: renderQuestionBank,
    statistics: renderStatistics,
    ranking: renderRanking,
    center: renderCenter,
    settings: renderSettings,
    proctoring: renderProctoring,
    shop: renderShop,
    premium: renderPremium,
    myprofile: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} />,
  };

  // Mobile bottom navigation uchun eng muhim 4 ta sahifa.
  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'requests'),
    navItems.find(n => n.key === 'staff'),
    navItems.find(n => n.key === 'olympiads'),
  ].filter(Boolean);

  return (
    <div className="h-screen overflow-hidden text-white" style={{ background: '#050508' }}>
      {mobileMenu && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileMenu(false)}
          style={{ background: 'rgba(0,0,0,0.78)' }}
        />
      )}
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-x-hidden overflow-y-auto mobile-content-pad">
            {(pagesMap[page] || renderHome)()}
          </main>
          <MobileBottomNav items={mobileNavItems} activePage={page} setPage={setPageOrSpecial} />
        </div>
      </div>
      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form onSubmit={submitStaff} className="modal w-full max-w-md">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">{staffRole === 'teacher' ? 'Ustoz yaratish' : 'Menejer yaratish'}</h2>
                <div className="mt-1 text-xs font-bold text-white/50">{center.name}</div>
              </div>
              <button type="button" onClick={closeStaffModal} className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Ism familiya</span>
                <input
                  value={staffForm.full_name}
                  onChange={e => updateStaffForm('full_name', e.target.value)}
                  className="input-field"
                  placeholder="Masalan, Aziz Karimov"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Telefon login</span>
                <PhoneField
                  value={staffForm.phone}
                  onChange={phone => updateStaffForm('phone', phone)}
                  placeholder="901112233"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Parol</span>
                <input
                  value={staffForm.password}
                  onChange={e => updateStaffForm('password', e.target.value)}
                  className="input-field"
                  placeholder="Kamida 6 belgi"
                  type="text"
                />
              </label>
              {staffRole === 'teacher' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Fan</span>
                  <select
                    value={staffForm.subject}
                    onChange={e => updateStaffForm('subject', e.target.value)}
                    className="input-field"
                  >
                    <option value="">Fan tanlanmagan</option>
                    {store.subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeStaffModal} className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-sm font-black text-white/60 hover:bg-white/5">
                Bekor qilish
              </button>
              <button disabled={staffSaving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {staffSaving ? 'Yaratilmoqda...' : 'Yaratish'}
              </button>
            </div>
          </form>
        </div>
      )}
      {roleModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal w-full max-w-md">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">Rolni o'zgartirish</h2>
                <div className="mt-1 text-xs font-bold text-white/50">{roleModalRow.name || 'Foydalanuvchi'}</div>
              </div>
              <button
                type="button"
                onClick={closeRoleModal}
                disabled={roleModalSaving}
                className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <span className="block text-xs font-black uppercase text-white/40">Yangi rol</span>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: 'student', label: "O'quvchi" },
                  { value: 'teacher', label: "O'qituvchi" },
                  { value: 'manager', label: 'Menejer' },
                ].map(opt => {
                  const isCurrent = opt.value === roleModalRow.role;
                  const isSelected = opt.value === roleModalNewRole;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isCurrent || roleModalSaving}
                      onClick={() => { setRoleModalNewRole(opt.value); setRoleModalError(''); }}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-bold transition-colors ${
                        isCurrent
                          ? 'cursor-not-allowed border-white/10 bg-white/5 text-white/30'
                          : isSelected
                            ? 'border-indigo-500/50 bg-indigo-500/15 text-white'
                            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isCurrent && <span className="text-[10px] uppercase text-white/30">Joriy rol</span>}
                      {!isCurrent && isSelected && <Icon name="check" size={16} />}
                    </button>
                  );
                })}
              </div>
              {roleModalError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
                  {roleModalError}
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={closeRoleModal}
                disabled={roleModalSaving}
                className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-sm font-black text-white/60 hover:bg-white/5 disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={submitRoleChange}
                disabled={roleModalSaving || roleModalNewRole === roleModalRow.role}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {roleModalSaving ? "O'zgartirilmoqda..." : "O'zgartirish"}
              </button>
            </div>
          </div>
        </div>
      )}
      {centerModal && (
        // Owner dashboard markaz qo'shish/tahrirlash modali. Avval bu modal
        // light theme'da (bg-white, slate-200 border) ko'rinardi va qolgan dark
        // dashboard'dan ajralib turardi. Endi dark theme'ga moslashtirilgan.
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={submitCenter} className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">{editingCenterId ? 'Tashkilotni tahrirlash' : "Yangi tashkilot qo'shish"}</h2>
                <div className="mt-1 text-xs font-bold text-white/50">{editingCenterId ? "Ma'lumotlarni yangilang va saqlang" : "Ariza Platform Admin tasdig'iga yuboriladi"}</div>
              </div>
              <button type="button" onClick={closeCenterModal} className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tashkilot turi</span>
                <select
                  value={centerForm.organizationType}
                  onChange={e => setCenterForm(prev => ({
                    ...prev,
                    organizationType: e.target.value,
                    customOrganizationType: e.target.value === 'Boshqa' ? prev.customOrganizationType : '',
                  }))}
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                >
                  {centerOrganizationTypes.map(type => <option key={type} value={type} style={{ background: '#12141a' }}>{type}</option>)}
                </select>
              </label>
              {centerForm.organizationType === 'Boshqa' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tashkilot turini yozing</span>
                  <input
                    value={centerForm.customOrganizationType}
                    onChange={e => updateCenterForm('customOrganizationType', e.target.value)}
                    className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                    placeholder="Masalan, Respublika markazi"
                  />
                </label>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Davlat</span>
                  <select
                    value={centerForm.country}
                    onChange={e => updateCenterForm('country', e.target.value)}
                    className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                  >
                    <option value="O'zbekiston" style={{ background: '#12141a' }}>O'zbekiston</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Viloyat</span>
                  <select
                    value={centerForm.region}
                    onChange={e => setCenterForm(prev => ({ ...prev, region: e.target.value, district: '' }))}
                    className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                  >
                    <option value="" style={{ background: '#12141a' }}>Viloyatni tanlang</option>
                    {centerRegions.map(region => <option key={region} value={region} style={{ background: '#12141a' }}>{region}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tuman/Shahar</span>
                <select
                  value={centerForm.district}
                  disabled={!centerForm.region}
                  onChange={e => updateCenterForm('district', e.target.value)}
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 disabled:opacity-50"
                >
                  <option value="" style={{ background: '#12141a' }}>{centerForm.region ? 'Tumanni tanlang' : 'Avval viloyatni tanlang'}</option>
                  {centerDistrictOptions.map(district => <option key={district} value={district} style={{ background: '#12141a' }}>{district}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-white/40">Tashkilot nomi</span>
                <input
                  value={centerForm.name}
                  onChange={e => updateCenterForm('name', e.target.value)}
                  className="h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
                  placeholder="Masalan, ProSkill Language"
                  autoFocus
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-black uppercase text-white/40">Yo'naltirilgan fanlar</span>
                <div className="flex flex-wrap gap-2">
                  {store.subjects.map(subject => {
                    const active = centerForm.subjects.includes(subject);
                    return (
                      <button
                        key={subject}
                        type="button"
                        onClick={() => setCenterForm(prev => ({
                          ...prev,
                          subjects: active ? prev.subjects.filter(s => s !== subject) : [...prev.subjects, subject],
                        }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-black ring-1 transition ${active ? 'bg-indigo-600 text-white ring-indigo-500' : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10'}`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeCenterModal} className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-sm font-black text-white/70 hover:bg-white/5">
                Bekor qilish
              </button>
              <button disabled={centerSaving} className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                {centerSaving ? 'Saqlanmoqda...' : (editingCenterId ? 'Saqlash' : 'Arizani yuborish')}
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white shadow-2xl"
          style={{ background: 'rgba(13, 14, 18, 0.98)' }}
        >
          {toast}
        </div>
      )}

      {/* Tasdiqlash modali — Telegram WebApp'da window.confirm() o'rniga */}
      <ConfirmModal
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          const cb = confirmDialog?.onConfirm;
          setConfirmDialog(null);
          cb?.();
        }}
        title={confirmDialog?.title || 'Tasdiqlaysizmi?'}
        message={confirmDialog?.message || ''}
        confirmText={confirmDialog?.confirmText || 'Ha'}
        danger
      />

      {/* F1: B2B markaz onboarding sehrgari (3 qadam). */}
      {onboardingOpen && (() => {
        const steps = [
          {
            icon: 'building',
            title: 'Markazingizni sozlang',
            desc: "Markaz ma'lumotlarini to'ldiring — nomi, logosi va joylashuvi o'quvchilarga ko'rinadi.",
            cta: 'Keyingi',
            action: () => setOnboardingStep(1),
          },
          {
            icon: 'trophy',
            title: 'Birinchi olimpiada yarating',
            desc: "O'quvchilaringiz qatnashishi uchun birinchi olimpiada yoki musobaqa tashkil qiling.",
            cta: 'Olimpiada yaratish',
            action: () => { finishCenterOnboarding(); setPage('olympiads'); },
          },
          {
            icon: 'users',
            title: "O'quvchilarni qo'shing",
            desc: "O'quvchilarni markazingizga taklif qiling — ular arizalarini yuborib qatnasha boshlaydi.",
            cta: "O'quvchilarni boshqarish",
            action: () => { finishCenterOnboarding(); setPage('students'); },
          },
        ];
        const step = steps[onboardingStep] || steps[0];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
            <div className="modal w-full max-w-md">
              {/* Markaz logosi/nomi — mavjud markaz ma'lumotidan. */}
              {center && (
                <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/8 glass p-3">
                  {center.imageUrl ? (
                    <img src={center.imageUrl} alt={center.name} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl gradient-bg text-sm font-bold text-white">{(center.name || '?')[0]}</div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-white">{center.name}</div>
                    <div className="truncate text-xs font-semibold text-white/45">{center.organizationType || "O'quv markaz"}</div>
                  </div>
                </div>
              )}

              <div className="mb-1 flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= onboardingStep ? 'bg-indigo-500' : 'bg-white/10'}`} />
                ))}
              </div>
              <div className="mb-4 text-[11px] font-bold uppercase tracking-wide text-white/40">Qadam {onboardingStep + 1} / {steps.length}</div>

              <div className="mb-5 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                  <Icon name={step.icon} size={26} />
                </div>
                <h2 className="text-lg font-black text-white">{step.title}</h2>
                <p className="mt-1.5 text-sm font-medium text-white/55">{step.desc}</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={finishCenterOnboarding}
                  disabled={onboardingSaving}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-sm font-black text-white/60 hover:bg-white/5 disabled:opacity-50"
                >
                  O'tkazib yuborish
                </button>
                <button
                  type="button"
                  onClick={step.action}
                  disabled={onboardingSaving}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {step.cta}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {paymentPlan && (
        <Modal 
          open={!!paymentPlan} 
          onClose={() => { setPaymentPlan(null); setPaymentError(''); }} 
          title="To'lov usulini tanlang"
          width="max-w-md"
        >
          <div className="space-y-6 text-left">
            <div className="rounded-2xl bg-white/5 p-4 border border-white/10">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-white/40">Tanlangan tarif</span>
                <span className="text-xs text-indigo-300 font-bold">Tashkilot</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold text-white">{paymentPlan.name}</span>
                <span className="text-lg font-black text-indigo-400">
                  {Number(paymentPlan.price).toLocaleString('ru-RU').replace(/ /g, ' ')} UZS
                </span>
              </div>
            </div>

            {paymentError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-3 text-xs text-rose-300">
                {paymentError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                disabled={paymentLoading}
                onClick={() => handleCreatePayment('click')}
                className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all group min-h-[100px]"
              >
                <span className="text-sm font-black text-[#00a3ff] group-hover:scale-105 transition-transform">CLICK</span>
                <span className="text-[10px] text-white/30 mt-2">Click Up / Click Evolution</span>
              </button>
              <button
                type="button"
                disabled={paymentLoading}
                onClick={() => handleCreatePayment('payme')}
                className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-indigo-500/30 transition-all group min-h-[100px]"
              >
                <span className="text-sm font-black text-[#00c9c9] group-hover:scale-105 transition-transform">Payme</span>
                <span className="text-[10px] text-white/30 mt-2">Payme Checkout</span>
              </button>
            </div>

            {paymentLoading && (
              <div className="text-center text-xs text-white/40 animate-pulse">To'lov sahifasiga yo'naltirilmoqda...</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

Object.assign(window, { OwnerDashboard });
