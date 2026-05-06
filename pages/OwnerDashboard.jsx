// pages/OwnerDashboard.jsx — Center director panel scoped to one center

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
    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all ${
      active
        ? 'text-white'
        : 'text-white/55 hover:bg-white/5 hover:text-white'
    }`}
    style={active ? { background: 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(168,85,247,0.10))' } : undefined}
  >
    {active && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-400 to-purple-500" />}
    <span className={active ? 'text-indigo-300' : 'text-white/40 group-hover:text-white/70'}>
      <Icon name={item.icon} size={17} />
    </span>
    <span className="flex-1">{item.label}</span>
    {item.badge && (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
        active
          ? 'bg-white/15 text-white'
          : 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30'
      }`}>
        {item.badge}
      </span>
    )}
  </button>
);

const OwnerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  const [pendingManagers, setPendingManagers] = React.useState([]);
  const [apiStaff, setApiStaff] = React.useState([]);
  const [createdStaff, setCreatedStaff] = React.useState([]);
  const [staffModal, setStaffModal] = React.useState(false);
  const [staffRole, setStaffRole] = React.useState('manager');
  const [staffSaving, setStaffSaving] = React.useState(false);
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
  const [centerSaving, setCenterSaving] = React.useState(false);
  const [centerForm, setCenterForm] = React.useState(emptyCenterForm);
  const [centerImageOverrides, setCenterImageOverrides] = React.useState({});
  const [centerImageLoading, setCenterImageLoading] = React.useState(false);
  const centerImageInputRef = React.useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

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
    // o'qituvchi/manager arizalari real vaqtda chiqadi.
    const intervalId = (isApi && ownerCenterId) ? setInterval(refresh, 15000) : null;
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

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getMyCenters(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
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
    setCenterForm(emptyCenterForm);
    setCenterModal(true);
  };

  const closeCenterModal = () => {
    if (centerSaving) return;
    setCenterModal(false);
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
    { key: 'home', icon: 'home', label: 'Overview' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'staff', icon: 'users', label: 'Xodimlar' },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'center', icon: 'building', label: 'Profil' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const requestRows = centerRequests.filter(r => r.type === 'manager' || r.type === 'teacher');
  const recentRequests = requestRows.filter(r => r.status === 'pending').slice(0, 4);

  const Sidebar = () => (
    <aside
      className={`${mobileMenu ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-white/5 transition-transform duration-200 lg:static lg:translate-x-0`}
      style={{ background: 'rgba(6,8,24,0.96)', backdropFilter: 'blur(12px)' }}
    >
      <div className="border-b border-white/5 px-5 py-5">
        <button onClick={() => onNavigate('landing')} className="flex w-full items-center gap-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-bg text-base font-black text-white shadow-lg shadow-indigo-900/40">
            {center.name[0]}
          </div>
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
            onClick={() => { setPage(item.key); setMobileMenu(false); }}
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
                <option key={c.id} value={c.id} style={{ background: '#12152e' }}>{c.name} · {statusLabel(c.status)}</option>
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
      style={{ background: 'rgba(13,15,35,0.75)', backdropFilter: 'blur(16px)' }}
    >
      <div className="flex items-center gap-3">
        <button
          className="rounded-xl p-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          onClick={() => setMobileMenu(true)}
        >
          <Icon name="menu" size={20} />
        </button>
        <div>
          <div className="text-[15px] font-black text-white">{navItems.find(n => n.key === page)?.label || 'Overview'}</div>
          <div className="text-[11px] font-semibold text-white/40">
            {center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {ownerCenters.length > 1 && (
          <select
            value={ownerCenterId || ''}
            onChange={e => { setSelectedOwnerCenterId(e.target.value); setPage('home'); }}
            className="hidden h-9 max-w-[220px] rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/80 outline-none transition hover:bg-white/10 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30 md:block"
          >
            {ownerCenters.map(c => (
              <option key={c.id} value={c.id} style={{ background: '#12152e' }}>{c.name} · {statusLabel(c.status)}</option>
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
            className="btn-ghost hidden rounded-xl px-3 py-2 text-xs font-bold md:inline-flex"
          >
            Rolni almashtirish
          </button>
        )}
        <button
          onClick={() => setPage('requests')}
          className="relative rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
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
            <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
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
          <div className="rounded-2xl border border-white/8 glass-strong px-4 py-16 text-center">
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
                {['Ism', 'Telefon', 'Rol', 'Fan', 'Holat'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myStaff.map(row => (
                <tr key={row.id} className="table-row text-sm">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} src={row.avatarUrl || ''} size={36} gradient={row.role === 'manager' ? 'from-indigo-500 to-purple-600' : 'from-cyan-500 to-sky-600'} />
                      <span className="font-black text-white">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-white/55">
                    {String(row.phone || '').replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}
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
                </tr>
              ))}
              {myStaff.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-sm font-bold text-white/40">
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

  const renderOlympiads = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white lg:text-3xl">Tadbirlar</h1>
        <p className="mt-1 text-sm font-semibold text-white/50">Direktor uchun tashkilotdagi olimpiada va musobaqalar ko'rinishi.</p>
      </div>
      <section className="overflow-hidden rounded-2xl border border-white/8 glass-strong">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left">
            <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
              <tr className="text-[10px] font-black uppercase tracking-wider text-white/40">
                {['Nomi', 'Turi', 'Fan', 'Daraja', 'Test turi', 'Sana', 'Ishtirokchilar', 'Holat'].map(h => (
                  <th key={h} className="px-5 py-3.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centerOlympiads.map(o => (
                <tr key={o.id} className="table-row text-sm">
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
                </tr>
              ))}
              {centerOlympiads.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-sm font-bold text-white/40">
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

  const renderCenter = () => (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Tashkilot profili</h1>
        <p className="mt-1 text-sm font-semibold text-slate-500">O'z tashkilotingiz bo'yicha asosiy ma'lumotlar.</p>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="relative h-16 w-16 flex-shrink-0">
            {center.imageUrl ? (
              <img src={center.imageUrl} alt={center.name} className="h-16 w-16 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-black text-white">{center.name[0]}</div>
            )}
            {isApi && (
              <>
                <input ref={centerImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleCenterImageUpload} />
                <button
                  onClick={() => centerImageInputRef.current?.click()}
                  disabled={centerImageLoading}
                  className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg hover:bg-emerald-600 disabled:opacity-60"
                  title="Tashkilot rasmini yuklash"
                >
                  <Icon name="upload" size={14} />
                </button>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-black text-slate-900">{center.name}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{center.organizationType || "O'quv markaz"} · {formatCenterLocation(center)} · {ownerFormatDate(center.createdAt)}</p>
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
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Yo'naltirilgan fanlar</div>
          <div className="flex flex-wrap gap-2">
            {(center.subjects || []).map(s => <span key={s} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{s}</span>)}
            {(!center.subjects || center.subjects.length === 0) && <span className="text-sm font-semibold text-slate-400">Fanlar kiritilmagan</span>}
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
    </div>
  );

  const pagesMap = {
    home: renderHome,
    requests: renderRequests,
    staff: renderStaff,
    olympiads: renderOlympiads,
    center: renderCenter,
    settings: renderSettings,
  };

  return (
    <div className="h-screen overflow-hidden text-white" style={{ background: '#060818' }}>
      {mobileMenu && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileMenu(false)}
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        />
      )}
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            {(pagesMap[page] || renderHome)()}
          </main>
        </div>
      </div>
      {staffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form onSubmit={submitStaff} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">{staffRole === 'teacher' ? 'Ustoz yaratish' : 'Menejer yaratish'}</h2>
                <div className="mt-1 text-xs font-bold text-slate-500">{center.name}</div>
              </div>
              <button type="button" onClick={closeStaffModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Ism familiya</span>
                <input
                  value={staffForm.full_name}
                  onChange={e => updateStaffForm('full_name', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Masalan, Aziz Karimov"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Telefon login</span>
                <input
                  value={staffForm.phone}
                  onChange={e => updateStaffForm('phone', formatUzPhoneInput(e.target.value))}
                  onFocus={e => updateStaffForm('phone', formatUzPhoneInput(e.target.value))}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="+998901112233"
                  inputMode="numeric"
                  maxLength={13}
                  type="tel"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Parol</span>
                <input
                  value={staffForm.password}
                  onChange={e => updateStaffForm('password', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Kamida 6 belgi"
                  type="text"
                />
              </label>
              {staffRole === 'teacher' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Fan</span>
                  <select
                    value={staffForm.subject}
                    onChange={e => updateStaffForm('subject', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">Fan tanlanmagan</option>
                    {store.subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeStaffModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Bekor qilish
              </button>
              <button disabled={staffSaving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {staffSaving ? 'Yaratilmoqda...' : 'Yaratish'}
              </button>
            </div>
          </form>
        </div>
      )}
      {centerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4">
          <form onSubmit={submitCenter} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Yangi tashkilot qo'shish</h2>
                <div className="mt-1 text-xs font-bold text-slate-500">Ariza Platform Admin tasdig'iga yuboriladi</div>
              </div>
              <button type="button" onClick={closeCenterModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot turi</span>
                <select
                  value={centerForm.organizationType}
                  onChange={e => setCenterForm(prev => ({
                    ...prev,
                    organizationType: e.target.value,
                    customOrganizationType: e.target.value === 'Boshqa' ? prev.customOrganizationType : '',
                  }))}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                >
                  {centerOrganizationTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              {centerForm.organizationType === 'Boshqa' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot turini yozing</span>
                  <input
                    value={centerForm.customOrganizationType}
                    onChange={e => updateCenterForm('customOrganizationType', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    placeholder="Masalan, Respublika markazi"
                  />
                </label>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Davlat</span>
                  <select
                    value={centerForm.country}
                    onChange={e => updateCenterForm('country', e.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="O'zbekiston">O'zbekiston</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Viloyat</span>
                  <select
                    value={centerForm.region}
                    onChange={e => setCenterForm(prev => ({ ...prev, region: e.target.value, district: '' }))}
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">Viloyatni tanlang</option>
                    {centerRegions.map(region => <option key={region} value={region}>{region}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tuman/Shahar</span>
                <select
                  value={centerForm.district}
                  disabled={!centerForm.region}
                  onChange={e => updateCenterForm('district', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{centerForm.region ? 'Tumanni tanlang' : 'Avval viloyatni tanlang'}</option>
                  {centerDistrictOptions.map(district => <option key={district} value={district}>{district}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase text-slate-400">Tashkilot nomi</span>
                <input
                  value={centerForm.name}
                  onChange={e => updateCenterForm('name', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Masalan, ProSkill Language"
                  autoFocus
                />
              </label>
              <div>
                <span className="mb-2 block text-xs font-black uppercase text-slate-400">Yo'naltirilgan fanlar</span>
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
                        className={`rounded-lg px-3 py-1.5 text-xs font-black ring-1 transition ${active ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100'}`}
                      >
                        {subject}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={closeCenterModal} className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Bekor qilish
              </button>
              <button disabled={centerSaving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                {centerSaving ? 'Yuborilmoqda...' : 'Arizani yuborish'}
              </button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white shadow-2xl"
          style={{ background: 'rgba(13,15,35,0.92)', backdropFilter: 'blur(16px)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { OwnerDashboard });
