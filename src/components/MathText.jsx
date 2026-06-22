import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// $...$ (inline) va $$...$$ (block) LaTeX ifodalarini KaTeX bilan render qiladi.
// LaTeX bo'lmagan oddiy matn ham buzilmasdan ko'rsatiladi (kasr 1/2, x^2 kabi
// eski savollar ham to'g'ri chiqadi). Render xatosi bo'lsa — fallback sifatida
// asl matn ko'rsatiladi, hech qachon ilova buzilmaydi.
//
// Eslatma: loyihaning asosiy frontend kodi (pages/*.jsx, shared.jsx) global
// scope'da ishlaydi va ES import qilmaydi — u shared.jsx ichidagi MathText
// nusxasidan foydalanadi. Bu fayl bir xil logikani ESM modul sifatida ham
// taqdim etadi (qayta foydalanish va hujjatlash uchun).

// $$...$$ (block) va $...$ (inline) bo'laklarni ajratuvchi regex.
// Block birinchi navbatda tekshiriladi (ikki dollar). Inline bitta qatorda
// bo'lishi kerak ($ ichida yangi qator bo'lmasin) — bu narx ($5) kabi
// tasodifiy mosliklarni kamaytiradi.
const MATH_SPLIT_RE = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

function renderLatex(latex, displayMode) {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

export default function MathText({ text, className }) {
  const raw = text == null ? '' : String(text);
  if (!raw) {
    return className ? <span className={className} /> : null;
  }

  // Tezkor yo'l: matnda umuman '$' bo'lmasa, KaTeX'ni ishga tushirmaymiz.
  if (raw.indexOf('$') === -1) {
    return <span className={className}>{raw}</span>;
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
            key={index}
            className={isBlock ? 'katex-block' : 'katex-inline'}
            dangerouslySetInnerHTML={{ __html: html }}
          />,
        );
        return;
      } catch (err) {
        // Render bo'lmasa — asl matnni ($...$ bilan) ko'rsatamiz.
        nodes.push(<React.Fragment key={index}>{part}</React.Fragment>);
        return;
      }
    }

    // Oddiy matn bo'lagi.
    nodes.push(<React.Fragment key={index}>{part}</React.Fragment>);
  });

  return <span className={className}>{nodes}</span>;
}
