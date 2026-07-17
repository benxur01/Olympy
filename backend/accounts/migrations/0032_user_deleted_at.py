from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0031_user_onboarding_manager_completed_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='deleted_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
