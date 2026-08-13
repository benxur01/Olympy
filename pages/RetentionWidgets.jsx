// pages/RetentionWidgets.jsx
// Retention funksiyalari uchun mustaqil widget komponentlari.
// Har biri o'z ma'lumotini useApiData orqali yuklaydi va backend bo'sh javob
// qaytarsa o'zini ko'rsatmaydi (null render). StudentDashboard / Profile /
// Leaderboard sahifalariga joylashtiriladi.
// Telegram WebView uchun backdrop-blur va og'ir animatsiyalar ishlatilmaydi.

const _retToken = () => globalThis.OlympyApi?.getToken?.();

// ─── DH3. Streak himoyasi eslatmasi (sariq banner) ───────────────────────────
const StreakWarningBanner = ({ onNavigate, user }) => {
  // user o'zgarsa (logout/login) ma'lumot qayta yuklansin — komponent
  // unmount bo'lmaydi, shuning uchun dep array'ga user identifikatorini qo'shamiz.
  const { data } = useApiData(() => OlympyApi.getStreakWarning(_retToken()), [user?.id, user?.backendId]);
  if (!data || (data.streak_count || 0) <= 3) return null;

  if (!data.warning) return null;

  return (
    // Ogohlantirish: jiddiylik chap chetdagi chiziq + ikonka bilan kodlanadi,
    // faqat rang bilan emas.
    <div className="glass rounded-2xl p-4 border-l-4 border-l-warning flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-warning flex-shrink-0"><Icon name="info" size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-warning"><span className="font-data">{data.streak_count}</span> kunlik seriya xavf ostida</div>
          <div className="text-xs text-text-secondary mt-0.5">{data.message} Uni premium bilan butunlay himoyalashni xohlaysizmi?</div>
        </div>
      </div>
      {onNavigate && (
        <button
          onClick={() => onNavigate('premium')}
          className="btn-primary text-xs px-3.5 py-1.5 rounded-xl font-bold flex-shrink-0"
        >
          Muzlatish
        </button>
      )}
    </div>
  );
};

// ─── DH1. Bugungi savollar (countdown + 3 ta savol) ──────────────────────────
const DAILY_Q_FEEDBACK_MS = 2500;
const DAILY_Q_FADE_MS = 300;
const DailyQuestionsWidget = ({ user }) => {
  const { data, loading, reload } = useApiData(() => OlympyApi.getDailyQuestions(_retToken()), [user?.id, user?.backendId]);
  const [timeLeft, setTimeLeft] = React.useState('');
  const [answering, setAnswering] = React.useState(null);
  // Javob berilgan savol ro'yxatda qolmaydi. Faqat shu sessiyada javob
  // berilganlari qisqa vaqt natijasi bilan turadi: feedback map'da 'show' →
  // 'fade' → o'chirish. Ilgari javob berilganlari map'da yo'q, shuning uchun
  // birinchi render'dayoq ko'rinmaydi (natija chaqnab ketmaydi).
  const [feedback, setFeedback] = React.useState(() => new Map());
  // Javobi serverga yozilgan, ammo reload() hali tasdiqlamagan savollar —
  // sanoq faqat yangi ma'lumot kelganda boshlanadi.
  const pendingRef = React.useRef(new Set());
  const timersRef = React.useRef([]);

  // Countdown 23:59 gacha.
  React.useEffect(() => {
    if (!data?.ends_at) return;
    const tick = () => {
      const diff = new Date(data.ends_at).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('00:00:00'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [data?.ends_at]);

  // Yangi ma'lumot kelganda: shu sessiyada javob berilgan savolning natijasi
  // 2.5s ko'rinadi, so'ng ro'yxatdan yo'qoladi.
  React.useEffect(() => {
    (data?.questions || []).forEach(q => {
      if (!q.answered || !pendingRef.current.has(q.id)) return;
      pendingRef.current.delete(q.id);
      timersRef.current.push(setTimeout(() => {
        setFeedback(prev => new Map(prev).set(q.id, 'fade'));
        timersRef.current.push(setTimeout(() => {
          setFeedback(prev => {
            const next = new Map(prev);
            next.delete(q.id);
            return next;
          });
        }, DAILY_Q_FADE_MS));
      }, DAILY_Q_FEEDBACK_MS));
    });
  }, [data]);

  React.useEffect(() => () => timersRef.current.forEach(t => clearTimeout(t)), []);

  const handleAnswer = async (dq, idx) => {
    if (dq.answered || answering != null) return;
    setAnswering(dq.id);
    try {
      await OlympyApi.answerDailyQuestion(dq.id, idx, _retToken());
      setFeedback(prev => new Map(prev).set(dq.id, 'show'));
      pendingRef.current.add(dq.id);
      reload();
    } catch (e) {
      // jim — keyingi urinishda qayta yuklanadi
    } finally {
      setAnswering(null);
    }
  };

  if (loading) return null;
  const questions = data?.questions || [];
  const isVisible = (q) => !q.answered || feedback.has(q.id);
  if (!questions.some(isVisible)) return null;

  const answeredCount = questions.filter(q => q.answered).length;

  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-display font-bold text-text-primary text-sm md:text-base flex items-center gap-2 uppercase tracking-widest">
          Bugungi savollar
          <span className="text-xs font-data font-semibold text-text-secondary normal-case tracking-normal">{answeredCount}/{questions.length}</span>
        </h3>
        {/* Taymer `font-data` da — soniya almashganda kenglik sakramaydi. */}
        <div className="flex items-center gap-1.5 text-xs font-data font-bold text-text-primary border border-edge bg-surface-2 px-2.5 py-1 rounded-lg">
          <Icon name="clock" size={12} /> {timeLeft}
        </div>
      </div>
      <div className="space-y-3">
        {questions.map((dq, qi) => !isVisible(dq) ? null : (
          <div key={dq.id} className={`rounded-xl border border-edge p-3 transition-opacity duration-300 ${feedback.get(dq.id) === 'fade' ? 'opacity-0' : 'opacity-100'}`}>
            <div className="text-sm font-semibold text-text-primary mb-2 flex items-start gap-1.5">
              <span className="font-data text-text-secondary">{qi + 1}.</span>
              <MathText className="flex-1" text={dq.text} />
              {dq.answered && (
                <span className={dq.is_correct ? 'text-success' : 'text-error'}>
                  <Icon name={dq.is_correct ? 'check' : 'x'} size={16} />
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {(dq.options || []).map((opt, idx) => {
                let cls = 'btn-ghost';
                if (dq.answered) {
                  if (idx === dq.correct_answer) cls = 'border border-success bg-success/10 text-text-primary font-medium';
                  else if (idx === dq.selected_option) cls = 'border border-error bg-error/10 text-text-primary font-medium';
                  else cls = 'opacity-50 btn-ghost';
                }
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={dq.answered || answering != null}
                    onClick={() => handleAnswer(dq, idx)}
                    className={`text-left rounded-lg px-3 py-2 text-xs transition-colors ${cls}`}
                  >
                    <MathText text={opt} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── F4. Streak + Kunlik maqsad (gamifikatsiya) ──────────────────────────────
// Yuqorida streak kartochkasi (ketma-ket kunlar) va 7 kunlik rekord banneri,
// pastda bugungi kunlik maqsad progress bari. Maqsad belgilanmagan bo'lsa
// (target=0) 1/3/5/10 savol tanlash tugmalari ko'rsatiladi.
const DAILY_GOAL_OPTIONS = [1, 3, 5, 10];
const DailyGoalWidget = ({ streakCount = 0, user }) => {
  const { data, loading, reload } = useApiData(() => OlympyApi.getDailyGoal(_retToken()), [user?.id, user?.backendId]);
  const [saving, setSaving] = React.useState(false);

  const setGoal = async (n) => {
    if (saving) return;
    setSaving(true);
    try {
      await OlympyApi.setDailyGoal(n, _retToken());
      reload();
    } catch (e) {
      // jim — keyingi yuklashda holat tiklanadi
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const target = data?.target_questions || 0;
  const completed = data?.completed_questions || 0;
  const isAchieved = !!data?.is_achieved;
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
  const hasStreak = (streakCount || 0) > 0;
  const recordReached = (streakCount || 0) >= 7;

  return (
    <div className="space-y-3">
      {/* Streak kartochkasi — har doim ko'rsatiladi (0 bo'lsa motivatsion matn). */}
      <div className={`glass rounded-2xl p-4 md:p-5 ${recordReached ? 'border-l-4 border-l-success' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-text-secondary flex-shrink-0"><Icon name="bolt" size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text-primary">
              {hasStreak
                ? <>Ketma-ket <span className="font-data">{streakCount}</span> kun</>
                : 'Bugun mashq qilib seriyani boshlang'}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              {hasStreak
                ? 'Har kuni faol bo\'lib seriyangizni uzaytiring.'
                : 'Har kungi faollik bonus tanga va reyting beradi.'}
            </div>
          </div>
        </div>
        {recordReached && (
          <div className="mt-3 rounded-xl border border-success px-3 py-2 text-xs font-bold text-success flex items-center gap-2">
            <Icon name="award" size={14} /> 7 kunlik rekord — <span className="font-data">+50</span> coin
          </div>
        )}
      </div>

      {/* Kunlik maqsad */}
      <div className="glass rounded-2xl p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest">Kunlik maqsad</h3>
          {target > 0 && (
            <span className={`chip text-[11px] font-data ${isAchieved ? 'badge-approved' : 'badge-draft'}`}>
              {completed}/{target} savol
            </span>
          )}
        </div>
        {target > 0 ? (
          <>
            <div className="progress-bar h-2.5 w-full">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              {isAchieved
                ? <span className="text-success font-semibold inline-flex items-center gap-1"><Icon name="check" size={12} /> Bugungi maqsad bajarildi.</span>
                : <>Bugun yana <span className="font-data text-text-primary font-semibold">{data?.remaining || 0}</span> ta savol yeching.</>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-text-secondary font-medium mr-1">Maqsadni o'zgartirish:</span>
              {DAILY_GOAL_OPTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={saving}
                  aria-pressed={n === target}
                  onClick={() => setGoal(n)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-data font-bold transition-colors disabled:opacity-50 ${n === target ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:text-text-primary'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="text-xs text-text-secondary">Bugungi maqsadingizni belgilang — har kuni nechta savol yechasiz?</div>
            <div className="flex flex-wrap gap-2">
              {DAILY_GOAL_OPTIONS.map(n => (
                <button
                  key={n}
                  type="button"
                  disabled={saving}
                  onClick={() => setGoal(n)}
                  className="rounded-xl border border-edge bg-surface-1 px-4 py-2 text-sm font-data font-bold text-text-primary hover:border-edge-strong hover:bg-surface-2 transition-colors disabled:opacity-50"
                >
                  {n} savol
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── F7. Referral — do'stni taklif qilish ────────────────────────────────────
// O'z referral kodi + nusxalash tugmasi, taklif qilinganlar soni va ixtiyoriy
// kod kiritish (boshqa do'st kodini ishlatib ikkalasiga 50 coin). Profile yoki
// StudentDashboard'ga joylashtiriladi.
const ReferralWidget = ({ user }) => {
  const { data, loading, reload } = useApiData(() => OlympyApi.getReferral(_retToken()), [user?.id, user?.backendId]);
  const [copied, setCopied] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState({ type: '', text: '' });

  const handleCopy = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard?.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // clipboard ruxsati yo'q — jim
    }
  };

  const handleUse = async (e) => {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code || submitting) return;
    setSubmitting(true);
    setMsg({ type: '', text: '' });
    try {
      const res = await OlympyApi.useReferral(code, _retToken());
      setMsg({ type: 'ok', text: res?.detail || "Tabriklaymiz! Bonus tanga qo'shildi" });
      setCodeInput('');
      reload();
    } catch (err) {
      setMsg({ type: 'err', text: OlympyApi.toUserMessage?.(err) || "Kodni ishlatib bo'lmadi" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !data) return null;

  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="font-display font-bold text-text-primary text-sm md:text-base mb-1 uppercase tracking-widest">Do'stni taklif qiling</h3>
      <p className="text-xs text-text-secondary mb-3">Kodingizni do'stingizga yuboring — u kodni ishlatsa, ikkalangiz ham 50 coin olasiz.</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-xl border border-edge bg-surface-2 px-3 py-2.5 font-mono text-base font-bold tracking-widest text-text-primary text-center select-all">
          {data.code}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="btn-ghost flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold"
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'Nusxalandi' : 'Nusxalash'}
        </button>
      </div>

      <div className="mt-3 text-xs text-text-secondary">
        Siz <span className="font-data text-text-primary font-bold">{data.invited_count || 0}</span> ta do'st taklif qildingiz.
      </div>

      {/* Ixtiyoriy: do'st kodini kiritish. */}
      <form onSubmit={handleUse} className="mt-4 border-t border-edge pt-3">
        <label className="block text-[11px] font-bold uppercase tracking-widest text-text-secondary mb-1.5">Do'stingiz kodi bormi?</label>
        <div className="flex items-center gap-2">
          <input
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            placeholder="Kodni kiriting"
            maxLength={12}
            className="input-field flex-1 font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={submitting || !codeInput.trim()}
            className="btn-primary rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-50"
          >
            {submitting ? '...' : 'Tasdiqlash'}
          </button>
        </div>
        {msg.text && (
          <div className={`mt-2 text-xs font-semibold ${msg.type === 'ok' ? 'text-success' : 'text-error'}`}>
            {msg.text}
          </div>
        )}
      </form>
    </div>
  );
};

// ─── DH2. Raqib harakati ─────────────────────────────────────────────────────
const RivalActivityWidget = ({ user }) => {
  const { data, loading } = useApiData(() => OlympyApi.getRivalActivity(_retToken()), [user?.id, user?.backendId]);
  if (loading) return null;
  const rivals = Array.isArray(data) ? data : [];
  if (!rivals.length) return null;
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="font-display font-bold text-text-primary text-sm md:text-base mb-3 uppercase tracking-widest">Raqiblar</h3>
      <div className="space-y-2">
        {rivals.map(r => (
          <div key={r.rival_id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${r.rival_is_premium ? 'premium-row border-transparent' : 'border-edge'}`}>
            {/* `gradient` propi tekis statik yuzaga almashtirildi: Avatar ichida
                matn `text-text-primary` — fon ikkala mavzuda ham to'q bo'lishi shart. */}
            <Avatar
              name={r.rival_name}
              src={OlympyApi.makeAssetUrl ? OlympyApi.makeAssetUrl(r.rival_avatar_url || '') : (r.rival_avatar_url || '')}
              size={34}
              gradient="bg-pencil-600"
              premium={!!r.rival_is_premium}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate flex items-center gap-1.5">
                <span className="truncate">{r.rival_name}</span>
                {r.rival_is_premium && <span className="premium-badge premium-badge--sm flex-shrink-0" title="Premium o'quvchi">Premium</span>}
              </div>
              <div className="text-xs text-text-secondary truncate">{r.message}</div>
            </div>
            <div className="text-right flex-shrink-0 font-data">
              <div className={`text-xs font-bold ${r.rival_score_change > 0 ? 'text-success' : 'text-text-secondary'}`}>
                {r.rival_score_change > 0 ? `+${r.rival_score_change}` : '0'}
              </div>
              <div className="text-[10px] text-text-secondary">siz +{r.my_score_change}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── DH4b. Haftalik musobaqa tarixi (Standart+ tarif) ────────────────────────
// O'tgan yakunlangan haftalardagi o'rin/ball tarixi + o'rin trendi (▲/▼/▬).
// Gating StudentDashboard darajasida (canStandart) — bu karta faqat ruxsat
// berilgan foydalanuvchiga render qilinadi.
const WeeklyContestHistoryCard = ({ user }) => {
  const { data, loading } = useApiData(() => OlympyApi.getWeeklyContestHistory(_retToken()), [user?.id, user?.backendId]);
  if (loading) return null;
  const weeks = Array.isArray(data) ? data : [];
  // Faqat foydalanuvchi qatnashgan (my_entry bor) haftalarni ko'rsatamiz.
  const rows = weeks.filter(w => w.my_entry && w.my_entry.rank != null);
  if (!rows.length) return null;
  const trendIcon = (t) => t === 'up' ? '▲' : t === 'down' ? '▼' : t === 'flat' ? '▬' : '';
  const trendColor = (t) => t === 'up' ? 'text-success' : t === 'down' ? 'text-error' : 'text-text-secondary';
  const trendTitle = (t) => t === 'up' ? "O'rin yaxshilandi" : t === 'down' ? "O'rin pasaydi" : t === 'flat' ? "O'rin o'zgarmadi" : '';
  const fmtWeek = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d ? d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' }) : '';
  };
  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <h3 className="font-display font-bold text-text-primary text-sm md:text-base mb-3 uppercase tracking-widest">
        Musobaqa tarixi
      </h3>
      {/* Jadval: ustunlar `font-data` — o'rin va ball raqamlari tekis turadi. */}
      <div className="space-y-1.5">
        {rows.map(w => {
          const me = w.my_entry;
          return (
            <div key={w.week_start} className="flex items-center gap-3 rounded-xl border border-edge px-3 py-2">
              <div className="flex-1 min-w-0 text-xs font-data text-text-secondary truncate">
                {fmtWeek(w.week_start)} – {fmtWeek(w.week_end)}
              </div>
              <div className={`w-4 text-center text-xs font-bold flex-shrink-0 ${trendColor(me.trend)}`} title={trendTitle(me.trend)}>{trendIcon(me.trend)}</div>
              <div className="w-9 text-right text-sm font-data font-bold text-text-primary flex-shrink-0">#{me.rank}</div>
              <div className="w-12 text-right text-sm font-data font-bold text-text-secondary flex-shrink-0">{me.score}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── O3 (premium). Shaxsiy AI test generatori (Plus+) ────────────────────────
// Foydalanuvchi fan/mavzu/qiyinlikni tanlaydi, "Generatsiya" bosilganda backend
// Gemini orqali 10 ta ko'p tanlovli savol qaytaradi (saqlanmaydi). Inline quiz:
// baholash client-side, correct_answer indeksi bo'yicha ranglash va yakuniy
// natija (n/10). Plus gate frontend'da (canPlus)
// — bu yerda 403 kelsa ham xushmuomala xabar chiqadi.
const CUSTOM_TEST_DIFFICULTIES = [
  { value: 'easy', label: 'Oson' },
  { value: 'medium', label: "O'rta" },
  { value: 'hard', label: 'Qiyin' },
];
const CustomTestBuilderCard = () => {
  const [subject, setSubject] = React.useState('');
  const [topic, setTopic] = React.useState('');
  const [difficulty, setDifficulty] = React.useState('medium');
  const [questions, setQuestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [answers, setAnswers] = React.useState({});   // {savolIndeks: variantIndeks}
  const [submitted, setSubmitted] = React.useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (loading || !subject.trim() || !topic.trim()) return;
    setLoading(true);
    setError('');
    setQuestions([]);
    setAnswers({});
    setSubmitted(false);
    try {
      const res = await OlympyApi.generateCustomTest(
        { subject: subject.trim(), topic: topic.trim(), difficulty },
        _retToken(),
      );
      setQuestions(Array.isArray(res?.questions) ? res.questions : []);
    } catch (err) {
      setError(OlympyApi.toUserMessage?.(err) || "Testni yaratib bo'lmadi. Keyinroq urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((_, i) => answers[i] != null);
  const correctCount = questions.reduce(
    (n, q, i) => n + (answers[i] === q.correct_answer ? 1 : 0), 0,
  );
  const optClass = (qi, oi, correctIdx) => {
    if (!submitted) {
      return answers[qi] === oi
        ? 'border-accent bg-accent/10 text-text-primary'
        : 'border-edge bg-surface-1 text-text-secondary hover:border-edge-strong hover:text-text-primary';
    }
    if (oi === correctIdx) return 'border-success bg-success/10 text-text-primary font-medium';
    if (answers[qi] === oi) return 'border-error bg-error/10 text-text-primary font-medium';
    return 'border-edge bg-surface-1 text-text-secondary';
  };

  return (
    <div className="glass rounded-2xl p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl border border-edge bg-surface-2 flex items-center justify-center text-text-secondary flex-shrink-0">
          <Icon name="sparkles" size={16} />
        </div>
        <div>
          <h3 className="font-display font-bold text-text-primary text-sm md:text-base leading-none">Shaxsiy AI test</h3>
          <span className="text-[11px] text-text-secondary mt-1 block">Fan va mavzuni tanlang — 10 ta savol</span>
        </div>
      </div>

      <form onSubmit={handleGenerate} className="space-y-2.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Fan (masalan Matematika)"
            maxLength={80}
            className="input-field"
          />
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Mavzu (masalan Kvadrat tenglamalar)"
            maxLength={300}
            className="input-field"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value)}
            className="input-field flex-1"
          >
            {CUSTOM_TEST_DIFFICULTIES.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading || !subject.trim() || !topic.trim()}
            className="btn-primary text-xs px-4 py-2.5 rounded-xl font-semibold min-h-[40px] disabled:opacity-50 flex-shrink-0"
          >
            {loading ? 'Tayyorlanmoqda...' : 'Generatsiya'}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 text-xs text-warning">{error}</p>
      )}

      {questions.length > 0 && (
        <>
          <div className="space-y-4 mt-4">
            {questions.map((q, qi) => {
              const options = Array.isArray(q.options) ? q.options : [];
              const chosen = answers[qi];
              const isCorrect = submitted && chosen === q.correct_answer;
              return (
                <div key={qi} className="rounded-xl border border-edge p-3">
                  <div className="text-xs md:text-sm text-text-primary font-medium mb-2 leading-relaxed">
                    <span className="font-data font-bold text-text-secondary">{qi + 1}.</span> {q.text}
                  </div>
                  <div className="space-y-1.5">
                    {options.map((opt, oi) => (
                      <button
                        key={oi}
                        type="button"
                        disabled={submitted}
                        onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                        aria-pressed={chosen === oi}
                        className={`w-full text-left flex items-center gap-2 rounded-lg border px-3 py-2 text-xs md:text-sm transition-colors disabled:cursor-default ${optClass(qi, oi, q.correct_answer)}`}
                      >
                        <span className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center text-[9px] ${chosen === oi ? 'border-current' : 'border-edge-strong'}`}>
                          {chosen === oi ? '●' : ''}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    ))}
                  </div>
                  {submitted && q.explanation ? (
                    <div className={`mt-2 text-[11px] md:text-xs leading-relaxed rounded-lg px-3 py-2 ${isCorrect ? 'border border-success bg-success/10 text-text-primary' : 'border border-edge text-text-secondary'}`}>
                      <span className="font-bold">Izoh: </span>{q.explanation}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {submitted ? (
            <div className="mt-3 text-center text-sm font-bold text-text-primary">
              Natija: <span className="font-data text-success">{correctCount}</span> / <span className="font-data">{questions.length}</span> to'g'ri
            </div>
          ) : (
            <button
              onClick={() => setSubmitted(true)}
              disabled={!allAnswered}
              className="btn-primary text-xs px-4 py-2.5 rounded-xl font-semibold min-h-[40px] disabled:opacity-50 mt-3 w-full">
              {allAnswered ? 'Tekshirish' : 'Barcha savollarga javob bering'}
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ─── OB3. "Sizga o'xshash o'quvchi" taqqoslash (kichik karta) ─────────────────
const PeerComparisonCard = ({ user }) => {
  const { data, loading } = useApiData(() => OlympyApi.getPeerComparison(_retToken()), [user?.id, user?.backendId]);
  if (loading || !data) return null;
  if ((data.total_peers || 0) <= 1) return null;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className="text-text-secondary flex-shrink-0"><Icon name="chart" size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary">{data.message}</div>
          <div className="text-xs text-text-secondary mt-0.5">
            Sizning o'rtacha: <span className="font-data text-text-primary font-semibold">{data.my_avg}</span> ·
            Sinf o'rtacha: <span className="font-data font-semibold"> {data.peer_avg}</span>
            {data.grade ? ` · ${data.grade}-sinf` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── OB4. Birinchi/keyingi olimpiada taklifi ─────────────────────────────────
const SuggestedOlympiadCard = ({ onNavigate, olympiads, user }) => {
  const { data, loading } = useApiData(() => OlympyApi.getSuggestedOlympiad(_retToken()), [user?.id, user?.backendId]);
  if (loading || !data || !data.olympiad_id) return null;
  const handleGo = () => {
    if (!onNavigate) return;
    // Olimpiada ro'yxatidan mos obyektni topib test/olimpiadalar sahifasiga o'tamiz.
    const match = (olympiads || []).find(o => String(o.backendId ?? o.id) === String(data.olympiad_id));
    if (match) onNavigate('olympiads');
    else onNavigate('olympiads');
  };
  return (
    <div className="glass rounded-2xl p-4 border-l-4 border-l-accent">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-0.5">Siz uchun olimpiada</div>
          <div className="text-sm font-bold text-text-primary truncate">{data.name}</div>
          <div className="text-xs text-text-secondary mt-0.5">
            {data.subject} · {data.time_until ? `${data.time_until}dan keyin` : 'tez orada'}
          </div>
        </div>
        <button onClick={handleGo} className="btn-primary text-xs px-3 py-2 rounded-xl font-semibold flex-shrink-0">Ko'rish</button>
      </div>
    </div>
  );
};


// ─── LT3. "O'tgan oy shu paytda" taqqoslash ──────────────────────────────────
const ProgressComparisonCard = ({ user }) => {
  const { data, loading } = useApiData(() => OlympyApi.getProgressComparison(_retToken()), [user?.id, user?.backendId]);
  if (loading || !data) return null;
  // Ikkala oyda ham faollik bo'lmasa ko'rsatmaymiz.
  if ((data.current_month?.attempts || 0) === 0 && (data.last_month?.attempts || 0) === 0) return null;
  const growth = data.growth_percent || 0;
  const up = growth > 0;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <span className={`flex-shrink-0 ${growth === 0 ? 'text-text-secondary' : up ? 'text-success' : 'text-error'}`}>
          <Icon name="chart" size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary">{data.message}</div>
          <div className="text-xs text-text-secondary mt-0.5">
            Bu oy: <span className="font-data text-text-primary font-semibold">{data.current_month?.avg_score} ball</span> ({data.current_month?.attempts} ta) ·
            O'tgan oy: <span className="font-data font-semibold"> {data.last_month?.avg_score} ball</span>
          </div>
        </div>
        {growth !== 0 && (
          <span className={`chip text-[11px] font-data flex-shrink-0 ${up ? 'badge-approved' : 'badge-rejected'}`}>
            {up ? '+' : ''}{growth}%
          </span>
        )}
      </div>
    </div>
  );
};

// ─── LT1. Olimpiada kalendari (modal) ────────────────────────────────────────
const OlympiadCalendarModal = ({ open, onClose, onNavigate }) => {
  const [subject, setSubject] = React.useState('');
  const { data, loading } = useApiData(
    () => open ? OlympyApi.getOlympiadCalendar({ subject, days: 90 }, _retToken()) : Promise.resolve(null),
    [open, subject]
  );
  if (!open) return null;
  const upcoming = data?.upcoming || [];

  // Oylar bo'yicha guruhlaymiz.
  const groups = {};
  upcoming.forEach(o => {
    const d = o.starts_at ? new Date(o.starts_at) : null;
    const key = d ? d.toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long' }) : 'Belgilanmagan';
    (groups[key] = groups[key] || []).push(o);
  });

  return (
    <Modal open={open} onClose={onClose} title="Olimpiada kalendari" width="max-w-lg">
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-8 text-text-secondary text-sm">Yuklanmoqda...</div>
        )}
        {!loading && upcoming.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">Kelgusi 90 kunda olimpiada topilmadi</div>
        )}
        {!loading && Object.entries(groups).map(([month, items]) => (
          <div key={month}>
            <div className="font-display text-xs font-bold text-text-secondary uppercase tracking-widest mb-2 border-b border-edge pb-1">{month}</div>
            <div className="space-y-2">
              {items.map(o => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-edge p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{o.name}</div>
                    <div className="text-xs text-text-secondary">
                      {o.subject} · <span className="font-data">{o.days_until === 0 ? 'Bugun' : `${o.days_until} kundan keyin`}</span>
                    </div>
                  </div>
                  {o.registered ? (
                    <span className="chip text-[10px] badge-approved flex-shrink-0">
                      <Icon name="check" size={11} /> Qatnashilgan
                    </span>
                  ) : (
                    <button
                      onClick={() => { onClose?.(); onNavigate?.('olympiads'); }}
                      className="btn-primary text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0"
                    >
                      Qatnashish
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

Object.assign(window, {
  StreakWarningBanner,
  DailyQuestionsWidget,
  DailyGoalWidget,
  ReferralWidget,
  RivalActivityWidget,
  WeeklyContestHistoryCard,
  CustomTestBuilderCard,
  PeerComparisonCard,
  SuggestedOlympiadCard,
  ProgressComparisonCard,
  OlympiadCalendarModal,
});
