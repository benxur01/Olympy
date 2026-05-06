// pages/TelegramVerify.jsx — Telegram phone-verification step.
//
// Talks to the real Django backend via OlympyApi:
//   POST /api/auth/phone/start-telegram-verification/
//   POST /api/auth/phone/verify-otp/

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const goToTelegramLink = (link) => {
  if (!link) return false;
  try {
    window.location.assign(link);
    return true;
  } catch (_) {}
  try {
    window.location.href = link;
    return true;
  } catch (_) {}
  try {
    const opened = window.open(link, '_blank', 'noopener,noreferrer');
    return !!opened;
  } catch (_) {
    return false;
  }
};

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

  // Backend verification session state.
  const [verificationId, setVerificationId] = React.useState(null);
  const [verifyToken, setVerifyToken] = React.useState(null);
  const [botUsername, setBotUsername] = React.useState('');

  // Reset whenever the phone changes
  const lastPhoneRef = React.useRef(phone);
  React.useEffect(() => {
    if (lastPhoneRef.current !== phone) {
      lastPhoneRef.current = phone;
      setStatus('idle'); setCode(''); setDeepLink('');
      setError(''); setExpiresAt(null); setAttempts(0);
      setVerificationId(null); setVerifyToken(null); setBotUsername('');
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
      const opened = goToTelegramLink(link);
      if (!opened) {
        setError("Brauzer Telegramga o'tishni blokladi. Quyidagi “Telegram botni ochish” tugmasini bosing.");
      }
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
  };

  return (
    <div className="glass rounded-xl p-3 border border-indigo-500/20 space-y-2.5">
      {status === 'idle' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="text-base leading-none">📱</span>
            <span>Telegram orqali tasdiqlash kerak</span>
          </div>
          <button type="button" onClick={startFlow}
            disabled={loading}
            className="btn-primary text-xs sm:text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-1.5 font-semibold disabled:opacity-50 w-full sm:w-auto">
            <Icon name="send" size={14} /> {loading ? 'Yuborilmoqda...' : "Botga o'tish"}
          </button>
        </div>
      )}

      {status === 'opened' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <span className="text-indigo-300">Bot kontaktni so'raydi → kod yuboradi</span>
            <div className="flex items-center gap-3">
              {expiresAt && !isExpired && (
                <span className="text-white/40 font-mono text-[11px] inline-flex items-center gap-1"><Icon name="clock" size={10} /> {remainingLabel}</span>
              )}
              <button type="button" onClick={restart} className="text-white/40 hover:text-white text-xs underline-offset-2 hover:underline py-1">Qayta</button>
            </div>
          </div>
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noreferrer"
              className="btn-ghost text-xs px-3 py-3 rounded-xl flex items-center justify-center gap-1.5 font-semibold">
              <Icon name="send" size={14} /> Telegram botni ochish
            </a>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); if (error) setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCode(); } }}
              className="input-field py-3 text-center font-mono tracking-[0.4em] flex-1"
              placeholder="••••••" maxLength={6} inputMode="numeric" autoComplete="one-time-code" />
            <button type="button" onClick={submitCode} disabled={!code.trim() || verifying || isExpired}
              className="btn-primary px-4 py-3 rounded-xl text-xs font-semibold disabled:opacity-50 whitespace-nowrap w-full sm:w-auto">
              {verifying ? '...' : 'Tasdiqlash'}
            </button>
          </div>
          {error && (
            <div className="text-xs text-rose-400 flex items-center gap-1">
              <Icon name="info" size={12} /> {error}
            </div>
          )}
        </>
      )}
    </div>
  );
};

Object.assign(window, { TelegramVerifyBlock, goToTelegramLink });
