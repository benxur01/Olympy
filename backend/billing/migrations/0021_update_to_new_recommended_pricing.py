from django.db import migrations

def update_to_recommended_pricing(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')

    # Student Plans
    student_updates = {
        'Standart (1 oy)': 14999.00,
        'Standart (3 oy)': 39999.00,
        'Standart (6 oy)': 71999.00,
        'Standart (1 yil)': 125999.00,

        'Plus (1 oy)': 29999.00,
        'Plus (3 oy)': 79999.00,
        'Plus (6 oy)': 143999.00,
        'Plus (1 yil)': 251999.00,

        'Pro (1 oy)': 49999.00,
        'Pro (3 oy)': 134999.00,
        'Pro (6 oy)': 239999.00,
        'Pro (1 yil)': 419999.00,
    }

    for name, price in student_updates.items():
        SubscriptionPlan.objects.filter(plan_type='student', name=name).update(price=price)

    # Organization Plans
    org_updates = {
        'Standart (1 oy)': 299999.00,
        'Standart (3 oy)': 799999.00,
        'Standart (6 oy)': 1439999.00,
        'Standart (1 yil)': 2519999.00,

        'Plus (1 oy)': 599999.00,
        'Plus (3 oy)': 1599999.00,
        'Plus (6 oy)': 2879999.00,
        'Plus (1 yil)': 5039999.00,

        'Pro (1 oy)': 999999.00,
        'Pro (3 oy)': 2699999.00,
        'Pro (6 oy)': 4799999.00,
        'Pro (1 yil)': 8399999.00,
    }

    for name, price in org_updates.items():
        SubscriptionPlan.objects.filter(plan_type='organization', name=name).update(price=price)

def rollback_recommended_pricing(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')

    # Revert to previous prices
    student_updates = {
        'Standart (1 oy)': 9999.00,
        'Standart (3 oy)': 26999.00,
        'Standart (6 oy)': 47999.00,
        'Standart (1 yil)': 83999.00,

        'Plus (1 oy)': 19999.00,
        'Plus (3 oy)': 53999.00,
        'Plus (6 oy)': 95999.00,
        'Plus (1 yil)': 167999.00,

        'Pro (1 oy)': 24999.00,
        'Pro (3 oy)': 64999.00,
        'Pro (6 oy)': 114999.00,
        'Pro (1 yil)': 199999.00,
    }

    for name, price in student_updates.items():
        SubscriptionPlan.objects.filter(plan_type='student', name=name).update(price=price)

    org_updates = {
        'Standart (1 oy)': 199999.00,
        'Standart (3 oy)': 539999.00,
        'Standart (6 oy)': 959999.00,
        'Standart (1 yil)': 1679999.00,

        'Plus (1 oy)': 399999.00,
        'Plus (3 oy)': 1079999.00,
        'Plus (6 oy)': 1919999.00,
        'Plus (1 yil)': 3359999.00,

        'Pro (1 oy)': 449999.00,
        'Pro (3 oy)': 1199999.00,
        'Pro (6 oy)': 2149999.00,
        'Pro (1 yil)': 3749999.00,
    }

    for name, price in org_updates.items():
        SubscriptionPlan.objects.filter(plan_type='organization', name=name).update(price=price)

class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0020_remove_parent_panel_feature'),
    ]

    operations = [
        migrations.RunPython(update_to_recommended_pricing, rollback_recommended_pricing),
    ]
