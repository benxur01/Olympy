// Tarif (pricing) sahifasi — /pricing.
//
// Mavjud billing tizimiga ulanadi: GET /api/billing/plans/ (planlar),
// GET /api/billing/subscription/current/ (joriy obuna — "Joriy plan" badge),
// POST /api/billing/checkout/ (Payme/Click to'lov havolasi).
//
// 3 ta tier (Standart/Plus/Pro) kartasi, o'quvchi/tashkilot toggle, oylik↔yillik
// narx toggle (yillik 20% chegirma sifatida ko'rsatiladi — backendda har muddat
// alohida plan yozuvi). Telegram WebView'da og'ir effekt yo'q (loyiha qoidasi):
// backdrop-blur/animatsiya ishlatmaymiz, oddiy glass kartalar.

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

const _fmtUZS = (n) => `${(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;

const PricingPage = ({ onNavigate, user }) => {
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

  // Joriy obuna (faqat login bo'lganda) — "Joriy plan" badge'i uchun.
  React.useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const token = OlympyApi.getToken();
        const res = await OlympyApi.getCurrentSubscription(token);
        if (!cancelled) setCurrent(res || null);
      } catch {
        if (!cancelled) setCurrent(null);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

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
      } else {
        throw new Error("To'lov havolasini olishda xatolik yuz berdi");
      }
    } catch (err) {
      setPayError(OlympyApi.toUserMessage?.(err) || "To'lov havolasini generatsiya qilib bo'lmadi");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen text-white" style={{ background: '#050508' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#050508]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 lg:px-6">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2 text-sm font-black text-white"
          >
            <span className="text-lg">⚡</span> Olympy
          </button>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <button
                onClick={() => onNavigate(roleHomePage ? roleHomePage(user) : 'student')}
                className="btn-ghost rounded-xl px-4 py-2 text-xs font-bold"
              >
                Kabinet
              </button>
            ) : (
              <>
                <button onClick={() => onNavigate('login')} className="btn-ghost rounded-xl px-4 py-2 text-xs font-bold">
                  Kirish
                </button>
                <button onClick={() => onNavigate('register')} className="btn-primary rounded-xl px-4 py-2 text-xs font-black">
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
          <span className="inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-300">
            Tariflar
          </span>
          <h1 className="mt-4 text-3xl font-black md:text-4xl">O'zingizga mos tarifni tanlang</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/50">
            O'quvchilar uchun individual rejalar yoki ta'lim markazlari uchun to'liq boshqaruv.
            Istalgan vaqtda yangilash mumkin.
          </p>
        </div>

        {/* O'quvchi / Tashkilot toggle */}
        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
            {[
              { key: 'student', label: "O'quvchi" },
              { key: 'organization', label: 'Tashkilot' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setPlanType(t.key)}
                className={`rounded-xl px-5 py-2 text-xs font-black transition-colors ${
                  planType === t.key ? 'bg-white text-indigo-950' : 'text-white/60 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Oylik / Yillik toggle (yillik -20%) */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <span className={`text-xs font-bold ${billingCycle === 'monthly' ? 'text-white' : 'text-white/40'}`}>
            Oylik
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingCycle === 'yearly'}
            onClick={() => setBillingCycle((c) => (c === 'yearly' ? 'monthly' : 'yearly'))}
            className={`relative h-7 w-13 rounded-full border transition-colors ${
              billingCycle === 'yearly' ? 'border-indigo-500 bg-indigo-600' : 'border-white/20 bg-white/10'
            }`}
            style={{ width: '52px' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
              style={{ left: billingCycle === 'yearly' ? '28px' : '3px' }}
            />
          </button>
          <span className={`text-xs font-bold ${billingCycle === 'yearly' ? 'text-white' : 'text-white/40'}`}>
            Yillik
          </span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
            -20%
          </span>
        </div>

        {/* Kartalar */}
        {loading ? (
          <div className="mt-12 text-center text-sm text-white/40">Tariflar yuklanmoqda...</div>
        ) : loadError ? (
          <div className="mt-12 text-center">
            <div className="inline-block rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
              {loadError}
            </div>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-12 text-center text-sm text-white/40">
            Bu turdagi tariflar hozircha mavjud emas.
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
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
                  className={`relative flex flex-col rounded-3xl border p-6 ${
                    popular
                      ? 'border-indigo-500/50 bg-gradient-to-b from-indigo-500/10 to-transparent shadow-[0_16px_40px_rgba(99,102,241,0.12)]'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                      Mashhur
                    </span>
                  )}
                  {current && (
                    <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                      Joriy plan
                    </span>
                  )}

                  <div className="text-sm font-black uppercase tracking-wider text-white/50">
                    {TIER_LABELS[key] || _pricingTierName(plan.name)}
                  </div>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-3xl font-black text-white">{_fmtUZS(priceNum)}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/40">
                    {billingCycle === 'yearly' ? 'yiliga' : 'oyiga'}
                    {perMonth != null && (
                      <span className="ml-1 text-white/30">(≈ {_fmtUZS(perMonth)}/oy)</span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-3 text-xs text-white/50">{plan.description}</p>
                  )}

                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-white/5 pt-5">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                        <span className="mt-0.5 text-indigo-400 font-black">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    disabled={current}
                    onClick={() => handleChoose(plan)}
                    className={`mt-6 w-full rounded-xl py-3 text-sm font-black transition-colors ${
                      current
                        ? 'cursor-default bg-white/5 text-white/40'
                        : popular
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {current ? 'Joriy tarifingiz' : 'Tanlash'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-white/30">
          To'lov Payme yoki Click orqali xavfsiz amalga oshiriladi. Savollar bo'lsa qo'llab-quvvatlash bilan bog'laning.
        </p>
      </main>

      {/* To'lov provayderini tanlash modali */}
      {paymentPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal w-full max-w-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-white">To'lov usulini tanlang</h2>
                <div className="mt-1 text-xs font-bold text-white/50">
                  {_pricingTierName(paymentPlan.name)} — {_fmtUZS(paymentPlan.price)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setPaymentPlan(null); setPayError(''); }}
                className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {payError && (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
                {payError}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                disabled={paying}
                onClick={() => handleCreatePayment('payme')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00ccc0] py-3 text-sm font-black text-[#003d3a] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {paying ? 'Yuklanmoqda...' : 'Payme orqali to\'lash'}
              </button>
              <button
                type="button"
                disabled={paying}
                onClick={() => handleCreatePayment('click')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0d9bf5] py-3 text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {paying ? 'Yuklanmoqda...' : 'Click orqali to\'lash'}
              </button>
            </div>

            <p className="mt-4 text-center text-[11px] text-white/30">
              To'lov tashqi xavfsiz sahifada amalga oshiriladi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
