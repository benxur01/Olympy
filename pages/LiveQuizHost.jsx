// pages/LiveQuizHost.jsx — "Kahoot uslubidagi" jonli sinf viktorinasi: USTOZ
// (host) katta ekran ko'rinishi. Ustoz savol to'plamini tanlaydi → xona
// yaratiladi (Java real-time xizmat) → o'quvchilar kod bilan qo'shiladi →
// ustoz oqimni boshqaradi (boshlash / keyingi / yakunlash). Savol, sanoq
// taymer, "javob berganlar" hisoblagichi, oraliq reyting va yakuniy podium
// katta ekranda ko'rsatiladi.

const LiveQuizHostPage = ({ user, onNavigate }) => {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  // Kahoot uslubidagi 4 ta rang/shakl: qizil uchburchak, ko'k romb, sariq
  // doira, yashil kvadrat. shared.jsx'dagi CSS shakllar bilan mos.
  const ANSWER_STYLES = [
    { bg: '#e0341f', shape: 'triangle', label: 'Uchburchak' },
    { bg: '#1368ce', shape: 'diamond', label: 'Romb' },
    { bg: '#d89e00', shape: 'circle', label: 'Doira' },
    { bg: '#26890c', shape: 'square', label: 'Kvadrat' },
  ];

  const teacherRole = user?.roles?.teacher;
  const centerId = teacherRole?.centerId || null;

  const [step, setStep] = useState('setup'); // setup|lobby|question|reveal|final
  const [error, setError] = useState('');

  // ─── Setup bosqichi ──────────────────────────────────────────────────────
  const [loadingBank, setLoadingBank] = useState(false);
  const [bank, setBank] = useState([]); // mos keladigan (4 variantli MCQ) savollar
  const [subject, setSubject] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [title, setTitle] = useState('Jonli viktorina');
  const [timeLimit, setTimeLimit] = useState(20);

  // ─── Jonli holat ─────────────────────────────────────────────────────────
  const [roomCode, setRoomCode] = useState('');
  const [participants, setParticipants] = useState([]);
  const [question, setQuestion] = useState(null); // {index, totalQuestions, text, options, timeLimitSeconds}
  const [answered, setAnswered] = useState({ answered: 0, total: 0 });
  const [remaining, setRemaining] = useState(0);
  const [reveal, setReveal] = useState(null); // {index, correctIndex, isLast, leaderboard}
  const [finalBoard, setFinalBoard] = useState([]);
  const [creating, setCreating] = useState(false);

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const prevRanksRef = useRef({}); // {userId: rank} — oldingi reytingdagi o'rin (▲/▼ uchun)

  // Savol bankini yuklaymiz (mavjud endpoint qayta ishlatiladi) va faqat
  // 4 variantli MCQ savollarni qoldiramiz — jonli viktorina 4 tugmali.
  useEffect(() => {
    if (!centerId) return;
    let alive = true;
    setLoadingBank(true);
    OlympyApi.getQuestions(centerId, OlympyApi.getToken())
      .then((rows) => {
        if (!alive) return;
        const list = Array.isArray(rows) ? rows : (rows?.results || []);
        const usable = list.filter((q) => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const type = q.question_type || q.questionType || 'mcq';
          return type === 'mcq' && opts.length === 4
            && typeof q.correct_answer === 'number'
            && q.correct_answer >= 0 && q.correct_answer <= 3;
        });
        setBank(usable);
      })
      .catch((e) => { if (alive) setError(OlympyApi.toUserMessage?.(e) || "Savollarni yuklab bo'lmadi"); })
      .finally(() => { if (alive) setLoadingBank(false); });
    return () => { alive = false; };
  }, [centerId]);

  const subjects = useMemo(() => {
    const s = new Set();
    bank.forEach((q) => { if (q.subject) s.add(q.subject); });
    return ['all', ...[...s].sort()];
  }, [bank]);

  const visibleQuestions = useMemo(
    () => (subject === 'all' ? bank : bank.filter((q) => q.subject === subject)),
    [bank, subject],
  );

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedQuestions = useMemo(
    () => bank.filter((q) => selectedIds.has(q.id)),
    [bank, selectedIds],
  );

  // ─── WebSocket boshqaruvi ──────────────────────────────────────────────────
  const cleanupWs = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (wsRef.current) {
      try { wsRef.current.onclose = null; wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanupWs(), [cleanupWs]);

  const startCountdown = useCallback((seconds) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRemaining(seconds);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const left = Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
      setRemaining(left);
      if (left <= 0 && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }, 250);
  }, []);

  const connectHost = useCallback((code) => {
    const url = OlympyApi.quizWsUrl({ roomCode: code, role: 'host' });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      switch (msg.type) {
        case 'host_state':
          setParticipants(msg.participants || []);
          if (!msg.started) setStep('lobby');
          break;
        case 'lobby':
          setParticipants(msg.participants || []);
          break;
        case 'quiz_start':
          setReveal(null);
          break;
        case 'question':
          setReveal(null);
          setQuestion(msg);
          setAnswered({ answered: 0, total: (msg.total || answered.total) });
          startCountdown(msg.timeLimitSeconds || 20);
          setStep('question');
          break;
        case 'answer_count':
          setAnswered({ answered: msg.answered || 0, total: msg.total || 0 });
          break;
        case 'reveal':
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setRemaining(0);
          setReveal(msg);
          setStep('reveal');
          break;
        case 'final':
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setFinalBoard(msg.leaderboard || []);
          setStep('final');
          break;
        default:
          break;
      }
    };
    ws.onclose = () => { /* xona tugagan yoki ulanish uzilgan — UI joriy holatda qoladi */ };
    ws.onerror = () => setError("Real-time xizmatga ulanib bo'lmadi. Java xizmat ishga tushganini tekshiring.");
  }, [answered.total, startCountdown]);

  const sendHost = (type) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type }));
    }
  };

  const createRoom = async () => {
    setError('');
    if (selectedQuestions.length === 0) { setError('Kamida bitta savol tanlang'); return; }
    setCreating(true);
    try {
      const payload = {
        title: title.trim() || 'Jonli viktorina',
        questions: selectedQuestions.map((q) => ({
          text: q.text,
          options: q.options.slice(0, 4),
          correctIndex: q.correct_answer,
          timeLimitSeconds: timeLimit,
        })),
      };
      const res = await OlympyApi.createQuizRoom(payload);
      setRoomCode(res.roomCode);
      setStep('lobby');
      connectHost(res.roomCode);
    } catch (e) {
      setError(OlympyApi.toUserMessage?.(e) || e?.message || "Xona yaratib bo'lmadi");
    } finally {
      setCreating(false);
    }
  };

  // Reyting o'zgarishini (▲/▼) hisoblaymiz — reveal kelganda oldingi o'rin bilan solishtiramiz.
  const rankedWithDelta = useMemo(() => {
    const board = reveal?.leaderboard || [];
    const prev = prevRanksRef.current;
    return board.map((row) => {
      const before = prev[row.userId];
      let delta = 0;
      if (typeof before === 'number') delta = before - row.rank; // + => yuqoriga ko'tarildi
      return { ...row, delta };
    });
  }, [reveal]);

  // reveal ko'rsatilgach, keyingi solishtirish uchun o'rinlarni saqlaymiz.
  useEffect(() => {
    if (reveal?.leaderboard) {
      const map = {};
      reveal.leaderboard.forEach((r) => { map[r.userId] = r.rank; });
      prevRanksRef.current = map;
    }
  }, [reveal]);

  const exit = () => { cleanupWs(); onNavigate?.(roleHomePageSafe(user)); };

  // ─── Renderlar ─────────────────────────────────────────────────────────────
  const Shell = ({ children }) => (
    <div className="min-h-screen text-white" style={{ background: '#0b0b14' }}>
      <div className="glass border-b border-white/5 px-4 sm:px-6 py-3 flex items-center gap-3">
        <BrandLogo size="sm" />
        <span className="text-sm font-bold text-white/80 hidden sm:inline">Jonli viktorina</span>
        {roomCode && step !== 'setup' && (
          <span className="ml-2 text-xs font-mono px-2 py-1 rounded-lg bg-white/10 text-white/70">
            Kod: <b className="tracking-widest">{roomCode}</b>
          </span>
        )}
        <button onClick={exit} className="ml-auto btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
          <Icon name="arrowLeft" size={13} /> Chiqish
        </button>
      </div>
      {error && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}
      {children}
    </div>
  );

  if (!centerId) {
    return (
      <Shell>
        <div className="max-w-md mx-auto mt-20 text-center px-6">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-black mb-2">Markaz topilmadi</h2>
          <p className="text-white/50 text-sm">Jonli viktorina ochish uchun tasdiqlangan ustoz (markaz) bo'lishingiz kerak.</p>
        </div>
      </Shell>
    );
  }

  if (step === 'setup') {
    return (
      <Shell>
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black">Jonli viktorina yaratish</h1>
            <p className="text-white/50 text-sm mt-1">Savol banki bo'yicha Kahoot uslubidagi jonli o'yin. Savol tanlang, xona kodini o'quvchilarga bering.</p>
          </div>

          <div className="glass rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-white/60 block mb-1.5">Nomi</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/60 block mb-1.5">Har bir savol uchun vaqt (soniya)</label>
                <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50">
                  {[10, 15, 20, 30, 45, 60].map((s) => <option key={s} value={s} className="bg-[#0b0b14]">{s} soniya</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-white/60 block mb-1.5">Fan</label>
              <div className="flex flex-wrap gap-2">
                {subjects.map((s) => (
                  <button key={s} onClick={() => setSubject(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${subject === s ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                    {s === 'all' ? 'Barchasi' : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">Tanlangan: <b className="text-white">{selectedIds.size}</b> savol</span>
              {visibleQuestions.length > 0 && (
                <button
                  onClick={() => {
                    const allShown = visibleQuestions.every((q) => selectedIds.has(q.id));
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      visibleQuestions.forEach((q) => { if (allShown) next.delete(q.id); else next.add(q.id); });
                      return next;
                    });
                  }}
                  className="text-xs text-indigo-400 font-semibold">
                  {visibleQuestions.every((q) => selectedIds.has(q.id)) ? 'Belgini olib tashlash' : "Hammasini tanlash"}
                </button>
              )}
            </div>

            <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
              {loadingBank && <div className="text-sm text-white/40 py-6 text-center">Savollar yuklanmoqda...</div>}
              {!loadingBank && visibleQuestions.length === 0 && (
                <div className="text-sm text-white/40 py-6 text-center">4 variantli test savollari topilmadi. Avval savol banki yarating.</div>
              )}
              {visibleQuestions.map((q) => {
                const on = selectedIds.has(q.id);
                return (
                  <button key={q.id} onClick={() => toggleSelect(q.id)}
                    className={`w-full text-left flex items-start gap-3 rounded-xl p-3 border transition-all ${on ? 'bg-indigo-500/15 border-indigo-500/40' : 'bg-white/5 border-white/5 hover:bg-white/[0.07]'}`}>
                    <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-500 text-white' : 'bg-white/10 text-transparent'}`}>
                      <Icon name="check" size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-white break-words">{q.text}</span>
                      <span className="block text-xs text-white/40 mt-0.5">{q.subject || 'Fan belgilanmagan'} · {q.options?.length || 0} variant</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={createRoom} disabled={creating || selectedIds.size === 0}
              className="btn-primary px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              <Icon name="play" size={15} /> {creating ? 'Yaratilmoqda...' : 'Xona yaratish'}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === 'lobby') {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto p-4 sm:p-8 text-center">
          <p className="text-white/50 text-sm mb-2">O'quvchilar quyidagi kod bilan qo'shilishadi</p>
          <div className="inline-block px-8 py-5 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 mb-2">
            <div className="text-5xl sm:text-7xl font-black tracking-[0.2em] text-white">{roomCode}</div>
          </div>
          <p className="text-white/40 text-xs mb-8">prolymp.uz → Jonli viktorina → kodni kiriting</p>

          <div className="glass rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-center gap-2 mb-4 text-white/70">
              <Icon name="users" size={18} />
              <span className="font-bold">{participants.length} o'quvchi qo'shildi</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2 min-h-[40px]">
              {participants.length === 0 && <span className="text-sm text-white/30">Kutilmoqda...</span>}
              {participants.map((name, i) => (
                <span key={i} className="px-3 py-1.5 rounded-full bg-white/10 text-sm font-semibold animate-in">{name}</span>
              ))}
            </div>
          </div>

          <button onClick={() => sendHost('start')} disabled={participants.length === 0}
            className="btn-primary px-8 py-3.5 rounded-2xl text-base font-black flex items-center gap-2 mx-auto disabled:opacity-40">
            <Icon name="play" size={18} /> Boshlash
          </button>
          {participants.length === 0 && <p className="text-white/30 text-xs mt-3">Kamida bitta o'quvchi qo'shilishi kerak</p>}
        </div>
      </Shell>
    );
  }

  if (step === 'question' && question) {
    return (
      <Shell>
        <div className="max-w-5xl mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-white/50">Savol {question.index + 1} / {question.totalQuestions}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm text-white/70"><Icon name="users" size={15} /> {answered.answered}/{answered.total} javob berdi</span>
              <span className="w-14 h-14 rounded-full flex items-center justify-center font-black text-xl bg-white/10 border border-white/15">{remaining}</span>
            </div>
          </div>

          <div className="glass rounded-3xl p-6 sm:p-12 mb-5 min-h-[28vh] flex items-center justify-center text-center">
            <h2 className="text-2xl sm:text-4xl font-black leading-tight break-words">{question.text}</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {question.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl p-4 sm:p-5 text-white font-bold text-lg" style={{ background: ANSWER_STYLES[i].bg }}>
                <QuizShape shape={ANSWER_STYLES[i].shape} />
                <span className="break-words">{opt}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-6">
            <button onClick={() => sendHost('next')} className="btn-ghost px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
              <Icon name="chevronRight" size={15} /> Natijalarni ko'rsatish
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === 'reveal' && reveal) {
    return (
      <Shell>
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
          {question && (
            <div className="glass rounded-2xl p-4 mb-4">
              <div className="text-xs text-white/40 mb-2">To'g'ri javob</div>
              <div className="flex items-center gap-3 rounded-xl p-3 text-white font-bold" style={{ background: ANSWER_STYLES[reveal.correctIndex]?.bg }}>
                <QuizShape shape={ANSWER_STYLES[reveal.correctIndex]?.shape} size={22} />
                <span>{question.options?.[reveal.correctIndex]}</span>
              </div>
            </div>
          )}

          <h3 className="text-lg font-black mb-3 flex items-center gap-2"><Icon name="trophy" size={18} /> Reyting</h3>
          <div className="space-y-2">
            {rankedWithDelta.map((row) => (
              <div key={row.userId} className="flex items-center gap-3 glass rounded-xl px-4 py-3">
                <span className="w-8 text-center font-black text-white/80">{row.rank}</span>
                <span className="flex-1 font-semibold break-words">{row.name}</span>
                {row.delta !== 0 && (
                  <span className={`text-xs font-bold ${row.delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.delta > 0 ? `▲${row.delta}` : `▼${Math.abs(row.delta)}`}
                  </span>
                )}
                <span className="font-black text-indigo-300">{row.score}</span>
              </div>
            ))}
            {rankedWithDelta.length === 0 && <div className="text-sm text-white/40">Hali natija yo'q</div>}
          </div>

          <div className="flex justify-center mt-6">
            <button onClick={() => sendHost('next')} className="btn-primary px-7 py-3 rounded-2xl text-base font-black flex items-center gap-2">
              {reveal.isLast ? <><Icon name="award" size={17} /> Yakuniy natijalar</> : <><Icon name="chevronRight" size={17} /> Keyingi savol</>}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === 'final') {
    const podium = finalBoard.slice(0, 3);
    const rest = finalBoard.slice(3);
    const podiumMeta = [
      { color: '#facc15', emoji: '🥇', h: 'h-32' },
      { color: '#cbd5e1', emoji: '🥈', h: 'h-24' },
      { color: '#f59e0b', emoji: '🥉', h: 'h-20' },
    ];
    // Podium tartibi: 2 - 1 - 3 (o'rtada birinchi).
    const order = [1, 0, 2];
    return (
      <Shell>
        <div className="max-w-3xl mx-auto p-4 sm:p-6 text-center">
          <h1 className="text-3xl font-black mb-1">🎉 Yakuniy natijalar</h1>
          <p className="text-white/50 text-sm mb-8">{title}</p>

          <div className="flex items-end justify-center gap-3 sm:gap-4 mb-8">
            {order.map((idx) => {
              const p = podium[idx];
              const meta = podiumMeta[idx];
              if (!p) return <div key={idx} className="w-24" />;
              return (
                <div key={idx} className="flex flex-col items-center">
                  <div className="text-3xl mb-1">{meta.emoji}</div>
                  <div className="font-bold text-sm mb-1 max-w-[90px] truncate">{p.name}</div>
                  <div className="text-xs text-white/60 mb-2">{p.score}</div>
                  <div className={`w-20 sm:w-24 ${meta.h} rounded-t-xl flex items-start justify-center pt-2 font-black text-black/70`} style={{ background: meta.color }}>
                    {p.rank}
                  </div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="space-y-2 max-w-md mx-auto text-left mb-8">
              {rest.map((row) => (
                <div key={row.userId} className="flex items-center gap-3 glass rounded-xl px-4 py-2.5">
                  <span className="w-7 text-center font-black text-white/70">{row.rank}</span>
                  <span className="flex-1 font-semibold break-words">{row.name}</span>
                  <span className="font-black text-indigo-300">{row.score}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={exit} className="btn-primary px-7 py-3 rounded-2xl text-base font-black mx-auto">
            Yakunlash
          </button>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="text-center text-white/40 mt-20">Yuklanmoqda...</div></Shell>;
};

// Kahoot uslubidagi javob shakli (CSS bilan chizilgan). Katta ekranda ham,
// o'quvchi tugmalarida ham ishlatiladi.
const QuizShape = ({ shape, size = 26 }) => {
  const s = size;
  if (shape === 'triangle') {
    return <span style={{ width: 0, height: 0, borderLeft: `${s / 2}px solid transparent`, borderRight: `${s / 2}px solid transparent`, borderBottom: `${s}px solid #fff`, display: 'inline-block', flexShrink: 0 }} />;
  }
  if (shape === 'diamond') {
    return <span style={{ width: s * 0.8, height: s * 0.8, background: '#fff', transform: 'rotate(45deg)', display: 'inline-block', flexShrink: 0 }} />;
  }
  if (shape === 'circle') {
    return <span style={{ width: s, height: s, background: '#fff', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />;
  }
  return <span style={{ width: s * 0.85, height: s * 0.85, background: '#fff', borderRadius: 4, display: 'inline-block', flexShrink: 0 }} />;
};

// onNavigate uchun xavfsiz rol-uy sahifasi (app.jsx'dagi roleHomePage global
// emas — bu yerda oddiy fallback beramiz).
const roleHomePageSafe = (user) => {
  const active = user?.activeRole;
  if (active && ['student', 'teacher', 'manager', 'owner', 'admin'].includes(active)) return active;
  return 'teacher';
};
