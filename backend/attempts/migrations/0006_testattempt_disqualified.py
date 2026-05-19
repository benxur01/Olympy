from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('attempts', '0005_add_perf_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='testattempt',
            name='disqualified',
            field=models.BooleanField(default=False),
        ),
    ]
