"""RAG: savol saqlanganda embedding'ni fonda yangilash signali.

Embedding hisoblash Gemini API chaqiruvini talab qiladi, shuning uchun u
Celery task sifatida fonda bajariladi va savol yaratish/tahrirlash oqimini
sekinlashtirmaydi.

EAGER rejimda (Redis broker yo'q dev/test muhit) Celery task'lari sinxron
ishlaydi — bunda har savol saqlashda tashqi API chaqirilib oqim bloklanadi.
Shu sababli EAGER'da signal embedding hisoblashni o'tkazib yuboradi; bu
muhitlarda RAG kerak bo'lsa `embed_questions` management buyrug'i ishlatiladi.
"""

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Question


@receiver(post_save, sender=Question)
def question_post_save(sender, instance, created, **kwargs):
    # EAGER rejimda tashqi API chaqiruvi savol saqlashni bloklamasin.
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False):
        return
    from .tasks import update_question_embedding
    update_question_embedding.delay(instance.pk)
