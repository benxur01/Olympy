# Generated manually on 2026-06-17

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('centers', '0015_alter_educationcenter_status'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # owner SET_NULL -> PROTECT: owner o'chirilsa markaz "approved" holda
        # yetim qolmasligi uchun. Bu faqat ORM darajasidagi o'zgarish (DB
        # darajasida ON DELETE qoidasi o'zgarmaydi) — owner'ni o'chirish
        # urinishi endi ProtectedError chiqaradi, oldin esa owner_id NULL
        # bo'lib markaz egasiz qolardi.
        migrations.AlterField(
            model_name='educationcenter',
            name='owner',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='owned_centers',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
