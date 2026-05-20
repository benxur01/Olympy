from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_phoneverification_purpose'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='first_name',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name='user',
            name='last_name',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name='user',
            name='username',
            field=models.CharField(
                blank=True,
                db_index=True,
                max_length=32,
                null=True,
                unique=True,
            ),
        ),
    ]
