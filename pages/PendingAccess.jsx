// pages/PendingAccess.jsx — Reusable blocked-access cards & RoleSwitcher modal

// ─── Blocked-access card (pending or rejected) ──────────────────────────────
const PendingAccessCard = ({ icon = 'shield', title, message, status = 'pending', onBack, extra }) => {
  const tone =
    status === 'rejected'
      ? { ring: 'border-rose-500/30', glow: 'glow-purple', emoji: '🚫', badge: 'badge-rejected', label: 'Rad etildi' }
      : { ring: 'border-amber-500/30', glow: 'glow-blue',   emoji: '⏳', badge: 'badge-pending',  label: 'Kutilmoqda' };
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#050508' }}>
      <div className={`glass-strong rounded-3xl p-8 md:p-10 max-w-lg w-full text-center border ${tone.ring} ${tone.glow} animate-in relative overflow-hidden`}>
        <div className="hero-glow" style={{ background: '#6366f1', top: '-50%', left: '30%', opacity: 0.12 }} />
        <div className="relative z-10">
          <div className="text-5xl mb-4">{tone.emoji}</div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`chip ${tone.badge}`}>{tone.label}</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white mb-3">{title}</h2>
          <p className="text-white/50 leading-relaxed mb-6">{message}</p>
          {extra && <div className="mb-6">{extra}</div>}
          {onBack && (
            <button onClick={onBack} className="btn-primary px-6 py-3 rounded-2xl font-semibold inline-flex items-center gap-2">
              <Icon name="arrowLeft" size={15} /> Orqaga
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Embedded variant (used inside dashboards instead of full screen) ──────
const PendingAccessInline = ({ icon = 'shield', title, message, status = 'pending', actions }) => {
  const tone =
    status === 'rejected'
      ? { ring: 'border-rose-500/30', emoji: '🚫', badge: 'badge-rejected', label: 'Rad etildi' }
      : { ring: 'border-amber-500/30', emoji: '⏳', badge: 'badge-pending',  label: 'Kutilmoqda' };
  return (
    <div className="p-3 md:p-6 animate-in">
      <div className={`glass-strong rounded-3xl p-5 md:p-8 max-w-2xl mx-auto text-center border ${tone.ring}`}>
        <div className="text-5xl mb-4">{tone.emoji}</div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`chip ${tone.badge}`}>{tone.label}</span>
        </div>
        <h2 className="text-xl md:text-2xl font-black text-white mb-2">{title}</h2>
        <p className="text-white/50 leading-relaxed mb-5">{message}</p>
        {actions}
      </div>
    </div>
  );
};

// ─── Pending Home — when user has zero approved roles ──────────────────────
const PendingHome = ({ user, onLogout, onNavigate }) => {
  const pending = getPendingRoles(user);
  const rejected = (user?.roles ? Object.entries(user.roles) : []).filter(([, v]) => v?.status === 'rejected').map(([k]) => k);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: '#050508' }}>
      <div className="glass-strong rounded-3xl p-8 md:p-10 max-w-xl w-full border border-indigo-500/20 animate-in relative overflow-hidden">
        <div className="hero-glow" style={{ background: '#6366f1', top: '-50%', left: '30%', opacity: 0.12 }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo compact size="lg" />
            <div>
              <div className="font-black text-white text-lg">Salom, {user?.name?.split(' ')[0]} 👋</div>
              <div className="text-xs text-white/40">Hisobingiz yaratildi — endi tasdiqni kuting</div>
            </div>
          </div>

          {pending.length > 0 && (
            <div className="space-y-3 mb-5">
              <div className="text-xs text-white/40 font-medium uppercase tracking-wider">Kutilayotgan arizalar</div>
              {pending.map(role => {
                const meta = ROLE_META[role];
                const data = user.roles[role];
                // API rejimda backend roles_detail.centerName kelti, mock
                // rejimda OlympyStore.findCenter ishlatamiz.
                const apiCenterName = data?.centerName;
                const mockCenter = !user?._api && data?.centerId ? OlympyStore.findCenter(data.centerId) : null;
                const centerLabel = apiCenterName || mockCenter?.name || (data?.centerId ? '' : 'Markazsiz');
                return (
                  <div key={role} className="glass rounded-2xl p-4 flex items-center gap-3 border border-amber-500/20">
                    <div className="text-2xl">{meta?.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{meta?.label} arizasi</div>
                      <div className="text-xs text-white/40 truncate">
                        {centerLabel || '—'}{data?.subject ? ` · ${data.subject}` : ''}
                      </div>
                    </div>
                    <span className="chip badge-pending">Kutilmoqda</span>
                  </div>
                );
              })}
            </div>
          )}

          {rejected.length > 0 && (
            <div className="space-y-3 mb-5">
              <div className="text-xs text-white/40 font-medium uppercase tracking-wider">Rad etilgan arizalar</div>
              {rejected.map(role => {
                const meta = ROLE_META[role];
                return (
                  <div key={role} className="glass rounded-2xl p-4 flex items-center gap-3 border border-rose-500/20">
                    <div className="text-2xl">{meta?.icon}</div>
                    <div className="flex-1"><div className="text-sm font-semibold text-white">{meta?.label} arizasi</div></div>
                    <span className="chip badge-rejected">Rad etildi</span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-white/50 text-sm leading-relaxed mb-5">
            Arizangiz tasdiqlangach, tegishli panel avtomatik ochiladi. Tasdiqlash odatda bir necha daqiqadan bir kungacha vaqt oladi.
          </p>

          <div className="flex gap-3">
            <button onClick={() => onNavigate('landing')} className="btn-ghost flex-1 py-3 rounded-2xl font-semibold">
              Bosh sahifa
            </button>
            <button onClick={onLogout} className="btn-danger flex-1 py-3 rounded-2xl font-semibold">
              Chiqish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Role Switcher Modal ───────────────────────────────────────────────────
const RoleSwitcherModal = ({ open, user, onClose, onSwitch, onLogout, onNavigate }) => {
  if (!open || !user) return null;
  const approved = getApprovedRoles(user);
  const pendingRoles = getPendingRoles(user);
  const rejectedRoles = Object.entries(user.roles || {}).filter(([, v]) => v?.status === 'rejected').map(([k]) => k);

  return (
    <Modal open={open} onClose={onClose} title="Rolni almashtirish" width="max-w-md">
      <div className="space-y-3">
        <div className="flex items-center gap-3 glass rounded-2xl p-3">
          <Avatar name={user.name} src={user?.avatarUrl || ''} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user.name}</div>
            <div className="text-xs text-white/40">{user.phone}</div>
          </div>
        </div>

        {approved.length > 0 && (
          <>
            <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-2">Faol rollar</div>
            <div className="space-y-2">
              {approved.map(role => {
                const meta = ROLE_META[role];
                const isActive = user.activeRole === role;
                return (
                  <button key={role} onClick={() => onSwitch(role)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-white/10 transition-all text-left ${isActive ? 'border border-indigo-500/40' : 'border border-transparent'}`}>
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{meta.label}</div>
                      <div className="text-xs text-white/40">{isActive ? 'Hozir faol' : 'Almashtirish'}</div>
                    </div>
                    {isActive && <Icon name="check" size={16} className="text-indigo-400" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {pendingRoles.length > 0 && (
          <>
            <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-2">Kutilayotgan</div>
            <div className="space-y-2">
              {pendingRoles.map(role => {
                const meta = ROLE_META[role];
                return (
                  <div key={role} className="flex items-center gap-3 p-3 rounded-xl glass opacity-70 cursor-not-allowed">
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white/70">{meta.label}</div>
                      <div className="text-xs text-white/40">Tasdiqlash kutilmoqda</div>
                    </div>
                    <span className="chip badge-pending">Kutilmoqda</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {rejectedRoles.length > 0 && (
          <>
            <div className="text-xs text-white/40 font-medium uppercase tracking-wider mt-2">Rad etilgan</div>
            <div className="space-y-2">
              {rejectedRoles.map(role => {
                const meta = ROLE_META[role];
                return (
                  <div key={role} className="flex items-center gap-3 p-3 rounded-xl glass opacity-60">
                    <span className="text-xl">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white/70">{meta.label}</div>
                    </div>
                    <span className="chip badge-rejected">Rad etildi</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-3 pt-3">
          <button onClick={onLogout} className="btn-ghost flex-1 py-3 rounded-xl">Chiqish</button>
          <button onClick={onClose} className="btn-primary flex-1 py-3 rounded-xl font-semibold">Yopish</button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Notifications Bell ────────────────────────────────────────────────────
const NotificationsBell = ({ user }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  // API rejimda backend'dan oladi; mock rejimda store dan oladi.
  const apiRes = useApiData(
    () => isApi ? OlympyApi.getNotifications(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) return null;
  const list = isApi
    ? (Array.isArray(apiRes.data) ? apiRes.data.map(mapApiNotification).slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')) : [])
    : notificationsForUser(store, user.id);
  const unread = list.filter(n => !n.isRead).length;

  const markOne = (n) => {
    if (n.isRead) return;
    if (isApi) {
      OlympyApi.markNotificationRead(n.backendId ?? n.id, OlympyApi.getToken())
        .then(() => apiRes.reload())
        .catch(err => console.warn('markNotificationRead failed:', err));
      return;
    }
    OlympyStore.markNotificationRead(n.id);
  };
  const markAll = () => {
    if (isApi) {
      OlympyApi.markAllNotificationsRead(OlympyApi.getToken())
        .then(() => apiRes.reload())
        .catch(err => console.warn('markAllNotificationsRead failed:', err));
      return;
    }
    OlympyStore.markAllNotificationsRead(user.id);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/5 hover:text-white">
        <Icon name="bell" size={20} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-rose-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] glass-strong rounded-2xl border border-white/10 z-50 animate-in shadow-2xl"
             style={{ background: '#12152e' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="text-sm font-bold text-white">Bildirishnomalar</div>
            {unread > 0 && (
              <button onClick={markAll}
                className="text-xs text-indigo-400 hover:text-indigo-300">Hammasini o'qildi deb belgilash</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.length === 0 && (
              <div className="px-4 py-10 text-center text-white/40 text-sm">Hozircha xabarnomalar yo'q</div>
            )}
            {list.map(n => (
              <div key={n.id}
                onClick={() => markOne(n)}
                className={`px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors ${!n.isRead ? 'bg-indigo-500/5' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${n.type?.includes('rejected') ? 'bg-rose-500/15 text-rose-400' : n.type?.includes('approved') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/15 text-indigo-400'}`}>
                    {n.type?.includes('olympiad') ? '🏆' : n.type?.includes('rejected') ? '✗' : n.type?.includes('approved') ? '✓' : '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-white truncate">{n.title}</div>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0"></span>}
                    </div>
                    <div className="text-xs text-white/60 mt-0.5 leading-relaxed whitespace-pre-line">{n.message}</div>
                    <div className="text-xs text-white/30 mt-1">{(n.createdAt || '').slice(0, 16).replace('T', ' ')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { PendingAccessCard, PendingAccessInline, PendingHome, RoleSwitcherModal, NotificationsBell });
