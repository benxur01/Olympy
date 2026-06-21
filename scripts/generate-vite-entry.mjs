import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceHtmlPath = path.join(root, 'Olympy.html');
const srcDir = path.join(root, 'src');
const entryPath = path.join(srcDir, 'olympy-entry.jsx');
const indexPath = path.join(root, 'index.html');

const sourceHtml = fs.readFileSync(sourceHtmlPath, 'utf8');
const localScriptPattern = /<script\s+type="text\/babel"\s+src="([^"]+\.jsx?)"\s*><\/script>/g;
const sourceFiles = [...sourceHtml.matchAll(localScriptPattern)].map(match => match[1]);

if (!sourceFiles.length) {
  throw new Error('No local JSX scripts found in Olympy.html');
}

fs.mkdirSync(srcDir, { recursive: true });

const collectTopLevelNames = (source) => {
  const names = new Set();
  const patterns = [
    /^const\s+([A-Za-z_$][\w$]*)\s*=/gm,
    /^let\s+([A-Za-z_$][\w$]*)\s*=/gm,
    /^var\s+([A-Za-z_$][\w$]*)\s*=/gm,
    /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^class\s+([A-Za-z_$][\w$]*)\s*/gm,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      names.add(match[1]);
    }
  }

  return [...names];
};

let entry = `import * as React from 'react';\n`;
entry += `import * as ReactDOMClient from 'react-dom/client';\n`;
entry += `import { createPortal } from 'react-dom';\n\n`;
entry += `import * as Sentry from '@sentry/react';\n`;
entry += `import * as Recharts from 'recharts';\n`;
entry += `import { OlympyApi } from './services/api.js';\n`;
entry += `import DOMPurify from 'dompurify';\n`;
entry += `import './services/codemirror-loader.js';\n`;
entry += `import './index.css';\n\n`;

// Sentry — frontend xato monitoring. Faqat VITE_SENTRY_DSN build paytida
// o'rnatilgan bo'lsa yoqiladi; aks holda init o'tkazib yuboriladi (DSN'siz
// lokal/preview buildlarda xato bermaydi). replaysSessionSampleRate=0 —
// session replay o'chiq (qo'shimcha bundle/trafik yuki bo'lmasin).
entry += `const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;\n`;
entry += `if (SENTRY_DSN) {\n`;
entry += `  Sentry.init({\n`;
entry += `    dsn: SENTRY_DSN,\n`;
entry += `    environment: import.meta.env.MODE,\n`;
entry += `    tracesSampleRate: 0.1,\n`;
entry += `    replaysSessionSampleRate: 0,\n`;
entry += `  });\n`;
entry += `}\n\n`;

// Maintain necessary global assignments for backwards compatibility / utility APIs
entry += `globalThis.React = React;\n`;
entry += `globalThis.ReactDOM = { ...ReactDOMClient, createPortal };\n\n`;
entry += `globalThis.OlympyApi = OlympyApi;\n`;
entry += `globalThis.DOMPurify = DOMPurify;\n`;
entry += `globalThis.Recharts = Recharts;\n\n`;

// PWA: service worker'ni ro'yxatdan o'tkazish (oflayn rejim + kesh).
// Faqat brauzer qo'llasa va xavfsiz kontekstda (https/localhost) ishlaydi;
// xato yuz bersa ilova oddiy holatda davom etadi.
entry += `if ('serviceWorker' in navigator) {\n`;
entry += `  window.addEventListener('load', () => {\n`;
entry += `    navigator.serviceWorker.register('/sw.js?v=20260608-2').catch(() => {});\n`;
entry += `  });\n`;
entry += `}\n\n`;

// Local module scope object to share components between scopes without polluting globalThis
entry += `const moduleScope = {};\n\n`;

for (const file of sourceFiles) {
  const filePath = path.join(root, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const names = collectTopLevelNames(source);

  entry += `// ${file}\n{\n${source}\n`;
  if (names.length) {
    entry += `\nObject.assign(moduleScope, { ${names.join(', ')} });\n`;
  }
  entry += `}\n`;
  for (const name of names) {
    entry += `var ${name} = moduleScope.${name};\n`;
  }
  entry += `\n`;
}

fs.writeFileSync(entryPath, entry);

const indexHtml = sourceHtml
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/react@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/react-dom@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+type="text\/babel"\s+src="[^"]+\.jsx?"\s*><\/script>/g, '')
  .replace('</body>', '  <script type="module" src="/src/olympy-entry.jsx"></script>\n</body>');

fs.writeFileSync(indexPath, indexHtml);
