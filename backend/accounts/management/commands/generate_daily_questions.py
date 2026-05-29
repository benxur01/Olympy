"""DH1: Har kuni 3 ta kunlik savol tanlaydigan management command.

Har kuni (cron / Celery beat orqali) ishga tushiriladi:

    python manage.py generate_daily_questions

Bugungi sana uchun savollar hali yaratilmagan bo'lsa, `questions.Question`
bankidan random 3 ta savol tanlanadi va `DailyQuestion` yozuvlari yaratiladi.
Allaqachon yaratilgan bo'lsa qayta ishlamaydi (idempotent).
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import DailyQuestion
from questions.models import Question

DAILY_COUNT = 3


class Command(BaseCommand):
    help = "Bugungi 3 ta kunlik savolni tanlaydi (DH1)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--count', type=int, default=DAILY_COUNT,
            help='Tanlanadigan savollar soni (default 3).',
        )

    def handle(self, *args, **options):
        count = max(1, options.get('count') or DAILY_COUNT)
        today = timezone.now().date()

        existing = DailyQuestion.objects.filter(date=today).count()
        if existing >= count:
            self.stdout.write(self.style.WARNING(
                f"Bugun ({today}) uchun allaqachon {existing} ta savol bor — o'tkazib yuborildi."
            ))
            return

        need = count - existing
        # Bugun allaqachon tanlangan savollarni qayta tanlamaymiz.
        used_ids = list(
            DailyQuestion.objects.filter(date=today).values_list('question_id', flat=True)
        )
        questions = list(
            Question.objects.exclude(id__in=used_ids).order_by('?')[:need]
        )
        if not questions:
            self.stdout.write(self.style.ERROR(
                "Savol banki bo'sh yoki yetarli savol yo'q — kunlik savol yaratilmadi."
            ))
            return

        created = 0
        for q in questions:
            _, was_created = DailyQuestion.objects.get_or_create(
                question=q,
                date=today,
                defaults={'subject': q.subject or ''},
            )
            if was_created:
                created += 1

        self.stdout.write(self.style.SUCCESS(
            f"Kunlik savollar tayyor: {created} ta yangi qo'shildi ({today})."
        ))
