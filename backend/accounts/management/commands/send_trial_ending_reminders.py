"""P4: Premium sinovi tugayotgan foydalanuvchilarga konversiya eslatmasini
yuboradigan management command.

Har kuni (cron / Celery beat) ishga tushiriladi:

    python manage.py send_trial_ending_reminders

`premium_trial_end` keyingi 3 kun ichida tugaydigan, hali pullik obunaga
o'tmagan (is_premium=False), Telegram'ga bog'langan va eslatma hali
yuborilmagan (trial_reminder_sent_at IS NULL) har bir foydalanuvchiga shu
oydagi statistikasiga asoslangan shaxsiylashtirilgan Telegram eslatma yuboradi
("siz bu oy N ta test ishladingiz, o'rtacha balingiz X%, premium bilan yanada
yaxshilang"). Har trial bir martalik — takror yuborilmaydi.

`--dry-run` — haqiqiy yubormasdan nechta xabar ketishini va matn namunalarini
ko'rsatadi.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, Max
from django.utils import timezone

from attempts.models import TestAttempt


class Command(BaseCommand):
    help = "Premium sinovi tugayotgan foydalanuvchilarga konversiya eslatmasini Telegram orqali yuboradi (P4)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Haqiqiy yubormasdan, nechta xabar ketishini va namunalarini ko'rsatadi.",
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run')

        if not dry_run:
            # Yagona manba: logika `accounts.tasks.send_trial_ending_reminders`'da.
            from accounts.tasks import send_trial_ending_reminders
            result = send_trial_ending_reminders()
            self.stdout.write(self.style.SUCCESS(str(result)))
            return

        # --dry-run: haqiqiy yubormasdan nechta xabar ketishini hisoblaymiz.
        from accounts.tasks import _build_trial_reminder_message

        User = get_user_model()
        now = timezone.now()
        horizon = now + timedelta(days=3)
        month_ago = now - timedelta(days=30)

        users = User.objects.filter(
            premium_trial_end__isnull=False,
            premium_trial_end__gt=now,
            premium_trial_end__lte=horizon,
            is_premium=False,
            trial_reminder_sent_at__isnull=True,
        ).exclude(telegram_chat_id='')

        sent = 0
        skipped = 0
        for user in users:
            chat_id = user.telegram_chat_id
            if not chat_id:
                skipped += 1
                continue

            agg = TestAttempt.objects.filter(
                user=user, disqualified=False, submitted_at__gte=month_ago,
            ).aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))

            total = agg['total'] or 0
            avg_score = round(agg['avg'] or 0, 1)
            best_score = agg['best'] or 0
            name = user.full_name or user.first_name or ''

            msg = _build_trial_reminder_message(name, total, avg_score, best_score)

            self.stdout.write(f"[dry-run] user={user.id} chat={chat_id}\n{msg}\n")
            sent += 1

        self.stdout.write(self.style.SUCCESS(
            f"[dry-run] Trial eslatmalari: {sent} ta yuboriladi, {skipped} ta o'tkazib yuboriladi."
        ))
