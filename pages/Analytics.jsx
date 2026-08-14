// pages/Analytics.jsx — Chuqur analitika sahifasi

// ─── Status bandlari ────────────────────────────────────────────────────────
// Avval har qatorda `text-emerald-400 / text-amber-400 / text-rose-400` uchligi
// qattiq yozilgan edi va holat FAQAT rang bilan berilardi. Endi har band o'z
// yozma yorlig'i va chegarali chipi bilan keladi — signal rangda ham, shaklda
// ham bor (rang ko'rligi uchun).
//
// Nomlar `ANALYTICS_`/`analytics` prefiksi bilan: `generate-vite-entry.mjs` har
// faylning top-level nomlarini `var` sifatida umumiy scope'ga chiqaradi, ya'ni
// prefiksiz nom boshqa sahifaning nomini bosib ketishi mumkin.
const ANALYTICS_SCORE_BANDS = [
  { min: 70, label: 'Kuchli', chip: 'border-success/45 text-success', bar: 'rgb(var(--color-success))' },
  { min: 50, label: "O'rta", chip: 'border-warning/45 text-warning', bar: 'rgb(var(--color-warning))' },
  { min: 0, label: 'Zaif', chip: 'border-error/45 text-error', bar: 'rgb(var(--color-error))' },
];
// Savol bankidagi "to'g'rilik" foizi baho emas, o'lchov — shuning uchun
// yorliqlar neytral (Yuqori / O'rta / Past), lekin shkala o'sha status uchligi.
const ANALYTICS_RATE_BANDS = [
  { min: 70, label: 'Yuqori', chip: 'border-success/45 text-success', rule: 'border-l-success' },
  { min: 50, label: "O'rta", chip: 'border-warning/45 text-warning', rule: 'border-l-warning' },
  { min: 0, label: 'Past', chip: 'border-error/45 text-error', rule: 'border-l-error' },
];
const analyticsBand = (bands, v) => bands.find(b => v >= b.min) || bands[bands.length - 1];

// 1/2/3-o'rin belgisi — Leaderboard.jsx / OwnerDashboard.jsx bilan bir xil
// qoida: medal rangi MATNGA berilmaydi (qog'oz mavzuda oltin `surface-2` da
// 3.2:1 — belgi uchun yetadi, matn uchun emas). Farq `.leaderboard-*` yuvish +
// chegara + chap chiziq bilan, raqam esa `text-primary`. Emoji ishlatilmaydi.
const analyticsRankClass = (rank) => (
  rank === 1 ? 'leaderboard-gold' :
  rank === 2 ? 'leaderboard-silver' :
  rank === 3 ? 'leaderboard-bronze' :
  'border border-edge bg-ground'
);

// ─── Oylik trend ustuni ─────────────────────────────────────────────────────
// `shared.jsx` dagi `BarChart` o'rniga shu yerda quriladi (umumiy qatlamga
// tegilmaydi). Sabab dizayn: `BarChart` har ustunga boshqa shaffoflik beradi
// (`opacity: 0.7 + i * 0.05`) — bu MA'LUMOT emas, bezak, ya'ni rang kanalini
// bekorga sarflaydi; ustiga na to'r chizig'i, na o'q, na qiymat yorlig'i bor.
//
// ┌─ Grafik rangi qanday tanlandi ──────────────────────────────────────────┐
// │ Bu BITTA seriya (vaqt bo'yicha o'rtacha ball) — "qaysi seriya?" savoli   │
// │ yo'q, demak kategorik palitra kerak emas. To'g'ri shakl — URG'U          │
// │ (emphasis): o'tgan oylar neytral `text-secondary` da, ENG OXIRGI oy esa  │
// │ `accent` da va qiymat yorlig'i bilan.                                    │
// │                                                                          │
// │ Nega semantik uchlik (`success`/`warning`/`error`) EMAS: ular status     │
// │ uchun band (pastdagi fan kesimi va to'g'rilik foizi aynan shularni       │
// │ ishlatadi). Trend ustuni "yaxshi/yomon" demaydi, shuning uchun u status  │
// │ palitrasidan tashqarida turishi shart — aks holda bitta ekranda yashil   │
// │ ustun ham "seriya", ham "yaxshi" degan ikki xil ma'no berardi.           │
// │                                                                          │
// │ Ikkala tokenning ham yuzadan kontrasti ≥3:1 (WCAG 1.4.11, belgi):        │
// │ `text-secondary` — light 5.13:1 / dark 5.00:1, `accent` — 4.58 / 4.72.   │
// └──────────────────────────────────────────────────────────────────────────┘
const AnalyticsTrendChart = ({ data }) => {
  const PLOT_H = 132;
  const values = data.map(d => Math.max(0, Number(d.value) || 0));
  const max = Math.max(1, ...values);
  // Sof `max` ga bo'lsak eng baland ustun DOIM to'liq bo'lardi (82 va 41 bir
  // xil ko'rinardi); qat'iy 0..100 bo'lsa past ballar yassilanardi. Kelishuv —
  // 25 ga yaxlitlangan yuqori chegara.
  const top = Math.min(100, Math.max(25, Math.ceil(max / 25) * 25));
  const ticks = [top, Math.round(top / 2), 0];
  const lastIdx = data.length - 1;
  const barPct = (v) => Math.max(2, (v / top) * 100);
  return (
    // Yuqoridagi bo'shliq — oxirgi ustunning qiymat yorlig'i uchun joy.
    <div className="flex gap-2 pt-5">
      {/* Y o'qi: uchta daraja yetarli — to'r chiziqlari qolganini o'zi aytadi.
          Yorliq o'z chizig'iga MARKAZLANADI (`translateY(-50%)`), aks holda u
          chiziqdan yarim qator pastda osilib qolardi. */}
      <div className="relative flex-shrink-0 w-6" style={{ height: PLOT_H }}>
        {ticks.map(t => (
          <span
            key={t}
            className="absolute right-0 text-[10px] font-data text-text-secondary leading-none"
            style={{ top: `${(1 - t / top) * 100}%`, transform: 'translateY(-50%)' }}
          >{t}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height: PLOT_H }}>
          {/* Oraliq to'r ATAYIN retsessiv (`edge`, yuzadan ~1.3–1.5:1) — u
              o'lchov yordamchisi, ma'lumot tashuvchi element emas, shuning
              uchun WCAG 1.4.11 ning 3:1 me'yori unga tegishli emas (ma'lumot
              ustun balandligi, o'q yorlig'i va qiymat yorlig'ida).
              Asos chizig'i (0) esa HAQIQIY o'q — u `edge-strong` da 1.5–2.1:1
              bo'lib ko'rinmay ketardi, shuning uchun `text-secondary`
              (light 5.13:1, dark 5.00:1): 1px da ham aniq, ham intizomli. */}
          {ticks.map(t => (
            <div
              key={t}
              className={`absolute left-0 right-0 border-t ${t === 0 ? 'border-text-secondary' : 'border-edge'}`}
              style={{ top: `${(1 - t / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-2 md:gap-3">
            {data.map((d, i) => {
              const v = values[i];
              const isLast = i === lastIdx;
              const h = barPct(v);
              return (
                <div key={`${d.label}-${i}`} className="relative flex-1 min-w-0 h-full flex items-end justify-center">
                  {/* Ingichka belgi: keng kartochkada ustun bloklarga
                      aylanib ketmasin deb kenglik cheklangan. Uchi 4px
                      yumaloq va asos chizig'iga tirab qo'yilgan. */}
                  <div
                    className="w-full rounded-t-md"
                    title={`${d.label}: ${v}`}
                    style={{
                      height: `${h}%`,
                      maxWidth: 44,
                      background: isLast ? 'rgb(var(--color-accent))' : 'rgb(var(--color-text-secondary))',
                    }}
                  />
                  {/* Tanlab qo'yilgan to'g'ridan-to'g'ri yorliq: har ustunga
                      raqam yozilmaydi, faqat urg'u berilgan oxirgi oyga. */}
                  {isLast && (
                    <span
                      className="absolute left-0 right-0 text-center text-[10px] font-data font-bold text-text-primary leading-none"
                      style={{ bottom: `${h}%`, marginBottom: 4 }}
                    >{v}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2 md:gap-3 mt-2">
          {data.map((d, i) => (
            <div
              key={`${d.label}-lbl-${i}`}
              className={`flex-1 min-w-0 text-center text-[10px] truncate ${i === lastIdx ? 'text-text-primary font-bold' : 'text-text-secondary'}`}
            >{d.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

const AnalyticsPage = ({ user, onNavigate }) => {
  const [tab, setTab] = React.useState('student');
  const isApi = !!user?._api;
  const token = isApi ? OlympyApi.getToken() : null;

  // Foydalanuvchi rollarini aniqlash — "Savollar" tab faqat
  // teacher/manager/owner uchun.
  const userRoles = user?.roles || {};
  const isStaff = ['teacher', 'manager', 'owner'].some(r => userRoles[r]?.status === 'approved');
  // Markaz id — savollar tahlili uchun. Avvalo manager, keyin teacher/owner.
  const centerId = (() => {
    for (const role of ['manager', 'owner', 'teacher']) {
      const cid = userRoles[role]?.centerId;
      if (userRoles[role]?.status === 'approved' && cid) return cid;
    }
    return null;
  })();

  // ─── O'quvchi tab data ───────────────────────────────────────────
  const monthlyRes = useApiData(
    () => isApi ? OlympyApi.getMyMonthlyStats(6, token) : Promise.resolve(null),
    [isApi],
  );
  const statsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(token) : Promise.resolve(null),
    [isApi],
  );
  const monthlyChart = React.useMemo(() => {
    const rows = monthlyRes.data?.months;
    if (!Array.isArray(rows)) return [];
    return rows.map(r => ({ label: r.label || `${r.month}-oy`, value: Math.round(r.average_score || 0) }));
  }, [monthlyRes.data]);
  const subjectRows = Array.isArray(statsRes.data?.subjects) ? statsRes.data.subjects : [];

  // ─── Savollar tab data ───────────────────────────────────────────
  const difficultyRes = useApiData(
    () => (isApi && isStaff && centerId)
      ? OlympyApi.getQuestionDifficultyStats(centerId, token)
      : Promise.resolve(null),
    [isApi, isStaff, centerId],
  );

  // ─── Markaz reytingi tab data ────────────────────────────────────
  const [regionFilter, setRegionFilter] = React.useState('');
  const ratingsRes = useApiData(
    () => isApi
      ? OlympyApi.getCenterRatings(regionFilter ? { region: regionFilter, limit: 50 } : { limit: 50 }, token)
      : Promise.resolve([]),
    [isApi, regionFilter],
  );

  // Region select uchun ro'yxat — markazlardan derive qilamiz.
  const allRegions = React.useMemo(() => {
    const set = new Set();
    (ratingsRes.data || []).forEach(r => { if (r.region) set.add(r.region); });
    return Array.from(set).sort();
  }, [ratingsRes.data]);

  // Faol tab pastdan shtamp chizig'i bilan belgilanadi (StudentDashboard
  // `SubTabBar` naqshi). `aria-pressed` — bosiladigan holat ekran o'quvchiga
  // ham yetsin; avval faqat vizual `btn-primary` bor edi.
  const tabBtn = (key, label) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      className={`px-4 py-2 rounded-xl text-sm font-semibold border border-b-2 transition-colors min-h-[40px] ${
        tab === key
          ? 'border-edge-strong border-b-accent bg-surface-2 text-text-primary'
          : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:text-text-primary'
      }`}
    >{label}</button>
  );

  const emptyNote = (text) => <div className="text-xs text-text-secondary">{text}</div>;

  return (
    <div className="min-h-screen" style={{ background: 'rgb(var(--color-ground))' }}>
      {/* Sarlavha qatori — `.glass` EMAS: u hoshiyani `box-shadow: inset` bilan
          to'rt tomondan chizadi va pastdagi `border-b` bilan birga IKKITA
          chiziq beradi. To'liq kenglikdagi qator uchun to'g'ri naqsh (app.jsx
          Leaderboard/Profile sarlavhalari kabi): yuza + faqat pastki chegara. */}
      <div className="bg-surface-1 border-b border-edge px-4 md:px-6 py-3 flex items-center gap-3">
        <button type="button" className="cursor-pointer border-0 bg-transparent p-0" onClick={() => onNavigate(roleHomePage(user))} aria-label="Dashboardga qaytish">
          <BrandLogo size="sm" />
        </button>
        <h1 className="font-display text-text-primary font-bold text-base md:text-lg">Analitika</h1>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => onNavigate(roleHomePage(user))} className="btn-ghost text-xs px-4 py-2 rounded-xl flex items-center gap-1.5">
            <Icon name="arrowLeft" size={13} /> Orqaga
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6 mobile-content-pad">
        {/* Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {tabBtn('student', "O'quvchi")}
          {isStaff && tabBtn('questions', 'Savollar')}
          {tabBtn('centers', 'Markaz reytingi')}
        </div>

        {/* O'quvchi tab */}
        {tab === 'student' && (
          <div className="space-y-4 md:space-y-6">
            {/* Xulosa detaldan OLDIN: avval bu uchlik sahifaning eng pastida
                turardi — foydalanuvchi "umumiy ballim qancha?" javobini
                grafiklardan keyin ko'rardi. Endi u birinchi qator. */}
            {statsRes.data && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Jami urinishlar" value={statsRes.data.total_attempts || 0} icon={<Icon name="bolt" size={20} />} color="bg-surface-2 text-text-secondary" />
                <StatCard label="O'rtacha ball" value={Math.round(statsRes.data.average_score || 0)} icon={<Icon name="chart" size={20} />} color="bg-surface-2 text-text-secondary" />
                <StatCard label="Eng yaxshi o'rin" value={statsRes.data.best_rank ? `#${statsRes.data.best_rank}` : '—'} icon={<Icon name="trophy" size={20} />} color="bg-surface-2 text-text-secondary" />
              </div>
            )}

            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest mb-3">Oylik o'rtacha ball (6 oy)</h3>
              {!isApi && emptyNote("Bu ma'lumot faqat backend rejimida ko'rinadi.")}
              {isApi && monthlyRes.loading && emptyNote('Yuklanmoqda...')}
              {isApi && !monthlyRes.loading && monthlyChart.length === 0 && emptyNote("Hozircha natijalar yo'q.")}
              {monthlyChart.length > 0 && (
                <>
                  {/* Grafikning o'zi ham xulosadan keyin turadi: oxirgi oy va
                      undan oldingisiga nisbatan o'zgarish matn bilan yoziladi,
                      ustunlar esa shu jumlaning isboti. */}
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-text-secondary border-b border-edge pb-3">
                    <span>
                      Oxirgi oy:{' '}
                      <span className="font-data font-bold text-text-primary">{monthlyChart[monthlyChart.length - 1].value}</span>
                    </span>
                    {monthlyChart.length > 1 && (() => {
                      const delta = monthlyChart[monthlyChart.length - 1].value - monthlyChart[monthlyChart.length - 2].value;
                      return (
                        <span className="flex items-center gap-1">
                          O'tgan oyga nisbatan:
                          <span className="font-data font-bold text-text-primary">{delta > 0 ? `+${delta}` : delta}</span>
                        </span>
                      );
                    })()}
                  </div>
                  <AnalyticsTrendChart data={monthlyChart} />
                </>
              )}
            </div>

            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest mb-3">Fanlar bo'yicha natijalar</h3>
              {isApi && statsRes.loading && emptyNote('Yuklanmoqda...')}
              {isApi && !statsRes.loading && subjectRows.length === 0 && emptyNote("Hali fan kesimida natijalar yo'q.")}
              {subjectRows.length > 0 && (
                <div className="space-y-3">
                  {subjectRows.map((r, i) => {
                    const avg = Math.round(r.average_score || 0);
                    // Chiziq rangi status tokenini oladi: fan o'rtachasi "kim"
                    // emas, "qanchalik yaxshi" savoli (dataviz: seriya good/bad
                    // ma'nosini bildirsa — status palitrasi, kategorik emas).
                    const band = analyticsBand(ANALYTICS_SCORE_BANDS, avg);
                    return (
                      <div key={`${r.subject}-${i}`}>
                        <div className="flex justify-between items-center text-xs mb-1 gap-2">
                          <span className="text-text-primary truncate min-w-0">
                            <span className="truncate">{r.subject || '—'}</span>
                            <span className="text-text-secondary whitespace-nowrap"> · <span className="font-data">{r.attempts || 0}</span> ta</span>
                          </span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className={`chip border bg-ground text-[10px] font-bold py-0.5 ${band.chip}`}>{band.label}</span>
                            <span className="font-data font-bold text-text-primary">{avg}%</span>
                          </span>
                        </div>
                        <div className="progress-bar h-2">
                          <div className="progress-fill" style={{ width: `${avg}%`, background: band.bar }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Savollar tab */}
        {tab === 'questions' && isStaff && (
          <div className="space-y-4 md:space-y-6">
            <div className="glass rounded-2xl p-4 md:p-6">
              <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest mb-3">Qiyinlik bo'yicha taqsimot</h3>
              {!centerId && emptyNote('Markaz topilmadi.')}
              {isApi && difficultyRes.loading && emptyNote('Yuklanmoqda...')}
              {isApi && !difficultyRes.loading && centerId && difficultyRes.data && (
                <>
                  <div className="mb-4 border-b border-edge pb-3 text-sm text-text-secondary">
                    Jami savollar: <span className="font-data font-bold text-text-primary">{difficultyRes.data.total_questions}</span>
                  </div>
                  <div className="space-y-3">
                    {(difficultyRes.data.by_difficulty || []).map((d, i) => {
                      const pct = difficultyRes.data.total_questions
                        ? Math.round((d.count / difficultyRes.data.total_questions) * 100)
                        : 0;
                      const rate = Math.round(d.avg_correct_rate || 0);
                      const band = analyticsBand(ANALYTICS_RATE_BANDS, rate);
                      return (
                        // Chap chiziq TO'G'RILIK bandini ko'rsatadi (chip bilan
                        // bir xil signal, uchinchi kanal sifatida). Avval u
                        // uchala kartada bir xil `accent` edi — ya'ni hech
                        // narsa demasdi va faqat bezak bo'lib qolardi.
                        <div key={i} className={`rounded-2xl bg-ground border border-edge border-l-4 p-3 md:p-4 ${band.rule}`}>
                          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-text-primary font-semibold">{d.label}</span>
                              <span className="chip border border-edge bg-surface-1 text-text-secondary text-[10px]"><span className="font-data">{d.count}</span> ta</span>
                            </div>
                            <span className="flex items-center gap-2">
                              <span className={`chip border bg-surface-1 text-[10px] font-bold py-0.5 ${band.chip}`}>{band.label}</span>
                              <span className="text-xs font-bold text-text-primary">To'g'rilik: <span className="font-data">{rate}%</span></span>
                            </span>
                          </div>
                          {/* Chiziq bankdagi ULUSHNI ko'rsatadi (miqdor, holat
                              emas) — shuning uchun status rangi emas, `accent`. */}
                          <div className="progress-bar h-2 mb-2">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text-secondary">
                            <span><span className="font-data">{pct}%</span> bankdan</span>
                            <span><span className="font-data">{rate}%</span> to'g'ri javob</span>
                          </div>
                        </div>
                      );
                    })}
                    {(difficultyRes.data.by_difficulty || []).length === 0 && emptyNote('Savollar topilmadi.')}
                  </div>
                </>
              )}
              {difficultyRes.error && (
                <div className="rounded-xl border border-error/45 border-l-4 border-l-error bg-ground px-3 py-2 text-xs text-error">
                  Yuklab bo'lmadi: {String(difficultyRes.error?.message || '')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Markaz reytingi tab */}
        {tab === 'centers' && (
          <div className="space-y-4 md:space-y-6">
            <div className="glass rounded-2xl p-4 md:p-6">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest">Markazlar reytingi</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* `input-field` — `select.input-field option` qoidasi
                      (src/index.css) faqat shu klassga bog'langan, ya'ni
                      ochilgan ro'yxat foni ham mavzu yuzasini oladi.
                      Avval `glass` + `bg-transparent` edi: qog'oz mavzuda
                      variantlar oq-ustiga-oq bo'lib ketardi. */}
                  <select
                    value={regionFilter}
                    onChange={e => setRegionFilter(e.target.value)}
                    aria-label="Viloyat bo'yicha filtr"
                    className="input-field py-2 px-3 text-xs w-full sm:w-auto"
                  >
                    <option value="">Barcha viloyatlar</option>
                    {allRegions.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {isApi && ratingsRes.loading && emptyNote('Yuklanmoqda...')}
              {isApi && !ratingsRes.loading && (ratingsRes.data || []).length === 0 && emptyNote("Reyting bo'sh.")}
              {(ratingsRes.data || []).length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="admin-table-hdr">
                      <tr className="font-display text-[10px] tracking-widest">
                        <th className="py-2.5 px-3">O'rin</th>
                        <th className="py-2.5 px-3">Markaz</th>
                        <th className="py-2.5 px-3 hidden md:table-cell">Shahar</th>
                        <th className="py-2.5 px-3">O'rt. ball</th>
                        <th className="py-2.5 px-3 hidden md:table-cell">Urinishlar</th>
                        <th className="py-2.5 px-3">Reyting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ratingsRes.data || []).map(r => (
                        <tr key={r.center_id} className="olympy-row">
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-data text-xs font-bold text-text-primary ${analyticsRankClass(r.rank)}`}>{r.rank}</span>
                          </td>
                          <td className="py-2.5 px-3 text-text-primary font-medium">{r.center_name}</td>
                          <td className="py-2.5 px-3 text-text-secondary hidden md:table-cell">{r.city || r.region || '—'}</td>
                          <td className="py-2.5 px-3 font-data text-text-primary font-bold">{r.average_score}</td>
                          <td className="py-2.5 px-3 font-data text-text-secondary hidden md:table-cell">{r.total_attempts}</td>
                          <td className="py-2.5 px-3 text-text-primary font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <Icon name="star" size={12} className="text-warning" />
                              <span className="font-data">{r.rating?.toFixed ? r.rating.toFixed(1) : r.rating}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { AnalyticsPage });
