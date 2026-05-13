// pages/Results.jsx

const ResultsPage = ({ result, user, onNavigate, embedded }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [shareToast, setShareToast] = React.useState('');

  // Bo'limlar bo'yicha: backend /api/results/me/stats/ subjects ro'yxati.
  // Avval bu yerda 4 ta hardcoded bo'lim ("Algebraik tenglamalar 8/10" va h.k.)
  // har bir foydalanuvchiga bir xil ko'rinardi. Endi haqiqiy fan kesimi.
  const apiStatsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const subjectBreakdown = React.useMemo(() => {
    if (!isApi) return [];
    const rows = apiStatsRes.data?.subjects;
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 6).map(row => ({
      name: row.subject || '—',
      attempts: row.attempts || 0,
      avg: Math.round(row.average_score || 0),
    }));
  }, [isApi, apiStatsRes.data]);

  // Resolve result. Avval doim store.attempts'dan qidirardi va API
  // rejimda topa olmasdi → score=0, total=0 ko'rinardi. Endi:
  //  1) caller olympiad ob'ektni to'g'ridan-to'g'ri o'tkazgan bo'lsa, uni
  //     ishlatamiz (Profile.jsx, OlympiadTest.jsx onFinish payloadi);
  //  2) attemptId bilan kelsa va store.attempts'da topsak — eski mock yo'l;
  //  3) raw attempt obyekti bo'lsa — to'g'ridan-to'g'ri u.
  let r = result;
  if (r && r.olympiad && (r.score !== undefined || r.correct !== undefined)) {
    // OlympiadTest onFinish to'liq payload yuboradi: { score, correct,
    // wrong, total, rank, time, olympiad }. Hech qanday lookup kerak emas.
    r = {
      correct: r.correct ?? r.correctCount ?? 0,
      wrong: r.wrong ?? r.wrongCount ?? 0,
      score: r.score ?? 0,
      total: r.total ?? r.totalQuestions ?? 0,
      rank: r.rank ?? null,
      time: r.time ?? r.timeSpent ?? 0,
      olympiad: r.olympiad,
    };
  } else if (r && r.attemptId) {
    const a = store.attempts.find(x => x.id === r.attemptId);
    if (a) {
      const o = store.olympiads.find(x => x.id === a.olympiadId);
      r = {
        correct: a.correctCount, wrong: a.wrongCount,
        score: a.score, total: a.totalQuestions, rank: a.rank,
        time: a.timeSpent, olympiad: o,
      };
    }
  } else if (r && r.id && r.olympiadId && r.score !== undefined) {
    // Already an attempt object passed directly (eski yo'l, mock store)
    const o = store.olympiads.find(x => x.id === r.olympiadId);
    r = {
      correct: r.correctCount, wrong: r.wrongCount,
      score: r.score, total: r.totalQuestions, rank: r.rank,
      time: r.timeSpent, olympiad: o,
    };
  }
  if (!r) {
    r = { correct: 0, wrong: 0, score: 0, total: 0, rank: 0, time: 0, olympiad: null };
  }

  // Consistent percentage: prefer score (already in 0-100), else derive from correct/total
  const pct = (r.score !== undefined && r.score !== null)
    ? Math.round(r.score)
    : (r.total ? Math.round((r.correct / r.total) * 100) : 0);
  const grade = pct >= 90 ? { label: 'A\'lo', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-teal-500/10' }
    : pct >= 75 ? { label: 'Yaxshi', color: 'text-indigo-400', bg: 'from-indigo-500/20 to-purple-500/10' }
    : pct >= 60 ? { label: 'Qoniqarli', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/10' }
    : { label: 'Qoniqarsiz', color: 'text-rose-400', bg: 'from-rose-500/20 to-pink-500/10' };
  const fmtTime = (s) => `${Math.floor((s||0)/60)}m ${(s||0)%60}s`;

  const content = (
    <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-3 md:px-4 py-4 md:py-10 mobile-content-pad`} style={embedded ? {} : { background: '#060818' }}>
      <div className="max-w-2xl w-full space-y-4 md:space-y-6 animate-in">
        {/* Hero result card */}
        <div className={`glass-strong rounded-3xl p-5 md:p-8 text-center bg-gradient-to-br ${grade.bg} border border-white/10 relative overflow-hidden`}>
          <div className="hero-glow" style={{ background: '#6366f1', top: '-60%', left: '30%', opacity: 0.1 }} />
          <div className="relative z-10">
            <div className="text-4xl md:text-5xl mb-3 md:mb-4">{pct >= 90 ? '🏆' : pct >= 75 ? '🎉' : pct >= 60 ? '👍' : '💪'}</div>
            <div className="text-5xl md:text-7xl font-black text-white mb-2">{pct}<span className="text-white/30 text-2xl md:text-3xl">/100</span></div>
            <div className={`text-xl md:text-2xl font-bold ${grade.color} mb-2`}>{grade.label}</div>
            <div className="text-white/50 text-xs md:text-sm break-words px-2">{r.olympiad?.title || 'Olimpiada'}</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {r.olympiad?.subject && <SubjectBadge subject={r.olympiad.subject} />}
              {r.olympiad?.testLevel && <span className="chip bg-violet-500/15 text-violet-300 border border-violet-500/20">{r.olympiad.testLevel}</span>}
              {r.olympiad?.testType && <span className="chip bg-sky-500/15 text-sky-300 border border-sky-500/20">{testTypeLabel(r.olympiad.testType)}</span>}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { icon: '✅', label: "To'g'ri", value: r.correct, color: 'text-emerald-400' },
            { icon: '❌', label: "Noto'g'ri", value: r.wrong, color: 'text-rose-400' },
            { icon: '⏱', label: 'Sarflangan vaqt', value: fmtTime(r.time || 0), color: 'text-cyan-400' },
            { icon: '🏅', label: 'Reyting o\'rni', value: r.rank ? `#${r.rank}` : '—', color: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="glass rounded-2xl p-3 md:p-4 text-center card-hover">
              <div className="text-xl md:text-2xl mb-1">{s.icon}</div>
              <div className={`text-base md:text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-[10px] md:text-xs text-white/40">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Accuracy breakdown */}
        <div className="glass rounded-2xl p-4 md:p-6">
          <h3 className="font-bold text-white mb-3 md:mb-4 text-sm md:text-base">Natija tahlili</h3>
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            {/* Donut row — on mobile horizontally centered & evenly spaced */}
            <div className="flex items-center justify-around md:justify-start md:gap-4 flex-wrap">
              <DonutChart value={r.correct} max={r.total} color="#22c55e" size={64} label="To'g'ri" />
              <DonutChart value={r.wrong} max={r.total} color="#ef4444" size={64} label="Noto'g'ri" />
              <DonutChart value={pct} color="#6366f1" size={64} label="Umumiy %" />
            </div>
            <div className="flex-1 space-y-3 w-full min-w-0">
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1 gap-2"><span className="truncate">To'g'ri javoblar</span><span className="text-emerald-400 flex-shrink-0">{r.correct}/{r.total}</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: r.total ? `${(r.correct/r.total)*100}%` : '0%', background: '#22c55e' }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1 gap-2"><span className="truncate">Noto'g'ri javoblar</span><span className="text-rose-400 flex-shrink-0">{r.wrong}/{r.total}</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: r.total ? `${(r.wrong/r.total)*100}%` : '0%', background: '#ef4444' }} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Subject performance — fan kesimi backenddan */}
        <div className="glass rounded-2xl p-4 md:p-6">
          <h3 className="font-bold text-white mb-3 md:mb-4 text-sm md:text-base">Fanlar bo'yicha o'rtacha</h3>
          {isApi && apiStatsRes.loading && (
            <div className="text-xs text-white/40">Yuklanmoqda...</div>
          )}
          {isApi && !apiStatsRes.loading && subjectBreakdown.length === 0 && (
            <div className="text-xs text-white/40">Hali fan kesimida natijalar yo'q.</div>
          )}
          {!isApi && (
            <div className="text-xs text-white/40">Fan kesimi faqat akkaunt rejimida ko'rinadi.</div>
          )}
          <div className="space-y-3">
            {subjectBreakdown.map((s, i) => (
              <div key={`${s.name}-${i}`}>
                <div className="flex justify-between text-xs mb-1 gap-2">
                  <span className="text-white/60 truncate min-w-0"><span className="truncate">{s.name}</span> <span className="text-white/30 whitespace-nowrap">· {s.attempts} ta</span></span>
                  <span className={`font-medium flex-shrink-0 ${s.avg>=70?'text-emerald-400':s.avg>=50?'text-amber-400':'text-rose-400'}`}>{s.avg}%</span>
                </div>
                <div className="progress-bar h-2">
                  <div className="progress-fill" style={{ width:`${s.avg}%`, background: s.avg>=70?'#22c55e':s.avg>=50?'#f59e0b':'#ef4444' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions — stack on mobile, row on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
          <button onClick={() => onNavigate('student')} className="btn-primary py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="home" size={16} /> Profilga o'tish</button>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="trophy" size={16} /> Reytingni ko'rish</button>
          <button onClick={() => handleShare()} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="send" size={16} /> Ulashish</button>
        </div>

        {shareToast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 glass-strong rounded-2xl px-5 py-3 border border-indigo-500/30 text-sm font-medium text-white max-w-[calc(100%-1.5rem)] text-center">
            {shareToast}
          </div>
        )}
      </div>
    </div>
  );

  // Web Share API yoki clipboard fallback. Backend kerak emas.
  function handleShare() {
    const text = `${r.olympiad?.title || 'Olimpiada'} natijasi: ${pct}/100${r.rank ? ` · #${r.rank}-o'rin` : ''}`;
    const url = (typeof window !== 'undefined' && window.location?.href) || '';
    const showToast = (m) => { setShareToast(m); setTimeout(() => setShareToast(''), 2500); };
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'PROLYMP natija', text, url }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${text} ${url}`.trim())
        .then(() => showToast('Natija nusxalandi'))
        .catch(() => showToast('Nusxalab bo\'lmadi'));
      return;
    }
    showToast('Brauzer ulashishni qo\'llab-quvvatlamaydi');
  }

  if (embedded) return content;
  return content;
};

Object.assign(window, { ResultsPage });
