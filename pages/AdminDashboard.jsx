// pages/AdminDashboard.jsx

const formatAdminDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' });
};

const adminStatusMeta = (status) => {
  const map = {
    approved: { label: 'Tasdiqlandi', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    pending: { label: 'Kutilmoqda', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    rejected: { label: 'Rad etildi', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
    active: { label: 'Faol', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    draft: { label: 'Draft', cls: 'bg-slate-50 text-slate-600 ring-slate-200' },
    finished: { label: 'Tugagan', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  };
  return map[status] || map.draft;
};

const AdminPill = ({ status, children }) => {
  const meta = adminStatusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${meta.cls}`}>
      {children || meta.label}
    </span>
  );
};

const AdminInitial = ({ name, color = 'bg-indigo-600' }) => (
  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color} text-sm font-bold text-white`}>
    {(name || '?').trim()[0]?.toUpperCase() || '?'}
  </div>
);

const AdminMetricCard = ({ label, value, delta, icon, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold text-slate-500">{label}</div>
          <div className="mt-4 text-[21px] font-extrabold leading-none tracking-tight text-slate-900">{value}</div>
          {delta && <div className="mt-3 text-[11px] font-semibold text-slate-500">{delta}</div>}
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${tones[tone] || tones.indigo}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

const AdminBarChart = ({ values = [], labels = [] }) => {
  const safe = Array.isArray(values) && values.length > 0 ? values : [0, 0, 0, 0, 0, 0];
  const safeLabels = (labels && labels.length === safe.length) ? labels : ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn'].slice(0, safe.length);
  const maxV = Math.max(1, ...safe);
  return (
    <div className="flex h-[172px] items-end gap-4 px-2">
      {safe.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-3">
          <div className="w-full max-w-5 rounded-t bg-indigo-500 shadow-sm shadow-indigo-200" style={{ height: `${Math.max((v / maxV) * 130, v > 0 ? 8 : 2)}px` }} />
          <div className="text-xs font-semibold text-slate-400">{safeLabels[i]}</div>
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
      <circle key={s.label} cx="18" cy="18" r="15.9" fill="none" stroke={s.color} strokeWidth="4"
        strokeDasharray={dash} strokeDashoffset={offset} />
    );
    offset -= s.value;
    return circle;
  });
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eef2f7" strokeWidth="4" />
        {circles}
      </svg>
      <div className="space-y-3">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="min-w-24">{s.label}</span>
            <span className="text-slate-400">{s.value}%</span>
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
    <aside className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-[184px] flex-col bg-[#142235] text-slate-300 shadow-2xl transition-transform duration-200 lg:static lg:translate-x-0 lg:shadow-none`}>
      <div className="flex h-[54px] items-center gap-2 border-b border-white/10 px-4">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2">
          <div className="relative flex h-7 w-7 items-center justify-center rounded-md bg-white text-base font-black text-[#142235]">
            O
            <span className="absolute -bottom-1 left-1 h-1 w-5 rounded-full bg-[#ff9900]" />
          </div>
          <div className="text-left">
            <div className="text-[16px] font-extrabold leading-none text-white">olympy <span className="font-medium text-slate-400">admin</span></div>
          </div>
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {navItems.map(item => (
          <button key={item.key}
            onClick={() => { setPage(item.key); setMobileMenu(false); }}
            className={`flex w-full items-center gap-3 rounded-[5px] px-3 py-[8px] text-left text-[12px] font-semibold transition ${page === item.key ? 'bg-[#4f63ff] text-white shadow-lg shadow-indigo-950/20' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}>
            <Icon name={item.icon} size={15} />
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${page === item.key ? 'bg-white/20 text-white' : 'bg-rose-500 text-white'}`}>{item.badge}</span>
            )}
            {!item.badge && item.key !== 'home' && <Icon name="chevronRight" size={12} className="text-slate-500" />}
          </button>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-5">
        <div className="mb-6">
          <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Tizim holati</div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Tizim ishlayapti
          </div>
        </div>
        <div className="mb-4 text-[11px] leading-relaxed text-slate-500">
          © 2026 PROLYMP Admin
        </div>
        <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[12px] font-semibold text-slate-400 hover:bg-white/10 hover:text-white">
          <Icon name="logout" size={14} /> Chiqish
        </button>
      </div>
    </aside>
  );

  const AdminTopbar = () => (
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-5">
      <div className="flex items-center gap-3">
        <button className="rounded-md p-2 text-slate-400 hover:bg-slate-50 lg:hidden" onClick={() => setMobileMenu(true)}>
          <Icon name="menu" size={18} />
        </button>
        <button className="hidden rounded-md p-2 text-slate-400 hover:bg-slate-50 lg:inline-flex">
          <Icon name="menu" size={17} />
        </button>
        <div className="relative hidden w-[310px] max-w-[35vw] md:block">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            placeholder="Foydalanuvchilar, tashkilotlar, olimpiadalar..." />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onOpenSwitcher && (
          <button onClick={onOpenSwitcher} className="hidden rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 md:inline-flex">
            Rolni almashtirish
          </button>
        )}
        <button onClick={() => setPage('requests')} className="relative rounded-md p-2 text-slate-500 hover:bg-slate-50">
          <Icon name="bell" size={17} />
          {pendingCenterReqs.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
              {pendingCenterReqs.length}
            </span>
          )}
        </button>
        <button className="rounded-md p-2 text-slate-500 hover:bg-slate-50">
          <Icon name="info" size={17} />
        </button>
        <div className="flex items-center gap-2 pl-2">
            <Avatar name={user?.name || 'Admin'} src={user?.avatarUrl || ''} size={30} gradient="from-slate-700 to-slate-900" />
          <div className="hidden text-right sm:block">
            <div className="text-[12px] font-bold leading-tight text-slate-900">{user?.name || 'Admin'}</div>
            <div className="text-[11px] font-medium leading-tight text-slate-500">{(() => {
              // Avval doim "Super Admin" yozilardi. Endi haqiqiy rol asosida.
              if (user?.is_platform_admin || user?.roles?.admin) return 'Platform Admin';
              if (user?.roles?.owner) return 'Tashkilot direktori';
              if (user?.roles?.manager) return 'Manager';
              if (user?.roles?.teacher) return "O'qituvchi";
              return 'Admin';
            })()}</div>
          </div>
          <Icon name="chevronDown" size={13} className="hidden text-slate-400 sm:block" />
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
          <div key={req.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex flex-1 items-center gap-3">
                <AdminInitial name={center.name} color="bg-amber-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-extrabold text-slate-900">{center.name}</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · Direktor: {owner.name}{owner.phone ? ` · ${owner.phone}` : ''}
                  </div>
                  {!compact && (center.subjects || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {center.subjects.slice(0, 5).map(s => (
                        <span key={s} className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => approveCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                  <Icon name="check" size={14} /> Qabul qilish
                </button>
                <button onClick={() => rejectCenterReq(req)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">
                  <Icon name="x" size={14} /> Rad etish
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {pendingCenterReqs.length === 0 && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm font-medium text-slate-500">
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
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] bg-[#f6f8fc] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight text-slate-900">Boshqaruv paneli</h1>
          <p className="mt-1 text-[12px] font-medium text-slate-500">PROLYMP platformasi ko'rsatkichlari va arizalar holati.</p>
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
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Eng so'nggi tashkilotlar</h2>
            <button onClick={() => setPage('centers')} className="text-[11px] font-bold text-indigo-600">Hammasi</button>
          </div>
          <div className="grid grid-cols-[1fr_70px_74px] border-b border-slate-100 pb-2 text-[10px] font-extrabold text-slate-400">
            <span>Tashkilot</span><span className="text-right">O'quvchi</span><span className="text-right">Holat</span>
          </div>
          <div className="divide-y divide-slate-100">
            {dashboardCenters.map(center => (
              <div key={center.id} className="grid grid-cols-[1fr_70px_74px] items-center gap-2 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-black text-slate-700">{center.name?.[0] || 'O'}</div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-slate-700">{center.name}</div>
                    <div className="truncate text-[10px] text-slate-400">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                  </div>
                </div>
                <div className="text-right text-[11px] font-semibold text-slate-500">{(center.students || 0).toLocaleString()}</div>
                <div className="text-right"><AdminPill status={center.status} /></div>
              </div>
            ))}
            {dashboardCenters.length === 0 && <div className="py-10 text-center text-[12px] font-semibold text-slate-400">Tashkilotlar yo'q</div>}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Pending direktor arizalari</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-600">Hammasi</button>
          </div>
          <div className="space-y-3">
            {dashboardRequests.map(({ req, center, owner }) => (
              <div key={req.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-extrabold text-slate-800 truncate">{center?.name || 'Yangi tashkilot'}</div>
                  <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{owner.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{center?.organizationType || "O'quv markaz"} · {formatCenterLocation(center)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <AdminPill status="pending">Kutilmoqda</AdminPill>
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => approveCenterReq(req)} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Qabul</button>
                    <button onClick={() => rejectCenterReq(req)} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Rad</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardRequests.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-slate-400">Pending arizalar yo'q</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1fr_1fr]">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-[13px] font-extrabold text-slate-800">Tashkilotlar holati</h2>
          <AdminDonut segments={[
            { label: 'Tasdiqlangan', value: approvedCenterPct, color: '#4f46e5' },
            { label: 'Kutilmoqda', value: pendingCenterPct, color: '#f59e0b' },
            { label: 'Boshqa', value: otherCenterPct, color: '#10b981' },
          ]} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Bildirishnomalar</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-600">Hammasi</button>
          </div>
          <div className="space-y-4">
            {dashboardNotifications.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.tone === 'rose' ? 'bg-rose-50 text-rose-500' : item.tone === 'amber' ? 'bg-amber-50 text-amber-500' : item.tone === 'emerald' ? 'bg-emerald-50 text-emerald-500' : 'bg-indigo-50 text-indigo-500'}`}>
                  <Icon name={item.tone === 'rose' ? 'info' : item.tone === 'emerald' ? 'check' : 'bell'} size={14} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-extrabold text-slate-800">{item.title}</div>
                  <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{item.time || ''}</div>
                </div>
              </div>
            ))}
            {dashboardNotifications.length === 0 && (
              <div className="py-10 text-center text-[12px] font-semibold text-slate-400">Yangi bildirishnomalar yo'q</div>
            )}
          </div>
        </section>
      </div>
    </div>
    );
  };

  const renderRequests = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Direktor arizalari</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Direktor tashkilot yoki markaz ro'yxatdan o'tkazsa shu yerda xabar chiqadi.</p>
      </div>
      <CenterApprovalList />
    </div>
  );

  const renderCenters = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tashkilotlar va markazlar</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Faqat qabul qilingan tashkilotlar public ro'yxatda ko'rinadi.</p>
        </div>
        <div className="flex gap-2">
          <AdminPill status="approved">{approvedCenters.length} tasdiqlangan</AdminPill>
          <AdminPill status="pending">{pendingCenters.length} kutilmoqda</AdminPill>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Tashkilot', 'Turi', 'Manzil', 'Direktor', 'O\'quvchi', 'Olimpiada', 'Holat', 'Amal'].map(h => (
                  <th key={h} className="px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {centers.map(center => {
                const owner = getOwnerInfo(center);
                return (
                  <tr key={center.id} className="text-sm">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <AdminInitial name={center.name} />
                        <div>
                          <div className="font-extrabold text-slate-900">{center.name}</div>
                          <div className="text-xs font-medium text-slate-400">{formatAdminDate(center.createdAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-600">{center.organizationType || "O'quv markaz"}</td>
                    <td className="px-5 py-4 font-medium text-slate-600">{formatCenterLocation(center)}</td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-700">{owner.name}</div>
                      {owner.phone && <div className="text-xs text-slate-400">{owner.phone}</div>}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{center.students || 0}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{center.olympiads || 0}</td>
                    <td className="px-5 py-4"><AdminPill status={center.status} /></td>
                    <td className="px-5 py-4">
                      {center.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => approveCenterDirect(center)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Qabul</button>
                          <button onClick={() => rejectCenterDirect(center)} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100">Rad</button>
                        </div>
                      ) : (
                        <button onClick={() => rejectCenterDirect(center)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                          Ro'yxatdan olish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {centers.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-medium text-slate-500">Tashkilotlar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Foydalanuvchilar</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Platformadagi foydalanuvchi rollari va holati.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
            placeholder="Ism, telefon, rol bo'yicha qidirish..." />
        </div>
      </div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Foydalanuvchi', 'Telefon', 'Rol', 'Tashkilot', 'Qo\'shilgan', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                // Avval qidiruv input'i client-side filter qilmasdi. Endi
                // ism, telefon, rol va tashkilot nomi bo'yicha filterlanadi.
                // Topbardagi globalSearch ham ushbu jadvalga ta'sir qiladi.
                const q = (userSearch || globalSearch || '').trim().toLowerCase();
                const visible = q
                  ? userRows.filter(row =>
                      (row.name || '').toLowerCase().includes(q) ||
                      (row.phone || '').toLowerCase().includes(q) ||
                      (row.role || '').toLowerCase().includes(q) ||
                      (row.center || '').toLowerCase().includes(q))
                  : userRows;
                if (visible.length === 0) {
                  return <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-medium text-slate-500">{q ? 'Qidiruv natijasi topilmadi' : 'Foydalanuvchilar yo\'q'}</td></tr>;
                }
                return visible.map(row => (
                <tr key={row.id} className="text-sm">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={row.name} src={row.avatarUrl || ''} size={34} /><span className="font-bold text-slate-900">{row.name}</span></div></td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{row.phone?.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                  <td className="px-5 py-4"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{row.role}</span></td>
                  <td className="px-5 py-4 text-slate-500">{row.center}</td>
                  <td className="px-5 py-4 text-slate-500">{row.joined}</td>
                  <td className="px-5 py-4"><AdminPill status={row.status === 'Faol' ? 'approved' : 'rejected'}>{row.status}</AdminPill></td>
                  <td className="px-5 py-4">
                    <button onClick={() => setBlockModal(row)} className={`rounded-lg px-3 py-2 text-xs font-bold ring-1 ${row.status === 'Bloklangan' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
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
          <button onClick={() => setBlockModal(null)} className="btn-ghost flex-1 rounded-xl py-3">Bekor qilish</button>
          <button onClick={() => toggleBlock(blockModal)} className={`flex-1 rounded-xl py-3 font-semibold ${blockModal?.status === 'Bloklangan' ? 'btn-success' : 'btn-danger'}`}>
            {blockModal?.status === 'Bloklangan' ? 'Blokni ochish' : 'Bloklash'}
          </button>
        </div>
      </Modal>
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tahlil</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Platforma statistikasi.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-base font-extrabold text-slate-900">Foydalanuvchi o'sishi</h2>
          <AdminBarChart values={userGrowthChart.values} labels={userGrowthChart.labels} />
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-base font-extrabold text-slate-900">Tashkilotlar holati</h2>
          <AdminDonut segments={[
            { label: 'Tasdiqlangan', value: approvedCenterPct, color: '#4f46e5' },
            { label: 'Kutilmoqda', value: pendingCenterPct, color: '#f59e0b' },
            { label: 'Boshqa', value: otherCenterPct, color: '#10b981' },
          ]} />
        </section>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Tadbirlar</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Platformadagi olimpiada va musobaqalar ro'yxati.</p>
      </div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Tadbir', 'Tashkilot', 'Fan', 'Daraja', 'Test turi', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const olympiadList = isApi ? (apiOlympiads || []) : store.olympiads;
                if (olympiadList.length === 0) {
                  return <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-medium text-slate-500">Hali tadbirlar yo'q</td></tr>;
                }
                return olympiadList.map(o => {
                  const center = centers.find(c => String(c.id) === String(o.centerId));
                  return (
                    <tr key={o.id} className="text-sm">
                      <td className="px-5 py-4 font-bold text-slate-900">{o.title}</td>
                      <td className="px-5 py-4 text-slate-500">{center?.name || '—'}</td>
                      <td className="px-5 py-4"><span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">{o.subject}</span></td>
                      <td className="px-5 py-4">{o.testLevel ? <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{o.testLevel}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-4">{o.testType ? <span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">{testTypeLabel(o.testType)}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-4 text-slate-500">{o.startDate || '—'}</td>
                      <td className="px-5 py-4 font-semibold text-slate-700">{o.participants || 0}</td>
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
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Fanlar</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Platformada ishlatiladigan fan kategoriyalari.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-extrabold text-slate-900">Yangi fan qo'shish</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="h-11 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
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
          }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
            <Icon name="plus" size={15} /> Qo'shish
          </button>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {subjects.map(s => <span key={s} className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{s}</span>)}
        </div>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sozlamalar</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Admin panel sozlamalari.</p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-extrabold text-slate-900">Public listing qoidasi</div>
            <div className="mt-2 text-sm text-slate-500">Faqat tasdiqlangan tashkilotlar o'quvchilar va mehmonlarga ko'rinadi.</div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-extrabold text-slate-900">Ariza oqimi</div>
            <div className="mt-2 text-sm text-slate-500">Direktor arizasi admin qaroridan keyin yakunlanadi.</div>
          </div>
        </div>
      </section>
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

  return (
    <div className="h-screen overflow-hidden bg-[#f6f8fc] text-slate-900">
      {mobileMenu && <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileMenu(false)} />}
      <div className="flex h-full">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main className="flex-1 overflow-y-auto">
            {(pageRenderers[page] || renderHome)()}
          </main>
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { AdminDashboard });
