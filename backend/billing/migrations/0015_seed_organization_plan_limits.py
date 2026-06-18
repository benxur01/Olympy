"""Tashkilot (organization) planlariga o'quvchi/o'qituvchi/olimpiada limitlarini
to'ldiradi.

Avval limitlar centers/services.check_student_limit ichida plan nomini
string-match qilib hardcode qilingan edi. Endi SubscriptionPlan.max_*
maydonlariga ko'chirildi va SubscriptionService shulardan o'qiydi. Bu migration
mavjud organization planlarni nomidagi tier (Standart/Plus/Pro) bo'yicha
to'ldiradi.

Student planlar limitsiz qoldiriladi (individual obuna — markaz a'zolari bilan
bog'liq emas). 0 = cheksiz (UNLIMITED).
"""
from django.db import migrations


# Tier -> (max_students, max_teachers, max_olympiads_monthly). 0 = cheksiz.
TIER_LIMITS = {
    'standart': (50, 5, 10),
    'standard': (50, 5, 10),
    'plus': (200, 20, 50),
    'pro': (0, 0, 0),  # cheksiz
}


def _tier_from_name(name):
    low = (name or '').lower()
    for key in ('standart', 'standard', 'plus', 'pro'):
        if key in low:
            return key
    return None


def seed_limits(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(plan_type='organization'):
        tier = _tier_from_name(plan.name)
        if not tier or tier not in TIER_LIMITS:
            continue
        students, teachers, olympiads = TIER_LIMITS[tier]
        plan.max_students = students
        plan.max_teachers = teachers
        plan.max_olympiads_monthly = olympiads
        plan.save(update_fields=[
            'max_students', 'max_teachers', 'max_olympiads_monthly',
        ])


def reverse_limits(apps, schema_editor):
    # Limitlarni cheksizga (0) qaytaramiz — maydonlar default holatiga.
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(plan_type='organization').update(
        max_students=0, max_teachers=0, max_olympiads_monthly=0,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0014_subscriptionplan_max_olympiads_monthly_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_limits, reverse_code=reverse_limits),
    ]
