// pages/PortfolioVerify.jsx — Yutuqlar portfoliosi haqiqiyligini tekshirish (PUBLIC).
//
// Feature #5 (Pro). Portfolio PDF'idagi QR/URL (prolymp.uz/portfolio/verify/<uuid>)
// ochilganda ko'rsatiladi. Auth TALAB QILINMAYDI — backend endpoint AllowAny.
// Komponent App'dan tashqarida (app.jsx top-level router'ida) render qilinadi,
// shuning uchun JWT restore oqimi umuman ishga tushmaydi va login talab qilinmaydi.
//
// URL'dan UUID ajratiladi: /portfolio/verify/<uuid>[/]. Backend topsa
// {valid:true, student_name, total_olympiads, avg_score, best_score, top_subjects},
// topmasa {valid:false, reason:'not_found'} 404 (ApiError.data orqali o'qiladi).

const PortfolioVerifyPage = ({ uuid }) => {
  const [state, setState] = React.useState({ loading: true, data: null, error: false });

  React.useEffect(() => {
    let cancelled = false;
    if (!uuid) {
      setState({ loading: false, data: null, error: true });
      return undefined;
    }
    OlympyApi.verifyPortfolio(uuid)
      .then(data => {
        if (cancelled) return;
        setState({ loading: false, data, error: false });
      })
      .catch(err => {
        if (cancelled) return;
        // 404 → {valid:false, reason}. Tarmoq/noma'lum xato → "topilmadi".
        const data = err?.data && typeof err.data === 'object'
          ? err.data
          : { valid: false, reason: 'not_found' };
        setState({ loading: false, data, error: false });
      });
    return () => { cancelled = true; };
  }, [uuid]);

  const goHome = () => {
    try { window.location.href = '/'; } catch {}
  };

  const valid = !!state.data?.valid;
  const topSubjects = Array.isArray(state.data?.top_subjects) ? state.data.top_subjects : [];

  return (
    <div className="dark min-h-screen flex flex-col items-center justify-center p-4" style={{ background: '#050508' }}>
      <div className="w-full max-w-md">
        {/* Brend logosi — bosilsa bosh sahifaga. */}
        <button type="button" onClick={goHome} className="mx-auto mb-6 flex cursor-pointer items-center justify-center border-0 bg-transparent p-0" aria-label="Bosh sahifa">
          <BrandLogo size="lg" />
        </button>

        {state.loading && (
          <div className="glass-strong rounded-3xl border border-white/8 p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <div className="text-sm font-semibold text-white/60">Portfolio tekshirilmoqda...</div>
          </div>
        )}

        {!state.loading && valid && (
          <div className="glass-strong rounded-3xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/20">
              <Icon name="check" size={32} />
            </div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-300">
              <Icon name="shield" size={13} /> Haqiqiy portfolio
            </div>
            <h1 className="mt-3 text-2xl font-black text-white">{state.data.student_name || 'Foydalanuvchi'}</h1>
            <p className="mt-1 text-sm font-semibold text-white/55">Barcha vaqt yutuqlari</p>

            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl glass px-3 py-3">
                <div className="text-lg font-black text-white">{state.data.total_olympiads ?? 0}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-white/40">Olimpiada</div>
              </div>
              <div className="rounded-xl glass px-3 py-3">
                <div className="text-lg font-black text-violet-300">{state.data.avg_score ?? 0}%</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-white/40">O'rtacha</div>
              </div>
              <div className="rounded-xl glass px-3 py-3">
                <div className="text-lg font-black text-emerald-300">{state.data.best_score ?? 0}%</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-white/40">Eng yaxshi</div>
              </div>
            </div>

            {topSubjects.length > 0 && (
              <div className="mt-4 space-y-2 text-left">
                <div className="text-xs font-bold uppercase tracking-wide text-white/40">Kuchli fanlar</div>
                {topSubjects.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl glass px-4 py-2.5">
                    <span className="truncate pr-3 text-sm font-bold text-white">{s.subject}</span>
                    <span className="text-sm font-black text-violet-300">{s.pct}%</span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={goHome} className="btn-primary mt-6 w-full rounded-xl py-3 text-sm font-black">
              Olympy'ga o'tish
            </button>
          </div>
        )}

        {!state.loading && !valid && (
          <div className="glass-strong rounded-3xl border border-rose-500/25 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-white">
              <Icon name="x" size={32} />
            </div>
            <h1 className="text-xl font-black text-white">Portfolio topilmadi</h1>
            <p className="mt-2 text-sm font-medium text-white/55">
              Bu havola noto'g'ri yoki portfolio o'chirilgan.
            </p>
            <button type="button" onClick={goHome} className="btn-ghost mt-6 w-full rounded-xl py-3 text-sm font-black">
              Bosh sahifaga qaytish
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-xs font-semibold text-white/30">
          Olympy — Online Olimpiada Platformasi
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PortfolioVerifyPage });
