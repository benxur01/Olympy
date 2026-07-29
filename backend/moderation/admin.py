from django.contrib import admin

from .models import ModerationFlag


@admin.register(ModerationFlag)
class ModerationFlagAdmin(admin.ModelAdmin):
    """Ops uchun ko'rinish — kundalik ish admin panelining "Xavfsizlik"
    tabida, bu yer esa avtomatik detektor haqiqatan yozayotganini tekshirish
    uchun."""
    list_display = ('id', 'created_at', 'flag_type', 'reason', 'raised_by', 'status')
    list_filter = ('flag_type', 'status')
    search_fields = ('reason', 'resolution_note')
    # Bayroqlarni admin sahifasidan qo'lda yaratish yo'li yo'q: ular yo
    # detektor tomonidan, yo endpoint orqali paydo bo'ladi.
    readonly_fields = ('created_at',)
