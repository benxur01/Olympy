import uuid

from django.conf import settings
from django.db import models

from olympiads.models import Olympiad


class TestAttempt(models.Model):
    """One submission of an olympiad by a student.

    Score is stored as the final weighted percentage (0..100). ``answers`` is
    a JSON map of {question_id: chosen_option_index}. ``rank`` is calculated
    at submission time and may be re-computed by background jobs.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    olympiad = models.ForeignKey(
        Olympiad,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    answers = models.JSONField(default=dict, blank=True)
    score = models.PositiveIntegerField(default=0)
    correct_count = models.PositiveIntegerField(default=0)
    wrong_count = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    time_spent = models.PositiveIntegerField(default=0)  # seconds
    rank = models.PositiveIntegerField(null=True, blank=True)
    # Cheating sababli diskvalifikatsiya qilingan attempt'lar. Avval cheating
    # bo'lganda attempt umuman yaratilmasdi va student na leaderboard'da,
    # na manager statistikasida ko'rinmasdi. Endi disqualified=True bilan
    # attempt yaratiladi va manager paneli "diskvalifitsiya bo'lgan" deb
    # ko'rsata oladi.
    disqualified = models.BooleanField(default=False)
    # Sertifikat ommaviy tekshiruv (verify) UUID'i. Sertifikatda QR/URL
    # sifatida ko'rsatiladi: prolymp.uz/certificates/verify/<uuid>. Public
    # endpoint shu UUID orqali sertifikat haqiqiyligini tasdiqlaydi. Eski
    # attempt'larda NULL bo'lishi mumkin (migratsiya null=True bilan qo'shadi);
    # download_certificate paytida lazy ravishda to'ldiriladi.
    certificate_uuid = models.UUIDField(
        default=uuid.uuid4, unique=True, null=True, blank=True, db_index=True,
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'olympiad'],
                name='unique_user_olympiad',
            ),
        ]
        # Performance indekslari:
        # - leaderboard `order_by('-score', 'time_spent')` per-olympiad —
        #   olympiad+score+time_spent compound indeksi tezroq ishlaydi
        # - `my_results` user bo'yicha so'nggi attempts ro'yxati
        indexes = [
            models.Index(
                fields=['olympiad', '-score', 'time_spent'],
                name='attempt_leaderboard_idx',
            ),
            models.Index(
                fields=['user', '-submitted_at'],
                name='attempt_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.user_id}@{self.olympiad_id} = {self.score}'


class TestSession(models.Model):
    """Server-side test start record and randomized question/option order."""
    STATUS_ACTIVE = 'active'
    STATUS_DISQUALIFIED = 'disqualified'
    STATUS_COMPLETED = 'completed'
    # Cheating aniqlangach session darhol DQ qilinmaydi — menejer/owner
    # tasdiqlashini kutadi. Bu davrda student "tekshirilmoqda" ekranida
    # kutadi va imtihon taymeri to'xtatiladi (paused_seconds hisoblanadi).
    STATUS_PENDING_REVIEW = 'pending_review'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_DISQUALIFIED, 'Disqualified'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_PENDING_REVIEW, 'Pending review'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='test_sessions',
    )
    olympiad = models.ForeignKey(
        Olympiad,
        on_delete=models.CASCADE,
        related_name='test_sessions',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    disqualified_at = models.DateTimeField(null=True, blank=True)
    cheating_reason = models.CharField(max_length=120, blank=True)
    question_order = models.JSONField(default=list, blank=True)
    option_orders = models.JSONField(default=dict, blank=True)
    # Parallel sessiya tekshiruvi uchun: oxirgi ping kelgan qurilma identifikatori
    # va ping vaqti. Agar 30 soniyadan kam vaqt ichida boshqa device_id'dan ping
    # kelsa — bir vaqtda ikki qurilmadan kirilgan deb hisoblanadi va session DQ.
    last_device_id = models.CharField(max_length=64, blank=True, default='')
    last_ping_at = models.DateTimeField(null=True, blank=True)
    # Human-in-the-loop cheating tekshiruvi. Cheating aniqlangach session
    # PENDING_REVIEW holatiga o'tadi va menejer/owner qaror qilishini kutadi.
    # `review_requested_at` — kutish boshlangan vaqt (10 daqiqalik auto-timeout
    # shu vaqtdan hisoblanadi). `reviewed_by`/`reviewed_at` — qaror kim va qachon
    # qilgani (auto-disqualify'da reviewed_by=None bo'lib audit izini qoldiradi).
    review_requested_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_test_sessions',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    # PENDING_REVIEW da o'tkazilgan umumiy soniyalar. Imtihon muddati shu qadar
    # uzaytiriladi (session_end_time), shunda student tekshiruvni kutib vaqt
    # yo'qotmaydi. Bir sessiyada bir necha marta pending bo'lsa yig'iladi.
    paused_seconds = models.PositiveIntegerField(default=0)
    # Webkamera proktoring rozilikni kuzatish. Olimpiadada
    # `camera_proctoring_enabled` yoqilgan bo'lsa, student imtihonni
    # boshlashdan oldin rozilik ekranida tasdiqlaydi. Bu yerda FAQAT boolean
    # rozilik va vaqt tamg'asi saqlanadi — hech qanday video/rasm/audio EMAS.
    camera_consent_given = models.BooleanField(default=False)
    camera_consent_at = models.DateTimeField(null=True, blank=True)
    # Ovoz (mikrofon) proktoring rozilikni kuzatish. Olimpiadada
    # `voice_proctoring_enabled` yoqilgan bo'lsa, student imtihonni
    # boshlashdan oldin rozilik ekranida tasdiqlaydi. Kamera roziligidan
    # MUSTAQIL. Bu yerda FAQAT boolean rozilik va vaqt tamg'asi saqlanadi —
    # hech qanday audio/ovoz EMAS.
    microphone_consent_given = models.BooleanField(default=False)
    microphone_consent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'olympiad'],
                name='unique_user_olympiad_session',
            ),
        ]
        indexes = [
            # Live proctoring va statistika so'rovlari (olympiad bo'yicha
            # status filtrlash) uchun composite indeks.
            models.Index(
                fields=['olympiad', 'status'],
                name='testsession_olymp_status_idx',
            ),
        ]

    def __str__(self):
        return f'session:{self.user_id}@{self.olympiad_id}'


class CodeSubmission(models.Model):
    """IT (kod) savoliga o'quvchi yuborgan kod javobi va AI bahosi.

    Oddiy MCQ javoblar `TestAttempt.answers` (option index) ichida saqlanadi;
    kod savollar option index'ga sig'maydi, shu sababli ular shu alohida
    modelda saqlanadi — har (attempt, savol) juftligi uchun bitta yozuv. Bu
    mavjud MCQ ball hisoblash tizimini umuman o'zgartirmaydi.

    `ai_code_score` — AI bergan 0..100 ball (None bo'lsa hali baholanmagan),
    `ai_code_review` — AI matnli tavsiya/tahlil. Ustoz/menejer bularni
    olimpiada natijalari sahifasida ko'radi.
    """
    attempt = models.ForeignKey(
        TestAttempt,
        on_delete=models.CASCADE,
        related_name='code_submissions',
    )
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='code_submissions',
    )
    submitted_code = models.TextField(blank=True, default='')
    code_language = models.CharField(max_length=30, blank=True, default='')
    ai_code_review = models.TextField(blank=True, default='', help_text="AI tavsiyasi")
    ai_code_score = models.IntegerField(null=True, blank=True, help_text="AI ball (0-100)")
    # Judge0 test caslar natijasi: barcha test caslar accepted bo'lsa True,
    # bittasi xato bo'lsa False, hali tekshirilmagan bo'lsa None. MCQ kabi
    # avtomatik ball hisoblash shu maydonga tayanadi (True bo'lsa savolning
    # to'liq balli beriladi).
    all_tests_passed = models.BooleanField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['question_id']
        constraints = [
            models.UniqueConstraint(
                fields=['attempt', 'question'],
                name='unique_attempt_code_question',
            ),
        ]

    def __str__(self):
        return f'code:{self.attempt_id}@q{self.question_id}'


class EssayGrade(models.Model):
    """Essay savoliga teacher/manager qo'ygan qo'lda baho.

    Essay javoblar avtomatik baholanmaydi (questions.grading RESULT_PENDING) —
    ustoz/menejer har (attempt, savol) juftligi uchun 0..question.score
    oralig'ida ball va ixtiyoriy izoh qo'yadi. Baho saqlanganda attempt'ning
    score/percentage qiymati qayta hisoblanadi (score_session_answers
    `attempt` rejimida baholangan essay'larni ham hisobga oladi).
    """
    attempt = models.ForeignKey(
        TestAttempt,
        on_delete=models.CASCADE,
        related_name='essay_grades',
    )
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='essay_grades',
    )
    score = models.PositiveIntegerField(default=0)
    feedback = models.TextField(blank=True, default='', help_text="Ustoz izohi")
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='essay_grades_given',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['question_id']
        constraints = [
            models.UniqueConstraint(
                fields=['attempt', 'question'],
                name='unique_attempt_essay_question',
            ),
        ]

    def __str__(self):
        return f'essay-grade:{self.attempt_id}@q{self.question_id} = {self.score}'


class AttemptAIAnalysis(models.Model):
    """O4: Attempt uchun avtomatik AI tahlili.

    Premium o'quvchi test topshirganda AI tahlili generatsiya qilinib shu
    yerda saqlanadi. `status` — pending/ready/failed. Har attempt uchun bitta
    tahlil (OneToOne). Tayyor bo'lmasa endpoint {status: "pending"} qaytaradi.
    """
    STATUS_PENDING = 'pending'
    STATUS_READY = 'ready'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_READY, 'Tayyor'),
        (STATUS_FAILED, 'Xatolik'),
    ]

    attempt = models.OneToOneField(
        TestAttempt,
        on_delete=models.CASCADE,
        related_name='ai_analysis',
    )
    analysis_text = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'ai-analysis:{self.attempt_id} [{self.status}]'


class DuelResult(models.Model):
    """Final outcome of a real-time "Brain Battles" 1v1 duel.

    The live match runs in the separate Java (Spring Boot) service, holding
    state in-memory. When a duel ends, that service POSTs the final result to
    ``POST /api/attempts/duel-result/`` so Django stays the source of truth for
    scores/records. Django never participates in the live match; it only
    persists the finished outcome here.

    Kept intentionally minimal: the two players, their scores, subject context,
    an optional winner (NULL = draw), and the Spring-side ``match_id`` for
    idempotency/traceability.
    """
    match_id = models.CharField(max_length=64, blank=True, default='', db_index=True)
    player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='duel_results_as_player1',
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='duel_results_as_player2',
    )
    player1_score = models.PositiveIntegerField(default=0)
    player2_score = models.PositiveIntegerField(default=0)
    # NULL winner means a draw. SET_NULL so deleting a user doesn't drop the row.
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='duel_results_won',
    )
    subject = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'duel-result:{self.player1_id}({self.player1_score}) vs ' \
               f'{self.player2_id}({self.player2_score})'


class QuizResult(models.Model):
    """Final leaderboard of a live "Kahoot-style" classroom quiz.

    Like ``DuelResult``, the live game runs entirely in the separate Java
    (Spring Boot) service, holding room state in-memory. When a quiz finishes,
    that service POSTs the final leaderboard to
    ``POST /api/attempts/quiz-result/`` so Django stays the source of truth for
    the record. Django never participates in the live game.

    Kept intentionally lightweight: the room code/title, the host, and the
    ranked participants stored as a single JSON list (each
    ``{user_id, name, score, rank}``) — following the ``DailyPracticeSet``
    convention of a ``JSONField`` for a small self-contained payload rather than
    a separate row per participant.
    """
    room_code = models.CharField(max_length=64, blank=True, default='', db_index=True)
    title = models.CharField(max_length=200, blank=True, default='')
    # NULL host means the account was deleted; SET_NULL so the record survives.
    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quiz_results_hosted',
    )
    # Ranked leaderboard rows: [{"user_id": int, "name": str, "score": int, "rank": int}].
    participants = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'quiz-result:{self.room_code} ({len(self.participants)} ishtirokchi)'


class EssayAIFeedback(models.Model):
    """O4 (Plus): Insho javobi uchun on-demand chuqur AI tahlili.

    `AttemptAIAnalysis`dan farqi — har (attempt, savol) juftligi uchun
    alohida yozuv (bitta attempt bir nechta essay savolga ega bo'lishi
    mumkin). Faqat Plus+ o'quvchi tugmani bosganda lazy yaratiladi va
    Celery task Gemini orqali `feedback_text`ni to'ldiradi. Ustoz bahosiga
    (EssayGrade) daxl qilmaydi — bu faqat matnli tavsiya.
    """
    STATUS_PENDING = 'pending'
    STATUS_READY = 'ready'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_READY, 'Tayyor'),
        (STATUS_FAILED, 'Xatolik'),
    ]

    attempt = models.ForeignKey(
        TestAttempt,
        on_delete=models.CASCADE,
        related_name='essay_ai_feedbacks',
    )
    question = models.ForeignKey(
        'questions.Question',
        on_delete=models.CASCADE,
        related_name='essay_ai_feedbacks',
    )
    feedback_text = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['question_id']
        constraints = [
            models.UniqueConstraint(
                fields=['attempt', 'question'],
                name='unique_attempt_essay_ai_feedback',
            ),
        ]

    def __str__(self):
        return f'essay-ai:{self.attempt_id}@q{self.question_id} [{self.status}]'
