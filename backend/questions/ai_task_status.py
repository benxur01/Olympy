"""Sekin AI (Gemini) chaqiruvlarini Celery'ga ko'chirish uchun umumiy yordamchilar.

`process_pdf_questions_task` / `pdf_preview_status` juftligida sinalgan naqsh:

  * view BARCHA sinxron validatsiyani (ruxsat, premium, throttle) bajaradi,
    keshga `PENDING` yozuvini qo'yadi, Celery task'ni `delay()` bilan yuboradi
    va darhol `{'task_id': ...}` (202) qaytaradi — Gunicorn thread bo'shaydi;
  * task natijani `{'status': 'COMPLETED', 'result': {...}}` yoki
    `{'status': 'FAILED', 'error': ...}` ko'rinishida o'sha kalitga yozadi;
  * frontend `<endpoint>/<task_id>/status/` ni polling qilib natijani oladi.

Sabab: `_generate_via_gemini` va uning qardoshlari `_gemini_models()` (6 ta
model) × API kalitlar bo'yicha nested loop qiladi, har urinish 45-60 soniya
timeout bilan — eng yomon holatda bir necha daqiqa. Bu ish so'rov ichida
bajarilsa mavjud 6 ta gunicorn thread'i to'liq bloklanadi.

Naqsh bir nechta AI endpointida takrorlangani uchun kesh yozish/o'qish qismi
shu yerga yig'ilgan. Kesh kaliti: `<prefix>:task:<task_id>`; `user_id` esa
ownership uchun — boshqa foydalanuvchi task_id'ni topib natijani o'qiy olmasin.
"""

import uuid

from django.core.cache import cache
from rest_framework import status as http_status
from rest_framework.response import Response

# PDF oqimidagi bilan bir xil TTL — AI natijasi 15 daqiqa keshda turadi.
AI_TASK_TTL_SECONDS = 900


def ai_task_cache_key(prefix, task_id):
    return f"{prefix}:task:{task_id}"


def start_ai_task(prefix, user_id):
    """Yangi `task_id` yaratadi va `PENDING` holatini keshga yozadi."""
    task_id = str(uuid.uuid4())
    cache.set(
        ai_task_cache_key(prefix, task_id),
        {'status': 'PENDING', 'user_id': user_id},
        timeout=AI_TASK_TTL_SECONDS,
    )
    return task_id


def _set_preserve_owner(prefix, task_id, payload):
    """Natijani yozganda `user_id` ownership'ni saqlab qoladi."""
    key = ai_task_cache_key(prefix, task_id)
    prev = cache.get(key) or {}
    if isinstance(prev, dict) and 'user_id' in prev:
        payload = {**payload, 'user_id': prev['user_id']}
    cache.set(key, payload, timeout=AI_TASK_TTL_SECONDS)


def set_ai_task_result(prefix, task_id, result):
    """Task muvaffaqiyatli tugadi — natija dict'i status javobiga yoyiladi."""
    _set_preserve_owner(prefix, task_id, {'status': 'COMPLETED', 'result': result or {}})


def set_ai_task_failed(prefix, task_id, error):
    _set_preserve_owner(prefix, task_id, {'status': 'FAILED', 'error': str(error or '')})


def ai_task_status_response(prefix, task_id, user, failed_detail=''):
    """Status endpointlari uchun umumiy DRF javobi.

    `pdf_preview_status` bilan bir xil shakl:
      {'status': 'PENDING'}
      {'status': 'COMPLETED', ...natija maydonlari}
      {'status': 'FAILED', 'detail': ...}
    Topilmagan yoki begona task uchun 404 (mavjudligini ham oshkor qilmaymiz).
    """
    state = cache.get(ai_task_cache_key(prefix, task_id))
    not_found = Response(
        {'status': 'FAILED', 'detail': "Vazifa topilmadi yoki muddati o'tgan"},
        status=http_status.HTTP_404_NOT_FOUND,
    )
    if not state:
        return not_found
    owner_id = state.get('user_id')
    if owner_id is not None and int(owner_id) != int(user.id):
        return not_found
    status_value = state.get('status')
    if status_value == 'COMPLETED':
        # Konvert kaliti (`status`) oxirida — natijada tasodifan shu nomli
        # maydon bo'lsa ham polling holati o'zgarib ketmasin.
        return Response({**(state.get('result') or {}), 'status': 'COMPLETED'})
    if status_value == 'FAILED':
        return Response({
            'status': 'FAILED',
            'detail': state.get('error') or failed_detail or "AI natijani olib bo'lmadi",
        })
    return Response({'status': 'PENDING'})
