// pages/StudentDashboard.jsx

const BadgeList = ({ badges }) => {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {badges.map(b => (
        <span
          key={b.id}
          className={`inline-flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-white bg-gradient-to-r ${b.color || 'from-indigo-500 to-purple-500'} px-2.5 py-1.5 rounded-xl shadow-[0_4px_12px_rgba(99,102,241,0.2)]`}
          title={b.description}
        >
          <span>{b.icon}</span>
          <span>{b.title}</span>
        </span>
      ))}
    </div>
  );
};

const StudentDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [centerModal, setCenterModal] = React.useState(null);
  const [centerSearch, setCenterSearch] = React.useState('');
  const [cityFilter, setCityFilter] = React.useState('');
  const [activeOlympiad, setActiveOlympiad] = React.useState(null);
  const [joinModal, setJoinModal] = React.useState(false);
  const [centerConfirmOlympiad, setCenterConfirmOlympiad] = React.useState(null);
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
  const apiActivityLeaderboardRes = useApiData(
    () => isApi ? OlympyApi.getActivityLeaderboard(OlympyApi.getToken()) : Promise.resolve([]),
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
  const activityLeaderboard = apiActivityLeaderboardRes.data || [];

  const allCenters = isApi ? (apiCenters || []) : store.centers;
  const myCenter = studentCenterId ? allCenters.find(c => String(c.id) === String(studentCenterId)) : null;

  // Map of centerId → join-request status for the current user
  // Avval API rejimda faqat birinchi (eng so'nggi) student membership status'i
  // mapping'ga tushardi: bu sababli student bir markazga approved bo'lsa,
  // boshqa markazga rejected/pending statusi ko'rinmasdi va u qayta
  // "Ariza yuborish" tugmasini ko'rib qolardi. Endi backend qaytaradigan
  // roles_detail.student.centers ro'yxatini to'liq aylanib chiqamiz.
  // mapBackendUser bu ro'yxatni roles.student.centers ga yozadi.
  const myRequestByCenter = {};
  if (!isApi) {
    store.requests.filter(r => r.userId === user.id && r.type === 'student').forEach(r => {
      myRequestByCenter[r.centerId] = r.status;
    });
  } else {
    const studentCenters = (studentRole && Array.isArray(studentRole.centers))
      ? studentRole.centers
      : (user?.roles_detail?.student?.centers
          || user?.rolesDetail?.student?.centers
          || []);
    if (Array.isArray(studentCenters) && studentCenters.length) {
      studentCenters.forEach(c => {
        const cid = c?.centerId ?? c?.center_id ?? c?.id;
        if (cid !== undefined && cid !== null) {
          myRequestByCenter[String(cid)] = c.status;
        }
      });
    } else if (studentCenterId && studentStatus) {
      // Eski fallback (agar centers ro'yxati to'liq bo'lmasa)
      myRequestByCenter[String(studentCenterId)] = studentStatus;
    }
  }

  // Public olympiads are visible to everyone; musobaqa is visible only for
  // approved students of the same center.
  const baseOlympiads = isApi ? (apiOlympiads || []) : store.olympiads;
  const isPublicOlympiad = (event) => (event?.eventType || 'competition') === 'olympiad';
  const studentVisibleStatuses = new Set(['active', 'inactive', 'finished']);
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
    { key: 'practice', icon: 'bolt', label: 'Mashq' },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'centers', icon: 'building', label: 'Tashkilotlar' },
    { key: 'leaderboard', icon: 'star', label: 'Reyting' },
    { key: 'analytics', icon: 'chart', label: 'Analitika' },
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
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      {/* Welcome */}
      <div className="flex items-start justify-between flex-wrap gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2 truncate">
            Salom, {user.name.split(' ')[0]}! 👋
            {!!user?.streakCount && (
              <span className="inline-flex items-center gap-1 text-sm font-black text-orange-400 bg-orange-500/10 border border-orange-500/25 px-2 py-0.5 rounded-lg animate-pulse" title="Ketma-ket faol kunlaringiz">
                🔥 {user.streakCount} kun
              </span>
            )}
          </h2>
          <p className="text-white/40 text-xs md:text-sm mt-1">{new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <BadgeList badges={user.badges} />
        </div>
        {!hasCenter && (
          <div className="glass rounded-2xl p-4 border border-indigo-500/20 w-full sm:max-w-xs">
            <div className="text-xs text-indigo-300 font-medium mb-1">💡 Maslahat</div>
            <p className="text-xs text-white/50 mb-3">Olimpiadalar ochiq, musobaqalar uchun tashkilot tasdig'i kerak</p>
            <button onClick={() => setPage('centers')} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold min-h-[40px]">Tashkilot topish</button>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="O'rtacha ball" value={avg || '—'} icon={<Icon name="chart" size={20} />} color="from-indigo-500 to-purple-600" glow="glow-blue" />
            <StatCard label="Reytingdagi o'rn" value={bestRank ? `#${bestRank}` : '—'} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
            <StatCard label="Tadbirlar" value={total} icon={<Icon name="bolt" size={20} />} color="from-cyan-500 to-blue-600" />
            <StatCard label="Sertifikatlar" value={(myResults || []).filter(r => r.rank === 1).length} icon={<Icon name="award" size={20} />} color="from-emerald-500 to-teal-600" />
          </div>
        );
      })()}

      {/* Center status */}
      {studentStatus && studentCenterId && myCenter && (
        <div className={`glass rounded-2xl p-4 md:p-5 border ${studentStatus === 'approved' ? 'border-indigo-500/10' : studentStatus === 'rejected' ? 'border-rose-500/20' : 'border-amber-500/20'}`}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="text-sm font-semibold text-white truncate">Tashkilot/markaz holati</div>
            <Badge status={statusLabel(studentStatus)} />
          </div>
          <div className="flex items-center gap-3">
            {myCenter.imageUrl ? (
              <img src={myCenter.imageUrl} alt={myCenter.name} className="h-10 w-10 rounded-xl object-cover flex-shrink-0"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }} />
            ) : null}
            <div className={`w-10 h-10 gradient-bg rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 ${myCenter.imageUrl ? 'hidden' : ''}`}>{myCenter.name[0]}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{myCenter.name}</div>
              <div className="text-xs text-white/40 truncate">{myCenter.organizationType || "O'quv markaz"} · {formatCenterLocation(myCenter)}</div>
              <div className="text-xs text-white/30 truncate">{user.joined ? `A'zo bo'lgan: ${user.joined}` : ''}</div>
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
        <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
          <h3 className="font-bold text-white text-sm md:text-base">Bugungi tadbirlar</h3>
          <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0 py-1">Barchasini ko'rish →</button>
        </div>
        {!isCenterApproved && (
          <div className="glass rounded-2xl p-4 border border-amber-500/20 mb-4 text-sm text-amber-300 flex items-center gap-2">
            <Icon name="info" size={14} /> Olimpiadalar ochiq. Musobaqaga qatnashish uchun tashkilot tasdig'i kerak.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleOlympiads.filter(o => o.status === 'active').slice(0, 2).map(o => (
            <OlympiadCard key={o.id} olympiad={o} locked={!canAccessEvent(o)}
              onStart={() => {
                if (!canEnterEvent(o)) return;
                const alreadyMember = String(o.centerId) === String(studentCenterId);
                if (o.eventType === 'competition' && o.centerId && !alreadyMember) {
                  const center = allCenters.find(c => String(c.id || c.backendId) === String(o.centerId));
                  setCenterConfirmOlympiad({ olympiad: o, centerName: center?.name || "O'quv markaz", centerId: o.centerId });
                } else {
                  setActiveOlympiad(o);
                  onNavigate('test', o);
                }
              }} />
          ))}
          {visibleOlympiads.filter(o => o.status === 'active').length === 0 && (
            <div className="md:col-span-2 text-center text-white/40 text-sm py-6 glass rounded-2xl">Bugungi faol tadbirlar yo'q</div>
          )}
        </div>
      </div>

      {/* Upcoming events */}
      {visibleOlympiads.filter(o => o.status === 'inactive').length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
            <h3 className="font-bold text-white text-sm md:text-base">Yaqinda boshlanadi</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0 py-1">Barchasini ko'rish →</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleOlympiads.filter(o => o.status === 'inactive').slice(0, 2).map(o => (
              <OlympiadCard key={o.id} olympiad={o} locked={!canAccessEvent(o)}
                onStart={() => {
                  if (!canEnterEvent(o)) return;
                  const alreadyMember = String(o.centerId) === String(studentCenterId);
                  if (o.centerId && !alreadyMember) {
                    const center = allCenters.find(c => String(c.id || c.backendId) === String(o.centerId));
                    setCenterConfirmOlympiad({ olympiad: o, centerName: center?.name || "O'quv markaz", centerId: o.centerId });
                  } else {
                    setActiveOlympiad(o);
                    onNavigate('test', o);
                  }
                }} />
            ))}
          </div>
        </div>
      )}

      {/* Subject performance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="glass rounded-2xl p-4 md:p-5">
          <h3 className="font-bold text-white mb-3 md:mb-4 text-sm md:text-base">Fanlar bo'yicha natijalar</h3>
          <div className="space-y-3">
            {subjectStats.length === 0 && (
              <div className="text-sm text-white/40">Hali fan kesimida natijalar yo'q.</div>
            )}
            {subjectStats.map((s, i) => (
              <div key={`${s.subject}-${i}`}>
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="text-xs md:text-sm text-white/70 truncate">{s.subject}</span>
                  <span className="text-xs md:text-sm font-bold text-white flex-shrink-0">{s.score}%</span>
                </div>
                <div className="progress-bar h-2">
                  <div className="progress-fill" style={{ width: `${s.score}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-5">
          <h3 className="font-bold text-white mb-3 md:mb-4 text-sm md:text-base">So'nggi natijalar</h3>
          <div className="space-y-3">
            {myResults.length === 0 && <div className="text-sm text-white/40">Hali tadbir topshirmagansiz.</div>}
            {myResults.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => onNavigate('results', { ...r.attempt, olympiad: baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId)) })}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${r.rank === 1 ? 'bg-amber-500/20 text-amber-400' : r.rank <= 3 ? 'bg-indigo-500/20 text-indigo-400' : 'glass text-white/40'}`}>
                  #{r.rank || '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs md:text-sm font-medium text-white truncate">{r.olympiad}</div>
                  <div className="text-xs text-white/40">{r.date}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs md:text-sm font-bold text-white">{r.score}/100</div>
                  <div className="text-xs text-emerald-400">{r.correct} to'g'ri</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Leaderboard */}
      {isApi && activityLeaderboard.length > 0 && (
        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
            <h3 className="font-bold text-white text-sm md:text-base flex items-center gap-1.5">
              <span>🔥</span> Haftalik eng faol o'quvchilar
            </h3>
            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded-lg animate-pulse">Streak bo'yicha</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activityLeaderboard.slice(0, 9).map((entry, idx) => {
              const colors = ['bg-amber-500/20 text-amber-400 border border-amber-500/30', 'bg-slate-300/20 text-slate-300 border border-slate-300/30', 'bg-amber-700/20 text-amber-600 border border-amber-700/30'];
              const badgeClass = idx < 3 ? colors[idx] : 'glass text-white/40 border border-white/5';
              return (
                <div key={entry.user_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0 ${badgeClass}`}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${entry.rank}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs md:text-sm font-medium text-white truncate">{entry.name}</div>
                    {/* Render badge indicator */}
                    {entry.badges && entry.badges.length > 0 && (
                      <div className="flex gap-1 mt-0.5">
                        {entry.badges.map(b => (
                          <span key={b.id} className="text-[9px]" title={b.title}>{b.icon}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-bold text-orange-400">🔥 {entry.streak_count} kun</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg md:text-xl font-black text-white">Tadbirlar</h2>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {['Barchasi', 'Faol', 'Kelayotgan', 'Tugagan'].map(f => (
            <button key={f} onClick={() => setOlympiadFilter(f)}
              className={`text-xs px-3 py-2 rounded-xl glass border transition-all min-h-[36px] ${olympiadFilter === f ? 'border-indigo-500/60 text-white' : 'border-white/10 text-white/60 hover:text-white hover:border-indigo-500/40'}`}>{f}</button>
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
            if (olympiadFilter === 'Kelayotgan') return o.status === 'inactive';
            if (olympiadFilter === 'Tugagan') return o.status === 'finished';
            return true;
          });
          if (filteredOlympiads.length === 0) {
            return <div className="md:col-span-2 glass rounded-2xl p-8 text-center text-white/40 text-sm">{olympiadFilter === 'Barchasi' ? "Hozircha tadbirlar mavjud emas" : `${olympiadFilter} tadbirlar topilmadi`}</div>;
          }
          return filteredOlympiads.map(o => (
            <OlympiadCard key={o.id} olympiad={o} locked={!canAccessEvent(o)}
              onStart={() => {
                if (!canEnterEvent(o)) return;
                const alreadyMember = String(o.centerId) === String(studentCenterId);
                if (o.eventType === 'competition' && o.centerId && !alreadyMember) {
                  const center = allCenters.find(c => String(c.id || c.backendId) === String(o.centerId));
                  setCenterConfirmOlympiad({ olympiad: o, centerName: center?.name || "O'quv markaz", centerId: o.centerId });
                } else {
                  setActiveOlympiad(o);
                  onNavigate('test', o);
                }
              }} />
          ));
        })()}
      </div>
    </div>
  );

  const renderResults = () => {
    const avg = myResults.length > 0 ? Math.round(myResults.reduce((sum, r) => sum + (r.score || 0), 0) / myResults.length * 10) / 10 : 0;
    const bestRank = myResults.length > 0 ? Math.min(...myResults.map(r => r.rank || 999)) : 0;
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
        <h2 className="text-lg md:text-xl font-black text-white">Mening natijalarim</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <StatCard label="O'rtacha ball" value={avg || '—'} icon={<Icon name="chart" size={18} />} color="from-indigo-500 to-purple-600" />
          <StatCard label="Eng yaxshi o'rin" value={bestRank ? `#${bestRank}` : '—'} icon={<Icon name="trophy" size={18} />} color="from-amber-500 to-orange-500" />
          <StatCard label="Jami tadbir" value={myResults.length} icon={<Icon name="bolt" size={18} />} color="from-cyan-500 to-blue-600" />
        </div>
        <div className="glass rounded-2xl overflow-hidden">
          <div className="p-3 md:p-4 border-b border-white/5 font-semibold text-white text-sm">Natijalar tarixi</div>
          {myResults.length === 0 && (
            <div className="px-4 py-10 text-center text-white/40 text-sm">Hali topshirmagansiz. Faol tadbirlardan birini tanlab boshlang.</div>
          )}
          {myResults.map(r => {
            const linkedOlympiad = baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId));
            const score = Math.max(0, Math.min(100, Math.round(r.score || 0)));
            return (
              <div key={r.id} className="olympy-row px-3 md:px-4 py-3 md:py-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${r.rank === 1 ? 'bg-amber-500/20 text-amber-400' : 'glass text-white/40'}`}>#{r.rank || '—'}</div>
                    <div className="min-w-0 pt-0.5">
                      <div className="text-sm md:text-base font-semibold text-white truncate">{r.olympiad}</div>
                      <div className="flex items-center flex-wrap gap-2 mt-1">
                        <SubjectBadge subject={r.subject} />
                        <span className="text-xs text-white/35 whitespace-nowrap">{r.date || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2 md:bg-transparent md:border-transparent md:px-0 md:py-0 md:w-44 md:flex-shrink-0">
                    <div className="flex items-baseline justify-between md:justify-end gap-2">
                      <span className="text-xs text-white/40 md:hidden">Ball</span>
                      <div className="text-lg font-black text-white">{score}<span className="text-white/30 text-sm">/100</span></div>
                    </div>
                    <div className="progress-bar h-1.5 mt-1.5">
                      <div className="progress-fill" style={{ width: `${score}%` }} />
                    </div>
                    <div className="text-xs text-white/40 mt-1.5 md:text-right">{r.correct} to'g'ri · {r.wrong} noto'g'ri</div>
                  </div>

                  <button
                    onClick={() => onNavigate('results', { ...r.attempt, olympiad: linkedOlympiad })}
                    className="btn-ghost text-xs px-3 py-2 rounded-xl min-h-[38px] w-full md:w-24 md:flex-shrink-0"
                  >
                    Ko'rish
                  </button>
                </div>
              </div>
            );
          })}
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
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
        <h2 className="text-lg md:text-xl font-black text-white">Tashkilotlar va markazlar</h2>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-full sm:min-w-48">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input className="input-field pl-10 py-2.5 w-full" placeholder="Nomi, turi, viloyat yoki tuman..." value={centerSearch}
              onChange={e => setCenterSearch(e.target.value)} />
          </div>
          <select className="input-field py-2.5 w-full sm:w-auto" value={cityFilter} onChange={e => setCityFilter(e.target.value)}>
            <option value="">Barcha viloyatlar</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => {
            const st = myRequestByCenter[c.id];
            const isMine = studentCenterId === c.id;
            return (
              <div key={c.id} className="glass rounded-2xl p-4 md:p-5 card-hover">
                <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="h-12 w-12 rounded-2xl object-cover flex-shrink-0"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }} />
                  ) : null}
                  <div className={`w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 ${c.imageUrl ? 'hidden' : ''}`}>{c.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate">{c.name}</div>
                    <div className="text-xs text-white/40 truncate">{c.organizationType || "O'quv markaz"} · {formatCenterLocation(c)}</div>
                    <div className="flex items-center gap-1 mt-1"><span className="text-amber-400 text-xs">★</span><span className="text-xs text-white/60">{c.rating || '—'}</span></div>
                  </div>
                </div>
                <div className="flex gap-3 md:gap-4 mb-3 md:mb-4 text-center">
                  <div className="flex-1 glass rounded-xl py-2"><div className="text-sm font-bold text-white">{c.students}</div><div className="text-xs text-white/40">O'quvchi</div></div>
                  <div className="flex-1 glass rounded-xl py-2"><div className="text-sm font-bold text-white">{c.olympiads}</div><div className="text-xs text-white/40">Olimpiada</div></div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3 md:mb-4">
                  {(c.subjects || []).slice(0, 3).map(s => <SubjectBadge key={s} subject={s} />)}
                </div>
                {st === 'pending' ? (
                  <div className="w-full text-center py-2.5 rounded-xl badge-pending text-sm font-medium">⏳ Kutilmoqda</div>
                ) : st === 'approved' || isMine ? (
                  <div className="w-full text-center py-2.5 rounded-xl badge-approved text-sm font-medium">✓ Tasdiqlandi</div>
                ) : st === 'rejected' ? (
                  <div className="w-full text-center py-2.5 rounded-xl badge-rejected text-sm font-medium">✗ Rad etildi</div>
                ) : (
                  <button onClick={() => setCenterModal(c)} className="btn-primary w-full py-2.5 rounded-xl text-sm font-semibold min-h-[44px]">Ariza yuborish</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Center request modal */}
        <Modal open={!!centerModal} onClose={() => setCenterModal(null)} title="Ariza yuborish">
          {centerModal && (
            <div>
              <div className="flex items-center gap-3 md:gap-4 glass rounded-xl p-3 md:p-4 mb-4 md:mb-6">
                {centerModal.imageUrl ? (
                  <img src={centerModal.imageUrl} alt={centerModal.name} className="h-12 w-12 rounded-xl object-cover flex-shrink-0"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }} />
                ) : null}
                <div className={`w-12 h-12 gradient-bg rounded-xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 ${centerModal.imageUrl ? 'hidden' : ''}`}>{centerModal.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white truncate">{centerModal.name}</div>
                  <div className="text-xs md:text-sm text-white/40 truncate">{centerModal.organizationType || "O'quv markaz"} · {formatCenterLocation(centerModal)} · {centerModal.students} o'quvchi</div>
                </div>
              </div>
              <p className="text-white/60 text-sm mb-4 md:mb-6 leading-relaxed">Ariza yuborilgandan so'ng, manager sizning arizangizni Telegram orqali ko'rib chiqadi va tasdiqlaydi.</p>
              <div className="glass rounded-xl p-3 md:p-4 mb-4 md:mb-6 border border-indigo-500/20 overflow-x-auto">
                <TelegramMockup studentName={user.name} centerName={centerModal.name} onApprove={() => {}} onReject={() => {}} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCenterModal(null)} className="btn-ghost flex-1 py-3 rounded-xl min-h-[44px]">Bekor qilish</button>
                <button onClick={() => sendRequest(centerModal)} className="btn-primary flex-1 py-3 rounded-xl font-semibold min-h-[44px]">Ariza yuborish</button>
              </div>
            </div>
          )}
        </Modal>

        {/* Success toast */}
        {joinModal && (
          <div className="fixed bottom-20 md:bottom-6 right-3 md:right-6 left-3 md:left-auto z-50 glass-strong rounded-2xl p-4 border border-emerald-500/30 animate-in md:max-w-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0"><Icon name="check" size={16} className="text-emerald-400" /></div>
              <div className="min-w-0"><div className="text-sm font-semibold text-white">Ariza yuborildi!</div><div className="text-xs text-white/40">Manager Telegram orqali xabardor qilindi</div></div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pages = { home: renderHome, olympiads: renderOlympiads, results: renderResults, centers: renderCenters };

  // Sahifa tugmasi `practice` yoki `analytics` bosilsa, ularni alohida
  // handle qilamiz — `setPage` o'rniga modal yoki app-level navigatsiya.
  const setPageOrSpecial = (key) => {
    if (key === 'analytics') { onNavigate('analytics'); return; }
    setPage(key);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPageOrSpecial}
        user={{ ...user, role: "O'quvchi" }} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Dashboard'} subtitle={`Salom, ${user.name}!`} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-2 md:px-3 py-2 rounded-xl flex items-center gap-1.5">
                  <Icon name="users" size={13} /><span className="hidden md:inline">Rolni almashtirish</span>
                </button>
              )}
              <button onClick={() => setPage('olympiads')} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="trophy" size={14} /> Tadbirlar
              </button>
            </div>
          } />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {page === 'leaderboard' ? <LeaderboardPage embedded user={user} /> :
           page === 'profile' ? <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} /> :
           page === 'practice' ? (
             <PracticeFlow
               user={user}
               centerId={studentCenterId}
               isApproved={isCenterApproved}
               onClose={() => setPage('home')}
               onNavigateToCenters={() => setPage('centers')}
               pageMode
               onUserUpdate={onUserUpdate}
             />
           ) :
           (pages[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPageOrSpecial} />
      </div>
      {apiToast && (
        <div className="fixed bottom-20 md:bottom-6 right-3 md:right-6 left-3 md:left-auto z-50 glass-strong rounded-2xl px-5 py-3.5 border border-rose-500/30 animate-in text-sm font-medium text-white md:max-w-sm">{apiToast}</div>
      )}

      {centerConfirmOlympiad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 md:p-4">
          <div className="glass rounded-2xl p-5 md:p-6 max-w-sm w-full border border-white/10">
            <h3 className="text-white font-semibold text-base mb-2">Markaz tasdiqlash</h3>
            <p className="text-white/70 text-sm mb-5 md:mb-6 break-words">
              Siz <span className="text-white font-medium">{centerConfirmOlympiad.centerName}</span> o'quv markazining o'quvchisimisiz?
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 btn-primary py-2.5 rounded-xl text-sm font-semibold min-h-[44px]"
                onClick={async () => {
                  const token = OlympyApi.getToken?.();
                  try {
                    await OlympyApi.joinCenter(centerConfirmOlympiad.centerId, { role: 'student' }, token);
                  } catch (e) { /* allaqachon a'zo bo'lsa ham davom etsin */ }
                  const o = centerConfirmOlympiad.olympiad;
                  setCenterConfirmOlympiad(null);
                  setActiveOlympiad(o);
                  onNavigate('test', o);
                }}
              >Ha</button>
              <button
                className="flex-1 glass border border-white/10 py-2.5 rounded-xl text-sm text-white/70 hover:text-white transition-colors min-h-[44px]"
                onClick={() => setCenterConfirmOlympiad(null)}
              >Yo'q</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Practice / Mashq oqimi — fan tanlash → savol tanlash → savollar → natija
const PracticeFlow = ({ user, centerId, isApproved, onClose, onNavigateToCenters, pageMode = false, onUserUpdate }) => {
  const isApi = !!user?._api;
  const token = isApi ? OlympyApi.getToken() : null;
  const [step, setStep] = React.useState('setup'); // setup | quiz | result
  const [practiceMode, setPracticeMode] = React.useState('bank'); // bank | wrong
  const [subjects, setSubjects] = React.useState([]);
  const [subjectsLoading, setSubjectsLoading] = React.useState(false);
  const [wrongSubjects, setWrongSubjects] = React.useState([]);
  const [wrongSubjectsLoading, setWrongSubjectsLoading] = React.useState(false);
  const [selectedSubject, setSelectedSubject] = React.useState('');
  const [questionCount, setQuestionCount] = React.useState(10);
  const [questions, setQuestions] = React.useState([]);
  const [practiceId, setPracticeId] = React.useState('');
  const [answers, setAnswers] = React.useState({});
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [errorMsg, setErrorMsg] = React.useState('');

  const allowed = practiceMode === 'wrong' ? true : (isApi ? isApproved : !!centerId);
  const activeSubjects = practiceMode === 'wrong' ? wrongSubjects : subjects;
  const activeSubjectsLoading = practiceMode === 'wrong' ? wrongSubjectsLoading : subjectsLoading;

  React.useEffect(() => {
    if (practiceMode !== 'bank') return;
    if (!centerId) return;
    if (isApi && !isApproved) return;
    setSubjectsLoading(true);
    OlympyApi.getPracticeSubjects(centerId, token)
      .then(rows => { setSubjects(Array.isArray(rows) ? rows : []); })
      .catch(err => setErrorMsg(OlympyApi.toUserMessage?.(err) || "Fanlarni yuklab bo'lmadi"))
      .finally(() => setSubjectsLoading(false));
  }, [practiceMode, centerId, isApi, isApproved]);

  React.useEffect(() => {
    if (practiceMode !== 'wrong') return;
    if (!isApi) { setWrongSubjects([]); return; }
    setWrongSubjectsLoading(true);
    OlympyApi.getWrongAnswerSubjects(token)
      .then(rows => { setWrongSubjects(Array.isArray(rows) ? rows : []); })
      .catch(err => setErrorMsg(OlympyApi.toUserMessage?.(err) || "Xato savollarni yuklab bo'lmadi"))
      .finally(() => setWrongSubjectsLoading(false));
  }, [practiceMode, isApi]);

  React.useEffect(() => {
    // Tab almashganda tanlangan fanni tozalaymiz va xato xabarini olib tashlaymiz.
    setSelectedSubject('');
    setErrorMsg('');
  }, [practiceMode]);

  const startPractice = async () => {
    if (!selectedSubject) { setErrorMsg("Fan tanlang"); return; }
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = practiceMode === 'wrong'
        ? await OlympyApi.startWrongAnswerPractice({
            subject: selectedSubject,
            question_count: questionCount,
          }, token)
        : await OlympyApi.startPractice({
            center_id: centerId,
            subject: selectedSubject,
            question_count: questionCount,
          }, token);
      setPracticeId(res?.practice_id || '');
      setQuestions(res?.questions || []);
      setAnswers({});
      setCurrentIdx(0);
      setStep('quiz');
    } catch (err) {
      setErrorMsg(OlympyApi.toUserMessage?.(err) || "Mashqni boshlab bo'lmadi");
    } finally {
      setSubmitting(false);
    }
  };

  const chooseAnswer = (qid, idx) => {
    setAnswers(prev => ({ ...prev, [qid]: idx }));
  };

  const finishPractice = async () => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await OlympyApi.submitPractice({
        practice_id: practiceId,
        answers,
      }, token);
      setResult(res);
      setStep('result');
      if (res && res.streak_count !== undefined && onUserUpdate) {
        onUserUpdate({ ...user, streakCount: res.streak_count });
      }
    } catch (err) {
      setErrorMsg(OlympyApi.toUserMessage?.(err) || "Natijani yuborib bo'lmadi");
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setStep('setup');
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setPracticeId('');
    setCurrentIdx(0);
  };

  const q = questions[currentIdx];
  const total = questions.length;
  const answered = Object.keys(answers).length;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      <div className="glass rounded-2xl w-full max-w-3xl mx-auto overflow-hidden flex flex-col border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.25)]">
              <Icon name="bolt" size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold text-sm md:text-base truncate">
                {step === 'setup' && 'Mashq rejimi'}
                {step === 'quiz' && `Savol ${currentIdx + 1}/${total}`}
                {step === 'result' && 'Mashq natijasi'}
              </div>
              <div className="text-[10px] text-white/40 truncate">
                {step === 'setup' && 'Bilimingizni mashq qiling'}
                {step === 'quiz' && (selectedSubject || '')}
                {step === 'result' && (selectedSubject || '')}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 flex-shrink-0 transition-colors">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs px-3 py-2.5">
              {errorMsg}
            </div>
          )}

          {/* Setup step */}
          {step === 'setup' && (
            <div className="space-y-4">
              {/* Tab tanlash: Savol banki / Xatolarim */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPracticeMode('bank')}
                  className={`rounded-xl py-2.5 text-xs md:text-sm font-bold border transition-all duration-200 flex items-center justify-center gap-2 ${practiceMode === 'bank' ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-[0_0_12px_rgba(99,102,241,0.12)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10'}`}
                >
                  <Icon name="book" size={14} /> Savol banki
                </button>
                <button
                  onClick={() => setPracticeMode('wrong')}
                  className={`rounded-xl py-2.5 text-xs md:text-sm font-bold border transition-all duration-200 flex items-center justify-center gap-2 ${practiceMode === 'wrong' ? 'bg-rose-500/15 border-rose-500/50 text-white shadow-[0_0_12px_rgba(244,63,94,0.12)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10'}`}
                >
                  <Icon name="x" size={14} /> Xatolarim
                </button>
              </div>

              {practiceMode === 'bank' && !allowed ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 animate-pulse">
                    <Icon name="info" size={32} />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">Tashkilot tasdig'i kutilmoqda</h3>
                  <p className="text-white/50 text-sm max-w-sm mb-6 leading-relaxed">
                    Mashq rejimidan foydalanish uchun o'quv markazingiz tomonidan arizangiz tasdiqlangan bo'lishi lozim.
                  </p>
                  <button
                    onClick={onNavigateToCenters}
                    className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                  >
                    <Icon name="search" size={16} /> Tashkilotlar bo'limiga o'tish
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-xs text-white/60 font-semibold mb-2">Fan tanlang</div>
                    {activeSubjectsLoading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
                    {!activeSubjectsLoading && activeSubjects.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/20 mb-3">
                          <Icon name={practiceMode === 'wrong' ? 'check' : 'book'} size={24} />
                        </div>
                        <div className="text-white/60 text-sm font-semibold mb-1">
                          {practiceMode === 'wrong' ? "Xato savollar yo'q" : 'Savollar mavjud emas'}
                        </div>
                        <p className="text-white/30 text-xs max-w-xs leading-relaxed">
                          {practiceMode === 'wrong'
                            ? "Siz hali biror olimpiadada noto'g'ri javob bermagansiz. Olimpiadalarda qatnashib boring."
                            : "Siz a'zo bo'lgan o'quv markazida hali mashq qilish uchun savollar yuklanmagan."}
                        </p>
                      </div>
                    )}
                    {activeSubjects.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                        {activeSubjects.map(s => {
                          const isSelected = selectedSubject === s.subject;
                          const accent = practiceMode === 'wrong'
                            ? (isSelected ? 'bg-rose-500/15 border-rose-500/50 text-white shadow-[0_0_15px_rgba(244,63,94,0.15)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10')
                            : (isSelected ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10');
                          const countAccent = practiceMode === 'wrong'
                            ? (isSelected ? 'text-rose-300' : 'text-white/30')
                            : (isSelected ? 'text-indigo-300' : 'text-white/30');
                          return (
                            <button
                              key={s.subject}
                              onClick={() => setSelectedSubject(s.subject)}
                              className={`rounded-xl p-3 text-left border transition-all duration-200 flex flex-col justify-between min-h-[76px] ${accent}`}
                            >
                              <div className="font-semibold text-xs md:text-sm truncate w-full">{s.subject}</div>
                              <div className={`text-[10px] mt-1.5 font-medium ${countAccent}`}>
                                {practiceMode === 'wrong' ? `${s.question_count} ta xato savol` : `${s.question_count} ta savol`}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {activeSubjects.length > 0 && (
                    <div>
                      <div className="text-xs text-white/60 font-semibold mb-2">Savol soni</div>
                      <div className="flex gap-2">
                        {[10, 20, 30].map(n => {
                          const isSelected = questionCount === n;
                          const cls = practiceMode === 'wrong'
                            ? (isSelected ? 'bg-rose-500/15 border-rose-500/50 text-white shadow-[0_0_12px_rgba(244,63,94,0.12)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10')
                            : (isSelected ? 'bg-indigo-500/15 border-indigo-500/50 text-white shadow-[0_0_12px_rgba(99,102,241,0.12)]' : 'glass border-white/5 text-white/60 hover:text-white hover:border-white/10');
                          return (
                            <button
                              key={n}
                              onClick={() => setQuestionCount(n)}
                              className={`flex-1 rounded-xl py-2.5 text-xs md:text-sm font-bold border transition-all duration-200 ${cls}`}
                            >{n} ta</button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Quiz step */}
          {step === 'quiz' && q && (
            <div className="space-y-4">
              {/* Question Navigation Strip */}
              <div className="flex gap-1.5 overflow-x-auto py-1 px-0.5 justify-start scrollbar-none">
                {questions.map((_, idx) => {
                  const isCurrent = idx === currentIdx;
                  const isAns = answers[questions[idx].id] !== undefined;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentIdx(idx)}
                      className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all border ${isCurrent ? 'bg-indigo-500 border-indigo-400 text-white' : (isAns ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300' : 'glass border-white/5 text-white/40 hover:text-white hover:border-white/10')}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="glass border-white/5 rounded-2xl p-4 md:p-5">
                <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider mb-1.5">Savol {currentIdx + 1} / {total}</div>
                <div className="text-white text-base font-semibold leading-relaxed break-words">{q.text}</div>
              </div>

              <div className="space-y-2">
                {(q.options || []).map((opt, oi) => {
                  const isChosen = answers[q.id] === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => chooseAnswer(q.id, oi)}
                      className={`w-full text-left rounded-2xl px-4 py-3 border flex items-center gap-4 text-sm transition-all duration-200 ${isChosen ? 'bg-indigo-500/10 border-indigo-500/50 text-white shadow-[0_4px_20px_rgba(99,102,241,0.1)]' : 'glass border-white/5 text-white/80 hover:text-white hover:border-white/10 hover:translate-x-1'}`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors duration-200 ${isChosen ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-white/5 text-white/40'}`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className="flex-1 break-words">{String(opt)}</span>
                      {isChosen && <Icon name="check" size={14} className="text-indigo-300 flex-shrink-0 animate-pulse" />}
                    </button>
                  );
                })}
              </div>
              
              <div className="space-y-1.5 mt-4">
                <div className="progress-bar h-2">
                  <div className="progress-fill" style={{ width: `${(answered / total) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
                </div>
                <div className="text-[10px] text-white/40 text-center font-medium">Javob berildi: {answered}/{total} ({Math.round((answered/total)*100)}%)</div>
              </div>
            </div>
          )}

          {/* Result step */}
          {step === 'result' && result && (
            <div className="space-y-5">
              {/* Streak Celebration Banner */}
              {!!user?.streakCount && (
                <div className="glass-strong rounded-2xl p-4 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-orange-500/10 border border-orange-500/30 flex items-center justify-between gap-3 shadow-[0_8px_32px_rgba(249,115,22,0.08)] animate-in">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-bounce">🔥</span>
                    <div className="text-left">
                      <div className="text-sm font-black text-white">Ketma-ket {user.streakCount} kun faollik!</div>
                      <div className="text-[10px] text-white/50">Kundalik marrani bajardingiz, davom eting!</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="glass border-white/5 rounded-2xl p-4 text-center relative overflow-hidden flex flex-col justify-center min-h-[110px]">
                  <div className="text-white/40 text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-1">To'g'ri</div>
                  <div className="text-emerald-400 text-2xl md:text-3xl font-black">{result.correct_count}</div>
                  <div className="text-[10px] text-white/30 mt-1">savol</div>
                  <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/5 rounded-bl-full flex items-center justify-center"><Icon name="check" size={10} className="text-emerald-400/40" /></div>
                </div>
                <div className="glass border-white/5 rounded-2xl p-4 text-center relative overflow-hidden flex flex-col justify-center min-h-[110px]">
                  <div className="text-white/40 text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-1">Noto'g'ri</div>
                  <div className="text-rose-400 text-2xl md:text-3xl font-black">{result.wrong_count}</div>
                  <div className="text-[10px] text-white/30 mt-1">savol</div>
                  <div className="absolute top-0 right-0 w-8 h-8 bg-rose-500/5 rounded-bl-full flex items-center justify-center"><Icon name="x" size={10} className="text-rose-400/40" /></div>
                </div>
                <div className="glass border-white/5 rounded-2xl p-4 text-center relative overflow-hidden flex flex-col justify-center min-h-[110px]">
                  <div className="text-white/40 text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-1">Natija</div>
                  <div className="text-indigo-400 text-2xl md:text-3xl font-black">{result.score}%</div>
                  <div className="text-[10px] text-white/30 mt-1">{result.correct_count}/{result.total} ball</div>
                  <div className="absolute top-0 right-0 w-8 h-8 bg-indigo-500/5 rounded-bl-full flex items-center justify-center"><Icon name="bolt" size={10} className="text-indigo-400/40" /></div>
                </div>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1 admin-scroll">
                {(result.review || []).map((r, idx) => {
                  const statusClass = r.is_correct 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : (r.chosen_answer == null 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20');
                  const statusText = r.is_correct 
                    ? "To'g'ri" 
                    : (r.chosen_answer == null ? "Yechilmagan" : "Noto'g'ri");
                  
                  return (
                    <div key={r.id} className="glass border-white/5 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/40 font-bold">#{idx + 1}-savol</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${statusClass}`}>
                          {statusText}
                        </span>
                      </div>
                      <div className="text-white text-sm font-medium leading-relaxed break-words">{r.text}</div>
                      <div className="space-y-1.5">
                        {(r.options || []).map((opt, oi) => {
                          const isCorrect = oi === r.correct_answer;
                          const isChosen = oi === r.chosen_answer;
                          
                          let optionClass = 'glass border-white/5 text-white/50';
                          let iconEl = null;

                          if (isCorrect) {
                            optionClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200 font-medium';
                            iconEl = <Icon name="check" size={14} className="text-emerald-400 flex-shrink-0" />;
                          } else if (isChosen) {
                            optionClass = 'bg-rose-500/10 border-rose-500/30 text-rose-200 font-medium';
                            iconEl = <Icon name="x" size={14} className="text-rose-400 flex-shrink-0" />;
                          }

                          return (
                            <div key={oi} className={`rounded-xl px-3 py-2 text-xs border flex items-center gap-3 transition-colors ${optionClass}`}>
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${isCorrect ? 'bg-emerald-500/20 text-emerald-300' : (isChosen ? 'bg-rose-500/20 text-rose-300' : 'bg-white/5 text-white/30')}`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              <span className="flex-1 break-words">{String(opt)}</span>
                              {iconEl}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-4 md:px-6 py-3.5 border-t border-white/10 flex gap-3">
          {step === 'setup' && (
            <>
              {!allowed || activeSubjects.length === 0 ? (
                <button onClick={onClose} className="btn-ghost px-4 py-2.5 rounded-xl text-sm flex-1">Yopish</button>
              ) : (
                <>
                  <button onClick={onClose} className="btn-ghost px-4 py-2.5 rounded-xl text-sm flex-1">Bekor qilish</button>
                  <button
                    onClick={startPractice}
                    disabled={submitting || !selectedSubject}
                    className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex-1"
                  >{submitting ? 'Boshlanmoqda...' : 'Boshlash'}</button>
                </>
              )}
            </>
          )}
          {step === 'quiz' && (
            <>
              <button
                onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
                className="btn-ghost px-4 py-2.5 rounded-xl text-sm disabled:opacity-30"
              >Oldingi</button>
              {currentIdx < total - 1 ? (
                <button
                  onClick={() => setCurrentIdx(i => Math.min(total - 1, i + 1))}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex-1"
                >Keyingi</button>
              ) : (
                <button
                  onClick={finishPractice}
                  disabled={submitting}
                  className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex-1"
                >{submitting ? 'Yuborilmoqda...' : 'Tugatish'}</button>
              )}
            </>
          )}
          {step === 'result' && (
            <>
              <button onClick={onClose} className="btn-ghost px-4 py-2.5 rounded-xl text-sm flex-1">Yopish</button>
              <button onClick={restart} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex-1">Qayta urinish</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const OlympiadCard = ({ olympiad: o, onStart, locked }) => {
  const isActive = o.status === 'active';
  const isUpcoming = o.status === 'inactive';
  const disabled = !isActive || locked;
  const typeLabel = eventTypeLabel(o.eventType || 'competition');
  const label = locked ? "🔒 Tashkilot tasdig'i kerak" : (isActive ? '▶ Boshlash' : (isUpcoming ? 'Yaqinda boshlanadi' : (o.status === 'draft' ? 'Hali e\'lon qilinmagan' : 'Tugagan')));
  const time = o.startTime || o.time || '';
  const qCount = (o.questionIds && o.questionIds.length) || o.questions || 0;
  const formattedStartDate = (() => {
    const raw = o.start_datetime || o.startDate;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const months = ['yanvar','fevral','mart','aprel','may','iyun','iyul','avgust','sentabr','oktabr','noyabr','dekabr'];
    return `${d.getDate()}-${months[d.getMonth()]} ${d.getFullYear()}`;
  })();
  return (
    <div className="glass rounded-2xl p-4 md:p-5 card-hover">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <SubjectBadge subject={o.subject} />
          <span className={`rounded-lg px-2 py-1 text-[10px] font-bold flex-shrink-0 ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{typeLabel}</span>
        </div>
        <Badge status={statusLabel(o.status)} />
      </div>
      <h3 className="font-bold text-white mb-1 break-words">{o.title}</h3>
      <div className="flex flex-wrap gap-2 md:gap-3 text-xs text-white/40 mb-3 md:mb-4">
        {o.testLevel && <span className="flex items-center gap-1 text-violet-300"><Icon name="star" size={12} /> {o.testLevel}</span>}
        {o.testType && <span className="flex items-center gap-1 text-sky-300"><Icon name="file" size={12} /> {testTypeLabel(o.testType)}</span>}
        {formattedStartDate && <span className="flex items-center gap-1">📅 {formattedStartDate}</span>}
        <span className="flex items-center gap-1"><Icon name="clock" size={12} /> {time} · {o.duration} daqiqa</span>
        <span className="flex items-center gap-1"><Icon name="file" size={12} /> {qCount} ta savol</span>
        <span className="flex items-center gap-1"><Icon name="users" size={12} /> {o.participants || 0} ishtirokchi</span>
      </div>
      <button onClick={onStart}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px] ${disabled ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
        disabled={disabled}>
        {label}
      </button>
    </div>
  );
};

Object.assign(window, { StudentDashboard, OlympiadCard });
