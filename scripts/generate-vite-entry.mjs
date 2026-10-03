import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rollup/parseAst';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sourceHtmlPath = path.join(root, 'Olympy.html');
const srcDir = path.join(root, 'src');
const entryPath = path.join(srcDir, 'olympy-entry.jsx');
const lazyDirName = 'olympy-pages';
const lazyDir = path.join(srcDir, lazyDirName);
const indexPath = path.join(root, 'index.html');

// Faqat o'z marshrutida kerak bo'ladigan og'ir sahifalar entry'ga inline
// qilinmaydi: har biri `src/olympy-pages/<Nom>.jsx` alohida modul bo'lib
// chiqadi va Vite uni alohida chunk qiladi — u sahifa birinchi marta render
// bo'lgandagina yuklanadi. Birinchi ochiladigan sahifalar (Landing, Auth,
// Pricing) va umumiy kod (shared.jsx, store.jsx, app.jsx) entry'da qoladi.
//
// Eager kod lazy sahifadagi nomga faqat JSX komponent sifatida (`<Nom />`)
// murojaat qila oladi — generator bunday nomlar uchun entry'da React.lazy +
// Suspense o'ramini yaratadi. Qiymat sifatida ishlatilsa (funksiya chaqiruvi,
// konstanta) build xato bilan to'xtaydi: bunday yordamchini shared.jsx ga
// ko'chirish yoki sahifani shu ro'yxatdan chiqarish kerak.
const LAZY_PAGES = new Set([
  'pages/RetentionWidgets.jsx',
  'pages/StudentDashboard.jsx',
  'pages/ManagerDashboard.jsx',
  'pages/QuestionCreator.jsx',
  'pages/TeacherDashboard.jsx',
  'pages/OlympiadTest.jsx',
  'pages/Results.jsx',
  'pages/Leaderboard.jsx',
  'pages/Profile.jsx',
  'pages/AdminDashboard.jsx',
  'pages/OwnerDashboard.jsx',
  'pages/Analytics.jsx',
]);

// Lazy sahifa chunki yuklanayotganda ko'rsatiladigan komponent (app.jsx).
const LAZY_FALLBACK = 'AppLoader';

const sourceHtml = fs.readFileSync(sourceHtmlPath, 'utf8');
const localScriptPattern = /<script\s+type="text\/babel"\s+src="([^"]+\.jsx?)"\s*><\/script>/g;
const sourceFiles = [...sourceHtml.matchAll(localScriptPattern)].map(match => match[1]);

if (!sourceFiles.length) {
  throw new Error('No local JSX scripts found in Olympy.html');
}
for (const file of LAZY_PAGES) {
  if (!sourceFiles.includes(file)) {
    throw new Error(`LAZY_PAGES entry ${file} is not listed in Olympy.html`);
  }
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

// Fayl ichida e'lon QILINMAGAN (tashqi) identifikatorlar: nom → { jsx, value }.
// `jsx` — `<Nom />` komponent sifatida, `value` — boshqa har qanday murojaat.
// Izohlar, satrlar, obyekt kalitlari va `a.b` xossalari hisobga olinmaydi,
// ichki scope'da soyalangan nomlar ham tashqi hisoblanmaydi.
const collectFreeReferences = (source) => {
  const refs = new Map();
  const addRef = (name, kind) => {
    const entry = refs.get(name) || { jsx: 0, value: 0 };
    entry[kind] += 1;
    refs.set(name, entry);
  };
  const newScope = (parent) => ({ parent, names: new Set() });
  const isBound = (scope, name) => {
    for (let s = scope; s; s = s.parent) if (s.names.has(name)) return true;
    return false;
  };

  const bindPattern = (pattern, scope) => {
    if (!pattern) return;
    if (pattern.type === 'Identifier') scope.names.add(pattern.name);
    else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties) bindPattern(prop.type === 'RestElement' ? prop.argument : prop.value, scope);
    } else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((el) => bindPattern(el, scope));
    else if (pattern.type === 'RestElement') bindPattern(pattern.argument, scope);
    else if (pattern.type === 'AssignmentPattern') bindPattern(pattern.left, scope);
  };

  // Destrukturlash nishoni: e'londa nomlar bog'lanadi (faqat default qiymat va
  // hisoblangan kalitlar murojaat), tayinlashda esa nomlarning o'zi murojaat.
  const visitTarget = (target, scope, declaring) => {
    if (!target) return;
    if (target.type === 'Identifier') {
      if (!declaring) visit(target, scope);
    } else if (target.type === 'ObjectPattern') {
      for (const prop of target.properties) {
        if (prop.type === 'RestElement') {
          visitTarget(prop.argument, scope, declaring);
        } else {
          if (prop.computed) visit(prop.key, scope);
          visitTarget(prop.value, scope, declaring);
        }
      }
    } else if (target.type === 'ArrayPattern') target.elements.forEach((el) => visitTarget(el, scope, declaring));
    else if (target.type === 'RestElement') visitTarget(target.argument, scope, declaring);
    else if (target.type === 'AssignmentPattern') {
      visitTarget(target.left, scope, declaring);
      visit(target.right, scope);
    } else visit(target, scope);
  };

  const hoistLexical = (statements, scope) => {
    for (const st of statements) {
      if (st.type === 'VariableDeclaration' && st.kind !== 'var') st.declarations.forEach((d) => bindPattern(d.id, scope));
      else if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) scope.names.add(st.id.name);
    }
  };

  // `var` ichki bloklardan ham funksiya (yoki fayl) darajasiga ko'tariladi.
  const hoistVars = (node, scope) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclaration') {
      if (node.kind === 'var') node.declarations.forEach((d) => bindPattern(d.id, scope));
      return;
    }
    if (!/Statement$|^SwitchCase$|^CatchClause$/.test(node.type)) return;
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach((c) => hoistVars(c, scope));
      else hoistVars(child, scope);
    }
  };

  const visitStatements = (statements, scope) => {
    hoistLexical(statements, scope);
    statements.forEach((st) => visit(st, scope));
  };

  const visitJSXName = (name, scope) => {
    if (name.type === 'JSXIdentifier') {
      // Kichik harfli teglar (`div`, `span`) — HTML elementlar, o'zgaruvchi emas.
      if (!/^[a-z]/.test(name.name) && !isBound(scope, name.name)) addRef(name.name, 'jsx');
    } else if (name.type === 'JSXMemberExpression') {
      let object = name.object;
      while (object.type === 'JSXMemberExpression') object = object.object;
      if (object.type === 'JSXIdentifier' && object.name !== 'this' && !isBound(scope, object.name)) {
        addRef(object.name, 'value');
      }
    }
  };

  function visit(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier':
        if (!isBound(scope, node.name)) addRef(node.name, 'value');
        return;
      case 'Program': {
        const s = newScope(null);
        node.body.forEach((st) => hoistVars(st, s));
        visitStatements(node.body, s);
        return;
      }
      case 'BlockStatement':
      case 'StaticBlock':
        visitStatements(node.body, newScope(scope));
        return;
      case 'SwitchStatement': {
        visit(node.discriminant, scope);
        const s = newScope(scope);
        node.cases.forEach((c) => hoistLexical(c.consequent, s));
        for (const c of node.cases) {
          visit(c.test, s);
          c.consequent.forEach((st) => visit(st, s));
        }
        return;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const s = newScope(scope);
        if (node.type === 'FunctionExpression' && node.id) s.names.add(node.id.name);
        node.params.forEach((param) => bindPattern(param, s));
        node.params.forEach((param) => visitTarget(param, s, true));
        if (node.body.type === 'BlockStatement') {
          node.body.body.forEach((st) => hoistVars(st, s));
          visitStatements(node.body.body, s);
        } else {
          visit(node.body, s);
        }
        return;
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        visit(node.superClass, scope);
        const s = newScope(scope);
        if (node.type === 'ClassExpression' && node.id) s.names.add(node.id.name);
        node.body.body.forEach((member) => visit(member, s));
        return;
      }
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty':
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          visitTarget(d.id, scope, true);
          visit(d.init, scope);
        }
        return;
      case 'CatchClause': {
        const s = newScope(scope);
        bindPattern(node.param, s);
        visitTarget(node.param, s, true);
        visit(node.body, s);
        return;
      }
      case 'ForStatement': {
        const s = newScope(scope);
        if (node.init && node.init.type === 'VariableDeclaration') hoistLexical([node.init], s);
        visit(node.init, s);
        visit(node.test, s);
        visit(node.update, s);
        visit(node.body, s);
        return;
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const s = newScope(scope);
        if (node.left.type === 'VariableDeclaration') {
          hoistLexical([node.left], s);
          visit(node.left, s);
        } else {
          visitTarget(node.left, s, false);
        }
        visit(node.right, s);
        visit(node.body, s);
        return;
      }
      case 'AssignmentExpression':
        visitTarget(node.left, scope, false);
        visit(node.right, scope);
        return;
      case 'MemberExpression':
        visit(node.object, scope);
        if (node.computed) visit(node.property, scope);
        return;
      case 'Property':
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;
      case 'LabeledStatement':
        visit(node.body, scope);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'MetaProperty':
      case 'JSXText':
        return;
      case 'JSXElement':
        visitJSXName(node.openingElement.name, scope);
        node.openingElement.attributes.forEach((attr) => visit(attr, scope));
        node.children.forEach((child) => visit(child, scope));
        return;
      case 'JSXAttribute':
        visit(node.value, scope);
        return;
      default:
        for (const [key, child] of Object.entries(node)) {
          if (key === 'type' || key === 'start' || key === 'end') continue;
          if (Array.isArray(child)) child.forEach((c) => visit(c, scope));
          else visit(child, scope);
        }
    }
  }

  visit(parseAst(source, { jsx: true }), null);
  return refs;
};

let entry = `import * as React from 'react';\n`;
entry += `import * as ReactDOMClient from 'react-dom/client';\n`;
entry += `import { createPortal } from 'react-dom';\n\n`;
entry += `import * as Sentry from '@sentry/react';\n`;
entry += `import { OlympyApi } from './services/api.js';\n`;
entry += `import { OlympyOfflineQueue } from './services/offlineQueue.js';\n`;
entry += `import DOMPurify from 'dompurify';\n`;
entry += `import './services/codemirror-loader.js';\n`;
entry += `import './services/recharts-loader.js';\n`;
entry += `import './services/katex-loader.js';\n`;
entry += `import './proctoring/proctorLoader.js';\n`;
entry += `import './proctoring/voiceProctorLoader.js';\n`;
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
entry += `    sendDefaultPii: false,\n`;
entry += `  });\n`;
entry += `}\n\n`;

// Maintain necessary global assignments for backwards compatibility / utility APIs
entry += `globalThis.React = React;\n`;
entry += `globalThis.ReactDOM = { ...ReactDOMClient, createPortal };\n\n`;
entry += `globalThis.OlympyApi = OlympyApi;\n`;
entry += `globalThis.OlympyOfflineQueue = OlympyOfflineQueue;\n`;
entry += `globalThis.DOMPurify = DOMPurify;\n\n`;
entry += `// Ilova yuklanishi bilan backend ulanishini oldindan qizdirish\n`;
entry += `try { OlympyApi?.prewarmApi?.(); } catch (_) {}\n\n`;
// Recharts (admin "Tahlil" diagrammalari) va KaTeX (matematik ifodalar)
// AGARDA kerak bo'lsa lazy tushadi — yuqoridagi `*-loader.js` modullari
// `globalThis.OlympyRecharts` / `globalThis.OlympyKatex` ni ochadi va
// og'ir kutubxonani faqat birinchi `load()` chaqiruvida `import()` qiladi.
// (CodeMirror va proktoring bilan bir xil naqsh.)

// PWA: service worker'ni ro'yxatdan o'tkazish (oflayn rejim + kesh).
// Faqat brauzer qo'llasa va xavfsiz kontekstda (https/localhost) ishlaydi;
// xato yuz bersa ilova oddiy holatda davom etadi.
entry += `if ('serviceWorker' in navigator) {\n`;
entry += `  window.addEventListener('load', () => {\n`;
entry += `    navigator.serviceWorker.register('/sw.js?v=20260724-1').catch(() => {});\n`;
entry += `  });\n`;
entry += `}\n\n`;

// Local module scope object to share components between scopes without polluting globalThis
entry += `const moduleScope = {};\n\n`;

// Entry modul scope'idagi (yuqoridagi import/const) nomlar — lazy modullar
// ularni ham entry'dan import qiladi, ya'ni sahifa kodi inline'dagidek
// aynan shu qiymatlarni ko'radi.
const entryHeaderBindings = new Set();
for (const node of parseAst(entry).body) {
  if (node.type === 'ImportDeclaration') node.specifiers.forEach((s) => entryHeaderBindings.add(s.local.name));
  if (node.type === 'VariableDeclaration') node.declarations.forEach((d) => entryHeaderBindings.add(d.id.name));
}

const modules = sourceFiles.map((file) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return {
    file,
    source,
    names: collectTopLevelNames(source),
    refs: collectFreeReferences(source),
    lazy: LAZY_PAGES.has(file),
    lazyName: path.basename(file).replace(/\.jsx?$/, ''),
  };
});
const lazyModules = modules.filter((mod) => mod.lazy);
if (new Set(lazyModules.map((mod) => mod.lazyName)).size !== lazyModules.length) {
  throw new Error('LAZY_PAGES entries must have unique file names');
}

const definers = new Map();
for (const mod of modules) {
  for (const name of mod.names) {
    if (!definers.has(name)) definers.set(name, []);
    definers.get(name).push(mod);
  }
}
// Inline rejimda umumiy `var` oxirgi e'lon qilgan faylning qiymatini oladi.
// Lazy sahifa ishtirok etgan takroriy nomda bu tartib saqlanmaydi.
const ownerOf = (name) => {
  const owners = definers.get(name);
  if (!owners) return null;
  if (owners.length > 1 && owners.some((mod) => mod.lazy)) {
    throw new Error(`"${name}" is declared in ${owners.map((mod) => mod.file).join(', ')}; a name shared with a lazy page must be declared only once`);
  }
  return owners[owners.length - 1];
};

// Eager koddagi lazy sahifa komponentlari → entry'da React.lazy o'rami.
const lazyComponents = new Map();
for (const mod of modules) {
  if (mod.lazy) continue;
  for (const [name, count] of mod.refs) {
    const owner = ownerOf(name);
    if (!owner?.lazy) continue;
    if (count.value) {
      throw new Error(`${mod.file} uses "${name}" from lazy page ${owner.file} as a value; eager code may only render lazy page exports as JSX (<${name} />). Move "${name}" to shared.jsx or remove ${owner.file} from LAZY_PAGES.`);
    }
    lazyComponents.set(name, owner);
  }
}
const fallbackOwner = ownerOf(LAZY_FALLBACK);
if (lazyComponents.size && (!fallbackOwner || fallbackOwner.lazy)) {
  throw new Error(`Lazy page fallback component ${LAZY_FALLBACK} must be declared in an eager file`);
}

// Lazy sahifa tashqi nomlarni o'sha nomni e'lon qilgan joydan import qiladi:
// eager fayl yoki entry scope'i → entry'dan, boshqa lazy sahifa → o'sha moduldan.
const entryExports = new Set();
for (const mod of lazyModules) {
  mod.entryImports = [];
  mod.pageImports = new Map();
  for (const name of mod.refs.keys()) {
    const owner = ownerOf(name);
    if (owner?.lazy) {
      if (!mod.pageImports.has(owner)) mod.pageImports.set(owner, []);
      mod.pageImports.get(owner).push(name);
    } else if (owner || entryHeaderBindings.has(name)) {
      mod.entryImports.push(name);
      entryExports.add(name);
    }
  }
}

if (lazyComponents.size) {
  entry += `function lazyPage(load, exportName) {\n`;
  entry += `  const Page = React.lazy(() => load().then((mod) => ({ default: mod[exportName] })));\n`;
  entry += `  const LazyPage = (props) => (\n`;
  entry += `    <React.Suspense fallback={<${LAZY_FALLBACK} />}>\n`;
  entry += `      <Page {...props} />\n`;
  entry += `    </React.Suspense>\n`;
  entry += `  );\n`;
  entry += `  LazyPage.displayName = exportName;\n`;
  entry += `  return LazyPage;\n`;
  entry += `}\n`;
  for (const [name, owner] of lazyComponents) {
    entry += `var ${name} = lazyPage(() => import('./${lazyDirName}/${owner.lazyName}.jsx'), '${name}');\n`;
  }
  entry += `\n`;
}

for (const mod of modules) {
  if (mod.lazy) continue;
  entry += `// ${mod.file}\n{\n${mod.source}\n`;
  if (mod.names.length) {
    entry += `\nObject.assign(moduleScope, { ${mod.names.join(', ')} });\n`;
  }
  entry += `}\n`;
  for (const name of mod.names) {
    entry += `var ${name} = moduleScope.${name};\n`;
  }
  entry += `\n`;
}

if (entryExports.size) {
  entry += `export { ${[...entryExports].join(', ')} };\n`;
}

fs.writeFileSync(entryPath, entry);

fs.rmSync(lazyDir, { recursive: true, force: true });
if (lazyModules.length) fs.mkdirSync(lazyDir, { recursive: true });
for (const mod of lazyModules) {
  let code = '';
  if (mod.entryImports.length) {
    code += `import { ${mod.entryImports.join(', ')} } from '../olympy-entry.jsx';\n`;
  }
  for (const [owner, names] of mod.pageImports) {
    code += `import { ${names.join(', ')} } from './${owner.lazyName}.jsx';\n`;
  }
  code += `\nconst moduleScope = {};\n\n// ${mod.file}\n{\n${mod.source}\n`;
  if (mod.names.length) {
    code += `\nObject.assign(moduleScope, { ${mod.names.join(', ')} });\n`;
  }
  code += `}\n`;
  for (const name of mod.names) {
    code += `export var ${name} = moduleScope.${name};\n`;
  }
  fs.writeFileSync(path.join(lazyDir, `${mod.lazyName}.jsx`), code);
}

const indexHtml = sourceHtml
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/react@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/react-dom@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+"[^>]*><\/script>/g, '')
  .replace(/\n\s*<script\s+type="text\/babel"\s+src="[^"]+\.jsx?"\s*><\/script>/g, '')
  .replace('</body>', '  <script type="module" src="/src/olympy-entry.jsx"></script>\n</body>');

fs.writeFileSync(indexPath, indexHtml);
