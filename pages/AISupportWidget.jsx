// pages/AISupportWidget.jsx — AI Support Floating chat widget with Expand capability

const AISupportWidget = ({ user }) => {
  // visible — HAL QILINMAGAN muammo bormi. "Muammo" eventi (olympy:support_needed
  // yoki olympy:auth_error) kelganda true bo'ladi, foydalanuvchi chatni yopganda
  // yana false'ga qaytadi. Ilgari bu bayroq butun widgetni (launcher bilan
  // birga) yashirardi; endi u faqat launcher ustidagi diqqat belgisini
  // boshqaradi — launcherning o'zi doim ko'rinadi (pastdagi izohga qarang).
  const [visible, setVisible] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  // Imtihon rejimi — api.js dagi `setExamMode()` dan keladigan event.
  // Launcher imtihon ekranini to'sib qo'ymasligi uchun kerak.
  const [examActive, setExamActive] = React.useState(false);

  // Mehmon sessiya endi server HttpOnly cookie orqali (client session_id yubormaydi —
  // IDOR himoyasi). Eski localStorage kalitini tozalaymiz.
  React.useEffect(() => {
    try { localStorage.removeItem('olympy:guestSupportSessionId'); } catch {}
  }, []);
  const sessionId = null;

  const welcomeText = user
    ? `Salom, ${user.firstName || user.first_name || (user.name || user.full_name || '').split(' ')[0] || 'Foydalanuvchi'}! Men Olympy AI virtual yordamchisiman. Sizga qanday yordam bera olaman?`
    : `Salom! Men Olympy AI virtual yordamchisiman. Kirish yoki ro'yxatdan o'tishda muammo bo'ldimi? Sizga qanday yordam bera olaman?`;

  const [messages, setMessages] = React.useState([
    {
      role: 'model',
      parts: [{ text: welcomeText }]
    }
  ]);
  const [inputValue, setInputValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const chatEndRef = React.useRef(null);

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Load chat history on mount
  React.useEffect(() => {
    const loadHistory = async () => {
      try {
        const token = OlympyApi.getToken();
        const res = await OlympyApi.getSupportChatHistory(token, sessionId);
        if (res && res.messages && res.messages.length > 0) {
          setMessages(res.messages);
        } else {
          // Tarix bo'sh bo'lsa welcome matnini tiklaymiz
          setMessages([{ role: 'model', parts: [{ text: welcomeText }] }]);
        }
      } catch (err) {
        console.warn('Failed to load support chat history:', err);
      }
    };
    loadHistory();
  }, [sessionId, welcomeText]);

  // "Muammo" eventlarini tinglab AI yordam oynasini avtomatik ko'rsatamiz.
  // Ikkita event qo'llab-quvvatlanadi:
  //   - olympy:auth_error    — eski (login/register/2fa xatosi). Eski dispatch
  //                            joylari (Auth.jsx) buzilmasin uchun saqlanadi.
  //   - olympy:support_needed — yangi umumiy event. detail: { reason, message }.
  //     reason: 'api_error' | 'network_error' | 'payment_error' | 'join_error'
  //             | 'form_errors' | 'auth_error'.
  // Widget default holatda butunlay yashirin (visible=false); shu eventlardan
  // biri kelganda ko'rinadi va ochiladi.
  React.useEffect(() => {
    const openWithContext = (text, isManual = false) => {
      setVisible(true);
      if (isManual) {
        setIsOpen(true);
      }
      if (text) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.parts?.[0]?.text === text) return prev;
          return [...prev, { role: 'model', parts: [{ text }] }];
        });
      }
    };

    const handleAuthError = (e) => {
      const { error, type, manual } = e.detail || {};
      let contextTip = "";
      if (type === 'login') {
        contextTip = `Tizimga kirishda xatolik yuz berdi: "${error}".\nUshbu muammoni hal qilish yoki parolni tiklash bo'yicha yordam kerakmi?`;
      } else if (type === '2fa') {
        contextTip = `Ikki bosqichli tasdiqlash (2FA) kodini tekshirishda xatolik yuz berdi: "${error}".\nKodni qayta yuborish yoki tekshirishda yordam beraymi?`;
      } else if (type === 'register') {
        contextTip = `Ro'yxatdan o'tishda xatolik yuz berdi: "${error}".\nMa'lumotlarni to'g'rilash yoki ro'yxatdan o'tish bo'yicha savolingiz bormi?`;
      } else {
        contextTip = `Muammo yuz berdi: "${error}". Sizga qanday yordam bera olaman?`;
      }
      openWithContext(contextTip, !!manual);
    };

    const handleSupportNeeded = (e) => {
      const { reason, message, manual } = e.detail || {};
      const detailSuffix = message ? `: "${message}"` : '';
      let contextTip;
      switch (reason) {
        case 'api_error':
          contextTip = `Serverda xatolik yuz berdi${detailSuffix}.\nBu vaqtincha muammo bo'lishi mumkin. Nima qilmoqchi edingiz — yordam beraymi?`;
          break;
        case 'network_error':
          // "Internet yo'q" va "server sekin javob berdi" — IKKI BOSHQA muammo.
          // Ilgari ikkalasiga ham bitta matn ("Internet aloqangizni tekshiring")
          // chiqardi: interneti joyida bo'lgan foydalanuvchi bekorga routerini
          // qayta yoqar va bizga "sayt ishlamayapti" deb yozardi. Endi sababni
          // brauzerning o'zidan so'raymiz — `navigator.onLine === false` yagona
          // ishonchli oflayn signali (`true` bo'lishi internet BOR degani emas,
          // shuning uchun faqat aniq `false` ni oflayn deb hisoblaymiz).
          contextTip = (typeof navigator !== 'undefined' && navigator.onLine === false)
            ? `Internet aloqangiz uzilgan ko'rinadi${detailSuffix}.\nUlanish tiklangach qayta urinib ko'ring — ma'lumotlaringiz yo'qolmaydi. Boshqa savolingiz bormi?`
            : `Server javobini kutish cho'zildi${detailSuffix}.\nBu odatda vaqtinchalik holat. Bir ozdan so'ng qayta urinib ko'ring — yordam kerakmi?`;
          break;
        // Imtihon/mashq javoblarini topshirishdagi xato — foydalanuvchi
        // banner ichidagi "Yordam kerakmi?" ni bosganda keladi (qo'lda).
        // Bu eng qimmat vaziyat: o'quvchi javoblari yuborilmagan deb
        // o'ylaydi, shuning uchun xabar aniq va tinchlantiruvchi bo'lsin.
        case 'exam_submit_error':
          contextTip = `Javoblarni topshirishda xatolik chiqdi${detailSuffix}.\nSahifani YOPMANG. Nima bo'lganini tekshirib, keyingi qadamni aytaman — savolingizni yozing.`;
          break;
        case 'payment_error':
          contextTip = `To'lov / tarifni rasmiylashtirishda xatolik yuz berdi${detailSuffix}.\nTo'lov bo'yicha yordam beraymi?`;
          break;
        case 'join_error':
          contextTip = `Markazga qo'shilish (ariza yuborish) da xatolik yuz berdi${detailSuffix}.\nBu bo'yicha yordam beraymi?`;
          break;
        case 'form_errors':
          contextTip = `Formani to'ldirishda xatolik bor${detailSuffix}.\nQaysi maydonni to'g'rilash kerakligini tushuntirib beraymi?`;
          break;
        case 'auth_error':
          contextTip = `Kirish / ro'yxatdan o'tishda xatolik yuz berdi${detailSuffix}.\nSizga qanday yordam bera olaman?`;
          break;
        default:
          contextTip = message
            ? `Muammo yuz berdi: "${message}". Sizga qanday yordam bera olaman?`
            : `Muammo yuz berdi. Sizga qanday yordam bera olaman?`;
      }
      openWithContext(contextTip, !!manual);
    };

    window.addEventListener('olympy:auth_error', handleAuthError);
    window.addEventListener('olympy:support_needed', handleSupportNeeded);
    return () => {
      window.removeEventListener('olympy:auth_error', handleAuthError);
      window.removeEventListener('olympy:support_needed', handleSupportNeeded);
    };
  }, []);

  // Imtihon boshlanishi/tugashini kuzatamiz (OlympiadTest `OlympyApi.setExamMode`
  // chaqiradi, api.js esa shu eventni yuboradi). Faqat launcher yashiriladi —
  // ochiq chat oynasiga tegilmaydi, aks holda imtihon boshlanganda foydalanuvchi
  // yozayotgan savol o'rtada yo'qolib qolardi.
  React.useEffect(() => {
    const handleExamMode = (e) => setExamActive(!!e.detail?.active);
    window.addEventListener('olympy:exam_mode', handleExamMode);
    return () => window.removeEventListener('olympy:exam_mode', handleExamMode);
  }, []);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputValue.trim();
    if (!text) return;
    if (!textToSend) setInputValue('');

    const newMessages = [
      ...messages,
      { role: 'user', parts: [{ text }] }
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const token = OlympyApi.getToken();
      const formattedMessages = newMessages.map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const response = await OlympyApi.sendSupportChat(formattedMessages, token, sessionId);
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: response.reply }] }
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: "Kechirasiz, javob olishda xatolik yuz berdi. Iltimos, tarmoq aloqasini tekshirib, qayta urinib ko'ring." }] }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickReplies = [
    { text: "⏳ Ariza holatim qanday?", query: "Mening arizam holati qanday? Qachon tasdiqlanadi?" },
    { text: "🏆 Olimpiada qanday yaratiladi?", query: "Markazda qanday qilib yangi olimpiada yaratishim mumkin?" },
    { text: "💳 Plus/Pro tariflar", query: "Plus va Pro tariflarining narxi va imkoniyatlari qanday?" },
    { text: "🔑 Parolni o'zgartirish", query: "Parolimni qanday o'zgartirsam bo'ladi?" }
  ];

  // Launcher FAQAT xatolik / muammo yuz berganda (visible=true) ko'rinadi.
  // Oddiy holatda butunlay yashirin (null) bo'lib, foydalanuvchiga umuman xalaqit qilmaydi.
  if (!isOpen) {
    if (examActive || !visible) return null;
    return (
      <div
        data-testid="ai-support-helper-card"
        className="fixed bottom-6 right-6 z-[999] max-w-[340px] bg-surface-1 border border-edge-strong shadow-2xl rounded-2xl p-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        <button
          onClick={() => setIsOpen(true)}
          className="flex-1 flex items-center gap-3 text-left group cursor-pointer"
          title="AI yordamchini ochish"
          aria-label="AI yordamchini ochish"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-fill text-on-accent flex items-center justify-center shrink-0 shadow-sm relative">
            <Icon name="sparkles" size={20} />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-surface-1 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-xs text-text-primary group-hover:text-accent transition-colors flex items-center gap-1.5">
              <span>Yordam kerakmi?</span>
            </div>
            <div className="text-[11px] text-text-secondary truncate">
              AI maslahat berishga tayyor
            </div>
          </div>
        </button>
        <button
          onClick={() => setVisible(false)}
          className="p-1.5 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors cursor-pointer shrink-0"
          title="Yopish"
          aria-label="Yopish"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
    );
  }

  // Size classes based on isExpanded
  const sizeClasses = isExpanded
    ? "fixed inset-0 md:inset-auto md:bottom-6 md:right-6 w-full h-full md:w-[640px] md:h-[780px] md:max-h-[85vh] rounded-none md:rounded-3xl border-0 md:border md:border-edge-strong"
    : "fixed inset-0 md:inset-auto md:bottom-6 md:right-6 w-full h-full md:w-[384px] md:h-[550px] md:max-h-[80vh] rounded-none md:rounded-3xl border-0 md:border md:border-edge-strong";

  return (
    <div
      data-testid="ai-support-chat-modal"
      className={`${sizeClasses} z-[999] flex flex-col overflow-hidden bg-surface-1 transition-all duration-300`}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-edge flex items-center justify-between bg-surface-2">
        <div className="flex items-center gap-3">
          {/* Ustida belgi turgan to'ldirilgan yuza — `accent-fill` + `on-accent`
              (avval indigo→binafsha gradient edi; Tailwind remap uni
              qizil→ko'k gradientga aylantirib qo'ygandi). */}
          <div className="w-10 h-10 rounded-xl bg-accent-fill text-on-accent flex items-center justify-center relative">
            <Icon name="sparkles" size={20} />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full border-2 border-surface-2" />
          </div>
          <div>
            <div className="font-bold text-sm text-text-primary tracking-tight">Olympy AI Yordamchi</div>
            <div className="text-[11px] text-text-secondary flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 bg-success rounded-full" />
              Faol · Tezkor javob
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Maximize / Minimize toggle button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-1 transition-colors cursor-pointer"
            title={isExpanded ? "Kichraytirish" : "Kengaytirish"}
            aria-label={isExpanded ? "Kichraytirish" : "Kengaytirish"}
          >
            {isExpanded ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3M10 14l-7 7M21 3l-7 7" />
              </svg>
            )}
          </button>
          {/* Close button */}
          <button
            onClick={() => {
              // Yopilganda widget yana to'liq yashirin holatga qaytadi —
              // keyingi "muammo" eventi kelmaguncha ko'rinmaydi.
              setIsOpen(false);
              setIsExpanded(false);
              setVisible(false);
            }}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-1 transition-colors cursor-pointer"
            title="Yopish"
            aria-label="Yopish"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          const isAdmin = m.role === 'admin';
          const textContent = m.parts?.[0]?.text || '';
          return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-accent-fill text-on-accent font-medium rounded-tr-none'
                    : isAdmin
                    ? 'bg-surface-2 text-warning border border-warning/45 rounded-tl-none font-semibold'
                    : 'bg-surface-2 text-text-primary border border-edge rounded-tl-none'
                }`}
              >
                {isAdmin && (
                  <div className="text-[10px] text-warning font-bold uppercase mb-1 flex items-center gap-1">
                    <span>👑 Platforma Admini</span>
                  </div>
                )}
                {textContent.split('\n').map((line, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {line}
                    {lIdx < textContent.split('\n').length - 1 && <br />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-2 text-text-secondary border border-edge rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce motion-reduce:animate-none" style={{ animationDelay: '300ms' }} />
              AI javob bermoqda...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick suggestions chips */}
      {messages.length === 1 && !loading && (
        <div className="px-5 py-2 overflow-x-auto flex gap-2 no-scrollbar border-t border-edge">
          {quickReplies.map((r, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(r.query)}
              className="whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-2 border border-edge hover:border-edge-strong transition-colors duration-200 cursor-pointer"
            >
              {r.text}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-4 border-t border-edge flex gap-2 items-center"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Muammoingizni yozing..."
          disabled={loading}
          className="input-field flex-1 rounded-2xl text-sm"
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim()}
          className="btn-primary w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 disabled:opacity-50"
          aria-label="Yuborish"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
};

Object.assign(window, { AISupportWidget });
