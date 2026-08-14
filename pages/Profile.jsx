// pages/Profile.jsx

const ProfilePage = ({ user, onNavigate, embedded, onUserUpdate, onLogout }) => {
  const store = useStore();
  const isApi = !!user?._api;
  // Premium o'quvchi vizual belgisi: "Premium" badge + ism oltin gradient +
  // hero kartasi oltin ramka (.premium-hero) + avatar atrofida oltin halqa.
  const isPremium = !!(user?.isPremium ?? user?.is_premium);
  const [tab, setTab] = React.useState('results');
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState('');
  const avatarInputRef = React.useRef(null);

  const [cropImageSrc, setCropImageSrc] = React.useState('');
  const [cropModalOpen, setCropModalOpen] = React.useState(false);
  // Tasdiqlash modallari — Telegram WebApp'da window.confirm() bloklanadi.
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = React.useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = React.useState(false);

  // Profil ma'lumotlarini tahrirlash holati
  const [profileForm, setProfileForm] = React.useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    username: user?.username || '',
  });
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState({ type: '', text: '' });
  // user prop yangilanganda formni sinxronlash — boshqa joyda update bo'lsa.
  React.useEffect(() => {
    setProfileForm({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      username: user?.username || '',
    });
  }, [user?.firstName, user?.lastName, user?.username]);

  const handleProfileSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isApi) return;
    setProfileSaving(true);
    setProfileMsg({ type: '', text: '' });
    try {
      const payload = {
        first_name: profileForm.firstName.trim(),
        last_name: profileForm.lastName.trim(),
        username: profileForm.username.trim(),
      };
      const data = await OlympyApi.updateProfile(payload, OlympyApi.getToken());
      const mapped = OlympyApi.mapBackendUser(data);
      onUserUpdate?.(mapped);
      setProfileMsg({ type: 'ok', text: 'Saqlandi' });
    } catch (err) {
      setProfileMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Saqlab bo'lmadi" });
    } finally {
      setProfileSaving(false);
      setTimeout(() => setProfileMsg({ type: '', text: '' }), 3000);
    }
  };

  // Parol o'zgartirish holati
  const [pwForm, setPwForm] = React.useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState({ type: '', text: '' });

  const handlePasswordSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isApi) return;
    setPwMsg({ type: '', text: '' });
    if (!pwForm.oldPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      setPwMsg({ type: 'err', text: "Barcha maydonlarni to'ldiring" });
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ type: 'err', text: 'Yangi parol va tasdiqlash mos kelmadi' });
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwMsg({ type: 'err', text: "Parol kamida 8 belgi bo'lishi kerak" });
      return;
    }
    setPwSaving(true);
    try {
      const data = await OlympyApi.changePassword(
        { old_password: pwForm.oldPassword, new_password: pwForm.newPassword },
        OlympyApi.getToken(),
      );
      // Yangi tokenlarni saqlash — boshqa qurilmalardagi sessiyalar bekor
      // bo'ldi, lekin shu so'rovdagi token cookie + saqlangan token yangilanadi.
      if (data?.token || data?.refresh) {
        OlympyApi.saveAuth({
          token: data.token,
          refresh: data.refresh,
          user: data.user,
          cookieAuth: !!data.cookie_auth,
        });
      }
      if (data?.user) {
        const mapped = OlympyApi.mapBackendUser(data.user);
        onUserUpdate?.(mapped);
      }
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPwMsg({ type: 'ok', text: "Parol o'zgartirildi" });
    } catch (err) {
      setPwMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Parolni o'zgartirib bo'lmadi" });
    } finally {
      setPwSaving(false);
      setTimeout(() => setPwMsg({ type: '', text: '' }), 4000);
    }
  };

  // ── 2FA (TOTP) holati ──────────────────────────────────────────────────
  // Backend: /api/auth/2fa/{setup,verify,disable}/. user.totp_enabled (yoki
  // mapBackendUser tomonidan kelgan camelCase) joriy holatni bildiradi.
  const twoFAEnabled = !!(user?.totpEnabled ?? user?.totp_enabled);
  const [twoFASecret, setTwoFASecret] = React.useState('');
  const [twoFAUri, setTwoFAUri] = React.useState('');
  const [twoFACode, setTwoFACode] = React.useState('');
  const [twoFABusy, setTwoFABusy] = React.useState(false);
  const [twoFAMsg, setTwoFAMsg] = React.useState({ type: '', text: '' });
  // O'chirish — backend joriy TOTP kodi yoki parolni talab qiladi (token
  // o'g'irlansa 2FA o'chirib bo'lmasin). Foydalanuvchi tasdiqlash maydonini
  // ochib, kod/parol kiritadi.
  const [twoFADisableMode, setTwoFADisableMode] = React.useState(false);
  const [twoFADisableValue, setTwoFADisableValue] = React.useState('');

  const handleTwoFASetup = async () => {
    if (!isApi || twoFABusy) return;
    setTwoFABusy(true);
    setTwoFAMsg({ type: '', text: '' });
    try {
      const data = await OlympyApi.twoFactorSetup(OlympyApi.getToken());
      setTwoFASecret(data?.secret || '');
      setTwoFAUri(data?.uri || '');
    } catch (err) {
      setTwoFAMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "2FA sozlab bo'lmadi" });
    } finally {
      setTwoFABusy(false);
    }
  };

  const handleTwoFAVerify = async (e) => {
    e?.preventDefault?.();
    if (!isApi || twoFABusy) return;
    const code = twoFACode.trim();
    if (code.length < 6) {
      setTwoFAMsg({ type: 'err', text: 'Kodni to\'liq kiriting (6 raqam)' });
      return;
    }
    setTwoFABusy(true);
    setTwoFAMsg({ type: '', text: '' });
    try {
      await OlympyApi.twoFactorVerify(code, OlympyApi.getToken());
      // Holatni yangilaymiz — getMe orqali totpEnabled true bo'ladi.
      const me = await OlympyApi.getMe(OlympyApi.getToken());
      onUserUpdate?.(OlympyApi.mapBackendUser(me));
      setTwoFASecret('');
      setTwoFAUri('');
      setTwoFACode('');
      setTwoFAMsg({ type: 'ok', text: '2FA yoqildi' });
    } catch (err) {
      setTwoFAMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Noto'g'ri kod" });
    } finally {
      setTwoFABusy(false);
      setTimeout(() => setTwoFAMsg({ type: '', text: '' }), 4000);
    }
  };

  const handleTwoFADisable = async (e) => {
    e?.preventDefault?.();
    if (!isApi || twoFABusy) return;
    const value = twoFADisableValue.trim();
    if (!value) {
      setTwoFAMsg({ type: 'err', text: 'Joriy 6 raqamli kod yoki parolingizni kiriting' });
      return;
    }
    // Faqat raqamlardan iborat va 6 ta bo'lsa — TOTP kodi; aks holda parol.
    const isCode = /^\d{6}$/.test(value);
    const credentials = isCode ? { totp_code: value } : { password: value };
    setTwoFABusy(true);
    setTwoFAMsg({ type: '', text: '' });
    try {
      await OlympyApi.twoFactorDisable(credentials, OlympyApi.getToken());
      const me = await OlympyApi.getMe(OlympyApi.getToken());
      onUserUpdate?.(OlympyApi.mapBackendUser(me));
      setTwoFASecret('');
      setTwoFAUri('');
      setTwoFACode('');
      setTwoFADisableMode(false);
      setTwoFADisableValue('');
      setTwoFAMsg({ type: 'ok', text: "2FA o'chirildi" });
    } catch (err) {
      setTwoFAMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi" });
    } finally {
      setTwoFABusy(false);
      setTimeout(() => setTwoFAMsg({ type: '', text: '' }), 4000);
    }
  };

  // ── Email bog'lash (hisobni tiklash kanali) ─────────────────────────────
  // Backend: /api/auth/email/link/{start,confirm}/. Manzil hisobga faqat
  // to'g'ri kod kiritilgandan keyin yoziladi — shu sababli ikki bosqichli
  // forma: `emailOtpSentTo` bo'sh bo'lmasa kod kutilmoqda.
  const linkedEmail = user?.email || '';
  const emailVerified = !!user?.emailVerified;
  const [emailInput, setEmailInput] = React.useState('');
  const [emailOtp, setEmailOtp] = React.useState('');
  const [emailOtpSentTo, setEmailOtpSentTo] = React.useState('');
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [emailMsg, setEmailMsg] = React.useState({ type: '', text: '' });

  const handleEmailStart = async (e) => {
    e?.preventDefault?.();
    if (!isApi || emailBusy) return;
    const email = emailInput.trim();
    if (!email) {
      setEmailMsg({ type: 'err', text: 'Email manzilini kiriting' });
      return;
    }
    setEmailBusy(true);
    setEmailMsg({ type: '', text: '' });
    try {
      const data = await OlympyApi.startEmailLink({ email }, OlympyApi.getToken());
      setEmailOtpSentTo(data?.email || email);
      setEmailOtp('');
      setEmailMsg({ type: 'ok', text: 'Tasdiqlash kodi emailingizga yuborildi' });
    } catch (err) {
      setEmailMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Kod yuborib bo'lmadi" });
    } finally {
      setEmailBusy(false);
    }
  };

  const handleEmailConfirm = async (e) => {
    e?.preventDefault?.();
    if (!isApi || emailBusy) return;
    if (emailOtp.length < 6) {
      setEmailMsg({ type: 'err', text: "Kodni to'liq kiriting (6 raqam)" });
      return;
    }
    setEmailBusy(true);
    setEmailMsg({ type: '', text: '' });
    try {
      // Confirm yangilangan user obyektini qaytaradi — qayta getMe kerak emas.
      const data = await OlympyApi.confirmEmailLink({ otp: emailOtp }, OlympyApi.getToken());
      onUserUpdate?.(OlympyApi.mapBackendUser(data));
      setEmailOtpSentTo('');
      setEmailOtp('');
      setEmailInput('');
      setEmailMsg({ type: 'ok', text: 'Email tasdiqlandi' });
    } catch (err) {
      setEmailMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Noto'g'ri kod" });
    } finally {
      setEmailBusy(false);
      setTimeout(() => setEmailMsg({ type: '', text: '' }), 4000);
    }
  };

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !isApi) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob) => {
    setCropModalOpen(false);
    setCropImageSrc('');
    setAvatarLoading(true);
    setAvatarError('');
    try {
      const file = new File([croppedBlob], 'avatar.jpeg', { type: 'image/jpeg' });
      const data = await OlympyApi.uploadMyAvatar(file, OlympyApi.getToken());
      const mapped = OlympyApi.mapBackendUser(data);
      onUserUpdate?.(mapped);
    } catch (err) {
      setAvatarError(OlympyApi.toUserMessage?.(err) || "Rasm yuklanmadi");
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!isApi) return;
    setConfirmDeleteAvatar(false);
    setAvatarLoading(true);
    setAvatarError('');
    try {
      const data = await OlympyApi.deleteMyAvatar(OlympyApi.getToken());
      const mapped = OlympyApi.mapBackendUser(data);
      onUserUpdate?.(mapped);
    } catch (err) {
      setAvatarError(OlympyApi.toUserMessage?.(err) || "Rasm o'chirilmadi");
    } finally {
      setAvatarLoading(false);
    }
  };

  // API rejimida foydalanuvchi attemptlari mock store'da emas, backend orqali
  // /api/results/me/ va /api/results/me/stats/ dan keladi. Avval bu sahifa
  // store.attempts dan filter qilardi va api: prefiksli userId hech qachon
  // mos kelmasdi — natijada API foydalanuvchi har doim bo'sh natijalar
  // ko'rardi.
  const apiResultsRes = useApiData(
    () => isApi ? OlympyApi.getMyResults(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiStatsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Oylik dinamika: backend /api/results/me/monthly/ — so'nggi 6 oy.
  const apiMonthlyRes = useApiData(
    () => isApi ? OlympyApi.getMyMonthlyStats(6, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  // Premium obuna muddati — hero'dagi "Premium" badge yonida amal qilish
  // muddatini ko'rsatish uchun. StudentDashboard bilan bir xil endpoint
  // (/api/billing/subscription/current/): end_date + days_remaining qaytaradi
  // (bepul sinov ham, pullik obuna ham shu yerga tushadi). Faqat premium
  // foydalanuvchida yuklaymiz.
  const apiSubRes = useApiData(
    () => (isApi && isPremium) ? OlympyApi.getCurrentSubscription(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi, isPremium],
  );
  const currentSub = isApi && isPremium && apiSubRes.data ? apiSubRes.data : null;
  // API rejimida olimpiadalar ro'yxati — "Olimpiadalar" tab'i va natija
  // kartalaridagi sarlavha uchun. Avval bu store.olympiads dan olinardi va
  // API foydalanuvchisida hech narsa ko'rinmasdi.
  const apiOlympiadsRes = useApiData(
    () => isApi ? OlympyApi.getOlympiads(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiOlympiads = isApi && Array.isArray(apiOlympiadsRes.data)
    ? apiOlympiadsRes.data.map(mapApiOlympiad)
    : null;
  const apiAttempts = isApi && Array.isArray(apiResultsRes.data)
    ? apiResultsRes.data.map(mapApiAttempt)
    : null;

  const baseOlympiads = isApi ? (apiOlympiads || []) : store.olympiads;
  const myAttempts = user
    ? (isApi ? (apiAttempts || []) : store.attempts.filter(a => a.userId === user.id))
        .slice()
        .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
    : [];
  const myResults = myAttempts.map(a => {
    const o = baseOlympiads.find(x => String(x.id) === String(a.olympiadId));
    return {
      id: a.id, attempt: a,
      olympiad: o?.title || 'Olimpiada', subject: o?.subject || '—',
      score: a.score, rank: a.rank,
      date: (a.submittedAt || '').slice(0,10),
      correct: a.correctCount, wrong: a.wrongCount,
    };
  });

  const apiStats = isApi && apiStatsRes.data ? apiStatsRes.data : null;
  const avgScore = apiStats?.average_score != null
    ? apiStats.average_score
    : (myResults.length > 0 ? Math.round(myResults.reduce((s, r) => s + (r.score || 0), 0) / myResults.length * 10) / 10 : 0);
  const bestRank = apiStats?.best_rank != null
    ? apiStats.best_rank
    : (() => { const ranks = myResults.map(r => r.rank || 999).filter(r => r < 999); return ranks.length ? Math.min(...ranks) : null; })();
  const totalAttempts = apiStats?.total_attempts != null ? apiStats.total_attempts : myResults.length;

  // Yutuq belgilari — emoji EMAS (🥇🥈🥉 ni ham qo'shib): har platformada
  // boshqacha chiziladi, o'lchamini boshqarib bo'lmaydi va ekran o'quvchi uni
  // ovoz chiqarib o'qiydi. O'rin farqi `medal-*` tokenida — `place` maydoni
  // pastda `medalBorderStyle` orqali chegara rangiga aylanadi (Leaderboard
  // bilan bir xil naqsh), raqamning o'zi esa doim `text-primary` da qoladi.
  const achievements = [
    bestRank === 1 && { icon:'award', place:1, title:"1-o'rin", desc:"Eng yuqori natija" },
    bestRank === 3 && { icon:'award', place:3, title:"3-o'rin", desc:'Top 3 natija' },
    totalAttempts >= 3 && { icon:'bolt', title:`${totalAttempts} ta olimpiada`, desc:'Faol ishtirokchi' },
    avgScore >= 90 && { icon:'chart', title:'90%+ natija', desc:"O'rtacha ball yuqori" },
  ].filter(Boolean);
  // `medalBorderStyle` — Leaderboard.jsx dagi umumiy yordamchi (fayllar bitta
  // modulga birlashtiriladi, `fmtReceiptDate` shu yerda xuddi shunday
  // ishlatiladi). `--color-medal-*` Tailwind rang xaritasida yo'q, shuning
  // uchun token faqat inline `borderColor` orqali beriladi.

  // Avval bu blok 3 ta hardcoded fan bilan ko'rinardi (Tarix 91 va h.k.).
  // Endi /api/results/me/stats/ subjects ro'yxatidan yoki lokal myResults
  // o'rtacha qiymatlaridan haqiqiy fan kesimini olamiz.
  //
  // Har fanga alohida rang (avvalgi `SUBJECT_PALETTE` — 6 ta qattiq HEX)
  // olib tashlandi: har chiziq tepasida fan nomi YOZILGAN, ya'ni rang hech
  // qanday ma'lumot qo'shmasdi, ustiga o'sha oltita HEX ikkala mavzuda ham
  // bir xil qolar edi. Endi barcha chiziqlar `.progress-fill` ning o'z
  // `accent` tokenida (matn ko'tarmaydigan belgi → `accent`).
  const subjectStats = (() => {
    if (Array.isArray(apiStats?.subjects) && apiStats.subjects.length > 0) {
      return apiStats.subjects.slice(0, 6).map((row) => ({
        s: row.subject || '—',
        pct: Math.round(row.average_score || 0),
      }));
    }
    const buckets = {};
    myResults.forEach(r => {
      const key = r.subject || '—';
      const b = buckets[key] || { s: key, total: 0, count: 0 };
      b.total += r.score || 0;
      b.count += 1;
      buckets[key] = b;
    });
    return Object.values(buckets)
      .map((b) => ({
        s: b.s,
        pct: b.count ? Math.round(b.total / b.count) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  })();

  // Sertifikatlar: 1-o'rinlar haqiqiy attempt'lardan olinadi. Hardcoded
  // "1-o'rin Sertifikati / Faol Ishtirokchi" o'rniga real ma'lumotlar.
  // attemptId — backend GET /api/certificates/{id}/download/ uchun.
  const certificates = myResults
    .filter(r => r.rank === 1)
    .slice(0, 6)
    .map(r => ({
      title: `${r.subject} 1-o'rin sertifikati`,
      olympiad: r.olympiad,
      date: r.date,
      attemptId: r.attempt?.backendId ?? r.attempt?.id ?? r.id,
    }));

  const [certDownloading, setCertDownloading] = React.useState(null);
  const [certError, setCertError] = React.useState('');
  const handleDownloadCert = async (cert) => {
    if (!isApi) {
      setCertError("Yuklab olish faqat akkaunt rejimida");
      setTimeout(() => setCertError(''), 2500);
      return;
    }
    if (!cert?.attemptId) {
      setCertError("Sertifikat ID topilmadi");
      setTimeout(() => setCertError(''), 2500);
      return;
    }
    setCertDownloading(cert.attemptId);
    setCertError('');
    try {
      await OlympyApi.downloadCertificate(cert.attemptId, OlympyApi.getToken());
    } catch (err) {
      setCertError(OlympyApi.toUserMessage?.(err) || "Yuklab bo'lmadi");
      setTimeout(() => setCertError(''), 3000);
    } finally {
      setCertDownloading(null);
    }
  };

  // ── Hisobni o'chirish (Xavfli zona) ───────────────────────────────────
  // DELETE /api/auth/me/ — parol (+2FA) tasdiqlash majburiy.
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');
  const [deletePassword, setDeletePassword] = React.useState('');
  const [deleteTotp, setDeleteTotp] = React.useState('');

  const handleDeleteAccount = async () => {
    if (!isApi || deletingAccount) return;
    if (!deletePassword.trim()) {
      setDeleteError("Hisobni o'chirish uchun parolni kiriting");
      return;
    }
    setDeletingAccount(true);
    setDeleteError('');
    try {
      const credentials = { password: deletePassword };
      if (deleteTotp.trim()) credentials.totp_code = deleteTotp.trim();
      await OlympyApi.deleteMyAccount(credentials, OlympyApi.getToken());
      setConfirmDeleteAccount(false);
      setDeletePassword('');
      setDeleteTotp('');
      if (onLogout) {
        onLogout();
      } else {
        try { await OlympyApi.clearAuth?.(); } catch {}
        onNavigate?.('landing');
      }
    } catch (err) {
      setDeleteError(OlympyApi.toUserMessage?.(err) || "Hisobni o'chirib bo'lmadi");
      setDeletingAccount(false);
    }
  };

  const content = (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in">
      {/* Profile hero — premium o'quvchida oltin tusli ramka va fon (.premium-hero). */}
      <div className={`glass-strong rounded-3xl p-4 md:p-6 relative overflow-hidden ${isPremium ? 'premium-hero' : ''}`}>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="relative">
            <Avatar name={user?.name || 'Ali Valiyev'} src={user?.avatarUrl || ''} size={80} gradient="bg-pencil-600" premium={isPremium} />
            {/* Tasdiq belgisi faqat haqiqatan ham telegram ulangan akkauntlarda
                ko'rsatiladi. Avval bu belgi har bir foydalanuvchida fake
                100% "tasdiqlangan profil" ko'rinishini yaratardi.
                Rang `.badge-approved` mantig'i bo'yicha: neytral yuza + `success`
                chegara va belgi (avval `gradient-bg` ustida oq ✓ turardi —
                qog'oz mavzuda u ko'rinmay qolardi). */}
            {user?.telegramLinked && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border border-success bg-surface-1 text-success flex items-center justify-center" title="Telegram tasdiqlangan">
                <Icon name="check" size={12} />
              </div>
            )}
            {isApi && (
              <>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="btn-primary absolute -bottom-2 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full disabled:opacity-60"
                  title="Profil rasmini yuklash"
                  aria-label="Profil rasmini yuklash"
                >
                  <Icon name="upload" size={14} />
                </button>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className={`font-display text-2xl font-bold break-words ${isPremium ? 'premium-name' : 'text-text-primary'}`}>{user?.name || 'Ali Valiyev'}</h2>
              {/* Premium badge — `.premium-badge` (qattiq oltin, src/index.css).
                  Ichidagi ⭐ emoji olib tashlandi: Leaderboard'dagi bir xil
                  badge ham faqat matndan iborat. */}
              {isPremium && (
                <span className="premium-badge" title="Premium o'quvchi">Premium</span>
              )}
              {/* A'zo chip — faqat haqiqatan ham biror rol approved bo'lsa.
                  Avval har bir foydalanuvchida ko'rinardi va anglashilmasdi. */}
              {(() => {
                const roleEntries = Object.values(user?.roles || {});
                const isMember = roleEntries.some(r => r?.status === 'approved');
                return isMember
                  ? <span className="chip badge-active text-xs">A'zo</span>
                  : <span className="chip badge-draft text-xs">Yangi foydalanuvchi</span>;
              })()}
            </div>
            <div className="text-text-secondary font-data text-sm mt-0.5">{(() => {
              // Telefonni qisman yashirish — O'zbekiston va xalqaro raqamlar
              // uchun ham: boshini (davlat kodi + 2 raqam) va oxirgi 4 raqamni
              // ko'rsatib, oradagini *** bilan almashtiramiz.
              const phone = String(user?.phone || '+998901234567');
              const m = phone.match(/^(\+\d{3,5})(\d+)(\d{4})$/);
              return m ? `${m[1]} *** ${m[3]}` : phone;
            })()}</div>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="flex items-center gap-1.5 text-sm text-text-secondary"><Icon name="building" size={14} />{(() => {
                // Avval store.centers dan qidirilardi va API rejimida bo'sh
                // edi → "Tashkilotsiz" deb ko'rinardi. Endi mapBackendUser
                // tayyorlagan centerName'ni ishlatamiz, store ga tushib
                // qoldikgina fallback.
                const role = user?.roles?.student || user?.roles?.teacher || user?.roles?.manager || user?.roles?.owner;
                if (role?.centerName) return role.centerName;
                const cid = role?.centerId;
                if (!cid) return 'Tashkilotsiz';
                const fromStore = store.centers.find(c => String(c.id) === String(cid));
                return fromStore?.name || 'Tashkilotsiz';
              })()}</div>
              <div className="flex items-center gap-1.5 text-sm text-text-secondary"><Icon name="clock" size={14} /><span className="font-data">{user?.joined ? `${user.joined} dan` : '—'}</span></div>
              {/* Premium muddati — StudentDashboard'dagi "Mening abonementim"
                  bloki bilan bir xil format: "<sana> gacha (N kun qoldi)".
                  Oltin rang `warning` tokenida (`.premium-name` bilan bir xil
                  tanlov): qattiq amber-200 qog'oz mavzuda 1.4:1 edi. */}
              {isPremium && currentSub && (
                <div className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Icon name="clock" size={14} />
                  <span>Premium: <span className="font-data font-bold text-warning">{fmtReceiptDate(currentSub.end_date)}</span> gacha</span>
                  {typeof currentSub.days_remaining === 'number' && (
                    <span className="font-data font-bold text-success">({currentSub.days_remaining} kun qoldi)</span>
                  )}
                </div>
              )}
            </div>
            {/* Raqamli ustunlar — `font-data` (tabular-nums): qiymat almashganda
                to'rtta chip kengligi sakramasin. */}
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="font-data text-lg font-bold text-text-primary">{myResults.length}</div><div className="text-xs text-text-secondary">Olimpiada</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="font-data text-lg font-bold text-accent">{bestRank ? `#${bestRank}` : '—'}</div><div className="text-xs text-text-secondary">Eng yaxshi</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="font-data text-lg font-bold text-text-primary">{avgScore || '—'}{avgScore ? '%' : ''}</div><div className="text-xs text-text-secondary">O'rtacha</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="font-data text-lg font-bold text-text-primary">{achievements.length}</div><div className="text-xs text-text-secondary">Yutuqlar</div></div>
            </div>
            {avatarError && <div className="mt-2 text-xs font-semibold text-error" role="alert">{avatarError}</div>}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={!isApi || avatarLoading}
              className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              <Icon name="upload" size={13} /> {avatarLoading ? 'Yuklanmoqda...' : 'Rasm yuklash'}
            </button>
            {isApi && user?.avatarUrl && (
              <button
                onClick={() => setConfirmDeleteAvatar(true)}
                disabled={avatarLoading}
                className="btn-danger text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                <Icon name="trash" size={13} /> Rasmni o'chirish
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div>
        <h3 className="font-display font-bold text-text-primary mb-3">Yutuqlar</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {achievements.map((a,i) => (
            /* `glass` hoshiyasini `box-shadow: inset` bilan chizadi, shuning
               uchun karta ustiga `border` QO'YILMAYDI — ikkita halqa chiqardi.
               O'rin belgisi chap chetdagi 4px chiziqda: medal tokeni faqat
               shu bitta tomonda, qolgan hoshiya token hoshiyasicha qoladi. */
            <div key={i}
              className={`glass rounded-2xl p-4 text-center card-hover ${a.place ? 'border-l-4' : ''}`}
              style={medalBorderStyle(a.place)}>
              <div className="flex justify-center mb-2 text-accent"><Icon name={a.icon} size={26} /></div>
              <div className="text-sm font-bold text-text-primary">{a.title}</div>
              <div className="text-xs text-text-secondary">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Best subjects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-text-primary mb-4">Fanlar bo'yicha</h3>
          <div className="space-y-3">
            {/* Xato bo'lsa "bo'sh" o'rniga aniq xabar + qayta urinish. */}
            {subjectStats.length === 0 && isApi && apiStatsRes.error && (
              <div className="text-sm text-error" role="alert">
                {OlympyApi.toUserMessage?.(apiStatsRes.error) || "Fan kesimini yuklab bo'lmadi."}{' '}
                <button onClick={() => apiStatsRes.reload()} className="underline underline-offset-2">Qayta urinish</button>
              </div>
            )}
            {subjectStats.length === 0 && !(isApi && apiStatsRes.error) && (
              <div className="text-sm text-text-secondary">Hali fan kesimida natijalar yo'q.</div>
            )}
            {subjectStats.map((x, i) => (
              <div key={`${x.s}-${i}`}>
                <div className="flex justify-between mb-1"><span className="text-sm text-text-secondary">{x.s}</span><span className="font-data text-sm font-bold text-text-primary">{x.pct}%</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{width:`${x.pct}%`}}/></div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-text-primary mb-4">Natijalar dinamikasi</h3>
          {(() => {
            const months = isApi && Array.isArray(apiMonthlyRes.data?.months)
              ? apiMonthlyRes.data.months
              : [];
            const data = months.map(m => ({
              label: m.label,
              value: Math.max(1, Math.round(m.average_score || 0)),
            }));
            const hasAny = months.some(m => (m.attempts || 0) > 0);
            if (isApi && apiMonthlyRes.loading && !apiMonthlyRes.data) {
              return <div className="text-xs text-text-secondary">Yuklanmoqda...</div>;
            }
            // Xato bo'lsa "to'planmagan" o'rniga aniq xabar + qayta urinish.
            if (isApi && apiMonthlyRes.error && !apiMonthlyRes.data) {
              return (
                <div className="text-xs text-error" role="alert">
                  {OlympyApi.toUserMessage?.(apiMonthlyRes.error) || "Oylik dinamikani yuklab bo'lmadi."}{' '}
                  <button onClick={() => apiMonthlyRes.reload()} className="underline underline-offset-2">Qayta urinish</button>
                </div>
              );
            }
            if (!isApi || !hasAny) {
              return <div className="text-xs text-text-secondary">Hali oylik natijalar to'planmagan.</div>;
            }
            return <BarChart data={data} />;
          })()}
        </div>
      </div>

      {/* Tabs — `aria-pressed` bo'lmasa ekran o'quvchi qaysi biri tanlanganini
          aytmaydi: faol holat faqat rang va pastdagi chiziq bilan berilgan. */}
      <div className="nav-tabs flex">
        {['results','olympiads','certificates','settings'].map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab===t} className={`nav-tab ${tab===t?'active':''}`}>
            {t==='results'?'Natijalar':t==='olympiads'?"Olimpiadalar":t==='certificates'?'Sertifikatlar':'Sozlamalar'}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <div className="space-y-3">
          {/* Xato bo'lsa "natijalar yo'q" o'rniga aniq xabar + qayta yuklash. */}
          {myResults.length === 0 && isApi && apiResultsRes.error && (
            <div className="text-center text-sm py-6 glass rounded-2xl">
              <div className="text-error font-semibold mb-3" role="alert">
                {OlympyApi.toUserMessage?.(apiResultsRes.error) || "Natijalarni yuklab bo'lmadi. Qayta urinib ko'ring."}
              </div>
              <button onClick={() => apiResultsRes.reload()} className="btn-ghost text-xs px-4 py-2 rounded-xl">Qayta yuklash</button>
            </div>
          )}
          {myResults.length === 0 && !(isApi && apiResultsRes.error) && <div className="text-center text-text-secondary text-sm py-6 glass rounded-2xl">Hali natijalar yo'q</div>}
          {myResults.map(r => (
            /* Hover `card-hover` da (fon + hoshiya), `hover:bg-white/5` emas —
               qog'oz mavzuda oq yuvish umuman ko'rinmasdi. */
            <div key={r.id} className="glass card-hover rounded-2xl p-4 flex items-center gap-4 cursor-pointer"
              onClick={() => onNavigate && onNavigate('results', { ...r.attempt, olympiad: baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId)) })}>
              {/* O'rin — Leaderboard naqshi: neytral yuza, medal tokeni faqat
                  chegarada, raqamning o'zi doim `text-primary` da o'qiladi. */}
              <div className="w-12 h-12 rounded-xl border border-edge bg-surface-2 flex items-center justify-center font-data font-bold text-text-primary flex-shrink-0"
                style={medalBorderStyle(r.rank)}>#{r.rank || '—'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-text-primary truncate">{r.olympiad}</div>
                <div className="flex items-center gap-2 mt-0.5"><SubjectBadge subject={r.subject} /><span className="font-data text-xs text-text-secondary">{r.date}</span></div>
              </div>
              <div className="text-right">
                <div className="font-data text-xl font-bold text-text-primary">{r.score}<span className="text-text-secondary text-sm">/100</span></div>
                <div className="font-data text-xs text-success">{r.correct} to'g'ri</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'olympiads' && (
        <div className="space-y-3">
          {(() => {
            // API rejimida olimpiadalar /api/olympiads/ dan, mock rejimda
            // store.olympiads dan keladi. Avval doim store.olympiads ishlatilardi
            // va API foydalanuvchisi bo'sh tab ko'rardi.
            const cid = user?.roles?.student?.centerId;
            const allOlympiads = baseOlympiads;
            const list = cid
              ? allOlympiads.filter(o => String(o.centerId) === String(cid)).slice(0, 5)
              : allOlympiads.slice(0, 3);
            // Xato bo'lsa "Olimpiadalar yo'q" o'rniga aniq xabar + qayta yuklash.
            if (list.length === 0 && isApi && apiOlympiadsRes.error) {
              return (
                <div className="text-center text-sm py-6 glass rounded-2xl">
                  <div className="text-error font-semibold mb-3" role="alert">
                    {OlympyApi.toUserMessage?.(apiOlympiadsRes.error) || "Olimpiadalarni yuklab bo'lmadi. Qayta urinib ko'ring."}
                  </div>
                  <button onClick={() => apiOlympiadsRes.reload()} className="btn-ghost text-xs px-4 py-2 rounded-xl">Qayta yuklash</button>
                </div>
              );
            }
            if (list.length === 0) return <div className="text-center text-text-secondary text-sm py-6 glass rounded-2xl">Olimpiadalar yo'q</div>;
            return list.map(o => (
              <div key={o.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                {/* 🏆 emoji o'rniga `Icon` — bo'lim belgisi emoji bo'lmaydi. */}
                <div className="w-10 h-10 rounded-xl border border-edge bg-surface-2 flex items-center justify-center text-text-secondary flex-shrink-0">
                  <Icon name="trophy" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-text-primary truncate">{o.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SubjectBadge subject={o.subject} />
                    {/* Chip ranglari `.badge-*` to'plamidan: daraja — `accent-2`
                        (qalam ko'ki), tur — neytral. Avvalgi violet/sky juftligi
                        faqat bezak edi va ikkala mavzuda tekshirilmagan. */}
                    {o.testLevel && <span className="chip badge-active">{o.testLevel}</span>}
                    {o.testType && <span className="chip badge-draft">{testTypeLabel(o.testType)}</span>}
                    <span className="font-data text-xs text-text-secondary">{o.startDate || o.date}</span>
                  </div>
                </div>
                <Badge status={statusLabel(o.status)} />
              </div>
            ));
          })()}
        </div>
      )}

      {tab === 'certificates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certificates.length === 0 && (
            <div className="md:col-span-2 text-center text-text-secondary text-sm py-6 glass rounded-2xl">
              Hozircha sertifikatlar yo'q. 1-o'rinni egallasangiz, sertifikatlar shu yerda paydo bo'ladi.
            </div>
          )}
          {certificates.map((c, i) => (
            /* Sertifikat faqat 1-o'rin uchun beriladi, shuning uchun chap
               chiziq `medal-1` (oltin) tokenida — gradient va ikkinchi halqa
               o'rniga bitta ma'noli belgi. */
            <div key={i} className="glass rounded-2xl p-5 border-l-4" style={medalBorderStyle(1)}>
              <div className="mb-3 text-text-secondary"><Icon name="award" size={26} /></div>
              <div className="font-bold text-text-primary mb-1">{c.title}</div>
              <div className="text-sm text-text-secondary mb-1">{c.olympiad}</div>
              <div className="font-data text-xs text-text-secondary mb-4">{c.date}</div>
              <button
                onClick={() => handleDownloadCert(c)}
                disabled={certDownloading === c.attemptId}
                className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
                <Icon name="download" size={13} /> {certDownloading === c.attemptId ? "Yuklanmoqda..." : 'Yuklab olish'}
              </button>
            </div>
          ))}
          {certError && (
            <div className="md:col-span-2 text-xs text-error text-center" role="alert">{certError}</div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Profil ma'lumotlari */}
          <form onSubmit={handleProfileSubmit} className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold text-text-primary mb-1">Profil ma'lumotlari</h3>
            {!isApi && (
              <div className="text-xs text-warning">Tahrirlash faqat akkaunt rejimida mavjud.</div>
            )}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ism</label>
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(e) => setProfileForm(f => ({ ...f, firstName: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={60}
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
                placeholder="Ali"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Familiya</label>
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(e) => setProfileForm(f => ({ ...f, lastName: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={60}
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
                placeholder="Valiyev"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Username</label>
              <input
                type="text"
                value={profileForm.username}
                onChange={(e) => setProfileForm(f => ({ ...f, username: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={32}
                autoComplete="off"
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
                placeholder="ali.valiyev"
              />
              <div className="text-[10px] text-text-secondary mt-1">Faqat harf, raqam, "_" va "." — kamida 3 belgi.</div>
            </div>
            {profileMsg.text && (
              <div className={`text-xs font-semibold ${profileMsg.type === 'ok' ? 'text-success' : 'text-error'}`}>
                {profileMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={!isApi || profileSaving}
              className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {profileSaving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </form>

          {/* Parol o'zgartirish */}
          <form onSubmit={handlePasswordSubmit} className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold text-text-primary mb-1">Parolni o'zgartirish</h3>
            {!isApi && (
              <div className="text-xs text-warning">Parol almashtirish faqat akkaunt rejimida mavjud.</div>
            )}
            <div>
              <label className="block text-xs text-text-secondary mb-1">Eski parol</label>
              <input
                type="password"
                value={pwForm.oldPassword}
                onChange={(e) => setPwForm(f => ({ ...f, oldPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="current-password"
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Yangi parol</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="new-password"
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Yangi parolni tasdiqlash</label>
              <input
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="new-password"
                className="input-field text-sm px-3 py-2 disabled:opacity-50"
              />
            </div>
            {pwMsg.text && (
              <div className={`text-xs font-semibold ${pwMsg.type === 'ok' ? 'text-success' : 'text-error'}`}>
                {pwMsg.text}
              </div>
            )}
            <div className="text-[10px] text-text-secondary">
              Parol o'zgartirilgandan keyin boshqa qurilmalardagi sessiyalar yopiladi.
            </div>
            <button
              type="submit"
              disabled={!isApi || pwSaving}
              className="btn-primary w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {pwSaving ? "O'zgartirilmoqda..." : "Parolni o'zgartirish"}
            </button>
          </form>

          {/* Ikki bosqichli himoya (2FA / TOTP) — to'liq kenglik */}
          <div className="glass rounded-2xl p-5 space-y-3 md:col-span-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Icon name="shield" size={18} className="text-accent" />
                <h3 className="font-display font-bold text-text-primary">Ikki bosqichli himoya (2FA)</h3>
                {twoFAEnabled && (
                  <span className="chip badge-active text-xs">Yoqilgan</span>
                )}
              </div>
              {isApi && twoFAEnabled && !twoFADisableMode && (
                <button
                  onClick={() => { setTwoFADisableMode(true); setTwoFAMsg({ type: '', text: '' }); }}
                  disabled={twoFABusy}
                  className="btn-danger text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Icon name="x" size={13} /> O'chirish
                </button>
              )}
            </div>

            {!isApi && (
              <div className="text-xs text-warning">2FA faqat akkaunt rejimida mavjud.</div>
            )}

            {isApi && !twoFAEnabled && !twoFASecret && (
              <>
                <p className="text-sm text-text-secondary">
                  Hisobingizni autentifikator ilovasi (Google Authenticator, Authy va h.k.)
                  bilan qo'shimcha himoyalang. Kirishda parol bilan birga bir martalik kod talab qilinadi.
                </p>
                <button
                  onClick={handleTwoFASetup}
                  disabled={twoFABusy}
                  className="btn-primary rounded-xl py-2.5 px-5 text-sm font-semibold disabled:opacity-50"
                >
                  {twoFABusy ? 'Tayyorlanmoqda...' : '2FA yoqish'}
                </button>
              </>
            )}

            {isApi && !twoFAEnabled && twoFASecret && (
              <form onSubmit={handleTwoFAVerify} className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Autentifikator ilovangizga quyidagi maxfiy kalitni qo'shing, so'ng ilova
                  bergan 6 raqamli kodni kiriting.
                </p>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Maxfiy kalit</label>
                  <div className="flex items-center gap-2">
                    {/* Maxfiy kalit — `font-mono` ATAYIN qoladi: foydalanuvchi
                        uni belgima-belgi ko'chirib yozadi, shu sababli 0/O va
                        1/l farqlanishi kerak. */}
                    <code className="flex-1 rounded-xl border border-edge bg-surface-2 px-3 py-2 text-sm text-text-primary font-mono break-all select-all">
                      {twoFASecret}
                    </code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(twoFASecret); }}
                      className="btn-ghost text-xs px-3 py-2 rounded-xl flex items-center gap-1.5"
                      title="Nusxalash"
                    >
                      <Icon name="copy" size={13} />
                    </button>
                  </div>
                  {twoFAUri && (
                    <a
                      href={twoFAUri}
                      className="inline-block text-[11px] text-accent mt-2 underline underline-offset-2"
                    >
                      Autentifikator ilovasida ochish
                    </a>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Tasdiqlash kodi</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={twoFABusy}
                    placeholder="123456"
                    className="input-field text-sm px-3 py-2 disabled:opacity-50 tracking-[0.4em] font-data"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={twoFABusy || twoFACode.length < 6}
                    className="btn-primary rounded-xl py-2.5 px-5 text-sm font-semibold disabled:opacity-50"
                  >
                    {twoFABusy ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTwoFASecret(''); setTwoFAUri(''); setTwoFACode(''); }}
                    disabled={twoFABusy}
                    className="btn-ghost text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                </div>
              </form>
            )}

            {isApi && twoFAEnabled && !twoFADisableMode && (
              <p className="text-sm text-text-secondary">
                Hisobingiz ikki bosqichli himoya bilan himoyalangan. Kirishda autentifikator
                kodini kiritishingiz kerak bo'ladi.
              </p>
            )}

            {isApi && twoFAEnabled && twoFADisableMode && (
              <form onSubmit={handleTwoFADisable} className="space-y-3">
                <p className="text-sm text-text-secondary">
                  Xavfsizlik uchun o'chirishdan oldin autentifikator ilovangiz bergan
                  joriy 6 raqamli kodni yoki hisobingiz parolini kiriting.
                </p>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Joriy kod yoki parol</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={twoFADisableValue}
                    onChange={(e) => setTwoFADisableValue(e.target.value)}
                    disabled={twoFABusy}
                    placeholder="123456 yoki parol"
                    className="input-field text-sm px-3 py-2 disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={twoFABusy || !twoFADisableValue.trim()}
                    className="btn-danger rounded-xl py-2.5 px-5 text-sm font-semibold disabled:opacity-50"
                  >
                    {twoFABusy ? 'O\'chirilmoqda...' : "O'chirishni tasdiqlash"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTwoFADisableMode(false); setTwoFADisableValue(''); setTwoFAMsg({ type: '', text: '' }); }}
                    disabled={twoFABusy}
                    className="btn-ghost text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                </div>
              </form>
            )}

            {twoFAMsg.text && (
              <div className={`text-xs font-semibold ${twoFAMsg.type === 'ok' ? 'text-success' : 'text-error'}`}>
                {twoFAMsg.text}
              </div>
            )}
          </div>

          {/* Email — hisobni tiklash uchun zaxira kanal (to'liq kenglik) */}
          <div className="glass rounded-2xl p-5 space-y-3 md:col-span-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon name="send" size={18} className="text-accent" />
              <h3 className="font-display font-bold text-text-primary">Email manzili</h3>
              {emailVerified && (
                <span className="chip badge-active text-xs">Tasdiqlangan</span>
              )}
            </div>

            {!isApi && (
              <div className="text-xs text-warning">Email bog'lash faqat akkaunt rejimida mavjud.</div>
            )}

            {isApi && (
              <>
                <p className="text-sm text-text-secondary">
                  {linkedEmail ? (
                    <>
                      Hisobingizga <b className="text-text-primary">{linkedEmail}</b> bog'langan.
                      Boshqa manzilga almashtirish uchun yangisini kiriting va kod bilan tasdiqlang.
                    </>
                  ) : (
                    "Hisobingizni tiklash uchun zaxira kanal. Platformaga kirish baribir "
                    + "telefon raqami orqali — email faqat kirish imkonini yo'qotganda kerak bo'ladi."
                  )}
                </p>

                {!emailOtpSentTo && (
                  <form onSubmit={handleEmailStart} className="space-y-3">
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Email</label>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        disabled={emailBusy}
                        autoComplete="email"
                        placeholder="ali.valiyev@gmail.com"
                        className="input-field text-sm px-3 py-2 disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={emailBusy || !emailInput.trim()}
                      className="btn-primary rounded-xl py-2.5 px-5 text-sm font-semibold disabled:opacity-50"
                    >
                      {emailBusy ? 'Yuborilmoqda...' : 'Yuborish'}
                    </button>
                  </form>
                )}

                {emailOtpSentTo && (
                  <form onSubmit={handleEmailConfirm} className="space-y-3">
                    <p className="text-sm text-text-secondary">
                      <b className="text-text-primary">{emailOtpSentTo}</b> manziliga 6 raqamli kod
                      yubordik. Kod kelmasa spam papkasini ham tekshirib ko'ring.
                    </p>
                    <div>
                      <label className="block text-xs text-text-secondary mb-1">Tasdiqlash kodi</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        disabled={emailBusy}
                        placeholder="123456"
                        className="input-field text-sm px-3 py-2 disabled:opacity-50 tracking-[0.4em] font-data"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={emailBusy || emailOtp.length < 6}
                        className="btn-primary rounded-xl py-2.5 px-5 text-sm font-semibold disabled:opacity-50"
                      >
                        {emailBusy ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
                      </button>
                      <button
                        type="button"
                        onClick={handleEmailStart}
                        disabled={emailBusy}
                        className="btn-ghost text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
                      >
                        Kodni qayta yuborish
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmailOtpSentTo(''); setEmailOtp(''); setEmailMsg({ type: '', text: '' }); }}
                        disabled={emailBusy}
                        className="btn-ghost text-sm px-5 py-2.5 rounded-xl disabled:opacity-50"
                      >
                        Bekor qilish
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {emailMsg.text && (
              <div className={`text-xs font-semibold ${emailMsg.type === 'ok' ? 'text-success' : 'text-error'}`}>
                {emailMsg.text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retention: o'sish yo'li, oylik o'sish va sinf taqqoslash (LT2/LT3/OB3) */}
      {isApi && (
        <>
          <ReferralWidget user={user} />
          <ProgressComparisonCard user={user} />
          <PeerComparisonCard user={user} />
        </>
      )}

      {/* Xavfli zona — hisobni butunlay o'chirish. Faqat akkaunt rejimida.
          `glass` o'z hoshiyasini `box-shadow: inset` bilan chizadi, shuning
          uchun bu yerda to'liq `border` YO'Q — u ikkinchi halqa bo'lib
          chiqardi. Ogohlantirish belgisi bitta tomonda: chapdagi 4px `error`
          chizig'i (Leaderboard'dagi `border-l-4` naqshi). */}
      {isApi && (
        <div className="glass rounded-2xl p-5 border-l-4 border-l-error">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="trash" size={18} className="text-error" />
            <h3 className="font-display font-bold text-error">Xavfli zona</h3>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            Hisob o&apos;chirilgach 30 kun ichida telefon va parol bilan tiklash mumkin.
            Muddatdan keyin ma&apos;lumotlar butunlay o&apos;chiriladi.
          </p>
          {deleteError && (
            <div className="text-xs font-semibold text-error mb-3" role="alert">{deleteError}</div>
          )}
          <button
            onClick={() => setConfirmDeleteAccount(true)}
            disabled={deletingAccount}
            className="btn-danger rounded-xl py-2.5 px-5 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Icon name="trash" size={14} />
            {deletingAccount ? "O'chirilmoqda..." : "Hisobni o'chirish"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {content}
      <AvatarCropModal
        open={cropModalOpen}
        onClose={() => { setCropModalOpen(false); setCropImageSrc(''); }}
        imageSrc={cropImageSrc}
        onCropComplete={handleCropComplete}
      />
      {/* Tasdiqlash modallari — Telegram WebApp'da window.confirm() o'rniga */}
      <ConfirmModal
        open={confirmDeleteAvatar}
        onClose={() => setConfirmDeleteAvatar(false)}
        onConfirm={handleDeleteAvatar}
        title="Profil rasmini o'chirish"
        message="Profil rasmini o'chirishni xohlaysizmi?"
        confirmText="O'chirish"
        danger
        busy={avatarLoading}
      />
      <Modal
        open={confirmDeleteAccount}
        onClose={() => {
          if (deletingAccount) return;
          setConfirmDeleteAccount(false);
          setDeletePassword('');
          setDeleteTotp('');
          setDeleteError('');
        }}
        title="Hisobni o'chirish"
      >
        <p className="text-sm text-text-secondary mb-4">
          30 kun ichida tiklash mumkin. Davom etish uchun parolingizni tasdiqlang.
          Muddatdan keyin hisob butunlay o&apos;chiriladi.
        </p>
        <label className="block text-xs text-text-secondary mb-1">Parol</label>
        <input
          type="password"
          value={deletePassword}
          onChange={(e) => setDeletePassword(e.target.value)}
          className="input-field w-full mb-3"
          placeholder="Joriy parol"
          autoComplete="current-password"
          disabled={deletingAccount}
        />
        {(user?.totpEnabled || user?.totp_enabled) && (
          <>
            <label className="block text-xs text-text-secondary mb-1">2FA kod</label>
            <input
              type="text"
              inputMode="numeric"
              value={deleteTotp}
              onChange={(e) => setDeleteTotp(e.target.value)}
              className="input-field w-full mb-3"
              placeholder="6 xonali kod"
              disabled={deletingAccount}
            />
          </>
        )}
        {deleteError && (
          <div className="text-xs font-semibold text-error mb-3" role="alert">{deleteError}</div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="btn-ghost px-4 py-2 rounded-xl text-sm disabled:opacity-50"
            onClick={() => {
              setConfirmDeleteAccount(false);
              setDeletePassword('');
              setDeleteTotp('');
              setDeleteError('');
            }}
            disabled={deletingAccount}
          >
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn-danger px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            onClick={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? "O'chirilmoqda..." : "Butunlay o'chirish"}
          </button>
        </div>
      </Modal>
    </>
  );
};

Object.assign(window, { ProfilePage });
