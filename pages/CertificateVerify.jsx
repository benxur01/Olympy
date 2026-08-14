// pages/CertificateVerify.jsx — Sertifikat haqiqiyligini tekshirish (PUBLIC).
//
// Feature #5. Sertifikatdagi URL (prolymp.uz/certificates/verify/<uuid>) ochilganda
// ko'rsatiladi. Auth TALAB QILINMAYDI — backend endpoint AllowAny. Komponent
// App'dan tashqarida (app.jsx top-level router'ida) render qilinadi, shuning uchun
// JWT restore oqimi umuman ishga tushmaydi va login talab qilinmaydi.
//
// URL'dan UUID ajratiladi: /certificates/verify/<uuid>[/]. Backend topsa
// {valid:true, student_name, olympiad_name, score, date, center_name},
// topmasa {valid:false} 404 (ApiError.data orqali o'qiladi).
//
// ─── Dizayn: "Imtihon byulleteni" ─────────────────────────────────────────────
// Bu sahifani BEGONA odam ochadi (ish beruvchi, boshqa maktab, ota-ona) va
// ko'pincha bu mahsulot bilan birinchi uchrashuv bo'ladi. Shu sababli ko'rinish
// rasmiy hujjat tekshiruvi kabi: bitta varaq, bitta natija halqasi, bezak yo'q.
//
// Natija halqasi (`success` / `warning` / `error`) HAQIQIY `border` bo'lishi
// shart, shuning uchun `glass`/`glass-strong` alias'i ATAYIN ishlatilmadi:
// u hoshiyasini `box-shadow: inset` bilan chizadi va ustiga qo'yilgan
// `border-*` utility'si IKKINCHI halqa bo'lib chiqadi (`src/index.css` dagi
// izohga qarang). Yuza tokenlardan ochiq yig'ildi: `bg-surface-1 border ...`.
//
// Uch xil yakun uch xil tokenda: haqiqiy → `success`, "1-o'rin emas" → `warning`
// (bu xato emas, shunchaki sertifikat berilmagan), buzilgan havola → `error`.

const CertificateVerifyPage = ({ uuid }) => {
  const [state, setState] = React.useState({ loading: true, data: null, error: false });

  React.useEffect(() => {
    let cancelled = false;
    if (!uuid) {
      setState({ loading: false, data: null, error: true });
      return undefined;
    }
    OlympyApi.verifyCertificate(uuid)
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
  // Yaroqsiz holatda backend `reason` orqali sababni ajratadi:
  //   not_awarded → natija 1-o'rinni egallamagan;
  //   not_found (yoki noma'lum) → havola noto'g'ri / o'chirilgan.
  const notAwarded = !valid && state.data?.reason === 'not_awarded';
  const invalidTitle = notAwarded ? 'Sertifikat berilmagan' : 'Sertifikat topilmadi';
  const invalidMessage = notAwarded
    ? "Bu natija 1-o'rinni egallamagan."
    : "Bu havola noto'g'ri yoki sertifikat o'chirilgan.";
  // Klass nomlari TO'LIQ yozilgan: Tailwind manbani matn sifatida skanerlaydi,
  // `border-${tone}` kabi yig'ilgan nom bundle'ga umuman tushmaydi.
  //
  // Halqa `/45` tintida EMAS, to'liq kuchda: `.badge-*` da tint yetarli, chunki
  // u yerda holatni MATN aytadi; bu yerda esa halqa — sahifaning asosiy
  // "hujjat haqiqiymi" belgisi. O'lchov: tint 1.87–2.07:1 (WCAG 1.4.11 uchun
  // 3:1 kerak), to'liq token esa 4.4–5.6:1.
  const invalidRing = notAwarded ? 'border-warning' : 'border-error';
  const invalidMark = notAwarded ? 'border-warning text-warning' : 'border-error text-error';

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
            <div className="text-sm text-text-secondary">Sertifikat tekshirilmoqda...</div>
          </div>
        )}

        {!state.loading && valid && (
          <div className="rounded-2xl border border-success bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-success bg-surface-2 text-success">
              <Icon name="check" size={32} />
            </div>
            <div className="chip badge-approved mb-1">
              <Icon name="shield" size={13} /> Haqiqiy sertifikat
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-text-primary">{state.data.student_name || 'Foydalanuvchi'}</h1>
            <p className="mt-1 text-sm text-text-secondary">{state.data.olympiad_name || ''}</p>

            {/* Hujjat qatorlari — imtihon varaqasidagi maydonlar kabi:
                chapda belgi, o'ngda qiymat, raqamlar `font-data` da. */}
            <div className="mt-6 space-y-2 text-left">
              <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-2 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Natija</span>
                <span className="font-data text-base font-bold text-text-primary">{state.data.score != null ? `${state.data.score} ball` : '—'}</span>
              </div>
              {state.data.center_name ? (
                <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-2 px-4 py-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Tashkilot</span>
                  <span className="truncate pl-3 text-sm font-bold text-text-primary">{state.data.center_name}</span>
                </div>
              ) : null}
              {state.data.date ? (
                <div className="flex items-center justify-between rounded-xl border border-edge bg-surface-2 px-4 py-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Sana</span>
                  <span className="font-data text-sm font-bold text-text-primary">{state.data.date}</span>
                </div>
              ) : null}
            </div>

            <button type="button" onClick={goHome} className="btn-primary mt-6 w-full rounded-xl py-3 text-sm font-semibold">
              Olympy'ga o'tish
            </button>
          </div>
        )}

        {!state.loading && !valid && (
          <div className={`rounded-2xl border bg-surface-1 p-8 text-center ${invalidRing}`}>
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border bg-surface-2 ${invalidMark}`}>
              <Icon name="x" size={32} />
            </div>
            <h1 className="font-display text-xl font-bold text-text-primary">{invalidTitle}</h1>
            <p className="mt-2 text-sm text-text-secondary">
              {invalidMessage}
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

Object.assign(window, { CertificateVerifyPage });
