from django.db import migrations


PARENT_FEATURE = "Ota-onalar paneli"


def strip_parent_feature(apps, schema_editor):
    """Ota-ona paneli funksiyasi olib tashlandi — obuna rejalari xususiyatlar
    ro'yxatidan uni ham chiqarib tashlaymiz (Pricing sahifasi bu ro'yxatni
    to'g'ridan-to'g'ri API'dan yuklaydi).
    """
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.all():
        features = plan.features or []
        if PARENT_FEATURE in features:
            plan.features = [f for f in features if f != PARENT_FEATURE]
            plan.save(update_fields=['features'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0019_paymenttransaction_user_set_null'),
    ]

    operations = [
        migrations.RunPython(strip_parent_feature, noop_reverse),
    ]
