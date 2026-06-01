from django.db import migrations

def seed_premium_rewards(apps, schema_editor):
    RewardProduct = apps.get_model('accounts', 'RewardProduct')
    
    # We want these products to be global (center=None) and premium-only (is_premium_only=True)
    RewardProduct.objects.get_or_create(
        title="Olympy Premium Futbolka",
        defaults={
            "description": "Faqat premium o'quvchilar uchun eksklyuziv sifatli futbolka.",
            "coin_cost": 500,
            "icon": "👕",
            "is_premium_only": True,
            "stock": 5,
            "is_active": True
        }
    )
    
    RewardProduct.objects.get_or_create(
        title="Olympy Premium Hoodie",
        defaults={
            "description": "Eksklyuziv Olympy logotipli premium qora xudi.",
            "coin_cost": 1000,
            "icon": "🧥",
            "is_premium_only": True,
            "stock": 3,
            "is_active": True
        }
    )

    RewardProduct.objects.get_or_create(
        title="Olympy Oltin Profil Nishoni",
        defaults={
            "description": "Profil uchun eksklyuziv oltin premium nishoni.",
            "coin_cost": 200,
            "icon": "🥇",
            "is_premium_only": True,
            "stock": 99,
            "is_active": True
        }
    )

def rollback_premium_rewards(apps, schema_editor):
    RewardProduct = apps.get_model('accounts', 'RewardProduct')
    RewardProduct.objects.filter(
        title__in=["Olympy Premium Futbolka", "Olympy Premium Hoodie", "Olympy Oltin Profil Nishoni"]
    ).delete()

class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_rewardproduct_is_premium_only'),
    ]

    operations = [
        migrations.RunPython(seed_premium_rewards, rollback_premium_rewards),
    ]
