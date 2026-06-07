"""DH1: Har kuni 3 ta kunlik savol tanlaydigan management command.

Har kuni (cron / Celery beat orqali) ishga tushiriladi:

    python manage.py generate_daily_questions

Bugungi sana uchun savollar hali yaratilmagan bo'lsa, `questions.Question`
bankidan random 3 ta savol tanlanadi va `DailyQuestion` yozuvlari yaratiladi.
Allaqachon yaratilgan bo'lsa qayta ishlamaydi (idempotent).
"""
from django.core.management.base import BaseCommand

from accounts.tasks import DAILY_QUESTION_COUNT, generate_daily_questions


class Command(BaseCommand):
    help = "Bugungi 3 ta kunlik savolni tanlaydi (DH1)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--count', type=int, default=DAILY_QUESTION_COUNT,
            help='Tanlanadigan savollar soni (default 3).',
        )

    def handle(self, *args, **options):
        count = max(1, options.get('count') or DAILY_QUESTION_COUNT)
        # Yagona manba: logika `accounts.tasks.generate_daily_questions`'da.
        # Sinxron chaqiramiz (management command/cron uchun).
        result = generate_daily_questions(count=count)
        self.stdout.write(self.style.SUCCESS(str(result)))
