// pages/LiveQuizPlay.jsx — "Kahoot uslubidagi" jonli viktorina: O'QUVCHI
// qo'shilish + o'ynash ko'rinishi. Mobil-birinchi: kod kiritish → kutish
// lobbisi → savolda 4 ta katta rangli shakl-tugma (2x2) → javob → fikr-mulohaza
// (to'g'ri/xato, olingan ball, umumiy ball) → yakuniy o'rin. O'zbek tilida.
//
// Savol turi server'dan `question` xabaridagi `questionType` bilan keladi va
// javob berish ko'rinishini belgilaydi:
//   mcq (4 variant) / true_false (2 variant) → shakl-tugmalar, javob = indeks
//   type_answer                             → matn maydoni, javob = matn
//   slider                                  → range slayder, javob = raqam

const LiveQuizPlayPage = ({ user, onNavigate }) => {
  const { useState, useEffect, useRef, useCallback } = React;

  const ANSWER_STYLES = [
    { bg: '#e0341f', shape: 'triangle' },
    { bg: '#1368ce', shape: 'diamond' },
    { bg: '#d89e00', shape: 'circle' },
    { bg: '#26890c', shape: 'square' },
  ];

  const defaultName = (user?.fullName || user?.full_name || user?.name || '').trim();

  const [step, setStep] = useState('join'); // join|lobby|question|answered|result|final
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState(defaultName);
  const [title, setTitle] = useState('');

  const [question, setQuestion] = useState(null);
  const [remaining, setRemaining] = useState(0);
  // Yuborilgan javob: variantli turlarda indeks (int), type_answer'da matn,
  // slayderda raqam. null → hali javob berilmagan.
  const [myChoice, setMyChoice] = useState(null);
  // type_answer / slider uchun javob qoralamasi (tasdiqlanmaguncha yuborilmaydi).
  const [textAnswer, setTextAnswer] = useState('');
  const [sliderValue, setSliderValue] = useState(0);
  const [result, setResult] = useState(null); // {correct, pointsThisRound, totalScore, rank, correctIndex, answered}
  const [myTotal, setMyTotal] = useState(0);
  const [myRank, setMyRank] = useState(null);
  const [finalBoard, setFinalBoard] = useState([]);

  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const myIdRef = useRef(null);

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

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'joined':
        setTitle(msg.title || '');
        myIdRef.current = msg.userId ?? null;
        if (!msg.started) setStep('lobby');
        break;
      case 'quiz_start':
        setStep('lobby');
        break;
      case 'question': {
        setQuestion(msg);
        setMyChoice(null);
        setResult(null);
        setTextAnswer('');
        if (msg.questionType === 'slider') {
          // Slayder oraliqning o'rtasidan boshlanadi (Kahoot'dagidek) va
          // qadam (step) to'riga moslanadi.
          const min = Number(msg.sliderMin ?? 0);
          const max = Number(msg.sliderMax ?? 0);
          const step = Math.max(1, Number(msg.sliderStep ?? 1));
          const mid = min + Math.round(((min + max) / 2 - min) / step) * step;
          setSliderValue(Math.min(max, Math.max(min, mid)));
        }
        startCountdown(msg.timeLimitSeconds || 20);
        setStep('question');
        break;
      }
      case 'answer_received':
        setStep('answered');
        break;
      case 'question_result':
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setResult(msg);
        setMyTotal(msg.totalScore || 0);
        setMyRank(msg.rank ?? null);
        setStep('result');
        break;
      case 'final':
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setFinalBoard(msg.leaderboard || []);
        setStep('final');
        break;
      default:
        break;
    }
  }, [startCountdown]);

  const join = async () => {
    setError('');
    const code = codeInput.trim().toUpperCase();
    if (!code) { setError('Xona kodini kiriting'); return; }
    setJoining(true);
    try {
      const room = await OlympyApi.getQuizRoom(code);
      if (!room.exists) { setError('Bunday xona topilmadi. Kodni tekshiring.'); setJoining(false); return; }
      if (room.finished) { setError('Bu viktorina allaqachon tugagan.'); setJoining(false); return; }
      const url = await OlympyApi.quizWsUrl({ roomCode: code, role: 'student', name: nameInput.trim() });
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (evt) => { try { handleMessage(JSON.parse(evt.data)); } catch {} };
      ws.onerror = () => { setError("Ulanib bo'lmadi. Qaytadan urinib ko'ring."); setJoining(false); };
      ws.onclose = (e) => {
        // Handshake rad etilsa (masalan token yaroqsiz) ulanish darhol yopiladi.
        if (step === 'join') { setJoining(false); if (!e.wasClean) setError("Ulanish rad etildi. Tizimga qayta kiring."); }
      };
    } catch (e) {
      setError(OlympyApi.toUserMessage?.(e) || "Ulanib bo'lmadi");
      setJoining(false);
    }
  };

  // `value` — savol turiga qarab: variant indeksi (int), matn (string) yoki
  // slayder raqami (number). Server turni o'zi biladi va shunga qarab baholaydi.
  const answer = (value) => {
    if (myChoice !== null || !question) return;
    setMyChoice(value);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'answer', index: question.index, answer: value }));
    }
    setStep('answered');
  };

  const exit = () => { cleanupWs(); onNavigate?.('student'); };

  // ─── Renderlar ─────────────────────────────────────────────────────────────
  if (step === 'join') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-white" style={{ background: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0b14 55%)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">⚡</div>
            <h1 className="text-3xl font-black">Jonli viktorina</h1>
            <p className="text-white/50 text-sm mt-1">Ustoz bergan kodni kiriting</p>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="XONA KODI"
              maxLength={8}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[0.3em] text-white outline-none focus:border-indigo-500/60 uppercase placeholder:tracking-normal placeholder:text-base placeholder:text-white/30"
            />
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Ismingiz (taxallus)"
              maxLength={30}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-sm text-white outline-none focus:border-indigo-500/50"
            />
            {error && <div className="text-red-300 text-sm text-center">{error}</div>}
            <button onClick={join} disabled={joining}
              className="btn-primary w-full py-3.5 rounded-xl text-base font-black disabled:opacity-50">
              {joining ? 'Ulanmoqda...' : "Qo'shilish"}
            </button>
          </div>
          <button onClick={() => onNavigate?.('student')} className="w-full mt-4 text-xs text-white/40 hover:text-white/70">
            Bekor qilish
          </button>
        </div>
      </div>
    );
  }

  if (step === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0b14 55%)' }}>
        <div className="w-16 h-16 rounded-full border-4 border-white/15 border-t-indigo-400 animate-spin mb-6" />
        <h2 className="text-2xl font-black mb-1">Kutilmoqda...</h2>
        <p className="text-white/50 text-sm">{title || 'Viktorina'} boshlanishini kuting</p>
        <div className="mt-6 px-4 py-2 rounded-full bg-white/10 text-sm font-semibold">{nameInput || 'Siz'}</div>
      </div>
    );
  }

  if (step === 'question' && question) {
    const qType = question.questionType || 'mcq';
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0b0b14' }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white/50">Savol {question.index + 1}/{question.totalQuestions}</span>
          <span className="w-11 h-11 rounded-full flex items-center justify-center font-black bg-white/10 border border-white/15">{remaining}</span>
        </div>
        <div className="px-5 py-4 text-center">
          <h2 className="text-xl sm:text-2xl font-black leading-tight break-words">{question.text}</h2>
        </div>
        {qType === 'type_answer' ? (
          // Matnli javob: o'quvchi yozadi va "Yuborish" bilan tasdiqlaydi.
          <div className="flex-1 flex flex-col justify-center gap-3 p-4">
            <input
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && textAnswer.trim()) answer(textAnswer.trim()); }}
              placeholder="Javobingizni yozing"
              maxLength={120}
              autoFocus
              className="w-full bg-white/5 border border-white/15 rounded-2xl px-4 py-4 text-center text-lg font-bold text-white outline-none focus:border-indigo-500/60"
            />
            <button onClick={() => answer(textAnswer.trim())} disabled={!textAnswer.trim()}
              className="btn-primary w-full py-4 rounded-2xl text-base font-black disabled:opacity-40">
              Yuborish
            </button>
          </div>
        ) : qType === 'slider' ? (
          // Slayder: surish javob emas — "Tasdiqlash" bosilganda yuboriladi
          // (Kahoot'dagi bilan bir xil xatti-harakat).
          <div className="flex-1 flex flex-col justify-center gap-4 p-5">
            <div className="text-center text-5xl font-black text-indigo-300">{sliderValue}</div>
            <input type="range"
              min={question.sliderMin} max={question.sliderMax} step={question.sliderStep || 1}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full accent-indigo-500" />
            <div className="flex justify-between text-xs font-semibold text-white/40">
              <span>{question.sliderMin}</span>
              <span>{question.sliderMax}</span>
            </div>
            <button onClick={() => answer(sliderValue)}
              className="btn-primary w-full py-4 rounded-2xl text-base font-black">
              Tasdiqlash
            </button>
          </div>
        ) : (
          // Variantli turlar: 4 variant → 2x2 to'r, 2 variant (To'g'ri/Noto'g'ri)
          // → ustma-ust ikkita katta tugma.
          <div className={`flex-1 grid gap-2.5 p-3 ${question.options.length === 2 ? 'grid-cols-1 grid-rows-2' : 'grid-cols-2 grid-rows-2'}`}>
            {question.options.map((opt, i) => (
              <button key={i} onClick={() => answer(i)}
                className="rounded-2xl flex flex-col items-center justify-center gap-2 p-3 text-white font-bold text-base sm:text-lg active:scale-[0.97] transition-transform"
                style={{ background: ANSWER_STYLES[i].bg }}>
                <QuizShape shape={ANSWER_STYLES[i].shape} size={34} />
                <span className="break-words text-center leading-tight">{opt}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'answered') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: '#0b0b14' }}>
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-2xl font-black mb-1">Javob qabul qilindi</h2>
        <p className="text-white/50 text-sm">Boshqalarni kuting...</p>
        {/* Yuborilgan javob: variantli turlarda rangli shakl-chip, matn/slayder
            turlarida esa oddiy chip (ANSWER_STYLES indeksi mos kelmaydi). */}
        {myChoice !== null && question && (
          (question.questionType === 'type_answer' || question.questionType === 'slider') ? (
            <div className="mt-6 px-5 py-3 rounded-2xl glass font-bold break-words max-w-[80vw] text-center">
              {String(myChoice)}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-3 px-5 py-3 rounded-2xl text-white font-bold" style={{ background: ANSWER_STYLES[myChoice].bg }}>
              <QuizShape shape={ANSWER_STYLES[myChoice].shape} size={22} />
              <span>{question.options[myChoice]}</span>
            </div>
          )
        )}
      </div>
    );
  }

  if (step === 'result' && result) {
    const correct = result.correct;
    // Matnli javob va slayderda o'quvchi to'g'ri javobni o'zi taxmin qila
    // olmaydi — xato bo'lsa ko'rsatamiz (variantli turlarda to'g'ri javob
    // avvalgidek faqat ustozning katta ekranida chiqadi).
    const missedAnswer = correct ? null : (
      question?.questionType === 'type_answer' ? result.correctAnswer
        : question?.questionType === 'slider' ? result.correctValue
        : null
    );
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center"
        style={{ background: correct ? 'radial-gradient(circle at 50% 30%, #065f46 0%, #0b0b14 60%)' : 'radial-gradient(circle at 50% 30%, #7f1d1d 0%, #0b0b14 60%)' }}>
        <div className="text-7xl mb-3">{correct ? '🎉' : result.answered ? '😕' : '⏱️'}</div>
        <h2 className="text-3xl font-black mb-2">
          {correct ? "To'g'ri!" : result.answered ? "Noto'g'ri" : 'Ulgurmadingiz'}
        </h2>
        {correct && <div className="text-2xl font-black text-emerald-300 mb-3">+{result.pointsThisRound}</div>}
        {(missedAnswer !== null && missedAnswer !== undefined && missedAnswer !== '') && (
          <div className="text-sm text-white/60 mb-1">To'g'ri javob: <b className="text-white break-words">{String(missedAnswer)}</b></div>
        )}
        <div className="glass rounded-2xl px-6 py-4 mt-2 flex gap-8">
          <div>
            <div className="text-xs text-white/50">Umumiy ball</div>
            <div className="text-2xl font-black">{myTotal}</div>
          </div>
          <div>
            <div className="text-xs text-white/50">O'rin</div>
            <div className="text-2xl font-black">{myRank ?? '-'}</div>
          </div>
        </div>
        <p className="text-white/40 text-sm mt-6">Keyingi savolni kuting...</p>
      </div>
    );
  }

  if (step === 'final') {
    const myId = myIdRef.current;
    const me = finalBoard.find((r) => r.userId === myId);
    const rank = me?.rank ?? myRank;
    const score = me?.score ?? myTotal;
    const messages = {
      1: 'Siz 1-o\'rinni egalladingiz! 🏆 Zo\'r!',
      2: 'Siz 2-o\'rinni egalladingiz! 🥈 Ajoyib!',
      3: 'Siz 3-o\'rinni egalladingiz! 🥉 Zo\'r!',
    };
    const msg = messages[rank] || (rank ? `Siz ${rank}-o'rinni egalladingiz! 🎉` : 'Viktorina yakunlandi! 🎉');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: 'radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0b14 55%)' }}>
        <div className="text-6xl mb-4">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎊'}</div>
        <h1 className="text-2xl font-black mb-3 max-w-xs">{msg}</h1>
        <div className="glass rounded-2xl px-8 py-5 mb-8">
          <div className="text-xs text-white/50 mb-1">Sizning balingiz</div>
          <div className="text-4xl font-black text-indigo-300">{score}</div>
        </div>

        {finalBoard.length > 0 && (
          <div className="w-full max-w-sm space-y-2 mb-8 text-left">
            {finalBoard.slice(0, 5).map((row) => (
              <div key={row.userId} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${row.userId === myId ? 'bg-indigo-500/25 border border-indigo-500/40' : 'glass'}`}>
                <span className="w-7 text-center font-black text-white/70">{row.rank}</span>
                <span className="flex-1 font-semibold break-words">{row.name}</span>
                <span className="font-black text-indigo-300">{row.score}</span>
              </div>
            ))}
          </div>
        )}

        <button onClick={exit} className="btn-primary px-7 py-3 rounded-2xl text-base font-black">
          Bosh sahifa
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-white/40" style={{ background: '#0b0b14' }}>
      Yuklanmoqda...
    </div>
  );
};
