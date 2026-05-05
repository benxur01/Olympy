// pages/Results.jsx

const ResultsPage = ({ result, user, onNavigate, embedded }) => {
  const store = useStore();

  // Resolve result: if an attemptId is given, prefer the store-backed attempt (consistent across navigation)
  let r = result;
  if (r && r.attemptId) {
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
    // Already an attempt object passed directly
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={embedded ? {} : { background: '#060818' }}>
      <div className="max-w-2xl w-full space-y-6 animate-in">
        {/* Hero result card */}
        <div className={`glass-strong rounded-3xl p-8 text-center bg-gradient-to-br ${grade.bg} border border-white/10 relative overflow-hidden`}>
          <div className="hero-glow" style={{ background: '#6366f1', top: '-60%', left: '30%', opacity: 0.1 }} />
          <div className="relative z-10">
            <div className="text-5xl mb-4">{pct >= 90 ? '🏆' : pct >= 75 ? '🎉' : pct >= 60 ? '👍' : '💪'}</div>
            <div className="text-5xl md:text-7xl font-black text-white mb-2">{pct}<span className="text-white/30 text-3xl">/100</span></div>
            <div className={`text-2xl font-bold ${grade.color} mb-2`}>{grade.label}</div>
            <div className="text-white/50 text-sm">{r.olympiad?.title || 'Olimpiada'}</div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {r.olympiad?.subject && <SubjectBadge subject={r.olympiad.subject} />}
              {r.olympiad?.testLevel && <span className="chip bg-violet-500/15 text-violet-300 border border-violet-500/20">{r.olympiad.testLevel}</span>}
              {r.olympiad?.testType && <span className="chip bg-sky-500/15 text-sky-300 border border-sky-500/20">{testTypeLabel(r.olympiad.testType)}</span>}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '✅', label: "To'g'ri", value: r.correct, color: 'text-emerald-400' },
            { icon: '❌', label: "Noto'g'ri", value: r.wrong, color: 'text-rose-400' },
            { icon: '⏱', label: 'Sarflangan vaqt', value: fmtTime(r.time || 0), color: 'text-cyan-400' },
            { icon: '🏅', label: 'Reyting o\'rni', value: r.rank ? `#${r.rank}` : '—', color: 'text-amber-400' },
          ].map((s, i) => (
            <div key={i} className="glass rounded-2xl p-4 text-center card-hover">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Accuracy breakdown */}
        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-white mb-4">Natija tahlili</h3>
          <div className="flex items-center gap-6">
            <DonutChart value={r.correct} max={r.total} color="#22c55e" size={90} label="To'g'ri" />
            <DonutChart value={r.wrong} max={r.total} color="#ef4444" size={90} label="Noto'g'ri" />
            <DonutChart value={pct} color="#6366f1" size={90} label="Umumiy %" />
            <div className="flex-1 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1"><span>To'g'ri javoblar</span><span className="text-emerald-400">{r.correct}/{r.total}</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: `${(r.correct/r.total)*100}%`, background: '#22c55e' }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-white/50 mb-1"><span>Noto'g'ri javoblar</span><span className="text-rose-400">{r.wrong}/{r.total}</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: `${(r.wrong/r.total)*100}%`, background: '#ef4444' }} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Subject performance */}
        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-white mb-4">Bo'limlar bo'yicha</h3>
          <div className="space-y-3">
            {[
              { name: 'Algebraik tenglamalar', correct: 8, total: 10 },
              { name: 'Geometriya', correct: 7, total: 10 },
              { name: 'Kombinatorika', correct: 6, total: 10 },
              { name: 'Logarifmlar', correct: 5, total: 10 },
            ].map((s, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/60">{s.name}</span>
                  <span className={`font-medium ${(s.correct/s.total)>=0.7?'text-emerald-400':'text-amber-400'}`}>{s.correct}/{s.total}</span>
                </div>
                <div className="progress-bar h-2">
                  <div className="progress-fill" style={{ width:`${(s.correct/s.total)*100}%`, background: (s.correct/s.total)>=0.7?'#22c55e':'#f59e0b' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => onNavigate('student')} className="btn-primary flex-1 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2"><Icon name="home" size={16} /> Profilga o'tish</button>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2"><Icon name="trophy" size={16} /> Reytingni ko'rish</button>
          <button className="btn-ghost px-5 py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2"><Icon name="send" size={16} /> Ulashish</button>
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return content;
};

Object.assign(window, { ResultsPage });
