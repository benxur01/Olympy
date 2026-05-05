from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attempts', '0004_testsession_cheating_reason_and_more'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='testattempt',
            index=models.Index(
                fields=['olympiad', '-score', 'time_spent'],
                name='attempt_leaderboard_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='testattempt',
            index=models.Index(
                fields=['user', '-submitted_at'],
                name='attempt_user_recent_idx',
            ),
        ),
    ]
