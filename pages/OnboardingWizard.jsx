// pages/OnboardingWizard.jsx
// Yangi o'quvchi uchun 3 bosqichli kirish sehrgar:
//   0) Qaysi fanlar qiziq  1) Har fan uchun boshlang'ich daraja  2) Tayyor!
// Tugagach POST /api/me/complete-onboarding/ va onUserUpdate orqali user yangilanadi.
// Daraja keyinchalik adaptiv (ELO'ga o'xshash) tarzda har olimpiada natijasiga
// qarab o'zgaradi. Telegram WebView uchun backdrop-blur va og'ir animatsiyalar
// ishlatilmaydi.

const ONBOARDING_SUBJECTS = [
  'Matematika', 'Fizika', 'Kimyo', 'Biologiya',
  'Ingliz tili', 'Tarix', 'Informatika', 'IT',
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const STANDARD_LEVELS = ["Boshlang'ich", "O'rta", "Ilg'or"];
const SUBJECT_LEVEL_MAP = {
  'Ingliz tili': CEFR_LEVELS,
  'Matematika': STANDARD_LEVELS,
  'Fizika': STANDARD_LEVELS,
  'Kimyo': STANDARD_LEVELS,
  'Biologiya': STANDARD_LEVELS,
  'Tarix': STANDARD_LEVELS,
  'Informatika': STANDARD_LEVELS,
  'IT': STANDARD_LEVELS,
};

const OnboardingWizard = ({ user, onComplete, onUserUpdate }) => {
  const { useState } = React;
  const [step, setStep] = useState(0); // 0..2
  const [subjects, setSubjects] = useState(
    Array.isArray(user?.onboardingSubjects) ? user.onboardingSubjects : []
  );
  // { fan: daraja }
  const [subjectLevels, setSubjectLevels] = useState(
    user?.subjectLevels && typeof user.subjectLevels === 'object' ? { ...user.subjectLevels } : {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggleSubject = (subj) => {
    setSubjects(prev =>
      prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]
    );
    // Fan olib tashlansa unga oid darajani ham tozalaymiz.
    setSubjectLevels(prev => {
      if (prev[subj] === undefined) return prev;
      const next = { ...prev };
      delete next[subj];
      return next;
    });
  };

  const selectLevel = (subj, level) => {
    setSubjectLevels(prev => ({ ...prev, [subj]: level }));
  };

  // Onboarding ma'lumotlarini saqlaymiz (1 → 2 bosqichda, barcha darajalar
  // belgilanganda chaqiriladi).
  const saveOnboarding = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = globalThis.OlympyApi?.getToken?.();
      const resp = await globalThis.OlympyApi.completeOnboarding(
        { subjects, subject_levels: subjectLevels }, token
      );
      // user obyektini yangilaymiz (App holatida onboardingCompleted=true bo'lsin).
      if (onUserUpdate && user) {
        onUserUpdate({
          ...user,
          onboardingCompleted: true,
          onboardingSubjects: resp?.onboarding_subjects ?? subjects,
          subjectLevels: resp?.subject_levels ?? subjectLevels,
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

  const finish = () => {
    if (onComplete) onComplete();
  };

  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2].map(i => (
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

  // Bosqich validatsiyalari.
  const allLevelsSet = subjects.length > 0 && subjects.every(s => subjectLevels[s]);
  const canNext = (
    (step === 0 && subjects.length > 0) ||
    (step === 1 && allLevelsSet)
  );

  // 0 → 1 oddiy step; 1 → 2 da avval saqlaymiz.
  const handleNext = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await saveOnboarding();
      if (ok) setStep(2);
    }
  };

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

        {/* Bosqich 0: Fanlar */}
        {step === 0 && (
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

        {/* Bosqich 1: Har fan uchun daraja */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-white text-center mb-1">Darajangizni tanlang</h2>
            <p className="text-sm text-white/50 text-center mb-6">
              Har fan uchun hozirgi darajangizni belgilang — keyin natijalaringizga qarab moslashadi
            </p>
            <div className="flex flex-col gap-4 max-h-[52vh] overflow-y-auto pr-1">
              {subjects.map(subj => {
                const levels = SUBJECT_LEVEL_MAP[subj] || STANDARD_LEVELS;
                return (
                  <div key={subj} className="glass rounded-2xl p-4">
                    <div className="text-sm font-semibold text-white mb-3">{subj}</div>
                    <div className="flex flex-wrap gap-2">
                      {levels.map(level => {
                        const active = subjectLevels[subj] === level;
                        return (
                          <button
                            key={level}
                            type="button"
                            onClick={() => selectLevel(subj, level)}
                            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${active ? 'btn-primary' : 'btn-ghost'}`}
                          >
                            {level}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bosqich 2: Tayyor! */}
        {step === 2 && (
          <div className="text-center py-4">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-white mb-1">Tayyor!</h2>
            <p className="text-sm text-white/60 mb-7 px-2">
              Profilingiz sozlandi. Endi siz uchun mos olimpiada va savollar tayyor —
              natijalaringizga qarab darajangiz avtomatik o'sib boradi.
            </p>
            <button
              type="button"
              onClick={finish}
              className="btn-primary rounded-xl px-6 py-3 text-sm font-bold w-full flex items-center justify-center gap-1.5"
            >
              Platformaga kirish <Icon name="chevronRight" size={15} />
            </button>
          </div>
        )}

        {/* Navigatsiya tugmalari (faqat 0..1 bosqichlarda) */}
        {step < 2 && (
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
              onClick={handleNext}
              disabled={!canNext || saving}
              className="btn-primary rounded-xl px-5 py-3 text-sm font-bold flex-1 flex items-center justify-center gap-1.5"
            >
              {saving ? 'Saqlanmoqda...' : step === 1 ? 'Yakunlash' : 'Keyingi'}
              {!saving && <Icon name="chevronRight" size={15} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { OnboardingWizard });
