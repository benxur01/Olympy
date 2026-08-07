"""`django.contrib.admin` uchun loyiha AppConfig'i (INSTALLED_APPS'da o'sha o'rinda).

Yagona farqi — `default_site`: `django.contrib.admin.sites.site` lazy proxy'si
standart `AdminSite` o'rniga `OlympyAdminSite` ga yechiladi (u login'da
2FA/TOTP kodini talab qiladi; batafsil izoh `accounts/admin_site.py` da).

NEGA ALOHIDA MODUL (`accounts/apps.py` emas): Django INSTALLED_APPS'dagi
`'accounts'` yozuvini ko'rganda `accounts.apps` modulidagi BARCHA AppConfig
sinflarini (import qilinganlarini ham) sanaydi va `default = True` bo'lganlari
bittadan ko'p bo'lsa `RuntimeError` beradi. `AdminConfig` da `default = True`
bo'lgani uchun uni `accounts/apps.py` ga import qilish aynan shu xatoni
keltirib chiqaradi.

`default_site` ATAYIN satr: bu modul `apps.populate` ning eng boshida import
qilinadi, `accounts.admin_site` esa zanjir bo'ylab `django.contrib.auth.forms`
ni tortadi va u modul darajasida `get_user_model()` chaqiradi — o'sha paytda
app registry hali tayyor emas (AppRegistryNotReady). Satr esa faqat
`admin.site` birinchi marta ishlatilganda (autodiscover, ya'ni ready()
bosqichida) import qilinadi.
"""
from django.contrib.admin.apps import AdminConfig


class OlympyAdminConfig(AdminConfig):
    default_site = 'accounts.admin_site.OlympyAdminSite'
