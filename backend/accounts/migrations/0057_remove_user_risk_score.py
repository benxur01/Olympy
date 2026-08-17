"""`User.risk_score` ustunini o'chiradi (indeksi bilan birga).

Ustunning yagona yozuvchisi admin GET endpointi edi
(`views_admin_advanced.admin_user_risk_score`) — ya'ni qiymat admin
"Batafsil" oynasini ochmagan hisoblarda abadiy 0 bo'lib qolardi, va o'sha
eskirgan nol jonli proktoring ro'yxati hamda AI xulosasida "xavf yo'q"
degan yolg'on signal berardi. Yon ta'sir olib tashlangach ustunda birorta
ham o'quvchi/yozuvchi qolmadi.

Xavf balli endi hech qachon SAQLANMAYDI, har safar yagona formuladan
hisoblanadi: ro'yxatda `security_queries.annotate_admin_risk` (bitta SQL
ifodasi, N+1 yo'q), "Batafsil" oynasida `views.compute_user_risk_profile`.
Shu sababli davriy Celery task ham qo'shilmadi — u faqat eskirgan qiymat
muammosini qaytargan bo'lardi.

Ma'lumot yo'qolishi: ustundagi ballar (faqat admin ochgan hisoblarda) yo'q
qilinadi. Ular hosila qiymat — manba signallar (`TestAttempt.disqualified`,
`DeviceFingerprint.is_banned`, `ModerationFlag`, exam-ban ustunlari) joyida
qoladi, ya'ni ball istalgan payt qayta hisoblanadi.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0056_alter_phoneverification_purpose'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='user',
            name='risk_score',
        ),
    ]
