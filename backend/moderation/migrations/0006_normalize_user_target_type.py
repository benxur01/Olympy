from django.db import migrations


def normalize_user_target_type(apps, schema_editor):
    """Foydalanuvchi nishonini bitta shaklga — 'User' ga — keltiradi.

    Nishon turi model KLASSINING nomi bo'lishi kerak ('Question', 'Olympiad',
    'User' — `AuditLog.target_type` dagi `type(target).__name__` bilan bir xil
    qoida; kichik harfli 'ip_address' istisno emas, u umuman model emas).

    Xavf ballini hisoblaydigan ikkala so'rov (`accounts.security_queries.
    annotate_admin_risk` va `accounts.views.compute_user_risk_profile`) avval
    kichik harfli 'user' ni qidirardi, yagona yozuvchi esa ('User')
    `moderation.services.maybe_flag_warning_threshold` edi — ya'ni
    ogohlantirishlar chegarasidan oshgan hisoblarning bayrog'i xavf ballida
    UMUMAN ko'rinmasdi. So'rovlar 'User' ga o'tkazildi; bu migratsiya esa
    aralash yozilgan qatorlarni (masalan appellyatsiya endpointi kichik harf
    bilan ishga tushirilgan staging bazasi) o'sha yagona shaklga keltiradi.

    Idempotent va xavfsiz: faqat AYNAN 'user' qatorlariga tegadi, boshqa
    nishon turlari ('Question', 'Olympiad', 'ip_address') qolganicha qoladi.
    """
    ModerationFlag = apps.get_model('moderation', 'ModerationFlag')
    ModerationFlag.objects.filter(target_type='user').update(target_type='User')


def noop_reverse(apps, schema_editor):
    # Orqaga qaytarish yo'q: 'user' — hech qachon to'g'ri bo'lmagan shakl,
    # uni tiklash buzuq holatni qaytarardi.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('moderation', '0005_alter_moderationflag_flag_type'),
    ]

    operations = [
        migrations.RunPython(normalize_user_target_type, noop_reverse),
    ]
