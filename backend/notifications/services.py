"""Notification service for in-app rows and Telegram bot fan-out."""
import json
import logging
import urllib.parse
import urllib.request

from django.conf import settings

from .models import Notification

logger = logging.getLogger('notifications.telegram')


def _center_type(center):
    return getattr(center, 'organization_type', '') or "O'quv markaz"


def _center_location(center):
    parts = [
        getattr(center, 'country', '') or "O'zbekiston",
        getattr(center, 'region', '') or '',
        getattr(center, 'district', '') or getattr(center, 'city', '') or '',
    ]
    return ' · '.join(part for part in parts if part)


def _telegram_join_request_text(student_name, center):
    return (
        f"Yangi o'quvchi ariza yubordi: {student_name}.\n"
        f"Tashkilot: {center.name}\n"
        f"Turi: {_center_type(center)}\n"
        f"Manzil: {_center_location(center)}\n"
        f"Tasdiqlaysizmi?"
    )


def _telegram_api_post(method, payload):
    token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
    if not token:
        logger.info('[telegram-local] method=%s payload=%s', method, payload)
        return False
    encoded = {}
    for key, value in (payload or {}).items():
        if isinstance(value, (dict, list)):
            encoded[key] = json.dumps(value)
        else:
            encoded[key] = value
    data = urllib.parse.urlencode(encoded).encode()
    url = f'https://api.telegram.org/bot{token}/{method}'
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        logger.exception('Telegram %s failed', method)
        return False


def _send_telegram_to_user(user, message, reply_markup=None):
    chat_id = getattr(user, 'telegram_chat_id', '')
    if not chat_id:
        logger.info('[telegram-skip] user=%s has no telegram_chat_id', user.id)
        return False
    payload = {'chat_id': chat_id, 'text': message}
    if reply_markup:
        payload['reply_markup'] = reply_markup
    return _telegram_api_post('sendMessage', payload)


def _student_join_keyboard(membership):
    if not membership:
        return None
    return {
        'inline_keyboard': [[
            {
                'text': '✅ Tasdiqlash',
                'callback_data': f'membership:approve:{membership.id}',
            },
            {
                'text': '❌ Rad etish',
                'callback_data': f'membership:reject:{membership.id}',
            },
        ]],
    }


def _telegram_olympiad_published_text(center, olympiad):
    return (
        f"{center.name} ({_center_type(center)}) da yangi olimpiada boshlandi:\n"
        f"Fan: {olympiad.subject}\n"
        f"Sana: {olympiad.start_datetime.date() if olympiad.start_datetime else '—'}\n"
        f"Qatnashish uchun platformaga kiring."
    )


def send_student_join_request_notification(manager, student, center, membership=None):
    """Notify a manager (or owner) that a student wants to join their center."""
    message = _telegram_join_request_text(student.full_name, center)
    Notification.objects.create(
        user=manager,
        center=center,
        type=Notification.TYPE_STUDENT_JOIN_REQUEST,
        title="Yangi o'quvchi arizasi",
        message=message,
    )
    sent = _send_telegram_to_user(
        manager,
        message,
        reply_markup=_student_join_keyboard(membership),
    )
    logger.info('[telegram] → %s sent=%s : %s', manager.normalized_phone, sent, message)


def send_staff_join_request_notification(owner, applicant, center, role, subject='', membership=None):
    """Owner ga teacher/manager arizasi haqida xabar yuborish.

    Avval faqat student arizalari xabar berardi va owner pending teacher/
    manager arizalarini hech qachon push tarzda olmasdi; endi har ikki rol
    uchun ham bot va in-app xabarnomalari yuboriladi.
    """
    role_label = "O'qituvchi" if role == 'teacher' else 'Manager'
    suffix = f"\nFan: {subject}" if subject else ''
    message = (
        f"Yangi {role_label.lower()} arizasi: {applicant.full_name}.\n"
        f"Tashkilot: {center.name}\n"
        f"Turi: {_center_type(center)}\n"
        f"Manzil: {_center_location(center)}"
        f"{suffix}\n"
        f"Tasdiqlaysizmi?"
    )
    notification_type = (
        Notification.TYPE_TEACHER_JOIN_REQUEST if role == 'teacher'
        else Notification.TYPE_MANAGER_JOIN_REQUEST
    )
    Notification.objects.create(
        user=owner,
        center=center,
        type=notification_type,
        title=f"Yangi {role_label.lower()} arizasi",
        message=message,
    )
    sent = _send_telegram_to_user(
        owner,
        message,
        reply_markup=_student_join_keyboard(membership),
    )
    logger.info('[telegram] → %s sent=%s role=%s', owner.normalized_phone, sent, role)


def send_center_approval_request_notification(admin, owner, center):
    """Notify a platform admin that a director registered a new center."""
    owner_name = owner.full_name or owner.normalized_phone
    message = (
        f"Direktor {owner_name} yangi tashkilot/markaz ro'yxatdan o'tkazdi.\n"
        f"Nomi: {center.name}\n"
        f"Turi: {_center_type(center)}\n"
        f"Manzil: {_center_location(center)}\n"
        "Admin panelda tasdiqlash yoki rad etish kerak."
    )
    Notification.objects.create(
        user=admin,
        center=center,
        type=Notification.TYPE_CENTER_PENDING,
        title="Yangi direktor arizasi",
        message=message,
    )
    logger.info('[telegram-mock] → %s : %s', admin.normalized_phone, message)


def send_center_decision_notification(owner, center, approved):
    """Notify a center owner about the platform admin decision."""
    notification_type = (
        Notification.TYPE_CENTER_APPROVED
        if approved else Notification.TYPE_CENTER_REJECTED
    )
    title = "Tashkilot tasdiqlandi" if approved else "Tashkilot rad etildi"
    message = (
        f"{center.name} ({_center_type(center)}) tasdiqlandi va platformada ko'rinadi."
        if approved else
        f"{center.name} ({_center_type(center)}) rad etildi va platformada ko'rinmaydi."
    )
    Notification.objects.create(
        user=owner,
        center=center,
        type=notification_type,
        title=title,
        message=message,
    )
    logger.info('[telegram-mock] → %s : %s', owner.normalized_phone, message)


def send_olympiad_published_notification(student, olympiad, center):
    """Notify an approved student that a new olympiad is live at their center."""
    message = _telegram_olympiad_published_text(center, olympiad)
    Notification.objects.create(
        user=student,
        center=center,
        type=Notification.TYPE_OLYMPIAD_PUBLISHED,
        title="Yangi olimpiada",
        message=message,
    )
    sent = _send_telegram_to_user(student, message)
    logger.info('[telegram] → %s sent=%s : %s', student.normalized_phone, sent, message)


def send_olympiad_published_bulk(students, olympiad, center):
    """Bulk variant for fan-out to many approved students at once."""
    if not students:
        return
    message = _telegram_olympiad_published_text(center, olympiad)
    Notification.objects.bulk_create([
        Notification(
            user=s,
            center=center,
            type=Notification.TYPE_OLYMPIAD_PUBLISHED,
            title="Yangi olimpiada",
            message=message,
        )
        for s in students
    ])
    logger.info('[telegram-mock] olympiad %s → %d students', olympiad.id, len(students))


def send_membership_decision_notification(membership, approved):
    role_type = {
        'student': (
            Notification.TYPE_STUDENT_APPROVED if approved else Notification.TYPE_STUDENT_REJECTED
        ),
        'teacher': (
            Notification.TYPE_TEACHER_APPROVED if approved else Notification.TYPE_TEACHER_REJECTED
        ),
        'manager': (
            Notification.TYPE_MANAGER_APPROVED if approved else Notification.TYPE_MANAGER_REJECTED
        ),
    }.get(membership.role)
    if not role_type:
        return
    role_label = {
        'student': "O'quvchi",
        'teacher': "O'qituvchi",
        'manager': 'Manager',
    }.get(membership.role, membership.role)
    title = f"{role_label} arizasi tasdiqlandi" if approved else f"{role_label} arizasi rad etildi"
    message = (
        f"{membership.center.name} tashkilotidagi {role_label.lower()} arizangiz tasdiqlandi."
        if approved else
        f"{membership.center.name} tashkilotidagi {role_label.lower()} arizangiz rad etildi."
    )
    Notification.objects.create(
        user=membership.user,
        center=membership.center,
        type=role_type,
        title=title,
        message=message,
    )
    _send_telegram_to_user(membership.user, message)


def send_cheating_detected_notification(student, olympiad, center, reason=''):
    """Notify center managers/owner that a student left the test surface.

    Telegram rate-limit (30 msg/sek per bot) bo'yicha himoya: olimpiada
    paytida bir necha talaba bir vaqtda diskvalifikatsiya bo'lsa va markazda
    o'nlab manager bo'lsa, har bir hodisa uchun 10+ telegram xabar burst
    yuborilardi. Endi push xabarni yuboriladigan oluvchilar soni cheklanadi:
    owner + eng so'nggi 3 ta manager. Boshqa managerlar in-app notification
    sifatida ko'radi (panel orqali), telegram push esa eng tegishli
    odamlarga keladi.
    """
    reason_label = reason or 'test oynasidan chiqdi'
    message = (
        f"{student.full_name} cheating deb belgilandi.\n"
        f"Olimpiada: {olympiad.title}\n"
        f"Sabab: {reason_label}"
    )
    from centers.models import CenterMembership

    PUSH_CAP = 4  # owner + 3 manager max
    in_app_recipients = []
    push_recipients = []

    manager_memberships = list(
        CenterMembership.objects.filter(
            center=center,
            role=CenterMembership.ROLE_MANAGER,
            status=CenterMembership.STATUS_APPROVED,
        ).select_related('user').order_by('-created_at')
    )

    if center.owner_id:
        push_recipients.append(center.owner)
        in_app_recipients.append(center.owner)

    for membership in manager_memberships:
        in_app_recipients.append(membership.user)
        if len(push_recipients) < PUSH_CAP:
            push_recipients.append(membership.user)

    seen_in_app = set()
    seen_push = {u.id for u in push_recipients if u}
    for user in in_app_recipients:
        if not user or user.id in seen_in_app:
            continue
        seen_in_app.add(user.id)
        Notification.objects.create(
            user=user,
            center=center,
            type=Notification.TYPE_CHEATING_DETECTED,
            title='Cheating aniqlandi',
            message=message,
        )
        if user.id in seen_push:
            _send_telegram_to_user(user, message)
            seen_push.discard(user.id)
