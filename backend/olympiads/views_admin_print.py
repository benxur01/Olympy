"""Printable Exam Booklet, OMR Answer Sheet, and Answer Key views for Olympiads.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsPlatformAdmin
from olympiads.models import Olympiad


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def admin_generate_printable_exam(request, olympiad_id):
    """Olimpiada savollari, chop etishga tayyor test kitobchasi va OMR javoblar

    varaqasi ma'lumotlari.
    """
    try:
        olympiad = Olympiad.objects.prefetch_related('questions').get(pk=olympiad_id)
    except Olympiad.DoesNotExist:
        return Response({'ok': False, 'message': "Olimpiada topilmadi."}, status=status.HTTP_404_NOT_FOUND)

    questions_data = []
    answer_keys = []

    option_letters = ['A', 'B', 'C', 'D', 'E', 'F']

    for idx, q in enumerate(olympiad.questions.all().order_by('id'), 1):
        opts = []
        if isinstance(q.options, list):
            for o_idx, opt_text in enumerate(q.options):
                opts.append({
                    'letter': option_letters[o_idx] if o_idx < len(option_letters) else str(o_idx + 1),
                    'text': opt_text,
                })

        correct_idx = q.correct_answer if isinstance(q.correct_answer, int) else 0
        correct_letter = option_letters[correct_idx] if 0 <= correct_idx < len(option_letters) else 'A'

        questions_data.append({
            'number': idx,
            'id': q.id,
            'text': q.text,
            'image_url': q.image.url if hasattr(q, 'image') and q.image else None,
            'options': opts,
            'explanation': getattr(q, 'explanation', ''),
            'points': getattr(q, 'points', 1),
        })

        answer_keys.append({
            'number': idx,
            'question_id': q.id,
            'correct_letter': correct_letter,
            'correct_index': correct_idx,
        })

    return Response({
        'ok': True,
        'olympiad': {
            'id': olympiad.id,
            'title': olympiad.title,
            'subject': olympiad.subject,
            'duration_minutes': olympiad.duration_minutes,
            'max_score': olympiad.max_score,
            'center_name': olympiad.center.name if olympiad.center else "Olympy Platformasi",
        },
        'total_questions': len(questions_data),
        'questions': questions_data,
        'answer_keys': answer_keys,
    })
