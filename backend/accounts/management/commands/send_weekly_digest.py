"""B2B: Markaz egalariga (owner) haftalik hisobotni Telegram orqali yuboradigan
management command.

Har hafta (cron / Celery beat) ishga tushiriladi:

    python manage.py send_weekly_digest

Har bir tasdiqlangan (approved) markaz owner'i uchun o'sha markaz statistikasini
(jami o'quvchilar, bu hafta faol, o'rtacha ball, eng zaif fan) Telegram orqali
yuboradi. Owner'ning telegram_chat_id bo'lmasa — o'sha markaz o'tkazib yuboriladi.

`--dry-run` — haqiqiy yubormasdan nechta markaz hisoboti ketishini ko'rsatadi.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Avg, Count
from django.utils import timezone

from attempts.models import TestAttempt
from centers.models import CenterMembership, EducationCenter


class Command(BaseCommand):
    help = "Markaz egalariga (owner) haftalik hisobotni Telegram orqali yuboradi (B2B)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="Haqiqiy yubormasdan, nechta markaz hisoboti ketishini ko'rsatadi.",
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run')

        if not dry_run:
            # Yagona manba: logika `accounts.tasks.send_weekly_digest`'da.
            from accounts.tasks import send_weekly_digest
            result = send_weekly_digest()
            self.stdout.write(self.style.SUCCESS(str(result)))
            return

        # --dry-run: haqiqiy yubormasdan nechta markaz hisoboti ketishini hisoblaymiz.
        week_ago = timezone.now() - timedelta(days=7)
        centers = (
            EducationCenter.objects
            .filter(status=EducationCenter.STATUS_APPROVED, owner__isnull=False)
            .select_related('owner')
        )

        sent = 0
        skipped = 0
        for center in centers:
            owner = center.owner
            chat_id = getattr(owner, 'telegram_chat_id', '') if owner else ''
            if not chat_id:
                skipped += 1
                continue

            total_students = (
                CenterMembership.objects
                .filter(
                    center=center,
                    role=CenterMembership.ROLE_STUDENT,
                    status=CenterMembership.STATUS_APPROVED,
                )
                .count()
            )
            active_this_week = (
                TestAttempt.objects
                .filter(
                    olympiad__center=center,
                    olympiad__is_deleted=False,
                    disqualified=False,
                    submitted_at__gte=week_ago,
                )
                .values('user_id')
                .distinct()
                .count()
            )
            agg = (
                TestAttempt.objects
                .filter(olympiad__center=center, olympiad__is_deleted=False, disqualified=False)
                .aggregate(avg=Avg('score'))
            )
            avg_score = round(agg['avg'] or 0, 1)

            self.stdout.write(
                f"[dry-run] center={center.id} ({center.name}) owner={owner.id}: "
                f"students={total_students} active={active_this_week} avg={avg_score}"
            )
            sent += 1

        self.stdout.write(self.style.SUCCESS(
            f"[dry-run] Haftalik digest: {sent} ta markazga yuboriladi, {skipped} ta o'tkazib yuboriladi."
        ))
