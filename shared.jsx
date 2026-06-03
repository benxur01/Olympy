// shared.jsx — Global shared components

const { useState, useEffect, useRef, useContext, createContext } = React;

const formatUzPhoneInput = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  let local = digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length > 9) local = local.slice(-9);
  return '+998' + local.slice(0, 9);
};

// ─── Icons (inline SVG helpers) ───────────────────────────────────────────────
const Icon = ({ name, size = 18, className = '' }) => {
  const icons = {
    home: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />,
    users: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    user: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></>,
    trophy: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8M12 17v4M7 4H4a1 1 0 00-1 1v3a4 4 0 004 4h.01M17 4h3a1 1 0 011 1v3a4 4 0 01-4 4h-.01" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 4h10v6a5 5 0 01-10 0V4z" /></>,
    bolt: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
    chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 20V10M12 20V4M6 20v-6" />,
    settings: <><circle cx="12" cy="12" r="3" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>,
    bell: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></>,
    search: <><circle cx="11" cy="11" r="8" strokeWidth={1.8} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35" /></>,
    plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />,
    book: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>,
    eye: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" strokeWidth={1.8} /></>,
    upload: <><polyline points="16 16 12 12 8 16" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /><line x1="12" y1="12" x2="12" y2="21" strokeLinecap="round" strokeWidth={1.8} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></>,
    download: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /><line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeWidth={1.8} /></>,
    star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />,
    award: <><circle cx="12" cy="8" r="6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></>,
    logout: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></>,
    menu: <><line x1="3" y1="6" x2="21" y2="6" strokeWidth={2} strokeLinecap="round" /><line x1="3" y1="12" x2="21" y2="12" strokeWidth={2} strokeLinecap="round" /><line x1="3" y1="18" x2="21" y2="18" strokeWidth={2} strokeLinecap="round" /></>,
    chevronRight: <polyline points="9 18 15 12 9 6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />,
    chevronDown: <polyline points="6 9 12 15 18 9" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />,
    sparkles: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></>,
    file: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="14 2 14 8 20 8" /></>,
    clock: <><circle cx="12" cy="12" r="10" strokeWidth={1.8} /><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="12 6 12 12 16 14" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><rect x="14" y="3" width="7" height="7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><rect x="3" y="14" width="7" height="7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><rect x="14" y="14" width="7" height="7" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></>,
    filter: <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />,
    shield: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    brain: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.5 2A2.5 2.5 0 017 4.5v0A2.5 2.5 0 014.5 7v0a2.5 2.5 0 000 5h.5v3.5A2.5 2.5 0 007.5 18h9a2.5 2.5 0 002.5-2.5V12h.5a2.5 2.5 0 000-5v0A2.5 2.5 0 0017 4.5v0A2.5 2.5 0 0014.5 2H9.5z" />,
    send: <><line x1="22" y1="2" x2="11" y2="13" strokeWidth={1.8} strokeLinecap="round" /><polygon points="22 2 15 22 11 13 2 9 22 2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></>,
    building: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21h18M9 8h1m-1 4h1m4-4h1m-1 4h1M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16" /></>,
    tag: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" strokeWidth={2.5} strokeLinecap="round" /></>,
    edit: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    trash: <><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="3 6 5 6 21 6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>,
    info: <><circle cx="12" cy="12" r="10" strokeWidth={1.8} /><line x1="12" y1="16" x2="12" y2="12" strokeWidth={1.8} strokeLinecap="round" /><line x1="12" y1="8" x2="12.01" y2="8" strokeWidth={2.5} strokeLinecap="round" /></>,
    arrowLeft: <><line x1="19" y1="12" x2="5" y2="12" strokeWidth={2} strokeLinecap="round" /><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="12 19 5 12 12 5" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
      {icons[name] || null}
    </svg>
  );
};

const BRAND_ASSET_BASE = window.location.protocol === 'file:' ? 'public/brand' : '/brand';
const BRAND_LOGO_SRC = `${BRAND_ASSET_BASE}/olympy-brand.png`;
const BRAND_LOGO_SRC_WEBP = `${BRAND_ASSET_BASE}/olympy-brand.webp`;

const BrandLogo = ({ compact = false, size = 'md', className = '' }) => {
  const sizes = {
    xs: { width: 48, height: 32, mark: 28 },
    sm: { width: 84, height: 56, mark: 32 },
    md: { width: 108, height: 72, mark: 36 },
    lg: { width: 126, height: 84, mark: 44 },
    xl: { width: 156, height: 104, mark: 72 },
  };
  const current = sizes[size] || sizes.md;
  const imageBlend = {
    mixBlendMode: 'screen',
    opacity: 0.96,
    backgroundColor: 'transparent',
  };
  const style = compact
    ? {
        ...imageBlend,
        width: Math.round(current.mark * 1.5),
        height: current.mark,
        objectFit: 'contain',
        filter: 'saturate(1.08) contrast(1.02)',
      }
    : {
        ...imageBlend,
        width: current.width,
        height: current.height,
        objectFit: 'contain',
        filter: 'saturate(1.08) contrast(1.02)',
      };
  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`}>
      <picture>
        <source srcSet={BRAND_LOGO_SRC_WEBP} type="image/webp" />
        <img src={BRAND_LOGO_SRC} alt="Olympy" className="block" style={style} />
      </picture>
    </span>
  );
};

// ─── Avatar ────────────────────────────────────────────────────────────────────
// `premium` true bo'lsa avatar atrofida oltin glow halqa (.avatar-premium) ko'rinadi.
const Avatar = ({ name = '', size = 36, gradient = 'from-indigo-500 to-purple-600', src = '', premium = false }) => {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name || 'Avatar'}
        className={`rounded-full object-cover flex-shrink-0 ${premium ? 'avatar-premium' : ''}`}
        style={{ width: size, height: size }}
        onError={() => setHasError(true)}
      />
    );
  }
  return (
    <div className={`bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${premium ? 'avatar-premium' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
};

// ─── Badge ─────────────────────────────────────────────────────────────────────
// Avval 'Tugagan' va 'Tugadi' qizil (badge-rejected) ko'rinardi — finished
// olympiad'lar xato xolatga o'xshab ko'rinardi. Endi tugagan tadbirlar uchun
// alohida ko'k 'badge-finished' rangi ishlatiladi.
const Badge = ({ status }) => {
  const map = {
    'Kutilmoqda': 'badge-pending', 'Tasdiqlandi': 'badge-approved', 'Rad etildi': 'badge-rejected',
    'Faol': 'badge-active', 'Qoralama': 'badge-draft', 'Nofaol': 'badge-pending',
    'Tugagan': 'badge-finished', 'Tugadi': 'badge-finished',
    'active': 'badge-active', 'inactive': 'badge-pending', 'pending': 'badge-pending',
    'approved': 'badge-approved', 'rejected': 'badge-rejected', 'finished': 'badge-finished',
    'draft': 'badge-draft',
  };
  return <span className={`chip ${map[status] || 'badge-draft'}`}>{status}</span>;
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon, color = 'from-indigo-500 to-purple-600', glow }) => (
  <div className={`stat-card glass rounded-2xl p-5 card-hover ${glow || ''}`}>
    <div className="flex items-start justify-between mb-4">
      <div className={`feature-icon bg-gradient-to-br ${color} opacity-90`}>{icon}</div>
      {sub && <span className="text-xs text-green-400 font-medium">{sub}</span>}
    </div>
    <div className="text-2xl font-bold text-white mb-1">{value}</div>
    <div className="text-sm text-white/50">{label}</div>
  </div>
);

// ─── Sidebar inner content (shared between desktop + mobile drawer) ────────────
const SidebarContent = ({ items, activePage, setPage, user, onLogout, logoClick, collapsed, setCollapsed, onItemClick }) => (
  <>
    {/* Logo */}
    <div className={`relative flex items-center py-5 border-b border-white/5 cursor-pointer flex-shrink-0 ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'}`} onClick={logoClick}>
      <BrandLogo compact={collapsed} size={collapsed ? 'sm' : 'md'} />
      {setCollapsed && (
        <button className={`${collapsed ? 'absolute right-1 bottom-1' : 'ml-auto'} text-white/30 hover:text-white/70 transition-colors`} onClick={e => { e.stopPropagation(); setCollapsed(!collapsed); }}>
          <Icon name="menu" size={16} />
        </button>
      )}
    </div>

    {/* Nav items */}
    <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
      {items.map(item => (
        item.divider
          ? <div key={item.key} className="my-2 border-t border-white/5" />
          : <button key={item.key}
              className={`sidebar-item w-full flex items-center rounded-xl text-left transition-all duration-200 ${
                collapsed ? 'justify-center px-0 py-3' : 'gap-3.5 px-4 py-3'
              } ${activePage === item.key ? 'active' : ''}`}
              onClick={() => { setPage(item.key); onItemClick && onItemClick(); }}>
              <span className={`sidebar-icon transition-colors duration-200 ${activePage === item.key ? 'text-indigo-400' : 'text-white/40'}`}>
                <Icon name={item.icon} size={20} />
              </span>
              {!collapsed && (
                <span className={`text-[15px] font-semibold tracking-wide transition-colors duration-200 ${activePage === item.key ? 'text-white' : 'text-white/65'}`}>
                  {item.label}
                </span>
              )}
              {!collapsed && item.badge && (
                <span className="ml-auto bg-indigo-500/20 text-indigo-400 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
      ))}
    </nav>

    {/* User footer */}
    <div className="p-3 border-t border-white/5 flex-shrink-0">
      <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer">
        <Avatar name={user?.name || 'U'} src={user?.avatarUrl || ''} size={32} />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
            <div className="text-xs text-white/40 truncate">{user?.role}</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={onLogout} className="text-white/30 hover:text-red-400 transition-colors p-1">
            <Icon name="logout" size={16} />
          </button>
        )}
      </div>
    </div>
  </>
);

// ─── Sidebar ───────────────────────────────────────────────────────────────────
const Sidebar = ({ items, activePage, setPage, user, onLogout, logoClick, mobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);
  const sharedProps = { items, activePage, setPage, user, onLogout, logoClick };

  return (
    <>
      {/* Desktop sidebar — hidden below lg */}
      <aside
        className={`sidebar-desktop flex flex-col border-r border-white/5 h-screen sticky top-0 flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}
        style={{ background: 'rgba(5,5,8,0.95)' }}>
        <SidebarContent {...sharedProps} collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      {/* Mobile drawer — shown below lg when mobileOpen */}
      {mobileOpen && (
        <>
          <div className="mobile-drawer-backdrop lg:hidden" onClick={onMobileClose} />
          <div className="mobile-drawer lg:hidden">
            <SidebarContent {...sharedProps} collapsed={false} setCollapsed={null} onItemClick={onMobileClose} />
          </div>
        </>
      )}
    </>
  );
};

// ─── Mobile Bottom Navigation ──────────────────────────────────────────────────
const MobileBottomNav = ({ items, activePage, setPage }) => {
  // Pick up to 5 non-divider items for the bottom bar
  const mainItems = items.filter(i => !i.divider && i.key !== 'settings').slice(0, 5);
  return (
    <nav className="mobile-bottom-nav lg:hidden">
      {mainItems.map(item => (
        <button key={item.key} onClick={() => setPage(item.key)}
          className={`mobile-bottom-nav-item ${activePage === item.key ? 'active' : ''}`}>
          <Icon name={item.icon} size={20} />
          <span className="label truncate w-full text-center block">{item.label}</span>
          {item.badge && activePage !== item.key && (
            <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-indigo-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">{item.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
};

// ─── Topbar ────────────────────────────────────────────────────────────────────
const Topbar = ({ title, subtitle, actions, user, onMenuClick }) => {
  const Bell = typeof NotificationsBell !== 'undefined' ? NotificationsBell : (window && window.NotificationsBell);
  return (
    <header className="glass border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex min-w-0 items-center gap-3">
        <button className="lg:hidden flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white/50 hover:bg-white/5 hover:text-white" onClick={onMenuClick}><Icon name="menu" size={20} /></button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white">{title}</h1>
          {subtitle && <p className="truncate text-xs text-white/40">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {actions}
        {user && Bell ? <Bell user={user} /> : (
          <button className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white/50 transition-colors hover:bg-white/5 hover:text-white">
            <Icon name="bell" size={20} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"></span>
          </button>
        )}
      </div>
    </header>
  );
};

// ─── Modal ─────────────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children, width = 'max-w-lg' }) => {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${width}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><Icon name="x" size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ─── AvatarCropModal ───────────────────────────────────────────────────────────
const AvatarCropModal = ({ open, onClose, imageSrc, onCropComplete }) => {
  if (!open || !imageSrc) return null;
  const V = 260; // Viewport size
  const C = 400; // Output Canvas size

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageElementRef = useRef(null);

  // Load image dimensions
  useEffect(() => {
    if (!imageSrc) return;
    setImgLoaded(false);
    setImgDimensions(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      const scaleFactor = Math.max(V / img.naturalWidth, V / img.naturalHeight);
      const baseWidth = img.naturalWidth * scaleFactor;
      const baseHeight = img.naturalHeight * scaleFactor;
      setImgDimensions({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        baseWidth,
        baseHeight
      });
      setImgLoaded(true);
      setScale(1);
      setOffset({ x: 0, y: 0 });
    };
  }, [imageSrc]);

  const clampOffset = (x, y, currentScale, baseW, baseH, viewportSize) => {
    const W_scaled = baseW * currentScale;
    const H_scaled = baseH * currentScale;
    const limitX = Math.max(0, (W_scaled - viewportSize) / 2);
    const limitY = Math.max(0, (H_scaled - viewportSize) / 2);
    return {
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(-limitY, Math.min(limitY, y))
    };
  };

  // Restrict offset when scale changes
  const handleScaleChange = (newScale) => {
    setScale(newScale);
    if (imgDimensions) {
      setOffset(prev => clampOffset(prev.x, prev.y, newScale, imgDimensions.baseWidth, imgDimensions.baseHeight, V));
    }
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDragging(true);
    dragStart.current = { x: clientX - offset.x, y: clientY - offset.y };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rawX = clientX - dragStart.current.x;
      const rawY = clientY - dragStart.current.y;
      if (imgDimensions) {
        const clamped = clampOffset(rawX, rawY, scale, imgDimensions.baseWidth, imgDimensions.baseHeight, V);
        setOffset(clamped);
      }
    };

    const handleGlobalUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [isDragging, imgDimensions, scale]);

  const handleSave = () => {
    if (!imgDimensions || !imageElementRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = C;
    canvas.height = C;
    const ctx = canvas.getContext('2d');

    const canvasScale = C / V;
    const W_scaled = imgDimensions.baseWidth * scale;
    const H_scaled = imgDimensions.baseHeight * scale;
    const left_edge = (V / 2 + offset.x) - W_scaled / 2;
    const top_edge = (V / 2 + offset.y) - H_scaled / 2;

    ctx.drawImage(
      imageElementRef.current,
      left_edge * canvasScale,
      top_edge * canvasScale,
      W_scaled * canvasScale,
      H_scaled * canvasScale
    );

    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <Modal open={open} onClose={onClose} title="Rasm joylashuvini sozlang" width="max-w-md">
      <div className="flex flex-col items-center gap-6">
        {/* The cropper viewport */}
        <div
          className="relative overflow-hidden bg-slate-950 rounded-2xl cursor-grab active:cursor-grabbing touch-none border border-white/10"
          style={{ width: V, height: V, touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
        >
          {imgLoaded && imgDimensions && (
            <img
              ref={imageElementRef}
              src={imageSrc}
              alt="Crop preview"
              className="absolute select-none pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                width: imgDimensions.baseWidth,
                height: imgDimensions.baseHeight,
                maxWidth: 'none',
                maxHeight: 'none',
              }}
            />
          )}
          
          {/* SVG circular overlay */}
          <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
            <defs>
              <mask id="cropMask">
                <rect width="100%" height="100%" fill="white" />
                <circle cx="50%" cy="50%" r="48%" fill="black" />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(5, 5, 8, 0.7)" mask="url(#cropMask)" />
            <circle cx="50%" cy="50%" r="48%" fill="none" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 4" />
          </svg>
        </div>

        {/* Slider Controls */}
        <div className="w-full max-w-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Kattalashtirish</span>
            <span>{Math.round(scale * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => handleScaleChange(Math.max(1, scale - 0.2))} 
              className="text-white/40 hover:text-white transition-colors"
            >
              <Icon name="search" size={16} />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={scale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="flex-1 accent-indigo-500 bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <button 
              type="button" 
              onClick={() => handleScaleChange(Math.min(3, scale + 0.2))} 
              className="text-white/40 hover:text-white transition-colors"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 w-full mt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost flex-1 py-2.5 rounded-xl text-sm"
          >
            Bekor qilish
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-semibold"
          >
            Saqlash
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Empty State ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon, title, desc, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-white/20 mb-4">
      <Icon name={icon} size={28} />
    </div>
    <div className="text-white/60 font-medium mb-1">{title}</div>
    {desc && <div className="text-white/30 text-sm mb-4">{desc}</div>}
    {action}
  </div>
);

// ─── DonutChart ───────────────────────────────────────────────────────────────
const DonutChart = ({ value, max = 100, color = '#6366f1', size = 80, label }) => {
  const r = 28, cx = 40, cy = 40, circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          strokeLinecap="round" strokeDashoffset={circ * 0.25} className="donut-ring"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        <text x="50%" y="50%" textAnchor="middle" dy=".3em" fill="white" fontSize="14" fontWeight="700">{Math.round(pct * 100)}%</text>
      </svg>
      {label && <span className="text-xs text-white/50">{label}</span>}
    </div>
  );
};

// ─── BarChart ─────────────────────────────────────────────────────────────────
const BarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.value));
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-md transition-all duration-700"
            style={{ height: `${(d.value / max) * 80}px`, background: `linear-gradient(180deg, #6366f1, #a855f7)`, opacity: 0.7 + i * 0.05 }} />
          <span className="text-xs text-white/40">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── SvgLineChart ─────────────────────────────────────────────────────────────
// Kutubxonasiz oddiy SVG line chart. `points` = [{ label, value (0..100), title }].
// Har bir nuqtaga hover'da `<title>` orqali tooltip ko'rinadi.
const SvgLineChart = ({ points = [], height = 160, stroke = '#6366f1' }) => {
  if (!points.length) {
    return <div className="text-center text-white/40 text-sm py-8">Hozircha ma'lumot yo'q</div>;
  }
  const W = 320, H = height, padX = 14, padTop = 14, padBottom = 22;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const n = points.length;
  const xAt = (i) => n === 1 ? W / 2 : padX + (innerW * i) / (n - 1);
  const yAt = (v) => padTop + innerH - (innerH * Math.max(0, Math.min(100, v))) / 100;
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${xAt(n - 1).toFixed(1)},${(padTop + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(padTop + innerH).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
      {[0, 25, 50, 75, 100].map(g => (
        <line key={g} x1={padX} x2={W - padX} y1={yAt(g)} y2={yAt(g)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      <path d={areaPath} fill={stroke} opacity="0.12" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xAt(i)} cy={yAt(p.value)} r="4" fill={stroke} stroke="#0b0b14" strokeWidth="1.5">
            <title>{p.title || `${p.label}: ${p.value}%`}</title>
          </circle>
          <text x={xAt(i)} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">{p.label}</text>
        </g>
      ))}
    </svg>
  );
};

// ─── MonthBarChart ────────────────────────────────────────────────────────────
// `data` = [{ label, value }]. Ustun tepasida son ko'rsatiladi (dinamika).
const MonthBarChart = ({ data = [] }) => {
  if (!data.length) {
    return <div className="text-center text-white/40 text-sm py-8">Hozircha ma'lumot yo'q</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="flex items-end gap-2 md:gap-3 h-40 px-1">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
          <span className="text-[10px] md:text-xs font-bold text-white">{d.value}</span>
          <div className="w-full rounded-t-lg transition-all duration-500"
            style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, background: 'linear-gradient(180deg, #6366f1, #a855f7)' }} />
          <span className="text-[9px] md:text-[10px] text-white/40 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

// ─── SubjectBadge ─────────────────────────────────────────────────────────────
const subjectColors = {
  'Matematika': 'from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/20',
  'Ingliz tili': 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/20',
  'Ona tili': 'from-orange-500/20 to-amber-500/20 text-orange-300 border-orange-500/20',
  'Informatika': 'from-cyan-500/20 to-sky-500/20 text-cyan-300 border-cyan-500/20',
  'Fizika': 'from-purple-500/20 to-violet-500/20 text-purple-300 border-purple-500/20',
  'Kimyo': 'from-pink-500/20 to-rose-500/20 text-pink-300 border-pink-500/20',
  'Biologiya': 'from-green-500/20 to-lime-500/20 text-green-300 border-green-500/20',
  'Tarix': 'from-amber-500/20 to-yellow-500/20 text-amber-300 border-amber-500/20',
  'Geografiya': 'from-teal-500/20 to-cyan-500/20 text-teal-300 border-teal-500/20',
};
const SubjectBadge = ({ subject }) => {
  const cls = subjectColors[subject] || 'from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/20';
  return <span className={`chip bg-gradient-to-r ${cls} border`}>{subject}</span>;
};

// ─── TelegramMockup ───────────────────────────────────────────────────────────
const TelegramMockup = ({ studentName, centerName, onApprove, onReject }) => (
  <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#17212b', maxWidth: 340, width: '100%', fontFamily: 'system-ui' }}>
    <div style={{ background: '#2b5278', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <BrandLogo compact size="sm" />
      <div>
        <div className="text-white font-semibold text-sm">Olympy Bot</div>
        <div className="text-white/50 text-xs">online</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div style={{ background: '#2b5278', borderRadius: '4px 12px 12px 12px', padding: '10px 14px', marginBottom: 8 }}>
        <div className="text-white/80 text-sm leading-relaxed">
          🎓 <strong>Yangi o'quvchi ariza yubordi!</strong><br/>
          <br/>
          👤 O'quvchi: <strong>{studentName}</strong><br/>
          🏫 O'quv markaz: <strong>{centerName}</strong><br/>
          📅 Sana: {new Date().toLocaleDateString('uz-UZ')}<br/>
          <br/>
          Tasdiqlaysizmi?
        </div>
        <div className="text-white/30 text-xs mt-2 text-right">12:45 ✓✓</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onApprove} style={{ flex: 1, background: '#2eb82e', color: 'white', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ✅ Tasdiqlash
        </button>
        <button onClick={onReject} style={{ flex: 1, background: '#e53935', color: 'white', border: 'none', borderRadius: 8, padding: '8px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ❌ Rad etish
        </button>
      </div>
    </div>
  </div>
);

// ─── Universal API data hook ──────────────────────────────────────────────
// Use for any read-only fetch from the backend. Returns { data, loading,
// error, reload }. Pass deps to refetch when they change. Cancels stale
// state if the component unmounts mid-fetch.
const useApiData = (fetcher, deps = []) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick(t => t + 1), []);
  // Optimistic UI uchun: serverga so'rov yubormasdan, mahalliy data'ni darhol
  // yangilash imkonini beradi (xato bo'lsa avvalgi data'ga qaytarish mumkin).
  const mutate = React.useCallback((updater) => {
    setData(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fetcher())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e); setLoading(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload, mutate };
};

// useDebounce — qiymat o'zgarganidan keyin `delay` ms kutib, eng oxirgi
// qiymatni qaytaradi. Qidiruv input'larida foydalaniladi: har bosishda
// emas, foydalanuvchi to'xtaganidan keyingina filtr/so'rov ishlaydi.
function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// VirtualList — uzun ro'yxatlarni (100+ element) virtual scroll bilan
// ko'rsatadi: faqat ekranda ko'rinadigan elementlar DOM'da bo'ladi. Qisqa
// ro'yxatlarda shart emas — oddiy .map() ishlatilsin.
function VirtualList({ items, itemHeight = 60, containerHeight = 400, renderItem }) {
  const [scrollTop, setScrollTop] = React.useState(0);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 2;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - 1);
  const endIdx = Math.min(items.length, startIdx + visibleCount);
  const visibleItems = items.slice(startIdx, endIdx);

  return (
    <div
      style={{ height: containerHeight, overflowY: 'auto', position: 'relative' }}
      onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIdx * itemHeight, width: '100%' }}>
          {visibleItems.map((item, i) => renderItem(item, startIdx + i))}
        </div>
      </div>
    </div>
  );
}

// Export all
Object.assign(window, { Icon, BrandLogo, Avatar, Badge, StatCard, Sidebar, MobileBottomNav, Topbar, Modal, EmptyState, DonutChart, BarChart, SvgLineChart, MonthBarChart, SubjectBadge, TelegramMockup, subjectColors, useApiData, AvatarCropModal, useDebounce, VirtualList });
