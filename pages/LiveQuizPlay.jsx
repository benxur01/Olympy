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

// Xona kodi — Kahoot'dagi "game PIN" kabi FAQAT RAQAM, 6 xona (server tomonda
// RoomService.CODE_MIN..CODE_MAX bilan bir xil). Raqamli bo'lgani uchun kirish
// maydoni telefonda to'liq QWERTY klaviaturasi o'rniga raqamli klaviaturani
// ochadi — kod terishdagi xatolarning asosiy manbasi shu edi.
const LIVE_QUIZ_CODE_LENGTH = 6;

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
  // Soket holati (OlympyApi.connectQuizSocket'dan): idle|connecting|open|
  // reconnecting|failed. Avval bunday holat umuman yo'q edi — ulanish uzilsa
  // o'quvchi buni bilmasdan kutish spinneriga tikilib o'tirardi.
  const [connState, setConnState] = useState('idle');

  const [codeInput, setCodeInput] = useState('');
  const [nameInput, setNameInput] = useState(defaultName);
  // Tanlangan avatar — oddiy satr (emoji). Boshlang'ich qiymat tasodifiy
  // tanlanadi, shunda hech kim avatarsiz qo'shilmaydi (Kahoot ham shunday
  // qiladi). Ro'yxatning o'zi LiveQuizHost.jsx'da — host ham shu emojini
  // ko'rsatadi.
  const [avatar, setAvatar] = useState(() => LIVE_QUIZ_AVATARS[Math.floor(Math.random() * LIVE_QUIZ_AVATARS.length)].emoji);
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
  // O'rin o'zgarishi (+ => yuqoriga ko'tarildi). Server faqat joriy o'rinni
  // yuboradi, shuning uchun oldingisini klientda eslab qolamiz.
  const [rankShift, setRankShift] = useState(0);
  const [finalBoard, setFinalBoard] = useState([]);

  const wsRef = useRef(null); // OlympyApi.connectQuizSocket handle'i
  const timerRef = useRef(null);
  const myIdRef = useRef(null);
  const prevRankRef = useRef(null); // oldingi raunddagi o'rin (▲/▼ uchun)
  // Qo'shilish urinishi ketayotganini `joining` state'i emas, ref bilan
  // qo'riqlaymiz: ikkala input ham Enter'ga bog'langan va state yangilanishi
  // asinxron — bir necha tez bosish bitta renderda `joining === false` ko'rib,
  // bir vaqtning o'zida bir nechta soket ochib yuborardi.
  const joiningRef = useRef(false);
  // Qayta ulanish tugmasi uchun xona kodi (`codeInput` foydalanuvchi
  // tahrirlaydigan maydon, ulangandan keyin unga tayanib bo'lmaydi).
  const roomCodeRef = useRef('');
  // Har bir `openSocket` chaqiruvi uchun raqam. Ulanish butunlay barbod
  // bo'lgandan keyin sababini aniqlash uchun xona holatini qayta so'raymiz —
  // o'sha so'rov javob bergunicha foydalanuvchi "Qayta ulanish"ni bosgan
  // bo'lishi mumkin, shunda eskirgan javob yangi urinishning xabarini
  // bosib ketmasligi kerak.
  const socketGenRef = useRef(0);

  const cleanupWs = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
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
        // Faqat birinchi qo'shilishda kutish lobbisiga o'tamiz. Ilgari sharti
        // `!msg.started` edi va ikkita holatda o'quvchi kirish ekranida qolib
        // ketardi: (a) allaqachon boshlangan xonaga qo'shilganda, (b) uzilib
        // qayta ulanganda — server javoblarni qabul qilib turgan bo'lsa ham
        // ekranda hech nima o'zgarmasdi. Qayta ulanishda esa o'quvchini joriy
        // ekranidan sug'urib olmaymiz: server kerak bo'lsa darhol `question`
        // yuboradi.
        setStep((s) => (s === 'join' ? 'lobby' : s));
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
      case 'question_result': {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setResult(msg);
        setMyTotal(msg.totalScore || 0);
        const nextRank = msg.rank ?? null;
        setRankShift(typeof prevRankRef.current === 'number' && typeof nextRank === 'number'
          ? prevRankRef.current - nextRank
          : 0);
        prevRankRef.current = nextRank;
        setMyRank(nextRank);
        setStep('result');
        break;
      }
      case 'final':
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setFinalBoard(msg.leaderboard || []);
        setStep('final');
        break;
      default:
        break;
    }
  }, [startCountdown]);

  // Soketni ochadi (yoki qaytadan ochadi). Uzilish, backoff bilan qayta
  // urinish va heartbeat OlympyApi.connectQuizSocket ichida — bu yerda faqat
  // holatni ekranga chiqaramiz.
  const openSocket = useCallback((code) => {
    roomCodeRef.current = code;
    socketGenRef.current += 1;
    const gen = socketGenRef.current;
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setConnState('connecting');
    wsRef.current = OlympyApi.connectQuizSocket({
      roomCode: code,
      role: 'student',
      name: nameInput.trim(),
      avatar,
      onMessage: handleMessage,
      onStatus: (state, reason) => {
        setConnState(state);
        if (state === 'open') { joiningRef.current = false; setJoining(false); setError(''); }
        if (state === 'failed') {
          // Urinishlar tugadi. Ilgari bu holat umuman kuzatilmasdi va
          // o'quvchi cheksiz "Ulanmoqda..." yoki qotib qolgan spinnerda
          // qolardi; endi aniq xabar + qayta urinish tugmasi beramiz.
          joiningRef.current = false;
          setJoining(false);
          if (reason === 'auth') {
            setError('Sessiya muddati tugagan. Tizimga qayta kiring.');
            return;
          }
          setError("Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.");
          // Handshake rad etilganda brauzer sababni bermaydi, shuning uchun
          // eng ko'p uchraydigan sabab — xona endi mavjud emasligi (ustoz
          // yakunlagan, xizmat qayta ishga tushgan) — o'quvchiga internetini
          // tekshirish taklifi bo'lib ko'rinardi. Xona holatini qayta so'rab,
          // xabarni aniqlashtiramiz.
          OlympyApi.getQuizRoom(code).then((room) => {
            if (socketGenRef.current !== gen) return; // yangi urinish boshlangan
            if (room.unavailable) return;             // xizmat yiqilgan — xabar to'g'ri
            if (room.finished) setError('Bu viktorina allaqachon tugagan.');
            else if (!room.exists) setError("Xona yopilgan. Ustozdan yangi kod so'rang.");
          }).catch(() => {});
        }
      },
    });
  }, [handleMessage, nameInput, avatar]);

  const join = async () => {
    // Takroriy bosishlarni to'xtatamiz — yuqoridagi izohga qarang (joiningRef).
    if (joiningRef.current) return;
    setError('');
    // Faqat raqamlarni qoldiramiz. Avval `trim().toUpperCase()` edi va
    // "Kod: 482913" ko'rinishida nusxa ko'chirilgan (yoki orasida bo'sh joy
    // qolgan) kod serverga o'sha ko'yi ketib, o'quvchiga "Bunday xona
    // topilmadi. Kodni tekshiring." deb ko'rsatilardi — kod esa to'g'ri edi.
    const code = codeInput.replace(/\D/g, '');
    if (!code) { setError('Xona kodini kiriting'); return; }
    if (code.length !== LIVE_QUIZ_CODE_LENGTH) {
      setError(`Xona kodi ${LIVE_QUIZ_CODE_LENGTH} ta raqamdan iborat`);
      return;
    }
    joiningRef.current = true;
    setJoining(true);
    try {
      const room = await OlympyApi.getQuizRoom(code);
      // Xizmatning o'zi javob bermayapti — bu "kod noto'g'ri" degani EMAS.
      // Xona ustozda ochiq turibdi, shunchaki qayta urinish kerak.
      if (room.unavailable) {
        setError("Jonli viktorina xizmati javob bermayapti. Bir ozdan so'ng qayta urinib ko'ring.");
        joiningRef.current = false; setJoining(false); return;
      }
      if (!room.exists) { setError('Bunday xona topilmadi. Kodni tekshiring.'); joiningRef.current = false; setJoining(false); return; }
      if (room.finished) { setError('Bu viktorina allaqachon tugagan.'); joiningRef.current = false; setJoining(false); return; }
      // Bundan keyingi barcha xatolar (token, handshake, tarmoq) soket
      // ichidagi qayta urinishlar bilan hal bo'ladi — `onStatus` xabar beradi.
      openSocket(code);
    } catch (e) {
      // Bu yerga faqat xona holatini tekshirish kutilmaganda yiqilsa tushamiz.
      setError(e?.status
        ? (OlympyApi.toUserMessage?.(e) || "Ulanib bo'lmadi")
        : "Serverga ulanib bo'lmadi. Bir ozdan so'ng qayta urinib ko'ring.");
      joiningRef.current = false;
      setJoining(false);
    }
  };

  // "Qayta ulanish" tugmasi (ulanish butunlay uzilganda). Xona kodi saqlangan,
  // server esa o'quvchini userId bo'yicha tanib, ballini qaytaradi.
  const reconnect = () => {
    if (!roomCodeRef.current) return;
    setError('');
    openSocket(roomCodeRef.current);
  };

  // `value` — savol turiga qarab: variant indeksi (int), matn (string) yoki
  // slayder raqami (number). Server turni o'zi biladi va shunga qarab baholaydi.
  const answer = (value) => {
    if (myChoice !== null || !question) return;
    // Ilgari javob soket yopiq bo'lsa jimgina yo'qolar, ekranda esa "Javob
    // qabul qilindi" chiqardi — o'quvchi ballsiz qolganini bilmasdi.
    if (!wsRef.current?.send({ type: 'answer', index: question.index, answer: value })) {
      setError("Ulanish tiklanmoqda — javob yuborilmadi. Bir soniyadan so'ng qayta urinib ko'ring.");
      return;
    }
    setError('');
    setMyChoice(value);
    setStep('answered');
  };

  const exit = () => { cleanupWs(); onNavigate?.('student'); };

  // ─── Renderlar ─────────────────────────────────────────────────────────────
  // Ulanish holati banneri. Kirish ekranidan keyingi barcha ekranlarda
  // ko'rsatiladi: uzilish endi jimgina o'tmaydi, o'quvchi nima bo'layotganini
  // va qachon qo'lda aralashish kerakligini ko'radi. `fixed` — qaysi ekranga
  // qo'yilishidan qat'i nazar bir xil joyda chiqadi.
  //
  // 'connecting' ham kiritilgan: "Qayta ulanish" bosilgandan keyin yangi soket
  // birinchi urinishini aynan shu holatda boshlaydi, aks holda banner yo'qolib,
  // o'quvchi hech qanday javob ko'rmasdan qolardi.
  const connBanner = (connState === 'connecting' || connState === 'reconnecting' || connState === 'failed') ? (
    <div className={`fixed top-0 inset-x-0 z-50 px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 ${connState === 'failed' ? 'bg-red-500/90 text-white' : 'bg-amber-500/90 text-black'}`}>
      {connState === 'failed' ? (
        <>
          <span>Ulanish uzildi.</span>
          <button onClick={reconnect} className="underline font-black">Qayta ulanish</button>
        </>
      ) : (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
          <span>{connState === 'reconnecting' ? 'Qayta ulanmoqda...' : 'Ulanmoqda...'}</span>
        </>
      )}
    </div>
  ) : null;

  if (step === 'join') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-white" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">⚡</div>
            <h1 className="text-3xl font-black">Jonli viktorina</h1>
            <p className="text-white/50 text-sm mt-1">Ustoz bergan {LIVE_QUIZ_CODE_LENGTH} xonali kodni kiriting</p>
          </div>

          <div className="glass rounded-2xl p-5 space-y-3">
            {/* Raqamli kod maydoni (Kahoot "game PIN" bilan bir xil):
                `inputMode="numeric"` + `pattern="[0-9]*"` — iOS va Android
                aynan shu juftlikda raqamli klaviatura ochadi. `type="text"`
                ataylab: `type="number"` maydonida `maxLength` ishlamaydi va
                brauzer o'q tugmachalarini qo'shadi. Avtomatik tuzatish/bosh
                harf o'chirilgan — iOS aks holda terilgan kodni "tuzatib"
                yuborardi. */}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, LIVE_QUIZ_CODE_LENGTH))}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="XONA KODI"
              maxLength={LIVE_QUIZ_CODE_LENGTH}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-4 text-center text-2xl font-black tracking-[0.3em] tabular-nums text-white outline-none focus:border-indigo-500/60 placeholder:tracking-normal placeholder:text-base placeholder:text-white/30"
            />
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="Ismingiz (taxallus)"
              maxLength={30}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-sm text-white outline-none focus:border-indigo-500/50"
            />
            <div>
              <div className="text-xs font-semibold text-white/50 text-center mb-2">Avatar tanlang</div>
              <div className="grid grid-cols-5 gap-2">
                {LIVE_QUIZ_AVATARS.map((a) => (
                  <button key={a.emoji} type="button" onClick={() => setAvatar(a.emoji)}
                    className={`aspect-square rounded-full flex items-center justify-center text-xl transition-all active:scale-95 ${a.emoji === avatar ? 'ring-2 ring-white scale-105' : 'opacity-60 hover:opacity-100'}`}
                    style={{ background: a.bg }}>
                    {a.emoji}
                  </button>
                ))}
              </div>
            </div>
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
        {connBanner}
        <div className="w-16 h-16 rounded-full border-4 border-white/15 border-t-indigo-400 animate-spin mb-6" />
        <h2 className="text-2xl font-black mb-1">Kutilmoqda...</h2>
        <p className="text-white/50 text-sm">{title || 'Viktorina'} boshlanishini kuting</p>
        <div className="mt-6 flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full bg-white/10 text-sm font-semibold">
          <QuizAvatar value={avatar} size={24} />
          {nameInput || 'Siz'}
        </div>
      </div>
    );
  }

  if (step === 'question' && question) {
    const qType = question.questionType || 'mcq';
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
        {/* Kahoot uslubidagi o'yin maydoni: fon butun ekranni qoplaydi (kirish
            va lobbi bilan bir xil gradient — yassi qora emas), kontent
            ustuni esa keng monitorlarda cheklanib markazga tortiladi. Kichik
            ekranlarda `w-full` tufayli hech narsa o'zgarmaydi. */}
        {connBanner}
        <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/50">Savol {question.index + 1}/{question.totalQuestions}</span>
            <span className="w-11 h-11 rounded-full flex items-center justify-center font-black bg-white/10 border border-white/15">{remaining}</span>
          </div>
          <div className="px-5 py-4 text-center">
            <h2 className="text-xl sm:text-2xl font-black leading-tight break-words">{question.text}</h2>
          </div>
          {/* Javob yuborilmay qolgani (soket uzilgan) shu yerda ko'rinadi —
              avval bu xato hech qaerda chiqmasdi va o'quvchi javobim ketdi
              deb o'ylardi. */}
          {error && <div className="px-5 pb-2 text-center text-sm text-amber-300">{error}</div>}
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
      </div>
    );
  }

  if (step === 'answered') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
        {connBanner}
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
        {connBanner}
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
            {/* `key` savol indeksiga bog'langan — har raundda element qaytadan
                yaratiladi va "pop" animatsiyasi yana ishlaydi. */}
            <div className="flex items-center gap-1.5">
              <div key={`rank-${result.index}`} className="lq-pop text-2xl font-black">{myRank ?? '-'}</div>
              {rankShift !== 0 && (
                <span key={`shift-${result.index}`}
                  className={`lq-pop text-[11px] font-black px-1.5 py-0.5 rounded-full ${rankShift > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                  {rankShift > 0 ? `▲${rankShift}` : `▼${Math.abs(rankShift)}`}
                </span>
              )}
            </div>
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-white text-center" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
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
                <QuizAvatar value={row.avatar} size={24} />
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
    <div className="min-h-screen flex items-center justify-center text-white/40" style={{ background: 'radial-gradient(circle at 50% 0%, #7c3aed 0%, #46178f 55%)' }}>
      Yuklanmoqda...
    </div>
  );
};
