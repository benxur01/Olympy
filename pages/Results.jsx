// pages/Results.jsx

const ResultsPage = ({ result, user, onNavigate, embedded }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [shareToast, setShareToast] = React.useState('');
  // Javoblarni ko'rish bo'limini ochish/yopish flagi. fetchedAttempt.questions_review
  // mavjud bo'lganda chiqadi (faqat backend rejimida).
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [explanations, setExplanations] = React.useState({}); // { [qid]: string }
  const [explaining, setExplaining] = React.useState({});     // { [qid]: boolean }
  const isPremium = isApi ? !!(user?.isPremium ?? user?.is_premium) : true;
  const [showPremiumLockModal, setShowPremiumLockModal] = React.useState(false);

  const handleExplain = async (qid) => {
    if (explanations[qid]) return;
    setExplaining(prev => ({ ...prev, [qid]: true }));
    try {
      const res = await OlympyApi.explainQuestion(qid, OlympyApi.getToken());
      setExplanations(prev => ({ ...prev, [qid]: res?.explanation || "Tushuntirish yuklanmadi." }));
    } catch (err) {
      setExplanations(prev => ({ ...prev, [qid]: OlympyApi.toUserMessage?.(err) || "Tushuntirish yuklab bo'lmadi." }));
    } finally {
      setExplaining(prev => ({ ...prev, [qid]: false }));
    }
  };

  // AI/backend'dan kelgan tushuntirish matni untrusted — XSS oldini olish
  // uchun faqat <strong> tegiga ruxsat berib DOMPurify orqali tozalaymiz.
  // DOMPurify global entry'da ochilgan (generate-vite-entry.mjs). Mavjud
  // bo'lmasa, butun HTML'ni teglardan tozalab (matn sifatida) qaytaramiz.
  const sanitizeMarkup = (html) => {
    const purifier = typeof globalThis !== 'undefined' ? globalThis.DOMPurify : undefined;
    if (purifier?.sanitize) {
      return purifier.sanitize(html, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
    }
    return String(html).replace(/<[^>]*>/g, '');
  };

  const renderMarkdown = (text) => {
    if (!text) return '';
    return text.split('\n').map((line, i) => {
      let content = line;
      content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const stripped = content.trim().substring(2);
        return <li key={i} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: sanitizeMarkup(stripped) }} />;
      }
      return <p key={i} className="mb-1.5" dangerouslySetInnerHTML={{ __html: sanitizeMarkup(content) }} />;
    });
  };
  // Leaderboard yoki boshqa sahifadan attemptId bilan kelganda, backend'dan
  // attemptni olib kelamiz. Avval mock store'dan qidirilardi va API rejimida
  // topa olmasdi.
  const [fetchedAttempt, setFetchedAttempt] = React.useState(null);
  const [fetchError, setFetchError] = React.useState('');
  const needsFetch = !!(isApi && result?.attemptId
    && !(result.olympiad && (result.score !== undefined || result.correct !== undefined))
    && !(result.id && result.olympiadId && result.score !== undefined));
  // Review fetch — backend rejimida attemptId yoki id mavjud bo'lsa,
  // savollar tahlilini ham yuklab kelamiz. Bu needsFetch'dan alohida ishlaydi:
  // OlympiadTest finish'dan keyin to'liq payload kelganda ham review uchun
  // qo'shimcha so'rov yuborilsin.
  const reviewAttemptId = isApi
    ? (result?.attemptId || result?.id || result?.backendId)
    : null;
  React.useEffect(() => {
    if (!isApi || !reviewAttemptId) { setFetchedAttempt(null); setFetchError(''); return; }
    let cancelled = false;
    setFetchError('');
    OlympyApi.getAttempt(reviewAttemptId, OlympyApi.getToken())
      .then(data => { if (!cancelled) setFetchedAttempt(data); })
      .catch(err => {
        if (cancelled) return;
        // needsFetch holatida (faqat attemptId bilan kelgan) — fetchError
        // muhim. Aks holda (to'liq payload bor) — review uchun fetch xatosini
        // jim yutamiz, asosiy sahifa baribir ishlaydi.
        if (needsFetch) {
          setFetchError(OlympyApi.toUserMessage?.(err) || "Natijani yuklab bo'lmadi");
        }
      });
    return () => { cancelled = true; };
  }, [isApi, reviewAttemptId, needsFetch]);

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
  //  3) API rejimida attemptId bilan kelsa — /api/attempts/{id}/ orqali
  //     backend'dan olib kelamiz (fetchedAttempt);
  //  4) raw attempt obyekti bo'lsa — to'g'ridan-to'g'ri u.
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
  } else if (r && r.attemptId && fetchedAttempt) {
    // API rejimida backend'dan olib kelingan attempt
    const od = fetchedAttempt.olympiad_detail || {};
    r = {
      correct: fetchedAttempt.correct_count ?? 0,
      wrong: fetchedAttempt.wrong_count ?? 0,
      score: fetchedAttempt.score ?? 0,
      total: fetchedAttempt.total_questions ?? 0,
      rank: fetchedAttempt.rank ?? null,
      time: fetchedAttempt.time_spent ?? 0,
      olympiad: od.id ? {
        id: String(od.id),
        title: od.title,
        subject: od.subject,
        eventType: od.event_type,
        testLevel: od.test_level,
        testType: od.test_type,
      } : null,
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
  // API'dan attempt yuklanmoqda bo'lsa, oraliq holatda 0 ko'rsatmaslik uchun
  // alohida loading sahifasi.
  const isLoadingAttempt = needsFetch && !fetchedAttempt && !fetchError;

  // Consistent percentage: prefer score (already in 0-100), else derive from correct/total
  const pct = (r.score !== undefined && r.score !== null)
    ? Math.round(r.score)
    : (r.total ? Math.round((r.correct / r.total) * 100) : 0);
  const grade = pct >= 90 ? { label: 'A\'lo', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-teal-500/10' }
    : pct >= 75 ? { label: 'Yaxshi', color: 'text-indigo-400', bg: 'from-indigo-500/20 to-purple-500/10' }
    : pct >= 60 ? { label: 'Qoniqarli', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/10' }
    : { label: 'Qoniqarsiz', color: 'text-rose-400', bg: 'from-rose-500/20 to-pink-500/10' };
  const fmtTime = (s) => `${Math.floor((s||0)/60)}m ${(s||0)%60}s`;

  if (isLoadingAttempt) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-4 py-10`} style={embedded ? {} : { background: '#050508' }}>
        <div className="glass rounded-2xl px-6 py-4 text-sm text-white/60">Natija yuklanmoqda...</div>
      </div>
    );
  }
  if (fetchError) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-4 py-10`} style={embedded ? {} : { background: '#050508' }}>
        <div className="glass rounded-2xl px-6 py-5 text-center max-w-sm">
          <div className="text-rose-300 font-semibold text-sm mb-2">{fetchError}</div>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-4 py-2 rounded-xl">Reytingga qaytish</button>
        </div>
      </div>
    );
  }

  const content = (
    <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-3 md:px-4 py-4 md:py-10 mobile-content-pad`} style={embedded ? {} : { background: '#050508' }}>
      <div className="max-w-2xl w-full space-y-4 md:space-y-6 animate-in">
        {/* Streak Celebration Banner */}
        {!!user?.streakCount && (
          <div className="glass-strong rounded-2xl p-4 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-orange-500/10 border border-orange-500/30 flex items-center justify-between gap-3 shadow-[0_8px_32px_rgba(249,115,22,0.08)] animate-in">
            <div className="flex items-center gap-3">
              <span className="text-2xl animate-bounce">🔥</span>
              <div className="text-left">
                <div className="text-sm font-black text-white">Ketma-ket {user.streakCount} kun faollik!</div>
                <div className="text-[10px] text-white/50">Faollik alangangizni o'chirmaslik uchun har kuni mashq yoki olimpiada yeching.</div>
              </div>
            </div>
            <div className="hidden sm:block text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-xl">
              Super!
            </div>
          </div>
        )}

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

        {/* Javoblarni ko'rish — faqat backend rejimida va savollar mavjud bo'lsa */}
        {isApi && Array.isArray(fetchedAttempt?.questions_review) && fetchedAttempt.questions_review.length > 0 && (
          <div className="glass rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-bold text-white text-sm md:text-base">Javoblar tahlili</h3>
              <button
                onClick={() => setReviewOpen(v => !v)}
                className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5"
              >
                <Icon name={reviewOpen ? 'chevronDown' : 'chevronRight'} size={12} />
                {reviewOpen ? 'Yopish' : "Javoblarni ko'rish"}
              </button>
            </div>
            {reviewOpen && (
              <div className="space-y-4 mt-3">
                {fetchedAttempt.questions_review.map((q, idx) => {
                  const difficultyLabel = (() => {
                    const map = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin', beginner: 'Beginner', elementary: 'Elementary', 'pre-int': 'Pre-Int', int: 'Intermediate', 'upper-int': 'Upper-Int', advanced: 'Advanced' };
                    return map[q.difficulty] || q.difficulty || '';
                  })();
                  // Kod (IT) savol — variantlar o'rniga yuborilgan kod + AI bahosi.
                  if (q.question_type === 'code') {
                    return (
                      <div key={q.id} className="rounded-2xl p-3 md:p-4 border border-sky-500/25 bg-sky-500/5">
                        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white/40 text-xs font-bold">#{idx + 1}</span>
                            <span className="chip bg-sky-500/15 text-sky-300 border border-sky-500/25 text-[10px] font-bold">{'</> '}{q.code_language || q.programming_language || 'kod'}</span>
                            {difficultyLabel && (
                              <span className="chip bg-white/5 text-white/60 border border-white/10 text-[10px]">{difficultyLabel}</span>
                            )}
                            <span className="chip bg-white/5 text-white/50 border border-white/10 text-[10px]">{q.score || 0} ball</span>
                          </div>
                          {typeof q.ai_code_score === 'number' && (
                            <span className="chip text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">AI: {q.ai_code_score}/100</span>
                          )}
                        </div>
                        <div className="text-white text-sm font-medium mb-3 break-words whitespace-pre-wrap">{q.text}</div>
                        <div className="text-[10px] uppercase tracking-wide text-white/35 font-bold mb-1">Sizning kodingiz</div>
                        <pre className="text-xs text-white/80 bg-black/30 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words border border-white/5">{q.submitted_code || '(kod yuborilmagan)'}</pre>
                        {q.ai_code_review && (
                          <div className="mt-3">
                            <div className="text-[10px] uppercase tracking-wide text-white/35 font-bold mb-1">AI tavsiyasi</div>
                            <div className="rounded-xl bg-[#12141a] border border-indigo-500/20 p-3 text-xs text-white/80 whitespace-pre-wrap break-words">{q.ai_code_review}</div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={q.id} className={`rounded-2xl p-3 md:p-4 border ${q.is_correct ? 'border-emerald-500/30 bg-emerald-500/5' : (q.chosen_answer == null ? 'border-amber-500/30 bg-amber-500/5' : 'border-rose-500/30 bg-rose-500/5')}`}>
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white/40 text-xs font-bold">#{idx + 1}</span>
                          {difficultyLabel && (
                            <span className="chip bg-white/5 text-white/60 border border-white/10 text-[10px]">{difficultyLabel}</span>
                          )}
                          <span className="chip bg-white/5 text-white/50 border border-white/10 text-[10px]">{q.score || 0} ball</span>
                        </div>
                        <span className={`chip text-[10px] ${q.is_correct ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : (q.chosen_answer == null ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30')}`}>
                          {q.is_correct ? "✓ To'g'ri" : (q.chosen_answer == null ? "Bo'sh" : "✗ Noto'g'ri")}
                        </span>
                      </div>
                      <div className="text-white text-sm font-medium mb-3 break-words">{q.text}</div>
                      <div className="space-y-1.5">
                        {(q.options || []).map((opt, oi) => {
                          const isCorrect = oi === q.correct_answer;
                          const isChosen = oi === q.chosen_answer;
                          let cls = 'bg-white/5 text-white/60 border-white/10';
                          if (isCorrect) cls = 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40';
                          else if (isChosen && !isCorrect) cls = 'bg-rose-500/15 text-rose-200 border-rose-500/40';
                          return (
                            <div key={oi} className={`rounded-xl px-3 py-2 text-xs md:text-sm border flex items-center gap-2 ${cls}`}>
                              <span className="text-white/40 font-bold flex-shrink-0">{String.fromCharCode(65 + oi)}.</span>
                              <span className="flex-1 break-words">{String(opt)}</span>
                              {isCorrect && <Icon name="check" size={12} className="text-emerald-400 flex-shrink-0" />}
                              {isChosen && !isCorrect && <Icon name="x" size={12} className="text-rose-400 flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>

                      {/* AI Explanation Button & Content */}
                      <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                        {explanations[q.id] ? (
                          <div className="rounded-xl bg-[#12141a] border border-indigo-500/20 p-3 text-xs text-white/80 leading-relaxed animate-in">
                            <div className="flex items-center gap-1.5 text-indigo-400 font-bold mb-2">
                              <Icon name="bolt" size={13} className="text-indigo-400 animate-pulse" />
                              <span>AI Yechim Tushuntirishi</span>
                            </div>
                            <div className="whitespace-pre-line text-[11px] md:text-xs">
                              {renderMarkdown(explanations[q.id])}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!isPremium) {
                                setShowPremiumLockModal(true);
                              } else {
                                handleExplain(q.id);
                              }
                            }}
                            disabled={explaining[q.id]}
                            className="btn-ghost text-[11px] px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200"
                          >
                            {explaining[q.id] ? (
                              <>
                                <span className="w-3 h-3 rounded-full border border-white/20 border-t-white animate-spin" />
                                Tushuntirish tayyorlanmoqda...
                              </>
                            ) : (
                              <>
                                <Icon name={isPremium ? "bolt" : "lock"} size={12} className={isPremium ? "text-indigo-400" : "text-amber-400"} />
                                <span>AI Yechim Tushuntirishi {!isPremium && <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-extrabold ml-1">PRO</span>}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions — stack on mobile, row on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
          <button onClick={() => { const role = user?.role; onNavigate(role === 'manager' || role === 'teacher' ? 'manager' : role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'student'); }} className="btn-primary py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="home" size={16} /> Profilga o'tish</button>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="trophy" size={16} /> Reytingni ko'rish</button>
          <button onClick={() => handleShare()} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="send" size={16} /> Ulashish</button>
        </div>

        {shareToast && (
          <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 glass-strong rounded-2xl px-5 py-3 border border-indigo-500/30 text-sm font-medium text-white max-w-[calc(100%-1.5rem)] text-center">
            {shareToast}
          </div>
        )}

        <Modal open={showPremiumLockModal} onClose={() => setShowPremiumLockModal(false)} title="👑 Premium Imkoniyat" width="max-w-md">
          <div className="text-center p-4 space-y-4">
            <div className="text-5xl animate-bounce">🔒</div>
            <h3 className="text-lg font-black text-white">AI Yechim Tushuntirishi faqat Premium o'quvchilarga ochiq</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Nega bu xatoga yo'l qo'yganingizni va to'g'ri yechim yo'lini batafsil tahlil qilish uchun AI o'qituvchi yordamidan foydalaning.
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowPremiumLockModal(false);
                  if (onNavigate) onNavigate('premium');
                }}
                className="btn-primary py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md shadow-indigo-600/20"
              >
                Premiumga o'tish ⚡
              </button>
              <button
                onClick={() => setShowPremiumLockModal(false)}
                className="btn-ghost py-2 rounded-xl text-xs font-semibold text-white/50"
              >
                Yopish
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );

  // Web Share API yoki clipboard fallback. Backend kerak emas.
  function handleShare() {
    const text = `${r.olympiad?.title || 'Olimpiada'} natijasi: ${pct}/100${r.rank ? ` · #${r.rank}-o'rin` : ''}`;
    const url = (typeof window !== 'undefined' && window.location?.href) || '';
    const showToast = (m) => { setShareToast(m); setTimeout(() => setShareToast(''), 2500); };
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Olympy natija', text, url }).catch(() => {});
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
