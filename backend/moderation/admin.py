from django.contrib import admin

from .models import BlockedIP, ModerationFlag


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


@admin.register(BlockedIP)
class BlockedIPAdmin(admin.ModelAdmin):
    """Ops uchun oxirgi chora: panel ishlamay qolsa (yoki admin o'zini
    bloklab qo'ysa) blokni shu yerdan olib tashlash mumkin. Kundalik ish
    "Xavfsizlik" tabida."""
    list_display = ('id', 'created_at', 'cidr', 'reason', 'blocked_by', 'expires_at')
    search_fields = ('ip_address', 'reason')
    readonly_fields = ('created_at',)
