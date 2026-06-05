// pages/Leaderboard.jsx

// Backend leaderboard yozuvi → frontend mos shakl. Backend: { rank,
// attempt_id, user_id, name, center, subject, score, time_spent }.
const mapApiLeaderboard = (entry) => ({
  key: 'api:' + (entry.attempt_id ?? `${entry.user_id}-${entry.rank}`),
  attemptId: entry.attempt_id ?? null,
  rank: entry.rank,
  name: entry.name || entry.user?.full_name || "Noma'lum",
  center: entry.center || '—',
  organizationType: entry.organization_type || entry.organizationType || "O'quv markaz",
  country: entry.country || "O'zbekiston",
  region: entry.region || '',
  district: entry.district || '',
  subject: entry.subject || '—',
  score: entry.score || 0,
  time: formatTime(entry.time_spent || 0),
  city: entry.region || entry.city || '—',
  isPremium: !!(entry.is_premium ?? entry.isPremium),
  // Avatar rasmi — backend `avatar_url` qaytaradi. Avval bu tashlab ketilardi
  // va premium oltin halqa faqat bosh harf ustida ko'rinardi.
  avatarUrl: OlympyApi.makeAssetUrl
    ? OlympyApi.makeAssetUrl(entry.avatar_url || entry.avatarUrl || '')
    : (entry.avatar_url || entry.avatarUrl || ''),
  _api: true,
});

const LeaderboardPage = ({ onNavigate, embedded, user }) => {
  const store = useStore();
  // Avval `isApi` token mavjud bo'lsa true edi va embedded landing'da
  // foydalanuvchi yo'q bo'lsa-da API'ga so'rov ketardi. Endi:
  // - Standalone (embedded=false): token yetarli, login restore bo'lmasa-da
  //   API'ga urinish mumkin.
  // - Embedded (landing): faqat aniq API user bilan API rejimiga o'tamiz.
  //   Aks holda mock leaderboard ko'rsatamiz.
  // Avval token mavjudligini tekshirardik, lekin cookie_auth rejimida
  // getToken() null bo'lib qolib API rejimini noto'g'ri o'chirib qo'yardi.
  // user._api bayrog'i — yagona ishonchli signal: u backendda autentifikatsiya
  // qilingan foydalanuvchi haqida.
  const isApi = !!user?._api;
  const [filterSubject, setFilterSubject] = React.useState('');
  const [filterCity, setFilterCity] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('all');

  // ─── API rejimida real reyting ──────────────────────────────────────────
  // Faqat API user / saqlangan token mavjud bo'lganda chaqiramiz.
  // Backend yangi shakl: { olympiad: {...}|null, entries: [...] }.
  const apiLbRes = useApiData(
    () => isApi ? OlympyApi.getLeaderboard(null, OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const apiPayload = isApi && apiLbRes.data && typeof apiLbRes.data === 'object'
    ? apiLbRes.data
    : null;
  const apiEntries = apiPayload && Array.isArray(apiPayload.entries)
    ? apiPayload.entries.map(mapApiLeaderboard)
    : null;
  const apiOlympiadInfo = apiPayload?.olympiad || null;

  // Local fallback is only used when the page is embedded without API auth.
  const liveEntries = (store.attempts || []).map(a => {
    const u = store.users.find(x => x.id === a.userId);
    const o = store.olympiads.find(x => x.id === a.olympiadId);
    const c = o ? store.centers.find(x => x.id === o.centerId) : null;
    return {
      key: a.id,
      name: u?.name || 'Foydalanuvchi',
      center: c?.name || '—',
      organizationType: c?.organizationType || "O'quv markaz",
      country: c?.country || "O'zbekiston",
      region: c?.region || '',
      district: c?.district || '',
      subject: o?.subject || '—',
      score: a.score,
      time: formatTime(a.timeSpent || 0),
      city: c?.region || c?.city || '—',
      _live: true,
    };
  });

  // Production uses API results only.
  const merged = apiEntries
    ? apiEntries.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .map((d) => ({ ...d, badge: d.rank === 1 ? '🥇' : d.rank === 2 ? '🥈' : d.rank === 3 ? '🥉' : '' }))
    : (isApi ? [] : liveEntries)
        .sort((a, b) => b.score - a.score)
        .map((d, i) => ({ ...d, rank: i + 1, badge: i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '' }));
  const apiLoading = isApi && apiLbRes.loading && !apiEntries;

  const subjects = [...new Set(merged.map(d => d.subject))].filter(Boolean);
  const cities = [...new Set(merged.map(d => d.city))].filter(Boolean);

  // Tab filter: 'center' — foydalanuvchi o'z markazi o'quvchilari;
  // 'subject' — foydalanuvchi profilidagi fan bo'yicha; 'all' — hammasi.
  // Avval activeTab faqat ko'rinardi, lekin ro'yxatga ta'sir qilmasdi.
  const userCenterName = (() => {
    const role = user?.roles?.student || user?.roles?.teacher || user?.roles?.manager || user?.roles?.owner;
    return role?.centerName || '';
  })();
  const userSubject = (() => {
    const role = user?.roles?.student || user?.roles?.teacher;
    return role?.subject || '';
  })();

  const tabFiltered = merged.filter(d => {
    if (activeTab === 'center') {
      if (!userCenterName) return false;
      return d.center === userCenterName;
    }
    if (activeTab === 'subject') {
      if (!userSubject) return false;
      return d.subject === userSubject;
    }
    return true;
  });

  const filtered = tabFiltered.filter(d =>
    (!filterSubject || d.subject === filterSubject) &&
    (!filterCity || d.city === filterCity)
  );
  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  const content = (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white">Reyting jadvali</h2>
          <p className="text-white/40 text-sm">{(() => {
            // Filterlar tanlanganda subtitl ham ularga moslashadi.
            const parts = [];
            if (filterSubject) parts.push(filterSubject);
            else if (apiOlympiadInfo?.subject) parts.push(apiOlympiadInfo.subject);
            if (apiOlympiadInfo?.olympiad_title) parts.push(apiOlympiadInfo.olympiad_title);
            if (filterCity) parts.push(filterCity);
            if (apiOlympiadInfo?.start_datetime) {
              const dt = new Date(apiOlympiadInfo.start_datetime);
              if (!Number.isNaN(dt.getTime())) {
                const months = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
                parts.push(`${months[dt.getMonth()]} ${dt.getFullYear()}`);
              }
            }
            return parts.length ? parts.join(' · ') : "Barcha tadbirlar bo'yicha";
          })()}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input-field py-2 w-auto text-sm" value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
            <option value="">Barcha fanlar</option>
            {subjects.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input-field py-2 w-auto text-sm" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
            <option value="">Barcha viloyatlar</option>
            {cities.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs — "Sinfdoshlar" faqat real API rejimida ko'rinadi (LT4). */}
      <div className="nav-tabs flex gap-1">
        {['all','center','subject', ...(isApi ? ['classmates'] : [])].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`nav-tab ${activeTab===t?'active':''}`}>
            {t==='all'?'Umumiy':t==='center'?'Tashkilot':t==='subject'?'Fan':'Sinfdoshlar'}
          </button>
        ))}
      </div>

      {/* LT4: Sinfdoshlar reytingi — alohida endpoint (per-user o'rtacha ball). */}
      {activeTab === 'classmates' && <ClassmatesLeaderboard />}

      {activeTab !== 'classmates' && apiLoading && (
        <div className="glass rounded-2xl p-6 text-center text-white/50 text-sm">Reyting yuklanmoqda...</div>
      )}

      {activeTab !== 'classmates' && (
      <>
      {/* Top 3 podium — podium tartibi (silver-gold-bronze) saqlanadi, lekin mobile'da kompakt */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        {[top3[1], top3[0], top3[2]].filter(Boolean).map((p, i) => {
          const isFirst = i === 1;
          const cls = isFirst ? 'leaderboard-gold' : i === 0 ? 'leaderboard-silver' : 'leaderboard-bronze';
          return (
            <div key={p.key || p.rank} className={`rounded-2xl p-2 md:p-4 text-center card-hover min-w-0 ${cls} ${isFirst ? 'mt-0' : 'mt-3 md:mt-6'}`}>
              <div className="text-2xl md:text-3xl mb-0.5 md:mb-1">{p.badge}</div>
              <Avatar name={p.name} src={p.avatarUrl || ''} size={isFirst?40:32} gradient={isFirst?'from-amber-400 to-orange-500':'from-indigo-500 to-purple-600'} premium={!!p.isPremium} />
              <div className="text-xs md:text-sm font-bold text-white mt-1.5 md:mt-2 truncate">{p.name.split(' ')[0]}</div>
              {p.isPremium && <div className="mt-1 flex justify-center"><span className="premium-badge premium-badge--sm" title="Premium o'quvchi">⭐ Premium</span></div>}
              <div className="hidden md:block text-xs text-white/40 truncate mb-2">{p.center} · {p.organizationType}</div>
              <div className={`text-lg md:text-2xl font-black mt-1 md:mt-0 ${isFirst?'text-amber-400':i===0?'text-slate-300':'text-amber-600'}`}>{p.score}</div>
              <div className="hidden md:block"><SubjectBadge subject={p.subject} /></div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 text-xs text-white/40 font-medium">
          <div className="col-span-1">#</div>
          <div className="col-span-3">O'quvchi</div>
          <div className="col-span-3">Tashkilot</div>
          <div className="col-span-2">Fan</div>
          <div className="col-span-1 text-right">Ball</div>
          <div className="col-span-1 text-right">Vaqt</div>
          <div className="col-span-1"></div>
        </div>
        {(() => {
          // Reyting qatori — virtual scroll va oddiy map o'rtasida bir xil JSX.
          const renderRow = (p) => (
            <div key={p.key || p.rank} className={`olympy-row flex items-center gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3.5 ${p.isPremium ? 'premium-row' : ''}`}>
              <div className="md:col-span-1 flex-shrink-0">
                <div className="w-8 h-8 rounded-xl glass flex items-center justify-center text-sm font-bold text-white/50">
                  {p.rank}
                </div>
              </div>
              <div className="md:col-span-3 flex-1 flex items-center gap-2 min-w-0">
                <Avatar name={p.name} src={p.avatarUrl || ''} size={32} premium={!!p.isPremium} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {p.isPremium && <span className="premium-badge premium-badge--sm flex-shrink-0" title="Premium o'quvchi">Premium</span>}
                  </div>
                  <div className="text-xs text-white/30 truncate md:hidden">{p.center}</div>
                </div>
              </div>
              <div className="col-span-3 hidden md:flex items-center">
                <span className="text-sm text-white/50 truncate">{p.center}</span>
              </div>
              <div className="col-span-2 hidden md:block"><SubjectBadge subject={p.subject} /></div>
              <div className="md:col-span-1 text-right flex-shrink-0">
                <span className={`text-sm font-black ${p.score>=90?'text-emerald-400':p.score>=75?'text-indigo-400':'text-amber-400'}`}>{p.score}</span>
              </div>
              <div className="md:col-span-1 text-right text-xs text-white/30 font-mono flex-shrink-0">{p.time}</div>
              <div className="md:col-span-1 text-right flex-shrink-0">
                {/* Avval bu tugma faqat dekorativ edi — hech narsa qilmasdi.
                    Endi natijani Results sahifasiga olib o'tadi (attemptId
                    bo'lgan qatorlar uchun). */}
                <button
                  onClick={() => p.attemptId && onNavigate && onNavigate('results', { attemptId: p.attemptId })}
                  disabled={!p.attemptId}
                  className="text-white/30 hover:text-indigo-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Natijani ko'rish">
                  <Icon name="eye" size={14} />
                </button>
              </div>
            </div>
          );
          // Ro'yxat juda uzun bo'lsa (100+ qator) virtual scroll bilan
          // ko'rsatamiz — faqat ekrandagi qatorlar DOM'da bo'ladi. Aks holda
          // oddiy .map() (qisqa ro'yxatlarda virtualizatsiya keraksiz).
          if (rest.length > 100) {
            return <VirtualList items={rest} itemHeight={68} containerHeight={640} renderItem={renderRow} />;
          }
          return rest.map(renderRow);
        })()}
      </div>
      </>
      )}
    </div>
  );

  return content;
};

// LT4: Sinfdoshlar reytingi — onboarding_grade bo'yicha (yo'q bo'lsa umumiy).
const ClassmatesLeaderboard = () => {
  const { data, loading } = useApiData(
    () => OlympyApi.getClassmatesLeaderboard(OlympyApi.getToken()),
    [],
  );
  if (loading) {
    return <div className="glass rounded-2xl p-6 text-center text-white/50 text-sm">Yuklanmoqda...</div>;
  }
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return <div className="glass rounded-2xl p-6 text-center text-white/40 text-sm">Sinfdoshlar reytingi hozircha bo'sh</div>;
  }
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-white/5 text-xs text-white/40 font-medium">
        <div className="col-span-1">#</div>
        <div className="col-span-6">O'quvchi</div>
        <div className="col-span-3 text-right">O'rtacha ball</div>
        <div className="col-span-2 text-right">Streak</div>
      </div>
      {(() => {
        const renderRow = (p) => (
          <div
            key={p.user_id}
            className={`olympy-row flex items-center gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3.5 ${p.is_me ? 'bg-indigo-500/15 border-l-2 border-indigo-400' : ''}`}
          >
            <div className="md:col-span-1 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl glass flex items-center justify-center text-sm font-bold text-white/50">
                {p.rank}
              </div>
            </div>
            <div className="md:col-span-6 flex-1 flex items-center gap-2 min-w-0">
              <Avatar name={p.full_name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white truncate">
                  {p.full_name}{p.is_me && <span className="text-indigo-300"> (siz)</span>}
                </div>
              </div>
            </div>
            <div className="md:col-span-3 text-right flex-shrink-0">
              <span className={`text-sm font-black ${p.avg_score >= 90 ? 'text-emerald-400' : p.avg_score >= 75 ? 'text-indigo-400' : 'text-amber-400'}`}>{p.avg_score}</span>
            </div>
            <div className="md:col-span-2 text-right text-xs text-orange-400 font-semibold flex-shrink-0">
              {p.streak ? `🔥 ${p.streak}` : '—'}
            </div>
          </div>
        );
        // 100+ sinfdosh bo'lsa virtual scroll; aks holda oddiy map.
        if (rows.length > 100) {
          return <VirtualList items={rows} itemHeight={68} containerHeight={640} renderItem={renderRow} />;
        }
        return rows.map(renderRow);
      })()}
    </div>
  );
};

Object.assign(window, { LeaderboardPage, mapApiLeaderboard, ClassmatesLeaderboard });
