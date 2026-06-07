"""O6: Ota-onalarga haftalik Telegram hisobotini yuboradigan management command.

Har hafta (cron / Celery beat) ishga tushiriladi:

    python manage.py send_weekly_parent_reports

Har bir tasdiqlangan (is_confirmed=True) va digest yoqilgan
(weekly_digest_enabled=True) ota-ona-farzand bog'lanishi uchun farzandning
oxirgi 7 kundagi statistikasini Telegram orqali yuboradi. Ota-onaning
telegram_chat_id bo'lmasa — o'sha link o'tkazib yuboriladi.

`--dry-run` — haqiqiy yubormasdan nechta xabar ketishini ko'rsatadi.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, Max
from django.utils import timezone

from accounts.models import ParentStudentLink
from attempts.models import TestAttempt


class Command(BaseCommand):
    help = "Ota-onalarga farzandning haftalik hisobotini Telegram orqali yuboradi (O6)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Haqiqiy yubormasdan, nechta xabar ketishini ko'rsatadi.",
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run')

        if not dry_run:
            # Yagona manba: logika `accounts.tasks.send_weekly_parent_reports`'da.
            from accounts.tasks import send_weekly_parent_reports
            result = send_weekly_parent_reports()
            self.stdout.write(self.style.SUCCESS(str(result)))
            return

        # --dry-run: haqiqiy yubormasdan nechta xabar ketishini hisoblaymiz.
        week_ago = timezone.now() - timedelta(days=7)

        links = (
            ParentStudentLink.objects
            .filter(is_confirmed=True, weekly_digest_enabled=True)
            .select_related('parent', 'student')
        )

        sent = 0
        skipped = 0
        for link in links:
            parent = link.parent
            student = link.student
            chat_id = getattr(parent, 'telegram_chat_id', '')
            if not chat_id:
                skipped += 1
                continue

            agg = TestAttempt.objects.filter(
                user=student, disqualified=False, submitted_at__gte=week_ago,
            ).aggregate(avg=Avg('score'), best=Max('score'), total=Count('id'))

            olympiads_count = agg['total'] or 0
            avg_score = round(agg['avg'] or 0, 1)
            best_score = agg['best'] or 0
            streak = student.streak_count or 0
            name = student.full_name or 'Farzandingiz'

            msg = (
                f"📊 Haftalik hisobot: {name}\n"
                f"📝 Olimpiadalar: {olympiads_count} ta\n"
                f"⭐ O'rtacha ball: {avg_score}%\n"
                f"🔥 Streak: {streak} kun\n"
                f"🏆 Eng yaxshi natija: {best_score}%"
            )

            self.stdout.write(f"[dry-run] parent={parent.id} student={student.id}\n{msg}\n")
            sent += 1

        self.stdout.write(self.style.SUCCESS(
            f"[dry-run] Haftalik hisobotlar: {sent} ta yuboriladi, {skipped} ta o'tkazib yuboriladi."
        ))
