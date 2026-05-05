from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(
                fields=['user', '-created_at'],
                name='notification_user_recent_idx',
            ),
        ),
    ]
