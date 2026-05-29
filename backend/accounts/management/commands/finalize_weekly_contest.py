"""DH4: Haftalik musobaqani yakunlaydigan management command.

Har juma (yoki yakshanba kechqurun) cron / Celery beat orqali ishga tushiriladi:

    python manage.py finalize_weekly_contest

Joriy (dushanba–yakshanba) hafta uchun yig'ilgan ballarni hisoblab,
`WeeklyContestResult` yozuvlarini yaratadi va musobaqani `finished` qiladi.
Keyin kelgusi hafta uchun yangi `active` musobaqa ochiladi (idempotent).
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone

from accounts.models import WeeklyContest, WeeklyContestResult
from attempts.models import TestAttempt


class Command(BaseCommand):
    help = "Joriy haftalik musobaqani yakunlaydi va natijalarni yozadi (DH4)."

    def handle(self, *args, **options):
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        contest, _ = WeeklyContest.objects.get_or_create(
            week_start=week_start,
            defaults={'week_end': week_end, 'status': WeeklyContest.STATUS_ACTIVE},
        )
        if contest.status == WeeklyContest.STATUS_FINISHED:
            self.stdout.write(self.style.WARNING(
                f"Hafta ({week_start}–{week_end}) allaqachon yakunlangan."
            ))
            return

        # Shu hafta to'plangan ballar (foydalanuvchi bo'yicha yig'indi).
        rows = (
            TestAttempt.objects
            .filter(disqualified=False, olympiad__is_deleted=False,
                    submitted_at__date__gte=week_start, submitted_at__date__lte=week_end)
            .values('user_id')
            .annotate(total=Sum('score'))
            .order_by('-total')
        )

        created = 0
        for rank, row in enumerate(rows, start=1):
            WeeklyContestResult.objects.update_or_create(
                contest=contest,
                user_id=row['user_id'],
                defaults={'score': row['total'] or 0, 'rank': rank},
            )
            created += 1

        contest.status = WeeklyContest.STATUS_FINISHED
        contest.week_end = week_end
        contest.finished_at = timezone.now()
        contest.save(update_fields=['status', 'week_end', 'finished_at'])

        # Kelgusi hafta uchun yangi faol musobaqa.
        next_start = week_start + timedelta(days=7)
        next_end = next_start + timedelta(days=6)
        WeeklyContest.objects.get_or_create(
            week_start=next_start,
            defaults={'week_end': next_end, 'status': WeeklyContest.STATUS_ACTIVE},
        )

        self.stdout.write(self.style.SUCCESS(
            f"Haftalik musobaqa yakunlandi: {created} ta natija ({week_start}–{week_end})."
        ))
