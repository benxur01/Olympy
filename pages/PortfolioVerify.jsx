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
//
// ─── Dizayn: "Imtihon byulleteni" ─────────────────────────────────────────────
// `CertificateVerify.jsx` bilan bir xil qoidalar bo'yicha (o'sha yerdagi izohga
// qarang): auth'siz, begona odam ochadigan sahifa; natija halqasi HAQIQIY
// `border` bo'lgani uchun `glass` alias'i ishlatilmaydi.
//
// Halqa rangi ATAYIN sertifikat sahifasidagi bilan bir xil (`success`) —
// avvalgi binafsha (violet) faqat bezak edi. Ikkala public sahifada bitta
// ma'no bitta rangda: "tekshirildi va haqiqiy".
//
// Halqa to'liq token kuchida (tint emas) — sabab CertificateVerify.jsx da.

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-ground p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between gap-3">
          {/* Brend logosi — bosilsa bosh sahifaga. */}
          <button type="button" onClick={goHome} className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0" aria-label="Bosh sahifa">
            <BrandLogo size="lg" />
          </button>
          <ThemeToggle className="flex-shrink-0" />
        </div>

        {state.loading && (
          <div className="rounded-2xl border border-edge bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-edge border-t-accent" />
            <div className="text-sm text-text-secondary">Portfolio tekshirilmoqda...</div>
          </div>
        )}

        {!state.loading && valid && (
          <div className="rounded-2xl border border-success bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-success bg-surface-2 text-success">
              <Icon name="check" size={32} />
            </div>
            <div className="chip badge-approved mb-1">
              <Icon name="shield" size={13} /> Haqiqiy portfolio
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-text-primary">{state.data.student_name || 'Foydalanuvchi'}</h1>
            <p className="mt-1 text-sm text-text-secondary">Barcha vaqt yutuqlari</p>

            {/* Uchta raqamli ustun — `font-data` (tabular-nums) bo'lmasa
                qiymatlar almashganda ustun kengligi sakraydi. */}
            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-edge bg-surface-2 px-3 py-3">
                <div className="font-data text-lg font-bold text-text-primary">{state.data.total_olympiads ?? 0}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">Olimpiada</div>
              </div>
              <div className="rounded-xl border border-edge bg-surface-2 px-3 py-3">
                <div className="font-data text-lg font-bold text-accent-2">{state.data.avg_score ?? 0}%</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">O'rtacha</div>
              </div>
              <div className="rounded-xl border border-edge bg-surface-2 px-3 py-3">
                <div className="font-data text-lg font-bold text-success">{state.data.best_score ?? 0}%</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">Eng yaxshi</div>
              </div>
            </div>

            {topSubjects.length > 0 && (
              <div className="mt-4 space-y-2 text-left">
                <div className="text-xs font-bold uppercase tracking-wide text-text-secondary">Kuchli fanlar</div>
                {topSubjects.map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-edge bg-surface-2 px-4 py-2.5">
                    <span className="truncate pr-3 text-sm font-bold text-text-primary">{s.subject}</span>
                    <span className="font-data text-sm font-bold text-accent-2">{s.pct}%</span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={goHome} className="btn-primary mt-6 w-full rounded-xl py-3 text-sm font-semibold">
              Olympy'ga o'tish
            </button>
          </div>
        )}

        {!state.loading && !valid && (
          <div className="rounded-2xl border border-error bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-error bg-surface-2 text-error">
              <Icon name="x" size={32} />
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary">Portfolio topilmadi</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Bu havola noto'g'ri yoki portfolio o'chirilgan.
            </p>
            <button type="button" onClick={goHome} className="btn-ghost mt-6 w-full rounded-xl py-3 text-sm font-semibold">
              Bosh sahifaga qaytish
            </button>
          </div>
        )}

        <div className="mt-6 text-center text-xs text-text-secondary">
          Olympy — Online Olimpiada Platformasi
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PortfolioVerifyPage });
