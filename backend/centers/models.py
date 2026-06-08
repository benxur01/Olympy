from django.conf import settings
from django.db import models


class EducationCenter(models.Model):
    """Organization owned by a single user.

    Newly registered organizations start as ``pending`` and are activated only
    after a Platform Admin approves them. Owners cannot manage staff until then.
    """
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_APPROVED, 'Tasdiqlandi'),
        (STATUS_REJECTED, 'Rad etildi'),
    ]

    name = models.CharField(max_length=160)
    organization_type = models.CharField(
        max_length=80,
        default="O'quv markaz",
        db_index=True,
    )
    country = models.CharField(max_length=80, default="O'zbekiston", db_index=True)
    region = models.CharField(max_length=100, blank=True, default='', db_index=True)
    district = models.CharField(max_length=100, blank=True, default='', db_index=True)
    city = models.CharField(max_length=80)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='owned_centers',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    # Premium tashkilot bayrog'i — faqat platforma admini boshqaradi.
    is_premium = models.BooleanField(default=False, db_index=True)
    subjects = models.JSONField(default=list, blank=True)
    image = models.ImageField(upload_to='centers/', blank=True, null=True)
    rating = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        location = self.district or self.region or self.city
        return f'{self.name} ({location})'


class CenterMembership(models.Model):
    """Per-(user,center) role assignment with its own approval lifecycle.

    A user can hold multiple memberships (e.g. student at one center, manager
    at another). Membership status drives access to center-specific features:
    olympiads, question creation, manager dashboard, etc.
    """
    ROLE_STUDENT = 'student'
    ROLE_TEACHER = 'teacher'
    ROLE_MANAGER = 'manager'
    ROLE_OWNER = 'owner'
    ROLE_CHOICES = [
        (ROLE_STUDENT, 'Student'),
        (ROLE_TEACHER, 'Teacher'),
        (ROLE_MANAGER, 'Manager'),
        (ROLE_OWNER, 'Owner'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_APPROVED, 'Tasdiqlandi'),
        (STATUS_REJECTED, 'Rad etildi'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    subject = models.CharField(max_length=80, blank=True)
    # Guruh/sinf tegi — guruh olimpiadasi (Olympiad.group_filter) shu tegga
    # qarab kim qatnasha olishini cheklaydi. Bo'sh bo'lsa guruhsiz a'zo.
    group_tag = models.CharField(max_length=50, blank=True, default='', db_index=True)
    approval_code = models.CharField(max_length=16, blank=True, db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='approved_memberships',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Y7: status o'zgargan paytni bilish uchun — rejected ariza qachon
    # rad etilgani aniqlanadi va cooldown shu vaqtdan boshlab hisoblanadi.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'center', 'role'],
                name='unique_user_center_role',
            ),
        ]
        indexes = [
            # Foydalanuvchining ma'lum roldagi (approved/pending) a'zoligini
            # tez topish — primary_center_for_user va ruxsat tekshiruvlarida.
            models.Index(fields=['user', 'role', 'status']),
        ]

    def __str__(self):
        return f'{self.user_id}/{self.center_id}/{self.role} [{self.status}]'


class CenterQuestion(models.Model):
    """Markazning shaxsiy savol banki.

    Bu modelda saqlangan savollar olimpiadalarga to'g'ridan-to'g'ri
    biriktirilmaydi — ular markazning "qoralama"/qayta ishlatish uchun
    saqlangan zaxirasi. ``options`` JSON ko'rinishida saqlanadi:
    ``[{"text": "...", "correct": true}, ...]``.
    """
    DIFFICULTY_EASY = 'easy'
    DIFFICULTY_MEDIUM = 'medium'
    DIFFICULTY_HARD = 'hard'
    DIFFICULTY_CHOICES = [
        (DIFFICULTY_EASY, 'Oson'),
        (DIFFICULTY_MEDIUM, "O'rta"),
        (DIFFICULTY_HARD, 'Qiyin'),
    ]

    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='question_bank',
    )
    text = models.TextField()
    options = models.JSONField(default=list)
    subject = models.CharField(max_length=80, blank=True, default='')
    difficulty = models.CharField(
        max_length=10, choices=DIFFICULTY_CHOICES, default=DIFFICULTY_MEDIUM,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_center_questions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.text[:60]


class CenterRatingHistory(models.Model):
    """T7: Markaz reyting dinamikasi tarixi.

    Har hafta (management command orqali) markazning o'sha kundagi reyting
    o'rni (rank) va o'rtacha balli (score) shu yerga yoziladi. Keyin
    rating-history endpoint orqali oxirgi N oydagi dinamika grafigi tuziladi.
    Har (center, date) juftligi yagona — bir kunda ikki marta yozilmaydi.
    """
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='rating_history',
    )
    date = models.DateField(db_index=True)
    rank = models.PositiveIntegerField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date']
        constraints = [
            models.UniqueConstraint(
                fields=['center', 'date'],
                name='unique_center_rating_date',
            ),
        ]

    def __str__(self):
        return f'{self.center_id}@{self.date}: rank={self.rank} score={self.score}'


class ExternalOlympiadResult(models.Model):
    """T3: Tashqi (platformadan tashqari) olimpiada natijasi.

    Markaz menejeri CSV orqali o'quvchilarining boshqa platformalarda yoki
    real (oflayn) olimpiadalarda erishgan natijalarini import qiladi. Shu
    yozuvlar markaz analitikasini boyitadi. `student` — markazning o'quvchisi
    (telefon bo'yicha topiladi), `center` — import qilgan markaz.
    """
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='external_results',
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='external_olympiad_results',
    )
    olympiad_name = models.CharField(max_length=200)
    date = models.DateField()
    score = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    max_score = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-imported_at']
        indexes = [
            models.Index(fields=['center', '-date']),
        ]

    def __str__(self):
        return f'{self.student_id}: {self.olympiad_name} ({self.score}/{self.max_score})'


class MockOlympiad(models.Model):
    """T4: Markaz tomonidan tuzilgan mashq (mock) olimpiadasi.

    Haqiqiy Olympiad/musobaqadan farqli: jadval, faollik holati va
    diskvalifikatsiya logikasi yo'q. O'quvchi xohlagan paytda boshlab,
    javoblarini topshiradi va natija MockAttempt'da saqlanadi. Savollar
    mavjud `questions.Question` modelidan tanlanadi (ManyToMany).
    """
    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='mock_olympiads',
    )
    # O'tib ketgan (tugagan) real olimpiadadan avtomatik yaratilgan mashq
    # nusxasi bo'lsa — manba olimpiada. Bo'sh (null) bo'lsa, markaz menejeri
    # qo'lda tuzgan oddiy mock. Olimpiada o'chirilsa SET_NULL — mashq nusxasi
    # va uning urinishlari saqlanib qoladi (reytingga ta'sir qilmaydi).
    source_olympiad = models.ForeignKey(
        'olympiads.Olympiad',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='practice_mocks',
    )
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=80, blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_mock_olympiads',
    )
    questions = models.ManyToManyField(
        'questions.Question',
        related_name='mock_olympiads',
        blank=True,
    )
    time_limit_minutes = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} (mock@{self.center_id})'


class MockAttempt(models.Model):
    """T4: O'quvchining mock olimpiadadagi urinishi.

    `answers` — {question_id: chosen_option_index} JSON map. Har (mock, user)
    juftligi yagona — o'quvchi bir mock'ni bir marta topshiradi.
    """
    mock = models.ForeignKey(
        MockOlympiad,
        on_delete=models.CASCADE,
        related_name='attempts',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mock_attempts',
    )
    answers = models.JSONField(default=dict, blank=True)
    score = models.PositiveIntegerField(default=0)
    correct_count = models.PositiveIntegerField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(
                fields=['mock', 'user'],
                name='unique_mock_user_attempt',
            ),
        ]

    def __str__(self):
        return f'mock-attempt:{self.user_id}@{self.mock_id} = {self.score}'


class ManagerActivityLog(models.Model):
    """T5: Menejer faoliyat logi.

    Owner markaz menejerlarining muhim amallarini (reja yuborish, tahlil,
    eksport/import, hisobot ko'rish) shu yerda kuzatadi. `target_user` —
    amal tegishli o'quvchi (bo'lsa).
    """
    ACTION_SEND_PLAN = 'send_plan'
    ACTION_SEND_ANALYSIS = 'send_analysis'
    ACTION_EXPORT_DATA = 'export_data'
    ACTION_IMPORT_RESULTS = 'import_results'
    ACTION_VIEW_REPORT = 'view_report'
    ACTION_CHOICES = [
        (ACTION_SEND_PLAN, "Reja yuborish"),
        (ACTION_SEND_ANALYSIS, "Tahlil yuborish"),
        (ACTION_EXPORT_DATA, "Ma'lumot eksporti"),
        (ACTION_IMPORT_RESULTS, "Natija importi"),
        (ACTION_VIEW_REPORT, "Hisobot ko'rish"),
    ]

    center = models.ForeignKey(
        EducationCenter,
        on_delete=models.CASCADE,
        related_name='manager_logs',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='manager_activity_logs',
    )
    action_type = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='manager_log_targets',
    )
    description = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['center', '-created_at']),
            models.Index(fields=['manager', '-created_at']),
        ]

    def __str__(self):
        return f'{self.manager_id}:{self.action_type}@{self.center_id}'
