// pages/TeacherDashboard.jsx — Teacher panel: events + question creation
//
// ─── Dizayn: "Imtihon byulleteni" ─────────────────────────────────────────────
// Bu panel O'QILADIGAN hujjat emas, ISHLATILADIGAN asbob: o'qituvchi uni
// skanerlaydi ("kim tayyor emas?", "kim tashqariga chiqdi?", "qaysi savol
// yiqitmoqda?"). Shuning uchun:
//
//   • Xulosa detaldan oldin — har ro'yxat ustida bir qatorlik yig'indi turadi
//     (o'quvchilar, natijalar, jonli nazorat, savol analitikasi).
//   • Holat FAQAT rang bilan emas: har bir status chipida `Icon` + chegara,
//     jadval qatorlarida esa chap chiziq (`border-l-*`) bor — rang ko'rligida
//     ham o'qiladi.
//   • Raqamli ustunlar `.font-data` (tabular-nums) bilan — ball, foiz, sana va
//     vaqt almashganda ustun sakramaydi.
//   • Gradient, glow, rangli soya va `translateY` hover yo'q. Ajratish —
//     ingichka chegara va bo'shliq.
//
// DIQQAT: `.glass` / `.glass-strong` hoshiyani `box-shadow: inset` bilan
// chizadi, shuning uchun ular ustiga TO'LIQ `border` qo'yilmaydi (ikkita halqa
// chiqadi). Bir tomonlama `border-l-*` urg'u chizig'i esa mumkin — u halqa
// emas, belgi.

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/teacher/<key>`
// manziliga bog'lanadi (home → /dashboard/teacher). Namuna StudentDashboard'dan,
// umumiy yordamchi shared.jsx'dagi makeDashboardUrlSync.
// `proctoring` ro'yxatda YO'Q — u `liveOlympiadId` runtime state'iga bog'liq
// drill-down ko'rinish (URL'ga yozilmaydi), Manager panel bilan bir xil naqsh.
const TEACHER_DASHBOARD_PAGES = ['home', 'requests', 'students', 'olympiads', 'questions', 'results', 'shop', 'qanalytics', 'profile'];
const teacherDashUrl = makeDashboardUrlSync('/dashboard/teacher', TEACHER_DASHBOARD_PAGES);

// O'quvchi ustiga bosilganda o'ngdan ochiladigan batafsil panel.
// `student` — ro'yxatdagi qator obyekti (kamida {id, full_name, phone}).
// Telegram WebView'da backdrop-blur va og'ir animatsiya sekin — ishlatilmadi
// (faqat yengil `animate-in` va oddiy bg-ground/80 overlay).
const TeacherStudentDetailDrawer = ({ student, onClose }) => {
  const detailRes = useApiData(
    () => student?.id
      ? OlympyApi.getMyStudentDetail(student.id, OlympyApi.getToken())
      : Promise.resolve(null),
    [student?.id],
  );
  const d = detailRes.data;
  // Yopishda ESC va body scroll qulflanishi — drawer ochiqligida fon
  // aralashmasin.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fmtScore = (v) => (typeof v === 'number' ? Math.round(v) : (v || 0));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ground/80" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] glass-strong z-50 flex flex-col animate-in">
        {/* Yuqori: avatar + ism + telefon + yopish */}
        <div className="flex items-start gap-3 p-5 border-b border-edge">
          {/* `gradient` ATAYIN berilyapti: shared Avatar default'i
              `from-indigo-500 to-purple-600`, ya'ni remap'dan keyin
              qizil→ko'k gradient. Bitta qattiq akcent yuza + `on-accent`
              initsiallar — yo'nalishga mos. */}
          <Avatar name={student?.full_name} src={student?.avatar_url || d?.avatar_url || ''} size={48} gradient="bg-accent-fill" />
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-text-primary truncate">{d?.full_name || student?.full_name || 'Foydalanuvchi'}</div>
            <div className="text-sm text-text-secondary truncate font-data">{d?.phone || student?.phone || '—'}</div>
            {d?.joined_at && <div className="text-xs text-text-secondary mt-0.5">Qo'shilgan: <span className="font-data">{d.joined_at}</span></div>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Yopish"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {detailRes.loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-surface-2 animate-pulse" />)}
              </div>
              <div className="h-24 rounded-xl bg-surface-2 animate-pulse" />
              <div className="h-40 rounded-xl bg-surface-2 animate-pulse" />
            </div>
          )}

          {!detailRes.loading && detailRes.error && (
            <div className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm font-semibold text-error">
              Ma'lumotni yuklab bo'lmadi.
            </div>
          )}

          {!detailRes.loading && d && (
            <>
              {/* Xulosa detaldan oldin: uchta raqam — keyin fanlar va urinishlar.
                  Raqamlar bir xil rangda (yorliq farqni o'zi aytadi) va
                  `font-data` bilan — ustun almashganda sakramaydi. */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-bold font-data text-text-primary">{d.total_attempts || 0}</div>
                  <div className="text-[11px] font-semibold text-text-secondary mt-0.5">Jami urinish</div>
                </div>
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-bold font-data text-text-primary">{fmtScore(d.avg_score)}</div>
                  <div className="text-[11px] font-semibold text-text-secondary mt-0.5">O'rtacha ball</div>
                </div>
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-bold font-data text-text-primary">{fmtScore(d.best_score)}</div>
                  <div className="text-[11px] font-semibold text-text-secondary mt-0.5">Eng yaxshi</div>
                </div>
              </div>

              {/* Fanlar bo'yicha o'rtacha ball */}
              {Array.isArray(d.subjects) && d.subjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icon name="chart" size={15} className="text-text-secondary" />
                    <h3 className="font-display text-sm font-bold text-text-primary">Fanlar bo'yicha</h3>
                  </div>
                  {/* Avval har fan o'z rangida edi (8 ta xom hex: emerald,
                      pushti, cyan, lime, rose…). Rang bu yerda hech qanday
                      ma'lumot tashimaydi — fan NOMI ustida yozilgan. Endi
                      bitta akcent chizig'i; farqni yorliq va uzunlik beradi. */}
                  <div className="space-y-2.5">
                    {d.subjects.map((s, i) => {
                      const pct = Math.max(0, Math.min(100, fmtScore(s.avg_score)));
                      return (
                        <div key={s.subject + i}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-text-primary truncate">{s.subject}</span>
                            <span className="font-bold font-data text-text-secondary shrink-0 ml-2">{fmtScore(s.avg_score)} · {s.attempts || 0} ta</span>
                          </div>
                          <div className="progress-bar h-2">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* So'nggi urinishlar */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon name="clock" size={15} className="text-text-secondary" />
                  <h3 className="font-display text-sm font-bold text-text-primary">So'nggi urinishlar</h3>
                </div>
                {Array.isArray(d.recent_attempts) && d.recent_attempts.length > 0 ? (
                  <div className="space-y-2">
                    {d.recent_attempts.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl glass px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-text-primary truncate">{a.olympiad_title}</div>
                          <div className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-2 flex-wrap font-data">
                            <span>{a.date || '—'}</span>
                            {a.rank ? <span>· #{a.rank}{a.total_participants ? `/${a.total_participants}` : ''}</span> : null}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-lg border border-edge bg-surface-2 px-2.5 py-1 text-sm font-bold font-data text-text-primary">{fmtScore(a.score)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl glass px-4 py-6 text-center text-sm text-text-secondary">
                    Hali urinishlar yo'q
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

const TeacherDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = teacherDashUrl.usePageState();
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [createModal, setCreateModal] = React.useState(false);
  const [editingEventId, setEditingEventId] = React.useState(null);
  const [activateConfirm, setActivateConfirm] = React.useState(null);
  const [assignModal, setAssignModal] = React.useState(null);
  const [assignedQuestionIds, setAssignedQuestionIds] = React.useState([]);
  const [assignmentLevel, setAssignmentLevel] = React.useState('');
  const [assignmentType, setAssignmentType] = React.useState('');
  const [eventSaving, setEventSaving] = React.useState(false);
  const [deleteEventId, setDeleteEventId] = React.useState(null);
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);
  const [onlyUnused, setOnlyUnused] = React.useState(true);
  const [premiumModal, setPremiumModal] = React.useState('');
  // O'qituvchi onboarding banneri (yengil orientatsiya, bir marta). Backend
  // `onboardingTeacherCompleted === false` bo'lsa uy tabida ko'rsatiladi.
  // Yopilganda API chaqiriladi va user state onUserUpdate orqali yangilanadi;
  // `onboardingDismissed` — API javobini kutmasdan darhol yashirish uchun.
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(false);
  const [onboardingSaving, setOnboardingSaving] = React.useState(false);
  // O'quvchi ustiga bosilganda ochiladigan batafsil panel (StudentDetailDrawer).
  const [selectedStudent, setSelectedStudent] = React.useState(null);
  // Natijalar → "Ko'rish" modali: tadbir ishtirokchilari natijalari jadvali.
  // page_size=200 bilan yuklanadi; 200+ bo'lsa oddiy "Keyingisi →" pagination.
  const [resultsModal, setResultsModal] = React.useState({
    open: false, event: null, data: [], loading: false, page: 1, total: 0,
  });
  // Natijalar so'rovining oxirgi kaliti (eskirgan javobni ajratish uchun) —
  // loadResultsPage'ga qarang. Bu yerda e'lon qilinadi, chunki quyida
  // `if (!center)` early return'i bor (Rules of Hooks).
  const resultsReqRef = React.useRef('');
  // Natijalar jadvalidan o'quvchi qatoriga bosilganda ochiladigan "O'quvchi
  // tahlili" modali: o'sha o'quvchining har bir savol bo'yicha javobi.
  // `studentId` — hozir kimning javoblari kutilayotgani (eskirgan javobni
  // ajratish uchun; openStudentReview'ga qarang).
  const [studentReviewModal, setStudentReviewModal] = React.useState({
    open: false, studentId: null, studentName: '', data: null, loading: false, error: '',
  });
  const emptyEventForm = {
    eventType: 'competition',
    title: '',
    subject: store.subjects[0] || 'Matematika',
    startDate: '',
    startTime: '10:00',
    duration: 60,
    maxScore: 100,
    testLevel: '',
    testType: '',
  };
  const [newEvent, setNewEvent] = React.useState(emptyEventForm);

  // ─── Manager-parity bo'limlari holatlari (Arizalar, Do'kon, Jonli nazorat) ───
  // Telegram bot integratsiyasi (Arizalar bo'limi kartasi).
  const [telegramLink, setTelegramLink] = React.useState(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = React.useState(false);
  const [telegramLinked, setTelegramLinked] = React.useState(!!user?.telegramLinked);
  const telegramPollRef = React.useRef(null);
  // A'zolik arizalari (o'quvchi + o'qituvchi) — manager panel bilan bir xil.
  const [pendingStudents, setPendingStudents] = React.useState([]);
  const [pendingTeachers, setPendingTeachers] = React.useState([]);
  // Ariza tasdiqlash/rad etish ketayotgan qator id'si (ikki marta bosishdan
  // himoya) — OwnerDashboard'dagi `studentActionId` bilan bir xil naqsh.
  const [requestActionId, setRequestActionId] = React.useState(null);
  // Jonli nazorat (proctoring) holatlari.
  const [liveOlympiadId, setLiveOlympiadId] = React.useState(null);
  const [proctoringData, setProctoringData] = React.useState([]);
  const [proctoringLoading, setProctoringLoading] = React.useState(false);
  const [proctoringError, setProctoringError] = React.useState('');
  const [proctoringSearch, setProctoringSearch] = React.useState('');
  const debouncedProctoringSearch = useDebounce(proctoringSearch, 300);
  const [reviewBusyIds, setReviewBusyIds] = React.useState({});
  // Markaz do'koni (Mukofotlar) holatlari.
  const [shopProducts, setShopProducts] = React.useState([]);
  const [shopLoading, setShopLoading] = React.useState(false);
  const [shopSaving, setShopSaving] = React.useState(false);
  const [shopModal, setShopModal] = React.useState(null); // null | 'new' | product obyekti
  const emptyShopForm = { title: '', description: '', coin_cost: 100, icon: '🎁', stock: 10, is_active: true, features: [], imageFile: null, image_url: '' };
  const [shopForm, setShopForm] = React.useState(emptyShopForm);
  const [deleteProductId, setDeleteProductId] = React.useState(null);
  const [shopDeleting, setShopDeleting] = React.useState(false);

  // Avval bitta string state + bitta setTimeout edi: ikkinchi toast birinchisi
  // so'nishidan oldin kelsa, birinchisining eski taymeri uni muddatidan oldin
  // yashirib yuborardi. shared.jsx'dagi useToast() buni stacked, id-based
  // ro'yxat bilan hal qiladi — imzosi bir xil (showToast(msg)) bo'lgani uchun
  // mavjud chaqiruv joylari o'zgarishsiz ishlaydi (AdminDashboard ham shunday).
  const { showToast, ToastHost } = useToast();

  const teacherRole = user?.roles?.teacher;
  const centerId = teacherRole?.centerId || null;

  const apiCentersRes = useApiData(
    () => isApi ? OlympyApi.getCenters() : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiQuestionsRes = useApiData(
    () => (isApi && centerId)
      ? OlympyApi.getQuestions(centerId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, centerId],
  );
  // F3: O'qituvchi paneli — markaz o'quvchilari (ism/telefon/ball) va
  // olimpiadalari (ishtirokchilar soni bilan) backend endpointlaridan.
  const apiTeacherStudentsRes = useApiData(
    () => isApi ? OlympyApi.teacherStudents(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiTeacherOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.teacherOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Natijalar sahifasi statistikasi: backend GET /api/manager/stats/ — center
  // bo'yicha o'rtacha ball, eng yuqori, qatnashuvchilar va tadbirlar breakdown.
  // Endpoint teacher rolini ham qabul qiladi (Manager paneldagi bilan bir xil).
  const teacherStatsRes = useApiData(
    () => (isApi && centerId)
      ? OlympyApi.getManagerStats(centerId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, centerId],
  );

  React.useEffect(() => {
    if (page === 'olympiads' && isApi && centerId) {
      apiQuestionsRes.reload();
      apiOlympiadsRes.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, isApi, centerId]);

  React.useEffect(() => {
    setAssignedQuestionIds(assignModal?.questionIds || []);
    setAssignmentLevel(assignModal?.testLevel || '');
    setAssignmentType(assignModal?.testType || '');
    setOnlyUnused(true);
  }, [assignModal?.id]);

  const apiCenters = isApi && Array.isArray(apiCentersRes.data) ? apiCentersRes.data.map(mapApiCenter) : null;
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data) ? apiOlympiadsRes.data.map(mapApiOlympiad) : null;
  const apiQuestions = isApi && Array.isArray(apiQuestionsRes.data) ? apiQuestionsRes.data.map(mapApiQuestion) : null;
  const baseCenters = isApi ? (apiCenters || []) : store.centers;
  const center = centerId ? baseCenters.find(c => String(c.id) === String(centerId)) : null;
  const centerName = center?.name || 'Tashkilot';
  const centerType = center?.organizationType || "O'quv markaz";
  // O'qituvchi arizasini kim tasdiqlay oladi — backend
  // `user_can_approve_membership` (centers/services.py:121-140) ning aynan
  // ko'zgusi: platform admin doim; markaz egasi esa markaz tasdiqlangan
  // bo'lsa. O'qituvchi bo'lib turgan foydalanuvchi ayni paytda SHU markazning
  // egasi ham bo'lishi mumkin (rol almashtirgich orqali kirgan) — o'shanda
  // tugma ishlaydi va olib tashlanmasligi kerak.
  // `center.ownerId` bu savolga ishonchli javob beradi: public serializer
  // (centers/serializers.py get_owner) `owner` maydonini FAQAT o'sha markaz
  // egasiga yoki platform adminga qaytaradi, qolganlarga `null`. Ya'ni
  // "boshqa markaz egasi" holati o'z-o'zidan chetlab o'tiladi.
  // Demo (store) rejimida arizalar ro'yxati umuman bo'sh — shart ishlatilmaydi.
  const canApproveStaffRequests = isApi
    ? (!!user?.isPlatformAdmin || (center?.ownerId != null && center?.status === 'approved'))
    : true;
  const olympiads = (isApi ? (apiOlympiads || []) : store.olympiads).filter(o => String(o.centerId) === String(centerId));
  const questions = (isApi ? (apiQuestions || []) : store.questions).filter(q => String(q.centerId) === String(centerId));
  const activeEvents = olympiads.filter(o => o.status === 'active');

  // F3: O'quvchilar ro'yxati va olimpiada ishtirokchilari soni (backend
  // teacher endpointlaridan). participantsMap — olimpiada id → ishtirokchilar.
  const teacherStudents = (isApi && apiTeacherStudentsRes.data?.results)
    ? apiTeacherStudentsRes.data.results : [];
  const participantsMap = React.useMemo(() => {
    const map = {};
    const rows = (isApi && apiTeacherOlympiadsRes.data?.results) ? apiTeacherOlympiadsRes.data.results : [];
    rows.forEach(o => { map[String(o.id)] = o.participants || 0; });
    return map;
  }, [isApi, apiTeacherOlympiadsRes.data]);

  // ─── Manager-parity: hook'lar (state'lar early-return'dan oldin bo'lishi shart) ───

  // Telegram polling intervalini unmount'da tozalash.
  React.useEffect(() => () => {
    if (telegramPollRef.current) {
      clearInterval(telegramPollRef.current);
      telegramPollRef.current = null;
    }
  }, []);
  React.useEffect(() => {
    setTelegramLinked(!!user?.telegramLinked);
  }, [user?.telegramLinked]);

  // A'zolik arizalari (o'quvchi + o'qituvchi) — 15s polling (faqat ko'rinib turganda).
  const loadPendingStudents = React.useCallback(() => {
    if (!isApi || !centerId) { setPendingStudents([]); return Promise.resolve(); }
    return OlympyApi.getPendingMemberships(centerId, 'student', OlympyApi.getToken())
      .then(rows => setPendingStudents(Array.isArray(rows) ? rows : []));
  }, [isApi, centerId]);
  const loadPendingTeachers = React.useCallback(() => {
    if (!isApi || !centerId) { setPendingTeachers([]); return Promise.resolve(); }
    return OlympyApi.getPendingMemberships(centerId, 'teacher', OlympyApi.getToken())
      .then(rows => setPendingTeachers(Array.isArray(rows) ? rows : []));
  }, [isApi, centerId]);

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadPendingStudents().catch(err => {
        if (!cancelled) { console.warn('getPendingMemberships failed:', err); setPendingStudents([]); }
      });
      loadPendingTeachers().catch(err => {
        if (!cancelled) { console.warn('getPendingMemberships(teacher) failed:', err); setPendingTeachers([]); }
      });
    };
    refresh();
    const intervalId = isApi && centerId
      ? setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh();
        }, 15000)
      : null;
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId); };
  }, [isApi, centerId, loadPendingStudents, loadPendingTeachers]);

  // Savollar analitikasi (eng ko'p noto'g'ri savollar).
  const questionAnalyticsRes = useApiData(
    () => (isApi && centerId)
      ? OlympyApi.getQuestionAnalytics(centerId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, centerId],
  );

  // Jonli nazorat: tanlangan olimpiada sessiyalarini yuklaydi.
  const loadProctoring = React.useCallback(() => {
    if (!isApi || !liveOlympiadId) { setProctoringData([]); return Promise.resolve(); }
    return OlympyApi.getOlympiadLiveProctoring(liveOlympiadId, OlympyApi.getToken())
      .then(res => { setProctoringData(Array.isArray(res) ? res : []); setProctoringError(''); })
      .catch(err => {
        console.warn('getOlympiadLiveProctoring failed:', err);
        setProctoringError("Jonli nazorat ma'lumotlarini yuklab bo'lmadi.");
      });
  }, [isApi, liveOlympiadId]);

  // Cheating tekshiruvi bo'yicha qaror: 'disqualify' yoki 'continue'.
  const handleReviewCheating = React.useCallback((sessionId, decision) => {
    if (!isApi || !sessionId || reviewBusyIds[sessionId]) return;
    setReviewBusyIds(prev => ({ ...prev, [sessionId]: true }));
    OlympyApi.reviewCheatingCase(sessionId, decision, OlympyApi.getToken())
      .then(() => showToast(decision === 'disqualify' ? 'Diskvalifikatsiya qilindi' : 'Davom etishga ruxsat berildi'))
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

  // Adaptiv polling: tekshiruv kutilayotgan bo'lsa 5s, aks holda 10s.
  const hasPendingReview = proctoringData.some(p => p.pending_review);
  React.useEffect(() => {
    if (page !== 'proctoring' || !liveOlympiadId) return undefined;
    setProctoringLoading(true);
    loadProctoring().finally(() => setProctoringLoading(false));
    const intervalMs = hasPendingReview ? 5000 : 10000;
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') loadProctoring();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [page, liveOlympiadId, loadProctoring, hasPendingReview]);

  // Markaz do'koni mahsulotlari.
  const loadShopProducts = React.useCallback(() => {
    if (!isApi || !centerId) { setShopProducts([]); return Promise.resolve(); }
    return OlympyApi.getCenterShopProducts(OlympyApi.getToken(), centerId)
      .then(rows => { setShopProducts(Array.isArray(rows) ? rows : []); });
  }, [isApi, centerId]);

  React.useEffect(() => {
    if (page !== 'shop') return undefined;
    let cancelled = false;
    setShopLoading(true);
    loadShopProducts()
      .catch(() => { if (!cancelled) setShopProducts([]); })
      .finally(() => { if (!cancelled) setShopLoading(false); });
    return () => { cancelled = true; };
  }, [page, loadShopProducts]);

  if (!center) {
    return (
      <PendingAccessCard
        title="Ustoz paneli ochilmadi"
        status="pending"
        message="Ustoz paneliga kirish uchun direktor sizni tasdiqlangan tashkilotga biriktirishi kerak."
        onBack={() => onNavigate('landing')}
      />
    );
  }

  // Arizalar (o'quvchi + o'qituvchi) — Manager panel bilan bir xil ro'yxat.
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
  const requests = isApi ? [...apiRequests, ...apiTeacherRequests] : [];
  const pendingCount = requests.filter(r => r.status === 'Kutilmoqda').length;

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'students', icon: 'users', label: "O'quvchilar" },
    { key: 'olympiads', icon: 'trophy', label: 'Musobaqalar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'shop', icon: 'award', label: "Do'kon" },
    { key: 'qanalytics', icon: 'info', label: 'Savollar analitikasi' },
    { key: 'profile', icon: 'user', label: 'Profil' },
  ];

  // MobileBottomNav faqat dastlabki 5 ta elementni oladi — mobil uchun alohida
  // ro'yxat (Manager paneldagi naqsh): oxirida profil.
  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'requests'),
    navItems.find(n => n.key === 'olympiads'),
    navItems.find(n => n.key === 'students'),
    navItems.find(n => n.key === 'profile'),
  ].filter(Boolean);

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

  const resetEventForm = () => {
    setCreateModal(false);
    setEditingEventId(null);
    setNewEvent({ ...emptyEventForm });
  };

  const openCreateEvent = () => {
    setEditingEventId(null);
    setNewEvent({ ...emptyEventForm });
    setCreateModal(true);
  };

  // O'qituvchi onboarding bannerini yopish — backendni yangilab, user state'ni
  // ham (onUserUpdate orqali) sinxronlaymiz. Idempotent — xato bo'lsa ham
  // bannerni yashiramiz (keyingi getMe'da to'g'ri holat keladi).
  const dismissOnboarding = () => {
    setOnboardingSaving(true);
    setOnboardingDismissed(true);
    OlympyApi.completeTeacherOnboarding(OlympyApi.getToken())
      .then(() => {
        if (onUserUpdate) onUserUpdate({ ...user, onboardingTeacherCompleted: true });
      })
      .catch(err => { console.warn('completeTeacherOnboarding failed:', err); })
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
    setEditingEventId(event.id);
    setNewEvent({
      eventType: event.eventType || 'competition',
      title: event.title || '',
      subject: event.subject || store.subjects[0] || 'Matematika',
      startDate: event.startDate || '',
      startTime: event.startTime || '10:00',
      duration: event.duration || event.duration_minutes || 60,
      maxScore: event.maxScore || 100,
      testLevel: event.testLevel || '',
      testType: event.testType || '',
    });
    setCreateModal(true);
  };

  const closeEventModal = () => {
    if (!eventSaving) resetEventForm();
  };

  const eventErrorMessage = (err) =>
    err?.data?.errors?.[0] || OlympyApi.toUserMessage(err);

  const saveEvent = () => {
    const issues = eventFormIssues(newEvent);
    if (issues.length) {
      showToast(`⚠ ${issues[0]}`);
      return;
    }
    const editingEvent = editingEventId
      ? olympiads.find(o => String(o.id) === String(editingEventId))
      : null;
    const payload = {
      event_type: newEvent.eventType,
      title: newEvent.title.trim(),
      subject: newEvent.subject,
      start_datetime: formStartIso(newEvent),
      duration_minutes: Number(newEvent.duration) || 60,
      test_level: (newEvent.testLevel || '').trim(),
      test_type: newEvent.testType || '',
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
            ? `✓ ${eventTypeLabel(newEvent.eventType)} yangilandi`
            : `✓ ${eventTypeLabel(newEvent.eventType)} yaratildi`);
          resetEventForm();
          apiOlympiadsRes.reload();
        })
        .catch(err => {
          console.warn('teacher save event failed:', err);
          if (err?.status === 403 && err?.data?.upgrade_required) {
            resetEventForm();
            setPremiumModal(err.data.detail || 'Bepul rejimda olimpiada limiti tugadi.');
          } else {
            showToast(`⚠ ${eventErrorMessage(err)}`);
          }
        })
        .finally(() => setEventSaving(false));
      return;
    }

    const localPatch = {
      eventType: newEvent.eventType,
      title: newEvent.title.trim(),
      subject: newEvent.subject,
      startDate: newEvent.startDate,
      startTime: newEvent.startTime,
      duration: Number(newEvent.duration) || 60,
      maxScore: newEvent.maxScore,
      testLevel: (newEvent.testLevel || '').trim(),
      testType: newEvent.testType || '',
    };
    if (editingEvent) {
      OlympyStore.updateOlympiad(editingEvent.id, localPatch);
      showToast(`✓ ${eventTypeLabel(newEvent.eventType)} yangilandi`);
    } else {
      OlympyStore.createOlympiad({
        centerId,
        ...localPatch,
        status: 'draft',
        createdBy: user.id,
      });
      showToast(`✓ ${eventTypeLabel(newEvent.eventType)} yaratildi`);
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
          console.warn('teacher publish event failed:', err);
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
          console.warn('teacher deactivate event failed:', err);
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
          console.warn('teacher finish event failed:', err);
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

    const hasAttempts = store.attempts.some(a => String(a.olympiadId) === String(event.id)) || event.participants > 0;
    if (hasAttempts) {
      showToast("Ushbu tadbirda ishtirokchilar urinishlari bor, uni o'chirib bo'lmaydi");
      setDeleteEventId(null);
      return;
    }

    OlympyStore.deleteOlympiad(event.id);
    showToast(`✓ ${eventTypeLabel(event.eventType || 'competition')} muvaffaqiyatli o'chirildi`);
    setDeleteEventId(null);
  };

  // ─── Natijalar: tadbir ishtirokchilari jadvali + o'quvchi tahlili ───
  // Natijalar modali: tanlangan tadbirning bitta sahifasini yuklaydi.
  // page_size 200 — 200+ ishtirokchi bo'lsa "Keyingisi →" pagination ishlaydi.
  const RESULTS_PAGE_SIZE = 200;
  // Eskirgan javob himoyasi (AdminDashboard:2751 dagi ID-solishtirish naqshi):
  // tadbir tez almashtirilsa yoki "Keyingisi →" ketma-ket bosilsa, sekinroq
  // birinchi javob ikkinchisidan KEYIN qaytib, sarlavhadagi tadbir ostiga
  // boshqa tadbirning natijalarini yozib qo'yardi. Javobda tadbir id'si
  // qaytmaydi, shuning uchun oxirgi so'rov kaliti `resultsReqRef` da saqlanadi
  // (yuqorida, early return'dan oldin — Rules of Hooks talabi) va javob faqat
  // o'sha kalit hali joriy bo'lsa qo'llanadi.
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

  // ─── Manager-parity: Telegram bot ulash (Arizalar bo'limi) ───
  const startTelegramLink = () => {
    if (!isApi) { showToast('Real bot server rejimida ulanadi'); return; }
    setTelegramLinkLoading(true);
    OlympyApi.startTelegramLink(OlympyApi.getToken())
      .then(data => {
        setTelegramLink(data);
        if (data?.telegram_deep_link) {
          const opened = goToTelegramLink(data.telegram_deep_link);
          showToast(opened ? 'Telegram bot ochilyapti. Telefon raqamingizni yuboring.' : 'Brauzer Telegramga o‘tishni blokladi. Pastdagi linkni bosing.');
          let tries = 0;
          const MAX_TRIES = 60;
          const token = OlympyApi.getToken();
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
      .catch(err => { console.warn('startTelegramLink failed:', err); showToast(OlympyApi.toUserMessage(err)); })
      .finally(() => setTelegramLinkLoading(false));
  };

  // ─── Manager-parity: ariza tasdiqlash/rad etish ───
  const handleRequest = (id, action) => {
    if (!isApi) { showToast('Real server rejimida ishlaydi'); return; }
    const token = OlympyApi.getToken();
    const requestEntry = requests.find(r => r.id === id);
    const requestRow = requestEntry?._raw;
    const membershipId = requestRow?.membership_id ?? requestRow?.membershipId ?? requestRow?.backendId;
    if (!membershipId || !centerId) { showToast("⚠ API rejimida ariza ma'lumoti yetarli emas"); return; }
    const backendCenterId = center?.backendId ?? centerId;
    // O'qituvchi arizasi uchun boshqa endpoint. Tugma faqat
    // `canApproveStaffRequests` bo'lganda ko'rsatiladi (markaz egasi yoki
    // platform admin) — aks holda backend 403 qaytaradi.
    const isTeacherRequest = requestEntry?.role === 'teacher';
    const approveFn = isTeacherRequest ? OlympyApi.approveTeacher : OlympyApi.approveStudent;
    // Ikki marta yuborishdan himoya — OwnerDashboard'dagi `studentActionId`
    // naqshi: amal ketayotgan ariza id'si saqlanadi, tugma disabled bo'ladi.
    setRequestActionId(id);
    approveFn(backendCenterId, { membership_id: membershipId, decision: action === 'approve' ? 'approved' : 'rejected' }, token)
      .then(() => isTeacherRequest ? loadPendingTeachers() : loadPendingStudents())
      .then(() => showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi'))
      .catch(err => { console.warn('approveStudent/approveTeacher failed:', err); showToast(err?.message ? `⚠ ${err.message}` : "⚠ Tasdiqlab bo'lmadi"); })
      .finally(() => setRequestActionId(null));
  };

  // ─── Manager-parity: markaz do'koni CRUD ───
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
    if (!isApi || !centerId) { showToast('Demo rejimida ishlamaydi'); return; }
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
      ? OlympyApi.updateCenterShopProduct(shopModal.id, body, token, centerId)
      : OlympyApi.createCenterShopProduct(body, token, centerId);
    req
      .then(() => { closeShopModal(); return loadShopProducts(); })
      .then(() => showToast(isEdit ? 'Mahsulot yangilandi' : "Mahsulot qo'shildi"))
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "Saqlab bo'lmadi"))
      .finally(() => setShopSaving(false));
  };

  const deleteShopProduct = (productId) => {
    if (!isApi || !centerId) return;
    setShopDeleting(true);
    OlympyApi.deleteCenterShopProduct(productId, OlympyApi.getToken(), centerId)
      .then(() => loadShopProducts())
      .then(() => { showToast("Mahsulot o'chirildi"); setDeleteProductId(null); })
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi"))
      .finally(() => setShopDeleting(false));
  };

  const toggleShopActive = (product) => {
    if (!isApi || !centerId) return;
    OlympyApi.updateCenterShopProduct(product.id, { is_active: !product.is_active }, OlympyApi.getToken(), centerId)
      .then(() => loadShopProducts())
      .catch(err => showToast(OlympyApi.toUserMessage?.(err) || "O'zgartirib bo'lmadi"));
  };

  const renderRequests = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-text-primary">Arizalar</h2>
        {/* Xulosa ro'yxatdan oldin: nechta kutilmoqda va ular kim. Holat
            faqat rang emas — chip shakli va `Icon` ham bor. */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`chip ${pendingCount ? 'badge-pending' : 'badge-finished'}`}>
            <Icon name={pendingCount ? 'clock' : 'check'} size={12} />
            <span className="font-data">{pendingCount}</span> ta kutilmoqda
          </span>
          <span className="text-text-secondary">
            O'quvchi: <span className="font-data text-text-primary">{apiRequests.length}</span>
            {' · '}O'qituvchi: <span className="font-data text-text-primary">{apiTeacherRequests.length}</span>
          </span>
        </div>
      </div>

      {/* `.glass` hoshiyani inset box-shadow bilan chizadi — ustiga `border`
          qo'yilmaydi (avval `border-indigo-500/10` turardi, ikkinchi halqa). */}
      <div className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Telegram BRENDI — Olympy yuzasi emas: #2b5278 va ustidagi oq matn
              ATAYIN qattiq yozilgan va mavzu bilan almashmaydi (shared.jsx
              dagi `TelegramMockup` bilan bir xil qoida). Oq matn shu ko'k
              fonda 8.1:1. */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ background: '#2b5278' }}>TG</div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-text-primary">Telegram bot integratsiyasi</div>
            <div className="text-xs text-text-secondary">Yangi o'quvchi arizalari botga avtomatik boradi</div>
          </div>
          <span className={`chip ml-auto ${telegramLinked ? 'badge-approved' : 'badge-pending'}`}>
            <Icon name={telegramLinked ? 'check' : 'info'} size={12} />
            {telegramLinked ? 'Ulangan' : 'Ulanmagan'}
          </span>
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
                className="text-xs font-semibold text-accent hover:underline">
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
          <thead><tr className="border-b border-edge">
            {['Ism', 'Rol', 'Telefon', 'Ariza sanasi', 'Fan', 'Kod', 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-text-secondary font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="olympy-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={r.name} src={r.avatarUrl || ''} size={32} /><span className="text-sm font-medium text-text-primary">{r.name}</span></div></td>
                <td className="px-4 py-3">
                  {/* Rol — holat emas, shuning uchun `success`/`warning` emas:
                      kamdan-kam uchraydigan o'qituvchi arizasi qalam ko'kida
                      (`accent-2`), oddiy o'quvchi neytral plastinkada. Ikkalasi
                      ham yozuv bilan nomlangan, rang faqat skanerlashni
                      tezlashtiradi. */}
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${r.role === 'teacher' ? 'text-accent-2 bg-surface-2 border-accent-2/45' : 'text-text-secondary bg-surface-2 border-edge-strong'}`}>
                    {r.role === 'teacher' ? "O'qituvchi" : "O'quvchi"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">{maskPhoneDisplay(r.phone, '')}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{r.date}</td>
                <td className="px-4 py-3">{r.subject && r.subject !== '—' ? <SubjectBadge subject={r.subject} /> : <span className="text-xs text-text-secondary">—</span>}</td>
                <td className="px-4 py-3 text-xs font-mono text-text-secondary">{r.approvalCode || '—'}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status !== 'Kutilmoqda' ? (
                    <span className="text-xs text-text-secondary">—</span>
                  ) : (r.role !== 'student' && !canApproveStaffRequests) ? (
                    // O'qituvchi arizasini backend faqat markaz egasiga (yoki
                    // platform adminga) tasdiqlashga ruxsat beradi
                    // (centers/services.py, user_can_approve_membership) —
                    // oddiy o'qituvchi bosganda tugma doim 403 bilan yiqilardi.
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
            // Eng past pog'ona "yaxshi" EMAS (xato ulushi 49% ham bo'lishi
            // mumkin), shuning uchun `success` emas — neytral qalam ko'ki
            // (`accent-2`) "odatdagi" degani. `border` — chap chiziq: `.glass`
            // o'z halqasini inset soya bilan chizadi, ustiga to'liq hoshiya
            // qo'yilsa ikkita halqa chiqardi.
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
    // Webkamera nazorati shu olimpiadada yoqilgan bo'lsagina rozilik badge'ini ko'rsatamiz.
    const cameraOn = !!activeOlym?.cameraProctoringEnabled;
    // Ovoz nazorati badge'i — kameradan mustaqil.
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
              <div className="font-data text-2xl font-black text-error mt-1">{disqualifiedCount}</div>
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

                  let statusBadge = null;
                  let onlineIndicator = null;

                  if (p.status === 'disqualified') {
                    statusBadge = (
                      <span className="rounded-lg bg-error/10 border border-error/40 px-2 py-1 text-xs font-bold text-error inline-flex items-center gap-1">
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
                      <span className="rounded-lg bg-surface-2 border border-edge-strong px-2 py-1 text-xs font-bold text-text-secondary inline-flex items-center gap-1">
                        ✓ Yakunlandi
                      </span>
                    );
                    onlineIndicator = (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                        <span className="w-2 h-2 rounded-full bg-edge-strong"></span>
                        Oflayn
                      </span>
                    );
                  } else if (p.pending_review || p.status === 'pending_review') {
                    statusBadge = (
                      <span className="rounded-lg bg-warning/10 border border-warning/40 px-2 py-1 text-xs font-bold text-warning inline-flex items-center gap-1">
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
                          <span className="w-2 h-2 rounded-full bg-edge-strong"></span>
                          Oflayn (Aloqa yo'q)
                        </span>
                      );
                    }
                  }

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
                    <tr key={p.student_id} className="olympy-row hover:bg-surface-1 transition-colors">
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
                              <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded border border-success/40 inline-flex items-center gap-1"
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
                              <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded border border-success/40 inline-flex items-center gap-1"
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
                            <div className="text-[10px] text-error bg-error/10 px-2 py-0.5 rounded border border-error/40 max-w-[200px] truncate" title={cheatingReasonLabel(p.cheating_reason)}>
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
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-success/10 border border-success/40 text-success hover:bg-success/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Davom etishga ruxsat
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary text-xs">Test topshirilmoqda...</span>
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
                  <div key={p.id} className={`rounded-xl border p-3.5 flex flex-col gap-3 ${p.is_active ? 'border-edge-strong bg-surface-2' : 'border-edge bg-surface-1 opacity-70'}`}>
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
                      <button onClick={() => openShopModal(p)} className="flex-1 rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-2">
                        Tahrirlash
                      </button>
                      <button onClick={() => toggleShopActive(p)} className="rounded-lg border border-edge bg-surface-2 px-3 py-1.5 text-xs font-bold text-text-primary hover:bg-surface-2" title={p.is_active ? 'Nofaol qilish' : 'Faollashtirish'}>
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
                  <span className="text-sm font-bold text-text-primary">Faol (o'quvchilarga ko'rinadi)</span>
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

  const renderHome = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      {/* Urg'u — chap chetdagi akcent chizig'i: `.glass` halqasini inset soya
          chizadi, ustiga to'liq `border` qo'yilsa ikkita halqa chiqadi.
          `glow-blue` olib tashlandi — rangli soya yo'nalishda yo'q. */}
      {user?.onboardingTeacherCompleted === false && !onboardingDismissed && (
        <div className="glass rounded-2xl p-5 border-l-4 border-l-accent">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-accent-fill text-on-accent">
              <Icon name="sparkles" size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-text-primary">Ustoz paneliga xush kelibsiz!</h3>
              <p className="text-text-secondary text-sm mt-0.5">Boshlash uchun birinchi savolingizni yarating — keyin uni tadbirlarga qo'shishingiz mumkin.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => { setPage('questions'); dismissOnboarding(); }}
                  className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
                  <Icon name="plus" size={15} /> Savol yaratish
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
          <h2 className="text-2xl font-black text-text-primary">{centerName}</h2>
          <p className="text-text-secondary text-sm">{centerType} · Ustoz paneli · tadbirlar va savollar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openCreateEvent} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
            <Icon name="plus" size={16} /> Tadbir yaratish
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* `StatCard` `color` ni `bg-gradient-to-br` ostiga qo'yadi (shared.jsx).
            `from-*`/`to-*` berilmasa gradient umuman chizilmaydi va faqat
            shu yerdagi qattiq fon qoladi — StudentDashboard bilan bir xil. */}
        <StatCard label="Jami tadbirlar" value={olympiads.length} icon={<Icon name="trophy" size={20} />} color="bg-surface-2 text-text-secondary" />
        <StatCard label="Faol tadbirlar" value={activeEvents.length} icon={<Icon name="bolt" size={20} />} color="bg-surface-2 text-text-secondary" />
        <StatCard label="Savollar" value={questions.length} icon={<Icon name="book" size={20} />} color="bg-surface-2 text-text-secondary" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-text-primary">Oxirgi tadbirlar</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs font-semibold text-accent hover:underline">Ko'rish</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 4).map(o => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl glass p-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${o.eventType === 'olympiad' ? 'bg-accent-2/10 text-accent-2' : 'bg-warning/10 text-warning'}`}><Icon name="trophy" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text-primary">{o.title}</div>
                  <div className="text-xs text-text-secondary">{eventTypeLabel(o.eventType || 'competition')} · {o.subject}{o.testLevel ? ` · ${o.testLevel}` : ''}{o.testType ? ` · ${testTypeLabel(o.testType)}` : ''} · {o.startDate || 'Sana yoq'}</div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ))}
            {olympiads.length === 0 && <div className="text-sm text-text-secondary">Hali tadbir yo'q</div>}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-text-primary">Savollar bazasi</h3>
            <button onClick={() => setPage('questions')} className="text-xs font-semibold text-accent hover:underline">Savol yaratish</button>
          </div>
          <div className="space-y-3">
            {questions.slice(0, 4).map(q => (
              <div key={q.id} className="rounded-xl glass p-3">
                <div className="line-clamp-2 text-sm text-text-primary"><MathText text={q.text} /></div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                  <SubjectBadge subject={q.subject} />
                  <span>{testTypeLabel(inferQuestionTestType(q))}</span>
                  <span>{q.score || 0} ball</span>
                </div>
              </div>
            ))}
            {questions.length === 0 && <div className="text-sm text-text-secondary">Hali savol yo'q</div>}
          </div>
        </div>
      </div>
    </div>
  );

  // F3: O'quvchilar tab — markaz o'quvchilari (ism, telefon, o'rtacha ball,
  // urinishlar soni). Ma'lumot backend teacher_students endpointidan.
  const renderStudents = () => {
    const loading = isApi && apiTeacherStudentsRes.loading;
    return (
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-text-primary">O'quvchilar</h2>
            <p className="text-text-secondary text-sm">{centerName} · markaz o'quvchilari va natijalari</p>
          </div>
          <div className="rounded-xl glass px-4 py-2 text-sm font-bold text-text-primary">
            Jami: <span className="font-data">{teacherStudents.length}</span>
          </div>
        </div>

        {loading && (
          <div className="text-center py-10 text-text-secondary text-sm">Yuklanmoqda...</div>
        )}

        {!loading && teacherStudents.length === 0 && (
          <EmptyState
            icon="users"
            title="O'quvchilar yo'q"
            desc="Markazingizga o'quvchilar qo'shilgach, ular shu yerda ko'rinadi"
          />
        )}

        {!loading && teacherStudents.length > 0 && (
          <div className="glass rounded-2xl overflow-hidden">
            {/* Sarlavha — faqat desktop. */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 border-b border-edge text-xs font-bold uppercase tracking-wide text-text-secondary">
              <div className="col-span-5">Ism familiya</div>
              <div className="col-span-4">Telefon</div>
              <div className="col-span-2 text-center">O'rtacha ball</div>
              <div className="col-span-1 text-center">Urinish</div>
            </div>
            <div className="divide-y divide-edge">
              {teacherStudents.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
                    <Avatar name={s.full_name} size={34} />
                    <div className="font-semibold text-text-primary truncate">{s.full_name || 'Foydalanuvchi'}</div>
                  </div>
                  <div className="col-span-6 md:col-span-4 text-sm text-text-secondary truncate">
                    <span className="md:hidden text-text-secondary">Tel: </span>{s.phone || '—'}
                  </div>
                  <div className="col-span-3 md:col-span-2 md:text-center">
                    <span className="inline-block rounded-lg border border-edge bg-surface-2 px-2.5 py-1 text-sm font-bold font-data text-text-primary">{s.avg_score || 0}</span>
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right md:text-center text-sm font-semibold text-text-secondary">{s.attempts || 0}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedStudent && (
          <TeacherStudentDetailDrawer
            student={selectedStudent}
            onClose={() => setSelectedStudent(null)}
          />
        )}
      </div>
    );
  };

  const renderOlympiads = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-text-primary">Musobaqalar</h2>
          <p className="text-text-secondary text-sm">{centerName} · olimpiada va musobaqalar</p>
        </div>
        <button onClick={openCreateEvent} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15} /> Yangi tadbir
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {olympiads.map(o => {
          const assignedCount = (o.questionIds || []).length;
          const needsReadiness = ['draft', 'inactive'].includes(o.status);
          const issues = needsReadiness ? eventReadinessIssues(o) : [];
          const isReady = issues.length === 0;
          const canEdit = needsReadiness;
          return (
            <div key={o.id} className="glass rounded-2xl p-5">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${o.eventType === 'olympiad' ? 'bg-accent-2/10 text-accent-2' : 'bg-warning/10 text-warning'}`}>
                  <Icon name="trophy" size={20} />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="font-bold text-text-primary">{o.title}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                    <SubjectBadge subject={o.subject} />
                    {/* Faqat tadbir TURI rang ko'taradi (olimpiada / musobaqa —
                        haqiqiy farq). Daraja va test turi metama'lumot, ular
                        neytral plastinkada: uchta rangli chip yonma-yon tursa
                        birortasi ham ko'zga tashlanmaydi. */}
                    <span className={`rounded-lg px-2 py-1 font-bold ${o.eventType === 'olympiad' ? 'bg-accent-2/10 text-accent-2' : 'bg-warning/10 text-warning'}`}>{eventTypeLabel(o.eventType || 'competition')}</span>
                    {o.testLevel && <span className="rounded-lg border border-edge bg-surface-2 px-2 py-1 font-bold text-text-secondary">Daraja: {o.testLevel}</span>}
                    {o.testType && <span className="rounded-lg border border-edge bg-surface-2 px-2 py-1 font-bold text-text-secondary">Tur: {testTypeLabel(o.testType)}</span>}
                    <span>{o.startDate || "Sana yo'q"} {o.startTime || ''}</span>
                    <span>{o.duration || 60} min</span>
                    <span>{assignedCount} ta savol</span>
                    {isApi && (
                      <span className="flex items-center gap-1 text-text-secondary">
                        <Icon name="users" size={12} /> {participantsMap[String(o.backendId ?? o.id)] || 0} ishtirokchi
                      </span>
                    )}
                  </div>
                  {needsReadiness && (
                    <div className={`rounded-xl px-3 py-2 border text-xs ${isReady ? 'bg-success/10 border-success/40 text-success' : 'bg-warning/10 border-warning/40 text-warning'}`}>
                      <div className="flex items-center gap-2 font-semibold">
                        <Icon name={isReady ? 'check' : 'info'} size={13} />
                        {isReady ? 'Faollashtirishga tayyor' : 'Tayyor emas'}
                      </div>
                      {!isReady && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {issues.slice(0, 3).map(issue => (
                            <span key={issue} className="rounded-lg bg-surface-2 px-2 py-1">{issue}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:items-stretch">
                  <Badge status={statusLabel(o.status)} />
                  <button onClick={() => openEditEvent(o)} disabled={!canEdit}
                    className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                    <Icon name="edit" size={13} /> Tahrirlash
                  </button>
                  {canEdit && (
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
        {olympiads.length === 0 && (
          <EmptyState
            icon="trophy"
            title="Musobaqalar yo'q"
            desc="Birinchi olimpiada yoki musobaqangizni yarating"
            action={<button onClick={openCreateEvent} className="btn-primary px-4 py-2 rounded-xl text-sm">Yaratish</button>}
          />
        )}
      </div>
    </div>
  );

  // Natijalar tab — markaz tadbirlari natijalari (Manager paneldagi bilan
  // bir xil). API rejimida real raqamlar (teacherStatsRes); mock rejimda
  // lokal finished olimpiada fallback.
  const renderResults = () => {
    const apiData = isApi ? teacherStatsRes.data : null;
    const apiLoading = isApi && teacherStatsRes.loading && !apiData;
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
                <button
                  onClick={() => openResultsModal(e)}
                  className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"
                  title="Ishtirokchilar natijalari jadvalini ko'rish"
                >
                  <Icon name="eye" size={12} /> Ko'rish
                </button>
                <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1">
                  <Icon name="trophy" size={12} /> Reyting
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

  const pagesMap = {
    home: renderHome,
    requests: renderRequests,
    students: renderStudents,
    olympiads: renderOlympiads,
    results: renderResults,
    qanalytics: renderQAnalytics,
    proctoring: renderProctoring,
    shop: renderShop,
    questions: () => <QuestionCreatorPage embedded user={user} onOpenSwitcher={onOpenSwitcher} onNavigate={onNavigate} />,
    profile: () => <ProfilePage user={user} embedded onUserUpdate={onUserUpdate} />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={navItems}
        activePage={page}
        setPage={setPage}
        user={{ ...user, role: "O'qituvchi" }}
        onLogout={onLogout}
        logoClick={() => setPage('home')}
        mobileOpen={mobileMenu}
        onMobileClose={() => setMobileMenu(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={navItems.find(n => n.key === page)?.label || 'Ustoz paneli'}
          subtitle={`${centerName} · ${centerType}`}
          user={user}
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
          }
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {(pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={mobileNavItems} activePage={page} setPage={setPage} />
      </div>

      <Modal open={createModal} onClose={closeEventModal} title={editingEventId ? 'Tadbirni tahrirlash' : 'Tadbir yaratish'} width="max-w-2xl">
        {(() => {
          const formIssues = eventFormIssues(newEvent);
          const modeOptions = [
            { value: 'competition', label: 'Musobaqa', desc: "Faqat shu tashkilot o'quvchilari" },
            { value: 'olympiad', label: 'Olimpiada', desc: 'Platformadagi barcha foydalanuvchilar' },
          ];
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modeOptions.map(opt => {
                  const selected = newEvent.eventType === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setNewEvent({ ...newEvent, eventType: opt.value })}
                      className={`p-4 rounded-2xl text-left border transition-colors ${selected ? 'border-accent bg-accent/10 text-text-primary' : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:bg-surface-2'}`}>
                      <div className="flex items-center gap-2 font-bold text-sm">
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
                  placeholder={newEvent.eventType === 'olympiad' ? 'Matematika Olimpiadasi — May 2026' : 'Ichki matematika musobaqasi'}
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Fan kategoriyasi</label>
                  <select className="input-field" value={newEvent.subject} onChange={e => {
                    const newSubj = e.target.value;
                    let newLevel = newEvent.testLevel;
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
                    setNewEvent({ ...newEvent, subject: newSubj, testLevel: newLevel });
                  }}>
                    {store.subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Davomiyligi (min)</label>
                  <input type="number" min="1" className="input-field" value={newEvent.duration}
                    onChange={e => setNewEvent({ ...newEvent, duration: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Boshlanish sanasi</label>
                  <input type="date" className="input-field" value={newEvent.startDate}
                    onChange={e => setNewEvent({ ...newEvent, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Boshlanish vaqti</label>
                  <input type="time" className="input-field" value={newEvent.startTime}
                    onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Daraja <span className="text-text-secondary">(ixtiyoriy)</span></label>
                  <select className="input-field" value={newEvent.testLevel}
                    onChange={e => setNewEvent({ ...newEvent, testLevel: e.target.value })}>
                    <option value="">— Tanlanmagan —</option>
                    {newEvent.subject === 'Ingliz tili' ? (
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
                  <select className="input-field" value={newEvent.testType}
                    onChange={e => setNewEvent({ ...newEvent, testType: e.target.value })}>
                    <option value="">— Tanlanmagan —</option>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="true_false">True/False</option>
                    <option value="short_answer">Qisqa javob</option>
                    <option value="mixed">Aralash</option>
                    <option value="code_only">Faqat kod (dasturlash)</option>
                  </select>
                </div>
              </div>

              <div className={`rounded-2xl p-4 border text-xs ${formIssues.length ? 'bg-warning/10 border-warning/40 text-warning' : 'bg-success/10 border-success/40 text-success'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon name={formIssues.length ? 'info' : 'check'} size={14} />
                  {formIssues.length ? "To'ldirilishi kerak" : "Asosiy ma'lumotlar tayyor"}
                </div>
                {formIssues.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formIssues.map(issue => <span key={issue} className="rounded-lg bg-surface-2 px-2 py-1">{issue}</span>)}
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

      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Savollarni tayinlash" width="max-w-2xl">
        {assignModal && (() => {
          const liveEvent = (isApi ? olympiads : store.olympiads).find(o => String(o.id) === String(assignModal.id)) || assignModal;
          if (!liveEvent) return null;
          const levelValue = assignmentLevel.trim();
          const otherOlympiads = olympiads.filter(o => String(o.id) !== String(liveEvent.id));
          const otherOlympiadQuestionIds = new Set();
          otherOlympiads.forEach(o => {
            (o.questionIds || []).forEach(id => otherOlympiadQuestionIds.add(String(id)));
          });
          const matchesLevel = (q) => {
            if (!assignmentLevel) return true;
            const lvl = assignmentLevel.trim().toLowerCase();
            const diff = (q.difficulty || '').toLowerCase();
            const isEnglish = (liveEvent.subject === 'Ingliz tili');
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
          const assigned = new Set(isApi ? assignedQuestionIds : (liveEvent.questionIds || []));
          const matchesUnused = (q) => {
            if (!onlyUnused) return true;
            // Joriy tadbirga allaqachon tanlangan savol doim ko'rinsin
            if (assigned.has(q.id)) return true;
            return !otherOlympiadQuestionIds.has(String(q.id));
          };
          const subjectQs = questions.filter(q => q.subject === liveEvent.subject && matchesLevel(q) && matchesUnused(q));
          const otherQs = questions.filter(q => q.subject !== liveEvent.subject && matchesLevel(q) && matchesUnused(q));
          const filteredCount = subjectQs.length + otherQs.length;
          const selectedQuestions = [...assigned]
            .map(id => questions.find(q => String(q.id) === String(id)))
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
              OlympyStore.updateOlympiad(liveEvent.id, { questionIds: next });
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
              OlympyStore.updateOlympiad(liveEvent.id, { questionIds: next });
            }
          };
          const saveAssignment = () => {
            if (typeMismatches.length > 0) {
              showToast(`⚠ ${typeMismatches.length} ta savol ${testTypeLabel(assignmentType)} turiga mos emas`);
              return;
            }
            if (!isApi) {
              OlympyStore.updateOlympiad(liveEvent.id, { testLevel: levelValue, testType: assignmentType });
              setAssignModal(null);
              return;
            }
            const backendEventId = liveEvent.backendId ?? liveEvent.id;
            const selectedQuestionIds = assignedQuestionIds.map(id => {
              const question = questions.find(q => String(q.id) === String(id));
              return question?.backendId ?? id;
            });
            setAssignmentSaving(true);
            OlympyApi.updateOlympiad(backendEventId, {
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
                console.warn('teacher update event questions failed:', err);
                showToast("⚠ Savollarni saqlab bo'lmadi");
              })
              .finally(() => setAssignmentSaving(false));
          };
          return (
            <div className="space-y-3">
              <div className="text-sm text-text-secondary">{liveEvent.title} — {liveEvent.subject}</div>
              <div className="text-xs text-text-secondary">
                Tayinlangan: <span className="text-text-primary">{assigned.size}</span>
                {assignmentLevel ? (
                  <span> / {filteredCount} ta mos savol ({questions.length} tadan)</span>
                ) : (
                  <span> / {questions.length} ta mavjud</span>
                )}
              </div>
              {/* Ikkala sozlama paneli (daraja va test turi) — neytral yuza:
                  ular filtr boshqaruvi, holat emas. Rangni faqat TANLANGAN
                  qiymat ko'taradi. */}
              <div className="rounded-2xl border border-edge bg-surface-2 p-3.5 space-y-2">
                <label className="block text-xs text-text-primary mb-1 font-semibold">Tadbir darajasi (Test Level) <span className="text-text-secondary">(ixtiyoriy)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {(liveEvent.subject === 'Ingliz tili'
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

              <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-edge bg-surface-2 cursor-pointer hover:border-edge-strong transition-colors select-none">
                {/* `accent-accent` — brauzerning o'z belgisini akcent rangiga
                    bo'yaydi. Avvalgi `text-violet-500 focus:ring-violet-500/20`
                    umuman ishlamasdi: forms plugini yo'q va `ring` kengligi
                    berilmagan. */}
                <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)}
                  className="h-4 w-4 rounded accent-accent" />
                <span className="text-xs text-text-primary font-semibold">Faqat boshqa tadbirlarga ulanmagan savollarni ko'rsatish</span>
              </label>

              <div className="rounded-2xl border border-edge bg-surface-2 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-primary font-semibold">Tadbir test turi (Test Type)</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-lg font-bold border ${
                    assignmentType ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge bg-surface-1 text-text-secondary'
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
                      <span key={type} className="rounded-lg border border-edge bg-surface-1 px-2 py-1 font-data text-text-secondary">{testTypeLabel(type)}: {count}</span>
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
                      className="text-xs font-bold text-accent hover:underline transition-colors"
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
                {questions.length > 0 && subjectQs.length === 0 && otherQs.length === 0 && (
                  <div className="text-sm text-text-secondary text-center py-6">Tanlangan darajaga mos savollar topilmadi.</div>
                )}
                {questions.length === 0 && (
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

      {/* Delete confirmation modal */}
      <Modal open={!!deleteEventId} onClose={() => !eventSaving && setDeleteEventId(null)}
        title="Tadbirni o'chirish" width="max-w-md">
        {deleteEventId && (() => {
          const event = olympiads.find(o => String(o.id) === String(deleteEventId));
          if (!event) return null;
          return (
            <div className="space-y-4">
              <div className="text-sm text-text-primary">
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
          // Ball foiziga qarab rangli badge klasslari.
          // `bar` avval gradient to'xtash juftligi edi; endi qattiq rang —
          // progress chizig'i matn ko'tarmaydi, shuning uchun `accent-fill`
          // emas, belgi roli (`accent`).
          const scoreTone = (pct) => {
            if (pct >= 90) return { text: 'text-success', bar: 'bg-success', track: 'bg-success/10', ring: 'border-success/40' };
            if (pct >= 70) return { text: 'text-accent', bar: 'bg-accent', track: 'bg-accent/10', ring: 'border-accent/40' };
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
                  <div className="rounded-xl bg-surface-1 border border-edge px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">Ishtirokchilar</div>
                    <div className="text-lg font-black text-text-primary mt-0.5">{resultsModal.total}</div>
                  </div>
                  <div className="rounded-xl bg-surface-1 border border-edge px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">O'rtacha ball</div>
                    <div className={`text-lg font-black mt-0.5 ${avgScore == null ? 'text-text-secondary' : scoreTone(avgScore).text}`}>
                      {avgScore == null ? '—' : `${avgScore}%`}
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface-1 border border-edge px-3 py-2.5 col-span-2 sm:col-span-1">
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary font-bold">Sahifa</div>
                    <div className="text-lg font-black text-text-primary mt-0.5">{resultsModal.page} <span className="text-sm text-text-secondary font-bold">/ {lastPage}</span></div>
                  </div>
                </div>
              </div>

              {/* ── Loading skeleton ── */}
              {resultsModal.loading && (
                <div className="rounded-2xl border border-edge overflow-hidden">
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-surface-1 text-[10px] uppercase tracking-wide text-text-secondary font-bold">
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
                    {/* Yopishqoq sarlavha — QATTIQ yuza: avval `bg-[#15171f]/95`
                        + `backdrop-blur` edi, ya'ni qog'oz mavzuda to'q siyoh
                        chizig'i chiqardi va yo'nalishda blur ham yo'q. */}
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
                                ? 'bg-surface-1 opacity-60'
                                : idx % 2 === 1
                                  ? 'bg-surface-1'
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
                              <span className={`md:hidden flex-shrink-0 text-sm font-black tabular-nums ${dq ? 'text-text-secondary' : tone.text}`}>{pct}%</span>
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
                                <span className={`hidden md:inline text-sm font-black tabular-nums ${dq ? 'text-text-secondary' : tone.text}`}>{pct}%</span>
                                {/* Mobil progress bar (to'liq qatorda, pastda) */}
                                <div className={`md:hidden flex-1 h-1.5 rounded-full overflow-hidden ${tone.track}`}>
                                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                              </div>

                              {/* Holat */}
                              <div className="flex-shrink-0 md:col-span-2 md:text-center">
                                {dq ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-error/10 text-error border border-error/40">
                                    <Icon name="info" size={11} /> DQ
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/40">
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
                  <div className="px-3 py-2 rounded-xl bg-surface-2 text-[11px] font-bold text-text-secondary tabular-nums">
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
                      {' · '}Ball: <span className="text-text-primary font-semibold">{review.score ?? 0}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Loading */}
              {studentReviewModal.loading && (
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-surface-1 border border-edge animate-pulse" />
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
                      ? 'bg-success/10 border-success/40'
                      : wrong
                        ? 'bg-error/10 border-error/40'
                        : 'bg-surface-1 border-edge';
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
                                <MathText className={`font-semibold break-words ${correct ? 'text-success' : wrong ? 'text-error' : 'text-text-primary'}`} text={chosenTxt} />
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

      {/* Premium kerak modali */}
      <Modal open={!!premiumModal} onClose={() => setPremiumModal('')} title="Premium kerak" width="max-w-md">
        <div className="space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-warning/40 bg-warning/10 text-warning text-2xl">⭐</div>
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

      {/* Do'kon mahsulotini o'chirish tasdig'i */}
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

      <ToastHost />
    </div>
  );
};

Object.assign(window, { TeacherDashboard });
