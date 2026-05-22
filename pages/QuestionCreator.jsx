// pages/QuestionCreator.jsx

// Avval bu yerda alohida SUBJECTS ro'yxati qattiq kodlangan edi va Auth.jsx
// dagi SUBJECTS_LIST bilan sinxron emas edi. Endi global ro'yxatdan foydalanib,
// faqat unga ulanmagan paytda fallback ishlatamiz.
const SUBJECTS = (globalThis.SUBJECTS_LIST && globalThis.SUBJECTS_LIST.length > 0)
  ? globalThis.SUBJECTS_LIST
  : ['Matematika','Ingliz tili','Ona tili','Informatika','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const LEVELS = ['Oson','O\'rta','Qiyin'];
const ENGLISH_LEVELS = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
const TYPES = ['Ko\'p tanlovli','To\'g\'ri/Noto\'g\'ri','Qisqa javob'];

const getLevelColorClass = (lvl) => {
  const l = (lvl || '').toLowerCase();
  if (l === 'oson' || l === 'easy' || l === 'beginner' || l === 'elementary') {
    return 'emerald';
  }
  if (l === "o'rta" || l === 'medium' || l === 'pre-intermediate' || l === 'intermediate') {
    return 'amber';
  }
  return 'rose';
};

const QuestionCreatorPage = ({ user, onNavigate, onLogout, embedded, onOpenSwitcher }) => {
  // ─── Teacher access guard ───────────────────────────────────────────────
  // Only enforced when used as a standalone page (not embedded inside another dashboard like manager)
  if (user && !embedded) {
    const teacherStatus = user.roles?.teacher?.status;
    if (teacherStatus !== 'approved') {
      const message = teacherStatus === 'rejected'
        ? "O'qituvchi arizangiz rad etildi. Yangi ariza yuborish uchun ro'yxatdan qayta o'ting yoki support bilan bog'laning."
        : "Savol yaratish uchun o'qituvchi arizangiz tasdiqlanishi kerak.";
      return (
        <PendingAccessCard
          title={teacherStatus === 'rejected' ? "O'qituvchi arizasi rad etildi" : "O'qituvchi arizasi kutilmoqda"}
          status={teacherStatus === 'rejected' ? 'rejected' : 'pending'}
          message={message}
          onBack={() => onNavigate && onNavigate('landing')}
        />
      );
    }
  }

  const store = useStore();
  const isApi = !!user?._api;
  const [apiToast, setApiToast] = React.useState('');
  const showApiToast = (m) => { setApiToast(m); setTimeout(() => setApiToast(''), 3000); };
  const [mode, setMode] = React.useState('list'); // list | manual | ai | pdf
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterLevel, setFilterLevel] = React.useState('');
  const [aiForm, setAiForm] = React.useState({ subject:'Matematika', topic:'', count:10, level:'O\'rta', type:'Ko\'p tanlovli' });
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiResult, setAiResult] = React.useState(null);
  const [pdfFile, setPdfFile] = React.useState(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [pdfResult, setPdfResult] = React.useState(null);
  const [pdfProvider, setPdfProvider] = React.useState('');
  const [pdfVision, setPdfVision] = React.useState(false);
  const [pdfWarning, setPdfWarning] = React.useState('');
  const [pdfChunks, setPdfChunks] = React.useState(1);
  const [newQ, setNewQ] = React.useState({ text:'', type:'Ko\'p tanlovli', subject:'Matematika', level:'O\'rta', score:3, options:['','','',''], correct:0 });
  const [editingQuestionId, setEditingQuestionId] = React.useState(null);
  const [newSubjectModal, setNewSubjectModal] = React.useState(false);
  const [newSubject, setNewSubject] = React.useState('');
  const [deleteId, setDeleteId] = React.useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [bulkSaving, setBulkSaving] = React.useState(false);

  const toggleSelectQuestion = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filtered.map(q => q.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const next = [...prev];
        filteredIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  // Determine which center this user creates questions for
  // Teacher → their teacher center; Manager (embedded) → their manager center
  const teacherCenterId = user?.roles?.teacher?.status === 'approved' ? user.roles.teacher.centerId : null;
  const managerCenterId = user?.roles?.manager?.status === 'approved' ? user.roles.manager.centerId : null;
  const ownerCenterId = user?.roles?.owner?.status === 'approved' ? user.roles.owner.centerId : null;
  const myCenterId = teacherCenterId || managerCenterId || ownerCenterId;
  const myCenter = !isApi && myCenterId ? store.centers.find(c => String(c.id) === String(myCenterId)) : null;

  // ─── API rejimida savollarni real backend'dan olish ────────────────────
  const apiQuestionsRes = useApiData(
    () => (isApi && myCenterId)
      ? OlympyApi.getQuestions(myCenterId, OlympyApi.getToken())
      : Promise.resolve(null),
    [isApi, myCenterId],
  );
  const apiQuestions = isApi && Array.isArray(apiQuestionsRes.data) ? apiQuestionsRes.data.map(mapApiQuestion) : null;

  // Pull questions live from the store, scoped to this user's center
  const questions = (isApi ? (apiQuestions || []) : store.questions).filter(q => !myCenterId || String(q.centerId) === String(myCenterId));
  const allSubjects = store.subjects;
  const filtered = questions.filter(q =>
    (!filterSubject || q.subject === filterSubject) && (!filterLevel || q.difficulty === filterLevel)
  );

  const _diffToCategory = (level) => {
    const lvl = (level || '').trim().toLowerCase();
    if (lvl === 'oson' || lvl === 'easy' || lvl === 'beginner' || lvl === 'elementary') return 'easy';
    if (lvl === 'qiyin' || lvl === 'hard' || lvl === 'advanced' || lvl === 'upper-intermediate' || lvl === 'upper-int') return 'hard';
    return 'medium';
  };

  const _diffFromApi = (level, subject, chosenLevel) => {
    const lvl = (level || '').trim().toLowerCase();
    if (lvl === 'beginner') return 'Beginner';
    if (lvl === 'elementary') return 'Elementary';
    if (lvl === 'pre-int' || lvl === 'pre-intermediate') return 'Pre-Intermediate';
    if (lvl === 'int' || lvl === 'intermediate') return 'Intermediate';
    if (lvl === 'upper-int' || lvl === 'upper-intermediate') return 'Upper-Intermediate';
    if (lvl === 'advanced') return 'Advanced';

    if (subject === 'Ingliz tili') {
      if (chosenLevel && _diffToCategory(chosenLevel) === _diffToCategory(level)) {
        return chosenLevel;
      }
      return level === 'easy' ? 'Beginner' : level === 'hard' ? 'Advanced' : 'Intermediate';
    }
    if (chosenLevel && _diffToCategory(chosenLevel) === _diffToCategory(level)) {
      return chosenLevel;
    }
    return level === 'easy' ? 'Oson' : level === 'hard' ? 'Qiyin' : "O'rta";
  };

  const _mapAiGeneratedQuestion = (q, i) => {
    const subj = q.subject || aiForm.subject;
    return {
      _tmpId: Date.now() + i,
      text: q.text,
      subject: subj,
      difficulty: _diffFromApi(q.difficulty, subj, aiForm.level) || aiForm.level,
      score: q.score ?? 3,
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correct_answer ?? q.correctAnswer ?? 0,
      source: 'ai',
    };
  };

  const _mapPdfGeneratedQuestion = (q, i) => {
    const subj = q.subject || aiForm.subject;
    return {
      _tmpId: Date.now() + i,
      text: q.text,
      subject: subj,
      difficulty: _diffFromApi(q.difficulty, subj, aiForm.level) || aiForm.level,
      score: q.score ?? 3,
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: q.correct_answer ?? q.correctAnswer ?? 0,
      source: 'pdf',
      originalNumber: q.original_number || q.order || i + 1,
      answerSource: q.answer_source || 'missing',
      needsReview: !!q.needs_review,
    };
  };

  const generateAI = async () => {
    if (!aiForm.topic) return;
    if (!isApi) {
      // Mock rejimda real LLM yo'q — soxta "A javob, B javob" savollar
      // bazaga yozilib qolmasligi uchun aniq xabar beramiz.
      showApiToast("⚠ AI savol yaratish uchun akkaunt bilan kirish kerak");
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await OlympyApi.generateAiQuestions({
        center: myCenter?.backendId ?? myCenterId,
        subject: aiForm.subject,
        topic: aiForm.topic,
        count: aiForm.count,
        difficulty: _diffToApi(aiForm.level, aiForm.subject),
        question_type: aiForm.type,
      }, OlympyApi.getToken());
      const generated = (response?.questions || []).map(_mapAiGeneratedQuestion);
      setAiResult(generated);
    } catch (err) {
      console.warn('generateAiQuestions failed:', err);
      showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "AI savol yarata olmadi"}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handlePDF = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isApi) {
      // Mock rejimda PDF parse qiluvchi server yo'q — soxta "PDF dan
      // ajratilgan 1-savol" natijalar bazaga sizmasligi uchun chiqaramiz.
      showApiToast("⚠ PDF tahlil qilish uchun akkaunt bilan kirish kerak");
      e.target.value = '';
      return;
    }
    setPdfFile(f.name);
    setPdfLoading(true);
    setPdfResult(null);
    setPdfProvider('');
    setPdfVision(false);
    setPdfWarning('');
    setPdfChunks(1);
    try {
      const response = await OlympyApi.extractPdfQuestions(f, {
        center: myCenter?.backendId ?? myCenterId,
        subject: aiForm.subject,
        difficulty: _diffToApi(aiForm.level, aiForm.subject),
        question_type: aiForm.type,
      }, OlympyApi.getToken());
      const extracted = (response?.questions || []).map(_mapPdfGeneratedQuestion);
      setPdfResult(extracted);
      setPdfProvider(response?.provider || '');
      setPdfVision(!!response?.used_pdf_vision);
      setPdfWarning(response?.warning || (response?.complete === false ? "PDF qisman ajratildi. Saqlashdan oldin asl PDF bilan solishtirib tekshiring." : ''));
      setPdfChunks(response?.chunks || 1);
      if (!extracted.length) showApiToast("⚠ PDFdan savol topilmadi");
    } catch (err) {
      console.warn('extractPdfQuestions failed:', err);
      showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "PDF tahlil qilinmadi"}`);
    } finally {
      setPdfLoading(false);
      e.target.value = '';
    }
  };

  const _diffToApi = (level, subject) => {
    const lvl = (level || '').trim().toLowerCase();
    if (lvl === 'beginner' || lvl === 'beg') return 'beginner';
    if (lvl === 'elementary' || lvl === 'elem') return 'elementary';
    if (lvl === 'pre-intermediate' || lvl === 'pre-int') return 'pre-int';
    if (lvl === 'intermediate' || lvl === 'int') return 'int';
    if (lvl === 'upper-intermediate' || lvl === 'upper-int') return 'upper-int';
    if (lvl === 'advanced' || lvl === 'adv') return 'advanced';

    if (subject === 'Ingliz tili') {
      if (lvl === 'oson' || lvl === 'easy') return 'beginner';
      if (lvl === 'qiyin' || lvl === 'hard') return 'advanced';
      return 'int';
    }

    if (lvl === 'oson' || lvl === 'easy') return 'easy';
    if (lvl === 'qiyin' || lvl === 'hard') return 'hard';
    return 'medium';
  };

  const _toApiQuestion = (q, source) => ({
    center: myCenter?.backendId ?? myCenterId,
    subject: q.subject,
    text: q.text,
    options: q.options || [],
    correct_answer: q.correctAnswer ?? q.correct ?? 0,
    score: q.score ?? 3,
    difficulty: _diffToApi(q.difficulty || q.level, q.subject || aiForm.subject),
    source: source || q.source || 'manual',
  });

  const _createApiBulk = (items, source) => {
    const token = OlympyApi.getToken();
    return Promise.all(items.map(q => OlympyApi.createQuestion(_toApiQuestion(q, source), token)));
  };

  const startEditQuestion = (q) => {
    // mavjud savol ma'lumotlarini formga yuklash. Backend Question turi
    // (multiple_choice/true_false/short_answer) yo'q — Frontend "type"ni
    // options soniga qarab xulosa qiladi.
    const inferredType = (q.options && q.options.length === 2 && q.options.every(o => /to'?g'?ri|noto'?g'?ri/i.test(o)))
      ? "To'g'ri/Noto'g'ri"
      : (Array.isArray(q.options) && q.options.length > 0 ? "Ko'p tanlovli" : 'Qisqa javob');
    setEditingQuestionId(q.backendId ?? q.id);
    setNewQ({
      text: q.text || '',
      type: inferredType,
      subject: q.subject || (allSubjects[0] || 'Matematika'),
      level: q.subject === 'Ingliz tili'
        ? (['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'].includes(q.difficulty)
           ? q.difficulty
           : (q.difficulty === 'Oson' || q.difficulty === 'easy' ? 'Beginner' : q.difficulty === 'Qiyin' || q.difficulty === 'hard' ? 'Advanced' : 'Intermediate'))
        : (q.difficulty || "O'rta"),
      score: q.score || 3,
      options: Array.isArray(q.options) && q.options.length ? q.options.slice() : ['','','',''],
      correct: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
    });
    setMode('manual');
  };

  const saveQuestion = () => {
    if (!newQ.text) return;
    const isEditing = !!editingQuestionId;
    if (isApi) {
      const token = OlympyApi.getToken();
      const payload = {
        subject: newQ.subject,
        text: newQ.text,
        options: newQ.options,
        correct_answer: newQ.correct,
        score: newQ.score,
        difficulty: _diffToApi(newQ.level, newQ.subject),
      };
      const promise = isEditing
        ? OlympyApi.updateQuestion(editingQuestionId, payload, token)
        : OlympyApi.createQuestion({
            center: myCenter?.backendId ?? myCenterId,
            ...payload,
            source: 'manual',
          }, token);
      promise
        .then(() => { apiQuestionsRes.reload(); setMode('list'); setEditingQuestionId(null); })
        .catch(err => {
          console.warn('saveQuestion failed:', err);
          showApiToast(`⚠ ${isEditing ? "Tahrirlab" : "Saqlab"} bo'lmadi`);
        });
      setNewQ({ text:'', type:"Ko'p tanlovli", subject: allSubjects[0] || 'Matematika', level:"O'rta", score:3, options:['','','',''], correct:0 });
      return;
    }
    if (isEditing) {
      OlympyStore.updateQuestion(editingQuestionId, {
        subject: newQ.subject,
        text: newQ.text,
        options: newQ.options,
        correctAnswer: newQ.correct,
        score: newQ.score,
        difficulty: newQ.level,
      });
    } else {
      OlympyStore.createQuestion({
        centerId: myCenterId,
        subject: newQ.subject,
        text: newQ.text,
        options: newQ.options,
        correctAnswer: newQ.correct,
        score: newQ.score,
        difficulty: newQ.level,
        source: 'manual',
        createdBy: user?.id,
      });
    }
    setNewQ({ text:'', type:"Ko'p tanlovli", subject: allSubjects[0] || 'Matematika', level:"O'rta", score:3, options:['','','',''], correct:0 });
    setEditingQuestionId(null);
    setMode('list');
  };

  const saveAiQuestions = () => {
    if (!aiResult || aiResult.length === 0) return;
    if (isApi) {
      setBulkSaving(true);
      _createApiBulk(aiResult, 'ai')
        .then(() => { apiQuestionsRes.reload(); setAiResult(null); setMode('list'); })
        .catch(err => { console.warn('createQuestion (ai) failed:', err); showApiToast("⚠ Savollar saqlab bo'lmadi"); })
        .finally(() => setBulkSaving(false));
      return;
    }
    OlympyStore.createQuestionsBulk(aiResult.map(q => ({
      centerId: myCenterId,
      subject: q.subject,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      score: q.score,
      difficulty: q.difficulty,
      source: q.source || 'ai',
      createdBy: user?.id,
    })));
    setAiResult(null);
    setMode('list');
  };

  const savePdfQuestions = () => {
    if (!pdfResult || pdfResult.length === 0) return;
    if (isApi) {
      setBulkSaving(true);
      _createApiBulk(pdfResult, 'pdf')
        .then(() => { apiQuestionsRes.reload(); setPdfResult(null); setPdfFile(null); setPdfProvider(''); setPdfVision(false); setMode('list'); })
        .catch(err => { console.warn('createQuestion (pdf) failed:', err); showApiToast("⚠ Savollar saqlab bo'lmadi"); })
        .finally(() => setBulkSaving(false));
      return;
    }
    OlympyStore.createQuestionsBulk(pdfResult.map(q => ({
      centerId: myCenterId,
      subject: q.subject,
      text: q.text,
      options: q.options,
      correctAnswer: q.correctAnswer,
      score: q.score,
      difficulty: q.difficulty,
      source: q.source || 'pdf',
      createdBy: user?.id,
    })));
    setPdfResult(null);
    setPdfFile(null);
    setPdfProvider('');
    setPdfVision(false);
    setMode('list');
  };

  const addCustomSubject = () => {
    if (newSubject && !allSubjects.includes(newSubject)) {
      OlympyStore.addSubject(newSubject);
    }
    setNewSubjectModal(false);
    setNewSubject('');
  };

  const navItems = [
    { key: 'home', icon: 'home', label: 'Asosiy' },
    { key: 'questions', icon: 'book', label: 'Savollar' },
    { key: 'olympiads', icon: 'trophy', label: 'Olimpiadalar' },
    { divider: true, key: 'd1' },
    { key: 'settings', icon: 'settings', label: 'Sozlamalar' },
  ];

  const content = (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-black text-white">Savol yaratuvchi</h2>
          <p className="text-white/40 text-xs md:text-sm">{questions.length} ta savol · {allSubjects.length} ta fan</p>
        </div>
        {mode === 'list' && (
          <div className="grid grid-cols-3 md:flex md:gap-2 gap-2">
            <button onClick={() => setMode('manual')} className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="edit" size={14} /> <span className="hidden sm:inline">Qo'lda yaratish</span><span className="sm:hidden">Qo'lda</span></button>
            <button onClick={() => setMode('ai')} className="btn-primary text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="sparkles" size={14} /> <span className="hidden sm:inline">AI orqali</span><span className="sm:hidden">AI</span></button>
            <button onClick={() => setMode('pdf')} className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-cyan-500/30 text-cyan-300"><Icon name="upload" size={14} /> <span className="hidden sm:inline">PDF dan</span><span className="sm:hidden">PDF</span></button>
          </div>
        )}
        {mode !== 'list' && <button onClick={() => { setMode('list'); setAiResult(null); setPdfResult(null); setPdfProvider(''); setPdfVision(false); setEditingQuestionId(null); }} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 w-full md:w-auto"><Icon name="arrowLeft" size={14} /> Orqaga</button>}
      </div>

      {/* LIST MODE */}
      {mode === 'list' && (
        <>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 md:gap-3">
            <select className="input-field py-2.5 w-full sm:w-auto sm:flex-1 sm:min-w-[10rem]" value={filterSubject} onChange={e => {
              const newSubj = e.target.value;
              setFilterSubject(newSubj);
              if (newSubj === 'Ingliz tili') {
                if (filterLevel && !ENGLISH_LEVELS.includes(filterLevel)) {
                  setFilterLevel('');
                }
              } else {
                if (filterLevel && !LEVELS.includes(filterLevel)) {
                  setFilterLevel('');
                }
              }
            }}>
              <option value="">Barcha fanlar</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="input-field py-2.5 w-full sm:w-auto" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
              <option value="">Barcha darajalar</option>
              {(filterSubject === 'Ingliz tili' ? ENGLISH_LEVELS : LEVELS).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={() => setNewSubjectModal(true)} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-dashed border-white/20 text-white/40 w-full sm:w-auto">
              <Icon name="plus" size={14} /> Yangi fan qo'shish
            </button>
            {questions.length > 0 && (
              selectedIds.length > 0 ? (
                <button onClick={() => setDeleteAllConfirm(true)} className="btn-danger text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors w-full sm:w-auto sm:ml-auto">
                  <Icon name="trash" size={14} /> Tanlanganlarni o'chirish ({selectedIds.length})
                </button>
              ) : (
                <button onClick={() => setDeleteAllConfirm(true)} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors w-full sm:w-auto sm:ml-auto">
                  <Icon name="trash" size={14} /> Barchasini o'chirish
                </button>
              )
            )}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 glass rounded-xl text-white/50 text-xs w-fit select-none animate-in">
              <input
                type="checkbox"
                id="select-all-checkbox"
                className="w-3.5 h-3.5 rounded border-white/15 bg-white/5 text-rose-500 focus:ring-rose-500/30 cursor-pointer"
                checked={filtered.length > 0 && filtered.every(q => selectedIds.includes(q.id))}
                onChange={toggleSelectAll}
              />
              <label htmlFor="select-all-checkbox" className="cursor-pointer font-medium">
                {filtered.every(q => selectedIds.includes(q.id)) ? "Tanlovni bekor qilish" : "Barchasini tanlash"}
              </label>
            </div>
          )}

          <div className="space-y-3">
            {filtered.length === 0 && <EmptyState icon="book" title="Savollar yo'q" desc="Yangi savol yarating" action={<button onClick={() => setMode('manual')} className="btn-primary px-4 py-2 rounded-xl text-sm">Savol yaratish</button>} />}
            {filtered.map(q => (
              <div key={q.id} className="glass rounded-2xl p-3 md:p-4 flex gap-3 md:gap-4 group">
                <div className={`w-1.5 md:w-2 rounded-full flex-shrink-0 ${getLevelColorClass(q.difficulty) === 'emerald' ? 'bg-emerald-400' : getLevelColorClass(q.difficulty) === 'amber' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                <div className="flex-shrink-0 flex items-center pr-1 select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-white/15 bg-white/5 text-rose-500 focus:ring-rose-500/30 cursor-pointer"
                    checked={selectedIds.includes(q.id)}
                    onChange={() => toggleSelectQuestion(q.id)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 mb-2 leading-relaxed">{q.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                    <SubjectBadge subject={q.subject} />
                    {q.source && <span className="chip glass text-white/50 text-xs">{q.source === 'ai' ? '✨ AI' : q.source === 'pdf' ? '📄 PDF' : '✏️ Qo\'lda'}</span>}
                    <span className={`chip text-xs ${getLevelColorClass(q.difficulty) === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' : getLevelColorClass(q.difficulty) === 'amber' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{q.difficulty}</span>
                    <span className="chip glass text-indigo-300 text-xs">{q.score} ball</span>
                  </div>
                  {(q.options || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {q.options.map((o, i) => (
                        <span key={i} className={`text-xs px-2 py-0.5 rounded-lg ${i === q.correctAnswer ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'glass text-white/40'}`}>{o}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Mobile'da har doim ko'rinadi (hover yo'q), desktop'da hover'da */}
                <div className="flex gap-0.5 md:gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => startEditQuestion(q)} className="text-white/40 hover:text-indigo-400 transition-colors p-2 rounded-lg hover:bg-white/5"><Icon name="edit" size={15} /></button>
                  <button onClick={() => setDeleteId(q.id)} className="text-white/40 hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-white/5"><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MANUAL MODE */}
      {mode === 'manual' && (
        <div className="glass rounded-2xl p-4 md:p-6 space-y-4 md:space-y-5 animate-in">
          <h3 className="font-bold text-white">{editingQuestionId ? "Savolni tahrirlash" : "Yangi savol yaratish"}</h3>
          <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Savol matni</label>
            <textarea className="input-field" rows={3} placeholder="Savolingizni kiriting..." value={newQ.text} onChange={e => setNewQ({...newQ, text: e.target.value})} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Savol turi</label>
              <select className="input-field" value={newQ.type} onChange={e => setNewQ({...newQ, type: e.target.value})}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Fan</label>
              <select className="input-field" value={newQ.subject} onChange={e => {
                const newSubj = e.target.value;
                let newLevel = newQ.level;
                if (newSubj === 'Ingliz tili') {
                  if (!ENGLISH_LEVELS.includes(newLevel)) {
                    newLevel = 'Beginner';
                  }
                } else {
                  if (!LEVELS.includes(newLevel)) {
                    newLevel = "O'rta";
                  }
                }
                setNewQ({...newQ, subject: newSubj, level: newLevel});
              }}>
                {allSubjects.map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Daraja</label>
              <select className="input-field" value={newQ.level} onChange={e => setNewQ({...newQ, level: e.target.value})}>
                {(newQ.subject === 'Ingliz tili' ? ENGLISH_LEVELS : LEVELS).map(l => <option key={l} value={l}>{l}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Ball</label>
              <input type="number" className="input-field" value={newQ.score} onChange={e => setNewQ({...newQ, score: +e.target.value})} /></div>
          </div>
          {(newQ.type === "Ko'p tanlovli") && (
            <div>
              <label className="block text-xs text-white/50 mb-2 font-medium">Javob variantlari (to'g'risini belgilang)</label>
              <div className="space-y-2">
                {newQ.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button onClick={() => setNewQ({...newQ, correct: i})}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${newQ.correct === i ? 'gradient-bg text-white' : 'glass text-white/40'}`}>
                      {String.fromCharCode(65+i)}
                    </button>
                    <input className="input-field py-2" placeholder={`${String.fromCharCode(65+i)} varianti`}
                      value={opt} onChange={e => { const o = [...newQ.options]; o[i] = e.target.value; setNewQ({...newQ, options: o}); }} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {newQ.type === "To'g'ri/Noto'g'ri" && (
            <div className="flex gap-3">
              {["To'g'ri","Noto'g'ri"].map((v,i) => (
                <button key={v} onClick={() => setNewQ({...newQ, correct: i, options: ["To'g'ri","Noto'g'ri"]})}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${newQ.correct === i ? 'gradient-bg text-white' : 'glass text-white/50'}`}>{v}</button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setMode('list'); setEditingQuestionId(null); }} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
            <button onClick={saveQuestion} disabled={!newQ.text} className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">{editingQuestionId ? "Saqlash" : "Yaratish"}</button>
          </div>
        </div>
      )}

      {/* AI MODE */}
      {mode === 'ai' && (
        <div className="space-y-5 animate-in">
          <div className="glass rounded-2xl p-6 space-y-4 border border-indigo-500/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 gradient-bg rounded-xl flex items-center justify-center"><Icon name="sparkles" size={18} /></div>
              <div><div className="font-bold text-white">AI Savol Generatori</div><div className="text-xs text-white/40">Mavzu bo'yicha avtomatik savollar yaratadi</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-white/50 mb-1.5">Fan</label>
                <select className="input-field" value={aiForm.subject} onChange={e => {
                  const newSubj = e.target.value;
                  let newLevel = aiForm.level;
                  if (newSubj === 'Ingliz tili') {
                    if (!ENGLISH_LEVELS.includes(newLevel)) {
                      newLevel = 'Beginner';
                    }
                  } else {
                    if (!LEVELS.includes(newLevel)) {
                      newLevel = "O'rta";
                    }
                  }
                  setAiForm({...aiForm, subject: newSubj, level: newLevel});
                }}>
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className="block text-xs text-white/50 mb-1.5">Savollar soni</label>
                <input type="number" className="input-field" min={1} max={30} value={aiForm.count} onChange={e => setAiForm({...aiForm, count: +e.target.value})} /></div>
            </div>
            <div><label className="block text-xs text-white/50 mb-1.5">Mavzu</label>
              <input className="input-field" placeholder="Masalan: Kvadrat tenglamalar, Past tenses..." value={aiForm.topic} onChange={e => setAiForm({...aiForm, topic: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-white/50 mb-1.5">Qiyinlik darajasi</label>
                <select className="input-field" value={aiForm.level} onChange={e => setAiForm({...aiForm, level: e.target.value})}>
                  {(aiForm.subject === 'Ingliz tili' ? ENGLISH_LEVELS : LEVELS).map(l => <option key={l} value={l}>{l}</option>)}
                </select></div>
              <div><label className="block text-xs text-white/50 mb-1.5">Test turi</label>
                <select className="input-field" value={aiForm.type} onChange={e => setAiForm({...aiForm, type: e.target.value})}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select></div>
            </div>
            <button onClick={generateAI} disabled={!aiForm.topic || aiLoading}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {aiLoading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Yaratilmoqda...</>
              ) : <><Icon name="sparkles" size={18} /> AI orqali savol yaratish</>}
            </button>
          </div>

          {aiLoading && (
            <div className="glass rounded-2xl p-6 ai-shimmer">
              <div className="space-y-3">
                {Array.from({length:3}).map((_,i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 rounded-lg bg-white/10" style={{width:`${60+i*15}%`}} />
                    <div className="h-3 rounded-lg bg-white/5 w-full" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiResult && !aiLoading && (
            <div className="glass rounded-2xl p-5 space-y-4 animate-in">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-white">{aiResult.length} ta savol yaratildi ✨</div>
                <div className="flex gap-2">
                  <button onClick={() => setAiResult(null)} className="btn-ghost text-xs px-3 py-1.5 rounded-xl">Tozalash</button>
                  <button onClick={saveAiQuestions} disabled={bulkSaving} className="btn-primary text-xs px-4 py-1.5 rounded-xl font-semibold disabled:opacity-50">Hammasini saqlash</button>
                </div>
              </div>
              <div className="space-y-2.5 max-h-[25rem] overflow-y-auto pr-1">
                {aiResult.map((q,i) => (
                  <div key={i} className="glass rounded-xl p-3 text-sm text-white/70 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-indigo-300 font-bold">{i+1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="leading-relaxed">{q.text}</div>
                        <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-2">
                          <SubjectBadge subject={q.subject} />
                          <span className={`chip text-xs ${getLevelColorClass(q.difficulty) === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' : getLevelColorClass(q.difficulty) === 'amber' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{q.difficulty}</span>
                          <span className="chip glass text-indigo-300 text-xs">{q.score} ball</span>
                        </div>
                      </div>
                    </div>
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid gap-1.5 sm:grid-cols-2 mt-1">
                        {q.options.map((option, optionIndex) => (
                          <div key={optionIndex}
                            className={`rounded-lg px-2 py-1 text-xs ${optionIndex === q.correctAnswer ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/50'}`}>
                            {String.fromCharCode(65 + optionIndex)}. {option}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PDF MODE */}
      {mode === 'pdf' && (
        <div className="space-y-5 animate-in">
          <div className="glass rounded-2xl p-6 border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-cyan-500/15 rounded-xl flex items-center justify-center text-cyan-400"><Icon name="file" size={18} /></div>
              <div><div className="font-bold text-white">PDF dan Savol Yaratish</div><div className="text-xs text-white/40">PDF yuklang va avtomatik savollar ajratiladi</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="block text-xs text-white/50 mb-1.5">Fan</label>
                <select className="input-field" value={aiForm.subject} onChange={e => {
                  const newSubj = e.target.value;
                  let newLevel = aiForm.level;
                  if (newSubj === 'Ingliz tili') {
                    if (!ENGLISH_LEVELS.includes(newLevel)) {
                      newLevel = 'Beginner';
                    }
                  } else {
                    if (!LEVELS.includes(newLevel)) {
                      newLevel = "O'rta";
                    }
                  }
                  setAiForm({...aiForm, subject: newSubj, level: newLevel});
                }}>
                  {allSubjects.map(s => <option key={s}>{s}</option>)}
                </select></div>
              <div><label className="block text-xs text-white/50 mb-1.5">Qiyinlik</label>
                <select className="input-field" value={aiForm.level} onChange={e => setAiForm({...aiForm, level: e.target.value})}>
                  {(aiForm.subject === 'Ingliz tili' ? ENGLISH_LEVELS : LEVELS).map(l => <option key={l} value={l}>{l}</option>)}
                </select></div>
            </div>
            <label className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📄</div>
              <div className="text-sm font-medium text-white/60 mb-1">{pdfFile || 'PDF faylni shu yerga tashlang'}</div>
              <div className="text-xs text-white/30">yoki bosib tanlang</div>
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={handlePDF} />
            </label>
            {pdfLoading && (
              <div className="mt-4 space-y-2 ai-shimmer rounded-xl p-4">
                <div className="text-xs text-cyan-400 mb-2">PDF tahlil qilinmoqda...</div>
                {[80,60,70].map((w,i) => <div key={i} className="h-3 rounded bg-white/10" style={{width:`${w}%`}} />)}
              </div>
            )}
          </div>
          {pdfResult && !pdfLoading && (
            <div className="glass rounded-2xl p-5 space-y-3 animate-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{pdfResult.length} ta savol ajratildi</div>
                  <div className="text-xs text-white/35">
                    {pdfProvider ? `${pdfProvider === 'openai' ? 'OpenAI' : pdfProvider === 'gemini' ? 'Gemini' : pdfProvider === 'parser' ? 'PDF parser' : 'Demo'} tahlil qildi` : 'AI tahlil qildi'}
                    {pdfVision ? ' · PDF vision' : ''}
                    {pdfChunks > 1 ? ` · ${pdfChunks} bo'lak` : ''}
                  </div>
                  {pdfWarning && <div className="mt-1 text-[11px] text-amber-300">{pdfWarning}</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={savePdfQuestions} disabled={bulkSaving} className="btn-primary text-xs px-4 py-1.5 rounded-xl font-semibold disabled:opacity-50">Saqlash</button>
                </div>
              </div>
              {pdfResult.map((q,i) => (
                <div key={i} className="glass rounded-xl p-3 text-sm text-white/70 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-300 font-bold">{i+1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="leading-relaxed">{q.text}</div>
                      {q.needsReview && (
                        <div className="mt-1 text-[11px] text-amber-300">Javob AI tomonidan taxmin qilindi, saqlashdan oldin tekshiring</div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-2">
                        <SubjectBadge subject={q.subject} />
                        <span className={`chip text-xs ${getLevelColorClass(q.difficulty) === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' : getLevelColorClass(q.difficulty) === 'amber' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{q.difficulty}</span>
                        <span className="chip glass text-indigo-300 text-xs">{q.score} ball</span>
                      </div>
                    </div>
                  </div>
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((option, optionIndex) => (
                        <div key={optionIndex}
                          className={`rounded-lg px-2 py-1 text-xs ${optionIndex === q.correctAnswer ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/50'}`}>
                          {String.fromCharCode(65 + optionIndex)}. {option}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Savolni o'chirish">
        <p className="text-white/60 mb-5">Bu savolni o'chirishni tasdiqlaysizmi?</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteId(null)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
          <button onClick={() => {
            if (isApi) {
              const target = questions.find(q => String(q.id) === String(deleteId));
              const backendId = target?.backendId ?? deleteId;
              OlympyApi.deleteQuestion(backendId, OlympyApi.getToken())
                .then(() => { apiQuestionsRes.reload(); setDeleteId(null); })
                .catch(err => { console.warn('deleteQuestion failed:', err); showApiToast("⚠ O'chirib bo'lmadi"); setDeleteId(null); });
              return;
            }
            OlympyStore.deleteQuestion(deleteId);
            setDeleteId(null);
          }} className="btn-danger flex-1 py-3 rounded-xl font-semibold">O'chirish</button>
        </div>
      </Modal>

      {/* Delete all confirm */}
      <Modal open={deleteAllConfirm} onClose={() => setDeleteAllConfirm(false)} title={selectedIds.length > 0 ? "Tanlangan savollarni o'chirish" : "Barcha savollarni o'chirish"}>
        <div className="space-y-4">
          <p className="text-white/80 text-sm font-semibold leading-relaxed">
            {selectedIds.length > 0 ? `${selectedIds.length} ta tanlangan savol o'chirilsinmi?` : "Hamma savollar o'chirilsinmi?"}
          </p>
          <p className="text-white/60 text-xs leading-relaxed">
            {selectedIds.length > 0
              ? `Ushbu markazga tegishli **tanlangan ${selectedIds.length} ta savol** o'chirib tashlanadi.`
              : `Ushbu markazga tegishli **barcha ${questions.length} ta savol** o'chirib tashlanadi.`}
          </p>
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs leading-relaxed">
            ⚠️ <strong>DIQQAT:</strong> Ushbu amalni ortga qaytarib bo'lmaydi!
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setDeleteAllConfirm(false)} className="btn-ghost flex-1 py-3 rounded-xl">
              Yo'q
            </button>
            <button
              onClick={async () => {
                const targetIds = selectedIds.length > 0 ? selectedIds : null;
                if (isApi) {
                  try {
                    await OlympyApi.deleteAllQuestions(myCenterId, OlympyApi.getToken(), targetIds);
                    showApiToast(
                      targetIds
                        ? `✅ Tanlangan ${targetIds.length} ta savol muvaffaqiyatli o'chirildi`
                        : "✅ Barcha savollar muvaffaqiyatli o'chirildi"
                    );
                    setSelectedIds([]);
                    apiQuestionsRes.reload();
                  } catch (err) {
                    console.warn('deleteAllQuestions failed:', err);
                    showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Savollarni o'chirishda xatolik yuz berdi"}`);
                  }
                } else {
                  OlympyStore.deleteAllQuestions(myCenterId, targetIds);
                  showApiToast(
                    targetIds
                      ? `✅ Tanlangan ${targetIds.length} ta savol muvaffaqiyatli o'chirildi (Mock)`
                      : "✅ Barcha savollar muvaffaqiyatli o'chirildi (Mock)"
                  );
                  setSelectedIds([]);
                }
                setDeleteAllConfirm(false);
              }}
              className="btn-danger flex-1 py-3 rounded-xl font-semibold"
            >
              Ha
            </button>
          </div>
        </div>
      </Modal>

      {bulkSaving && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-strong border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs text-center shadow-2xl">
            <div className="relative flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-indigo-500/20 border-t-indigo-500 border-r-indigo-500"></div>
              <div className="absolute animate-pulse text-indigo-400">
                <Icon name="sparkles" size={20} />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Savollar saqlanmoqda</h3>
              <p className="text-xs text-white/40">Iltimos kuting, savollar ma'lumotlar bazasiga yozilmoqda...</p>
            </div>
          </div>
        </div>
      )}

      {apiToast && (
        <div className="fixed bottom-20 md:bottom-6 right-3 md:right-6 left-3 md:left-auto z-50 glass-strong rounded-2xl px-5 py-3.5 border border-rose-500/30 animate-in text-sm font-medium text-white md:max-w-sm">{apiToast}</div>
      )}

      {/* New subject modal */}
      <Modal open={newSubjectModal} onClose={() => setNewSubjectModal(false)} title="Yangi fan qo'shish">
        <div className="space-y-4">
          <input className="input-field" placeholder="Fan nomi" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
          <div className="flex gap-3">
            <button onClick={() => setNewSubjectModal(false)} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
            <button onClick={addCustomSubject} disabled={!newSubject} className="btn-primary flex-1 py-3 rounded-xl font-semibold">Qo'shish</button>
          </div>
        </div>
      </Modal>
    </div>
  );

  if (embedded) return content;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar items={navItems} activePage="questions" setPage={() => {}} user={{ ...user, role: "O'qituvchi" }} onLogout={onLogout} logoClick={() => onNavigate('landing')} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title="Savol yaratuvchi" subtitle="AI · PDF · Qo'lda" user={user}
          actions={onOpenSwitcher && (
            <button onClick={onOpenSwitcher} className="btn-ghost text-xs px-3 py-2 rounded-xl hidden md:flex items-center gap-1.5">
              <Icon name="users" size={13} /> Rolni almashtirish
            </button>
          )} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">{content}</main>
      </div>
    </div>
  );
};

Object.assign(window, { QuestionCreatorPage });
