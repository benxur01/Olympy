# Generated for security fix: TOTP secret encryption at rest.
#
# `totp_secret` ilgari DB'da OCHIQ (plaintext) base32 sifatida saqlanardi —
# DB dump sizsa barcha 2FA kalitlari ochilardi. Bu migratsiya ustunni
# `encrypted_totp_secret` ga (uzunligi 255) o'zgartiradi va mavjud ochiq
# qiymatlarni Fernet bilan shifrlaydi.
#
# Tartib MUHIM: avval ustun uzunligini oshiramiz (shifrlangan token ochiq
# base32'dan ancha uzun), keyingina mavjud qiymatlarni shifrlaymiz — aks holda
# 32 belgilik ustunga uzun shifrlangan token sig'masdi.

from django.db import migrations, models


def encrypt_existing_secrets(apps, schema_editor):
    """Mavjud ochiq TOTP kalitlarni shifrlaydi."""
    from accounts.utils import encrypt_totp_secret
    User = apps.get_model('accounts', 'User')
    for user in User.objects.exclude(encrypted_totp_secret='').iterator():
        plain = user.encrypted_totp_secret
        if not plain:
            continue
        encrypted = encrypt_totp_secret(plain)
        if encrypted and encrypted != plain:
            user.encrypted_totp_secret = encrypted
            user.save(update_fields=['encrypted_totp_secret'])


def decrypt_existing_secrets(apps, schema_editor):
    """Reverse: shifrlangan kalitlarni qaytadan ochiq holatga keltiradi."""
    from accounts.utils import decrypt_totp_secret
    User = apps.get_model('accounts', 'User')
    for user in User.objects.exclude(encrypted_totp_secret='').iterator():
        stored = user.encrypted_totp_secret
        if not stored:
            continue
        plain = decrypt_totp_secret(stored)
        if plain and plain != stored:
            user.encrypted_totp_secret = plain
            user.save(update_fields=['encrypted_totp_secret'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0025_user_onboarding_center_completed_referralcode'),
    ]

    operations = [
        migrations.RenameField(
            model_name='user',
            old_name='totp_secret',
            new_name='encrypted_totp_secret',
        ),
        migrations.AlterField(
            model_name='user',
            name='encrypted_totp_secret',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.RunPython(encrypt_existing_secrets, decrypt_existing_secrets),
    ]
