from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_user_avatar'),
    ]

    operations = [
        migrations.AddField(
            model_name='phoneverification',
            name='purpose',
            field=models.CharField(
                choices=[
                    ('registration', 'Registration'),
                    ('account_link', 'Account link'),
                    ('password_reset', 'Password reset'),
                ],
                db_index=True,
                default='registration',
                max_length=32,
            ),
        ),
    ]
