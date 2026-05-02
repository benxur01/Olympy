// pages/OwnerDashboard.jsx — Center Owner panel: staff approval (manager/teacher requests)

const OwnerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const [confirmAction, setConfirmAction] = React.useState(null);
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  const [pendingManagers, setPendingManagers] = React.useState([]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const ownerRole = user.roles?.owner;
  const ownerCenterId = ownerRole?.centerId || null;
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
    loadPendingStaff().catch(err => {
      if (!cancelled) {
        console.warn('getPendingMemberships failed:', err);
        setPendingTeachers([]);
        setPendingManagers([]);
      }
    });
    return () => { cancelled = true; };
  }, [loadPendingStaff]);

  // ─── API rejimida markaz va arizalarni real backend'dan olish ──────────
  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const baseCenters = apiCenters || store.centers;

  const center = ownerCenterId ? baseCenters.find(c => String(c.id) === String(ownerCenterId)) : null;

  // Pending guard — owner cannot manage staff until center is approved
  if (!center || center.status !== 'approved') {
    return (
      <PendingAccessCard
        title={center?.status === 'rejected' ? 'Markaz arizasi rad etildi' : 'Markaz tasdig\'i kutilmoqda'}
        status={center?.status || 'pending'}
        message={
          center?.status === 'rejected'
            ? "Markaz ro'yxatdan o'tkazish arizangiz Platform Admin tomonidan rad etildi. Yangi ariza yuborish uchun support bilan bog'laning."
            : "Markaz egasi paneliga kirish uchun Platform Admin markazingizni tasdiqlashi kerak. Markaz tasdiqlangach, Manager va O'qituvchi arizalari bilan ishlay olasiz."
        }
        extra={center && (
          <div className="glass rounded-2xl p-4 inline-flex items-center gap-3">
            <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{center.name[0]}</div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">{center.name}</div>
              <div className="text-xs text-white/40">{center.city}</div>
            </div>
            <span className={`chip ${center.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>
              {statusLabel(center.status)}
            </span>
          </div>
        )}
        onBack={() => onNavigate('landing')}
      />
    );
  }

  // Center is approved — show full dashboard
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

  const myStaff = store.users.filter(u =>
    (u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id) ||
    (u.roles?.teacher?.status === 'approved' && u.roles.teacher.centerId === center.id)
  );

  const navItems = [
    { key:'home',     icon:'home',     label:'Asosiy' },
    { key:'staff',    icon:'users',    label:'Xodimlar' },
    { key:'requests', icon:'bell',     label:'Arizalar', badge: pendingCount || undefined },
    { key:'center',   icon:'building', label:'Markaz' },
    { divider:true, key:'d1' },
    { key:'settings', icon:'settings', label:'Sozlamalar' },
  ];

  const callApiApproval = (req, decision) => {
    const token = OlympyApi.getToken();
    const backendCenterId = center?.backendId ?? center?.id;
    const membershipId = req?.membership_id ?? req?.membershipId ?? req?.backendId;
    if (!membershipId || !backendCenterId) return Promise.reject(new Error('membership_id missing'));
    const fn = req.type === 'manager' ? OlympyApi.approveManager : OlympyApi.approveTeacher;
    return fn(backendCenterId, { membership_id: membershipId, decision }, token);
  };
  const requestUser = (req) => req?._api
    ? {
        name: req.user?.full_name || req.user?.name || '—',
        phone: req.user?.normalized_phone || req.user?.phone || '—',
      }
    : store.users.find(x => x.id === req.userId);

  const approve = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (req) {
        callApiApproval(req, 'approved')
          .then(() => loadPendingStaff())
          .then(() => showToast('✓ Ariza tasdiqlandi'))
          .catch(err => { console.warn('approve failed:', err); showToast("⚠ Tasdiqlab bo'lmadi"); });
        return;
      }
      showToast("⚠ Ariza topilmadi");
      return;
    }
    OlympyStore.approveRequest(id); showToast("✓ Ariza tasdiqlandi");
  };
  const reject = (id) => {
    if (isApi) {
      const req = centerRequests.find(r => r.id === id);
      if (req) {
        callApiApproval(req, 'rejected')
          .then(() => loadPendingStaff())
          .then(() => showToast('✗ Ariza rad etildi'))
          .catch(err => { console.warn('reject failed:', err); showToast("⚠ Rad etib bo'lmadi"); });
        return;
      }
      showToast("⚠ Ariza topilmadi");
      return;
    }
    OlympyStore.rejectRequest(id); showToast("✗ Ariza rad etildi");
  };

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{center.name}</h2>
          <p className="text-white/40 text-sm">Markaz egasi paneli · {new Date().toLocaleDateString('uz-UZ')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Xodimlar" value={myStaff.length} icon={<Icon name="users" size={20} />} color="from-indigo-500 to-purple-600" glow="glow-blue" />
        <StatCard label="Kutilayotgan arizalar" value={pendingCount} icon={<Icon name="bell" size={20} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Markaz holati" value={statusLabel(center.status)} icon={<Icon name="shield" size={20} />} color="from-emerald-500 to-teal-600" />
        <StatCard label="Reyting" value={center.rating || '—'} icon={<Icon name="star" size={20} />} color="from-cyan-500 to-blue-600" />
      </div>

      {pendingCount > 0 && (
        <div className="glass rounded-2xl p-5 border border-amber-500/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <h3 className="font-bold text-white">Kutilayotgan arizalar ({pendingCount})</h3>
            </div>
            <button onClick={() => setPage('requests')} className="text-xs text-indigo-400">Hammasini ko'rish →</button>
          </div>
          <div className="space-y-2">
            {[...pendingManagerReqs, ...pendingTeacherReqs].slice(0, 4).map(r => {
              const u = requestUser(r);
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                  <Avatar name={u?.name || '?'} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{u?.name}</div>
                    <div className="text-xs text-white/40">
                      {r.type === 'manager' ? 'Manager arizasi' : `O'qituvchi · ${r.subject || ''}`}
                    </div>
                  </div>
                  <button onClick={() => approve(r.id)} className="btn-success text-xs px-3 py-1.5 rounded-lg">✓</button>
                  <button onClick={() => reject(r.id)} className="btn-danger text-xs px-3 py-1.5 rounded-lg">✗</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Xodimlar</h3>
            <button onClick={() => setPage('staff')} className="text-xs text-indigo-400">Ko'rish →</button>
          </div>
          <div className="space-y-3">
            {myStaff.length === 0 && <div className="text-sm text-white/40">Hali xodimlar yo'q.</div>}
            {myStaff.slice(0, 4).map(u => {
              const isMgr = u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id;
              return (
                <div key={u.id} className="flex items-center gap-3">
                  <Avatar name={u.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{u.name}</div>
                    <div className="text-xs text-white/40">{isMgr ? 'Manager' : "O'qituvchi"}{u.roles?.teacher?.subject ? ` · ${u.roles.teacher.subject}` : ''}</div>
                  </div>
                  <Badge status="Tasdiqlandi" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Markaz ma'lumotlari</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/40">Nomi:</span><span className="text-white font-medium">{center.name}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Shahar:</span><span className="text-white">{center.city}</span></div>
            <div className="flex justify-between"><span className="text-white/40">O'quvchilar:</span><span className="text-white">{center.students}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Olimpiadalar:</span><span className="text-white">{center.olympiads}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Yaratilgan:</span><span className="text-white">{center.createdAt || '—'}</span></div>
          </div>
          <div className="flex flex-wrap gap-1 mt-3">
            {(center.subjects || []).map(s => <SubjectBadge key={s} subject={s} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStaff = () => (
    <div className="p-6 space-y-6 animate-in">
      <h2 className="text-xl font-black text-white">Xodimlar ({myStaff.length})</h2>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['Ism','Telefon','Rol','Fan','Holat'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {myStaff.map(u => {
              const isMgr = u.roles?.manager?.status === 'approved' && u.roles.manager.centerId === center.id;
              return (
                <tr key={u.id} className="table-row">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} size={32} /><span className="text-sm font-medium text-white">{u.name}</span></div></td>
                  <td className="px-4 py-3 text-sm text-white/60">{u.phone.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                  <td className="px-4 py-3"><span className="chip glass text-xs text-white/60">{isMgr ? 'Manager' : "O'qituvchi"}</span></td>
                  <td className="px-4 py-3 text-sm text-white/60">{u.roles?.teacher?.subject || '—'}</td>
                  <td className="px-4 py-3"><Badge status="Tasdiqlandi" /></td>
                </tr>
              );
            })}
            {myStaff.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-white/40 text-sm">Hali tasdiqlangan xodimlar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRequests = () => {
    const allCenterReqs = centerRequests.filter(r => r.type === 'manager' || r.type === 'teacher');
    return (
      <div className="p-6 space-y-6 animate-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Xodim arizalari</h2>
          <div className="flex items-center gap-2 text-sm text-white/40">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            {pendingCount} ta kutilmoqda
          </div>
        </div>

        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-white/5">
              {['Ism','Tur','Fan','Sana','Holat','Amal'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {allCenterReqs.map(r => {
                const u = requestUser(r);
                return (
                  <tr key={r.id} className="table-row">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u?.name || '?'} size={32} /><span className="text-sm font-medium text-white">{u?.name}</span></div></td>
                    <td className="px-4 py-3"><span className="chip glass text-xs text-white/60">{r.type === 'manager' ? 'Manager' : "O'qituvchi"}</span></td>
                    <td className="px-4 py-3">{r.subject ? <SubjectBadge subject={r.subject} /> : <span className="text-xs text-white/30">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-white/60">{r.date}</td>
                    <td className="px-4 py-3"><Badge status={statusLabel(r.status)} /></td>
                    <td className="px-4 py-3">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => approve(r.id)} className="btn-success text-xs px-3 py-1.5 rounded-xl">Tasdiqlash</button>
                          <button onClick={() => reject(r.id)} className="btn-danger text-xs px-3 py-1.5 rounded-xl">Rad etish</button>
                        </div>
                      ) : <span className="text-xs text-white/30">—</span>}
                    </td>
                  </tr>
                );
              })}
              {allCenterReqs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40 text-sm">Arizalar yo'q</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCenter = () => (
    <div className="p-6 space-y-6 animate-in">
      <h2 className="text-xl font-black text-white">Markaz ma'lumotlari</h2>
      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 gradient-bg rounded-2xl flex items-center justify-center text-white font-black text-xl">{center.name[0]}</div>
          <div>
            <div className="text-xl font-bold text-white">{center.name}</div>
            <div className="text-sm text-white/40">{center.city}</div>
          </div>
          <div className="ml-auto"><Badge status={statusLabel(center.status)} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-3 text-center"><div className="text-xl font-black text-white">{center.students}</div><div className="text-xs text-white/40">O'quvchi</div></div>
          <div className="glass rounded-xl p-3 text-center"><div className="text-xl font-black text-white">{center.olympiads}</div><div className="text-xs text-white/40">Olimpiada</div></div>
          <div className="glass rounded-xl p-3 text-center"><div className="text-xl font-black text-white">{myStaff.length}</div><div className="text-xs text-white/40">Xodim</div></div>
          <div className="glass rounded-xl p-3 text-center"><div className="text-xl font-black text-white">{center.rating || '—'}</div><div className="text-xs text-white/40">Reyting</div></div>
        </div>
        <div>
          <div className="text-xs text-white/40 mb-2">Yo'naltirilgan fanlar</div>
          <div className="flex flex-wrap gap-1.5">
            {(center.subjects || []).map(s => <SubjectBadge key={s} subject={s} />)}
            {(!center.subjects || center.subjects.length === 0) && <span className="text-xs text-white/30">—</span>}
          </div>
        </div>
      </div>
    </div>
  );

  const pagesMap = { home: renderHome, staff: renderStaff, requests: renderRequests, center: renderCenter };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPage}
        user={{ ...user, role: 'Markaz egasi' }} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Egasi'} subtitle={center.name} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
              <Icon name="users" size={13} /> Rolni almashtirish
            </button>
          } />
        <main className="flex-1 overflow-y-auto">
          {(pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>}
    </div>
  );
};

Object.assign(window, { OwnerDashboard });
