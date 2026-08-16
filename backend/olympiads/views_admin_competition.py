"""Advanced competition management endpoints for platform administrators.

Implements:
1. Live Leaderboard Freeze / Unfreeze.
2. Batch Regrading Engine (atomic re-calculation of attempts score and rank).
3. Question Difficulty & Discrimination Index Analysis (IRT / psychometrics).
4. Automated QR-verified Diploma & Certificate Generator and template manager.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.models import AuditLog
from accounts.permissions import IsPlatformAdmin
from attempts.models import TestAttempt, TestSession
from olympiads.models import Olympiad
from questions.models import Question


# ─────────────────────────────────────────────────────────────────────────────
# 1. LIVE LEADERBOARD FREEZE / UNFREEZE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_olympiad_toggle_freeze(request, pk):
    """Olimpiada natijalar jadvalini ishtirokchilar uchun muzlatish yoki ochish.

    Muzlatilgan holatda oddiy o'quvchilar reytingning faqat `frozen_at`
    vaqtidagi holatini ko'rishadi, adminlar esa to'liq jonli yangilanishni ko'radi.
    """
    try:
        olympiad = Olympiad.objects.get(pk=pk, is_deleted=False)
    except Olympiad.DoesNotExist:
        return Response(
            {'ok': False, 'message': "Olimpiada topilmadi."},
            status=status.HTTP_404_NOT_FOUND,
        )

    was_frozen = olympiad.is_leaderboard_frozen
    if was_frozen:
        olympiad.is_leaderboard_frozen = False
        olympiad.frozen_at = None
        action_msg = "Muzlatish bekor qilindi (jonli reyting ochildi)"
    else:
        olympiad.is_leaderboard_frozen = True
        olympiad.frozen_at = timezone.now()
        action_msg = "Reyting muzlatildi (ishtirokchilar uchun natijalar to‘xtatildi)"

    olympiad.save(update_fields=['is_leaderboard_frozen', 'frozen_at'])

    AuditLog.log(
        request,
        'admin_olympiad_freeze' if olympiad.is_leaderboard_frozen else 'admin_olympiad_unfreeze',
        target=olympiad,
        extra={
            'olympiad_id': olympiad.id,
            'title': olympiad.title,
            'is_frozen': olympiad.is_leaderboard_frozen,
            'frozen_at': olympiad.frozen_at.isoformat() if olympiad.frozen_at else None,
        },
    )

    return Response({
        'ok': True,
        'is_leaderboard_frozen': olympiad.is_leaderboard_frozen,
        'frozen_at': olympiad.frozen_at.isoformat() if olympiad.frozen_at else None,
        'message': action_msg,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 2. BATCH REGRADING ENGINE
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def admin_olympiad_batch_regrade(request, pk):
    """Olimpiadaning barcha ishtirokchilari javoblarini savollar bankidagi

    joriy to'g'ri javoblarga ko'ra atomik ravishda qayta hisoblash va
    o'rinlarni (rank) qayta taqsimlash.
    """
    try:
        olympiad = Olympiad.objects.prefetch_related('questions').get(pk=pk, is_deleted=False)
    except Olympiad.DoesNotExist:
        return Response(
            {'ok': False, 'message': "Olimpiada topilmadi."},
            status=status.HTTP_404_NOT_FOUND,
        )

    questions_map = {q.id: q for q in olympiad.questions.all()}
    total_q_count = len(questions_map)
    if total_q_count == 0:
        return Response(
            {'ok': False, 'message': "Olimpiadada biriktirilgan savollar mavjud emas."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    attempts = list(TestAttempt.objects.filter(olympiad=olympiad))
    updated_count = 0
    score_changes = []

    with transaction.atomic():
        for attempt in attempts:
            if attempt.disqualified:
                continue

            old_score = attempt.score
            old_correct = attempt.correct_count

            correct_count = 0
            wrong_count = 0
            answers = attempt.answers or {}

            for q_id_str, user_ans in answers.items():
                try:
                    q_id = int(q_id_str)
                except (ValueError, TypeError):
                    continue

                question = questions_map.get(q_id)
                if not question:
                    continue

                # Variantli yoki qisqa javobli tekshiruv
                is_correct = False
                if question.question_type == Question.QUESTION_TYPE_MCQ:
                    try:
                        is_correct = int(user_ans) == question.correct_answer
                    except (ValueError, TypeError):
                        is_correct = False
                elif question.question_type in [Question.QUESTION_TYPE_FILL_BLANK, Question.QUESTION_TYPE_YES_NO]:
                    is_correct = str(user_ans).strip().lower() == str(question.correct_text or question.correct_answer or '').strip().lower()
                else:
                    try:
                        is_correct = int(user_ans) == question.correct_answer
                    except (ValueError, TypeError):
                        is_correct = False

                if is_correct:
                    correct_count += 1
                else:
                    wrong_count += 1

            new_score = int(round((correct_count / total_q_count) * 100)) if total_q_count > 0 else 0
            attempt.correct_count = correct_count
            attempt.wrong_count = wrong_count
            attempt.total_questions = total_q_count
            attempt.score = new_score
            attempt.save(update_fields=['correct_count', 'wrong_count', 'total_questions', 'score'])

            if old_score != new_score or old_correct != correct_count:
                updated_count += 1
                score_changes.append({
                    'user_id': attempt.user_id,
                    'user_name': attempt.user.full_name or attempt.user.phone,
                    'old_score': old_score,
                    'new_score': new_score,
                    'diff': new_score - old_score,
                })

        # O'rinlarni (Rank) qayta hisoblash
        active_attempts = list(
            TestAttempt.objects.filter(olympiad=olympiad, disqualified=False)
            .order_by('-score', 'time_spent', 'submitted_at')
        )
        for idx, att in enumerate(active_attempts, start=1):
            if att.rank != idx:
                att.rank = idx
                att.save(update_fields=['rank'])

    AuditLog.log(
        request,
        'admin_olympiad_regrade',
        target=olympiad,
        extra={
            'olympiad_id': olympiad.id,
            'total_attempts': len(attempts),
            'updated_count': updated_count,
        },
    )

    return Response({
        'ok': True,
        'message': f"{len(attempts)} ta urinish qayta hisoblandi. {updated_count} ta ishtirokchining bali o‘zgardi.",
        'total_attempts': len(attempts),
        'updated_count': updated_count,
        'score_changes': score_changes[:50],  # Dastlabki 50 ta o'zgarish
    })


# ─────────────────────────────────────────────────────────────────────────────
# 3. QUESTION DIFFICULTY & DISCRIMINATION INDEX (IRT)
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_olympiad_question_analytics(request, pk):
    """Olimpiadaga biriktirilgan barcha savollar bo'yicha psixometrik tahlil:

    - To'g'ri topish foizi (Facility/Difficulty Index)
    - Kamsitish / Ajratish kuchi (Discrimination Index - Top 27% vs Bottom 27%)
    - Distractor (chalg'ituvchi noto'g'ri variantlar) taqsimoti
    """
    try:
        olympiad = Olympiad.objects.prefetch_related('questions').get(pk=pk, is_deleted=False)
    except Olympiad.DoesNotExist:
        return Response(
            {'ok': False, 'message': "Olimpiada topilmadi."},
            status=status.HTTP_404_NOT_FOUND,
        )

    attempts = list(
        TestAttempt.objects.filter(olympiad=olympiad, disqualified=False)
        .order_by('-score', 'time_spent')
    )
    total_participants = len(attempts)
    questions = list(olympiad.questions.all())

    if total_participants == 0:
        return Response({
            'ok': True,
            'total_participants': 0,
            'questions': [],
            'message': "Ushbu olimpiadada hali topshirilgan testlar yo'q.",
        })

    # High Group va Low Group (Top 27% va Bottom 27%)
    group_size = max(1, int(round(total_participants * 0.27)))
    high_group = attempts[:group_size]
    low_group = attempts[-group_size:] if total_participants >= 2 else []

    analytics_results = []
    for q in questions:
        total_answers_for_q = 0
        correct_answers_for_q = 0
        options_counts = {0: 0, 1: 0, 2: 0, 3: 0}

        for att in attempts:
            ans = (att.answers or {}).get(str(q.id))
            if ans is not None:
                total_answers_for_q += 1
                try:
                    ans_idx = int(ans)
                    if ans_idx in options_counts:
                        options_counts[ans_idx] += 1
                    if ans_idx == q.correct_answer:
                        correct_answers_for_q += 1
                except (ValueError, TypeError):
                    if str(ans).strip().lower() == str(q.correct_text or q.correct_answer or '').strip().lower():
                        correct_answers_for_q += 1

        # Facility Index (Qiyinlik foizi: 0..100)
        facility_index = round((correct_answers_for_q / total_answers_for_q) * 100, 1) if total_answers_for_q > 0 else 0

        if facility_index >= 85:
            difficulty_label = "Juda oson"
        elif facility_index >= 65:
            difficulty_label = "Oson"
        elif facility_index >= 40:
            difficulty_label = "O‘rtacha"
        elif facility_index >= 20:
            difficulty_label = "Qiyin"
        else:
            difficulty_label = "Juda qiyin"

        # Discrimination Index (D = (High_correct - Low_correct) / Group_size)
        high_correct = 0
        for att in high_group:
            ans = (att.answers or {}).get(str(q.id))
            try:
                if ans is not None and int(ans) == q.correct_answer:
                    high_correct += 1
            except (ValueError, TypeError):
                if str(ans or '').strip().lower() == str(q.correct_text or q.correct_answer or '').strip().lower():
                    high_correct += 1

        low_correct = 0
        for att in low_group:
            ans = (att.answers or {}).get(str(q.id))
            try:
                if ans is not None and int(ans) == q.correct_answer:
                    low_correct += 1
            except (ValueError, TypeError):
                if str(ans or '').strip().lower() == str(q.correct_text or q.correct_answer or '').strip().lower():
                    low_correct += 1

        if len(low_group) > 0:
            discrimination = round((high_correct - low_correct) / group_size, 2)
        else:
            discrimination = 1.0 if high_correct > 0 else 0.0

        if discrimination >= 0.40:
            quality_label = "A’lo darajadagi savol (kuchli ajratadi)"
            quality_color = "success"
        elif discrimination >= 0.30:
            quality_label = "Yaxshi savol"
            quality_color = "success"
        elif discrimination >= 0.20:
            quality_label = "Qoniqarli (ko‘rib chiqish tavsiya etiladi)"
            quality_color = "warning"
        else:
            quality_label = "Kuchsiz savol (ajratish kuchi past)"
            quality_color = "error"

        analytics_results.append({
            'question_id': q.id,
            'question_text': q.text,
            'subject': q.subject,
            'question_type': q.question_type,
            'correct_answer': q.correct_answer,
            'options': q.options or [],
            'options_distribution': options_counts,
            'total_answers': total_answers_for_q,
            'correct_answers': correct_answers_for_q,
            'facility_index': facility_index,
            'difficulty_label': difficulty_label,
            'discrimination_index': discrimination,
            'quality_label': quality_label,
            'quality_color': quality_color,
        })

    return Response({
        'ok': True,
        'olympiad_title': olympiad.title,
        'total_participants': total_participants,
        'high_group_size': group_size,
        'questions': analytics_results,
    })


# ─────────────────────────────────────────────────────────────────────────────
# 4. CERTIFICATES & DIPLOMAS SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def admin_olympiad_certificates_ops(request, pk):
    """Olimpiada bo'yicha sertifikatlar va diplomlar holatini olish yoki

    shablonini o'zgartirish.
    """
    try:
        olympiad = Olympiad.objects.get(pk=pk, is_deleted=False)
    except Olympiad.DoesNotExist:
        return Response(
            {'ok': False, 'message': "Olimpiada topilmadi."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == 'POST':
        template_name = str(request.data.get('certificate_template', 'standard')).strip().lower()
        if template_name not in ['standard', 'modern', 'gold', 'dark']:
            template_name = 'standard'

        olympiad.certificate_template = template_name
        olympiad.save(update_fields=['certificate_template'])

        AuditLog.log(
            request,
            'admin_olympiad_certificate_template',
            target=olympiad,
            extra={'olympiad_id': olympiad.id, 'template': template_name},
        )

        return Response({
            'ok': True,
            'message': f"Sertifikat shabloni '{template_name}' qilib belgilandi.",
            'certificate_template': template_name,
        })

    # GET — diplomlar va sertifikatlar ro'yxati
    attempts = (
        TestAttempt.objects.filter(olympiad=olympiad, disqualified=False)
        .select_related('user')
        .order_by('rank', '-score', 'time_spent')
    )

    results = []
    diploma_counts = {'gold': 0, 'silver': 0, 'bronze': 0, 'achievement': 0, 'participation': 0}

    for att in attempts:
        user = att.user
        rank = att.rank or 0
        score = att.score

        # Diplom turi
        if rank == 1:
            award_type = 'gold'
            award_title = '1-O‘rin (Oltin Diplom)'
            diploma_counts['gold'] += 1
        elif rank == 2:
            award_type = 'silver'
            award_title = '2-O‘rin (Kumush Diplom)'
            diploma_counts['silver'] += 1
        elif rank == 3:
            award_type = 'bronze'
            award_title = '3-O‘rin (Bronza Diplom)'
            diploma_counts['bronze'] += 1
        elif score >= 60:
            award_type = 'achievement'
            award_title = 'Muvaffaqiyat Sertifikati'
            diploma_counts['achievement'] += 1
        else:
            award_type = 'participation'
            award_title = 'Ishtirokchi Sertifikati'
            diploma_counts['participation'] += 1

        results.append({
            'attempt_id': att.id,
            'user_id': user.id,
            'full_name': user.full_name or user.phone,
            'phone': user.phone,
            'rank': rank,
            'score': score,
            'award_type': award_type,
            'award_title': award_title,
            'certificate_uuid': str(att.certificate_uuid) if att.certificate_uuid else None,
            'verify_url': f"https://prolymp.uz/certificates/verify/{att.certificate_uuid}" if att.certificate_uuid else None,
            'submitted_at': att.submitted_at.isoformat(),
        })

    return Response({
        'ok': True,
        'olympiad_id': olympiad.id,
        'olympiad_title': olympiad.title,
        'certificate_template': olympiad.certificate_template or 'standard',
        'total_awards': len(results),
        'counts': diploma_counts,
        'results': results,
    })
