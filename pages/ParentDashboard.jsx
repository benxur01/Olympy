// pages/ParentDashboard.jsx — Ota-ona / Kuzatuvchi paneli

// Dashboard ichki navigatsiyasi ↔ URL: har bir tab `/dashboard/parent/<key>`
// manziliga bog'lanadi (home → /dashboard/parent).
const PARENT_DASHBOARD_PAGES = ['home', 'children', 'profile'];
const parentDashUrl = makeDashboardUrlSync('/dashboard/parent', PARENT_DASHBOARD_PAGES);

const ParentDashboard = ({ user, onNavigate, onLogout }) => {
  const [page, setPage] = parentDashUrl.usePageState();
  const [mobileMenu, setMobileMenu] = React.useState(false);
  const [phoneInput, setPhoneInput] = React.useState('+998');
  const [linkError, setLinkError] = React.useState('');
  const [linkSuccess, setLinkSuccess] = React.useState('');
  const [selectedChild, setSelectedChild] = React.useState(null);
  const [downloadingReportId, setDownloadingReportId] = React.useState(null);

  const isApi = !!user?._api;
  const token = isApi ? OlympyApi.getToken() : null;

  const childrenRes = useApiData(
    () => isApi ? OlympyApi.getChildren(token) : Promise.resolve([]),
    [isApi],
  );
  const children = childrenRes.data || [];

  const [predictionsMap, setPredictionsMap] = React.useState({});
  const [predictionsLoading, setPredictionsLoading] = React.useState(false);
  const [digestTogglingId, setDigestTogglingId] = React.useState(null);
  const [sendingDigestId, setSendingDigestId] = React.useState(null);

  const fetchPredictions = React.useCallback(async (studentId) => {
    if (!studentId || predictionsMap[studentId]) return;
    setPredictionsLoading(true);
    try {
      const resp = await OlympyApi.getChildPredictions(studentId, token);
      if (resp) {
        setPredictionsMap(prev => ({ ...prev, [studentId]: resp }));
      }
    } catch {}
    setPredictionsLoading(false);
  }, [token, predictionsMap]);

  React.useEffect(() => {
    if (selectedChild) {
      fetchPredictions(selectedChild.student_id);
    }
  }, [selectedChild, fetchPredictions]);

  const handleToggleDigest = async (studentId, currentVal) => {
    setDigestTogglingId(studentId);
    try {
      const nextVal = !currentVal;
      await OlympyApi.toggleWeeklyDigest(studentId, nextVal, token);
      childrenRes.reload();
      if (selectedChild && selectedChild.student_id === studentId) {
        setSelectedChild(prev => ({ ...prev, weekly_digest_enabled: nextVal }));
      }
    } catch (err) {
      alert("Haftalik hisobot rejimini o'zgartirib bo'lmadi");
    } finally {
      setDigestTogglingId(null);
    }
  };

  const handleSendTestDigest = async (studentId) => {
    setSendingDigestId(studentId);
    try {
      const resp = await OlympyApi.sendTestWeeklyDigest(studentId, token);
      alert(resp?.detail || "Haftalik hisobot Telegram orqali jo'natildi!");
    } catch (err) {
      alert(err.message || "Telegramga xabar yuborib bo'lmadi. Telegram profil bog'langanligini tekshiring.");
    } finally {
      setSendingDigestId(null);
    }
  };

  const handleLink = async () => {
    setLinkError('');
    setLinkSuccess('');
    const phone = (phoneInput || '').trim();
    if (!phone || phone.length < 10) {
      setLinkError("Telefon raqamni to'liq kiriting");
      return;
    }
    try {
      await OlympyApi.linkChild(phone, token);
      setLinkSuccess("Farzand qo'shildi!");
      setPhoneInput('+998');
      childrenRes.reload();
      setTimeout(() => setLinkSuccess(''), 3000);
    } catch (err) {
      setLinkError(OlympyApi.toUserMessage?.(err) || "Qo'shib bo'lmadi");
    }
  };

  const handleUnlink = async (studentId) => {
    if (!confirm("Farzandni olib tashlashni tasdiqlaysizmi?")) return;
    try {
      await OlympyApi.unlinkChild(studentId, token);
      childrenRes.reload();
    } catch (err) {
      alert(OlympyApi.toUserMessage?.(err) || "O'chirib bo'lmadi");
    }
  };

  const handleDownloadReport = async (studentId, studentName) => {
    setDownloadingReportId(studentId);
    try {
      const blob = await OlympyApi.downloadChildReport(studentId, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanedName = (studentName || 'o_quvchi').replace(/\s+/g, '_');
      a.download = `hisobot-${cleanedName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(OlympyApi.toUserMessage?.(err) || "Hisobotni yuklab bo'lmadi");
    } finally {
      setDownloadingReportId(null);
    }
  };

  const navItems = [
    { key: 'home', icon: 'home', label: 'Uy' },
    { key: 'children', icon: 'users', label: 'Farzandlarim' },
    { key: 'profile', icon: 'user', label: 'Profil' },
  ];

  const renderHome = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-white">Salom, {user.name?.split(' ')[0] || 'Ota-ona'}! 👋</h2>
        <p className="text-white/40 text-xs md:text-sm mt-1">Farzandingizning o'qish jarayonini kuzating</p>
      </div>

      {childrenRes.loading && (
        <div className="text-white/40 text-sm">Yuklanmoqda...</div>
      )}
      {!childrenRes.loading && children.length === 0 && (
        <EmptyState
          icon="users"
          title="Farzand qo'shilmagan"
          desc="Farzandingiz telefon raqami orqali uni ro'yxatga oling"
          action={
            <button onClick={() => setPage('children')} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">
              Farzand qo'shish
            </button>
          }
        />
      )}

      {children.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {children.map(child => {
            const latest = (child.attempts || [])[0];
            const avg = (child.attempts || []).length
              ? Math.round((child.attempts.reduce((s, a) => s + (a.score || 0), 0) / child.attempts.length))
              : 0;
            return (
              <div key={child.student_id} className="glass rounded-2xl p-4 md:p-5 card-hover">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar name={child.full_name} src={child.avatar_url} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white flex items-center gap-1.5 truncate">
                      {child.full_name}
                      {!!child.streak_count && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/25 px-1.5 py-0.5 rounded-lg animate-pulse" title="Ketma-ket faol kunlari">
                          🔥 {child.streak_count} kun
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 truncate">{child.phone}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="glass rounded-xl py-2">
                    <div className="text-xs text-white/40">Tadbirlar</div>
                    <div className="text-lg font-bold text-white">{(child.attempts || []).length}</div>
                  </div>
                  <div className="glass rounded-xl py-2">
                    <div className="text-xs text-white/40">O'rt. ball</div>
                    <div className={`text-lg font-bold ${avg >= 70 ? 'text-emerald-400' : avg >= 50 ? 'text-amber-400' : 'text-white/50'}`}>{avg || '—'}</div>
                  </div>
                  <div className="glass rounded-xl py-2">
                    <div className="text-xs text-white/40">Eng yaxshi</div>
                    <div className="text-lg font-bold text-amber-300">
                      {(child.attempts || []).reduce((m, a) => a.score > m ? a.score : m, 0) || '—'}
                    </div>
                  </div>
                </div>
                {latest && (
                  <div className="rounded-xl bg-white/5 p-3 mb-3 border border-white/10">
                    <div className="text-[10px] text-white/40 uppercase mb-1">So'nggi natija</div>
                    <div className="text-sm font-medium text-white truncate">{latest.olympiad_title}</div>
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <span className="text-white/60">{latest.subject}</span>
                      <span className={`font-bold ${latest.score >= 70 ? 'text-emerald-400' : latest.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {latest.score} ball
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadReport(child.student_id, child.full_name)}
                    disabled={downloadingReportId === child.student_id}
                    className="flex-1 btn-primary py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 min-h-[40px] disabled:opacity-50"
                  >
                    {downloadingReportId === child.student_id ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border border-white/20 border-t-white animate-spin" />
                        Yuklanmoqda...
                      </>
                    ) : (
                      <>
                        <Icon name="download" size={13} />
                        Hisobot
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedChild(child)}
                    className="flex-1 btn-ghost py-2.5 rounded-xl text-xs font-semibold"
                  >Batafsil</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderChildren = () => (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad">
      <div className="glass rounded-2xl p-4 md:p-6">
        <h3 className="font-bold text-white text-sm md:text-base mb-3">Yangi farzand qo'shish</h3>
        <p className="text-xs text-white/40 mb-4">Farzandingiz allaqachon Olympy'da ro'yxatdan o'tgan bo'lishi kerak. Uning telefon raqamini kiriting.</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="tel"
            value={phoneInput}
            onChange={e => setPhoneInput(formatUzPhoneInput ? formatUzPhoneInput(e.target.value) : e.target.value)}
            placeholder="+998 90 123 45 67"
            className="glass border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white bg-transparent flex-1 min-w-[200px]"
          />
          <button onClick={handleLink} className="btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold">
            Qo'shish
          </button>
        </div>
        {linkError && <div className="text-xs text-rose-400 mt-2">{linkError}</div>}
        {linkSuccess && <div className="text-xs text-emerald-400 mt-2">{linkSuccess}</div>}
      </div>

      <div className="glass rounded-2xl p-4 md:p-6">
        <h3 className="font-bold text-white text-sm md:text-base mb-3">Mening farzandlarim</h3>
        {childrenRes.loading && <div className="text-xs text-white/40">Yuklanmoqda...</div>}
        {!childrenRes.loading && children.length === 0 && (
          <div className="text-xs text-white/40">Hozircha farzand qo'shilmagan.</div>
        )}
        {children.length > 0 && (
          <div className="space-y-3">
            {children.map(child => (
              <div key={child.student_id} className="flex items-center gap-3 p-3 rounded-xl glass">
                <Avatar name={child.full_name} src={child.avatar_url} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{child.full_name}</div>
                  <div className="text-xs text-white/40 truncate">{child.phone}</div>
                </div>
                <button
                  onClick={() => handleUnlink(child.student_id)}
                  className="text-xs text-rose-300 hover:text-rose-200 px-3 py-1.5 rounded-lg border border-rose-500/20 hover:border-rose-500/40"
                >Olib tashlash</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="p-3 md:p-6 mobile-content-pad">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <Avatar name={user.name} src={user.avatarUrl} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold truncate">{user.name}</div>
            <div className="text-xs text-white/40 truncate">{user.phone}</div>
            <div className="text-xs text-indigo-300 mt-1">Ota-ona / Kuzatuvchi</div>
          </div>
        </div>
        <div className="space-y-2">
          <button onClick={() => onNavigate('profile')} className="w-full btn-ghost text-sm py-2.5 rounded-xl">Asosiy profilni ochish</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={navItems}
        activePage={page}
        setPage={setPage}
        user={{ ...user, role: 'Ota-ona' }}
        onLogout={onLogout}
        logoClick={() => onNavigate('landing')}
        mobileOpen={mobileMenu}
        onMobileClose={() => setMobileMenu(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          title={navItems.find(n => n.key === page)?.label || 'Ota-ona paneli'}
          subtitle={`Farzandlar: ${children.length}`}
          user={user}
          onMenuClick={() => setMobileMenu(true)}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {page === 'home' && renderHome()}
          {page === 'children' && renderChildren()}
          {page === 'profile' && renderProfile()}
        </main>
        <MobileBottomNav items={navItems} activePage={page} setPage={setPage} />
      </div>

      {/* Tafsilotlar modali */}
      <Modal open={!!selectedChild} onClose={() => setSelectedChild(null)} title={selectedChild?.full_name || ''} width="max-w-2xl">
        {selectedChild && (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {selectedChild.badges && selectedChild.badges.length > 0 && (
              <div className="pb-3 border-b border-white/5">
                <div className="text-[10px] text-white/40 uppercase mb-1.5 font-bold tracking-wider">Erishilgan nishonlar</div>
                <div className="flex flex-wrap gap-2">
                  {selectedChild.badges.map(b => (
                    <span
                      key={b.id}
                      className={`inline-flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-white bg-gradient-to-r ${b.color || 'from-indigo-500 to-purple-500'} px-2.5 py-1.5 rounded-xl shadow-[0_4px_12px_rgba(99,102,241,0.2)]`}
                      title={b.description}
                    >
                      <span>{b.icon}</span>
                      <span>{b.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Telegram settings */}
            <div className="pb-3 border-b border-white/5 space-y-3">
              <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Haftalik Telegram Hisoboti</div>
              <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="min-w-0 flex-1 pr-3">
                  <div className="text-xs font-bold text-white">Telegram xabarnoma</div>
                  <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed font-medium">Har yakshanba farzandingizning haftalik faoliyati bo'yicha hisobot ota-ona Telegramiga yuboriladi.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleSendTestDigest(selectedChild.student_id)}
                    disabled={sendingDigestId === selectedChild.student_id}
                    className="btn-ghost text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    {sendingDigestId === selectedChild.student_id ? "Yuborilmoqda..." : "Sinash (Test)"}
                  </button>
                  <button
                    onClick={() => handleToggleDigest(selectedChild.student_id, selectedChild.weekly_digest_enabled)}
                    disabled={digestTogglingId === selectedChild.student_id}
                    className={`text-[10px] px-3 py-1.5 rounded-lg font-bold transition-all ${
                      selectedChild.weekly_digest_enabled
                        ? 'bg-indigo-500 text-white'
                        : 'bg-white/5 text-white/40'
                    }`}
                  >
                    {selectedChild.weekly_digest_enabled ? "Yoqilgan" : "O'chirilgan"}
                  </button>
                </div>
              </div>
            </div>

            {/* AI Success Predictor */}
            <div className="pb-3 border-b border-white/5">
              <div className="text-[10px] text-white/40 uppercase mb-2 font-bold tracking-wider">AI Muvaffaqiyat Prognostikasi</div>
              {predictionsLoading ? (
                <div className="text-xs text-white/40 py-2">Prognostika yuklanmoqda...</div>
              ) : predictionsMap[selectedChild.student_id] ? (
                (() => {
                  const pData = predictionsMap[selectedChild.student_id];
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="glass rounded-xl p-2.5 border border-white/5">
                          <div className="text-[9px] text-white/40 truncate">Prezident Maktabi</div>
                          <div className="text-sm font-black text-indigo-400 mt-1">{pData.predictions?.presidential_school}%</div>
                        </div>
                        <div className="glass rounded-xl p-2.5 border border-white/5">
                          <div className="text-[9px] text-white/40 truncate">Al-Xorazmiy</div>
                          <div className="text-sm font-black text-purple-400 mt-1">{pData.predictions?.al_xorazmiy}%</div>
                        </div>
                        <div className="glass rounded-xl p-2.5 border border-white/5">
                          <div className="text-[9px] text-white/40 truncate">DTM (Kirish)</div>
                          <div className="text-sm font-black text-emerald-400 mt-1">{pData.predictions?.dtm}%</div>
                        </div>
                      </div>
                      <div className="glass rounded-xl p-3 text-xs text-white/70 leading-relaxed whitespace-pre-line border border-indigo-500/10">
                        <div className="font-bold text-white mb-1.5 flex items-center gap-1">
                          <span>💡</span> AI Ekspert Tavsiyalari:
                        </div>
                        {pData.ai_analysis}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-xs text-white/30 py-2">Imtihon topshirmagan o'quvchi uchun tahlil mavjud emas.</div>
              )}
            </div>

            <div className="text-[10px] text-white/40 uppercase mb-1.5 font-bold tracking-wider">Imtihonlar tarixi</div>
            {(selectedChild.attempts || []).length === 0 && (
              <div className="text-xs text-white/40 text-center py-4">Natijalar yo'q</div>
            )}
            {(selectedChild.attempts || []).map(a => (
              <div key={a.attempt_id} className="rounded-xl bg-white/5 p-3 border border-white/10">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium text-sm truncate">{a.olympiad_title}</div>
                    <div className="text-xs text-white/40">{a.subject}</div>
                  </div>
                  <div className={`text-base font-bold flex-shrink-0 ${a.score >= 70 ? 'text-emerald-400' : a.score >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {a.score}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/40">
                  <span>To'g'ri: {a.correct_count}/{a.total_questions}</span>
                  {a.rank && <span>O'rin: #{a.rank}</span>}
                  <span className="ml-auto">{(a.submitted_at || '').slice(0, 10)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

Object.assign(window, { ParentDashboard });
