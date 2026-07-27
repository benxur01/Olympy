"""Maxsus parol hash'lash (hasher) klasslari.

- ``PBKDF2600kPasswordHasher`` — Django'ning PBKDF2-SHA256 hasher'i, ammo
  1,000,000 o'rniga 600,000 iteratsiya bilan.

Nega: iteratsiya soni to'g'ridan-to'g'ri CPU narxi. Django 5.2 default'i
(1,000,000) shu mashinada har bir ``check_password`` uchun ~155 ms sof CPU
talab qiladi — telefon/parol bilan kirish (``POST /api/auth/login/``) aynan
shu sababli sekin edi, ayniqsa web konteyner bitta CPU yadroda ishlaganda.
600,000 — Django'ning o'zining oldingi versiyalaridagi default qiymati, ya'ni
tan olingan va hozir ham xavfsiz standart, lekin ~40% arzonroq.

DIQQAT: bu klass ``settings.PASSWORD_HASHERS`` ro'yxatida BIRINCHI turadi —
barcha YANGI hash'lar (ro'yxatdan o'tish, parol o'zgartirish, shuningdek
``accounts/views.py`` dagi OTP hash'lari) shu iteratsiya bilan yaratiladi.
Ro'yxatdagi qolgan hasher'lar ESKI hash'larni tekshirish uchun saqlanadi:
PBKDF2 ``verify()`` iteratsiya sonini hash satrining o'zidan o'qiydi, shuning
uchun 1,000,000 bilan yaratilgan mavjud parollar ham to'g'ri tekshiriladi.
Django ularni keyingi muvaffaqiyatli login'da avtomatik ravishda 600,000 ga
qayta hash'laydi (``check_password`` ning ``setter`` mexanizmi) — bu kutilgan
xulq, qo'shimcha kod yoki migratsiya talab qilmaydi.
"""

from django.contrib.auth.hashers import PBKDF2PasswordHasher


class PBKDF2600kPasswordHasher(PBKDF2PasswordHasher):
    """PBKDF2-SHA256, 600,000 iteratsiya (Django default'i 1,000,000)."""

    iterations = 600_000
