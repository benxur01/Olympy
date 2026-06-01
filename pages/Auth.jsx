// pages/Auth.jsx — Login + account/organization Register

const SUBJECTS_LIST = ['Matematika','Ingliz tili','Ona tili','Informatika','IT','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const ORGANIZATION_TYPES = ["O'quv markaz", 'Maktab', 'Universitet/Kollej', 'Tashkilot', 'Online academy', 'Boshqa'];
// UZBEKISTAN_DISTRICTS va UZBEKISTAN_REGIONS pages/constants/uzbekistanDistricts.js
// ga ko'chirildi — Olympy.html ularni bu fayldan oldin yuklaydi, shuning uchun
// global scope'da shu yerda ham ko'rinadi.

// ─── Login ────────────────────────────────────────────────────────────────
const usePhoneInput = () => {
  const ref = React.useRef(null);
  const handleChange = React.useCallback((e, setVal) => {
    const raw = e.target.value;
    const pos = e.target.selectionStart;
    const formatted = formatUzPhoneInput(raw);
    setVal(formatted);
    requestAnimationFrame(() => {
      if (ref.current) {
        const newPos = Math.min(pos, formatted.length);
        ref.current.setSelectionRange(newPos, newPos);
      }
    });
  }, []);
  return { ref, handleChange };
};

const LoginPage = ({ onNavigate, onLogin }) => {
  const [form, setForm] = React.useState({ phone: '+998', password: '' });
  const phoneInputRef = usePhoneInput();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);
  const [forgotOpen, setForgotOpen] = React.useState(false);
  const [forgot, setForgot] = React.useState({
    step: 'phone',
    phone: '+998',
    code: '',
    password: '',
    confirm: '',
    deepLink: '',
    botUsername: '',
    expiresAt: null,
    now: Date.now(),
    loading: false,
    error: '',
  });
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await OlympyApi.login({ phone: form.phone, password: form.password });
      const mappedUser = OlympyApi.mapBackendUser(data.user);
      OlympyApi.saveAuth({
        token: data.token,
        refresh: data.refresh,
        user: mappedUser,
        cookieAuth: data.cookie_auth,
        // "Meni eslab qolish" tasdiqlanmagan bo'lsa, token sessionStorage'da
        // saqlanadi va brauzer yopilganda tozalanadi.
        persistent: rememberMe,
      });
      onLogin(mappedUser);
    } catch (err) {
      setError(OlympyApi.toUserMessage(err));
      setLoading(false);
    }
  };
  const normalizedForgotPhone = OlympyStore.normalizePhone(forgot.phone);
  const forgotExpired = !!(forgot.expiresAt && forgot.now > forgot.expiresAt);
  const forgotRemaining = forgot.expiresAt ? Math.max(0, Math.floor((forgot.expiresAt - forgot.now) / 1000)) : 0;
  const forgotRemainingLabel = `${String(Math.floor(forgotRemaining / 60)).padStart(2, '0')}:${String(forgotRemaining % 60).padStart(2, '0')}`;

  React.useEffect(() => {
    if (!forgotOpen || forgot.step !== 'code') return;
    const timer = setInterval(() => setForgot(prev => ({ ...prev, now: Date.now() })), 1000);
    return () => clearInterval(timer);
  }, [forgotOpen, forgot.step]);

  const resetForgotState = (phone = form.phone || '+998') => {
    setForgot({
      step: 'phone',
      phone: formatUzPhoneInput(phone || '+998'),
      code: '',
      password: '',
      confirm: '',
      deepLink: '',
      botUsername: '',
      expiresAt: null,
      now: Date.now(),
      loading: false,
      error: '',
    });
  };

  const openForgotModal = () => {
    resetForgotState(form.phone);
    setForgotOpen(true);
  };

  const closeForgotModal = () => {
    setForgotOpen(false);
    resetForgotState(form.phone);
  };

  const openTelegramDeepLink = (link) => {
    if (!link) return false;
    if (typeof goToTelegramLink === 'function') return goToTelegramLink(link);
    try {
      window.location.assign(link);
      return true;
    } catch (_) {
      return false;
    }
  };

  const startForgotReset = async () => {
    if (!normalizedForgotPhone || forgot.loading) return;
    setForgot(prev => ({ ...prev, loading: true, error: '', code: '', password: '', confirm: '' }));
    try {
      const data = await OlympyApi.startPasswordReset({ phone: normalizedForgotPhone });
      const link = data.telegram_deep_link || '';
      if (!link) {
        setForgot(prev => ({ ...prev, loading: false, error: 'Telegram bot sozlanmagan' }));
        return;
      }
      setForgot(prev => ({
        ...prev,
        step: 'code',
        loading: false,
        deepLink: link,
        botUsername: data.bot_username || '',
        expiresAt: Date.now() + (5 * 60 * 1000),
        now: Date.now(),
      }));
      const opened = openTelegramDeepLink(link);
      if (!opened) {
        setForgot(prev => ({
          ...prev,
          error: "Brauzer Telegramga o'tishni blokladi. “Telegram botni ochish” tugmasini bosing.",
        }));
      }
    } catch (err) {
      setForgot(prev => ({ ...prev, loading: false, error: OlympyApi.toUserMessage(err) }));
    }
  };

  const submitForgotReset = async () => {
    if (forgot.loading) return;
    if (forgotExpired) {
      setForgot(prev => ({ ...prev, error: 'Kod muddati tugagan. Qayta yuboring.' }));
      return;
    }
    if (!forgot.code.trim()) {
      setForgot(prev => ({ ...prev, error: 'Kodni kiriting' }));
      return;
    }
    if (forgot.password.length < 6) {
      setForgot(prev => ({ ...prev, error: 'Yangi parol kamida 6 ta belgidan iborat bo‘lsin' }));
      return;
    }
    if (forgot.password !== forgot.confirm) {
      setForgot(prev => ({ ...prev, error: 'Parollar mos kelmaydi' }));
      return;
    }
    setForgot(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const data = await OlympyApi.confirmPasswordReset({
        phone: normalizedForgotPhone,
        otp: forgot.code.trim(),
        password: forgot.password,
      });
      const mappedUser = OlympyApi.mapBackendUser(data.user);
      OlympyApi.saveAuth({
        token: data.token,
        refresh: data.refresh,
        user: mappedUser,
        cookieAuth: data.cookie_auth,
        persistent: rememberMe,
      });
      onLogin(mappedUser);
    } catch (err) {
      setForgot(prev => ({ ...prev, loading: false, error: OlympyApi.toUserMessage(err) }));
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#050508' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', top: '20%', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#a855f7', bottom: '20%', right: '10%' }} />
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center mx-auto mb-8" style={{ animation: 'float 6s ease-in-out infinite' }}>
            <BrandLogo compact size="xl" />
          </div>
          <h2 className="text-3xl font-black text-white mb-4">Xush kelibsiz!</h2>
          <p className="text-white/40 max-w-sm mx-auto leading-relaxed mb-10">O'zbekistonning eng zamonaviy olimpiada platformasiga kiring va yutuqlarga erishishni boshlang.</p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
            {/* Platforma yangi — soxta "120+ tashkilot, 15K+ o'quvchi"
                raqamlari o'rniga imkoniyatlar. */}
            {[{ v: 'AI', l: 'Savol generator' }, { v: 'PDF', l: 'Import' }, { v: 'Telegram', l: 'Bot' }, { v: '24/7', l: 'Online' }].map((s, i) => (
              <div key={i} className="glass rounded-2xl p-4 text-center">
                <div className="text-xl font-black gradient-text">{s.v}</div>
                <div className="text-xs text-white/40">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-start md:justify-center px-5 md:px-8 py-8 md:py-12">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-6 md:mb-8 cursor-pointer" onClick={() => onNavigate('landing')}>
            <BrandLogo size="lg" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2">Kirish</h1>
          <p className="text-white/40 text-sm md:text-base">Hisobingizga kiring</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
            <input ref={phoneInputRef.ref} className="input-field" type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
              placeholder="+998901234567" value={form.phone}
              onChange={e => phoneInputRef.handleChange(e, phone => setForm(f => ({ ...f, phone })))}
              onFocus={e => setForm(f => ({ ...f, phone: formatUzPhoneInput(e.target.value) }))}
              required />
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
              <input type="checkbox" className="rounded"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)} /> Meni eslab qolish
            </label>
            <button type="button" onClick={openForgotModal} className="text-indigo-400 hover:text-indigo-300 transition-colors">Parolni unutdingizmi?</button>
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
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="rounded-3xl p-6 max-w-md w-full border border-white/15" style={{ background: '#12141a' }}>
            <div className="text-3xl mb-3">🔐</div>
            <h3 className="text-xl font-black text-white mb-2">Parolni tiklash</h3>
            {forgot.step === 'phone' && (
              <div className="space-y-4">
                <p className="text-white/60 text-sm leading-relaxed">
                  Telefon raqamingizni kiriting. Code bot telefoningizni tasdiqlatib, parolni tiklash kodini yuboradi.
                </p>
                <div>
                  <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
                  <input
                    className="input-field"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={13}
                    placeholder="+998901234567"
                    value={forgot.phone}
                    onChange={e => setForgot(prev => ({
                      ...prev,
                      phone: formatUzPhoneInput(e.target.value),
                      error: '',
                    }))}
                    onFocus={e => setForgot(prev => ({
                      ...prev,
                      phone: formatUzPhoneInput(e.target.value),
                    }))}
                  />
                </div>
                {forgot.error && (
                  <div className="text-xs text-rose-400 flex items-center gap-1">
                    <Icon name="info" size={12} /> {forgot.error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={closeForgotModal} className="btn-ghost flex-1 py-3 rounded-2xl font-semibold">
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    onClick={startForgotReset}
                    disabled={!normalizedForgotPhone || forgot.loading}
                    className="btn-primary flex-1 py-3 rounded-2xl font-semibold disabled:opacity-50"
                  >
                    {forgot.loading ? 'Yuborilmoqda...' : "Botga o'tish"}
                  </button>
                </div>
              </div>
            )}

            {forgot.step === 'code' && (
              <div className="space-y-4">
                <div className="glass rounded-2xl p-3 border border-indigo-500/20">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-indigo-300">
                      {forgot.botUsername ? `@${forgot.botUsername}` : 'Code bot'} kontaktni tasdiqlaydi
                    </span>
                    {forgot.expiresAt && !forgotExpired && (
                      <span className="text-white/40 font-mono">{forgotRemainingLabel}</span>
                    )}
                  </div>
                  {forgot.deepLink && (
                    <a
                      href={forgot.deepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost mt-3 text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold"
                    >
                      <Icon name="send" size={12} /> Telegram botni ochish
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2 font-medium">Telegram kodi</label>
                  <input
                    value={forgot.code}
                    onChange={e => setForgot(prev => ({
                      ...prev,
                      code: e.target.value.replace(/\D/g, '').slice(0, 6),
                      error: '',
                    }))}
                    className="input-field text-center font-mono tracking-[0.4em]"
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2 font-medium">Yangi parol</label>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="Kamida 6 ta belgi"
                    value={forgot.password}
                    onChange={e => setForgot(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-2 font-medium">Yangi parolni tasdiqlang</label>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="Parolni qaytaring"
                    value={forgot.confirm}
                    onChange={e => setForgot(prev => ({ ...prev, confirm: e.target.value, error: '' }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitForgotReset(); } }}
                  />
                </div>
                {forgot.error && (
                  <div className="text-xs text-rose-400 flex items-center gap-1">
                    <Icon name="info" size={12} /> {forgot.error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForgot(prev => ({ ...prev, step: 'phone', code: '', password: '', confirm: '', error: '' }))}
                    className="btn-ghost flex-1 py-3 rounded-2xl font-semibold"
                  >
                    Qayta
                  </button>
                  <button
                    type="button"
                    onClick={submitForgotReset}
                    disabled={!forgot.code || forgot.password.length < 6 || forgot.password !== forgot.confirm || forgot.loading || forgotExpired}
                    className="btn-primary flex-1 py-3 rounded-2xl font-semibold disabled:opacity-50"
                  >
                    {forgot.loading ? 'Tekshirilmoqda...' : 'Parolni yangilash'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Register ─────────────────────────────────────────────────────────────
const RegisterPage = ({ onNavigate, onLogin }) => {
  const store = useStore();
  const regPhoneInputRef = usePhoneInput();
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({ name: '', phone: '+998', password: '', confirm: '' });
  const [registrationType, setRegistrationType] = React.useState(null); // student|organization
  const [centerId, setCenterId] = React.useState(null);
  const [centerSearch, setCenterSearch] = React.useState('');
  const [newCenter, setNewCenter] = React.useState({
    name: '',
    organizationType: "O'quv markaz",
    customOrganizationType: '',
    country: "O'zbekiston",
    region: '',
    district: '',
    subjects: [],
  });
  const [phoneError, setPhoneError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [phoneVerified, setPhoneVerified] = React.useState(false);
  const [apiCenters, setApiCenters] = React.useState(null);

  const normalizedRegisterPhone = OlympyStore.normalizePhone(form.phone);
  const phoneValidForVerify = !!normalizedRegisterPhone && !phoneError;
  const selectedOrganizationType = newCenter.organizationType === 'Boshqa'
    ? newCenter.customOrganizationType.trim()
    : newCenter.organizationType;
  const newCenterTypeValid = !!selectedOrganizationType;
  const districtOptions = UZBEKISTAN_DISTRICTS[newCenter.region] || [];
  const newCenterLocationValid = !!newCenter.country && !!newCenter.region && !!newCenter.district;
  const registerTypeMeta = {
    student: { icon: '🎓', title: "O'quvchi sifatida", subtitle: 'Olimpiadalarda qatnashish uchun hisob yarating.' },
    organization: { icon: '🏛', title: "Tashkilot ro'yxatdan o'tkazish", subtitle: "Tashkilotni tasdiqqa yuboring, tasdiqlangach direktor paneli ochiladi." },
  };
  const currentRegisterMeta = registerTypeMeta[registrationType] || {
    icon: '🏆',
    title: "Ro'yxatdan o'tish",
    subtitle: "O'zingizga mos boshlash turini tanlang.",
  };

  // Reset verification whenever the entered phone changes
  React.useEffect(() => { setPhoneVerified(false); }, [normalizedRegisterPhone]);
  React.useEffect(() => {
    let cancelled = false;
    OlympyApi.getCenters()
      .then(rows => {
        if (!cancelled) setApiCenters(Array.isArray(rows) ? rows.map(mapApiCenter) : []);
      })
      .catch(err => {
        console.warn('getCenters failed:', err);
        if (!cancelled) setApiCenters([]);
      });
    return () => { cancelled = true; };
  }, []);

  const validatePhone = (v) => {
    const norm = OlympyStore.normalizePhone(v);
    if (!norm) { setPhoneError(''); return; }
    setPhoneError('');
  };

  const centerOptions = apiCenters || [];
  const approvedCenters = centerOptions.filter(c => c.status === 'approved');
  const filteredCenters = approvedCenters.filter(c =>
    c.name.toLowerCase().includes(centerSearch.toLowerCase()) ||
    String(c.city || '').toLowerCase().includes(centerSearch.toLowerCase()) ||
    formatCenterLocation(c).toLowerCase().includes(centerSearch.toLowerCase()) ||
    String(c.organizationType || '').toLowerCase().includes(centerSearch.toLowerCase())
  );

  const selectRegistrationType = (type) => {
    setRegistrationType(type);
    setCenterId(null);
    setCenterSearch('');
    setPhoneError('');
  };

  const goNext = () => {
    if (step === 1) {
      if (!registrationType) return;
      setStep(2);
    } else if (step === 2) {
      if (!form.name || !form.phone || !form.password || !form.confirm) return;
      if (form.password !== form.confirm) return;
      const norm = OlympyStore.normalizePhone(form.phone);
      if (!norm) { setPhoneError("Telefon raqam noto'g'ri"); return; }
      if (!phoneVerified) { setPhoneError("Telefon raqamni Telegram orqali tasdiqlang"); return; }
      setStep(3);
    }
  };

  const submit = async () => {
    setLoading(true);

    try {
      const registerPayload = {
        full_name: form.name,
        phone: form.phone,
        password: form.password,
      };
      const selectedType = registrationType;
      const organizationPayload = {
        name: newCenter.name,
        organization_type: selectedOrganizationType || "O'quv markaz",
        country: newCenter.country,
        region: newCenter.region,
        district: newCenter.district,
        city: newCenter.district || newCenter.region,
        subjects: newCenter.subjects,
      };

      if (selectedType === 'organization') {
        const data = await OlympyApi.registerOrganization({
          ...registerPayload,
          center: organizationPayload,
        });
        const mappedUser = OlympyApi.mapBackendUser(data.user);
        OlympyApi.saveAuth({ token: data.token, refresh: data.refresh, user: mappedUser, cookieAuth: data.cookie_auth });
        setSuccess(true);
        setTimeout(() => onLogin(mappedUser), 1600);
        return;
      }

      if (selectedType === 'student') registerPayload.role = 'student';
      const selectedCenterId = centerId;
      // Avval register + joinCenter alohida chaqirilardi va ikkinchisi xato
      // bersa "yetim" hisob qolardi. Endi join params ni register'ga
      // qo'shamiz — backend tranzaksiya ichida ikkalasini bajaradi.
      if (selectedType === 'student' && selectedCenterId) {
        registerPayload.center_id = selectedCenterId;
        registerPayload.join_role = 'student';
        registerPayload.join_subject = '';
      }
      const data = await OlympyApi.register(registerPayload);
      const token = data.token;
      const refresh = data.refresh;

      const freshUser = await OlympyApi.getMe(token);
      const mappedUser = OlympyApi.mapBackendUser(freshUser);
      OlympyApi.saveAuth({ token, refresh, user: mappedUser, cookieAuth: data.cookie_auth });
      setSuccess(true);
      setTimeout(() => onLogin(mappedUser), 1600);
    } catch (err) {
      setPhoneError(OlympyApi.toUserMessage(err));
      setLoading(false);
    }
  };

  if (success) {
    const isAuto = registrationType === 'student' && !centerId;
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050508' }}>
        <div className="text-center animate-in">
          <div className="w-24 h-24 gradient-bg rounded-full flex items-center justify-center mx-auto mb-6 glow-blue">
            <Icon name="check" size={40} />
          </div>
          <h2 className="text-3xl font-black text-white mb-2">Tabriklaymiz!</h2>
          <p className="text-white/50">
            {registrationType === 'organization' ? "Tashkilot arizangiz qabul qilindi" : 'Hisobingiz muvaffaqiyatli yaratildi'}
          </p>
          {!isAuto && (
            <p className="text-amber-300 text-sm mt-3">
              {registrationType === 'organization' ? "Tashkilot/markaz arizangiz Platform Adminga yuborildi" :
               'Arizangiz tashkilot manageriga yuborildi'}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Render steps ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" style={{ background: '#050508' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#22d3ee', top: '20%', right: '20%' }} />
        <div className="hero-glow" style={{ background: '#6366f1', bottom: '20%', left: '10%' }} />
        <div className="relative z-10">
          <div className="glass rounded-3xl p-8 max-w-sm">
            <div className="text-4xl mb-4">{currentRegisterMeta.icon}</div>
            <h3 className="text-xl font-black text-white mb-3">
              {currentRegisterMeta.title}
            </h3>
            <p className="text-white/40 text-sm leading-relaxed mb-6">
              {currentRegisterMeta.subtitle}
            </p>
            <div className="space-y-3">
              {[
                "Tashkilot yoki shaxs sifatida boshlash",
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
      <div className="flex-1 lg:max-w-md flex flex-col justify-start md:justify-center px-5 md:px-8 py-8 md:py-12 overflow-y-auto">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-6 md:mb-8 cursor-pointer" onClick={() => onNavigate('landing')}>
            <BrandLogo size="lg" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2">Ro'yxatdan o'tish</h1>
          <p className="text-white/40 text-sm md:text-base">
            {step === 1 ? "Avval qanday boshlashingizni tanlang" :
             registrationType === 'organization' ? "Tashkilot va mas'ul shaxs ma'lumotlari" :
             'Hisobingizni yarating'}
          </p>

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

        {/* Step 2: credentials */}
        {step === 2 && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">
                {registrationType === 'organization' ? "Mas'ul shaxs ism familiyasi" : 'Ism familiya'}
              </label>
              <input className="input-field" placeholder="Ali Valiyev" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
              <input ref={regPhoneInputRef.ref} className="input-field" type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
                placeholder="+998901234567" value={form.phone}
                onChange={e => regPhoneInputRef.handleChange(e, phone => {
                  setForm(f => ({ ...f, phone }));
                  validatePhone(phone);
                })}
                onFocus={e => {
                  const phone = formatUzPhoneInput(e.target.value);
                  setForm(f => ({ ...f, phone }));
                  validatePhone(phone);
                }} />
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
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={goNext}
                disabled={!form.name || !form.phone || !form.password || form.password !== form.confirm || !!phoneError || !phoneVerified}
                className="btn-primary flex-1 py-3.5 rounded-2xl font-bold disabled:opacity-50">
                {registrationType === 'organization' ? "Tashkilotga o'tish →" : 'Davom etish →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: registration type */}
        {step === 1 && (
          <div className="space-y-3 animate-in">
            <div className="text-sm text-white/60 mb-2">Qanday ro'yxatdan o'tmoqchisiz?</div>
            {[
              { k:'student', icon:'🎓', label:"O'quvchi", desc:'Olimpiadalarda qatnashish' },
              { k:'organization', icon:'🏛', label:"Tashkilot/o'quv markaz", desc:"Tashkilotni ro'yxatdan o'tkazish" },
            ].map(r => (
              <button key={r.k} onClick={() => selectRegistrationType(r.k)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all ${registrationType === r.k ? 'border border-indigo-500 bg-indigo-500/10' : 'glass hover:bg-white/5 border border-transparent'}`}>
                <span className="text-2xl">{r.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white">{r.label}</div>
                  <div className="text-xs text-white/40">{r.desc}</div>
                </div>
                {registrationType === r.k && <Icon name="check" size={16} className="text-indigo-400" />}
              </button>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => onNavigate('login')} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">Kirish</button>
              <button onClick={goNext} disabled={!registrationType} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold disabled:opacity-50">Davom etish →</button>
            </div>
          </div>
        )}

        {/* Step 3: selected registration flow */}
        {step === 3 && registrationType === 'student' && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">Tashkilot yoki markaz tanlash <span className="text-white/30">(ixtiyoriy)</span></label>
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input className="input-field pl-10" placeholder="Nomi, turi, viloyat yoki tuman..." value={centerSearch}
                  onChange={e => setCenterSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredCenters.map(c => (
                <div key={c.id}
                  onClick={() => setCenterId(centerId === c.id ? null : c.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${centerId === c.id ? 'border border-indigo-500 bg-indigo-500/10' : 'glass hover:bg-white/5'}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} className="h-9 w-9 rounded-xl object-cover flex-shrink-0"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }} />
                    ) : null}
                    <div className={`w-9 h-9 gradient-bg rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${c.imageUrl ? 'hidden' : ''}`}>{c.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                      <div className="text-xs text-white/40 truncate">{c.organizationType || "O'quv markaz"} · {formatCenterLocation(c)} · {c.students} o'quvchi</div>
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

        {step === 3 && registrationType === 'organization' && (
          <div className="space-y-4 animate-in">
            <div className="text-sm text-white/60">Yangi tashkilot yoki markaz ma'lumotlari</div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Tashkilot turi</label>
              <select className="input-field" value={newCenter.organizationType}
                onChange={e => setNewCenter({ ...newCenter, organizationType: e.target.value, customOrganizationType: e.target.value === 'Boshqa' ? newCenter.customOrganizationType : '' })}>
                {ORGANIZATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            {newCenter.organizationType === 'Boshqa' && (
              <div>
                <label className="block text-xs text-white/50 mb-1.5 font-medium">Tashkilot turini yozing</label>
                <input className="input-field" placeholder="Masalan: Respublika markazi" value={newCenter.customOrganizationType}
                  onChange={e => setNewCenter({ ...newCenter, customOrganizationType: e.target.value })} />
              </div>
            )}
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Davlat</label>
              <select className="input-field" value={newCenter.country}
                onChange={e => setNewCenter({ ...newCenter, country: e.target.value })}>
                <option value="O'zbekiston">O'zbekiston</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Viloyat</label>
              <select className="input-field" value={newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, region: e.target.value, district: '' })}>
                <option value="">Viloyatni tanlang...</option>
                {UZBEKISTAN_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Tuman/Shahar</label>
              <select className="input-field" value={newCenter.district}
                disabled={!newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, district: e.target.value })}>
                <option value="">{newCenter.region ? 'Tumanni tanlang...' : 'Avval viloyatni tanlang'}</option>
                {districtOptions.map(district => <option key={district} value={district}>{district}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5 font-medium">Tashkilot/markaz nomi</label>
              <input className="input-field" placeholder="Masalan: Smart Education" value={newCenter.name}
                onChange={e => setNewCenter({ ...newCenter, name: e.target.value })} />
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
              <Icon name="info" size={14} /> Tashkilot Platform Admin tomonidan tasdiqlangach faollashadi.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !newCenterTypeValid || !newCenterLocationValid || !newCenter.name} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Arizani yuborish'}
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
