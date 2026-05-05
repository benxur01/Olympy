// pages/OlympiadTest.jsx

// Fallback question bank used only if olympiad has no assigned questions
const FALLBACK_QUESTIONS = [
  { id:'fq1', text:"2x + 5 = 13 tenglamasida x ning qiymatini toping.", options:["x = 2","x = 3","x = 4","x = 5"], correctAnswer:2 },
  { id:'fq2', text:"Agar a = 3 va b = 4 bo'lsa, a² + b² qiymatini hisoblang.", options:["20","25","30","35"], correctAnswer:1 },
  { id:'fq3', text:"Pythagoras teoremasi faqat to'g'ri burchakli uchburchaklarga tatbiq etiladi.", options:["To'g'ri","Noto'g'ri"], correctAnswer:0 },
  { id:'fq4', text:"100 ning kvadrat ildizini hisoblang.", options:["8","9","10","11"], correctAnswer:2 },
  { id:'fq5', text:"Aylana yuzasi formulasi qaysi?", options:["πr","2πr","πr²","2πr²"], correctAnswer:2 },
];

const OlympiadTestPage = ({ olympiad, user, onFinish, onNavigate }) => {
  const store = useStore();

  // Resolve the question list: prefer store-backed olympiad.questionIds → store.questions
  const liveOlympiad = olympiad ? store.olympiads.find(o => o.id === olympiad.id) || olympiad : null;
  const [apiQuestions, setApiQuestions] = React.useState(null);
  const [questionsLoading, setQuestionsLoading] = React.useState(false);
  // API rejimda backenddan savollar olinmagan paytda foydalanuvchini soxta
  // FALLBACK_QUESTIONS bilan adashtirmaslik uchun aniq xatolik holatini
  // saqlaymiz.
  const [questionsError, setQuestionsError] = React.useState('');
  // Server timing — backend session.started_at + duration_minutes asosida.
  // Frontend lokal sanash o'rniga shu timestamp orqali qoldiq vaqtni
  // hisoblaydi, demak savollar yuklash kech bo'lsa-da, server bilan drift
  // bo'lmaydi.
  const [serverExpiresAt, setServerExpiresAt] = React.useState(null);
  const [serverClockSkewMs, setServerClockSkewMs] = React.useState(0);

  const now = new Date();
  // start_datetime backenddan ISO bo'lib keladi va vaqt mintaqasiga bog'liq
  // emas; mock store esa startDate+startTime ni lokal vaqt sifatida saqlaydi.
  // olympiadStartMoment ikkalasini ham to'g'ri parse qiladi va vaqt mintaqasi
  // sababli kun siljishi muammosini bartaraf etadi.
  const startDt = liveOlympiad ? olympiadStartMoment(liveOlympiad) : null;
  const endDt = startDt ? new Date(startDt.getTime() + (liveOlympiad.duration || 60) * 60000) : null;
  const isBeforeStart = startDt && now < startDt;
  const isAfterEnd = endDt && now > endDt;

  const assignedIds = liveOlympiad?.questionIds || [];
  const assignedQuestions = assignedIds
    .map(qid => store.questions.find(q => q.id === qid))
    .filter(Boolean);
  // API foydalanuvchisi uchun apiQuestions yagona haqiqiy manba; FALLBACK
  // faqat mock/dev rejim uchun. Aks holda student soxta savollarga javob
  // berib qo'yardi va backendga unchaqirilgan submit yuborishi mumkin edi.
  const fallbackQuestions = assignedQuestions.length > 0 ? assignedQuestions : FALLBACK_QUESTIONS;
  const TEST_QUESTIONS = user?._api
    ? (Array.isArray(apiQuestions) ? apiQuestions : [])
    : fallbackQuestions;

  const TOTAL = TEST_QUESTIONS.length;
  const DURATION = (liveOlympiad?.duration || olympiad?.duration || 30) * 60;

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [marked, setMarked] = React.useState({});
  const [timeLeft, setTimeLeft] = React.useState(DURATION);
  const [confirmModal, setConfirmModal] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [cheated, setCheated] = React.useState(false);
  const [cheatMessage, setCheatMessage] = React.useState('');
  const cheatReportedRef = React.useRef(false);
  // Confirm modal yoki submit jarayonida brauzer fokusi tabiiy ravishda
  // o'zgaradi (modal ochiladi/yopiladi). Shu paytlarda blur/visibility
  // hodisalarini cheating deb hisoblamaslik uchun bayroq.
  const cheatGuardActiveRef = React.useRef(true);

  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || isBeforeStart || isAfterEnd) {
      setApiQuestions(null);
      setQuestionsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setQuestionsLoading(true);
    setQuestionsError('');
    globalThis.OlympyApi.getOlympiadQuestions(liveOlympiad.backendId, globalThis.OlympyApi.getToken())
      .then(resp => {
        if (cancelled) return;
        // Backend yangi shape qaytaradi: { questions, session }. Eski shape
        // (array) bilan ham backward-compat ishlasin uchun ikkalasiga ham
        // tayyormiz.
        const list = Array.isArray(resp) ? resp : resp?.questions;
        const sess = !Array.isArray(resp) ? resp?.session : null;
        if (Array.isArray(list) && list.length > 0) {
          setApiQuestions(list);
          setQuestionsError('');
          if (sess?.expires_at) {
            setServerExpiresAt(sess.expires_at);
            // Brauzer soati server soatidan farq qilishi mumkin — drift'ni
            // o'lchaymiz va remaining hisoblashda hisobga olamiz.
            if (sess.server_now) {
              const skew = Date.now() - new Date(sess.server_now).getTime();
              setServerClockSkewMs(skew);
            }
          }
        } else {
          setApiQuestions(null);
          setQuestionsError('Savollar topilmadi. Iltimos, keyinroq urinib ko\'ring.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const detail = err?.data?.detail || err?.message || '';
          if (/cheating/i.test(detail)) {
            setCheated(true);
            setCheatMessage("Siz cheating qildingiz. Olimpiada yakunlandi.");
          } else {
            setQuestionsError(detail || "Savollarni yuklab bo'lmadi.");
          }
          setApiQuestions(null);
        }
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?._api, liveOlympiad?.backendId, isBeforeStart, isAfterEnd]);

  React.useEffect(() => {
    if (submitted || isBeforeStart || isAfterEnd || questionsLoading) return;
    // Agar server expires_at yuborgan bo'lsa, har sekundda undan hisoblaymiz
    // — bu lokal drift yoki tab sleep'ning vaqtni "ushlab turishini" oldini
    // oladi va server bilan har doim sinxron bo'ladi.
    const tick = () => {
      if (serverExpiresAt) {
        const expiresMs = new Date(serverExpiresAt).getTime();
        const adjustedNow = Date.now() - serverClockSkewMs;
        const remainingSec = Math.max(0, Math.floor((expiresMs - adjustedNow) / 1000));
        setTimeLeft(prev => {
          if (remainingSec <= 0 && prev > 0) {
            clearInterval(t);
            handleSubmit();
            return 0;
          }
          return remainingSec;
        });
      } else {
        // Mock/dev rejim — eski lokal teskari sanash.
        setTimeLeft(prev => {
          if (prev <= 1) { clearInterval(t); handleSubmit(); return 0; }
          return prev - 1;
        });
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [submitted, isBeforeStart, isAfterEnd, questionsLoading, serverExpiresAt, serverClockSkewMs]);

  const reportCheating = React.useCallback((reason) => {
    if (cheatReportedRef.current || submitted || cheated || !user?._api || !liveOlympiad?.backendId) return;
    if (!cheatGuardActiveRef.current) return;
    cheatReportedRef.current = true;
    setCheated(true);
    setSubmitted(true);
    setCheatMessage("Siz cheating qildingiz. Olimpiada yakunlandi.");
    try {
      globalThis.OlympyApi.reportCheating(
        { olympiad: liveOlympiad.backendId, reason },
        globalThis.OlympyApi.getToken(),
      ).catch(() => {});
    } catch {}
  }, [submitted, cheated, user?._api, liveOlympiad?.backendId]);

  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || !apiQuestions || questionsLoading || submitted || cheated) {
      return undefined;
    }
    // Tab uzoq vaqt yashirin qolgandagina cheating deb belgilaymiz: brauzer
    // notification, alert va modal o'zaro ta'sirida visibilitychange qisqa
    // muddat triggerlanishi mumkin. Real cheating har doim 2 soniyadan ortiq
    // tashqari oynaga o'tadi.
    let hiddenTimer = null;
    const VISIBILITY_GRACE_MS = 2500;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            reportCheating('tab_or_app_left');
          }
        }, VISIBILITY_GRACE_MS);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [user?._api, liveOlympiad?.backendId, apiQuestions, questionsLoading, submitted, cheated, reportCheating]);

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const answered = Object.keys(answers).length;
  const progress = TOTAL ? (answered / TOTAL) * 100 : 0;
  const isUrgent = timeLeft < 120;

  const handleAnswer = (optIdx) => setAnswers(prev => ({ ...prev, [current]: optIdx }));
  const toggleMark = () => setMarked(prev => ({ ...prev, [current]: !prev[current] }));

  // Confirm modal ochilganda yoki yopilganda fokus o'zgaradi — bu paytda
  // cheating signalini hisoblamaymiz, aks holda foydalanuvchi yakunlash
  // tugmasini bossa avtomatik diskvalifikatsiya bo'lardi.
  React.useEffect(() => {
    if (confirmModal) {
      cheatGuardActiveRef.current = false;
      const reactivate = setTimeout(() => { cheatGuardActiveRef.current = true; }, 1500);
      return () => clearTimeout(reactivate);
    }
    cheatGuardActiveRef.current = true;
    return undefined;
  }, [confirmModal]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    setConfirmModal(false);
    setSubmitted(true);

    try {
      const formattedAnswers = {};
      Object.entries(answers).forEach(([idx, optIdx]) => {
        const q = TEST_QUESTIONS[parseInt(idx, 10)];
        if (q) formattedAnswers[q.id] = optIdx;
      });

      // Local score is kept only as a fallback if the API response omits fields.
      // API rejimida olingan apiQuestions'da correctAnswer maydoni yo'q
      // (backend uni server tomondan tekshiradi), shuning uchun ushbu local
      // hisob faqat mock rejimida ma'no kasb etadi. API rejimida fallback
      // sifatida null qoldirib, backend qaytarganni avtoritar deb qabul
      // qilamiz.
      const hasLocalCorrectness = TEST_QUESTIONS.every(
        q => q && (q.correctAnswer != null || q.correct != null),
      );
      const correct = hasLocalCorrectness
        ? TEST_QUESTIONS.filter((q, i) => answers[i] === (q.correctAnswer ?? q.correct)).length
        : null;
      const wrong = correct == null ? null : TOTAL - correct;
      const earnedScore = hasLocalCorrectness
        ? TEST_QUESTIONS.reduce((sum, q, i) => {
            return answers[i] === (q.correctAnswer ?? q.correct) ? sum + (q.score || 3) : sum;
          }, 0)
        : 0;
      const maxPossible = TEST_QUESTIONS.reduce((sum, q) => sum + (q.score || 3), 0);
      const localScore = hasLocalCorrectness && maxPossible
        ? Math.round((earnedScore / maxPossible) * 100)
        : null;
      const timeSpent = DURATION - timeLeft;

      // Compute rank within current attempts on this olympiad (mock only).
      // localScore null bo'lsa (API rejim, hasLocalCorrectness=false) rank
      // hisoblay olmaymiz — backend rank'iga tayanamiz va bu yerda null
      // qoldiramiz; aks holda barcha holatlarda rank=1 bo'lib chiqardi.
      let localRank = null;
      if (liveOlympiad && localScore != null) {
        const others = store.attempts.filter(a => a.olympiadId === liveOlympiad.id);
        localRank = others.filter(a => (a.score || 0) > localScore).length + 1;
      }

      const numericOlympiadId = liveOlympiad?.backendId
        ?? (typeof liveOlympiad?.id === 'number' ? liveOlympiad.id : null);

      // API rejimda — backend natijani avtoritar deb hisoblaymiz.
      if (user?._api) {
        try {
          if (numericOlympiadId == null) throw new Error('Missing olympiad id');
          const token = globalThis.OlympyApi?.getToken?.()
            ?? globalThis.OlympyApi?.loadAuth?.()?.token;
          const resp = await globalThis.OlympyApi.submitAttempt(
            { olympiad: numericOlympiadId, answers: formattedAnswers, time_spent: timeSpent },
            token,
          );
          onFinish({
            attemptId: resp?.id,
            correct: resp?.correct_count ?? (correct ?? 0),
            wrong: resp?.wrong_count ?? (wrong ?? 0),
            // API rejimida backend score'i avtoritar; localScore null bo'lsa,
            // 0 emas, balki backend qiymati ko'rsatiladi.
            score: resp?.score ?? (localScore ?? 0),
            total: resp?.total_questions ?? TOTAL,
            rank: resp?.rank ?? localRank,
            time: resp?.time_spent ?? timeSpent,
            maxScore: resp?.max_score ?? maxPossible,
            olympiad: liveOlympiad || olympiad,
            _api: true,
          });
        } catch (err) {
          console.warn('submitAttempt failed:', err?.message);
          const detail = err?.data?.detail || err?.message || '';
          if (/cheating/i.test(detail)) {
            setCheated(true);
            setCheatMessage("Siz cheating qildingiz. Olimpiada yakunlandi.");
            return;
          }
          setSubmitError("Javoblar yuborilmadi. Qayta urinib ko'ring.");
          setSubmitted(false);
        }
        return;
      }

      // Mock/dev rejim — local store'ga attempt yozamiz va lokal natijani
      // qaytaramiz. Real loginsiz ham testni yakunlash mumkin bo'ladi.
      try {
        const attemptRecord = OlympyStore.recordAttempt({
          userId: user?.id || 'guest',
          olympiadId: liveOlympiad?.id || olympiad?.id,
          answers: formattedAnswers,
          score: localScore ?? 0,
          correctCount: correct ?? 0,
          wrongCount: wrong ?? 0,
          totalQuestions: TOTAL,
          timeSpent,
          rank: localRank ?? 1,
        });
        onFinish({
          attemptId: attemptRecord?.id,
          correct: correct ?? 0,
          wrong: wrong ?? 0,
          score: localScore ?? 0,
          total: TOTAL,
          rank: localRank,
          time: timeSpent,
          maxScore: maxPossible,
          olympiad: liveOlympiad || olympiad,
          _api: false,
        });
      } catch (err) {
        console.warn('local recordAttempt failed:', err?.message);
        setSubmitError("Javoblarni yuborib bo'lmadi. Qayta urinib ko'ring.");
        setSubmitted(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isBeforeStart) {
    const startLabel = startDt ? startDt.toLocaleString('uz-UZ') : '—';
    return <PendingAccessCard title="Olimpiada hali boshlanmagan" status="pending"
      message={`Boshlanish vaqti: ${startLabel}`}
      onBack={() => onNavigate('student')} />;
  }
  if (isAfterEnd) {
    return <PendingAccessCard title="Olimpiada tugagan" status="rejected"
      message="Bu olimpiadaga qatnashish muddati o'tib ketdi."
      onBack={() => onNavigate('student')} />;
  }
  if (cheated) {
    return <PendingAccessCard title="Cheating aniqlandi" status="rejected"
      message={cheatMessage || "Siz cheating qildingiz. Olimpiada yakunlandi."}
      onBack={() => onNavigate('student')} />;
  }
  if (questionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#060818' }}>
        <div className="flex flex-col items-center gap-4 text-white/70">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-indigo-400 animate-spin" />
          <div className="text-sm font-semibold">Savollar yuklanmoqda...</div>
        </div>
      </div>
    );
  }
  // API rejimda haqiqiy savollar bo'lmasa, soxta FALLBACK savollar ko'rsatish
  // o'rniga aniq xatolik xabari beramiz — aks holda student haqiqiy bo'lmagan
  // testni topshirib qo'yardi va natija nol bo'lardi.
  if (user?._api && (!Array.isArray(apiQuestions) || apiQuestions.length === 0)) {
    return <PendingAccessCard
      title="Savollar yuklanmadi"
      status="rejected"
      message={questionsError || "Olimpiada savollari hozircha mavjud emas. Iltimos, keyinroq urinib ko'ring."}
      onBack={() => onNavigate('student')} />;
  }

  const q = TEST_QUESTIONS[current] || FALLBACK_QUESTIONS[0];
  // Derive a "type" for True/False rendering even though store questions don't carry one
  const isTrueFalse = (q.options || []).length === 2 && (q.options || []).every(o => /to'?g'?ri|no?to'?g'?ri/i.test(o));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060818' }}>
      {/* Header bar */}
      <div className="glass border-b border-white/5 px-4 md:px-8 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="gradient-bg w-7 h-7 rounded-lg flex items-center justify-center"><span className="text-white font-black text-xs">O</span></div>
          <div>
            <div className="text-sm font-bold text-white truncate max-w-48">{olympiad?.title || 'Matematika Olimpiadasi'}</div>
            <div className="text-xs text-white/40">
              {olympiad?.subject}{liveOlympiad?.testLevel ? ` · ${liveOlympiad.testLevel}` : ''}{liveOlympiad?.testType ? ` · ${testTypeLabel(liveOlympiad.testType)}` : ''}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-mono text-lg font-black transition-all ${isUrgent ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'glass text-white'}`}>
          <Icon name="clock" size={16} className={isUrgent ? 'text-rose-400' : 'text-white/50'} />
          {formatTime(timeLeft)}
        </div>

        <button onClick={() => setConfirmModal(true)} disabled={submitting}
          className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
          Yakunlash
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/5">
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#6366f1,#a855f7,#22d3ee)' }} />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question navigation sidebar */}
        <div className="hidden md:flex flex-col glass border-r border-white/5 w-52 p-4 overflow-y-auto">
          <div className="text-xs text-white/40 font-medium mb-3">Savollar ({answered}/{TOTAL})</div>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {TEST_QUESTIONS.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`question-nav-btn ${i === current ? 'current' : marked[i] ? 'marked' : answers[i] !== undefined ? 'answered' : ''}`}>
                {i+1}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 mt-auto">
            {[
              { color: 'bg-indigo-500', label: 'Javob berildi' },
              { color: 'bg-amber-500', label: 'Belgilangan' },
              { color: 'bg-white/20', label: 'Javobsiz' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-white/40">
                <div className={`w-3 h-3 rounded ${color}`} /> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="max-w-2xl mx-auto w-full px-6 py-8 flex-1">
            {/* Question counter */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm text-white/40 font-medium">
                Savol <span className="text-white font-bold">{current+1}</span> / {TOTAL}
              </div>
              <button onClick={toggleMark}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all ${marked[current] ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'glass text-white/40 hover:text-white/60'}`}>
                <Icon name="star" size={13} /> {marked[current] ? 'Belgilangan' : 'Belgilash'}
              </button>
            </div>

            {submitError && (
              <div className="mb-6 flex items-center gap-2 bg-rose-500/10 text-rose-300 rounded-xl px-4 py-3 text-sm border border-rose-500/20">
                <Icon name="info" size={15} /> {submitError}
              </div>
            )}

            {/* Question text */}
            <div className="glass-strong rounded-2xl p-6 mb-6">
              <p className="text-white text-lg leading-relaxed font-medium">{q.text}</p>
            </div>

            {/* Answer options */}
            <div className="space-y-3 mb-8">
              {q.options.map((opt, i) => {
                const selected = answers[current] === i;
                return (
                  <button key={i} onClick={() => handleAnswer(i)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all ${selected ? 'border-indigo-500 bg-indigo-500/15 border glow-blue' : 'glass hover:bg-white/7 border border-transparent hover:border-white/10'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 transition-all ${selected ? 'gradient-bg text-white' : 'glass text-white/50'}`}>
                      {isTrueFalse ? (i === 0 ? '✓' : '✗') : String.fromCharCode(65+i)}
                    </div>
                    <span className={`font-medium ${selected ? 'text-white' : 'text-white/70'}`}>{opt}</span>
                    {selected && <Icon name="check" size={16} className="ml-auto text-indigo-400" />}
                  </button>
                );
              })}
            </div>

            {/* Nav buttons */}
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrent(Math.max(0, current-1))} disabled={current === 0}
                className="btn-ghost px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-30 flex items-center gap-2">
                <Icon name="arrowLeft" size={15} /> Oldingi
              </button>
              <div className="text-xs text-white/30">{answered} ta javob berildi</div>
              {current < TOTAL-1 ? (
                <button onClick={() => setCurrent(current+1)} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
                  Keyingi <Icon name="chevronRight" size={15} />
                </button>
              ) : (
                <button onClick={() => setConfirmModal(true)} disabled={submitting}
                  className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
                  Testni yakunlash
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm submit modal */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Testni yakunlash">
        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="glass rounded-xl p-3"><div className="text-xl font-black text-white">{answered}</div><div className="text-xs text-white/40">Javob berildi</div></div>
            <div className="glass rounded-xl p-3"><div className="text-xl font-black text-amber-400">{Object.keys(marked).filter(k=>marked[k]).length}</div><div className="text-xs text-white/40">Belgilangan</div></div>
            <div className="glass rounded-xl p-3"><div className="text-xl font-black text-white/30">{TOTAL - answered}</div><div className="text-xs text-white/40">Javobsiz</div></div>
          </div>
          {TOTAL - answered > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 text-amber-400 rounded-xl px-4 py-3 text-sm border border-amber-500/20">
              <Icon name="info" size={15} /> {TOTAL - answered} ta savol javobsiz qoldi
            </div>
          )}
          <p className="text-white/60 text-sm">Testni yakunlamoqchimisiz? Yuborilgandan so'ng o'zgartirib bo'lmaydi.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirmModal(false)} className="btn-ghost flex-1 py-3 rounded-xl">Davom etish</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="btn-primary flex-1 py-3 rounded-xl font-bold disabled:opacity-50">
            {submitting ? 'Yuborilmoqda...' : 'Yuborish ✓'}
          </button>
        </div>
      </Modal>
    </div>
  );
};

Object.assign(window, { OlympiadTestPage });
