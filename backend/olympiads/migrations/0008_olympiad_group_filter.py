from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('olympiads', '0007_olympiad_is_deleted'),
    ]

    operations = [
        migrations.AddField(
            model_name='olympiad',
            name='group_filter',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
    ]
