from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('centers', '0007_centerquestion_membership_group_tag'),
    ]

    operations = [
        migrations.AddField(
            model_name='educationcenter',
            name='is_premium',
            field=models.BooleanField(default=False, db_index=True),
        ),
    ]
