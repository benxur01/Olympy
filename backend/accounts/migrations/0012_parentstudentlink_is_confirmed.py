from django.db import migrations, models


def confirm_existing_links(apps, schema_editor):
    """Mavjud bog'lanishlarni tasdiqlangan deb belgilaymiz.

    Yangi `is_confirmed` field default=False bilan keladi, ammo migration
    paytida mavjud (ishlab turgan) ota-ona-farzand bog'lanishlari yo'qolib
    qolmasligi uchun ularni True qilib o'rnatamiz. Yangi so'rovlar
    is_confirmed=False bilan yaratiladi.
    """
    ParentStudentLink = apps.get_model('accounts', 'ParentStudentLink')
    ParentStudentLink.objects.update(is_confirmed=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_user_is_premium'),
    ]

    operations = [
        migrations.AddField(
            model_name='parentstudentlink',
            name='is_confirmed',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='parentstudentlink',
            name='confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(confirm_existing_links, noop_reverse),
    ]
