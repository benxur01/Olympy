// pages/Auth.jsx — Login + account/organization Register

const SUBJECTS_LIST = ['Matematika','Ingliz tili','Ona tili','Informatika','IT','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const ORGANIZATION_TYPES = ["O'quv markaz", 'Maktab', 'Universitet/Kollej', 'Tashkilot', 'Online academy', 'Boshqa'];
// UZBEKISTAN_DISTRICTS va UZBEKISTAN_REGIONS pages/constants/uzbekistanDistricts.js
// ga ko'chirildi — Olympy.html ularni bu fayldan oldin yuklaydi, shuning uchun
// global scope'da shu yerda ham ko'rinadi.

// ─── Login ────────────────────────────────────────────────────────────────
// Telefon input endi shared.jsx dagi `PhoneField` komponenti orqali ishlanadi
// (davlat kodi tanlash + xalqaro E.164, defolt O'zbekiston +998).

const GoogleAuthButton = ({ role = 'student', onLogin, setError, loading, setLoading }) => {
  const handleGoogleClick = () => {
    if (loading) return;
    setError('');

    const clientId = window.GOOGLE_CLIENT_ID || '1088734327299-demo.apps.googleusercontent.com';

    const triggerLoginWithCredential = async (credential) => {
      setLoading(true);
      try {
        const data = await OlympyApi.loginWithGoogle({ credential, role });
        const mappedUser = OlympyApi.mapBackendUser(data.user);
        OlympyApi.saveAuth({
          token: data.token,
          refresh: data.refresh,
          user: mappedUser,
          cookieAuth: data.cookie_auth,
          persistent: true,
        });
        onLogin(mappedUser);
      } catch (err) {
        setError(OlympyApi.toUserMessage(err) || "Google orqali kirishda xatolik yuz berdi");
        setLoading(false);
      }
    };

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              triggerLoginWithCredential(response.credential);
            }
          },
        });
        window.google.accounts.id.prompt((notification) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // Prompt fallback
          }
        });
      } catch (e) {
        console.warn('Google Identity initialization error:', e);
      }
    } else {
      setError("Google SDK skripti yuklanmadi. Sahifani qayta yangilab ko'ring.");
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="relative my-4 text-center">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
        <span className="relative bg-[#050508] px-3 text-xs text-white/40 uppercase font-semibold tracking-wider">yoki</span>
      </div>

      <button
        type="button"
        onClick={handleGoogleClick}
        disabled={loading}
        className="w-full py-3.5 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-sm disabled:opacity-60"
      >
        <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        <span>Google orqali kirish</span>
      </button>
    </div>
  );
};

const LoginPage = ({ onNavigate, onLogin }) => {
  const [form, setForm] = React.useState({ phone: '+998', password: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  // 2FA holati: backend `requires_2fa` qaytarsa, parol+telefonni saqlab,
  // foydalanuvchidan autentifikator kodini so'raymiz va qayta yuboramiz.
  const [step, setStep] = React.useState('login'); // 'login' | '2fa'
  const [totpCode, setTotpCode] = React.useState('');
  const [pendingPhone, setPendingPhone] = React.useState('');
  const [pendingPassword, setPendingPassword] = React.useState('');
  // Soft-deleted hisob: login o'rniga tiklash UI.
  const [restoreMode, setRestoreMode] = React.useState(false);
  const [restoreTotp, setRestoreTotp] = React.useState('');
  const [restoreBusy, setRestoreBusy] = React.useState(false);
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
      // Har bir foydalanuvchi login/register qilgach avtomatik "eslab
      // qolinadi" — checkbox yo'q, token har doim localStorage'da saqlanadi
      // va brauzer yopilib-ochilganda ham sessiya davom etadi.
      persistent: true,
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
      const data = err?.data || {};
      const deleted = !!(data.account_deleted || data.restorable
        || (typeof data.detail === 'object' && data.detail?.account_deleted));
      if (deleted) {
        setRestoreMode(true);
        setError(OlympyApi.toUserMessage(err) || "Hisob o'chirilgan — 30 kun ichida tiklash mumkin");
        setLoading(false);
        return;
      }
      const errorMsg = OlympyApi.toUserMessage(err);
      setError(errorMsg);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('olympy:auth_error', { detail: { error: errorMsg, type: 'login' } }));
    }
  };

  const handleRestoreAccount = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (restoreBusy) return;
    setRestoreBusy(true);
    setError('');
    try {
      const payload = { phone: form.phone, password: form.password };
      if (restoreTotp.trim()) payload.totp_code = restoreTotp.trim();
      const data = await OlympyApi.restoreMyAccount(payload);
      finishLogin(data);
    } catch (err) {
      setError(OlympyApi.toUserMessage(err) || "Tiklash muvaffaqiyatsiz");
      setRestoreBusy(false);
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
      const errorMsg = OlympyApi.toUserMessage(err);
      setError(errorMsg);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('olympy:auth_error', { detail: { error: errorMsg, type: '2fa' } }));
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
      // Login formasidan kelgan raqamni (xalqaro bo'lsa ham) saqlaymiz.
      phone: formatPhoneInput(phone || '+998', detectDialCode(phone || '+998')),
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
    if (typeof goToTelegramLink === 'function') {
      return goToTelegramLink(link, { fallbackRedirect: false });
    }
    try {
      const win = window.open(link, '_blank');
      if (win) {
        try { win.opener = null; } catch (_) {}
        return true;
      }
      return false;
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
        persistent: true,
      });
      onLogin(mappedUser);
    } catch (err) {
      setForgot(prev => ({ ...prev, loading: false, error: OlympyApi.toUserMessage(err) }));
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: '#050508' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center p-12 relative overflow-hidden z-10">
        <div className="hero-glow" style={{ background: '#6366f1', top: '20%', left: '20%' }} />
        <div className="hero-glow" style={{ background: '#22d3ee', bottom: '20%', right: '10%' }} />
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
      <div className="flex-1 lg:max-w-md flex flex-col justify-start md:justify-center px-5 md:px-8 py-8 md:py-12 relative z-10">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-2 mb-6 md:mb-8 cursor-pointer" onClick={() => onNavigate('landing')}>
            <BrandLogo size="lg" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white mb-2">{step === '2fa' ? 'Ikki bosqichli tasdiqlash' : 'Kirish'}</h1>
          <p className="text-white/40 text-sm md:text-base">{step === '2fa' ? 'Autentifikator ilovasidagi kodni kiriting' : 'Hisobingizga kiring'}</p>
        </div>

        {step === '2fa' ? (
          <form onSubmit={handleTotpVerify} className="space-y-4">
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">6 raqamli kod</label>
              <input
                className="input-field text-center font-mono tracking-[0.4em] text-lg"
                value={totpCode}
                onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
              />
              <p className="text-white/30 text-xs mt-2">Authenticator (Google/Microsoft Authenticator, Authy) ilovasini oching</p>
            </div>
            {error && <ErrorBanner message={<span className="flex items-center gap-2"><Icon name="info" size={16} />{error}</span>} />}
            <button type="submit" disabled={loading || totpCode.length < 6}
              className="btn-primary w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><Spinner size={20} /> Tekshirilmoqda...</> : 'Tasdiqlash'}
            </button>
            <button type="button" onClick={backToLogin}
              className="btn-ghost w-full py-3 rounded-2xl font-semibold">← Orqaga</button>
          </form>
        ) : (
        <form onSubmit={restoreMode ? handleRestoreAccount : handleLogin} className="space-y-4">
          {restoreMode && (
            <div className="text-sm text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              Hisobingiz o&apos;chirilgan. 30 kun ichida telefon va parol bilan tiklashingiz mumkin.
            </div>
          )}
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
            <PhoneField value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-2 font-medium">Parol</label>
            <div className="relative">
              <input className="input-field pr-12" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                title={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
                aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}>
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          {restoreMode && (
            <div>
              <label className="block text-sm text-white/60 mb-2 font-medium">2FA kod (agar yoqilgan bo‘lsa)</label>
              <input
                className="input-field text-center font-mono tracking-widest"
                value={restoreTotp}
                onChange={e => setRestoreTotp(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
              />
            </div>
          )}
          {error && <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-xl px-4 py-3"><Icon name="info" size={16} />{error}</div>}
          {!restoreMode && (
          <div className="flex items-center justify-end text-sm">
            <button type="button" onClick={openForgotModal} className="text-indigo-400 hover:text-indigo-300 transition-colors">Parolni unutdingizmi?</button>
          </div>
          )}
          <button type="submit" disabled={loading || restoreBusy}
            className="btn-primary w-full py-3.5 rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {restoreMode
              ? (restoreBusy ? <><Spinner size={20} /> Tiklanmoqda...</> : 'Hisobni tiklash')
              : (loading ? <><Spinner size={20} /> Kirish...</> : 'Kirish')}
          </button>
          {restoreMode && (
            <button type="button" onClick={() => { setRestoreMode(false); setError(''); setRestoreTotp(''); }}
              className="btn-ghost w-full py-3 rounded-2xl font-semibold">← Oddiy kirish</button>
          )}
          {!restoreMode && (
            <GoogleAuthButton role="student" onLogin={finishLogin} setError={setError} loading={loading} setLoading={setLoading} />
          )}
        </form>
        )}

        {step !== '2fa' && (
        <p className="text-center text-sm text-white/40 mt-6">
          Hisobingiz yo'qmi?{' '}
          <button onClick={() => onNavigate('register')} className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">Ro'yxatdan o'ting</button>
        </p>
        )}
      </div>
      {/* Avval bu modal o'zining raw `fixed inset-0` overlay'ini hardcoded
          rangi (#12141a) bilan yasagan edi — ilovadagi boshqa modallar
          (Modal komponenti) bilan bir xil portal/backdrop-close xatti-
          harakatini olmasdi. */}
      <Modal open={forgotOpen} onClose={closeForgotModal} title="🔐 Parolni tiklash" width="max-w-md">
        <>
            {forgot.step === 'phone' && (
              <div className="space-y-4">
                <p className="text-white/60 text-sm leading-relaxed">
                  Telefon raqamingizni kiriting. Code bot telefoningizni tasdiqlatib, parolni tiklash kodini yuboradi.
                </p>
                <div>
                  <label className="block text-sm text-white/60 mb-2 font-medium">Telefon raqam</label>
                  <PhoneField
                    value={forgot.phone}
                    onChange={phone => setForgot(prev => ({ ...prev, phone, error: '' }))}
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
                      onClick={(e) => { if (openTelegramDeepLink(forgot.deepLink)) e.preventDefault(); }}
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
                    placeholder="Kamida 8 ta belgi"
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
                    disabled={!forgot.code || forgot.password.length < 8 || forgot.password !== forgot.confirm || forgot.loading || forgotExpired}
                    className="btn-primary flex-1 py-3 rounded-2xl font-semibold disabled:opacity-50"
                  >
                    {forgot.loading ? 'Tekshirilmoqda...' : 'Parolni yangilash'}
                  </button>
                </div>
              </div>
            )}
        </>
      </Modal>
    </div>
  );
};

// ─── Register ─────────────────────────────────────────────────────────────
const RegisterPage = ({ onNavigate, onLogin }) => {
  const store = useStore();
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
  // Yosh siyosati: 13+ yoki ota-ona/vasiy roziligi.
  const [ageConfirmed, setAgeConfirmed] = React.useState(false);

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
    // Bo'sh maydon — hali xato ko'rsatmaymiz (foydalanuvchi yozayotgan bo'lishi
    // mumkin). Qiymat kiritilgan, lekin normalizatsiya muvaffaqiyatsiz bo'lsa —
    // yaroqsiz raqam, foydalanuvchiga aniq xabar ko'rsatamiz.
    const trimmed = String(v || '').trim();
    if (!trimmed) { setPhoneError(''); return; }
    const norm = OlympyStore.normalizePhone(v);
    if (!norm) { setPhoneError("To'g'ri telefon raqam kiriting"); return; }
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
      if (!ageConfirmed) {
        setPhoneError("13+ yosh yoki ota-ona/vasiy roziligini tasdiqlang");
        setLoading(false);
        return;
      }
      const registerPayload = {
        full_name: form.name,
        phone: form.phone,
        password: form.password,
        age_confirmed: true,
      };
      // `?ref=CODE` havola orqali kelgan referral kodi (app.jsx saqlab qo'ygan):
      // ro'yxatdan o'tishda backend'ga uzatamiz, ikkala tarafga bonus coin.
      let pendingReferral = '';
      try { pendingReferral = (localStorage.getItem('olympy:pendingReferral') || '').trim(); } catch {}
      if (pendingReferral) registerPayload.referral_code = pendingReferral;
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
        // Login sahifasidagi "Meni eslab qolish" defolt yoqilgani kabi —
        // ro'yxatdan o'tgan foydalanuvchi ham keyingi tashrifda qayta login
        // qilmasin (avval persistent belgilanmagani uchun sessionStorage'ga
        // tushib, brauzer yopilganda sessiya yo'qolardi).
        OlympyApi.saveAuth({ token: data.token, refresh: data.refresh, user: mappedUser, cookieAuth: data.cookie_auth, persistent: true });
        if (pendingReferral) { try { localStorage.removeItem('olympy:pendingReferral'); } catch {} }
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
      OlympyApi.saveAuth({ token, refresh, user: mappedUser, cookieAuth: data.cookie_auth, persistent: true });
      if (pendingReferral) { try { localStorage.removeItem('olympy:pendingReferral'); } catch {} }
      setSuccess(true);
      setTimeout(() => onLogin(mappedUser), 1600);
    } catch (err) {
      const errorMsg = OlympyApi.toUserMessage(err);
      setPhoneError(errorMsg);
      setLoading(false);
      window.dispatchEvent(new CustomEvent('olympy:auth_error', { detail: { error: errorMsg, type: 'register' } }));
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
              <PhoneField value={form.phone} onChange={phone => {
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
              <input className="input-field" type="password" placeholder="Kamida 8 ta belgi" value={form.password}
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
                disabled={!form.name || !form.phone || form.password.length < 8 || form.password !== form.confirm || !!phoneError || !phoneVerified}
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
            {registrationType && (
              <GoogleAuthButton
                role={registrationType === 'organization' ? 'owner' : 'student'}
                onLogin={onLogin}
                setError={setPhoneError}
                loading={loading}
                setLoading={setLoading}
              />
            )}
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
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                className="mt-1 rounded border-white/20 bg-white/5"
              />
              <span className="text-xs text-white/50 leading-relaxed">
                Men 13 yoshdan katta ekanligimni yoki ota-ona/vasiy roziligi borligini tasdiqlayman.
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">Maxfiylik siyosati</a>
              </span>
            </label>
            {phoneError && <ErrorBanner message={<span className="flex items-center gap-2"><Icon name="info" size={16} />{phoneError}</span>} />}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !ageConfirmed} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2">
                {loading ? <Spinner size={16} /> : "Ro'yxatdan o'tish"}
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
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                className="mt-1 rounded border-white/20 bg-white/5"
              />
              <span className="text-xs text-white/50 leading-relaxed">
                Men 13 yoshdan katta ekanligimni yoki ota-ona/vasiy roziligi borligini tasdiqlayman.
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline ml-1">Maxfiylik siyosati</a>
              </span>
            </label>
            {phoneError && <ErrorBanner message={<span className="flex items-center gap-2"><Icon name="info" size={16} />{phoneError}</span>} />}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-2xl font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !ageConfirmed || !newCenterTypeValid || !newCenterLocationValid || !newCenter.name} className="btn-primary flex-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <Spinner size={16} /> : 'Arizani yuborish'}
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
