// pages/TeacherDashboard.jsx — Teacher panel: events + question creation

const TeacherDashboard = ({ user, onNavigate, onLogout, onOpenSwitcher }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [page, setPage] = React.useState('home');
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [createModal, setCreateModal] = React.useState(false);
  const [editingEventId, setEditingEventId] = React.useState(null);
  const [activateConfirm, setActivateConfirm] = React.useState(null);
  const [assignModal, setAssignModal] = React.useState(null);
  const [assignedQuestionIds, setAssignedQuestionIds] = React.useState([]);
  const [assignmentLevel, setAssignmentLevel] = React.useState('');
  const [assignmentType, setAssignmentType] = React.useState('');
  const [eventSaving, setEventSaving] = React.useState(false);
  const [assignmentSaving, setAssignmentSaving] = React.useState(false);
  const [toast, setToast] = React.useState('');
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
    { key: 'olympiads', icon: 'trophy', label: 'Tadbirlar' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
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
          showToast(`⚠ ${eventErrorMessage(err)}`);
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
                <div className="line-clamp-2 text-sm text-white/80">{q.text}</div>
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

  const pagesMap = {
    home: renderHome,
    olympiads: renderOlympiads,
    questions: () => <QuestionCreatorPage embedded user={user} onOpenSwitcher={onOpenSwitcher} />,
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
                <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
                  <Icon name="users" size={13} /> Rolni almashtirish
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
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
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
                  <select className="input-field" value={newEvent.subject} onChange={e => setNewEvent({ ...newEvent, subject: e.target.value })}>
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
                    <option value="Beginner">Beginner</option>
                    <option value="O'rta">O'rta</option>
                    <option value="Advanced">Advanced</option>
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
          const subjectQs = questions.filter(q => q.subject === liveEvent.subject);
          const otherQs = questions.filter(q => q.subject !== liveEvent.subject);
          const assigned = new Set(isApi ? assignedQuestionIds : (liveEvent.questionIds || []));
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
              <div className="text-xs text-white/40">Tayinlangan: <span className="text-white">{assigned.size}</span> / {questions.length} ta mavjud</div>
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
                <input className="input-field" list="teacher-test-level-options" placeholder="Masalan: Beginner, O'rta, Advanced"
                  value={assignmentLevel} onChange={e => setAssignmentLevel(e.target.value)} />
                <datalist id="teacher-test-level-options">
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-indigo-500/30 animate-in text-sm font-medium text-white">{toast}</div>
      )}
    </div>
  );
};

Object.assign(window, { TeacherDashboard });
