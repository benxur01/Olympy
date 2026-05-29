"""O2: Kunlik maqsad (DailyGoal) yangilash logikasi.

`submit_attempt` har topshiriqdan keyin shu yerdagi `record_progress` ni
chaqiradi: bugungi maqsad bo'lsa `completed_questions` ni oshiradi va maqsad
bajarilsa bir martalik XP bonusini (coinlarga) qo'shadi.

Alohida modulda — submit oqimini bloklamasligi va circular import bo'lmasligi
uchun. Hech qachon exception otmaydi (chaqiruvchi try/except ichida).
"""
import logging

from django.utils import timezone

logger = logging.getLogger(__name__)

# Maqsad bajarilganda beriladigan bir martalik bonus (coinlarga qo'shiladi).
DAILY_GOAL_XP_BONUS = 50


def record_progress(user, answered_count, locked_user=None):
    """Bugungi DailyGoal ni `answered_count` ta savol bilan oldinga suradi.

    `user` — o'quvchi. `answered_count` — shu topshiriqda javob berilgan
    savollar soni (bo'sh emas). `locked_user` — submit_attempt ichida
    select_for_update bilan lock qilingan user (coins'ni shuning ustida
    yangilash lost-update'ni oldini oladi). Berilmasa `user` ishlatiladi.

    Qaytaradi: maqsad SHU chaqiruvda yangi bajarilgan bo'lsa True, aks holda
    False (frontend "maqsad bajarildi!" animatsiyasi uchun).
    """
    try:
        if not answered_count or answered_count < 1:
            return False
        from .models import DailyGoal

        today = timezone.now().date()
        goal = DailyGoal.objects.filter(user=user, date=today).first()
        if goal is None:
            # Bugun maqsad belgilanmagan — hech narsa qilmaymiz.
            return False

        was_achieved = goal.is_achieved
        goal.completed_questions = (goal.completed_questions or 0) + int(answered_count)

        newly_achieved = False
        if not was_achieved and goal.completed_questions >= (goal.target_questions or 0):
            goal.is_achieved = True
            goal.xp_bonus = DAILY_GOAL_XP_BONUS
            newly_achieved = True
            # Bonus coinlarni qo'shamiz (coins field mavjud).
            coin_user = locked_user if locked_user is not None else user
            if hasattr(coin_user, 'coins'):
                coin_user.coins = (coin_user.coins or 0) + DAILY_GOAL_XP_BONUS
                coin_user.save(update_fields=['coins'])
                # request.user ham yangilansin (javobda coins to'g'ri ko'rinsin).
                if locked_user is not None and user is not locked_user:
                    user.coins = coin_user.coins

        goal.save(update_fields=['completed_questions', 'is_achieved', 'xp_bonus'])
        return newly_achieved
    except Exception:
        logger.exception('daily goal progress update failed for user=%s', getattr(user, 'pk', None))
        return False
