"""Dalil qatori o'chganda uning FAYLI ham o'chsin (post_delete).

Django model o'chirilganda `FileField` faylini diskda QOLDIRADI. Dalil uchun
bu jiddiy: rasm o'quvchining yuzi, ya'ni shaxsiy/biometrik ma'lumot. Qator
o'chishining kamida uchta yo'li bor va ularning ikkitasi bizning kodimizdan
o'tmaydi:

  * retention sweep (`tasks.cleanup_expired_evidence`) — 90 kunlik muddat;
  * sessiya/olimpiada o'chirilishi — `EvidenceSnapshot.session` CASCADE;
  * hisobning o'chirilishi (`accounts.purge_soft_deleted_accounts`) — user →
    session → dalil zanjiri bo'ylab CASCADE.

Fayl o'chirish shu sababli bitta joyda, signalda: aks holda foydalanuvchi
hisobini o'chirgan bo'lsa ham uning rasmi diskda abadiy qolardi.
"""
import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import EvidenceSnapshot

logger = logging.getLogger(__name__)


@receiver(post_delete, sender=EvidenceSnapshot)
def delete_evidence_files(sender, instance, **kwargs):
    for field in (instance.image, instance.screen_image):
        if not field:
            continue
        try:
            # `save=False` — qator allaqachon o'chgan, UPDATE qilib bo'lmaydi.
            field.delete(save=False)
        except Exception:
            # Fayl yo'q yoki disk xato berdi — o'chirish oqimini to'xtatmaymiz
            # (masalan hisobni o'chirish butun zanjiri shu yerda qulamasin).
            logger.exception(
                'evidence file delete failed evidence=%s name=%s',
                instance.pk, field.name,
            )
