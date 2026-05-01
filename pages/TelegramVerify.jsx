// pages/TelegramVerify.jsx — Telegram phone-verification step.
//
// Talks to the real Django backend by default via OlympyApi (which reads
// VITE_API_BASE_URL from src/services/api.js):
//   POST /api/auth/phone/start-telegram-verification/
//   POST /api/auth/phone/verify-otp/
//
// Set USE_MOCK_OTP = true to fall back to the local mock flow that generates
// the OTP in the browser and shows a "Demo kod" hint — useful for developing
// the UI without a running backend or a configured Telegram bot.

const USE_MOCK_OTP = false;

const TELEGRAM_BOT_USERNAME_DEMO = 'OlympyVerifyBot';
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const generateLocalOtp = () =>
  String(Math.floor(100000 + Math.random() * 900000));

const generateLocalToken = () =>
  'tok_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ─── Verification block ───────────────────────────────────────────────────
const TelegramVerifyBlock = ({ phone, phoneValid, verified, onVerified }) => {
  const [status, setStatus] = React.useState('idle'); // idle | opened
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [attempts, setAttempts] = React.useState(0);
  const [deepLink, setDeepLink] = React.useState('');
  const [expiresAt, setExpiresAt] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());

  // Backend session state — populated when USE_MOCK_OTP is false
  const [verificationId, setVerificationId] = React.useState(null);
  const [verifyToken, setVerifyToken] = React.useState(null);
  const [botUsername, setBotUsername] = React.useState('');

  // Mock-only state — only used when USE_MOCK_OTP is true
  const [mockToken] = React.useState(generateLocalToken);
  const [mockOtp, setMockOtp] = React.useState('');

  // Reset whenever the phone changes
  const lastPhoneRef = React.useRef(phone);
  React.useEffect(() => {
    if (lastPhoneRef.current !== phone) {
      lastPhoneRef.current = phone;
      setStatus('idle'); setCode(''); setDeepLink('');
      setError(''); setExpiresAt(null); setAttempts(0);
      setVerificationId(null); setVerifyToken(null); setBotUsername('');
      setMockOtp('');
    }
  }, [phone]);

  // Tick to update countdown / detect expiry
  React.useEffect(() => {
    if (status !== 'opened') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const isExpired = !!(expiresAt && now > expiresAt);
  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const remainingLabel = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;

  if (verified) {
    return (
      <div className="glass rounded-xl p-3 border border-emerald-500/30 text-sm text-emerald-300 flex items-center gap-2">
        <Icon name="check" size={14} /> Telefon raqam muvaffaqiyatli tasdiqlandi
      </div>
    );
  }

  if (!phoneValid) {
    return (
      <div className="glass rounded-xl p-3 border border-white/5 text-xs text-white/40 flex items-center gap-2">
        <Icon name="info" size={12} /> Telefon raqamni to'g'ri kiriting va Telegram orqali tasdiqlang.
      </div>
    );
  }

  const authApi = globalThis.OlympyApi;
  const userMessage = (err) =>
    (authApi && authApi.toUserMessage && authApi.toUserMessage(err))
    || "Server bilan bog‘lanishda xatolik yuz berdi";

  const startFlow = async () => {
    if (!phoneValid || loading) return;

    if (USE_MOCK_OTP) {
      const otp = generateLocalOtp();
      setMockOtp(otp);
      setStatus('opened');
      setExpiresAt(Date.now() + OTP_TTL_MS);
      setError(''); setAttempts(0); setCode('');
      const link = `https://t.me/${TELEGRAM_BOT_USERNAME_DEMO}?start=verify_${mockToken}`;
      setDeepLink(link);
      try { window.open(link, '_blank', 'noopener'); } catch (_) {}
      return;
    }

    if (!authApi || !authApi.startTelegramVerification) {
      setError("Server bilan bog‘lanishda xatolik yuz berdi");
      return;
    }
    setLoading(true);
    setError('');
    setCode('');
    setAttempts(0);
    try {
      const data = await authApi.startTelegramVerification({ phone });
      setVerificationId(data.verification_id || null);
      setVerifyToken(data.verify_token || null);
      setBotUsername(data.bot_username || '');
      const link = data.telegram_deep_link || '';
      if (!link) {
        setStatus('idle');
        setExpiresAt(null);
        setError('Telegram bot sozlanmagan');
        return;
      }
      setDeepLink(link);
      setStatus('opened');
      setExpiresAt(Date.now() + OTP_TTL_MS);
      try { window.open(link, '_blank', 'noopener'); } catch (_) {}
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async () => {
    if (verifying) return;
    if (isExpired) { setError("Kod muddati tugagan. Qayta yuboring."); return; }
    if (attempts >= MAX_ATTEMPTS) { setError("Juda ko‘p urinish. Qayta boshlang."); return; }
    if (!code.trim()) { setError("Kodni kiriting"); return; }

    if (USE_MOCK_OTP) {
      if (code.trim() !== mockOtp) {
        setAttempts(a => a + 1);
        setError("Kod noto‘g‘ri kiritildi");
        return;
      }
      setError('');
      onVerified && onVerified();
      return;
    }

    if (!authApi || !authApi.verifyOtp) {
      setError("Server bilan bog‘lanishda xatolik yuz berdi");
      return;
    }
    setVerifying(true);
    setError('');
    try {
      // Backend currently keys off ``phone`` + ``otp``; ``verification_id``
      // is forwarded so future schema versions that prefer it keep working.
      const data = await authApi.verifyOtp({
        verification_id: verificationId,
        phone,
        otp: code.trim(),
      });
      if (data && data.verified === false) {
        setAttempts(a => a + 1);
        setError("Kod noto‘g‘ri kiritildi");
        return;
      }
      if (data && data.token && data.user && authApi.mapBackendUser) {
        const mappedUser = authApi.mapBackendUser(data.user);
        if (authApi.saveAuth) authApi.saveAuth({ token: data.token, user: mappedUser });
      }
      onVerified && onVerified(data);
    } catch (err) {
      setAttempts(a => a + 1);
      setError(userMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  const restart = () => {
    setStatus('idle'); setCode(''); setDeepLink('');
    setError(''); setExpiresAt(null); setAttempts(0);
    setVerificationId(null); setVerifyToken(null); setBotUsername('');
    setMockOtp('');
  };

  return (
    <div className="glass rounded-xl p-3 border border-indigo-500/20 space-y-2.5">
      {status === 'idle' && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="text-base leading-none">📱</span>
            <span>Telegram orqali tasdiqlash kerak</span>
          </div>
          <button type="button" onClick={startFlow}
            disabled={loading}
            className="btn-primary text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold disabled:opacity-50">
            <Icon name="send" size={12} /> {loading ? 'Yuborilmoqda...' : "Botga o'tish"}
          </button>
        </div>
      )}

      {status === 'opened' && (
        <>
          <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
            <span className="text-indigo-300">Bot kontaktni so'raydi → kod yuboradi</span>
            <div className="flex items-center gap-2">
              {expiresAt && !isExpired && (
                <span className="text-white/40 font-mono text-[11px]"><Icon name="clock" size={10} className="inline" /> {remainingLabel}</span>
              )}
              <button type="button" onClick={restart} className="text-white/40 hover:text-white text-xs">Qayta</button>
            </div>
          </div>
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noreferrer"
              className="btn-ghost text-xs px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 font-semibold">
              <Icon name="send" size={12} /> Telegram botni ochish
            </a>
          )}
          <div className="flex gap-2">
            <input value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (error) setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCode(); } }}
              className="input-field py-2 text-center font-mono tracking-[0.4em]"
              placeholder="••••••" maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
            <button type="button" onClick={submitCode} disabled={!code.trim() || verifying || isExpired}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 whitespace-nowrap">
              {verifying ? '...' : 'Tasdiqlash'}
            </button>
          </div>
          {error && (
            <div className="text-xs text-rose-400 flex items-center gap-1">
              <Icon name="info" size={12} /> {error}
            </div>
          )}
          {USE_MOCK_OTP && mockOtp && (
            <div className="text-[11px] text-white/30">
              Demo kod: <span className="font-mono text-indigo-300">{mockOtp}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

Object.assign(window, { TelegramVerifyBlock });
