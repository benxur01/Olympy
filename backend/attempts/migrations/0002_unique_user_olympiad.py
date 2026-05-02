from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attempts', '0001_initial'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='testattempt',
            constraint=models.UniqueConstraint(
                fields=('user', 'olympiad'),
                name='unique_user_olympiad',
            ),
        ),
    ]
