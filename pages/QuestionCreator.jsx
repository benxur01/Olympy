// pages/QuestionCreator.jsx

// Avval bu yerda alohida SUBJECTS ro'yxati qattiq kodlangan edi va Auth.jsx
// dagi SUBJECTS_LIST bilan sinxron emas edi. Endi global ro'yxatdan foydalanib,
// faqat unga ulanmagan paytda fallback ishlatamiz.
const SUBJECTS = (globalThis.SUBJECTS_LIST && globalThis.SUBJECTS_LIST.length > 0)
  ? globalThis.SUBJECTS_LIST
  : ['Matematika','Ingliz tili','Ona tili','Informatika','IT','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const LEVELS = ['Oson','O\'rta','Qiyin'];
const ENGLISH_LEVELS = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
// Savol turi label'lari. Birinchi uchtasi va "Kod" eski (o'zgarmadi);
// qolganlari yangi turlar. AI/PDF generatsiyasi faqat dastlabki uchta variantli
// turni qo'llab-quvvatlagani uchun bu ro'yxat AI test-turi select'ida emas,
// faqat qo'lda yaratishda to'liq ishlatiladi (pastda AI_TYPES ajratilgan).
const TYPES = [
  "Ko'p tanlovli",
  "To'g'ri/Noto'g'ri",
  'Qisqa javob',
  'Kod (dasturlash)',
  'Bir nechta to\'g\'ri (Multiple Select)',
  "Ha / Yo'q",
  'Essay (Katta matn)',
  "Bo'sh joy to'ldirish",
  "Ko'p bo'sh joy to'ldirish",
];
// AI/PDF generatori faqat klassik variantli turlarni biladi.
const AI_TYPES = ["Ko'p tanlovli", "To'g'ri/Noto'g'ri", 'Qisqa javob'];
// Label → backend question_type. Ko'p tanlovli/To'g'ri-Noto'g'ri `mcq` (vizual
// rejim); qolganlari 1:1. "Qisqa javob" — bitta matnli javob, shu sababli
// `fill_blank` (correct_text) ga maplanadi, 4 ta bo'sh variantli `mcq` emas.
// (Eslatma: AI/PDF generatsiyasi `aiForm.type`ni to'g'ridan-to'g'ri backendga
// yuboradi va u alohida 4-variantli testga aylantiradi — bu mapping faqat
// qo'lda saqlashga ta'sir qiladi.)
const TYPE_TO_BACKEND = {
  "Ko'p tanlovli": 'mcq',
  "To'g'ri/Noto'g'ri": 'mcq',
  'Qisqa javob': 'fill_blank',
  'Kod (dasturlash)': 'code',
  'Bir nechta to\'g\'ri (Multiple Select)': 'multiple_select',
  "Ha / Yo'q": 'yes_no',
  'Essay (Katta matn)': 'essay',
  "Bo'sh joy to'ldirish": 'fill_blank',
  "Ko'p bo'sh joy to'ldirish": 'fill_blanks',
};
// IT (kod) savollari uchun dasturlash tillari.
const CODE_LANGUAGES = [
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['java', 'Java'],
  ['cpp', 'C++'],
  ['c', 'C'],
];

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
  const [premiumLockDetail, setPremiumLockDetail] = React.useState('');
  const [mode, setMode] = React.useState('list'); // list | manual | ai | pdf
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterLevel, setFilterLevel] = React.useState('');
  const [aiForm, setAiForm] = React.useState({ subject: store.subjects[0] || 'Matematika', topic:'', count:10, level:'O\'rta', type:'Ko\'p tanlovli' });
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiResult, setAiResult] = React.useState(null);
  // AI savollar oylik limiti: backend /api/billing/limits/ -> ai_generations bloki
  const [aiLimits, setAiLimits] = React.useState({ used: 0, limit: 0, unlimited: false });
  const [pdfFile, setPdfFile] = React.useState(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [pdfResult, setPdfResult] = React.useState(null);
  const [pdfProvider, setPdfProvider] = React.useState('');
  const [pdfVision, setPdfVision] = React.useState(false);
  const [pdfWarning, setPdfWarning] = React.useState('');
  const [pdfChunks, setPdfChunks] = React.useState(1);
  const [newQ, setNewQ] = React.useState({ text:'', type:'Ko\'p tanlovli', subject: store.subjects[0] || 'Matematika', level:'O\'rta', score:3, options:['','','',''], correct:0, correctIndexes:[], correctText:'', blanks:[{ key:'1', answer:'' }], programmingLanguage:'python', codeTemplate:'', expectedOutput:'', testCases:[] });
  const [editingQuestionId, setEditingQuestionId] = React.useState(null);
  const [newSubjectModal, setNewSubjectModal] = React.useState(false);
  const [newSubject, setNewSubject] = React.useState('');
  const [deleteId, setDeleteId] = React.useState(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [bulkSaving, setBulkSaving] = React.useState(false);
  // Excel/CSV/Word import state'lari (natija banneri ikkala format uchun umumiy)
  const [importLoading, setImportLoading] = React.useState(false);
  const [importResult, setImportResult] = React.useState(null);
  const [importErrorsOpen, setImportErrorsOpen] = React.useState(false);
  const importInputRef = React.useRef(null);
  const wordInputRef = React.useRef(null);

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
    if (chosenLevel) return chosenLevel;
    const lvl = (level || '').trim().toLowerCase();
    if (lvl === 'beginner') return 'Beginner';
    if (lvl === 'elementary') return 'Elementary';
    if (lvl === 'pre-int' || lvl === 'pre-intermediate') return 'Pre-Intermediate';
    if (lvl === 'int' || lvl === 'intermediate') return 'Intermediate';
    if (lvl === 'upper-int' || lvl === 'upper-intermediate') return 'Upper-Intermediate';
    if (lvl === 'advanced') return 'Advanced';

    if (subject === 'Ingliz tili') {
      return level === 'easy' ? 'Beginner' : level === 'hard' ? 'Advanced' : 'Intermediate';
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

  // AI savollar oylik limitini backend'dan olib kelish. API rejimida va center
  // aniq bo'lganda ishlaydi; mount paytida va centerId o'zgarganda qayta so'raladi.
  React.useEffect(() => {
    if (!isApi || !myCenterId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await OlympyApi.getBillingLimits(OlympyApi.getToken(), myCenterId);
        const ai = res?.ai_generations;
        if (!cancelled && ai) {
          setAiLimits({
            used: ai.used || 0,
            limit: ai.limit || 0,
            unlimited: !!ai.unlimited,
          });
        }
      } catch (err) {
        // Limit ko'rsatkichi yo'qligi AI generatsiyani bloklamasligi kerak.
        console.warn('getBillingLimits failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isApi, myCenterId]);

  // AI generatsiya tugmasi holati: limit to'lganda bloklash uchun.
  const aiLimitReached = !aiLimits.unlimited && aiLimits.limit > 0 && aiLimits.used >= aiLimits.limit;
  const aiNearLimit = !aiLimits.unlimited && aiLimits.limit > 0 && aiLimits.used >= Math.ceil(aiLimits.limit * 0.8);

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
      // Generatsiya muvaffaqiyatli — mahalliy hisoblagichni oshiramiz (backend
      // bilan keyingi limit so'rovda to'liq sinxronlanadi). Cheksizda o'zgarmaydi.
      setAiLimits(prev => prev.unlimited ? prev : { ...prev, used: prev.used + 1 });
    } catch (err) {
      console.warn('generateAiQuestions failed:', err);
      if (err?.status === 403 && err?.data?.upgrade_required) {
        setPremiumLockDetail(err.data.detail || "AI yordamida savol yaratish faqat premium tashkilotlar uchun. Premium obunani faollashtiring.");
      } else {
        showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "AI savol yarata olmadi"}`);
      }
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
    if (!myCenterId) {
      // handleImport bilan bir xil guard — markaz aniqlanmasa, center'siz
      // so'rov yubormaymiz.
      showApiToast("⚠ Markaz aniqlanmadi");
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
      if (err?.status === 403 && err?.data?.upgrade_required) {
        setPremiumLockDetail(err.data.detail || "PDF tahlil orqali savollar ajratish faqat premium tashkilotlar uchun. Premium obunani faollashtiring.");
      } else {
        showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "PDF tahlil qilinmadi"}`);
      }
    } finally {
      setPdfLoading(false);
      e.target.value = '';
    }
  };

  // Excel/CSV import handler
  const handleImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isApi) {
      showApiToast("⚠ Import faqat akkaunt bilan kirgan rejimda ishlaydi");
      e.target.value = '';
      return;
    }
    if (!myCenterId) {
      showApiToast("⚠ Markaz aniqlanmadi");
      e.target.value = '';
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    setImportErrorsOpen(false);
    try {
      const backendCenterId = myCenter?.backendId ?? myCenterId;
      const res = await OlympyApi.importQuestionsExcel(backendCenterId, f, OlympyApi.getToken());
      setImportResult(res);
      // Savollar ro'yxatini qayta yuklash
      if (apiQuestionsRes.reload) apiQuestionsRes.reload();
      const msg = `${res.created || 0} ta savol qo'shildi`;
      const errCount = res.error_count || (res.errors || []).length;
      showApiToast(errCount ? `${msg}. ${errCount} ta xatolik bor.` : msg);
    } catch (err) {
      showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Import bo'lmadi"}`);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  // Word (.docx) import handler — Excel handler bilan bir xil oqim, faqat
  // boshqa API funksiyasi (importQuestionsWord). Natija banneri umumiy.
  const handleImportWord = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isApi) {
      showApiToast("⚠ Import faqat akkaunt bilan kirgan rejimda ishlaydi");
      e.target.value = '';
      return;
    }
    if (!myCenterId) {
      showApiToast("⚠ Markaz aniqlanmadi");
      e.target.value = '';
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    setImportErrorsOpen(false);
    try {
      const backendCenterId = myCenter?.backendId ?? myCenterId;
      const res = await OlympyApi.importQuestionsWord(backendCenterId, f, OlympyApi.getToken());
      setImportResult(res);
      // Savollar ro'yxatini qayta yuklash
      if (apiQuestionsRes.reload) apiQuestionsRes.reload();
      const msg = `${res.created || 0} ta savol qo'shildi`;
      const errCount = res.error_count || (res.errors || []).length;
      showApiToast(errCount ? `${msg}. ${errCount} ta xatolik bor.` : msg);
    } catch (err) {
      showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Import bo'lmadi"}`);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  // Namuna CSV template yuklab berish
  const downloadImportTemplate = () => {
    const header = "savol,variant_a,variant_b,variant_c,variant_d,togri_javob,qiyinlik,fan";
    const sample = "2+2 nechaga teng?,3,4,5,6,B,easy,Matematika";
    const csv = `﻿${header}\n${sample}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'olympy-savollar-namuna.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Word namuna (.docx) shablonini yuklab berish — backend python-docx bilan
  // jadval generatsiya qiladi (endpoint JWT himoyalangan, blob orqali keladi).
  const downloadWordTemplate = async () => {
    try {
      await OlympyApi.downloadWordTemplate(OlympyApi.getToken());
    } catch (err) {
      showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Word namunani yuklab bo'lmadi"}`);
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
    // PDF preview'da har savolni MCQ ↔ kod savoli sifatida belgilash mumkin
    // (q.question_type). Belgilanmagan bo'lsa default 'mcq'. AI savollarida bu
    // maydon yo'q — ular ham mcq bo'lib qoladi.
    question_type: q.question_type || 'mcq',
    source: source || q.source || 'manual',
  });

  const _createApiBulk = (items, source) => {
    const token = OlympyApi.getToken();
    return Promise.all(items.map(q => OlympyApi.createQuestion(_toApiQuestion(q, source), token)));
  };

  const startEditQuestion = (q) => {
    // mavjud savol ma'lumotlarini formga yuklash. `mcq` turida vizual rejim
    // (Multiple Choice / True-False / Short Answer) options soniga qarab
    // xulosa qilinadi; yangi turlar esa question_type orqali aniqlanadi.
    const backendType = q.questionType || q.question_type || 'mcq';
    const correctTextRaw = q.correctText ?? q.correct_text ?? '';
    let inferredType;
    if (backendType === 'code') {
      inferredType = 'Kod (dasturlash)';
    } else if (backendType === 'multiple_select') {
      inferredType = 'Bir nechta to\'g\'ri (Multiple Select)';
    } else if (backendType === 'yes_no') {
      inferredType = "Ha / Yo'q";
    } else if (backendType === 'essay') {
      inferredType = 'Essay (Katta matn)';
    } else if (backendType === 'fill_blank') {
      inferredType = "Bo'sh joy to'ldirish";
    } else if (backendType === 'fill_blanks') {
      inferredType = "Ko'p bo'sh joy to'ldirish";
    } else if (q.options && q.options.length === 2 && q.options.every(o => /to'?g'?ri|noto'?g'?ri/i.test(o))) {
      inferredType = "To'g'ri/Noto'g'ri";
    } else if (Array.isArray(q.options) && q.options.length > 0) {
      inferredType = "Ko'p tanlovli";
    } else {
      inferredType = 'Qisqa javob';
    }
    // multiple_select to'g'ri indekslari va fill_blanks javoblari correct_text
    // (JSON) ichida — formaga ochib yuklaymiz.
    let correctIndexes = [];
    let blanks = [{ key: '1', answer: '' }];
    let correctText = '';
    if (backendType === 'multiple_select') {
      try { const p = JSON.parse(correctTextRaw); if (Array.isArray(p)) correctIndexes = p.map(Number); } catch (_) {}
    } else if (backendType === 'fill_blanks') {
      try {
        const p = JSON.parse(correctTextRaw);
        if (p && typeof p === 'object') {
          const entries = Object.entries(p);
          if (entries.length) blanks = entries.map(([key, answer]) => ({ key: String(key), answer: String(answer) }));
        }
      } catch (_) {}
    } else if (backendType === 'fill_blank') {
      correctText = String(correctTextRaw || '');
    }
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
      correctIndexes,
      correctText,
      blanks,
      programmingLanguage: q.programmingLanguage || q.programming_language || 'python',
      codeTemplate: q.codeTemplate || q.code_template || '',
      expectedOutput: q.expectedOutput || q.expected_output || '',
      testCases: Array.isArray(q.test_cases) ? q.test_cases.map(tc => ({
        input: tc.input || '',
        expected_output: tc.expected_output || '',
        is_hidden: !!tc.is_hidden,
      })) : [],
    });
    setMode('manual');
  };

  // Bo'sh joy reset qiymati — saqlashdan keyin va bekor qilishda ishlatiladi.
  const _resetQ = () => ({ text:'', type:"Ko'p tanlovli", subject: allSubjects[0] || 'Matematika', level:"O'rta", score:3, options:['','','',''], correct:0, correctIndexes:[], correctText:'', blanks:[{ key:'1', answer:'' }], programmingLanguage:'python', codeTemplate:'', expectedOutput:'', testCases:[] });

  // Forma holatidan backend payload quradi va front validatsiyasini bajaradi.
  // Xatolik bo'lsa toast ko'rsatib null qaytaradi (saqlash to'xtaydi).
  const _buildManualPayload = () => {
    const backendType = TYPE_TO_BACKEND[newQ.type] || 'mcq';
    const base = {
      subject: newQ.subject,
      text: newQ.text,
      score: newQ.score,
      difficulty: _diffToApi(newQ.level, newQ.subject),
      question_type: backendType,
    };
    if (backendType === 'code') {
      return { ...base, programming_language: newQ.programmingLanguage,
        code_template: newQ.codeTemplate || '', expected_output: newQ.expectedOutput || '',
        test_cases: (newQ.testCases || []).filter(tc => tc.input.trim() || tc.expected_output.trim()),
        options: [], correct_answer: 0 };
    }
    if (backendType === 'essay') {
      return { ...base, options: [], correct_answer: 0, correct_text: '' };
    }
    if (backendType === 'yes_no') {
      return { ...base, options: ['Ha', "Yo'q"], correct_answer: newQ.correct === 1 ? 1 : 0, correct_text: '' };
    }
    if (backendType === 'fill_blank') {
      if (!String(newQ.correctText || '').trim()) { showApiToast("⚠ To'g'ri javobni kiriting"); return null; }
      return { ...base, options: [], correct_answer: 0, correct_text: String(newQ.correctText).trim() };
    }
    if (backendType === 'fill_blanks') {
      const entries = (newQ.blanks || []).filter(b => String(b.answer || '').trim());
      if (entries.length === 0) { showApiToast("⚠ Kamida bitta bo'sh joy javobini kiriting"); return null; }
      const map = {};
      entries.forEach((b, i) => { map[String(b.key || (i + 1))] = String(b.answer).trim(); });
      return { ...base, options: [], correct_answer: 0, correct_text: JSON.stringify(map) };
    }
    if (backendType === 'multiple_select') {
      const opts = (newQ.options || []).filter(o => String(o).trim());
      if (opts.length < 2) { showApiToast('⚠ Kamida 2 ta variant kiriting'); return null; }
      // Indekslar to'liq (bo'sh bo'lmagan) variantlar ro'yxatiga moslab qayta hisoblanadi.
      const validIndexes = (newQ.correctIndexes || [])
        .map(idx => { const val = newQ.options[idx]; return opts.indexOf(val); })
        .filter(i => i >= 0);
      const uniq = [...new Set(validIndexes)].sort((a, b) => a - b);
      if (uniq.length === 0) { showApiToast("⚠ Kamida bitta to'g'ri javobni belgilang"); return null; }
      return { ...base, options: opts, correct_answer: uniq[0], correct_text: JSON.stringify(uniq) };
    }
    // mcq (Ko'p tanlovli / To'g'ri-Noto'g'ri)
    // Bo'sh variantlarni olib tashlaymiz va to'g'ri javob indeksini qolgan
    // (to'ldirilgan) variantlar ro'yxatiga moslab qayta hisoblaymiz — to'rtta
    // bo'sh variant bilan yoki belgilangan to'g'ri javob bo'sh variantga
    // tushib qolgan holda saqlashni oldini olamiz.
    const mcqOpts = (newQ.options || []).filter(o => String(o).trim());
    if (mcqOpts.length < 2) { showApiToast('⚠ Kamida 2 ta variant kiriting'); return null; }
    const correctVal = newQ.options[newQ.correct];
    const newCorrect = (correctVal != null && String(correctVal).trim())
      ? mcqOpts.indexOf(correctVal)
      : -1;
    if (newCorrect < 0) { showApiToast("⚠ To'g'ri javobni to'ldirilgan variantlardan tanlang"); return null; }
    return { ...base, options: mcqOpts, correct_answer: newCorrect, question_type: 'mcq' };
  };

  const saveQuestion = () => {
    if (!newQ.text) return;
    const backendType = TYPE_TO_BACKEND[newQ.type] || 'mcq';
    // Kod savol uchun dasturlash tili majburiy.
    if (backendType === 'code' && !String(newQ.programmingLanguage || '').trim()) {
      showApiToast('⚠ Dasturlash tilini tanlang');
      return;
    }
    const isEditing = !!editingQuestionId;
    if (isApi) {
      const payload = _buildManualPayload();
      if (!payload) return;
      const token = OlympyApi.getToken();
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
      setNewQ(_resetQ());
      return;
    }
    // ─── Mock (lokal) rejim — backend yo'q, store'ga yangi turlar bilan yozamiz.
    const payload = _buildManualPayload();
    if (!payload) return;
    const storeFields = {
      subject: newQ.subject,
      text: newQ.text,
      options: payload.options || [],
      correctAnswer: payload.correct_answer ?? 0,
      score: newQ.score,
      difficulty: newQ.level,
      questionType: backendType,
      correctText: payload.correct_text || '',
    };
    if (isEditing) {
      OlympyStore.updateQuestion(editingQuestionId, storeFields);
    } else {
      OlympyStore.createQuestion({
        centerId: myCenterId,
        ...storeFields,
        source: 'manual',
        createdBy: user?.id,
      });
    }
    setNewQ(_resetQ());
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
      questionType: q.question_type || 'mcq',
      source: q.source || 'pdf',
      createdBy: user?.id,
    })));
    setPdfResult(null);
    setPdfFile(null);
    setPdfProvider('');
    setPdfVision(false);
    setMode('list');
  };

  const addCustomSubject = async () => {
    const name = (newSubject || '').trim();
    if (name && !allSubjects.includes(name)) {
      // API rejimida fanni backendga ham yozamiz, shunda boshqa
      // foydalanuvchilar/sahifalarda ham ko'rinadi. Lokal store'ga baribir
      // qo'shamiz — UI darhol yangilanadi va API xatosida fan yo'qolmaydi.
      OlympyStore.addSubject(name);
      if (isApi) {
        try {
          await OlympyApi.createSubject(name, OlympyApi.getToken());
        } catch (err) {
          console.warn('createSubject failed:', err);
          showApiToast(`⚠ ${OlympyApi.toUserMessage?.(err) || "Fan serverga saqlanmadi (faqat shu qurilmada)"}`);
        }
      }
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
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:gap-2 gap-2">
            <button onClick={() => setMode('manual')} className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="edit" size={14} /> <span className="hidden sm:inline">Qo'lda yaratish</span><span className="sm:hidden">Qo'lda</span></button>
            <button onClick={() => setMode('ai')} className="btn-primary text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5"><Icon name="sparkles" size={14} /> <span className="hidden sm:inline">AI orqali</span><span className="sm:hidden">AI</span></button>
            <button onClick={() => setMode('pdf')} className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-cyan-500/30 text-cyan-300"><Icon name="upload" size={14} /> <span className="hidden sm:inline">PDF dan</span><span className="sm:hidden">PDF</span></button>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importLoading}
              className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-emerald-500/30 text-emerald-300 disabled:opacity-50"
            >
              <Icon name="upload" size={14} />
              <span className="hidden sm:inline">{importLoading ? 'Yuklanmoqda...' : 'Excel/CSV import'}</span>
              <span className="sm:hidden">{importLoading ? '...' : 'Excel'}</span>
            </button>
            <button
              onClick={downloadImportTemplate}
              className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-white/10 text-white/60"
              title="Namuna CSV yuklab olish"
            >
              <Icon name="download" size={14} />
              <span className="hidden sm:inline">Namuna</span>
              <span className="sm:hidden">CSV</span>
            </button>
            <button
              onClick={() => wordInputRef.current?.click()}
              disabled={importLoading}
              className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-blue-500/30 text-blue-300 disabled:opacity-50"
            >
              <Icon name="upload" size={14} />
              <span className="hidden sm:inline">{importLoading ? 'Yuklanmoqda...' : 'Word import'}</span>
              <span className="sm:hidden">{importLoading ? '...' : 'Word'}</span>
            </button>
            <button
              onClick={downloadWordTemplate}
              className="btn-ghost text-xs px-3 md:px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 border-white/10 text-white/60"
              title="Word namuna (.docx) yuklab olish"
            >
              <Icon name="download" size={14} />
              <span className="hidden sm:inline">Word namuna</span>
              <span className="sm:hidden">Word</span>
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={handleImport}
            />
            <input
              ref={wordInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleImportWord}
            />
          </div>
        )}
        {mode !== 'list' && <button onClick={() => { setMode('list'); setAiResult(null); setPdfResult(null); setPdfProvider(''); setPdfVision(false); setEditingQuestionId(null); }} className="btn-ghost text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 w-full md:w-auto"><Icon name="arrowLeft" size={14} /> Orqaga</button>}
      </div>

      {/* Import natijasi banner */}
      {mode === 'list' && importResult && (
        <div className={`glass rounded-2xl p-3 md:p-4 border ${(importResult.error_count || 0) > 0 ? 'border-amber-500/30' : 'border-emerald-500/30'}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <span className="text-white font-semibold">{importResult.created || 0} ta savol qo'shildi</span>
              {(importResult.error_count || 0) > 0 && (
                <span className="text-amber-300 ml-2">{importResult.error_count} ta xato bor</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {(importResult.errors || []).length > 0 && (
                <button
                  onClick={() => setImportErrorsOpen(v => !v)}
                  className="btn-ghost text-xs px-3 py-1.5 rounded-xl"
                >{importErrorsOpen ? 'Yopish' : "Xatolarni ko'rish"}</button>
              )}
              <button
                onClick={() => { setImportResult(null); setImportErrorsOpen(false); }}
                className="text-white/40 hover:text-white"
              ><Icon name="x" size={16} /></button>
            </div>
          </div>
          {importErrorsOpen && (importResult.errors || []).length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto space-y-1 text-xs">
              {(importResult.errors || []).map((err, i) => (
                <div key={i} className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-rose-200">
                  <span className="font-bold mr-2">Qator {err.row}:</span>{err.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                    {(q.questionType === 'code' || q.question_type === 'code') && (
                      <span className="chip text-xs bg-sky-500/15 text-sky-300 border border-sky-500/25 font-bold">
                        {'</> '}{(q.programmingLanguage || q.programming_language || 'kod')}
                      </span>
                    )}
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
          {/* Ha / Yo'q — True/False ga o'xshash, lekin "Ha"/"Yo'q" yozuvi bilan */}
          {newQ.type === "Ha / Yo'q" && (
            <div className="flex gap-3">
              {['Ha', "Yo'q"].map((v,i) => (
                <button key={v} onClick={() => setNewQ({...newQ, correct: i, options: ['Ha', "Yo'q"]})}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm transition-all ${newQ.correct === i ? 'gradient-bg text-white' : 'glass text-white/50'}`}>{v}</button>
              ))}
            </div>
          )}
          {/* Multiple Select — bir nechta to'g'ri javob (checkbox bilan) */}
          {newQ.type === "Bir nechta to'g'ri (Multiple Select)" && (
            <div>
              <label className="block text-xs text-white/50 mb-2 font-medium">Javob variantlari (to'g'rilarini belgilang — bir nechta bo'lishi mumkin)</label>
              <div className="space-y-2">
                {newQ.options.map((opt, i) => {
                  const checked = (newQ.correctIndexes || []).includes(i);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button" onClick={() => {
                        const set = new Set(newQ.correctIndexes || []);
                        if (set.has(i)) set.delete(i); else set.add(i);
                        setNewQ({...newQ, correctIndexes: [...set].sort((a,b)=>a-b)});
                      }}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'gradient-bg text-white' : 'glass text-white/40'}`}>
                        {checked ? <Icon name="check" size={14} /> : String.fromCharCode(65+i)}
                      </button>
                      <input className="input-field py-2" placeholder={`${String.fromCharCode(65+i)} varianti`}
                        value={opt} onChange={e => { const o = [...newQ.options]; o[i] = e.target.value; setNewQ({...newQ, options: o}); }} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-white/35">Belgilangan barcha variantlar to'g'ri javob sifatida saqlanadi.</p>
            </div>
          )}
          {/* Essay — katta matn (avtomatik baholanmaydi, menejer qo'lda ball beradi) */}
          {newQ.type === 'Essay (Katta matn)' && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
              <p className="text-xs text-white/55 leading-relaxed">
                <Icon name="info" size={13} className="inline -mt-0.5 mr-1" />
                Essay savolda o'quvchi katta matn yozadi. Variant va to'g'ri javob belgilanmaydi —
                javob <strong>menejer tomonidan qo'lda baholanadi</strong>. Yuqorida ball maydonida maksimal ballni belgilang.
              </p>
            </div>
          )}
          {/* Bitta bo'sh joy to'ldirish / Qisqa javob — ikkalasi ham bitta
              matnli to'g'ri javob (fill_blank backend type). */}
          {(newQ.type === "Bo'sh joy to'ldirish" || newQ.type === 'Qisqa javob') && (
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">To'g'ri javob</label>
              <input className="input-field" placeholder="Masalan: Toshkent"
                value={newQ.correctText} onChange={e => setNewQ({...newQ, correctText: e.target.value})} />
              <p className="mt-2 text-[11px] text-white/35">
                {newQ.type === 'Qisqa javob'
                  ? "O'quvchi qisqa matnli javob yozadi va u shu to'g'ri javobga moslab tekshiriladi."
                  : <>Savol matnida bo'sh joyni <code className="text-white/50">___</code> bilan belgilashingiz mumkin. O'quvchi javobi shu matnga moslab tekshiriladi.</>}
              </p>
            </div>
          )}
          {/* Ko'p bo'sh joy to'ldirish */}
          {newQ.type === "Ko'p bo'sh joy to'ldirish" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-white/50 font-medium">Bo'sh joylar va javoblari</label>
                <button type="button"
                  onClick={() => {
                    const next = [...(newQ.blanks || [])];
                    next.push({ key: String(next.length + 1), answer: '' });
                    setNewQ({...newQ, blanks: next});
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg glass text-indigo-300 hover:text-indigo-200 font-semibold transition-all">
                  + Bo'sh joy qo'shish
                </button>
              </div>
              <p className="mb-2 text-[11px] text-white/35">Savol matnida bo'sh joylarni <code className="text-white/50">[blank]</code> yoki <code className="text-white/50">___</code> bilan belgilang. Har bir bo'sh joyga tartib bo'yicha javob kiriting.</p>
              <div className="space-y-2">
                {(newQ.blanks || []).map((b, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="w-12 text-center text-xs font-bold text-white/40 flex-shrink-0">#{b.key || idx + 1}</span>
                    <input className="input-field py-2" placeholder={`${idx + 1}-bo'sh joy javobi`}
                      value={b.answer} onChange={e => {
                        const next = [...newQ.blanks];
                        next[idx] = { ...next[idx], answer: e.target.value };
                        setNewQ({...newQ, blanks: next});
                      }} />
                    {(newQ.blanks || []).length > 1 && (
                      <button type="button"
                        onClick={() => {
                          const next = newQ.blanks.filter((_, i) => i !== idx).map((x, i) => ({ ...x, key: String(i + 1) }));
                          setNewQ({...newQ, blanks: next});
                        }}
                        className="text-rose-400 hover:text-rose-300 transition-colors p-2 rounded-lg glass flex-shrink-0">
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {newQ.type === 'Kod (dasturlash)' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Dasturlash tili</label>
                <div className="flex flex-wrap gap-2">
                  {CODE_LANGUAGES.map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setNewQ({ ...newQ, programmingLanguage: val })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${newQ.programmingLanguage === val ? 'gradient-bg text-white' : 'glass text-white/50 hover:text-white/70'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Boshlang'ich kod skelet <span className="text-white/35">(ixtiyoriy)</span></label>
                <CodeEditor
                  value={newQ.codeTemplate}
                  onChange={(code) => setNewQ({ ...newQ, codeTemplate: code })}
                  language={newQ.programmingLanguage}
                  height="160px"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Kutilgan natija <span className="text-white/35">(ixtiyoriy — AI/ustoz tekshiruvi uchun)</span></label>
                <textarea className="input-field font-mono text-xs" rows={3}
                  placeholder="Masalan: 120"
                  value={newQ.expectedOutput}
                  onChange={e => setNewQ({ ...newQ, expectedOutput: e.target.value })} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-white/50 font-medium">Test case'lar <span className="text-white/35">(Judge0 avtomatik tekshiruv uchun)</span></label>
                  <button type="button"
                    onClick={() => setNewQ({ ...newQ, testCases: [...(newQ.testCases || []), { input: '', expected_output: '', is_hidden: false }] })}
                    className="text-xs px-3 py-1.5 rounded-lg glass text-indigo-300 hover:text-indigo-200 font-semibold transition-all">
                    + Test case qo'shish
                  </button>
                </div>
                {(newQ.testCases || []).length === 0 && (
                  <p className="text-xs text-white/25 italic">Test case'lar yo'q. "+" tugmasini bosib qo'shing.</p>
                )}
                <div className="space-y-3">
                  {(newQ.testCases || []).map((tc, idx) => (
                    <div key={idx} className="glass rounded-xl p-3 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/40 font-semibold">#{idx + 1}</span>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={tc.is_hidden}
                              onChange={e => {
                                const updated = [...newQ.testCases];
                                updated[idx] = { ...updated[idx], is_hidden: e.target.checked };
                                setNewQ({ ...newQ, testCases: updated });
                              }}
                              className="w-3.5 h-3.5 accent-indigo-500" />
                            <span className="text-xs text-white/40">Yashirin</span>
                          </label>
                          <button type="button"
                            onClick={() => setNewQ({ ...newQ, testCases: newQ.testCases.filter((_, i) => i !== idx) })}
                            className="text-xs text-rose-400 hover:text-rose-300 transition-colors px-2 py-0.5 rounded glass">
                            O'chirish
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-white/35 mb-1">Kirish (stdin)</label>
                          <textarea className="input-field font-mono text-xs" rows={2}
                            placeholder="Masalan: 5"
                            value={tc.input}
                            onChange={e => {
                              const updated = [...newQ.testCases];
                              updated[idx] = { ...updated[idx], input: e.target.value };
                              setNewQ({ ...newQ, testCases: updated });
                            }} />
                        </div>
                        <div>
                          <label className="block text-[10px] text-white/35 mb-1">Kutilgan natija (stdout)</label>
                          <textarea className="input-field font-mono text-xs" rows={2}
                            placeholder="Masalan: 25"
                            value={tc.expected_output}
                            onChange={e => {
                              const updated = [...newQ.testCases];
                              updated[idx] = { ...updated[idx], expected_output: e.target.value };
                              setNewQ({ ...newQ, testCases: updated });
                            }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
              <div className="flex-1"><div className="font-bold text-white">AI Savol Generatori</div><div className="text-xs text-white/40">Mavzu bo'yicha avtomatik savollar yaratadi</div></div>
              {/* AI savollar oylik limit badge'i: cheksiz → ∞, aks holda used/limit
                  (to'lsa qizil, 80%+ sariq, aks holda indigo). */}
              {isApi && myCenterId && (
                aiLimits.unlimited ? (
                  <span className="chip text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 whitespace-nowrap">∞ AI</span>
                ) : aiLimits.limit > 0 ? (
                  <span className={`chip text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${aiLimitReached ? 'bg-rose-500/15 text-rose-300' : aiNearLimit ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{aiLimits.used} / {aiLimits.limit} AI</span>
                ) : null
              )}
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
                  {AI_TYPES.map(t => <option key={t}>{t}</option>)}
                </select></div>
            </div>
            <button onClick={generateAI} disabled={!aiForm.topic || aiLoading || aiLimitReached}
              title={aiLimitReached ? 'AI limit tugadi. Tarifni yangilang.' : undefined}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
              {aiLoading ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Yaratilmoqda...</>
              ) : <><Icon name="sparkles" size={18} /> AI orqali savol yaratish</>}
            </button>
            {aiLimitReached && (
              <div className="text-center text-xs font-bold text-rose-300">AI limit tugadi. Tarifni yangilang.</div>
            )}
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
              {pdfResult.map((q,i) => {
                const isCode = (q.question_type || 'mcq') === 'code';
                return (
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
                    {/* Savol turini MCQ ↔ kod savoli o'rtasida almashtirish.
                        Faqat PDF preview'da; saqlashda question_type backend'ga ketadi. */}
                    <button
                      type="button"
                      onClick={() => setPdfResult(prev => prev.map((item, idx) =>
                        idx === i ? { ...item, question_type: isCode ? 'mcq' : 'code' } : item
                      ))}
                      title={isCode ? "Kod savoli sifatida saqlanadi — bosib MCQ ga qaytaring" : "MCQ sifatida saqlanadi — bosib kod savoliga o'tkazing"}
                      className={`flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${isCode ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' : 'bg-white/5 text-white/40 border-white/10 hover:text-white/60'}`}
                    >
                      {isCode ? <>{'</> '}Kod savoli</> : 'MCQ'}
                    </button>
                  </div>
                  {!isCode && Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((option, optionIndex) => (
                        <div key={optionIndex}
                          className={`rounded-lg px-2 py-1 text-xs ${optionIndex === q.correctAnswer ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/50'}`}>
                          {String.fromCharCode(65 + optionIndex)}. {option}
                        </div>
                      ))}
                    </div>
                  )}
                  {isCode && (
                    <div className="text-[11px] text-indigo-300/70 pl-6">Bu savol kod (dasturlash) savoli sifatida saqlanadi. Variantlar o'rniga o'quvchi kod yozadi.</div>
                  )}
                </div>
                );
              })}
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
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 animate-in fade-in">
          <div className="glass-strong border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4 max-w-xs text-center shadow-2xl">
            <div className="relative flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-white/15 border-t-white border-r-white"></div>
              <div className="absolute animate-pulse text-white/80">
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

      {/* Premium Lock Modal */}
      <Modal open={!!premiumLockDetail} onClose={() => setPremiumLockDetail('')} title="Premium Imkoniyat">
        <div className="space-y-4 text-center py-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse mb-2">
            <Icon name="star" size={32} />
          </div>
          <h3 className="text-lg font-black text-white">Premium Obuna Kerak</h3>
          <p className="text-white/70 text-sm leading-relaxed">
            {premiumLockDetail}
          </p>
          {!!user?.roles?.owner ? (
            <div className="space-y-3 pt-2">
              <button
                onClick={() => {
                  setPremiumLockDetail('');
                  if (onNavigate) onNavigate('premium');
                }}
                className="btn-primary w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <Icon name="star" size={16} /> Premium Obunani faollashtirish
              </button>
              <button onClick={() => setPremiumLockDetail('')} className="btn-ghost w-full py-2.5 rounded-xl text-xs">
                Keyinroq
              </button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 leading-relaxed">
                Tashkilotingiz bepul tarifda. Ushbu funksiyani ishlatish uchun iltimos tashkilot direktoriga (egasiga) Premium obunani faollashtirishini so'rab murojaat qiling.
              </p>
              <button onClick={() => setPremiumLockDetail('')} className="btn-primary w-full py-3 rounded-xl font-bold">
                Tushunarli
              </button>
            </div>
          )}
        </div>
      </Modal>

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
