// CodeMirror 6 lazy loader.
//
// `pages/*.jsx` manba fayllari `type="text/babel"` rejimida ishlaydi va ESM
// `import` qila olmaydi (faqat globallar — React, OlympyApi, DOMPurify orqali).
// Shu sababli CodeMirror modullarini bu ESM faylda dinamik `import()` orqali
// yuklab, `globalThis.OlympyCodeMirror.load()` funksiyasini ochamiz.
//
// Dinamik import — Vite bundle'da alohida chunk hosil qiladi va FAQAT
// `load()` birinchi marta chaqirilganda (ya'ni question_type === 'code'
// bo'lgan savol ko'rsatilganda) yuklanadi. Oddiy MCQ olimpiadalar uchun
// CodeMirror umuman yuklanmaydi.

let _cachedModulesPromise = null;

async function _loadModules() {
  if (_cachedModulesPromise) return _cachedModulesPromise;
  _cachedModulesPromise = (async () => {
    const [
      view,
      state,
      commands,
      language,
      langPython,
      langJavascript,
      langJava,
      langCpp,
      themeOneDark,
    ] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/lang-python'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/lang-java'),
      import('@codemirror/lang-cpp'),
      import('@codemirror/theme-one-dark'),
    ]);
    return {
      view,
      state,
      commands,
      language,
      langPython,
      langJavascript,
      langJava,
      langCpp,
      themeOneDark,
    };
  })();
  return _cachedModulesPromise;
}

function _languageExtension(modules, language) {
  const lang = String(language || '').trim().toLowerCase();
  try {
    if (lang === 'python' || lang === 'py') return modules.langPython.python();
    if (lang === 'javascript' || lang === 'js' || lang === 'node') {
      return modules.langJavascript.javascript();
    }
    if (lang === 'java') return modules.langJava.java();
    if (lang === 'cpp' || lang === 'c++' || lang === 'c') {
      return modules.langCpp.cpp();
    }
  } catch {
    /* til kengaytmasi yuklanmasa — oddiy matn rejimida davom etadi */
  }
  return null;
}

// Loyiha dizayniga mos (#050508 fon) minimal qora tema. one-dark ustiga
// foydalanuvchi qatlami sifatida qo'yiladi.
function _baseTheme(EditorView) {
  return EditorView.theme(
    {
      '&': {
        fontSize: '13px',
        borderRadius: '14px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      },
      '.cm-scroller': {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        lineHeight: '1.6',
      },
      '.cm-content': { padding: '10px 0' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'rgba(255,255,255,0.25)',
      },
      '&.cm-focused': { outline: 'none', borderColor: 'rgba(99,102,241,0.5)' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    },
    { dark: true },
  );
}

/**
 * CodeMirror editor yaratadi.
 * @param {Object} opts
 * @param {HTMLElement} opts.parent - editor joylashadigan DOM element
 * @param {string} opts.value - boshlang'ich kod
 * @param {string} opts.language - dasturlash tili (python/javascript/java/cpp/c)
 * @param {boolean} opts.readOnly - faqat o'qish rejimi
 * @param {string} opts.height - balandlik (CSS, masalan '300px')
 * @param {(value:string)=>void} opts.onChange - matn o'zgarganda chaqiriladi
 * @returns {Promise<{view, setValue, destroy}>}
 */
async function createEditor(opts) {
  const {
    parent,
    value = '',
    language = '',
    readOnly = false,
    height = '300px',
    onChange,
  } = opts || {};
  const modules = await _loadModules();
  const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } =
    modules.view;
  const { EditorState, Compartment } = modules.state;
  const { defaultKeymap, history, historyKeymap, indentWithTab } = modules.commands;
  const { indentUnit, bracketMatching } = modules.language;
  const { oneDark } = modules.themeOneDark;

  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    bracketMatching(),
    indentUnit.of('    '),
    // Tab tugmasi indent qiladi (spec talabi).
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    oneDark,
    _baseTheme(EditorView),
    EditorView.lineWrapping,
    EditorView.theme({ '&': { height, maxHeight: height } }),
    EditorState.readOnly.of(!!readOnly),
    EditorView.editable.of(!readOnly),
  ];

  const langExt = _languageExtension(modules, language);
  if (langExt) extensions.push(langExt);

  if (typeof onChange === 'function') {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    );
  }

  const startState = EditorState.create({ doc: value || '', extensions });
  const editorView = new EditorView({ state: startState, parent });

  return {
    view: editorView,
    setValue(next) {
      const current = editorView.state.doc.toString();
      if (current === next) return;
      editorView.dispatch({
        changes: { from: 0, to: current.length, insert: next || '' },
      });
    },
    destroy() {
      editorView.destroy();
    },
  };
}

globalThis.OlympyCodeMirror = {
  load: _loadModules,
  createEditor,
};

export const OlympyCodeMirror = globalThis.OlympyCodeMirror;
