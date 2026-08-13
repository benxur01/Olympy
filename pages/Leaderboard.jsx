// pages/Leaderboard.jsx

// Backend leaderboard yozuvi → frontend mos shakl. Backend: { rank,
// attempt_id, user_id, name, center, subject, score, time_spent }.
const mapApiLeaderboard = (entry) => ({
  key: 'api:' + (entry.attempt_id ?? `${entry.user_id}-${entry.rank}`),
  attemptId: entry.attempt_id ?? null,
  // `user_id` avval tashlab ketilardi. U "Sizning o'rningiz" xulosasi uchun
  // kerak: qaysi qator joriy foydalanuvchiniki ekanini faqat shu maydon
  // aytadi (ism bo'yicha solishtirish ismdoshlarda xato natija beradi).
  userId: entry.user_id ?? entry.userId ?? null,
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

// ─── Medal chegarasi ────────────────────────────────────────────────────────
// `--color-medal-1/2/3` tokenlari `tailwind.config.js` da utility sifatida
// e'lon qilinmagan — ular `.leaderboard-gold/silver/bronze` klasslari uchun
// CSS o'zgaruvchisi. Shuning uchun 1/2/3-o'rin chegarasi inline `style` bilan
// beriladi (`app.jsx` dagi `style={{ background: 'rgb(var(--color-ground))' }}`
// naqshi bilan bir xil).
//
// DIQQAT: medal rangi MATNGA berilmaydi. Qog'oz mavzuda oltin `surface-2`
// fonida 3.21:1 — chegara va chiziq uchun yetarli (WCAG 1.4.11 → 3:1), lekin
// matn uchun emas (4.5:1 kerak). Raqamlar `text-text-primary` bilan yoziladi,
// o'rin farqini esa chegara + fon + chap chiziq birgalikda beradi — ya'ni
// signal faqat rangda emas (rang ko'rligi uchun).
const medalBorderStyle = (place) => (place >= 1 && place <= 3
  ? { borderColor: `rgb(var(--color-medal-${place}))` }
  : undefined);

// ─── "Sizning o'rningiz" xulosasi ───────────────────────────────────────────
// Reyting o'qiladigan hujjat emas, skaner qilinadigan jadval: "men
// qayerdaman?" savoliga javob ro'yxatdan OLDIN va undan ajratilgan holda
// turishi kerak. Avval bunday xulosa umuman yo'q edi — foydalanuvchi o'z
// ismini 100 qator ichidan qidirardi.
const RankSummary = ({ rank, total, valueLabel, value, meta }) => (
  <div className="glass rounded-2xl border-l-4 border-l-accent p-4 md:p-5">
    <div className="flex items-center gap-2 mb-2">
      <div className="w-8 h-8 rounded-xl border border-edge bg-surface-2 flex items-center justify-center text-text-secondary flex-shrink-0">
        <Icon name="award" size={16} />
      </div>
      <h3 className="font-display font-bold text-text-primary text-sm md:text-base">Sizning o'rningiz</h3>
    </div>
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-data text-3xl font-bold text-text-primary">{rank}</span>
      <span className="text-sm text-text-secondary">
        -o'rin
        {total ? <> · <span className="font-data">{total}</span> ishtirokchidan</> : null}
      </span>
    </div>
    <div className="mt-2 border-t border-edge pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-text-secondary">
      <span>{valueLabel}: <span className="font-data font-bold text-text-primary">{value}</span></span>
      {meta}
    </div>
  </div>
);

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
      userId: a.userId ?? null,
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
  // O'rin belgisi endi 🥇/🥈/🥉 emoji EMAS: farq `medal-*` tokenlari bilan
  // (chegara + fon + chap chiziq) beriladi, raqam esa `.font-data` bilan.
  const merged = apiEntries
    ? apiEntries.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999))
    : (isApi ? [] : liveEntries)
        .sort((a, b) => b.score - a.score)
        .map((d, i) => ({ ...d, rank: i + 1 }));
  const apiLoading = isApi && apiLbRes.loading && !apiEntries;
  // Server xatosi (tarmoq, 500, token muddati) — "haqiqatan bo'sh" holatdan
  // farqlanadi: aks holda foydalanuvchi xatoni "natijam yo'q" deb tushunadi.
  const apiError = isApi && !apiLbRes.loading && !apiEntries ? apiLbRes.error : null;

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

  // Joriy foydalanuvchining qatori. API rejimida `user_id` (backendId), lokal
  // fallback'da store'dagi id bo'yicha topiladi — ikkalasi ham qatorda
  // `userId` sifatida saqlanadi.
  const myIds = [user?.backendId, user?.id].filter(v => v != null).map(String);
  const me = myIds.length
    ? filtered.find(d => d.userId != null && myIds.includes(String(d.userId)))
    : null;

  const content = (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 animate-in motion-reduce:animate-none">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          {/* Embedded rejimda (StudentDashboard → Natijalarim → Reyting)
              sarlavha va sub-tab allaqachon tashqarida turadi — bu yerda
              takrorlanmaydi. Fon ham takrorlanmaydi: ikkala rejimda sahifa
              o'z foniga ega emas, `ground` ota elementdan keladi. */}
          {!embedded && (
            <h2 className="font-display text-lg md:text-xl font-bold text-text-primary">Reyting jadvali</h2>
          )}
          <p className="text-text-secondary text-sm">{(() => {
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
          <button key={t} onClick={() => setActiveTab(t)} aria-pressed={activeTab === t}
            className={`nav-tab ${activeTab===t?'active':''}`}>
            {t==='all'?'Umumiy':t==='center'?'Tashkilot':t==='subject'?'Fan':'Sinfdoshlar'}
          </button>
        ))}
      </div>

      {/* LT4: Sinfdoshlar reytingi — alohida endpoint (per-user o'rtacha ball). */}
      {activeTab === 'classmates' && <ClassmatesLeaderboard />}

      {activeTab !== 'classmates' && apiLoading && (
        <div className="glass rounded-2xl p-6 text-center text-text-secondary text-sm">Reyting yuklanmoqda...</div>
      )}

      {activeTab !== 'classmates' && !apiLoading && apiError && (
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-error text-sm font-semibold mb-3">
            {OlympyApi.toUserMessage?.(apiError) || "Reytingni yuklab bo'lmadi. Qayta urinib ko'ring."}
          </div>
          <button onClick={() => apiLbRes.reload()} className="btn-ghost text-xs px-4 py-2 rounded-xl">Qayta yuklash</button>
        </div>
      )}

      {activeTab !== 'classmates' && !apiError && !apiLoading && (
      <>
      {/* Xulosa detaldan oldin — foydalanuvchining o'z o'rni ro'yxatdan yuqorida. */}
      {me ? (
        <RankSummary
          rank={me.rank}
          total={filtered.length}
          valueLabel="Ball"
          value={me.score}
          meta={<>
            <span>Vaqt: <span className="font-data text-text-primary">{me.time}</span></span>
            {me.subject && me.subject !== '—' && <span>Fan: <span className="text-text-primary">{me.subject}</span></span>}
          </>}
        />
      ) : isApi && filtered.length > 0 ? (
        <div className="glass rounded-2xl border-l-4 border-l-edge-strong px-4 py-3 text-sm text-text-secondary">
          Bu ro'yxatda sizning natijangiz yo'q — tadbirda qatnashganingizdan keyin o'rningiz shu yerda ko'rinadi.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-text-secondary text-sm">
          {(filterSubject || filterCity || activeTab !== 'all')
            ? "Tanlangan filtrlar bo'yicha natija topilmadi."
            : "Reyting hozircha bo'sh."}
        </div>
      ) : (
      <>
      {/* Top 3 podium — podium tartibi (silver-gold-bronze) saqlanadi, lekin mobile'da kompakt */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3">
        {/* Podium o'rni indeksdan EMAS, `top3` dagi haqiqiy joydan olinadi:
            `filter(Boolean)` bo'sh kataklarni olib tashlab qolganlarini suradi,
            shuning uchun bitta ishtirokchi bo'lganda ([_, g'olib, _] → [g'olib])
            indeks 1 dan 0 ga tushib, 1-o'rin egasi kumush rangda chiqardi. */}
        {[top3[1], top3[0], top3[2]].map((p, slot) => (p ? { p, slot } : null)).filter(Boolean).map(({ p, slot }) => {
          // `place` — podiumdagi o'rin (1/2/3). Medal klassi ham, chip
          // chegarasi ham, yozuv ham SHU qiymatdan keladi: uchalasi hech
          // qachon bir-biridan ajralib qolmaydi.
          const place = slot === 1 ? 1 : slot === 0 ? 2 : 3;
          const isFirst = place === 1;
          const cls = place === 1 ? 'leaderboard-gold' : place === 2 ? 'leaderboard-silver' : 'leaderboard-bronze';
          return (
            <div key={p.key || p.rank} className={`rounded-2xl p-2 md:p-4 text-center card-hover min-w-0 ${cls} ${isFirst ? 'mt-0' : 'mt-3 md:mt-6'}`}>
              {/* O'lcham va og'irlik `.chip` da qat'iy belgilangan (u
                  `@tailwind utilities` dan keyin turadi va bir xil
                  solishtirma og'irlikda yutadi), shuning uchun bu yerda faqat
                  `.chip` o'zi bermaydigan xossalar beriladi. */}
              <div className="flex justify-center mb-1.5">
                <span className="chip border bg-surface-1 text-text-primary font-data"
                  style={medalBorderStyle(place)}>
                  {place}-o'rin
                </span>
              </div>
              {/* Avatar — blok element, shuning uchun ota `text-center` uni
                  markazga qo'ymaydi (avval podium rasmlari chapga yopishib
                  turardi). `flex justify-center` — yagona ishlaydigan usul.
                  `gradient` propi tekis statik yuzaga almashtirildi: Avatar
                  ichida bosh harflar `text-white` — fon ikkala mavzuda ham
                  to'q bo'lishi shart, gradient esa yo'nalish bo'yicha yo'q. */}
              <div className="flex justify-center">
                <Avatar name={p.name} src={p.avatarUrl || ''} size={isFirst?40:32} gradient="bg-pencil-600" premium={!!p.isPremium} />
              </div>
              <div className="text-xs md:text-sm font-bold text-text-primary mt-1.5 md:mt-2 truncate">{p.name.split(' ')[0]}</div>
              {p.isPremium && <div className="mt-1 flex justify-center"><span className="premium-badge premium-badge--sm" title="Premium o'quvchi">Premium</span></div>}
              {/* Medal tinti ustida `text-secondary` qog'oz mavzuda 4.45:1 ga
                  tushadi (AA dan past), shuning uchun bu qator ham `text-primary`.
                  Ierarxiya rang bilan emas — o'lcham va og'irlik bilan beriladi. */}
              <div className="hidden md:block text-xs text-text-primary/90 truncate mb-2">{p.center} · {p.organizationType}</div>
              <div className="text-lg md:text-2xl font-black font-data text-text-primary mt-1 md:mt-0">{p.score}</div>
              <div className="hidden md:block"><SubjectBadge subject={p.subject} /></div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-edge font-display text-xs font-bold uppercase tracking-widest text-text-secondary">
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
          const renderRow = (p) => {
            // `rest` — `filtered` ning 4-o'rindan boshlangan qismi, ya'ni
            // podiumdagi uchta qator bu yerga tushmaydi. Solishtirish
            // havola bo'yicha: `me` aynan `filtered` ichidagi obyekt.
            const isMe = p === me;
            // Chap chiziq HAR QATORDA joy egallaydi (`border-l-2` + shaffof
            // rang) — aks holda faqat belgilangan qator 2px o'ngga suriladi va
            // skaner qilinadigan jadvalda ustunlar tekisligi buziladi.
            return (
            <div key={p.key || p.rank}
              className={`olympy-row flex items-center gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3.5 border-l-2 ${p.isPremium ? 'premium-row' : ''} ${isMe ? 'bg-accent/[0.08] border-l-accent' : 'border-l-transparent'}`}>
              <div className="md:col-span-1 flex-shrink-0">
                <div className="w-8 h-8 rounded-xl border border-edge bg-surface-2 flex items-center justify-center text-sm font-bold font-data text-text-primary">
                  {p.rank}
                </div>
              </div>
              <div className="md:col-span-3 flex-1 flex items-center gap-2 min-w-0">
                <Avatar name={p.name} src={p.avatarUrl || ''} size={32} gradient="bg-pencil-600" premium={!!p.isPremium} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {isMe && <span className="text-accent text-xs font-bold flex-shrink-0">(siz)</span>}
                    {p.isPremium && <span className="premium-badge premium-badge--sm flex-shrink-0" title="Premium o'quvchi">Premium</span>}
                  </div>
                  <div className="text-xs text-text-secondary truncate md:hidden">{p.center}</div>
                </div>
              </div>
              <div className="col-span-3 hidden md:flex items-center">
                <span className="text-sm text-text-secondary truncate">{p.center}</span>
              </div>
              <div className="col-span-2 hidden md:block"><SubjectBadge subject={p.subject} /></div>
              {/* Ball avval uch xil rangda edi (emerald / indigo / amber).
                  Ro'yxat allaqachon ball bo'yicha tartiblangan — rang qo'shimcha
                  ma'lumot bermasdi, faqat jadvalni rang-barang qilardi va
                  `indigo` akcent bilan qorishardi. Endi bitta rang + `font-data`:
                  ustun tik turadi, raqam almashganda sakramaydi. */}
              <div className="md:col-span-1 text-right flex-shrink-0">
                <span className="text-sm font-black font-data text-text-primary">{p.score}</span>
              </div>
              <div className="md:col-span-1 text-right text-xs text-text-secondary font-data flex-shrink-0">{p.time}</div>
              <div className="md:col-span-1 text-right flex-shrink-0">
                {/* Avval bu tugma faqat dekorativ edi — hech narsa qilmasdi.
                    Endi natijani Results sahifasiga olib o'tadi (attemptId
                    bo'lgan qatorlar uchun). */}
                <button
                  onClick={() => p.attemptId && onNavigate && onNavigate('results', { attemptId: p.attemptId })}
                  disabled={!p.attemptId}
                  className="text-text-secondary hover:text-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Natijani ko'rish">
                  <Icon name="eye" size={14} />
                </button>
              </div>
            </div>
            );
          };
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
      </>
      )}
    </div>
  );

  return content;
};

// LT4: Sinfdoshlar reytingi — onboarding_grade bo'yicha (yo'q bo'lsa umumiy).
const ClassmatesLeaderboard = () => {
  const { data, loading, error, reload } = useApiData(
    () => OlympyApi.getClassmatesLeaderboard(OlympyApi.getToken()),
    [],
  );
  if (loading) {
    return <div className="glass rounded-2xl p-6 text-center text-text-secondary text-sm">Yuklanmoqda...</div>;
  }
  // Xato bo'lsa "bo'sh" xabari o'rniga aniq xato + qayta urinish ko'rsatamiz.
  if (error) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <div className="text-error text-sm font-semibold mb-3">
          {OlympyApi.toUserMessage?.(error) || "Sinfdoshlar reytingini yuklab bo'lmadi. Qayta urinib ko'ring."}
        </div>
        <button onClick={() => reload()} className="btn-ghost text-xs px-4 py-2 rounded-xl">Qayta yuklash</button>
      </div>
    );
  }
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return <div className="glass rounded-2xl p-6 text-center text-text-secondary text-sm">Sinfdoshlar reytingi hozircha bo'sh</div>;
  }
  // Bu ro'yxatda podium yo'q, shuning uchun 1/2/3-o'rin farqi qator raqamining
  // medal chegarasi bilan beriladi.
  const meRow = rows.find(r => r.is_me);
  return (
    <div className="space-y-4 md:space-y-6">
      {meRow && (
        <RankSummary
          rank={meRow.rank}
          total={rows.length}
          valueLabel="O'rtacha ball"
          value={meRow.avg_score}
          meta={meRow.streak ? <span>Ketma-ket faollik: <span className="font-data text-text-primary">{meRow.streak}</span> kun</span> : null}
        />
      )}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 border-b border-edge font-display text-xs font-bold uppercase tracking-widest text-text-secondary">
          <div className="col-span-1">#</div>
          <div className="col-span-6">O'quvchi</div>
          <div className="col-span-3 text-right">O'rtacha ball</div>
          <div className="col-span-2 text-right">Faollik</div>
        </div>
        {(() => {
          const renderRow = (p) => (
            <div
              key={p.user_id}
              className={`olympy-row flex items-center gap-2 md:grid md:grid-cols-12 md:gap-2 px-4 py-3.5 border-l-2 ${p.is_me ? 'bg-accent/[0.08] border-l-accent' : 'border-l-transparent'}`}
            >
              <div className="md:col-span-1 flex-shrink-0">
                <div className="w-8 h-8 rounded-xl border border-edge bg-surface-2 flex items-center justify-center text-sm font-bold font-data text-text-primary"
                  style={medalBorderStyle(p.rank)}>
                  {p.rank}
                </div>
              </div>
              <div className="md:col-span-6 flex-1 flex items-center gap-2 min-w-0">
                <Avatar name={p.full_name} size={32} gradient="bg-pencil-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {p.full_name}{p.is_me && <span className="text-accent font-bold"> (siz)</span>}
                  </div>
                </div>
              </div>
              <div className="md:col-span-3 text-right flex-shrink-0">
                <span className="text-sm font-black font-data text-text-primary">{p.avg_score}</span>
              </div>
              {/* 🔥 emoji o'rniga ikonka + raqam: belgi sifatida emoji
                  ishlatilmaydi va `font-data` ustunni tik ushlab turadi. */}
              <div className="md:col-span-2 text-right text-xs text-text-secondary flex-shrink-0">
                {p.streak
                  ? <span className="inline-flex items-center gap-1 justify-end"><Icon name="bolt" size={11} /><span className="font-data">{p.streak}</span> kun</span>
                  : '—'}
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
    </div>
  );
};

Object.assign(window, { LeaderboardPage, mapApiLeaderboard, ClassmatesLeaderboard });
