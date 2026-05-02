// pages/ManagerDashboard.jsx

const ManagerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [createModal, setCreateModal] = React.useState(false);
  const [telegramModal, setTelegramModal] = React.useState(null);
  const [newOlympiad, setNewOlympiad] = React.useState({ title: '', subject: 'Matematika', startDate: '', startTime: '10:00', duration: 60, maxScore: 100, status: 'draft' });
  const [editingOlympiadId, setEditingOlympiadId] = React.useState(null);
  const [assignModal, setAssignModal] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [pendingStudents, setPendingStudents] = React.useState([]);
  const [assignedQuestionIds, setAssignedQuestionIds] = React.useState([]);
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Manager's center
  const managerRole = user.roles?.manager;
  const managerCenterId = managerRole?.centerId || null;
  const loadPendingStudents = React.useCallback(() => {
    if (!isApi || !managerCenterId) {
      setPendingStudents([]);
      return Promise.resolve();
    }
    return OlympyApi.getPendingMemberships(managerCenterId, 'student', OlympyApi.getToken())
      .then(rows => setPendingStudents(Array.isArray(rows) ? rows : []));
  }, [isApi, managerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    loadPendingStudents().catch(err => {
      if (!cancelled) {
        console.warn('getPendingMemberships failed:', err);
        setPendingStudents([]);
      }
    });
    return () => { cancelled = true; };
  }, [loadPendingStudents]);

  React.useEffect(() => {
    setAssignedQuestionIds(assignModal?.questionIds || []);
  }, [assignModal?.id]);

  // ─── API rejimida olimpiada/savol/markazlarni real backend'dan olish ───
  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiQuestionsRes = useApiData(
    () => (isApi && managerCenterId)
      ? OlympyApi.getQuestions(managerCenterId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, managerCenterId],
  );

  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const apiQuestions = isApi && Array.isArray(apiQuestionsRes.data) ? apiQuestionsRes.data.map(mapApiQuestion) : null;

  const baseCenters = apiCenters || store.centers;
  const center = managerCenterId ? baseCenters.find(c => String(c.id) === String(managerCenterId)) : null;
  const centerId = center?.id;
  const centerName = center?.name || 'Markaz';

  // Olympiads of this center (live)
  const olympiads = (apiOlympiads || store.olympiads).filter(o => String(o.centerId) === String(centerId));
  // Questions of this center (for assigning to olympiads)
  const centerQuestions = (apiQuestions || store.questions).filter(q => String(q.centerId) === String(centerId));

  // Live students at this center (approved)
  const students = store.users.filter(u =>
    u.roles?.student?.status === 'approved' && u.roles.student.centerId === centerId
  ).map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    joined: u.joined,
    subject: u.roles?.student?.subject || '—',
    olympiads: u.olympiads || 0,
    avgScore: u.avgScore || 0,
    status: 'Tasdiqlandi',
  }));

  // Live student-join requests at this center
  const mockRequests = store.requests.filter(r => r.type === 'student' && r.centerId === centerId).map(r => {
    const u = store.users.find(x => x.id === r.userId);
    return {
      id: r.id,
      name: u?.name || '—',
      phone: u?.phone || '—',
      date: r.date,
      subject: u?.roles?.student?.subject || r.subject || '—',
      status: statusLabel(r.status),
      _raw: r,
    };
  });
  const apiRequests = pendingStudents.map(m => ({
    id: `api:student:${m.membership_id}`,
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    date: (m.created_at || '').slice(0, 10),
    subject: m.subject || '—',
    status: 'Kutilmoqda',
    _raw: m,
  }));
  const requests = isApi ? apiRequests : mockRequests;

  const handleRequest = (id, action, raw) => {
    if (isApi) {
      const token = OlympyApi.getToken();
      const requestRow = raw || requests.find(r => r.id === id)?._raw;
      const membershipId = requestRow?.membership_id ?? requestRow?.membershipId ?? requestRow?.backendId;
      if (!membershipId || !centerId) {
        showToast('⚠ API rejimida ariza ma\'lumoti yetarli emas');
        return;
      }
      const backendCenterId = center?.backendId ?? centerId;
      OlympyApi.approveStudent(
        backendCenterId,
        { membership_id: membershipId, decision: action === 'approve' ? 'approved' : 'rejected' },
        token,
      )
        .then(() => loadPendingStudents())
        .then(() => showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi'))
        .catch(err => { console.warn('approveStudent failed:', err); showToast("⚠ Tasdiqlab bo'lmadi"); });
      return;
    }
    if (action === 'approve') OlympyStore.approveRequest(id);
    else OlympyStore.rejectRequest(id);
    showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi');
  };

  const pendingCount = requests.filter(r => r.status === 'Kutilmoqda').length;
  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'students', icon: 'users', label: "O'quvchilar", badge: students.length },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'olympiads', icon: 'trophy', label: 'Olimpiadalar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'leaderboard', icon: 'star', label: 'Reyting' },
    { divider: true, key: 'd1' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{centerName}</h2>
          <p className="text-white/40 text-sm">Manager paneli · {new Date().toLocaleDateString('uz-UZ')}</p>
        </div>
        <button onClick={() => setCreateModal(true)} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={16} /> Olimpiada yaratish
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Jami o'quvchilar" value={students.length} sub={students.length > 0 ? `↑ ${students.length}` : ''} icon={<Icon name="users" size={20} />} color="from-indigo-500 to-purple-600" glow="glow-blue" />
        <StatCard label="Faol olimpiadalar" value={olympiads.filter(o => o.status === 'active').length} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Kutilayotgan arizalar" value={pendingCount} sub={pendingCount > 0 ? 'Yangi' : ''} icon={<Icon name="bell" size={20} />} color="from-rose-500 to-pink-600" />
        <StatCard label="O'rtacha natija" value="78.4%" icon={<Icon name="chart" size={20} />} color="from-emerald-500 to-teal-600" />
      </div>

      {/* Pending requests quick view */}
      {requests.filter(r => r.status === 'Kutilmoqda').length > 0 && (
        <div className="glass rounded-2xl p-5 border border-amber-500/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <h3 className="font-bold text-white">Yangi arizalar</h3>
            </div>
            <button onClick={() => setPage('requests')} className="text-xs text-indigo-400">Barchasini ko'rish →</button>
          </div>
          <div className="space-y-2">
            {requests.filter(r => r.status === 'Kutilmoqda').slice(0, 3).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <Avatar name={r.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{r.name}</div>
                  <div className="text-xs text-white/40">{r.date} · {r.subject}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setTelegramModal(r)} className="text-xs glass px-2 py-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-all border border-indigo-500/20">📱</button>
                  <button onClick={() => handleRequest(r.id, 'approve')} className="btn-success text-xs px-3 py-1.5 rounded-lg">✓</button>
                  <button onClick={() => handleRequest(r.id, 'reject')} className="btn-danger text-xs px-3 py-1.5 rounded-lg">✗</button>
                </div>
              </div>
            ))}
            {pendingCount === 0 && <div className="text-sm text-white/40 px-3 py-2">Yangi arizalar yo'q</div>}
          </div>
        </div>
      )}

      {/* Olympiad overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Olimpiadalar</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400">Ko'rish →</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 3).map(o => (
              <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${o.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : o.status === 'draft' ? 'bg-white/10 text-white/40' : 'bg-indigo-500/20 text-indigo-400'}`}>
                  {o.status === 'active' ? '▶' : o.status === 'draft' ? '✏' : '✓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{o.title}</div>
                  <div className="text-xs text-white/40">{o.participants || 0} ishtirokchi</div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Eng yaxshi o'quvchilar</h3>
          <div className="space-y-3">
            {[...students].sort((a,b) => b.avgScore - a.avgScore).slice(0,4).map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-amber-500/30 text-amber-400' : i === 1 ? 'bg-slate-400/30 text-slate-300' : i === 2 ? 'bg-amber-700/30 text-amber-600' : 'glass text-white/40'}`}>
                  {i+1}
                </div>
                <Avatar name={s.name} size={30} gradient={i === 0 ? 'from-amber-400 to-orange-500' : 'from-indigo-500 to-purple-600'} />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium text-white truncate">{s.name}</div></div>
                <div className="text-sm font-bold text-white">{s.avgScore}%</div>
              </div>
            ))}
            {students.length === 0 && <div className="text-sm text-white/40">Hali tasdiqlangan o'quvchilar yo'q</div>}
          </div>
        </div>
      </div>

      {/* Weekly stats bar chart */}
      <div className="glass rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">Haftalik faollik</h3>
        <BarChart data={[
          { label: 'Dush', value: 42 }, { label: 'Sesh', value: 78 }, { label: 'Chor', value: 55 },
          { label: 'Pay', value: 91 }, { label: 'Jum', value: 67 }, { label: 'Shan', value: 34 }, { label: 'Yak', value: 20 },
        ]} />
      </div>
    </div>
  );

  const renderStudents = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">O'quvchilar ({students.length})</h2>
        <div className="relative"><Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" /><input className="input-field pl-10 py-2" placeholder="Qidirish..." /></div>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {["O'quvchi", 'Telefon', 'Olimpiadalar', "O'rt. ball", 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.name} size={32} /><div><div className="text-sm font-medium text-white">{s.name}</div><div className="text-xs text-white/40">{s.joined}</div></div></div></td>
                <td className="px-4 py-3 text-sm text-white/60">{s.phone.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                <td className="px-4 py-3 text-sm text-white">{s.olympiads}</td>
                <td className="px-4 py-3"><span className={`font-bold text-sm ${s.avgScore >= 90 ? 'text-emerald-400' : s.avgScore >= 70 ? 'text-indigo-400' : 'text-amber-400'}`}>{s.avgScore || 0}%</span></td>
                <td className="px-4 py-3"><Badge status={s.status} /></td>
                <td className="px-4 py-3"><button className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Ko'rish</button></td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40 text-sm">Tasdiqlangan o'quvchilar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Arizalar</h2>
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          {pendingCount} ta kutilmoqda
        </div>
      </div>

      {/* Telegram bot mockup */}
      <div className="glass rounded-2xl p-5 border border-indigo-500/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl" style={{ background: '#2b5278' }}><div className="w-full h-full flex items-center justify-center text-white font-bold text-sm rounded-xl">TG</div></div>
          <div><div className="text-sm font-bold text-white">Telegram Bot Integratsiya</div><div className="text-xs text-white/40">Arizalar Telegram orqali ham tasdiqlanadi</div></div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Faol</div>
        </div>
        {telegramModal && (
          <div className="flex justify-center"><TelegramMockup studentName={telegramModal.name} centerName={centerName}
            onApprove={() => { handleRequest(telegramModal.id, 'approve'); setTelegramModal(null); }}
            onReject={() => { handleRequest(telegramModal.id, 'reject'); setTelegramModal(null); }} /></div>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['O\'quvchi', 'Telefon', 'Ariza sanasi', 'Fan', 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={r.name} size={32} /><span className="text-sm font-medium text-white">{r.name}</span></div></td>
                <td className="px-4 py-3 text-sm text-white/60">{r.phone.replace ? r.phone.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2') : r.phone}</td>
                <td className="px-4 py-3 text-sm text-white/60">{r.date}</td>
                <td className="px-4 py-3">{r.subject && r.subject !== '—' ? <SubjectBadge subject={r.subject} /> : <span className="text-xs text-white/30">—</span>}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status === 'Kutilmoqda' ? (
                    <div className="flex gap-2">
                      <button onClick={() => setTelegramModal(r)} title="Telegram orqali" className="text-xs glass px-2 py-1.5 rounded-lg text-indigo-400 border border-indigo-500/20">📱</button>
                      <button onClick={() => handleRequest(r.id, 'approve')} className="btn-success text-xs px-3 py-1.5 rounded-xl">Tasdiqlash</button>
                      <button onClick={() => handleRequest(r.id, 'reject')} className="btn-danger text-xs px-3 py-1.5 rounded-xl">Rad etish</button>
                    </div>
                  ) : <span className="text-xs text-white/30">—</span>}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40 text-sm">Arizalar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Olimpiadalar</h2>
        <button onClick={() => setCreateModal(true)} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15} /> Yangi olimpiada
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {olympiads.length === 0 && (
          <EmptyState icon="trophy" title="Olimpiadalar yo'q" desc="Birinchi olimpiadangizni yarating"
            action={<button onClick={() => setCreateModal(true)} className="btn-primary px-4 py-2 rounded-xl text-sm">Yaratish</button>} />
        )}
        {olympiads.map(o => {
          const assignedCount = (o.questionIds || []).length;
          return (
            <div key={o.id} className="glass rounded-2xl p-5 flex items-center gap-4 flex-wrap">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${o.status === 'active' ? 'bg-emerald-500/15' : o.status === 'draft' ? 'bg-white/5' : 'bg-indigo-500/15'}`}>
                {o.status === 'active' ? '🏆' : o.status === 'draft' ? '📝' : '✅'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white mb-1">{o.title}</div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                  <SubjectBadge subject={o.subject} />
                  <span>📅 {o.startDate || o.date}</span>
                  <span>⏱ {o.duration} min</span>
                  <span>📋 {assignedCount} ta savol</span>
                  <span>👥 {o.participants || 0} ishtirokchi</span>
                  {o.avgScore > 0 && <span className="text-emerald-400">Ø {o.avgScore}%</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={statusLabel(o.status)} />
                <button onClick={() => setAssignModal(o)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1">
                  <Icon name="book" size={13} /> Savollar ({assignedCount})
                </button>
                {o.status === 'draft' && (
                  <button onClick={() => {
                    if ((o.questionIds || []).length === 0) { showToast("⚠ Avval savollar tayinlang"); return; }
                    if (isApi) {
                      const token = OlympyApi.getToken();
                      OlympyApi.publishOlympiad(o.backendId ?? o.id, token)
                        .then(() => { showToast("✓ Olimpiada e'lon qilindi"); apiOlympiadsRes.reload(); })
                        .catch(err => { console.warn('publishOlympiad failed:', err); showToast("⚠ E'lon qilib bo'lmadi"); });
                      return;
                    }
                    OlympyStore.publishOlympiad(o.id);
                    showToast("✓ Olimpiada e'lon qilindi va o'quvchilarga xabar yuborildi");
                  }}
                    className="btn-primary text-xs px-3 py-1.5 rounded-xl">E'lon qilish</button>
                )}
                {o.status === 'active' && (
                  <button onClick={() => {
                    if (isApi) {
                      const token = OlympyApi.getToken();
                      OlympyApi.finishOlympiad(o.backendId ?? o.id, token)
                        .then(() => { showToast('✓ Olimpiada yakunlandi'); apiOlympiadsRes.reload(); })
                        .catch(err => { console.warn('finishOlympiad failed:', err); showToast("⚠ Yakunlab bo'lmadi"); });
                      return;
                    }
                    OlympyStore.updateOlympiad(o.id, { status: 'finished' });
                    showToast('✓ Olimpiada yakunlandi');
                  }}
                    className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Yakunlash</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderResults = () => (
    <div className="p-6 space-y-6 animate-in">
      <h2 className="text-xl font-black text-white">Natijalar</h2>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="O'rtacha ball" value="78.4%" icon={<Icon name="chart" size={18} />} color="from-indigo-500 to-purple-600" />
        <StatCard label="Eng yuqori" value="96%" icon={<Icon name="trophy" size={18} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Qatnashuvchilar" value="484" icon={<Icon name="users" size={18} />} color="from-cyan-500 to-blue-600" />
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="font-bold text-white mb-4">Olimpiada natijalari</h3>
        {olympiads.filter(o => o.status === 'finished').map(o => (
          <div key={o.id} className="flex items-center gap-4 p-4 glass rounded-xl mb-3">
            <div className="flex-1"><div className="font-semibold text-white">{o.title}</div><div className="text-xs text-white/40">{o.participants || 0} ishtirokchi</div></div>
            <DonutChart value={o.avgScore || 0} size={60} />
            <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl">Reyting</button>
          </div>
        ))}
        {olympiads.filter(o => o.status === 'finished').length === 0 && (
          <div className="text-sm text-white/40 px-3 py-2">Tugatilgan olimpiadalar yo'q</div>
        )}
      </div>
    </div>
  );

  const pagesMap = { home: renderHome, students: renderStudents, requests: renderRequests, olympiads: renderOlympiads, results: renderResults };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPage}
        user={{ ...user, role: 'Manager' }} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Dashboard'} subtitle={centerName} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
                </button>
              )}
              <button onClick={() => setCreateModal(true)} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="plus" size={14} /> Olimpiada
              </button>
            </div>
          } />
        <main className="flex-1 overflow-y-auto">
          {page === 'leaderboard' ? <LeaderboardPage embedded /> :
           page === 'questions' ? <QuestionCreatorPage embedded user={user} /> :
           (pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>

      {/* Create olympiad modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Olimpiada yaratish" width="max-w-xl">
        <div className="space-y-4">
          <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Olimpiada nomi</label>
            <input className="input-field" placeholder="Matematika Olimpiadasi — May 2026" value={newOlympiad.title} onChange={e => setNewOlympiad({...newOlympiad, title: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Fan kategoriyasi</label>
              <select className="input-field" value={newOlympiad.subject} onChange={e => setNewOlympiad({...newOlympiad, subject: e.target.value})}>
                {store.subjects.map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Holat</label>
              <select className="input-field" value={newOlympiad.status} onChange={e => setNewOlympiad({...newOlympiad, status: e.target.value})}>
                <option value="draft">Draft</option>
                <option value="active">Faol</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish sanasi</label><input type="date" className="input-field" value={newOlympiad.startDate} onChange={e => setNewOlympiad({...newOlympiad, startDate: e.target.value})} /></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish vaqti</label><input type="time" className="input-field" value={newOlympiad.startTime} onChange={e => setNewOlympiad({...newOlympiad, startTime: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Davomiyligi (min)</label><input type="number" className="input-field" value={newOlympiad.duration} onChange={e => setNewOlympiad({...newOlympiad, duration: +e.target.value})} /></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Maksimal ball</label><input type="number" className="input-field" value={newOlympiad.maxScore} onChange={e => setNewOlympiad({...newOlympiad, maxScore: +e.target.value})} /></div>
          </div>
          <div className="glass rounded-xl p-3 border border-indigo-500/15 text-xs text-indigo-200">
            <Icon name="info" size={12} className="inline" /> Olimpiada saqlangach, "Savollar" tugmasi orqali savollar tayinlang. E'lon qilish faqat savollar tayinlangandan so'ng mumkin.
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setCreateModal(false)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
            <button onClick={() => {
              if (!newOlympiad.title || !newOlympiad.startDate) { showToast('⚠ Nomi va sanani kiriting'); return; }
              if (isApi) {
                const token = OlympyApi.getToken();
                const backendCenterId = center?.backendId ?? centerId;
                const startIso = `${newOlympiad.startDate}T${newOlympiad.startTime || '00:00'}:00`;
                OlympyApi.createOlympiad({
                  center: backendCenterId,
                  title: newOlympiad.title,
                  subject: newOlympiad.subject,
                  start_datetime: startIso,
                  duration_minutes: newOlympiad.duration,
                  max_score: newOlympiad.maxScore,
                }, token)
                  .then(() => { showToast('✓ Olimpiada yaratildi'); apiOlympiadsRes.reload(); })
                  .catch(err => { console.warn('createOlympiad failed:', err); showToast("⚠ Yaratib bo'lmadi"); });
                setNewOlympiad({ title: '', subject: 'Matematika', startDate: '', startTime: '10:00', duration: 60, maxScore: 100, status: 'draft' });
                setCreateModal(false);
                return;
              }
              OlympyStore.createOlympiad({
                centerId,
                title: newOlympiad.title,
                subject: newOlympiad.subject,
                startDate: newOlympiad.startDate,
                startTime: newOlympiad.startTime,
                duration: newOlympiad.duration,
                maxScore: newOlympiad.maxScore,
                status: 'draft', // Always start as draft; publish via button
                createdBy: user.id,
              });
              setNewOlympiad({ title: '', subject: 'Matematika', startDate: '', startTime: '10:00', duration: 60, maxScore: 100, status: 'draft' });
              setCreateModal(false);
              showToast('✓ Olimpiada yaratildi');
            }} className="btn-primary flex-1 py-3 rounded-xl font-semibold">Saqlash</button>
          </div>
        </div>
      </Modal>

      {/* Assign-questions modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Savollarni tayinlash" width="max-w-2xl">
        {assignModal && (() => {
          const liveOlympiad = (isApi ? olympiads : store.olympiads).find(o => o.id === assignModal.id) || assignModal;
          if (!liveOlympiad) return null;
          const subjectQs = centerQuestions.filter(q => q.subject === liveOlympiad.subject);
          const otherQs = centerQuestions.filter(q => q.subject !== liveOlympiad.subject);
          const assigned = new Set(isApi ? assignedQuestionIds : (liveOlympiad.questionIds || []));
          const toggle = (id) => {
            const next = assigned.has(id) ? [...assigned].filter(x => x !== id) : [...assigned, id];
            if (isApi) {
              setAssignedQuestionIds(next);
            } else {
              OlympyStore.updateOlympiad(liveOlympiad.id, { questionIds: next });
            }
          };
          const saveAssignment = () => {
            if (!isApi) {
              setAssignModal(null);
              return;
            }
            const backendOlympiadId = liveOlympiad.backendId ?? liveOlympiad.id;
            const selectedQuestionIds = assignedQuestionIds.map(id => {
              const question = centerQuestions.find(q => String(q.id) === String(id));
              return question?.backendId ?? id;
            });
            setAssignmentSaving(true);
            OlympyApi.updateOlympiadQuestions(backendOlympiadId, selectedQuestionIds, OlympyApi.getToken())
              .then(() => {
                showToast('✓ Savollar tayinlandi');
                setAssignModal(null);
                apiOlympiadsRes.reload();
              })
              .catch(err => {
                console.warn('updateOlympiadQuestions failed:', err);
                showToast("⚠ Savollarni saqlab bo'lmadi");
              })
              .finally(() => setAssignmentSaving(false));
          };
          return (
            <div className="space-y-3">
              <div className="text-sm text-white/60">{liveOlympiad.title} — {liveOlympiad.subject}</div>
              <div className="text-xs text-white/40">Tayinlangan: <span className="text-white">{assigned.size}</span> / {centerQuestions.length} ta mavjud</div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {subjectQs.length > 0 && <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-1">Tegishli fan savollari</div>}
                {subjectQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{q.text}</div>
                      <div className="text-xs text-white/40 mt-1">{q.difficulty} · {q.score} ball · {q.source}</div>
                    </div>
                  </label>
                ))}
                {otherQs.length > 0 && <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-3">Boshqa fan savollari</div>}
                {otherQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5 opacity-70">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{q.text}</div>
                      <div className="text-xs text-white/40 mt-1">{q.subject} · {q.difficulty} · {q.score} ball</div>
                    </div>
                  </label>
                ))}
                {centerQuestions.length === 0 && (
                  <div className="text-sm text-white/40 text-center py-6">Bu markaz uchun savollar yaratilmagan. <br/>Savollar bo'limidan boshlang.</div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveAssignment} disabled={assignmentSaving}
                  className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">
                  {isApi ? (assignmentSaving ? 'Saqlanmoqda...' : 'Saqlash') : 'Yopish'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>
      )}
    </div>
  );
};

Object.assign(window, { ManagerDashboard });
