"""Tashkilot (organization) planlariga oylik AI generatsiya limitini to'ldiradi.

SubscriptionPlan.max_ai_generations_monthly maydoni 0016'da qo'shildi (default
0 = cheksiz). Bu migration mavjud organization planlarni nomidagi tier
(Standart/Plus/Pro) bo'yicha to'ldiradi:

  * Standart — 20 / oy
  * Plus     — 100 / oy
  * Pro      — cheksiz (0)

Student planlar tegilmaydi (AI generatsiya markaz konteksti). Yangi seed
qilinadigan planlar uchun bu qiymatlar to'g'ridan-to'g'ri belgilanishi kerak.
"""
from django.db import migrations


# Tier -> max_ai_generations_monthly. 0 = cheksiz (UNLIMITED).
TIER_AI = {
    'standart': 20,
    'standard': 20,
    'plus': 100,
    'pro': 0,  # cheksiz
}


def _tier_from_name(name):
    low = (name or '').lower()
    for key in ('standart', 'standard', 'plus', 'pro'):
        if key in low:
            return key
    return None


def seed_ai_limits(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    for plan in SubscriptionPlan.objects.filter(plan_type='organization'):
        tier = _tier_from_name(plan.name)
        if not tier or tier not in TIER_AI:
            continue
        plan.max_ai_generations_monthly = TIER_AI[tier]
        plan.save(update_fields=['max_ai_generations_monthly'])


def reverse_ai_limits(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(plan_type='organization').update(
        max_ai_generations_monthly=0,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0016_subscriptionplan_max_ai_generations_monthly_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_ai_limits, reverse_code=reverse_ai_limits),
    ]
