from django.db import models
from django.conf import settings
from django.utils import timezone


class SubscriptionPlan(models.Model):
    PLAN_TYPE_CHOICES = [
        ('student', 'Student'),
        ('organization', 'Organization'),
    ]

    name = models.CharField(max_length=100)
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPE_CHOICES, default='student')
    price = models.DecimalField(max_digits=12, decimal_places=2)
    duration_days = models.IntegerField(default=30)
    description = models.CharField(max_length=255, blank=True, default='')
    # Plan imkoniyatlari ro'yxati — JSON massiv, masalan:
    # ["Cheksiz olimpiada", "AI savol yaratish", "Telegram bot"]
    features = models.JSONField(default=list, blank=True)
    # Landing'da "Mashhur" sifatida ajratib ko'rsatish uchun.
    is_popular = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.plan_type} ({self.price} UZS)"


class UserSubscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subscriptions')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.SET_NULL, null=True)
    start_date = models.DateTimeField(default=timezone.now)
    end_date = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            # is_premium sync va aktiv obunalarni tekshirish so'rovlari
            # (is_active=True, end_date__gt=now) keng ishlatiladi.
            models.Index(fields=['is_active', 'end_date'], name='usersub_active_enddate_idx'),
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # is_premium sync'iga ta'sir qiluvchi maydonlarning yuklanган
        # holatini eslab qolamiz — save() faqat shular o'zgargandagina
        # qo'shimcha tekshiruv querylarini bajaradi (har saqlashda emas).
        self._sync_snapshot = self._current_sync_state()

    def _current_sync_state(self):
        return (self.is_active, self.end_date, self.plan_id)

    def __str__(self):
        return f"{self.user} - {self.plan} (expires {self.end_date})"

    def save(self, *args, **kwargs):
        if not self.end_date and self.plan:
            self.end_date = self.start_date + timezone.timedelta(days=self.plan.duration_days)
        is_new = self._state.adding
        super().save(*args, **kwargs)

        # is_premium sync'i faqat zarur bo'lganda ishlasin. Har obuna
        # saqlanganda `exists()` + tashkilot a'zolik tekshiruvlari bajarilishi
        # signal-safe emas va keraksiz N+1 query keltirib chiqarardi. Yangi
        # obyektda yoki sync'ga ta'sir qiluvchi maydonlar (is_active, end_date,
        # plan) o'zgargandagina sync bajaramiz.
        sync_changed = is_new or self._current_sync_state() != self._sync_snapshot
        if not sync_changed:
            return
        self._sync_snapshot = self._current_sync_state()

        # Sync is_premium flag to User model and EducationCenters dynamically.
        # Avval bu yerda `self.user.save(update_fields=['is_premium'])` chaqirilardi
        # — bu har obuna saqlanganda butun User qatorini saqlab, signal trigger
        # qilish xavfini tug'dirardi. Endi `User.objects.filter(pk=...).update()`
        # ishlatamiz: atomik, signal trigger qilmaydi va faqat is_premium ustunini
        # yangilaydi. is_premium sync logikasi saqlanadi — billing webhook'lari
        # (_activate_subscription) va admin toggle shu sync'ga tayanadi.
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if self.is_active and self.end_date > timezone.now():
            User.objects.filter(pk=self.user_id).update(is_premium=True)
            if self.plan and self.plan.plan_type == 'organization':
                from centers.models import EducationCenter
                EducationCenter.objects.filter(owner_id=self.user_id).update(is_premium=True)
        else:
            # Check if there are other active subscriptions for this user
            has_active = UserSubscription.objects.filter(
                user_id=self.user_id,
                is_active=True,
                end_date__gt=timezone.now()
            ).exclude(pk=self.pk).exists()

            if not has_active:
                User.objects.filter(pk=self.user_id).update(is_premium=False)

            # Check if there are other active organization subscriptions
            has_active_org = UserSubscription.objects.filter(
                user_id=self.user_id,
                is_active=True,
                plan__plan_type='organization',
                end_date__gt=timezone.now()
            ).exclude(pk=self.pk).exists()

            if not has_active_org:
                from centers.models import EducationCenter
                EducationCenter.objects.filter(owner_id=self.user_id).update(is_premium=False)


class PaymentTransaction(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_SUCCESS = 'success'
    STATUS_FAILED = 'failed'
    
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Kutilmoqda'),
        (STATUS_SUCCESS, 'Muvaffaqiyatli'),
        (STATUS_FAILED, 'Xato'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transactions')
    # Tranzaksiya qaysi plan uchun yaratilganini saqlaymiz. Webhook obunani
    # aktivlashtirayotganda aynan shu plan ishlatiladi — narx bo'yicha taxmin
    # qilish (bir xil narxli planlar orasida noaniqlik) o'rniga.
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    manager_commission = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    provider = models.CharField(max_length=50) # 'click' or 'payme'
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    provider_transaction_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            # Tranzaksiyalar status bo'yicha filtrlanadi (pending/success) va
            # created_at bo'yicha hisobotlarda saralanadi.
            models.Index(fields=['status'], name='paytx_status_idx'),
            models.Index(fields=['created_at'], name='paytx_created_idx'),
        ]

    def __str__(self):
        return f"{self.provider} - {self.amount} UZS ({self.status})"

