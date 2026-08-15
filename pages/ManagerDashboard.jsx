// pages/ManagerDashboard.jsx

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/manager/<key>`
// manziliga bog'lanadi (home → /dashboard/manager).
// MUHIM: `analytics` ro'yxatda YO'Q — u app-level alohida sahifa
// (setPageOrSpecial → onNavigate('analytics')). `proctoring` ham YO'Q — u
// `liveOlympiadId` runtime state'iga bog'liq drill-down ko'rinish (URL'ga
// yozilmaydi, deep-link'da bo'sh ochilib qolardi).
const MANAGER_DASHBOARD_PAGES = [
  'home', 'requests', 'olympiads', 'questions', 'students',
  'results', 'qanalytics', 'shop', 'profile',
];
const managerDashUrl = makeDashboardUrlSync('/dashboard/manager', MANAGER_DASHBOARD_PAGES);

// Cheating sabab kodlarini (backend `cheating_reason`) o'qiladigan o'zbekcha
// yorliqqa aylantiramiz. Noma'lum kod kelsa xom qiymatni ko'rsatamiz, shunda
// yangi signal qo'shilsa ham panel buzilmaydi.
const CHEATING_REASON_LABELS = {
  tab_or_app_left: 'Tab yoki ilovani tark etdi',
  test_window_left: 'Test oynasidan chiqdi',
  concurrent_session: 'Boshqa qurilmadan kirildi',
  copy_paste_attempt: 'Nusxa olish urinishi',
  fullscreen_exit: "To'liq ekrandan chiqish",
  devtools_open: 'DevTools ochildi',
  multi_monitor_detected: 'Bir nechta monitor aniqlandi',
  // Webkamera proktoring signallari. Kalitlar src/proctoring/reasons.js
  // (yagona manba) bilan mos bo'lishi shart — ishlab chiqaruvchi shu satrlarni
  // yuboradi.
  no_face_detected: 'Yuz aniqlanmadi',
  multiple_faces_detected: 'Bir nechta yuz aniqlandi',
  gaze_away_sustained: 'Nigoh ekrandan uzoq',
  // Ovoz proktoring signali. Kalit src/proctoring/voiceReasons.js (yagona
  // manba) bilan mos bo'lishi shart.
  ambient_speech_detected: 'Atrofdan ovoz aniqlandi',
};
const cheatingReasonLabel = (reason) => {
  const key = String(reason || '').trim().toLowerCase();
  return CHEATING_REASON_LABELS[key] || reason;
};

const ManagerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = managerDashUrl.usePageState();
  const [createModal, setCreateModal] = React.useState(false);
  const [telegramLink, setTelegramLink] = React.useState(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = React.useState(false);
  const [telegramLinked, setTelegramLinked] = React.useState(!!user?.telegramLinked);
  const emptyOlympiadForm = { eventType: 'competition', title: '', subject: store.subjects[0] || 'Matematika', startDate: '', startTime: '10:00', duration: 60, maxScore: 100, status: 'draft', testLevel: '', testType: '', groupFilter: '', itCategory: '', allowedLanguages: [], cameraProctoringEnabled: false, voiceProctoringEnabled: false };
  const [newOlympiad, setNewOlympiad] = React.useState(emptyOlympiadForm);
  // Premium kerak bo'lganda ko'rinadigan modal (8-funksiya — limit oshganda).
  const [premiumModal, setPremiumModal] = React.useState('');
  const [editingOlympiadId, setEditingOlympiadId] = React.useState(null);
  const [activateConfirm, setActivateConfirm] = React.useState(null);
  const [eventSaving, setEventSaving] = React.useState(false);
  const [assignModal, setAssignModal] = React.useState(null);
  const [mobileMenu, setMobileMenu] = React.useState(false);
  // Manager onboarding banneri (yengil orientatsiya, bir marta). Backend
  // `onboardingManagerCompleted === false` bo'lsa uy tabida ko'rsatiladi.
  // Yopilganda API chaqiriladi va user state onUserUpdate orqali yangilanadi;
  // `onboardingDismissed` — API javobini kutmasdan darhol yashirish uchun.
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);
  const [onboardingSaving, setOnboardingSaving] = React.useState(false);
  const [pendingStudents, setPendingStudents] = React.useState([]);
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  // Ariza tasdiqlash/rad etish ketayotgan qator id'si (ikki marta bosishdan
  // himoya) — OwnerDashboard'dagi `studentActionId` bilan bir xil naqsh.
  const [requestActionId, setRequestActionId] = React.useState(null);
  const [approvedStudents, setApprovedStudents] = React.useState([]);
  const [studentDetailMembership, setStudentDetailMembership] = React.useState(null);
  const [studentDetail, setStudentDetail] = React.useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = React.useState(false);
  const [studentDetailError, setStudentDetailError] = React.useState('');
  const [assignedQuestionIds, setAssignedQuestionIds] = React.useState([]);
  const [assignmentLevel, setAssignmentLevel] = React.useState('');
  const [assignmentType, setAssignmentType] = React.useState('');
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);
  const [onlyUnused, setOnlyUnused] = React.useState(true);
  const [deleteEventId, setDeleteEventId] = React.useState(null);
  // window.confirm() Telegram WebApp ichida bloklangan/ishonchsiz — shop
  // mahsulotini o'chirishda ham (boshqa o'chirish oqimlari kabi) inline
  // ConfirmModal ishlatiladi.
  const [deleteProductId, setDeleteProductId] = React.useState(null);
  const [shopDeleting, setShopDeleting] = React.useState(false);
  // Studentlar ro'yxati uchun qidiruv: ism yoki telefon raqamga ko'ra
  // filter. Avval input value/onChange'siz mavjud edi — foydalanuvchi
  // yozardi lekin natija filterlanmasdi.
  const [studentSearch, setStudentSearch] = React.useState('');
  // Debounce: o'quvchilar ro'yxati katta bo'lishi mumkin — har bosishda
  // emas, foydalanuvchi to'xtaganidan keyin filtrlaymiz.
  const debouncedStudentSearch = useDebounce(studentSearch, 300);
  // Guruh tegi tahrirlash holati (10-funksiya).
  const [groupTagEdit, setGroupTagEdit] = React.useState(null);
  const [liveOlympiadId, setLiveOlympiadId] = React.useState(null);
  const [proctoringData, setProctoringData] = React.useState([]);
  const [proctoringLoading, setProctoringLoading] = React.useState(false);
  const [proctoringError, setProctoringError] = React.useState('');
  const [proctoringSearch, setProctoringSearch] = React.useState('');
  const debouncedProctoringSearch = useDebounce(proctoringSearch, 300);
  // Cheating tekshiruvi: qaror yuborilayotgan session_id'lar (tugmalarni
  // ikki marta bosishdan himoya — click paytida darhol disable).
  const [reviewBusyIds, setReviewBusyIds] = React.useState({});
  const [liveProctorSession, setLiveProctorSession] = React.useState(null);
  // Kod (IT) javoblari modali — natijalar sahifasidan ochiladi.
  const [codeSubModal, setCodeSubModal] = React.useState(null); // null | { id, title }
  const [codeSubData, setCodeSubData] = React.useState([]);
  const [codeSubLoading, setCodeSubLoading] = React.useState(false);
  const [codeSubError, setCodeSubError] = React.useState('');
  const [codeSubExpanded, setCodeSubExpanded] = React.useState({}); // { [submissionId]: bool }
  // Essay baholash modali: olimpiadaning essay javoblari ro'yxati + ball/izoh.
  const [essayModal, setEssayModal] = React.useState(null); // null | { id, title }
  const [essayData, setEssayData] = React.useState([]);
  const [essayLoading, setEssayLoading] = React.useState(false);
  const [essayError, setEssayError] = React.useState('');
  const [essayOnlyUngraded, setEssayOnlyUngraded] = React.useState(true);
  const [essayDrafts, setEssayDrafts] = React.useState({}); // { 'attemptId:questionId': {score, feedback} }
  const [essaySavingKey, setEssaySavingKey] = React.useState('');
  // Natijalar → "Ko'rish" modali: tadbir ishtirokchilari natijalari jadvali.
  // page_size=200 bilan yuklanadi; 200+ bo'lsa oddiy "Keyingisi →" pagination.
  const [resultsModal, setResultsModal] = React.useState({
    open: false, event: null, data: [], loading: false, page: 1, total: 0,
  });
  // Natijalar jadvalidan o'quvchi qatoriga bosilganda ochiladigan "O'quvchi
  // tahlili" modali: o'sha o'quvchining har bir savol bo'yicha javobi.
  // `studentId` — hozir kimning javoblari kutilayotgani (eskirgan javobni
  // ajratish uchun; openStudentReview'ga qarang).
  const [studentReviewModal, setStudentReviewModal] = React.useState({
    open: false, studentId: null, studentName: '', data: null, loading: false, error: '',
  });
  // Markaz do'koni (Mukofotlar) holatlari.
  const [shopProducts, setShopProducts] = React.useState([]);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [shopSaving, setShopSaving] = React.useState(false);
  const [shopModal, setShopModal] = React.useState(null); // null | 'new' | product obyekti
  const emptyShopForm = { title: '', description: '', coin_cost: 100, icon: '🎁', stock: 10, is_active: true, features: [], imageFile: null, image_url: '' };
  const [shopForm, setShopForm] = React.useState(emptyShopForm);
  // Telegram link polling intervalini ref'da saqlaymiz, shunda component
  // unmount bo'lsa ham tozalanadi (avval polling event handler ichida
  // boshlanardi va unmount paytida cheksiz davom etardi).
  const telegramPollRef = React.useRef(null);
  React.useEffect(() => () => {
    if (telegramPollRef.current) {
      clearInterval(telegramPollRef.current);
      telegramPollRef.current = null;
    }
  }, []);

  // Avval bitta string state + bitta setTimeout edi: ikkinchi toast 3s ichida
  // kelsa, birinchisining eski taymeri uni muddatidan oldin yashirib
  // yuborardi. shared.jsx'dagi useToast() buni stacked, id-based ro'yxat bilan
  // hal qiladi — imzosi bir xil (showToast(msg)) bo'lgani uchun mavjud
  // chaqiruv joylari o'zgarishsiz ishlaydi (AdminDashboard ham shunday).
  const { showToast, ToastHost } = useToast();

  const startTelegramLink = () => {
    if (!isApi) {
      showToast('Real bot server rejimida ulanadi');
      return;
    }
    setTelegramLinkLoading(true);
    OlympyApi.startTelegramLink(OlympyApi.getToken())
      .then(data => {
        setTelegramLink(data);
        if (data?.telegram_deep_link) {
          const opened = goToTelegramLink(data.telegram_deep_link);
          showToast(opened ? 'Telegram bot ochilyapti. Telefon raqamingizni yuboring.' : 'Brauzer Telegramga o‘tishni blokladi. Pastdagi linkni bosing.');
          // Polling 5s × 60 = 5 daqiqa: avval 1 daqiqa keyin to'xtardi va
          // foydalanuvchi botda kechikib ulansa, ulanish payqalmasdi. Endi
          // 5 daqiqa kutadi va keyin Manual refresh kerakligini bildiradi.
          let tries = 0;
          const MAX_TRIES = 60;
          const token = OlympyApi.getToken();
          // Eskisi bo'lsa tozalaymiz — foydalanuvchi tugmani bir necha bor
          // bossa, ko'plab interval'lar parallel ishlamaydi.
          if (telegramPollRef.current) clearInterval(telegramPollRef.current);
          const pollId = setInterval(() => {
            tries += 1;
            OlympyApi.getMe(token)
              .then(fresh => {
                const mapped = OlympyApi.mapBackendUser(fresh);
                if (mapped.telegramLinked) {
                  const auth = OlympyApi.loadAuth();
                  OlympyApi.saveAuth({ token: auth?.token || token, refresh: auth?.refresh, user: mapped });
                  setTelegramLinked(true);
                  clearInterval(pollId);
                  telegramPollRef.current = null;
                }
              })
              .catch(() => {});
            if (tries >= MAX_TRIES) {
              clearInterval(pollId);
              telegramPollRef.current = null;
              showToast('Polling tugadi. Telegramda ulansangiz, sahifani yangilang.');
            }
          }, 5000);
          telegramPollRef.current = pollId;
        } else {
          showToast('Bot username sozlanmagan');
        }
      })
      .catch(err => {
        console.warn('startTelegramLink failed:', err);
        showToast(OlympyApi.toUserMessage(err));
      })
      .finally(() => setTelegramLinkLoading(false));
  };

  React.useEffect(() => {
    setTelegramLinked(!!user?.telegramLinked);
  }, [user?.telegramLinked]);

  // Manager's center
  const managerRole = user.roles?.manager;
  const managerCenterId = managerRole?.centerId || null;
  const loadPendingStudents = React.useCallback(() => {
    if (!isApi || !managerCenterId) {
      setPendingStudents([]);
      return Promise.resolve();
    }
    return OlympyApi.getPendingMemberships(managerCenterId, 'student', OlympyApi.getToken())
      .then(rows => setPendingStudents(Array.isArray(rows) ? rows : []));
  }, [isApi, managerCenterId]);

  // O'qituvchi arizalari ham manager arizalar bo'limida ko'rsatiladi/tasdiqlanadi
  // (onboarding banneri "o'quvchi va o'qituvchi arizalari" deb va'da beradi).
  const loadPendingTeachers = React.useCallback(() => {
    if (!isApi || !managerCenterId) {
      setPendingTeachers([]);
      return Promise.resolve();
    }
    return OlympyApi.getPendingMemberships(managerCenterId, 'teacher', OlympyApi.getToken())
      .then(rows => setPendingTeachers(Array.isArray(rows) ? rows : []));
  }, [isApi, managerCenterId]);

  const loadApprovedStudents = React.useCallback(() => {
    if (!isApi || !managerCenterId) {
      setApprovedStudents([]);
      return Promise.resolve();
    }
    return OlympyApi.getStudentMemberships(managerCenterId, 'approved', OlympyApi.getToken())
      .then(rows => setApprovedStudents(Array.isArray(rows) ? rows : []));
  }, [isApi, managerCenterId]);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadPendingStudents().catch(err => {
        if (!cancelled) {
          console.warn('getPendingMemberships failed:', err);
          setPendingStudents([]);
        }
      });
      loadPendingTeachers().catch(err => {
        if (!cancelled) {
          console.warn('getPendingMemberships(teacher) failed:', err);
          setPendingTeachers([]);
        }
      });
      loadApprovedStudents().catch(err => {
        if (!cancelled) {
          console.warn('getStudentMemberships failed:', err);
          setApprovedStudents([]);
        }
      });
    };
    refresh();
    // Faqat tab ko'rinib turganda poll qilamiz — fon tab'da CPU/network
    // sarflashning hech qanday foydasi yo'q (Telegram WebView'da bu telefon
    // batareyasini ham yeyadi).
    const intervalId = isApi && managerCenterId
      ? setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            refresh();
          }
        }, 15000)
      : null;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isApi, managerCenterId, loadPendingStudents, loadApprovedStudents]);

  const loadProctoring = React.useCallback(() => {
    if (!isApi || !liveOlympiadId) {
      setProctoringData([]);
      return Promise.resolve();
    }
    return OlympyApi.getOlympiadLiveProctoring(liveOlympiadId, OlympyApi.getToken())
      .then(res => {
        setProctoringData(Array.isArray(res) ? res : []);
        setProctoringError('');
      })
      .catch(err => {
        console.warn('getOlympiadLiveProctoring failed:', err);
        setProctoringError("Jonli nazorat ma'lumotlarini yuklab bo'lmadi.");
      });
  }, [isApi, liveOlympiadId]);

  // Cheating tekshiruvi bo'yicha qaror: 'disqualify' yoki 'continue'.
  // Tugmalar bosilishi bilan disable qilinadi (ikki marta yuborishning oldini
  // olish). 409 — boshqa menejer allaqachon hal qilgan; toast + refresh.
  const handleReviewCheating = React.useCallback((sessionId, decision) => {
    if (!isApi || !sessionId || reviewBusyIds[sessionId]) return;
    setReviewBusyIds(prev => ({ ...prev, [sessionId]: true }));
    OlympyApi.reviewCheatingCase(sessionId, decision, OlympyApi.getToken())
      .then(() => {
        showToast(decision === 'disqualify' ? 'Diskvalifikatsiya qilindi' : 'Davom etishga ruxsat berildi');
      })
      .catch(err => {
        if (err?.status === 409) {
          showToast('Bu holat allaqachon hal qilingan');
        } else {
          console.warn('reviewCheatingCase failed:', err);
          showToast(OlympyApi.toUserMessage?.(err) || "Amalni bajarib bo'lmadi");
        }
      })
      .finally(() => {
        setReviewBusyIds(prev => { const n = { ...prev }; delete n[sessionId]; return n; });
        loadProctoring();
      });
  }, [isApi, reviewBusyIds, loadProctoring]);

  // Kod (IT) javoblari modalini ochish va yuklash.
  const openCodeSubmissions = (olympiad) => {
    if (!isApi) { showToast('Real server rejimida ishlaydi'); return; }
    const backendId = olympiad.backendId ?? olympiad.olympiad_id ?? olympiad.id;
    setCodeSubModal({ id: backendId, title: olympiad.title });
    setCodeSubData([]);
    setCodeSubExpanded({});
    setCodeSubError('');
    setCodeSubLoading(true);
    OlympyApi.getCodeSubmissions(backendId, OlympyApi.getToken())
      .then(res => { setCodeSubData(Array.isArray(res) ? res : []); })
      .catch(err => {
        console.warn('getCodeSubmissions failed:', err);
        setCodeSubError(OlympyApi.toUserMessage?.(err) || "Kod javoblarini yuklab bo'lmadi.");
      })
      .finally(() => setCodeSubLoading(false));
  };

  // Essay javoblarini yuklash (modal ochiq paytda filter o'zgarsa ham chaqiriladi).
  const loadEssayAnswers = (olympiadBackendId, onlyUngraded) => {
    setEssayError('');
    setEssayLoading(true);
    OlympyApi.getOlympiadEssayAnswers(olympiadBackendId, OlympyApi.getToken(), onlyUngraded)
      .then(res => { setEssayData(Array.isArray(res) ? res : []); })
      .catch(err => {
        console.warn('getOlympiadEssayAnswers failed:', err);
        setEssayError(OlympyApi.toUserMessage?.(err) || "Essay javoblarini yuklab bo'lmadi.");
      })
      .finally(() => setEssayLoading(false));
  };

  // Essay baholash modalini ochish.
  const openEssayGrading = (olympiad) => {
    if (!isApi) { showToast('Real server rejimida ishlaydi'); return; }
    const backendId = olympiad.backendId ?? olympiad.olympiad_id ?? olympiad.id;
    setEssayModal({ id: backendId, title: olympiad.title });
    setEssayData([]);
    setEssayDrafts({});
    setEssayOnlyUngraded(true);
    loadEssayAnswers(backendId, true);
  };

  // Bitta essay javobga ball + izoh saqlash. Backend attempt foizini ham
  // qayta hisoblab qaytaradi.
  const saveEssayGrade = (entry) => {
    const key = `${entry.attempt_id}:${entry.question_id}`;
    const draft = essayDrafts[key] || {};
    const rawScore = draft.score !== undefined ? draft.score : entry.score;
    const score = parseInt(rawScore, 10);
    if (Number.isNaN(score) || score < 0 || score > entry.max_score) {
      showToast(`⚠ Ball 0 dan ${entry.max_score} gacha bo'lishi kerak`);
      return;
    }
    const feedback = draft.feedback !== undefined ? draft.feedback : (entry.feedback || '');
    setEssaySavingKey(key);
    OlympyApi.gradeEssayAnswer(entry.attempt_id, entry.question_id, { score, feedback }, OlympyApi.getToken())
      .then(res => {
        setEssayData(list => list.map(e =>
          (e.attempt_id === entry.attempt_id && e.question_id === entry.question_id)
            ? { ...e, ...res }
            : e
        ));
        setEssayDrafts(p => { const n = { ...p }; delete n[key]; return n; });
        showToast('✓ Baho saqlandi');
      })
      .catch(err => {
        console.warn('gradeEssayAnswer failed:', err);
        showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Bahoni saqlab bo'lmadi"}`);
      })
      .finally(() => setEssaySavingKey(''));
  };

  // Natijalar modali: tanlangan tadbirning bitta sahifasini yuklaydi.
  // page_size 200 — 200+ ishtirokchi bo'lsa "Keyingisi →" pagination ishlaydi.
  const RESULTS_PAGE_SIZE = 200;
  // Eskirgan javob himoyasi (AdminDashboard:2751 dagi ID-solishtirish naqshi):
  // tadbir tez almashtirilsa yoki "Keyingisi →" ketma-ket bosilsa, sekinroq
  // birinchi javob ikkinchisidan KEYIN qaytib, sarlavhadagi tadbir ostiga
  // boshqa tadbirning natijalarini yozib qo'yardi. Javobda tadbir id'si
  // qaytmaydi, shuning uchun oxirgi so'rov kaliti ref'da saqlanadi va javob
  // faqat o'sha kalit hali joriy bo'lsa qo'llanadi.
  const resultsReqRef = React.useRef('');
  const loadResultsPage = (olympiadBackendId, pageNum) => {
    const reqKey = `${olympiadBackendId}:${pageNum}`;
    resultsReqRef.current = reqKey;
    setResultsModal(m => ({ ...m, loading: true }));
    OlympyApi.getLeaderboardForOlympiad(olympiadBackendId, pageNum, RESULTS_PAGE_SIZE, OlympyApi.getToken())
      .then(res => {
        if (resultsReqRef.current !== reqKey) return;
        setResultsModal(m => ({
          ...m,
          data: Array.isArray(res?.entries) ? res.entries : [],
          total: res?.pagination?.total ?? (Array.isArray(res?.entries) ? res.entries.length : 0),
          page: pageNum,
          loading: false,
        }));
      })
      .catch(err => {
        if (resultsReqRef.current !== reqKey) return;
        console.warn('getLeaderboardForOlympiad failed:', err);
        showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Natijalarni yuklab bo'lmadi"}`);
        setResultsModal(m => ({ ...m, loading: false }));
      });
  };

  const openResultsModal = (olympiad) => {
    if (!isApi) { showToast('Real server rejimida ishlaydi'); return; }
    const backendId = olympiad.backendId ?? olympiad.olympiad_id ?? olympiad.id;
    setResultsModal({ open: true, event: olympiad, data: [], loading: true, page: 1, total: 0 });
    loadResultsPage(backendId, 1);
  };

  // Natijalar jadvalidan o'quvchi qatoriga bosilganda chaqiriladi: o'sha
  // o'quvchining tadbirdagi har bir savol bo'yicha javobini yuklaydi.
  const openStudentReview = (row) => {
    if (!isApi) { showToast('Real server rejimida ishlaydi'); return; }
    const olympiadBackendId = resultsModal.event?.backendId ?? resultsModal.event?.olympiad_id ?? resultsModal.event?.id;
    const userId = row?.user_id;
    if (!olympiadBackendId || !userId) return;
    setStudentReviewModal({
      open: true, studentId: userId, studentName: row.name || "O'quvchi", data: null, loading: true, error: '',
    });
    // Eskirgan javob himoyasi (AdminDashboard:2751 dagi ID-solishtirish
    // naqshi): ketma-ket ikki o'quvchi bosilib, birinchi so'rov ikkinchisidan
    // keyin qaytsa, bitta o'quvchining ismi ustida boshqasining imtihon
    // javoblari ko'rinardi — bu diskvalifikatsiya qaroriga asos bo'ladigan
    // ma'lumot. Javob modal hali o'sha o'quvchida turgandagina qo'llanadi.
    OlympyApi.getEventUserAnswers(olympiadBackendId, userId, OlympyApi.getToken())
      .then(res => {
        setStudentReviewModal(m => (m.studentId !== userId ? m : {
          ...m,
          data: res || null,
          studentName: res?.student_name || m.studentName,
          loading: false,
        }));
      })
      .catch(err => {
        console.warn('getEventUserAnswers failed:', err);
        setStudentReviewModal(m => (m.studentId !== userId ? m : {
          ...m,
          loading: false,
          error: OlympyApi.toUserMessage?.(err) || "Javoblarni yuklab bo'lmadi",
        }));
      });
  };

  // Adaptiv polling: biror o'quvchi tekshiruv kutayotgan bo'lsa (pending_review)
  // menejer qarorini tezroq ko'rsatish va student kam kutishi uchun 5s ga
  // qisqartiramiz; aks holda oddiy 10s.
  const hasPendingReview = proctoringData.some(p => p.pending_review);
  React.useEffect(() => {
    if (page !== 'proctoring' || !liveOlympiadId) return undefined;
    setProctoringLoading(true);
    loadProctoring().finally(() => setProctoringLoading(false));

    const intervalMs = hasPendingReview ? 5000 : 10000;
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadProctoring();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [page, liveOlympiadId, loadProctoring, hasPendingReview]);

  React.useEffect(() => {
    setAssignedQuestionIds(assignModal?.questionIds || []);
    setAssignmentLevel(assignModal?.testLevel || '');
    setAssignmentType(assignModal?.testType || '');
    setOnlyUnused(true);
  }, [assignModal?.id]);

  // ─── API rejimida olimpiada/savol/markazlarni real backend'dan olish ───
  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiQuestionsRes = useApiData(
    () => (isApi && managerCenterId)
      ? OlympyApi.getQuestions(managerCenterId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, managerCenterId],
  );

  React.useEffect(() => {
    if (page === 'olympiads' && isApi && managerCenterId) {
      apiQuestionsRes.reload();
      apiOlympiadsRes.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isApi, managerCenterId]);

  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const apiQuestions = isApi && Array.isArray(apiQuestionsRes.data) ? apiQuestionsRes.data.map(mapApiQuestion) : null;

  // Manager statistikasi: backend GET /api/manager/stats/ — center bo'yicha
  // o'rtacha ball, eng yuqori, qatnashuvchilar. Avval bu raqamlar Natijalar
  // sahifasida hardcoded ("78.4%, 96%, 484") edi.
  const managerStatsRes = useApiData(
    () => (isApi && managerCenterId)
      ? OlympyApi.getManagerStats(managerCenterId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, managerCenterId],
  );

  // Savollar analitikasi (eng ko'p noto'g'ri savollar).
  const questionAnalyticsRes = useApiData(
    () => (isApi && managerCenterId)
      ? OlympyApi.getQuestionAnalytics(managerCenterId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, managerCenterId],
  );

  const baseCenters = isApi ? (apiCenters || []) : store.centers;
  const center = managerCenterId ? baseCenters.find(c => String(c.id) === String(managerCenterId)) : null;
  const centerId = center?.id;
  const centerName = center?.name || 'Tashkilot';
  const centerType = center?.organizationType || "O'quv markaz";
  // O'qituvchi arizasini kim tasdiqlay oladi — backend
  // `user_can_approve_membership` (centers/services.py:121-140) ning aynan
  // ko'zgusi: platform admin doim; markaz egasi esa markaz tasdiqlangan
  // bo'lsa. Menejer bo'lib turgan foydalanuvchi ayni paytda SHU markazning
  // egasi ham bo'lishi mumkin (rol almashtirgich orqali kirgan) — o'shanda
  // tugma ishlaydi va olib tashlanmasligi kerak.
  // `center.ownerId` bu savolga ishonchli javob beradi: public serializer
  // (centers/serializers.py get_owner) `owner` maydonini FAQAT o'sha markaz
  // egasiga yoki platform adminga qaytaradi, qolganlarga `null`. Ya'ni
  // "boshqa markaz egasi" holati o'z-o'zidan chetlab o'tiladi.
  // Demo (store) rejimida bu cheklov yo'q va tasdiqlash mahalliy store'da
  // bajariladi — u yerda 403 umuman bo'lmaydi, shuning uchun avvalgidek.
  const canApproveStaffRequests = isApi
    ? (!!user?.isPlatformAdmin || (center?.ownerId != null && center?.status === 'approved'))
    : true;

  // Olympiads of this center (live)
  const olympiads = (isApi ? (apiOlympiads || []) : store.olympiads).filter(o => String(o.centerId) === String(centerId));
  // Questions of this center (for assigning to olympiads)
  const centerQuestions = (isApi ? (apiQuestions || []) : store.questions).filter(q => String(q.centerId) === String(centerId));

  // Live students at this center (approved). API rejimida backend'dan keladi;
  // mock rejimda esa eski mock store filteridan.
  const students = isApi
    ? approvedStudents.map(m => ({
        id: `api:${m.membership_id}`,
        membershipId: m.membership_id,
        name: m.user?.full_name || m.user?.name || '—',
        phone: m.user?.normalized_phone || m.user?.phone || '—',
        avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
        joined: (m.created_at || '').slice(0, 10),
        subject: m.subject || '—',
        // Backend students_memberships endpoint endi olympiads_count va
        // avg_score qaytaradi — avval doim 0 ko'rinardi.
        olympiads: m.olympiads_count || 0,
        avgScore: m.avg_score || 0,
        groupTag: m.group_tag || '',
        isPremium: !!(m.user?.is_premium ?? m.user?.isPremium),
        status: 'Tasdiqlandi',
      }))
    : store.users.filter(u =>
        u.roles?.student?.status === 'approved' && u.roles.student.centerId === centerId
      ).map(u => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        avatarUrl: u.avatarUrl || '',
        joined: u.joined,
        subject: u.roles?.student?.subject || '—',
        olympiads: u.olympiads || 0,
        avgScore: u.avgScore || 0,
        status: 'Tasdiqlandi',
      }));

  // Live student/teacher-join requests at this center (rol ikkalasi ham
  // manager "Arizalar" bo'limida bir xil ro'yxatda ko'rsatiladi).
  const mockRequests = store.requests.filter(r => (r.type === 'student' || r.type === 'teacher') && r.centerId === centerId).map(r => {
    const u = store.users.find(x => x.id === r.userId);
    return {
      id: r.id,
      role: r.type,
      name: u?.name || '—',
      phone: u?.phone || '—',
      avatarUrl: u?.avatarUrl || '',
      date: r.date,
      subject: u?.roles?.[r.type]?.subject || r.subject || '—',
      approvalCode: '',
      status: statusLabel(r.status),
      _raw: r,
    };
  });
  const apiRequests = pendingStudents.map(m => ({
    id: `api:student:${m.membership_id}`,
    role: 'student',
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
    date: (m.created_at || '').slice(0, 10),
    subject: m.subject || '—',
    approvalCode: m.approval_code || '',
    status: 'Kutilmoqda',
    _raw: m,
  }));
  const apiTeacherRequests = pendingTeachers.map(m => ({
    id: `api:teacher:${m.membership_id}`,
    role: 'teacher',
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
    date: (m.created_at || '').slice(0, 10),
    subject: m.subject || '—',
    approvalCode: m.approval_code || '',
    status: 'Kutilmoqda',
    _raw: m,
  }));
  const requests = isApi ? [...apiRequests, ...apiTeacherRequests] : mockRequests;

  const openStudentDetail = (studentRow) => {
    if (!isApi) {
      showToast("⚠ O'quvchi profili faqat akkaunt rejimida");
      return;
    }
    if (!studentRow?.membershipId) {
      showToast("⚠ Membership ID topilmadi");
      return;
    }
    setStudentDetailMembership(studentRow);
    setStudentDetail(null);
    setStudentDetailError('');
    setStudentDetailLoading(true);
    OlympyApi.getStudentDetail(studentRow.membershipId, OlympyApi.getToken())
      .then(data => setStudentDetail(data))
      .catch(err => {
        console.warn('getStudentDetail failed:', err);
        setStudentDetailError(OlympyApi.toUserMessage?.(err) || "Ma'lumot yuklanmadi");
      })
      .finally(() => setStudentDetailLoading(false));
  };

  // Guruh tegini saqlash (10-funksiya).
  const saveGroupTag = (row, value) => {
    if (!row || !isApi || !row.membershipId) { setGroupTagEdit(null); return; }
    const trimmed = (value || '').trim();
    if (trimmed === (row.groupTag || '')) { setGroupTagEdit(null); return; }
    OlympyApi.setMemberGroupTag(managerCenterId, row.membershipId, trimmed, OlympyApi.getToken())
      .then(() => loadApprovedStudents())
      .then(() => showToast('Guruh tegi yangilandi'))
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "Guruhni saqlab bo'lmadi"))
      .finally(() => setGroupTagEdit(null));
  };

  const closeStudentDetail = () => {
    setStudentDetailMembership(null);
    setStudentDetail(null);
    setStudentDetailError('');
  };

  const handleRequest = (id, action, raw) => {
    if (isApi) {
      const token = OlympyApi.getToken();
      const requestEntry = requests.find(r => r.id === id);
      const requestRow = raw || requestEntry?._raw;
      const membershipId = requestRow?.membership_id ?? requestRow?.membershipId ?? requestRow?.backendId;
      if (!membershipId || !centerId) {
        showToast('⚠ API rejimida ariza ma\'lumoti yetarli emas');
        return;
      }
      const backendCenterId = center?.backendId ?? centerId;
      // O'qituvchi arizasi uchun boshqa endpoint. Tugma faqat
      // `canApproveStaffRequests` bo'lganda ko'rsatiladi (markaz egasi yoki
      // platform admin) — aks holda backend 403 qaytaradi.
      const isTeacherRequest = requestEntry?.role === 'teacher';
      const approveFn = isTeacherRequest ? OlympyApi.approveTeacher : OlympyApi.approveStudent;
      // Ikki marta yuborishdan himoya — OwnerDashboard'dagi `studentActionId`
      // naqshi: amal ketayotgan ariza id'si saqlanadi, tugma disabled bo'ladi.
      setRequestActionId(id);
      approveFn(
        backendCenterId,
        { membership_id: membershipId, decision: action === 'approve' ? 'approved' : 'rejected' },
        token,
      )
        .then(() => isTeacherRequest ? loadPendingTeachers() : loadPendingStudents())
        .then(() => showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi'))
        .catch(err => { console.warn('approveStudent/approveTeacher failed:', err); showToast(err?.message ? `⚠ ${err.message}` : "⚠ Tasdiqlab bo'lmadi"); })
        .finally(() => setRequestActionId(null));
      return;
    }
    if (action === 'approve') OlympyStore.approveRequest(id);
    else OlympyStore.rejectRequest(id);
    showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi');
  };

  // Markaz do'koni: yuklash, qo'shish, tahrirlash, o'chirish.
  const loadShopProducts = React.useCallback(() => {
    if (!isApi || !managerCenterId) { setShopProducts([]); return Promise.resolve(); }
    return OlympyApi.getCenterShopProducts(OlympyApi.getToken(), managerCenterId)
      .then(rows => { setShopProducts(Array.isArray(rows) ? rows : []); });
  }, [isApi, managerCenterId]);

  React.useEffect(() => {
    if (page !== 'shop') return undefined;
    let cancelled = false;
    setShopLoading(true);
    loadShopProducts()
      .catch(() => { if (!cancelled) setShopProducts([]); })
      .finally(() => { if (!cancelled) setShopLoading(false); });
    return () => { cancelled = true; };
  }, [page, loadShopProducts]);

  const openShopModal = (product) => {
    if (product) {
      setShopForm({
        title: product.title || '',
        description: product.description || '',
        coin_cost: product.coin_cost ?? 0,
        icon: product.icon || '🎁',
        stock: product.stock ?? 0,
        is_active: product.is_active !== false,
        features: Array.isArray(product.features) ? product.features.map(f => (typeof f === 'string' ? f : (f?.value || ''))).filter(Boolean) : [],
        imageFile: null,
        image_url: product.image_url || '',
      });
      setShopModal(product);
    } else {
      setShopForm(emptyShopForm);
      setShopModal('new');
    }
  };
  const closeShopModal = () => { setShopModal(null); setShopForm(emptyShopForm); };

  const submitShopProduct = () => {
    if (!isApi || !managerCenterId) { showToast("Demo rejimida ishlamaydi"); return; }
    const title = (shopForm.title || '').trim();
    if (!title) { showToast('Mahsulot nomini kiriting'); return; }
    const coinCost = parseInt(shopForm.coin_cost, 10);
    if (!Number.isFinite(coinCost) || coinCost < 0) { showToast("Tanga narxini to'g'ri kiriting"); return; }
    const stock = parseInt(shopForm.stock, 10);
    const features = (shopForm.features || []).map(f => (typeof f === 'string' ? f.trim() : f)).filter(Boolean);

    let body;
    if (shopForm.imageFile) {
      body = new FormData();
      body.append('title', title);
      body.append('description', (shopForm.description || '').trim());
      body.append('coin_cost', String(coinCost));
      body.append('icon', shopForm.icon || '🎁');
      body.append('stock', String(Number.isFinite(stock) ? stock : 0));
      body.append('is_active', shopForm.is_active ? 'true' : 'false');
      body.append('features', JSON.stringify(features));
      body.append('image', shopForm.imageFile);
    } else {
      body = {
        title,
        description: (shopForm.description || '').trim(),
        coin_cost: coinCost,
        icon: shopForm.icon || '🎁',
        stock: Number.isFinite(stock) ? stock : 0,
        is_active: !!shopForm.is_active,
        features,
      };
    }

    setShopSaving(true);
    const token = OlympyApi.getToken();
    const isEdit = shopModal && shopModal !== 'new';
    const req = isEdit
      ? OlympyApi.updateCenterShopProduct(shopModal.id, body, token, managerCenterId)
      : OlympyApi.createCenterShopProduct(body, token, managerCenterId);
    req
      .then(() => { closeShopModal(); return loadShopProducts(); })
      .then(() => showToast(isEdit ? 'Mahsulot yangilandi' : "Mahsulot qo'shildi"))
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "Saqlab bo'lmadi"))
      .finally(() => setShopSaving(false));
  };

  const deleteShopProduct = (productId) => {
    if (!isApi || !managerCenterId) return;
    setShopDeleting(true);
    OlympyApi.deleteCenterShopProduct(productId, OlympyApi.getToken(), managerCenterId)
      .then(() => loadShopProducts())
      .then(() => { showToast("Mahsulot o'chirildi"); setDeleteProductId(null); })
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi"))
      .finally(() => setShopDeleting(false));
  };

  const toggleShopActive = (product) => {
    if (!isApi || !managerCenterId) return;
    OlympyApi.updateCenterShopProduct(product.id, { is_active: !product.is_active }, OlympyApi.getToken(), managerCenterId)
      .then(() => loadShopProducts())
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'zgartirib bo'lmadi"));
  };

  const pendingCount = requests.filter(r => r.status === 'Kutilmoqda').length;
  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'olympiads', icon: 'trophy', label: 'Musobaqalar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'students', icon: 'users', label: "O'quvchilar" },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'shop', icon: 'award', label: "Do'kon" },
    { key: 'qanalytics', icon: 'info', label: 'Savollar analitikasi' },
    { key: 'analytics', icon: 'chart', label: 'Analitika' },
    { key: 'profile', icon: 'user', label: 'Profil' },
  ];

  // MobileBottomNav faqat dastlabki 5 ta elementni oladi — profil navItems
  // oxirida bo'lgani uchun mobil panelda ko'rinmasdi. Sidebar tartibini
  // buzmasdan mobil uchun alohida ro'yxat: oxiriga profilni kiritamiz.
  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'requests'),
    navItems.find(n => n.key === 'olympiads'),
    navItems.find(n => n.key === 'students'),
    navItems.find(n => n.key === 'profile'),
  ].filter(Boolean);

  // Sidebar/Mobile nav uchun "analytics" tugmasini bosganda app-level
  // sahifaga o'tkazamiz (alohida sahifa).
  const setPageOrSpecial = (key) => {
    if (key === 'analytics') { onNavigate('analytics'); return; }
    setPage(key);
  };

  const formStartIso = (form) => {
    if (!form.startDate) return null;
    return `${form.startDate}T${form.startTime || '00:00'}:00`;
  };

  const eventFormIssues = (form) => {
    const issues = [];
    if (!String(form.title || '').trim()) issues.push('Tadbir nomini kiriting');
    if (!String(form.subject || '').trim()) issues.push('Fanni tanlang');
    if (!form.startDate) issues.push('Boshlanish sanasini belgilang');
    if (!form.startTime) issues.push('Boshlanish vaqtini belgilang');
    if (!Number(form.duration) || Number(form.duration) <= 0) issues.push("Davomiylikni to'g'ri kiriting");
    const start = form.startDate ? new Date(formStartIso(form)) : null;
    if (start && start.getTime() < Date.now()) issues.push("Boshlanish vaqti o'tib ketgan");
    return issues;
  };

  const openCreateEvent = () => {
    setEditingOlympiadId(null);
    setNewOlympiad({ ...emptyOlympiadForm });
    setCreateModal(true);
  };

  // Manager onboarding bannerini yopish — backendni yangilab, user state'ni
  // ham (onUserUpdate orqali) sinxronlaymiz. Idempotent — xato bo'lsa ham
  // bannerni yashiramiz (keyingi getMe'da to'g'ri holat keladi).
  const dismissOnboarding = () => {
    setOnboardingSaving(true);
    setOnboardingDismissed(true);
    OlympyApi.completeManagerOnboarding(OlympyApi.getToken())
      .then(() => {
        if (onUserUpdate) onUserUpdate({ ...user, onboardingManagerCompleted: true });
      })
      .catch(err => { console.warn('completeManagerOnboarding failed:', err); })
      .finally(() => setOnboardingSaving(false));
  };

  const openEditEvent = (event) => {
    if (!event) return;
    if (!['draft', 'inactive'].includes(event.status)) {
      showToast(event.status === 'active'
        ? "⚠ Tahrirlash uchun avval nofaollashtiring"
        : "⚠ Yakunlangan tadbir tahrirlanmaydi");
      return;
    }
    setEditingOlympiadId(event.id);
    setNewOlympiad({
      eventType: event.eventType || 'competition',
      title: event.title || '',
      subject: event.subject || store.subjects[0] || 'Matematika',
      startDate: event.startDate || '',
      startTime: event.startTime || '10:00',
      duration: event.duration || event.duration_minutes || 60,
      maxScore: event.maxScore || 100,
      status: event.status || 'draft',
      testLevel: event.testLevel || '',
      testType: event.testType || '',
      groupFilter: event.groupFilter || '',
      itCategory: event.itCategory || '',
      allowedLanguages: Array.isArray(event.allowedLanguages) ? event.allowedLanguages : [],
      cameraProctoringEnabled: !!event.cameraProctoringEnabled,
      voiceProctoringEnabled: !!event.voiceProctoringEnabled,
    });
    setCreateModal(true);
  };

  const resetEventModal = () => {
    setCreateModal(false);
    setEditingOlympiadId(null);
    setNewOlympiad({ ...emptyOlympiadForm });
  };

  const closeEventModal = () => {
    if (eventSaving) return;
    resetEventModal();
  };

  const eventErrorMessage = (err) =>
    err?.data?.errors?.[0] || OlympyApi.toUserMessage(err);

  const saveEvent = () => {
    const issues = eventFormIssues(newOlympiad);
    if (issues.length) {
      showToast(`⚠ ${issues[0]}`);
      return;
    }
    const editingEvent = editingOlympiadId
      ? olympiads.find(o => String(o.id) === String(editingOlympiadId))
      : null;
    const payload = {
      event_type: newOlympiad.eventType,
      title: newOlympiad.title.trim(),
      subject: newOlympiad.subject,
      start_datetime: formStartIso(newOlympiad),
      duration_minutes: Number(newOlympiad.duration) || 60,
      test_level: (newOlympiad.testLevel || '').trim(),
      test_type: newOlympiad.testType || '',
      group_filter: (newOlympiad.groupFilter || '').trim(),
      it_category: newOlympiad.itCategory || '',
      allowed_languages: Array.isArray(newOlympiad.allowedLanguages) ? newOlympiad.allowedLanguages : [],
      camera_proctoring_enabled: !!newOlympiad.cameraProctoringEnabled,
      voice_proctoring_enabled: !!newOlympiad.voiceProctoringEnabled,
    };

    if (isApi) {
      const token = OlympyApi.getToken();
      const backendCenterId = center?.backendId ?? centerId;
      const request = editingEvent
        ? OlympyApi.updateOlympiad(editingEvent.backendId ?? editingEvent.id, payload, token)
        : OlympyApi.createOlympiad({ center: backendCenterId, ...payload }, token);
      setEventSaving(true);
      request
        .then(() => {
          showToast(editingEvent
            ? `✓ ${eventTypeLabel(newOlympiad.eventType)} yangilandi`
            : `✓ ${eventTypeLabel(newOlympiad.eventType)} yaratildi`);
          resetEventModal();
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('save olympiad failed:', err);
          // 8-funksiya: bepul markaz limiti oshganda backend
          // {upgrade_required:true} bilan 403 qaytaradi — premium modal.
          if (err?.status === 403 && err?.data?.upgrade_required) {
            resetEventModal();
            setPremiumModal(err.data.detail || 'Bepul rejimda olimpiada limiti tugadi.');
          } else {
            showToast(`⚠ ${eventErrorMessage(err)}`);
          }
        })
        .finally(() => setEventSaving(false));
      return;
    }

    const localPatch = {
      eventType: newOlympiad.eventType,
      title: newOlympiad.title.trim(),
      subject: newOlympiad.subject,
      startDate: newOlympiad.startDate,
      startTime: newOlympiad.startTime,
      duration: Number(newOlympiad.duration) || 60,
      maxScore: newOlympiad.maxScore,
      testLevel: (newOlympiad.testLevel || '').trim(),
      testType: newOlympiad.testType || '',
      groupFilter: (newOlympiad.groupFilter || '').trim(),
    };
    if (editingEvent) {
      OlympyStore.updateOlympiad(editingEvent.id, localPatch);
      showToast(`✓ ${eventTypeLabel(newOlympiad.eventType)} yangilandi`);
    } else {
      OlympyStore.createOlympiad({
        centerId,
        ...localPatch,
        status: 'draft',
        createdBy: user.id,
      });
      showToast(`✓ ${eventTypeLabel(newOlympiad.eventType)} yaratildi`);
    }
    closeEventModal();
  };

  const requestActivation = (event) => {
    const issues = eventReadinessIssues(event);
    if (issues.length) {
      showToast(`⚠ ${issues[0]}`);
      return;
    }
    setActivateConfirm(event);
  };

  const confirmActivation = () => {
    if (!activateConfirm) return;
    const event = activateConfirm;
    if (isApi) {
      setEventSaving(true);
      OlympyApi.publishOlympiad(event.backendId ?? event.id, OlympyApi.getToken())
        .then(() => {
          showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} faollashtirildi`);
          setActivateConfirm(null);
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('publishOlympiad failed:', err);
          showToast(`⚠ ${eventErrorMessage(err)}`);
        })
        .finally(() => setEventSaving(false));
      return;
    }
    OlympyStore.publishOlympiad(event.id);
    showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} faollashtirildi`);
    setActivateConfirm(null);
  };

  const deactivateEvent = (event) => {
    if (!event || event.status !== 'active') return;
    if (isApi) {
      setEventSaving(true);
      OlympyApi.deactivateOlympiad(event.backendId ?? event.id, OlympyApi.getToken())
        .then(() => {
          showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} nofaollashtirildi`);
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('deactivateOlympiad failed:', err);
          showToast(`⚠ ${eventErrorMessage(err)}`);
        })
        .finally(() => setEventSaving(false));
      return;
    }
    OlympyStore.updateOlympiad(event.id, { status: 'inactive' });
    showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} nofaollashtirildi`);
  };

  const finishEvent = (event) => {
    if (!event || event.status !== 'active') return;
    if (isApi) {
      setEventSaving(true);
      OlympyApi.finishOlympiad(event.backendId ?? event.id, OlympyApi.getToken())
        .then(() => {
          showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} yakunlandi`);
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('finishOlympiad failed:', err);
          showToast(`⚠ ${eventErrorMessage(err)}`);
        })
        .finally(() => setEventSaving(false));
      return;
    }
    OlympyStore.updateOlympiad(event.id, { status: 'finished' });
    showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} yakunlandi`);
  };

  const deleteEvent = () => {
    if (!deleteEventId) return;
    const event = olympiads.find(o => String(o.id) === String(deleteEventId));
    if (!event) return;
    
    if (isApi) {
      setEventSaving(true);
      OlympyApi.deleteOlympiad(event.backendId ?? event.id, OlympyApi.getToken())
        .then(() => {
          showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} muvaffaqiyatli o'chirildi`);
          setDeleteEventId(null);
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('deleteOlympiad failed:', err);
          showToast(`⚠ ${eventErrorMessage(err)}`);
        })
        .finally(() => setEventSaving(false));
      return;
    }
    
    OlympyStore.deleteOlympiad(event.id);
    showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} muvaffaqiyatli o'chirildi`);
    setDeleteEventId(null);
  };

  const renderHome = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
      {/* `.glass` hoshiyani inset box-shadow bilan chizadi — ustiga `border-*`
          qo'yilsa ikkita halqa chiqadi. Shuning uchun urg'u faqat chap
          chiziq bilan beriladi (bir tomonlama border halqa yasamaydi). */}
      {user?.onboardingManagerCompleted === false && !onboardingDismissed && (
        <div className="glass rounded-2xl p-5 border-l-4 border-l-accent">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-accent-fill text-on-accent">
              <Icon name="sparkles" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-text-primary uppercase tracking-widest">Manager paneliga xush kelibsiz</h3>
              <p className="text-text-secondary text-sm mt-0.5">Ish boshlash uchun ikki asosiy qadam:</p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-center gap-2 text-sm text-text-primary">
                  <Icon name="check" size={15} className="text-accent flex-shrink-0" />
                  O'quvchi va o'qituvchi arizalarini ko'rib chiqing
                </li>
                <li className="flex items-center gap-2 text-sm text-text-primary">
                  <Icon name="check" size={15} className="text-accent flex-shrink-0" />
                  Birinchi tadbir/olimpiada yarating
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => { setPage('requests'); dismissOnboarding(); }}
                  className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <Icon name="bell" size={15} /> Arizalarni ko'rish
                </button>
                <button onClick={dismissOnboarding} disabled={onboardingSaving}
                  className="btn-ghost px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
                  Yopish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-text-primary uppercase tracking-wide">{centerName}</h2>
          <p className="text-text-secondary text-sm">{centerType} · Manager paneli · <span className="font-data">{new Date().toLocaleDateString('uz-UZ')}</span></p>
        </div>
        <button onClick={openCreateEvent} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={16} /> Tadbir yaratish
        </button>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* `StatCard` ikonka plitkasiga `bg-gradient-to-br ${color}` qo'yadi.
            To'xtash nuqtasiz gradient chizilmaydi, shuning uchun `color` ga
            oddiy yuza klassi berilsa plitka tekis qoladi (StudentDashboard
            bilan bir xil naqsh). */}
        <StatCard label="Kutilayotgan arizalar" value={pendingCount} sub={pendingCount > 0 ? 'Yangi' : ''} icon={<Icon name="bell" size={20} />} color="bg-surface-2 text-text-secondary" />
        <StatCard label="Faol tadbirlar" value={olympiads.filter(o => o.status === 'active').length} icon={<Icon name="trophy" size={20} />} color="bg-surface-2 text-text-secondary" />
        <StatCard label="Jami tadbirlar" value={olympiads.length} icon={<Icon name="bolt" size={20} />} color="bg-surface-2 text-text-secondary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* O'quvchi va o'qituvchi arizalari (doim ko'rinadi). Kutilayotgan
            arizalar bo'lsa — amal talab qiladigan yagona element sifatida
            to'liq kenglikda va vizual jihatdan ustuvor ko'rsatiladi;
            read-only kartalar pastda teng qatorda qoladi. */}
        {/* Amal talab qilinsa — chap chetdagi ogohlantirish chizig'i (shakl),
            chip esa raqamni aytadi. Rang yagona signal emas. */}
        <div className={`glass rounded-2xl p-5 ${pendingCount > 0 ? 'xl:col-span-2 border-l-4 border-l-warning' : ''}`}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-display font-bold text-text-primary uppercase tracking-widest">Arizalar</h3>
              {pendingCount > 0 && (
                <span className="chip text-[10px] font-bold uppercase tracking-wider badge-pending">
                  <span className="font-data">{pendingCount}</span> ta amal talab qiladi
                </span>
              )}
            </div>
            <button onClick={() => setPage('requests')} className="btn-ghost text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0">Barchasi</button>
          </div>
          <div className="space-y-2">
            {requests.filter(r => r.status === 'Kutilmoqda').slice(0, 3).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <Avatar name={r.name} size={36} gradient="bg-pencil-600" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    {r.name}
                    {/* Rol — holat emas, TOIFA. Shuning uchun `badge-*`
                        semantikasi ishlatilmaydi: o'qituvchi qalam ko'kida,
                        o'quvchi neytral — ikkalasi ham yozuvi bilan o'qiladi. */}
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-surface-2 ${r.role === 'teacher' ? 'text-accent-2 border border-accent-2/45' : 'text-text-secondary border border-edge-strong'}`}>
                      {r.role === 'teacher' ? "O'qituvchi" : "O'quvchi"}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary"><span className="font-data">{r.date}</span> · {r.subject}</div>
                </div>
                {/* Arizalar jadvalidagi bilan bir xil qoida: o'qituvchi
                    arizasini faqat markaz egasi (yoki platform admin)
                    tasdiqlay oladi — backend user_can_approve_membership. */}
                {(r.role !== 'student' && !canApproveStaffRequests) ? (
                  <span className="text-[11px] text-text-secondary shrink-0">Direktor ko'rib chiqadi</span>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleRequest(r.id, 'approve')} disabled={requestActionId === r.id} title="Tasdiqlash" aria-label="Tasdiqlash" className="btn-success text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"><Icon name="check" size={14} /></button>
                    <button onClick={() => handleRequest(r.id, 'reject')} disabled={requestActionId === r.id} title="Rad etish" aria-label="Rad etish" className="btn-danger text-xs px-3 py-1.5 rounded-lg disabled:opacity-50"><Icon name="x" size={14} /></button>
                  </div>
                )}
              </div>
            ))}
            {pendingCount === 0 && <div className="text-sm text-text-secondary text-center py-10">Yangi arizalar yo'q</div>}
          </div>
        </div>

        {/* Musobaqalar */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="font-display font-bold text-text-primary uppercase tracking-widest">Musobaqalar</h3>
            <button onClick={() => setPage('olympiads')} className="btn-ghost text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0">Ko'rish</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 3).map(o => (
              <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 border ${o.status === 'active' ? 'bg-success/10 border-success/40 text-success' : o.status === 'inactive' ? 'bg-warning/10 border-warning/40 text-warning' : o.status === 'draft' ? 'bg-surface-2 border-edge text-text-secondary' : 'bg-accent-2/10 border-accent-2/40 text-accent-2'}`}>
                  <Icon name={o.status === 'active' ? 'trophy' : o.status === 'inactive' ? 'clock' : o.status === 'draft' ? 'edit' : 'check'} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{o.title}</div>
                  <div className="text-xs text-text-secondary">{[o.testLevel, testTypeLabel(o.testType)].filter(Boolean).join(' · ')}{(o.testLevel || o.testType) ? ' · ' : ''}<span className="font-data">{o.participants || 0}</span> ishtirokchi</div>
                </div>
                <div className="flex items-center gap-2">
                  {o.status === 'active' && (
                    <button onClick={() => { setLiveOlympiadId(o.id); setPage('proctoring'); }}
                      className="btn-ghost rounded-lg px-2 py-1 text-[10px] font-bold inline-flex items-center gap-1">
                      <Icon name="eye" size={11} /> Jonli
                    </button>
                  )}
                  <Badge status={statusLabel(o.status)} />
                </div>
              </div>
            ))}
            {olympiads.length === 0 && <div className="text-sm text-text-secondary">Hali tadbir yo'q</div>}
          </div>
        </div>

        {/* Eng yaxshi o'quvchilar */}
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-text-primary uppercase tracking-widest mb-4">Eng yaxshi o'quvchilar</h3>
          <div className="space-y-3">
            {[...students].sort((a,b) => b.avgScore - a.avgScore).slice(0,4).map((s, i) => (
              <div key={s.id} className="flex items-center gap-3">
                {/* Medal ranglari `--color-medal-*` CSS o'zgaruvchilarida turadi,
                    lekin tailwind.config.js `colors` ichida YO'Q — `text-medal-1`
                    kabi utility generatsiya bo'lmaydi. Shuning uchun ular inline
                    `style` orqali olinadi (mavzu bilan baribir almashadi). */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-data border bg-surface-2 ${i > 2 ? 'border-edge text-text-secondary' : ''}`}
                  style={i <= 2 ? { color: `rgb(var(--color-medal-${i + 1}))`, borderColor: `rgb(var(--color-medal-${i + 1}) / 0.5)` } : undefined}>
                  {i+1}
                </div>
                <Avatar name={s.name} size={30} gradient="bg-pencil-600" />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium text-text-primary truncate">{s.name}</div></div>
                <div className="text-sm font-bold font-data text-text-primary">{s.avgScore}%</div>
              </div>
            ))}
            {students.length === 0 && <div className="text-sm text-text-secondary">Hali tasdiqlangan o'quvchilar yo'q</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStudents = () => {
    const searchQuery = (debouncedStudentSearch || '').trim().toLowerCase();
    const filteredStudents = searchQuery
      ? students.filter(s => {
          const name = String(s.name || '').toLowerCase();
          const phone = String(s.phone || '').toLowerCase();
          const subject = String(s.subject || '').toLowerCase();
          return name.includes(searchQuery) || phone.includes(searchQuery) || subject.includes(searchQuery);
        })
      : students;
    return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-text-primary uppercase tracking-wide">O'quvchilar <span className="font-data font-normal text-text-secondary">({filteredStudents.length}{searchQuery && filteredStudents.length !== students.length ? `/${students.length}` : ''})</span></h2>
        <div className="relative w-full sm:w-72"><Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" /><input className="input-field pl-10 py-2 w-full" placeholder="Qidirish..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} /></div>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-edge bg-surface-2">
            {["O'quvchi", 'Telefon', 'Guruh', 'Musobaqalar', "O'rt. ball", 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-text-secondary font-bold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filteredStudents.map(s => {
              return (
                <tr key={s.id} className="olympy-row">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.name} src={s.avatarUrl || ''} size={32} gradient="bg-pencil-600" premium={!!s.isPremium} /><div><div className="text-sm font-medium text-text-primary flex items-center gap-1">{s.isPremium && <span className="text-warning flex-shrink-0" title="Premium o'quvchi"><Icon name="star" size={12} /></span>}{s.name}</div><div className="text-xs font-data text-text-secondary">{s.joined}</div></div></div></td>
                  <td className="px-4 py-3 text-sm font-data text-text-secondary">{maskPhoneDisplay(s.phone, '')}</td>
                  <td className="px-4 py-3">
                    {groupTagEdit && groupTagEdit.membershipId === s.membershipId ? (
                      <input
                        autoFocus
                        className="input-field w-24 py-1 text-xs"
                        value={groupTagEdit.value}
                        placeholder="9-A"
                        maxLength={50}
                        onChange={e => setGroupTagEdit({ membershipId: s.membershipId, value: e.target.value })}
                        onBlur={() => saveGroupTag(s, groupTagEdit.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveGroupTag(s, groupTagEdit.value); if (e.key === 'Escape') setGroupTagEdit(null); }}
                      />
                    ) : (
                      <button
                        onClick={() => isApi && s.membershipId && setGroupTagEdit({ membershipId: s.membershipId, value: s.groupTag || '' })}
                        className={`rounded-lg px-2 py-1 text-xs font-bold transition-colors border ${s.groupTag ? 'border-edge-strong bg-surface-2 text-text-primary hover:border-accent' : 'border-dashed border-edge-strong text-text-secondary hover:text-text-primary hover:border-accent'}`}
                        title="Guruh/sinf tegini tahrirlash"
                      >
                        {s.groupTag || '+ guruh'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-data text-text-primary">{s.olympiads}</td>
                  <td className="px-4 py-3"><span className={`font-bold font-data text-sm ${s.avgScore >= 90 ? 'text-success' : s.avgScore >= 70 ? 'text-accent-2' : 'text-warning'}`}>{s.avgScore || 0}%</span></td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openStudentDetail(s)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Ko'rish</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredStudents.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-text-secondary text-sm">
                {searchQuery ? "Qidiruv bo'yicha o'quvchi topilmadi" : "Tasdiqlangan o'quvchilar yo'q"}
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
    );
  };

  const renderRequests = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-text-primary uppercase tracking-wide">Arizalar</h2>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-2 h-2 rounded-full bg-warning flex-shrink-0"></span>
          <span className="font-data">{pendingCount}</span> ta kutilmoqda
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: '#2b5278' }}>{/* Telegram brend rangi — tashqi tizim belgisi, mavzu bilan almashmaydi.
                Matn ham statik bo'lishi shart: `paper` (#E7E4DC) shu fonda 6.41:1. */}<div className="w-full h-full flex items-center justify-center text-paper font-bold text-sm rounded-xl">TG</div></div>
          <div>
            <div className="text-sm font-bold text-text-primary">Telegram Bot Integratsiya</div>
            <div className="text-xs text-text-secondary">Yangi o'quvchi arizalari botga avtomatik boradi</div>
          </div>
          {/* Holat shakl bilan ham kodlangan: ulangan — to'liq doira,
              ulanmagan — bo'sh halqa (faqat rangga tayanmaydi). */}
          <div className={`ml-auto flex items-center gap-1.5 text-xs font-semibold ${telegramLinked ? 'text-success' : 'text-warning'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 border ${telegramLinked ? 'bg-success border-success' : 'border-warning'}`}></span>
            {telegramLinked ? 'Ulangan' : 'Ulanmagan'}
          </div>
        </div>
        {!telegramLinked && (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={startTelegramLink} disabled={telegramLinkLoading}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name="send" size={13} /> {telegramLinkLoading ? 'Ulanmoqda...' : 'Botni ulash'}
            </button>
            {telegramLink?.telegram_deep_link && (
              <a href={telegramLink.telegram_deep_link} target="_blank" rel="noreferrer"
                onClick={(e) => { if (goToTelegramLink(telegramLink.telegram_deep_link)) e.preventDefault(); }}
                className="text-xs font-semibold text-accent underline underline-offset-2 hover:text-text-primary">
                Telegram botni ochish
              </a>
            )}
            <span className="text-xs text-text-secondary">Ulanmaguncha arizalar faqat sayt ichida ko'rinadi.</span>
          </div>
        )}
        {telegramLinked && (
          <div className="text-xs text-success flex items-center gap-2">
            <Icon name="check" size={13} /> Botdagi tasdiq saytdagi ariza holatini ham avtomatik yangilaydi.
          </div>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
          <thead><tr className="border-b border-edge bg-surface-2">
            {['Ism', 'Rol', 'Telefon', 'Ariza sanasi', 'Fan', 'Kod', 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-text-secondary font-bold">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="olympy-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={r.name} src={r.avatarUrl || ''} size={32} gradient="bg-pencil-600" /><span className="text-sm font-medium text-text-primary">{r.name}</span></div></td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2 ${r.role === 'teacher' ? 'text-accent-2 border border-accent-2/45' : 'text-text-secondary border border-edge-strong'}`}>
                    {r.role === 'teacher' ? "O'qituvchi" : "O'quvchi"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-data text-text-secondary">{maskPhoneDisplay(r.phone, '')}</td>
                <td className="px-4 py-3 text-sm font-data text-text-secondary">{r.date}</td>
                <td className="px-4 py-3">{r.subject && r.subject !== '—' ? <SubjectBadge subject={r.subject} /> : <span className="text-xs text-text-secondary">—</span>}</td>
                <td className="px-4 py-3 text-xs font-mono font-data text-text-secondary">{r.approvalCode || '—'}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status !== 'Kutilmoqda' ? (
                    <span className="text-xs text-text-secondary">—</span>
                  ) : (r.role !== 'student' && !canApproveStaffRequests) ? (
                    // O'qituvchi arizasini backend faqat markaz egasiga (yoki
                    // platform adminga) tasdiqlashga ruxsat beradi
                    // (centers/services.py, user_can_approve_membership) —
                    // oddiy menejer bosganda tugma doim 403 bilan yiqilardi.
                    // Qator ko'rinadi (ro'yxatni ko'rish ruxsat etilgan), lekin
                    // bajarib bo'lmaydigan amal taklif qilinmaydi.
                    <span className="text-xs text-text-secondary">Direktor ko'rib chiqadi</span>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => handleRequest(r.id, 'approve')} disabled={requestActionId === r.id} className="btn-success text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">
                        {requestActionId === r.id ? '...' : 'Tasdiqlash'}
                      </button>
                      <button onClick={() => handleRequest(r.id, 'reject')} disabled={requestActionId === r.id} className="btn-danger text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">Rad etish</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-text-secondary text-sm">Arizalar yo'q</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-xl font-black text-text-primary">Musobaqalar</h2>
        <button onClick={openCreateEvent} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15} /> Yangi tadbir
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {olympiads.length === 0 && (
          <EmptyState icon="trophy" title="Musobaqalar yo'q" desc="Birinchi olimpiada yoki musobaqangizni yarating"
            action={<button onClick={openCreateEvent} className="btn-primary px-4 py-2 rounded-xl text-sm">Yaratish</button>} />
        )}
        {olympiads.map(o => {
          const assignedCount = (o.questionIds || []).length;
          const needsReadiness = ['draft', 'inactive'].includes(o.status);
          const issues = needsReadiness ? eventReadinessIssues(o) : [];
          const isReady = issues.length === 0;
          const canEdit = needsReadiness;
          const statusTone = o.status === 'active'
            ? 'bg-success/15 text-success border-success/40'
            : o.status === 'inactive'
              ? 'bg-warning/15 text-warning border-warning/40'
              : o.status === 'draft'
                ? 'bg-surface-2 text-text-secondary border-edge'
                : 'bg-accent-2/15 text-accent-2 border-accent-2/40';
          const statusIcon = o.status === 'active'
            ? 'trophy'
            : o.status === 'inactive'
              ? 'clock'
              : o.status === 'draft'
                ? 'edit'
                : 'check';
          return (
            <div key={o.id} className="glass rounded-2xl p-5">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${statusTone}`}>
                <Icon name={statusIcon} size={20} />
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="font-bold text-text-primary mb-1">{o.title}</div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  <SubjectBadge subject={o.subject} />
                  <span className={`rounded-lg px-2 py-1 font-bold ${o.eventType === 'olympiad' ? 'bg-accent-2/15 text-accent-2' : 'bg-warning/15 text-warning'}`}>{eventTypeLabel(o.eventType || 'competition')}</span>
                  {/* Daraja — neytral metama'lumot: yonidagi "Tur:" chipi
                      allaqachon `accent-2` ni egallagan, ikkisi bir xil
                      ko'rinmasin. */}
                  {o.testLevel && <span className="rounded-lg bg-surface-2 px-2 py-1 font-bold text-text-primary">Daraja: {o.testLevel}</span>}
                  {o.testType && <span className="rounded-lg bg-accent-2/15 px-2 py-1 font-bold text-accent-2">Tur: {testTypeLabel(o.testType)}</span>}
                  <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} /> {o.startDate || o.date || 'Sana yo\'q'} {o.startTime || ''}</span>
                  <span>{o.duration} min</span>
                  <span>{assignedCount} ta savol</span>
                  <span>{o.participants || 0} ishtirokchi</span>
                  {o.avgScore > 0 && <span className="text-success">Ø {o.avgScore}%</span>}
                </div>
                {needsReadiness ? (
                  <div className={`rounded-xl px-3 py-2 border text-xs ${isReady ? 'bg-success/10 border-success/40 text-success' : 'bg-warning/10 border-warning/40 text-warning'}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon name={isReady ? 'check' : 'info'} size={13} />
                      {isReady ? 'Faollashtirishga tayyor' : 'Tayyor emas'}
                    </div>
                    {!isReady && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {issues.slice(0, 3).map(issue => (
                          <span key={issue} className="rounded-lg bg-surface-1 px-2 py-1">{issue}</span>
                        ))}
                        {issues.length > 3 && <span className="rounded-lg bg-surface-1 px-2 py-1">+{issues.length - 3}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl px-3 py-2 border text-xs ${o.status === 'active' ? 'bg-accent-2/10 border-accent-2/40 text-accent-2' : 'bg-surface-2 border-edge text-text-secondary'}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      <Icon name={o.status === 'active' ? 'trophy' : 'check'} size={13} />
                      {o.status === 'active' ? "Hozir faol" : 'Yakunlangan'}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:items-stretch">
                <Badge status={statusLabel(o.status)} />
                <button onClick={() => openEditEvent(o)} disabled={!canEdit}
                  className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Icon name="edit" size={13} /> Tahrirlash
                </button>
                {(canEdit || o.status === 'finished') && (
                  <button onClick={() => setDeleteEventId(o.id)}
                    className="rounded-xl border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-bold text-error hover:bg-error/20 disabled:opacity-50 flex items-center justify-center gap-1">
                    <Icon name="trash" size={13} /> O'chirish
                  </button>
                )}
                <button onClick={() => canEdit ? setAssignModal(o) : showToast("⚠ Savollarni o'zgartirish uchun avval nofaollashtiring")}
                  disabled={!canEdit}
                  className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Icon name="book" size={13} /> Savollar ({assignedCount})
                </button>
                {['draft', 'inactive'].includes(o.status) && (
                  <button onClick={() => requestActivation(o)} disabled={!isReady}
                    className={`${isReady ? 'btn-primary' : 'btn-ghost opacity-50'} text-xs px-3 py-1.5 rounded-xl disabled:cursor-not-allowed`}>
                    Faollashtirish
                  </button>
                )}
                {o.status === 'active' && (
                  <>
                    <button onClick={() => { setLiveOlympiadId(o.id); setPage('proctoring'); }}
                      className="rounded-xl border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success hover:bg-success/20 flex items-center justify-center gap-1">
                      👁️ Jonli nazorat
                    </button>
                    <button onClick={() => deactivateEvent(o)}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">Nofaol qilish</button>
                    <button onClick={() => finishEvent(o)}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">Yakunlash</button>
                  </>
                )}
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderResults = () => {
    // API rejimida real raqamlar; mock rejimda lokal olympiad/attempt fallback.
    const apiData = isApi ? managerStatsRes.data : null;
    const apiLoading = isApi && managerStatsRes.loading && !apiData;
    const localFinished = olympiads.filter(o => o.status === 'finished');
    const avgVal = apiData
      ? `${apiData.average_score || 0}%`
      : localFinished.length
        ? `${Math.round(localFinished.reduce((s, o) => s + (o.avgScore || 0), 0) / localFinished.length)}%`
        : '—';
    const bestVal = apiData
      ? `${apiData.best_score || 0}%`
      : (localFinished.length ? `${Math.max(...localFinished.map(o => o.avgScore || 0))}%` : '—');
    const participantsVal = apiData
      ? String(apiData.participants || 0)
      : String(olympiads.reduce((s, o) => s + (o.participants || 0), 0) || 0);

    const apiEvents = Array.isArray(apiData?.events) ? apiData.events : [];

    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
        <h2 className="text-lg md:text-xl font-black text-text-primary">Natijalar</h2>
        {apiLoading && <div className="text-xs text-text-secondary">Yuklanmoqda...</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {/* `color` — `StatCard` uni `bg-gradient-to-br` bilan qo'shadi;
              to'xtash nuqtasiz gradient chizilmaydi, shuning uchun oddiy yuza
              klassi berilsa plitka tekis qoladi (yuqoridagi bosh sahifa
              kartalari bilan bir xil naqsh). */}
          <StatCard label="O'rtacha ball" value={avgVal} icon={<Icon name="chart" size={18} />} color="bg-surface-2 text-text-secondary" />
          <StatCard label="Eng yuqori" value={bestVal} icon={<Icon name="trophy" size={18} />} color="bg-surface-2 text-text-secondary" />
          <StatCard label="Qatnashuvchilar" value={participantsVal} icon={<Icon name="users" size={18} />} color="bg-surface-2 text-text-secondary" />
        </div>
        <div className="glass rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-text-primary mb-4">Tadbir natijalari</h3>
          {isApi && apiEvents.length > 0 && apiEvents.filter(e => (e.participants || 0) > 0).map(e => (
            <div key={e.olympiad_id} className="p-4 glass rounded-xl mb-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary break-words">{e.title}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{e.subject} · {e.participants} ishtirokchi · eng yuqori {e.best_score}%</div>
                </div>
                <DonutChart value={Math.round(e.average_score || 0)} size={56} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-edge">
                <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1">
                  <Icon name="trophy" size={12} /> Reyting
                </button>
                <button
                  onClick={() => openResultsModal(e)}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
                  title="Ishtirokchilar natijalari jadvalini ko'rish"
                >
                  <Icon name="eye" size={12} /> Ko'rish
                </button>
                <button
                  onClick={() => {
                    OlympyApi.exportOlympiadResultsXlsx(e.olympiad_id, OlympyApi.getToken())
                      .then(() => showToast('✓ Excel fayl yuklandi'))
                      .catch(err => {
                        console.warn('xlsx export failed:', err);
                        showToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Excel yuklab bo'lmadi"}`);
                      });
                  }}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
                  title="Natijalarni Excel (.xlsx) faylga eksport qilish"
                >
                  <Icon name="download" size={12} /> Excel
                </button>
                <button
                  onClick={() => openCodeSubmissions(e)}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
                  title="IT (kod) javoblari va AI tavsiyalari"
                >
                  <Icon name="brain" size={12} /> Kod javoblari
                </button>
                <button
                  onClick={() => openEssayGrading(e)}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
                  title="Essay javoblarni qo'lda baholash"
                >
                  <Icon name="edit" size={12} /> Essay baholash
                </button>
              </div>
            </div>
          ))}
          {!isApi && localFinished.map(o => (
            <div key={o.id} className="p-4 glass rounded-xl mb-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0"><div className="font-semibold text-text-primary break-words">{o.title}</div><div className="text-xs text-text-secondary mt-0.5">{[o.testLevel, testTypeLabel(o.testType)].filter(Boolean).join(' · ')}{(o.testLevel || o.testType) ? ' · ' : ''}{o.participants || 0} ishtirokchi</div></div>
                <DonutChart value={o.avgScore || 0} size={56} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-edge">
                <button onClick={() => openResultsModal(o)} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"><Icon name="eye" size={12} /> Ko'rish</button>
                <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"><Icon name="trophy" size={12} /> Reyting</button>
              </div>
            </div>
          ))}
          {((isApi && apiEvents.filter(e => (e.participants || 0) > 0).length === 0)
            || (!isApi && localFinished.length === 0)) && (
            <div className="text-sm text-text-secondary px-3 py-2">Hali natijasi bor tadbirlar yo'q</div>
          )}
        </div>
      </div>
    );
  };

  const renderQAnalytics = () => {
    const rows = isApi && Array.isArray(questionAnalyticsRes.data) ? questionAnalyticsRes.data : [];
    const loading = isApi && questionAnalyticsRes.loading && !questionAnalyticsRes.data;
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-text-primary">Savollar analitikasi</h2>
            <p className="text-xs text-text-secondary mt-1">Eng ko'p noto'g'ri javob berilgan savollar (kamida 3 ta urinish, ≥30% xato).</p>
          </div>
          <button
            onClick={() => questionAnalyticsRes.reload?.()}
            className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
          >
            <Icon name="bolt" size={13} /> Yangilash
          </button>
        </div>
        {loading && <div className="text-xs text-text-secondary">Yuklanmoqda...</div>}
        {!loading && rows.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
            Hozircha tahlilga yaroqli savollar yo'q. O'quvchilar tadbirlarda qatnashgach, bu yerda ko'rinadi.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(r => {
            const rate = Number(r.wrong_rate || 0);
            // `.glass` hoshiyani inset box-shadow bilan chizadi — ustiga
            // `border` qo'yilsa ikkita halqa chiqadi. Urg'u faqat chap chetda.
            const tone = rate >= 70
              ? { bar: 'bg-error', text: 'text-error', border: 'border-l-error', bg: 'bg-error/10' }
              : rate >= 50
                ? { bar: 'bg-warning', text: 'text-warning', border: 'border-l-warning', bg: 'bg-warning/10' }
                : { bar: 'bg-accent-2', text: 'text-accent-2', border: 'border-l-accent-2', bg: 'bg-accent-2/10' };
            return (
              <div key={r.question_id} className={`glass rounded-2xl p-4 border-l-4 ${tone.border}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone.bg} ${tone.text} font-black text-xs`}>
                    {rate}%
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary font-semibold leading-snug">{r.text || '—'}</div>
                    <div className="text-[11px] text-text-secondary mt-1">
                      {r.subject || 'Umumiy'} · {r.total_attempts} urinish · {r.wrong_count} xato
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={`h-full ${tone.bar} transition-all`}
                    style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderProctoring = () => {
    const activeOlym = olympiads.find(o => String(o.id) === String(liveOlympiadId));
    // Webkamera nazorati shu olimpiadada yoqilgan bo'lsagina rozilik badge'ini
    // ko'rsatamiz (aks holda "rozilik yo'q" chalg'ituvchi bo'lardi).
    const cameraOn = !!activeOlym?.cameraProctoringEnabled;
    // Ovoz nazorati shu olimpiadada yoqilgan bo'lsagina rozilik badge'ini
    // ko'rsatamiz (kameradan mustaqil).
    const voiceOn = !!activeOlym?.voiceProctoringEnabled;
    const searchQuery = (debouncedProctoringSearch || '').trim().toLowerCase();

    const filteredProctoring = searchQuery
      ? proctoringData.filter(p => {
          const name = String(p.student_name || '').toLowerCase();
          const phone = String(p.phone || '').toLowerCase();
          const reason = String(p.cheating_reason || '').toLowerCase();
          const reasonLabel = String(cheatingReasonLabel(p.cheating_reason) || '').toLowerCase();
          return name.includes(searchQuery) || phone.includes(searchQuery)
            || reason.includes(searchQuery) || reasonLabel.includes(searchQuery);
        })
      : proctoringData;

    // Stats
    const totalCount = proctoringData.length;
    const onlineCount = proctoringData.filter(p => p.is_online).length;
    const completedCount = proctoringData.filter(p => p.status === 'completed').length;
    const disqualifiedCount = proctoringData.filter(p => p.status === 'disqualified').length;

    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
        {/* Back and title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setPage('olympiads'); setLiveOlympiadId(null); }}
              className="btn-ghost p-2 rounded-xl"
              title="Orqaga"
            >
              <Icon name="arrowLeft" size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-text-primary">Jonli nazorat paneli</h2>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error"></span>
                </span>
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-error bg-error/10 px-2 py-0.5 rounded-md">LIVE</span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5">{activeOlym?.title || 'Tadbir'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProctoring}
              disabled={proctoringLoading}
              className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1.5"
            >
              <Icon name="bolt" size={13} /> {proctoringLoading ? 'Yangilanmoqda...' : 'Yangilash'}
            </button>
          </div>
        </div>

        {/* Stats summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-text-secondary font-medium">Jami faol</div>
              <div className="font-data text-2xl font-black text-text-primary mt-1">{totalCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
              <Icon name="users" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-text-secondary font-medium font-bold text-success flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                Onlayn
              </div>
              <div className="font-data text-2xl font-black text-text-primary mt-1">{onlineCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
              <Icon name="check" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-text-secondary font-medium text-text-secondary">Tugatganlar</div>
              <div className="font-data text-2xl font-black text-text-primary mt-1">{completedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-text-secondary">
              <Icon name="trophy" size={18} />
            </div>
          </div>
          <div className="glass rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-text-secondary font-medium text-error">Diskvalifikatsiya</div>
              <div className="text-2xl font-black text-error mt-1">{disqualifiedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
              <Icon name="info" size={18} />
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex justify-between items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              className="input-field pl-10 py-2 w-full text-sm"
              placeholder="Ism yoki telefon bo'yicha qidirish..."
              value={proctoringSearch}
              onChange={e => setProctoringSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Proctoring table */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-edge bg-surface-2">
                  {["Ism / Telefon", 'Boshlash vaqti', 'Holati', 'Javoblar', 'Tab almashish', 'Natija / Sarflangan vaqt'].map(h => (
                    <th key={h} className="text-left px-5 py-4 text-xs text-text-secondary font-bold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filteredProctoring.map(p => {
                  const percent = p.total_questions > 0 ? Math.round((p.answered_count / p.total_questions) * 100) : 0;
                  
                  // Status and online rendering
                  let statusBadge = null;
                  let onlineIndicator = null;
                  
                  if (p.status === 'disqualified') {
                    statusBadge = (
                      <span className="rounded-lg bg-error/15 border border-error/40 px-2 py-1 text-xs font-bold text-error inline-flex items-center gap-1">
                        ⚠️ Diskvalifikatsiya
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs text-error">
                        <span className="w-2 h-2 rounded-full bg-error"></span>
                        Qizil chiroq
                      </span>
                    );
                  } else if (p.status === 'completed') {
                    statusBadge = (
                      <span className="rounded-lg bg-accent-2/15 border border-accent-2/40 px-2 py-1 text-xs font-bold text-accent-2 inline-flex items-center gap-1">
                        ✓ Yakunlandi
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                        <span className="w-2 h-2 rounded-full bg-surface-2"></span>
                        Oflayn
                      </span>
                    );
                  } else if (p.pending_review || p.status === 'pending_review') {
                    // Cheating aniqlandi — menejer/owner qarorini kutmoqda (amber).
                    statusBadge = (
                      <span className="rounded-lg bg-warning/15 border border-warning/40 px-2 py-1 text-xs font-bold text-warning inline-flex items-center gap-1">
                        ⏳ Tekshiruv kutilmoqda
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                        Qaror kutilmoqda
                      </span>
                    );
                  } else {
                    // active
                    statusBadge = (
                      <span className="rounded-lg bg-accent-2/10 border border-accent-2/40 px-2 py-1 text-xs font-bold text-accent-2">
                        Faol topshirmoqda
                      </span>
                    );
                    if (p.is_online) {
                      onlineIndicator = (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                          <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                          Yashil chiroq (Onlayn)
                        </span>
                      );
                    } else {
                      onlineIndicator = (
                        <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                          <span className="w-2 h-2 rounded-full bg-surface-2"></span>
                          Oflayn (Aloqa yo'q)
                        </span>
                      );
                    }
                  }

                  // Warnings highlighting
                  const hasEscapes = p.tab_escapes > 0;
                  const escapeTone = hasEscapes
                    ? (p.tab_escapes >= 60
                        ? 'text-error bg-error/10 border border-error/40'
                        : 'text-warning bg-warning/10 border border-warning/40')
                    : 'text-text-secondary bg-surface-2';

                  const formattedStart = p.started_at
                    ? new Date(p.started_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '—';

                  const formattedTimeSpent = p.time_spent != null
                    ? `${Math.floor(p.time_spent / 60)} daqiqa`
                    : '—';

                  return (
                    <tr key={p.student_id} className="olympy-row hover:bg-surface-2 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-text-primary text-sm">{p.student_name}</div>
                        <div className="text-xs text-text-secondary mt-0.5">{p.phone}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-secondary">
                        {formattedStart}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div>{statusBadge}</div>
                          <div>{onlineIndicator}</div>
                          {cameraOn && (
                            p.camera_consent_given ? (
                              <span className="text-[10px] font-semibold text-success bg-success/20 px-2 py-0.5 rounded border border-success/40 inline-flex items-center gap-1"
                                title={p.camera_consent_at ? `Rozilik: ${new Date(p.camera_consent_at).toLocaleString('uz-UZ')}` : 'Kamera roziligi berilgan'}>
                                <Icon name="eye" size={11} /> Kamera roziligi
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-text-secondary bg-surface-2 px-2 py-0.5 rounded border border-edge inline-flex items-center gap-1"
                                title="Kamera roziligi berilmagan">
                                <Icon name="eyeOff" size={11} /> Rozilik yo'q
                              </span>
                            )
                          )}
                          {voiceOn && (
                            p.microphone_consent_given ? (
                              <span className="text-[10px] font-semibold text-success bg-success/20 px-2 py-0.5 rounded border border-success/40 inline-flex items-center gap-1"
                                title={p.microphone_consent_at ? `Rozilik: ${new Date(p.microphone_consent_at).toLocaleString('uz-UZ')}` : 'Mikrofon roziligi berilgan'}>
                                <Icon name="mic" size={11} /> Mikrofon roziligi
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-text-secondary bg-surface-2 px-2 py-0.5 rounded border border-edge inline-flex items-center gap-1"
                                title="Mikrofon roziligi berilmagan">
                                <Icon name="mic" size={11} /> Rozilik yo'q
                              </span>
                            )
                          )}
                          {p.cheating_reason && (
                            <div className="text-[10px] text-error bg-error/20 px-2 py-0.5 rounded border border-error/40 max-w-[200px] truncate" title={cheatingReasonLabel(p.cheating_reason)}>
                              Sabab: {cheatingReasonLabel(p.cheating_reason)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-text-primary">{p.answered_count} / {p.total_questions}</span>
                          <span className="text-[10px] text-text-secondary font-medium">({percent}%)</span>
                        </div>
                        <div className="w-32 h-1.5 bg-surface-2 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono inline-flex items-center gap-1 ${escapeTone}`}>
                          <Icon name="info" size={11} /> {p.tab_escapes} soniya
                        </span>
                        {hasEscapes && (
                          <div className="text-[9px] text-warning mt-1 font-semibold">
                            ⚠️ Tashqarida bo'lgan
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm">
                        {p.status === 'completed' ? (
                          <div>
                            <span className="font-extrabold text-success text-base">{p.score}%</span>
                            <div className="text-[10px] text-text-secondary mt-0.5">Sarflandi: {formattedTimeSpent}</div>
                          </div>
                        ) : p.status === 'disqualified' ? (
                          <span className="font-bold text-error text-xs">Natija bekor qilingan</span>
                        ) : (p.pending_review || p.status === 'pending_review') ? (
                          <div className="flex flex-col gap-1.5 min-w-[160px]">
                            <button
                              onClick={() => handleReviewCheating(p.session_id, 'disqualify')}
                              disabled={!!reviewBusyIds[p.session_id]}
                              className="btn-danger text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Diskvalifikatsiya qilish
                            </button>
                            <button
                              onClick={() => handleReviewCheating(p.session_id, 'continue')}
                              disabled={!!reviewBusyIds[p.session_id]}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-success/15 border border-success/40 text-success hover:bg-success/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Davom etishga ruxsat
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5 min-w-[140px]">
                            <button
                              type="button"
                              onClick={() => setLiveProctorSession({ id: p.session_id, studentName: p.student_name, olympiadTitle: activeOlym?.title })}
                              className="w-full rounded-lg bg-error/15 border border-error/45 px-2.5 py-1.5 text-xs font-bold text-error hover:bg-error/25 transition inline-flex items-center justify-center gap-1.5"
                            >
                              <span className="h-2 w-2 rounded-full bg-error animate-pulse"></span>
                              <span>🎥 Jonli kuzatish</span>
                            </button>
                            <span className="text-text-secondary text-xs block text-center">Test topshirilmoqda...</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredProctoring.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-text-secondary text-sm">
                      {searchQuery ? "Mos keladigan ishtirokchilar topilmadi" : "Ushbu tadbirda faol ishtirokchilar hozircha mavjud emas"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderShop = () => {
    const addFeature = () => setShopForm(f => ({ ...f, features: [...(f.features || []), ''] }));
    const setFeature = (idx, val) => setShopForm(f => ({ ...f, features: (f.features || []).map((x, i) => i === idx ? val : x) }));
    const removeFeature = (idx) => setShopForm(f => ({ ...f, features: (f.features || []).filter((_, i) => i !== idx) }));
    const onPickImage = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('Rasm 5 MB dan oshmasligi kerak'); return; }
      setShopForm(f => ({ ...f, imageFile: file, image_url: URL.createObjectURL(file) }));
    };
    const isEdit = shopModal && shopModal !== 'new';
    return (
      <div className="space-y-5 p-4 md:p-6 mobile-content-pad">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-text-primary">Mukofotlar do'koni</h1>
            <p className="mt-1 text-sm font-semibold text-text-secondary">{centerName} o'quvchilari tangalarini almashtiradigan sovg'alar.</p>
          </div>
          <button onClick={() => openShopModal(null)} className="btn-primary flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black self-start">
            <Icon name="plus" size={15} /> Yangi mahsulot
          </button>
        </div>

        <section className="rounded-2xl glass p-4 md:p-6">
          <h2 className="mb-4 text-base font-black text-text-primary">Mahsulotlar ({shopProducts.length})</h2>
          {shopLoading ? (
            <div className="text-center text-text-secondary text-sm py-8">Yuklanmoqda...</div>
          ) : shopProducts.length === 0 ? (
            <EmptyState icon="award" title="Do'kon bo'sh" desc="Yuqoridagi tugma orqali birinchi mahsulotni qo'shing." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shopProducts.map(p => {
                const features = Array.isArray(p.features) ? p.features : [];
                return (
                  <div key={p.id} className={`rounded-xl border p-3.5 flex flex-col gap-3 ${p.is_active ? 'border-edge-strong bg-surface-2' : 'border-edge bg-surface-2 opacity-70'}`}>
                    <div className="flex items-start gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="h-14 w-14 flex-shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl">{p.icon || '🎁'}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-black text-text-primary">{p.title}</div>
                          {!p.is_active && <span className="flex-shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[9px] font-black uppercase text-text-secondary">Nofaol</span>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-text-secondary">
                          <span className="text-warning">🪙 {p.coin_cost}</span>
                          <span>·</span>
                          <span>Zaxira: {p.stock}</span>
                        </div>
                      </div>
                    </div>
                    {p.description && <p className="text-xs leading-relaxed text-text-secondary line-clamp-2">{p.description}</p>}
                    {features.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {features.map((f, i) => (
                          <span key={i} className="rounded-md border border-edge bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                            {typeof f === 'string' ? f : (f?.value || '')}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-2 border-t border-edge pt-3">
                      <button onClick={() => openShopModal(p)} className="flex-1 rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-surface-2">
                        Tahrirlash
                      </button>
                      <button onClick={() => toggleShopActive(p)} className="rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-surface-2" title={p.is_active ? 'Nofaol qilish' : 'Faollashtirish'}>
                        {p.is_active ? 'Yashirish' : "Ko'rsatish"}
                      </button>
                      <button onClick={() => setDeleteProductId(p.id)} className="rounded-lg border border-error/40 bg-error/10 px-2.5 py-1.5 text-xs font-bold text-error hover:bg-error/20">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {shopModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground/80 p-4" onClick={closeShopModal}>
            <div className="modal w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <h2 className="text-lg font-black text-text-primary">{isEdit ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
                <button type="button" onClick={closeShopModal} className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary">
                  <Icon name="x" size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {shopForm.image_url ? (
                    <img src={shopForm.image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl">{shopForm.icon || '🎁'}</div>
                  )}
                  <label className="btn-ghost cursor-pointer rounded-lg px-3 py-2 text-xs font-bold">
                    Rasm yuklash
                    <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
                  </label>
                  {shopForm.image_url && (
                    <button type="button" onClick={() => setShopForm(f => ({ ...f, imageFile: null, image_url: '' }))} className="text-xs font-bold text-error hover:text-error">O'chirish</button>
                  )}
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-text-secondary">Nom</span>
                  <input value={shopForm.title} onChange={e => setShopForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="Masalan, ProSkill futbolkasi" autoFocus />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase text-text-secondary">Tavsif</span>
                  <textarea value={shopForm.description} onChange={e => setShopForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={2} placeholder="Mahsulot haqida qisqacha..." />
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-text-secondary">Tanga</span>
                    <input type="number" min={0} value={shopForm.coin_cost} onChange={e => setShopForm(f => ({ ...f, coin_cost: e.target.value }))} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-text-secondary">Zaxira</span>
                    <input type="number" min={0} value={shopForm.stock} onChange={e => setShopForm(f => ({ ...f, stock: e.target.value }))} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-black uppercase text-text-secondary">Belgi</span>
                    <input value={shopForm.icon} onChange={e => setShopForm(f => ({ ...f, icon: e.target.value }))} className="input-field text-center" maxLength={4} placeholder="🎁" />
                  </label>
                </div>
                <div className="space-y-2">
                  <span className="block text-xs font-black uppercase text-text-secondary">Xususiyatlar</span>
                  {(shopForm.features || []).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={typeof f === 'string' ? f : (f?.value || '')} onChange={e => setFeature(i, e.target.value)} className="input-field w-full py-1.5 text-sm" placeholder="Masalan, Hajmi: L" />
                      <button type="button" onClick={() => removeFeature(i)} className="flex-shrink-0 text-error hover:text-error">
                        <Icon name="x" size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addFeature} className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-bold">+ Xususiyat qo'shish</button>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={!!shopForm.is_active} onChange={e => setShopForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded accent-accent" />
                  <span className="text-sm font-bold text-text-secondary">Faol (o'quvchilarga ko'rinadi)</span>
                </label>
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={submitShopProduct} disabled={shopSaving} className="btn-primary flex-1 rounded-xl py-2.5 text-sm font-black disabled:opacity-50">
                  {shopSaving ? 'Saqlanmoqda...' : (isEdit ? 'Saqlash' : "Qo'shish")}
                </button>
                <button onClick={closeShopModal} className="btn-ghost rounded-xl px-5 py-2.5 text-sm font-bold">Bekor qilish</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const pagesMap = {
    home: renderHome,
    requests: renderRequests,
    olympiads: renderOlympiads,
    questions: () => <QuestionCreatorPage embedded user={user} onOpenSwitcher={onOpenSwitcher} onNavigate={onNavigate} />,
    students: renderStudents,
    results: renderResults,
    qanalytics: renderQAnalytics,
    proctoring: renderProctoring,
    shop: renderShop,
    profile: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPageOrSpecial}
        user={{ ...user, role: 'Manager' }} onLogout={onLogout}
        logoClick={() => setPageOrSpecial('home')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Dashboard'} subtitle={`${centerName} · ${centerType}`} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-2 md:px-3 py-2 rounded-xl flex items-center gap-1.5">
                  <Icon name="users" size={13} /><span className="hidden md:inline">Rolni almashtirish</span>
                </button>
              )}
              <button onClick={openCreateEvent} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="plus" size={14} /> Tadbir
              </button>
            </div>
          } />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {(pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={mobileNavItems} activePage={page} setPage={setPageOrSpecial} />
      </div>

      {/* Kod (IT) javoblari modali */}
      <Modal open={!!codeSubModal} onClose={() => setCodeSubModal(null)} title="Kod javoblari" width="max-w-3xl">
        <div className="space-y-4">
          <div className="text-sm text-text-secondary">{codeSubModal?.title}</div>
          {codeSubLoading && <div className="text-xs text-text-secondary">Yuklanmoqda...</div>}
          {codeSubError && (
            <div className="flex items-center gap-2 bg-error/10 text-error rounded-xl px-3 py-2 text-xs border border-error/40">
              <Icon name="info" size={14} /> {codeSubError}
            </div>
          )}
          {!codeSubLoading && !codeSubError && codeSubData.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
              Bu olimpiadada hali kod javoblari yo'q.
            </div>
          )}
          {codeSubData.length > 0 && (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
              {/* Sarlavha qatori (desktop) */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[10px] uppercase tracking-wide text-text-secondary font-bold">
                <div className="col-span-3">O'quvchi</div>
                <div className="col-span-4">Savol</div>
                <div className="col-span-2">Til</div>
                <div className="col-span-1">AI ball</div>
                <div className="col-span-2">Kod</div>
              </div>
              {codeSubData.map(sub => {
                const expanded = !!codeSubExpanded[sub.id];
                return (
                  <div key={sub.id} className="glass rounded-xl p-3">
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                      <div className="md:col-span-3 min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{sub.student_name || '—'}</div>
                      </div>
                      <div className="md:col-span-4 min-w-0">
                        <div className="text-xs text-text-secondary truncate" title={sub.question_text}>{sub.question_text || '—'}</div>
                      </div>
                      <div className="md:col-span-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface-2 text-text-secondary font-semibold">{sub.code_language || '—'}</span>
                      </div>
                      <div className="md:col-span-1">
                        {typeof sub.ai_code_score === 'number'
                          ? <span className="text-sm font-black font-data text-accent">{sub.ai_code_score}</span>
                          : <span className="text-xs text-text-secondary">—</span>}
                      </div>
                      <div className="md:col-span-2">
                        <button onClick={() => setCodeSubExpanded(p => ({ ...p, [sub.id]: !p[sub.id] }))}
                          className="btn-ghost text-[11px] px-2.5 py-1 rounded-lg inline-flex items-center gap-1">
                          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} /> {expanded ? 'Yopish' : "Ko'rish"}
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold mb-1">Kod</div>
                          <pre className="text-xs text-text-primary bg-surface-2 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words border border-edge">{sub.submitted_code || '(bo\'sh)'}</pre>
                        </div>
                        {sub.ai_code_review && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold mb-1">AI tavsiyasi</div>
                            {/* Yuqoridagi kod bloki bilan bir xil yuza. `glass`
                                emas: u hoshiyani inset box-shadow bilan chizadi
                                va `border` bilan birga ikkita halqa chiqardi. */}
                            <div className="text-xs text-text-secondary whitespace-pre-wrap break-words bg-surface-2 rounded-xl p-3 border border-edge">{sub.ai_code_review}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[11px] text-text-secondary">AI tavsiyasi va ball test yakunlangach bir necha soniyada hisoblanadi.</div>
        </div>
      </Modal>

      {/* Essay baholash modali */}
      <Modal open={!!essayModal} onClose={() => setEssayModal(null)} title="Essay baholash" width="max-w-3xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-text-secondary">{essayModal?.title}</div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={essayOnlyUngraded}
                onChange={e => {
                  const v = e.target.checked;
                  setEssayOnlyUngraded(v);
                  if (essayModal?.id) loadEssayAnswers(essayModal.id, v);
                }}
                className="accent-accent"
              />
              Faqat baholanmaganlar
            </label>
          </div>
          {essayLoading && <div className="text-xs text-text-secondary">Yuklanmoqda...</div>}
          {essayError && (
            <div className="flex items-center gap-2 bg-error/10 text-error rounded-xl px-3 py-2 text-xs border border-error/40">
              <Icon name="info" size={14} /> {essayError}
            </div>
          )}
          {!essayLoading && !essayError && essayData.length === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-sm text-text-secondary">
              {essayOnlyUngraded
                ? 'Baholanmagan essay javoblar yo\'q.'
                : 'Bu olimpiadada essay javoblar yo\'q.'}
            </div>
          )}
          {essayData.length > 0 && (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {essayData.map(entry => {
                const key = `${entry.attempt_id}:${entry.question_id}`;
                const draft = essayDrafts[key] || {};
                const scoreVal = draft.score !== undefined
                  ? draft.score
                  : (entry.score !== null && entry.score !== undefined ? String(entry.score) : '');
                const feedbackVal = draft.feedback !== undefined ? draft.feedback : (entry.feedback || '');
                const saving = essaySavingKey === key;
                return (
                  <div key={key} className={`glass rounded-xl p-4 ${entry.graded ? 'border-l-4 border-l-success' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{entry.student_name || '—'}</div>
                        <div className="text-xs text-text-secondary mt-1">{entry.question_text || '—'}</div>
                      </div>
                      {entry.graded && (
                        <span className="flex-shrink-0 text-[10px] uppercase tracking-wide font-extrabold text-success bg-success/10 px-2 py-1 rounded-md">
                          Baholangan · {entry.score}/{entry.max_score}
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold mb-1">O'quvchi javobi</div>
                      <div className="text-xs text-text-primary bg-surface-2 rounded-xl p-3 whitespace-pre-wrap break-words border border-edge">
                        {entry.answer_text || "(bo'sh)"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wide text-text-secondary font-bold mb-1">
                          Ball (0–{entry.max_score})
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={entry.max_score}
                          value={scoreVal}
                          onChange={e => setEssayDrafts(p => ({ ...p, [key]: { ...p[key], score: e.target.value } }))}
                          className="input-field w-24 py-2 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] uppercase tracking-wide text-text-secondary font-bold mb-1">Izoh (ixtiyoriy)</label>
                        <input
                          type="text"
                          value={feedbackVal}
                          onChange={e => setEssayDrafts(p => ({ ...p, [key]: { ...p[key], feedback: e.target.value } }))}
                          placeholder="O'quvchiga izoh..."
                          className="input-field py-2 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => saveEssayGrade(entry)}
                        disabled={saving || scoreVal === ''}
                        className="btn-primary text-xs px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[11px] text-text-secondary">Baho saqlangach o'quvchining umumiy foizi avtomatik qayta hisoblanadi.</div>
        </div>
      </Modal>

      {/* Natijalar (ishtirokchilar jadvali) modali */}
      <Modal
        open={resultsModal.open}
        onClose={() => setResultsModal(m => ({ ...m, open: false }))}
        title="Tadbir natijalari"
        width="max-w-5xl"
        style={{ maxWidth: 980 }}
        contentClassName="results-modal"
      >
        {(() => {
          const rows = resultsModal.data;
          const lastPage = Math.max(1, Math.ceil(resultsModal.total / RESULTS_PAGE_SIZE));
          // Sahifadagi (diskvalifikatsiya qilinmaganlar bo'yicha) o'rtacha ballni hisoblaymiz.
          const scored = rows.filter(r => !r.disqualified && typeof r.score === 'number');
          const avgScore = scored.length
            ? Math.round(scored.reduce((s, r) => s + (r.score || 0), 0) / scored.length)
            : null;
          // Ball foiziga qarab badge klasslari. `bar` — tekis to'ldirish
          // (gradient yo'q): progress matn ko'tarmaydi, shuning uchun belgi
          // roli — `accent`/holat tokeni.
          const scoreTone = (pct) => {
            if (pct >= 90) return { text: 'text-success', bar: 'bg-success', track: 'bg-success/10', ring: 'border-success/40' };
            if (pct >= 70) return { text: 'text-accent-2', bar: 'bg-accent-2', track: 'bg-accent-2/10', ring: 'border-accent-2/40' };
            if (pct >= 50) return { text: 'text-warning', bar: 'bg-warning', track: 'bg-warning/10', ring: 'border-warning/40' };
            return { text: 'text-error', bar: 'bg-error', track: 'bg-error/10', ring: 'border-error/40' };
          };
          // O'rin belgisi emoji EMAS (🥇🥈🥉): 1/2/3-o'rin farqi `--color-medal-*`
          // tokeni bilan chegarada beriladi — `pages/Leaderboard.jsx` naqshi.
          // Raqam har doim ko'rinadi, ya'ni signal faqat rangda emas (rang
          // ko'rligi uchun). Medal rangi MATNGA berilmaydi: qog'oz mavzuda
          // oltin `surface-2` fonida 3.21:1 — chegara uchun yetarli (WCAG
          // 1.4.11 → 3:1), matn uchun emas.
          const medalBorderStyle = (rank) => (rank >= 1 && rank <= 3
            ? { borderColor: `rgb(var(--color-medal-${rank}))` }
            : undefined);

          return (
            <div className="space-y-5 -mt-2">
              {/* ── Header: tadbir ma'lumotlari + statistik kartalar ── */}
              <div className="glass rounded-2xl p-4 sm:p-5">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-base sm:text-lg font-bold text-text-primary leading-tight break-words">
                      {resultsModal.event?.title || '—'}
                    </div>
                    {resultsModal.event?.subject && resultsModal.event.subject !== '—' && (
                      <div className="mt-2">
                        <SubjectBadge subject={resultsModal.event.subject} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
                  <div className="rounded-xl bg-surface-2 border border-edge px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">Ishtirokchilar</div>
                    <div className="text-lg font-black text-text-primary mt-0.5">{resultsModal.total}</div>
                  </div>
                  <div className="rounded-xl bg-surface-2 border border-edge px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">O'rtacha ball</div>
                    <div className={`text-lg font-black mt-0.5 ${avgScore == null ? 'text-text-secondary' : scoreTone(avgScore).text}`}>
                      {avgScore == null ? '—' : `${avgScore}%`}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-2 border border-edge px-3 py-2.5 col-span-2 sm:col-span-1">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">Sahifa</div>
                    <div className="text-lg font-black text-text-primary mt-0.5">{resultsModal.page} <span className="text-sm text-text-secondary font-bold">/ {lastPage}</span></div>
                  </div>
                </div>
              </div>

              {/* ── Loading skeleton ── */}
              {resultsModal.loading && (
                <div className="rounded-2xl border border-edge overflow-hidden">
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-surface-2 text-[10px] uppercase tracking-wide text-text-secondary font-bold">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-4">O'quvchi</div>
                    <div className="col-span-2 text-center">To'g'ri / Jami</div>
                    <div className="col-span-3">Ball</div>
                    <div className="col-span-2 text-center">Holat</div>
                  </div>
                  <div className="divide-y divide-edge">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                        <div className="h-6 w-6 rounded-md bg-surface-2 flex-shrink-0" />
                        <div className="h-4 rounded bg-surface-2 flex-1 max-w-[40%]" />
                        <div className="h-4 w-16 rounded bg-surface-2" />
                        <div className="h-2.5 flex-1 rounded-full bg-surface-2" />
                        <div className="h-5 w-20 rounded-md bg-surface-2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bo'sh holat ── */}
              {!resultsModal.loading && rows.length === 0 && (
                <div className="glass rounded-2xl p-10 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm text-text-secondary">Bu tadbirda hali ishtirokchi natijalari yo'q.</div>
                </div>
              )}

              {/* ── Natijalar jadvali ── */}
              {!resultsModal.loading && rows.length > 0 && (
                <div className="rounded-2xl border border-edge overflow-hidden">
                  <div className="max-h-[58vh] overflow-y-auto">
                    {/* Sticky sarlavha qatori (desktop) */}
                    {/* Fon `bg-[#15171f]/95` edi — light mavzuda deyarli qora
                        chiziq bo'lib qolardi. `surface-2` shu rolning (modal
                        yuzasidan bir pog'ona pastda) mavzuga mos ekvivalenti;
                        to'liq shaffofmas bo'lgani uchun blur ham kerak emas. */}
                    <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 sticky top-0 z-10 bg-surface-2 border-b border-edge text-[10px] uppercase tracking-wide text-text-secondary font-bold">
                      <div className="col-span-1 text-center">#</div>
                      <div className="col-span-4">O'quvchi</div>
                      <div className="col-span-2 text-center">To'g'ri / Jami</div>
                      <div className="col-span-3">Ball</div>
                      <div className="col-span-2 text-center">Holat</div>
                    </div>
                    <div>
                      {rows.map((row, idx) => {
                        const total = row.total_questions || ((row.correct_count || 0) + (row.wrong_count || 0));
                        const correct = row.correct_count ?? 0;
                        const wrong = row.wrong_count ?? 0;
                        const pct = typeof row.score === 'number' ? row.score : 0;
                        const tone = scoreTone(pct);
                        const dq = row.disqualified;
                        return (
                          <div
                            key={row.attempt_id ?? idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => openStudentReview(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStudentReview(row); } }}
                            title="Javoblarini ko'rish"
                            className={`animate-in flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-x-2 md:gap-y-0 md:items-center px-3 md:px-4 py-3 border-b border-edge transition-colors cursor-pointer hover:bg-surface-2 focus:bg-surface-2 focus:outline-none ${
                              dq
                                ? 'bg-surface-2 opacity-60'
                                : idx % 2 === 1
                                  ? 'bg-surface-2'
                                  : ''
                            }`}
                          >
                            {/* Rank (desktop ustun) */}
                            <div className="hidden md:flex md:col-span-1 justify-center">
                              {dq ? (
                                <span className="text-text-secondary text-sm">—</span>
                              ) : (
                                <span className="font-data inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md border border-edge bg-surface-2 text-xs font-bold text-text-primary"
                                  style={medalBorderStyle(row.rank)} title={`${row.rank}-o'rin`}>
                                  {row.rank}
                                </span>
                              )}
                            </div>

                            {/* Mobil: 1-qator → rank + ism (chap) | ball foizi (o'ng) */}
                            <div className="flex items-center gap-2 md:contents">
                              <span className="md:hidden flex-shrink-0">
                                {dq ? (
                                  <span className="text-text-secondary text-xs">—</span>
                                ) : (
                                  <span className="font-data inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-md border border-edge bg-surface-2 text-[10px] font-bold text-text-primary"
                                    style={medalBorderStyle(row.rank)} title={`${row.rank}-o'rin`}>{row.rank}</span>
                                )}
                              </span>
                              {/* O'quvchi */}
                              <div className="min-w-0 flex-1 md:col-span-4 flex items-center">
                                <span className={`text-sm font-semibold truncate ${dq ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                                  {row.name || '—'}
                                </span>
                              </div>
                              {/* Mobil: ball foizi (o'ngga) */}
                              <span className={`md:hidden flex-shrink-0 text-sm font-black font-data ${dq ? 'text-text-secondary' : tone.text}`}>{pct}%</span>
                            </div>

                            {/* Mobil: 2-qator → Natija + Holat (bir qator) + progress bar (pastda) */}
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 pl-7 md:contents md:pl-0">
                              {/* To'g'ri / Jami */}
                              <div className="flex items-center flex-shrink-0 md:col-span-2 md:justify-center">
                                <span className="text-sm font-bold text-success">{correct}</span>
                                <span className="text-sm text-text-secondary">/{total}</span>
                                {wrong > 0 && (
                                  <span className="ml-1.5 text-[11px] font-semibold text-error">−{wrong}</span>
                                )}
                              </div>

                              {/* Ball — progress bar (desktop'da foiz bilan) */}
                              <div className="md:col-span-3 flex items-center gap-2.5 flex-1 md:flex-none order-3 md:order-none w-full md:w-auto basis-full md:basis-auto">
                                <div className={`hidden md:block flex-1 h-2 rounded-full overflow-hidden ${tone.track}`}>
                                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                                <span className={`hidden md:inline text-sm font-black font-data ${dq ? 'text-text-secondary' : tone.text}`}>{pct}%</span>
                                {/* Mobil progress bar (to'liq qatorda, pastda) */}
                                <div className={`md:hidden flex-1 h-1.5 rounded-full overflow-hidden ${tone.track}`}>
                                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                              </div>

                              {/* Holat */}
                              <div className="flex-shrink-0 md:col-span-2 md:text-center">
                                {dq ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-error/15 text-error border border-error/40">
                                    <Icon name="info" size={11} /> DQ
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-success/15 text-success border border-success/40">
                                    <Icon name="check" size={11} /> Topshirgan
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Pagination — 200+ ishtirokchi bo'lsa ── */}
              {resultsModal.total > RESULTS_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      const backendId = resultsModal.event?.backendId ?? resultsModal.event?.olympiad_id ?? resultsModal.event?.id;
                      if (backendId && resultsModal.page > 1) loadResultsPage(backendId, resultsModal.page - 1);
                    }}
                    disabled={resultsModal.loading || resultsModal.page <= 1}
                    className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon name="chevronRight" size={12} className="rotate-180" /> Oldingisi
                  </button>
                  <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary font-data">
                    {resultsModal.page} / {lastPage}
                  </div>
                  <button
                    onClick={() => {
                      const backendId = resultsModal.event?.backendId ?? resultsModal.event?.olympiad_id ?? resultsModal.event?.id;
                      if (backendId && resultsModal.page < lastPage) loadResultsPage(backendId, resultsModal.page + 1);
                    }}
                    disabled={resultsModal.loading || resultsModal.page >= lastPage}
                    className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Keyingisi <Icon name="chevronRight" size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* O'quvchi tahlili modali — natijalar jadvalidan o'quvchi tanlanganda */}
      <Modal
        open={studentReviewModal.open}
        onClose={() => setStudentReviewModal(m => ({ ...m, open: false }))}
        title="O'quvchi tahlili"
        width="max-w-3xl"
      >
        {(() => {
          const review = studentReviewModal.data;
          // mcq/yes_no/multiple_select uchun option matnini xavfsiz olish.
          const optAt = (options, i) => {
            if (i === null || i === undefined) return null;
            const o = (options || [])[i];
            return o === undefined || o === null ? null : String(o);
          };
          // O'quvchining javobini turiga qarab matn(lar)ga aylantiradi.
          const renderChosen = (q) => {
            const t = q.question_type;
            if (t === 'mcq' || t === 'yes_no') {
              const txt = optAt(q.options, q.chosen_answer);
              return txt == null ? "Javob berilmagan" : txt;
            }
            if (t === 'multiple_select') {
              const arr = Array.isArray(q.chosen_answer) ? q.chosen_answer : [];
              if (!arr.length) return "Javob berilmagan";
              return arr.map(i => optAt(q.options, i)).filter(Boolean).join(', ');
            }
            if (t === 'fill_blank') {
              return q.chosen_answer ? String(q.chosen_answer) : "Javob berilmagan";
            }
            if (t === 'fill_blanks') {
              const c = q.chosen_answer;
              if (c && typeof c === 'object') {
                const parts = Object.keys(c).map(k => String(c[k])).filter(Boolean);
                return parts.length ? parts.join(', ') : "Javob berilmagan";
              }
              return c ? String(c) : "Javob berilmagan";
            }
            if (t === 'essay') {
              return q.chosen_answer ? String(q.chosen_answer) : "Javob berilmagan";
            }
            if (t === 'code') {
              return q.submitted_code ? String(q.submitted_code) : "Javob berilmagan";
            }
            return "—";
          };
          // To'g'ri javobni turiga qarab matn(lar)ga aylantiradi.
          const renderCorrect = (q) => {
            const t = q.question_type;
            if (t === 'mcq' || t === 'yes_no') return optAt(q.options, q.correct_answer);
            if (t === 'multiple_select') {
              const arr = Array.isArray(q.correct_answer_set) ? q.correct_answer_set : [];
              return arr.map(i => optAt(q.options, i)).filter(Boolean).join(', ') || null;
            }
            if (t === 'fill_blank') {
              return q.correct_text ? String(q.correct_text) : null;
            }
            if (t === 'fill_blanks') {
              const c = q.correct_text;
              if (c && typeof c === 'object') {
                return Object.keys(c).map(k => String(c[k])).filter(Boolean).join(', ') || null;
              }
              return c ? String(c) : null;
            }
            return null; // essay/code — qat'iy "to'g'ri javob" yo'q
          };

          return (
            <div className="space-y-4 -mt-1">
              {/* Sarlavha: o'quvchi ismi + umumiy natija */}
              <div className="glass rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/40 flex items-center justify-center flex-shrink-0">
                  <Icon name="user" size={18} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-text-primary truncate">{studentReviewModal.studentName || "O'quvchi"}</div>
                  {review && (
                    <div className="text-[11px] text-text-secondary mt-0.5">
                      To'g'ri: <span className="text-success font-semibold">{review.correct_count ?? 0}</span>
                      {' · '}Xato: <span className="text-error font-semibold">{review.wrong_count ?? 0}</span>
                      {' · '}Ball: <span className="text-text-secondary font-semibold">{review.score ?? 0}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Loading */}
              {studentReviewModal.loading && (
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-surface-2 border border-edge animate-pulse" />
                  ))}
                </div>
              )}

              {/* Xato */}
              {!studentReviewModal.loading && studentReviewModal.error && (
                <div className="glass rounded-2xl p-8 text-center border-l-4 border-l-error">
                  <div className="text-3xl mb-2">⚠️</div>
                  <div className="text-sm text-error">{studentReviewModal.error}</div>
                </div>
              )}

              {/* Bo'sh */}
              {!studentReviewModal.loading && !studentReviewModal.error && review && (review.questions || []).length === 0 && (
                <div className="glass rounded-2xl p-8 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm text-text-secondary">Bu tadbirda savollar topilmadi.</div>
                </div>
              )}

              {/* Savollar ro'yxati */}
              {!studentReviewModal.loading && !studentReviewModal.error && review && (review.questions || []).length > 0 && (
                <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
                  {(review.questions || []).map((q, i) => {
                    const correct = q.is_correct === true;
                    const wrong = q.is_correct === false;
                    // is_correct === null → essay/kod tekshirilmoqda (neytral).
                    const tone = correct
                      ? 'bg-success/[0.07] border-success/40'
                      : wrong
                        ? 'bg-error/[0.07] border-error/40'
                        : 'bg-surface-2 border-edge';
                    const chosenTxt = renderChosen(q);
                    const correctTxt = renderCorrect(q);
                    return (
                      <div key={q.id ?? i} className={`rounded-xl p-3 sm:p-3.5 border ${tone}`}>
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-surface-2 text-[11px] font-bold text-text-secondary flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-text-primary font-medium break-words leading-snug whitespace-pre-wrap">
                              {q.text ? <MathText text={q.text} /> : '—'}
                            </div>
                            <div className="mt-2 space-y-1">
                              {/* O'quvchining javobi */}
                              <div className="text-[12px] flex flex-wrap gap-x-1.5">
                                <span className="text-text-secondary">Javobi:</span>
                                <MathText className={`font-semibold break-words ${correct ? 'text-success' : wrong ? 'text-error' : 'text-text-secondary'}`} text={chosenTxt} />
                              </div>
                              {/* To'g'ri javob — faqat xato bo'lsa va mavjud bo'lsa ko'rsatamiz */}
                              {wrong && correctTxt && (
                                <div className="text-[12px] flex flex-wrap gap-x-1.5">
                                  <span className="text-text-secondary">To'g'ri javob:</span>
                                  <MathText className="font-semibold text-success break-words" text={correctTxt} />
                                </div>
                              )}
                              {/* Essay/kod baholanmagan bo'lsa izoh */}
                              {q.is_correct === null && (
                                <div className="text-[11px] text-warning">
                                  {q.question_type === 'essay'
                                    ? 'Qo\'lda baholanadi (hali baholanmagan)'
                                    : q.question_type === 'code'
                                      ? 'Kod tekshirilmoqda'
                                      : 'Baholanmagan'}
                                </div>
                              )}
                            </div>
                          </div>
                          {/* To'g'ri / xato belgisi */}
                          <span className="flex-shrink-0 text-base leading-none mt-0.5">
                            {correct ? '✅' : wrong ? '❌' : '⏳'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Create/edit event modal */}
      <Modal open={createModal} onClose={closeEventModal} title={editingOlympiadId ? 'Tadbirni tahrirlash' : 'Tadbir yaratish'} width="max-w-2xl">
        {(() => {
          const formIssues = eventFormIssues(newOlympiad);
          const modeOptions = [
            { value: 'competition', label: 'Musobaqa', desc: "Faqat shu tashkilot o'quvchilari" },
            { value: 'olympiad', label: 'Olimpiada', desc: 'Platformadagi barcha foydalanuvchilar' },
          ];
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modeOptions.map(opt => {
                  const selected = newOlympiad.eventType === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setNewOlympiad({ ...newOlympiad, eventType: opt.value })}
                      className={`p-4 rounded-2xl text-left border transition-colors ${selected ? 'border-accent bg-accent/10 text-text-primary' : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:bg-surface-2'}`}>
                      <div className="flex items-center gap-2 font-bold text-sm">
                        {/* Tanlanmagan nuqta `bg-surface-2` edi — karta foni bilan
                            bir xil, ya'ni ko'rinmas. Endi `edge-strong`. */}
                        <span className={`w-2.5 h-2.5 rounded-full ${selected ? 'bg-accent' : 'bg-edge-strong'}`}></span>
                        {opt.label}
                      </div>
                      <div className="text-xs text-text-secondary mt-1">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Tadbir nomi</label>
                <input className="input-field"
                  placeholder={newOlympiad.eventType === 'olympiad' ? 'Matematika Olimpiadasi — May 2026' : 'Ichki matematika musobaqasi'}
                  value={newOlympiad.title}
                  onChange={e => setNewOlympiad({ ...newOlympiad, title: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Fan kategoriyasi</label>
                  <select className="input-field" value={newOlympiad.subject} onChange={e => {
                    const newSubj = e.target.value;
                    let newLevel = newOlympiad.testLevel;
                    if (newSubj === 'Ingliz tili') {
                      const validEngLevels = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
                      if (newLevel && !validEngLevels.includes(newLevel)) {
                        newLevel = '';
                      }
                    } else {
                      const validDefaultLevels = ['Beginner', "O'rta", 'Advanced'];
                      if (newLevel && !validDefaultLevels.includes(newLevel)) {
                        newLevel = '';
                      }
                    }
                    let nextItCategory = newOlympiad.itCategory;
                    let nextAllowedLanguages = newOlympiad.allowedLanguages;
                    if (newSubj !== 'IT' && newSubj !== 'Informatika') {
                      nextItCategory = '';
                      nextAllowedLanguages = [];
                    }
                    setNewOlympiad({
                      ...newOlympiad,
                      subject: newSubj,
                      testLevel: newLevel,
                      itCategory: nextItCategory,
                      allowedLanguages: nextAllowedLanguages
                    });
                  }}>
                    {store.subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Davomiyligi (min)</label>
                  <input type="number" min="1" className="input-field" value={newOlympiad.duration}
                    onChange={e => setNewOlympiad({ ...newOlympiad, duration: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Boshlanish sanasi</label>
                  <input type="date" className="input-field" value={newOlympiad.startDate}
                    onChange={e => setNewOlympiad({ ...newOlympiad, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Boshlanish vaqti</label>
                  <input type="time" className="input-field" value={newOlympiad.startTime}
                    onChange={e => setNewOlympiad({ ...newOlympiad, startTime: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Daraja <span className="text-text-secondary">(ixtiyoriy)</span></label>
                  <select className="input-field" value={newOlympiad.testLevel}
                    onChange={e => setNewOlympiad({ ...newOlympiad, testLevel: e.target.value })}>
                    <option value="">— Tanlanmagan —</option>
                    {newOlympiad.subject === 'Ingliz tili' ? (
                      <>
                        <option value="Beginner">Beginner</option>
                        <option value="Elementary">Elementary</option>
                        <option value="Pre-Intermediate">Pre-Intermediate</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Upper-Intermediate">Upper-Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </>
                    ) : (
                      <>
                        <option value="Beginner">Beginner</option>
                        <option value="O'rta">O'rta</option>
                        <option value="Advanced">Advanced</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Test turi <span className="text-text-secondary">(ixtiyoriy)</span></label>
                  <select className="input-field" value={newOlympiad.testType}
                    onChange={e => setNewOlympiad({ ...newOlympiad, testType: e.target.value })}>
                    <option value="">— Tanlanmagan —</option>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="true_false">True/False</option>
                    <option value="short_answer">Qisqa javob</option>
                    <option value="mixed">Aralash</option>
                    <option value="code_only">Faqat kod (dasturlash)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Guruh filtri <span className="text-text-secondary">(ixtiyoriy)</span></label>
                <input className="input-field" placeholder="Masalan: 9-A — faqat shu guruh kiradi"
                  maxLength={50}
                  value={newOlympiad.groupFilter}
                  onChange={e => setNewOlympiad({ ...newOlympiad, groupFilter: e.target.value })} />
                <p className="mt-1.5 text-[11px] text-text-secondary">To'ldirilsa, faqat shu guruh tegiga ega o'quvchilar tadbirga kira oladi.</p>
              </div>

              {/* Webkamera proktoring — ixtiyoriy opt-in. Yoqilsa, student
                  imtihonni boshlashdan oldin rozilik ekranini ko'radi va kamera
                  ruxsatini beradi. FAQAT hosila signallar (yuz yo'q/ko'p yuz/
                  nigoh) saqlanadi — video/rasm/audio HECH QACHON yozilmaydi. */}
              <div className="rounded-2xl border border-edge bg-surface-2 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-accent flex-shrink-0"
                    checked={!!newOlympiad.cameraProctoringEnabled}
                    onChange={e => setNewOlympiad({ ...newOlympiad, cameraProctoringEnabled: e.target.checked })}
                  />
                  <span>
                    <span className="flex items-center gap-2 text-xs font-bold text-text-primary">
                      <Icon name="eye" size={14} /> Webkamera nazorati
                    </span>
                    <span className="block mt-1 text-[11px] text-text-secondary leading-relaxed">
                      O'quvchi imtihon davomida kamera orqali kuzatiladi (yuz bor-yo'qligi,
                      begona yuz, nigoh). Video yozilmaydi — faqat aniqlangan signallar
                      saqlanadi. Yoqilsa, o'quvchi boshlashdan oldin rozilik beradi.
                    </span>
                  </span>
                </label>
              </div>

              {/* Ovoz (mikrofon) proktoring — ixtiyoriy opt-in, kameradan
                  mustaqil. Yoqilsa, student imtihonni boshlashdan oldin alohida
                  rozilik ekranini ko'radi va mikrofon ruxsatini beradi. FAQAT
                  hosila signal (atrofdan ovoz aniqlandi) saqlanadi — audio HECH
                  QACHON yozilmaydi. */}
              <div className="rounded-2xl border border-edge bg-surface-2 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-accent flex-shrink-0"
                    checked={!!newOlympiad.voiceProctoringEnabled}
                    onChange={e => setNewOlympiad({ ...newOlympiad, voiceProctoringEnabled: e.target.checked })}
                  />
                  <span>
                    <span className="flex items-center gap-2 text-xs font-bold text-text-primary">
                      <Icon name="mic" size={14} /> Ovoz nazorati
                    </span>
                    <span className="block mt-1 text-[11px] text-text-secondary leading-relaxed">
                      O'quvchi imtihon davomida mikrofon orqali kuzatiladi (atrofdan
                      gapirish/ovoz). Audio yozilmaydi va nutq tahlil qilinmaydi — faqat
                      "ovoz bor/yo'q" signali saqlanadi. Yoqilsa, o'quvchi boshlashdan
                      oldin rozilik beradi.
                    </span>
                  </span>
                </label>
              </div>

              {/* IT (dasturlash) olimpiadasi sozlamalari — ixtiyoriy. To'ldirilsa
                  olimpiada IT kategoriyasiga ega bo'ladi va kod savollarda til
                  cheklovi qo'llaniladi. */}
              {(newOlympiad.subject === 'IT' || newOlympiad.subject === 'Informatika') && (
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-text-secondary">
                    <Icon name="brain" size={14} /> IT (dasturlash) sozlamalari <span className="text-text-secondary font-normal">(ixtiyoriy)</span>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5 font-medium">IT kategoriya</label>
                    <select className="input-field" value={newOlympiad.itCategory}
                      onChange={e => setNewOlympiad({ ...newOlympiad, itCategory: e.target.value })}>
                      <option value="">— Tanlanmagan —</option>
                      <option value="frontend">Frontend</option>
                      <option value="backend">Backend</option>
                      <option value="fullstack">Full Stack</option>
                      <option value="general">Umumiy</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-text-secondary mb-1.5 font-medium">Ruxsat etilgan tillar</label>
                    <div className="flex flex-wrap gap-2">
                      {[['python','Python'],['javascript','JavaScript'],['java','Java'],['cpp','C++'],['c','C']].map(([val, label]) => {
                        const selected = (newOlympiad.allowedLanguages || []).includes(val);
                        return (
                          <button key={val} type="button"
                            onClick={() => {
                              const cur = Array.isArray(newOlympiad.allowedLanguages) ? newOlympiad.allowedLanguages : [];
                              const next = selected ? cur.filter(l => l !== val) : [...cur, val];
                              setNewOlympiad({ ...newOlympiad, allowedLanguages: next });
                            }}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${selected ? 'gradient-bg text-text-primary' : 'glass text-text-secondary hover:text-text-secondary'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-text-secondary">Bo'sh qoldirilsa, kod savollarida barcha til ruxsat etiladi.</p>
                  </div>
                </div>
              )}

              <div className={`rounded-2xl p-4 border text-xs ${formIssues.length ? 'bg-warning/10 border-warning/40 text-warning' : 'bg-success/10 border-success/40 text-success'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon name={formIssues.length ? 'info' : 'check'} size={14} />
                  {formIssues.length ? "To'ldirilishi kerak" : "Asosiy ma'lumotlar tayyor"}
                </div>
                {formIssues.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formIssues.map(issue => <span key={issue} className="rounded-lg bg-surface-1 px-2 py-1">{issue}</span>)}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={closeEventModal} disabled={eventSaving} className="btn-ghost flex-1 py-3 rounded-xl disabled:opacity-50">Bekor qilish</button>
                <button onClick={saveEvent} disabled={eventSaving}
                  className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">
                  {eventSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Premium kerak modali (8-funksiya) */}
      <Modal open={!!premiumModal} onClose={() => setPremiumModal('')} title="Premium kerak" width="max-w-md">
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/40 bg-warning/15 text-warning text-2xl">⭐</div>
          <p className="text-sm text-text-primary leading-relaxed">{premiumModal}</p>
          <div className="flex gap-3">
            <button onClick={() => setPremiumModal('')} className="btn-ghost flex-1 py-3 rounded-xl">Yopish</button>
            {user?.roles?.owner ? (
              <button
                onClick={() => {
                  setPremiumModal('');
                  try { sessionStorage.setItem('owner_dashboard_initial_tab', 'premium'); } catch {}
                  onNavigate('owner');
                }}
                className="btn-primary flex-1 py-3 rounded-xl font-semibold"
              >
                Premium oling
              </button>
            ) : (
              <button
                onClick={() => setPremiumModal('')}
                className="btn-ghost flex-1 py-3 rounded-xl border border-edge text-text-secondary cursor-not-allowed"
                disabled
                title="Premium faqat direktor (tashkilot egasi) hisobidan sotib olinadi"
              >
                Faqat direktor sotib oladi
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Activation confirmation modal */}
      <Modal open={!!activateConfirm} onClose={() => !eventSaving && setActivateConfirm(null)}
        title={`${eventTypeLabel(activateConfirm?.eventType || 'competition')}ni faollashtirish`} width="max-w-xl">
        {activateConfirm && (() => {
          const liveEvent = olympiads.find(o => String(o.id) === String(activateConfirm.id)) || activateConfirm;
          const questionCount = (liveEvent.questionIds || []).length;
          return (
            <div className="space-y-5">
              <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-success flex items-start gap-3">
                <Icon name="check" size={18} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold text-text-primary mb-1">Hamma asosiy ma'lumotlar tayyor</div>
                  <div className="text-success">Tasdiqlasangiz tadbir faol bo'ladi va o'quvchilar belgilangan vaqtda kirishi mumkin.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-text-secondary mb-1">Turi</div>
                  <div className="font-bold text-text-primary">{eventTypeLabel(liveEvent.eventType || 'competition')}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-text-secondary mb-1">Fan</div>
                  <div className="font-bold text-text-primary">{liveEvent.subject}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-text-secondary mb-1">Boshlanish</div>
                  <div className="font-bold text-text-primary">{liveEvent.startDate} {liveEvent.startTime || ''}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-text-secondary mb-1">Test</div>
                  <div className="font-bold text-text-primary">{questionCount} ta savol · {liveEvent.duration} min{liveEvent.testLevel ? ` · ${liveEvent.testLevel}` : ''}{liveEvent.testType ? ` · ${testTypeLabel(liveEvent.testType)}` : ''}</div>
                </div>
              </div>
              <div className="text-text-primary font-bold">{liveEvent.title}</div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => {
                  const eventToEdit = liveEvent;
                  setActivateConfirm(null);
                  openEditEvent(eventToEdit);
                }} disabled={eventSaving}
                  className="btn-ghost flex-1 py-3 rounded-xl disabled:opacity-50">Yo'q, tahrirlash</button>
                <button onClick={confirmActivation} disabled={eventSaving}
                  className="btn-primary flex-1 py-3 rounded-xl font-bold disabled:opacity-50">
                  {eventSaving ? 'Faollashmoqda...' : 'Ha, faollashtirish'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Assign-questions modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Savollarni tayinlash" width="max-w-2xl">
        {assignModal && (() => {
          const liveOlympiad = (isApi ? olympiads : store.olympiads).find(o => o.id === assignModal.id) || assignModal;
          if (!liveOlympiad) return null;
          const levelValue = assignmentLevel.trim();
          const otherOlympiads = olympiads.filter(o => String(o.id) !== String(liveOlympiad.id));
          const otherOlympiadQuestionIds = new Set();
          otherOlympiads.forEach(o => {
            (o.questionIds || []).forEach(id => otherOlympiadQuestionIds.add(String(id)));
          });
          const matchesLevel = (q) => {
            if (!assignmentLevel) return true;
            const lvl = assignmentLevel.trim().toLowerCase();
            const diff = (q.difficulty || '').toLowerCase();
            const isEnglish = (liveOlympiad.subject === 'Ingliz tili');
            if (isEnglish) {
              const normalizeCefr = (s) => {
                const clean = s.trim().toLowerCase();
                if (clean === 'pre-int' || clean === 'pre-intermediate') return 'pre-intermediate';
                if (clean === 'upper-int' || clean === 'upper-intermediate') return 'upper-intermediate';
                if (clean === 'int' || clean === 'intermediate') return 'intermediate';
                return clean;
              };
              return normalizeCefr(lvl) === normalizeCefr(diff);
            }
            if (lvl === 'beginner' || lvl === 'elementary' || lvl === 'oson' || lvl === 'easy') {
              return diff === 'oson' || diff === 'easy' || diff === 'beginner' || diff === 'elementary';
            }
            if (lvl === "o'rta" || lvl === 'medium' || lvl === 'pre-intermediate' || lvl === 'pre-int' || lvl === 'intermediate' || lvl === 'int') {
              return diff === "o'rta" || diff === 'medium' || diff === 'pre-intermediate' || diff === 'pre-int' || diff === 'intermediate' || diff === 'int';
            }
            if (lvl === 'advanced' || lvl === 'upper-intermediate' || lvl === 'upper-int' || lvl === 'qiyin' || lvl === 'hard') {
              return diff === 'qiyin' || diff === 'hard' || diff === 'advanced' || diff === 'upper-intermediate' || diff === 'upper-int';
            }
            return diff.includes(lvl) || lvl.includes(diff);
          };
          const assigned = new Set(isApi ? assignedQuestionIds : (liveOlympiad.questionIds || []));
          const matchesUnused = (q) => {
            if (!onlyUnused) return true;
            // Joriy tadbirga allaqachon tanlangan savol doim ko'rinsin
            if (assigned.has(q.id)) return true;
            return !otherOlympiadQuestionIds.has(String(q.id));
          };
          const subjectQs = centerQuestions.filter(q => q.subject === liveOlympiad.subject && matchesLevel(q) && matchesUnused(q));
          const otherQs = centerQuestions.filter(q => q.subject !== liveOlympiad.subject && matchesLevel(q) && matchesUnused(q));
          const filteredCount = subjectQs.length + otherQs.length;
          const selectedQuestions = [...assigned]
            .map(id => centerQuestions.find(q => String(q.id) === String(id)))
            .filter(Boolean);
          const typeMismatches = assignmentType
            ? selectedQuestions.filter(q => !questionMatchesTestType(q, assignmentType))
            : [];
          const selectedTypeCounts = selectedQuestions.reduce((acc, q) => {
            const key = inferQuestionTestType(q);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});
          const toggle = (id) => {
            const next = assigned.has(id) ? [...assigned].filter(x => x !== id) : [...assigned, id];
            if (isApi) {
              setAssignedQuestionIds(next);
            } else {
              OlympyStore.updateOlympiad(liveOlympiad.id, { questionIds: next });
            }
          };
          const toggleAllSubjectQs = () => {
            const subjectQsIds = subjectQs.map(q => q.id);
            const allSelected = subjectQs.every(q => assigned.has(q.id));
            let next;
            if (allSelected) {
              const set = new Set(subjectQsIds);
              next = [...assigned].filter(id => !set.has(id));
            } else {
              const set = new Set([...assigned, ...subjectQsIds]);
              next = [...set];
            }
            if (isApi) {
              setAssignedQuestionIds(next);
            } else {
              OlympyStore.updateOlympiad(liveOlympiad.id, { questionIds: next });
            }
          };
          const saveAssignment = () => {
            if (typeMismatches.length > 0) {
              showToast(`⚠ ${typeMismatches.length} ta savol ${testTypeLabel(assignmentType)} turiga mos emas`);
              return;
            }
            if (!isApi) {
              OlympyStore.updateOlympiad(liveOlympiad.id, { testLevel: levelValue, testType: assignmentType });
              setAssignModal(null);
              return;
            }
            const backendOlympiadId = liveOlympiad.backendId ?? liveOlympiad.id;
            const selectedQuestionIds = assignedQuestionIds.map(id => {
              const question = centerQuestions.find(q => String(q.id) === String(id));
              return question?.backendId ?? id;
            });
            setAssignmentSaving(true);
            OlympyApi.updateOlympiad(backendOlympiadId, {
              question_ids: selectedQuestionIds,
              test_level: levelValue,
              test_type: assignmentType,
            }, OlympyApi.getToken())
              .then(() => {
                const metaText = [levelValue, testTypeLabel(assignmentType)].filter(Boolean).join(' · ');
                showToast(metaText ? `✓ Savollar va ${metaText} saqlandi` : '✓ Savollar tayinlandi');
                setAssignModal(null);
                apiOlympiadsRes.reload();
              })
              .catch(err => {
                console.warn('update olympiad test failed:', err);
                showToast("⚠ Savollarni saqlab bo'lmadi");
              })
              .finally(() => setAssignmentSaving(false));
          };
          return (
            <div className="space-y-3">
              <div className="text-sm text-text-secondary">{liveOlympiad.title} — {liveOlympiad.subject}</div>
              <div className="text-xs text-text-secondary">
                Tayinlangan: <span className="text-text-primary">{assigned.size}</span>
                {assignmentLevel ? (
                  <span> / {filteredCount} ta mos savol ({centerQuestions.length} tadan)</span>
                ) : (
                  <span> / {centerQuestions.length} ta mavjud</span>
                )}
              </div>
              {/* Neytral panel: pastdagi "Test Type" paneli `accent-2` ni
                  egallagan, ikkita qo'shni panel bir xil ko'rinmasin. */}
              <div className="rounded-2xl border border-edge bg-surface-2 p-3.5 space-y-2">
                <label className="block text-xs text-text-primary mb-1 font-semibold">Tadbir darajasi (Test Level) <span className="text-text-secondary">(ixtiyoriy)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {(liveOlympiad.subject === 'Ingliz tili'
                    ? ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced']
                    : ['Beginner', "O'rta", 'Advanced']
                  ).map(level => (
                    <button aria-pressed={assignmentLevel === level} key={level} type="button" onClick={() => setAssignmentLevel(level)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${assignmentLevel === level ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:text-text-primary'}`}>
                      {level}
                    </button>
                  ))}
                  {assignmentLevel && (
                    <button type="button" onClick={() => setAssignmentLevel('')}
                      className="rounded-lg border border-edge bg-surface-1 px-2.5 py-1 text-xs font-bold text-text-secondary transition-colors hover:border-edge-strong hover:text-text-primary">
                      Tozalash (Barchasi)
                    </button>
                  )}
                </div>
                <div className="text-xs text-text-secondary pt-1">
                  {assignmentLevel ? (
                    <span>Tanlangan <strong>{assignmentLevel}</strong> darajasiga mos keluvchi savollar ko'rsatilmoqda. Saqlash bosilganda tadbir darajasi ham shunga yangilanadi.</span>
                  ) : (
                    <span>Tadbir darajasi belgilanmagan. Barcha darajadagi savollar ko'rsatilmoqda.</span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-edge bg-surface-1 cursor-pointer hover:border-edge-strong hover:bg-surface-2 transition-colors select-none">
                {/* `text-*`/`focus:ring-*` native checkbox'da ta'sir qilmasdi
                    (forms plugini yo'q) — `accent-color` haqiqatan ishlaydi. */}
                <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)}
                  className="rounded accent-accent" />
                <span className="text-xs text-text-primary font-semibold">Faqat boshqa tadbirlarga ulanmagan savollarni ko'rsatish</span>
              </label>

              <div className="rounded-2xl border border-accent-2/40 bg-accent-2/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-accent-2 font-semibold">Tadbir test turi (Test Type)</span>
                  {/* `bg-accent-2` + `text-text-primary` ikkala mavzuda ham
                      ~1.7:1 edi (och matn och/to'q ko'k ustida). `accent-2`
                      uchun "on-" tokeni yo'q, shuning uchun belgi roli:
                      shaffof fon + `text-accent-2`. */}
                  <span className={`text-xs px-2.5 py-0.5 rounded-lg border font-bold ${
                    assignmentType ? 'border-accent-2/40 bg-accent-2/15 text-accent-2' : 'border-edge bg-surface-2 text-text-secondary'
                  }`}>
                    {testTypeLabel(assignmentType) || 'Belgilanmagan'}
                  </span>
                </div>
                <div className="text-xs text-text-secondary">
                  {assignmentType ? (
                    <span>Tanlangan savollar {testTypeLabel(assignmentType)} turiga mos kelishi kerak. Test turini o'zgartirish uchun tadbirni tahrirlang.</span>
                  ) : (
                    <span>Tadbir test turi belgilanmagan.</span>
                  )}
                </div>
                {selectedQuestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {Object.entries(selectedTypeCounts).map(([type, count]) => (
                      <span key={type} className="rounded-lg bg-surface-1 px-2 py-1 text-accent-2">{testTypeLabel(type)}: {count}</span>
                    ))}
                  </div>
                )}
                {typeMismatches.length > 0 && (
                  <div className="mt-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {typeMismatches.length} ta tanlangan savol {testTypeLabel(assignmentType)} turiga mos emas. Mos savollarni tanlang yoki tadbir test turini Aralash qiling.
                  </div>
                )}
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {subjectQs.length > 0 && (
                  <div className="flex items-center justify-between mt-1 mb-0.5">
                    <div className="text-xs text-text-secondary font-medium uppercase tracking-wider">Tegishli fan savollari</div>
                    <button
                      type="button"
                      onClick={toggleAllSubjectQs}
                      className="text-xs font-bold text-accent hover:text-text-primary transition-colors"
                    >
                      {subjectQs.every(q => assigned.has(q.id)) ? "Barchasini o'chirish" : "Barchasini tanlash"}
                    </button>
                  </div>
                )}
                {subjectQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-surface-2">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary whitespace-pre-wrap"><MathText text={q.text} /></div>
                      <div className="text-xs text-text-secondary mt-1">
                        {testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball · {q.source}
                        {otherOlympiadQuestionIds.has(String(q.id)) && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/40 text-[10px] font-medium font-sans">Boshqa tadbirda</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
                {otherQs.length > 0 && <div className="text-xs text-text-secondary font-medium uppercase tracking-wider mt-3">Boshqa fan savollari</div>}
                {otherQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-surface-2 opacity-70">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-text-primary whitespace-pre-wrap"><MathText text={q.text} /></div>
                      <div className="text-xs text-text-secondary mt-1">
                        {q.subject} · {testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball
                        {otherOlympiadQuestionIds.has(String(q.id)) && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/40 text-[10px] font-medium font-sans">Boshqa tadbirda</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
                {centerQuestions.length > 0 && subjectQs.length === 0 && otherQs.length === 0 && (
                  <div className="text-sm text-text-secondary text-center py-6">Tanlangan darajaga mos savollar topilmadi.</div>
                )}
                {centerQuestions.length === 0 && (
                  <div className="text-sm text-text-secondary text-center py-6">Bu markaz uchun savollar yaratilmagan. <br/>Savollar bo'limidan boshlang.</div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveAssignment} disabled={assignmentSaving || typeMismatches.length > 0}
                  className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">
                  {isApi ? (assignmentSaving ? 'Saqlanmoqda...' : 'Saqlash') : 'Yopish'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Student detail modal */}
      <Modal open={!!studentDetailMembership} onClose={closeStudentDetail} title="O'quvchi profili" width="max-w-2xl">
        {studentDetailLoading && (
          <div className="text-sm text-text-secondary">Yuklanmoqda...</div>
        )}
        {studentDetailError && (
          <div className="text-sm text-error">{studentDetailError}</div>
        )}
        {studentDetail && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={studentDetail.user?.full_name || '—'} src={studentDetail.user?.avatar_url || ''} size={56} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-text-primary truncate">{studentDetail.user?.full_name || '—'}</div>
                <div className="text-xs text-text-secondary">{maskPhoneDisplay(studentDetail.user?.normalized_phone || studentDetail.user?.phone || '')}</div>
                <div className="text-xs text-text-secondary mt-0.5">{studentDetail.center?.name} · {studentDetail.subject || '—'} · {(studentDetail.joined_at || '').slice(0,10)}</div>
              </div>
              <Badge status={statusLabel(studentDetail.status)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-text-primary">{studentDetail.stats?.total_attempts || 0}</div>
                <div className="text-[11px] text-text-secondary">Musobaqalar</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-text-primary">{studentDetail.stats?.average_score || 0}%</div>
                <div className="text-[11px] text-text-secondary">O'rtacha</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-text-primary">{studentDetail.stats?.best_score || 0}%</div>
                <div className="text-[11px] text-text-secondary">Eng yuqori</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-warning">{studentDetail.stats?.first_place_count || 0}</div>
                <div className="text-[11px] text-text-secondary">1-o'rin</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-text-primary mb-2 text-sm">So'nggi natijalar</h4>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {(studentDetail.attempts || []).length === 0 && (
                  <div className="text-sm text-text-secondary">Hali natijalar yo'q</div>
                )}
                {(studentDetail.attempts || []).map(a => (
                  <div key={a.attempt_id} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black font-data text-xs flex-shrink-0 ${a.rank === 1 ? 'bg-warning/20 text-warning' : 'bg-surface-2 text-text-secondary'}`}>#{a.rank || '—'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary truncate">{a.olympiad_title}</div>
                      <div className="text-xs text-text-secondary">{a.subject} · {(a.submitted_at || '').slice(0,10)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-text-primary">{a.score}</div>
                      <div className="text-[11px] text-success">{a.correct_count}/{a.total_questions}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteEventId} onClose={() => !eventSaving && setDeleteEventId(null)}
        title="Tadbirni o'chirish" width="max-w-md">
        {deleteEventId && (() => {
          const event = olympiads.find(o => String(o.id) === String(deleteEventId));
          if (!event) return null;
          return (
            <div className="space-y-4">
              <div className="text-sm text-text-secondary">
                Ushbu tadbirni o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-xs text-text-secondary mb-0.5">Tadbir nomi</div>
                <div className="font-bold text-text-primary text-sm truncate">{event.title}</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDeleteEventId(null)} disabled={eventSaving}
                  className="btn-ghost flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50">Yo'q</button>
                <button onClick={deleteEvent} disabled={eventSaving}
                  className="btn-danger flex-1 rounded-xl py-2.5 text-xs font-bold disabled:opacity-50">
                  {eventSaving ? "O'chirilmoqda..." : "Ha, o'chirish"}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal
        open={!!deleteProductId}
        onClose={() => setDeleteProductId(null)}
        onConfirm={() => deleteShopProduct(deleteProductId)}
        title="Mahsulotni o'chirish"
        message="Mahsulotni do'kondan o'chirasizmi? Bu amalni ortga qaytarib bo'lmaydi."
        confirmText="Ha, o'chirish"
        danger
        busy={shopDeleting}
      />

      <LiveProctorModal
        open={Boolean(liveProctorSession)}
        onClose={() => setLiveProctorSession(null)}
        sessionId={liveProctorSession?.id}
        studentName={liveProctorSession?.studentName}
        olympiadTitle={liveProctorSession?.olympiadTitle}
      />

      <ToastHost />
    </div>
  );
};

Object.assign(window, { ManagerDashboard });
