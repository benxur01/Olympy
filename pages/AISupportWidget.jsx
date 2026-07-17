// pages/AISupportWidget.jsx — AI Support Floating chat widget with Expand capability

const AISupportWidget = ({ user }) => {
  // visible — widget umuman ko'rinadimi. Default: false (butunlay yashirin).
  // Faqat "muammo" eventi (olympy:support_needed yoki olympy:auth_error)
  // kelganda true bo'ladi; foydalanuvchi yopganda yana false'ga qaytadi.
  const [visible, setVisible] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);

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
    const openWithContext = (text) => {
      setVisible(true);
      setIsOpen(true);
      if (text) {
        setMessages(prev => [...prev, { role: 'model', parts: [{ text }] }]);
      }
    };

    const handleAuthError = (e) => {
      const { error, type } = e.detail || {};
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
      openWithContext(contextTip);
    };

    const handleSupportNeeded = (e) => {
      const { reason, message } = e.detail || {};
      const detailSuffix = message ? `: "${message}"` : '';
      let contextTip;
      switch (reason) {
        case 'api_error':
          contextTip = `Serverda xatolik yuz berdi${detailSuffix}.\nBu vaqtincha muammo bo'lishi mumkin. Nima qilmoqchi edingiz — yordam beraymi?`;
          break;
        case 'network_error':
          contextTip = `Server bilan bog'lanishda muammo bo'ldi${detailSuffix}.\nInternet aloqangizni tekshiring yoki bir ozdan so'ng qayta urinib ko'ring. Yordam kerakmi?`;
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
      openWithContext(contextTip);
    };

    window.addEventListener('olympy:auth_error', handleAuthError);
    window.addEventListener('olympy:support_needed', handleSupportNeeded);
    return () => {
      window.removeEventListener('olympy:auth_error', handleAuthError);
      window.removeEventListener('olympy:support_needed', handleSupportNeeded);
    };
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

  // Default holatda butunlay yashirin — foydalanuvchini bezovta qilmasin. Faqat
  // "muammo" eventi kelib visible=true bo'lgandagina biror narsa render bo'ladi.
  if (!visible) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[999] w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 border border-white/10 cursor-pointer"
        title="AI Support"
        aria-label="AI yordamchini ochish"
      >
        <Icon name="sparkles" size={24} />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#050508] animate-pulse" />
      </button>
    );
  }

  // Size classes based on isExpanded
  const sizeClasses = isExpanded
    ? "fixed inset-0 md:inset-auto md:bottom-6 md:right-6 w-full h-full md:w-[640px] md:h-[780px] md:max-h-[85vh] rounded-none md:rounded-3xl border-0 md:border"
    : "fixed inset-0 md:inset-auto md:bottom-6 md:right-6 w-full h-full md:w-[384px] md:h-[550px] md:max-h-[80vh] rounded-none md:rounded-3xl border-0 md:border";

  return (
    <div
      className={`${sizeClasses} z-[999] flex flex-col overflow-hidden shadow-2xl transition-all duration-300`}
      style={{
        background: '#0e1017',
        borderColor: 'rgba(255, 255, 255, 0.08)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-inner relative">
            🤖
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#050508]" />
          </div>
          <div>
            <div className="font-extrabold text-sm text-white tracking-tight">Olympy AI Yordamchi</div>
            <div className="text-[11px] text-white/50 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Faol · Tezkor javob
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Maximize / Minimize toggle button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
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
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
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
                    ? 'bg-indigo-600 text-white font-medium rounded-tr-none'
                    : isAdmin
                    ? 'bg-amber-600/10 text-amber-200 border border-amber-500/20 rounded-tl-none font-semibold'
                    : 'bg-white/8 text-white/90 border border-white/5 rounded-tl-none'
                }`}
              >
                {isAdmin && (
                  <div className="text-[10px] text-amber-400 font-extrabold uppercase mb-1 flex items-center gap-1">
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
          <div className="flex justify-start animate-pulse">
            <div className="bg-white/8 text-white/50 border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              AI javob bermoqda...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick suggestions chips */}
      {messages.length === 1 && !loading && (
        <div className="px-5 py-2 overflow-x-auto flex gap-2 no-scrollbar bg-white/2 border-t border-white/5">
          {quickReplies.map((r, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(r.query)}
              className="whitespace-nowrap shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200 cursor-pointer"
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
        className="p-4 border-t border-white/5 flex gap-2 items-center bg-white/2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Muammoingizni yozing..."
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-indigo-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim()}
          className="w-11 h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Yuborish"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
};

Object.assign(window, { AISupportWidget });
