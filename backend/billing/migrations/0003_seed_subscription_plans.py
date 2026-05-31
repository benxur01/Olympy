from django.db import migrations

def seed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    
    plans_data = [
        {
            'name': "Boshlang'ich",
            'price': 0.00,
            'duration_days': 30,
            'description': "Barcha imkoniyatlar ochiq, bepul sinov",
            'features': ["Asosiy hisobotlar", "Email qo'llab-quvvatlash"],
            'is_popular': False,
            'is_active': True
        },
        {
            'name': "Professional",
            'price': 99000.00,
            'duration_days': 30,
            'description': "O'sib borayotgan tashkilotlar uchun",
            'features': [
                "Cheksiz olimpiada",
                "500 ta o'quvchi",
                "AI savol yaratish",
                "PDF import",
                "Telegram bot",
                "Batafsil tahlil"
            ],
            'is_popular': True,
            'is_active': True
        },
        {
            'name': "Enterprise",
            'price': 299000.00,
            'duration_days': 30,
            'description': "Yirik ta'lim tarmoqlari uchun",
            'features': [
                "Cheksiz hamma narsa",
                "Maxsus integratsiya",
                "Shaxsiy menejer",
                "API kirish",
                "SLA kafolati"
            ],
            'is_popular': False,
            'is_active': True
        }
    ]

    for p_data in plans_data:
        # Update or create by name
        plan, created = SubscriptionPlan.objects.update_or_create(
            name=p_data['name'],
            defaults={
                'price': p_data['price'],
                'duration_days': p_data['duration_days'],
                'description': p_data['description'],
                'features': p_data['features'],
                'is_popular': p_data['is_popular'],
                'is_active': p_data['is_active']
            }
        )

def remove_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('billing', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(name__in=["Boshlang'ich", "Professional", "Enterprise"]).delete()

class Migration(migrations.Migration):

    dependencies = [
        ('billing', '0002_subscriptionplan_description_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_plans, reverse_code=remove_plans),
    ]
