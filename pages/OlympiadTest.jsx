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

  const now = new Date();
  const startStr = liveOlympiad?.startDate && liveOlympiad?.startTime
    ? `${liveOlympiad.startDate}T${liveOlympiad.startTime}` : null;
  const startDt = startStr ? new Date(startStr) : null;
  const endDt = startDt ? new Date(startDt.getTime() + (liveOlympiad.duration || 60) * 60000) : null;

  if (startDt && now < startDt) {
    return <PendingAccessCard title="Olimpiada hali boshlanmagan" status="pending"
      message={`Boshlanish vaqti: ${liveOlympiad.startDate} ${liveOlympiad.startTime}`}
      onBack={() => onNavigate('student')} />;
  }
  if (endDt && now > endDt) {
    return <PendingAccessCard title="Olimpiada tugagan" status="rejected"
      message="Bu olimpiadaga qatnashish muddati o'tib ketdi."
      onBack={() => onNavigate('student')} />;
  }

  const assignedIds = liveOlympiad?.questionIds || [];
  const assignedQuestions = assignedIds
    .map(qid => store.questions.find(q => q.id === qid))
    .filter(Boolean);
  const TEST_QUESTIONS = assignedQuestions.length > 0 ? assignedQuestions : FALLBACK_QUESTIONS;

  const TOTAL = TEST_QUESTIONS.length;
  const DURATION = (liveOlympiad?.duration || olympiad?.duration || 30) * 60;

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState({});
  const [marked, setMarked] = React.useState({});
  const [timeLeft, setTimeLeft] = React.useState(DURATION);
  const [confirmModal, setConfirmModal] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (submitted) return;
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); handleSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [submitted]);

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const answered = Object.keys(answers).length;
  const progress = (answered / TOTAL) * 100;
  const isUrgent = timeLeft < 120;

  const handleAnswer = (optIdx) => setAnswers(prev => ({ ...prev, [current]: optIdx }));
  const toggleMark = () => setMarked(prev => ({ ...prev, [current]: !prev[current] }));

  const handleSubmit = () => {
    setConfirmModal(false);
    setSubmitted(true);

    const formattedAnswers = {};
    Object.entries(answers).forEach(([idx, optIdx]) => {
      const q = TEST_QUESTIONS[parseInt(idx, 10)];
      if (q) formattedAnswers[q.id] = optIdx;
    });

    // Consistent score calculation: count correct, derive score & percentage from same source
    const correct = TEST_QUESTIONS.filter((q, i) => answers[i] === (q.correctAnswer ?? q.correct)).length;
    const wrong = TOTAL - correct;
    const earnedScore = TEST_QUESTIONS.reduce((sum, q, i) => {
      return answers[i] === (q.correctAnswer ?? q.correct) ? sum + (q.score || 3) : sum;
    }, 0);
    const maxPossible = TEST_QUESTIONS.reduce((sum, q) => sum + (q.score || 3), 0);
    const score = maxPossible ? Math.round((earnedScore / maxPossible) * 100) : 0;
    const timeSpent = DURATION - timeLeft;

    // Compute rank within current attempts on this olympiad (live)
    let rank = 1;
    if (liveOlympiad) {
      const others = store.attempts.filter(a => a.olympiadId === liveOlympiad.id);
      rank = others.filter(a => (a.score || 0) > score).length + 1;
    }

    let attempt = null;
    if (user && liveOlympiad) {
      attempt = OlympyStore.recordAttempt({
        userId: user.id,
        olympiadId: liveOlympiad.id,
        answers: formattedAnswers,
        score,
        correctCount: correct,
        wrongCount: wrong,
        totalQuestions: TOTAL,
        timeSpent,
        rank,
      });
    }

    // If the olympiad is backend-backed (numeric id) and the user has a live
    // API session, also persist the attempt server-side. Failures are logged
    // but do not block the local result screen.
    const numericOlympiadId = liveOlympiad?.backendId
      ?? (typeof liveOlympiad?.id === 'number' ? liveOlympiad.id : null);
    if (numericOlympiadId != null && user?._api) {
      try {
        const auth = globalThis.OlympyApi?.loadAuth?.();
        if (auth?.token) {
          globalThis.OlympyApi.submitAttempt(
            { olympiad: numericOlympiadId, answers: formattedAnswers, time_spent: timeSpent },
            auth.token,
          ).catch(err => console.warn('submitAttempt failed:', err?.message));
        }
      } catch (err) { console.warn('submitAttempt error:', err); }
    }

    setTimeout(() => onFinish({
      attemptId: attempt?.id,
      correct, wrong, score, total: TOTAL, rank,
      time: timeSpent,
      olympiad: liveOlympiad || olympiad,
    }), 400);
  };

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
            <div className="text-xs text-white/40">{olympiad?.subject}</div>
          </div>
        </div>

        <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-mono text-lg font-black transition-all ${isUrgent ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'glass text-white'}`}>
          <Icon name="clock" size={16} className={isUrgent ? 'text-rose-400' : 'text-white/50'} />
          {formatTime(timeLeft)}
        </div>

        <button onClick={() => setConfirmModal(true)} className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
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
                <button onClick={() => setConfirmModal(true)} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">
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
          <button onClick={handleSubmit} className="btn-primary flex-1 py-3 rounded-xl font-bold">Yuborish ✓</button>
        </div>
      </Modal>
    </div>
  );
};

Object.assign(window, { OlympiadTestPage });
