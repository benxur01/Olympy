"""Tashkilotlar uchun yangi premium funksiyalar (spec: T1–T6).

Bu fayl avvalgi `centers/views_premium.py` (T1–T7) dan ALOHIDA — eski
endpoint'lar buzilmasin uchun. Bu yerdagilar yangi spec bo'yicha:

- T1 group_comparison       — GET  /api/centers/<id>/group-comparison/
- T2 churn_risk             — GET  /api/centers/<id>/churn-risk/
- T3 import_external_results— POST /api/centers/<id>/import-external-results/
     external_results       — GET  /api/centers/<id>/external-results/
- T4 mock_olympiads         — GET/POST /api/centers/<id>/mock-olympiads/
     mock_olympiad_delete   — DELETE   /api/centers/<id>/mock-olympiads/<mock_id>/
     (o'quvchi tomonidagi start/submit/results — mock_views.py)
- T5 manager_logs           — GET  /api/centers/<id>/manager-logs/
- T6 rating_message         — GET  /api/centers/<id>/members/<user_id>/rating-message/

Ruxsat: `user_can_manage_center` (owner/manager + platform admin). T1
qo'shimcha `center.is_premium` tekshiruvini talab qiladi (spec).
"""
from datetime import timedelta

from django.db.models import Avg, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    CenterMembership, EducationCenter, ExternalOlympiadResult,
    ManagerActivityLog, MockOlympiad,
)
from .services import log_manager_activity, user_can_manage_center
from .views_premium import _mask_phone, _premium_center_required


def _approved_student_members(center, tag=None):
    """Markazning tasdiqlangan o'quvchi a'zoliklari (ixtiyoriy teg bo'yicha)."""
    qs = CenterMembership.objects.filter(
        center=center,
        role=CenterMembership.ROLE_STUDENT,
        status=CenterMembership.STATUS_APPROVED,
    ).select_related('user')
    if tag is not None:
        qs = qs.filter(group_tag=tag)
    return qs


# ─── T1. Guruh solishtirish ──────────────────────────────────────────────────


def _group_stats(center, tag, now):
    """Bitta guruh (group_tag) uchun agregat statistika.

    Qaytaradi: {name, student_count, avg_score, total_attempts, growth}.
    `growth` = oxirgi 30 kun avg_score - undan oldingi 30 kun avg_score.
    """
    from attempts.models import TestAttempt

    members = list(_approved_student_members(center, tag=tag))
    user_ids = [m.user_id for m in members]
    base = {
        'name': tag,
        'student_count': len(user_ids),
        'avg_score': 0.0,
        'total_attempts': 0,
        'growth': 0.0,
    }
    if not user_ids:
        return base

    attempts_qs = TestAttempt.objects.filter(
        user_id__in=user_ids,
        olympiad__center=center,
        olympiad__is_deleted=False,
        disqualified=False,
    )
    agg = attempts_qs.aggregate(avg=Avg('score'), total=Count('id'))
    base['avg_score'] = round(agg['avg'] or 0, 1)
    base['total_attempts'] = agg['total'] or 0

    # O'sish: oxirgi 30 kun vs undan oldingi 30 kun o'rtacha ball farqi.
    last_30_start = now - timedelta(days=30)
    prev_30_start = now - timedelta(days=60)
    recent_avg = attempts_qs.filter(
        submitted_at__gte=last_30_start,
    ).aggregate(avg=Avg('score'))['avg'] or 0
    prev_avg = attempts_qs.filter(
        submitted_at__gte=prev_30_start, submitted_at__lt=last_30_start,
    ).aggregate(avg=Avg('score'))['avg'] or 0
    base['growth'] = round(recent_avg - prev_avg, 1)
    return base


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def group_comparison(request, center_id):
    """GET /api/centers/<id>/group-comparison/?tag_a=7-sinf&tag_b=8-sinf

    Ikki guruhni o'rtacha ball, faollik va o'sish bo'yicha solishtiradi.
    Premium markaz uchun.
    Javob: {tag_a: {name, student_count, avg_score, total_attempts, growth},
            tag_b: {...}}
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    if not center.is_premium:
        return _premium_center_required()

    tag_a = (request.query_params.get('tag_a') or '').strip()
    tag_b = (request.query_params.get('tag_b') or '').strip()
    if not tag_a or not tag_b:
        return Response(
            {'detail': 'tag_a va tag_b majburiy'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    return Response({
        'tag_a': _group_stats(center, tag_a, now),
        'tag_b': _group_stats(center, tag_b, now),
    })


# ─── T2. Chiqib ketish xavfi (Churn Risk) ────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def churn_risk(request, center_id):
    """GET /api/centers/<id>/churn-risk/?days=14

    Faolligi keskin kamaygan ("xavfli") o'quvchilarni aniqlaydi. Avvalgi
    `days` kun davomida kuniga o'rtacha > 0.5 urinish qilgan, ammo oxirgi
    `days` kunda kuniga o'rtacha < 0.2 urinish qilayotgan o'quvchilar.
    Javob: [{user_id, full_name, phone_masked, prev_activity, recent_activity,
             risk_level}]
    """
    from attempts.models import TestAttempt

    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    try:
        days = int(request.query_params.get('days') or 14)
    except (TypeError, ValueError):
        days = 14
    days = max(1, min(days, 180))

    now = timezone.now()
    recent_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=days * 2)

    members = list(_approved_student_members(center))
    user_ids = [m.user_id for m in members]
    if not user_ids:
        return Response([])

    # Markaz olimpiadalaridagi urinishlarni ikki oynaga bo'lib bitta GROUP BY
    # bilan sanaymiz (N+1 yo'q).
    recent_counts = {
        r['user_id']: r['c']
        for r in TestAttempt.objects.filter(
            user_id__in=user_ids,
            olympiad__center=center,
            olympiad__is_deleted=False,
            disqualified=False,
            submitted_at__gte=recent_start,
        ).values('user_id').annotate(c=Count('id'))
    }
    prev_counts = {
        r['user_id']: r['c']
        for r in TestAttempt.objects.filter(
            user_id__in=user_ids,
            olympiad__center=center,
            olympiad__is_deleted=False,
            disqualified=False,
            submitted_at__gte=prev_start,
            submitted_at__lt=recent_start,
        ).values('user_id').annotate(c=Count('id'))
    }

    rows = []
    for m in members:
        prev_avg = (prev_counts.get(m.user_id, 0)) / days
        recent_avg = (recent_counts.get(m.user_id, 0)) / days
        # Xavf sharti: avval faol (> 0.5/kun), endi deyarli yo'q (< 0.2/kun).
        if prev_avg > 0.5 and recent_avg < 0.2:
            # recent_avg butunlay 0 bo'lsa — high, biroz faollik qolsa — medium.
            risk_level = 'high' if recent_avg == 0 else 'medium'
            rows.append({
                'user_id': m.user_id,
                'full_name': m.user.full_name or m.user.normalized_phone or '—',
                'phone_masked': _mask_phone(m.user.normalized_phone or m.user.phone),
                'group_tag': m.group_tag or '',
                'prev_activity': round(prev_avg, 2),
                'recent_activity': round(recent_avg, 2),
                'risk_level': risk_level,
            })
    # Eng xavflisi birinchi: high oldin, keyin faollik tushishi katta bo'lganlar.
    rows.sort(key=lambda r: (r['risk_level'] != 'high', -(r['prev_activity'] - r['recent_activity'])))
    return Response(rows)


# ─── T3. Tashqi olimpiada import (CSV) ───────────────────────────────────────


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_external_results(request, center_id):
    """POST /api/centers/<id>/import-external-results/

    CSV import: `student_phone, olympiad_name, date, score, max_score`. Faylni
    `file` (multipart) yoki `csv_text` (raw matn) sifatida qabul qiladi.
    Telefon bo'yicha o'quvchi topilmasa — skip, xato ro'yxatiga yoziladi.
    Javob: {imported: N, skipped: M, errors: [...]}
    """
    import csv
    import io

    from accounts.utils import normalize_phone

    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    # CSV matnini olamiz — yuklangan fayl yoki raw matn.
    upload = request.FILES.get('file')
    if upload is not None:
        raw_bytes = upload.read()
        try:
            csv_text = raw_bytes.decode('utf-8-sig')
        except UnicodeDecodeError:
            csv_text = raw_bytes.decode('latin-1', errors='replace')
    else:
        csv_text = (request.data or {}).get('csv_text') or ''
    if not csv_text.strip():
        return Response(
            {'detail': "CSV bo'sh. `file` yoki `csv_text` yuboring."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Markaz o'quvchilarining normalized_phone -> user_id xaritasi (faqat shu
    # markaz o'quvchilari import qilinishi mumkin).
    student_map = {
        m.user.normalized_phone: m.user
        for m in _approved_student_members(center)
    }

    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return Response({'imported': 0, 'skipped': 0, 'errors': []})

    # Birinchi qator sarlavha bo'lishi mumkin — header'ga o'xshasa o'tkazamiz.
    first = [c.strip().lower() for c in rows[0]]
    start_idx = 0
    if 'student_phone' in first or 'phone' in first or 'telefon' in first:
        start_idx = 1

    imported = 0
    skipped = 0
    errors = []
    to_create = []
    for line_no, row in enumerate(rows[start_idx:], start=start_idx + 1):
        if not row or all(not str(c).strip() for c in row):
            continue
        if len(row) < 5:
            skipped += 1
            errors.append(f"{line_no}-qator: ustunlar yetarli emas (5 ta kerak)")
            continue
        phone_raw, olympiad_name, date_str, score_str, max_score_str = (
            str(row[0]).strip(), str(row[1]).strip(), str(row[2]).strip(),
            str(row[3]).strip(), str(row[4]).strip(),
        )
        norm = normalize_phone(phone_raw)
        student = student_map.get(norm) if norm else None
        if not student:
            skipped += 1
            errors.append(f"{line_no}-qator: o'quvchi topilmadi ({phone_raw})")
            continue
        # Sana: YYYY-MM-DD.
        parsed_date = None
        for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y'):
            try:
                from datetime import datetime
                parsed_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue
        if parsed_date is None:
            skipped += 1
            errors.append(f"{line_no}-qator: sana noto'g'ri ({date_str})")
            continue
        try:
            score = float(score_str)
            max_score = float(max_score_str)
        except ValueError:
            skipped += 1
            errors.append(f"{line_no}-qator: ball son emas ({score_str}/{max_score_str})")
            continue
        if not olympiad_name:
            skipped += 1
            errors.append(f"{line_no}-qator: olimpiada nomi bo'sh")
            continue
        to_create.append(ExternalOlympiadResult(
            center=center,
            student=student,
            olympiad_name=olympiad_name[:200],
            date=parsed_date,
            score=score,
            max_score=max_score,
        ))
        imported += 1

    if to_create:
        ExternalOlympiadResult.objects.bulk_create(to_create)

    # T5: import amalini logga yozamiz.
    log_manager_activity(
        center, request.user, ManagerActivityLog.ACTION_IMPORT_RESULTS,
        description=f"Tashqi natijalar importi: {imported} ta qo'shildi, {skipped} ta o'tkazib yuborildi",
    )
    return Response({'imported': imported, 'skipped': skipped, 'errors': errors[:50]})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def external_results(request, center_id):
    """GET /api/centers/<id>/external-results/ — import qilingan natijalar.

    Javob: [{id, user_id, full_name, olympiad_name, date, score, max_score,
             percentage, imported_at}]
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    items = (
        ExternalOlympiadResult.objects
        .filter(center=center)
        .select_related('student')
        .order_by('-date', '-imported_at')[:500]
    )
    data = []
    for r in items:
        score = float(r.score or 0)
        max_score = float(r.max_score or 0)
        pct = round((score / max_score) * 100, 1) if max_score else 0.0
        data.append({
            'id': r.id,
            'user_id': r.student_id,
            'full_name': r.student.full_name or r.student.normalized_phone or '—',
            'olympiad_name': r.olympiad_name,
            'date': r.date.isoformat() if r.date else None,
            'score': score,
            'max_score': max_score,
            'percentage': pct,
            'imported_at': r.imported_at.isoformat() if r.imported_at else None,
        })
    return Response(data)


# ─── T4. Mock Olimpiada (markaz tomoni) ──────────────────────────────────────


def _serialize_mock(mock, with_questions=False):
    data = {
        'id': mock.id,
        'title': mock.title,
        'subject': mock.subject or '',
        'time_limit_minutes': mock.time_limit_minutes,
        'is_active': mock.is_active,
        'created_at': mock.created_at.isoformat() if mock.created_at else None,
        'question_count': mock.questions.count(),
    }
    if with_questions:
        data['questions'] = [
            {
                'id': q.id,
                'text': q.text,
                'options': q.options,
                'subject': q.subject,
            }
            for q in mock.questions.all().order_by('id')
        ]
    return data


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def mock_olympiads(request, center_id):
    """GET/POST /api/centers/<id>/mock-olympiads/

    GET: markaz mock olimpiadalari ro'yxati.
    POST: yangi mock yaratish. Body:
      {title, subject, time_limit_minutes, question_ids: [...]}
    `question_ids` shu markazning savollari bo'lishi kerak.
    """
    from questions.models import Question

    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    if request.method == 'POST':
        body = request.data or {}
        title = (body.get('title') or '').strip()
        if not title:
            return Response({'detail': 'title majburiy'}, status=http_status.HTTP_400_BAD_REQUEST)
        subject = (body.get('subject') or '').strip()
        try:
            time_limit = int(body.get('time_limit_minutes') or 30)
        except (TypeError, ValueError):
            time_limit = 30
        time_limit = max(1, min(time_limit, 600))

        question_ids = body.get('question_ids') or []
        if not isinstance(question_ids, list):
            question_ids = []
        # Faqat shu markazning savollarini biriktiramiz (xavfsizlik).
        valid_questions = list(
            Question.objects.filter(center=center, pk__in=question_ids)
        ) if question_ids else []

        mock = MockOlympiad.objects.create(
            center=center,
            title=title[:200],
            subject=subject[:80],
            created_by=request.user,
            time_limit_minutes=time_limit,
        )
        if valid_questions:
            mock.questions.set(valid_questions)
        return Response(_serialize_mock(mock), status=http_status.HTTP_201_CREATED)

    # GET — ro'yxat.
    items = (
        MockOlympiad.objects
        .filter(center=center)
        .prefetch_related('questions')
        .order_by('-created_at')
    )
    return Response([_serialize_mock(m) for m in items])


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def mock_olympiad_delete(request, center_id, mock_id):
    """DELETE /api/centers/<id>/mock-olympiads/<mock_id>/ — mock o'chirish."""
    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)
    mock = MockOlympiad.objects.filter(pk=mock_id, center=center).first()
    if not mock:
        return Response({'detail': 'Topilmadi'}, status=http_status.HTTP_404_NOT_FOUND)
    mock.delete()
    return Response(status=http_status.HTTP_204_NO_CONTENT)


# ─── T5. Menejer faoliyat logi ───────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def manager_logs(request, center_id):
    """GET /api/centers/<id>/manager-logs/?manager_id=&action_type=&days=30

    Faqat markaz OWNER (yoki platforma admin) uchun — menejerlar faoliyati.
    Javob: [{id, manager_id, manager_name, action_type, target_user_id,
             target_name, description, created_at}]
    """
    center = get_object_or_404(EducationCenter, pk=center_id)
    # Owner yoki platforma admin — menejer o'z logini ko'rmasligi uchun
    # bu yerda manage emas, faqat owner/admin tekshiruvi.
    is_owner = (
        getattr(request.user, 'is_platform_admin', False)
        or (center.owner_id == request.user.id and center.status == EducationCenter.STATUS_APPROVED)
    )
    if not is_owner:
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    qs = (
        ManagerActivityLog.objects
        .filter(center=center)
        .select_related('manager', 'target_user')
    )
    manager_id = request.query_params.get('manager_id')
    if manager_id:
        try:
            qs = qs.filter(manager_id=int(manager_id))
        except (TypeError, ValueError):
            pass
    action_type = (request.query_params.get('action_type') or '').strip()
    if action_type:
        qs = qs.filter(action_type=action_type)
    days_param = request.query_params.get('days')
    if days_param:
        try:
            days = max(1, min(int(days_param), 365))
            qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=days))
        except (TypeError, ValueError):
            pass

    items = list(qs.order_by('-created_at')[:500])
    data = [
        {
            'id': log.id,
            'manager_id': log.manager_id,
            'manager_name': (log.manager.full_name or log.manager.normalized_phone or '—') if log.manager else '—',
            'action_type': log.action_type,
            'target_user_id': log.target_user_id,
            'target_name': (log.target_user.full_name or '—') if log.target_user else None,
            'description': log.description or '',
            'created_at': log.created_at.isoformat() if log.created_at else None,
        }
        for log in items
    ]
    return Response(data)


# ─── T6. Reyting tavsiyasi xabari ────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def rating_message(request, center_id, user_id):
    """GET /api/centers/<id>/members/<user_id>/rating-message/

    O'quvchi markaz ichida qaysi foizda turishini aniqlab, tayyor o'zbekcha
    tavsiya matnini generatsiya qiladi.
    Javob: {user_id, full_name, percentile, tier, top_subject, avg_score,
            rank, total_students, message}
    """
    from attempts.models import TestAttempt

    center = get_object_or_404(EducationCenter, pk=center_id)
    if not user_can_manage_center(request.user, center):
        return Response({'detail': 'Forbidden'}, status=http_status.HTTP_403_FORBIDDEN)

    members = list(_approved_student_members(center))
    member = next((m for m in members if m.user_id == int(user_id)), None)
    if member is None:
        return Response(
            {'detail': "O'quvchi bu markazda topilmadi"},
            status=http_status.HTTP_404_NOT_FOUND,
        )

    user_ids = [m.user_id for m in members]
    # Har o'quvchining markazdagi o'rtacha balli (bitta GROUP BY).
    avg_map = {
        r['user_id']: round(r['avg'] or 0, 1)
        for r in TestAttempt.objects.filter(
            user_id__in=user_ids,
            olympiad__center=center,
            olympiad__is_deleted=False,
            disqualified=False,
        ).values('user_id').annotate(avg=Avg('score'))
    }
    # O'quvchining eng kuchli fani (markaz olimpiadalari bo'yicha).
    subj_rows = (
        TestAttempt.objects.filter(
            user_id=member.user_id,
            olympiad__center=center,
            olympiad__is_deleted=False,
            disqualified=False,
        ).values('olympiad__subject').annotate(avg=Avg('score')).order_by('-avg')
    )
    top_subject = ''
    for r in subj_rows:
        s = (r['olympiad__subject'] or '').strip()
        if s:
            top_subject = s
            break

    total_students = len(members)
    my_avg = avg_map.get(member.user_id, 0.0)
    full_name = member.user.full_name or member.user.normalized_phone or "O'quvchi"
    first_name = full_name.split()[0] if full_name else "O'quvchi"

    # Reyting: mendan qat'iy yuqori ballga ega bo'lganlar soni + 1.
    higher = sum(1 for uid in user_ids if avg_map.get(uid, 0.0) > my_avg)
    rank = higher + 1
    # Percentile (yuqoridan): rank 1 => eng tepa.
    percentile = round((rank / total_students) * 100, 1) if total_students else 100.0

    if percentile <= 10:
        tier = 'top_10'
        tier_text = "eng yaxshi 10% o'quvchilari"
    elif percentile <= 25:
        tier = 'top_25'
        tier_text = "eng yaxshi 25% o'quvchilari"
    elif percentile <= 50:
        tier = 'top_50'
        tier_text = "yuqori 50% o'quvchilari"
    else:
        tier = 'bottom'
        tier_text = "o'quvchilari"

    subj_part = (
        f"{top_subject} bo'yicha keyingi bosqichga o'tishingizni tavsiya qilamiz."
        if top_subject
        else "Keyingi olimpiadalarga faol qatnashishingizni tavsiya qilamiz."
    )
    if tier == 'bottom':
        message = (
            f"{first_name}, sizning natijangiz markazimiz bo'yicha o'rtachadan past. "
            f"{subj_part} Muntazam mashq qilsangiz, tez orada yuqori o'rinlarga "
            f"ko'tarilasiz!"
        )
    else:
        message = (
            f"{first_name}, siz markazimizning {tier_text} qatoridasiz!\n"
            f"{subj_part}"
        )

    return Response({
        'user_id': member.user_id,
        'full_name': full_name,
        'avg_score': my_avg,
        'rank': rank,
        'total_students': total_students,
        'percentile': percentile,
        'tier': tier,
        'top_subject': top_subject,
        'message': message,
    })
