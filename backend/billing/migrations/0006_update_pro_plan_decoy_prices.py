from django.db import migrations

def update_pro_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Student Pro plans
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=24999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (3 oy)').update(price=64999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (6 oy)').update(price=114999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 yil)').update(price=199999.00)

    # Organization Pro plans
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (1 oy)').update(price=449999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (3 oy)').update(price=1199999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (6 oy)').update(price=2149999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (1 yil)').update(price=3749999.00)

def rollback_pro_prices(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    # Rollback to original prices if needed
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 oy)').update(price=29999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (3 oy)').update(price=80999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (6 oy)').update(price=143999.00)
    SubscriptionPlan.objects.filter(plan_type='student', name='Pro (1 yil)').update(price=251999.00)

    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (1 oy)').update(price=799999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (3 oy)').update(price=2159999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (6 oy)').update(price=3839999.00)
    SubscriptionPlan.objects.filter(plan_type='organization', name='Pro (1 yil)').update(price=6719999.00)

class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0005_seed_all_subscription_plans'),
    ]

    operations = [
        migrations.RunPython(update_pro_prices, rollback_pro_prices),
    ]
