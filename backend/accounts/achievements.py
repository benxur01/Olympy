"""O5: Yutuq (Achievement) tekshiruvi va milestone berish logikasi.

`check_achievements(user, attempt)` har test submit'idan keyin chaqiriladi
(attempts.views.submit_attempt) va foydalanuvchining yangi bosqichlarini
aniqlab `Achievement` yozuvlarini yaratadi.

Alohida modulda — attempts.views'dan import qilinganda circular import
bo'lmasligi uchun (bu modul faqat lazy ravishda attempts.models'ga tegadi).
"""
import logging

logger = logging.getLogger(__name__)

# Urinishlar soni bo'yicha milestone'lar.
ATTEMPT_MILESTONES = [10, 50, 100, 500]
# Streak bo'yicha milestone'lar.
STREAK_MILESTONES = [3, 7, 30]


def check_achievements(user, attempt):
    """Submit'dan keyin foydalanuvchi yutuqlarini tekshiradi va yaratadi.

    Qaytaradi: shu chaqiruvda yangi berilgan yutuqlar ro'yxati (type'lar).
    Hech qachon exception otmaydi — submit jarayonini buzmasligi kerak.
    """
    from attempts.models import TestAttempt
    from .models import Achievement

    newly_awarded = []
    try:
        # Mavjud yutuq type'lari — qayta yaratmaslik uchun.
        existing = set(
            Achievement.objects.filter(user=user).values_list('type', flat=True)
        )

        # 1. Urinishlar soni milestone'lari.
        total_attempts = TestAttempt.objects.filter(
            user=user, disqualified=False,
        ).count()
        for n in ATTEMPT_MILESTONES:
            key = f'attempts_{n}'
            if total_attempts >= n and key not in existing:
                _award(user, key, n, newly_awarded)

        # 2. Streak milestone'lari.
        streak = user.streak_count or 0
        for n in STREAK_MILESTONES:
            key = f'streak_{n}'
            if streak >= n and key not in existing:
                _award(user, key, n, newly_awarded)

        # 3. Mukammal natija (100% to'g'ri javob).
        # total_questions > 0 va correct_count == total_questions bo'lsa.
        if (
            'perfect_score' not in existing
            and (attempt.total_questions or 0) > 0
            and (attempt.correct_count or 0) == attempt.total_questions
        ):
            _award(user, 'perfect_score', attempt.score or 100, newly_awarded)

        # 4. Yangi rekord (eng yuqori ball yangilanganda). new_record har yangi
        #    rekordda value bilan yangilanadi — shu sababli unique constraint
        #    bo'lsa ham update_or_create ishlatamiz.
        best_score = (
            TestAttempt.objects.filter(user=user, disqualified=False)
            .order_by('-score')
            .values_list('score', flat=True)
            .first()
        ) or 0
        current = attempt.score or 0
        # Bu attempt eng yuqori ball bo'lsa (yagona eng yuqori bo'lsa ham) —
        # rekord. Faqat bittadan ortiq attempt bo'lganda new_record beramiz,
        # aks holda birinchi urinish ham "rekord" bo'lib ketardi.
        attempts_count_for_record = TestAttempt.objects.filter(
            user=user, disqualified=False,
        ).count()
        if attempts_count_for_record >= 2 and current >= best_score and current > 0:
            updated = _update_record(user, 'new_record', current)
            if updated:
                newly_awarded.append('new_record')
    except Exception:
        logger.exception('check_achievements failed for user=%s', getattr(user, 'pk', None))
    return newly_awarded


def _award(user, type_key, value, sink):
    """(user, type) yagona — duplicate bo'lsa e'tibor bermaymiz."""
    from django.db import IntegrityError
    from .models import Achievement

    try:
        _, created = Achievement.objects.get_or_create(
            user=user, type=type_key, defaults={'value': value},
        )
        if created:
            sink.append(type_key)
    except IntegrityError:
        pass


def _update_record(user, type_key, value):
    """new_record yutug'i — value yangilanadi (eng yuqori ball)."""
    from .models import Achievement

    obj, created = Achievement.objects.get_or_create(
        user=user, type=type_key, defaults={'value': value},
    )
    if created:
        return True
    if value > (obj.value or 0):
        obj.value = value
        obj.save(update_fields=['value'])
        return True
    return False


# Yutuq turlari uchun ko'rinadigan meta (frontend ko'rsatishi uchun).
ACHIEVEMENT_META = {
    'attempts_10': {'title': '10 ta urinish', 'icon': '🎯', 'description': '10 ta testda qatnashdingiz'},
    'attempts_50': {'title': '50 ta urinish', 'icon': '🚀', 'description': '50 ta testda qatnashdingiz'},
    'attempts_100': {'title': '100 ta urinish', 'icon': '💯', 'description': '100 ta testda qatnashdingiz'},
    'attempts_500': {'title': '500 ta urinish', 'icon': '🏅', 'description': '500 ta testda qatnashdingiz'},
    'streak_3': {'title': '3 kunlik streak', 'icon': '⚡', 'description': '3 kun ketma-ket faol'},
    'streak_7': {'title': '7 kunlik streak', 'icon': '🔥', 'description': '7 kun ketma-ket faol'},
    'streak_30': {'title': '30 kunlik streak', 'icon': '🌟', 'description': '30 kun ketma-ket faol'},
    'new_record': {'title': 'Yangi rekord', 'icon': '📈', 'description': 'Eng yuqori ballingizni yangiladingiz'},
    'perfect_score': {'title': 'Mukammal natija', 'icon': '🏆', 'description': '100% to\'g\'ri javob'},
}


def achievement_payload(achievement):
    """Achievement obyektini frontend uchun JSON'ga aylantiradi."""
    meta = ACHIEVEMENT_META.get(achievement.type, {
        'title': achievement.type, 'icon': '🎖️', 'description': '',
    })
    return {
        'type': achievement.type,
        'value': achievement.value,
        'title': meta['title'],
        'icon': meta['icon'],
        'description': meta['description'],
        'achieved_at': achievement.achieved_at.isoformat() if achievement.achieved_at else '',
    }
