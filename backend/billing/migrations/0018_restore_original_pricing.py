from django.db import migrations

def restore_original_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Restore Student Plus (1 oy) to 19999.00 UZS and Pro (1 oy) to 24999.00 UZS
    SubscriptionPlan.objects.filter(plan_type='student', name='Plus (1 oy)').update(price=19999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=24999.00)

def rollback_original_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Set back to promo prices (9999.00 UZS) if rolled back
    SubscriptionPlan.objects.filter(plan_type='student', name='Plus (1 oy)').update(price=9999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=9999.00)

class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0017_seed_ai_generation_limits'),
    ]

    operations = [
        migrations.RunPython(restore_original_prices, rollback_original_prices),
    ]
