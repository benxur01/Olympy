// pages/Profile.jsx

const ProfilePage = ({ user, onNavigate, embedded, onUserUpdate }) => {
  const store = useStore();
  const isApi = !!user?._api;
  // Premium o'quvchi vizual belgisi (⭐ + avatar atrofida oltin halqa).
  const isPremium = !!(user?.isPremium ?? user?.is_premium);
  const [tab, setTab] = React.useState('results');
  const [avatarLoading, setAvatarLoading] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState('');
  const avatarInputRef = React.useRef(null);

  const [cropImageSrc, setCropImageSrc] = React.useState('');
  const [cropModalOpen, setCropModalOpen] = React.useState(false);

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
    if (!window.confirm("Profil rasmini o'chirishni xohlaysizmi?")) return;
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

  const achievements = [
    bestRank === 1 && { icon:'🥇', title:"1-o'rin", desc:"Eng yuqori natija", color:'from-amber-500/20 to-orange-500/10 border-amber-500/20' },
    bestRank === 3 && { icon:'🥉', title:"3-o'rin", desc:'Top 3 natija', color:'from-amber-700/20 to-orange-800/10 border-amber-700/20' },
    totalAttempts >= 3 && { icon:'⭐', title:`${totalAttempts} ta olimpiada`, desc:'Faol ishtirokchi', color:'from-indigo-500/20 to-purple-500/10 border-indigo-500/20' },
    avgScore >= 90 && { icon:'🎯', title:'90%+ natija', desc:"O'rtacha ball yuqori", color:'from-emerald-500/20 to-teal-500/10 border-emerald-500/20' },
  ].filter(Boolean);

  // Avval bu blok 3 ta hardcoded fan bilan ko'rinardi (Tarix 91 va h.k.).
  // Endi /api/results/me/stats/ subjects ro'yxatidan yoki lokal myResults
  // o'rtacha qiymatlaridan haqiqiy fan kesimini olamiz.
  const SUBJECT_PALETTE = ['#f59e0b', '#6366f1', '#22c55e', '#22d3ee', '#a855f7', '#ef4444'];
  const subjectStats = (() => {
    if (Array.isArray(apiStats?.subjects) && apiStats.subjects.length > 0) {
      return apiStats.subjects.slice(0, 6).map((row, i) => ({
        s: row.subject || '—',
        pct: Math.round(row.average_score || 0),
        color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
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
      .map((b, i) => ({
        s: b.s,
        pct: b.count ? Math.round(b.total / b.count) : 0,
        color: SUBJECT_PALETTE[i % SUBJECT_PALETTE.length],
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

  const content = (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in">
      {/* Profile hero */}
      <div className="glass-strong rounded-3xl p-4 md:p-6 relative overflow-hidden">
        <div className="hero-glow" style={{ background:'#6366f1', top:'-60%', left:'40%', opacity:0.08 }} />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="relative">
            <Avatar name={user?.name || 'Ali Valiyev'} src={user?.avatarUrl || ''} size={80} gradient="from-indigo-500 to-purple-600" premium={isPremium} />
            {/* Tasdiq belgisi faqat haqiqatan ham telegram ulangan akkauntlarda
                ko'rsatiladi. Avval bu belgi har bir foydalanuvchida fake
                100% "tasdiqlangan profil" ko'rinishini yaratardi. */}
            {user?.telegramLinked && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 gradient-bg rounded-full flex items-center justify-center" title="Telegram tasdiqlangan">
                <span className="text-white text-xs">✓</span>
              </div>
            )}
            {isApi && (
              <>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                  className="absolute -bottom-2 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950 text-white shadow-lg hover:bg-indigo-600 disabled:opacity-60"
                  title="Profil rasmini yuklash"
                >
                  <Icon name="upload" size={14} />
                </button>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-white break-words">{isPremium && <span title="Premium o'quvchi">⭐ </span>}{user?.name || 'Ali Valiyev'}</h2>
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
            <div className="text-white/40 text-sm mt-0.5">{(user?.phone || '+998901234567').replace(/(\+998\d{2})\d{3}(\d{4})/, '$1 *** $2')}</div>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="flex items-center gap-1.5 text-sm text-white/50"><Icon name="building" size={14} />{(() => {
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
              <div className="flex items-center gap-1.5 text-sm text-white/50"><Icon name="clock" size={14} />{user?.joined ? `${user.joined} dan` : '—'}</div>
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{myResults.length}</div><div className="text-xs text-white/40">Olimpiada</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black gradient-text">{bestRank ? `#${bestRank}` : '—'}</div><div className="text-xs text-white/40">Eng yaxshi</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{avgScore || '—'}{avgScore ? '%' : ''}</div><div className="text-xs text-white/40">O'rtacha</div></div>
              <div className="glass rounded-xl px-3 py-1.5 text-center"><div className="text-lg font-black text-white">{achievements.length}</div><div className="text-xs text-white/40">Yutuqlar</div></div>
            </div>
            {avatarError && <div className="mt-2 text-xs font-semibold text-rose-300">{avatarError}</div>}
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
                onClick={handleDeleteAvatar}
                disabled={avatarLoading}
                className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 text-rose-300 hover:text-rose-200 disabled:opacity-50"
              >
                <Icon name="trash" size={13} /> Rasmni o'chirish
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div>
        <h3 className="font-bold text-white mb-3">Yutuqlar</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {achievements.map((a,i) => (
            <div key={i} className={`glass rounded-2xl p-4 text-center card-hover border bg-gradient-to-br ${a.color}`}>
              <div className="text-3xl mb-2">{a.icon}</div>
              <div className="text-sm font-bold text-white">{a.title}</div>
              <div className="text-xs text-white/40">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Best subjects */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Fanlar bo'yicha</h3>
          <div className="space-y-3">
            {subjectStats.length === 0 && (
              <div className="text-sm text-white/40">Hali fan kesimida natijalar yo'q.</div>
            )}
            {subjectStats.map((x, i) => (
              <div key={`${x.s}-${i}`}>
                <div className="flex justify-between mb-1"><span className="text-sm text-white/70">{x.s}</span><span className="text-sm font-bold text-white">{x.pct}%</span></div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{width:`${x.pct}%`,background:x.color}}/></div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-bold text-white mb-4">Natijalar dinamikasi</h3>
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
              return <div className="text-xs text-white/40">Yuklanmoqda...</div>;
            }
            if (!isApi || !hasAny) {
              return <div className="text-xs text-white/40">Hali oylik natijalar to'planmagan.</div>;
            }
            return <BarChart data={data} />;
          })()}
        </div>
      </div>

      {/* Tabs */}
      <div className="nav-tabs flex">
        {['results','olympiads','certificates','settings'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`nav-tab ${tab===t?'active':''}`}>
            {t==='results'?'Natijalar':t==='olympiads'?"Olimpiadalar":t==='certificates'?'Sertifikatlar':'Sozlamalar'}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <div className="space-y-3">
          {myResults.length === 0 && <div className="text-center text-white/40 text-sm py-6 glass rounded-2xl">Hali natijalar yo'q</div>}
          {myResults.map(r => (
            <div key={r.id} className="glass rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5"
              onClick={() => onNavigate && onNavigate('results', { ...r.attempt, olympiad: baseOlympiads.find(o => String(o.id) === String(r.attempt.olympiadId)) })}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black flex-shrink-0 ${r.rank===1?'bg-amber-500/20 text-amber-400':'bg-indigo-500/15 text-indigo-400'}`}>#{r.rank || '—'}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate">{r.olympiad}</div>
                <div className="flex items-center gap-2 mt-0.5"><SubjectBadge subject={r.subject} /><span className="text-xs text-white/30">{r.date}</span></div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-white">{r.score}<span className="text-white/30 text-sm">/100</span></div>
                <div className="text-xs text-emerald-400">{r.correct} to'g'ri</div>
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
            if (list.length === 0) return <div className="text-center text-white/40 text-sm py-6 glass rounded-2xl">Olimpiadalar yo'q</div>;
            return list.map(o => (
              <div key={o.id} className="glass rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center text-white flex-shrink-0">🏆</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{o.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SubjectBadge subject={o.subject} />
                    {o.testLevel && <span className="chip bg-violet-500/15 text-violet-300 border border-violet-500/20">{o.testLevel}</span>}
                    {o.testType && <span className="chip bg-sky-500/15 text-sky-300 border border-sky-500/20">{testTypeLabel(o.testType)}</span>}
                    <span className="text-xs text-white/30">{o.startDate || o.date}</span>
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
            <div className="md:col-span-2 text-center text-white/40 text-sm py-6 glass rounded-2xl">
              Hozircha sertifikatlar yo'q. 1-o'rinni egallasangiz, sertifikatlar shu yerda paydo bo'ladi.
            </div>
          )}
          {certificates.map((c, i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
              <div className="text-3xl mb-3">🏅</div>
              <div className="font-bold text-white mb-1">{c.title}</div>
              <div className="text-sm text-white/50 mb-1">{c.olympiad}</div>
              <div className="text-xs text-white/30 mb-4">{c.date}</div>
              <button
                onClick={() => handleDownloadCert(c)}
                disabled={certDownloading === c.attemptId}
                className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
                <Icon name="copy" size={13} /> {certDownloading === c.attemptId ? "Yuklanmoqda..." : 'Yuklab olish'}
              </button>
            </div>
          ))}
          {certError && (
            <div className="md:col-span-2 text-xs text-rose-300 text-center">{certError}</div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Profil ma'lumotlari */}
          <form onSubmit={handleProfileSubmit} className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-white mb-1">Profil ma'lumotlari</h3>
            {!isApi && (
              <div className="text-xs text-amber-300">Tahrirlash faqat akkaunt rejimida mavjud.</div>
            )}
            <div>
              <label className="block text-xs text-white/50 mb-1">Ism</label>
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(e) => setProfileForm(f => ({ ...f, firstName: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={60}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                placeholder="Ali"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Familiya</label>
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(e) => setProfileForm(f => ({ ...f, lastName: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={60}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                placeholder="Valiyev"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Username</label>
              <input
                type="text"
                value={profileForm.username}
                onChange={(e) => setProfileForm(f => ({ ...f, username: e.target.value }))}
                disabled={!isApi || profileSaving}
                maxLength={32}
                autoComplete="off"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
                placeholder="ali.valiyev"
              />
              <div className="text-[10px] text-white/30 mt-1">Faqat harf, raqam, "_" va "." — kamida 3 belgi.</div>
            </div>
            {profileMsg.text && (
              <div className={`text-xs font-semibold ${profileMsg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {profileMsg.text}
              </div>
            )}
            <button
              type="submit"
              disabled={!isApi || profileSaving}
              className="w-full gradient-bg text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50"
            >
              {profileSaving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </form>

          {/* Parol o'zgartirish */}
          <form onSubmit={handlePasswordSubmit} className="glass rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-white mb-1">Parolni o'zgartirish</h3>
            {!isApi && (
              <div className="text-xs text-amber-300">Parol almashtirish faqat akkaunt rejimida mavjud.</div>
            )}
            <div>
              <label className="block text-xs text-white/50 mb-1">Eski parol</label>
              <input
                type="password"
                value={pwForm.oldPassword}
                onChange={(e) => setPwForm(f => ({ ...f, oldPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="current-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Yangi parol</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Yangi parolni tasdiqlash</label>
              <input
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                disabled={!isApi || pwSaving}
                autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 disabled:opacity-50"
              />
            </div>
            {pwMsg.text && (
              <div className={`text-xs font-semibold ${pwMsg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>
                {pwMsg.text}
              </div>
            )}
            <div className="text-[10px] text-white/30">
              Parol o'zgartirilgandan keyin boshqa qurilmalardagi sessiyalar yopiladi.
            </div>
            <button
              type="submit"
              disabled={!isApi || pwSaving}
              className="w-full gradient-bg text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50"
            >
              {pwSaving ? "O'zgartirilmoqda..." : "Parolni o'zgartirish"}
            </button>
          </form>
        </div>
      )}

      {/* Retention: o'sish yo'li, oylik o'sish va sinf taqqoslash (LT2/LT3/OB3) */}
      {isApi && (
        <>
          <RoadmapCard />
          <ProgressComparisonCard />
          <PeerComparisonCard />
        </>
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
    </>
  );
};

Object.assign(window, { ProfilePage });
