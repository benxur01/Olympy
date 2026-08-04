# Yangi bayroq turi: `warning_threshold` — surilib boruvchi oynada
# chegaradan oshgan ogohlantirishlar soni (moderation/services.py).
#
# Sxema o'zgarmaydi: `choices` faqat validatsiya/`get_*_display` uchun, ustun
# ta'rifi (CharField(max_length=20)) o'sha-o'sha qoladi — bu no-op AlterField.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('moderation', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='moderationflag',
            name='flag_type',
            field=models.CharField(choices=[('question', 'Savol'), ('suspicious_ip', 'Shubhali IP'), ('warning_threshold', 'Ogohlantirishlar chegarasi')], db_index=True, max_length=20),
        ),
    ]
