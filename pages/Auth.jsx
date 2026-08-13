// pages/Auth.jsx — Login + account/organization Register

const SUBJECTS_LIST = ['Matematika','Ingliz tili','Ona tili','Informatika','IT','Fizika','Kimyo','Biologiya','Tarix','Geografiya'];
const ORGANIZATION_TYPES = ["O'quv markaz", 'Maktab', 'Universitet/Kollej', 'Tashkilot', 'Online academy', 'Boshqa'];

// Bosma imtihon varaqasidagi maydon yorlig'i: kichik, katta harfli, siyrak
// harflar — to'ldiriladigan bo'sh chiziq ustidagi yozuv kabi. Avval ikkita
// alohida daraja bor edi (text-sm/60 va text-xs/50); byulleten uslubida
// yorliqning bitta rangi bo'ladi, shuning uchun ular bittaga birlashtirildi.
//
// Rang `text-primary`, `text-secondary` emas: bu yorliq modal ichida ham
// ishlatiladi va to'q mavzuda surface-1 ustidagi text-secondary 4.45:1 ga
// tushadi (11px uchun 4.5 kerak). Daraja farqi rangdan emas — o'lcham, katta
// harf va harflararo masofadan chiqadi, bosma blankadagi kabi.
const FIELD_LABEL = 'block text-[11px] font-bold uppercase tracking-[0.1em] text-text-primary mb-2';
// UZBEKISTAN_DISTRICTS va UZBEKISTAN_REGIONS pages/constants/uzbekistanDistricts.js
// ga ko'chirildi — Olympy.html ularni bu fayldan oldin yuklaydi, shuning uchun
// global scope'da shu yerda ham ko'rinadi.

// ─── Login ────────────────────────────────────────────────────────────────
// Telefon input endi shared.jsx dagi `PhoneField` komponenti orqali ishlanadi
// (davlat kodi tanlash + xalqaro E.164, defolt O'zbekiston +998).

const GoogleAuthButton = ({ role = 'student', onLogin, setError, loading, setLoading }) => {
  // Google'ning haqiqiy tugmasini shu konteynerga render qilamiz. U ko'rinadigan
  // custom tugma ustida shaffof (opacity:0) qatlam sifatida turadi va foydalanuvchi
  // bosganda bosish to'g'ridan-to'g'ri Google'ning o'z tugmasiga tushadi.
  const overlayRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const [btnWidth, setBtnWidth] = React.useState(320);

  // Amaldagi manba — `VITE_GOOGLE_CLIENT_ID` (build paytida). `window.GOOGLE_CLIENT_ID`
  // faqat runtime'da (CSP nonce bilan) qiymat kiritilsa ishlaydi: Olympy.html dagi
  // inline skript CSP tomonidan bloklangani uchun olib tashlandi.
  const clientId = window.GOOGLE_CLIENT_ID || import.meta.env?.VITE_GOOGLE_CLIENT_ID || '238943789457-rp81dheh17qfcc184323uaevg6act9ck.apps.googleusercontent.com';

  const triggerLoginWithCredential = async (credential) => {
    setLoading(true);
    // MUHIM: tarmoq chaqiruvi va undan KEYINGI klient ishi (javobni map
    // qilish, auth'ni saqlash, sahifaga o'tish) ATAYIN alohida try'larda.
    // Avval hammasi bitta catch ostida edi: server 200 qaytargandan keyin
    // klientda yuz bergan har qanday istisno ham `toUserMessage` orqali
    // "Server bilan bog'lanishda xatolik yuz berdi" bo'lib ko'rinardi —
    // ya'ni Google kirishi ALLAQACHON muvaffaqiyatli bo'lgan holatda ham
    // foydalanuvchiga (va nosozlikni qidiruvchiga) tarmoq/server aybdor
    // deb ko'rsatilardi.
    let data;
    try {
      data = await OlympyApi.loginWithGoogle({ credential, role });
    } catch (err) {
      setError(OlympyApi.toUserMessage(err) || "Google orqali kirishda xatolik yuz berdi");
      setLoading(false);
      return;
    }
    try {
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
      // Server javobi keldi, lekin uni qayta ishlashda qulab tushdik —
      // console'ga xom istisno yoziladi (tashxis uchun yagona iz).
      console.error('Google login: javobni qayta ishlashda xatolik', err);
      setError("Kirish yakunlanmadi. Sahifani yangilab, qayta urinib ko'ring.");
      setLoading(false);
    }
  };

  // Custom tugma kengligini o'lchab, Google tugmasini shunga mos render qilamiz
  // (GIS renderButton foizli emas, faqat piksel kenglik qabul qiladi; 200–400 orasi).
  React.useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = wrapRef.current?.offsetWidth;
      if (w) setBtnWidth(Math.max(200, Math.min(400, Math.round(w))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // MUHIM: avval custom Google tugmasini yashirin konteynerga render qilib,
  // bosilganda uni programmatik `click()` qilardik. Ammo GIS renderButton
  // tugmani `accounts.google.com/gsi/button` dan yuklanadigan CROSS-ORIGIN
  // iframe ichida chizadi — parent hujjatdan `querySelector('div[role=button]')`
  // u iframe ichiga kira olmaydi (brauzer xavfsizlik chegarasi), shuning uchun
  // bosiladigan element hech qachon topilmaydi va "hali tayyor emas" xatosi
  // chiqadi. Yechim: Google'ning haqiqiy tugmasini custom tugma ustiga shaffof
  // qatlam qilib joylashtiramiz — foydalanuvchining haqiqiy bosishi to'g'ridan-
  // to'g'ri Google iframe'iga tushadi (bu iframe bo'lsa ham, oddiy DOM bo'lsa ham
  // ishlaydi). One Tap `prompt()` emas, `renderButton` ishlatamiz — u klassik
  // OAuth hisob-tanlash popup'ini ochadi va One Tap dismiss cooldown'iga bo'ysunmaydi.
  React.useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const render = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !overlayRef.current) {
        if (attempts++ < 40) setTimeout(render, 150);
        return;
      }
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              triggerLoginWithCredential(response.credential);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        overlayRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(overlayRef.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: role === 'student' ? 'signin_with' : 'signup_with',
          width: btnWidth,
        });
      } catch (e) {
        console.warn('Google Identity initialization error:', e);
      }
    };
    render();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, btnWidth]);

  // Faqat teskari aloqa uchun: agar Google tugmasi hali render bo'lmagan bo'lsa
  // (SDK yuklanmagan yoki origin ruxsat etilmagan) — foydalanuvchiga xabar beramiz.
  // Google tugmasi mavjud bo'lsa, bosish allaqachon uning iframe'iga tushgan,
  // bu handler shunchaki eski xatoni tozalaydi.
  const handleOverlayClick = () => {
    setError('');
    const rendered = overlayRef.current && overlayRef.current.childElementCount > 0;
    if (!window.google?.accounts?.id || !rendered) {
      setError("Google hali tayyor emas. Sahifani yangilab, biroz kutib qayta urinib ko'ring.");
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="relative my-5 text-center">
        <div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-edge" /></div>
        <span className="relative bg-ground px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-secondary">yoki</span>
      </div>

      <div ref={wrapRef} className="relative w-full" style={{ minHeight: '52px' }}>
        {/* Ko'rinadigan custom tugma — faqat vizual, bosishni ushlamaydi. */}
        <div
          aria-hidden="true"
          className={`w-full py-3.5 px-4 rounded-lg bg-surface-1 border border-edge text-text-primary font-bold flex items-center justify-center gap-3 ${loading ? 'opacity-60' : ''}`}
          style={{ pointerEvents: 'none' }}
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Google orqali kirish</span>
        </div>

        {/* Google'ning haqiqiy tugmasi — custom tugma ustida shaffof qatlam.
            opacity:0 hit-testingga ta'sir qilmaydi, shuning uchun ko'rinmas bo'lsa
            ham bosishni oladi. Bosish to'g'ridan-to'g'ri Google iframe'iga tushadi. */}
        <div
          ref={overlayRef}
          onClickCapture={handleOverlayClick}
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ opacity: 0, zIndex: 2, pointerEvents: loading ? 'none' : 'auto' }}
        />
      </div>
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
    <div className="min-h-screen flex bg-ground text-text-primary">
      {/* Chap ustun — byulletenning sarlavha bloki. Avval bu yerda suzuvchi
          glass kartalar va rangli glow dog'lar bor edi; endi bosma varaqadagi
          kabi sarlavha chizig'i va xususiyatlar jadvali. */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-12 xl:px-20 py-12">
        <div className="w-full max-w-md">
          <BrandLogo compact size="xl" />
          <div className="mt-8 border-t-2 border-edge-strong pt-6">
            <h2 className="font-display text-4xl font-bold text-text-primary text-balance">Xush kelibsiz</h2>
            <p className="mt-3 text-text-secondary leading-relaxed text-balance">
              O'zbekistonning zamonaviy olimpiada platformasiga kiring va yutuqlarga erishishni boshlang.
            </p>
          </div>
          {/* Platforma yangi — soxta "120+ tashkilot, 15K+ o'quvchi"
              raqamlari o'rniga imkoniyatlar ro'yxati. */}
          <dl className="mt-10 border-t border-edge">
            {[
              { k: 'Savol generatori', v: 'AI' },
              { k: 'Import', v: 'PDF' },
              { k: 'Xabarnoma', v: 'Telegram bot' },
              { k: 'Ishlash rejimi', v: '24/7' },
            ].map(row => (
              <div key={row.k} className="flex items-baseline justify-between gap-6 border-b border-edge py-3">
                <dt className="text-sm text-text-secondary">{row.k}</dt>
                <dd className="font-display font-bold text-text-primary tracking-wide font-data">{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* O'ng ustun — formaning o'zi. Ustunlar orasidagi ingichka chiziq
          bosma varaqadagi ustun ajratgichi vazifasini bajaradi. */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-start lg:justify-center px-5 md:px-8 py-8 md:py-12 lg:border-l lg:border-edge">
        <div className="mb-7">
          <div className="flex items-center justify-between gap-3 mb-7">
            <button type="button" onClick={() => onNavigate('landing')}
              className="flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label="Bosh sahifaga qaytish">
              <BrandLogo size="lg" />
            </button>
            <ThemeToggle />
          </div>
          <div className="border-t-2 border-edge-strong pt-5">
            <h1 className="font-display text-3xl font-bold text-text-primary text-balance">{step === '2fa' ? 'Ikki bosqichli tasdiqlash' : 'Kirish'}</h1>
            <p className="mt-1.5 text-text-secondary text-sm">{step === '2fa' ? 'Autentifikator ilovasidagi kodni kiriting' : 'Hisobingizga kiring'}</p>
          </div>
        </div>

        {step === '2fa' ? (
          <form onSubmit={handleTotpVerify} className="space-y-4">
            <div>
              <label className={FIELD_LABEL}>6 raqamli kod</label>
              <input
                className="input-field text-center font-data tracking-[0.4em] text-lg"
                value={totpCode}
                onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
              />
              <p className="text-text-secondary text-xs mt-2">Authenticator (Google/Microsoft Authenticator, Authy) ilovasini oching</p>
            </div>
            {error && <ErrorBanner message={<span className="flex items-center gap-2"><Icon name="info" size={16} />{error}</span>} />}
            <button type="submit" disabled={loading || totpCode.length < 6}
              className="btn-primary w-full py-3.5 rounded-lg font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
              {loading ? <><Spinner size={20} /> Tekshirilmoqda...</> : 'Tasdiqlash'}
            </button>
            <button type="button" onClick={backToLogin}
              className="btn-ghost w-full py-3 rounded-lg font-semibold">← Orqaga</button>
          </form>
        ) : (
        <form onSubmit={restoreMode ? handleRestoreAccount : handleLogin} className="space-y-4">
          {restoreMode && (
            <div className="text-sm text-warning bg-warning/10 border border-warning/35 rounded-lg px-4 py-3" role="status">
              Hisobingiz o&apos;chirilgan. 30 kun ichida telefon va parol bilan tiklashingiz mumkin.
            </div>
          )}
          <div>
            <label className={FIELD_LABEL}>Telefon raqam</label>
            <PhoneField value={form.phone} onChange={phone => setForm(f => ({ ...f, phone }))} />
          </div>
          <div>
            <label className={FIELD_LABEL}>Parol</label>
            <div className="relative">
              <input className="input-field pr-12" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-text-secondary hover:text-text-primary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                title={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
                aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
                aria-pressed={showPass}>
                <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          {restoreMode && (
            <div>
              <label className={FIELD_LABEL}>2FA kod (agar yoqilgan bo‘lsa)</label>
              <input
                className="input-field text-center font-data tracking-widest"
                value={restoreTotp}
                onChange={e => setRestoreTotp(e.target.value)}
                placeholder="000000"
                inputMode="numeric"
              />
            </div>
          )}
          {/* Xato rangi `error` tokeni (kuydirilgan to'q sariq) — shtamp
              qizilidan ATAYIN farq qiladi, akcent bilan qorishmasin. */}
          {error && <ErrorBanner message={<span className="flex items-center gap-2"><Icon name="info" size={16} className="flex-shrink-0" />{error}</span>} />}
          {!restoreMode && (
          <div className="flex items-center justify-end text-sm">
            {/* Havola rangi emas, CHIZIG'I akcent: #C0362C qog'oz fonida
                4.34:1 — 14px matn uchun yetarli emas. Akcent chiziq sifatida
                qoladi (belgiga 3:1 talab), matn esa text-primary. */}
            <button type="button" onClick={openForgotModal}
              className="text-text-primary underline underline-offset-4 decoration-accent decoration-2 hover:decoration-[3px] transition-all rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Parolni unutdingizmi?</button>
          </div>
          )}
          <button type="submit" disabled={loading || restoreBusy}
            className="btn-primary w-full py-3.5 rounded-lg font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {restoreMode
              ? (restoreBusy ? <><Spinner size={20} /> Tiklanmoqda...</> : 'Hisobni tiklash')
              : (loading ? <><Spinner size={20} /> Kirish...</> : 'Kirish')}
          </button>
          {restoreMode && (
            <button type="button" onClick={() => { setRestoreMode(false); setError(''); setRestoreTotp(''); }}
              className="btn-ghost w-full py-3 rounded-lg font-semibold">← Oddiy kirish</button>
          )}
          {!restoreMode && (
            <GoogleAuthButton role="student" onLogin={onLogin} setError={setError} loading={loading} setLoading={setLoading} />
          )}
        </form>
        )}

        {step !== '2fa' && (
        <p className="text-center text-sm text-text-secondary mt-7 pt-5 border-t border-edge">
          Hisobingiz yo'qmi?{' '}
          <button onClick={() => onNavigate('register')}
            className="text-text-primary font-bold underline underline-offset-4 decoration-accent decoration-2 hover:decoration-[3px] transition-all rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Ro'yxatdan o'ting</button>
        </p>
        )}
      </div>
      {/* Avval bu modal o'zining raw `fixed inset-0` overlay'ini hardcoded
          rangi (#12141a) bilan yasagan edi — ilovadagi boshqa modallar
          (Modal komponenti) bilan bir xil portal/backdrop-close xatti-
          harakatini olmasdi. */}
      <Modal open={forgotOpen} onClose={closeForgotModal} title="Parolni tiklash" width="max-w-md">
        <>
            {forgot.step === 'phone' && (
              <div className="space-y-4">
                {/* Modal foni surface-1 — unda text-secondary to'q mavzuda
                    4.45:1 beradi, shuning uchun modal matni text-primary. */}
                <p className="text-text-primary text-sm leading-relaxed">
                  Telefon raqamingizni kiriting. Code bot telefoningizni tasdiqlatib, parolni tiklash kodini yuboradi.
                </p>
                <div>
                  <label className={FIELD_LABEL}>Telefon raqam</label>
                  <PhoneField
                    value={forgot.phone}
                    onChange={phone => setForgot(prev => ({ ...prev, phone, error: '' }))}
                  />
                </div>
                {forgot.error && (
                  <div className="text-xs text-error flex items-start gap-1.5" role="alert">
                    <Icon name="info" size={12} className="flex-shrink-0 mt-0.5" /> {forgot.error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={closeForgotModal} className="btn-ghost flex-1 py-3 rounded-lg font-semibold">
                    Bekor qilish
                  </button>
                  <button
                    type="button"
                    onClick={startForgotReset}
                    disabled={!normalizedForgotPhone || forgot.loading}
                    className="btn-primary flex-1 py-3 rounded-lg font-semibold disabled:opacity-50"
                  >
                    {forgot.loading ? 'Yuborilmoqda...' : "Botga o'tish"}
                  </button>
                </div>
              </div>
            )}

            {forgot.step === 'code' && (
              <div className="space-y-4">
                <div className="rounded-lg p-3 bg-surface-2 border border-edge">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-primary">
                      {forgot.botUsername ? `@${forgot.botUsername}` : 'Code bot'} kontaktni tasdiqlaydi
                    </span>
                    {forgot.expiresAt && !forgotExpired && (
                      <span className="text-text-primary font-data font-bold">{forgotRemainingLabel}</span>
                    )}
                  </div>
                  {forgot.deepLink && (
                    <a
                      href={forgot.deepLink}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => { if (openTelegramDeepLink(forgot.deepLink)) e.preventDefault(); }}
                      className="btn-ghost mt-3 text-xs px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 font-semibold"
                    >
                      <Icon name="send" size={12} /> Telegram botni ochish
                    </a>
                  )}
                </div>
                <div>
                  <label className={FIELD_LABEL}>Telegram kodi</label>
                  <input
                    value={forgot.code}
                    onChange={e => setForgot(prev => ({
                      ...prev,
                      code: e.target.value.replace(/\D/g, '').slice(0, 6),
                      error: '',
                    }))}
                    className="input-field text-center font-data tracking-[0.4em]"
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Yangi parol</label>
                  <input
                    className="input-field"
                    type="password"
                    placeholder="Kamida 8 ta belgi"
                    value={forgot.password}
                    onChange={e => setForgot(prev => ({ ...prev, password: e.target.value, error: '' }))}
                  />
                </div>
                <div>
                  <label className={FIELD_LABEL}>Yangi parolni tasdiqlang</label>
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
                  <div className="text-xs text-error flex items-start gap-1.5" role="alert">
                    <Icon name="info" size={12} className="flex-shrink-0 mt-0.5" /> {forgot.error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForgot(prev => ({ ...prev, step: 'phone', code: '', password: '', confirm: '', error: '' }))}
                    className="btn-ghost flex-1 py-3 rounded-lg font-semibold"
                  >
                    Qayta
                  </button>
                  <button
                    type="button"
                    onClick={submitForgotReset}
                    disabled={!forgot.code || forgot.password.length < 8 || forgot.password !== forgot.confirm || forgot.loading || forgotExpired}
                    className="btn-primary flex-1 py-3 rounded-lg font-semibold disabled:opacity-50"
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
  // Emoji ikonkalar olib tashlandi — byulleten uslubida bo'lim belgisi
  // sifatida emoji ishlatilmaydi, o'rniga variant harfi va yozuv turadi.
  const registerTypeMeta = {
    student: { title: "O'quvchi sifatida", subtitle: 'Olimpiadalarda qatnashish uchun hisob yarating.' },
    organization: { title: "Tashkilot ro'yxatdan o'tkazish", subtitle: "Tashkilotni tasdiqqa yuboring, tasdiqlangach direktor paneli ochiladi." },
  };
  const currentRegisterMeta = registerTypeMeta[registrationType] || {
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
      <div className="min-h-screen flex items-center justify-center bg-ground text-text-primary px-5">
        {/* Tasdiq muhri — to'ldirilgan doira va glow o'rniga chegara bilan
            chizilgan shtamp halqasi. */}
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full border-2 border-accent text-accent flex items-center justify-center mx-auto mb-6">
            <Icon name="check" size={36} />
          </div>
          <h2 className="font-display text-3xl font-bold text-text-primary mb-2 text-balance">Tabriklaymiz</h2>
          <p className="text-text-secondary text-balance">
            {registrationType === 'organization' ? "Tashkilot arizangiz qabul qilindi" : 'Hisobingiz muvaffaqiyatli yaratildi'}
          </p>
          {!isAuto && (
            <p className="text-warning text-sm mt-4 pt-4 border-t border-edge text-balance">
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
    <div className="min-h-screen flex bg-ground text-text-primary">
      {/* Chap ustun — arizaning izoh bloki. Glass karta va emoji o'rniga
          sarlavha chizig'i va chiziqcha bilan ajratilgan ro'yxat. */}
      <div className="hidden lg:flex flex-1 flex-col justify-center px-12 xl:px-20 py-12">
        <div className="w-full max-w-md">
          <BrandLogo compact size="lg" />
          <div className="mt-8 border-t-2 border-edge-strong pt-6">
            <h2 className="font-display text-3xl font-bold text-text-primary text-balance">
              {currentRegisterMeta.title}
            </h2>
            <p className="mt-3 text-text-secondary leading-relaxed text-balance">
              {currentRegisterMeta.subtitle}
            </p>
          </div>
          <ul className="mt-10 border-t border-edge">
            {[
              "Tashkilot yoki shaxs sifatida boshlash",
              'Tasdiqlash arizalari',
              'Real vaqtda hisobotlar',
              'Telegram orqali xabarnoma',
            ].map(f => (
              <li key={f} className="border-b border-edge py-3 text-sm text-text-secondary">{f}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* O'ng ustun — ariza formasi. */}
      <div className="flex-1 lg:max-w-md flex flex-col justify-start lg:justify-center px-5 md:px-8 py-8 md:py-12 overflow-y-auto lg:border-l lg:border-edge">
        <div className="mb-7">
          <div className="flex items-center justify-between gap-3 mb-7">
            <button type="button" onClick={() => onNavigate('landing')}
              className="flex items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label="Bosh sahifaga qaytish">
              <BrandLogo size="lg" />
            </button>
            <ThemeToggle />
          </div>
          <div className="border-t-2 border-edge-strong pt-5">
            <h1 className="font-display text-3xl font-bold text-text-primary text-balance">Ro'yxatdan o'tish</h1>
            <p className="mt-1.5 text-text-secondary text-sm">
              {step === 1 ? "Avval qanday boshlashingizni tanlang" :
               registrationType === 'organization' ? "Tashkilot va mas'ul shaxs ma'lumotlari" :
               'Hisobingizni yarating'}
            </p>
          </div>

          {/* Bosqichlar — to'ldirilgan gradient doiralar o'rniga raqamlangan
              kataklar: joriy bosqich akcent chegarasi bilan belgilanadi.
              Raqamning O'ZI hech qachon akcent rangida emas: akcent qog'oz
              fonida 4.34:1 beradi (14px matn uchun 4.5 kerak), shuning uchun
              akcent faqat chegara/chiziq — matn esa text-primary. */}
          <div className="flex items-center gap-2 mt-6" role="list" aria-label={`Bosqich ${step} / 3`}>
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div role="listitem" aria-current={step === s ? 'step' : undefined}
                  className={`w-8 h-8 rounded-md border flex items-center justify-center text-sm font-bold font-data transition-colors ${
                    step === s ? 'border-accent bg-accent/10 text-text-primary'
                    : step > s ? 'border-edge-strong text-text-primary'
                    : 'border-edge text-text-secondary'}`}>{s}</div>
                {s < 3 && <div className={`flex-1 h-px transition-colors ${step > s ? 'bg-accent' : 'bg-edge'}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 2: credentials */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className={FIELD_LABEL}>
                {registrationType === 'organization' ? "Mas'ul shaxs ism familiyasi" : 'Ism familiya'}
              </label>
              <input className="input-field" placeholder="Ali Valiyev" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Telefon raqam</label>
              <PhoneField value={form.phone} onChange={phone => {
                setForm(f => ({ ...f, phone }));
                validatePhone(phone);
              }} />
              {phoneError && <div className="flex items-start gap-1.5 text-error text-xs mt-2" role="alert"><Icon name="info" size={12} className="flex-shrink-0 mt-0.5" /> {phoneError}</div>}
            </div>
            <TelegramVerifyBlock
              phone={normalizedRegisterPhone}
              phoneValid={phoneValidForVerify}
              verified={phoneVerified}
              onVerified={() => setPhoneVerified(true)}
            />
            <div>
              <label className={FIELD_LABEL}>Parol</label>
              <input className="input-field" type="password" placeholder="Kamida 8 ta belgi" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Parolni tasdiqlang</label>
              <input className="input-field" type="password" placeholder="Parolni qaytaring" value={form.confirm}
                onChange={e => setForm({ ...form, confirm: e.target.value })} />
              {form.confirm && form.password !== form.confirm &&
                <div className="text-error text-xs mt-2" role="alert">Parollar mos kelmaydi</div>}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1 py-3.5 rounded-lg font-semibold">← Orqaga</button>
              <button onClick={goNext}
                disabled={!form.name || !form.phone || form.password.length < 8 || form.password !== form.confirm || !!phoneError || !phoneVerified}
                className="btn-primary flex-1 py-3.5 rounded-lg font-bold disabled:opacity-50">
                {registrationType === 'organization' ? "Tashkilotga o'tish →" : 'Davom etish →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 1: registration type */}
        {step === 1 && (
          <div className="space-y-3">
            <div className={FIELD_LABEL}>Qanday ro'yxatdan o'tmoqchisiz?</div>
            {/* Emoji o'rniga variant harfi — imtihon javob varaqasidagi
                A/B belgilanishi kabi. */}
            {[
              { k:'student', letter:'A', label:"O'quvchi", desc:'Olimpiadalarda qatnashish' },
              { k:'organization', letter:'B', label:"Tashkilot/o'quv markaz", desc:"Tashkilotni ro'yxatdan o'tkazish" },
            ].map(r => {
              const on = registrationType === r.k;
              // Tanlanmagan holat fon sifatida `ground` ni oladi (surface-1
              // emas): to'q mavzuda surface-1 ustidagi text-secondary 4.45:1 ga
              // tushardi, qog'oz fonida esa 4.9:1. Karta baribir chegara bilan
              // ajralib turadi — byulleten uslubiga ham mos.
              return (
                <button key={r.k} type="button" onClick={() => selectRegistrationType(r.k)} aria-pressed={on}
                  className={`w-full flex items-center gap-3.5 p-4 rounded-lg text-left border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    on ? 'border-accent bg-accent/10' : 'border-edge hover:bg-surface-1 hover:border-edge-strong'}`}>
                  <span aria-hidden="true"
                    className={`w-8 h-8 flex-shrink-0 rounded-md border flex items-center justify-center text-sm font-bold ${
                      on ? 'border-accent text-text-primary' : 'border-edge-strong text-text-secondary'}`}>{r.letter}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-text-primary">{r.label}</div>
                    <div className="text-xs text-text-secondary">{r.desc}</div>
                  </div>
                  {on && <Icon name="check" size={16} className="text-accent flex-shrink-0" />}
                </button>
              );
            })}
            <div className="flex gap-3 pt-2">
              <button onClick={() => onNavigate('login')} className="btn-ghost flex-1 py-3.5 rounded-lg font-semibold">Kirish</button>
              <button onClick={goNext} disabled={!registrationType} className="btn-primary flex-1 py-3.5 rounded-lg font-bold disabled:opacity-50">Davom etish →</button>
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
          <div className="space-y-4">
            <div>
              <label className={FIELD_LABEL}>Tashkilot yoki markaz tanlash <span className="font-normal normal-case tracking-normal">(ixtiyoriy)</span></label>
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input className="input-field pl-10" placeholder="Nomi, turi, viloyat yoki tuman..." value={centerSearch}
                  onChange={e => setCenterSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredCenters.map(c => {
                const on = centerId === c.id;
                return (
                  <button key={c.id} type="button" aria-pressed={on}
                    onClick={() => setCenterId(on ? null : c.id)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      on ? 'border-accent bg-accent/10' : 'border-edge hover:bg-surface-1 hover:border-edge-strong'}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover flex-shrink-0 border border-edge"
                          onError={e => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }} />
                      ) : null}
                      <div aria-hidden="true" className={`w-9 h-9 bg-surface-2 border border-edge-strong rounded-md flex items-center justify-center text-text-primary font-bold text-sm flex-shrink-0 ${c.imageUrl ? 'hidden' : ''}`}>{c.name[0]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-text-primary truncate">{c.name}</div>
                        <div className="text-xs text-text-secondary truncate">{c.organizationType || "O'quv markaz"} · {formatCenterLocation(c)} · {c.students} o'quvchi</div>
                      </div>
                    </div>
                    {on && <Icon name="check" size={16} className="text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
            {centerId && (
              <div className="rounded-lg p-3 bg-surface-2 border border-edge text-sm text-text-primary flex items-start gap-2" role="status">
                <Icon name="info" size={14} className="flex-shrink-0 mt-0.5" /> Ariza managerga yuboriladi va tasdiqlanishi kutiladi
              </div>
            )}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
              />
              <span className="text-xs text-text-secondary leading-relaxed">
                Men 13 yoshdan katta ekanligimni yoki ota-ona/vasiy roziligi borligini tasdiqlayman.
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-text-primary font-bold underline underline-offset-2 decoration-accent ml-1">Maxfiylik siyosati</a>
              </span>
            </label>
            {phoneError && <ErrorBanner message={<span className="flex items-start gap-2"><Icon name="info" size={16} className="flex-shrink-0 mt-0.5" />{phoneError}</span>} />}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-lg font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !ageConfirmed} className="btn-primary flex-1 py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <Spinner size={16} /> : "Ro'yxatdan o'tish"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && registrationType === 'organization' && (
          <div className="space-y-4">
            <div className="text-sm text-text-secondary border-b border-edge pb-3">Yangi tashkilot yoki markaz ma'lumotlari</div>
            <div>
              <label className={FIELD_LABEL}>Tashkilot turi</label>
              <select className="input-field" value={newCenter.organizationType}
                onChange={e => setNewCenter({ ...newCenter, organizationType: e.target.value, customOrganizationType: e.target.value === 'Boshqa' ? newCenter.customOrganizationType : '' })}>
                {ORGANIZATION_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
            {newCenter.organizationType === 'Boshqa' && (
              <div>
                <label className={FIELD_LABEL}>Tashkilot turini yozing</label>
                <input className="input-field" placeholder="Masalan: Respublika markazi" value={newCenter.customOrganizationType}
                  onChange={e => setNewCenter({ ...newCenter, customOrganizationType: e.target.value })} />
              </div>
            )}
            <div>
              <label className={FIELD_LABEL}>Davlat</label>
              <select className="input-field" value={newCenter.country}
                onChange={e => setNewCenter({ ...newCenter, country: e.target.value })}>
                <option value="O'zbekiston">O'zbekiston</option>
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL}>Viloyat</label>
              <select className="input-field" value={newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, region: e.target.value, district: '' })}>
                <option value="">Viloyatni tanlang...</option>
                {UZBEKISTAN_REGIONS.map(region => <option key={region} value={region}>{region}</option>)}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL}>Tuman/Shahar</label>
              <select className="input-field" value={newCenter.district}
                disabled={!newCenter.region}
                onChange={e => setNewCenter({ ...newCenter, district: e.target.value })}>
                <option value="">{newCenter.region ? 'Tumanni tanlang...' : 'Avval viloyatni tanlang'}</option>
                {districtOptions.map(district => <option key={district} value={district}>{district}</option>)}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL}>Tashkilot/markaz nomi</label>
              <input className="input-field" placeholder="Masalan: Smart Education" value={newCenter.name}
                onChange={e => setNewCenter({ ...newCenter, name: e.target.value })} />
            </div>
            <div>
              <label className={FIELD_LABEL}>Yo'naltirilgan fanlar</label>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS_LIST.map(s => {
                  const on = newCenter.subjects.includes(s);
                  return (
                    <button key={s} type="button"
                      onClick={() => setNewCenter({
                        ...newCenter,
                        subjects: on ? newCenter.subjects.filter(x => x !== s) : [...newCenter.subjects, s],
                      })}
                      aria-pressed={on}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        on ? 'border-accent bg-accent/10 text-text-primary font-bold' : 'border-edge text-text-secondary hover:bg-surface-1 hover:border-edge-strong'}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg p-3 border border-warning/35 bg-warning/10 text-sm text-warning flex items-start gap-2" role="status">
              <Icon name="info" size={14} className="flex-shrink-0 mt-0.5" /> Tashkilot Platform Admin tomonidan tasdiqlangach faollashadi.
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={e => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
              />
              <span className="text-xs text-text-secondary leading-relaxed">
                Men 13 yoshdan katta ekanligimni yoki ota-ona/vasiy roziligi borligini tasdiqlayman.
                <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-text-primary font-bold underline underline-offset-2 decoration-accent ml-1">Maxfiylik siyosati</a>
              </span>
            </label>
            {phoneError && <ErrorBanner message={<span className="flex items-start gap-2"><Icon name="info" size={16} className="flex-shrink-0 mt-0.5" />{phoneError}</span>} />}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3.5 rounded-lg font-semibold">← Orqaga</button>
              <button onClick={submit} disabled={loading || !ageConfirmed || !newCenterTypeValid || !newCenterLocationValid || !newCenter.name} className="btn-primary flex-1 py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <Spinner size={16} /> : 'Arizani yuborish'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm text-text-secondary mt-7 pt-5 border-t border-edge">
          Hisobingiz bormi?{' '}
          <button onClick={() => onNavigate('login')}
            className="text-text-primary font-bold underline underline-offset-4 decoration-accent decoration-2 hover:decoration-[3px] transition-all rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Kirish</button>
        </p>
      </div>
    </div>
  );
};

Object.assign(window, { LoginPage, RegisterPage });
