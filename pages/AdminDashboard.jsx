// pages/AdminDashboard.jsx

const ADMIN_CENTERS = [
  { id:1, name:'ProSkill Academy', city:'Toshkent', students:234, olympiads:12, status:'Faol', manager:'Sardor Usmonov' },
  { id:2, name:'Brilliant Education', city:'Samarqand', students:187, olympiads:8, status:'Faol', manager:'Kamol Nazarov' },
  { id:3, name:'Leader Academy', city:'Toshkent', students:312, olympiads:18, status:'Faol', manager:'Dilnoza Rahimova' },
  { id:4, name:'Najot Ta\'lim', city:'Buxoro', students:145, olympiads:7, status:'To\'xtatilgan', manager:'Jahongir Xasanov' },
  { id:5, name:'IT Park Academy', city:'Toshkent', students:278, olympiads:14, status:'Faol', manager:'Rustam Qodirov' },
];

const ADMIN_USERS = [
  { id:1, name:'Ali Valiyev', phone:'+998901234567', role:'O\'quvchi', center:'ProSkill Academy', status:'Faol', joined:'2026-03-15' },
  { id:2, name:'Malika Toshmatova', phone:'+998901234570', role:'O\'quvchi', center:'Leader Academy', status:'Faol', joined:'2026-03-20' },
  { id:3, name:'Sardor Usmonov', phone:'+998901234568', role:'Manager', center:'ProSkill Academy', status:'Faol', joined:'2026-01-10' },
  { id:4, name:'Jasur Normatov', phone:'+998901234571', role:'O\'quvchi', center:'Brilliant Education', status:'Bloklangan', joined:'2026-04-01' },
  { id:5, name:'Bobur Xolmatov', phone:'+998901234580', role:'O\'quvchi', center:'—', status:'Faol', joined:'2026-04-27' },
];

const AdminDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [blockModal, setBlockModal] = React.useState(null);
  const [addCenterModal, setAddCenterModal] = React.useState(false);
  const [blockedIds, setBlockedIds] = React.useState({});
  const [toast, setToast] = React.useState('');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [newSubjectName, setNewSubjectName] = React.useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // ─── API rejimida tasdiqlangan markazlar ───────────────────────────────
  // TODO: admin centers endpoint qo'shilgach (pending markazlarni ham
  //       qaytaradigan), bu joyda mock fallback'ini olib tashlash kerak.
  //       Hozir public /api/centers/ faqat approved markazlarni beradi.
  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;

  // Live data — API approved markazlar bilan, qolgan hammasi mock
  const centers = apiCenters
    ? [...apiCenters, ...store.centers.filter(c => c.status !== 'approved' && !apiCenters.some(ac => String(ac.id) === String(c.id)))]
    : store.centers;
  const allUsers = store.users;
  const pendingCenterReqs = store.requests.filter(r => r.type === 'center' && r.status === 'pending');
  const pendingManagerReqs = store.requests.filter(r => r.type === 'manager' && r.status === 'pending');

  const toggleBlock = (id) => {
    setBlockedIds(prev => ({ ...prev, [id]: !prev[id] }));
    setBlockModal(null);
    showToast('Foydalanuvchi holati yangilandi');
  };

  const approveCenterReq = (id) => {
    if (isApi) {
      const req = store.requests.find(r => r.id === id);
      const c = req ? store.centers.find(x => x.id === req.centerId) : null;
      const backendCenterId = c?.backendId;
      if (backendCenterId) {
        OlympyApi.adminApproveCenter(backendCenterId, OlympyApi.getToken())
          .then(() => { showToast('✓ Markaz tasdiqlandi'); apiCentersRes.reload(); })
          .catch(err => { console.warn('adminApproveCenter failed:', err); showToast("⚠ Tasdiqlab bo'lmadi"); });
        return;
      }
    }
    OlympyStore.approveRequest(id);
    showToast('✓ Markaz tasdiqlandi');
  };
  const rejectCenterReq = (id) => {
    if (isApi) {
      const req = store.requests.find(r => r.id === id);
      const c = req ? store.centers.find(x => x.id === req.centerId) : null;
      const backendCenterId = c?.backendId;
      if (backendCenterId) {
        OlympyApi.adminRejectCenter(backendCenterId, OlympyApi.getToken())
          .then(() => { showToast('✗ Markaz rad etildi'); apiCentersRes.reload(); })
          .catch(err => { console.warn('adminRejectCenter failed:', err); showToast("⚠ Rad etib bo'lmadi"); });
        return;
      }
    }
    OlympyStore.rejectRequest(id);
    showToast('✗ Markaz rad etildi');
  };

  // Display table for users — derive label from real role data
  const userRows = allUsers.map(u => {
    const approved = getApprovedRoles(u);
    const primary = u.activeRole && approved.includes(u.activeRole) ? u.activeRole : (approved[0] || 'student');
    const centerId = u.roles?.[primary]?.centerId;
    const center = centerId ? centers.find(c => c.id === centerId) : null;
    return {
      id: u.id, name: u.name, phone: u.phone,
      role: ROLE_META[primary]?.label || primary,
      center: center?.name || '—',
      joined: u.joined,
      status: blockedIds[u.id] ? 'Bloklangan' : 'Faol',
    };
  });

  const navItems = [
    { key:'home', icon:'grid', label:'Dashboard' },
    { key:'centers', icon:'building', label:"O'quv markazlar", badge: pendingCenterReqs.length || undefined },
    { key:'users', icon:'users', label:'Foydalanuvchilar' },
    { key:'requests', icon:'bell', label:'Arizalar', badge: pendingManagerReqs.length || undefined },
    { key:'olympiads', icon:'trophy', label:'Olimpiadalar' },
    { key:'subjects', icon:'book', label:'Fanlar' },
    { key:'analytics', icon:'chart', label:'Tahlil' },
    { divider:true, key:'d1' },
    { key:'settings', icon:'settings', label:'Tizim sozlamalari' },
  ];

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Admin Panel</h2>
          <p className="text-white/40 text-sm">Tizim umumiy ko'rinishi · {new Date().toLocaleDateString('uz-UZ')}</p>
        </div>
        <div className="flex items-center gap-2 glass rounded-xl px-3 py-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow"></span>
          <span className="text-xs text-emerald-400 font-medium">Tizim ishlayapti</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="O'quv markazlar" value={centers.filter(c => c.status === 'approved').length} sub={pendingCenterReqs.length > 0 ? `${pendingCenterReqs.length} ta kutilmoqda` : ''} icon={<Icon name="building" size={20}/>} color="from-indigo-500 to-purple-600" glow="glow-blue" />
        <StatCard label="Jami foydalanuvchilar" value={allUsers.length} icon={<Icon name="users" size={20}/>} color="from-cyan-500 to-blue-600" />
        <StatCard label="Manager arizalari" value={pendingManagerReqs.length} icon={<Icon name="bell" size={20}/>} color="from-amber-500 to-orange-500" />
        <StatCard label="Bloklangan" value={Object.values(blockedIds).filter(Boolean).length} icon={<Icon name="shield" size={20}/>} color="from-rose-500 to-pink-600" />
      </div>

      {/* Platform analytics chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Oylik faollik</h3>
          <BarChart data={[
            {label:'Yan',value:320},{label:'Fev',value:480},{label:'Mar',value:650},
            {label:'Apr',value:890},{label:'May',value:740},{label:'Iyn',value:0},
          ]} />
          <div className="flex gap-6 mt-4 text-xs text-white/40">
            <span>📊 Qatnashuvchilar soni</span>
            <span>2026-yil statistikasi</span>
          </div>
        </div>
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white">Tizim holati</h3>
          {[
            { label:'Server', val:99.9, color:'#22c55e' },
            { label:'Ma\'lumotlar bazasi', val:98.2, color:'#6366f1' },
            { label:'API', val:100, color:'#22d3ee' },
            { label:'Telegram bot', val:97.5, color:'#a855f7' },
          ].map((s,i) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1"><span className="text-white/60">{s.label}</span><span className="font-medium" style={{color:s.color}}>{s.val}%</span></div>
              <div className="progress-bar h-1.5"><div className="progress-fill" style={{width:`${s.val}%`,background:s.color}}/></div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent centers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">So'nggi o'quv markazlar</h3>
            <button onClick={() => setPage('centers')} className="text-xs text-indigo-400">Ko'rish →</button>
          </div>
          <div className="space-y-3">
            {centers.slice(0,4).map(c => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{c.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{c.name}</div>
                  <div className="text-xs text-white/40">{c.city} · {c.students} o'quvchi</div>
                </div>
                <Badge status={statusLabel(c.status)} />
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Fanlar statistikasi</h3>
          </div>
          <div className="space-y-2">
            {[
              {s:'Matematika',cnt:8420,pct:22},
              {s:'Ingliz tili',cnt:6140,pct:16},
              {s:'Informatika',cnt:5890,pct:15},
              {s:'Fizika',cnt:4320,pct:11},
              {s:'Boshqalar',cnt:14230,pct:36},
            ].map((x,i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="text-xs text-white/50 w-24 truncate">{x.s}</div>
                <div className="flex-1 progress-bar h-2"><div className="progress-fill" style={{width:`${x.pct}%`}}/></div>
                <div className="text-xs text-white/40 w-12 text-right">{x.cnt.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderCenters = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">O'quv markazlar ({centers.length})</h2>
        <button onClick={() => setAddCenterModal(true)} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15}/> Yangi markaz
        </button>
      </div>

      {/* Pending center approvals — primary admin task */}
      {pendingCenterReqs.length > 0 && (
        <div className="glass rounded-2xl p-5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <h3 className="font-bold text-white">Tasdiqlash kutilayotgan markazlar ({pendingCenterReqs.length})</h3>
          </div>
          <div className="space-y-3">
            {pendingCenterReqs.map(req => {
              const c = centers.find(x => x.id === req.centerId);
              const owner = allUsers.find(u => u.id === req.userId);
              if (!c) return null;
              return (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                  <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0">{c.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-white/40 truncate">
                      {c.city} · Egasi: {owner?.name || '—'}{owner?.phone ? ` (${owner.phone})` : ''}
                    </div>
                    {(c.subjects || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.subjects.slice(0, 4).map(s => <SubjectBadge key={s} subject={s} />)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => approveCenterReq(req.id)} className="btn-success text-xs px-4 py-2 rounded-xl">Tasdiqlash</button>
                  <button onClick={() => rejectCenterReq(req.id)} className="btn-danger text-xs px-4 py-2 rounded-xl">Rad etish</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['Markaz','Shahar',"O'quvchilar",'Olimpiadalar','Egasi','Holat','Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {centers.map(c => {
              const owner = c.ownerId ? allUsers.find(u => u.id === c.ownerId) : null;
              return (
                <tr key={c.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{c.name[0]}</div>
                      <span className="text-sm font-medium text-white">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/50">{c.city}</td>
                  <td className="px-4 py-3 text-sm text-white">{c.students}</td>
                  <td className="px-4 py-3 text-sm text-white">{c.olympiads}</td>
                  <td className="px-4 py-3 text-sm text-white/60">{owner?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge status={statusLabel(c.status)} />
                  </td>
                  <td className="px-4 py-3">
                    {c.status === 'pending' ? (
                      <div className="flex gap-1">
                        <button onClick={() => {
                          const req = store.requests.find(r => r.type === 'center' && r.centerId === c.id && r.status === 'pending');
                          if (req) approveCenterReq(req.id);
                          else { OlympyStore.updateCenter(c.id, { status: 'approved' }); showToast('✓ Markaz tasdiqlandi'); }
                        }} className="btn-success text-xs px-2 py-1.5 rounded-xl">Tasdiqlash</button>
                        <button onClick={() => {
                          const req = store.requests.find(r => r.type === 'center' && r.centerId === c.id && r.status === 'pending');
                          if (req) rejectCenterReq(req.id);
                          else { OlympyStore.updateCenter(c.id, { status: 'rejected' }); showToast('✗ Markaz rad etildi'); }
                        }} className="btn-danger text-xs px-2 py-1.5 rounded-xl">Rad etish</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button className="btn-ghost text-xs px-2 py-1.5 rounded-xl"><Icon name="eye" size={13}/></button>
                        <button onClick={() => OlympyStore.updateCenter(c.id, { status: c.status === 'approved' ? 'rejected' : 'approved' })}
                          className={`text-xs px-2 py-1.5 rounded-xl border ${c.status === 'approved' ? 'btn-danger' : 'btn-success'}`}>
                          {c.status === 'approved' ? "To'xtatish" : 'Faollashtirish'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRequestsAdmin = () => (
    <div className="p-6 space-y-6 animate-in">
      <h2 className="text-xl font-black text-white">Manager arizalari</h2>
      <div className="text-sm text-white/40">Platform Admin sifatida siz ham Manager arizalarini ko'rib chiqishingiz mumkin (asosan markaz egasi tasdiqlaydi).</div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['Foydalanuvchi','Markaz','Sana','Holat','Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {store.requests.filter(r => r.type === 'manager').map(r => {
              const u = allUsers.find(x => x.id === r.userId);
              const c = centers.find(x => x.id === r.centerId);
              return (
                <tr key={r.id} className="table-row">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u?.name || '?'} size={32} /><span className="text-sm font-medium text-white">{u?.name}</span></div></td>
                  <td className="px-4 py-3 text-sm text-white/60">{c?.name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-white/50">{r.date}</td>
                  <td className="px-4 py-3"><Badge status={statusLabel(r.status)} /></td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button onClick={() => { OlympyStore.approveRequest(r.id); showToast('✓ Tasdiqlandi'); }} className="btn-success text-xs px-3 py-1.5 rounded-xl">Tasdiqlash</button>
                        <button onClick={() => { OlympyStore.rejectRequest(r.id); showToast('✗ Rad etildi'); }} className="btn-danger text-xs px-3 py-1.5 rounded-xl">Rad etish</button>
                      </div>
                    ) : <span className="text-xs text-white/30">—</span>}
                  </td>
                </tr>
              );
            })}
            {store.requests.filter(r => r.type === 'manager').length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-white/40 text-sm">Manager arizalari yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-black text-white">Foydalanuvchilar</h2>
        <div className="relative">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
          <input className="input-field pl-9 py-2 text-sm" placeholder="Qidirish..."/>
        </div>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['Foydalanuvchi','Telefon','Rol','Markaz','Qo\'shilgan','Holat','Amal'].map(h=>(
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {userRows.map(u => (
              <tr key={u.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={u.name} size={30}/><span className="text-sm font-medium text-white">{u.name}</span></div></td>
                <td className="px-4 py-3 text-xs text-white/50 font-mono">{u.phone.replace(/(\+998\d{2})\d{3}(\d{4})/,'$1***$2')}</td>
                <td className="px-4 py-3"><span className="chip glass text-xs text-white/60">{u.role}</span></td>
                <td className="px-4 py-3 text-xs text-white/50">{u.center}</td>
                <td className="px-4 py-3 text-xs text-white/40">{u.joined}</td>
                <td className="px-4 py-3"><span className={`chip text-xs ${u.status==='Faol'?'badge-approved':'badge-rejected'}`}>{u.status}</span></td>
                <td className="px-4 py-3">
                  <button onClick={() => setBlockModal(u)}
                    className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${u.status==='Bloklangan'?'btn-success':'btn-danger'}`}>
                    {u.status==='Bloklangan'?'Ochish':'Bloklash'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!blockModal} onClose={() => setBlockModal(null)} title={blockModal?.status==='Bloklangan'?'Blokni ochish':'Foydalanuvchini bloklash'}>
        <div className="mb-5">
          <div className="flex items-center gap-3 glass rounded-xl p-3 mb-4">
            <Avatar name={blockModal?.name||''} size={36}/>
            <div><div className="text-sm font-semibold text-white">{blockModal?.name}</div><div className="text-xs text-white/40">{blockModal?.phone}</div></div>
          </div>
          <p className="text-white/60 text-sm">{blockModal?.status==='Bloklangan'?'Bu foydalanuvchining blokini ochasizmi?':'Bu foydalanuvchini bloklamoqchimisiz?'}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setBlockModal(null)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
          <button onClick={() => toggleBlock(blockModal?.id)} className={`flex-1 py-3 rounded-xl font-semibold ${blockModal?.status==='Bloklangan'?'btn-success':'btn-danger'}`}>
            {blockModal?.status==='Bloklangan'?'Blokni ochish':'Bloklash'}
          </button>
        </div>
      </Modal>
    </div>
  );

  const renderAnalytics = () => (
    <div className="p-6 space-y-6 animate-in">
      <h2 className="text-xl font-black text-white">Platforma tahlili</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Jami olimpiadalar" value="284" sub="↑ +47" icon={<Icon name="trophy" size={18}/>} color="from-amber-500 to-orange-500"/>
        <StatCard label="Jami savollar" value="50 420" icon={<Icon name="book" size={18}/>} color="from-indigo-500 to-purple-600"/>
        <StatCard label="Bugun aktiv" value="1 284" icon={<Icon name="bolt" size={18}/>} color="from-cyan-500 to-blue-600"/>
        <StatCard label="AI savollar" value="18 200" sub="36%" icon={<Icon name="sparkles" size={18}/>} color="from-violet-500 to-purple-600"/>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Shaharlar bo'yicha</h3>
          <div className="space-y-3">
            {[{c:'Toshkent',n:7420,pct:55},{c:'Samarqand',n:3240,pct:24},{c:'Buxoro',n:1820,pct:14},{c:'Boshqalar',n:920,pct:7}].map((x,i)=>(
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-white/60 w-20">{x.c}</span>
                <div className="flex-1 progress-bar h-2"><div className="progress-fill" style={{width:`${x.pct}%`}}/></div>
                <span className="text-xs text-white/40 w-10 text-right">{x.n.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-5 flex flex-col items-center justify-center gap-4">
          <h3 className="font-bold text-white self-start">Savol yaratish usullari</h3>
          <div className="flex gap-6">
            <DonutChart value={36} color="#a855f7" size={80} label="AI" />
            <DonutChart value={28} color="#22d3ee" size={80} label="PDF" />
            <DonutChart value={36} color="#6366f1" size={80} label="Qo'lda" />
          </div>
        </div>
      </div>
    </div>
  );

  const pagesMap = { home:renderHome, centers:renderCenters, users:renderUsers, requests:renderRequestsAdmin, analytics:renderAnalytics };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPage}
        user={{...user, role:'Admin'}} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n=>n.key===page)?.label||'Admin'} subtitle="Tizim boshqaruvi" user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
                </button>
              )}
              <div className="flex items-center gap-1.5 glass rounded-xl px-3 py-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow"/><span className="text-xs text-emerald-400">Online</span></div>
            </div>
          } />
        <main className="flex-1 overflow-y-auto">
          {page==='leaderboard'?<LeaderboardPage embedded/>:
           page==='olympiads'?(
            <div className="p-6 space-y-5 animate-in">
              <h2 className="text-xl font-black text-white">Barcha olimpiadalar ({store.olympiads.length})</h2>
              <div className="glass rounded-2xl overflow-hidden">
                <table className="w-full">
                  <thead><tr className="border-b border-white/5">
                    {['Olimpiada','Markaz','Fan','Sana','Ishtirokchilar','Holat'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {store.olympiads.map(o => {
                      const c = centers.find(x => x.id === o.centerId);
                      return (
                        <tr key={o.id} className="table-row">
                          <td className="px-4 py-3 text-sm font-medium text-white">{o.title}</td>
                          <td className="px-4 py-3 text-sm text-white/60">{c?.name || '—'}</td>
                          <td className="px-4 py-3"><SubjectBadge subject={o.subject}/></td>
                          <td className="px-4 py-3 text-xs text-white/50">{o.startDate}</td>
                          <td className="px-4 py-3 text-sm text-white">{o.participants || 0}</td>
                          <td className="px-4 py-3"><Badge status={statusLabel(o.status)}/></td>
                        </tr>
                      );
                    })}
                    {store.olympiads.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40 text-sm">Hali olimpiadalar yo'q</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
           ):
           page==='subjects'?(
            <div className="p-6 space-y-5 animate-in">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-black text-white">Fanlar ({store.subjects.length})</h2>
                  <p className="text-white/40 text-sm">Platforma bo'ylab ishlatiladigan fan kategoriyalari</p>
                </div>
              </div>
              <div className="glass rounded-2xl p-5 border border-indigo-500/15">
                <div className="text-sm font-semibold text-white mb-3">Yangi fan qo'shish</div>
                <div className="flex flex-wrap gap-2">
                  <input className="input-field flex-1 min-w-48 py-2" placeholder="Fan nomi (masalan: Astronomiya)" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} />
                  <button onClick={() => {
                    const name = newSubjectName.trim();
                    if (!name) return;
                    if (store.subjects.includes(name)) { showToast(`⚠ "${name}" allaqachon mavjud`); return; }
                    OlympyStore.addSubject(name);
                    setNewSubjectName('');
                    showToast(`✓ "${name}" qo'shildi`);
                  }} className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5">
                    <Icon name="plus" size={14} /> Qo'shish
                  </button>
                </div>
              </div>
              <div className="glass rounded-2xl p-5">
                <div className="text-sm font-semibold text-white mb-3">Mavjud fanlar</div>
                <div className="flex flex-wrap gap-2">
                  {store.subjects.map(s => <SubjectBadge key={s} subject={s}/>)}
                  {store.subjects.length === 0 && <div className="text-sm text-white/40">Hali fanlar qo'shilmagan</div>}
                </div>
              </div>
            </div>
           ):
           (pagesMap[page]||renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>}
      <AdminAddCenterModal open={addCenterModal} onClose={() => setAddCenterModal(false)} onAdded={(name) => { showToast(`✓ ${name} qo'shildi (avtomatik tasdiqlandi)`); }} />
    </div>
  );
};

// Helper: Admin's own create-center modal (auto-approved, no owner)
const AdminAddCenterModal = ({ open, onClose, onAdded }) => {
  const [form, setForm] = React.useState({ name: '', city: '' });
  React.useEffect(() => { if (open) setForm({ name: '', city: '' }); }, [open]);
  const submit = () => {
    if (!form.name || !form.city) return;
    OlympyStore.createCenter({ name: form.name, city: form.city, status: 'approved' });
    onAdded && onAdded(form.name);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Yangi o'quv markaz qo'shish">
      <div className="space-y-4">
        <input className="input-field" placeholder="Markaz nomi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <input className="input-field" placeholder="Shahar" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
          <button onClick={submit} disabled={!form.name || !form.city} className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">Qo'shish</button>
        </div>
      </div>
    </Modal>
  );
};

Object.assign(window, { AdminDashboard });
