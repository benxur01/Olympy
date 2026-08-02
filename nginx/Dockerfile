# Olympy frontend (Vite build) + Nginx reverse proxy.
#
# Build context — REPO ILDIZI (docker-compose.yml: build.context: .), chunki
# Vite build'iga ildizdagi fayllar kerak: package*.json, vite.config.js,
# Olympy.html, app.jsx, shared.jsx, pages/, src/, public/, scripts/.
# Nima yuborilishi/yuborilmasligi ildizdagi .dockerignore'da.

# ── 1-bosqich: frontend build ───────────────────────────────────────────────
# Debian-slim (alpine emas): sharp/esbuild kabi native modullar uchun glibc
# prebuild'lari eng keng qo'llab-quvvatlanadi. Bu bosqich yakuniy image'ga
# tushmaydi — faqat dist/ ko'chiriladi.
FROM node:22-bookworm-slim AS frontend

# playwright (devDependency) o'rnatilganda ~400MB brauzer yuklab oladi.
# Build'da u kerak emas (faqat `npm run smoke` uchun) — o'chirib qo'yamiz.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /build

# Lockfile alohida qatlamda — kod o'zgarganda npm qayta ishlamaydi.
# `npm ci` (npm install emas): lockfile'ga qat'iy amal qiladi, ya'ni deploy
# aynan lokalda sinalgan versiyalarni oladi.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* qiymatlari build PAYTIDA bundle ichiga yoziladi (runtime env yo'q!),
# shuning uchun ular ARG sifatida keladi. O'zgartirilsa image qayta build
# qilinishi shart.
#
# VITE_API_BASE_URL default '/' — nginx frontend va API'ni BITTA domendan
# beradi, shuning uchun so'rovlar nisbiy yo'l bilan ketadi:
# src/services/api.js → ('/').replace(/\/+$/,'') → '' → `/api/...`.
# DIQQAT: bo'sh satr BERMANG — api.js `||` fallback'i eski Render manziliga
# (https://olympy-api.onrender.com) qaytib ketadi va migratsiya "ishlagandek"
# ko'rinib, aslida hali Render'ga urib turadi.
# API alohida subdomenda bo'lsa: --build-arg VITE_API_BASE_URL=https://api.domen.uz
ARG VITE_API_BASE_URL=/
ARG VITE_SENTRY_DSN=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# `npm run build` avval prebuild (scripts/generate-vite-entry.mjs) ni ishga
# tushiradi — u Olympy.html'dagi <script> ro'yxatidan src/olympy-entry.jsx va
# index.html fayllarini generatsiya qiladi (ikkalasi ham .gitignore'da,
# repoda yo'q — shu sababli build'ni o'tkazib yuborib bo'lmaydi).
RUN npm run build

# ── 2-bosqich: nginx ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=frontend /build/dist /usr/share/nginx/html

EXPOSE 80
