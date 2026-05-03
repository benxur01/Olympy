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

const AdminLineChart = ({ pendingCount = 0 }) => {
  const points = '0,132 38,116 76,88 114,105 152,70 190,78 228,45 266,62 304,24 342,36 380,14 418,60 450,44';
  return (
    <svg viewBox="0 0 450 150" className="h-[226px] w-full overflow-visible">
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1="0" x2="450" y1={18 + i * 30} y2={18 + i * 30} stroke="#edf1f7" strokeWidth="1" />
      ))}
      <path d={`M${points}`} fill="none" stroke="#5b6ff8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${points} L450,150 L0,150 Z`} fill="url(#adminChartFill)" opacity="0.28" />
      <g>
        <rect x="276" y="22" width="74" height="43" rx="6" fill="white" stroke="#e5eaf1" />
        <text x="286" y="40" fill="#94a3b8" fontSize="9" fontWeight="600">Bugun</text>
        <text x="286" y="56" fill="#172033" fontSize="12" fontWeight="800">{pendingCount} ariza</text>
      </g>
      <circle cx="304" cy="24" r="4" fill="#5b6ff8" stroke="white" strokeWidth="3" />
      <defs>
        <linearGradient id="adminChartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#5b6ff8" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const AdminBarChart = ({ values = [38, 55, 64, 77, 90, 100] }) => (
  <div className="flex h-[172px] items-end gap-4 px-2">
    {values.map((v, i) => (
      <div key={i} className="flex flex-1 flex-col items-center gap-3">
        <div className="w-full max-w-5 rounded-t bg-indigo-500 shadow-sm shadow-indigo-200" style={{ height: `${Math.max(v, 12) * 1.35}px` }} />
        <div className="text-xs font-semibold text-slate-400">{['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn'][i]}</div>
      </div>
    ))}
  </div>
);

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

  const apiCenters = isApi && Array.isArray(apiCentersRes.data)
    ? apiCentersRes.data.map(mapApiCenter)
    : null;
  const rawCenters = apiCenters || store.centers;
  const centers = rawCenters.filter(c => c.status !== 'rejected');
  const approvedCenters = centers.filter(c => c.status === 'approved');
  const pendingCenters = centers.filter(c => c.status === 'pending');
  const allUsers = store.users;

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

  const pendingManagerReqs = store.requests.filter(r => r.type === 'manager' && r.status === 'pending');
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
      if (!backendCenterId) { showToast('Markaz ID topilmadi'); return; }
      OlympyApi.adminApproveCenter(backendCenterId, OlympyApi.getToken())
        .then(() => { showToast('Markaz o\'quv markazlar ro\'yxatiga qo\'shildi'); reloadAdminData(); })
        .catch(err => { console.warn('adminApproveCenter failed:', err); showToast('Tasdiqlab bo\'lmadi'); });
      return;
    }
    const req = store.requests.find(r => r.type === 'center' && r.centerId === center.id && r.status === 'pending');
    if (req) OlympyStore.approveRequest(req.id);
    else OlympyStore.updateCenter(center.id, { status: 'approved' });
    showToast('Markaz o\'quv markazlar ro\'yxatiga qo\'shildi');
  };

  const rejectCenterDirect = (center) => {
    if (isApi) {
      const backendCenterId = center?.backendId;
      if (!backendCenterId) { showToast('Markaz ID topilmadi'); return; }
      OlympyApi.adminRejectCenter(backendCenterId, OlympyApi.getToken())
        .then(() => { showToast('Markaz rad etildi va ro\'yxatlardan olib tashlandi'); reloadAdminData(); })
        .catch(err => { console.warn('adminRejectCenter failed:', err); showToast('Rad etib bo\'lmadi'); });
      return;
    }
    const req = store.requests.find(r => r.type === 'center' && r.centerId === center.id && r.status === 'pending');
    if (req) OlympyStore.rejectRequest(req.id);
    else OlympyStore.updateCenter(center.id, { status: 'rejected' });
    showToast('Markaz rad etildi va ro\'yxatlardan olib tashlandi');
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
    setBlockedIds(prev => ({ ...prev, [row.id]: !prev[row.id] }));
    setBlockModal(null);
    showToast('Foydalanuvchi holati yangilandi');
  };

  const userRows = allUsers.map(u => {
    const approved = getApprovedRoles(u);
    const primary = u.activeRole && approved.includes(u.activeRole) ? u.activeRole : (approved[0] || 'student');
    const centerId = u.roles?.[primary]?.centerId;
    const center = centerId ? centers.find(c => String(c.id) === String(centerId)) : null;
    return {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: ROLE_META[primary]?.label || primary,
      center: center?.name || '—',
      joined: u.joined,
      status: blockedIds[u.id] ? 'Bloklangan' : 'Faol',
    };
  });

  const recentActivity = [
    ...pendingCenterReqs.map(req => {
      const center = resolveCenterFromRequest(req);
      const owner = getOwnerInfo(center, req);
      return {
        id: `pending:${req.id}`,
        title: 'Yangi direktor arizasi',
        message: `${owner.name} · ${center?.name || 'Markaz'} · ${center?.city || '—'}`,
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

  const navItems = [
    { key: 'home', icon: 'grid', label: 'Dashboard' },
    { key: 'users', icon: 'users', label: 'Users' },
    { key: 'centers', icon: 'building', label: 'Organizations', badge: pendingCenterReqs.length || undefined },
    { key: 'olympiads', icon: 'trophy', label: 'Products' },
    { key: 'requests', icon: 'bell', label: 'Orders', badge: pendingCenterReqs.length || undefined },
    { key: 'inventory', icon: 'book', label: 'Inventory' },
    { key: 'payments', icon: 'tag', label: 'Payments' },
    { key: 'reports', icon: 'file', label: 'Reports' },
    { key: 'analytics', icon: 'chart', label: 'Analytics' },
    { key: 'marketing', icon: 'send', label: 'Marketing' },
    { key: 'content', icon: 'edit', label: 'Content' },
    { key: 'system', icon: 'shield', label: 'System' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
    { key: 'logs', icon: 'file', label: 'Logs' },
    { key: 'support', icon: 'info', label: 'Support' },
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
          <div className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">System Status</div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> All Systems Operational
          </div>
        </div>
        <div className="mb-4 text-[11px] leading-relaxed text-slate-500">
          © 2026 Olympy Admin<br />v2.4.1
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
          <input className="h-8 w-full rounded-md border border-slate-200 bg-white pl-9 pr-14 text-[12px] text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50"
            placeholder="Search for users, orders, products..." />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">⌘ K</span>
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
          <Avatar name={user?.name || 'Admin'} size={30} gradient="from-slate-700 to-slate-900" />
          <div className="hidden text-right sm:block">
            <div className="text-[12px] font-bold leading-tight text-slate-900">{user?.name || 'Admin'}</div>
            <div className="text-[11px] font-medium leading-tight text-slate-500">Super Admin</div>
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
                    {center.city} · Direktor: {owner.name}{owner.phone ? ` · ${owner.phone}` : ''}
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

  const renderHome = () => (
    <div className="min-h-[calc(100vh-54px)] space-y-[14px] bg-[#f6f8fc] p-[18px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-[12px] font-medium text-slate-500">Overview of your business performance and platform metrics.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">
            <Icon name="clock" size={14} /> May 20 - Jun 20, 2026 <Icon name="chevronDown" size={13} />
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">
            <Icon name="upload" size={14} /> Download Report <Icon name="chevronDown" size={13} />
          </button>
        </div>
      </div>

      <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Total Centers" value={approvedCenters.length.toLocaleString()} delta={pendingCenterReqs.length ? `↑ ${pendingCenterReqs.length} pending` : '✓ all reviewed'} icon={<Icon name="building" size={16} />} tone="indigo" />
        <AdminMetricCard label="Requests" value={pendingCenterReqs.length.toLocaleString()} delta={pendingCenterReqs.length ? '↑ needs review' : '✓ clear'} icon={<Icon name="bell" size={16} />} tone="emerald" />
        <AdminMetricCard label="Customers" value={allUsers.length.toLocaleString()} delta="↑ 15.3%" icon={<Icon name="users" size={16} />} tone="amber" />
        <AdminMetricCard label="Approval Rate" value={`${approvedCenterPct}%`} delta="↑ 2.1%" icon={<Icon name="chart" size={16} />} tone="rose" />
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1.55fr_1.05fr_.95fr]">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Revenue Overview</h2>
            <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-[11px] font-bold text-slate-500">Daily <Icon name="chevronDown" size={12} /></button>
          </div>
          <div className="grid grid-cols-[42px_1fr] gap-2">
            <div className="flex h-[226px] flex-col justify-between py-2 text-[10px] font-semibold text-slate-400">
              <span>$15M</span><span>$12M</span><span>$9M</span><span>$6M</span><span>$3M</span><span>$0</span>
            </div>
            <AdminLineChart pendingCount={pendingCenterReqs.length} />
          </div>
          <div className="ml-[50px] mt-1 grid grid-cols-5 text-[11px] font-semibold text-slate-400">
            <span>May 20</span><span>May 27</span><span>Jun 3</span><span>Jun 10</span><span>Jun 20</span>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Top Products</h2>
            <button onClick={() => setPage('centers')} className="text-[11px] font-bold text-indigo-600">View all</button>
          </div>
          <div className="grid grid-cols-[1fr_58px_74px] border-b border-slate-100 pb-2 text-[10px] font-extrabold text-slate-400">
            <span>Product</span><span className="text-right">Users</span><span className="text-right">Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {dashboardCenters.map((center, index) => (
              <div key={center.id} className="grid grid-cols-[1fr_58px_74px] items-center gap-2 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs font-black text-slate-700">{center.name?.[0] || 'O'}</div>
                  <div className="truncate text-[12px] font-bold text-slate-700">{center.name}</div>
                </div>
                <div className="text-right text-[11px] font-semibold text-slate-500">{(center.students || index * 4 + 12).toLocaleString()}</div>
                <div className="text-right"><AdminPill status={center.status} /></div>
              </div>
            ))}
            {dashboardCenters.length === 0 && <div className="py-10 text-center text-[12px] font-semibold text-slate-400">No products yet</div>}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Recent Orders</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-600">View all</button>
          </div>
          <div className="space-y-3">
            {dashboardRequests.map(({ req, center, owner }, index) => (
              <div key={req.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-extrabold text-slate-800">#ORD-{78420 + index}</div>
                  <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{owner.name}</div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{center?.name || 'New center'}</div>
                </div>
                <div className="shrink-0 text-right">
                  <AdminPill status="pending">Pending</AdminPill>
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => approveCenterReq(req)} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">OK</button>
                    <button onClick={() => rejectCenterReq(req)} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">No</button>
                  </div>
                </div>
              </div>
            ))}
            {dashboardRequests.length === 0 && (
              [1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-extrabold text-slate-800">#ORD-{78420 + i}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">No pending request</div>
                  </div>
                  <AdminPill status="approved">Completed</AdminPill>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-[12px] xl:grid-cols-[1fr_1fr_1fr_1fr]">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">User Growth</h2>
            <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-3 text-[11px] font-bold text-slate-500">Monthly <Icon name="chevronDown" size={12} /></button>
          </div>
          <AdminBarChart />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-[13px] font-extrabold text-slate-800">Traffic Sources</h2>
          <AdminDonut segments={[
            { label: 'Direct', value: 35, color: '#4f63ff' },
            { label: 'Organic Search', value: 28, color: '#4ade80' },
            { label: 'Paid Search', value: 20, color: '#facc15' },
            { label: 'Social Media', value: 11, color: '#a78bfa' },
            { label: 'Referral', value: 6, color: '#cbd5e1' },
          ]} />
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">System Status</h2>
            <button className="text-[11px] font-bold text-indigo-600">View all</button>
          </div>
          {['Web Platform', 'API Gateway', 'Database', 'Payment System', 'Search Service', 'Email Service'].map(row => (
            <div key={row} className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {row}
              </div>
              <span className="text-[11px] font-extrabold text-emerald-600">Operational</span>
            </div>
          ))}
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold text-slate-800">Notifications</h2>
            <button onClick={() => setPage('requests')} className="text-[11px] font-bold text-indigo-600">View all</button>
          </div>
          <div className="space-y-4">
            {dashboardNotifications.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.tone === 'rose' ? 'bg-rose-50 text-rose-500' : item.tone === 'amber' ? 'bg-amber-50 text-amber-500' : item.tone === 'emerald' ? 'bg-emerald-50 text-emerald-500' : 'bg-indigo-50 text-indigo-500'}`}>
                  <Icon name={item.tone === 'rose' ? 'info' : item.tone === 'emerald' ? 'check' : 'bell'} size={14} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-extrabold text-slate-800">{item.title}</div>
                  <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{item.time || 'Today, 01:45 AM'}</div>
                </div>
              </div>
            ))}
            {dashboardNotifications.length === 0 && (
              ['System maintenance scheduled', 'New user registered', 'Backup completed successfully', 'No pending alerts'].map((title, index) => (
                <div key={title} className="flex items-start gap-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${index === 2 ? 'bg-emerald-50 text-emerald-500' : 'bg-indigo-50 text-indigo-500'}`}>
                    <Icon name={index === 2 ? 'check' : 'bell'} size={14} />
                  </div>
                  <div>
                    <div className="text-[12px] font-extrabold text-slate-800">{title}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">Today, 01:{45 - index * 10} AM</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Direktor arizalari</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Direktor markaz ro'yxatdan o'tkazsa shu yerda xabar chiqadi.</p>
      </div>
      <CenterApprovalList />
    </div>
  );

  const renderCenters = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">O'quv markazlar</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Faqat qabul qilingan markazlar public ro'yxatda ko'rinadi.</p>
        </div>
        <div className="flex gap-2">
          <AdminPill status="approved">{approvedCenters.length} tasdiqlangan</AdminPill>
          <AdminPill status="pending">{pendingCenters.length} kutilmoqda</AdminPill>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Markaz', 'Shahar', 'Direktor', 'O\'quvchi', 'Olimpiada', 'Holat', 'Amal'].map(h => (
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
                    <td className="px-5 py-4 font-medium text-slate-600">{center.city}</td>
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
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm font-medium text-slate-500">Markazlar yo'q</td></tr>
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
          <input className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Qidirish..." />
        </div>
      </div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Foydalanuvchi', 'Telefon', 'Rol', 'Markaz', 'Qo\'shilgan', 'Holat', 'Amal'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {userRows.map(row => (
                <tr key={row.id} className="text-sm">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar name={row.name} size={34} /><span className="font-bold text-slate-900">{row.name}</span></div></td>
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
              ))}
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
          <AdminBarChart />
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-base font-extrabold text-slate-900">Markazlar holati</h2>
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Olimpiadalar</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Platformadagi olimpiadalar ro'yxati.</p>
      </div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-slate-50">
              <tr className="text-xs font-bold uppercase text-slate-400">
                {['Olimpiada', 'Markaz', 'Fan', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {store.olympiads.map(o => {
                const center = centers.find(c => String(c.id) === String(o.centerId));
                return (
                  <tr key={o.id} className="text-sm">
                    <td className="px-5 py-4 font-bold text-slate-900">{o.title}</td>
                    <td className="px-5 py-4 text-slate-500">{center?.name || '—'}</td>
                    <td className="px-5 py-4"><span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700">{o.subject}</span></td>
                    <td className="px-5 py-4 text-slate-500">{o.startDate}</td>
                    <td className="px-5 py-4 font-semibold text-slate-700">{o.participants || 0}</td>
                    <td className="px-5 py-4"><AdminPill status={o.status} /></td>
                  </tr>
                );
              })}
              {store.olympiads.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-medium text-slate-500">Hali olimpiadalar yo'q</td></tr>}
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
            if (store.subjects.includes(name)) { showToast(`"${name}" allaqachon mavjud`); return; }
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
          {store.subjects.map(s => <span key={s} className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{s}</span>)}
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
            <div className="mt-2 text-sm text-slate-500">Faqat tasdiqlangan markazlar o'quvchilar va mehmonlarga ko'rinadi.</div>
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
    inventory: renderSubjects,
    payments: renderAnalytics,
    reports: renderAnalytics,
    marketing: renderSettings,
    content: renderSettings,
    system: renderSettings,
    logs: renderSettings,
    support: renderSettings,
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
