// pages/PendingAccess.jsx — Reusable blocked-access cards & RoleSwitcher modal
//
// ─── Dizayn: "Imtihon byulleteni" ─────────────────────────────────────────────
// Bu ekranlar foydalanuvchini TO'XTATADI ("arizangiz kutilmoqda", "rad etildi").
// Shu sababli ohang jiddiy: 5xl emoji o'rniga chegara ichidagi belgi, holat esa
// semantik `warning` / `error` tokenlarida — ikkala mavzuda ham bir xil o'qiladi.
//
// `glass` / `glass-strong` aliaslari ATAYIN ishlatilmadi. Ilgari ular `border`
// qisqartma xossasini o'zi yozardi va `@tailwind utilities` dan KEYIN turardi,
// ya'ni `border-error/40` kabi utility'ni bosib ketardi (holat chegarasi
// umuman ko'rinmasdi). Endi ular hoshiyani `box-shadow: inset` bilan chizadi,
// lekin bu yerdagi tanlov o'zgarmaydi: holat chegarasi HAQIQIY, rangli
// `border` bo'lishi kerak, shuning uchun yuzalar to'g'ridan-to'g'ri tokenlar
// bilan yig'ilgan: `bg-surface-1 border border-edge`.

// Rol belgilari. ROLE_META (pages/store.jsx) da ular emoji (🎓, ✏️, 👑…) —
// bu yerda ular bo'lim belgisi rolini o'ynaydi, ya'ni yo'nalishga to'g'ri
// kelmaydi. ROLE_META boshqa hudud, shuning uchun almashtirish shu faylda:
// `Icon` to'plamidagi chizma belgilar.
const ROLE_ICON = {
  student: 'book',
  teacher: 'edit',
  manager: 'building',
  owner:   'award',
  admin:   'shield',
};

// Holat → ko'rinish (chegara, belgi, chip). Bitta joyda turadi: pastdagi uchala
// komponent ham shu jadvaldan foydalanadi.
const _pendingTone = (status) =>
  status === 'rejected'
    ? { ring: 'border-error/40',   mark: 'border-error/40 bg-error/10 text-error',     icon: 'x',     badge: 'badge-rejected', label: 'Rad etildi' }
    : { ring: 'border-warning/40', mark: 'border-warning/40 bg-warning/10 text-warning', icon: 'clock', badge: 'badge-pending',  label: 'Kutilmoqda' };

// ─── Blocked-access card (pending or rejected) ──────────────────────────────
// `icon` — ixtiyoriy: berilmasa holatdan kelib chiqadi (kutilmoqda → soat,
// rad etildi → xoch). Avval `'shield'` default qiymati bor edi, lekin u hech
// qayerda chizilmasdi (o'rniga emoji ko'rsatilardi).
const PendingAccessCard = ({ icon, title, message, status = 'pending', onBack, extra }) => {
  const tone = _pendingTone(status);
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-ground">
      <div className={`bg-surface-1 rounded-2xl p-8 md:p-10 max-w-lg w-full text-center border ${tone.ring} animate-in`}>
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border ${tone.mark}`}>
          <Icon name={icon || tone.icon} size={24} />
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`chip ${tone.badge}`}>{tone.label}</span>
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-text-primary text-balance mb-3">{title}</h2>
        <p className="text-text-secondary text-balance leading-relaxed mb-6">{message}</p>
        {extra && <div className="mb-6">{extra}</div>}
        {/* Boshqaruv qatori. Mavzu tugmasi shu yerda, chunki bu karta
            theme-ready sahifada ham chiziladi: tasdiq kutayotgan o'quvchi
            `/dashboard` da aynan shuni ko'radi (roleHomePage → 'student').
            Kartada sarlavha paneli yo'q, shuning uchun tugma yagona mavjud
            boshqaruv klasteriga — "Orqaga" yoniga qo'shildi. Qulflangan
            sahifalarda `ThemeToggle` o'zi `null` qaytaradi va qator bo'sh
            qoladi (balandligi 0). */}
        <div className="flex items-center justify-center gap-3">
          {onBack && (
            <button onClick={onBack} className="btn-primary px-6 py-3 rounded-lg font-bold inline-flex items-center gap-2">
              <Icon name="arrowLeft" size={15} /> Orqaga
            </button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
};

// ─── Embedded variant (used inside dashboards instead of full screen) ──────
const PendingAccessInline = ({ icon, title, message, status = 'pending', actions }) => {
  const tone = _pendingTone(status);
  return (
    <div className="p-3 md:p-6 animate-in">
      <div className={`bg-surface-1 rounded-2xl p-5 md:p-8 max-w-2xl mx-auto text-center border ${tone.ring}`}>
        <div className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border ${tone.mark}`}>
          <Icon name={icon || tone.icon} size={22} />
        </div>
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className={`chip ${tone.badge}`}>{tone.label}</span>
        </div>
        <h2 className="font-display text-xl md:text-2xl font-bold text-text-primary text-balance mb-2">{title}</h2>
        <p className="text-text-secondary text-balance leading-relaxed mb-5">{message}</p>
        {actions}
      </div>
    </div>
  );
};

// ─── Pending Home — when user has zero approved roles ──────────────────────
const PendingHome = ({ user, onLogout, onNavigate, onUserRefresh }) => {
  const pending = getPendingRoles(user);
  const rejected = (user?.roles ? Object.entries(user.roles) : []).filter(([, v]) => v?.status === 'rejected').map(([k]) => k);

  // Ekran o'z va'dasini bajarishi uchun ("tasdiqlangach panel avtomatik
  // ochiladi"): pending rol qolgan ekan getMe'ni davriy so'rab turamiz. Status
  // o'zgarganda (approved/rejected) yangi user'ni yuqori state'ga uzatamiz —
  // routing o'zi mos panelga o'tkazadi. Overlap bo'lmasligi uchun inFlightRef,
  // fon tab'da so'rov yubormaslik uchun visibility guard (NotificationsBell'dagi
  // kabi), unmount'da esa interval tozalanadi.
  const inFlightRef = React.useRef(false);
  const isApi = !!user?._api;
  const pendingCount = pending.length;
  React.useEffect(() => {
    if (!isApi || pendingCount === 0 || typeof onUserRefresh !== 'function') return undefined;
    // Joriy rol statuslari imzosi — fetch natijasini shunga solishtiramiz.
    const roleSignature = (u) => Object.entries(u?.roles || {})
      .map(([r, v]) => `${r}:${v?.status}`).sort().join(',');
    const baseline = roleSignature(user);
    const poll = async () => {
      if (inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      inFlightRef.current = true;
      try {
        const fresh = await OlympyApi.getMe(OlympyApi.getToken());
        const mapped = OlympyApi.mapBackendUser(fresh);
        if (roleSignature(mapped) !== baseline) onUserRefresh(mapped);
      } catch (err) {
        console.warn('pending approval poll failed:', err);
      } finally {
        inFlightRef.current = false;
      }
    };
    const interval = setInterval(poll, 6000);
    return () => clearInterval(interval);
  }, [isApi, pendingCount, user, onUserRefresh]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-ground">
      <div className="bg-surface-1 rounded-2xl p-8 md:p-10 max-w-xl w-full border border-edge animate-in">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-edge">
          <BrandLogo compact size="lg" />
          <div className="min-w-0">
            <div className="font-display font-bold text-text-primary text-lg truncate">
              Salom, {user?.name?.split(' ')[0]}
            </div>
            <div className="text-xs text-text-secondary">Hisobingiz yaratildi — endi tasdiqni kuting</div>
          </div>
          {/* Sahifaning yagona sarlavha qatori — mavzu tugmasi shu yerda
              (suzuvchi variant app.jsx dan olib tashlandi). */}
          <ThemeToggle className="ml-auto flex-shrink-0" />
        </div>

        {pending.length > 0 && (
          <div className="space-y-3 mb-5">
            <div className="text-[11px] text-text-secondary font-bold uppercase tracking-[0.18em]">Kutilayotgan arizalar</div>
            {pending.map(role => {
              const meta = ROLE_META[role];
              const data = user.roles[role];
              // API rejimda backend roles_detail.centerName kelti, mock
              // rejimda OlympyStore.findCenter ishlatamiz.
              const apiCenterName = data?.centerName;
              const mockCenter = !user?._api && data?.centerId ? OlympyStore.findCenter(data.centerId) : null;
              const centerLabel = apiCenterName || mockCenter?.name || (data?.centerId ? '' : 'Markazsiz');
              return (
                <div key={role} className="bg-surface-1 rounded-xl p-4 flex items-center gap-3 border border-warning/40">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-text-secondary">
                    <Icon name={ROLE_ICON[role] || 'user'} size={17} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text-primary">{meta?.label} arizasi</div>
                    <div className="text-xs text-text-secondary truncate">
                      {centerLabel || '—'}{data?.subject ? ` · ${data.subject}` : ''}
                    </div>
                  </div>
                  <span className="chip badge-pending flex-shrink-0">Kutilmoqda</span>
                </div>
              );
            })}
          </div>
        )}

        {rejected.length > 0 && (
          <div className="space-y-3 mb-5">
            <div className="text-[11px] text-text-secondary font-bold uppercase tracking-[0.18em]">Rad etilgan arizalar</div>
            {rejected.map(role => {
              const meta = ROLE_META[role];
              return (
                <div key={role} className="bg-surface-1 rounded-xl p-4 flex items-center gap-3 border border-error/40">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-text-secondary">
                    <Icon name={ROLE_ICON[role] || 'user'} size={17} />
                  </span>
                  <div className="flex-1 min-w-0"><div className="text-sm font-bold text-text-primary">{meta?.label} arizasi</div></div>
                  <span className="chip badge-rejected flex-shrink-0">Rad etildi</span>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-text-secondary text-sm leading-relaxed mb-5">
          Arizangiz tasdiqlangach, tegishli panel avtomatik ochiladi. Tasdiqlash odatda bir necha daqiqadan bir kungacha vaqt oladi.
        </p>

        <div className="flex gap-3">
          <button onClick={() => onNavigate('landing')} className="btn-ghost flex-1 py-3 rounded-lg font-bold">
            Bosh sahifa
          </button>
          <button onClick={onLogout} className="btn-danger flex-1 py-3 rounded-lg font-bold">
            Chiqish
          </button>
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
        <div className="flex items-center gap-3 bg-surface-1 border border-edge rounded-xl p-3">
          <Avatar name={user.name} src={user?.avatarUrl || ''} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text-primary truncate">{user.name}</div>
            <div className="text-xs text-text-secondary font-data">{user.phone}</div>
          </div>
        </div>

        {approved.length > 0 && (
          <>
            <div className="text-[11px] text-text-secondary font-bold uppercase tracking-[0.18em] mt-2">Faol rollar</div>
            <div className="space-y-2">
              {approved.map(role => {
                const meta = ROLE_META[role];
                const isActive = user.activeRole === role;
                return (
                  <button key={role} onClick={() => onSwitch(role)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl bg-surface-1 border text-left transition-colors hover:border-edge-strong ${isActive ? 'border-accent' : 'border-edge'}`}>
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-text-secondary">
                      <Icon name={ROLE_ICON[role] || 'user'} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-text-primary">{meta.label}</div>
                      <div className="text-xs text-text-secondary">{isActive ? 'Hozir faol' : 'Almashtirish'}</div>
                    </div>
                    {isActive && <Icon name="check" size={16} className="text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {pendingRoles.length > 0 && (
          <>
            <div className="text-[11px] text-text-secondary font-bold uppercase tracking-[0.18em] mt-2">Kutilayotgan</div>
            <div className="space-y-2">
              {pendingRoles.map(role => {
                const meta = ROLE_META[role];
                return (
                  <div key={role} className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-edge cursor-not-allowed">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-text-secondary">
                      <Icon name={ROLE_ICON[role] || 'user'} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-text-secondary">{meta.label}</div>
                      <div className="text-xs text-text-secondary">Tasdiqlash kutilmoqda</div>
                    </div>
                    <span className="chip badge-pending flex-shrink-0">Kutilmoqda</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {rejectedRoles.length > 0 && (
          <>
            <div className="text-[11px] text-text-secondary font-bold uppercase tracking-[0.18em] mt-2">Rad etilgan</div>
            <div className="space-y-2">
              {rejectedRoles.map(role => {
                const meta = ROLE_META[role];
                return (
                  <div key={role} className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 border border-edge">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-edge text-text-secondary">
                      <Icon name={ROLE_ICON[role] || 'user'} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-text-secondary">{meta.label}</div>
                    </div>
                    <span className="chip badge-rejected flex-shrink-0">Rad etildi</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-3 pt-3">
          <button onClick={onLogout} className="btn-ghost flex-1 py-3 rounded-lg font-bold">Chiqish</button>
          <button onClick={onClose} className="btn-primary flex-1 py-3 rounded-lg font-bold">Yopish</button>
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

  // Davriy polling: API rejimda har 30 soniyada bildirishnomalarni yangilab
  // turadi (tab fonda bo'lsa keraksiz so'rov yubormaslik uchun visibility guard).
  const reloadNotifications = apiRes.reload;
  React.useEffect(() => {
    if (!isApi) return undefined;
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        reloadNotifications();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isApi, reloadNotifications]);

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
      <button onClick={() => setOpen(!open)}
        aria-label={unread > 0 ? `Bildirishnomalar (${unread} ta o'qilmagan)` : 'Bildirishnomalar'}
        className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-1 hover:text-text-primary">
        <Icon name="bell" size={20} />
        {/* Ustida matn (o'qilmaganlar soni) bor to'ldirilgan yuza — `accent`
            emas, `accent-fill` + `on-accent`: dark mavzuda `accent` belgi roli
            uchun yorug'lashadi va son 3.6:1 ga tushib ketardi. */}
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-accent-fill rounded-full text-on-accent text-[10px] font-data flex items-center justify-center font-bold px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        // Soya emas — qattiq yuza + kuchli chegara: ochiluvchi panel fon
        // matnidan shu bilan ajraladi (yo'nalish qoidasi).
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-surface-1 rounded-xl border border-edge-strong z-50 animate-in overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-edge">
            <div className="text-sm font-bold text-text-primary">Bildirishnomalar</div>
            {unread > 0 && (
              <button onClick={markAll}
                className="text-xs font-bold text-accent hover:underline">Hammasini o'qildi deb belgilash</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.length === 0 && (
              <div className="px-4 py-10 text-center text-text-secondary text-sm">Hozircha xabarnomalar yo'q</div>
            )}
            {list.map(n => {
              // Emoji (🏆 / ✓ / ✗ / 🔔) o'rniga chizma belgi + semantik token.
              const rejected = n.type?.includes('rejected');
              const approved = n.type?.includes('approved');
              const olympiad = n.type?.includes('olympiad');
              const markTone = rejected ? 'border-error/40 bg-error/10 text-error'
                : approved ? 'border-success/40 bg-success/10 text-success'
                : 'border-edge bg-surface-2 text-text-secondary';
              const markIcon = olympiad ? 'trophy' : rejected ? 'x' : approved ? 'check' : 'bell';
              return (
                <div key={n.id}
                  onClick={() => markOne(n)}
                  className={`px-4 py-3 border-b border-edge last:border-b-0 cursor-pointer hover:bg-surface-2 transition-colors ${!n.isRead ? 'bg-accent/[0.06]' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${markTone}`}>
                      <Icon name={markIcon} size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold text-text-primary truncate">{n.title}</div>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0"></span>}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5 leading-relaxed whitespace-pre-line">{n.message}</div>
                      <div className="text-xs text-text-secondary font-data mt-1">{(n.createdAt || '').slice(0, 16).replace('T', ' ')}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { PendingAccessCard, PendingAccessInline, PendingHome, RoleSwitcherModal, NotificationsBell });
