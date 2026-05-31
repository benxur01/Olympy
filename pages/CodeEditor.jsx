// pages/CodeEditor.jsx
//
// CodeMirror 6 ustidagi yengil React wrapper. IT (kod) savollari uchun.
// CodeMirror'ning o'zi dinamik import orqali (globalThis.OlympyCodeMirror)
// faqat shu komponent birinchi marta render qilinganda yuklanadi — oddiy
// MCQ olimpiadalarda bundle yuklanmaydi.
//
// Props:
//   value      — kod matni (controlled)
//   onChange   — (nextValue) => void; readOnly bo'lsa ishlatilmaydi
//   language   — 'python' | 'javascript' | 'java' | 'cpp' | 'c'
//   readOnly   — faqat o'qish rejimi (boshlang'ich kod skeletni ko'rsatish uchun)
//   height     — CSS balandlik, default '300px'

const CodeEditor = ({ value = '', onChange, language = 'python', readOnly = false, height = '300px' }) => {
  const hostRef = React.useRef(null);
  const editorRef = React.useRef(null);
  const onChangeRef = React.useRef(onChange);
  const [loadError, setLoadError] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  // onChange'ni ref'da saqlaymiz — editor faqat bir marta yaratiladi, lekin
  // har doim oxirgi callback'ni chaqiradi (stale closure'ni oldini olish).
  React.useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Editorni yaratish — language/readOnly o'zgarsa qayta yaratiladi (CodeMirror
  // til kengaytmasini runtime'da almashtirish murakkab, shu sababli re-create
  // soddaroq va kod savollar uchun til kamdan-kam o'zgaradi).
  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;

    const cm = globalThis.OlympyCodeMirror;
    if (!cm || typeof cm.createEditor !== 'function') {
      setLoadError(true);
      return undefined;
    }

    setLoadError(false);
    setReady(false);
    cm.createEditor({
      parent: host,
      value: value || '',
      language,
      readOnly,
      height,
      onChange: (next) => {
        if (typeof onChangeRef.current === 'function') onChangeRef.current(next);
      },
    })
      .then((instance) => {
        if (cancelled) { instance.destroy(); return; }
        editorRef.current = instance;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      if (editorRef.current) {
        try { editorRef.current.destroy(); } catch {}
        editorRef.current = null;
      }
      // Host ichidagi DOM'ni tozalaymiz (re-create paytida ikki marta editor
      // joylashmasligi uchun).
      if (host) host.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, height]);

  // value tashqaridan o'zgarsa editor matnini sinxronlaymiz (controlled).
  React.useEffect(() => {
    if (editorRef.current && ready) {
      editorRef.current.setValue(value || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ready]);

  if (loadError) {
    // CodeMirror yuklanmasa — oddiy textarea fallback. Test buzilmaydi.
    return (
      <textarea
        className="input-field font-mono text-xs"
        style={{ height, minHeight: height, resize: 'vertical', tabSize: 4 }}
        value={value || ''}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => { if (!readOnly && onChange) onChange(e.target.value); }}
        onKeyDown={(e) => {
          // Tab tugmasi indent qilsin (textarea fallback'da ham).
          if (e.key === 'Tab' && !readOnly) {
            e.preventDefault();
            const el = e.target;
            const start = el.selectionStart;
            const end = el.selectionEnd;
            const next = (value || '').slice(0, start) + '    ' + (value || '').slice(end);
            if (onChange) onChange(next);
            requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 4; });
          }
        }}
      />
    );
  }

  return (
    // userSelect: 'text' — olimpiada test sahifasi butun `userSelect: none`
    // bilan o'ralgan (matn nusxalashni cheklash uchun). Lekin kod muharririda
    // o'quvchi matn tanlashi/tahrirlashi kerak, shu sababli bu yerda qayta
    // yoqamiz.
    <div style={{ position: 'relative', userSelect: 'text', WebkitUserSelect: 'text' }}>
      <div ref={hostRef} style={{ minHeight: height }} />
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center text-white/40 text-xs glass rounded-2xl"
          style={{ minHeight: height }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            Muharrir yuklanmoqda...
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { CodeEditor });
