# Generated manually for account-delete compliance: keep payment audit trail.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('billing', '0018_restore_original_pricing'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paymenttransaction',
            name='user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='transactions',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
