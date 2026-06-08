from django.db import migrations

def update_to_promo_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Student Plus (1 oy) and Pro (1 oy) plans updated to 9999.00 UZS
    SubscriptionPlan.objects.filter(plan_type='student', name='Plus (1 oy)').update(price=9999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=9999.00)

def rollback_promo_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Rollback to original prices: Plus (1 oy) -> 19999.00 UZS, Pro (1 oy) -> 24999.00 UZS
    SubscriptionPlan.objects.filter(plan_type='student', name='Plus (1 oy)').update(price=19999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=24999.00)

class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0009_usersubscription_usersub_user_active_idx'),
    ]

    operations = [
        migrations.RunPython(update_to_promo_prices, rollback_promo_prices),
    ]
