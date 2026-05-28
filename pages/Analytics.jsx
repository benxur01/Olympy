// pages/Analytics.jsx — Chuqur analitika sahifasi

const AnalyticsPage = ({ user, onNavigate }) => {
  const [tab, setTab] = React.useState('student');
  const isApi = !!user?._api;
  const token = isApi ? OlympyApi.getToken() : null;

  // Foydalanuvchi rollarini aniqlash — "Savollar" tab faqat
  // teacher/manager/owner uchun.
  const userRoles = user?.roles || {};
  const isStaff = ['teacher', 'manager', 'owner'].some(r => userRoles[r]?.status === 'approved');
  // Markaz id — savollar tahlili uchun. Avvalo manager, keyin teacher/owner.
  const centerId = (() => {
    for (const role of ['manager', 'owner', 'teacher']) {
      const cid = userRoles[role]?.centerId;
      if (userRoles[role]?.status === 'approved' && cid) return cid;
    }
    return null;
  })();

  // ─── O'quvchi tab data ───────────────────────────────────────────
  const monthlyRes = useApiData(
    () => isApi ? OlympyApi.getMyMonthlyStats(6, token) : Promise.resolve(null),
    [isApi],
  );
  const statsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(token) : Promise.resolve(null),
    [isApi],
  );
  const monthlyChart = React.useMemo(() => {
    const rows = monthlyRes.data?.months;
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({ label: r.label || `${r.month}-oy`, value: Math.round(r.average_score || 0) }));
  }, [monthlyRes.data]);
  const subjectRows = Array.isArray(statsRes.data?.subjects) ? statsRes.data.subjects : [];

  // ─── Savollar tab data ───────────────────────────────────────────
  const difficultyRes = useApiData(
    () => (isApi && isStaff && centerId)
      ? OlympyApi.getQuestionDifficultyStats(centerId, token)
      : Promise.resolve(null),
    [isApi, isStaff, centerId],
  );

  // ─── Markaz reytingi tab data ────────────────────────────────────
  const [regionFilter, setRegionFilter] = React.useState('');
  const ratingsRes = useApiData(
    () => isApi
      ? OlympyApi.getCenterRatings(regionFilter ? { region: regionFilter, limit: 50 } : { limit: 50 }, token)
      : Promise.resolve([]),
    [isApi, regionFilter],
  );

  // Region select uchun ro'yxat — markazlardan derive qilamiz.
  const allRegions = React.useMemo(() => {
    const set = new Set();
    (ratingsRes.data || []).forEach(r => { if (r.region) set.add(r.region); });
    return Array.from(set).sort();
  }, [ratingsRes.data]);

  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
    >{label}</button>
  );

  return (
    <div className="min-h-screen" style={{ background: '#050508' }}>
      <div className="glass border-b border-white/5 px-4 md:px-6 py-3 flex items-center gap-3">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => onNavigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
          <BrandLogo size="sm" />
        </button>
        <h1 className="text-white font-bold text-base md:text-lg">Analitika</h1>
        <button onClick={() => onNavigate(roleHomePage(user))} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
          <Icon name="arrowLeft" size={13} /> Orqaga
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad">
        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap glass rounded-2xl p-2">
          {tabBtn('student', "O'quvchi")}
          {isStaff && tabBtn('questions', 'Savollar')}
          {tabBtn('centers', 'Markaz reytingi')}
        </div>

        {/* O'quvchi tab */}
        {tab === 'student' && (
          <div className="space-y-4 md:space-y-6">
            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-bold text-white text-sm md:text-base mb-3">Oylik o'rtacha ball (6 oy)</h3>
              {!isApi && <div className="text-xs text-white/40">Bu ma'lumot faqat backend rejimida ko'rinadi.</div>}
              {isApi && monthlyRes.loading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
              {isApi && !monthlyRes.loading && monthlyChart.length === 0 && (
                <div className="text-xs text-white/40">Hozircha natijalar yo'q.</div>
              )}
              {monthlyChart.length > 0 && (
                <div className="mt-2">
                  <BarChart data={monthlyChart} />
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-bold text-white text-sm md:text-base mb-3">Fanlar bo'yicha natijalar</h3>
              {isApi && statsRes.loading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
              {isApi && !statsRes.loading && subjectRows.length === 0 && (
                <div className="text-xs text-white/40">Hali fan kesimida natijalar yo'q.</div>
              )}
              {subjectRows.length > 0 && (
                <div className="space-y-3">
                  {subjectRows.map((r, i) => {
                    const avg = Math.round(r.average_score || 0);
                    return (
                      <div key={`${r.subject}-${i}`}>
                        <div className="flex justify-between text-xs mb-1 gap-2">
                          <span className="text-white/60 truncate min-w-0">
                            <span className="truncate">{r.subject || '—'}</span>
                            <span className="text-white/30 whitespace-nowrap"> · {r.attempts || 0} ta</span>
                          </span>
                          <span className={`font-medium flex-shrink-0 ${avg >= 70 ? 'text-emerald-400' : avg >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>{avg}%</span>
                        </div>
                        <div className="progress-bar h-2">
                          <div className="progress-fill" style={{ width: `${avg}%`, background: avg >= 70 ? '#22c55e' : avg >= 50 ? '#f59e0b' : '#ef4444' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {statsRes.data && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Jami urinishlar" value={statsRes.data.total_attempts || 0} icon={<Icon name="bolt" size={20} />} color="from-cyan-500 to-blue-600" />
                <StatCard label="O'rtacha ball" value={Math.round(statsRes.data.average_score || 0)} icon={<Icon name="chart" size={20} />} color="from-indigo-500 to-purple-600" />
                <StatCard label="Eng yaxshi o'rin" value={statsRes.data.best_rank ? `#${statsRes.data.best_rank}` : '—'} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
              </div>
            )}
          </div>
        )}

        {/* Savollar tab */}
        {tab === 'questions' && isStaff && (
          <div className="space-y-4 md:space-y-6">
            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-bold text-white text-sm md:text-base mb-3">Qiyinlik bo'yicha taqsimot</h3>
              {!centerId && <div className="text-xs text-white/40">Markaz topilmadi.</div>}
              {isApi && difficultyRes.loading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
              {isApi && !difficultyRes.loading && centerId && difficultyRes.data && (
                <>
                  <div className="mb-4 text-sm text-white/60">
                    Jami savollar: <span className="text-white font-bold">{difficultyRes.data.total_questions}</span>
                  </div>
                  <div className="space-y-3">
                    {(difficultyRes.data.by_difficulty || []).map((d, i) => {
                      const pct = difficultyRes.data.total_questions
                        ? Math.round((d.count / difficultyRes.data.total_questions) * 100)
                        : 0;
                      const rate = Math.round(d.avg_correct_rate || 0);
                      return (
                        <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-3 md:p-4">
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold">{d.label}</span>
                              <span className="chip bg-white/5 text-white/60 border border-white/10 text-[10px]">{d.count} ta</span>
                            </div>
                            <span className={`text-xs font-bold ${rate >= 70 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                              To'g'rilik: {rate}%
                            </span>
                          </div>
                          <div className="progress-bar h-2 mb-2">
                            <div className="progress-fill" style={{ width: `${pct}%`, background: '#6366f1' }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-white/40">
                            <span>{pct}% bankdan</span>
                            <span>{rate}% to'g'ri javob</span>
                          </div>
                        </div>
                      );
                    })}
                    {(difficultyRes.data.by_difficulty || []).length === 0 && (
                      <div className="text-xs text-white/40">Savollar topilmadi.</div>
                    )}
                  </div>
                </>
              )}
              {difficultyRes.error && (
                <div className="text-xs text-rose-300">Yuklab bo'lmadi: {String(difficultyRes.error?.message || '')}</div>
              )}
            </div>
          </div>
        )}

        {/* Markaz reytingi tab */}
        {tab === 'centers' && (
          <div className="space-y-4 md:space-y-6">
            <div className="glass rounded-2xl p-4 md:p-6">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h3 className="font-bold text-white text-sm md:text-base">Markazlar reytingi</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={regionFilter}
                    onChange={e => setRegionFilter(e.target.value)}
                    className="glass border border-white/10 rounded-xl px-3 py-2 text-xs text-white bg-transparent"
                  >
                    <option value="" className="bg-[#12141a]">Barcha viloyatlar</option>
                    {allRegions.map(r => <option key={r} value={r} className="bg-[#12141a]">{r}</option>)}
                  </select>
                </div>
              </div>
              {isApi && ratingsRes.loading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
              {isApi && !ratingsRes.loading && (ratingsRes.data || []).length === 0 && (
                <div className="text-xs text-white/40">Reyting bo'sh.</div>
              )}
              {(ratingsRes.data || []).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/40 text-xs">
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Markaz</th>
                        <th className="py-2 pr-3 hidden md:table-cell">Shahar</th>
                        <th className="py-2 pr-3">O'rt. ball</th>
                        <th className="py-2 pr-3 hidden md:table-cell">Urinishlar</th>
                        <th className="py-2">Reyting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ratingsRes.data || []).map(r => (
                        <tr key={r.center_id} className="border-t border-white/5">
                          <td className="py-2 pr-3 text-white/60 font-bold">{r.rank}</td>
                          <td className="py-2 pr-3 text-white font-medium">{r.center_name}</td>
                          <td className="py-2 pr-3 text-white/60 hidden md:table-cell">{r.city || r.region || '—'}</td>
                          <td className="py-2 pr-3 text-emerald-300 font-bold">{r.average_score}</td>
                          <td className="py-2 pr-3 text-white/60 hidden md:table-cell">{r.total_attempts}</td>
                          <td className="py-2 text-amber-300 font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <Icon name="star" size={12} />
                              {r.rating?.toFixed ? r.rating.toFixed(1) : r.rating}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { AnalyticsPage });
