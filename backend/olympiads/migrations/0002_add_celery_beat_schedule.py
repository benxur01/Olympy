from django.db import migrations


def add_periodic_task(apps, schema_editor):
    try:
        IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
        PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
        schedule, _ = IntervalSchedule.objects.get_or_create(
            every=5, period='minutes',
        )
        PeriodicTask.objects.get_or_create(
            name='Finish expired olympiads',
            defaults={
                'interval': schedule,
                'task': 'olympiads.tasks.finish_expired_olympiads',
                'enabled': True,
            },
        )
    except Exception:
        pass


class Migration(migrations.Migration):
    dependencies = [
        ('django_celery_beat', '0019_alter_periodictasks_options'),
        ('olympiads', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_periodic_task, migrations.RunPython.noop),
    ]
