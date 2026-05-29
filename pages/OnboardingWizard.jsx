// pages/OnboardingWizard.jsx
// OB1+OB2: Yangi o'quvchi uchun 4 bosqichli kirish sehrgar.
//   1) Qaysi sinf  2) Qaysi fanlar  3) Birinchi maqsad  4) Birinchi g'alaba (mini-test)
// Tugagach POST /api/me/complete-onboarding/ va onUserUpdate orqali user yangilanadi.
// Telegram WebView uchun backdrop-blur va og'ir animatsiyalar ishlatilmaydi.

const ONBOARDING_GRADES = ['8', '9', '10', '11'];

const ONBOARDING_SUBJECTS = [
  'Matematika', 'Fizika', 'Kimyo', 'Biologiya',
  'Ingliz tili', 'Tarix', 'Informatika',
];

const ONBOARDING_GOALS = [
  { key: 'school', label: 'Maktab olimpiadasiga tayyorlanish', icon: '🏫' },
  { key: 'district', label: 'Tuman olimpiadasi', icon: '🏆' },
  { key: 'region', label: 'Viloyat/Respublika', icon: '🌍' },
  { key: 'reinforce', label: 'Faqat bilimni mustahkamlash', icon: '📚' },
];

const OnboardingWizard = ({ user, onComplete, onUserUpdate }) => {
  const { useState } = React;
  const [step, setStep] = useState(0); // 0..3
  const [grade, setGrade] = useState(user?.onboardingGrade || null);
  const [subjects, setSubjects] = useState(
    Array.isArray(user?.onboardingSubjects) ? user.onboardingSubjects : []
  );
  const [goal, setGoal] = useState(user?.onboardingGoal || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Mini-test holati (4-bosqich).
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniQuestions, setMiniQuestions] = useState([]);
  const [miniSubject, setMiniSubject] = useState('');
  const [miniAnswers, setMiniAnswers] = useState({}); // {question_id: option_index}
  const [miniResult, setMiniResult] = useState(null);
  const [miniSubmitting, setMiniSubmitting] = useState(false);

  const toggleSubject = (subj) => {
    setSubjects(prev =>
      prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
    );
  };

  // Onboarding ma'lumotlarini saqlaymiz (3-bosqich tugaganda).
  const saveOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const resp = await globalThis.OlympyApi.completeOnboarding(
        { grade, subjects, goal }, token
      );
      // user obyektini yangilaymiz (App holatida onboardingCompleted=true bo'lsin).
      if (onUserUpdate && user) {
        onUserUpdate({
          ...user,
          onboardingCompleted: true,
          onboardingGrade: resp?.onboarding_grade ?? grade,
          onboardingSubjects: resp?.onboarding_subjects ?? subjects,
          onboardingGoal: resp?.onboarding_goal ?? goal,
        });
      }
      return true;
    } catch (e) {
      setError(globalThis.OlympyApi?.toUserMessage?.(e) || "Saqlab bo'lmadi, qayta urinib ko'ring");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Mini-testni yuklash (4-bosqichga o'tilganda).
  const loadMiniTest = async () => {
    setMiniLoading(true);
    setError(null);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const data = await globalThis.OlympyApi.getOnboardingMiniTest(token);
      setMiniQuestions(Array.isArray(data?.questions) ? data.questions : []);
      setMiniSubject(data?.subject || '');
    } catch (e) {
      setMiniQuestions([]);
    } finally {
      setMiniLoading(false);
    }
  };

  // 3 → 4 bosqich: avval saqlash, keyin mini-testni yuklash.
  const goToMiniTest = async () => {
    const ok = await saveOnboarding();
    if (!ok) return;
    setStep(3);
    loadMiniTest();
  };

  const submitMiniTest = async () => {
    setMiniSubmitting(true);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const answers = Object.entries(miniAnswers).map(([qid, opt]) => ({
        question_id: Number(qid),
        selected_option: opt,
      }));
      const res = await globalThis.OlympyApi.submitOnboardingMiniTest(answers, token);
      setMiniResult(res);
    } catch (e) {
      // Xatolik bo'lsa ham yopilishga ruxsat beramiz.
      setMiniResult({ score: 0, total: miniQuestions.length, percentage: 0, message: 'Natijani hisoblab bo\'lmadi.' });
    } finally {
      setMiniSubmitting(false);
    }
  };

  const finish = () => {
    if (onComplete) onComplete();
  };

  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i === step ? 28 : 8,
            height: 8,
            background: i <= step ? 'linear-gradient(135deg,#6366f1,#a855f7)' : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </div>
  );

  const canNext = (
    (step === 0 && !!grade) ||
    (step === 1 && subjects.length > 0) ||
    (step === 2 && !!goal)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(5,5,8,0.92)' }}
    >
      <div className="glass-strong rounded-3xl w-full max-w-md p-6 sm:p-8 my-auto" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex justify-center mb-5">
          <BrandLogo size="md" />
        </div>
        <StepDots />

        {error && (
          <div className="mb-4 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        {/* Bosqich 1: Sinf */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-1">Qaysi sinfdasiz?</h2>
            <p className="text-sm text-white/50 text-center mb-6">Mos savol va olimpiadalarni tanlash uchun</p>
            <div className="grid grid-cols-2 gap-3">
              {ONBOARDING_GRADES.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`rounded-2xl py-5 text-lg font-bold transition-all ${grade === g ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {g}-sinf
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bosqich 2: Fanlar */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-1">Qaysi fanlar qiziq?</h2>
            <p className="text-sm text-white/50 text-center mb-6">Bir nechtasini tanlashingiz mumkin</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {ONBOARDING_SUBJECTS.map(subj => {
                const active = subjects.includes(subj);
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => toggleSubject(subj)}
                    className={`rounded-full px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-1.5 ${active ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {active && <Icon name="check" size={14} />}
                    {subj}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bosqich 3: Maqsad */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-1">Birinchi maqsadingiz?</h2>
            <p className="text-sm text-white/50 text-center mb-6">Yo'lingizni shu asosda quramiz</p>
            <div className="flex flex-col gap-2.5">
              {ONBOARDING_GOALS.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGoal(g.key)}
                  className={`rounded-2xl px-4 py-4 text-left flex items-center gap-3 transition-all ${goal === g.key ? 'btn-primary' : 'btn-ghost'}`}
                >
                  <span className="text-2xl">{g.icon}</span>
                  <span className="text-sm font-semibold">{g.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bosqich 4: Mini-test / Birinchi g'alaba */}
        {step === 3 && (
          <OnboardingMiniTest
            loading={miniLoading}
            questions={miniQuestions}
            subject={miniSubject}
            answers={miniAnswers}
            setAnswers={setMiniAnswers}
            result={miniResult}
            submitting={miniSubmitting}
            onSubmit={submitMiniTest}
            onFinish={finish}
          />
        )}

        {/* Navigatsiya tugmalari (faqat 0..2 bosqichlarda) */}
        {step < 3 && (
          <div className="flex items-center gap-3 mt-8">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="btn-ghost rounded-xl px-5 py-3 text-sm font-semibold flex items-center gap-1.5"
                disabled={saving}
              >
                <Icon name="arrowLeft" size={15} /> Orqaga
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (step === 2) goToMiniTest();
                else setStep(s => s + 1);
              }}
              disabled={!canNext || saving}
              className="btn-primary rounded-xl px-5 py-3 text-sm font-bold flex-1 flex items-center justify-center gap-1.5"
            >
              {saving ? 'Saqlanmoqda...' : step === 2 ? 'Mini-testni boshlash' : 'Davom etish'}
              {!saving && <Icon name="chevronRight" size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// OB2: Mini-test bosqichi — 5 ta savol va natija ekrani.
const OnboardingMiniTest = ({ loading, questions, subject, answers, setAnswers, result, submitting, onSubmit, onFinish }) => {
  const selectOption = (qid, idx) => {
    if (result) return; // natijadan keyin o'zgartirib bo'lmaydi
    setAnswers(prev => ({ ...prev, [qid]: idx }));
  };
  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id] !== undefined);

  // Natija ekrani
  if (result) {
    const pct = result.percentage ?? 0;
    return (
      <div className="text-center py-2">
        <div className="text-5xl mb-3">{pct >= 80 ? '🏆' : pct >= 50 ? '🎉' : '🌱'}</div>
        <div className="onb-pop text-5xl font-black gradient-text mb-1">{result.score}/{result.total}</div>
        {result.percentile && (
          <div className="inline-block bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm font-bold px-4 py-1.5 rounded-full mb-3">
            {result.percentile}
          </div>
        )}
        <p className="text-sm text-white/70 mb-6 px-2">{result.message}</p>
        <button
          type="button"
          onClick={onFinish}
          className="btn-primary rounded-xl px-6 py-3 text-sm font-bold w-full flex items-center justify-center gap-1.5"
        >
          Platformaga kirish <Icon name="chevronRight" size={15} />
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-10">
        <div className="w-10 h-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin mb-3" />
        <p className="text-sm text-white/50">Savollar tayyorlanmoqda...</p>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-white mb-1">Tayyor!</h2>
        <p className="text-sm text-white/50 mb-6">Profilingiz sozlandi. Endi platformaga kiring.</p>
        <button
          type="button"
          onClick={onFinish}
          className="btn-primary rounded-xl px-6 py-3 text-sm font-bold w-full"
        >
          Platformaga kirish
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white text-center mb-1">Birinchi g'alaba 🚀</h2>
      <p className="text-sm text-white/50 text-center mb-5">
        {subject ? `${subject} bo'yicha ${questions.length} ta savol` : `${questions.length} ta savol`}
      </p>
      <div className="flex flex-col gap-4 max-h-[46vh] overflow-y-auto pr-1">
        {questions.map((q, qi) => (
          <div key={q.id} className="glass rounded-2xl p-4">
            <div className="text-sm font-semibold text-white mb-3">
              <span className="text-white/40 mr-1">{qi + 1}.</span>{q.text}
            </div>
            <div className="flex flex-col gap-2">
              {(q.options || []).map((opt, idx) => {
                const active = answers[q.id] === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectOption(q.id, idx)}
                    className={`text-left rounded-xl px-3 py-2.5 text-sm transition-all ${active ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!allAnswered || submitting}
        className="btn-primary rounded-xl px-6 py-3 text-sm font-bold w-full mt-5"
      >
        {submitting ? 'Tekshirilmoqda...' : 'Natijani ko\'rish'}
      </button>
    </div>
  );
};

Object.assign(window, { OnboardingWizard, OnboardingMiniTest });
