// pages/StudentDashboard.jsx

const StudentDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [centerModal, setCenterModal] = React.useState(null);
  const [centerSearch, setCenterSearch] = React.useState('');
  const [cityFilter, setCityFilter] = React.useState('');
  const [activeOlympiad, setActiveOlympiad] = React.useState(null);
  const [joinModal, setJoinModal] = React.useState(false);
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [olympiadFilter, setOlympiadFilter] = React.useState('Barchasi');
  const [apiToast, setApiToast] = React.useState('');
  const showApiToast = (m) => { setApiToast(m); setTimeout(() => setApiToast(''), 3000); };

  // ─── API rejimida ma'lumotlarni real backend'dan olish ─────────────────
  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiResultsRes = useApiData(
    () => isApi ? OlympyApi.getMyResults(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiStatsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );

  // Live student-role state from store
  const studentRole = user.roles?.student;
  const studentCenterId = studentRole?.centerId || null;
  const studentStatus = studentRole?.status || null;
  const isCenterApproved = studentStatus === 'approved' && !!studentCenterId;
  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const apiAttempts = isApi && Array.isArray(apiResultsRes.data) ? apiResultsRes.data.map(mapApiAttempt) : null;

  const allCenters = isApi ? (apiCenters || []) : store.centers;
  const myCenter = studentCenterId ? allCenters.find(c => String(c.id) === String(studentCenterId)) : null;

  // Map of centerId → join-request status for the current user
  // API rejimda backend joy-so'rovlar tarixini qaytarmaydi, faqat hozirgi
  // membership status'i mapBackendUser orqali user.roles ga tushadi.
  const myRequestByCenter = {};
  if (!isApi) {
    store.requests.filter(r => r.userId === user.id && r.type === 'student').forEach(r => {
      myRequestByCenter[r.centerId] = r.status;
    });
  } else if (studentCenterId && studentStatus) {
    myRequestByCenter[studentCenterId] = studentStatus;
  }

  // Public olympiads are visible to everyone; musobaqa is visible only for
  // approved students of the same center.
  const baseOlympiads = isApi ? (apiOlympiads || []) : store.olympiads;
  const isPublicOlympiad = (event) => (event?.eventType || 'competition') === 'olympiad';
  const studentVisibleStatuses = new Set(['active', 'finished']);
  const canAccessEvent = (event) => (
    isPublicOlympiad(event) ||
    (isCenterApproved && String(event.centerId) === String(studentCenterId))
  );
  const canEnterEvent = (event) => event?.status === 'active' && canAccessEvent(event);
  const visibleOlympiads = baseOlympiads.filter(o => {
    if (!studentVisibleStatuses.has(o.status)) return false;
    if (isPublicOlympiad(o)) return true;
    return isCenterApproved && String(o.centerId) === String(studentCenterId);
  });

  // Student's attempts and derived results
  const myAttempts = (isApi ? (apiAttempts || []) : store.attempts.filter(a => a.userId === user.id))
    .slice()
    .sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));
  const myResults = myAttempts.map(a => {
    const o = baseOlympiads.find(x => String(x.id) === String(a.olympiadId));
    return {
      id: a.id,
      attempt: a,
      olympiad: o?.title || 'Olimpiada',
      subject: o?.subject || '—',
      score: a.score,
      // Score 0..100 oraliqdagi foiz bo'lib, jami nominal 100. Avval ternary
      // `a.totalQuestions ? 100 : 100` har doim 100 qaytarardi; aniqlik uchun
      // bu yerda max 100 ni to'g'ridan-to'g'ri yozdik.
      total: 100,
      rank: a.rank,
      date: (a.submittedAt || '').slice(0,10),
      correct: a.correctCount,
      wrong: a.wrongCount,
    };
  });

  // "Fanlar bo'yicha natijalar" bloki uchun real apiStats yoki lokal myResults
  // dan kelib chiqib hisob-kitob qilamiz. Avval bu blok qattiq kodlangan
  // (Informatika 87%, Tarix 91% ...) raqamlar edi; endi haqiqiy o'rtacha ball
  // ko'rsatiladi.
  const SUBJECT_PALETTE = ['#6366f1', '#22d3ee', '#a855f7', '#f59e0b', '#10b981', '#ef4444'];
  const subjectStats = (() => {
    const apiSubjects = isApi && apiStatsRes.data?.subjects;
    if (Array.isArray(apiSubjects) && apiSubjects.length > 0) {
      return apiSubjects.slice(0, 6).map((row, i) => ({
        subject: row.subject || '—',
        score: Math.round(row.average_score || 0),
        color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
      }));
    }
    const buckets = {};
    myResults.forEach(r => {
      const key = r.subject || '—';
      const b = buckets[key] || { subject: key, total: 0, count: 0 };
      b.total += r.score || 0;
      b.count += 1;
      buckets[key] = b;
    });
    return Object.values(buckets)
      .map((b, i) => ({
        subject: b.subject,
        score: b.count ? Math.round(b.total / b.count) : 0,
        color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  })();

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'centers', icon: 'building', label: 'Tashkilotlar' },
    { key: 'leaderboard', icon: 'star', label: 'Reyting' },
    { key: 'profile', icon: 'eye', label: 'Profil' },
    { divider: true, key: 'd1' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const hasCenter = isCenterApproved;

  const sendRequest = (center) => {
    if (isApi) {
      const token = OlympyApi.getToken();
      const backendCenterId = center.backendId ?? center.id;
      OlympyApi.joinCenter(backendCenterId, { subject: '' }, token)
        .then(() => OlympyApi.getMe(token))
        .then(me => {
          if (me) {
            const next = OlympyApi.mapBackendUser(me);
            try { OlympyApi.saveAuth({ token, user: next }); } catch {}
          }
          setCenterModal(null);
          setJoinModal(true);
          setTimeout(() => setJoinModal(false), 3000);
        })
        .catch(err => { console.warn('joinCenter failed:', err); showApiToast("Ariza yuborib bo'lmadi"); });
      return;
    }
    // Reuse pending request if any, otherwise create one
    const existing = store.requests.find(r => r.userId === user.id && r.type === 'student' && r.centerId === center.id);
    if (!existing) {
      OlympyStore.createRequest({ type: 'student', userId: user.id, centerId: center.id });
      OlympyStore.setRole(user.id, 'student', { status: 'pending', centerId: center.id });
    }
    setCenterModal(null);
    setJoinModal(true);
    setTimeout(() => setJoinModal(false), 3000);
  };

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      {/* Welcome */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Salom, {user.name.split(' ')[0]}! 👋</h2>
          <p className="text-white/40 text-sm mt-1">{new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        {!hasCenter && (
          <div className="glass rounded-2xl p-4 border border-indigo-500/20 max-w-xs">
            <div className="text-xs text-indigo-300 font-medium mb-1">💡 Maslahat</div>
            <p className="text-xs text-white/50 mb-3">Olimpiadalar ochiq, musobaqalar uchun tashkilot tasdig'i kerak</p>
            <button onClick={() => setPage('centers')} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold">Tashkilot topish</button>
          </div>
        )}
      </div>

      {/* Stats row */}
      {(() => {
        const statsData = isApi ? apiStatsRes.data : null;
        const avg = statsData?.average_score
          ?? (myResults.length ? Math.round(myResults.reduce((s, r) => s + (r.score || 0), 0) / myResults.length * 10) / 10 : 0);
        const bestRank = statsData?.best_rank
          ?? (myResults.length ? Math.min(...myResults.map(r => r.rank || 999).filter(r => r < 999)) : null);
        const total = statsData?.total_attempts ?? myResults.length;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="O'rtacha ball" value={avg || '—'} icon={<Icon name="chart" size={20} />} color="from-indigo-500 to-purple-600" glow="glow-blue" />
            <StatCard label="Reytingdagi o'rn" value={bestRank ? `#${bestRank}` : '—'} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
            <StatCard label="Tadbirlar" value={total} icon={<Icon name="bolt" size={20} />} color="from-cyan-500 to-blue-600" />
            <StatCard label="Sertifikatlar" value={(myResults || []).filter(r => r.rank === 1).length} icon={<Icon name="award" size={20} />} color="from-emerald-500 to-teal-600" />
          </div>
        );
      })()}

      {/* Center status */}
      {studentStatus && studentCenterId && myCenter && (
        <div className={`glass rounded-2xl p-5 border ${studentStatus === 'approved' ? 'border-indigo-500/10' : studentStatus === 'rejected' ? 'border-rose-500/20' : 'border-amber-500/20'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-white">Tashkilot/markaz holati</div>
            <Badge status={statusLabel(studentStatus)} />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold">{myCenter.name[0]}</div>
            <div className="flex-1">
              <div className="font-semibold text-white">{myCenter.name}</div>
              <div className="text-xs text-white/40">{myCenter.organizationType || "O'quv markaz"} · {formatCenterLocation(myCenter)}{user.joined ? ` · A'zo bo'lgan: ${user.joined}` : ''}</div>
            </div>
          </div>
          {studentStatus === 'pending' && (
            <div className="mt-3 text-xs text-amber-300 flex items-center gap-1.5">
              <Icon name="info" size={12} /> Manager tasdig'i kutilmoqda — markaz ichki musobaqalarida qatnasha olmaysiz
            </div>
          )}
          {studentStatus === 'rejected' && (
            <div className="mt-3 text-xs text-rose-300 flex items-center gap-1.5">
              <Icon name="info" size={12} /> Ariza rad etildi. Boshqa tashkilot tanlashingiz mumkin.
            </div>
          )}
        </div>
      )}

      {/* Today's events */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Bugungi tadbirlar</h3>
          <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400 hover:text-indigo-300">Barchasini ko'rish →</button>
        </div>
        {!isCenterApproved && (
          <div className="glass rounded-2xl p-4 border border-amber-500/20 mb-4 text-sm text-amber-300 flex items-center gap-2">
            <Icon name="info" size={14} /> Olimpiadalar ochiq. Musobaqaga qatnashish uchun tashkilot tasdig'i kerak.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleOlympiads.filter(o => o.status === 'active').slice(0, 2).map(o => (
            <OlympiadCard key={o.id} olympiad={o} locked={!canAccessEvent(o)}
              onStart={() => { if (!canEnterEvent(o)) return; setActiveOlympiad(o); onNavigate('test', o); }} />
          ))}
          {visibleOlympiads.filter(o => o.status === 'active').length === 0 && (
            <div className="md:col-span-2 text-center text-white/40 text-sm py-6 glass rounded-2xl">Bugungi faol tadbirlar yo'q</div>
          )}
        </div>
      </div>

      {/* Subject performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Fanlar bo'yicha natijalar</h3>
          <div className="space-y-3">
            {subjectStats.length === 0 && (
              <div className="text-sm text-white/40">Hali fan kesimida natijalar yo'q.</div>
            )}
            {subjectStats.map((s, i) => (
              <div key={`${s.subject}-${i}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white/70">{s.subject}</span>
                  <span className="text-sm font-bold text-white">{s.score}%</span>
                </div>
                <div className="progress-bar h-2">
                  <div className="progress-fill" style={{ width: `${s.score}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">So'nggi natijalar</h3>
          <div className="space-y-3">
            {myResults.length === 0 && <div className="text-sm text-white/40">Hali tadbir topshirmagansiz.</div>}
            {myResults.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => onNavigate('results', { ...r.attempt, olympiad: baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId)) })}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${r.rank === 1 ? 'bg-amber-500/20 text-amber-400' : r.rank <= 3 ? 'bg-indigo-500/20 text-indigo-400' : 'glass text-white/40'}`}>
                  #{r.rank || '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{r.olympiad}</div>
                  <div className="text-xs text-white/40">{r.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{r.score}/100</div>
                  <div className="text-xs text-emerald-400">{r.correct} to'g'ri</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-black text-white">Tadbirlar</h2>
        <div className="flex gap-2">
          {['Barchasi', 'Faol', 'Tugagan'].map(f => (
            <button key={f} onClick={() => setOlympiadFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-xl glass border transition-all ${olympiadFilter === f ? 'border-indigo-500/60 text-white' : 'border-white/10 text-white/60 hover:text-white hover:border-indigo-500/40'}`}>{f}</button>
          ))}
        </div>
      </div>
      {!isCenterApproved && (
        <div className="glass rounded-2xl p-4 border border-amber-500/20 text-sm text-amber-300 flex items-center gap-2">
          <Icon name="info" size={14} /> Olimpiadalar ochiq. Musobaqaga qatnashish uchun tashkilot tasdig'i kerak.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(() => {
          const filteredOlympiads = visibleOlympiads.filter(o => {
            if (olympiadFilter === 'Faol') return o.status === 'active';
            if (olympiadFilter === 'Tugagan') return o.status === 'finished';
            return true;
          });
          if (filteredOlympiads.length === 0) {
            return <div className="md:col-span-2 glass rounded-2xl p-8 text-center text-white/40 text-sm">{olympiadFilter === 'Barchasi' ? "Hozircha tadbirlar mavjud emas" : `${olympiadFilter} tadbirlar topilmadi`}</div>;
          }
          return filteredOlympiads.map(o => (
            <OlympiadCard key={o.id} olympiad={o} locked={!canAccessEvent(o)}
              onStart={() => { if (!canEnterEvent(o)) return; onNavigate('test', o); }} />
          ));
        })()}
      </div>
    </div>
  );

  const renderResults = () => {
    const avg = myResults.length > 0 ? Math.round(myResults.reduce((sum, r) => sum + (r.score || 0), 0) / myResults.length * 10) / 10 : 0;
    const bestRank = myResults.length > 0 ? Math.min(...myResults.map(r => r.rank || 999)) : 0;
    return (
      <div className="p-6 space-y-6 animate-in">
        <h2 className="text-xl font-black text-white">Mening natijalarim</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="O'rtacha ball" value={avg || '—'} icon={<Icon name="chart" size={18} />} color="from-indigo-500 to-purple-600" />
          <StatCard label="Eng yaxshi o'rin" value={bestRank ? `#${bestRank}` : '—'} icon={<Icon name="trophy" size={18} />} color="from-amber-500 to-orange-500" />
          <StatCard label="Jami tadbir" value={myResults.length} icon={<Icon name="bolt" size={18} />} color="from-cyan-500 to-blue-600" />
        </div>
        <div className="glass rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 font-semibold text-white text-sm">Natijalar tarixi</div>
          {myResults.length === 0 && (
            <div className="px-4 py-10 text-center text-white/40 text-sm">Hali topshirmagansiz. Faol tadbirlardan birini tanlab boshlang.</div>
          )}
          {myResults.map(r => (
            <div key={r.id} className="table-row flex items-center gap-4 px-4 py-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${r.rank === 1 ? 'bg-amber-500/20 text-amber-400' : 'glass text-white/40'}`}>#{r.rank || '—'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">{r.olympiad}</div>
                <div className="flex items-center gap-2 mt-0.5"><SubjectBadge subject={r.subject} /><span className="text-xs text-white/30">{r.date}</span></div>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-white">{r.score}<span className="text-white/30 text-sm">/100</span></div>
                <div className="text-xs text-white/40">{r.correct} to'g'ri · {r.wrong} noto'g'ri</div>
              </div>
              <button onClick={() => onNavigate('results', { ...r.attempt, olympiad: baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId)) })} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Ko'rish</button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCenters = () => {
    const liveCenters = (isApi ? (apiCenters || []) : store.centers).filter(c => c.status === 'approved');
    const cities = [...new Set(liveCenters.map(c => c.region || c.city).filter(Boolean))];
    const filtered = liveCenters.filter(c =>
      (
        c.name.toLowerCase().includes(centerSearch.toLowerCase()) ||
        String(c.organizationType || '').toLowerCase().includes(centerSearch.toLowerCase()) ||
        formatCenterLocation(c).toLowerCase().includes(centerSearch.toLowerCase())
      ) &&
      (!cityFilter || c.region === cityFilter || c.city === cityFilter)
    );
    return (
      <div className="p-6 space-y-6 animate-in">
        <h2 className="text-xl font-black text-white">Tashkilotlar va markazlar</h2>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input className="input-field pl-10 py-2.5" placeholder="Nomi, turi, viloyat yoki tuman..." value={centerSearch}
              onChange={e => setCenterSearch(e.target.value)} />
          </div>
          <select className="input-field py-2.5 w-auto" value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
            <option value="">Barcha viloyatlar</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => {
            const st = myRequestByCenter[c.id];
            const isMine = studentCenterId === c.id;
            return (
              <div key={c.id} className="glass rounded-2xl p-5 card-hover">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0">{c.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white">{c.name}</div>
                    <div className="text-xs text-white/40">{c.organizationType || "O'quv markaz"} · {formatCenterLocation(c)}</div>
                    <div className="flex items-center gap-1 mt-1"><span className="text-amber-400 text-xs">★</span><span className="text-xs text-white/60">{c.rating || '—'}</span></div>
                  </div>
                </div>
                <div className="flex gap-4 mb-4 text-center">
                  <div className="flex-1 glass rounded-xl py-2"><div className="text-sm font-bold text-white">{c.students}</div><div className="text-xs text-white/40">O'quvchi</div></div>
                  <div className="flex-1 glass rounded-xl py-2"><div className="text-sm font-bold text-white">{c.olympiads}</div><div className="text-xs text-white/40">Olimpiada</div></div>
                </div>
                <div className="flex flex-wrap gap-1 mb-4">
                  {(c.subjects || []).slice(0, 3).map(s => <SubjectBadge key={s} subject={s} />)}
                </div>
                {st === 'pending' ? (
                  <div className="w-full text-center py-2 rounded-xl badge-pending text-sm font-medium">⏳ Kutilmoqda</div>
                ) : st === 'approved' || isMine ? (
                  <div className="w-full text-center py-2 rounded-xl badge-approved text-sm font-medium">✓ Tasdiqlandi</div>
                ) : st === 'rejected' ? (
                  <div className="w-full text-center py-2 rounded-xl badge-rejected text-sm font-medium">✗ Rad etildi</div>
                ) : (
                  <button onClick={() => setCenterModal(c)} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold">Ariza yuborish</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Center request modal */}
        <Modal open={!!centerModal} onClose={() => setCenterModal(null)} title="Ariza yuborish">
          {centerModal && (
            <div>
              <div className="flex items-center gap-4 glass rounded-xl p-4 mb-6">
                <div className="w-12 h-12 gradient-bg rounded-xl flex items-center justify-center text-white font-black text-lg">{centerModal.name[0]}</div>
                <div>
                  <div className="font-bold text-white">{centerModal.name}</div>
                  <div className="text-sm text-white/40">{centerModal.organizationType || "O'quv markaz"} · {formatCenterLocation(centerModal)} · {centerModal.students} o'quvchi</div>
                </div>
              </div>
              <p className="text-white/60 text-sm mb-6 leading-relaxed">Ariza yuborilgandan so'ng, manager sizning arizangizni Telegram orqali ko'rib chiqadi va tasdiqlaydi.</p>
              <div className="glass rounded-xl p-4 mb-6 border border-indigo-500/20">
                <TelegramMockup studentName={user.name} centerName={centerModal.name} onApprove={() => {}} onReject={() => {}} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCenterModal(null)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
                <button onClick={() => sendRequest(centerModal)} className="btn-primary flex-1 py-3 rounded-xl font-semibold">Ariza yuborish</button>
              </div>
            </div>
          )}
        </Modal>

        {/* Success toast */}
        {joinModal && (
          <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl p-4 border border-emerald-500/30 animate-in max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center"><Icon name="check" size={16} className="text-emerald-400" /></div>
              <div><div className="text-sm font-semibold text-white">Ariza yuborildi!</div><div className="text-xs text-white/40">Manager Telegram orqali xabardor qilindi</div></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pages = { home: renderHome, olympiads: renderOlympiads, results: renderResults, centers: renderCenters };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPage}
        user={{ ...user, role: "O'quvchi" }} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Dashboard'} subtitle={`Salom, ${user.name}!`} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
                </button>
              )}
              <button onClick={() => setPage('olympiads')} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="trophy" size={14} /> Tadbirlar
              </button>
            </div>
          } />
        <main className="flex-1 overflow-y-auto">
          {page === 'leaderboard' ? <LeaderboardPage embedded /> :
           page === 'profile' ? <ProfilePage user={user} embedded /> :
           (pages[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>
      {apiToast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-rose-500/30 animate-in text-sm font-medium text-white">{apiToast}</div>
      )}
    </div>
  );
};

const OlympiadCard = ({ olympiad: o, onStart, locked }) => {
  const isActive = o.status === 'active';
  const disabled = !isActive || locked;
  const typeLabel = eventTypeLabel(o.eventType || 'competition');
  const label = locked ? "🔒 Tashkilot tasdig'i kerak" : (isActive ? '▶ Boshlash' : (o.status === 'inactive' ? 'Nofaol' : (o.status === 'draft' ? 'Hali e\'lon qilinmagan' : 'Tugagan')));
  const time = o.startTime || o.time || '';
  const qCount = (o.questionIds && o.questionIds.length) || o.questions || 0;
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <SubjectBadge subject={o.subject} />
          <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{typeLabel}</span>
        </div>
        <Badge status={statusLabel(o.status)} />
      </div>
      <h3 className="font-bold text-white mb-1">{o.title}</h3>
      <div className="flex flex-wrap gap-3 text-xs text-white/40 mb-4">
        {o.testLevel && <span className="flex items-center gap-1 text-violet-300"><Icon name="star" size={12} /> {o.testLevel}</span>}
        {o.testType && <span className="flex items-center gap-1 text-sky-300"><Icon name="file" size={12} /> {testTypeLabel(o.testType)}</span>}
        <span className="flex items-center gap-1"><Icon name="clock" size={12} /> {time} · {o.duration} daqiqa</span>
        <span className="flex items-center gap-1"><Icon name="file" size={12} /> {qCount} ta savol</span>
        <span className="flex items-center gap-1"><Icon name="users" size={12} /> {o.participants || 0} ishtirokchi</span>
      </div>
      <button onClick={onStart}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${disabled ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
        disabled={disabled}>
        {label}
      </button>
    </div>
  );
};

Object.assign(window, { StudentDashboard, OlympiadCard });
