# Olympy backend uchun yagona production image (Django + Gunicorn + Celery).
#
# Bitta image — uchala rol ham shu yerdan ishlaydi, farqi faqat compose'dagi
# `command:` da (docker-entrypoint.sh: web | worker | beat | release).
# Alohida Dockerfile'lar qilinmadi: bog'liqliklar va kod bir xil, faqat
# ishga tushirish buyrug'i farq qiladi.
#
# Build context: `backend/` (docker-compose.yml: build.context: ./backend).
FROM python:3.12-slim

# PYTHONDONTWRITEBYTECODE — konteynerda .pyc keraksiz (image qatlamini
# shishiradi). PYTHONUNBUFFERED — log'lar buferlanmasdan darhol stdout'ga
# chiqadi (`docker compose logs` real vaqtda ko'rsatsin).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# fonts-dejavu-core / fonts-liberation — sertifikat va hisobot rasmlari
#   (attempts/certificates.py, accounts/reports.py) Pillow orqali AYNAN
#   /usr/share/fonts/truetype/{lato,liberation,dejavu} yo'llaridagi TTF
#   shriftlarni qidiradi. Slim image'da ular yo'q va kod jimgina
#   ImageFont.load_default() (mayda bitmap shrift) ga tushadi — sertifikat
#   buzilib chiqadi, ammo hech qanday xato bermaydi. Shu sababli shriftlar
#   MAJBURIY bog'liqlik.
# tzdata — settings.py TIME_ZONE='Asia/Tashkent'; slim image'da tizim vaqt
#   zonasi bazasi yo'q va zoneinfo ZoneInfoNotFoundError beradi.
# curl — compose healthcheck /api/health/ ni shu orqali so'raydi.
RUN apt-get update && apt-get install -y --no-install-recommends \
        fonts-dejavu-core \
        fonts-liberation \
        tzdata \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# requirements alohida qatlamda — ilova kodi o'zgarganda pip qayta ishlamaydi
# (Docker layer cache). psycopg[binary] va Pillow wheel bilan keladi, shuning
# uchun kompilyator (build-essential) kerak emas.
#
# `requirements.txt` EMAS, `requirements.lock` o'rnatiladi. Sabab (audit):
# requirements.txt faqat `>=` oralig'ini beradi, ya'ni o'rnatiladigan aniq
# versiya build KESHI qachon bekor bo'lganiga qarab o'zgarardi — deploy
# takrorlanmas edi va xavfsizlik patchi rejalashtirilgan bump orqali emas,
# tasodifan tushardi. Lock aynan bitta versiyani qotirib qo'yadi.
#
# `--require-hashes`: lock'dagi har bir paket SHA256 hash bilan yozilgan, pip
# esa mos kelmagan artefaktni rad etadi. Bu PyPI hisobi buzilishi yoki
# oradagi proxy paketni almashtirib qo'yishidan himoya qiladi.
#
# Lock Python 3.12 uchun generatsiya qilingan — YUQORIDAGI `FROM
# python:3.12-slim` bilan bir xil bo'lishi SHART. Base image versiyasi
# o'zgarsa lock ham qayta generatsiya qilinsin:
#     uv pip compile requirements.txt --python-version 3.12 \
#         --generate-hashes --no-header -o requirements.lock
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /app/requirements.lock

COPY . /app
RUN chmod +x /app/docker-entrypoint.sh

# Non-root foydalanuvchi. staticfiles/ va media/ ATAYIN image ichida oldindan
# yaratiladi va `app` egaligiga o'tkaziladi: named volume BIRINCHI marta
# ulanganda Docker shu katalogning egaligini volume'ga ko'chiradi. Aks holda
# volume root egaligida qolib, collectstatic va media yozish "Permission
# denied" berardi.
RUN adduser --system --group --no-create-home app \
    && mkdir -p /app/staticfiles /app/media \
    && chown -R app:app /app
USER app

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["web"]
