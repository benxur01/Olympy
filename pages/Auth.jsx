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
  // 2FA holati: backend `requires_2fa` qaytarsa, parol+telefonni saqlab,
  // foydalanuvchidan autentifikator kodini so'raymiz va qayta yuboramiz.
  const [step, setStep] = React.useState('login'); // 'login' | '2fa'
  const [totpCode, setTotpCode] = React.useState('');
  const [pendingPhone, setPendingPhone] = React.useState('');
  const [pendingPassword, setPendingPassword] = React.useState('');
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
  const finishLogin = (data) => {
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
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await OlympyApi.login({ phone: form.phone, password: form.password });
      // 2FA yoqilgan foydalanuvchi uchun backend token bermaydi, faqat
      // `requires_2fa: true` qaytaradi. Kod so'rash holatiga o'tamiz va
      // telefon+parolni saqlaymiz (TOTP tasdiqlashda qayta kerak bo'ladi).
      if (data?.requires_2fa) {
        setPendingPhone(form.phone);
        setPendingPassword(form.password);
        setTotpCode('');
        setStep('2fa');
        setLoading(false);
        return;
      }
      finishLogin(data);
    } catch (err) {
      setError(OlympyApi.toUserMessage(err));
      setLoading(false);
    }
  };

  const handleTotpVerify = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (totpCode.length < 6 || loading) return;
    setError('');
    setLoading(true);
    try {
      const data = await OlympyApi.login({
        phone: pendingPhone,
        password: pendingPassword,
        totp_code: totpCode,
      });
      if (data?.requires_2fa) {
        // Kod noto'g'ri — backend yana requires_2fa qaytaradi.
        setError("Noto'g'ri 2FA kod");
        setLoading(false);
        return;
      }
      finishLogin(data);
    } catch (err) {
      setError(OlympyApi.toUserMessage(err));
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setStep('login');
    setTotpCode('');
    setPendingPassword('');
    setError('');
    setLoading(false);
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
    if (forgot.password.length < 8) {
      setForgot(prev => ({ ...prev, error: 'Yangi parol kamida 8 ta belgidan iborat bo‘lsin' }));
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
    <div className="duo-screen">
      {/* Yuqori qator: orqaga (landing/tanlash) */}
      <div className="flex items-center px-4 pt-4" style={{ minHeight: 52 }}>
        <button type="button" onClick={() => onNavigate('landing')}
          className="duo-skip flex items-center gap-1" aria-label="Orqaga">
          <Icon name="arrowLeft" size={18} /> Orqaga
        </button>
      </div>

      {/* Forma — markazlashtirilgan, mobile-first */}
      <div className="flex-1 flex flex-col items-center justify-start md:justify-center px-5 py-6">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-8">
            <BrandLogo size="lg" variant="wordmark" className="mb-5" />
            <h1 className="text-2xl font-extrabold mb-1" style={{ color: 'var(--duo-text)' }}>
              {step === '2fa' ? 'Ikki bosqichli tasdiqlash' : 'Hisobingizga kiring'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--duo-text-secondary)' }}>
              {step === '2fa' ? 'Autentifikator ilovasidagi kodni kiriting' : 'Telefon raqam va parolingizni kiriting'}
            </p>
          </div>

          {step === '2fa' ? (
            <form onSubmit={handleTotpVerify} className="space-y-4">
              <div>
                <label className="duo-label">6 raqamli kod</label>
                <input
                  className="duo-input text-center font-mono tracking-[0.4em] text-lg"
                  value={totpCode}
                  onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  placeholder="000000"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
                <p className="text-xs mt-2" style={{ color: 'var(--duo-text-secondary)' }}>Authenticator (Google/Microsoft Authenticator, Authy) ilovasini oching</p>
              </div>
              {error && <div className="duo-error"><Icon name="info" size={16} />{error}</div>}
              <button type="submit" disabled={loading || totpCode.length < 6} className="duo-btn duo-btn--green">
                {loading ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
              </button>
              <button type="button" onClick={backToLogin} className="duo-btn duo-btn--ghost">← Orqaga</button>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="duo-label">Telefon raqam</label>
              <input ref={phoneInputRef.ref} className="duo-input" type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
                placeholder="+998901234567" value={form.phone}
                onChange={e => phoneInputRef.handleChange(e, phone => setForm(f => ({ ...f, phone })))}
                onFocus={e => setForm(f => ({ ...f, phone: formatUzPhoneInput(e.target.value) }))}
                required />
            </div>
            <div>
              <label className="duo-label">Parol</label>
              <div className="relative">
                <input className="duo-input pr-12" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--duo-text-secondary)' }}>
                  <Icon name="eye" size={18} />
                </button>
              </div>
            </div>
            {error && <div className="duo-error"><Icon name="info" size={16} />{error}</div>}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--duo-text-secondary)' }}>
                <input type="checkbox" className="rounded"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)} /> Meni eslab qolish
              </label>
              <button type="button" onClick={openForgotModal} className="font-semibold transition-colors" style={{ color: 'var(--duo-blue)' }}>Parolni unutdingizmi?</button>
            </div>
            <button type="submit" disabled={loading} className="duo-btn duo-btn--green">
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
          )}

          {step !== '2fa' && (
          <p className="text-center text-sm mt-6" style={{ color: 'var(--duo-text-secondary)' }}>
            Hisobingiz yo'qmi?{' '}
            <button onClick={() => onNavigate('register')} className="font-bold transition-colors" style={{ color: 'var(--duo-green)' }}>Ro'yxatdan o'ting</button>
          </p>
          )}
        </div>
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="rounded-3xl p-6 max-w-md w-full" style={{ background: '#fff', border: '2px solid var(--duo-border)', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>
            <div className="text-3xl mb-3">🔐</div>
            <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--duo-text)' }}>Parolni tiklash</h3>
            {forgot.step === 'phone' && (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--duo-text-secondary)' }}>
                  Telefon raqamingizni kiriting. Code bot telefoningizni tasdiqlatib, parolni tiklash kodini yuboradi.
                </p>
                <div>
                  <label className="duo-label">Telefon raqam</label>
                  <input
                    className="duo-input"
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
                  <div className="duo-error text-xs"><Icon name="info" size={12} /> {forgot.error}</div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={closeForgotModal} className="duo-btn duo-btn--ghost flex-1">
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    onClick={startForgotReset}
                    disabled={!normalizedForgotPhone || forgot.loading}
                    className="duo-btn duo-btn--green flex-1"
                  >
                    {forgot.loading ? 'Yuborilmoqda...' : "Botga o'tish"}
                  </button>
                </div>
              </div>
            )}

            {forgot.step === 'code' && (
              <div className="space-y-4">
                <div className="rounded-2xl p-3" style={{ background: '#F3FFE8', border: '1.5px solid rgba(88,204,2,0.3)' }}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold" style={{ color: 'var(--duo-green-dark)' }}>
                      {forgot.botUsername ? `@${forgot.botUsername}` : 'Code bot'} kontaktni tasdiqlaydi
                    </span>
                    {forgot.expiresAt && !forgotExpired && (
                      <span className="font-mono" style={{ color: 'var(--duo-text-secondary)' }}>{forgotRemainingLabel}</span>
                    )}
                  </div>
                  {forgot.deepLink && (
                    <a
                      href={forgot.deepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="duo-btn duo-btn--blue mt-3 text-xs"
                      style={{ padding: '8px 12px', textTransform: 'none' }}
                    >
                      <Icon name="send" size={12} /> Telegram botni ochish
                    </a>
                  )}
                </div>
                <div>
                  <label className="duo-label">Telegram kodi</label>
                  <input
                    value={forgot.code}
                    onChange={e => setForgot(prev => ({
                      ...prev,
                      code: e.target.value.replace(/\D/g, '').slice(0, 6),
                      error: '',
                    }))}
                    className="duo-input text-center font-mono tracking-[0.4em]"
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <div>
                  <label className="duo-label">Yangi parol</label>
                  <input
                    className="duo-input"
                    type="password"
                    placeholder="Kamida 8 ta belgi"
                    value={forgot.password}
                    onChange={e => setForgot(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  />
                </div>
                <div>
                  <label className="duo-label">Yangi parolni tasdiqlang</label>
                  <input
                    className="duo-input"
                    type="password"
                    placeholder="Parolni qaytaring"
                    value={forgot.confirm}
                    onChange={e => setForgot(prev => ({ ...prev, confirm: e.target.value, error: '' }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitForgotReset(); } }}
                  />
                </div>
                {forgot.error && (
                  <div className="duo-error text-xs"><Icon name="info" size={12} /> {forgot.error}</div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForgot(prev => ({ ...prev, step: 'phone', code: '', password: '', confirm: '', error: '' }))}
                    className="duo-btn duo-btn--ghost flex-1"
                  >
                    Qayta
                  </button>
                  <button
                    type="button"
                    onClick={submitForgotReset}
                    disabled={!forgot.code || forgot.password.length < 8 || forgot.password !== forgot.confirm || forgot.loading || forgotExpired}
                    className="duo-btn duo-btn--green flex-1"
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
      if (form.password.length < 8) { setPhoneError('Parol kamida 8 ta belgidan iborat bo‘lsin'); return; }
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
      <div className="duo-screen items-center justify-center">
        <div className="text-center animate-in px-6">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'var(--duo-green)', boxShadow: '0 6px 0 var(--duo-green-dark)', color: '#fff' }}>
            <Icon name="check" size={40} />
          </div>
          <h2 className="text-3xl font-extrabold mb-2" style={{ color: 'var(--duo-text)' }}>Tabriklaymiz!</h2>
          <p style={{ color: 'var(--duo-text-secondary)' }}>
            {registrationType === 'organization' ? "Tashkilot arizangiz qabul qilindi" : 'Hisobingiz muvaffaqiyatli yaratildi'}
          </p>
          {!isAuto && (
            <p className="text-sm mt-3 font-semibold" style={{ color: '#B8860B' }}>
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
    <div className="duo-screen">
      {/* Yuqori qator: orqaga */}
      <div className="flex items-center px-4 pt-4" style={{ minHeight: 52 }}>
        <button type="button" onClick={() => onNavigate('landing')}
          className="duo-skip flex items-center gap-1" aria-label="Orqaga">
          <Icon name="arrowLeft" size={18} /> Orqaga
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start md:justify-center px-5 py-6 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo size="lg" variant="wordmark" className="mb-5" />
            <h1 className="text-2xl font-extrabold mb-1" style={{ color: 'var(--duo-text)' }}>Ro'yxatdan o'tish</h1>
            <p className="text-sm" style={{ color: 'var(--duo-text-secondary)' }}>
              {step === 1 ? "Avval qanday boshlashingizni tanlang" :
               registrationType === 'organization' ? "Tashkilot va mas'ul shaxs ma'lumotlari" :
               'Hisobingizni yarating'}
            </p>
          </div>

          {/* Steps */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold transition-all"
                  style={step >= s
                    ? { background: 'var(--duo-green)', color: '#fff' }
                    : { background: 'var(--duo-card)', color: '#bbb', border: '2px solid var(--duo-border)' }}>{s}</div>
                {s < 3 && <div className="flex-1 h-1 rounded-full transition-all" style={{ background: step > s ? 'var(--duo-green)' : 'var(--duo-border)' }} />}
              </React.Fragment>
            ))}
          </div>

        {/* Step 2: credentials */}
        {step === 2 && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="duo-label">
                {registrationType === 'organization' ? "Mas'ul shaxs ism familiyasi" : 'Ism familiya'}
              </label>
              <input className="duo-input" placeholder="Ali Valiyev" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="duo-label">Telefon raqam</label>
              <input ref={regPhoneInputRef.ref} className="duo-input" type="tel" inputMode="numeric" autoComplete="tel" maxLength={13}
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
              {phoneError && <div className="duo-error text-xs mt-1"><Icon name="info" size={12} /> {phoneError}</div>}
            </div>
            <TelegramVerifyBlock
              phone={normalizedRegisterPhone}
              phoneValid={phoneValidForVerify}
              verified={phoneVerified}
              onVerified={() => setPhoneVerified(true)}
            />
            <div>
              <label className="duo-label">Parol</label>
              <input className="duo-input" type="password" placeholder="Kamida 8 ta belgi" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="duo-label">Parolni tasdiqlang</label>
              <input className="duo-input" type="password" placeholder="Parolni qaytaring" value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })} />
              {form.confirm && form.password !== form.confirm &&
                <div className="text-xs mt-1 font-semibold" style={{ color: 'var(--duo-red)' }}>Parollar mos kelmaydi</div>}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="duo-btn duo-btn--ghost flex-1">← Orqaga</button>
              <button onClick={goNext}
                disabled={!form.name || !form.phone || form.password.length < 8 || form.password !== form.confirm || !!phoneError || !phoneVerified}
                className="duo-btn duo-btn--green flex-1">
                {registrationType === 'organization' ? "Tashkilotga o'tish" : 'Davom etish'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: registration type */}
        {step === 1 && (
          <div className="space-y-3 animate-in">
            <div className="duo-label" style={{ textTransform: 'none', fontSize: 14 }}>Qanday ro'yxatdan o'tmoqchisiz?</div>
            {[
              { k:'student', icon:'🎓', label:"O'quvchi", desc:'Olimpiadalarda qatnashish' },
              { k:'organization', icon:'🏛', label:"Tashkilot/o'quv markaz", desc:"Tashkilotni ro'yxatdan o'tkazish" },
            ].map(r => (
              <button key={r.k} onClick={() => selectRegistrationType(r.k)}
                className={`duo-option ${registrationType === r.k ? 'duo-option--active' : ''}`}>
                <span className="text-2xl">{r.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold" style={{ color: 'var(--duo-text)' }}>{r.label}</div>
                  <div className="text-xs" style={{ color: 'var(--duo-text-secondary)' }}>{r.desc}</div>
                </div>
                {registrationType === r.k && <Icon name="check" size={18} style={{ color: 'var(--duo-green)' }} />}
              </button>
            ))}
            <div className="flex gap-3 pt-2">
              <button onClick={() => onNavigate('login')} className="duo-btn duo-btn--ghost flex-1">Kirish</button>
              <button onClick={goNext} disabled={!registrationType} className="duo-btn duo-btn--green flex-1">Davom etish</button>
            </div>
          </div>
        )}

        {/* Step 3: selected registration flow */}
        {step === 3 && registrationType === 'student' && (
          <div className="space-y-4 animate-in">
            <div>
              <label className="duo-label">Tashkilot yoki markaz tanlash <span style={{ color: '#bbb', textTransform: 'none' }}>(ixtiyoriy)</span></label>
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#bbb' }} />
                <input className="duo-input pl-10" placeholder="Nomi, turi, viloyat yoki tuman..." value={centerSearch}
                  onChange={e => setCenterSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredCenters.map(c => (
                <div key={c.id}
                  onClick={() => setCenterId(centerId === c.id ? null : c.id)}
                  className={`duo-option ${centerId === c.id ? 'duo-option--active' : ''}`} style={{ justifyContent: 'space-between', padding: 12 }}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt={c.name} className="h-9 w-9 rounded-xl object-cover flex-shrink-0"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }} />
                    ) : null}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${c.imageUrl ? 'hidden' : ''}`} style={{ background: 'var(--duo-green)' }}>{c.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate" style={{ color: 'var(--duo-text)' }}>{c.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--duo-text-secondary)' }}>{c.organizationType || "O'quv markaz"} · {formatCenterLocation(c)} · {c.students} o'quvchi</div>
                    </div>
                  </div>
                  {centerId === c.id && <Icon name="check" size={16} style={{ color: 'var(--duo-green)' }} />}
                </div>
              ))}
            </div>
            {centerId && (
              <div className="rounded-xl p-3 text-sm flex items-center gap-2" style={{ background: '#F3FFE8', border: '1.5px solid rgba(88,204,2,0.3)', color: 'var(--duo-green-dark)' }}>
                <Icon name="info" size={14} /> Ariza managerga yuboriladi va tasdiqlanishi kutiladi
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="duo-btn duo-btn--ghost flex-1">← Orqaga</button>
              <button onClick={submit} disabled={loading} className="duo-btn duo-btn--green flex-1">
                {loading ? 'Yuborilmoqda...' : "Ro'yxatdan o'tish"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && registrationType === 'organization' && (
          <div className="space-y-4 animate-in">
            <div className="duo-label" style={{ textTransform: 'none', fontSize: 14 }}>Yangi tashkilot yoki markaz ma'lumotlari</div>
            <div>
              <label className="duo-label">Tashkilot turi</label>
              <select className="duo-input" value={newCenter.organizationType}
                onChange={e => setNewCenter({ ...newCenter, organizationType: e.target.value, customOrganizationType: e.target.value === 'Boshqa' ? newCenter.customOrganizationType : '' })}>
                {ORGANIZATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            {newCenter.organizationType === 'Boshqa' && (
              <div>
                <label className="duo-label">Tashkilot turini yozing</label>
                <input className="duo-input" placeholder="Masalan: Respublika markazi" value={newCenter.customOrganizationType}
                  onChange={e => setNewCenter({ ...newCenter, customOrganizationType: e.target.value })} />
              </div>
            )}
            <div>
              <label className="duo-label">Davlat</label>
              <select className="duo-input" value={newCenter.country}
                onChange={e => setNewCenter({ ...newCenter, country: e.target.value })}>
                <option value="O'zbekiston">O'zbekiston</option>
              </select>
            </div>
            <div>
              <label className="duo-label">Viloyat</label>
              <select className="duo-input" value={newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, region: e.target.value, district: '' })}>
                <option value="">Viloyatni tanlang...</option>
                {UZBEKISTAN_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
              </select>
            </div>
            <div>
              <label className="duo-label">Tuman/Shahar</label>
              <select className="duo-input" value={newCenter.district}
                disabled={!newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, district: e.target.value })}>
                <option value="">{newCenter.region ? 'Tumanni tanlang...' : 'Avval viloyatni tanlang'}</option>
                {districtOptions.map(district => <option key={district} value={district}>{district}</option>)}
              </select>
            </div>
            <div>
              <label className="duo-label">Tashkilot/markaz nomi</label>
              <input className="duo-input" placeholder="Masalan: Smart Education" value={newCenter.name}
                onChange={e => setNewCenter({ ...newCenter, name: e.target.value })} />
            </div>
            <div>
              <label className="duo-label">Yo'naltirilgan fanlar</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS_LIST.map(s => {
                  const on = newCenter.subjects.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => setNewCenter({
                        ...newCenter,
                        subjects: on ? newCenter.subjects.filter(x => x !== s) : [...newCenter.subjects, s],
                      })}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      style={on
                        ? { background: 'var(--duo-green)', color: '#fff' }
                        : { background: 'var(--duo-card)', color: 'var(--duo-text-secondary)', border: '1.5px solid var(--duo-border)' }}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-xl p-3 text-sm flex items-center gap-2" style={{ background: '#FFFBEB', border: '1.5px solid rgba(255,217,0,0.4)', color: '#92740B' }}>
              <Icon name="info" size={14} /> Tashkilot Platform Admin tomonidan tasdiqlangach faollashadi.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="duo-btn duo-btn--ghost flex-1">← Orqaga</button>
              <button onClick={submit} disabled={loading || !newCenterTypeValid || !newCenterLocationValid || !newCenter.name} className="duo-btn duo-btn--green flex-1">
                {loading ? 'Yuborilmoqda...' : 'Arizani yuborish'}
              </button>
            </div>
          </div>
        )}

          <p className="text-center text-sm mt-6" style={{ color: 'var(--duo-text-secondary)' }}>
            Hisobingiz bormi?{' '}
            <button onClick={() => onNavigate('login')} className="font-bold transition-colors" style={{ color: 'var(--duo-green)' }}>Kirish</button>
          </p>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { LoginPage, RegisterPage });
