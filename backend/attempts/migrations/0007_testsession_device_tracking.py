from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attempts', '0006_testattempt_disqualified'),
    ]

    operations = [
        migrations.AddField(
            model_name='testsession',
            name='last_device_id',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
        migrations.AddField(
            model_name='testsession',
            name='last_ping_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
