// pages/AdminDashboard.jsx

const formatAdminDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
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

const AdminMetricCard = ({ label, value, delta, icon, tone = 'indigo' }) => {
  const tones = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)]',
    rose: 'text-purple-400 bg-purple-500/10 border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20 shadow-[0_0_15px_rgba(56,189,248,0.05)]',
  };
  return (
    <GlowCard className="admin-card p-4 relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5">
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


const AdminDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [toast, setToast] = React.useState('');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [blockModal, setBlockModal] = React.useState(null);
  const [blockedIds, setBlockedIds] = React.useState({});
  const [newSubjectName, setNewSubjectName] = React.useState('');
  // Topbar global qidiruv — foydalanuvchi/tashkilot/olimpiada nomi bo'yicha
  // joriy ko'rinayotgan jadvalga ta'sir qiladi (avval onChange yo'q edi).
  const [globalSearch, setGlobalSearch] = React.useState('');
  // Foydalanuvchilar sahifasi uchun alohida qidiruv input.
  const [userSearch, setUserSearch] = React.useState('');

  // Profile settings state
  const [editFirstName, setEditFirstName] = React.useState('');
  const [editLastName, setEditLastName] = React.useState('');
  const [editUsername, setEditUsername] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);

  // Password settings state
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [savingPassword, setSavingPassword] = React.useState(false);

  React.useEffect(() => {
    if (user) {
      setEditFirstName(user.first_name || '');
      setEditLastName(user.last_name || '');
      setEditUsername(user.username || '');
      setEditPhone(user.phone || '');
    }
  }, [user]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!editPhone.trim()) {
      showToast("Telefon raqami bo'sh bo'lishi mumkin emas!");
      return;
    }
    setSavingProfile(true);
    try {
      if (isApi) {
        const token = OlympyApi.getToken();
        const payload = {
          first_name: editFirstName,
          last_name: editLastName,
          username: editUsername,
          phone: editPhone
        };
        const updated = await OlympyApi.updateProfile(payload, token);
        showToast("Profil ma'lumotlari muvaffaqiyatli saqlandi!");
        if (updated && updated.phone) {
          // Update localized user state dynamically if needed
          user.first_name = updated.first_name;
          user.last_name = updated.last_name;
          user.username = updated.username;
          user.phone = updated.phone;
          user.full_name = updated.full_name;
        }
      } else {
        showToast("Profil ma'lumotlari yangilandi (Mock)!");
      }
    } catch (err) {
      const errMsg = err?.message || err?.detail || "Xatolik yuz berdi";
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
      const errMsg = err?.message || err?.detail || "Xatolik yuz berdi";
      showToast(`Xatolik: ${errMsg}`);
    } finally {
      setSavingPassword(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

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

  const apiCenters = isApi && Array.isArray(apiCentersRes.data)
    ? apiCentersRes.data.map(mapApiCenter)
    : null;
  const rawCenters = apiCenters || store.centers;
  const centers = rawCenters.filter(c => c.status !== 'rejected');
  const approvedCenters = centers.filter(c => c.status === 'approved');
  const pendingCenters = centers.filter(c => c.status === 'pending');
  const apiAllUsers = isApi && Array.isArray(apiUsersRes.data)
    ? apiUsersRes.data.map(OlympyApi.mapBackendUser)
    : null;
  const allUsers = apiAllUsers || store.users;
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
      OlympyApi.adminRejectCenter(backendCenterId, OlympyApi.getToken())
        .then(() => { showToast('Tashkilot rad etildi va ro\'yxatlardan olib tashlandi'); reloadAdminData(); })
        .catch(err => { console.warn('adminRejectCenter failed:', err); showToast('Rad etib bo\'lmadi'); });
      return;
    }
    const req = store.requests.find(r => r.type === 'center' && r.centerId === center.id && r.status === 'pending');
    if (req) OlympyStore.rejectRequest(req.id);
    else OlympyStore.updateCenter(center.id, { status: 'rejected' });
    showToast('Tashkilot rad etildi va ro\'yxatlardan olib tashlandi');
  };

  const approveCenterReq = (req) => {
    const center = resolveCenterFromRequest(req);
    if (center) approveCenterDirect(center);
  };

  const rejectCenterReq = (req) => {
    const center = resolveCenterFromRequest(req);
    if (center) rejectCenterDirect(center);
  };

  const toggleBlock = (row) => {
    if (isApi) {
      const numericUserId = row?.backendId ?? (typeof row?.id === 'string' && row.id.startsWith('api:') ? Number(row.id.slice(4)) : null);
      if (!numericUserId) { showToast("Backend ID topilmadi"); setBlockModal(null); return; }
      const nextActive = row.status === 'Bloklangan';
      OlympyApi.adminSetUserActive(numericUserId, nextActive, OlympyApi.getToken())
        .then(() => { showToast('Foydalanuvchi holati yangilandi'); apiUsersRes.reload(); })
        .catch(err => { console.warn('adminSetUserActive failed:', err); showToast(OlympyApi.toUserMessage(err)); })
        .finally(() => setBlockModal(null));
      return;
    }
    setBlockedIds(prev => ({ ...prev, [row.id]: !prev[row.id] }));
    setBlockModal(null);
    showToast('Foydalanuvchi holati yangilandi');
  };

  const userRows = allUsers.map(u => {
    const approved = getApprovedRoles(u);
    // Avval foydalanuvchi tasdiqlanmagan rollarda bo'lsa, fallback "student"
    // qaytarib jadvalda noto'g'ri "O'quvchi" deb ko'rsatardi. Endi tasdiqlangan
    // rol bo'lmasa boshqa har qanday mavjud rol-ni, u ham bo'lmasa "—" qiyofa
    // ko'rsatamiz.
    const anyRole = Object.keys(u.roles || {})[0];
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
    };
  });

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
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const dashboardCenters = (approvedCenters.length ? approvedCenters : centers).slice(0, 5);
  const dashboardRequests = pendingCenterReqs.slice(0, 5).map(req => {
    const center = resolveCenterFromRequest(req);
    const owner = getOwnerInfo(center, req);
    return { req, center, owner };
  });
  const dashboardNotifications = recentActivity.slice(0, 4);
  const AdminSidebar = () => (
    <aside className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-[184px] flex-col admin-sidebar text-slate-300 shadow-2xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none`}>
      <div className="flex h-[54px] items-center gap-2 border-b border-white/5 px-4 bg-white/[0.01]">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-white text-base font-black text-[#0b0f19]">
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
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left text-[11px] font-bold transition-all duration-200 ${isActive ? 'bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 shadow-[inset_0_0_8px_rgba(99,102,241,0.08)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
              <Icon name={item.icon} size={14} className={isActive ? 'text-indigo-400' : 'text-slate-500'} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>{item.badge}</span>
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
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-md px-4 lg:px-5">
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
                <AdminInitial name={center.name} color="bg-amber-500/20 text-amber-400 border border-amber-500/30" />
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

      <div className="grid gap-[12px] md:grid-cols-3">
        <AdminMetricCard label="O'quvchilar" value={studentCount.toLocaleString()} delta="Tasdiqlangan" icon={<Icon name="users" size={16} />} tone="indigo" />
        <AdminMetricCard label="Faol olimpiadalar" value={activeOlympiadCount.toLocaleString()} delta={activeOlympiadCount ? "Hozir o'tmoqda" : "Hech qaysi faol emas"} icon={<Icon name="bolt" size={16} />} tone="emerald" />
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
          <table className="w-full min-w-[980px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {['Tashkilot', 'Turi', 'Manzil', 'Direktor', 'O\'quvchi', 'Olimpiada', 'Holat', 'Amal'].map(h => (
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
                        <AdminInitial name={center.name} />
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
                      {center.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => approveCenterDirect(center)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)] transition">Qabul</button>
                          <button onClick={() => rejectCenterDirect(center)} className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/20 hover:bg-rose-500/20 transition">Rad</button>
                        </div>
                      ) : (
                        <button onClick={() => rejectCenterDirect(center)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:bg-white/10 hover:text-white transition">
                          Ro'yxatdan olish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {centers.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Tashkilotlar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderUsers = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[20px] font-black leading-tight text-white">Foydalanuvchilar</h1>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Platformadagi foydalanuvchi rollari va holati.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="h-9 w-full admin-input pl-9 pr-3 text-xs outline-none"
            placeholder="Ism, telefon, rol bo'yicha qidirish..." />
        </div>
      </div>
      <section className="overflow-hidden admin-card">
        <div className="overflow-x-auto admin-scroll">
          <table className="w-full min-w-[760px] text-left">
            <thead className="admin-table-hdr">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {['Foydalanuvchi', 'Telefon', 'Rol', 'Tashkilot', 'Qo\'shilgan', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(() => {
                const q = (userSearch || globalSearch || '').trim().toLowerCase();
                const visible = q
                  ? userRows.filter(row =>
                      (row.name || '').toLowerCase().includes(q) ||
                      (row.phone || '').toLowerCase().includes(q) ||
                      (row.role || '').toLowerCase().includes(q) ||
                      (row.center || '').toLowerCase().includes(q))
                  : userRows;
                if (visible.length === 0) {
                  return <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-semibold text-slate-500">{q ? 'Qidiruv natijasi topilmadi' : 'Foydalanuvchilar yo\'q'}</td></tr>;
                }
                return visible.map(row => (
                <tr key={row.id} className="text-xs admin-table-row text-slate-300">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={row.name} src={row.avatarUrl || ''} size={34} /><span className="font-bold text-white">{row.name}</span></div></td>
                  <td className="px-5 py-4 font-mono text-[11px] text-slate-400">{row.phone?.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                  <td className="px-5 py-4"><span className="rounded-md bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">{row.role}</span></td>
                  <td className="px-5 py-4 font-semibold text-slate-400">{row.center}</td>
                  <td className="px-5 py-4 font-semibold text-slate-400">{row.joined}</td>
                  <td className="px-5 py-4"><AdminPill status={row.status === 'Faol' ? 'approved' : 'rejected'}>{row.status}</AdminPill></td>
                  <td className="px-5 py-4">
                    <button onClick={() => setBlockModal(row)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${row.status === 'Bloklangan' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'}`}>
                      {row.status === 'Bloklangan' ? 'Ochish' : 'Bloklash'}
                    </button>
                  </td>
                </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={!!blockModal} onClose={() => setBlockModal(null)} title={blockModal?.status === 'Bloklangan' ? 'Blokni ochish' : 'Foydalanuvchini bloklash'}>
        <div className="mb-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Avatar name={blockModal?.name || ''} size={36} />
            <div><div className="text-sm font-semibold text-white">{blockModal?.name}</div><div className="text-xs text-white/40">{blockModal?.phone}</div></div>
          </div>
          <p className="text-sm text-white/60">{blockModal?.status === 'Bloklangan' ? 'Bu foydalanuvchining blokini ochasizmi?' : 'Bu foydalanuvchini bloklamoqchimisiz?'}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setBlockModal(null)} className="btn-ghost flex-1 rounded-xl py-3 text-xs font-bold">Bekor qilish</button>
          <button onClick={() => toggleBlock(blockModal)} className={`flex-1 rounded-xl py-3 font-semibold text-xs font-bold ${blockModal?.status === 'Bloklangan' ? 'btn-success' : 'btn-danger'}`}>
            {blockModal?.status === 'Bloklangan' ? 'Blokni ochish' : 'Bloklash'}
          </button>
        </div>
      </Modal>
    </div>
  );

  const renderAnalytics = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Tahlil</h1>
        <p className="mt-1 text-[11px] font-bold text-slate-400">Platforma statistikasi.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="admin-card p-5">
          <h2 className="mb-5 text-[11px] font-black tracking-wider uppercase text-slate-300">Foydalanuvchi o'sishi</h2>
          <AdminBarChart values={userGrowthChart.values} labels={userGrowthChart.labels} />
        </section>
        <section className="admin-card p-5">
          <h2 className="mb-5 text-[11px] font-black tracking-wider uppercase text-slate-300">Tashkilotlar holati</h2>
          <AdminDonut segments={[
            { label: 'Tasdiqlangan', value: approvedCenterPct, color: '#6366f1' },
            { label: 'Kutilmoqda', value: pendingCenterPct, color: '#f59e0b' },
            { label: 'Boshqa', value: otherCenterPct, color: '#10b981' },
          ]} />
        </section>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] p-[18px]">
      <div>
        <h1 className="text-[20px] font-black leading-tight text-white">Tadbirlar</h1>
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
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="h-9 w-full admin-input px-3 text-xs outline-none"
                placeholder="+998901234567"
              />
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
    olympiads: renderOlympiads,
    subjects: renderSubjects,
    settings: renderSettings,
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
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl border border-white/5">
          {toast}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { AdminDashboard });
