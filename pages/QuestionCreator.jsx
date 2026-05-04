// pages/QuestionCreator.jsx

const SUBJECTS = ['Matematika','Ingliz tili','Ona tili','Informatika','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const LEVELS = ['Oson','O\'rta','Qiyin'];
const TYPES = ['Ko\'p tanlovli','To\'g\'ri/Noto\'g\'ri','Qisqa javob'];

const MOCK_QUESTIONS = [
  { id:1, text:"2x + 5 = 13 tenglamasini yeching.", type:"Ko'p tanlovli", subject:"Matematika", level:"Oson", score:3, options:["x=2","x=3","x=4","x=5"], correct:2 },
  { id:2, text:"Pythagoras teoremasi: a²+b²=c² – bu to'g'rimi?", type:"To'g'ri/Noto'g'ri", subject:"Matematika", level:"Oson", score:2, options:["To'g'ri","Noto'g'ri"], correct:0 },
  { id:3, text:"O'zbekiston mustaqilligini qachon e'lon qildi?", type:"Ko'p tanlovli", subject:"Tarix", level:"O'rta", score:3, options:["1990","1991","1992","1993"], correct:1 },
  { id:4, text:"\"Algorithm\" so'zini inglizcha yozing.", type:"Qisqa javob", subject:"Informatika", level:"O'rta", score:4, options:[], correct:null },
];

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
  const [newQ, setNewQ] = React.useState({ text:'', type:'Ko\'p tanlovli', subject:'Matematika', level:'O\'rta', score:3, options:['','','',''], correct:0 });
  const [newSubjectModal, setNewSubjectModal] = React.useState(false);
  const [newSubject, setNewSubject] = React.useState('');
  const [deleteId, setDeleteId] = React.useState(null);

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

  const _diffFromApi = (level) =>
    level === 'easy' ? 'Oson' : level === 'hard' ? 'Qiyin' : "O'rta";

  const _mapAiGeneratedQuestion = (q, i) => ({
    _tmpId: Date.now() + i,
    text: q.text,
    subject: q.subject || aiForm.subject,
    difficulty: _diffFromApi(q.difficulty) || aiForm.level,
    score: q.score ?? 3,
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correct_answer ?? q.correctAnswer ?? 0,
    source: 'ai',
  });

  const generateAI = async () => {
    if (!aiForm.topic) return;
    setAiLoading(true);
    setAiResult(null);
    if (isApi) {
      try {
        const response = await OlympyApi.generateAiQuestions({
          center: myCenter?.backendId ?? myCenterId,
          subject: aiForm.subject,
          topic: aiForm.topic,
          count: aiForm.count,
          difficulty: _diffToApi(aiForm.level),
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
      return;
    }
    setTimeout(() => {
      const generated = Array.from({length: aiForm.count}, (_, i) => ({
        // tmp id for preview only — real id assigned on save
        _tmpId: Date.now() + i,
        text: `${aiForm.subject} · ${aiForm.topic}: ${i+1}-savol matni bu yerda bo'ladi.`,
        subject: aiForm.subject,
        difficulty: aiForm.level,
        score: 3,
        options: aiForm.type === "Ko'p tanlovli" ? ['A javob','B javob','C javob','D javob']
               : aiForm.type === "To'g'ri/Noto'g'ri" ? ["To'g'ri","Noto'g'ri"] : [],
        correctAnswer: 0,
        source: 'ai',
      }));
      setAiResult(generated);
      setAiLoading(false);
    }, 2500);
  };

  const handlePDF = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPdfFile(f.name);
    setPdfLoading(true);
    setTimeout(() => {
      setPdfResult(Array.from({length:5}, (_, i) => ({
        _tmpId: Date.now()+i, text:`PDF dan ajratilgan ${i+1}-savol`,
        subject: aiForm.subject || 'Matematika', difficulty:"O'rta", score:3,
        options:['A','B','C','D'], correctAnswer:0, source:'pdf',
      })));
      setPdfLoading(false);
    }, 2000);
  };

  // Backend API uchun frontend savollarning daraja kalitlarini Django
  // Question.DIFFICULTY_CHOICES ga moslashtiradi.
  const _diffToApi = (level) =>
    level === 'Oson' ? 'easy' : level === 'Qiyin' ? 'hard' : 'medium';

  const _toApiQuestion = (q, source) => ({
    center: myCenter?.backendId ?? myCenterId,
    subject: q.subject,
    text: q.text,
    options: q.options || [],
    correct_answer: q.correctAnswer ?? q.correct ?? 0,
    score: q.score ?? 3,
    difficulty: _diffToApi(q.difficulty || q.level),
    source: source || q.source || 'manual',
  });

  const _createApiBulk = (items, source) => {
    const token = OlympyApi.getToken();
    return Promise.all(items.map(q => OlympyApi.createQuestion(_toApiQuestion(q, source), token)));
  };

  const saveQuestion = () => {
    if (!newQ.text) return;
    if (isApi) {
      const token = OlympyApi.getToken();
      OlympyApi.createQuestion({
        center: myCenter?.backendId ?? myCenterId,
        subject: newQ.subject,
        text: newQ.text,
        options: newQ.options,
        correct_answer: newQ.correct,
        score: newQ.score,
        difficulty: _diffToApi(newQ.level),
        source: 'manual',
      }, token)
        .then(() => { apiQuestionsRes.reload(); setMode('list'); })
        .catch(err => { console.warn('createQuestion failed:', err); showApiToast("⚠ Savol saqlab bo'lmadi"); });
      setNewQ({ text:'', type:"Ko'p tanlovli", subject: allSubjects[0] || 'Matematika', level:"O'rta", score:3, options:['','','',''], correct:0 });
      return;
    }
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
    setNewQ({ text:'', type:"Ko'p tanlovli", subject: allSubjects[0] || 'Matematika', level:"O'rta", score:3, options:['','','',''], correct:0 });
    setMode('list');
  };

  const saveAiQuestions = () => {
    if (!aiResult || aiResult.length === 0) return;
    if (isApi) {
      _createApiBulk(aiResult, 'ai')
        .then(() => { apiQuestionsRes.reload(); setAiResult(null); setMode('list'); })
        .catch(err => { console.warn('createQuestion (ai) failed:', err); showApiToast("⚠ Savollar saqlab bo'lmadi"); });
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
      _createApiBulk(pdfResult, 'pdf')
        .then(() => { apiQuestionsRes.reload(); setPdfResult(null); setPdfFile(null); setMode('list'); })
        .catch(err => { console.warn('createQuestion (pdf) failed:', err); showApiToast("⚠ Savollar saqlab bo'lmadi"); });
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
    <div className="p-6 space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Savol yaratuvchi</h2>
          <p className="text-white/40 text-sm">{questions.length} ta savol · {allSubjects.length} ta fan</p>
        </div>
        {mode === 'list' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setMode('manual')} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="edit" size={14} /> Qo'lda yaratish</button>
            <button onClick={() => setMode('ai')} className="btn-primary text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="sparkles" size={14} /> AI orqali</button>
            <button onClick={() => setMode('pdf')} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 border-cyan-500/30 text-cyan-300"><Icon name="upload" size={14} /> PDF dan</button>
          </div>
        )}
        {mode !== 'list' && <button onClick={() => { setMode('list'); setAiResult(null); setPdfResult(null); }} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5"><Icon name="arrowLeft" size={14} /> Orqaga</button>}
      </div>

      {/* LIST MODE */}
      {mode === 'list' && (
        <>
          <div className="flex flex-wrap gap-3">
            <select className="input-field py-2.5 w-auto flex-1 min-w-32" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
              <option value="">Barcha fanlar</option>
              {allSubjects.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="input-field py-2.5 w-auto" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
              <option value="">Barcha darajalar</option>
              {LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={() => setNewSubjectModal(true)} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 border-dashed border-white/20 text-white/40">
              <Icon name="plus" size={14} /> Yangi fan qo'shish
            </button>
          </div>

          <div className="space-y-3">
            {filtered.length === 0 && <EmptyState icon="book" title="Savollar yo'q" desc="Yangi savol yarating" action={<button onClick={() => setMode('manual')} className="btn-primary px-4 py-2 rounded-xl text-sm">Savol yaratish</button>} />}
            {filtered.map(q => (
              <div key={q.id} className="glass rounded-2xl p-4 flex gap-4 group">
                <div className={`w-2 rounded-full flex-shrink-0 ${q.difficulty === 'Oson' ? 'bg-emerald-400' : q.difficulty === "O'rta" ? 'bg-amber-400' : 'bg-rose-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 mb-2 leading-relaxed">{q.text}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <SubjectBadge subject={q.subject} />
                    {q.source && <span className="chip glass text-white/50 text-xs">{q.source === 'ai' ? '✨ AI' : q.source === 'pdf' ? '📄 PDF' : '✏️ Qo\'lda'}</span>}
                    <span className={`chip text-xs ${q.difficulty === 'Oson' ? 'bg-emerald-500/10 text-emerald-400' : q.difficulty === "O'rta" ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{q.difficulty}</span>
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-white/40 hover:text-indigo-400 transition-colors p-1.5"><Icon name="edit" size={15} /></button>
                  <button onClick={() => setDeleteId(q.id)} className="text-white/40 hover:text-red-400 transition-colors p-1.5"><Icon name="trash" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* MANUAL MODE */}
      {mode === 'manual' && (
        <div className="glass rounded-2xl p-6 space-y-5 animate-in">
          <h3 className="font-bold text-white">Yangi savol yaratish</h3>
          <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Savol matni</label>
            <textarea className="input-field" rows={3} placeholder="Savolingizni kiriting..." value={newQ.text} onChange={e => setNewQ({...newQ, text: e.target.value})} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Savol turi</label>
              <select className="input-field" value={newQ.type} onChange={e => setNewQ({...newQ, type: e.target.value})}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Fan</label>
              <select className="input-field" value={newQ.subject} onChange={e => setNewQ({...newQ, subject: e.target.value})}>
                {allSubjects.map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className="block text-xs text-white/50 mb-1.5 font-medium">Daraja</label>
              <select className="input-field" value={newQ.level} onChange={e => setNewQ({...newQ, level: e.target.value})}>
                {LEVELS.map(l => <option key={l}>{l}</option>)}
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
            <button onClick={() => setMode('list')} className="btn-ghost flex-1 py-3 rounded-xl">Bekor qilish</button>
            <button onClick={saveQuestion} disabled={!newQ.text} className="btn-primary flex-1 py-3 rounded-xl font-semibold disabled:opacity-50">Saqlash</button>
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
                <select className="input-field" value={aiForm.subject} onChange={e => setAiForm({...aiForm, subject: e.target.value})}>
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
                  {LEVELS.map(l => <option key={l}>{l}</option>)}
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
                  <button onClick={saveAiQuestions} className="btn-primary text-xs px-4 py-1.5 rounded-xl font-semibold">Hammasini saqlash</button>
                </div>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {aiResult.slice(0,5).map((q,i) => (
                  <div key={i} className="glass rounded-xl p-3 text-sm text-white/70">{i+1}. {q.text}</div>
                ))}
                {aiResult.length > 5 && <div className="text-xs text-white/30 text-center">+ {aiResult.length - 5} ta savol ko'rsatilmagan</div>}
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
            <label className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group">
              <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">📄</div>
              <div className="text-sm font-medium text-white/60 mb-1">{pdfFile || 'PDF faylni shu yerga tashlang'}</div>
              <div className="text-xs text-white/30">yoki bosib tanlang</div>
              <input type="file" accept=".pdf" className="hidden" onChange={handlePDF} />
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
                <div className="text-sm font-bold text-white">{pdfResult.length} ta savol ajratildi</div>
                <div className="flex gap-2">
                  <button onClick={savePdfQuestions} className="btn-primary text-xs px-4 py-1.5 rounded-xl font-semibold">Saqlash</button>
                </div>
              </div>
              {pdfResult.map((q,i) => <div key={i} className="glass rounded-xl p-3 text-sm text-white/70">{i+1}. {q.text}</div>)}
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
              // Backend'da DELETE endpointi hali yo'q — TODO: ulansin.
              showApiToast("⚠ API rejimida o'chirish hozircha mavjud emas");
              setDeleteId(null);
              return;
            }
            OlympyStore.deleteQuestion(deleteId);
            setDeleteId(null);
          }} className="btn-danger flex-1 py-3 rounded-xl font-semibold">O'chirish</button>
        </div>
      </Modal>

      {apiToast && (
        <div className="fixed bottom-6 right-6 z-50 glass-strong rounded-2xl px-5 py-3.5 border border-rose-500/30 animate-in text-sm font-medium text-white">{apiToast}</div>
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
        <main className="flex-1 overflow-y-auto">{content}</main>
      </div>
    </div>
  );
};

Object.assign(window, { QuestionCreatorPage });
