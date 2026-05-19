from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('centers', '0005_educationcenter_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='centermembership',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
