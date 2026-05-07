// pages/ManagerDashboard.jsx

const ManagerDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [createModal, setCreateModal] = React.useState(false);
  const [telegramLink, setTelegramLink] = React.useState(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = React.useState(false);
  const [telegramLinked, setTelegramLinked] = React.useState(!!user?.telegramLinked);
  const emptyOlympiadForm = { eventType: 'competition', title: '', subject: 'Matematika', startDate: '', startTime: '10:00', duration: 60, maxScore: 100, status: 'draft' };
  const [newOlympiad, setNewOlympiad] = React.useState(emptyOlympiadForm);
  const [editingOlympiadId, setEditingOlympiadId] = React.useState(null);
  const [activateConfirm, setActivateConfirm] = React.useState(null);
  const [eventSaving, setEventSaving] = React.useState(false);
  const [assignModal, setAssignModal] = React.useState(null);
  const [toast, setToast] = React.useState('');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [pendingStudents, setPendingStudents] = React.useState([]);
  const [approvedStudents, setApprovedStudents] = React.useState([]);
  const [studentDetailMembership, setStudentDetailMembership] = React.useState(null);
  const [studentDetail, setStudentDetail] = React.useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = React.useState(false);
  const [studentDetailError, setStudentDetailError] = React.useState('');
  const [assignedQuestionIds, setAssignedQuestionIds] = React.useState([]);
  const [assignmentLevel, setAssignmentLevel] = React.useState('');
  const [assignmentType, setAssignmentType] = React.useState('');
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);
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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

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
      loadApprovedStudents().catch(err => {
        if (!cancelled) {
          console.warn('getStudentMemberships failed:', err);
          setApprovedStudents([]);
        }
      });
    };
    refresh();
    const intervalId = isApi && managerCenterId ? setInterval(refresh, 15000) : null;
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isApi, managerCenterId, loadPendingStudents, loadApprovedStudents]);

  React.useEffect(() => {
    setAssignedQuestionIds(assignModal?.questionIds || []);
    setAssignmentLevel(assignModal?.testLevel || '');
    setAssignmentType(assignModal?.testType || '');
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

  const baseCenters = isApi ? (apiCenters || []) : store.centers;
  const center = managerCenterId ? baseCenters.find(c => String(c.id) === String(managerCenterId)) : null;
  const centerId = center?.id;
  const centerName = center?.name || 'Tashkilot';
  const centerType = center?.organizationType || "O'quv markaz";

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

  // Live student-join requests at this center
  const mockRequests = store.requests.filter(r => r.type === 'student' && r.centerId === centerId).map(r => {
    const u = store.users.find(x => x.id === r.userId);
    return {
      id: r.id,
      name: u?.name || '—',
      phone: u?.phone || '—',
      avatarUrl: u?.avatarUrl || '',
      date: r.date,
      subject: u?.roles?.student?.subject || r.subject || '—',
      approvalCode: '',
      status: statusLabel(r.status),
      _raw: r,
    };
  });
  const apiRequests = pendingStudents.map(m => ({
    id: `api:student:${m.membership_id}`,
    name: m.user?.full_name || m.user?.name || '—',
    phone: m.user?.normalized_phone || m.user?.phone || '—',
    avatarUrl: m.user?.avatar_url || m.user?.avatarUrl || '',
    date: (m.created_at || '').slice(0, 10),
    subject: m.subject || '—',
    approvalCode: m.approval_code || '',
    status: 'Kutilmoqda',
    _raw: m,
  }));
  const requests = isApi ? apiRequests : mockRequests;

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

  const closeStudentDetail = () => {
    setStudentDetailMembership(null);
    setStudentDetail(null);
    setStudentDetailError('');
  };

  const handleRequest = (id, action, raw) => {
    if (isApi) {
      const token = OlympyApi.getToken();
      const requestRow = raw || requests.find(r => r.id === id)?._raw;
      const membershipId = requestRow?.membership_id ?? requestRow?.membershipId ?? requestRow?.backendId;
      if (!membershipId || !centerId) {
        showToast('⚠ API rejimida ariza ma\'lumoti yetarli emas');
        return;
      }
      const backendCenterId = center?.backendId ?? centerId;
      OlympyApi.approveStudent(
        backendCenterId,
        { membership_id: membershipId, decision: action === 'approve' ? 'approved' : 'rejected' },
        token,
      )
        .then(() => loadPendingStudents())
        .then(() => showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi'))
        .catch(err => { console.warn('approveStudent failed:', err); showToast("⚠ Tasdiqlab bo'lmadi"); });
      return;
    }
    if (action === 'approve') OlympyStore.approveRequest(id);
    else OlympyStore.rejectRequest(id);
    showToast(action === 'approve' ? '✓ Ariza tasdiqlandi' : '✗ Ariza rad etildi');
  };

  const pendingCount = requests.filter(r => r.status === 'Kutilmoqda').length;
  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'requests', icon: 'bell', label: 'Arizalar', badge: pendingCount || undefined },
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'students', icon: 'users', label: "O'quvchilar" },
    { key: 'results', icon: 'chart', label: 'Natijalar' },
  ];

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
          showToast(`⚠ ${eventErrorMessage(err)}`);
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

  const renderHome = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{centerName}</h2>
          <p className="text-white/40 text-sm">{centerType} · Manager paneli · {new Date().toLocaleDateString('uz-UZ')}</p>
        </div>
        <button onClick={openCreateEvent} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={16} /> Tadbir yaratish
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Kutilayotgan arizalar" value={pendingCount} sub={pendingCount > 0 ? 'Yangi' : ''} icon={<Icon name="bell" size={20} />} color="from-rose-500 to-pink-600" glow="glow-blue" />
        <StatCard label="Faol tadbirlar" value={olympiads.filter(o => o.status === 'active').length} icon={<Icon name="trophy" size={20} />} color="from-amber-500 to-orange-500" />
        <StatCard label="Jami tadbirlar" value={olympiads.length} icon={<Icon name="bolt" size={20} />} color="from-emerald-500 to-teal-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-5 border border-amber-500/20">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-white">O'quvchi arizalari</h3>
            <button onClick={() => setPage('requests')} className="text-xs text-indigo-400">Barchasi</button>
          </div>
          <div className="space-y-2">
            {requests.filter(r => r.status === 'Kutilmoqda').slice(0, 3).map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <Avatar name={r.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white">{r.name}</div>
                  <div className="text-xs text-white/40">{r.date} · {r.subject}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleRequest(r.id, 'approve')} className="btn-success text-xs px-3 py-1.5 rounded-lg">✓</button>
                  <button onClick={() => handleRequest(r.id, 'reject')} className="btn-danger text-xs px-3 py-1.5 rounded-lg">✗</button>
                </div>
              </div>
            ))}
            {pendingCount === 0 && <div className="text-sm text-white/40 px-3 py-2">Yangi arizalar yo'q</div>}
          </div>
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Tadbirlar</h3>
            <button onClick={() => setPage('olympiads')} className="text-xs text-indigo-400">Ko'rish</button>
          </div>
          <div className="space-y-3">
            {olympiads.slice(0, 3).map(o => (
              <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${o.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : o.status === 'inactive' ? 'bg-amber-500/20 text-amber-300' : o.status === 'draft' ? 'bg-white/10 text-white/40' : 'bg-indigo-500/20 text-indigo-400'}`}>
                  <Icon name={o.status === 'active' ? 'trophy' : o.status === 'inactive' ? 'clock' : o.status === 'draft' ? 'edit' : 'check'} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{o.title}</div>
                  <div className="text-xs text-white/40">{[o.testLevel, testTypeLabel(o.testType)].filter(Boolean).join(' · ')}{(o.testLevel || o.testType) ? ' · ' : ''}{o.participants || 0} ishtirokchi</div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ))}
            {olympiads.length === 0 && <div className="text-sm text-white/40">Hali tadbir yo'q</div>}
          </div>
        </div>
      </div>
    </div>
  );

  const renderStudents = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">O'quvchilar ({students.length})</h2>
        <div className="relative"><Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" /><input className="input-field pl-10 py-2" placeholder="Qidirish..." /></div>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {["O'quvchi", 'Telefon', 'Tadbirlar', "O'rt. ball", 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={s.name} src={s.avatarUrl || ''} size={32} /><div><div className="text-sm font-medium text-white">{s.name}</div><div className="text-xs text-white/40">{s.joined}</div></div></div></td>
                <td className="px-4 py-3 text-sm text-white/60">{s.phone.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2')}</td>
                <td className="px-4 py-3 text-sm text-white">{s.olympiads}</td>
                <td className="px-4 py-3"><span className={`font-bold text-sm ${s.avgScore >= 90 ? 'text-emerald-400' : s.avgScore >= 70 ? 'text-indigo-400' : 'text-amber-400'}`}>{s.avgScore || 0}%</span></td>
                <td className="px-4 py-3"><Badge status={s.status} /></td>
                <td className="px-4 py-3"><button onClick={() => openStudentDetail(s)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Ko'rish</button></td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40 text-sm">Tasdiqlangan o'quvchilar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderRequests = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Arizalar</h2>
        <div className="flex items-center gap-2 text-sm text-white/40">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          {pendingCount} ta kutilmoqda
        </div>
      </div>

      <div className="glass rounded-2xl p-5 border border-indigo-500/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl" style={{ background: '#2b5278' }}><div className="w-full h-full flex items-center justify-center text-white font-bold text-sm rounded-xl">TG</div></div>
          <div>
            <div className="text-sm font-bold text-white">Telegram Bot Integratsiya</div>
            <div className="text-xs text-white/40">Yangi o'quvchi arizalari botga avtomatik boradi</div>
          </div>
          <div className={`ml-auto flex items-center gap-1.5 text-xs ${telegramLinked ? 'text-emerald-400' : 'text-amber-300'}`}>
            <span className={`w-2 h-2 rounded-full ${telegramLinked ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'}`}></span>
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
              <a href={telegramLink.telegram_deep_link} target="_blank" rel="noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200">
                Telegram botni ochish
              </a>
            )}
            <span className="text-xs text-white/40">Ulanmaguncha arizalar faqat sayt ichida ko'rinadi.</span>
          </div>
        )}
        {telegramLinked && (
          <div className="text-xs text-emerald-300 flex items-center gap-2">
            <Icon name="check" size={13} /> Botdagi tasdiq saytdagi ariza holatini ham avtomatik yangilaydi.
          </div>
        )}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-white/5">
            {['O\'quvchi', 'Telefon', 'Ariza sanasi', 'Fan', 'Kod', 'Holat', 'Amal'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-white/40 font-medium">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} className="table-row">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={r.name} src={r.avatarUrl || ''} size={32} /><span className="text-sm font-medium text-white">{r.name}</span></div></td>
                <td className="px-4 py-3 text-sm text-white/60">{r.phone.replace ? r.phone.replace(/(\+998\d{2})\d{3}(\d{4})/, '$1***$2') : r.phone}</td>
                <td className="px-4 py-3 text-sm text-white/60">{r.date}</td>
                <td className="px-4 py-3">{r.subject && r.subject !== '—' ? <SubjectBadge subject={r.subject} /> : <span className="text-xs text-white/30">—</span>}</td>
                <td className="px-4 py-3 text-xs font-mono text-white/50">{r.approvalCode || '—'}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status === 'Kutilmoqda' ? (
                    <div className="flex gap-2">
                      <button onClick={() => handleRequest(r.id, 'approve')} className="btn-success text-xs px-3 py-1.5 rounded-xl">Tasdiqlash</button>
                      <button onClick={() => handleRequest(r.id, 'reject')} className="btn-danger text-xs px-3 py-1.5 rounded-xl">Rad etish</button>
                    </div>
                  ) : <span className="text-xs text-white/30">—</span>}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-white/40 text-sm">Arizalar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOlympiads = () => (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-white">Tadbirlar</h2>
        <button onClick={openCreateEvent} className="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
          <Icon name="plus" size={15} /> Yangi tadbir
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {olympiads.length === 0 && (
          <EmptyState icon="trophy" title="Tadbirlar yo'q" desc="Birinchi olimpiada yoki musobaqangizni yarating"
            action={<button onClick={openCreateEvent} className="btn-primary px-4 py-2 rounded-xl text-sm">Yaratish</button>} />
        )}
        {olympiads.map(o => {
          const assignedCount = (o.questionIds || []).length;
          const needsReadiness = ['draft', 'inactive'].includes(o.status);
          const issues = needsReadiness ? eventReadinessIssues(o) : [];
          const isReady = issues.length === 0;
          const canEdit = needsReadiness;
          const statusTone = o.status === 'active'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
            : o.status === 'inactive'
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/20'
              : o.status === 'draft'
                ? 'bg-white/5 text-white/45 border-white/10'
                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20';
          const statusIcon = o.status === 'active'
            ? 'trophy'
            : o.status === 'inactive'
              ? 'clock'
              : o.status === 'draft'
                ? 'edit'
                : 'check';
          return (
            <div key={o.id} className="glass rounded-2xl p-5 border border-white/10">
              <div className="flex flex-col xl:flex-row xl:items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border ${statusTone}`}>
                <Icon name={statusIcon} size={20} />
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div className="font-bold text-white mb-1">{o.title}</div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/40">
                  <SubjectBadge subject={o.subject} />
                  <span className={`rounded-lg px-2 py-1 font-bold ${o.eventType === 'olympiad' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-amber-500/15 text-amber-300'}`}>{eventTypeLabel(o.eventType || 'competition')}</span>
                  {o.testLevel && <span className="rounded-lg bg-violet-500/15 px-2 py-1 font-bold text-violet-300">Daraja: {o.testLevel}</span>}
                  {o.testType && <span className="rounded-lg bg-sky-500/15 px-2 py-1 font-bold text-sky-300">Tur: {testTypeLabel(o.testType)}</span>}
                  <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} /> {o.startDate || o.date || 'Sana yo\'q'} {o.startTime || ''}</span>
                  <span>{o.duration} min</span>
                  <span>{assignedCount} ta savol</span>
                  <span>{o.participants || 0} ishtirokchi</span>
                  {o.avgScore > 0 && <span className="text-emerald-400">Ø {o.avgScore}%</span>}
                </div>
                {needsReadiness ? (
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
                        {issues.length > 3 && <span className="rounded-lg bg-black/15 px-2 py-1">+{issues.length - 3}</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl px-3 py-2 border text-xs ${o.status === 'active' ? 'bg-cyan-500/10 border-cyan-500/25 text-cyan-300' : 'bg-slate-500/10 border-white/10 text-white/45'}`}>
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
                <button onClick={() => canEdit ? setAssignModal(o) : showToast("⚠ Savollarni o'zgartirish uchun avval nofaollashtiring")}
                  disabled={!canEdit}
                  className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Icon name="book" size={13} /> Savollar ({assignedCount})
                </button>
                {['draft', 'inactive'].includes(o.status) && (
                  <button onClick={() => requestActivation(o)} disabled={!isReady || eventSaving}
                    className={`${isReady ? 'btn-primary' : 'btn-ghost opacity-50'} text-xs px-3 py-1.5 rounded-xl disabled:cursor-not-allowed`}>
                    Faollashtirish
                  </button>
                )}
                {o.status === 'active' && (
                  <>
                    <button onClick={() => deactivateEvent(o)} disabled={eventSaving}
                      className="btn-ghost text-xs px-3 py-1.5 rounded-xl disabled:opacity-50">Nofaol qilish</button>
                    <button onClick={() => finishEvent(o)} disabled={eventSaving}
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
        <h2 className="text-lg md:text-xl font-black text-white">Natijalar</h2>
        {apiLoading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <StatCard label="O'rtacha ball" value={avgVal} icon={<Icon name="chart" size={18} />} color="from-indigo-500 to-purple-600" />
          <StatCard label="Eng yuqori" value={bestVal} icon={<Icon name="trophy" size={18} />} color="from-amber-500 to-orange-500" />
          <StatCard label="Qatnashuvchilar" value={participantsVal} icon={<Icon name="users" size={18} />} color="from-cyan-500 to-blue-600" />
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Tadbir natijalari</h3>
          {isApi && apiEvents.length > 0 && apiEvents.filter(e => (e.participants || 0) > 0).map(e => (
            <div key={e.olympiad_id} className="flex items-center gap-4 p-4 glass rounded-xl mb-3">
              <div className="flex-1">
                <div className="font-semibold text-white">{e.title}</div>
                <div className="text-xs text-white/40">{e.subject} · {e.participants} ishtirokchi · eng yuqori {e.best_score}%</div>
              </div>
              <DonutChart value={Math.round(e.average_score || 0)} size={60} />
              <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl">Reyting</button>
            </div>
          ))}
          {!isApi && localFinished.map(o => (
            <div key={o.id} className="flex items-center gap-4 p-4 glass rounded-xl mb-3">
              <div className="flex-1"><div className="font-semibold text-white">{o.title}</div><div className="text-xs text-white/40">{[o.testLevel, testTypeLabel(o.testType)].filter(Boolean).join(' · ')}{(o.testLevel || o.testType) ? ' · ' : ''}{o.participants || 0} ishtirokchi</div></div>
              <DonutChart value={o.avgScore || 0} size={60} />
              <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-3 py-2 rounded-xl">Reyting</button>
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
    requests: renderRequests,
    olympiads: renderOlympiads,
    questions: () => <QuestionCreatorPage embedded user={user} onOpenSwitcher={onOpenSwitcher} />,
    students: renderStudents,
    results: renderResults,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage={page} setPage={setPage}
        user={{ ...user, role: 'Manager' }} onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={navItems.find(n => n.key === page)?.label || 'Dashboard'} subtitle={`${centerName} · ${centerType}`} user={user}
          onMenuClick={() => setMobileMenu(true)}
          actions={
            <div className="flex items-center gap-2">
              {onOpenSwitcher && (
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
                </button>
              )}
              <button onClick={openCreateEvent} className="btn-primary text-xs px-4 py-2 rounded-xl font-semibold hidden md:flex items-center gap-1">
                <Icon name="plus" size={14} /> Tadbir
              </button>
            </div>
          } />
        <main className="flex-1 overflow-y-auto">
          {(pagesMap[page] || renderHome)()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>

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
                  placeholder={newOlympiad.eventType === 'olympiad' ? 'Matematika Olimpiadasi — May 2026' : 'Ichki matematika musobaqasi'}
                  value={newOlympiad.title}
                  onChange={e => setNewOlympiad({ ...newOlympiad, title: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Fan kategoriyasi</label>
                  <select className="input-field" value={newOlympiad.subject} onChange={e => setNewOlympiad({ ...newOlympiad, subject: e.target.value })}>
                    {store.subjects.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Davomiyligi (min)</label>
                  <input type="number" min="1" className="input-field" value={newOlympiad.duration}
                    onChange={e => setNewOlympiad({ ...newOlympiad, duration: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish sanasi</label>
                  <input type="date" className="input-field" value={newOlympiad.startDate}
                    onChange={e => setNewOlympiad({ ...newOlympiad, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlanish vaqti</label>
                  <input type="time" className="input-field" value={newOlympiad.startTime}
                    onChange={e => setNewOlympiad({ ...newOlympiad, startTime: e.target.value })} />
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

      {/* Activation confirmation modal */}
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

      {/* Assign-questions modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title="Savollarni tayinlash" width="max-w-2xl">
        {assignModal && (() => {
          const liveOlympiad = (isApi ? olympiads : store.olympiads).find(o => o.id === assignModal.id) || assignModal;
          if (!liveOlympiad) return null;
          const levelValue = assignmentLevel.trim();
          const subjectQs = centerQuestions.filter(q => q.subject === liveOlympiad.subject);
          const otherQs = centerQuestions.filter(q => q.subject !== liveOlympiad.subject);
          const assigned = new Set(isApi ? assignedQuestionIds : (liveOlympiad.questionIds || []));
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
              <div className="text-sm text-white/60">{liveOlympiad.title} — {liveOlympiad.subject}</div>
              <div className="text-xs text-white/40">Tayinlangan: <span className="text-white">{assigned.size}</span> / {centerQuestions.length} ta mavjud</div>
              <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3">
                <label className="block text-xs text-sky-200 mb-2 font-semibold">Test turi <span className="text-white/35">(ixtiyoriy)</span></label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { value: '', label: 'Belgilanmagan' },
                    { value: 'mixed', label: 'Aralash' },
                    { value: 'multiple_choice', label: 'Multiple choice' },
                    { value: 'true_false', label: 'True/False' },
                    { value: 'short_answer', label: 'Qisqa javob' },
                  ].map(type => (
                    <button key={type.value || 'unset'} type="button" onClick={() => setAssignmentType(type.value)}
                      className={`rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${assignmentType === type.value ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'}`}>
                      {type.label}
                    </button>
                  ))}
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
                    {typeMismatches.length} ta tanlangan savol {testTypeLabel(assignmentType)} turiga mos emas. Mos savollarni tanlang yoki test turini Aralash qiling.
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                <label className="block text-xs text-violet-200 mb-1.5 font-semibold">Test darajasi <span className="text-white/35">(ixtiyoriy)</span></label>
                <input className="input-field" list="test-level-options" placeholder="Masalan: Beginner, O'rta, Advanced"
                  value={assignmentLevel} onChange={e => setAssignmentLevel(e.target.value)} />
                <datalist id="test-level-options">
                  <option value="Beginner" />
                  <option value="O'rta" />
                  <option value="Advanced" />
                </datalist>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['Beginner', "O'rta", 'Advanced'].map(level => (
                    <button key={level} type="button" onClick={() => setAssignmentLevel(level)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${assignmentLevel === level ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'}`}>
                      {level}
                    </button>
                  ))}
                  {assignmentLevel && (
                    <button type="button" onClick={() => setAssignmentLevel('')}
                      className="rounded-lg bg-white/5 px-2.5 py-1 text-xs font-bold text-white/45 hover:bg-white/10 hover:text-white">
                      Tozalash
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {subjectQs.length > 0 && <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-1">Tegishli fan savollari</div>}
                {subjectQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{q.text}</div>
                      <div className="text-xs text-white/40 mt-1">{testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball · {q.source}</div>
                    </div>
                  </label>
                ))}
                {otherQs.length > 0 && <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-3">Boshqa fan savollari</div>}
                {otherQs.map(q => (
                  <label key={q.id} className="flex items-start gap-3 p-3 rounded-xl glass cursor-pointer hover:bg-white/5 opacity-70">
                    <input type="checkbox" checked={assigned.has(q.id)} onChange={() => toggle(q.id)} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{q.text}</div>
                      <div className="text-xs text-white/40 mt-1">{q.subject} · {testTypeLabel(inferQuestionTestType(q))} · {q.difficulty} · {q.score} ball</div>
                    </div>
                  </label>
                ))}
                {centerQuestions.length === 0 && (
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

      {/* Student detail modal */}
      <Modal open={!!studentDetailMembership} onClose={closeStudentDetail} title="O'quvchi profili" width="max-w-2xl">
        {studentDetailLoading && (
          <div className="text-sm text-white/50">Yuklanmoqda...</div>
        )}
        {studentDetailError && (
          <div className="text-sm text-rose-300">{studentDetailError}</div>
        )}
        {studentDetail && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={studentDetail.user?.full_name || '—'} src={studentDetail.user?.avatar_url || ''} size={56} />
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-white truncate">{studentDetail.user?.full_name || '—'}</div>
                <div className="text-xs text-white/50">{(studentDetail.user?.normalized_phone || studentDetail.user?.phone || '').replace(/(\+998\d{2})\d{3}(\d{4})/, '$1 *** $2')}</div>
                <div className="text-xs text-white/40 mt-0.5">{studentDetail.center?.name} · {studentDetail.subject || '—'} · {(studentDetail.joined_at || '').slice(0,10)}</div>
              </div>
              <Badge status={statusLabel(studentDetail.status)} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">{studentDetail.stats?.total_attempts || 0}</div>
                <div className="text-[11px] text-white/40">Tadbirlar</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">{studentDetail.stats?.average_score || 0}%</div>
                <div className="text-[11px] text-white/40">O'rtacha</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-white">{studentDetail.stats?.best_score || 0}%</div>
                <div className="text-[11px] text-white/40">Eng yuqori</div>
              </div>
              <div className="glass rounded-xl p-3 text-center">
                <div className="text-lg font-black text-amber-400">{studentDetail.stats?.first_place_count || 0}</div>
                <div className="text-[11px] text-white/40">1-o'rin</div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-white mb-2 text-sm">So'nggi natijalar</h4>
              <div className="max-h-72 overflow-y-auto space-y-2">
                {(studentDetail.attempts || []).length === 0 && (
                  <div className="text-sm text-white/40">Hali natijalar yo'q</div>
                )}
                {(studentDetail.attempts || []).map(a => (
                  <div key={a.attempt_id} className="glass rounded-xl p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0 ${a.rank === 1 ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/15 text-indigo-400'}`}>#{a.rank || '—'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{a.olympiad_title}</div>
                      <div className="text-xs text-white/40">{a.subject} · {(a.submitted_at || '').slice(0,10)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-white">{a.score}</div>
                      <div className="text-[11px] text-emerald-400">{a.correct_count}/{a.total_questions}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>
      )}
    </div>
  );
};

Object.assign(window, { ManagerDashboard });
