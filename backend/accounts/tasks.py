"""Periodic background tasks for the accounts app."""
from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from .models import PhoneVerification


@shared_task
def cleanup_phone_verifications():
    """Delete stale phone-verification sessions.

    Three classes are removed:
      * OTP sent and expired (otp_expires_at < now)
      * No OTP issued and the session is older than 1 hour (Telegram
        contact never arrived; otp_expires_at IS NULL)
      * Already verified and older than 30 days
    """
    now = timezone.now()
    cutoff_pending = now - timedelta(hours=1)
    cutoff_verified = now - timedelta(days=30)

    deleted = PhoneVerification.objects.filter(
        Q(otp_expires_at__isnull=False, otp_expires_at__lt=now)
        | Q(otp_expires_at__isnull=True, verified_at__isnull=True, created_at__lt=cutoff_pending)
        | Q(verified_at__isnull=False, verified_at__lt=cutoff_verified)
    ).delete()
    return f'Cleaned {deleted[0]} phone verification rows'
