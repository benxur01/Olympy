"""Analitika app'ida yangi DB jadval YO'Q.

Admin panelida alohida "Analitika" bo'limini ko'rsatish uchun ``User``
modelining proxy'sidan foydalanamiz: proxy o'z jadvalini yaratmaydi
(``proxy = True``), faqat admin'da alohida ModelAdmin (custom dashboard
sahifasi) ro'yxatdan o'tkazish imkonini beradi. Shu sababli bu app uchun
hech qanday migration jadval yaratmaydi.
"""
from django.contrib.auth import get_user_model

User = get_user_model()


class AnalyticsDashboard(User):
    """Admin menyusida "Analitika" yozuvini ko'rsatuvchi proxy.

    Hech qanday yangi maydon yoki jadval qo'shmaydi — ``RetentionDashboardAdmin``
    bu modelning changelist'ini metrikalar dashboard'iga almashtiradi.
    """

    class Meta:
        proxy = True
        verbose_name = 'Retention va Premium analitikasi'
        verbose_name_plural = 'Retention va Premium analitikasi'
