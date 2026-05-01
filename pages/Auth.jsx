// pages/Auth.jsx — Login + multi-role Register

const SUBJECTS_LIST = ['Matematika','Ingliz tili','Ona tili','Informatika','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];

// ─── Login ────────────────────────────────────────────────────────────────
const LoginPage = ({ onNavigate, onLogin }) => {
  const [form, setForm] = React.useState({ phone: '', password: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (USE_MOCK_AUTH) {
      setTimeout(() => {
        const u = OlympyStore.findUserByPhone(form.phone);
        if (u && u.password === form.password) {
          onLogin(u);
        } else {
          setError("Telefon raqam yoki parol noto'g'ri");
          setLoading(false);
        }
      }, 700);
      return;
    }

    try {
      const data = await OlympyApi.login({ phone: form.phone, password: form.password });
      const mappedUser = OlympyApi.mapBackendUser(data.user);
      OlympyApi.saveAuth({ token: data.token, user: mappedUser });
      onLogin(mappedUser);
    } catch (err) {
      setError(OlympyApi.toUserMessage(err));
      setLoading(false);
    }
  };

  // Demo quick-login keeps the original mock accounts available for testing.
  const quickLogin = (phone) => {
    const u = OlympyStore.findUserByPhone(phone);
    if (u) {
      try { OlympyApi.clearAuth(); } catch {}
      onLogin(u);
    } else {
      setForm({ phone, password: '123456' });
      if (USE_MOCK_AUTH) {
        setError('');
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#060818' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', top: '20%', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', bottom: '20%', right: '10%' }} />
        <div className="relative z-10 text-center">
          <div className="w-24 h-24 gradient-bg rounded-3xl flex items-center justify-center mx-auto mb-8 glow-blue" style={{ animation: 'float 6s ease-in-out infinite' }}>
            <span className="text-white font-black text-4xl">O</span>
          </div>
          <h2 className="text-3xl font-black text-white mb-4">Xush kelibsiz!</h2>
          <p className="text-white/40 max-w-sm mx-auto leading-relaxed mb-10">O'zbekistonning eng zamonaviy olimpiada platformasiga kiring va yutuqlarga erishishni boshlang.</p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            {[{ v: '120+', l: "O'quv markaz" }, { v: '15K+', l: "O'quvchi" }, { v: '50K+', l: 'Savollar' }, { v: '98%', l: 'Qoniqish' }].map((s, i) => (
              <div key={i} className="glass rounded-2xl p-4 text-center">
                <div className="text-xl font-black gradient-text">{s.v}</div>
                <div className="text-xs text-white/40">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-center px-8 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-8 cursor-pointer" onClick={() => onNavigate('landing')}>
            <div className="gradient-bg w-8 h-8 rounded-xl flex items-center justify-center"><span className="text-white font-black text-sm">O</span></div>
            <span className="gradient-text font-black text-xl">Olympy</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Kirish</h1>
          <p className="text-white/40">Hisobingizga kiring</p>
        </div>

        {/* Demo quick login */}
        <div className="glass rounded-2xl p-4 mb-6 border border-indigo-500/20">
          <div className="text-xs text-indigo-300 font-medium mb-3">⚡ Demo kirish (tez sinash uchun)</div>
          <div className="flex flex-wrap gap-2">
            {[
              { phone: '+998901234567', label: "O'quvchi (Ali)" },
              { phone: '+998901234568', label: 'Manager+Egasi' },
              { phone: '+998901234570', label: "O'qituvchi" },
              { phone: '+998901234569', label: 'Admin' },
            ].map(d => (
              <button key={d.phone} onClick={() => quickLogin(d.phone)}
                className="text-xs px-3 py-1.5 rounded-lg glass border border-white/10 text-white/60 hover:text-white hover:border-indigo-500/40 transition-all">
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
            <input className="input-field" type="tel" placeholder="+998 90 123 45 67" value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Parol</label>
            <div className="relative">
              <input className="input-field pr-12" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                <Icon name="eye" size={18} />
              </button>
            </div>
          </div>
          {error && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3"><Icon name="info" size={16} />{error}</div>}
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-white/50 cursor-pointer">
              <input type="checkbox" className="rounded" /> Meni eslab qolish
            </label>
            <button type="button" className="text-indigo-400 hover:text-indigo-300 transition-colors">Parolni unutdingizmi?</button>
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Kirish...</> : 'Kirish'}
          </button>
        </form>

        <p className="text-center text-sm text-white/40 mt-6">
          Hisobingiz yo'qmi?{' '}
          <button onClick={() => onNavigate('register')} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">Ro'yxatdan o'ting</button>
        </p>
      </div>
    </div>
  );
};

// ─── Register ─────────────────────────────────────────────────────────────
const RegisterPage = ({ onNavigate, onLogin }) => {
  const store = useStore();
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({ name: '', phone: '', password: '', confirm: '' });
  const [role, setRole] = React.useState(null); // student|teacher|manager|owner
  const [centerId, setCenterId] = React.useState(null);
  const [centerSearch, setCenterSearch] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [newCenter, setNewCenter] = React.useState({ name: '', city: '', subjects: [] });
  const [phoneError, setPhoneError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [phoneVerified, setPhoneVerified] = React.useState(false);

  const normalizedRegisterPhone = OlympyStore.normalizePhone(form.phone);
  const phoneValidForVerify = !!normalizedRegisterPhone && (USE_MOCK_AUTH ? !OlympyStore.phoneExists(normalizedRegisterPhone) : !phoneError);

  // Reset verification whenever the entered phone changes
  React.useEffect(() => { setPhoneVerified(false); }, [normalizedRegisterPhone]);

  const validatePhone = (v) => {
    const norm = OlympyStore.normalizePhone(v);
    if (!norm) { setPhoneError(''); return; }
    if (USE_MOCK_AUTH && OlympyStore.phoneExists(norm)) setPhoneError("Bu telefon raqam avval ro‘yxatdan o‘tgan");
    else setPhoneError('');
  };

  const approvedCenters = store.centers.filter(c => c.status === 'approved');
  const filteredCenters = approvedCenters.filter(c =>
    c.name.toLowerCase().includes(centerSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(centerSearch.toLowerCase())
  );

  const goNext = () => {
    if (step === 1) {
      if (!form.name || !form.phone || !form.password || !form.confirm) return;
      if (form.password !== form.confirm) return;
      const norm = OlympyStore.normalizePhone(form.phone);
      if (!norm) { setPhoneError("Telefon raqam noto'g'ri"); return; }
      if (USE_MOCK_AUTH && OlympyStore.phoneExists(norm)) { setPhoneError("Bu telefon raqam avval ro‘yxatdan o‘tgan"); return; }
      if (!phoneVerified) { setPhoneError("Telefon raqamni Telegram orqali tasdiqlang"); return; }
      setStep(2);
    } else if (step === 2) {
      if (!role) return;
      setStep(3);
    }
  };

  const submit = async () => {
    setLoading(true);

    if (!USE_MOCK_AUTH) {
      try {
        const data = await OlympyApi.register({
          full_name: form.name,
          phone: form.phone,
          password: form.password,
        });
        const mappedUser = OlympyApi.mapBackendUser(data.user);
        OlympyApi.saveAuth({ token: data.token, user: mappedUser });
        setSuccess(true);
        setTimeout(() => onLogin(mappedUser), 1600);
      } catch (err) {
        setPhoneError(OlympyApi.toUserMessage(err));
        setLoading(false);
      }
      return;
    }

    setTimeout(() => {
      try {
        const user = OlympyStore.createUser({ name: form.name, phone: form.phone, password: form.password });

        if (role === 'student') {
          if (centerId) {
            OlympyStore.setRole(user.id, 'student', { status: 'pending', centerId });
            OlympyStore.createRequest({ type: 'student', userId: user.id, centerId });
          } else {
            // No center selected — student is auto-approved (browse-only)
            OlympyStore.setRole(user.id, 'student', { status: 'approved', centerId: null });
          }
        } else if (role === 'teacher') {
          if (!centerId || !subject) { setLoading(false); return; }
          OlympyStore.setRole(user.id, 'teacher', { status: 'pending', centerId, subject });
          OlympyStore.createRequest({ type: 'teacher', userId: user.id, centerId, subject });
        } else if (role === 'manager') {
          if (!centerId) { setLoading(false); return; }
          OlympyStore.setRole(user.id, 'manager', { status: 'pending', centerId });
          OlympyStore.createRequest({ type: 'manager', userId: user.id, centerId });
        } else if (role === 'owner') {
          if (!newCenter.name || !newCenter.city) { setLoading(false); return; }
          const center = OlympyStore.createCenter({
            name: newCenter.name,
            city: newCenter.city,
            subjects: newCenter.subjects,
            ownerId: user.id,
            status: 'pending',
          });
          OlympyStore.setRole(user.id, 'owner', { status: 'pending', centerId: center.id });
          OlympyStore.createRequest({ type: 'center', userId: user.id, centerId: center.id });
        }

        // Default activeRole = chosen role, even if pending — UI will gate access
        OlympyStore.setActiveRole(user.id, role);

        setSuccess(true);
        setTimeout(() => onLogin(OlympyStore.findUser(user.id)), 1600);
      } catch (err) {
        setPhoneError(err.message || 'Xatolik yuz berdi');
        setLoading(false);
      }
    }, 1000);
  };

  if (success) {
    const isAuto = !USE_MOCK_AUTH || (role === 'student' && !centerId);
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#060818' }}>
        <div className="text-center animate-in">
          <div className="w-24 h-24 gradient-bg rounded-full flex items-center justify-center mx-auto mb-6 glow-blue">
            <Icon name="check" size={40} />
          </div>
          <h2 className="text-3xl font-black text-white mb-2">Tabriklaymiz! 🎉</h2>
          <p className="text-white/50">Hisobingiz muvaffaqiyatli yaratildi</p>
          {!isAuto && (
            <p className="text-amber-300 text-sm mt-3">
              {role === 'owner' ? "Markaz arizangiz Platform Adminga yuborildi" :
               role === 'manager' ? "Manager arizangiz markaz egasiga yuborildi" :
               role === 'teacher' ? "O'qituvchi arizangiz markaz egasiga yuborildi" :
               'Arizangiz markaz managerига yuborildi'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Render steps ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{ background: '#060818' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#22d3ee', top: '20%', right: '20%' }} />
        <div className="hero-glow" style={{ background: '#6366f1', bottom: '20%', left: '10%' }} />
        <div className="relative z-10">
          <div className="glass rounded-3xl p-8 max-w-sm">
            <div className="text-4xl mb-4">{role === 'owner' ? '🏛' : role === 'manager' ? '🏫' : role === 'teacher' ? '✏️' : '🏆'}</div>
            <h3 className="text-xl font-black text-white mb-3">
              {role === 'owner' ? 'Markaz egasi sifatida' :
               role === 'manager' ? 'Manager sifatida' :
               role === 'teacher' ? "O'qituvchi sifatida" :
               "O'quvchi sifatida"} qo'shiling
            </h3>
            <p className="text-white/40 text-sm leading-relaxed mb-6">
              Olympy — har xil rollar uchun bir hisob. Bir telefon raqam bilan O'quvchi, O'qituvchi yoki Manager bo'lishingiz mumkin.
            </p>
            <div className="space-y-3">
              {[
                'Bitta hisob — bir nechta rol',
                'Tasdiqlash arizalari',
                'Real vaqtda hisobotlar',
                'Telegram orqali xabarnoma',
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                  <span className="text-indigo-400 font-bold">✓</span> {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-center px-8 py-12 overflow-y-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-8 cursor-pointer" onClick={() => onNavigate('landing')}>
            <div className="gradient-bg w-8 h-8 rounded-xl flex items-center justify-center"><span className="text-white font-black text-sm">O</span></div>
            <span className="gradient-text font-black text-xl">Olympy</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Ro'yxatdan o'tish</h1>
          <p className="text-white/40">Hisobingizni yarating</p>

          {/* Steps */}
          <div className="flex items-center gap-2 mt-6">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'gradient-bg text-white' : 'glass text-white/30'}`}>{s}</div>
                {s < 3 && <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s ? 'bg-indigo-500' : 'bg-white/10'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 1: credentials */}
        {step === 1 && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Ism familiya</label>
              <input className="input-field" placeholder="Ali Valiyev" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
              <input className="input-field" type="tel" placeholder="+998 90 123 45 67" value={form.phone}
                onChange={e => { setForm({ ...form, phone: e.target.value }); validatePhone(e.target.value); }} />
              {phoneError && <div className="flex items-center gap-1 text-red-400 text-xs mt-1"><Icon name="info" size={12} /> {phoneError}</div>}
            </div>
            <TelegramVerifyBlock
              phone={normalizedRegisterPhone}
              phoneValid={phoneValidForVerify}
              verified={phoneVerified}
              onVerified={() => setPhoneVerified(true)}
            />
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Parol</label>
              <input className="input-field" type="password" placeholder="Kamida 6 ta belgi" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Parolni tasdiqlang</label>
              <input className="input-field" type="password" placeholder="Parolni qaytaring" value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })} />
              {form.confirm && form.password !== form.confirm &&
                <div className="text-red-400 text-xs mt-1">Parollar mos kelmaydi</div>}
            </div>
            <button onClick={goNext}
              disabled={!form.name || !form.phone || !form.password || form.password !== form.confirm || !!phoneError || !phoneVerified}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold disabled:opacity-50">
              Davom etish →
            </button>
          </div>
        )}

        {/* Step 2: role choice */}
        {step === 2 && (
          <div className="space-y-3 animate-in">
            <div className="text-sm text-white/60 mb-2">Qaysi rolda qo'shilmoqchisiz?</div>
            {[
              { k:'student', icon:'🎓', label:"O'quvchi", desc:'Olimpiadalarda qatnashish' },
              { k:'teacher', icon:'✏️', label:"O'qituvchi", desc:'Savollar yaratish (markaz tasdig\'i bilan)' },
              { k:'manager', icon:'🏫', label:'Manager', desc:'O\'quvchilarni boshqarish (markaz tasdig\'i bilan)' },
              { k:'owner',   icon:'🏛', label:'Markaz egasi', desc:"Yangi o'quv markaz ro'yxatdan o'tkazish" },
            ].map(r => (
              <button key={r.k} onClick={() => setRole(r.k)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all ${role === r.k ? 'border border-indigo-500 bg-indigo-500/10' : 'glass hover:bg-white/5 border border-transparent'}`}>
                <span className="text-2xl">{r.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{r.label}</div>
                  <div className="text-xs text-white/40">{r.desc}</div>
                </div>
                {role === r.k && <Icon name="check" size={16} className="text-indigo-400" />}
              </button>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={goNext} disabled={!role} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold disabled:opacity-50">Davom etish →</button>
            </div>
          </div>
        )}

        {/* Step 3: role-specific */}
        {step === 3 && role === 'student' && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">O'quv markaz tanlash <span className="text-white/30">(ixtiyoriy)</span></label>
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input className="input-field pl-10" placeholder="Markaz nomi yoki shahar..." value={centerSearch}
                  onChange={e => setCenterSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredCenters.map(c => (
                <div key={c.id}
                  onClick={() => setCenterId(centerId === c.id ? null : c.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${centerId === c.id ? 'border border-indigo-500 bg-indigo-500/10' : 'glass hover:bg-white/5'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center text-white font-bold text-sm">{c.name[0]}</div>
                    <div>
                      <div className="text-sm font-semibold text-white">{c.name}</div>
                      <div className="text-xs text-white/40">{c.city} · {c.students} o'quvchi</div>
                    </div>
                  </div>
                  {centerId === c.id && <Icon name="check" size={16} className="text-indigo-400" />}
                </div>
              ))}
            </div>
            {centerId && (
              <div className="glass rounded-xl p-3 border border-indigo-500/20 text-sm text-indigo-300 flex items-center gap-2">
                <Icon name="info" size={14} /> Ariza managerga yuboriladi va tasdiqlanishi kutiladi
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Ro'yxatdan o'tish"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && role === 'teacher' && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">O'quv markaz</label>
              <select className="input-field" value={centerId || ''} onChange={e => setCenterId(e.target.value || null)}>
                <option value="">Tanlang...</option>
                {approvedCenters.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Fan</label>
              <select className="input-field" value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Tanlang...</option>
                {SUBJECTS_LIST.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="glass rounded-xl p-3 border border-amber-500/20 text-sm text-amber-300 flex items-center gap-2">
              <Icon name="info" size={14} /> Ariza markaz egasiga yuboriladi. Tasdiqlangach savol yarata olasiz.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !centerId || !subject} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Ariza yuborish'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && role === 'manager' && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">O'quv markaz</label>
              <select className="input-field" value={centerId || ''} onChange={e => setCenterId(e.target.value || null)}>
                <option value="">Tanlang...</option>
                {approvedCenters.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
              </select>
            </div>
            <div className="glass rounded-xl p-3 border border-amber-500/20 text-sm text-amber-300 flex items-center gap-2">
              <Icon name="info" size={14} /> Ariza markaz egasiga yuboriladi. Tasdiqlangach Manager paneliga kira olasiz.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !centerId} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Ariza yuborish'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && role === 'owner' && (
          <div className="space-y-4 animate-in">
            <div className="text-sm text-white/60">Yangi o'quv markaz ma'lumotlari</div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Markaz nomi</label>
              <input className="input-field" placeholder="Masalan: Smart Education" value={newCenter.name}
                onChange={e => setNewCenter({ ...newCenter, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Shahar</label>
              <input className="input-field" placeholder="Toshkent" value={newCenter.city}
                onChange={e => setNewCenter({ ...newCenter, city: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Yo'naltirilgan fanlar</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS_LIST.map(s => {
                  const on = newCenter.subjects.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => setNewCenter({
                        ...newCenter,
                        subjects: on ? newCenter.subjects.filter(x => x !== s) : [...newCenter.subjects, s],
                      })}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-all ${on ? 'gradient-bg text-white' : 'glass text-white/50 border border-white/10'}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="glass rounded-xl p-3 border border-amber-500/20 text-sm text-amber-300 flex items-center gap-2">
              <Icon name="info" size={14} /> Markaz Platform Admin tomonidan tasdiqlangach faollashadi.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !newCenter.name || !newCenter.city} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Markazni yuborish'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-white/40 mt-6">
          Hisobingiz bormi?{' '}
          <button onClick={() => onNavigate('login')} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">Kirish</button>
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { LoginPage, RegisterPage });
