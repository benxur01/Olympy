// pages/Results.jsx

// Insho AI tahlili — on-demand backend ishi. 3 soniyada bir so'raymiz, lekin
// CHEKSIZ emas: 60 urinish (≈3 daqiqa) dan keyin to'xtaymiz va foydalanuvchini
// keyinroq urinib ko'rishga taklif qilamiz (boshqa pollinglar bilan bir xil
// yondashuv — TeacherDashboard/ManagerDashboard Telegram polling'i ham
// MAX_TRIES bilan cheklangan).
const ESSAY_AI_POLL_MS = 3000;
const ESSAY_AI_MAX_TRIES = 60;

// ─── Baho darajasi ──────────────────────────────────────────────────────────
// Avval daraja gradient fon (`from-emerald-500/20 to-teal-500/10`) + rangli
// matn bilan berilardi. Yo'nalishda gradient yo'q; ustiga rang YAKKA signal
// edi — rang ko'rligida daraja umuman o'qilmasdi. Endi uch kanal: chap chiziq
// (`border-l-4`), chegarali chip va yozma yorliq.
//
// Nomlar `RESULT_`/`result` prefiksi bilan: `generate-vite-entry.mjs` har
// faylning top-level nomlarini `var` sifatida umumiy scope'ga chiqaradi,
// ya'ni prefiksiz nom boshqa sahifaning nomini bosib ketishi mumkin.
const RESULT_GRADE_BANDS = [
  { min: 90, label: "A'lo", rule: 'border-l-success', chip: 'border-success/45 text-success' },
  { min: 75, label: 'Yaxshi', rule: 'border-l-accent-2', chip: 'border-accent-2/45 text-accent-2' },
  { min: 60, label: 'Qoniqarli', rule: 'border-l-warning', chip: 'border-warning/45 text-warning' },
  { min: 0, label: 'Qoniqarsiz', rule: 'border-l-error', chip: 'border-error/45 text-error' },
];
const resultGradeOf = (pct) => RESULT_GRADE_BANDS.find(b => pct >= b.min) || RESULT_GRADE_BANDS[3];

// Fan kesimidagi o'rtacha — bu "kim" emas, "qanchalik yaxshi" savoli, ya'ni
// haqiqiy status o'qishi. Shuning uchun chiziq rangi status tokenini oladi
// (dataviz qoidasi: seriya good/bad ma'nosini bildirsa — status palitrasi).
// Rang yakka qolmasin deb har qatorda yozma yorliq ham turadi.
const RESULT_SUBJECT_BANDS = [
  { min: 70, label: 'Kuchli', chip: 'border-success/45 text-success', bar: 'rgb(var(--color-success))' },
  { min: 50, label: "O'rta", chip: 'border-warning/45 text-warning', bar: 'rgb(var(--color-warning))' },
  { min: 0, label: 'Zaif', chip: 'border-error/45 text-error', bar: 'rgb(var(--color-error))' },
];
const resultSubjectBand = (v) => RESULT_SUBJECT_BANDS.find(b => v >= b.min) || RESULT_SUBJECT_BANDS[2];

// 1/2/3-o'rin belgisi — Leaderboard.jsx bilan bir xil qoida: medal rangi
// MATNGA berilmaydi (qog'oz mavzuda oltin `surface-2` da 3.2:1 — belgi uchun
// yetadi, matn uchun emas). Farq `.leaderboard-*` yuvish + chegara + chap
// chiziq bilan, raqam esa `text-primary`. Emoji (🥇🥈🥉) ishlatilmaydi.
const resultRankClass = (rank) => (
  rank === 1 ? 'leaderboard-gold' :
  rank === 2 ? 'leaderboard-silver' :
  rank === 3 ? 'leaderboard-bronze' :
  'border border-edge bg-ground'
);

// Javob bloklaridagi mayda sarlavha — takrorlanuvchi uslub bitta joyda.
const ResultFieldLabel = ({ children }) => (
  <div className="font-display text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-1">{children}</div>
);

const ResultsPage = ({ result, user, onNavigate, embedded }) => {
  const store = useStore();
  const isApi = !!user?._api;
  const [shareToast, setShareToast] = React.useState('');
  // Javoblarni ko'rish bo'limini ochish/yopish flagi. fetchedAttempt.questions_review
  // mavjud bo'lganda chiqadi (faqat backend rejimida).
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [explanations, setExplanations] = React.useState({}); // { [qid]: string }
  const [explaining, setExplaining] = React.useState({});     // { [qid]: boolean }
  const isPremium = isApi ? !!(user?.isPremium ?? user?.is_premium) : true;
  // Feature 4: insho chuqur AI tahlili Plus+ tarifi uchun. Mock (isApi=false)
  // rejimda barcha imkoniyatlar ochiq.
  const canPlusEssay = isApi ? tierAtLeast(user, 'plus') : true;
  const [showPremiumLockModal, setShowPremiumLockModal] = React.useState(false);
  // On-demand insho AI tahlili holati (savol id bo'yicha).
  const [essayAI, setEssayAI] = React.useState({});          // { [qid]: {status, text} }
  const [essayAILoading, setEssayAILoading] = React.useState({}); // { [qid]: bool }
  const essayPollRef = React.useRef({});                     // { [qid]: timeoutId }
  React.useEffect(() => () => {
    // Unmount'da barcha polling timerlarini tozalaymiz.
    Object.values(essayPollRef.current).forEach((t) => clearTimeout(t));
  }, []);
  // "Tushuntirish" AI task'i ham polling bilan olinadi (api.js ichida) —
  // unmount'da o'sha loop to'xtasin.
  const aiAbort = useAbortOnUnmount();

  // "Chuqur AI tahlil" tugmasi — insho javobini AI orqali tahlil qiladi.
  // Backend on-demand: birinchi so'rov {status:'pending'} qaytarsa, tayyor
  // bo'lguncha (ready/failed) davriy so'rab turamiz (AttemptAIAnalysis kabi).
  const handleEssayAIFeedback = (qid) => {
    const attemptId = reviewAttemptId;
    if (!attemptId || essayAILoading[qid]) return;
    setEssayAILoading((prev) => ({ ...prev, [qid]: true }));
    let tries = 0;
    const stopWith = (text) => {
      setEssayAI((prev) => ({ ...prev, [qid]: { status: 'failed', text } }));
      setEssayAILoading((prev) => ({ ...prev, [qid]: false }));
    };
    const scheduleNext = () => {
      // Unmount: `essayPollRef` timerlari yuqorida tozalanadi, lekin o'sha
      // paytda yo'lda bo'lgan `poll()` javob kelgach yangi timer qo'yib,
      // loop'ni komponentsiz ham davom ettirardi (3 daqiqagacha).
      if (aiAbort.isAborted()) return;
      if (tries >= ESSAY_AI_MAX_TRIES) {
        stopWith("AI tahlil hali tayyor emas. Birozdan so'ng qayta urinib ko'ring.");
        return;
      }
      essayPollRef.current[qid] = setTimeout(poll, ESSAY_AI_POLL_MS);
    };
    const poll = async () => {
      // Faqat tab ko'rinib turganda so'rov yuboramiz — fon tab'da (yoki
      // Telegram WebView minimallashtirilganda) tarmoq/batareya sarflashning
      // foydasi yo'q. Urinish ham hisoblanmaydi: foydalanuvchi qaytganda
      // polling o'z limiti bilan davom etadi.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        essayPollRef.current[qid] = setTimeout(poll, ESSAY_AI_POLL_MS);
        return;
      }
      tries += 1;
      try {
        const res = await OlympyApi.getEssayAIFeedback(attemptId, qid, OlympyApi.getToken());
        const st = res?.status;
        if (st === 'ready') {
          setEssayAI((prev) => ({ ...prev, [qid]: { status: 'ready', text: res.feedback || '' } }));
          setEssayAILoading((prev) => ({ ...prev, [qid]: false }));
        } else if (st === 'failed') {
          stopWith(res.feedback || "AI tahlil hozircha tayyor emas. Keyinroq urinib ko'ring.");
        } else {
          // pending — davriy tekshiruvni davom ettiramiz (limitgacha).
          scheduleNext();
        }
      } catch (err) {
        stopWith(OlympyApi.toUserMessage?.(err) || "AI tahlilni yuklab bo'lmadi.");
      }
    };
    poll();
  };

  const handleExplain = async (qid) => {
    if (explanations[qid]) return;
    setExplaining(prev => ({ ...prev, [qid]: true }));
    try {
      const res = await OlympyApi.explainQuestion(qid, OlympyApi.getToken(), aiAbort.getSignal());
      setExplanations(prev => ({ ...prev, [qid]: res?.explanation || "Tushuntirish yuklanmadi." }));
    } catch (err) {
      // Unmount'da atayin bekor qilindi — xato sifatida ko'rsatilmaydi.
      if (aiAbort.isAborted()) return;
      setExplanations(prev => ({ ...prev, [qid]: OlympyApi.toUserMessage?.(err) || "Tushuntirish yuklab bo'lmadi." }));
    } finally {
      setExplaining(prev => ({ ...prev, [qid]: false }));
    }
  };

  // Savol turiga qarab javob tahlilini chizadi. Backend questions_review
  // har bir savol uchun question_type bilan birga keladi:
  //   mcq/yes_no        → options[], correct_answer (idx), chosen_answer (idx)
  //   multiple_select   → options[], correct_answer_set (idx[]), chosen_answer (idx[])
  //   fill_blank        → chosen_answer (matn), correct_text (matn)
  //   fill_blanks       → chosen_answer ({"1":..}), correct_text ({"1":..})
  //   essay             → chosen_answer (matn), pending_review=true
  const renderReviewAnswer = (q) => {
    const qType = String(q.question_type || 'mcq');

    // essay — avtomatik baholanmaydi: ustoz baho qo'ygan bo'lsa ball + izoh
    // (essay_score/essay_feedback), aks holda "tekshirilmoqda" holati.
    if (qType === 'essay') {
      const graded = q.pending_review === false && q.essay_score !== undefined && q.essay_score !== null;
      return (
        <div className="space-y-2">
          <div>
            <ResultFieldLabel>Sizning javobingiz</ResultFieldLabel>
            <div className="rounded-xl px-3 py-2 text-xs md:text-sm border bg-ground text-text-primary border-edge whitespace-pre-wrap break-words">
              {q.chosen_answer ? String(q.chosen_answer) : '(javob berilmagan)'}
            </div>
          </div>
          {graded ? (
            <>
              <div className="text-[11px] text-success flex items-center gap-1.5">
                <Icon name="check" size={12} /> Ustoz bahosi: <span className="font-data font-bold">{q.essay_score}/{q.score}</span> ball
              </div>
              {q.essay_feedback && (
                <div>
                  <ResultFieldLabel>Ustoz izohi</ResultFieldLabel>
                  <div className="rounded-xl px-3 py-2 text-xs md:text-sm border border-edge border-l-4 border-l-accent-2 bg-ground text-text-primary whitespace-pre-wrap break-words">
                    {q.essay_feedback}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[11px] text-warning flex items-center gap-1.5">
              <Icon name="info" size={12} /> Insho qo'lda baholanadi
            </div>
          )}

          {/* Feature 4: on-demand chuqur AI tahlil (Plus+). */}
          <div className="pt-1">
            {!canPlusEssay ? (
              <button
                onClick={() => setShowPremiumLockModal(true)}
                className="btn-ghost text-[11px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
              >
                <Icon name="lock" size={12} /> Chuqur AI tahlil — Plus tarifi
              </button>
            ) : essayAI[q.id] ? (
              <div className={`rounded-xl border border-l-4 bg-ground p-3 text-xs text-text-primary whitespace-pre-wrap break-words ${essayAI[q.id].status === 'failed' ? 'border-warning/45 border-l-warning' : 'border-edge border-l-accent-2'}`}>
                <div className="flex items-center gap-1.5 font-display uppercase tracking-widest text-[10px] text-text-secondary font-bold mb-2">
                  <Icon name="bolt" size={13} className={essayAI[q.id].status === 'failed' ? 'text-warning' : 'text-accent-2'} />
                  <span>Chuqur AI tahlil</span>
                </div>
                <div className="whitespace-pre-line text-[11px] md:text-xs">
                  {renderMarkdown(essayAI[q.id].text)}
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleEssayAIFeedback(q.id)}
                disabled={!!essayAILoading[q.id]}
                className="btn-ghost text-[11px] px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5"
              >
                {essayAILoading[q.id] ? (
                  <>
                    <span className="w-3 h-3 rounded-full border border-edge border-t-accent animate-spin" />
                    Tahlil qilinmoqda…
                  </>
                ) : (
                  <>
                    <Icon name="bolt" size={13} className="text-accent-2" /> Chuqur AI tahlil
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      );
    }

    // fill_blank — bitta matnli javob va to'g'ri javob.
    if (qType === 'fill_blank') {
      const correct = q.correct_text != null ? String(q.correct_text) : '';
      return (
        <div className="space-y-2">
          <div>
            <ResultFieldLabel>Sizning javobingiz</ResultFieldLabel>
            {/* Holat uch kanalda: chap chiziq (shakl), chegara rangi va
                ikonka+yorliq. Matn `text-primary` bo'lib qoladi — javobning
                O'ZI o'qilishi kerak, u status yorlig'i emas. */}
            <div className={`rounded-xl px-3 py-2 text-xs md:text-sm border border-l-4 bg-ground text-text-primary whitespace-pre-wrap break-words ${q.is_correct ? 'border-success/45 border-l-success' : 'border-error/45 border-l-error'}`}>
              {q.chosen_answer != null && String(q.chosen_answer).trim() ? String(q.chosen_answer) : '(javob berilmagan)'}
            </div>
          </div>
          {!q.is_correct && correct && (
            <div>
              <ResultFieldLabel>To'g'ri javob</ResultFieldLabel>
              <div className="rounded-xl px-3 py-2 text-xs md:text-sm border border-success/45 border-l-4 border-l-success bg-ground text-text-primary whitespace-pre-wrap break-words">{correct}</div>
            </div>
          )}
        </div>
      );
    }

    // fill_blanks — bir nechta bo'sh joy: har biri uchun javob va to'g'ri qiymat.
    if (qType === 'fill_blanks') {
      const chosen = (q.chosen_answer && typeof q.chosen_answer === 'object') ? q.chosen_answer : {};
      const correct = (q.correct_text && typeof q.correct_text === 'object') ? q.correct_text : {};
      const keys = Object.keys(correct).length ? Object.keys(correct) : Object.keys(chosen);
      return (
        <div className="space-y-2">
          {keys.map((k) => {
            const userVal = String(chosen[k] ?? '').trim();
            const correctVal = String(correct[k] ?? '').trim();
            const ok = userVal.toLowerCase() === correctVal.toLowerCase() && !!correctVal;
            return (
              <div key={k} className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold font-data text-xs flex-shrink-0 bg-ground text-text-secondary border border-edge">{k}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className={`rounded-xl px-3 py-1.5 text-xs md:text-sm border border-l-4 bg-ground text-text-primary break-words ${ok ? 'border-success/45 border-l-success' : 'border-error/45 border-l-error'}`}>
                    {userVal || '(bo\'sh)'}
                  </div>
                  {!ok && correctVal && (
                    <div className="text-[11px] text-success break-words flex items-start gap-1.5">
                      <Icon name="check" size={11} className="flex-shrink-0 mt-0.5" /> <span>To'g'ri: {correctVal}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // multiple_select — checkbox ro'yxati: tanlangan va to'g'ri indekslar.
    if (qType === 'multiple_select') {
      const chosenSet = Array.isArray(q.chosen_answer) ? q.chosen_answer.map(Number) : [];
      const correctSet = Array.isArray(q.correct_answer_set) ? q.correct_answer_set.map(Number) : [];
      return (
        <div className="space-y-1.5">
          {(q.options || []).map((opt, oi) => {
            const isCorrect = correctSet.includes(oi);
            const isChosen = chosenSet.includes(oi);
            let cls = 'border-edge bg-surface-1 text-text-secondary';
            if (isCorrect) cls = 'border-success/45 border-l-4 border-l-success bg-ground text-text-primary';
            else if (isChosen && !isCorrect) cls = 'border-error/45 border-l-4 border-l-error bg-ground text-text-primary';
            return (
              <div key={oi} className={`rounded-xl px-3 py-2 text-xs md:text-sm border flex items-center gap-2 ${cls}`}>
                <span className="text-text-secondary font-bold font-data flex-shrink-0">{String.fromCharCode(65 + oi)}.</span>
                <MathText className="flex-1 break-words" text={String(opt)} />
                {isChosen && <span className="text-[10px] text-text-secondary flex-shrink-0">tanlangan</span>}
                {isCorrect && <Icon name="check" size={12} className="text-success flex-shrink-0" />}
                {isChosen && !isCorrect && <Icon name="x" size={12} className="text-error flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      );
    }

    // mcq / yes_no (default) — bitta tanlovli option list (mavjud xulq).
    return (
      <div className="space-y-1.5">
        {(q.options || []).map((opt, oi) => {
          const isCorrect = oi === q.correct_answer;
          const isChosen = oi === q.chosen_answer;
          let cls = 'border-edge bg-surface-1 text-text-secondary';
          if (isCorrect) cls = 'border-success/45 border-l-4 border-l-success bg-ground text-text-primary';
          else if (isChosen && !isCorrect) cls = 'border-error/45 border-l-4 border-l-error bg-ground text-text-primary';
          return (
            <div key={oi} className={`rounded-xl px-3 py-2 text-xs md:text-sm border flex items-center gap-2 ${cls}`}>
              <span className="text-text-secondary font-bold font-data flex-shrink-0">{String.fromCharCode(65 + oi)}.</span>
              <span className="flex-1 break-words">{String(opt)}</span>
              {isChosen && <span className="text-[10px] text-text-secondary flex-shrink-0">tanlangan</span>}
              {isCorrect && <Icon name="check" size={12} className="text-success flex-shrink-0" />}
              {isChosen && !isCorrect && <Icon name="x" size={12} className="text-error flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    );
  };

  // AI/backend'dan kelgan tushuntirish matni untrusted — XSS oldini olish
  // uchun faqat <strong> tegiga ruxsat berib DOMPurify orqali tozalaymiz.
  // DOMPurify global entry'da ochilgan (generate-vite-entry.mjs). Mavjud
  // bo'lmasa, butun HTML'ni teglardan tozalab (matn sifatida) qaytaramiz.
  const sanitizeMarkup = (html) => {
    const purifier = typeof globalThis !== 'undefined' ? globalThis.DOMPurify : undefined;
    if (purifier?.sanitize) {
      return purifier.sanitize(html, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
    }
    return String(html).replace(/<[^>]*>/g, '');
  };

  const renderMarkdown = (text) => {
    if (!text) return '';
    return text.split('\n').map((line, i) => {
      let content = line;
      content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const stripped = content.trim().substring(2);
        return <li key={i} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: sanitizeMarkup(stripped) }} />;
      }
      return <p key={i} className="mb-1.5" dangerouslySetInnerHTML={{ __html: sanitizeMarkup(content) }} />;
    });
  };
  // Leaderboard yoki boshqa sahifadan attemptId bilan kelganda, backend'dan
  // attemptni olib kelamiz. Avval mock store'dan qidirilardi va API rejimida
  // topa olmasdi.
  const [fetchedAttempt, setFetchedAttempt] = React.useState(null);
  const [fetchError, setFetchError] = React.useState('');
  const needsFetch = !!(isApi && result?.attemptId
    && !(result.olympiad && (result.score !== undefined || result.correct !== undefined))
    && !(result.id && result.olympiadId && result.score !== undefined));
  // Review fetch — backend rejimida attemptId yoki id mavjud bo'lsa,
  // savollar tahlilini ham yuklab kelamiz. Bu needsFetch'dan alohida ishlaydi:
  // OlympiadTest finish'dan keyin to'liq payload kelganda ham review uchun
  // qo'shimcha so'rov yuborilsin.
  const reviewAttemptId = isApi
    ? (result?.attemptId || result?.id || result?.backendId)
    : null;
  React.useEffect(() => {
    if (!isApi || !reviewAttemptId) { setFetchedAttempt(null); setFetchError(''); return; }
    let cancelled = false;
    setFetchError('');
    OlympyApi.getAttempt(reviewAttemptId, OlympyApi.getToken())
      .then(data => { if (!cancelled) setFetchedAttempt(data); })
      .catch(err => {
        if (cancelled) return;
        // needsFetch holatida (faqat attemptId bilan kelgan) — fetchError
        // muhim. Aks holda (to'liq payload bor) — review uchun fetch xatosini
        // jim yutamiz, asosiy sahifa baribir ishlaydi.
        if (needsFetch) {
          setFetchError(OlympyApi.toUserMessage?.(err) || "Natijani yuklab bo'lmadi");
        }
      });
    return () => { cancelled = true; };
  }, [isApi, reviewAttemptId, needsFetch]);

  // Bo'limlar bo'yicha: backend /api/results/me/stats/ subjects ro'yxati.
  // Avval bu yerda 4 ta hardcoded bo'lim ("Algebraik tenglamalar 8/10" va h.k.)
  // har bir foydalanuvchiga bir xil ko'rinardi. Endi haqiqiy fan kesimi.
  const apiStatsRes = useApiData(
    () => isApi ? OlympyApi.getMyStats(OlympyApi.getToken()) : Promise.resolve(null),
    [isApi],
  );
  const subjectBreakdown = React.useMemo(() => {
    if (!isApi) return [];
    const rows = apiStatsRes.data?.subjects;
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 6).map(row => ({
      name: row.subject || '—',
      attempts: row.attempts || 0,
      avg: Math.round(row.average_score || 0),
    }));
  }, [isApi, apiStatsRes.data]);

  // Resolve result. Avval doim store.attempts'dan qidirardi va API
  // rejimda topa olmasdi → score=0, total=0 ko'rinardi. Endi:
  //  1) caller olympiad ob'ektni to'g'ridan-to'g'ri o'tkazgan bo'lsa, uni
  //     ishlatamiz (Profile.jsx, OlympiadTest.jsx onFinish payloadi);
  //  2) attemptId bilan kelsa va store.attempts'da topsak — eski mock yo'l;
  //  3) API rejimida attemptId bilan kelsa — /api/attempts/{id}/ orqali
  //     backend'dan olib kelamiz (fetchedAttempt);
  //  4) raw attempt obyekti bo'lsa — to'g'ridan-to'g'ri u.
  let r = result;
  if (r && r.olympiad && (r.score !== undefined || r.correct !== undefined)) {
    // OlympiadTest onFinish to'liq payload yuboradi: { score, correct,
    // wrong, total, rank, time, olympiad }. Hech qanday lookup kerak emas.
    r = {
      correct: r.correct ?? r.correctCount ?? 0,
      wrong: r.wrong ?? r.wrongCount ?? 0,
      score: r.score ?? 0,
      total: r.total ?? r.totalQuestions ?? 0,
      rank: r.rank ?? null,
      time: r.time ?? r.timeSpent ?? 0,
      olympiad: r.olympiad,
    };
  } else if (r && r.attemptId && fetchedAttempt) {
    // API rejimida backend'dan olib kelingan attempt
    const od = fetchedAttempt.olympiad_detail || {};
    r = {
      correct: fetchedAttempt.correct_count ?? 0,
      wrong: fetchedAttempt.wrong_count ?? 0,
      score: fetchedAttempt.score ?? 0,
      total: fetchedAttempt.total_questions ?? 0,
      rank: fetchedAttempt.rank ?? null,
      time: fetchedAttempt.time_spent ?? 0,
      olympiad: od.id ? {
        id: String(od.id),
        title: od.title,
        subject: od.subject,
        eventType: od.event_type,
        testLevel: od.test_level,
        testType: od.test_type,
      } : null,
    };
  } else if (r && r.attemptId) {
    const a = store.attempts.find(x => x.id === r.attemptId);
    if (a) {
      const o = store.olympiads.find(x => x.id === a.olympiadId);
      r = {
        correct: a.correctCount, wrong: a.wrongCount,
        score: a.score, total: a.totalQuestions, rank: a.rank,
        time: a.timeSpent, olympiad: o,
      };
    }
  } else if (r && r.id && r.olympiadId && r.score !== undefined) {
    // Already an attempt object passed directly (eski yo'l, mock store)
    const o = store.olympiads.find(x => x.id === r.olympiadId);
    r = {
      correct: r.correctCount, wrong: r.wrongCount,
      score: r.score, total: r.totalQuestions, rank: r.rank,
      time: r.timeSpent, olympiad: o,
    };
  }
  if (!r) {
    r = { correct: 0, wrong: 0, score: 0, total: 0, rank: 0, time: 0, olympiad: null };
  }
  // API'dan attempt yuklanmoqda bo'lsa, oraliq holatda 0 ko'rsatmaslik uchun
  // alohida loading sahifasi.
  const isLoadingAttempt = needsFetch && !fetchedAttempt && !fetchError;

  // Consistent percentage: prefer score (already in 0-100), else derive from correct/total
  const pct = (r.score !== undefined && r.score !== null)
    ? Math.round(r.score)
    : (r.total ? Math.round((r.correct / r.total) * 100) : 0);
  const grade = resultGradeOf(pct);
  const fmtTime = (s) => `${Math.floor((s||0)/60)}m ${(s||0)%60}s`;

  if (isLoadingAttempt) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-4 py-10`} style={embedded ? {} : { background: 'rgb(var(--color-ground))' }}>
        <div className="glass rounded-2xl px-6 py-4 text-sm text-text-secondary">Natija yuklanmoqda...</div>
      </div>
    );
  }
  if (fetchError) {
    return (
      <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-4 py-10`} style={embedded ? {} : { background: 'rgb(var(--color-ground))' }}>
        <div className="glass rounded-2xl border-l-4 border-l-error px-6 py-5 text-center max-w-sm">
          <div className="text-error font-semibold text-sm mb-2">{fetchError}</div>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost text-xs px-4 py-2 rounded-xl">Reytingga qaytish</button>
        </div>
      </div>
    );
  }

  const content = (
    <div className={`${embedded ? '' : 'min-h-screen'} flex items-center justify-center px-3 md:px-4 py-4 md:py-10 mobile-content-pad`} style={embedded ? {} : { background: 'rgb(var(--color-ground))' }}>
      <div className="max-w-2xl w-full space-y-4 md:space-y-6 animate-in">
        {/* ─── Xulosa: byulleten sarlavhasi ─────────────────────────────────
            Skaner qilinadigan yuza — "nechchi oldim?" javobi eng tepada,
            detal (donut, fan kesimi, javoblar tahlili) undan keyin turadi.
            Avval bu blok gradient fon + emoji (🏆/🎉/👍/💪) bilan berilardi:
            gradient yo'nalishda yo'q, emoji esa bo'lim belgisi sifatida
            ishlatilmaydi. Daraja endi chap chiziq + chip + yozma yorliq. */}
        <div className={`glass-strong rounded-3xl p-5 md:p-8 border-l-4 ${grade.rule}`}>
          <div className="font-display text-[10px] md:text-xs uppercase tracking-widest text-text-secondary font-bold">
            Imtihon byulleteni
          </div>
          <h1 className="font-display text-lg md:text-2xl font-bold text-text-primary mt-1 break-words">
            {r.olympiad?.title || 'Olimpiada'}
          </h1>
          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="flex items-baseline">
              <span className="font-data text-5xl md:text-7xl font-black text-text-primary leading-none">{pct}</span>
              <span className="font-data text-text-secondary text-xl md:text-2xl">/100</span>
            </div>
            <span className={`chip border bg-ground text-xs md:text-sm font-bold ${grade.chip}`}>{grade.label}</span>
          </div>
          <div className="mt-4 border-t border-edge pt-3 flex flex-wrap items-center gap-2">
            {r.olympiad?.subject && <SubjectBadge subject={r.olympiad.subject} />}
            {r.olympiad?.testLevel && <span className="chip border border-edge bg-ground text-text-secondary">{r.olympiad.testLevel}</span>}
            {r.olympiad?.testType && <span className="chip border border-edge bg-ground text-text-secondary">{testTypeLabel(r.olympiad.testType)}</span>}
          </div>
        </div>

        {/* Stats grid — emoji o'rniga `Icon`, qiymatlar `font-data` bilan
            (ustun sakramasin). Reyting o'rni 1/3 gacha bo'lsa medal yuvishini
            oladi: rang MATNGA emas, plastinkaga beriladi. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { icon: 'check', label: "To'g'ri", value: r.correct, tone: 'text-success' },
            { icon: 'x', label: "Noto'g'ri", value: r.wrong, tone: 'text-error' },
            { icon: 'clock', label: 'Sarflangan vaqt', value: fmtTime(r.time || 0), tone: 'text-text-secondary' },
            { icon: 'award', label: "Reyting o'rni", value: r.rank ? `#${r.rank}` : '—', tone: 'text-text-secondary', rank: r.rank },
          ].map((s, i) => (
            <div key={i} className="glass rounded-2xl p-3 md:p-4 card-hover">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${s.rank ? resultRankClass(s.rank) : 'border border-edge bg-ground'} ${s.tone}`}>
                  <Icon name={s.icon} size={14} />
                </span>
                <span className="font-data text-base md:text-xl font-black text-text-primary truncate">{s.value}</span>
              </div>
              <div className="mt-1.5 text-[10px] md:text-xs text-text-secondary">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ─── Natija tahlili ───────────────────────────────────────────────
            Grafik ranglari: to'g'ri/noto'g'ri — bu "kim" emas, "yaxshimi
            yomonmi" savoli, ya'ni haqiqiy status o'qishi, shuning uchun
            `success`/`error` tokenlari (dataviz: seriya good/bad ma'nosini
            bildirsa — status palitrasi, kategorik emas). Umumiy foiz esa
            seriya emas, sarlavha raqami — u brend belgisi `accent` ni oladi va
            shu bilan ikkala status rangidan ajralib turadi.
            Qattiq #22c55e/#ef4444/#C0362C o'rniga tokenlar: ular qog'oz va
            siyoh mavzuda alohida sozlangan. Rang yakka signal emas — har
            donut ostida yozma yorliq va yonida raqamli qator turadi. */}
        <div className="glass rounded-2xl p-4 md:p-6">
          <h3 className="font-display font-bold text-text-primary mb-3 md:mb-4 text-sm md:text-base uppercase tracking-widest">Natija tahlili</h3>
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            {/* Donut row — on mobile horizontally centered & evenly spaced */}
            <div className="flex items-center justify-around md:justify-start md:gap-4 flex-wrap">
              <DonutChart value={r.correct} max={r.total} color="rgb(var(--color-success))" size={64} label="To'g'ri" />
              <DonutChart value={r.wrong} max={r.total} color="rgb(var(--color-error))" size={64} label="Noto'g'ri" />
              <DonutChart value={pct} color="rgb(var(--color-accent))" size={64} label="Umumiy %" />
            </div>
            <div className="flex-1 space-y-3 w-full min-w-0">
              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1 gap-2">
                  <span className="truncate flex items-center gap-1.5"><Icon name="check" size={12} className="text-success flex-shrink-0" /> To'g'ri javoblar</span>
                  <span className="font-data font-bold text-text-primary flex-shrink-0">{r.correct}/{r.total}</span>
                </div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: r.total ? `${(r.correct/r.total)*100}%` : '0%', background: 'rgb(var(--color-success))' }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-text-secondary mb-1 gap-2">
                  <span className="truncate flex items-center gap-1.5"><Icon name="x" size={12} className="text-error flex-shrink-0" /> Noto'g'ri javoblar</span>
                  <span className="font-data font-bold text-text-primary flex-shrink-0">{r.wrong}/{r.total}</span>
                </div>
                <div className="progress-bar h-2"><div className="progress-fill" style={{ width: r.total ? `${(r.wrong/r.total)*100}%` : '0%', background: 'rgb(var(--color-error))' }} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* Subject performance — fan kesimi backenddan */}
        <div className="glass rounded-2xl p-4 md:p-6">
          <h3 className="font-display font-bold text-text-primary mb-3 md:mb-4 text-sm md:text-base uppercase tracking-widest">Fanlar bo'yicha o'rtacha</h3>
          {isApi && apiStatsRes.loading && (
            <div className="text-xs text-text-secondary">Yuklanmoqda...</div>
          )}
          {/* Server xatosi va "chindan bo'sh" holatlari farqlanadi — xato
              bo'lsa aniq xabar + qayta urinish, aks holda bo'sh-holat matni. */}
          {isApi && !apiStatsRes.loading && apiStatsRes.error && (
            <div className="rounded-xl border border-error/45 border-l-4 border-l-error bg-ground px-3 py-2 text-xs text-error">
              {OlympyApi.toUserMessage?.(apiStatsRes.error) || "Fan kesimini yuklab bo'lmadi."}{' '}
              <button onClick={() => apiStatsRes.reload()} className="underline font-bold">Qayta urinish</button>
            </div>
          )}
          {isApi && !apiStatsRes.loading && !apiStatsRes.error && subjectBreakdown.length === 0 && (
            <div className="text-xs text-text-secondary">Hali fan kesimida natijalar yo'q.</div>
          )}
          {!isApi && (
            <div className="text-xs text-text-secondary">Fan kesimi faqat akkaunt rejimida ko'rinadi.</div>
          )}
          <div className="space-y-3">
            {subjectBreakdown.map((s, i) => {
              const band = resultSubjectBand(s.avg);
              return (
                <div key={`${s.name}-${i}`}>
                  <div className="flex justify-between items-center text-xs mb-1 gap-2">
                    <span className="text-text-primary truncate min-w-0">
                      <span className="truncate">{s.name}</span>{' '}
                      <span className="text-text-secondary whitespace-nowrap">· <span className="font-data">{s.attempts}</span> ta</span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {/* Holat shakl bilan ham kodlangan: chegarali chip +
                          yozma yorliq, ya'ni signal faqat rangda emas. */}
                      <span className={`chip border bg-ground text-[10px] font-bold py-0.5 ${band.chip}`}>{band.label}</span>
                      <span className="font-data font-bold text-text-primary">{s.avg}%</span>
                    </span>
                  </div>
                  <div className="progress-bar h-2">
                    <div className="progress-fill" style={{ width: `${s.avg}%`, background: band.bar }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Javoblarni ko'rish — faqat backend rejimida va savollar mavjud bo'lsa */}
        {isApi && Array.isArray(fetchedAttempt?.questions_review) && fetchedAttempt.questions_review.length > 0 && (
          <div className="glass rounded-2xl p-4 md:p-6">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display font-bold text-text-primary text-sm md:text-base uppercase tracking-widest">Javoblar tahlili</h3>
              <button
                onClick={() => setReviewOpen(v => !v)}
                aria-expanded={reviewOpen}
                className="btn-ghost text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5"
              >
                <Icon name={reviewOpen ? 'chevronDown' : 'chevronRight'} size={12} />
                {reviewOpen ? 'Yopish' : "Javoblarni ko'rish"}
              </button>
            </div>
            {reviewOpen && (
              <div className="space-y-4 mt-3">
                {fetchedAttempt.questions_review.map((q, idx) => {
                  const difficultyLabel = (() => {
                    const map = { easy: 'Oson', medium: "O'rta", hard: 'Qiyin', beginner: 'Beginner', elementary: 'Elementary', 'pre-int': 'Pre-Int', int: 'Intermediate', 'upper-int': 'Upper-Int', advanced: 'Advanced' };
                    return map[q.difficulty] || q.difficulty || '';
                  })();
                  // Kod (IT) savol — variantlar o'rniga yuborilgan kod + AI bahosi.
                  if (q.question_type === 'code') {
                    return (
                      <div key={q.id} className="rounded-2xl p-3 md:p-4 border border-edge border-l-4 border-l-accent-2 bg-surface-2">
                        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-text-secondary text-xs font-bold font-data">#{idx + 1}</span>
                            <span className="chip border border-accent-2/45 bg-ground text-accent-2 text-[10px] font-bold">{'</> '}{q.code_language || q.programming_language || 'kod'}</span>
                            {difficultyLabel && (
                              <span className="chip border border-edge bg-ground text-text-secondary text-[10px]">{difficultyLabel}</span>
                            )}
                            <span className="chip border border-edge bg-ground text-text-secondary text-[10px]"><span className="font-data">{q.score || 0}</span> ball</span>
                          </div>
                          {typeof q.ai_code_score === 'number' && (
                            <span className="chip text-[10px] border border-edge-strong bg-ground text-text-primary font-bold">AI: <span className="font-data">{q.ai_code_score}/100</span></span>
                          )}
                        </div>
                        <div className="text-text-primary text-sm font-medium mb-3 break-words whitespace-pre-wrap"><MathText text={q.text} /></div>
                        <ResultFieldLabel>Sizning kodingiz</ResultFieldLabel>
                        {/* ManagerDashboard'dagi yuborilgan kod bloki bilan bir
                            xil: `bg-black/30` o'rniga token yuzasi (qog'oz
                            mavzuda qora plastinka o'qilmasdi). */}
                        <pre className="text-xs font-mono text-text-primary bg-ground rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-words border border-edge">{q.submitted_code || '(kod yuborilmagan)'}</pre>
                        {q.ai_code_review && (
                          <div className="mt-3">
                            <ResultFieldLabel>AI tavsiyasi</ResultFieldLabel>
                            <div className="rounded-xl bg-ground border border-edge border-l-4 border-l-accent-2 p-3 text-xs text-text-primary whitespace-pre-wrap break-words">{q.ai_code_review}</div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={q.id} className={`rounded-2xl p-3 md:p-4 border border-edge border-l-4 bg-surface-2 ${q.is_correct ? 'border-l-success' : (q.chosen_answer == null ? 'border-l-warning' : 'border-l-error')}`}>
                      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text-secondary text-xs font-bold font-data">#{idx + 1}</span>
                          {difficultyLabel && (
                            <span className="chip border border-edge bg-ground text-text-secondary text-[10px]">{difficultyLabel}</span>
                          )}
                          <span className="chip border border-edge bg-ground text-text-secondary text-[10px]"><span className="font-data">{q.score || 0}</span> ball</span>
                        </div>
                        {/* Holat chipi: ikonka (shakl) + yozma yorliq + rang —
                            uchala kanal. Avval faqat rang va ✓/✗ belgisi bor
                            edi, matni esa rangli fonda 3:1 dan past chiqardi. */}
                        <span className={`chip border bg-ground text-[10px] font-bold ${q.is_correct ? 'border-success/45 text-success' : (q.chosen_answer == null ? 'border-warning/45 text-warning' : 'border-error/45 text-error')}`}>
                          <Icon name={q.is_correct ? 'check' : (q.chosen_answer == null ? 'info' : 'x')} size={11} />
                          {q.is_correct ? "To'g'ri" : (q.chosen_answer == null ? "Bo'sh" : "Noto'g'ri")}
                        </span>
                      </div>
                      <div className="text-text-primary text-sm font-medium mb-3 break-words whitespace-pre-wrap"><MathText text={q.text} /></div>
                      {renderReviewAnswer(q)}

                      {/* AI Explanation Button & Content */}
                      <div className="mt-4 pt-3 border-t border-edge space-y-2">
                        {explanations[q.id] ? (
                          <div className="rounded-xl bg-ground border border-edge border-l-4 border-l-accent-2 p-3 text-xs text-text-primary leading-relaxed animate-in">
                            <div className="flex items-center gap-1.5 font-display uppercase tracking-widest text-[10px] text-text-secondary font-bold mb-2">
                              <Icon name="bolt" size={13} className="text-accent-2" />
                              <span>AI yechim tushuntirishi</span>
                            </div>
                            <div className="whitespace-pre-line text-[11px] md:text-xs">
                              {renderMarkdown(explanations[q.id])}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (!isPremium) {
                                setShowPremiumLockModal(true);
                              } else {
                                handleExplain(q.id);
                              }
                            }}
                            disabled={explaining[q.id]}
                            className="btn-ghost text-[11px] px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5"
                          >
                            {explaining[q.id] ? (
                              <>
                                <span className="w-3 h-3 rounded-full border border-edge border-t-accent animate-spin" />
                                Tushuntirish tayyorlanmoqda...
                              </>
                            ) : (
                              <>
                                <Icon name={isPremium ? 'bolt' : 'lock'} size={12} className={isPremium ? 'text-accent-2' : 'text-warning'} />
                                <span>AI yechim tushuntirishi {!isPremium && <span className="text-[9px] border border-warning/45 bg-ground text-warning px-1.5 py-0.5 rounded font-extrabold ml-1">PRO</span>}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions — stack on mobile, row on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 md:gap-3">
          <button onClick={() => { const role = user?.role; onNavigate(role === 'manager' || role === 'teacher' ? 'manager' : role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'student'); }} className="btn-primary py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="home" size={16} /> Profilga o'tish</button>
          <button onClick={() => onNavigate('leaderboard')} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="trophy" size={16} /> Reytingni ko'rish</button>
          <button onClick={() => handleShare()} className="btn-ghost py-3.5 rounded-2xl font-semibold flex items-center justify-center gap-2 text-sm min-h-[48px]"><Icon name="send" size={16} /> Ulashish</button>
        </div>

        {shareToast && (
          <div role="status" className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 glass-strong rounded-2xl px-5 py-3 border-l-4 border-l-accent text-sm font-medium text-text-primary max-w-[calc(100%-1.5rem)] text-center">
            {shareToast}
          </div>
        )}

        {/* Sarlavhadagi 👑 va sakrab turgan 🔒 emojisi olib tashlandi —
            bo'lim belgisi `Icon`, ambient animatsiya yo'q. Tugmadan gradient
            va rangli soya ham olib tashlandi (`.btn-primary` o'zi qattiq
            akcent yuza). */}
        <Modal open={showPremiumLockModal} onClose={() => setShowPremiumLockModal(false)} title="Premium imkoniyat" width="max-w-md">
          <div className="p-4 space-y-4">
            <div className="w-12 h-12 rounded-xl border border-warning/45 bg-ground flex items-center justify-center text-warning">
              <Icon name="lock" size={22} />
            </div>
            <h3 className="font-display text-lg font-bold text-text-primary">AI yechim tushuntirishi faqat Premium o'quvchilarga ochiq</h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Nega bu xatoga yo'l qo'yganingizni va to'g'ri yechim yo'lini batafsil tahlil qilish uchun AI o'qituvchi yordamidan foydalaning.
            </p>
            <div className="pt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowPremiumLockModal(false);
                  if (onNavigate) onNavigate('premium');
                }}
                className="btn-primary py-3 rounded-xl font-bold text-sm"
              >
                Premiumga o'tish
              </button>
              <button
                onClick={() => setShowPremiumLockModal(false)}
                className="btn-ghost py-2 rounded-xl text-xs font-semibold"
              >
                Yopish
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );

  // Web Share API yoki clipboard fallback. Backend kerak emas.
  function handleShare() {
    const text = `${r.olympiad?.title || 'Olimpiada'} natijasi: ${pct}/100${r.rank ? ` · #${r.rank}-o'rin` : ''}`;
    const url = (typeof window !== 'undefined' && window.location?.href) || '';
    const showToast = (m) => { setShareToast(m); setTimeout(() => setShareToast(''), 2500); };
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Olympy natija', text, url }).catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${text} ${url}`.trim())
        .then(() => showToast('Natija nusxalandi'))
        .catch(() => showToast('Nusxalab bo\'lmadi'));
      return;
    }
    showToast('Brauzer ulashishni qo\'llab-quvvatlamaydi');
  }

  if (embedded) return content;
  return content;
};

Object.assign(window, { ResultsPage });
