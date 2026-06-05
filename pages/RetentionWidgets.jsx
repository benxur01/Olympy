// pages/RetentionWidgets.jsx
// Retention funksiyalari uchun mustaqil widget komponentlari.
// Har biri o'z ma'lumotini useApiData orqali yuklaydi va backend bo'sh javob
// qaytarsa o'zini ko'rsatmaydi (null render). StudentDashboard / Profile /
// Leaderboard sahifalariga joylashtiriladi.
// Telegram WebView uchun backdrop-blur va og'ir animatsiyalar ishlatilmaydi.

const _retToken = () => globalThis.OlympyApi?.getToken?.();

// ─── DH3. Streak himoyasi eslatmasi (sariq banner) ───────────────────────────
const StreakWarningBanner = ({ onNavigate }) => {
  const { data } = useApiData(() => OlympyApi.getStreakWarning(_retToken()), []);
  if (!data || (data.streak_count || 0) <= 3) return null;

  if (data.is_premium) {
    return (
      <div className="rounded-2xl p-4 border border-indigo-500/30 bg-indigo-500/10 flex items-center gap-3 shadow-[0_4px_12px_rgba(99,102,241,0.05)]">
        <div className="text-3xl flex-shrink-0 animate-pulse">❄️</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-indigo-300 flex items-center gap-1.5">
            <span>Streak Premium Himoyasida!</span>
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-500/20 px-1.5 py-0.2 rounded">Muzlatilgan</span>
          </div>
          <div className="text-xs text-white/60 mt-0.5">Bugun faol bo'la olmasangiz ham, ketma-ket faollik seriyangiz uzilmaydi.</div>
        </div>
      </div>
    );
  }

  if (!data.warning) return null;

  return (
    <div className="rounded-2xl p-4 border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-3 shadow-[0_4px_12px_rgba(245,158,11,0.05)]">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="text-3xl flex-shrink-0">🔥</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black text-amber-300">{data.streak_count} kunlik seriya xavf ostida!</div>
          <div className="text-xs text-white/60 mt-0.5">{data.message} Uni premium bilan butunlay himoyalashni xohlaysizmi?</div>
        </div>
      </div>
      {onNavigate && (
        <button
          onClick={() => onNavigate('premium')}
          className="btn-primary text-xs px-3.5 py-1.5 rounded-xl font-bold flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-none shadow-md shadow-orange-500/20 hover:scale-105 transition-transform"
        >
          Muzlatish ⚡
        </button>
      )}
    </div>
  );
};

// ─── DH1. Bugungi savollar (countdown + 3 ta savol) ──────────────────────────
const DailyQuestionsWidget = () => {
  const { data, loading, reload } = useApiData(() => OlympyApi.getDailyQuestions(_retToken()), []);
  const [timeLeft, setTimeLeft] = React.useState('');
  const [answering, setAnswering] = React.useState(null);

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

  const handleAnswer = async (dq, idx) => {
    if (dq.answered || answering != null) return;
    setAnswering(dq.id);
    try {
      await OlympyApi.answerDailyQuestion(dq.id, idx, _retToken());
      reload();
    } catch (e) {
      // jim — keyingi urinishda qayta yuklanadi
    } finally {
      setAnswering(null);
    }
  };

  if (loading) return null;
  const questions = data?.questions || [];
  if (!questions.length) return null;

  const answeredCount = questions.filter(q => q.answered).length;

  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-indigo-500/15">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="font-bold text-white text-sm md:text-base flex items-center gap-2">
          📅 Bugungi savollar
          <span className="text-xs font-semibold text-white/40">{answeredCount}/{questions.length}</span>
        </h3>
        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg">
          <Icon name="clock" size={12} /> {timeLeft}
        </div>
      </div>
      <div className="space-y-3">
        {questions.map((dq, qi) => (
          <div key={dq.id} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <div className="text-sm font-semibold text-white mb-2 flex items-start gap-1.5">
              <span className="text-white/40">{qi + 1}.</span>
              <span className="flex-1">{dq.text}</span>
              {dq.answered && (
                <span className={dq.is_correct ? 'text-emerald-400' : 'text-rose-400'}>
                  <Icon name={dq.is_correct ? 'check' : 'x'} size={16} />
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {(dq.options || []).map((opt, idx) => {
                let cls = 'btn-ghost';
                if (dq.answered) {
                  if (idx === dq.correct_answer) cls = 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200';
                  else if (idx === dq.selected_option) cls = 'bg-rose-500/20 border border-rose-500/40 text-rose-200';
                  else cls = 'opacity-50 btn-ghost';
                }
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={dq.answered || answering != null}
                    onClick={() => handleAnswer(dq, idx)}
                    className={`text-left rounded-lg px-3 py-2 text-xs transition-all ${cls}`}
                  >
                    {opt}
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

// ─── DH2. Raqib harakati ─────────────────────────────────────────────────────
const RivalActivityWidget = () => {
  const { data, loading } = useApiData(() => OlympyApi.getRivalActivity(_retToken()), []);
  if (loading) return null;
  const rivals = Array.isArray(data) ? data : [];
  if (!rivals.length) return null;
  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-white/5">
      <h3 className="font-bold text-white text-sm md:text-base mb-3 flex items-center gap-2">⚔️ Raqiblar</h3>
      <div className="space-y-2">
        {rivals.map(r => (
          <div key={r.rival_id} className={`flex items-center gap-3 rounded-xl p-2.5 ${r.rival_is_premium ? 'premium-row' : 'bg-white/[0.03]'}`}>
            <Avatar
              name={r.rival_name}
              src={OlympyApi.makeAssetUrl ? OlympyApi.makeAssetUrl(r.rival_avatar_url || '') : (r.rival_avatar_url || '')}
              size={34}
              premium={!!r.rival_is_premium}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                <span className="truncate">{r.rival_name}</span>
                {r.rival_is_premium && <span className="premium-badge premium-badge--sm flex-shrink-0" title="Premium o'quvchi">Premium</span>}
              </div>
              <div className="text-xs text-white/50 truncate">{r.message}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-xs font-bold ${r.rival_score_change > 0 ? 'text-emerald-400' : 'text-white/40'}`}>
                {r.rival_score_change > 0 ? `+${r.rival_score_change}` : '0'}
              </div>
              <div className="text-[10px] text-white/30">siz +{r.my_score_change}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── DH4. Haftalik musobaqa (top 5 + o'z o'rni) ──────────────────────────────
const WeeklyContestWidget = () => {
  const { data, loading } = useApiData(() => OlympyApi.getWeeklyContest(_retToken()), []);
  if (loading) return null;
  const top = data?.top || [];
  const myEntry = data?.my_entry;
  if (!top.length && !myEntry) return null;
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
  const inTop = myEntry && top.some(t => t.is_me);
  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-amber-500/15">
      <h3 className="font-bold text-white text-sm md:text-base mb-3 flex items-center gap-2">
        🏆 Haftalik musobaqa
      </h3>
      <div className="space-y-1.5">
        {top.map(t => (
          <div key={t.user_id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${t.is_me ? 'bg-indigo-500/15 border border-indigo-500/30' : 'bg-white/[0.03]'}`}>
            <div className="w-7 text-center text-sm font-black flex-shrink-0">{medal(t.rank)}</div>
            <div className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{t.full_name}{t.is_me && ' (siz)'}</div>
            <div className="text-sm font-bold text-amber-300 flex-shrink-0">{t.score}</div>
          </div>
        ))}
        {myEntry && !inTop && (
          <>
            <div className="text-center text-white/20 text-xs py-0.5">···</div>
            <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-indigo-500/15 border border-indigo-500/30">
              <div className="w-7 text-center text-sm font-black flex-shrink-0">#{myEntry.rank}</div>
              <div className="flex-1 min-w-0 text-sm font-semibold text-white truncate">{myEntry.full_name} (siz)</div>
              <div className="text-sm font-bold text-amber-300 flex-shrink-0">{myEntry.score}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── OB3. "Sizga o'xshash o'quvchi" taqqoslash (kichik karta) ─────────────────
const PeerComparisonCard = () => {
  const { data, loading } = useApiData(() => OlympyApi.getPeerComparison(_retToken()), []);
  if (loading || !data) return null;
  if ((data.total_peers || 0) <= 1) return null;
  return (
    <div className="glass rounded-2xl p-4 border border-cyan-500/15">
      <div className="flex items-center gap-3">
        <div className="text-3xl flex-shrink-0">📊</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{data.message}</div>
          <div className="text-xs text-white/50 mt-0.5">
            Sizning o'rtacha: <span className="text-cyan-300 font-semibold">{data.my_avg}</span> ·
            Sinf o'rtacha: <span className="text-white/70 font-semibold"> {data.peer_avg}</span>
            {data.grade ? ` · ${data.grade}-sinf` : ''}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── OB4. Birinchi/keyingi olimpiada taklifi ─────────────────────────────────
const SuggestedOlympiadCard = ({ onNavigate, olympiads }) => {
  const { data, loading } = useApiData(() => OlympyApi.getSuggestedOlympiad(_retToken()), []);
  if (loading || !data || !data.olympiad_id) return null;
  const handleGo = () => {
    if (!onNavigate) return;
    // Olimpiada ro'yxatidan mos obyektni topib test/olimpiadalar sahifasiga o'tamiz.
    const match = (olympiads || []).find(o => String(o.backendId ?? o.id) === String(data.olympiad_id));
    if (match) onNavigate('olympiads');
    else onNavigate('olympiads');
  };
  return (
    <div className="glass rounded-2xl p-4 border border-indigo-500/20">
      <div className="flex items-center gap-3">
        <div className="text-3xl flex-shrink-0">🎯</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-300 font-semibold mb-0.5">Siz uchun olimpiada</div>
          <div className="text-sm font-bold text-white truncate">{data.name}</div>
          <div className="text-xs text-white/50 mt-0.5">
            {data.subject} · {data.time_until ? `${data.time_until}dan keyin` : 'tez orada'}
          </div>
        </div>
        <button onClick={handleGo} className="btn-primary text-xs px-3 py-2 rounded-xl font-semibold flex-shrink-0">Ko'rish</button>
      </div>
    </div>
  );
};

// ─── LT2. O'sish yo'li (Roadmap) — vertikal progress ─────────────────────────
const RoadmapCard = () => {
  const { data, loading } = useApiData(() => OlympyApi.getRoadmap(_retToken()), []);
  if (loading || !data) return null;
  const stages = data.stages || [];
  if (!stages.length) return null;
  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-white/5">
      <h3 className="font-bold text-white text-sm md:text-base mb-1 flex items-center gap-2">🚀 O'sish yo'li</h3>
      <p className="text-xs text-white/40 mb-4">O'rtacha ball: <span className="text-white/70 font-semibold">{data.current_score}</span></p>
      <div className="relative pl-7">
        {/* vertikal chiziq */}
        <div className="absolute left-[10px] top-2 bottom-2 w-0.5 bg-white/10" />
        {stages.map((s, i) => {
          const isCurrent = data.current_level === s.level;
          const dotCls = s.is_achieved
            ? 'bg-emerald-500 border-emerald-400'
            : isCurrent
              ? 'bg-amber-500 border-amber-400 animate-pulse'
              : 'bg-white/10 border-white/20';
          const txtCls = s.is_achieved ? 'text-emerald-300' : isCurrent ? 'text-amber-300' : 'text-white/40';
          return (
            <div key={s.level} className="relative mb-4 last:mb-0">
              <div className={`absolute -left-7 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${dotCls}`}>
                {s.is_achieved && <Icon name="check" size={11} className="text-white" />}
              </div>
              <div className={`text-sm font-bold ${txtCls}`}>{s.title}</div>
              <div className="text-xs text-white/40">
                {s.is_achieved ? 'Bajarildi' : `${s.required_score}+ ball kerak`}
                {isCurrent && s.next_milestone && s.next_milestone.points_needed > 0 && (
                  <span> · {s.next_milestone.title}gacha {s.next_milestone.points_needed} ball</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── LT3. "O'tgan oy shu paytda" taqqoslash ──────────────────────────────────
const ProgressComparisonCard = () => {
  const { data, loading } = useApiData(() => OlympyApi.getProgressComparison(_retToken()), []);
  if (loading || !data) return null;
  // Ikkala oyda ham faollik bo'lmasa ko'rsatmaymiz.
  if ((data.current_month?.attempts || 0) === 0 && (data.last_month?.attempts || 0) === 0) return null;
  const growth = data.growth_percent || 0;
  const up = growth > 0;
  return (
    <div className="glass rounded-2xl p-4 border border-white/5">
      <div className="flex items-center gap-3">
        <div className={`text-3xl flex-shrink-0`}>{up ? '📈' : growth < 0 ? '📉' : '➡️'}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white">{data.message}</div>
          <div className="text-xs text-white/50 mt-0.5">
            Bu oy: <span className="text-white/70 font-semibold">{data.current_month?.avg_score} ball</span> ({data.current_month?.attempts} ta) ·
            O'tgan oy: <span className="text-white/70 font-semibold"> {data.last_month?.avg_score} ball</span>
          </div>
        </div>
        {growth !== 0 && (
          <div className={`text-sm font-black flex-shrink-0 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
            {up ? '+' : ''}{growth}%
          </div>
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
    <Modal open={open} onClose={onClose} title="📅 Olimpiada kalendari" width="max-w-lg">
      <div className="space-y-4">
        {loading && (
          <div className="text-center py-8 text-white/40 text-sm">Yuklanmoqda...</div>
        )}
        {!loading && upcoming.length === 0 && (
          <div className="text-center py-8 text-white/40 text-sm">Kelgusi 90 kunda olimpiada topilmadi</div>
        )}
        {!loading && Object.entries(groups).map(([month, items]) => (
          <div key={month}>
            <div className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">{month}</div>
            <div className="space-y-2">
              {items.map(o => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/5 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{o.name}</div>
                    <div className="text-xs text-white/50">
                      {o.subject} · {o.days_until === 0 ? 'Bugun' : `${o.days_until} kundan keyin`}
                    </div>
                  </div>
                  {o.registered ? (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1 flex-shrink-0">
                      <Icon name="check" size={13} /> Qatnashilgan
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
  RivalActivityWidget,
  WeeklyContestWidget,
  PeerComparisonCard,
  SuggestedOlympiadCard,
  RoadmapCard,
  ProgressComparisonCard,
  OlympiadCalendarModal,
});
