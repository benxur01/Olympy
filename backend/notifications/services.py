"""Telegram notification service — placeholder.

Today: writes a Notification row to the database and logs a Telegram-style
message string. Tomorrow: a real Telegram bot client will replace the log
calls below without changing any callers.

TODO(real-telegram): wire python-telegram-bot or aiogram, read TELEGRAM_BOT_TOKEN
from settings, pull chat_id from a Profile / TelegramLink model, send the
message via Bot API. Keep the function signatures stable.
"""
import logging

from .models import Notification

logger = logging.getLogger('notifications.telegram')


def _telegram_join_request_text(student_name, center_name):
    return (
        f"Yangi o'quvchi ariza yubordi: {student_name}.\n"
        f"O'quv markaz: {center_name}.\n"
        f"Tasdiqlaysizmi?"
    )


def _telegram_olympiad_published_text(center_name, olympiad):
    return (
        f"{center_name} o'quv markazida yangi olimpiada boshlandi:\n"
        f"Fan: {olympiad.subject}\n"
        f"Sana: {olympiad.start_datetime.date() if olympiad.start_datetime else '—'}\n"
        f"Qatnashish uchun platformaga kiring."
    )


def send_student_join_request_notification(manager, student, center):
    """Notify a manager (or owner) that a student wants to join their center."""
    message = _telegram_join_request_text(student.full_name, center.name)
    Notification.objects.create(
        user=manager,
        center=center,
        type=Notification.TYPE_STUDENT_JOIN_REQUEST,
        title="Yangi o'quvchi arizasi",
        message=message,
    )
    logger.info('[telegram-mock] → %s : %s', manager.normalized_phone, message)
    # TODO(real-telegram): bot.send_message(chat_id=manager.telegram_chat_id, text=message,
    #                                       reply_markup=approve_reject_keyboard)


def send_olympiad_published_notification(student, olympiad, center):
    """Notify an approved student that a new olympiad is live at their center."""
    message = _telegram_olympiad_published_text(center.name, olympiad)
    Notification.objects.create(
        user=student,
        center=center,
        type=Notification.TYPE_OLYMPIAD_PUBLISHED,
        title="Yangi olimpiada",
        message=message,
    )
    logger.info('[telegram-mock] → %s : %s', student.normalized_phone, message)
    # TODO(real-telegram): bot.send_message(chat_id=student.telegram_chat_id, text=message)
