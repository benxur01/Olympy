// pages/TeacherDashboard.jsx — Teacher panel: events + question creation

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/teacher/<key>`
// manziliga bog'lanadi (home → /dashboard/teacher). Namuna StudentDashboard'dan,
// umumiy yordamchi shared.jsx'dagi makeDashboardUrlSync.
const TEACHER_DASHBOARD_PAGES = ['home', 'students', 'olympiads', 'questions', 'results', 'profile'];
const teacherDashUrl = makeDashboardUrlSync('/dashboard/teacher', TEACHER_DASHBOARD_PAGES);

// Fan progress-bar ranglari — StudentDashboard'dagi palitra bilan bir xil
// (gradient klass emas, solid hex; indeks bo'yicha aylanadi).
const STUDENT_DRAWER_BAR_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#84cc16', '#f43f5e'];

// O'quvchi ustiga bosilganda o'ngdan ochiladigan batafsil panel.
// `student` — ro'yxatdagi qator obyekti (kamida {id, full_name, phone}).
// Telegram WebView'da backdrop-blur va og'ir animatsiya sekin — ishlatilmadi
// (faqat yengil `animate-in` va oddiy bg-black/50 overlay).
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
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] glass-strong border-l border-white/10 z-50 flex flex-col animate-in">
        {/* Yuqori: avatar + ism + telefon + yopish */}
        <div className="flex items-start gap-3 p-5 border-b border-white/10">
          <Avatar name={student?.full_name} src={student?.avatar_url || d?.avatar_url || ''} size={48} />
          <div className="min-w-0 flex-1">
            <div className="font-black text-white truncate">{d?.full_name || student?.full_name || 'Foydalanuvchi'}</div>
            <div className="text-sm text-white/45 truncate">{d?.phone || student?.phone || '—'}</div>
            {d?.joined_at && <div className="text-xs text-white/30 mt-0.5">Qo'shilgan: {d.joined_at}</div>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Yopish"
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {detailRes.loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}
              </div>
              <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
              <div className="h-40 rounded-xl bg-white/5 animate-pulse" />
            </div>
          )}

          {!detailRes.loading && detailRes.error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">
              Ma'lumotni yuklab bo'lmadi.
            </div>
          )}

          {!detailRes.loading && d && (
            <>
              {/* Stats qatori */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-black text-white">{d.total_attempts || 0}</div>
                  <div className="text-[11px] font-semibold text-white/40 mt-0.5">Jami urinish</div>
                </div>
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-black text-indigo-300">{fmtScore(d.avg_score)}</div>
                  <div className="text-[11px] font-semibold text-white/40 mt-0.5">O'rtacha ball</div>
                </div>
                <div className="rounded-xl glass p-3 text-center">
                  <div className="text-lg font-black text-emerald-300">{fmtScore(d.best_score)}</div>
                  <div className="text-[11px] font-semibold text-white/40 mt-0.5">Eng yaxshi</div>
                </div>
              </div>

              {/* Fanlar bo'yicha o'rtacha ball */}
              {Array.isArray(d.subjects) && d.subjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icon name="chart" size={15} className="text-white/40" />
                    <h3 className="text-sm font-black text-white">Fanlar bo'yicha</h3>
                  </div>
                  <div className="space-y-2.5">
                    {d.subjects.map((s, i) => {
                      const pct = Math.max(0, Math.min(100, fmtScore(s.avg_score)));
                      const color = STUDENT_DRAWER_BAR_COLORS[i % STUDENT_DRAWER_BAR_COLORS.length];
                      return (
                        <div key={s.subject + i}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-white/70 truncate">{s.subject}</span>
                            <span className="font-bold text-white/50 shrink-0 ml-2">{fmtScore(s.avg_score)} · {s.attempts || 0} ta</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
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
                  <Icon name="clock" size={15} className="text-white/40" />
                  <h3 className="text-sm font-black text-white">So'nggi urinishlar</h3>
                </div>
                {Array.isArray(d.recent_attempts) && d.recent_attempts.length > 0 ? (
                  <div className="space-y-2">
                    {d.recent_attempts.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl glass px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">{a.olympiad_title}</div>
                          <div className="text-[11px] text-white/40 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{a.date || '—'}</span>
                            {a.rank ? <span>· #{a.rank}{a.total_participants ? `/${a.total_participants}` : ''}</span> : null}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-lg bg-indigo-500/15 px-2.5 py-1 text-sm font-bold text-indigo-300">{fmtScore(a.score)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl glass px-4 py-6 text-center text-sm text-white/35">
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
  const [toast, setToast] = React.useState('');
  const [premiumModal, setPremiumModal] = React.useState('');
  // O'quvchi ustiga bosilganda ochiladigan batafsil panel (StudentDetailDrawer).
  const [selectedStudent, setSelectedStudent] = React.useState(null);
  // Natijalar → "Ko'rish" modali: tadbir ishtirokchilari natijalari jadvali.
  // page_size=200 bilan yuklanadi; 200+ bo'lsa oddiy "Keyingisi →" pagination.
  const [resultsModal, setResultsModal] = React.useState({
    open: false, event: null, data: [], loading: false, page: 1, total: 0,
  });
  // Natijalar jadvalidan o'quvchi qatoriga bosilganda ochiladigan "O'quvchi
  // tahlili" modali: o'sha o'quvchining har bir savol bo'yicha javobi.
  const [studentReviewModal, setStudentReviewModal] = React.useState({
    open: false, studentName: '', data: null, loading: false, error: '',
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

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

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'students', icon: 'users', label: "O'quvchilar" },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
    { key: 'profile', icon: 'user', label: 'Profil' },
  ];

  // MobileBottomNav faqat dastlabki 5 ta elementni oladi. Natijalar
  // qo'shilgach navItems 6 ta bo'ldi — mobil panel uchun alohida ro'yxat:
  // savollar o'rniga natijalar, oxirida profil (Manager paneldagi naqsh).
  const mobileNavItems = [
    navItems.find(n => n.key === 'home'),
    navItems.find(n => n.key === 'students'),
    navItems.find(n => n.key === 'olympiads'),
    navItems.find(n => n.key === 'results'),
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
  const loadResultsPage = (olympiadBackendId, pageNum) => {
    setResultsModal(m => ({ ...m, loading: true }));
    OlympyApi.getLeaderboardForOlympiad(olympiadBackendId, pageNum, RESULTS_PAGE_SIZE, OlympyApi.getToken())
      .then(res => {
        setResultsModal(m => ({
          ...m,
          data: Array.isArray(res?.entries) ? res.entries : [],
          total: res?.pagination?.total ?? (Array.isArray(res?.entries) ? res.entries.length : 0),
          page: pageNum,
          loading: false,
        }));
      })
      .catch(err => {
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
      open: true, studentName: row.name || "O'quvchi", data: null, loading: true, error: '',
    });
    OlympyApi.getEventUserAnswers(olympiadBackendId, userId, OlympyApi.getToken())
      .then(res => {
        setStudentReviewModal(m => ({
          ...m,
          data: res || null,
          studentName: res?.student_name || m.studentName,
          loading: false,
        }));
      })
      .catch(err => {
        console.warn('getEventUserAnswers failed:', err);
        setStudentReviewModal(m => ({
          ...m,
          loading: false,
          error: OlympyApi.toUserMessage?.(err) || "Javoblarni yuklab bo'lmadi",
        }));
      });
  };

  const renderHome = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in mobile-content-pad">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white">{centerName}</h2>
          <p className="text-white/40 text-sm">{centerType} · Ustoz paneli · tadbirlar va savollar</p>
        </div>
        <button onClick={openCreateEvent} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={16} /> Tadbir yaratish
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Jami tadbirlar" value={olympiads.length} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Faol tadbirlar" value={activeEvents.length} icon={<Icon name="bolt" size={20} />} color="from-emerald-500 to-teal-600" />
        <StatCard label="Savollar" value={questions.length} icon={<Icon name="book" size={20} />} color="from-indigo-500 to-purple-600" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white">Oxirgi tadbirlar</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400">Ko'rish</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 4).map(o => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl glass p-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}><Icon name="trophy" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{o.title}</div>
                  <div className="text-xs text-white/40">{eventTypeLabel(o.eventType || 'competition')} · {o.subject}{o.testLevel ? ` · ${o.testLevel}` : ''}{o.testType ? ` · ${testTypeLabel(o.testType)}` : ''} · {o.startDate || 'Sana yoq'}</div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ))}
            {olympiads.length === 0 && <div className="text-sm text-white/40">Hali tadbir yo'q</div>}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white">Savollar bazasi</h3>
            <button onClick={() => setPage('questions')} className="text-xs text-indigo-400">Savol yaratish</button>
          </div>
          <div className="space-y-3">
            {questions.slice(0, 4).map(q => (
              <div key={q.id} className="rounded-xl glass p-3">
                <div className="line-clamp-2 text-sm text-white/80"><MathText text={q.text} /></div>
                <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
                  <SubjectBadge subject={q.subject} />
                  <span>{testTypeLabel(inferQuestionTestType(q))}</span>
                  <span>{q.score || 0} ball</span>
                </div>
              </div>
            ))}
            {questions.length === 0 && <div className="text-sm text-white/40">Hali savol yo'q</div>}
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
            <h2 className="text-xl font-black text-white">O'quvchilar</h2>
            <p className="text-white/40 text-sm">{centerName} · markaz o'quvchilari va natijalari</p>
          </div>
          <div className="rounded-xl glass px-4 py-2 text-sm font-bold text-white">
            Jami: <span className="text-indigo-300">{teacherStudents.length}</span>
          </div>
        </div>

        {loading && (
          <div className="text-center py-10 text-white/40 text-sm">Yuklanmoqda...</div>
        )}

        {!loading && teacherStudents.length === 0 && (
          <EmptyState
            icon="users"
            title="O'quvchilar yo'q"
            desc="Markazingizga o'quvchilar qo'shilgach, ular shu yerda ko'rinadi"
          />
        )}

        {!loading && teacherStudents.length > 0 && (
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            {/* Sarlavha — faqat desktop. */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 border-b border-white/10 text-xs font-bold uppercase tracking-wide text-white/40">
              <div className="col-span-5">Ism familiya</div>
              <div className="col-span-4">Telefon</div>
              <div className="col-span-2 text-center">O'rtacha ball</div>
              <div className="col-span-1 text-center">Urinish</div>
            </div>
            <div className="divide-y divide-white/5">
              {teacherStudents.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedStudent(s)}
                  className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center cursor-pointer hover:bg-white/[0.04] transition-colors"
                >
                  <div className="col-span-12 md:col-span-5 flex items-center gap-3 min-w-0">
                    <Avatar name={s.full_name} size={34} />
                    <div className="font-semibold text-white truncate">{s.full_name || 'Foydalanuvchi'}</div>
                  </div>
                  <div className="col-span-6 md:col-span-4 text-sm text-white/55 truncate">
                    <span className="md:hidden text-white/30">Tel: </span>{s.phone || '—'}
                  </div>
                  <div className="col-span-3 md:col-span-2 md:text-center">
                    <span className="inline-block rounded-lg bg-indigo-500/15 px-2.5 py-1 text-sm font-bold text-indigo-300">{s.avg_score || 0}</span>
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right md:text-center text-sm font-semibold text-white/60">{s.attempts || 0}</div>
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
          <h2 className="text-xl font-black text-white">Tadbirlar</h2>
          <p className="text-white/40 text-sm">{centerName} · olimpiada va musobaqalar</p>
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
            <div key={o.id} className="glass rounded-2xl p-5 border border-white/10">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  <Icon name="trophy" size={20} />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="font-bold text-white">{o.title}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                    <SubjectBadge subject={o.subject} />
                    <span className={`rounded-lg px-2 py-1 font-bold ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{eventTypeLabel(o.eventType || 'competition')}</span>
                    {o.testLevel && <span className="rounded-lg bg-violet-500/15 px-2 py-1 font-bold text-violet-300">Daraja: {o.testLevel}</span>}
                    {o.testType && <span className="rounded-lg bg-sky-500/15 px-2 py-1 font-bold text-sky-300">Tur: {testTypeLabel(o.testType)}</span>}
                    <span>{o.startDate || "Sana yo'q"} {o.startTime || ''}</span>
                    <span>{o.duration || 60} min</span>
                    <span>{assignedCount} ta savol</span>
                    {isApi && (
                      <span className="flex items-center gap-1 text-white/55">
                        <Icon name="users" size={12} /> {participantsMap[String(o.backendId ?? o.id)] || 0} ishtirokchi
                      </span>
                    )}
                  </div>
                  {needsReadiness && (
                    <div className={`rounded-xl px-3 py-2 border text-xs ${isReady ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-amber-500/10 border-amber-500/25 text-amber-300'}`}>
                      <div className="flex items-center gap-2 font-semibold">
                        <Icon name={isReady ? 'check' : 'info'} size={13} />
                        {isReady ? 'Faollashtirishga tayyor' : 'Tayyor emas'}
                      </div>
                      {!isReady && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {issues.slice(0, 3).map(issue => (
                            <span key={issue} className="rounded-lg bg-black/15 px-2 py-1">{issue}</span>
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
                      className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-1">
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
            title="Tadbirlar yo'q"
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
        <h2 className="text-lg md:text-xl font-black text-white">Natijalar</h2>
        {apiLoading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <StatCard label="O'rtacha ball" value={avgVal} icon={<Icon name="chart" size={18} />} color="from-indigo-500 to-purple-600" />
          <StatCard label="Eng yuqori" value={bestVal} icon={<Icon name="trophy" size={18} />} color="from-amber-500 to-orange-500" />
          <StatCard label="Qatnashuvchilar" value={participantsVal} icon={<Icon name="users" size={18} />} color="from-cyan-500 to-blue-600" />
        </div>
        <div className="glass rounded-2xl p-4 sm:p-5">
          <h3 className="font-bold text-white mb-4">Tadbir natijalari</h3>
          {isApi && apiEvents.length > 0 && apiEvents.filter(e => (e.participants || 0) > 0).map(e => (
            <div key={e.olympiad_id} className="p-4 glass rounded-xl mb-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white break-words">{e.title}</div>
                  <div className="text-xs text-white/40 mt-0.5">{e.subject} · {e.participants} ishtirokchi · eng yuqori {e.best_score}%</div>
                </div>
                <DonutChart value={Math.round(e.average_score || 0)} size={56} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
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
                <div className="flex-1 min-w-0"><div className="font-semibold text-white break-words">{o.title}</div><div className="text-xs text-white/40 mt-0.5">{[o.testLevel, testTypeLabel(o.testType)].filter(Boolean).join(' · ')}{(o.testLevel || o.testType) ? ' · ' : ''}{o.participants || 0} ishtirokchi</div></div>
                <DonutChart value={o.avgScore || 0} size={56} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                <button onClick={() => openResultsModal(o)} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"><Icon name="eye" size={12} /> Ko'rish</button>
                <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1"><Icon name="trophy" size={12} /> Reyting</button>
              </div>
            </div>
          ))}
          {((isApi && apiEvents.filter(e => (e.participants || 0) > 0).length === 0)
            || (!isApi && localFinished.length === 0)) && (
            <div className="text-sm text-white/40 px-3 py-2">Hali natijasi bor tadbirlar yo'q</div>
          )}
        </div>
      </div>
    );
  };

  const pagesMap = {
    home: renderHome,
    students: renderStudents,
    olympiads: renderOlympiads,
    results: renderResults,
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
        logoClick={() => onNavigate('landing')}
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
                      className={`p-4 rounded-2xl text-left border transition-all ${selected ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'}`}>
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <span className={`w-2.5 h-2.5 rounded-full ${selected ? 'bg-indigo-400' : 'bg-white/20'}`}></span>
                        {opt.label}
                      </div>
                      <div className="text-xs text-white/40 mt-1">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Tadbir nomi</label>
                <input className="input-field"
                  placeholder={newEvent.eventType === 'olympiad' ? 'Matematika Olimpiadasi — May 2026' : 'Ichki matematika musobaqasi'}
                  value={newEvent.title}
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Fan kategoriyasi</label>
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
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Davomiyligi (min)</label>
                  <input type="number" min="1" className="input-field" value={newEvent.duration}
                    onChange={e => setNewEvent({ ...newEvent, duration: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish sanasi</label>
                  <input type="date" className="input-field" value={newEvent.startDate}
                    onChange={e => setNewEvent({ ...newEvent, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish vaqti</label>
                  <input type="time" className="input-field" value={newEvent.startTime}
                    onChange={e => setNewEvent({ ...newEvent, startTime: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Daraja <span className="text-white/35">(ixtiyoriy)</span></label>
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
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Test turi <span className="text-white/35">(ixtiyoriy)</span></label>
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

              <div className={`rounded-2xl p-4 border text-xs ${formIssues.length ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon name={formIssues.length ? 'info' : 'check'} size={14} />
                  {formIssues.length ? "To'ldirilishi kerak" : "Asosiy ma'lumotlar tayyor"}
                </div>
                {formIssues.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formIssues.map(issue => <span key={issue} className="rounded-lg bg-black/15 px-2 py-1">{issue}</span>)}
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
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-200 flex items-start gap-3">
                <Icon name="check" size={18} className="mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-bold text-white mb-1">Hamma asosiy ma'lumotlar tayyor</div>
                  <div className="text-emerald-200/80">Tasdiqlasangiz tadbir faol bo'ladi va o'quvchilar belgilangan vaqtda kirishi mumkin.</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-white/35 mb-1">Turi</div>
                  <div className="font-bold text-white">{eventTypeLabel(liveEvent.eventType || 'competition')}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-white/35 mb-1">Fan</div>
                  <div className="font-bold text-white">{liveEvent.subject}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-white/35 mb-1">Boshlanish</div>
                  <div className="font-bold text-white">{liveEvent.startDate} {liveEvent.startTime || ''}</div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-xs text-white/35 mb-1">Test</div>
                  <div className="font-bold text-white">{questionCount} ta savol · {liveEvent.duration} min{liveEvent.testLevel ? ` · ${liveEvent.testLevel}` : ''}{liveEvent.testType ? ` · ${testTypeLabel(liveEvent.testType)}` : ''}</div>
                </div>
              </div>
              <div className="text-white font-bold">{liveEvent.title}</div>
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
              <div className="text-sm text-white/60">{liveEvent.title} — {liveEvent.subject}</div>
              <div className="text-xs text-white/40">
                Tayinlangan: <span className="text-white">{assigned.size}</span>
                {assignmentLevel ? (
                  <span> / {filteredCount} ta mos savol ({questions.length} tadan)</span>
                ) : (
                  <span> / {questions.length} ta mavjud</span>
                )}
              </div>
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3.5 space-y-2">
                <label className="block text-xs text-violet-200 mb-1 font-semibold">Tadbir darajasi (Test Level) <span className="text-white/35">(ixtiyoriy)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {(liveEvent.subject === 'Ingliz tili'
                    ? ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced']
                    : ['Beginner', "O'rta", 'Advanced']
                  ).map(level => (
                    <button key={level} type="button" onClick={() => setAssignmentLevel(level)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${assignmentLevel === level ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'}`}>
                      {level}
                    </button>
                  ))}
                  {assignmentLevel && (
                    <button type="button" onClick={() => setAssignmentLevel('')}
                      className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-bold text-white/45 hover:bg-white/10 hover:text-white">
                      Tozalash (Barchasi)
                    </button>
                  )}
                </div>
                <div className="text-xs text-white/50 pt-1">
                  {assignmentLevel ? (
                    <span>Tanlangan <strong>{assignmentLevel}</strong> darajasiga mos keluvchi savollar ko'rsatilmoqda. Saqlash bosilganda tadbir darajasi ham shunga yangilanadi.</span>
                  ) : (
                    <span>Tadbir darajasi belgilanmagan. Barcha darajadagi savollar ko'rsatilmoqda.</span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl border border-white/5 bg-white/5 cursor-pointer hover:bg-white/10 transition-all select-none">
                <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)}
                  className="rounded border-white/20 bg-black/20 text-violet-500 focus:ring-violet-500/20" />
                <span className="text-xs text-white/80 font-semibold">Faqat boshqa tadbirlarga ulanmagan savollarni ko'rsatish</span>
              </label>

              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-sky-200 font-semibold">Tadbir test turi (Test Type)</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-lg font-bold ${
                    assignmentType ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/60'
                  }`}>
                    {testTypeLabel(assignmentType) || 'Belgilanmagan'}
                  </span>
                </div>
                <div className="text-xs text-white/50">
                  {assignmentType ? (
                    <span>Tanlangan savollar {testTypeLabel(assignmentType)} turiga mos kelishi kerak. Test turini o'zgartirish uchun tadbirni tahrirlang.</span>
                  ) : (
                    <span>Tadbir test turi belgilanmagan.</span>
                  )}
                </div>
                {selectedQuestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {Object.entries(selectedTypeCounts).map(([type, count]) => (
                      <span key={type} className="rounded-lg bg-black/15 px-2 py-1 text-sky-100">{testTypeLabel(type)}: {count}</span>
                    ))}
                  </div>
                )}
                {typeMismatches.length > 0 && (
                  <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {typeMismatches.length} ta tanlangan savol {testTypeLabel(assignmentType)} turiga mos emas. Mos savollarni tanlang yoki tadbir test turini Aralash qiling.
                  </div>
                )}
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {subjectQs.length > 0 && (
                  <div className="flex items-center justify-between mt-1 mb-0.5">
                    <div className="text-xs text-white/40 font-medium uppercase tracking-wider">Tegishli fan savollari</div>
                    <button
                      type="button"
                      onClick={toggleAllSubjectQs}
                      className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      {subjectQs.every(q => assigned.has(q.id)) ? "Barchasini o'chirish" : "Barchasini tanlash"}
                    </button>
                  </div>
                )}
                {subjectQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white whitespace-pre-wrap"><MathText text={q.text} /></div>
                      <div className="text-xs text-white/40 mt-1">
                        {testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball · {q.source}
                        {otherOlympiadQuestionIds.has(String(q.id)) && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium font-sans">Boshqa tadbirda</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
                {otherQs.length > 0 && <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-3">Boshqa fan savollari</div>}
                {otherQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5 opacity-70">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white whitespace-pre-wrap"><MathText text={q.text} /></div>
                      <div className="text-xs text-white/40 mt-1">
                        {q.subject} · {testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball
                        {otherOlympiadQuestionIds.has(String(q.id)) && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-medium font-sans">Boshqa tadbirda</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
                {questions.length > 0 && subjectQs.length === 0 && otherQs.length === 0 && (
                  <div className="text-sm text-white/40 text-center py-6">Tanlangan darajaga mos savollar topilmadi.</div>
                )}
                {questions.length === 0 && (
                  <div className="text-sm text-white/40 text-center py-6">Bu markaz uchun savollar yaratilmagan. <br/>Savollar bo'limidan boshlang.</div>
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
              <div className="text-sm text-white/70">
                Ushbu tadbirni o'chirishni tasdiqlaysizmi? Bu amalni ortga qaytarib bo'lmaydi.
              </div>
              <div className="glass rounded-xl p-3 border border-white/5">
                <div className="text-xs text-white/35 mb-0.5">Tadbir nomi</div>
                <div className="font-bold text-white text-sm truncate">{event.title}</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setDeleteEventId(null)} disabled={eventSaving}
                  className="btn-ghost flex-1 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50">Yo'q</button>
                <button onClick={deleteEvent} disabled={eventSaving}
                  className="rounded-xl bg-rose-500 text-white hover:bg-rose-600 flex-1 py-2.5 text-xs font-bold disabled:opacity-50 transition-colors">
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
          const scoreTone = (pct) => {
            if (pct >= 90) return { text: 'text-emerald-300', bar: 'from-emerald-500 to-emerald-400', track: 'bg-emerald-500/10', ring: 'border-emerald-500/25' };
            if (pct >= 70) return { text: 'text-indigo-300', bar: 'from-indigo-500 to-violet-400', track: 'bg-indigo-500/10', ring: 'border-indigo-500/25' };
            if (pct >= 50) return { text: 'text-amber-300', bar: 'from-amber-500 to-amber-400', track: 'bg-amber-500/10', ring: 'border-amber-500/25' };
            return { text: 'text-rose-300', bar: 'from-rose-500 to-rose-400', track: 'bg-rose-500/10', ring: 'border-rose-500/25' };
          };
          const rankMedal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null);

          return (
            <div className="space-y-5 -mt-2">
              {/* ── Header: tadbir ma'lumotlari + statistik kartalar ── */}
              <div className="glass rounded-2xl p-4 sm:p-5 border border-white/5">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-base sm:text-lg font-bold text-white leading-tight break-words">
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
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-white/35 font-bold">Ishtirokchilar</div>
                    <div className="text-lg font-black text-white mt-0.5">{resultsModal.total}</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
                    <div className="text-[10px] uppercase tracking-wide text-white/35 font-bold">O'rtacha ball</div>
                    <div className={`text-lg font-black mt-0.5 ${avgScore == null ? 'text-white/40' : scoreTone(avgScore).text}`}>
                      {avgScore == null ? '—' : `${avgScore}%`}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5 col-span-2 sm:col-span-1">
                    <div className="text-[10px] uppercase tracking-wide text-white/35 font-bold">Sahifa</div>
                    <div className="text-lg font-black text-white mt-0.5">{resultsModal.page} <span className="text-sm text-white/30 font-bold">/ {lastPage}</span></div>
                  </div>
                </div>
              </div>

              {/* ── Loading skeleton ── */}
              {resultsModal.loading && (
                <div className="rounded-2xl border border-white/5 overflow-hidden">
                  <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-white/[0.03] text-[10px] uppercase tracking-wide text-white/35 font-bold">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-4">O'quvchi</div>
                    <div className="col-span-2 text-center">To'g'ri / Jami</div>
                    <div className="col-span-3">Ball</div>
                    <div className="col-span-2 text-center">Holat</div>
                  </div>
                  <div className="divide-y divide-white/5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                        <div className="h-6 w-6 rounded-md bg-white/10 flex-shrink-0" />
                        <div className="h-4 rounded bg-white/10 flex-1 max-w-[40%]" />
                        <div className="h-4 w-16 rounded bg-white/10" />
                        <div className="h-2.5 flex-1 rounded-full bg-white/10" />
                        <div className="h-5 w-20 rounded-md bg-white/10" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bo'sh holat ── */}
              {!resultsModal.loading && rows.length === 0 && (
                <div className="glass rounded-2xl p-10 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm text-white/40">Bu tadbirda hali ishtirokchi natijalari yo'q.</div>
                </div>
              )}

              {/* ── Natijalar jadvali ── */}
              {!resultsModal.loading && rows.length > 0 && (
                <div className="rounded-2xl border border-white/5 overflow-hidden">
                  <div className="max-h-[58vh] overflow-y-auto">
                    {/* Sticky sarlavha qatori (desktop) */}
                    <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 sticky top-0 z-10 bg-[#15171f]/95 backdrop-blur-sm border-b border-white/10 text-[10px] uppercase tracking-wide text-white/40 font-bold">
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
                        const medal = rankMedal(row.rank);
                        return (
                          <div
                            key={row.attempt_id ?? idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => openStudentReview(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStudentReview(row); } }}
                            title="Javoblarini ko'rish"
                            className={`animate-in flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-x-2 md:gap-y-0 md:items-center px-3 md:px-4 py-3 border-b border-white/[0.04] transition-colors cursor-pointer hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none ${
                              dq
                                ? 'bg-white/[0.015] opacity-60'
                                : idx % 2 === 1
                                  ? 'bg-white/[0.02]'
                                  : ''
                            }`}
                          >
                            {/* Rank (desktop ustun) */}
                            <div className="hidden md:flex md:col-span-1 justify-center">
                              {dq ? (
                                <span className="text-white/25 text-sm">—</span>
                              ) : medal ? (
                                <span className="text-xl leading-none" title={`${row.rank}-o'rin`}>{medal}</span>
                              ) : (
                                <span className="inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-white/5 text-xs font-bold text-white/50">
                                  {row.rank}
                                </span>
                              )}
                            </div>

                            {/* Mobil: 1-qator → rank + ism (chap) | ball foizi (o'ng) */}
                            <div className="flex items-center gap-2 md:contents">
                              <span className="md:hidden flex-shrink-0">
                                {dq ? (
                                  <span className="text-white/25 text-xs">—</span>
                                ) : medal ? (
                                  <span className="text-lg leading-none">{medal}</span>
                                ) : (
                                  <span className="inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-md bg-white/5 text-[10px] font-bold text-white/45">{row.rank}</span>
                                )}
                              </span>
                              {/* O'quvchi */}
                              <div className="min-w-0 flex-1 md:col-span-4 flex items-center">
                                <span className={`text-sm font-semibold truncate ${dq ? 'text-white/45 line-through' : 'text-white'}`}>
                                  {row.name || '—'}
                                </span>
                              </div>
                              {/* Mobil: ball foizi (o'ngga) */}
                              <span className={`md:hidden flex-shrink-0 text-sm font-black tabular-nums ${dq ? 'text-white/40' : tone.text}`}>{pct}%</span>
                            </div>

                            {/* Mobil: 2-qator → Natija + Holat (bir qator) + progress bar (pastda) */}
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 pl-7 md:contents md:pl-0">
                              {/* To'g'ri / Jami */}
                              <div className="flex items-center flex-shrink-0 md:col-span-2 md:justify-center">
                                <span className="text-sm font-bold text-emerald-300">{correct}</span>
                                <span className="text-sm text-white/40">/{total}</span>
                                {wrong > 0 && (
                                  <span className="ml-1.5 text-[11px] font-semibold text-rose-300/80">−{wrong}</span>
                                )}
                              </div>

                              {/* Ball — progress bar (desktop'da foiz bilan) */}
                              <div className="md:col-span-3 flex items-center gap-2.5 flex-1 md:flex-none order-3 md:order-none w-full md:w-auto basis-full md:basis-auto">
                                <div className={`hidden md:block flex-1 h-2 rounded-full overflow-hidden ${tone.track}`}>
                                  <div className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                                <span className={`hidden md:inline text-sm font-black tabular-nums ${dq ? 'text-white/40' : tone.text}`}>{pct}%</span>
                                {/* Mobil progress bar (to'liq qatorda, pastda) */}
                                <div className={`md:hidden flex-1 h-1.5 rounded-full overflow-hidden ${tone.track}`}>
                                  <div className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                </div>
                              </div>

                              {/* Holat */}
                              <div className="flex-shrink-0 md:col-span-2 md:text-center">
                                {dq ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/25">
                                    <Icon name="info" size={11} /> DQ
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
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
                  <div className="px-3 py-2 rounded-xl bg-white/5 text-[11px] font-bold text-white/60 tabular-nums">
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
              <div className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center flex-shrink-0">
                  <Icon name="user" size={18} className="text-indigo-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{studentReviewModal.studentName || "O'quvchi"}</div>
                  {review && (
                    <div className="text-[11px] text-white/45 mt-0.5">
                      To'g'ri: <span className="text-emerald-300 font-semibold">{review.correct_count ?? 0}</span>
                      {' · '}Xato: <span className="text-rose-300 font-semibold">{review.wrong_count ?? 0}</span>
                      {' · '}Ball: <span className="text-white/70 font-semibold">{review.score ?? 0}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Loading */}
              {studentReviewModal.loading && (
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/[0.04] border border-white/5 animate-pulse" />
                  ))}
                </div>
              )}

              {/* Xato */}
              {!studentReviewModal.loading && studentReviewModal.error && (
                <div className="glass rounded-2xl p-8 text-center border border-rose-500/15">
                  <div className="text-3xl mb-2">⚠️</div>
                  <div className="text-sm text-rose-200/80">{studentReviewModal.error}</div>
                </div>
              )}

              {/* Bo'sh */}
              {!studentReviewModal.loading && !studentReviewModal.error && review && (review.questions || []).length === 0 && (
                <div className="glass rounded-2xl p-8 text-center">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm text-white/40">Bu tadbirda savollar topilmadi.</div>
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
                      ? 'bg-emerald-500/[0.07] border-emerald-500/25'
                      : wrong
                        ? 'bg-rose-500/[0.07] border-rose-500/25'
                        : 'bg-white/[0.03] border-white/10';
                    const chosenTxt = renderChosen(q);
                    const correctTxt = renderCorrect(q);
                    return (
                      <div key={q.id ?? i} className={`rounded-xl p-3 sm:p-3.5 border ${tone}`}>
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex h-6 min-w-6 px-1.5 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold text-white/60 flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-white/90 font-medium break-words leading-snug whitespace-pre-wrap">
                              {q.text ? <MathText text={q.text} /> : '—'}
                            </div>
                            <div className="mt-2 space-y-1">
                              {/* O'quvchining javobi */}
                              <div className="text-[12px] flex flex-wrap gap-x-1.5">
                                <span className="text-white/40">Javobi:</span>
                                <MathText className={`font-semibold break-words ${correct ? 'text-emerald-200' : wrong ? 'text-rose-200' : 'text-white/70'}`} text={chosenTxt} />
                              </div>
                              {/* To'g'ri javob — faqat xato bo'lsa va mavjud bo'lsa ko'rsatamiz */}
                              {wrong && correctTxt && (
                                <div className="text-[12px] flex flex-wrap gap-x-1.5">
                                  <span className="text-white/40">To'g'ri javob:</span>
                                  <MathText className="font-semibold text-emerald-200 break-words" text={correctTxt} />
                                </div>
                              )}
                              {/* Essay/kod baholanmagan bo'lsa izoh */}
                              {q.is_correct === null && (
                                <div className="text-[11px] text-amber-300/80">
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
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white text-2xl">⭐</div>
          <p className="text-sm text-white/75 leading-relaxed">{premiumModal}</p>
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
                className="btn-ghost flex-1 py-3 rounded-xl border border-white/10 text-white/50 cursor-not-allowed"
                disabled
                title="Premium faqat direktor (tashkilot egasi) hisobidan sotib olinadi"
              >
                Faqat direktor sotib oladi
              </button>
            )}
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>
      )}
    </div>
  );
};

Object.assign(window, { TeacherDashboard });
