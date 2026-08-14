// Tarif (pricing) sahifasi — /pricing.
//
// Mavjud billing tizimiga ulanadi: GET /api/billing/plans/ (planlar),
// GET /api/billing/subscription/current/ (joriy obuna — "Joriy plan" badge),
// POST /api/billing/checkout/ (Payme/Click to'lov havolasi).
//
// 3 ta tier (Standart/Plus/Pro) kartasi, o'quvchi/tashkilot toggle, oylik↔yillik
// narx toggle (yillik 20% chegirma sifatida ko'rsatiladi — backendda har muddat
// alohida plan yozuvi). Telegram WebView'da og'ir effekt yo'q (loyiha qoidasi):
// backdrop-blur/animatsiya ishlatmaymiz.
//
// ─── Dizayn: "Imtihon byulleteni" ─────────────────────────────────────────────
// Narx bo'limi — bu O'QILADIGAN MATN emas, SKANER qilinadigan taqqoslash.
// Shundan kelib chiqib:
//
//   · Uchala kartada narxdan yuqoridagi hamma narsa qat'iy balandlikda
//     ("Tavsiya etilgan" qatori bo'sh bo'lsa ham joyini egallaydi) — shunda
//     raqamlar uchala ustunda BIR SATHDA turadi va ko'z ular bo'ylab tik
//     yuguradi.
//   · Raqamlar `font-data` (tabular-nums) bilan — "1 200 000" va "990 000"
//     bir xil kenglikdagi raqamlardan iborat bo'ladi.
//   · Tavsiya etilgan tarif gradient/glow bilan emas, akcent chegara + yuqori
//     chetdagi 3px shtamp chizig'i bilan ajratiladi.
//
// Sahifa theme-ready: qattiq yozilgan fon/matn ranglari yo'q, hammasi
// semantik tokenlar orqali (`bg-ground`, `text-text-primary`, `border-edge`).
// Yagona istisno — to'lov provayderlarining brend ranglari (pastdagi izohga
// qarang): ular mavzuga bog'liq emas.

// Tier nomidan asosiy belgini ajratamiz ("Plus (3 oy)" -> "Plus").
const _pricingTierName = (name) => (name || '').split('(')[0].trim();

// Backenddan kelgan planlardan faqat tashqi (tanlangan) plan_type va
// (oylik=30 / yillik=365) muddatdagilarni guruhlash uchun tier kaliti.
const _tierKey = (name) => {
  const low = (name || '').toLowerCase();
  if (low.includes('standart') || low.includes('standard')) return 'standart';
  if (low.includes('plus')) return 'plus';
  if (low.includes('pro')) return 'pro';
  return 'other';
};

const TIER_ORDER = { standart: 0, plus: 1, pro: 2, other: 3 };

// Karta sarlavhalari (foydalanuvchiga ko'rinadigan brend nomlari).
const TIER_LABELS = {
  standart: "Boshlang'ich",
  plus: 'Professional',
  pro: 'Enterprise',
};

// `ru-RU` guruh ajratkichi sifatida uzilmas probel (U+00A0) qaytaradi, ba'zi
// muhitlarda esa tor uzilmas probel (U+202F). Ikkalasini ham U+00A0 ga
// keltiramiz: narx qator oxirida "1 200" / "000" bo'lib ikkiga bo'linmasin.
// (Avvalgi `.replace(/ /g, ' ')` oddiy probelni oddiy probelga almashtirardi —
// ya'ni hech narsa qilmasdi.)
const _fmtNum = (n) => (Number(n) || 0).toLocaleString('ru-RU').replace(/[\s\u202F]/g, '\u00A0');
const _fmtUZS = (n) => `${_fmtNum(n)} so'm`;

const PricingPage = ({ onNavigate, user, onUserUpdate }) => {
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [planType, setPlanType] = React.useState('student'); // 'student' | 'organization'
  const [billingCycle, setBillingCycle] = React.useState('monthly'); // 'monthly' | 'yearly'
  const [current, setCurrent] = React.useState(null); // joriy obuna (plan nomi)
  const [paymentPlan, setPaymentPlan] = React.useState(null); // modal uchun tanlangan plan
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState('');
  // Planlarni yuklashda xato — foydalanuvchiga ko'rsatiladi (avval catch bo'sh
  // edi va xato jimgina yutilardi: foydalanuvchi "tariflar mavjud emas" deb
  // o'ylab qolardi). null = xato yo'q.
  const [loadError, setLoadError] = React.useState('');

  const isLoggedIn = !!(user && (user.id || user.phone));
  // To'lov tasdiqlash polling'i (shared.jsx'dagi umumiy hook) — to'lov havolasi
  // ochilgach backend webhook'i obunani faollashtirishini kutadi.
  const payPolling = usePaymentPolling();

  // Planlarni yuklash.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await OlympyApi.getSubscriptionPlans();
        if (cancelled) return;
        setPlans(Array.isArray(data) ? data : []);
        setLoadError('');
      } catch (err) {
        if (!cancelled) {
          setPlans([]);
          setLoadError(
            OlympyApi.toUserMessage?.(err) ||
            "Tariflarni yuklab bo'lmadi. Internetni tekshirib, sahifani yangilang.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Joriy obunani yuklash/yangilash — "Joriy plan" badge'i uchun. Birinchi
  // renderda (useEffect) va to'lov tasdiqlangach (polling success) chaqiriladi.
  const refreshCurrent = React.useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const token = OlympyApi.getToken();
      const res = await OlympyApi.getCurrentSubscription(token);
      setCurrent(res || null);
    } catch {
      setCurrent(null);
    }
  }, [isLoggedIn]);

  // Joriy obuna (faqat login bo'lganda).
  React.useEffect(() => { refreshCurrent(); }, [refreshCurrent]);

  const durationDays = billingCycle === 'yearly' ? 365 : 30;

  // Tanlangan plan_type + muddat bo'yicha tier kartalarini quramiz.
  const cards = React.useMemo(() => {
    const filtered = plans.filter(
      (p) => p.plan_type === planType && p.duration_days === durationDays,
    );
    const byTier = {};
    for (const p of filtered) {
      const key = _tierKey(p.name);
      if (!byTier[key]) byTier[key] = p;
    }
    return Object.entries(byTier)
      .map(([key, p]) => ({ key, plan: p }))
      .sort((a, b) => (TIER_ORDER[a.key] ?? 9) - (TIER_ORDER[b.key] ?? 9));
  }, [plans, planType, durationDays]);

  // Yillik chegirmani ko'rsatish: shu tier oylik narxi ×12 ga nisbatan.
  const monthlyEquivalent = React.useCallback((tierKey) => {
    const m = plans.find(
      (p) => p.plan_type === planType && p.duration_days === 30 && _tierKey(p.name) === tierKey,
    );
    return m ? Number(m.price) || 0 : 0;
  }, [plans, planType]);

  const isCurrentPlan = (plan) => {
    if (!current || !current.plan_name) return false;
    return _pricingTierName(current.plan_name) === _pricingTierName(plan.name)
      && current.plan_name === plan.name;
  };

  const handleChoose = (plan) => {
    if (!isLoggedIn) {
      // To'lov uchun avtorizatsiya kerak — ro'yxatdan o'tishga yo'naltiramiz.
      onNavigate('register');
      return;
    }
    setPayError('');
    setPaymentPlan(plan);
  };

  const handleCreatePayment = async (provider) => {
    if (!paymentPlan) return;
    setPaying(true);
    setPayError('');
    try {
      const token = OlympyApi.getToken();
      const res = await OlympyApi.createCheckoutSession(
        { plan_id: paymentPlan.id, provider },
        token,
      );
      if (res && res.payment_url) {
        openExternalLink(res.payment_url);
        // To'lov sahifasi ochildi — backend webhook'i obunani faollashtirishini
        // polling orqali kutamiz (modal "tekshirilmoqda" holatiga o'tadi).
        payPolling.start(async () => {
          // Premium faollashdi. user state'ini yangilaymiz: avval optimistik
          // is_premium=true, keyin serverdan to'liq /me ni olib keshga yozamiz
          // (boshqa premium maydonlar ham sinxron bo'lsin).
          if (onUserUpdate) onUserUpdate({ isPremium: true, is_premium: true });
          try {
            const token2 = OlympyApi.getToken();
            const me = await OlympyApi.getMe(token2);
            if (me) {
              const next = OlympyApi.mapBackendUser(me);
              try { OlympyApi.saveAuth({ token: token2, user: next }); } catch {}
              if (onUserUpdate) onUserUpdate(next);
            }
          } catch {}
          // "Joriy plan" badge'i ham yangi obunani ko'rsatsin.
          refreshCurrent();
        });
      } else {
        throw new Error("To'lov havolasini olishda xatolik yuz berdi");
      }
    } catch (err) {
      const payMsg = OlympyApi.toUserMessage?.(err) || "To'lov havolasini generatsiya qilib bo'lmadi";
      setPayError(payMsg);
      // AI yordamni FAQAT haqiqiy nosozlikda ochamiz: server ichki xatosi (5xx)
      // yoki status yo'q (tarmoq uzilishi / kutilmagan javob — api.js'da ham
      // status 0 shunday qaraladi). 4xx (validatsiya/ruxsat/biznes qoidasi —
      // masalan plan topilmadi yoki obuna allaqachon bor) oddiy holatlar:
      // yuqoridagi `setPayError` xabari yetarli, widjetni ochmaymiz.
      if (!err?.status || err.status >= 500) {
        try {
          window.dispatchEvent(new CustomEvent('olympy:support_needed', {
            detail: { reason: 'payment_error', message: payMsg },
          }));
        } catch {}
      }
    } finally {
      setPaying(false);
    }
  };

  // To'lov muvaffaqiyatli tasdiqlangach modalni 2 soniyadan keyin avtomatik
  // yopamiz (foydalanuvchi "muvaffaqiyatli" xabarini ko'rib ulguradi).
  React.useEffect(() => {
    if (payPolling.status !== 'success') return;
    const t = setTimeout(() => {
      setPaymentPlan(null);
      setPayError('');
      payPolling.reset();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payPolling.status]);

  // Modal yopish — polling holatini ham tozalaymiz.
  const closePaymentModal = () => {
    setPaymentPlan(null);
    setPayError('');
    payPolling.reset();
  };

  return (
    <div className="min-h-screen bg-ground text-text-primary">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-edge bg-ground/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 lg:px-6">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center rounded-lg"
            aria-label="Bosh sahifaga qaytish"
          >
            {/* Avval ⚡ emoji + matn edi. Emoji brend belgisi sifatida
                ishlatilmaydi — o'rniga umumiy wordmark (akcent nuqta + Olympy). */}
            <BrandLogo variant="wordmark" size="xs" />
          </button>
          {/* Mavzu tugmasi header'da — landing navbar'idagi kabi harakat
              tugmalaridan chapda. Ilgari u app.jsx dan suzuvchi boshqaruv
              sifatida chizilardi; endi har bir theme-ready sahifa uni o'z
              sarlavhasida ko'rsatadi. */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isLoggedIn ? (
              <button
                onClick={() => onNavigate(roleHomePage ? roleHomePage(user) : 'student')}
                className="btn-ghost rounded-lg px-4 py-2 text-xs font-bold"
              >
                Kabinet
              </button>
            ) : (
              <>
                <button onClick={() => onNavigate('login')} className="btn-ghost rounded-lg px-4 py-2 text-xs font-bold">
                  Kirish
                </button>
                <button onClick={() => onNavigate('register')} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold">
                  Ro'yxatdan o'tish
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 lg:px-6 lg:py-14">
        {/* Sarlavha */}
        <div className="text-center">
          {/* Sarlavha ustidagi yorliq — `text-accent` EMAS: 11px shtamp qizili
              qog'oz fonda 4.34:1 beradi (AA uchun 4.5 kerak). Urg'uni rang
              emas, harflar oralig'i va katta harf ko'taradi. */}
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-primary">
            Tariflar
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold text-balance md:text-4xl">
            O'zingizga mos tarifni tanlang
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-text-secondary">
            O'quvchilar uchun individual rejalar yoki ta'lim markazlari uchun to'liq boshqaruv.
            Istalgan vaqtda yangilash mumkin.
          </p>
        </div>

        {/* Ikki tanlov ham bir xil segment boshqaruvi: avval yillik uchun
            iOS uslubidagi dumaloq "switch" bor edi — u SaaS ilova belgisi va
            yonidagi segmentga umuman o'xshamasdi. Endi ikkalasi bir juft
            bo'lib turadi, holat faqat fon va chegara bilan ko'rsatiladi. */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="inline-flex rounded-lg border border-edge bg-surface-1 p-1">
            {[
              { key: 'student', label: "O'quvchi" },
              { key: 'organization', label: 'Tashkilot' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={planType === t.key}
                onClick={() => setPlanType(t.key)}
                className={`rounded-md border px-5 py-2 text-xs font-bold transition-colors ${
                  planType === t.key
                    ? 'border-edge-strong bg-surface-2 text-text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Oylik / Yillik (yillik -20%) */}
          <div className="flex items-center gap-2.5">
            <div className="inline-flex rounded-lg border border-edge bg-surface-1 p-1">
              {[
                { key: 'monthly', label: 'Oylik' },
                { key: 'yearly', label: 'Yillik' },
              ].map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={billingCycle === c.key}
                  onClick={() => setBillingCycle(c.key)}
                  className={`rounded-md border px-5 py-2 text-xs font-bold transition-colors ${
                    billingCycle === c.key
                      ? 'border-edge-strong bg-surface-2 text-text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <span className="font-data rounded border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
              -20%
            </span>
          </div>
        </div>

        {/* Kartalar */}
        {loading ? (
          <div className="mt-12 text-center text-sm text-text-secondary">Tariflar yuklanmoqda...</div>
        ) : loadError ? (
          <div className="mt-12 text-center">
            <div className="inline-block rounded-lg border border-error/40 bg-error/10 px-5 py-4 text-sm font-bold text-error">
              {loadError}
            </div>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-12 text-center text-sm text-text-secondary">
            Bu turdagi tariflar hozircha mavjud emas.
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {cards.map(({ key, plan }) => {
              const popular = !!plan.is_popular;
              const current = isCurrentPlan(plan);
              const features = Array.isArray(plan.features) ? plan.features : [];
              const priceNum = Number(plan.price) || 0;
              // Yillik tanlangan bo'lsa, oyiga tushadigan narxni ham ko'rsatamiz.
              const perMonth = billingCycle === 'yearly' ? Math.round(priceNum / 12) : null;
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col overflow-hidden rounded-xl border bg-surface-1 p-6 ${
                    popular ? 'border-accent' : 'border-edge'
                  }`}
                >
                  {/* Tavsiya etilgan tarif belgisi: gradient/soya emas, yuqori
                      chetdagi shtamp chizig'i (karta `overflow-hidden`, shuning
                      uchun chiziq burchak radiusiga kesiladi). */}
                  {popular && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-accent" />}

                  {/* Qat'iy balandlikdagi qator — bo'sh bo'lsa ham joyini
                      egallaydi, shunda uchala kartada narx bir sathda turadi. */}
                  <div className="flex h-6 items-center justify-between gap-2">
                    {/* Matn `text-accent` emas (10px da dark mavzuda 4.23:1) —
                        tavsiyani yuqoridagi shtamp chizig'i va akcent chegara
                        ko'rsatadi, yorliq esa oddiy siyoh rangida. */}
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-primary">
                      {popular ? 'Tavsiya etilgan' : ''}
                    </span>
                    {current && <span className="chip badge-approved">Joriy plan</span>}
                  </div>

                  <div className="font-display mt-1 text-lg font-bold uppercase tracking-wide text-text-primary">
                    {TIER_LABELS[key] || _pricingTierName(plan.name)}
                  </div>

                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-data text-3xl font-bold text-text-primary">{_fmtNum(priceNum)}</span>
                    <span className="text-sm font-bold text-text-secondary">so'm</span>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {billingCycle === 'yearly' ? 'yiliga' : 'oyiga'}
                    {perMonth != null && (
                      <span className="font-data"> · ≈ {_fmtNum(perMonth)} so'm/oy</span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-3 text-xs leading-relaxed text-text-secondary">{plan.description}</p>
                  )}

                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-edge pt-5">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-text-primary">
                        <Icon name="check" size={14} className="mt-px flex-shrink-0 text-accent" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Joriy tarifda tugma `disabled` — `.btn-primary:disabled`
                      o'zi neytral yuzaga o'tadi (surface-2 + edge + ikkilamchi
                      matn), shuning uchun alohida "current" ko'rinishi shart emas. */}
                  <button
                    type="button"
                    disabled={current}
                    onClick={() => handleChoose(plan)}
                    className={`mt-6 w-full rounded-lg py-3 text-sm font-bold ${
                      popular || current ? 'btn-primary' : 'btn-ghost'
                    }`}
                  >
                    {current ? 'Joriy tarifingiz' : 'Tanlash'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mx-auto mt-10 max-w-lg text-balance text-center text-xs leading-relaxed text-text-secondary">
          To'lov Payme yoki Click orqali xavfsiz amalga oshiriladi. Savollar bo'lsa qo'llab-quvvatlash bilan bog'laning.
        </p>
      </main>

      {/* To'lov provayderini tanlash modali */}
      {paymentPlan && (
        // `.overlay` + `.modal` — umumiy Modal komponenti ishlatadigan juftlik:
        // fon token orqali (qog'ozda ham, siyohda ham to'g'ri), mobil ekranda
        // esa modal pastdan chiqadigan varaqqa (bottom sheet) aylanadi.
        // Fon bosilganda YOPILMAYDI: to'lov oqimida tasodifiy yopilish
        // foydalanuvchini "to'ladimi yoki yo'qmi" holatida qoldiradi.
        <div className="overlay">
          <div className="modal">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-text-primary">To'lov usulini tanlang</h2>
                <div className="mt-1 text-xs font-bold text-text-secondary">
                  {_pricingTierName(paymentPlan.name)} — <span className="font-data">{_fmtUZS(paymentPlan.price)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closePaymentModal}
                aria-label="Yopish"
                className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {payError && (
              <div className="mb-4 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-xs font-bold text-error">
                {payError}
                {/* AI yordamni QO'LDA ochish. Yuqoridagi `handleCreatePayment`
                    faqat 5xx/tarmoq xatosida widjetni AVTOMATIK ochadi va u
                    cooldown'ga bo'ysunadi; bu havola esa har qanday xatoda va
                    har doim ishlaydi — to'lov oqimida foydalanuvchini yolg'iz
                    qoldirmaslik eng muhim joy. */}
                <button
                  type="button"
                  onClick={() => OlympyApi.openSupportChat?.('payment_error', payError)}
                  className="ml-2 underline underline-offset-2 hover:opacity-80 cursor-pointer"
                >
                  Yordam kerakmi?
                </button>
              </div>
            )}

            {payPolling.status === 'success' ? (
              // Premium faollashdi — 2 soniyadan keyin modal avtomatik yopiladi.
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success">
                  <Icon name="check" size={26} />
                </div>
                <div>
                  <p className="text-balance text-base font-bold text-text-primary">
                    Tabriklaymiz! Siz {_pricingTierName(paymentPlan.name)} tarifiga o'tdingiz.
                  </p>
                  <p className="mt-1.5 text-balance text-xs leading-relaxed text-text-secondary">
                    Obunangiz faollashtirildi. Endi barcha imkoniyatlardan foydalanishingiz mumkin.
                  </p>
                </div>
                <button type="button" onClick={closePaymentModal} className="btn-primary w-full rounded-lg py-3 text-sm font-bold">
                  Yopish
                </button>
              </div>
            ) : payPolling.status === 'timeout' ? (
              // 2 daqiqa o'tdi, hali tasdiqlanmadi.
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-warning/40 bg-warning/10 text-warning">
                  <Icon name="clock" size={26} />
                </div>
                <div>
                  <p className="text-base font-bold text-text-primary">To'lov hali tasdiqlanmadi</p>
                  <p className="mt-1.5 text-balance text-xs leading-relaxed text-text-secondary">
                    Biroz kuting yoki qo'llab-quvvatlash bilan bog'laning. Obunangiz
                    tasdiqlangach sahifani yangilaganingizda faol bo'ladi.
                  </p>
                </div>
                <button type="button" onClick={closePaymentModal} className="btn-primary w-full rounded-lg py-3 text-sm font-bold">
                  Yopish
                </button>
              </div>
            ) : payPolling.status === 'checking' ? (
              // To'lov sahifasi ochildi — tasdiqlanishini kutmoqdamiz.
              // Aylanuvchi ⏳ emoji o'rniga umumiy `Spinner` (border-current):
              // u yagona harakatlanuvchi element va jarayon belgisidir, bezak emas.
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-edge-strong bg-surface-2 text-accent">
                  <Spinner size={24} />
                </div>
                <div>
                  <p className="text-base font-bold text-text-primary">To'lov tekshirilmoqda...</p>
                  <p className="mt-1.5 text-balance text-xs leading-relaxed text-text-secondary">
                    To'lovingiz qabul qilindi. Obunangiz tasdiqlanishini kutmoqdamiz —
                    bu odatda bir necha soniya davom etadi.
                  </p>
                </div>
                <button type="button" onClick={closePaymentModal} className="btn-ghost w-full rounded-lg py-3 text-sm font-bold">
                  Yopish
                </button>
              </div>
            ) : (
              <>
                {/* To'lov provayderlari — yagona joy, qattiq rang ATAYIN
                    qoladi: bu brend identifikatori, mavzu bilan almashmaydi
                    (`.code-block` palitrasi kabi). To'ldirilgan rangli yuzada
                    matn oq/to'q qolishi to'g'ri.
                    Click ko'ki brendning to'qroq tonida (#0072BC): asl #0D9BF5
                    ustida oq matn 2.99:1 berardi — AA (4.5:1) dan past. To'q ton
                    5.1:1 beradi va brend tanilishini saqlaydi. */}
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => handleCreatePayment('payme')}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00CCC0] py-3 text-sm font-bold text-[#003D3A] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {paying ? 'Yuklanmoqda...' : 'Payme orqali to\'lash'}
                  </button>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => handleCreatePayment('click')}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0072BC] py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {paying ? 'Yuklanmoqda...' : 'Click orqali to\'lash'}
                  </button>
                </div>

                <p className="mt-4 text-center text-[11px] text-text-secondary">
                  To'lov tashqi xavfsiz sahifada amalga oshiriladi.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
