// pages/OlympiadTest.jsx

// IT (kod) savollarida dasturlash tili yorliqlari.
const LANG_LABELS = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
};

// Savol turiga qarab javob kiritish UI. Kod (code) savol bu yerga kelmaydi —
// u alohida LeetCode-uslubidagi split layoutda render qilinadi.
//   value formati: mcq/yes_no → son/{chosen_idx}; multiple_select →
//   {selected:[...]}; fill_blank/essay → {text}; fill_blanks → {blanks:{...}};
//   slider → {value: son}.
const QuestionAnswerArea = ({ qType, q, isTrueFalse, value, onMcq, onText, onBlank, onMultiToggle, onYesNo, onSlider }) => {
  // `.input-field` (src/index.css) — fon, hoshiya, matn va fokus halqasi bitta
  // joyda, tokenlar ustida. Radius utility'si komponent qatlamini yengadi,
  // shuning uchun `rounded-2xl` avvalgi shaklni saqlaydi.
  const inputCls = 'input-field rounded-2xl text-sm md:text-base';

  // Variant yuzasi. `.glass` ATAYIN ishlatilmadi: u hoshiyani
  // `box-shadow: inset 0 0 0 1px` bilan chizadi, ustiga tanlov `border`i
  // qo'shilsa ikkita halqa ko'rinardi. Yuzalar tokenlardan to'g'ridan-to'g'ri
  // yig'ilgan, tanlov esa yagona signal — akcent hoshiya + yengil akcent fon.
  const optionBase = 'w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl text-left border transition-colors min-h-[56px]';
  const optionOn = 'border-accent bg-accent/15';
  const optionOff = 'border-edge bg-surface-1 hover:border-edge-strong hover:bg-surface-2';
  // Variant oldidagi belgi (harf / ✓ / checkbox). Tanlangan holat — to'ldirilgan
  // akcent yuza, ustidagi matn har doim `on-accent`.
  const markOn = 'bg-accent-fill text-on-accent border border-accent-fill';
  const markOff = 'bg-surface-2 text-text-secondary border border-edge';

  // Matn kiritilgan bo'lsa kichik "Saqlandi" belgisi — MCQ/yes_no/multiple_select
  // uchun tanlangan variant o'zi rangi bilan aniq ko'rinadi, lekin matnli
  // javoblarda (fill_blank/essay/fill_blanks) hech qanday tasdiq belgisi
  // yo'q edi: stressli talaba javob "ketdimi yo'qmi" bilmay qolardi.
  const SavedTag = () => (
    <div className="flex items-center gap-1.5 text-xs text-success mt-2">
      <Icon name="check" size={12} /> Saqlandi
    </div>
  );

  // fill_blank — bitta qator matn kiritish.
  if (qType === 'fill_blank') {
    const text = (value && typeof value === 'object' ? value.text : '') || '';
    return (
      <div>
        <input
          type="text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Javobingizni kiriting..."
          className={inputCls}
          autoComplete="off"
        />
        {text.trim() && <SavedTag />}
      </div>
    );
  }

  // essay — katta matn maydoni.
  if (qType === 'essay') {
    const text = (value && typeof value === 'object' ? value.text : '') || '';
    return (
      <div>
        <textarea
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="Javobingizni batafsil yozing..."
          rows={8}
          className={`${inputCls} resize-y min-h-[160px] leading-relaxed`}
        />
        {text.trim() && <SavedTag />}
      </div>
    );
  }

  // fill_blanks — bir nechta bo'sh joy. Soni backend blanks_count'dan keladi.
  if (qType === 'fill_blanks') {
    const count = Math.max(1, Number(q.blanksCount ?? q.blanks_count ?? 1) || 1);
    const blanks = (value && typeof value === 'object' && value.blanks) || {};
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => {
          const key = String(i + 1);
          const filled = String(blanks[key] || '').trim().length > 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold font-data text-sm flex-shrink-0 ${markOff}`}>
                {i + 1}
              </div>
              <input
                type="text"
                value={blanks[key] || ''}
                onChange={(e) => onBlank(i + 1, e.target.value)}
                placeholder={`${i + 1}-bo'sh joy`}
                className={inputCls}
                autoComplete="off"
              />
              {filled && <Icon name="check" size={16} className="text-success flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    );
  }

  // slider — raqamli javob (surgichni surib son tanlanadi). Oraliq backend
  // `slider_range` (min/max/step) dan keladi; to'g'ri javob va xatolik
  // chegarasi (correct/tolerance) o'quvchiga HECH QACHON yuborilmaydi.
  if (qType === 'slider') {
    const range = q.slider_range || q.sliderRange || {};
    const min = Number(range.min ?? 0) || 0;
    const rawMax = Number(range.max ?? 100);
    const max = rawMax > min ? rawMax : min + 100;
    const step = Number(range.step) > 0 ? Number(range.step) : 1;
    const picked = (value && typeof value === 'object') ? value.value : value;
    const hasValue = typeof picked === 'number' && Number.isFinite(picked);
    const current = hasValue ? Math.min(max, Math.max(min, picked)) : min;
    return (
      <div className="rounded-2xl border border-edge bg-surface-1 p-4 md:p-5">
        <div className="text-center mb-4">
          <div className={`text-3xl md:text-4xl font-display font-bold font-data ${hasValue ? 'text-text-primary' : 'text-text-secondary'}`}>
            {hasValue ? current : '—'}
          </div>
          {!hasValue && (
            <div className="text-xs text-text-secondary mt-1">Javob berish uchun surgichni suring</div>
          )}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onSlider(Number(e.target.value))}
          // Faqat onChange bo'lsa, to'g'ri javob aynan `min` bo'lganda o'quvchi
          // surgichni qimirlatolmay javobini qayd eta olmasdi — bosib qo'yib
          // yuborish ham joriy qiymatni saqlaydi.
          onPointerUp={() => onSlider(current)}
          className="w-full accent-accent cursor-pointer"
        />
        <div className="flex items-center justify-between text-xs text-text-secondary mt-2 font-data">
          <span>{min}</span>
          <span>{max}</span>
        </div>
        {hasValue && <SavedTag />}
      </div>
    );
  }

  // yes_no — "Ha" / "Yo'q" ikki tugma. chosen_idx: 0=Ha, 1=Yo'q.
  if (qType === 'yes_no') {
    const chosen = (value && typeof value === 'object') ? value.chosen_idx : value;
    // Savol o'z variantlarini bersa (masalan ["Ha","Yo'q"]) — o'shani ko'rsatamiz.
    const labels = Array.isArray(q.options) && q.options.length === 2 ? q.options : ['Ha', "Yo'q"];
    return (
      <div className="grid grid-cols-2 gap-3">
        {labels.map((label, i) => {
          const selected = chosen === i;
          // "Ha" yashil / "Yo'q" qizil EMAS: bu javob TANLOVI, to'g'ri-noto'g'ri
          // signali emas. Yashil/qizil juftlik talabaga javobi baholangandek
          // tuyulardi. Tanlov belgisi qolgan savol turlari bilan bir xil —
          // akcent hoshiya; ✓/✗ glifi ikkisini ajratib turadi.
          return (
            <button key={i} onClick={() => onYesNo(i)} aria-pressed={selected}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl font-semibold text-sm md:text-base border transition-colors min-h-[64px] ${selected ? `${optionOn} text-text-primary` : `${optionOff} text-text-secondary`}`}>
              <span className="text-lg">{i === 0 ? '✓' : '✗'}</span>
              <MathText text={label} />
            </button>
          );
        })}
      </div>
    );
  }

  // multiple_select — checkbox uslubidagi ko'p tanlovli.
  if (qType === 'multiple_select') {
    const selected = (value && typeof value === 'object' && Array.isArray(value.selected)) ? value.selected : [];
    return (
      <div className="space-y-2.5 md:space-y-3">
        {(q.options || []).map((opt, i) => {
          const checked = selected.includes(i);
          return (
            <button key={i} onClick={() => onMultiToggle(i)} aria-pressed={checked}
              className={`${optionBase} ${checked ? optionOn : optionOff}`}>
              <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${checked ? markOn : markOff}`}>
                {checked && <Icon name="check" size={16} />}
              </div>
              <MathText className={`font-medium text-sm md:text-base break-words min-w-0 ${checked ? 'text-text-primary' : 'text-text-secondary'}`} text={opt} />
            </button>
          );
        })}
      </div>
    );
  }

  // MCQ (default) — bitta tanlovli option list. Mavjud UI o'zgarmaydi.
  const mcqChosen = (value && typeof value === 'object') ? value.chosen_idx : value;
  return (
    <div className="space-y-2.5 md:space-y-3">
      {(q.options || []).map((opt, i) => {
        const selected = mcqChosen === i;
        return (
          <button key={i} onClick={() => onMcq(i)} aria-pressed={selected}
            className={`${optionBase} ${selected ? optionOn : optionOff}`}>
            <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 transition-colors ${selected ? markOn : markOff}`}>
              {isTrueFalse ? (i === 0 ? '✓' : '✗') : String.fromCharCode(65 + i)}
            </div>
            <MathText className={`font-medium text-sm md:text-base break-words min-w-0 ${selected ? 'text-text-primary' : 'text-text-secondary'}`} text={opt} />
            {selected && <Icon name="check" size={16} className="ml-auto text-accent flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
};

// ─── Mashq (mock) test sahifasi ──────────────────────────────────────────────
// O'tib ketgan (tugagan) olimpiadani mashq rejimida ishlash uchun YENGIL test
// ekrani. Atayin alohida komponent: real OlympiadTestPage proktoring (tab
// kuzatuvi, ping, parallel qurilma DQ), savollarni bitta-bitta yuklash va
// cheating logikasi bilan og'irlashgan — mashqda ularning hech biri kerak emas.
// Bu komponent MockOlympiad/MockAttempt API'sini ishlatadi va NA reytingga, NA
// markaz reytingiga ta'sir qiladi. Savollar `start_mock` orqali birato'la
// yuklanadi, javoblar `submit_mock` orqali backendda baholanadi.
const MockTestPage = ({ mock, user, onFinish, onNavigate }) => {
  const mockId = mock?.mockId ?? mock?.mock_id ?? null;
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [questions, setQuestions] = React.useState([]);
  const [title, setTitle] = React.useState(mock?.title || 'Mashq');
  const [timeLimit, setTimeLimit] = React.useState((mock?.duration || 30) * 60);
  const [timeLeft, setTimeLeft] = React.useState((mock?.duration || 30) * 60);
  // Server tomonidan qaytarilgan attempt.started_at (ms) — sahifa qayta
  // ochilganda/yangilanganda qolgan vaqt shundan hisoblanadi, timer har safar
  // to'liq davomiylikdan qayta boshlamaydi. serverClockSkewMs — foydalanuvchi
  // qurilmasi soati bilan server soati orasidagi farq (drift'ni yo'qotish
  // uchun, real OlympiadTestPage'dagi bilan bir xil yondashuv).
  const [serverExpiresAtMs, setServerExpiresAtMs] = React.useState(null);
  const [serverClockSkewMs, setServerClockSkewMs] = React.useState(0);
  const [current, setCurrent] = React.useState(0);
  // answers: { [questionId]: chosenPayload } — submit_mock kutgan formatda.
  const [answers, setAnswers] = React.useState({});
  const answersRef = React.useRef(answers);
  React.useEffect(() => { answersRef.current = answers; }, [answers]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const [confirmModal, setConfirmModal] = React.useState(false);
  // Vaqt tugab avto-submit bo'lganda true — savol ekrani o'rniga aniq
  // "Vaqt tugadi" o'tish ekrani ko'rsatiladi.
  const [timeUp, setTimeUp] = React.useState(false);
  // timeLeft'ni handleSubmit closure'iga har sekund bog'lab interval'ni qayta
  // o'rnatmaslik uchun ref orqali o'qiymiz (sarflangan vaqtni hisoblashda).
  const timeLeftRef = React.useRef(timeLeft);
  React.useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  const timeLimitRef = React.useRef(timeLimit);
  React.useEffect(() => { timeLimitRef.current = timeLimit; }, [timeLimit]);

  // start_mock — savollarni va vaqt cheklovini yuklaymiz (idempotent).
  React.useEffect(() => {
    if (mockId == null) { setLoadError("Mashq topilmadi"); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    const token = globalThis.OlympyApi?.getToken?.();
    globalThis.OlympyApi.startMockOlympiad(mockId, {}, token)
      .then(resp => {
        if (cancelled) return;
        const list = Array.isArray(resp?.questions) ? resp.questions : [];
        setQuestions(list);
        if (resp?.title) setTitle(resp.title);
        const mins = Number(resp?.time_limit_minutes) || (mock?.duration || 30);
        setTimeLimit(mins * 60);
        // Qolgan vaqtni to'liq davomiylikdan emas, server qaytargan
        // `started_at`dan hisoblaymiz — shu tariqa sahifa qayta ochilganda
        // (yoki yangilanganda) allaqachon o'tgan vaqt hisobga olinadi.
        // `started_at` kelmasa (eski backend) — avvalgidek to'liq vaqtdan
        // boshlanadi (fallback).
        let skewMs = 0;
        if (resp?.server_now) {
          skewMs = Date.now() - new Date(resp.server_now).getTime();
          setServerClockSkewMs(skewMs);
        }
        if (resp?.started_at) {
          const expiresAtMs = new Date(resp.started_at).getTime() + mins * 60000;
          setServerExpiresAtMs(expiresAtMs);
          const remaining = Math.max(0, Math.floor((expiresAtMs - (Date.now() - skewMs)) / 1000));
          setTimeLeft(remaining);
        } else {
          setTimeLeft(mins * 60);
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        // Allaqachon yakunlangan mashq — submit'da 400 bo'lardi; bu yerda
        // boshlashda 400 ("yakunlagansiz") kelsa, foydalanuvchiga aniq xabar.
        const detail = err?.data?.detail || err?.message || "Mashqni boshlab bo'lmadi";
        setLoadError(detail);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [mockId]);

  const TOTAL = questions.length;
  // OlympiadTestPage'dagi kabi — mashq faol bo'lganda 401'lar butun ilovani
  // majburan logout qilmasin (uzoq mashqda access token muddati tugashi
  // mumkin).
  React.useEffect(() => {
    const examActive = !loading && !submitted && !loadError && TOTAL > 0;
    globalThis.OlympyApi?.setExamMode?.(examActive);
    return () => { globalThis.OlympyApi?.setExamMode?.(false); };
  }, [loading, submitted, loadError, TOTAL]);
  const q = questions[current] || null;
  const qType = (q?.question_type || q?.questionType || 'mcq');
  const isTrueFalse = qType === 'yes_no'
    || (Array.isArray(q?.options) && q.options.length === 2
        && ['ha', "yo'q", 'yes', 'no', "to'g'ri", "noto'g'ri"].includes(String(q.options[0]).trim().toLowerCase()));
  const answered = Object.values(answers).filter(v => {
    if (v == null) return false;
    if (typeof v === 'object') {
      if (Array.isArray(v.selected)) return v.selected.length > 0;
      if (v.blanks && typeof v.blanks === 'object') return Object.values(v.blanks).some(x => String(x || '').trim());
      if (typeof v.text === 'string') return v.text.trim().length > 0;
      if (typeof v.chosen_idx === 'number') return true;
      if (typeof v.value === 'number') return true; // slider
    }
    return true;
  }).length;

  const setAnswer = (payload) => {
    if (!q) return;
    setAnswers(prev => ({ ...prev, [String(q.id)]: payload }));
  };
  const curVal = q ? answers[String(q.id)] : undefined;

  const handleSubmit = React.useCallback(async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const resp = await globalThis.OlympyApi.submitMockOlympiad(
        mockId, { answers: answersRef.current || {} }, token,
      );
      setSubmitted(true);
      onFinish({
        // Mashq natijasi — reytingga kirmaydi, attemptId yo'q (sertifikat/
        // leaderboard ko'rsatilmaydi). ResultsPage oddiy ball/to'g'ri/jami
        // ko'rsatadi va isMock bilan "mashq" ekanini bildiradi.
        score: resp?.score ?? 0,
        correct: resp?.correct_count ?? 0,
        wrong: (resp?.total_questions ?? TOTAL) - (resp?.correct_count ?? 0),
        total: resp?.total_questions ?? TOTAL,
        rank: null,
        time: Math.max(0, timeLimitRef.current - timeLeftRef.current),
        maxScore: 100,
        olympiad: { title, subject: mock?.subject || '', eventType: 'olympiad' },
        isMock: true,
        _api: false,
      });
    } catch (err) {
      const detail = err?.data?.detail || err?.message || '';
      if (/allaqachon/i.test(detail)) {
        // Mashq allaqachon topshirilgan — qayta topshirib bo'lmaydi.
        setSubmitError(detail);
      } else {
        setSubmitError("Javoblarni yuborib bo'lmadi. Qayta urinib ko'ring.");
      }
      setSubmitting(false);
    }
  }, [submitting, submitted, mockId, TOTAL, title, mock, onFinish]);

  // Timer — mashqda yumshoq cheklov: vaqt tugaganda avto-submit. Savollar
  // yuklanmaguncha (loading) yoki yuborilgach to'xtaydi. serverExpiresAtMs
  // mavjud bo'lsa har tikda undan qolgan vaqt qayta hisoblanadi (real
  // OlympiadTestPage'dagi kabi) — bu sahifa background'da uzoq turib
  // qolgan taqdirda ham (tab uxlab qolishi) drift bo'lmasligini ta'minlaydi.
  // serverExpiresAtMs yo'q bo'lsa (eski backend fallback) — oddiy teskari
  // sanash ishlatiladi.
  React.useEffect(() => {
    if (loading || submitted || loadError || TOTAL === 0) return undefined;
    if (timeLeft <= 0) { handleSubmit(); return undefined; }
    const t = setInterval(() => {
      if (serverExpiresAtMs) {
        const remaining = Math.max(0, Math.floor((serverExpiresAtMs - (Date.now() - serverClockSkewMs)) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) { clearInterval(t); setTimeUp(true); handleSubmit(); }
        return;
      }
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(t); setTimeUp(true); handleSubmit(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [loading, submitted, loadError, TOTAL, timeLeft <= 0, handleSubmit, serverExpiresAtMs, serverClockSkewMs]);

  const fmtTime = (s) => {
    const m = Math.floor(Math.max(0, s) / 60);
    const sec = Math.max(0, s) % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const goHome = () => onNavigate(roleHomePage ? roleHomePage(user) : 'student');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground">
        <div className="text-center">
          <Spinner size={44} className="text-accent mb-4" />
          <div className="text-text-secondary text-sm">Mashq yuklanmoqda...</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-error/40 bg-surface-1 p-8 max-w-md text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-error/40 bg-wash text-error">
            <Icon name="info" size={24} />
          </div>
          <h2 className="font-display text-lg font-bold text-text-primary">Mashqni ochib bo'lmadi</h2>
          <p className="text-text-secondary text-sm">{loadError}</p>
          <button onClick={goHome} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">Orqaga</button>
        </div>
      </div>
    );
  }

  if (TOTAL === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-edge bg-surface-1 p-8 max-w-md text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-edge bg-surface-2 text-text-secondary">
            <Icon name="file" size={24} />
          </div>
          <h2 className="font-display text-lg font-bold text-text-primary">Mashqda savollar yo'q</h2>
          <p className="text-text-secondary text-sm">Bu olimpiada uchun savollar topilmadi.</p>
          <button onClick={goHome} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">Orqaga</button>
        </div>
      </div>
    );
  }

  if (timeUp && submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-edge bg-surface-1 p-8 max-w-md text-center space-y-4">
          <Spinner size={44} className="text-accent" />
          <h2 className="font-display text-lg font-bold text-text-primary">Vaqt tugadi</h2>
          <p className="text-text-secondary text-sm">Javoblaringiz avtomatik yuborilmoqda, iltimos kuting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ground">
      {/* Header */}
      <div className="bg-surface-1 border-b border-edge px-4 md:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={goHome} aria-label="Orqaga">
          <BrandLogo size="sm" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text-primary truncate flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-accent border border-accent/40 bg-wash px-2 py-0.5 rounded-md flex-shrink-0">Mashq</span>
            <span className="truncate">{title}</span>
          </div>
        </div>
        {/* Taymer — `font-data` majburiy: sekund almashganda raqam kengligi
            o'zgarmasin, aks holda butun chip har tikda sakraydi. Puls
            animatsiyasi yo'q (asosiy test ekranidagi izohga qarang). */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold font-data flex-shrink-0 ${
          timeLeft < 60 ? 'bg-wash text-error border-error'
            : timeLeft < 300 ? 'bg-wash text-warning border-warning/40'
            : 'bg-surface-2 text-text-primary border-edge'
        }`}>
          <Icon name="clock" size={14} /> {fmtTime(timeLeft)}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4 md:space-y-6 pb-28">
        {/* Progress */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-text-secondary font-data">Savol {current + 1} / {TOTAL}</div>
          <div className="text-xs text-text-secondary font-data">{answered} ta belgilangan</div>
        </div>
        <div className="progress-bar h-1.5">
          <div className="progress-fill" style={{ width: `${((current + 1) / TOTAL) * 100}%` }} />
        </div>

        {/* Question */}
        <div className="rounded-2xl border border-edge bg-surface-1 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {q?.subject && <span className="text-[10px] uppercase tracking-wider font-extrabold text-accent border border-accent/40 bg-wash px-2 py-0.5 rounded-md">{q.subject}</span>}
          </div>
          <div className="text-base md:text-lg font-bold text-text-primary leading-relaxed mb-5 break-words select-none">{q?.text}</div>
          <QuestionAnswerArea
            qType={qType}
            q={q}
            isTrueFalse={isTrueFalse}
            value={curVal}
            onMcq={(i) => setAnswer({ chosen_idx: i })}
            onYesNo={(i) => setAnswer({ chosen_idx: i })}
            onText={(t) => setAnswer({ text: t })}
            onMultiToggle={(i) => {
              const sel = (curVal && Array.isArray(curVal.selected)) ? curVal.selected.slice() : [];
              const pos = sel.indexOf(i);
              if (pos >= 0) sel.splice(pos, 1); else sel.push(i);
              setAnswer({ selected: sel });
            }}
            onBlank={(num, t) => {
              const blanks = (curVal && curVal.blanks && typeof curVal.blanks === 'object') ? { ...curVal.blanks } : {};
              blanks[String(num)] = t;
              setAnswer({ blanks });
            }}
            onSlider={(n) => setAnswer({ value: n })}
          />
        </div>

        {submitError && (
          <div className="rounded-xl px-4 py-3 text-sm text-error bg-wash border border-error/40 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Icon name="info" size={15} /> {submitError}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* To'g'ridan-to'g'ri qayta yuborish — confirmModal'ni qayta ochmasdan */}
              <button onClick={handleSubmit} disabled={submitting}
                className="btn-ghost text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                {submitting ? 'Yuborilmoqda...' : 'Qayta yuborish'}
              </button>
              {/* AI yordamni QO'LDA ochish. Imtihon ekranida doimiy launcher
                  yashiriladi (u taymer/navigatsiyani to'sardi), shuning uchun
                  yordamga yagona kirish nuqtasi shu havola. Avtomatik ochilish
                  cooldown'i bunga ta'sir qilmaydi — `openSupportChat` throttle
                  qo'llamaydi. */}
              <button type="button" onClick={() => globalThis.OlympyApi?.openSupportChat?.('exam_submit_error', submitError)}
                className="text-xs underline underline-offset-2 whitespace-nowrap hover:opacity-80 cursor-pointer">
                Yordam kerakmi?
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
            className="btn-ghost px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40">
            ← Oldingi
          </button>
          {current < TOTAL - 1 ? (
            <button onClick={() => setCurrent(c => Math.min(TOTAL - 1, c + 1))}
              className="btn-primary flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold">
              Keyingi →
            </button>
          ) : (
            <button onClick={() => setConfirmModal(true)} disabled={submitting}
              className="btn-primary flex-1 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
              {submitting ? 'Yuborilmoqda...' : 'Yakunlash ✓'}
            </button>
          )}
        </div>

        {/* Savol gridi — tez navigatsiya */}
        <div className="flex flex-wrap gap-2">
          {questions.map((qq, i) => {
            const isAns = answers[String(qq.id)] != null;
            const isCur = i === current;
            // Real test ekranidagi navigator bilan bir xil klass — holat
            // ranglari (joriy / javob berilgan) bitta joyda, src/index.css.
            return (
              <button key={qq.id ?? i} onClick={() => setCurrent(i)} aria-pressed={isCur}
                className={`question-nav-btn font-data ${isCur ? 'current' : isAns ? 'answered' : ''}`}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Mashqni yakunlash">
        <div className="space-y-4">
          <div className="space-y-3">
            {TOTAL - answered > 0 && (
              <div className="flex items-center gap-2 bg-wash text-warning rounded-xl px-4 py-3 text-sm border border-warning/40">
                <Icon name="info" size={15} /> {TOTAL - answered} ta savol javobsiz qoldi
              </div>
            )}
            <p className="text-text-secondary text-sm">Mashqni yakunlamoqchimisiz? Natija reytingga ta'sir qilmaydi.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setConfirmModal(false)} className="btn-ghost flex-1 py-3 rounded-xl">Davom etish</button>
            <button onClick={() => { setConfirmModal(false); handleSubmit(); }} disabled={submitting}
              className="btn-primary flex-1 py-3 rounded-xl font-bold disabled:opacity-50">
              {submitting ? 'Yuborilmoqda...' : 'Yakunlash ✓'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const OlympiadTestPage = ({ olympiad, user, onFinish, onNavigate }) => {
  const store = useStore();

  // Resolve the question list: prefer store-backed olympiad.questionIds → store.questions
  const liveOlympiad = olympiad ? store.olympiads.find(o => o.id === olympiad.id) || olympiad : null;
  const [apiQuestions, setApiQuestions] = React.useState(null);
  // API rejimda savollarning umumiy soni — serverdan keladi va navigatordagi
  // tugmalar sonini, progress va counter'larni hisoblashda ishlatiladi.
  const [apiTotal, setApiTotal] = React.useState(0);
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

  const [currentTime, setCurrentTime] = React.useState(() => new Date());

  // start_datetime backenddan ISO bo'lib keladi va vaqt mintaqasiga bog'liq
  // emas; mock store esa startDate+startTime ni lokal vaqt sifatida saqlaydi.
  // olympiadStartMoment ikkalasini ham to'g'ri parse qiladi va vaqt mintaqasi
  // sababli kun siljishi muammosini bartaraf etadi.
  const startDt = liveOlympiad ? olympiadStartMoment(liveOlympiad) : null;
  const endDt = startDt ? new Date(startDt.getTime() + (liveOlympiad.duration || 60) * 60000) : null;
  const isBeforeStart = startDt && currentTime < startDt;
  // Vaqt tugashini imkon qadar server vaqtiga (serverExpiresAt) tayanib
  // aniqlaymiz — foydalanuvchining lokal soati noto'g'ri (oldinga/orqaga
  // surilgan) bo'lsa ham imtihon vaqti to'g'ri hisoblanadi. serverExpiresAt
  // hali kelmagan bo'lsa (savollar yuklanmasdan oldin) lokal endDt'ga
  // qaytamiz.
  const isAfterEnd = serverExpiresAt
    ? currentTime > new Date(serverExpiresAt)
    : (endDt && currentTime > endDt);

  React.useEffect(() => {
    if (!isBeforeStart) return undefined;
    const t = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(t);
  }, [isBeforeStart]);

  const assignedIds = liveOlympiad?.questionIds || [];
  const assignedQuestions = assignedIds
    .map(qid => store.questions.find(q => q.id === qid))
    .filter(Boolean);
  // API foydalanuvchisi uchun apiQuestions yagona haqiqiy manba. Cheating-himoya
  // sababli savollar bitta-bitta yuklanadi, shuning uchun apiQuestions — index
  // bo'yicha to'ldiriladigan siyrak (sparse) massiv: faqat ko'rilgan savollar
  // mavjud bo'ladi. Savollar umumiy soni apiTotal'da alohida saqlanadi.
  // Mock/dev rejimda esa biriktirilgan savollar (yoki bo'sh).
  const TEST_QUESTIONS = user?._api
    ? (Array.isArray(apiQuestions) ? apiQuestions : [])
    : assignedQuestions;

  // API rejimda umumiy savollar soni serverdan keladi (apiTotal). Mock rejimda
  // esa biriktirilgan savollar uzunligi.
  const TOTAL = user?._api ? apiTotal : TEST_QUESTIONS.length;
  const DURATION = (liveOlympiad?.duration || olympiad?.duration || 30) * 60;

  // Birinchi yuklash — hali hech qaysi savol kelmagan (apiTotal===0). Faqat shu
  // paytda butun ekranli spinner ko'rsatamiz; keyingi savollar yuklanayotganda
  // (savol almashtirilganda) timer/proktoring effektlari uzilmasligi va butun
  // sahifa bo'shamasligi uchun inline spinner ishlatiladi.
  const initialQuestionsLoading = questionsLoading && (user?._api ? apiTotal === 0 : false);
  // Joriy savol hali yuklanmaganmi (navigatsiyadagi inline spinner uchun).
  const currentQuestionLoading = questionsLoading && !initialQuestionsLoading;

  // To'q qora spinnerda cheksiz qolib ketmaslik uchun timeout. isBeforeStart
  // noto'g'ri false bo'lib qolgan holatlarda savol so'rovi 400 qaytaradi —
  // muayyan vaqtdan keyin foydalanuvchiga aniq xabar ko'rsatamiz.
  // Avval qattiq chegara 4s edi — 3G/qishloq internetida bu vaqt ichida
  // ulanish hali ishlayotgan bo'lsa ham "muammo" xabari ko'rsatib, talabani
  // keraksiz sahifa yangilashga undardi. Endi 4s'da yumshoq "sekin
  // yuklanmoqda" xabari, 9s'da esa haqiqiy xatolik ko'rsatiladi.
  const [slowLoading, setSlowLoading] = React.useState(false);
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);
  React.useEffect(() => {
    if (!initialQuestionsLoading) { setSlowLoading(false); setLoadingTimeout(false); return undefined; }
    const softTimer = setTimeout(() => setSlowLoading(true), 4000);
    const hardTimer = setTimeout(() => setLoadingTimeout(true), 9000);
    return () => { clearTimeout(softTimer); clearTimeout(hardTimer); };
  }, [initialQuestionsLoading]);

  // Refresh yoki crashdan keyin javoblarni yo'qotmaslik uchun localStorage
  // backup. iOS Safari private modeda yoki Telegram WebView'da saqlash
  // muvaffaqiyatsiz bo'lishi mumkin — try/catch bilan o'rab qo'yamiz.
  // ID aniq bo'lmasa 'unknown' qo'ymaymiz — aks holda barcha olimpiadalar
  // bitta `olympy_answers_unknown` kalitini ulashib, javoblar bir-biriga
  // aralashib ketardi. ID yo'q bo'lsa null qoldiramiz va saqlashni o'tkazib
  // yuboramiz (pastdagi useEffect'lar tekshiradi).
  const persistedOlympiadId = liveOlympiad?.id || olympiad?.id || liveOlympiad?.backendId || null;
  const answersStorageKey = persistedOlympiadId ? `olympy_answers_${persistedOlympiadId}` : null;
  const markedStorageKey = persistedOlympiadId ? `olympy_marked_${persistedOlympiadId}` : null;
  const readPersisted = (key) => {
    if (!key) return null;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  };

  const codeStorageKey = persistedOlympiadId ? `olympy_code_${persistedOlympiadId}` : null;

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState(() => readPersisted(answersStorageKey) || {});
  // Kod (IT) javoblari: { [savolIndeksi]: { code, language } }. Oddiy MCQ
  // olimpiadalarda bo'sh qoladi. localStorage'da ham backup qilinadi.
  const [codeAnswers, setCodeAnswers] = React.useState(() => readPersisted(codeStorageKey) || {});
  // Test paytida AI kod tekshiruvi natijasi: { [savolIndeksi]: { score, review } }.
  const [codeReview, setCodeReview] = React.useState({});
  const [codeReviewLoading, setCodeReviewLoading] = React.useState(false);
  // Judge0 "Ishga tushirish" natijasi: { [savolIndeksi]: { status, stdout, ... } }.
  const [runResults, setRunResults] = React.useState({});
  const [runningIndex, setRunningIndex] = React.useState(null);
  // Kod ishga tushirish / AI tekshiruv Judge0 va Gemini task'ini ~30 soniya
  // polling qiladi. Test sahifasidan chiqilganda (submit, DQ, orqaga) polling
  // to'xtashi kerak — aks holda so'rovlar unmount'dan keyin ham davom etadi.
  const aiAbort = useAbortOnUnmount();
  // Timer useEffect closure stale answers ushlab qolmasligi uchun ref —
  // har render'da yangilanadi va handleSubmit uni o'qiydi.
  const answersRef = React.useRef(answers);
  React.useEffect(() => { answersRef.current = answers; }, [answers]);
  const codeAnswersRef = React.useRef(codeAnswers);
  React.useEffect(() => { codeAnswersRef.current = codeAnswers; }, [codeAnswers]);
  const [marked, setMarked] = React.useState(() => readPersisted(markedStorageKey) || {});
  const [timeLeft, setTimeLeft] = React.useState(DURATION);
  const [confirmModal, setConfirmModal] = React.useState(false);
  // Back tugmasi bosilganda native window.confirm o'rniga maxsus modal —
  // iOS Safari va Telegram WebView'da window.confirm ishonchsiz va ba'zida
  // umuman ko'rinmaydi. Custom Modal har joyda bir xil ishlaydi.
  const [leaveConfirmModal, setLeaveConfirmModal] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  // Oflayn rejim: submit paytida tarmoq uzilsa javoblar IndexedDB "outbox"'ga
  // navbatga qo'yiladi va aloqa tiklangach avtomatik yuboriladi. Bu holatda
  // foydalanuvchiga xotirjam qiluvchi "saqlandi, tiklangach yuboriladi"
  // ekrani ko'rsatiladi (qo'rqinchli umumiy xato o'rniga).
  const [offlineQueued, setOfflineQueued] = React.useState(false);
  // Oflayn drain funksiyasiga qo'lda ("Qayta urinish" tugmasi) murojaat qilish
  // uchun ref — drain effekti ichida o'rnatiladi.
  const offlineDrainRef = React.useRef(null);
  // Vaqt tugab avto-submit bo'lganda true — bu holatda foydalanuvchiga
  // savol o'rniga "Vaqt tugadi, yuborilmoqda" ekrani ko'rsatiladi. Avval
  // sanoqchi 0:00 ga yetganda hech qanday o'tish ekrani bo'lmasdi, talaba
  // yozayotgan payti to'satdan kontrol tortib olinardi.
  const [timeUp, setTimeUp] = React.useState(false);
  const [cheated, setCheated] = React.useState(false);
  const [cheatMessage, setCheatMessage] = React.useState('');
  // Human-in-the-loop cheating tekshiruvi. Cheating aniqlangach darhol DQ
  // qilinmaydi — student shu holatda "tekshirilmoqda" ekranida kutadi.
  // Menejer/owner qaror qilgach: 'continue' → pendingReview=false (davom),
  // 'disqualify' → cheated=true. Kutish davrida taymer to'xtaydi.
  const [pendingReview, setPendingReview] = React.useState(false);
  // Musobaqa faol bo'lganda api.js'ga xabar beramiz: shu davrda hech qanday
  // so'rov (savol yuklash, kod ishga tushirish/tekshirish va h.k.) 401
  // qaytarsa ham butun ilovani majburan logout qilib bosh sahifaga
  // otmasin — foydalanuvchi olimpiada o'rtasida uzoq access token muddati
  // tugashi yoki vaqtinchalik tarmoq/cookie muammosi tufayli hisobdan
  // chiqarib yuborilmasligi kerak. Yakunlangach (submit/cheat) yoki
  // sahifadan chiqilganda o'chiramiz — bu paytdan keyingi 401'lar odatiy
  // (butun ilova) logout xatti-harakatiga qaytadi.
  React.useEffect(() => {
    const examActive = !!(user?._api && liveOlympiad?.backendId && !submitted && !cheated);
    globalThis.OlympyApi?.setExamMode?.(examActive);
    return () => { globalThis.OlympyApi?.setExamMode?.(false); };
  }, [user?._api, liveOlympiad?.backendId, submitted, cheated]);
  // Tab birinchi marta yashirilganda — disqualifikatsiya o'rniga
  // ogohlantirish ko'rsatamiz. Ikkinchi marta chiqishda — DQ.
  const [cheatWarning, setCheatWarning] = React.useState('');
  // Webkamera proktoring (yuz/nigoh kuzatuvi). Faqat olimpiadada
  // `cameraProctoringEnabled` yoqilgan bo'lsa ishlaydi. Rozilik shu sessiyada
  // bir marta beriladi (cameraConsentAcked), so'ng kamera ruxsati so'raladi va
  // FaceMonitor ishga tushadi. Hech qanday video saqlanmaydi — faqat hosila
  // signallar `reportCheating` orqali o'tadi.
  const cameraProctoringEnabled = !!liveOlympiad?.cameraProctoringEnabled;
  const [cameraConsentAcked, setCameraConsentAcked] = React.useState(false);
  const [cameraConsentChecked, setCameraConsentChecked] = React.useState(false);
  const [cameraStarting, setCameraStarting] = React.useState(false);
  const [cameraError, setCameraError] = React.useState('');
  // FaceMonitor handle'i ({ stop }) — submit/DQ/unmount'da to'xtatish uchun.
  const faceMonitorRef = React.useRef(null);
  // Ovoz (mikrofon) proktoring (atrofdagi gapirish/ovoz kuzatuvi). Kamera
  // proktoringidan MUSTAQIL: o'z bayrog'i (`voiceProctoringEnabled`) va o'z
  // roziligi (voiceConsentAcked) bilan boshqariladi. Rozilik berilgach mikrofon
  // ruxsati so'raladi va VoiceMonitor ishga tushadi. Hech qanday audio
  // saqlanmaydi — faqat hosila signal `reportCheating` orqali o'tadi.
  const voiceProctoringEnabled = !!liveOlympiad?.voiceProctoringEnabled;
  const [voiceConsentAcked, setVoiceConsentAcked] = React.useState(false);
  const [voiceConsentChecked, setVoiceConsentChecked] = React.useState(false);
  const [voiceStarting, setVoiceStarting] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState('');
  // VoiceMonitor handle'i ({ stop }) — submit/DQ/unmount'da to'xtatish uchun.
  const voiceMonitorRef = React.useRef(null);
  // Jonli proktoring (Admin / Direktor / O'qituvchi kuzatuvchi) uchun media oqimlari
  const liveStreamRef = React.useRef(null);
  const liveAudioContextRef = React.useRef(null);
  const liveFrameUploadTimerRef = React.useRef(null);
  const liveVideoElRef = React.useRef(null);
  const sessionIdRef = React.useRef(null);
  // Yangi siyosat: son asosida. Tashqarida o'tkazilgan vaqtni emas,
  // balki tab/ilovani tark etish SONINI hisoblaymiz. 1-marta chiqishda
  // ogohlantirish, 2-marta chiqishda darhol disqualifikatsiya.
  const tabSwitchCountRef = React.useRef(0);
  const cheatReportedRef = React.useRef(false);
  const historyGuardRef = React.useRef(false);
  // blur va visibilitychange ko'pincha birga otiladi (tab almashtirilganda
  // ikkalasi ham "hidden"). Ikki marta hisoblamaslik uchun: hidden hodisa
  // bir marta otilganda true, qaytib kelganda (visible/focus) false.
  const hiddenEventFiredRef = React.useRef(false);
  // Qisqa (tasodifiy) fokus yo'qolishini hisoblamaslik uchun kechiktirish
  // taymeri. Tab/oyna belgilangan muddat davomida uzluksiz yashirin qolsagina
  // tark etish sifatida sanaladi.
  const hiddenTimerRef = React.useRef(null);
  // Qo'shimcha passiv cheating signallari uchun holat kuzatuvchilar.
  // Bularning barchasi `reportCheating` orqali o'tadi — u `cheatReportedRef`
  // bilan himoyalangani uchun birinchi signaldan keyingi barcha chaqiriqlar
  // no-op. Quyidagi bayroqlar esa har bir signalni faqat holat o'zgarishida
  // (transition) bir marta yuborish uchun (interval har tikda qayta
  // yubormaslik uchun) ishlatiladi.
  const wasFullscreenRef = React.useRef(false);
  const devtoolsOpenRef = React.useRef(false);
  const multiMonitorReportedRef = React.useRef(false);
  // Parallel sessiya tekshiruvi uchun qurilma identifikatori. Sahifa
  // yuklanganda localStorage'dan o'qiladi yoki yangidan generatsiya qilinadi.
  const deviceIdRef = React.useRef(null);
  if (deviceIdRef.current === null) {
    let did = null;
    try { did = localStorage.getItem('olympy_device_id'); } catch {}
    if (!did) {
      did = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
    deviceIdRef.current = did;
    try { localStorage.setItem('olympy_device_id', did); } catch {}
  }
  // Bitta-bitta yuklangan savollarni keshlash — qayta so'rov ketmasligi uchun.
  const cachedQuestionsRef = React.useRef({});

  // LeetCode-uslubidagi kod savol split layoutida CodeEditor to'liq balandlikni
  // egallashi kerak. CodeEditor `height` ga aniq qiymat kutadi ('100%' parent
  // balandlik zanjiriga bog'liq bo'lib, Telegram WebView'da ishonchsiz). Shu
  // sababli editor konteynerining haqiqiy balandligini ResizeObserver bilan
  // o'lchaymiz va piksel qiymat beramiz. Faqat kod savolda ishlatiladi.
  // Callback ref — element DOM'ga qo'shilgandagina observer ulanadi (timer
  // har-sekundlik re-render'larda qayta ulanmaydi).
  const codeEditorRoRef = React.useRef(null);
  const [codeEditorHeight, setCodeEditorHeight] = React.useState(0);
  const codeEditorHostRef = React.useCallback((el) => {
    if (codeEditorRoRef.current) {
      codeEditorRoRef.current.disconnect();
      codeEditorRoRef.current = null;
    }
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      // clientHeight padding-box'ni beradi; editor uchun vertikal padding'ni
      // ayiramiz (p-3 mobil = 24px, md:p-4 desktop = 32px). getComputedStyle
      // bilan aniq olamiz — responsive padding o'zgarsa ham to'g'ri qoladi.
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
      const padY = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 24;
      const h = el.clientHeight - padY;
      if (h > 0) setCodeEditorHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    codeEditorRoRef.current = ro;
  }, []);
  // Confirm modal yoki submit jarayonida brauzer fokusi tabiiy ravishda
  // o'zgaradi (modal ochiladi/yopiladi). Shu paytlarda blur/visibility
  // hodisalarini cheating deb hisoblamaslik uchun bayroq.
  const cheatGuardActiveRef = React.useRef(true);

  // Brauzer Back / yopish — olimpiada davomida foydalanuvchi tasodifan
  // sahifani tark etsa progress yo'qoladi. Avval hech qanday ogohlantirish
  // bo'lmasdi va session "active" qolib ketardi. Endi:
  // 1) beforeunload — brauzer refresh/yopish paytida confirm dialog.
  // 2) popstate — Back tugmasi bosilganda tasdiqlash so'raydi va navigatsiyani
  //    bloklash uchun stack'ga dummy state qaytaramiz.
  React.useEffect(() => {
    if (submitted || cheated || isBeforeStart || isAfterEnd || TOTAL === 0) {
      return undefined;
    }
    const onBeforeUnload = (e) => {
      e.preventDefault();
      // Modern brauzerlar maxsus matn ko'rsatmaydi, lekin confirm dialog'i
      // chiqishi uchun returnValue'ga bo'sh bo'lmagan string qo'yiladi.
      e.returnValue = "Olimpiadani tark etmoqchimisiz? Progress yo'qoladi.";
      return e.returnValue;
    };
    const onPopState = () => {
      // window.confirm — iOS Safari va Telegram WebView'da ishonchsiz.
      // Native dialog o'rniga custom modal ko'rsatamiz va navigatsiyani
      // darhol bloklab qo'yamiz; foydalanuvchi modalda tasdiqlaganidan
      // keyin onNavigate chaqiriladi.
      window.history.pushState(null, '', window.location.href);
      setLeaveConfirmModal(true);
    };
    // pushState faqat bir marta — effect qayta ishlaganda takrorlanmasligi uchun.
    if (!historyGuardRef.current) {
      window.history.pushState(null, '', window.location.href);
      historyGuardRef.current = true;
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [submitted, cheated, isBeforeStart, isAfterEnd, TOTAL, onNavigate]);

  // Eslatma: avval butun `document` darajasida contextmenu/copy/cut/paste
  // hodisalari bloklanardi. Bu real himoya bermasdi (matn allaqachon
  // `select-none` bilan tanlanmaydi) va butun sahifada o'ng-tugma/nusxalashni
  // buzib UX'ni yomonlashtirardi. Savol matni va variantlar matn tanlashdan
  // CSS (`select-none` / `userSelect: none`) orqali himoyalangan — global
  // event blok olib tashlandi.

  // Cheating-himoya: savollar bitta-bitta yuklanadi. Joriy `current` indeksdagi
  // savol serverdan olinadi va cachedQuestionsRef'da keshlanadi — keyin shu
  // savolga qaytilganda qayta so'rov ketmaydi. Birinchi yuklashda server
  // umumiy savollar soni (total_questions) va timing'ni ham qaytaradi.
  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || isBeforeStart || isAfterEnd) {
      setApiQuestions(null);
      setApiTotal(0);
      setQuestionsLoading(false);
      return undefined;
    }
    if (submitted || cheated || pendingReview) return undefined;
    // Webkamera nazorati yoqilgan bo'lsa, rozilik + kamera berilmaguncha
    // savollar YUKLANMAYDI (va shu bilan taymer boshlanmaydi) — student rozilik
    // ekranida turganда vaqt yo'qotmasin.
    if (cameraProctoringEnabled && !cameraConsentAcked) return undefined;
    // Ovoz nazorati yoqilgan bo'lsa, rozilik + mikrofon berilmaguncha
    // savollar YUKLANMAYDI (kamera bilan bir xil naqsh, undan mustaqil).
    if (voiceProctoringEnabled && !voiceConsentAcked) return undefined;

    const idx = current;
    // Keshda bo'lsa — qayta so'rov yo'q.
    const cached = cachedQuestionsRef.current[idx];
    if (cached) {
      setApiQuestions(prev => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        next[idx] = cached;
        return next;
      });
      setQuestionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setQuestionsLoading(true);
    setQuestionsError('');
    globalThis.OlympyApi.getOlympiadQuestions(liveOlympiad.backendId, globalThis.OlympyApi.getToken(), idx)
      .then(resp => {
        if (cancelled) return;
        // Sessiya tekshiruvda (student oldin tabni yopib qayta ochgan bo'lishi
        // mumkin) — savollarni ko'rsatmaymiz, "kutilmoqda" ekraniga o'tamiz.
        // Server timing'ni ham qaytaradi (paused_seconds hisobga olingan),
        // resume'da taymerni resync qilish uchun saqlaymiz.
        if (!Array.isArray(resp) && resp?.status === 'pending_review') {
          setPendingReview(true);
          const psess = resp?.session;
          if (psess?.expires_at) {
            setServerExpiresAt(psess.expires_at);
            if (psess.server_now) {
              setServerClockSkewMs(Date.now() - new Date(psess.server_now).getTime());
            }
          }
          setQuestionsLoading(false);
          return;
        }
        // Backend yangi shape qaytaradi: { questions:[oneQuestion], question_index,
        // total_questions, session }. Eski shape (array) bilan ham backward-compat.
        const list = Array.isArray(resp) ? resp : resp?.questions;
        const sess = !Array.isArray(resp) ? resp?.session : null;
        const total = !Array.isArray(resp) && typeof resp?.total_questions === 'number'
          ? resp.total_questions
          : null;
        if (Array.isArray(list) && list.length > 0) {
          const question = list[0];
          cachedQuestionsRef.current[idx] = question;
          setApiQuestions(prev => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            next[idx] = question;
            return next;
          });
          if (total != null) setApiTotal(total);
          else setApiTotal(prev => Math.max(prev, idx + 1));
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
          setQuestionsError('Savollar topilmadi. Iltimos, keyinroq urinib ko\'ring.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const detail = err?.data?.detail || err?.message || '';
          if (/cheating/i.test(detail)) {
            setCheated(true);
            setCheatMessage("Siz cheating qildingiz. Olimpiada yakunlandi.");
          } else if (/boshlanmagan|faol emas|not.*start|not.*active/i.test(detail)) {
            setQuestionsError('__not_started__');
          } else {
            setQuestionsError(detail || "Savollarni yuklab bo'lmadi.");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?._api, liveOlympiad?.backendId, isBeforeStart, isAfterEnd, current, submitted, cheated, pendingReview, cameraProctoringEnabled, cameraConsentAcked, voiceProctoringEnabled, voiceConsentAcked]);

  React.useEffect(() => {
    // pendingReview — tekshiruv kutilmoqda: taymer TO'XTATILADI (ko'rinadigan
    // sanoq kamaymaydi). Backend resolve bo'lganda muddatni paused_seconds
    // bilan uzaytiradi va ping javobidagi yangi expires_at bilan resync bo'ladi.
    if (submitted || isBeforeStart || isAfterEnd || initialQuestionsLoading || pendingReview) return;
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
            // Vaqt tugadi — submit qilamiz. MUHIM: draft (localStorage) bu
            // yerda tozalanmaydi! Sekin tarmoqda submit so'rovi expiry'dan
            // keyin yetib borib 400 qaytarsa, javoblar saqlanib qolishi
            // kerak — handleSubmit faqat MUVAFFAQIYATLI submit'dan keyin
            // clearPersistedAnswers() chaqiradi.
            setTimeUp(true);
            handleSubmit();
            return 0;
          }
          return remainingSec;
        });
      } else {
        // Mock/dev rejim — eski lokal teskari sanash.
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(t);
            // Vaqt tugadi — submit. Draft faqat muvaffaqiyatli submit'da
            // tozalanadi (handleSubmit ichida).
            setTimeUp(true);
            handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }
    };
    tick();
    let t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [submitted, isBeforeStart, isAfterEnd, initialQuestionsLoading, pendingReview, serverExpiresAt, serverClockSkewMs]);

  const sendPing = React.useCallback(async () => {
    // pendingReview holatida ham ping yuboriladi (tekshiruv natijasini kuzatish
    // uchun) — shu sababli bu yerda pendingReview guard'i YO'Q.
    if (!user?._api || !liveOlympiad?.backendId || submitted || cheated) return;
    const answeredCount = Object.keys(answersRef.current || {}).length;
    const escapes = tabSwitchCountRef.current;
    try {
      const token = globalThis.OlympyApi?.getToken?.()
        ?? globalThis.OlympyApi?.loadAuth?.()?.token;
      const resp = await globalThis.OlympyApi.pingTestSession(
        liveOlympiad.backendId,
        answeredCount,
        escapes,
        token,
        deviceIdRef.current,
      );
      // Human-in-the-loop tekshiruv holatini polling orqali kuzatamiz.
      const st = resp?.status;
      if (st === 'pending_review') {
        setPendingReview(true);
      } else if (st === 'active') {
        // Oddiy active ping YOKI menejer "davom etishga ruxsat" berdi.
        // Kutishdan chiqamiz, cheatReported guard'ini qayta ochamiz va
        // taymerni serverning yangilangan (paused_seconds bilan uzaytirilgan)
        // muddati bilan resync qilamiz.
        if (pendingReview) {
          setPendingReview(false);
          cheatReportedRef.current = false;
        }
        if (resp?.expires_at) {
          setServerExpiresAt(resp.expires_at);
          if (resp.server_now) {
            setServerClockSkewMs(Date.now() - new Date(resp.server_now).getTime());
          }
        }

        // Jonli kuzatuvchi nazorati (Live Stream On-demand)
        if (resp?.session_id) {
          sessionIdRef.current = resp.session_id;
          if (resp.stream_requested) {
            startLiveFrameStreaming(resp.session_id);
          } else if (liveFrameUploadTimerRef.current) {
            clearInterval(liveFrameUploadTimerRef.current);
            liveFrameUploadTimerRef.current = null;
          }

          // Nazoratchi yuborgan ogohlantirishlarni tekshirish
          try {
            const sig = await globalThis.OlympyApi.getProctorSignal(resp.session_id, token);
            if (sig?.signal?.action === 'warning' && sig?.signal?.payload?.message) {
              setCheatWarning(sig.signal.payload.message);
            }
          } catch {}
        }
      }
    } catch (err) {
      // 409 — diskvalifikatsiya: parallel qurilma YOKI tekshiruvdan keyin
      // menejer qoidabuzarlikni tasdiqladi (yoki 10 daqiqalik auto-timeout).
      // Ikkala holatda ham cheat ekranini ko'rsatamiz (backend session'ni
      // allaqachon DQ qildi).
      if (err?.status === 409) {
        cheatReportedRef.current = true;
        setPendingReview(false);
        setSubmitted(true);
        setCheated(true);
        setCheatMessage(err?.data?.detail || "Boshqa qurilmadan kirilgani aniqlandi. Olimpiada yakunlandi.");
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(answersStorageKey);
            localStorage.removeItem(markedStorageKey);
            if (codeStorageKey) localStorage.removeItem(codeStorageKey);
          }
        } catch {}
        return;
      }
      console.warn('pingTestSession failed:', err?.message);
    }
  }, [user?._api, liveOlympiad?.backendId, submitted, cheated, pendingReview, answersStorageKey, markedStorageKey, codeStorageKey]);

  const reportCheating = React.useCallback((reason) => {
    if (cheatReportedRef.current || submitted || cheated || pendingReview || !user?._api || !liveOlympiad?.backendId) return;
    if (!cheatGuardActiveRef.current) return;
    cheatReportedRef.current = true;
    // Darhol DQ QILMAYMIZ — backend'ga xabar beramiz, u sessiyani
    // "tekshiruv kutilmoqda" holatiga o'tkazadi. Student kutish ekranida
    // qoladi va menejer/owner qaror qilishini kutadi. Menejer davom etishga
    // ruxsat berishi mumkin — shu sababli localStorage javoblari TOZALANMAYDI.
    setPendingReview(true);
    try {
      globalThis.OlympyApi.reportCheating(
        { olympiad: liveOlympiad.backendId, reason },
        globalThis.OlympyApi.getToken(),
      ).catch(() => {});
    } catch {}
  }, [submitted, cheated, pendingReview, user?._api, liveOlympiad?.backendId]);

  // Webkamera proktoring rozilik oqimi: (1) backend'ga rozilikni yozamiz,
  // (2) kamera ruxsatini so'raymiz, (3) FaceMonitor'ni lazy yuklab ishga
  // tushiramiz. Kamera ruxsati berilmasa — imtihon boshlanmaydi (bu olimpiada
  // uchun kamera MAJBURIY). Hech qanday video saqlanmaydi.
  const handleCameraConsent = React.useCallback(async () => {
    if (cameraStarting) return;
    if (!user?._api || !liveOlympiad?.backendId) return;
    setCameraStarting(true);
    setCameraError('');
    // Rozilikni serverga yozamiz (faqat boolean + vaqt). Kamera ruxsatidan
    // OLDIN yuboramiz — student aynan roziligini bildirdi.
    try {
      await globalThis.OlympyApi.cameraConsent(
        { olympiad: liveOlympiad.backendId },
        globalThis.OlympyApi.getToken(),
      );
    } catch {
      /* rozilik yozuvi vaqtincha muvaffaqiyatsiz bo'lsa ham kamera oqimini
         davom ettiramiz — asosiy himoya kamera va detektsiya */
    }
    let stream = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('no_camera_api');
      }
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      liveStreamRef.current = stream;
    } catch {
      setCameraError(
        "Kamera ruxsati berilmadi. Bu olimpiada webkamera nazorati bilan "
        + "o'tkaziladi — davom etish uchun brauzer sozlamalaridan kameraga "
        + "ruxsat bering va qayta urinib ko'ring.",
      );
      setCameraStarting(false);
      return;
    }
    try {
      const monitor = await globalThis.OlympyFaceProctor.start({
        stream,
        onWarn: (msg) => setCheatWarning(msg),
        onReport: (reason) => reportCheating(reason),
      });
      faceMonitorRef.current = monitor;
    } catch {
      // FaceMonitor yuklanmasa (masalan model yuklab bo'lmasa) — kamera
      // stream'ini yopamiz va rozilikni tasdiqlaymiz. Detektsiyasiz ham
      // imtihon davom etadi (boshqa passiv signallar ishlaydi), lekin
      // studentni bloklamaymiz.
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
    }
    setCameraConsentAcked(true);
    setCameraStarting(false);
  }, [cameraStarting, user?._api, liveOlympiad?.backendId, reportCheating]);

  // Nazoratchi (Admin/Direktor/O'qituvchi) so'raganda jonli kadr va audio uzatish
  const startLiveFrameStreaming = React.useCallback((sessionId) => {
    if (liveFrameUploadTimerRef.current || !sessionId) return;

    if (!liveVideoElRef.current) {
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      liveVideoElRef.current = vid;
    }
    if (liveStreamRef.current && liveVideoElRef.current.srcObject !== liveStreamRef.current) {
      liveVideoElRef.current.srcObject = liveStreamRef.current;
      liveVideoElRef.current.play().catch(() => {});
    }

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    liveFrameUploadTimerRef.current = setInterval(async () => {
      if (cheatReportedRef.current || !sessionId) {
        if (liveFrameUploadTimerRef.current) {
          clearInterval(liveFrameUploadTimerRef.current);
          liveFrameUploadTimerRef.current = null;
        }
        return;
      }
      try {
        let frameData = null;
        const vid = liveVideoElRef.current;
        if (liveStreamRef.current && vid && vid.videoWidth > 0) {
          ctx.drawImage(vid, 0, 0, 320, 240);
          frameData = canvas.toDataURL('image/jpeg', 0.55);
        }

        let audioLevel = 0;
        if (liveAudioContextRef.current?.analyser) {
          const { analyser, dataArray } = liveAudioContextRef.current;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          audioLevel = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
        }

        const token = globalThis.OlympyApi?.getToken?.() ?? globalThis.OlympyApi?.loadAuth?.()?.token;
        if (token && (frameData || audioLevel > 0)) {
          await globalThis.OlympyApi.sendLiveProctorFrame(sessionId, {
            frame: frameData,
            audio_level: audioLevel,
            face_detected: true,
            speech_detected: audioLevel > 35,
          }, token);
        }
      } catch {}
    }, 1200);
  }, []);

  // Ovoz nazorati rozilik oqimi: (1) backend'ga rozilikni yozamiz,
  // (2) mikrofon ruxsatini so'raymiz, (3) VoiceMonitor'ni lazy yuklab ishga
  // tushiramiz. Mikrofon ruxsati berilmasa — imtihon boshlanmaydi (bu olimpiada
  // uchun mikrofon MAJBURIY). Hech qanday audio saqlanmaydi. Kamera oqimidan
  // mustaqil naqsh.
  const handleVoiceConsent = React.useCallback(async () => {
    if (voiceStarting) return;
    if (!user?._api || !liveOlympiad?.backendId) return;
    setVoiceStarting(true);
    setVoiceError('');
    // Rozilikni serverga yozamiz (faqat boolean + vaqt). Mikrofon ruxsatidan
    // OLDIN yuboramiz — student aynan roziligini bildirdi.
    try {
      await globalThis.OlympyApi.microphoneConsent(
        { olympiad: liveOlympiad.backendId },
        globalThis.OlympyApi.getToken(),
      );
    } catch {
      /* rozilik yozuvi vaqtincha muvaffaqiyatsiz bo'lsa ham mikrofon oqimini
         davom ettiramiz — asosiy himoya mikrofon va detektsiya */
    }
    let stream = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('no_microphone_api');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          const src = actx.createMediaStreamSource(stream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 256;
          src.connect(analyser);
          liveAudioContextRef.current = { ctx: actx, analyser, dataArray: new Uint8Array(analyser.frequencyBinCount) };
        }
      } catch {}
    } catch {
      setVoiceError(
        "Mikrofon ruxsati berilmadi. Bu olimpiada ovoz nazorati bilan "
        + "o'tkaziladi — davom etish uchun brauzer sozlamalaridan mikrofonga "
        + "ruxsat bering va qayta urinib ko'ring.",
      );
      setVoiceStarting(false);
      return;
    }
    try {
      const monitor = await globalThis.OlympyVoiceProctor.start({
        stream,
        onWarn: (msg) => setCheatWarning(msg),
        onReport: (reason) => reportCheating(reason),
      });
      voiceMonitorRef.current = monitor;
    } catch {
      // VoiceMonitor yuklanmasa — mikrofon stream'ini yopamiz va rozilikni
      // tasdiqlaymiz. Detektsiyasiz ham imtihon davom etadi (boshqa passiv
      // signallar ishlaydi), lekin studentni bloklamaymiz.
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
    }
    setVoiceConsentAcked(true);
    setVoiceStarting(false);
  }, [voiceStarting, user?._api, liveOlympiad?.backendId, reportCheating]);

  // FaceMonitor'ni yakuniy holatlarda (submit/DQ) va unmount'da to'xtatamiz —
  // tab-switch listenerlari tozalanishi bilan bir xil naqsh.
  React.useEffect(() => {
    if (submitted || cheated) {
      if (faceMonitorRef.current) {
        try { faceMonitorRef.current.stop(); } catch {}
        faceMonitorRef.current = null;
      }
      if (voiceMonitorRef.current) {
        try { voiceMonitorRef.current.stop(); } catch {}
        voiceMonitorRef.current = null;
      }
    }
  }, [submitted, cheated]);
  React.useEffect(() => () => {
    if (faceMonitorRef.current) {
      try { faceMonitorRef.current.stop(); } catch {}
      faceMonitorRef.current = null;
    }
    if (voiceMonitorRef.current) {
      try { voiceMonitorRef.current.stop(); } catch {}
      voiceMonitorRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    // pendingReview holatida (tekshiruv kutilmoqda) 3-/4-marta tab almashtirish
    // hech narsa qilmasligi kerak — listenerlar umuman ulanmaydi.
    if (!user?._api || !liveOlympiad?.backendId || apiTotal === 0 || submitted || cheated || pendingReview) {
      return undefined;
    }
    // Cheating siyosati: son asosida. Tab/ilovani tark etish soni
    // hisoblanadi. 1-marta chiqishda ogohlantirish, 2-marta chiqishda
    // darhol disqualifikatsiya. Ogohlantirish foydalanuvchi qaytib
    // kelganda ham qoladi — tozalanmaydi.
    //
    // Hodisani bir marta hisoblash: blur va visibilitychange ko'pincha birga
    // otiladi (tab almashtirilganda ikkalasi ham "hidden" holatga keladi).
    // hiddenEventFiredRef bayrog'i orqali bitta tark etishni faqat bir marta
    // sanaymiz.
    //
    // 4 soniyalik imtiyoz muddati: OS/ilova bildirishnomasi (notification
    // popup) yoki shunga o'xshash narsalar oyna fokusini bir zumga o'g'irlab
    // ketsa, bu yolg'on disqualifikatsiyaga olib kelmasligi kerak. Shu sababli
    // yashirin hodisa darhol hisoblanmaydi — faqat tab/oyna 4 soniya davomida
    // uzluksiz yashirin qolsagina tark etish sifatida sanaladi. Ag'ar
    // foydalanuvchi tez qaytib kelsa (onVisible), taymer bekor qilinadi.
    const HIDDEN_GRACE_MS = 4000;
    const onHidden = () => {
      if (!cheatGuardActiveRef.current) return;
      if (hiddenEventFiredRef.current) return; // allaqachon hisoblangan/kutilmoqda
      hiddenEventFiredRef.current = true;
      hiddenTimerRef.current = setTimeout(() => {
        hiddenTimerRef.current = null;
        tabSwitchCountRef.current += 1;
        if (tabSwitchCountRef.current >= 2) {
          reportCheating('tab_or_app_left');
        } else {
          setCheatWarning(
            "Diqqat! Olimpiada vaqtida tabni almashtirdingiz. "
            + "Keyingi marta disqualifikatsiya qilinasiz."
          );
        }
        sendPing();
      }, HIDDEN_GRACE_MS);
    };
    const onVisible = () => {
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
      hiddenEventFiredRef.current = false;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHidden();
      else if (document.visibilityState === 'visible') onVisible();
    };
    const onBlur = () => onHidden();
    const onFocus = () => onVisible();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };
  }, [user?._api, liveOlympiad?.backendId, apiTotal, submitted, cheated, pendingReview, reportCheating, sendPing]);

  // Qo'shimcha passiv cheating detektorlari — nusxa olish/kesish/qo'yish,
  // to'liq ekrandan chiqish, DevTools ochilishi va bir nechta monitor.
  // MUHIM: hech qanday preventDefault YO'Q — faqat hodisa otilganini kuzatamiz
  // va tab-almashtirish bilan bir xil `reportCheating()` oqimidan yuboramiz
  // (backend session'ni PENDING_REVIEW ga o'tkazadi, auto-DQ yo'q). Guard
  // sharti tab-almashtirish effekti bilan bir xil.
  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || apiTotal === 0 || submitted || cheated || pendingReview) {
      return undefined;
    }

    // 1) Nusxa olish / kesish / qo'yish urinishi. Passiv — brauzer standart
    //    xatti-harakati bloklanmaydi. `reportCheating` allaqachon idempotent,
    //    shu sababli takroriy hodisalar spam qilmaydi.
    const onCopyPaste = () => {
      if (!cheatGuardActiveRef.current) return;
      reportCheating('copy_paste_attempt');
    };

    // 2) To'liq ekrandan chiqish. Faqat oldin to'liq ekranga kirilgan
    //    bo'lsagina (transition) hisoblanadi — hech qachon kirilmagan bo'lsa
    //    yolg'on signal yubormaydi.
    const onFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      if (isFs) {
        wasFullscreenRef.current = true;
      } else if (wasFullscreenRef.current) {
        wasFullscreenRef.current = false;
        if (!cheatGuardActiveRef.current) return;
        reportCheating('fullscreen_exit');
      }
    };

    // 3) DevTools ochilishi (heuristika) + 4) bir nechta monitor. Ikkalasi ham
    //    davriy tekshiriladi; faqat holat o'zgarishida bir marta yuboriladi.
    const DEVTOOLS_THRESHOLD = 160;
    const checkSignals = () => {
      if (!cheatGuardActiveRef.current) return;
      // DevTools: docklangan panel outer/inner o'lchamlar farqini oshiradi.
      const widthGap = (window.outerWidth || 0) - (window.innerWidth || 0);
      const heightGap = (window.outerHeight || 0) - (window.innerHeight || 0);
      const devtoolsOpen = widthGap > DEVTOOLS_THRESHOLD || heightGap > DEVTOOLS_THRESHOLD;
      if (devtoolsOpen && !devtoolsOpenRef.current) {
        devtoolsOpenRef.current = true;
        reportCheating('devtools_open');
      } else if (!devtoolsOpen) {
        devtoolsOpenRef.current = false;
      }

      // Bir nechta monitor: Window Management API `screen.isExtended` —
      // ruxsatsiz ishlaydi va bir nechta displey ulangan bo'lsa true qaytaradi.
      if (!multiMonitorReportedRef.current) {
        try {
          if (typeof window.screen?.isExtended === 'boolean') {
            if (window.screen.isExtended) {
              multiMonitorReportedRef.current = true;
              reportCheating('multi_monitor_detected');
            }
          } else if (typeof window.getScreenDetails === 'function') {
            // Fallback: ruxsat berilgan bo'lsa displeylar sonini tekshiramiz.
            window.getScreenDetails()
              .then((details) => {
                if (details?.screens?.length > 1 && !multiMonitorReportedRef.current) {
                  multiMonitorReportedRef.current = true;
                  reportCheating('multi_monitor_detected');
                }
              })
              .catch(() => {});
          }
        } catch {}
      }
    };

    checkSignals();
    const signalTimer = setInterval(checkSignals, 3000);
    document.addEventListener('copy', onCopyPaste);
    document.addEventListener('cut', onCopyPaste);
    document.addEventListener('paste', onCopyPaste);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      clearInterval(signalTimer);
      document.removeEventListener('copy', onCopyPaste);
      document.removeEventListener('cut', onCopyPaste);
      document.removeEventListener('paste', onCopyPaste);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [user?._api, liveOlympiad?.backendId, apiTotal, submitted, cheated, pendingReview, reportCheating]);

  // Har `answers`/`marked` o'zgarganda lokal saqlash. Submit/cheating
  // paytida tozalash uchun pastdagi cleanup logikasi mavjud.
  React.useEffect(() => {
    try {
      if (typeof localStorage === 'undefined' || !answersStorageKey) return;
      localStorage.setItem(answersStorageKey, JSON.stringify(answers || {}));
    } catch {}
  }, [answers, answersStorageKey]);

  React.useEffect(() => {
    try {
      if (typeof localStorage === 'undefined' || !markedStorageKey) return;
      localStorage.setItem(markedStorageKey, JSON.stringify(marked || {}));
    } catch {}
  }, [marked, markedStorageKey]);

  React.useEffect(() => {
    try {
      if (typeof localStorage === 'undefined' || !codeStorageKey) return;
      localStorage.setItem(codeStorageKey, JSON.stringify(codeAnswers || {}));
    } catch {}
  }, [codeAnswers, codeStorageKey]);

  const clearPersistedAnswers = React.useCallback(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      if (answersStorageKey) localStorage.removeItem(answersStorageKey);
      if (markedStorageKey) localStorage.removeItem(markedStorageKey);
      if (codeStorageKey) localStorage.removeItem(codeStorageKey);
    } catch {}
  }, [answersStorageKey, markedStorageKey, codeStorageKey]);

  // Oflayn outbox'ni bo'shatish: submit paytida tarmoq uzilib javoblar
  // navbatga qo'yilgan bo'lsa (offlineQueued), bu ekran ochilishi bilan darhol
  // (agar allaqachon onlayn bo'lsa) va har safar aloqa tiklanganda ('online')
  // qayta yuborishga urinamiz. Backend idempotent, shu sababli qayta urinish
  // xavfsiz. Muvaffaqiyatda odatdagi post-submit oqimiga (onFinish → natijalar)
  // o'tamiz — go'yo hozirgina yuborilgandek.
  React.useEffect(() => {
    if (!offlineQueued || !globalThis.OlympyOfflineQueue) return undefined;
    let cancelled = false;
    const onSubmitted = (item, resp) => {
      if (cancelled) return;
      clearPersistedAnswers();
      const maxPossible = TEST_QUESTIONS.reduce((sum, qq) => sum + ((qq && qq.score) || 3), 0);
      onFinish({
        attemptId: resp?.id,
        correct: resp?.correct_count ?? 0,
        wrong: resp?.wrong_count ?? 0,
        score: resp?.score ?? 0,
        total: resp?.total_questions ?? TOTAL,
        rank: resp?.rank ?? resp?.position ?? null,
        time: resp?.time_spent ?? item?.payload?.time_spent ?? null,
        maxScore: resp?.max_score ?? (maxPossible || undefined),
        olympiad: liveOlympiad || olympiad,
        _api: true,
      });
    };
    const onAlreadySubmitted = () => {
      // Server "allaqachon topshirilgan" deydi — asl so'rov aslida serverga
      // yetib borgan. Bu XATO EMAS: javoblar saqlangan, natijani dashboard'da
      // ko'radi. Muvaffaqiyat sifatida qabul qilamiz.
      if (cancelled) return;
      clearPersistedAnswers();
      onNavigate('student');
    };
    const onExpired = () => {
      if (cancelled) return;
      clearPersistedAnswers();
      setOfflineQueued(false);
      setSubmitted(false);
      setSubmitError('Vaqt tugagani sababli javoblar qabul qilinmadi.');
    };
    const onError = (item, err) => {
      if (cancelled) return;
      clearPersistedAnswers();
      setOfflineQueued(false);
      setSubmitted(false);
      setSubmitError(err?.data?.detail || "Javoblar yuborilmadi. Qayta urinib ko'ring.");
    };
    const drain = () => {
      globalThis.OlympyOfflineQueue.drainOutbox({
        onSubmitted, onAlreadySubmitted, onExpired, onError,
      });
    };
    offlineDrainRef.current = drain;
    drain(); // darhol urinish — allaqachon onlayn bo'lishi mumkin
    window.addEventListener('online', drain);
    return () => {
      cancelled = true;
      offlineDrainRef.current = null;
      window.removeEventListener('online', drain);
    };
  }, [offlineQueued, TEST_QUESTIONS, TOTAL, onFinish, onNavigate, liveOlympiad, olympiad, clearPersistedAnswers]);

  React.useEffect(() => {
    // apiTotal===0 — hali birinchi savol yuklanmagan; mock rejimda apiTotal
    // doim 0, lekin u yerda ping baribir ishlamaydi (user?._api guard).
    // Istisno: pendingReview true bo'lsa (masalan, tabni qayta ochganda darhol
    // pending holat kelgan bo'lsa) apiTotal===0 bo'lsa ham polling boshlanadi —
    // aks holda tekshiruv natijasini (resume/DQ) aniqlab bo'lmasdi.
    if (!user?._api || !liveOlympiad?.backendId || submitted || cheated || (apiTotal === 0 && !pendingReview)) return undefined;
    sendPing();
    // Adaptiv interval: tekshiruv kutilayotganda tezroq (3s) — student qarorni
    // kam kechikish bilan ko'radi; aks holda oddiy 15s heartbeat.
    const intervalMs = pendingReview ? 3000 : 15000;
    const interval = setInterval(sendPing, intervalMs);
    return () => clearInterval(interval);
  }, [user?._api, liveOlympiad?.backendId, submitted, cheated, apiTotal, pendingReview, sendPing]);

  React.useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sendPing();
    }
  }, [answers, sendPing]);

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  // Javob "haqiqatda berilgan"mi? Savol turiga qarab format farq qiladi:
  // MCQ/yes_no → son (-1 = o'tkazib yuborilgan kod, baribir javob), matnli
  // turlar → {text}/{blanks}, multiple_select → {selected:[...]}. Bo'sh matn /
  // bo'sh tanlov "javob berilmagan" hisoblanadi (navigator/progress aniq
  // bo'lsin uchun).
  const isAnswerFilled = (val) => {
    if (val === undefined || val === null) return false;
    if (typeof val === 'object') {
      if (Array.isArray(val.selected)) return val.selected.length > 0;
      if (typeof val.text === 'string') return val.text.trim().length > 0;
      if (val.blanks && typeof val.blanks === 'object') {
        return Object.values(val.blanks).some(v => String(v ?? '').trim().length > 0);
      }
      if (typeof val.chosen_idx === 'number') return true;
      if (typeof val.value === 'number') return true; // slider
      return false;
    }
    return true; // son (MCQ indeks, -1 ham javob deb sanaladi)
  };
  // Javob berilgan savollar: answers (barcha tur) + kod yozilgan savollar.
  // Bir savol ikkalasida ham bo'lmaydi, shu sababli unique indekslar.
  const answeredIndexes = new Set([
    ...Object.keys(answers).filter(k => isAnswerFilled(answers[k])),
    ...Object.keys(codeAnswers).filter(k => String(codeAnswers[k]?.code || '').trim()),
  ]);
  const answered = answeredIndexes.size;
  const progress = TOTAL ? (answered / TOTAL) * 100 : 0;
  // 3 bosqichli ogohlantirish: avval (>5 daqiqa) oddiy, keyin (5 daqiqadan
  // kam) och sariq ogohlantirish, oxirida (1 daqiqadan kam) qizil + pulse —
  // avval faqat 2 daqiqada bitta statik rang o'zgarishi bo'lardi, stressli
  // talaba buni osongina payqamay qolishi mumkin edi.
  const isWarning = timeLeft < 300 && timeLeft >= 60;
  const isUrgent = timeLeft < 60;

  // MCQ/yes_no: option indeksini saqlaymiz (orqaga-moslik uchun oddiy son).
  const handleAnswer = (optIdx) => setAnswers(prev => ({ ...prev, [current]: optIdx }));
  // Matnli turlar (fill_blank/essay): {text}. Bo'sh bo'lsa ham yozamiz —
  // isAnswerFilled "javob berilgan"ni baholaydi, lekin draft saqlash uchun
  // kiritilayotgan matn yo'qolmasligi kerak.
  const handleTextAnswer = (text) => setAnswers(prev => ({ ...prev, [current]: { text } }));
  // fill_blanks: {blanks: {"1": "...", ...}}. Bitta bo'sh joyni yangilaymiz.
  const handleBlankAnswer = (blankIndex, text) => setAnswers(prev => {
    const cur = (prev[current] && typeof prev[current] === 'object' && prev[current].blanks) || {};
    return { ...prev, [current]: { blanks: { ...cur, [String(blankIndex)]: text } } };
  });
  // multiple_select: {selected: [idx,...]}. Tanlovni toggle qilamiz.
  const handleMultiToggle = (optIdx) => setAnswers(prev => {
    const cur = (prev[current] && typeof prev[current] === 'object' && Array.isArray(prev[current].selected))
      ? prev[current].selected
      : [];
    const next = cur.includes(optIdx) ? cur.filter(i => i !== optIdx) : [...cur, optIdx];
    return { ...prev, [current]: { selected: next } };
  });
  // yes_no: {chosen_idx: 0|1}.
  const handleYesNo = (idx) => setAnswers(prev => ({ ...prev, [current]: { chosen_idx: idx } }));
  // slider: {value: son}. Variant yo'q — xom raqam serverga shundayligicha
  // yuboriladi (de-shuffle qilinmaydi).
  const handleSlider = (num) => setAnswers(prev => ({ ...prev, [current]: { value: num } }));
  const toggleMark = () => setMarked(prev => ({ ...prev, [current]: !prev[current] }));
  // Olimpiadaning ruxsat etilgan tillari (bo'sh bo'lsa barcha til ruxsat).
  const allowedLanguages = Array.isArray(liveOlympiad?.allowedLanguages)
    ? liveOlympiad.allowedLanguages
    : [];
  // Joriy kod savoli uchun default til: savolning tili → olimpiadaning
  // birinchi ruxsat etilgan tili → python.
  const currentCodeLang = (qq) => (
    codeAnswers[current]?.language
    || qq?.programmingLanguage
    || qq?.programming_language
    || allowedLanguages[0]
    || 'python'
  );
  // Kod savol uchun joriy savol kodini va tilini yangilash.
  const handleCodeChange = (code) => {
    const qq = TEST_QUESTIONS[current] || cachedQuestionsRef.current[current];
    setCodeAnswers(prev => ({
      ...prev,
      [current]: { code, language: prev[current]?.language || currentCodeLang(qq) },
    }));
  };
  const handleCodeLanguage = (language) => setCodeAnswers(prev => ({
    ...prev,
    [current]: { code: prev[current]?.code || '', language },
  }));
  // O'quvchi test paytida kodini AI orqali sinaydi (saqlanmaydi — faqat
  // feedback). Rate limit: 10/hour (backend). Faqat API rejimida ishlaydi.
  const handleRunCodeReview = async (qq) => {
    if (!user?._api || !qq?.id) return;
    const code = String(codeAnswers[current]?.code || '');
    if (!code.trim()) return;
    setCodeReviewLoading(true);
    try {
      const token = globalThis.OlympyApi.getToken();
      const res = await globalThis.OlympyApi.reviewCode(
        { question_id: qq.id, submitted_code: code, language: currentCodeLang(qq) },
        token,
        aiAbort.getSignal(),
      );
      setCodeReview(prev => ({ ...prev, [current]: { score: res?.score, review: res?.review || '' } }));
    } catch (err) {
      // Unmount'da atayin bekor qilindi — ko'rsatadigan ekran ham yo'q.
      if (aiAbort.isAborted()) return;
      const detail = err?.data?.detail || err?.message || "AI tekshiruvni bajarib bo'lmadi.";
      setCodeReview(prev => ({ ...prev, [current]: { score: null, review: detail } }));
    } finally {
      setCodeReviewLoading(false);
    }
  };
  // O'quvchi kodini Judge0 orqali ishga tushiradi ("Ishga tushirish" tugmasi).
  // Test case'lar backend'da (DB'dan) tekshiriladi — frontend yuklamaydi.
  // Faqat API rejimida ishlaydi. Rate limit: 20/hour (backend).
  const handleRunCode = async (qq) => {
    if (!user?._api || !qq?.id) return;
    const code = String(codeAnswers[current]?.code || '');
    if (!code.trim()) return;
    setRunningIndex(current);
    const idx = current;
    try {
      const token = globalThis.OlympyApi.getToken();
      const res = await globalThis.OlympyApi.runCode(
        { source_code: code, language: currentCodeLang(qq), question_id: qq.id },
        token,
        aiAbort.getSignal(),
      );
      setRunResults(prev => ({ ...prev, [idx]: res }));
    } catch (err) {
      if (aiAbort.isAborted()) return;
      const detail = err?.data?.detail || err?.message || "Kodni ishga tushirib bo'lmadi.";
      setRunResults(prev => ({ ...prev, [idx]: { status: 'Xato', error: detail } }));
    } finally {
      setRunningIndex(null);
    }
  };

  // Kod savolni o'tkazib yuborish: joriy savolni xato (answer = -1) deb
  // belgilab keyingisiga o'tamiz. Backend submit'da answer = -1 noto'g'ri
  // javob sifatida 0 ball oladi — alohida skip logikasi shart emas.
  const handleSkipCode = () => {
    setAnswers(prev => ({ ...prev, [current]: -1 }));
    setCodeAnswers(prev => ({ ...prev, [current]: { code: '', skipped: true } }));
    if (current < TOTAL - 1) {
      setCurrent(prev => prev + 1);
    } else {
      setConfirmModal(true);
    }
  };

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
      // answersRef.current — har doim oxirgi holat (stale closure muammoidan xalos).
      const currentAnswers = answersRef.current || answers;
      const formattedAnswers = {};
      Object.entries(currentAnswers).forEach(([idx, optIdx]) => {
        const i = parseInt(idx, 10);
        // Per-question yuklashda savol siyrak massivda; keshdan ham qidiramiz.
        const q = TEST_QUESTIONS[i] || cachedQuestionsRef.current[i];
        if (q) formattedAnswers[q.id] = optIdx;
      });

      // Kod (IT) javoblari: { "<question_id>": { code, language } }. Faqat
      // bo'sh bo'lmagan kodlar yuboriladi. Oddiy MCQ olimpiadalarda bo'sh dict.
      const currentCodeAnswers = codeAnswersRef.current || codeAnswers;
      const formattedCodeAnswers = {};
      Object.entries(currentCodeAnswers).forEach(([idx, payload]) => {
        const i = parseInt(idx, 10);
        const q = TEST_QUESTIONS[i] || cachedQuestionsRef.current[i];
        const code = String(payload?.code || '');
        if (q && code.trim()) {
          formattedCodeAnswers[q.id] = {
            code,
            language: payload?.language || q.programmingLanguage || q.programming_language || '',
          };
        }
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
        ? TEST_QUESTIONS.filter((q, i) => currentAnswers[i] === (q.correctAnswer ?? q.correct)).length
        : null;
      const wrong = correct == null ? null : TOTAL - correct;
      const earnedScore = hasLocalCorrectness
        ? TEST_QUESTIONS.reduce((sum, q, i) => {
            return currentAnswers[i] === (q.correctAnswer ?? q.correct) ? sum + (q.score || 3) : sum;
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
        // submitPayload try'dan TASHQARIDA e'lon qilinadi — catch bloki tarmoq
        // xatosida uni oflayn outbox'ga navbatga qo'yish uchun ko'ra olishi kerak.
        let submitPayload = null;
        try {
          if (numericOlympiadId == null) throw new Error('Missing olympiad id');
          const token = globalThis.OlympyApi?.getToken?.()
            ?? globalThis.OlympyApi?.loadAuth?.()?.token;
          submitPayload = { olympiad: numericOlympiadId, answers: formattedAnswers, time_spent: timeSpent };
          // Kod javoblar bo'lsagina qo'shamiz (oddiy MCQ submit'ni o'zgartirmaslik uchun).
          if (Object.keys(formattedCodeAnswers).length > 0) {
            submitPayload.code_answers = formattedCodeAnswers;
          }
          const resp = await globalThis.OlympyApi.submitAttempt(submitPayload, token);
          clearPersistedAnswers();
          onFinish({
            attemptId: resp?.id,
            correct: resp?.correct_count ?? (correct ?? 0),
            wrong: resp?.wrong_count ?? (wrong ?? 0),
            // API rejimida backend score'i avtoritar; localScore null bo'lsa,
            // 0 emas, balki backend qiymati ko'rsatiladi.
            score: resp?.score ?? (localScore ?? 0),
            total: resp?.total_questions ?? TOTAL,
            // Y11: backend yangi `position` field ham qaytaradi — rank
            // submit paytida DB'da yangilanmasligi sababli `rank` None
            // bo'lishi mumkin. position joriy attempt'ning shu olimpiada
            // bo'yicha tartibini qaytaradi.
            rank: resp?.rank ?? resp?.position ?? localRank,
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
          // O2: backend "allaqachon qatnashgansiz" qaytarsa shu xabarni
          // foydalanuvchiga aniq ko'rsatamiz — "Javoblar yuborilmadi"
          // umumiy matn chalkash bo'lardi.
          if (/allaqachon/i.test(detail)) {
            setSubmitError(detail);
            setSubmitted(false);
            return;
          }
          // Token muddati tugagan bo'lsa — javoblar localStorage'da qoldi,
          // foydalanuvchini logout qilmasdan qayta login qilishi uchun
          // aniq xabar ko'rsatamiz. Login muvaffaqiyatidan keyin avtomatik
          // shu olimpiada test sahifasiga qaytariladi (App.tryResumePendingOlympiad).
          if (err?.status === 401 || err?.data?.code === 'session_expired') {
            try {
              if (numericOlympiadId != null) {
                localStorage.setItem('olympy:pendingOlympiadReturn', String(numericOlympiadId));
              }
            } catch {}
            setSubmitError(
              "Sessiya tugadi. Iltimos, qayta kiring va Yuborish tugmasini qayta bosing. "
              + "Javoblaringiz brauzerda saqlangan."
            );
            setSubmitted(false);
            return;
          }
          // Haqiqiy tarmoq xatosi (status 0 — internet yo'q / server o'chiq).
          // Validatsiya/4xx EMAS. Javoblarni oflayn "outbox"'ga navbatga
          // qo'yamiz va aloqa tiklangach avtomatik yuboriladi. Foydalanuvchi
          // qayta urinib o'tirmasligi uchun xotirjam qiluvchi xabar beramiz.
          const isNetworkError = err?.status === 0 && err?.message !== 'aborted';
          if (isNetworkError && numericOlympiadId != null && submitPayload && globalThis.OlympyOfflineQueue) {
            try {
              await globalThis.OlympyOfflineQueue.enqueueSubmit({
                olympiadId: numericOlympiadId,
                payload: submitPayload,
              });
              // submitted=true qoladi (imtihon ekrani yashiriladi), oflayn
              // ekran ko'rsatiladi. Draining effekti aloqa tiklanishini kutadi.
              setOfflineQueued(true);
              return;
            } catch {
              // Outbox yozib bo'lmadi (IndexedDB yo'q/quota) — umumiy xatoga
              // tushamiz. Javoblar baribir localStorage'da qolgan.
            }
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
        clearPersistedAnswers();
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
    const totalSec = startDt ? Math.max(0, Math.floor((startDt.getTime() - currentTime.getTime()) / 1000)) : 0;
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const countdownEl = (
      <div className="mt-6 space-y-4">
        <div className="text-xs text-text-secondary uppercase tracking-widest font-extrabold">Boshlanishigacha qoldi</div>
        <div className="flex justify-center gap-2">
          {hours > 0 && (
            <div className="rounded-2xl border border-edge bg-surface-2 p-3 min-w-[70px]">
              <div className="text-3xl font-display font-bold font-data text-text-primary leading-none">{String(hours).padStart(2, '0')}</div>
              <div className="text-[8px] text-text-secondary uppercase font-bold tracking-wider mt-1.5 leading-none">Soat</div>
            </div>
          )}
          <div className="rounded-2xl border border-edge bg-surface-2 p-3 min-w-[70px]">
            <div className="text-3xl font-display font-bold font-data text-text-primary leading-none">{String(minutes).padStart(2, '0')}</div>
            <div className="text-[8px] text-text-secondary uppercase font-bold tracking-wider mt-1.5 leading-none">Daqiqa</div>
          </div>
          {/* Soniya — akcent rangda ajratiladi; puls animatsiyasi olib
              tashlandi (yo'nalishda ambient harakat yo'q). */}
          <div className="rounded-2xl border border-edge bg-surface-2 p-3 min-w-[70px]">
            <div className="text-3xl font-display font-bold font-data text-accent leading-none">{String(seconds).padStart(2, '0')}</div>
            <div className="text-[8px] text-text-secondary uppercase font-bold tracking-wider mt-1.5 leading-none">Soniya</div>
          </div>
        </div>
      </div>
    );

    const eventLabel = eventTypeLabel(liveOlympiad?.eventType || 'competition');
    return (
      <PendingAccessCard
        title={`${eventLabel} hali boshlanmagan`}
        status="pending"
        message={`${eventLabel} ${startLabel} dan boshlanadi. Iltimos, kuting.`}
        extra={countdownEl}
        onBack={() => onNavigate('student')}
      />
    );
  }
  if (isAfterEnd) {
    return <PendingAccessCard title="Olimpiada tugagan" status="rejected"
      message="Bu olimpiadaga qatnashish muddati o'tib ketdi."
      onBack={() => onNavigate('student')} />;
  }
  // Webkamera nazorati roziligi — savollar YUKLANISHIDAN OLDIN. Faqat olimpiadada
  // `cameraProctoringEnabled` yoqilgan va rozilik hali berilmagan bo'lsa
  // ko'rsatiladi. Rozilik + kamera ruxsatisiz imtihon boshlanmaydi.
  if (cameraProctoringEnabled && !cameraConsentAcked && user?._api && liveOlympiad?.backendId && !submitted && !cheated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-edge bg-surface-1 p-6 md:p-8 max-w-lg w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-wash border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
              <Icon name="eye" size={20} />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-text-primary">Webkamera nazorati</h2>
              <p className="text-text-secondary text-xs mt-0.5">{olympiad?.title || 'Olimpiada'}</p>
            </div>
          </div>

          <div className="text-sm text-text-secondary leading-relaxed space-y-3">
            <p>
              Bu olimpiada webkamera orqali nazorat qilinadi. Kamera yordamida siz ekran
              oldida ekanligingiz va ekranga qarab turganingiz tekshiriladi (yuzingiz
              ko'rinishi, begona odam yo'qligi va nigohingiz).
            </p>
            <div className="rounded-xl bg-wash border border-success/40 px-4 py-3 text-success text-xs md:text-sm">
              <div className="flex items-start gap-2">
                <Icon name="check" size={15} className="text-success flex-shrink-0 mt-0.5" />
                <span>
                  Hech qanday video yoki ovoz <b>yozib olinmaydi</b> va serverga
                  <b> yuborilmaydi</b>. Faqat aniqlangan holat signallari (yuz bor/yo'q,
                  begona yuz, nigoh chetda) saqlanadi — tasvirning o'zi kompyuteringizdan
                  chiqmaydi.
                </span>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent flex-shrink-0"
              checked={cameraConsentChecked}
              onChange={e => setCameraConsentChecked(e.target.checked)}
            />
            <span className="text-sm text-text-primary">
              Yuqoridagilarni o'qidim va webkamera nazoratiga roziman.
            </span>
          </label>

          {cameraError && (
            <div className="rounded-xl bg-wash border border-error/40 px-4 py-3 text-error text-xs md:text-sm flex items-start gap-2">
              <Icon name="info" size={15} className="text-error flex-shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={() => onNavigate('student')} disabled={cameraStarting}
              className="btn-ghost flex-1 py-3 rounded-xl disabled:opacity-50">
              Bekor qilish
            </button>
            <button onClick={handleCameraConsent} disabled={!cameraConsentChecked || cameraStarting}
              className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {cameraStarting && <Spinner size={16} />}
              {cameraStarting ? 'Ulanmoqda...' : 'Davom etish'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  // Ovoz (mikrofon) nazorati roziligi — savollar YUKLANISHIDAN OLDIN. Faqat
  // olimpiadada `voiceProctoringEnabled` yoqilgan va rozilik hali berilmagan
  // bo'lsa ko'rsatiladi. Kamera roziligidan MUSTAQIL: agar ikkalasi ham yoqilgan
  // bo'lsa, avval kamera, so'ng shu ekran ko'rsatiladi. Rozilik + mikrofon
  // ruxsatisiz imtihon boshlanmaydi.
  if (voiceProctoringEnabled && !voiceConsentAcked && user?._api && liveOlympiad?.backendId && !submitted && !cheated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-edge bg-surface-1 p-6 md:p-8 max-w-lg w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-wash border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
              <Icon name="mic" size={20} />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-text-primary">Ovoz nazorati</h2>
              <p className="text-text-secondary text-xs mt-0.5">{olympiad?.title || 'Olimpiada'}</p>
            </div>
          </div>

          <div className="text-sm text-text-secondary leading-relaxed space-y-3">
            <p>
              Bu olimpiada mikrofon orqali nazorat qilinadi. Mikrofon yordamida imtihon
              vaqtida atrofingizdan gapirish yoki begona ovoz eshitilmayotgani tekshiriladi.
            </p>
            <div className="rounded-xl bg-wash border border-success/40 px-4 py-3 text-success text-xs md:text-sm">
              <div className="flex items-start gap-2">
                <Icon name="check" size={15} className="text-success flex-shrink-0 mt-0.5" />
                <span>
                  Hech qanday ovoz <b>yozib olinmaydi</b> va serverga <b>yuborilmaydi</b>.
                  Nutqingiz tahlil qilinmaydi — faqat kompyuteringizda "ovoz bor/yo'q"
                  degan signal aniqlanadi, ovozning o'zi qurilmangizdan chiqmaydi.
                </span>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-accent flex-shrink-0"
              checked={voiceConsentChecked}
              onChange={e => setVoiceConsentChecked(e.target.checked)}
            />
            <span className="text-sm text-text-primary">
              Yuqoridagilarni o'qidim va ovoz nazoratiga roziman.
            </span>
          </label>

          {voiceError && (
            <div className="rounded-xl bg-wash border border-error/40 px-4 py-3 text-error text-xs md:text-sm flex items-start gap-2">
              <Icon name="info" size={15} className="text-error flex-shrink-0 mt-0.5" />
              <span>{voiceError}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={() => onNavigate('student')} disabled={voiceStarting}
              className="btn-ghost flex-1 py-3 rounded-xl disabled:opacity-50">
              Bekor qilish
            </button>
            <button onClick={handleVoiceConsent} disabled={!voiceConsentChecked || voiceStarting}
              className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {voiceStarting && <Spinner size={16} />}
              {voiceStarting ? 'Ulanmoqda...' : 'Davom etish'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  // Tekshiruv kutilmoqda — student pauza ekranida kutadi. MUHIM: aniq sabab
  // OSHKOR QILINMAYDI (student aniqlash chegarasini bilib olmasligi uchun),
  // shunchaki umumiy "tekshirilmoqda" xabari. cheated'dan OLDIN tekshiriladi:
  // ikkalasi bir vaqtda true bo'lmaydi (resume/DQ paytida pendingReview avval
  // false bo'ladi), lekin oraliq holatda ham noto'g'ri ekran chiqmasin.
  if (pendingReview) {
    const reviewSpinner = (
      <div className="flex items-center justify-center">
        <Spinner size={32} className="text-warning" />
      </div>
    );
    return <PendingAccessCard
      title="Tekshirilmoqda"
      status="pending"
      message="Sizning harakatingiz menejer tomonidan tekshirilmoqda. Iltimos, kuting — sahifani yopmang."
      extra={reviewSpinner} />;
  }
  if (cheated) {
    return <PendingAccessCard title="Cheating aniqlandi" status="rejected"
      message={cheatMessage || "Siz cheating qildingiz. Olimpiada yakunlandi."}
      onBack={() => onNavigate('student')} />;
  }
  // Oflayn rejim: submit paytida tarmoq uzildi, javoblar navbatga qo'yildi.
  // Xotirjam qiluvchi ekran — aloqa tiklangach avtomatik yuboriladi.
  if (offlineQueued) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-warning/40 bg-surface-1 p-8 max-w-md text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-wash border border-warning/40 flex items-center justify-center text-warning mx-auto">
            <Icon name="clock" size={26} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-lg font-bold text-text-primary">Javoblaringiz saqlandi</h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              Internet aloqasi uzildi. Javoblaringiz qurilmangizda xavfsiz
              saqlandi va internet tiklangach avtomatik yuboriladi. Bu sahifani
              yopmang.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-text-secondary text-xs">
            <Spinner size={16} className="text-warning" />
            Aloqa kutilmoqda...
          </div>
          <button
            onClick={() => offlineDrainRef.current && offlineDrainRef.current()}
            className="btn-ghost px-4 py-2 rounded-xl text-sm font-semibold"
          >
            Hozir qayta urinish
          </button>
        </div>
      </div>
    );
  }
  // Faqat birinchi yuklash — butun ekranli spinner. Keyingi savollar
  // navigatsiyada inline spinner bilan ko'rsatiladi (pastda), test holatini
  // (header, timer, navigator) bo'shatmaslik uchun.
  if (initialQuestionsLoading) {
    if (loadingTimeout) {
      return <PendingAccessCard title="Yuklanishda muammo" status="pending"
        message="Savollarni yuklashda muammo yuz berdi. Sahifani yangilang yoki keyinroq urinib ko'ring."
        onBack={() => onNavigate('student')} />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-ground">
        <div className="flex flex-col items-center gap-4 text-text-secondary">
          <Spinner size={40} className="text-accent" />
          <div className="text-sm font-semibold">Savollar yuklanmoqda...</div>
          {slowLoading && (
            <div className="text-xs text-text-secondary max-w-xs text-center">
              Internet sekinroq bo'lishi mumkin, biroz kuting...
            </div>
          )}
        </div>
      </div>
    );
  }
  // Backend "boshlanmagan/faol emas" qaytargan bo'lsa — qora ekran o'rniga
  // aniq holat kartasi. isBeforeStart noto'g'ri false bo'lib qolgan holatlarni
  // ham shu yerda ushlaymiz.
  if (questionsError === '__not_started__') {
    return (
      <PendingAccessCard
        title="Olimpiada hali boshlanmagan"
        status="pending"
        message="Bu olimpiada hali boshlanmagan yoki faol emas. Boshlanish vaqtini kuting."
        onBack={() => onNavigate('student')}
      />
    );
  }
  // Haqiqiy savollar bo'lmasa, soxta savollar ko'rsatish o'rniga aniq
  // xatolik xabari beramiz — aks holda student haqiqiy bo'lmagan testni
  // topshirib qo'yardi va natija nol bo'lardi.
  if (TOTAL === 0) {
    return <PendingAccessCard
      title="Savollar yuklanmadi"
      status="rejected"
      message={questionsError || "Olimpiada savollari hozircha mavjud emas. Iltimos, keyinroq urinib ko'ring."}
      onBack={() => onNavigate('student')} />;
  }

  // Vaqt tugab avto-submit ketayotgan payt — savol ekranini emas, aniq
  // "Vaqt tugadi" o'tish ekranini ko'rsatamiz. submit muvaffaqiyatsiz
  // bo'lsa (submitting false'ga qaytadi) savol ekrani submitError banner
  // bilan qaytadi, foydalanuvchi qayta urinishi mumkin.
  if (timeUp && submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-ground">
        <div className="rounded-2xl border border-edge bg-surface-1 p-8 max-w-md text-center space-y-4">
          <Spinner size={44} className="text-accent" />
          <h2 className="font-display text-lg font-bold text-text-primary">Vaqt tugadi</h2>
          <p className="text-text-secondary text-sm">Javoblaringiz avtomatik yuborilmoqda, iltimos kuting...</p>
        </div>
      </div>
    );
  }

  const q = TEST_QUESTIONS[current];
  // Per-question yuklash: q hali kelmagan bo'lishi mumkin (navigatsiyada).
  // Bu holatda butun sahifani null qaytarmasdan, savol kartasi o'rnida inline
  // spinner ko'rsatamiz (header, timer, navigator joyida qoladi).
  const questionPending = !q || currentQuestionLoading;
  // Savol turi — backend question_type qaytaradi (mcq/code/multiple_select/
  // yes_no/essay/fill_blank/fill_blanks). Mock/store savollarda yo'q bo'lsa
  // 'mcq' deb qaraladi.
  const qType = q ? String(q.questionType || q.question_type || 'mcq') : 'mcq';
  // IT (kod) savol — backend question_type:'code' qaytaradi.
  const isCodeQuestion = qType === 'code';
  // Derive a "type" for True/False rendering even though store questions don't carry one
  const isTrueFalse = (q && !isCodeQuestion) ? (q.options || []).length === 2 && (q.options || []).every(o => /to'?g'?ri|no?to'?g'?ri/i.test(o)) : false;

  return (
    <div className="min-h-screen flex flex-col select-none bg-ground" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
      {/* Header bar */}
      <div className="bg-surface-1 border-b border-edge px-3 md:px-8 py-2.5 md:py-3 flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <BrandLogo compact size="xs" />
          <div className="min-w-0">
            <div className="text-[13px] md:text-sm font-bold text-text-primary truncate">{olympiad?.title || 'Matematika Olimpiadasi'}</div>
            <div className="text-[10px] md:text-xs text-text-secondary truncate">
              {olympiad?.subject}{liveOlympiad?.testLevel ? ` · ${liveOlympiad.testLevel}` : ''}{liveOlympiad?.testType ? ` · ${testTypeLabel(liveOlympiad.testType)}` : ''}
            </div>
          </div>
        </div>

        {/* Taymer — sahifadagi eng muhim raqam, shuning uchun uch qoida:

            1) `font-data` (tabular-nums) MAJBURIY: aks holda har sekundda
               raqam kengligi o'zgarib butun chip sakraydi.
            2) Fon `bg-wash`, `bg-error/10` kabi O'Z-O'ZINI tinlash EMAS: tint
               fonni matn rangiga tortadi va juftlik AA dan tushadi (o'lchandi:
               error/15 ustida 4.11 dark / 4.30 light). `wash` ustida esa
               5.47 dark / 5.35 light.
            3) `animate-pulse` yo'q: u shaffoflikni 0.5 gacha tushirib, aynan
               oxirgi daqiqada kontrastni ikki barobar pasaytirardi. Kuchayish
               harakat bilan emas — rang va to'liq kuchli hoshiya bilan. */}
        <div className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl md:rounded-2xl border font-data text-sm md:text-lg font-black transition-colors flex-shrink-0 ${
          isUrgent ? 'bg-wash text-error border-error'
            : isWarning ? 'bg-wash text-warning border-warning/40'
            : 'bg-surface-2 text-text-primary border-edge'
        }`}>
          <Icon name="clock" size={14} className={isUrgent ? 'text-error' : isWarning ? 'text-warning' : 'text-text-secondary'} />
          {formatTime(timeLeft)}
        </div>

        <button onClick={() => setConfirmModal(true)} disabled={submitting}
          className="btn-primary px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-semibold disabled:opacity-50 flex-shrink-0">
          <span className="hidden sm:inline">Yakunlash</span>
          <span className="sm:hidden">Tugatish</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-2">
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: 'rgb(var(--color-accent))' }} />
      </div>

      {/* Visibility-cheating ogohlantirish banner. Tab birinchi marta tark
          etilganda ko'rsatiladi va foydalanuvchi qaytsa ham qoladi.
          Ikkinchi marta tark etishda disqualifikatsiya yuz beradi. */}
      {cheatWarning && (
        <div className="bg-wash border-b border-warning/40 border-l-4 border-l-warning px-3 md:px-8 py-2 text-warning text-xs md:text-sm font-bold flex items-center gap-2">
          <Icon name="info" size={14} className="text-warning flex-shrink-0" />
          <span>{cheatWarning}</span>
        </div>
      )}

      {/* Mobile question strip — horizontal scrollable navigator */}
      <div className="md:hidden bg-surface-1 border-b border-edge">
        <div className="question-strip">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)} aria-pressed={i === current}
              className={`question-strip-btn font-data ${i === current ? 'current' : marked[i] ? 'marked' : isAnswerFilled(answers[i]) ? 'answered' : ''}`}>
              {i+1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question navigation sidebar — kod savolda yashiriladi (LeetCode
            split layoutiga joy kerak); mobil navigator pastda qoladi. */}
        <div className={`hidden md:flex flex-col bg-surface-1 border-r border-edge w-52 p-4 overflow-y-auto ${isCodeQuestion ? '!hidden' : ''}`}>
          <div className="text-xs text-text-secondary font-medium font-data mb-3">Savollar ({answered}/{TOTAL})</div>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)} aria-pressed={i === current}
                className={`question-nav-btn font-data ${i === current ? 'current' : marked[i] ? 'marked' : isAnswerFilled(answers[i]) ? 'answered' : ''}`}>
                {i+1}
              </button>
            ))}
          </div>
          {/* Izoh belgilari `.question-nav-btn` holat ranglariga MOS turishi
              shart (src/index.css): javob berildi → accent, belgilangan →
              warning, javobsiz → bo'sh yuza + edge hoshiya. */}
          <div className="space-y-1.5 mt-auto">
            {[
              { color: 'bg-accent', label: 'Javob berildi' },
              { color: 'bg-warning', label: 'Belgilangan' },
              { color: 'bg-surface-2 border border-edge-strong', label: 'Javobsiz' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-text-secondary">
                <div className={`w-3 h-3 rounded ${color}`} /> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        {isCodeQuestion && !questionPending ? (
          /* ── IT (kod) savol: LeetCode uslubidagi split layout ──────────
             Chap (40%) savol + boshlang'ich kod + cheklovlar, o'ng (60%)
             til tanlash + CodeEditor (to'liq baland) + ishga tushirish/AI
             tugmalari va natija paneli. Mobil (< md) — vertikal: tepada
             savol, pastda editor. Barcha funksiyalar (handleRunCode,
             handleRunCodeReview, codeAnswers, runResults, codeReview) o'sha. */
          <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row pb-28 md:pb-0">
            {/* CHAP — savol matni va boshlang'ich kod. Desktop'da o'z scroll'i,
                mobil'da butun konteyner scroll bo'ladi. */}
            <div className="md:w-2/5 md:min-w-[280px] flex flex-col md:border-r border-edge md:overflow-y-auto p-4 md:p-6 flex-shrink-0 md:flex-shrink">
              {/* Savol hisoblagichi + belgilash */}
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="text-xs text-text-secondary font-semibold uppercase tracking-wider font-data">
                  Savol <span className="text-text-primary">{current+1}</span> / {TOTAL}
                </div>
                <button onClick={toggleMark} aria-pressed={!!marked[current]}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-xl border transition-colors flex-shrink-0 ${marked[current] ? 'bg-wash text-warning border-warning/40' : 'bg-surface-1 text-text-secondary border-edge hover:border-edge-strong hover:text-text-primary'}`}>
                  <Icon name="star" size={13} /> {marked[current] ? 'Belgilangan' : 'Belgilash'}
                </button>
              </div>

              {submitError && (
                <div className="mb-4 flex items-center justify-between gap-3 bg-wash text-error rounded-xl px-3 py-3 text-xs border border-error/40">
                  <span className="flex items-center gap-2"><Icon name="info" size={15} /> {submitError}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* To'g'ridan-to'g'ri qayta yuborish — confirmModal'ni qayta ochmasdan */}
                    <button onClick={handleSubmit} disabled={submitting}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                      {submitting ? 'Yuborilmoqda...' : 'Qayta yuborish'}
                    </button>
                    {/* AI yordamni qo'lda ochish — yuqoridagi izohga qarang
                        (imtihon ekranida doimiy launcher yashirilgan). */}
                    <button type="button" onClick={() => globalThis.OlympyApi?.openSupportChat?.('exam_submit_error', submitError)}
                      className="text-xs underline underline-offset-2 whitespace-nowrap hover:opacity-80 cursor-pointer">
                      Yordam kerakmi?
                    </button>
                  </div>
                </div>
              )}

              {/* Savol matni */}
              <p className="text-text-primary text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words mb-4"><MathText text={q.text} /></p>

              {/* Boshlang'ich kod skelet (faqat o'qish) */}
              {(q.codeTemplate || q.code_template) ? (
                <div className="mt-1 mb-4">
                  <div className="mb-1.5 text-xs text-text-secondary">Boshlang'ich kod:</div>
                  <CodeEditor
                    value={q.codeTemplate || q.code_template}
                    readOnly
                    language={currentCodeLang(q)}
                    height="180px"
                  />
                </div>
              ) : null}

              {/* Til cheklovi ogohlantirishi */}
              {allowedLanguages.length > 0 && !allowedLanguages.includes(currentCodeLang(q)) && (
                <div className="mt-1 flex items-center gap-2 bg-wash text-warning rounded-xl px-3 py-2 text-xs border border-warning/40">
                  <Icon name="info" size={14} className="flex-shrink-0" />
                  Bu olimpiadada faqat {allowedLanguages.map(l => LANG_LABELS[l] || l).join(', ')} ishlatiladi
                </div>
              )}
            </div>

            {/* O'NG — kod muharriri. Desktop'da qolgan kenglikni to'ldiradi va
                ichki scroll bilan; mobil'da savol ostida vertikal joylashadi. */}
            <div className="md:flex-1 flex flex-col md:overflow-hidden md:min-h-0 border-t md:border-t-0 border-edge">
              {/* Yuqori bar: til tanlash + desktop savol navigatsiyasi.
                  Kod savolda sidebar yashirin, shu sababli prev/next shu yerda
                  (desktop). Mobil'da pastdagi sticky navigator ishlatiladi. */}
              <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-edge flex-shrink-0 overflow-x-auto scrollbar-none">
                <span className="text-xs text-text-secondary flex-shrink-0">Til:</span>
                {(allowedLanguages.length ? allowedLanguages : ['python', 'javascript', 'java', 'cpp', 'c']).map(lng => {
                  const active = currentCodeLang(q) === lng;
                  return (
                    <button key={lng} onClick={() => handleCodeLanguage(lng)} aria-pressed={active}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-colors flex-shrink-0 ${active ? 'bg-accent-fill text-on-accent border-accent-fill' : 'bg-surface-1 text-text-secondary border-edge hover:border-edge-strong hover:text-text-primary'}`}>
                      {LANG_LABELS[lng] || lng}
                    </button>
                  );
                })}
                <div className="hidden md:flex items-center gap-1.5 ml-auto flex-shrink-0">
                  <button onClick={() => setCurrent(Math.max(0, current-1))} disabled={current === 0}
                    className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30 flex items-center gap-1">
                    <Icon name="arrowLeft" size={14} /> Oldingi
                  </button>
                  {current < TOTAL-1 ? (
                    <button onClick={() => setCurrent(current+1)}
                      className="btn-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                      Keyingi <Icon name="chevronRight" size={14} />
                    </button>
                  ) : (
                    <button onClick={() => setConfirmModal(true)} disabled={submitting}
                      className="btn-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                      Yakunlash
                    </button>
                  )}
                </div>
              </div>

              {/* CodeEditor — qolgan barcha joyni to'ldiradi. CodeEditor 'height'
                  ga aniq piksel kerak; konteyner balandligini ResizeObserver
                  bilan o'lchaymiz (codeEditorHeight). Mobil'da host'ga sobit
                  balandlik (h-[60vh]) beriladi, desktop'da flex-1 qolgan joyni
                  egallaydi — ikkala holatda ham real balandlik o'lchanadi. */}
              <div ref={codeEditorHostRef} className="h-[60vh] md:h-auto md:flex-1 md:min-h-0 overflow-hidden p-3 md:p-4">
                <CodeEditor
                  value={codeAnswers[current]?.code || ''}
                  onChange={handleCodeChange}
                  language={currentCodeLang(q)}
                  height={`${Math.max(codeEditorHeight, 220)}px`}
                />
              </div>

              {/* Pastki bar: ishga tushirish / AI tekshirish + natija paneli.
                  Faqat API rejimida (Judge0/AI backend bilan). */}
              {user?._api && (() => {
                const isRunning = runningIndex === current;
                const runResult = runResults[current];
                return (
                <div className="border-t border-edge p-3 md:p-4 flex-shrink-0 max-h-[45%] overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSkipCode}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-error min-h-[40px]">
                      O'tkazib yuborish
                    </button>
                    <button
                      onClick={() => handleRunCode(q)}
                      disabled={isRunning || !String(codeAnswers[current]?.code || '').trim()}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 min-h-[40px] disabled:opacity-40">
                      {isRunning
                        ? <><Spinner size={16} /> Ishga tushirilmoqda...</>
                        : <><Icon name="play" size={14} /> Ishga tushirish</>}
                    </button>
                    <button
                      onClick={() => handleRunCodeReview(q)}
                      disabled={codeReviewLoading || !String(codeAnswers[current]?.code || '').trim()}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 min-h-[40px] disabled:opacity-40">
                      {codeReviewLoading
                        ? <><Spinner size={16} /> Tekshirilmoqda...</>
                        : <><Icon name="sparkles" size={14} /> AI bilan tekshirish</>}
                    </button>
                  </div>

                  {/* Judge0 natija paneli */}
                  {runResult && (
                    <div className="mt-3 rounded-2xl border border-edge bg-surface-1 p-3 md:p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${runResult.status === 'Accepted' ? 'text-success' : 'text-error'}`}>
                          ● {runResult.status || 'Xato'}
                        </span>
                        {runResult.time > 0 && (
                          <span className="text-text-secondary text-[11px] font-data">{runResult.time}s · {runResult.memory} KB</span>
                        )}
                      </div>

                      {/* Ulanish/xato (Judge0 umuman ishlamadi) */}
                      {runResult.error && (
                        <div className="text-xs text-error bg-wash border border-error/40 rounded-lg px-3 py-2 break-words">{runResult.error}</div>
                      )}

                      {/* stdout */}
                      {runResult.stdout && (
                        <div>
                          <div className="text-[11px] text-text-secondary mb-1">Natija:</div>
                          <pre className="bg-surface-2 border border-edge rounded-lg p-3 text-xs md:text-sm text-text-primary font-mono overflow-x-auto whitespace-pre-wrap break-words">{runResult.stdout}</pre>
                        </div>
                      )}

                      {/* stderr / compile error */}
                      {(runResult.stderr || runResult.compile_output) && (
                        <div>
                          <div className="text-[11px] text-error mb-1">Xato:</div>
                          <pre className="bg-surface-2 border border-error/40 rounded-lg p-3 text-xs md:text-sm text-error font-mono overflow-x-auto whitespace-pre-wrap break-words">{runResult.stderr || runResult.compile_output}</pre>
                        </div>
                      )}

                      {/* Test case natijalar */}
                      {Array.isArray(runResult.test_results) && runResult.test_results.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[11px] text-text-secondary mb-1">Test natijalar:</div>
                          {runResult.test_results.map((t, i) => (
                            <div key={i} className={`flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg border flex-wrap ${t.passed ? 'bg-wash text-success border-success/40' : 'bg-wash text-error border-error/40'}`}>
                              <span className="font-bold font-data">{t.passed ? '✓' : '✗'} Test {i + 1}</span>
                              {t.is_hidden
                                ? <span className="text-text-secondary">(yashirin)</span>
                                : <span className="text-text-secondary break-words">input: {String(t.input)} → {t.passed ? "to'g'ri" : `kutilgan: ${String(t.expected)}, olindi: ${String(t.got)}`}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-text-secondary">Bu faqat sinov — yakuniy ball test yakunlanganda hisoblanadi.</div>
                    </div>
                  )}

                  {/* AI tekshirish natija paneli */}
                  {codeReview[current] && (
                    <div className="mt-3 rounded-2xl border border-edge border-l-4 border-l-accent bg-surface-1 p-3 md:p-4">
                      {typeof codeReview[current].score === 'number' && (
                        <div className="mb-2 text-sm font-bold font-data text-accent">AI ball: {codeReview[current].score}/100</div>
                      )}
                      <div className="text-xs md:text-sm text-text-secondary whitespace-pre-wrap break-words">{codeReview[current].review}</div>
                      <div className="mt-2 text-[10px] text-text-secondary">Bu faqat sinov — yakuniy ball test yakunlanganda hisoblanadi.</div>
                    </div>
                  )}
                </div>
                );
              })()}
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-5 md:py-8 flex-1 pb-28 md:pb-8">
            {/* Question counter */}
            <div className="flex items-center justify-between mb-4 md:mb-6 gap-2">
              <div className="text-xs md:text-sm text-text-secondary font-medium font-data">
                Savol <span className="text-text-primary font-bold">{current+1}</span> / {TOTAL}
              </div>
              <button onClick={toggleMark} aria-pressed={!!marked[current]}
                className={`flex items-center gap-1.5 text-[11px] md:text-xs px-2.5 md:px-3 py-1.5 rounded-xl border transition-colors ${marked[current] ? 'bg-wash text-warning border-warning/40' : 'bg-surface-1 text-text-secondary border-edge hover:border-edge-strong hover:text-text-primary'}`}>
                <Icon name="star" size={13} /> {marked[current] ? 'Belgilangan' : 'Belgilash'}
              </button>
            </div>

            {submitError && (
              <div className="mb-4 md:mb-6 flex items-center justify-between gap-3 bg-wash text-error rounded-xl px-3 md:px-4 py-3 text-xs md:text-sm border border-error/40">
                <span className="flex items-center gap-2"><Icon name="info" size={15} /> {submitError}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* To'g'ridan-to'g'ri qayta yuborish — confirmModal'ni qayta ochmasdan */}
                  <button onClick={handleSubmit} disabled={submitting}
                    className="btn-ghost text-xs px-3 py-1.5 rounded-lg disabled:opacity-50">
                    {submitting ? 'Yuborilmoqda...' : 'Qayta yuborish'}
                  </button>
                  {/* AI yordamni qo'lda ochish — yuqoridagi izohga qarang
                      (imtihon ekranida doimiy launcher yashirilgan). */}
                  <button type="button" onClick={() => globalThis.OlympyApi?.openSupportChat?.('exam_submit_error', submitError)}
                    className="text-xs underline underline-offset-2 whitespace-nowrap hover:opacity-80 cursor-pointer">
                    Yordam kerakmi?
                  </button>
                </div>
              </div>
            )}

            {/* Joriy savol yuklanmoqda — inline spinner. */}
            {questionPending ? (
              <div className="rounded-2xl border border-edge bg-surface-2 p-8 md:p-10 mb-5 md:mb-6 flex flex-col items-center justify-center gap-4 text-text-secondary">
                <Spinner size={36} className="text-accent" />
                <div className="text-sm font-semibold">Savol yuklanmoqda...</div>
              </div>
            ) : (
              <>
                {/* Question text */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 md:p-6 mb-5 md:mb-6">
                  <p className="text-text-primary text-base md:text-lg leading-relaxed font-medium break-words whitespace-pre-wrap"><MathText text={q.text} /></p>
                </div>

                {/* Answer area — savol turiga qarab UI. */}
                <div className="mb-6 md:mb-8">
                  <QuestionAnswerArea
                    qType={qType}
                    q={q}
                    isTrueFalse={isTrueFalse}
                    value={answers[current]}
                    onMcq={handleAnswer}
                    onText={handleTextAnswer}
                    onBlank={handleBlankAnswer}
                    onMultiToggle={handleMultiToggle}
                    onYesNo={handleYesNo}
                    onSlider={handleSlider}
                  />
                </div>
              </>
            )}

            {/* Desktop nav buttons (inline) */}
            <div className="hidden md:flex items-center justify-between">
              <button onClick={() => setCurrent(Math.max(0, current-1))} disabled={current === 0}
                className="btn-ghost px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-30 flex items-center gap-2">
                <Icon name="arrowLeft" size={15} /> Oldingi
              </button>
              <div className="text-xs text-text-secondary font-data">{answered} ta javob berildi</div>
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
        )}

        {/* Mobile sticky bottom nav */}
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1 border-t border-edge px-3 py-3 flex items-center gap-2"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button onClick={() => setCurrent(Math.max(0, current-1))} disabled={current === 0}
            className="btn-ghost px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-30 flex items-center gap-1.5 flex-shrink-0">
            <Icon name="arrowLeft" size={15} />
          </button>
          {current < TOTAL-1 ? (
            <button onClick={() => setCurrent(current+1)} className="btn-primary flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              Keyingi savol <Icon name="chevronRight" size={15} />
            </button>
          ) : (
            <button onClick={() => setConfirmModal(true)} disabled={submitting}
              className="btn-primary flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
              Testni yakunlash
            </button>
          )}
        </div>
      </div>

      {/* Leave/Back confirmation modal — Back tugmasi yoki swipe'ga
          javoban window.confirm o'rniga. iOS/Telegram WebView'da
          ishonchli ko'rinadi. */}
      <Modal open={leaveConfirmModal} onClose={() => setLeaveConfirmModal(false)} title="Olimpiadadan chiqmoqchimisiz?">
        <div className="mb-6 space-y-3">
          <p className="text-text-secondary text-sm">
            Hozirgacha kiritilgan javoblaringiz yo'qoladi va olimpiadaga qayta qatnasholmaysiz.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setLeaveConfirmModal(false)}
            className="btn-ghost flex-1 py-3 rounded-xl"
          >
            Davom etish
          </button>
          <button
            onClick={() => {
              setLeaveConfirmModal(false);
              onNavigate && onNavigate('student');
            }}
            /* Chiqish — javoblar yo'qoladi, ya'ni buzuvchi harakat: `.btn-danger`.
               `.btn-primary` uni tavsiya etilgan yo'ldek ko'rsatib turardi. */
            className="btn-danger flex-1 py-3 rounded-xl font-bold"
          >
            Chiqish
          </button>
        </div>
      </Modal>

      {/* Confirm submit modal */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Testni yakunlash">
        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-2 md:gap-3 text-center">
            <div className="rounded-xl border border-edge bg-surface-2 p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-display font-bold font-data text-text-primary">{answered}</div><div className="text-[10px] md:text-xs text-text-secondary leading-tight">Javob</div></div>
            <div className="rounded-xl border border-edge bg-surface-2 p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-display font-bold font-data text-warning">{Object.keys(marked).filter(k=>marked[k]).length}</div><div className="text-[10px] md:text-xs text-text-secondary leading-tight">Belgi</div></div>
            <div className="rounded-xl border border-edge bg-surface-2 p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-display font-bold font-data text-text-secondary">{TOTAL - answered}</div><div className="text-[10px] md:text-xs text-text-secondary leading-tight">Bo'sh</div></div>
          </div>
          {TOTAL - answered > 0 && (
            <div className="flex items-center gap-2 bg-wash text-warning rounded-xl px-4 py-3 text-sm border border-warning/40">
              <Icon name="info" size={15} /> {TOTAL - answered} ta savol javobsiz qoldi
            </div>
          )}
          <p className="text-text-secondary text-sm">Testni yakunlamoqchimisiz? Yuborilgandan so'ng o'zgartirib bo'lmaydi.</p>
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

Object.assign(window, { OlympiadTestPage, MockTestPage });
