"""Plagiarism and Code Similarity Detection views for Olympiad attempts.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from attempts.models import TestAttempt
from olympiads.models import Olympiad


def _calculate_similarity(answers_a, answers_b):
    """Ikki urinish o'rtasidagi umumiy va bir xil noto'g'ri javoblar o'xshashligini

    hisoblash.
    """
    if not answers_a or not answers_b:
        return 0.0, 0, 0

    common_qids = set(answers_a.keys()) & set(answers_b.keys())
    if not common_qids:
        return 0.0, 0, 0

    matching_answers = 0
    identical_wrong = 0

    for qid in common_qids:
        data_a = answers_a[qid]
        data_b = answers_b[qid]

        ans_a = data_a.get('answer') if isinstance(data_a, dict) else data_a
        ans_b = data_b.get('answer') if isinstance(data_b, dict) else data_b

        is_correct_a = data_a.get('is_correct') if isinstance(data_a, dict) else None
        is_correct_b = data_b.get('is_correct') if isinstance(data_b, dict) else None

        if str(ans_a).strip() == str(ans_b).strip() and str(ans_a).strip() != '':
            matching_answers += 1
            if is_correct_a is False and is_correct_b is False:
                identical_wrong += 1

    similarity_pct = round((matching_answers / len(common_qids)) * 100, 1)
    return similarity_pct, matching_answers, identical_wrong


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_olympiad_plagiarism_analysis(request, olympiad_id):
    """Olimpiada ishtirokchilari javoblari bo'yicha plagiat va ko'chirish

    matritsasi.
    """
    try:
        olympiad = Olympiad.objects.get(pk=olympiad_id)
    except Olympiad.DoesNotExist:
        return Response({'ok': False, 'message': "Olimpiada topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    attempts = list(TestAttempt.objects.filter(
        olympiad=olympiad,
    ).select_related('user'))

    if len(attempts) < 2:
        return Response({
            'ok': True,
            'olympiad_title': olympiad.title,
            'total_attempts': len(attempts),
            'high_risk_pairs': [],
            'message': "Plagiat tahlili uchun kamida 2 ta topshirilgan urinish kerak.",
        })

    high_risk_pairs = []
    threshold = 75.0  # 75% dan yuqori o'xshashlik

    # O(N^2 / 2) juftlik solishtiruvi
    for i in range(len(attempts)):
        for j in range(i + 1, len(attempts)):
            att1 = attempts[i]
            att2 = attempts[j]

            # Bitta foydalanuvchining o'zini solishtirmaymiz
            if att1.user_id == att2.user_id:
                continue

            sim_pct, matching_cnt, wrong_match_cnt = _calculate_similarity(att1.answers, att2.answers)

            # Vaqt farqi (soniyalarda)
            time_diff_sec = None
            if att1.submitted_at and att2.submitted_at:
                time_diff_sec = abs(int((att1.submitted_at - att2.submitted_at).total_seconds()))

            if sim_pct >= threshold or wrong_match_cnt >= 3:
                # Xavf darajasi
                if sim_pct >= 90 or wrong_match_cnt >= 5:
                    risk_level = 'CRITICAL'
                elif sim_pct >= 80 or wrong_match_cnt >= 3:
                    risk_level = 'HIGH'
                else:
                    risk_level = 'MEDIUM'

                high_risk_pairs.append({
                    'pair_id': f"{att1.id}_{att2.id}",
                    'user1': {
                        'id': att1.user_id,
                        'name': att1.user.full_name or att1.user.phone,
                        'score': float(att1.score or 0),
                        'attempt_id': att1.id,
                        'submitted_at': att1.submitted_at.isoformat() if att1.submitted_at else None,
                    },
                    'user2': {
                        'id': att2.user_id,
                        'name': att2.user.full_name or att2.user.phone,
                        'score': float(att2.score or 0),
                        'attempt_id': att2.id,
                        'submitted_at': att2.submitted_at.isoformat() if att2.submitted_at else None,
                    },
                    'similarity_percent': sim_pct,
                    'matching_answers_count': matching_cnt,
                    'identical_wrong_count': wrong_match_cnt,
                    'time_difference_seconds': time_diff_sec,
                    'risk_level': risk_level,
                    'is_disqualified': att1.disqualified or att2.disqualified,
                })

    # Xavf darajasi bo'yicha saralash
    high_risk_pairs.sort(key=lambda x: (x['similarity_percent'], x['identical_wrong_count']), reverse=True)

    return Response({
        'ok': True,
        'olympiad_id': olympiad.id,
        'olympiad_title': olympiad.title,
        'total_evaluated_attempts': len(attempts),
        'suspicious_pairs_count': len(high_risk_pairs),
        'high_risk_pairs': high_risk_pairs[:50],  # Top 50 ta shubhali juftlik
    })
