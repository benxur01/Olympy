import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// $...$ (inline) va $$...$$ (block) LaTeX ifodalarini KaTeX bilan render qiladi,
// shuningdek ```...``` (fenced) va `...` (inline) dasturlash kodini chiroyli
// ko'rsatadi (yengil sintaksis highlight). LaTeX/kod bo'lmagan oddiy matn ham
// buzilmasdan ko'rsatiladi (kasr 1/2, x^2 kabi eski savollar to'g'ri chiqadi).
// Render xatosi bo'lsa — fallback sifatida asl matn ko'rsatiladi, hech qachon
// ilova buzilmaydi.
//
// Eslatma: loyihaning asosiy frontend kodi (pages/*.jsx, shared.jsx) global
// scope'da ishlaydi va ES import qilmaydi — u shared.jsx ichidagi MathText
// nusxasidan foydalanadi. Bu fayl bir xil logikani ESM modul sifatida ham
// taqdim etadi (qayta foydalanish va hujjatlash uchun).

// $$...$$ (block) va $...$ (inline) bo'laklarni ajratuvchi regex.
const MATH_SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
// ```lang\n...\n``` (fenced) yoki `...` (inline) kod bo'laklari.
const CODE_SPLIT_RE = /(```[\s\S]*?```|`[^`\n]+?`)/g;

// Ko'p tilda uchraydigan kalit so'zlar (umumiy to'plam — bitta tilga bog'lanmaydi).
const CODE_KEYWORDS = new Set([
  'abstract', 'and', 'as', 'assert', 'async', 'await', 'bool', 'boolean', 'break', 'byte',
  'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue', 'def', 'default',
  'del', 'delete', 'do', 'double', 'elif', 'else', 'end', 'enum', 'export', 'extends',
  'extern', 'false', 'final', 'finally', 'float', 'for', 'from', 'func', 'function',
  'global', 'goto', 'if', 'implements', 'import', 'in', 'include', 'inline', 'instanceof',
  'int', 'interface', 'is', 'lambda', 'let', 'long', 'namespace', 'new', 'nil', 'none',
  'not', 'null', 'nullptr', 'operator', 'or', 'package', 'pass', 'private', 'protected',
  'public', 'raise', 'return', 'self', 'short', 'signed', 'sizeof', 'static', 'std',
  'string', 'struct', 'super', 'switch', 'template', 'this', 'throw', 'throws', 'true',
  'try', 'typedef', 'typename', 'typeof', 'union', 'unsigned', 'using', 'var', 'virtual',
  'void', 'volatile', 'while', 'with', 'yield',
]);

const escapeHtml = (str) => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Bitta kod bo'lagini token-token ranglaydi va HTML qaytaradi (XSS xavfsiz).
const highlightCodeToHtml = (code) => {
  const TOKEN_RE = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d.]*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = TOKEN_RE.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, m.index));
    last = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) {
      out += `<span class="tok-comment">${escapeHtml(m[1])}</span>`;
    } else if (m[2] !== undefined) {
      out += `<span class="tok-string">${escapeHtml(m[2])}</span>`;
    } else if (m[3] !== undefined) {
      out += `<span class="tok-number">${escapeHtml(m[3])}</span>`;
    } else if (m[4] !== undefined) {
      const word = m[4];
      if (CODE_KEYWORDS.has(word)) {
        out += `<span class="tok-keyword">${escapeHtml(word)}</span>`;
      } else if (code[TOKEN_RE.lastIndex] === '(') {
        out += `<span class="tok-function">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    }
  }
  out += escapeHtml(code.slice(last));
  return out;
};

function renderLatex(latex, displayMode) {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

// Faqat matematikani render qiladi (kod bo'laklari allaqachon ajratilgan).
function renderMathParts(raw, keyBase) {
  if (raw.indexOf('$') === -1) {
    return [<React.Fragment key={`${keyBase}t`}>{raw}</React.Fragment>];
  }
  const nodes = [];
  const parts = raw.split(MATH_SPLIT_RE);
  parts.forEach((part, index) => {
    if (!part) return;
    const isBlock = part.length >= 4 && part.startsWith('$$') && part.endsWith('$$');
    const isInline = !isBlock && part.length >= 2 && part.startsWith('$') && part.endsWith('$');
    if (isBlock || isInline) {
      const latex = isBlock ? part.slice(2, -2) : part.slice(1, -1);
      try {
        const html = renderLatex(latex, isBlock);
        nodes.push(
          <span
            key={`${keyBase}-${index}`}
            className={isBlock ? 'katex-block' : 'katex-inline'}
            dangerouslySetInnerHTML={{ __html: html }}
          />,
        );
        return;
      } catch (err) {
        nodes.push(<React.Fragment key={`${keyBase}-${index}`}>{part}</React.Fragment>);
        return;
      }
    }
    nodes.push(<React.Fragment key={`${keyBase}-${index}`}>{part}</React.Fragment>);
  });
  return nodes;
}

export default function MathText({ text, className }) {
  const raw = text == null ? '' : String(text);
  if (!raw) {
    return className ? <span className={className} /> : null;
  }

  const hasCode = raw.indexOf('`') !== -1;
  const hasMath = raw.indexOf('$') !== -1;
  // Maxsus belgi bo'lmasa — tezkor yo'l, oddiy matn.
  if (!hasCode && !hasMath) {
    return <span className={className}>{raw}</span>;
  }

  // Kod yo'q bo'lsa — to'g'ridan-to'g'ri matematikani render qilamiz.
  if (!hasCode) {
    return <span className={className}>{renderMathParts(raw, 'm')}</span>;
  }

  // Avval kod bo'laklarini ajratamiz (ular ichidagi '$' matematik emas).
  const segments = raw.split(CODE_SPLIT_RE);
  const nodes = [];
  segments.forEach((seg, index) => {
    if (!seg) return;
    const isFenced = seg.length >= 6 && seg.startsWith('```') && seg.endsWith('```');
    const isInlineCode = !isFenced && seg.length >= 2 && seg.startsWith('`') && seg.endsWith('`');

    if (isFenced) {
      let body = seg.slice(3, -3);
      const nl = body.indexOf('\n');
      let lang = '';
      if (nl !== -1) {
        const firstLine = body.slice(0, nl).trim();
        if (/^[A-Za-z0-9+#._-]{0,20}$/.test(firstLine)) {
          lang = firstLine;
          body = body.slice(nl + 1);
        }
      }
      body = body.replace(/^\n+/, '').replace(/\n+$/, '');
      try {
        const html = highlightCodeToHtml(body);
        nodes.push(
          <pre key={`c-${index}`} className="code-block">
            {lang ? <span className="code-lang">{lang}</span> : null}
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>,
        );
      } catch (err) {
        nodes.push(<pre key={`c-${index}`} className="code-block"><code>{body}</code></pre>);
      }
      return;
    }

    if (isInlineCode) {
      const body = seg.slice(1, -1);
      nodes.push(<code key={`ic-${index}`} className="code-inline">{body}</code>);
      return;
    }

    nodes.push(
      <React.Fragment key={`s-${index}`}>{renderMathParts(seg, `m${index}`)}</React.Fragment>,
    );
  });

  return <span className={className}>{nodes}</span>;
}
