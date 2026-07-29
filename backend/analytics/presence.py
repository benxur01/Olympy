"""Hozir onlayn foydalanuvchilar (Redis sorted set).

Redis'da bitta sorted set:

    key    = ``online:users``
    member = user id
    score  = oxirgi faollik vaqti (unix timestamp)

Yozish (``record_activity``) — bitta ``ZADD``, idempotent va arzon; har bir
autentifikatsiyalangan so'rovda bajariladi (``accounts.authentication``).

O'qish ikki xil: ``get_online_count`` faqat AGREGAT sonni (``ZCARD``),
``get_online_user_ids`` esa a'zolarning o'zini (``ZRANGE``) qaytaradi. Har
ikkalasi avval oynadan chiqib ketgan a'zolarni ``ZREMRANGEBYSCORE`` bilan
o'chiradi — set har o'qishda o'zini tozalaydi, alohida cleanup task/beat
kerak emas.

Kim onlayn ekani (``get_online_user_ids``) FAQAT platforma admini uchun
ochiq — admin panelidagi "Hozir onlayn" kartasi bosilganda ko'rinadigan
ro'yxat. Boshqa hech qaysi rol bu ma'lumotni ko'ra olmaydi, shu sababli
sanoq endpointi (``/api/analytics/online/``) hamon faqat raqam qaytaradi.

HAMMASI BEST-EFFORT. Redis sozlanmagan (lokal dev) yoki javob bermayotgan
bo'lsa hech qanday istisno ko'tarilmaydi: yozish jimgina o'tkazib yuboriladi,
o'qish esa ``None`` qaytaradi ("ma'lumot yo'q", 0 EMAS — 0 "hech kim yo'q"
degan noto'g'ri xabar bo'lardi). Bu loyihadagi boshqa ixtiyoriy infratuzilma
bilan bir xil yondashuv (``notifications.services.send_web_push`` VAPID kaliti
bo'lmasa jimgina o'tkazib yuboradi).
"""
import logging
import time

from django.conf import settings

logger = logging.getLogger(__name__)

ONLINE_KEY = 'online:users'

# "Onlayn" ta'rifi: oxirgi 3 daqiqada kamida bitta so'rov yuborgan.
ONLINE_WINDOW_SECONDS = 180

# Redis javob bermay qolsa so'rov shundan ko'p kutmasin. `send_web_push`
# (timeout=5) va Telegram (timeout=3) bilan bir xil sabab, lekin bu yerda
# chegara ancha qattiq: bu kod HAR BIR autentifikatsiyalangan so'rovda ishlaydi.
_SOCKET_TIMEOUT_SECONDS = 0.2

# Redis xato bergandan keyin shuncha soniya umuman urinilmaydi. Aks holda
# Redis o'chib qolgan paytda har so'rov timeout'ni kutib turardi.
_FAILURE_BACKOFF_SECONDS = 30

_client = None
_client_built = False
_disabled_until = 0.0


def _get_client():
    """Redis klienti yoki ``None`` (sozlanmagan/yaratib bo'lmasa).

    Klient bir marta yaratiladi va qayta ishlatiladi (redis-py o'z ichida
    thread-safe connection pool tutadi).
    """
    global _client, _client_built
    if not getattr(settings, 'REDIS_CONFIGURED', False):
        return None
    if _client_built:
        return _client
    try:
        import redis

        _client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_timeout=_SOCKET_TIMEOUT_SECONDS,
            socket_connect_timeout=_SOCKET_TIMEOUT_SECONDS,
        )
    except Exception:
        logger.info('[presence-skip] Redis klientini yaratib bo\'lmadi', exc_info=True)
        _client = None
    _client_built = True
    return _client


def _mark_failed():
    global _disabled_until
    _disabled_until = time.time() + _FAILURE_BACKOFF_SECONDS


def record_activity(user_id):
    """Foydalanuvchini "hozir onlayn" deb belgilaydi. Hech qachon otmaydi."""
    if not user_id:
        return
    now = time.time()
    if now < _disabled_until:
        return
    client = _get_client()
    if client is None:
        return
    try:
        client.zadd(ONLINE_KEY, {str(user_id): now})
    except Exception:
        _mark_failed()
        logger.warning(
            '[presence] ZADD muvaffaqiyatsiz — onlayn sanoq vaqtincha o\'chdi',
            exc_info=True,
        )


def _queue_prune(pipe, now):
    """Oynadan chiqib ketgan a'zolarni o'chirishni pipeline'ga qo'shadi.

    Chegara ochiq interval (`(`) — aynan oyna chetidagi yozuv qoladi.
    """
    pipe.zremrangebyscore(ONLINE_KEY, '-inf', f'({now - ONLINE_WINDOW_SECONDS}')


def get_online_count():
    """Oxirgi ``ONLINE_WINDOW_SECONDS`` ichida faol bo'lganlar soni.

    Redis yo'q yoki javob bermasa ``None`` qaytaradi.

    ``get_online_user_ids`` orqali hisoblanmaydi: bu funksiya har 15 soniyada
    so'raladi va ``ZCARD`` a'zolarni tarmoqdan tortmaydi.
    """
    now = time.time()
    if now < _disabled_until:
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        # Bitta round trip: eskirganlarni o'chirib, qolganini sanaymiz.
        pipe = client.pipeline()
        _queue_prune(pipe, now)
        pipe.zcard(ONLINE_KEY)
        return int(pipe.execute()[-1])
    except Exception:
        _mark_failed()
        logger.warning(
            '[presence] Onlayn sanog\'ini o\'qib bo\'lmadi', exc_info=True,
        )
        return None


def get_online_user_ids():
    """Hozir onlayn foydalanuvchilarning id'lari (``set``).

    ``get_online_count`` bilan bir xil oyna va bir xil tozalash, farqi —
    a'zolarning o'zi qaytadi. To'plam hajmi bir vaqtda ishlayotgan
    foydalanuvchilar soni bilan chegaralangan, ya'ni kichik.

    Redis yo'q yoki javob bermasa ``None`` (bo'sh ``set`` EMAS: bo'sh to'plam
    "hech kim onlayn emas" degan noto'g'ri xabar bo'lardi — chaqiruvchi
    "ma'lumot yo'q" holatini ajrata olishi kerak).
    """
    now = time.time()
    if now < _disabled_until:
        return None
    client = _get_client()
    if client is None:
        return None
    try:
        pipe = client.pipeline()
        _queue_prune(pipe, now)
        pipe.zrange(ONLINE_KEY, 0, -1)
        members = pipe.execute()[-1] or []
    except Exception:
        _mark_failed()
        logger.warning(
            '[presence] Onlayn foydalanuvchilarni o\'qib bo\'lmadi', exc_info=True,
        )
        return None
    # A'zolar bytes (redis-py decode_responses=False) yoki str bo'lishi mumkin.
    # Raqamga aylanmagan yozuv bo'lsa (qo'lda yozilgan qiymat) — tashlab
    # ketamiz, butun ro'yxatni yo'qotgandan ko'ra shunisi ma'qul.
    ids = set()
    for member in members:
        try:
            ids.add(int(member))
        except (TypeError, ValueError):
            continue
    return ids
