from django.db import migrations


SEEDED_TITLES = [
    "Olympy Premium Futbolka",
    "Olympy Premium Hoodie",
    "Olympy Oltin Profil Nishoni",
]


def drop_seeded_premium_rewards(apps, schema_editor):
    """0019 migratsiyasida qo'shilgan global (center=None) sovg'alarni o'chiramiz.

    Bu mahsulotlar endi do'konda kerak emas. 0019 allaqachon bir nechta
    muhitda qo'llanilgani uchun o'sha faylni tahrirlash yozuvlarni orqaga
    qaytarmaydi — shuning uchun alohida o'chirish migratsiyasi kerak.
    Faqat global mahsulotlar o'chiriladi; markazlar o'zi qo'shgan xuddi shu
    nomli mahsulotlar (center != None) tegilmaydi.
    """
    RewardProduct = apps.get_model('accounts', 'RewardProduct')
    RewardProduct.objects.filter(
        title__in=SEEDED_TITLES,
        center__isnull=True,
    ).delete()


def noop_reverse(apps, schema_editor):
    # Bu sovg'alar butunlay olib tashlandi — orqaga qaytarishda tiklanmaydi.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0049_alter_auditlog_action'),
    ]

    operations = [
        migrations.RunPython(drop_seeded_premium_rewards, noop_reverse),
    ]
