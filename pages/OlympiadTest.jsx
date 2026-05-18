// pages/OlympiadTest.jsx

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
  // API foydalanuvchisi uchun apiQuestions yagona haqiqiy manba. Mock/dev
  // rejimda olimpiada savollari biriktirilgan bo'lsa shulardan, aks holda
  // bo'sh massiv — soxta hardcoded savollar production'ga sizmasligi uchun.
  const TEST_QUESTIONS = user?._api
    ? (Array.isArray(apiQuestions) ? apiQuestions : [])
    : assignedQuestions;

  const TOTAL = TEST_QUESTIONS.length;
  const DURATION = (liveOlympiad?.duration || olympiad?.duration || 30) * 60;

  // Refresh yoki crashdan keyin javoblarni yo'qotmaslik uchun localStorage
  // backup. iOS Safari private modeda yoki Telegram WebView'da saqlash
  // muvaffaqiyatsiz bo'lishi mumkin — try/catch bilan o'rab qo'yamiz.
  const persistedOlympiadId = liveOlympiad?.id || olympiad?.id || liveOlympiad?.backendId || 'unknown';
  const answersStorageKey = `olympy_answers_${persistedOlympiadId}`;
  const markedStorageKey = `olympy_marked_${persistedOlympiadId}`;
  const readPersisted = (key) => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch { return null; }
  };

  const [current, setCurrent] = React.useState(0);
  const [answers, setAnswers] = React.useState(() => readPersisted(answersStorageKey) || {});
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
  const [cheated, setCheated] = React.useState(false);
  const [cheatMessage, setCheatMessage] = React.useState('');
  // Tab birinchi marta yashirilganda — disqualifikatsiya o'rniga
  // ogohlantirish ko'rsatamiz. Ikkinchi marta yoki 60s o'tsa — DQ.
  const [cheatWarning, setCheatWarning] = React.useState('');
  // Yangi siyosat: 2 marta tabni almashtirish o'rniga JAMI tashqarida
  // o'tkazilgan vaqtni hisoblaymiz. Telegram WebView'da keyboard yoki
  // push notification ochilsa ham `visibilityState === 'hidden'` bo'ladi
  // — 2 marta cheklov nohaq DQ keltirardi.
  const totalHiddenTimeRef = React.useRef(0);
  const hiddenStartRef = React.useRef(null);
  const cheatReportedRef = React.useRef(false);
  const historyGuardRef = React.useRef(false);
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
    let t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [submitted, isBeforeStart, isAfterEnd, questionsLoading, serverExpiresAt, serverClockSkewMs]);

  const reportCheating = React.useCallback((reason) => {
    if (cheatReportedRef.current || submitted || cheated || !user?._api || !liveOlympiad?.backendId) return;
    if (!cheatGuardActiveRef.current) return;
    cheatReportedRef.current = true;
    setCheated(true);
    setSubmitted(true);
    setCheatMessage(
      reason === 'tab_or_app_left'
        ? "Siz 2 daqiqadan ortiq olimpiada oynasidan tashqarida bo'ldingiz. Olimpiada yakunlandi."
        : "Siz cheating qildingiz. Olimpiada yakunlandi."
    );
    try {
      globalThis.OlympyApi.reportCheating(
        { olympiad: liveOlympiad.backendId, reason },
        globalThis.OlympyApi.getToken(),
      ).catch(() => {});
    } catch {}
    // Diskvalifikatsiyadan keyin saqlangan javoblar kerak emas.
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(answersStorageKey);
        localStorage.removeItem(markedStorageKey);
      }
    } catch {}
  }, [submitted, cheated, user?._api, liveOlympiad?.backendId, answersStorageKey, markedStorageKey]);

  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || !apiQuestions || questionsLoading || submitted || cheated) {
      return undefined;
    }
    // Cheating siyosati: tashqarida jami 120 soniyadan ko'p o'tirsa DQ.
    // Telegram WebView'da klaviatura ochilsa, push notification kelsa
    // yoki iOS Safari avtomatik tabni yashirsa — kichik tanaffuslar
    // jamlanadi. 120 sekundlik limit yetarli darajada keng (kichik
    // chalg'ish kechiriladi), lekin uzoq tashqariga chiqishni qoplaydi.
    const TOTAL_HIDDEN_LIMIT_MS = 120000; // 2 daqiqa
    const WARNING_THRESHOLD_MS = 60000; // 1 daqiqa — ogohlantirish
    const WARNING_TEXT = (
      "Diqqat! Testdan tashqariga chiqdingiz. "
      + "Jami 2 daqiqadan ko'p tashqarida qolsangiz olimpiada yakunlanadi."
    );
    let hiddenTimer = null;
    const checkOverLimit = () => {
      const ongoing = hiddenStartRef.current
        ? (Date.now() - hiddenStartRef.current)
        : 0;
      const total = totalHiddenTimeRef.current + ongoing;
      if (total > TOTAL_HIDDEN_LIMIT_MS) {
        reportCheating('tab_or_app_left');
        return true;
      }
      return false;
    };
    const onVisibility = () => {
      if (!cheatGuardActiveRef.current) return;
      if (document.visibilityState === 'hidden') {
        hiddenStartRef.current = Date.now();
        // Tab yashirin paytida tekshirib turish uchun timer.
        if (hiddenTimer) clearTimeout(hiddenTimer);
        // Limitgacha qolgan vaqtdan keyin tekshirish.
        const remaining = Math.max(
          1000,
          TOTAL_HIDDEN_LIMIT_MS - totalHiddenTimeRef.current,
        );
        hiddenTimer = setTimeout(() => {
          if (document.visibilityState === 'hidden') checkOverLimit();
        }, remaining);
        // Ogohlantirish — agar jami 1 daqiqadan oshgan bo'lsa darhol,
        // aks holda 1 daqiqa to'lganda paydo bo'lsin.
        if (totalHiddenTimeRef.current >= WARNING_THRESHOLD_MS) {
          setCheatWarning(WARNING_TEXT);
        }
      } else {
        // Foydalanuvchi qaytdi: jamg'arilgan vaqtni qo'shamiz.
        if (hiddenStartRef.current) {
          totalHiddenTimeRef.current += Date.now() - hiddenStartRef.current;
          hiddenStartRef.current = null;
        }
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        // Limitdan oshgan bo'lsa — qaytib kelganda ham DQ.
        if (totalHiddenTimeRef.current > TOTAL_HIDDEN_LIMIT_MS) {
          reportCheating('tab_or_app_left');
          return;
        }
        // Yetarlicha vaqt tashqarida bo'lgan bo'lsa warning ko'rsatamiz.
        if (totalHiddenTimeRef.current >= WARNING_THRESHOLD_MS) {
          setCheatWarning(WARNING_TEXT);
        } else {
          setCheatWarning('');
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [user?._api, liveOlympiad?.backendId, apiQuestions, questionsLoading, submitted, cheated, reportCheating]);

  // Har `answers`/`marked` o'zgarganda lokal saqlash. Submit/cheating
  // paytida tozalash uchun pastdagi cleanup logikasi mavjud.
  React.useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(answersStorageKey, JSON.stringify(answers || {}));
    } catch {}
  }, [answers, answersStorageKey]);

  React.useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(markedStorageKey, JSON.stringify(marked || {}));
    } catch {}
  }, [marked, markedStorageKey]);

  const clearPersistedAnswers = React.useCallback(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(answersStorageKey);
      localStorage.removeItem(markedStorageKey);
    } catch {}
  }, [answersStorageKey, markedStorageKey]);

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
          clearPersistedAnswers();
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
          // Token muddati tugagan bo'lsa — javoblar localStorage'da qoldi,
          // foydalanuvchini logout qilmasdan qayta login qilishi uchun
          // aniq xabar ko'rsatamiz.
          if (err?.status === 401 || err?.data?.code === 'session_expired') {
            setSubmitError(
              "Sessiya tugadi. Iltimos, qayta kiring va Yuborish tugmasini qayta bosing. "
              + "Javoblaringiz brauzerda saqlangan."
            );
            setSubmitted(false);
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

  const q = TEST_QUESTIONS[current];
  if (!q) return null;
  // Derive a "type" for True/False rendering even though store questions don't carry one
  const isTrueFalse = (q.options || []).length === 2 && (q.options || []).every(o => /to'?g'?ri|no?to'?g'?ri/i.test(o));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060818' }}>
      {/* Header bar */}
      <div className="glass border-b border-white/5 px-3 md:px-8 py-2.5 md:py-3 flex items-center justify-between gap-2 sticky top-0 z-30">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <BrandLogo compact size="xs" />
          <div className="min-w-0">
            <div className="text-[13px] md:text-sm font-bold text-white truncate">{olympiad?.title || 'Matematika Olimpiadasi'}</div>
            <div className="text-[10px] md:text-xs text-white/40 truncate">
              {olympiad?.subject}{liveOlympiad?.testLevel ? ` · ${liveOlympiad.testLevel}` : ''}{liveOlympiad?.testType ? ` · ${testTypeLabel(liveOlympiad.testType)}` : ''}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl md:rounded-2xl font-mono text-sm md:text-lg font-black transition-all flex-shrink-0 ${isUrgent ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'glass text-white'}`}>
          <Icon name="clock" size={14} className={isUrgent ? 'text-rose-400' : 'text-white/50'} />
          {formatTime(timeLeft)}
        </div>

        <button onClick={() => setConfirmModal(true)} disabled={submitting}
          className="btn-primary px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs md:text-sm font-semibold disabled:opacity-50 flex-shrink-0">
          <span className="hidden sm:inline">Yakunlash</span>
          <span className="sm:hidden">Tugatish</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/5">
        <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#6366f1,#a855f7,#22d3ee)' }} />
      </div>

      {/* Visibility-cheating ogohlantirish banner. Tab birinchi marta yashirin
          bo'lganida ko'rsatiladi; qaytsa avto-yo'qoladi. Ikkinchi marta yoki
          60s o'tsa disqualifikatsiya yuz beradi. */}
      {cheatWarning && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 md:px-8 py-2 text-amber-200 text-xs md:text-sm font-semibold flex items-center gap-2">
          <Icon name="info" size={14} className="text-amber-300 flex-shrink-0" />
          <span>{cheatWarning}</span>
        </div>
      )}

      {/* Mobile question strip — horizontal scrollable navigator */}
      <div className="md:hidden glass border-b border-white/5">
        <div className="question-strip">
          {TEST_QUESTIONS.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`question-strip-btn ${i === current ? 'current' : marked[i] ? 'marked' : answers[i] !== undefined ? 'answered' : ''}`}>
              {i+1}
            </button>
          ))}
        </div>
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
          <div className="max-w-2xl mx-auto w-full px-4 md:px-6 py-5 md:py-8 flex-1 pb-28 md:pb-8">
            {/* Question counter */}
            <div className="flex items-center justify-between mb-4 md:mb-6 gap-2">
              <div className="text-xs md:text-sm text-white/40 font-medium">
                Savol <span className="text-white font-bold">{current+1}</span> / {TOTAL}
              </div>
              <button onClick={toggleMark}
                className={`flex items-center gap-1.5 text-[11px] md:text-xs px-2.5 md:px-3 py-1.5 rounded-xl transition-all ${marked[current] ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'glass text-white/40 hover:text-white/60'}`}>
                <Icon name="star" size={13} /> {marked[current] ? 'Belgilangan' : 'Belgilash'}
              </button>
            </div>

            {submitError && (
              <div className="mb-4 md:mb-6 flex items-center gap-2 bg-rose-500/10 text-rose-300 rounded-xl px-3 md:px-4 py-3 text-xs md:text-sm border border-rose-500/20">
                <Icon name="info" size={15} /> {submitError}
              </div>
            )}

            {/* Question text */}
            <div className="glass-strong rounded-2xl p-4 md:p-6 mb-5 md:mb-6">
              <p className="text-white text-base md:text-lg leading-relaxed font-medium break-words">{q.text}</p>
            </div>

            {/* Answer options */}
            <div className="space-y-2.5 md:space-y-3 mb-6 md:mb-8">
              {q.options.map((opt, i) => {
                const selected = answers[current] === i;
                return (
                  <button key={i} onClick={() => handleAnswer(i)}
                    className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl text-left transition-all min-h-[56px] ${selected ? 'border-indigo-500 bg-indigo-500/15 border glow-blue' : 'glass hover:bg-white/7 border border-transparent hover:border-white/10'}`}>
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 transition-all ${selected ? 'gradient-bg text-white' : 'glass text-white/50'}`}>
                      {isTrueFalse ? (i === 0 ? '✓' : '✗') : String.fromCharCode(65+i)}
                    </div>
                    <span className={`font-medium text-sm md:text-base break-words min-w-0 ${selected ? 'text-white' : 'text-white/70'}`}>{opt}</span>
                    {selected && <Icon name="check" size={16} className="ml-auto text-indigo-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Desktop nav buttons (inline) */}
            <div className="hidden md:flex items-center justify-between">
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

        {/* Mobile sticky bottom nav */}
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/5 px-3 py-3 flex items-center gap-2"
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
          <p className="text-white/70 text-sm">
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
            className="btn-primary flex-1 py-3 rounded-xl font-bold"
          >
            Chiqish
          </button>
        </div>
      </Modal>

      {/* Confirm submit modal */}
      <Modal open={confirmModal} onClose={() => setConfirmModal(false)} title="Testni yakunlash">
        <div className="mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-2 md:gap-3 text-center">
            <div className="glass rounded-xl p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-black text-white">{answered}</div><div className="text-[10px] md:text-xs text-white/40 leading-tight">Javob</div></div>
            <div className="glass rounded-xl p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-black text-amber-400">{Object.keys(marked).filter(k=>marked[k]).length}</div><div className="text-[10px] md:text-xs text-white/40 leading-tight">Belgi</div></div>
            <div className="glass rounded-xl p-2 md:p-3 min-w-0"><div className="text-lg md:text-xl font-black text-white/30">{TOTAL - answered}</div><div className="text-[10px] md:text-xs text-white/40 leading-tight">Bo'sh</div></div>
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
