// store.jsx — Central mock state (users, centers, requests) with localStorage persistence

const OlympyStore = (() => {
  const KEY = 'olympy_store_v4';

  // ─── Phone normalization ─────────────────────────────────────────────────
  // "+998 90 123 45 67", "+998901234567", "998901234567", "90 123 45 67"
  // → "+998901234567"
  const normalizePhone = (raw) => {
    if (raw == null) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    const last9 = digits.slice(-9);
    if (last9.length !== 9) return '';
    return '+998' + last9;
  };

  // ─── Initial seed ────────────────────────────────────────────────────────
  const seed = () => ({
    users: [
      { id:'u1', name:'Ali Valiyev', phone:'+998901234567', password:'123456',
        roles:{ student:{ status:'approved', centerId:'c1' } },
        activeRole:'student', joined:'2026-03-15' },
      { id:'u2', name:'Sardor Usmonov', phone:'+998901234568', password:'123456',
        roles:{ owner:{ status:'approved', centerId:'c1' } },
        activeRole:'owner', joined:'2026-01-10' },
      { id:'u3', name:'Admin Bekmurodov', phone:'+998901234569', password:'123456',
        roles:{ admin:{ status:'approved' } },
        activeRole:'admin', joined:'2025-12-01' },
      { id:'u4', name:'Malika Toshmatova', phone:'+998901234570', password:'123456',
        roles:{
          teacher:{ status:'approved', centerId:'c1', subject:'Ingliz tili' },
          student:{ status:'approved', centerId:'c1' },
        },
        activeRole:'teacher', joined:'2026-03-20' },

      // Approved students at c1 (used by Manager dashboard)
      { id:'u5', name:'Jasur Normatov', phone:'+998901234571', password:'123456',
        roles:{ student:{ status:'approved', centerId:'c1', subject:'Fizika' } },
        activeRole:'student', joined:'2026-04-01', avgScore:75, olympiads:4 },
      { id:'u6', name:'Nilufar Karimova', phone:'+998901234572', password:'123456',
        roles:{ student:{ status:'approved', centerId:'c1', subject:'Kimyo' } },
        activeRole:'student', joined:'2026-04-10', avgScore:88, olympiads:2 },
      { id:'u7', name:'Sherzod Tursunov', phone:'+998901234573', password:'123456',
        roles:{ student:{ status:'approved', centerId:'c1', subject:'Biologiya' } },
        activeRole:'student', joined:'2026-04-15', avgScore:70, olympiads:1 },

      // Pending student requests at c1 (Manager has work to do)
      { id:'u8', name:'Bobur Xolmatov', phone:'+998901234580', password:'123456',
        roles:{ student:{ status:'pending', centerId:'c1', subject:'Matematika' } },
        activeRole:'student', joined:'2026-04-27' },
      { id:'u9', name:'Zulfiya Yusupova', phone:'+998901234581', password:'123456',
        roles:{ student:{ status:'pending', centerId:'c1', subject:'Ingliz tili' } },
        activeRole:'student', joined:'2026-04-27' },
      { id:'u10', name:'Otabek Mirzayev', phone:'+998901234582', password:'123456',
        roles:{ student:{ status:'pending', centerId:'c1', subject:'Fizika' } },
        activeRole:'student', joined:'2026-04-26' },
      { id:'u11', name:'Kamola Hasanova', phone:'+998901234583', password:'123456',
        roles:{ student:{ status:'approved', centerId:'c1', subject:'Kimyo' } },
        activeRole:'student', joined:'2026-04-25' },
      { id:'u12', name:'Eldor Raximov', phone:'+998901234584', password:'123456',
        roles:{ student:{ status:'rejected', centerId:'c1', subject:'Biologiya' } },
        activeRole:'student', joined:'2026-04-24' },

      // Pending teacher request at c1 (Owner has work to do)
      { id:'u13', name:"Sevara Yo'ldosheva", phone:'+998901234585', password:'123456',
        roles:{ teacher:{ status:'pending', centerId:'c1', subject:'Matematika' } },
        activeRole:'teacher', joined:'2026-04-28' },

      // Pending manager request at c1
      { id:'u14', name:'Aziz Karimov', phone:'+998901234586', password:'123456',
        roles:{ manager:{ status:'pending', centerId:'c1' } },
        activeRole:'manager', joined:'2026-04-28' },

      // Approved manager created by director
      { id:'u16', name:'Javohir Manager', phone:'+998901234588', password:'123456',
        roles:{ manager:{ status:'approved', centerId:'c1' } },
        activeRole:'manager', joined:'2026-04-30' },

      // Pending center owner with pending center (Admin has work to do)
      { id:'u15', name:"Dilnoza Sa'dullayeva", phone:'+998901234587', password:'123456',
        roles:{ owner:{ status:'pending', centerId:'c6' } },
        activeRole:'owner', joined:'2026-04-29' },
    ],
    centers: [
      { id:'c1', name:'ProSkill Academy', organizationType:"O'quv markaz", country:"O'zbekiston", region:'Toshkent shahri', district:'Yunusobod', city:'Yunusobod', ownerId:'u2', status:'approved',
        subjects:['Matematika','Fizika','Informatika'], rating:4.8, students:234, olympiads:12, createdAt:'2025-12-01' },
      { id:'c2', name:'Brilliant Education', organizationType:"O'quv markaz", country:"O'zbekiston", region:'Samarqand viloyati', district:'Samarqand', city:'Samarqand', ownerId:null, status:'approved',
        subjects:['Ingliz tili','Ona tili'], rating:4.6, students:187, olympiads:8 },
      { id:'c3', name:'Leader Academy', organizationType:'Maktab', country:"O'zbekiston", region:'Toshkent viloyati', district:'Qibray', city:'Qibray', ownerId:null, status:'approved',
        subjects:['Matematika','Kimyo','Biologiya'], rating:4.9, students:312, olympiads:18 },
      { id:'c4', name:"Najot Ta'lim", organizationType:'Online academy', country:"O'zbekiston", region:'Buxoro viloyati', district:'Buxoro', city:'Buxoro', ownerId:null, status:'approved',
        subjects:['Informatika','Fizika'], rating:4.7, students:145, olympiads:7 },
      { id:'c5', name:'IT Park Academy', organizationType:'Tashkilot', country:"O'zbekiston", region:'Toshkent shahri', district:'Mirzo Ulug‘bek', city:'Mirzo Ulug‘bek', ownerId:null, status:'approved',
        subjects:['Informatika','Matematika'], rating:4.8, students:278, olympiads:14 },
      // Pending center for Admin to approve
      { id:'c6', name:'Tech Innovate', organizationType:'Tashkilot', country:"O'zbekiston", region:'Toshkent shahri', district:'Chilonzor', city:'Chilonzor', ownerId:'u15', status:'pending',
        subjects:['Informatika','Matematika'], rating:0, students:0, olympiads:0, createdAt:'2026-04-29' },
    ],
    // Mirror role-requests for admin/owner/manager tables (single source of truth via role.status,
    // but we keep a request log for human-readable pending queues)
    requests: [
      { id:'r1', type:'student',  userId:'u8',  centerId:'c1', status:'pending',  date:'2026-04-27' },
      { id:'r2', type:'student',  userId:'u9',  centerId:'c1', status:'pending',  date:'2026-04-27' },
      { id:'r3', type:'student',  userId:'u10', centerId:'c1', status:'pending',  date:'2026-04-26' },
      { id:'r4', type:'student',  userId:'u11', centerId:'c1', status:'approved', date:'2026-04-25' },
      { id:'r5', type:'student',  userId:'u12', centerId:'c1', status:'rejected', date:'2026-04-24' },
      { id:'r6', type:'teacher',  userId:'u13', centerId:'c1', subject:'Matematika', status:'pending', date:'2026-04-28' },
      { id:'r7', type:'manager',  userId:'u14', centerId:'c1', status:'pending', date:'2026-04-28' },
      { id:'r8', type:'center',   userId:'u15', centerId:'c6', status:'pending', date:'2026-04-29' },
    ],
    // Sample subjects (extendable via admin / question creator)
    subjects: ['Matematika','Ingliz tili','Ona tili','Informatika','Fizika','Kimyo','Biologiya','Tarix','Geografiya'],
    // Question bank — questions belong to a center
    questions: [
      { id:'q1', centerId:'c1', subject:'Matematika', text:'2x + 5 = 13 tenglamasida x ning qiymatini toping.', options:['x = 2','x = 3','x = 4','x = 5'], correctAnswer:2, score:3, difficulty:"O'rta", source:'manual', createdBy:'u4' },
      { id:'q2', centerId:'c1', subject:'Matematika', text:"Agar a = 3 va b = 4 bo'lsa, a² + b² qiymatini hisoblang.", options:['20','25','30','35'], correctAnswer:1, score:3, difficulty:'Oson', source:'manual', createdBy:'u4' },
      { id:'q3', centerId:'c1', subject:'Matematika', text:"Pythagoras teoremasi faqat to'g'ri burchakli uchburchaklarga tatbiq etiladi.", options:["To'g'ri","Noto'g'ri"], correctAnswer:0, score:2, difficulty:'Oson', source:'manual', createdBy:'u4' },
      { id:'q4', centerId:'c1', subject:'Matematika', text:"100 ning kvadrat ildizini hisoblang.", options:['8','9','10','11'], correctAnswer:2, score:2, difficulty:'Oson', source:'ai', createdBy:'u4' },
      { id:'q5', centerId:'c1', subject:'Matematika', text:'Aylana yuzasi formulasi qaysi?', options:['πr','2πr','πr²','2πr²'], correctAnswer:2, score:3, difficulty:"O'rta", source:'manual', createdBy:'u4' },
      { id:'q6', centerId:'c1', subject:'Matematika', text:'5! (5 faktorial) ning qiymati qancha?', options:['60','100','120','150'], correctAnswer:2, score:3, difficulty:"O'rta", source:'ai', createdBy:'u4' },
      { id:'q7', centerId:'c1', subject:'Matematika', text:"Ikkita son yig'indisi 20, ularning ko'paytmasi 96. Kichik son qancha?", options:['6','8','10','12'], correctAnswer:1, score:4, difficulty:'Qiyin', source:'manual', createdBy:'u4' },
      { id:'q8', centerId:'c1', subject:'Matematika', text:'log₂(8) ning qiymatini toping.', options:['2','3','4','8'], correctAnswer:1, score:3, difficulty:"O'rta", source:'manual', createdBy:'u4' },
      { id:'q9', centerId:'c1', subject:'Matematika', text:'sin(90°) = 1 — bu to\'g\'rimi?', options:["To'g'ri","Noto'g'ri"], correctAnswer:0, score:2, difficulty:'Oson', source:'manual', createdBy:'u4' },
      { id:'q10', centerId:'c1', subject:'Matematika', text:"To'g'ri burchakli uchburchakda katetlar 3 va 4 ga teng. Gipotenuza nechaga teng?", options:['5','6','7','8'], correctAnswer:0, score:3, difficulty:'Oson', source:'pdf', createdBy:'u4' },
    ],
    // Events — olimpiada is public, musobaqa is center-internal.
    olympiads: [
      { id:'o1', centerId:'c1', eventType:'olympiad', title:'Matematika Olimpiadasi — May 2026', subject:'Matematika', testLevel:'Beginner', testType:'mixed', startDate:'2026-05-02', startTime:'10:00', duration:60, questionIds:['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10'], status:'active', createdBy:'u2', createdAt:'2026-04-20', participants:124, maxScore:100 },
      { id:'o2', centerId:'c1', eventType:'competition', title:'Ingliz tili Bellashuvi', subject:'Ingliz tili', startDate:'2026-05-05', startTime:'14:00', duration:45, questionIds:[], status:'draft', createdBy:'u2', createdAt:'2026-04-22', participants:0, maxScore:100 },
      { id:'o3', centerId:'c1', eventType:'olympiad', title:'Informatika Olimpiadasi', subject:'Informatika', startDate:'2026-04-28', startTime:'09:00', duration:90, questionIds:[], status:'finished', createdBy:'u2', createdAt:'2026-04-10', participants:201, maxScore:100, avgScore:81 },
      { id:'o4', centerId:'c1', eventType:'competition', title:'Fizika Sinovlari', subject:'Fizika', startDate:'2026-05-10', startTime:'11:00', duration:60, questionIds:[], status:'draft', createdBy:'u2', createdAt:'2026-04-25', participants:0, maxScore:100 },
      { id:'o5', centerId:'c2', eventType:'olympiad', title:'Ingliz tili Olimpiada — Brilliant', subject:'Ingliz tili', startDate:'2026-05-08', startTime:'10:00', duration:45, questionIds:[], status:'active', createdBy:null, createdAt:'2026-04-22', participants:42, maxScore:100 },
    ],
    // Test attempts — student submission history
    attempts: [
      { id:'a1', userId:'u1', olympiadId:'o3', answers:{}, score:87, correctCount:35, wrongCount:5, totalQuestions:40, timeSpent:1455, rank:3, submittedAt:'2026-04-28T11:30:00Z' },
      { id:'a2', userId:'u4', olympiadId:'o3', answers:{}, score:91, correctCount:38, wrongCount:2, totalQuestions:40, timeSpent:1320, rank:1, submittedAt:'2026-04-28T11:25:00Z' },
      { id:'a3', userId:'u5', olympiadId:'o3', answers:{}, score:75, correctCount:30, wrongCount:10, totalQuestions:40, timeSpent:1620, rank:8, submittedAt:'2026-04-28T11:32:00Z' },
    ],
    // Notifications — Telegram-style mock per user
    notifications: [
      { id:'n1', userId:'u2', centerId:'c1', type:'student_join_request', title:'Yangi o\'quvchi arizasi', message:"Bobur Xolmatov ProSkill Academy markaziga qo'shilish uchun ariza yubordi.", isRead:false, createdAt:'2026-04-27T09:10:00Z' },
      { id:'n2', userId:'u2', centerId:'c1', type:'student_join_request', title:'Yangi o\'quvchi arizasi', message:"Zulfiya Yusupova ProSkill Academy markaziga qo'shilish uchun ariza yubordi.", isRead:false, createdAt:'2026-04-27T10:25:00Z' },
      { id:'n3', userId:'u1', centerId:'c1', type:'olympiad_published', title:'Yangi olimpiada', message:'ProSkill Academy markazida Matematika Olimpiadasi — May 2026 e\'lon qilindi.', isRead:false, createdAt:'2026-04-20T08:00:00Z' },
    ],
  });

  // ─── State load/save ─────────────────────────────────────────────────────
  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : seed();
  } catch { state = seed(); }

  const listeners = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };
  const notify = () => listeners.forEach(fn => { try { fn(); } catch {} });
  const set = (mutator) => {
    state = typeof mutator === 'function' ? mutator(state) : { ...state, ...mutator };
    save(); notify();
  };

  // ─── Lookups ─────────────────────────────────────────────────────────────
  const phoneExists = (raw) => {
    const norm = normalizePhone(raw);
    return !!norm && state.users.some(u => u.phone === norm);
  };
  const findUserByPhone = (raw) => {
    const norm = normalizePhone(raw);
    return norm ? state.users.find(u => u.phone === norm) : null;
  };
  const findUser = (id) => state.users.find(u => u.id === id) || null;
  const findCenter = (id) => state.centers.find(c => c.id === id) || null;

  // ─── User mutations ──────────────────────────────────────────────────────
  const createUser = ({ name, phone, password }) => {
    const norm = normalizePhone(phone);
    if (!norm) throw new Error('Telefon raqam noto\'g\'ri');
    if (phoneExists(norm)) throw new Error('Bu telefon raqam avval ro\'yxatdan o\'tgan');
    const id = 'u' + Date.now() + Math.random().toString(36).slice(2,5);
    const user = {
      id, name, phone: norm, password,
      roles: {}, activeRole: null,
      joined: new Date().toISOString().slice(0,10),
    };
    set(s => ({ ...s, users: [...s.users, user] }));
    return user;
  };

  const setRole = (userId, role, data) => {
    set(s => ({
      ...s,
      users: s.users.map(u => u.id === userId ? { ...u, roles: { ...u.roles, [role]: { ...(u.roles[role]||{}), ...data } } } : u),
    }));
  };

  const setActiveRole = (userId, role) => {
    set(s => ({ ...s, users: s.users.map(u => u.id === userId ? { ...u, activeRole: role } : u) }));
  };

  // ─── Center mutations ────────────────────────────────────────────────────
  const createCenter = (data) => {
    const id = 'c' + Date.now() + Math.random().toString(36).slice(2,5);
    const center = {
      id, status: 'pending', students: 0, olympiads: 0, rating: 0, subjects: [],
      organizationType: "O'quv markaz",
      country: "O'zbekiston",
      region: '',
      district: '',
      createdAt: new Date().toISOString().slice(0,10),
      ...data,
    };
    set(s => ({ ...s, centers: [...s.centers, center] }));
    return center;
  };
  const updateCenter = (id, patch) => {
    set(s => ({ ...s, centers: s.centers.map(c => c.id === id ? { ...c, ...patch } : c) }));
  };

  // ─── Request mutations ───────────────────────────────────────────────────
  const createRequest = (data) => {
    const id = 'r' + Date.now() + Math.random().toString(36).slice(2,5);
    const req = {
      id, status: 'pending',
      date: new Date().toISOString().slice(0,10),
      ...data,
    };
    set(s => ({ ...s, requests: [...s.requests, req] }));
    return req;
  };
  const updateRequest = (id, patch) => {
    set(s => ({ ...s, requests: s.requests.map(r => r.id === id ? { ...r, ...patch } : r) }));
  };

  // ─── High-level approval flows ───────────────────────────────────────────
  const approveRequest = (requestId) => {
    const req = state.requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    if (req.type === 'student') {
      setRole(req.userId, 'student', { status:'approved', centerId:req.centerId, subject:req.subject });
    } else if (req.type === 'teacher') {
      setRole(req.userId, 'teacher', { status:'approved', centerId:req.centerId, subject:req.subject });
    } else if (req.type === 'manager') {
      setRole(req.userId, 'manager', { status:'approved', centerId:req.centerId });
    } else if (req.type === 'center') {
      // Approving the center registration: activate center + activate owner role
      updateCenter(req.centerId, { status:'approved' });
      if (req.userId) setRole(req.userId, 'owner', { status:'approved', centerId:req.centerId });
    }
    updateRequest(requestId, { status:'approved' });
  };

  const rejectRequest = (requestId) => {
    const req = state.requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    if (req.type === 'student') {
      setRole(req.userId, 'student', { status:'rejected', centerId:req.centerId });
    } else if (req.type === 'teacher') {
      setRole(req.userId, 'teacher', { status:'rejected', centerId:req.centerId });
    } else if (req.type === 'manager') {
      setRole(req.userId, 'manager', { status:'rejected', centerId:req.centerId });
    } else if (req.type === 'center') {
      updateCenter(req.centerId, { status:'rejected' });
      if (req.userId) setRole(req.userId, 'owner', { status:'rejected', centerId:req.centerId });
    }
    updateRequest(requestId, { status:'rejected' });
  };

  // ─── Subjects ────────────────────────────────────────────────────────────
  const addSubject = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    set(s => s.subjects.includes(trimmed) ? s : { ...s, subjects: [...s.subjects, trimmed] });
  };

  // ─── Questions ───────────────────────────────────────────────────────────
  const createQuestion = (data) => {
    const id = 'q' + Date.now() + Math.random().toString(36).slice(2,5);
    const q = { id, score: 3, difficulty: "O'rta", source: 'manual', options: [], correctAnswer: 0, ...data };
    set(s => ({ ...s, questions: [...s.questions, q] }));
    return q;
  };
  const createQuestionsBulk = (arr) => {
    const ts = Date.now();
    const created = arr.map((q, i) => ({
      id: 'q' + ts + i + Math.random().toString(36).slice(2,4),
      score: 3, difficulty: "O'rta", source: 'manual', options: [], correctAnswer: 0,
      ...q,
    }));
    set(s => ({ ...s, questions: [...s.questions, ...created] }));
    return created;
  };
  const updateQuestion = (id, patch) => {
    set(s => ({ ...s, questions: s.questions.map(q => q.id === id ? { ...q, ...patch } : q) }));
  };
  const deleteQuestion = (id) => {
    set(s => ({ ...s, questions: s.questions.filter(q => q.id !== id) }));
  };

  // ─── Olympiads ───────────────────────────────────────────────────────────
  const createOlympiad = (data) => {
    const id = 'o' + Date.now() + Math.random().toString(36).slice(2,5);
    const o = {
      id, eventType: 'competition', status: 'draft', questionIds: [], participants: 0, maxScore: 100,
      createdAt: new Date().toISOString().slice(0,10),
      ...data,
    };
    set(s => ({ ...s, olympiads: [...s.olympiads, o] }));
    return o;
  };
  const updateOlympiad = (id, patch) => {
    set(s => ({ ...s, olympiads: s.olympiads.map(o => o.id === id ? { ...o, ...patch } : o) }));
  };
  const publishOlympiad = (id) => {
    const o = state.olympiads.find(x => x.id === id);
    if (!o) return;
    updateOlympiad(id, { status: 'active' });
    const isPublic = (o.eventType || 'competition') === 'olympiad';
    const approvedStudents = state.users.filter(u => {
      const student = u.roles?.student;
      if (student?.status !== 'approved') return false;
      return isPublic || student.centerId === o.centerId;
    });
    const center = state.centers.find(c => c.id === o.centerId);
    approvedStudents.forEach(u => {
      addNotification({
        userId: u.id,
        centerId: o.centerId,
        type: 'olympiad_published',
        title: isPublic ? 'Yangi olimpiada' : 'Yangi musobaqa',
        message: `${center?.name || 'Markaz'}da yangi ${isPublic ? 'olimpiada' : 'musobaqa'} e'lon qilindi:\nFan: ${o.subject}\n${o.testLevel ? `Daraja: ${o.testLevel}\n` : ''}${o.testType ? `Test turi: ${testTypeLabel(o.testType)}\n` : ''}Sana: ${o.startDate}\nQatnashish uchun platformaga kiring.`,
      });
    });
  };

  // ─── Attempts ────────────────────────────────────────────────────────────
  const recordAttempt = (data) => {
    const id = 'a' + Date.now() + Math.random().toString(36).slice(2,5);
    const a = {
      id,
      submittedAt: new Date().toISOString(),
      ...data,
    };
    set(s => ({ ...s, attempts: [...s.attempts, a] }));
    // Increment participants on the olympiad
    if (a.olympiadId) {
      const olympiad = state.olympiads.find(o => o.id === a.olympiadId);
      if (olympiad) updateOlympiad(a.olympiadId, { participants: (olympiad.participants || 0) + 1 });
    }
    return a;
  };

  // ─── Notifications ───────────────────────────────────────────────────────
  const addNotification = (data) => {
    const id = 'n' + Date.now() + Math.random().toString(36).slice(2,5);
    const n = {
      id, isRead: false, createdAt: new Date().toISOString(),
      ...data,
    };
    set(s => ({ ...s, notifications: [...s.notifications, n] }));
    return n;
  };
  const markNotificationRead = (id) => {
    set(s => ({ ...s, notifications: s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n) }));
  };
  const markAllNotificationsRead = (userId) => {
    set(s => ({ ...s, notifications: s.notifications.map(n => n.userId === userId ? { ...n, isRead: true } : n) }));
  };

  // ─── Override approveRequest/rejectRequest to send notifications ─────────
  // (we re-define below to include side-effects)
  const _approveRequestBase = approveRequest;
  const _rejectRequestBase = rejectRequest;
  const approveRequestWithNotify = (requestId) => {
    const req = state.requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    _approveRequestBase(requestId);
    // Notify the requesting user
    if (req.userId) {
      const center = state.centers.find(c => c.id === req.centerId);
      const labels = { student: "O'quvchi", teacher: "O'qituvchi", manager: 'Manager', center: 'Markaz' };
      addNotification({
        userId: req.userId,
        centerId: req.centerId,
        type: req.type + '_approved',
        title: `${labels[req.type] || ''} arizangiz tasdiqlandi`,
        message: req.type === 'center'
          ? `Sizning ${center?.name || 'markaz'} markaz arizangiz Platform Admin tomonidan tasdiqlandi.`
          : `${center?.name || 'Markaz'}: ${labels[req.type] || ''} arizangiz tasdiqlandi.`,
      });
    }
  };
  const rejectRequestWithNotify = (requestId) => {
    const req = state.requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return;
    _rejectRequestBase(requestId);
    if (req.userId) {
      const center = state.centers.find(c => c.id === req.centerId);
      const labels = { student: "O'quvchi", teacher: "O'qituvchi", manager: 'Manager', center: 'Markaz' };
      addNotification({
        userId: req.userId,
        centerId: req.centerId,
        type: req.type + '_rejected',
        title: `${labels[req.type] || ''} arizangiz rad etildi`,
        message: req.type === 'center'
          ? `Sizning ${center?.name || 'markaz'} markaz arizangiz Platform Admin tomonidan rad etildi.`
          : `${center?.name || 'Markaz'}: ${labels[req.type] || ''} arizangiz rad etildi.`,
      });
    }
  };

  // ─── Subscription ────────────────────────────────────────────────────────
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const getState = () => state;

  // For dev: window.OlympyStore.reset() in console wipes localStorage and reseeds
  const reset = () => { state = seed(); save(); notify(); };

  return {
    normalizePhone, phoneExists, findUserByPhone, findUser, findCenter,
    createUser, setRole, setActiveRole,
    createCenter, updateCenter,
    createRequest, updateRequest,
    // Approval (with notifications)
    approveRequest: approveRequestWithNotify,
    rejectRequest: rejectRequestWithNotify,
    approveRequestRaw: approveRequest,
    rejectRequestRaw: rejectRequest,
    // Subjects
    addSubject,
    // Questions
    createQuestion, createQuestionsBulk, updateQuestion, deleteQuestion,
    // Olympiads
    createOlympiad, updateOlympiad, publishOlympiad,
    // Attempts
    recordAttempt,
    // Notifications
    addNotification, markNotificationRead, markAllNotificationsRead,
    // Misc
    subscribe, getState, reset,
  };
})();

// ─── React hook ────────────────────────────────────────────────────────────
const useStore = () => {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => OlympyStore.subscribe(force), []);
  return OlympyStore.getState();
};

// ─── Role helpers ──────────────────────────────────────────────────────────
const ROLE_META = {
  student: { label: "O'quvchi",      icon: '🎓', dest: 'student' },
  teacher: { label: "O'qituvchi",    icon: '✏️', dest: 'teacher' },
  manager: { label: 'Manager',       icon: '🏫', dest: 'manager' },
  owner:   { label: 'Direktor',      icon: '👑', dest: 'owner'   },
  admin:   { label: 'Admin',         icon: '🛡', dest: 'admin'   },
};

const getApprovedRoles = (user) =>
  user && user.roles ? Object.entries(user.roles).filter(([, v]) => v?.status === 'approved').map(([k]) => k) : [];

const getPendingRoles = (user) =>
  user && user.roles ? Object.entries(user.roles).filter(([, v]) => v?.status === 'pending').map(([k]) => k) : [];

const hasApprovedRole = (user, role) => user?.roles?.[role]?.status === 'approved';
const getRoleStatus = (user, role) => user?.roles?.[role]?.status || null;

const roleHomePage = (user) => {
  if (!user) return 'login';
  const approved = getApprovedRoles(user);
  const active = user.activeRole && approved.includes(user.activeRole) ? user.activeRole : approved[0];
  if (active) return ROLE_META[active]?.dest || 'student';
  if (user.roles?.student) return 'student';
  return 'pending-home';
};

// Status label localization
const statusLabel = (s) =>
  s === 'pending' ? 'Kutilmoqda' :
  s === 'approved' ? 'Tasdiqlandi' :
  s === 'rejected' ? 'Rad etildi' :
  s === 'draft' ? 'Draft' :
  s === 'inactive' ? 'Nofaol' :
  s === 'active' ? 'Faol' :
  s === 'finished' ? 'Tugagan' :
  s || '—';

// ─── Cross-page helpers for derived data ─────────────────────────────────
const eventTypeLabel = (eventType) =>
  eventType === 'competition' ? 'Musobaqa' : 'Olimpiada';

const TEST_TYPE_META = {
  multiple_choice: { label: 'Multiple choice' },
  true_false: { label: 'True/False' },
  short_answer: { label: 'Qisqa javob' },
  mixed: { label: 'Aralash' },
};

const testTypeLabel = (testType) => TEST_TYPE_META[testType]?.label || '';

const normaliseQuestionOption = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[‘’`ʼʻ]/g, "'");

const inferQuestionTestType = (question) => {
  const explicit = String(question?.type || question?.questionType || question?.question_type || '').toLowerCase();
  if (explicit.includes('true') || explicit.includes("to'g'ri") || explicit.includes("noto'g'ri")) return 'true_false';
  if (explicit.includes('short') || explicit.includes('qisqa')) return 'short_answer';
  if (explicit.includes('multiple') || explicit.includes("ko'p")) return 'multiple_choice';

  const options = Array.isArray(question?.options) ? question.options.map(normaliseQuestionOption) : [];
  if (options.length === 0) return 'short_answer';
  const positive = new Set(["to'g'ri", "tog'ri", 'togri', 'true', 'rost', 'ha']);
  const negative = new Set(["noto'g'ri", "notog'ri", 'notogri', 'false', "yolg'on", "yo'q", 'yoq']);
  if (options.length === 2 && options.some(o => positive.has(o)) && options.some(o => negative.has(o))) {
    return 'true_false';
  }
  return 'multiple_choice';
};

const questionMatchesTestType = (question, testType) =>
  !testType || testType === 'mixed' || inferQuestionTestType(question) === testType;

const eventReadinessIssues = (event) => {
  const issues = [];
  if (!String(event?.title || '').trim()) issues.push('Tadbir nomi kiritilmagan');
  if (!String(event?.subject || '').trim()) issues.push('Fan tanlanmagan');
  if (!event?.startDate && !event?.start_datetime) issues.push('Boshlanish sanasi belgilanmagan');
  if (!event?.startTime && !event?.start_datetime) issues.push('Boshlanish vaqti belgilanmagan');
  const duration = Number(event?.duration ?? event?.duration_minutes);
  if (!duration || duration <= 0) issues.push('Davomiylik kiritilmagan');
  if (!Array.isArray(event?.questionIds) || event.questionIds.length === 0) issues.push('Kamida bitta savol tayinlang');

  const start = olympiadStartMoment(event);
  if (start && start.getTime() < Date.now()) issues.push("Boshlanish vaqti o'tib ketgan");
  return issues;
};

// Events visible to a student: public olympiads plus own-center competitions.
const olympiadsForStudent = (state, user) => {
  const role = user?.roles?.student;
  const visibleStatuses = new Set(['active', 'finished']);
  return state.olympiads.filter(o => {
    if (!visibleStatuses.has(o.status)) return false;
    const type = o.eventType || 'competition';
    if (type === 'olympiad') return true;
    return role?.status === 'approved' && role.centerId && o.centerId === role.centerId;
  });
};
// Events for a manager — their center's olympiads/competitions
const olympiadsForCenter = (state, centerId) =>
  state.olympiads.filter(o => o.centerId === centerId);
// Attempts of a single user
const attemptsForUser = (state, userId) =>
  state.attempts.filter(a => a.userId === userId);
// Notifications for a user (newest first)
const notificationsForUser = (state, userId) =>
  state.notifications.filter(n => n.userId === userId).slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
// Leaderboard for an olympiad — combines stored attempts with their users
const leaderboardForOlympiad = (state, olympiadId) =>
  state.attempts
    .filter(a => a.olympiadId === olympiadId)
    .slice()
    .sort((a,b) => b.score - a.score || a.timeSpent - b.timeSpent)
    .map((a, i) => {
      const user = state.users.find(u => u.id === a.userId);
      const olympiad = state.olympiads.find(o => o.id === olympiadId);
      const center = olympiad ? state.centers.find(c => c.id === olympiad.centerId) : null;
      return {
        rank: i + 1,
        attemptId: a.id,
        userId: a.userId,
        name: user?.name || 'Noma\'lum',
        center: center?.name || '—',
        organizationType: center?.organizationType || "O'quv markaz",
        subject: olympiad?.subject || '—',
        score: a.score,
        time: formatTime(a.timeSpent || 0),
        city: center?.region || center?.city || '—',
      };
    });

const formatTime = (s) => {
  const m = Math.floor((s || 0) / 60), sec = (s || 0) % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const formatCenterLocation = (center) => {
  if (!center) return '—';
  const country = center.country || "O'zbekiston";
  const region = center.region || '';
  const district = center.district || center.city || '';
  const parts = [country, region, district].filter(Boolean);
  if (parts.length > 1) return parts.join(' · ');
  return center.city || parts[0] || '—';
};

// ─── Backend → mock-store shape adapters ────────────────────────────────
// These let dashboards render API payloads through the same components as
// the mock store. Only fields actually used by views are mapped.
const mapApiOlympiad = (o) => {
  if (!o) return null;
  const start = o.start_datetime ? new Date(o.start_datetime) : null;
  // startDate/startTime ni lokal vaqt asosida ajratamiz: toISOString UTC kun
  // qaytaradi, lekin toTimeString lokal soatni qaytaradi — bu ikkalasini
  // birlashtirsak vaqt mintaqasi siljishidan kun yoki soat noto'g'ri ko'rinishi
  // mumkin edi. Endi toLocaleDateString('en-CA') va getHours/getMinutes orqali
  // bir xil lokal time-zone'da hisoblaymiz.
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = start
    ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    : '';
  const localTime = start
    ? `${pad(start.getHours())}:${pad(start.getMinutes())}`
    : '';
  return {
    id: String(o.id),
    backendId: o.id,
    centerId: o.center != null ? String(o.center) : null,
    eventType: o.event_type || o.eventType || 'competition',
    title: o.title,
    subject: o.subject,
    testLevel: o.test_level || o.testLevel || '',
    testType: o.test_type || o.testType || '',
    startDate: localDate,
    startTime: localTime,
    duration: o.duration_minutes ?? o.duration ?? 60,
    duration_minutes: o.duration_minutes,
    start_datetime: o.start_datetime,
    questionIds: Array.isArray(o.question_ids)
      ? o.question_ids.map(String)
      : (Array.isArray(o.questions) ? o.questions.map(String) : []),
    status: o.status || 'draft',
    createdAt: (o.created_at || '').slice(0, 10),
    participants: o.participants || 0,
    maxScore: o.max_score ?? 100,
    _api: true,
  };
};

const mapApiCenter = (c) => {
  if (!c) return null;
  return {
    id: String(c.id),
    backendId: c.id,
    name: c.name,
    organizationType: c.organization_type || c.organizationType || "O'quv markaz",
    country: c.country || "O'zbekiston",
    region: c.region || '',
    district: c.district || '',
    city: c.city || c.district || c.region || '',
    ownerId: c.owner != null ? String(c.owner) : null,
    ownerName: c.owner_full_name || '',
    ownerPhone: c.owner_phone || '',
    status: c.status || 'pending',
    subjects: Array.isArray(c.subjects) ? c.subjects : [],
    rating: parseFloat(c.rating) || 0,
    students: c.students || 0,
    olympiads: c.olympiads || 0,
    createdAt: (c.created_at || '').slice(0, 10),
    _api: true,
  };
};

const mapApiNotification = (n) => {
  if (!n) return null;
  return {
    id: String(n.id),
    backendId: n.id,
    userId: n.user != null ? `api:${n.user}` : null,
    centerId: n.center != null ? String(n.center) : null,
    type: n.type || '',
    title: n.title || '',
    message: n.message || '',
    isRead: !!n.is_read,
    createdAt: n.created_at || '',
    _api: true,
  };
};

const mapApiAttempt = (a) => {
  if (!a) return null;
  return {
    id: String(a.id),
    backendId: a.id,
    userId: a.user != null ? `api:${a.user}` : null,
    olympiadId: a.olympiad != null ? String(a.olympiad) : null,
    answers: a.answers || {},
    score: a.score || 0,
    correctCount: a.correct_count || 0,
    wrongCount: a.wrong_count || 0,
    totalQuestions: a.total_questions || 0,
    timeSpent: a.time_spent || 0,
    rank: a.rank || null,
    submittedAt: a.submitted_at || '',
    _api: true,
  };
};

const mapApiQuestion = (q) => {
  if (!q) return null;
  const DIFFICULTY_MAP = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin' };
  return {
    id: String(q.id),
    backendId: q.id,
    centerId: q.center != null ? String(q.center) : null,
    subject: q.subject,
    text: q.text,
    options: Array.isArray(q.options) ? q.options : [],
    correctAnswer: q.correct_answer ?? 0,
    score: q.score ?? 3,
    difficulty: DIFFICULTY_MAP[q.difficulty] || q.difficulty,
    source: q.source || 'manual',
    _api: true,
  };
};

// Best-effort parse of an olympiad's scheduled start instant. Returns null
// when the olympiad has no scheduled start (e.g. legacy mock entries without
// a startDate).
const olympiadStartMoment = (olympiad) => {
  if (!olympiad) return null;
  if (olympiad.start_datetime) {
    const d = new Date(olympiad.start_datetime);
    return isNaN(d.getTime()) ? null : d;
  }
  if (olympiad.startDate) {
    const time = olympiad.startTime || '00:00';
    const d = new Date(`${olympiad.startDate}T${time.length === 5 ? `${time}:00` : time}`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Telegram-style mock message strings (for toasts/preview)
const telegramJoinRequestText = (studentName, centerName) =>
  `Yangi o'quvchi ariza yubordi: ${studentName}.\nTashkilot: ${centerName}.\nTasdiqlaysizmi?`;
const telegramOlympiadPublishedText = (centerName, olympiad) =>
  `${centerName} tashkilotida yangi ${eventTypeLabel(olympiad.eventType || olympiad.event_type)} boshlandi:\nFan: ${olympiad.subject}\n${olympiad.testLevel || olympiad.test_level ? `Daraja: ${olympiad.testLevel || olympiad.test_level}\n` : ''}${olympiad.testType || olympiad.test_type ? `Test turi: ${testTypeLabel(olympiad.testType || olympiad.test_type)}\n` : ''}Sana: ${olympiad.startDate}\nQatnashish uchun platformaga kiring.`;

Object.assign(window, {
  OlympyStore, useStore,
  ROLE_META, getApprovedRoles, getPendingRoles, hasApprovedRole, getRoleStatus, roleHomePage, statusLabel,
  olympiadsForStudent, olympiadsForCenter, attemptsForUser, notificationsForUser, leaderboardForOlympiad,
  formatTime, formatCenterLocation, eventTypeLabel, testTypeLabel, inferQuestionTestType, questionMatchesTestType, eventReadinessIssues, olympiadStartMoment, telegramJoinRequestText, telegramOlympiadPublishedText,
  mapApiOlympiad, mapApiCenter, mapApiNotification, mapApiAttempt, mapApiQuestion,
});
