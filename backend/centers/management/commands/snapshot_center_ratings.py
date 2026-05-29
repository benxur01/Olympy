"""T7: Markaz reytinglarini CenterRatingHistory ga yozadigan management command.

Har hafta (cron / Celery beat orqali) ishga tushiriladi:

    python manage.py snapshot_center_ratings

Hisoblash `centers.views.center_ranking` bilan bir xil mantiq: tasdiqlangan
markazlar valid attempts'lar bo'yicha o'rtacha ball desc, keyin urinishlar
soni desc bo'yicha tartiblanadi va rank beriladi. Har markaz uchun bugungi
sana bilan bitta yozuv yaratiladi (mavjud bo'lsa yangilanadi).
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Avg, Count, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone

from attempts.models import TestAttempt
from centers.models import CenterMembership, CenterRatingHistory, EducationCenter


class Command(BaseCommand):
    help = "Markazlar reytingini CenterRatingHistory'ga snapshot qiladi (T7)."

    def handle(self, *args, **options):
        valid_attempts = TestAttempt.objects.filter(
            olympiad__center=OuterRef('pk'),
            disqualified=False,
            olympiad__is_deleted=False,
        )
        attempt_total_sq = (
            valid_attempts.values('olympiad__center')
            .annotate(c=Count('id')).values('c')
        )
        attempt_avg_sq = (
            valid_attempts.values('olympiad__center')
            .annotate(a=Avg('score')).values('a')
        )

        centers_qs = (
            EducationCenter.objects
            .filter(status=EducationCenter.STATUS_APPROVED)
            .annotate(
                total_attempts=Coalesce(Subquery(attempt_total_sq), 0),
                average_score=Coalesce(Subquery(attempt_avg_sq), 0.0),
            )
            .order_by('-average_score', '-total_attempts', 'id')
        )

        today = timezone.now().date()
        created = 0
        updated = 0
        for rank, center in enumerate(centers_qs, start=1):
            score = round(float(center.average_score or 0), 1)
            obj, was_created = CenterRatingHistory.objects.update_or_create(
                center=center,
                date=today,
                defaults={'rank': rank, 'score': Decimal(str(score))},
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"Snapshot tayyor: {created} ta yangi, {updated} ta yangilangan ({today})."
        ))
