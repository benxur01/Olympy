from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('centers', '0006_centermembership_updated_at'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='centermembership',
            name='group_tag',
            field=models.CharField(blank=True, db_index=True, default='', max_length=50),
        ),
        migrations.CreateModel(
            name='CenterQuestion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('options', models.JSONField(default=list)),
                ('subject', models.CharField(blank=True, default='', max_length=80)),
                ('difficulty', models.CharField(choices=[('easy', 'Oson'), ('medium', "O'rta"), ('hard', 'Qiyin')], default='medium', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('center', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='question_bank', to='centers.educationcenter')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_center_questions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
