import uuid

from django.conf import settings
from django.db import models

from olympiads.models import Olympiad

from .storage import evidence_storage


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
    # boshlashdan oldin rozilik ekranida tasdiqlaydi. Shu QATORDA faqat
    # boolean rozilik va vaqt tamg'asi turadi.
    #
    # DIQQAT (avval "hech qanday rasm saqlanmaydi" deb yozilgan edi — endi bu
    # NOTO'G'RI): jonli oqim hamon saqlanmaydi, lekin cheating bayrog'i
    # qo'yilgan va diskvalifikatsiya tasdiqlangan LAHZADA bitta kadr
    # `EvidenceSnapshot` sifatida yozib qoldiriladi (appellyatsiya va qarorni
    # qayta ko'rish uchun). Bu shaxsiy/biometrik ma'lumot: yopiq storage'da
    # (`attempts/storage.py`), faqat platforma admini uchun ochiq va
    # `EVIDENCE_RETENTION_DAYS` (90 kun) dan keyin `cleanup_expired_evidence`
    # bilan butunlay o'chiriladi. Batafsil — `EvidenceSnapshot` docstringi.
    camera_consent_given = models.BooleanField(default=False)
    camera_consent_at = models.DateTimeField(null=True, blank=True)
    # Ovoz (mikrofon) proktoring rozilikni kuzatish. Olimpiadada
    # `voice_proctoring_enabled` yoqilgan bo'lsa, student imtihonni
    # boshlashdan oldin rozilik ekranida tasdiqlaydi. Kamera roziligidan
    # MUSTAQIL. Bu yerda FAQAT boolean rozilik va vaqt tamg'asi saqlanadi —
    # hech qanday audio/ovoz saqlanmaydi (dalil kadrida ham audio yo'q, faqat
    # `EvidenceSnapshot.metadata` dagi son — ovoz DARAJASI).
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


class EvidenceSnapshot(models.Model):
    """Cheating bayrog'i/diskvalifikatsiya LAHZASIDAGI proktoring kadri.

    Nima uchun: shu paytgacha jonli kadr faqat Redis keshida, 20 soniyalik TTL
    bilan turardi (`session_live_frame`). Diskvalifikatsiyadan keyin "nega?"
    degan savolga faqat matn (`TestSession.cheating_reason`) javob berardi —
    appellyatsiyada ham, qarorni ikkinchi menejer qayta ko'rganda ham hech
    qanday dalil qolmasdi.

    Qamrov ATAYIN tor: kadr FAQAT ikki lahzada olinadi (`trigger`) — bayroq
    qo'yilganda va diskvalifikatsiya yakunlanganda. Davriy (har 30-60 soniyada)
    surat olish YO'Q: u imtihonning butun davomini yozib olishga aylanardi.

    Shaxsiy ma'lumot rejimi:
      * fayllar `attempts/storage.py` dagi yopiq storage'da — `MEDIA_ROOT`/
        Cloudinary'da EMAS, ya'ni nginx'ning autentifikatsiyasiz `/media/`
        bloki ularga umuman yeta olmaydi;
      * yagona kirish nuqtasi — `views_evidence.admin_evidence_image`
        (faqat platforma admini);
      * `EVIDENCE_RETENTION_DAYS` (90 kun) dan keyin fayl ham, qator ham
        `attempts.tasks.cleanup_expired_evidence` bilan o'chiriladi.

    Kadr YO'Q bo'lishi ham normal holat (kesh TTL'i 20 soniya): kamera o'chiq,
    tarmoq sekin yoki o'quvchi umuman kadr yubormagan bo'lsa yozuv yaratilmaydi
    — batafsil `views.capture_evidence_snapshot`.
    """
    TRIGGER_FLAGGED = 'flagged'
    TRIGGER_DISQUALIFIED = 'disqualified'
    TRIGGER_CHOICES = [
        (TRIGGER_FLAGGED, 'Bayroq qo\'yildi (tekshiruv kutilmoqda)'),
        (TRIGGER_DISQUALIFIED, 'Diskvalifikatsiya tasdiqlandi'),
    ]

    session = models.ForeignKey(
        TestSession,
        on_delete=models.CASCADE,
        related_name='evidence_snapshots',
    )
    # Kamera kadri (JPEG). Bo'sh bo'lishi mumkin — ekran kadri bor-u, kamera
    # kadri yo'q holat (kamera roziligi berilmagan) haqiqiy stsenariy.
    image = models.FileField(
        upload_to='camera/%Y/%m/%d/', storage=evidence_storage, blank=True,
    )
    # Ekran kadri (screen share) — kamera kadridan MUSTAQIL: ko'p hollarda
    # umuman bo'lmaydi (o'quvchi ekranini ulashmagan).
    screen_image = models.FileField(
        upload_to='screen/%Y/%m/%d/', storage=evidence_storage,
        null=True, blank=True,
    )
    captured_at = models.DateTimeField(auto_now_add=True)
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES)
    # Kadr bilan BIR VAQTDA kelgan signallar: audio_level, face_detected,
    # speech_detected, app_switched, tab_escapes, is_in_background va kadrning
    # kesh yoshini ko'rsatuvchi `frame_updated_at`. Rasm bo'lmasa ham menejerga
    # kontekst beradi, shu sababli alohida ustunlar emas, erkin JSON.
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-captured_at']
        indexes = [
            # Retention sweep (`captured_at < cutoff`) butun jadvalni
            # skanerlamasin — u har kuni ishlaydi va jadval faqat o'sadi.
            models.Index(fields=['captured_at'], name='evidence_captured_idx'),
        ]

    def __str__(self):
        return f'evidence:{self.session_id} [{self.trigger}]'


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
    # Judge0 baholash oqimining holati. `all_tests_passed` (True/False/None)
    # o'quvchi KODINING natijasini bildiradi; bu maydon esa BAHOLASHNING O'ZI
    # muvaffaqiyatli tugadimi degan savolga javob beradi. Ikkisi ajratilgan,
    # chunki Judge0 kvotasi tugaganda (429), tarmoq uzilganda yoki retry zanjiri
    # tugaganda `all_tests_passed=False` yoziladi — bu esa to'g'ri yozilgan
    # kodni ham "xato javob" ko'rinishiga keltirardi va o'quvchi nohaq 0 ball
    # olardi (imtihon adolati muammosi).
    #   pending        → Judge0 hali javob bermagan (yangi yozuv default holati)
    #   graded         → Judge0 natija berdi, `all_tests_passed` ishonchli
    #   pending_review → infratuzilma nosozligi (kvota/timeout/tarmoq). Avtomatik
    #                    ball hisobiga UMUMAN kirmaydi (baholanmagan insho kabi)
    #                    va menejer/o'qituvchi qo'lda tekshirishi kutiladi.
    #                    Naqsh `TestSession.STATUS_PENDING_REVIEW` dan olingan.
    EVAL_PENDING = 'pending'
    EVAL_GRADED = 'graded'
    EVAL_PENDING_REVIEW = 'pending_review'
    EVAL_STATUS_CHOICES = [
        (EVAL_PENDING, 'Tekshirilmoqda'),
        (EVAL_GRADED, 'Baholandi'),
        (EVAL_PENDING_REVIEW, "Qo'lda tekshirish kerak (runner nosozligi)"),
    ]

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
    # Baholash oqimining holati — yuqoridagi EVAL_* izohiga qarang. Eski
    # qatorlarda migratsiya `pending` qo'yadi; ball hisoblash faqat
    # `pending_review` ni maxsus ko'radi, shu sababli eski yozuvlarning xulqi
    # o'zgarmaydi.
    evaluation_status = models.CharField(
        max_length=20,
        choices=EVAL_STATUS_CHOICES,
        default=EVAL_PENDING,
        db_index=True,
    )
    # Infratuzilma nosozligining sababi (429 kvota, timeout, tarmoq) — menejer
    # panelida va adminda ko'rinadi, qo'lda qayta baholashda kontekst beradi.
    evaluation_error = models.CharField(max_length=200, blank=True, default='')
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
