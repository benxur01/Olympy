from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_user_profile_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='ParentStudentLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('parent', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='children_links',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('student', models.ForeignKey(
                    on_delete=models.deletion.CASCADE,
                    related_name='parent_links',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='parentstudentlink',
            constraint=models.UniqueConstraint(
                fields=('parent', 'student'),
                name='unique_parent_student',
            ),
        ),
    ]
