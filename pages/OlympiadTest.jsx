// pages/OlympiadTest.jsx

// IT (kod) savollarida dasturlash tili yorliqlari.
const LANG_LABELS = {
  python: 'Python',
  javascript: 'JavaScript',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
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
  const isAfterEnd = endDt && currentTime > endDt;

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
  // 4 soniyadan keyin foydalanuvchiga aniq xabar ko'rsatamiz.
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);
  React.useEffect(() => {
    if (!initialQuestionsLoading) { setLoadingTimeout(false); return undefined; }
    const t = setTimeout(() => setLoadingTimeout(true), 4000);
    return () => clearTimeout(t);
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
  const [cheated, setCheated] = React.useState(false);
  const [cheatMessage, setCheatMessage] = React.useState('');
  // Tab birinchi marta yashirilganda — disqualifikatsiya o'rniga
  // ogohlantirish ko'rsatamiz. Ikkinchi marta chiqishda — DQ.
  const [cheatWarning, setCheatWarning] = React.useState('');
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
    if (submitted || cheated) return undefined;

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
  }, [user?._api, liveOlympiad?.backendId, isBeforeStart, isAfterEnd, current, submitted, cheated]);

  React.useEffect(() => {
    if (submitted || isBeforeStart || isAfterEnd || initialQuestionsLoading) return;
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
  }, [submitted, isBeforeStart, isAfterEnd, initialQuestionsLoading, serverExpiresAt, serverClockSkewMs]);

  const sendPing = React.useCallback(async () => {
    if (!user?._api || !liveOlympiad?.backendId || submitted || cheated) return;
    const answeredCount = Object.keys(answersRef.current || {}).length;
    const escapes = tabSwitchCountRef.current;
    try {
      const token = globalThis.OlympyApi?.getToken?.()
        ?? globalThis.OlympyApi?.loadAuth?.()?.token;
      await globalThis.OlympyApi.pingTestSession(
        liveOlympiad.backendId,
        answeredCount,
        escapes,
        token,
        deviceIdRef.current,
      );
    } catch (err) {
      // 409 — boshqa qurilmadan parallel sessiya aniqlandi. reportCheating'ni
      // qayta chaqirmasdan to'g'ridan-to'g'ri diskvalifikatsiya holatini
      // ko'rsatamiz (backend allaqachon session'ni DQ qildi).
      if (err?.status === 409) {
        cheatReportedRef.current = true;
        setSubmitted(true);
        setCheated(true);
        setCheatMessage("Boshqa qurilmadan kirilgani aniqlandi. Olimpiada yakunlandi.");
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
  }, [user?._api, liveOlympiad?.backendId, submitted, cheated, answersStorageKey, markedStorageKey]);

  const reportCheating = React.useCallback((reason) => {
    if (cheatReportedRef.current || submitted || cheated || !user?._api || !liveOlympiad?.backendId) return;
    if (!cheatGuardActiveRef.current) return;
    cheatReportedRef.current = true;
    setCheated(true);
    setSubmitted(true);
    setCheatMessage(
      reason === 'tab_or_app_left'
        ? "Siz olimpiada vaqtida tabni bir necha marta almashtirdingiz. Olimpiada yakunlandi."
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
        if (codeStorageKey) localStorage.removeItem(codeStorageKey);
      }
    } catch {}
  }, [submitted, cheated, user?._api, liveOlympiad?.backendId, answersStorageKey, markedStorageKey, codeStorageKey]);

  React.useEffect(() => {
    if (!user?._api || !liveOlympiad?.backendId || apiTotal === 0 || submitted || cheated) {
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
    const onHidden = () => {
      if (!cheatGuardActiveRef.current) return;
      if (hiddenEventFiredRef.current) return; // allaqachon hisoblangan
      hiddenEventFiredRef.current = true;
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
    };
    const onVisible = () => {
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
    };
  }, [user?._api, liveOlympiad?.backendId, apiTotal, submitted, cheated, reportCheating, sendPing]);

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

  React.useEffect(() => {
    // apiTotal===0 — hali birinchi savol yuklanmagan; mock rejimda apiTotal
    // doim 0, lekin u yerda ping baribir ishlamaydi (user?._api guard).
    if (!user?._api || !liveOlympiad?.backendId || submitted || cheated || apiTotal === 0) return undefined;
    sendPing();
    const interval = setInterval(sendPing, 15000);
    return () => clearInterval(interval);
  }, [user?._api, liveOlympiad?.backendId, submitted, cheated, apiTotal, sendPing]);

  React.useEffect(() => {
    if (Object.keys(answers).length > 0) {
      sendPing();
    }
  }, [answers, sendPing]);

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  // Javob berilgan savollar: MCQ (answers) + kod yozilgan savollar (codeAnswers).
  // Bir savol ikkalasida ham bo'lmaydi, shu sababli unique indekslar.
  const answeredIndexes = new Set([
    ...Object.keys(answers),
    ...Object.keys(codeAnswers).filter(k => String(codeAnswers[k]?.code || '').trim()),
  ]);
  const answered = answeredIndexes.size;
  const progress = TOTAL ? (answered / TOTAL) * 100 : 0;
  const isUrgent = timeLeft < 120;

  const handleAnswer = (optIdx) => setAnswers(prev => ({ ...prev, [current]: optIdx }));
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
      );
      setCodeReview(prev => ({ ...prev, [current]: { score: res?.score, review: res?.review || '' } }));
    } catch (err) {
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
      );
      setRunResults(prev => ({ ...prev, [idx]: res }));
    } catch (err) {
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
        try {
          if (numericOlympiadId == null) throw new Error('Missing olympiad id');
          const token = globalThis.OlympyApi?.getToken?.()
            ?? globalThis.OlympyApi?.loadAuth?.()?.token;
          const submitPayload = { olympiad: numericOlympiadId, answers: formattedAnswers, time_spent: timeSpent };
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
        <div className="text-xs text-white/40 uppercase tracking-widest font-extrabold">Boshlanishigacha qoldi</div>
        <div className="flex justify-center gap-2">
          {hours > 0 && (
            <div className="glass rounded-2xl p-3 min-w-[70px] border border-white/5 shadow-lg">
              <div className="text-3xl font-black text-white font-mono leading-none">{String(hours).padStart(2, '0')}</div>
              <div className="text-[8px] text-white/40 uppercase font-bold tracking-wider mt-1.5 leading-none">Soat</div>
            </div>
          )}
          <div className="glass rounded-2xl p-3 min-w-[70px] border border-white/5 shadow-lg">
            <div className="text-3xl font-black text-white font-mono leading-none">{String(minutes).padStart(2, '0')}</div>
            <div className="text-[8px] text-white/40 uppercase font-bold tracking-wider mt-1.5 leading-none">Daqiqa</div>
          </div>
          <div className="glass rounded-2xl p-3 min-w-[70px] border border-white/5 shadow-lg">
            <div className="text-3xl font-black text-indigo-400 font-mono leading-none animate-pulse">{String(seconds).padStart(2, '0')}</div>
            <div className="text-[8px] text-white/40 uppercase font-bold tracking-wider mt-1.5 leading-none">Soniya</div>
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
  if (cheated) {
    return <PendingAccessCard title="Cheating aniqlandi" status="rejected"
      message={cheatMessage || "Siz cheating qildingiz. Olimpiada yakunlandi."}
      onBack={() => onNavigate('student')} />;
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050508' }}>
        <div className="flex flex-col items-center gap-4 text-white/70">
          <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <div className="text-sm font-semibold">Savollar yuklanmoqda...</div>
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

  const q = TEST_QUESTIONS[current];
  // Per-question yuklash: q hali kelmagan bo'lishi mumkin (navigatsiyada).
  // Bu holatda butun sahifani null qaytarmasdan, savol kartasi o'rnida inline
  // spinner ko'rsatamiz (header, timer, navigator joyida qoladi).
  const questionPending = !q || currentQuestionLoading;
  // IT (kod) savol — backend question_type:'code' qaytaradi.
  const isCodeQuestion = q ? (q.questionType === 'code' || q.question_type === 'code') : false;
  // Derive a "type" for True/False rendering even though store questions don't carry one
  const isTrueFalse = (q && !isCodeQuestion) ? (q.options || []).length === 2 && (q.options || []).every(o => /to'?g'?ri|no?to'?g'?ri/i.test(o)) : false;

  return (
    <div className="min-h-screen flex flex-col select-none" style={{ background: '#050508', userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
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

      {/* Visibility-cheating ogohlantirish banner. Tab birinchi marta tark
          etilganda ko'rsatiladi va foydalanuvchi qaytsa ham qoladi.
          Ikkinchi marta tark etishda disqualifikatsiya yuz beradi. */}
      {cheatWarning && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 md:px-8 py-2 text-amber-200 text-xs md:text-sm font-semibold flex items-center gap-2">
          <Icon name="info" size={14} className="text-amber-300 flex-shrink-0" />
          <span>{cheatWarning}</span>
        </div>
      )}

      {/* Mobile question strip — horizontal scrollable navigator */}
      <div className="md:hidden glass border-b border-white/5">
        <div className="question-strip">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`question-strip-btn ${i === current ? 'current' : marked[i] ? 'marked' : answers[i] !== undefined ? 'answered' : ''}`}>
              {i+1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Question navigation sidebar — kod savolda yashiriladi (LeetCode
            split layoutiga joy kerak); mobil navigator pastda qoladi. */}
        <div className={`hidden md:flex flex-col glass border-r border-white/5 w-52 p-4 overflow-y-auto ${isCodeQuestion ? '!hidden' : ''}`}>
          <div className="text-xs text-white/40 font-medium mb-3">Savollar ({answered}/{TOTAL})</div>
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {Array.from({ length: TOTAL }).map((_, i) => (
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
            <div className="md:w-2/5 md:min-w-[280px] flex flex-col md:border-r border-white/10 md:overflow-y-auto p-4 md:p-6 flex-shrink-0 md:flex-shrink">
              {/* Savol hisoblagichi + belgilash */}
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="text-xs text-white/40 font-semibold uppercase tracking-wider">
                  Savol <span className="text-white">{current+1}</span> / {TOTAL}
                </div>
                <button onClick={toggleMark}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-xl transition-all flex-shrink-0 ${marked[current] ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'glass text-white/40 hover:text-white/60'}`}>
                  <Icon name="star" size={13} /> {marked[current] ? 'Belgilangan' : 'Belgilash'}
                </button>
              </div>

              {submitError && (
                <div className="mb-4 flex items-center gap-2 bg-rose-500/10 text-rose-300 rounded-xl px-3 py-3 text-xs border border-rose-500/20">
                  <Icon name="info" size={15} /> {submitError}
                </div>
              )}

              {/* Savol matni */}
              <p className="text-white text-sm md:text-base leading-relaxed whitespace-pre-wrap break-words mb-4">{q.text}</p>

              {/* Boshlang'ich kod skelet (faqat o'qish) */}
              {(q.codeTemplate || q.code_template) ? (
                <div className="mt-1 mb-4">
                  <div className="mb-1.5 text-xs text-white/40">Boshlang'ich kod:</div>
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
                <div className="mt-1 flex items-center gap-2 bg-amber-500/10 text-amber-300 rounded-xl px-3 py-2 text-xs border border-amber-500/20">
                  <Icon name="info" size={14} className="flex-shrink-0" />
                  Bu olimpiadada faqat {allowedLanguages.map(l => LANG_LABELS[l] || l).join(', ')} ishlatiladi
                </div>
              )}
            </div>

            {/* O'NG — kod muharriri. Desktop'da qolgan kenglikni to'ldiradi va
                ichki scroll bilan; mobil'da savol ostida vertikal joylashadi. */}
            <div className="md:flex-1 flex flex-col md:overflow-hidden md:min-h-0 border-t md:border-t-0 border-white/10">
              {/* Yuqori bar: til tanlash + desktop savol navigatsiyasi.
                  Kod savolda sidebar yashirin, shu sababli prev/next shu yerda
                  (desktop). Mobil'da pastdagi sticky navigator ishlatiladi. */}
              <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-white/10 flex-shrink-0 overflow-x-auto">
                <span className="text-xs text-white/40 flex-shrink-0">Til:</span>
                {(allowedLanguages.length ? allowedLanguages : ['python', 'javascript', 'java', 'cpp', 'c']).map(lng => {
                  const active = currentCodeLang(q) === lng;
                  return (
                    <button key={lng} onClick={() => handleCodeLanguage(lng)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all flex-shrink-0 ${active ? 'gradient-bg text-white' : 'glass text-white/50 hover:text-white/70'}`}>
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
                <div className="border-t border-white/10 p-3 md:p-4 flex-shrink-0 max-h-[45%] overflow-y-auto">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleSkipCode}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold text-white/40 hover:text-red-400 min-h-[40px]">
                      O'tkazib yuborish
                    </button>
                    <button
                      onClick={() => handleRunCode(q)}
                      disabled={isRunning || !String(codeAnswers[current]?.code || '').trim()}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 min-h-[40px] disabled:opacity-40">
                      {isRunning
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Ishga tushirilmoqda...</>
                        : <><Icon name="play" size={14} /> Ishga tushirish</>}
                    </button>
                    <button
                      onClick={() => handleRunCodeReview(q)}
                      disabled={codeReviewLoading || !String(codeAnswers[current]?.code || '').trim()}
                      className="btn-ghost px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 min-h-[40px] disabled:opacity-40">
                      {codeReviewLoading
                        ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Tekshirilmoqda...</>
                        : <><Icon name="sparkles" size={14} /> AI bilan tekshirish</>}
                    </button>
                  </div>

                  {/* Judge0 natija paneli */}
                  {runResult && (
                    <div className="mt-3 glass rounded-2xl p-3 md:p-4 space-y-2 border border-white/10">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${runResult.status === 'Accepted' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ● {runResult.status || 'Xato'}
                        </span>
                        {runResult.time > 0 && (
                          <span className="text-white/30 text-[11px]">{runResult.time}s · {runResult.memory} KB</span>
                        )}
                      </div>

                      {/* Ulanish/xato (Judge0 umuman ishlamadi) */}
                      {runResult.error && (
                        <div className="text-xs text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2 break-words">{runResult.error}</div>
                      )}

                      {/* stdout */}
                      {runResult.stdout && (
                        <div>
                          <div className="text-[11px] text-white/40 mb-1">Natija:</div>
                          <pre className="bg-black/30 rounded-lg p-3 text-xs md:text-sm text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">{runResult.stdout}</pre>
                        </div>
                      )}

                      {/* stderr / compile error */}
                      {(runResult.stderr || runResult.compile_output) && (
                        <div>
                          <div className="text-[11px] text-rose-400 mb-1">Xato:</div>
                          <pre className="bg-black/30 rounded-lg p-3 text-xs md:text-sm text-rose-300 font-mono overflow-x-auto whitespace-pre-wrap break-words">{runResult.stderr || runResult.compile_output}</pre>
                        </div>
                      )}

                      {/* Test case natijalar */}
                      {Array.isArray(runResult.test_results) && runResult.test_results.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[11px] text-white/40 mb-1">Test natijalar:</div>
                          {runResult.test_results.map((t, i) => (
                            <div key={i} className={`flex items-center gap-2 text-[11px] px-3 py-1.5 rounded-lg flex-wrap ${t.passed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              <span className="font-bold">{t.passed ? '✓' : '✗'} Test {i + 1}</span>
                              {t.is_hidden
                                ? <span className="text-white/30">(yashirin)</span>
                                : <span className="text-white/40 break-words">input: {String(t.input)} → {t.passed ? "to'g'ri" : `kutilgan: ${String(t.expected)}, olindi: ${String(t.got)}`}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-white/30">Bu faqat sinov — yakuniy ball test yakunlanganda hisoblanadi.</div>
                    </div>
                  )}

                  {/* AI tekshirish natija paneli */}
                  {codeReview[current] && (
                    <div className="mt-3 glass rounded-2xl p-3 md:p-4 border border-indigo-500/20">
                      {typeof codeReview[current].score === 'number' && (
                        <div className="mb-2 text-sm font-bold text-indigo-300">AI ball: {codeReview[current].score}/100</div>
                      )}
                      <div className="text-xs md:text-sm text-white/70 whitespace-pre-wrap break-words">{codeReview[current].review}</div>
                      <div className="mt-2 text-[10px] text-white/30">Bu faqat sinov — yakuniy ball test yakunlanganda hisoblanadi.</div>
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

            {/* Joriy savol yuklanmoqda — inline spinner. */}
            {questionPending ? (
              <div className="glass-strong rounded-2xl p-8 md:p-10 mb-5 md:mb-6 flex flex-col items-center justify-center gap-4 text-white/60">
                <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <div className="text-sm font-semibold">Savol yuklanmoqda...</div>
              </div>
            ) : (
              <>
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
              </>
            )}

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
        )}

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
