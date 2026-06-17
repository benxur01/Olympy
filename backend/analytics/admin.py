"""Admin panelidagi "Retention va Premium analitikasi" dashboard sahifasi.

``AnalyticsDashboard`` proxy modelining changelist'ini metrikalar sahifasiga
almashtiramiz. Sahifa ``analytics.metrics.get_metrics`` orqali cache'langan
qiymatlarni o'qiydi (default 10 daqiqa), shuning uchun katta jadvallarda har
ochilganda og'ir query bajarilmaydi. URL'dagi ``?refresh=1`` cache'ni chetlab
o'tib qayta hisoblaydi.
"""
from django.contrib import admin
from django.template.response import TemplateResponse

from .metrics import METRICS_CACHE_SECONDS, get_metrics
from .models import AnalyticsDashboard


@admin.register(AnalyticsDashboard)
class RetentionDashboardAdmin(admin.ModelAdmin):
    """Faqat o'qish uchun dashboard — yaratish/o'zgartirish/o'chirish yo'q."""

    # Admin menyuda "qo'shish" tugmasi va obyekt sahifalari ko'rinmasin.
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        # Changelist (ro'yxat) sahifasi ochilishi uchun True qaytarishimiz
        # kerak, lekin obyekt tahriri yo'q (changelist'ni biz override qilamiz).
        return obj is None

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        # Faqat staff/superuser ko'radi (admin site allaqachon shuni talab
        # qiladi). Metrikalarni cache'dan (yoki refresh) olamiz.
        force = request.GET.get('refresh') == '1'
        metrics = get_metrics(force_refresh=force)

        context = {
            **self.admin_site.each_context(request),
            'title': 'Retention va Premium analitikasi',
            'metrics': metrics,
            'cache_minutes': METRICS_CACHE_SECONDS // 60,
            'opts': self.model._meta,
            'cl': None,
        }
        if extra_context:
            context.update(extra_context)
        return TemplateResponse(
            request, 'admin/analytics/dashboard.html', context,
        )
