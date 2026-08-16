import os

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from accounts.models import User
from accounts.utils import normalize_phone


# Django admin (`/olympy-mgmt-2025/`) da bootstrap adminga beriladigan huquqlar.
#
# NEGA `is_superuser` EMAS: `is_superuser=True` bo'lsa `has_perm()` doim True
# qaytaradi, ya'ni admin ro'yxatdan o'tgan BARCHA modellarni (Olympiad,
# Question, TestAttempt, EducationCenter, PaymentTransaction, Notification...)
# to'g'ridan-to'g'ri tahrirlay va o'chira olardi — hech qanday `AuditLog`
# yozilmasdan va API'dagi tekshiruvlarni chetlab o'tib. Bu `UserAdmin`
# guardrail'lari tuzatgan muammoning aynan o'zi, faqat boshqa modellarda.
# Sanab o'tilgan modellar mahsulot UI'siga ega va o'z audit yozuvlari bilan
# admin paneli orqali boshqariladi, shuning uchun ular Django admin'da
# umuman kerak emas.
#
# Quyidagi modellarning mahsulot UI'si YO'Q — ular faqat Django admin orqali
# boshqariladi, shuning uchun to'liq huquq (add/change/delete/view) beriladi.
ADMIN_FULL_PERM_MODELS = (
    # Platforma darajasidagi sovg'alar: `views_shop` API'si faqat markazga
    # tegishli (center-scoped) mahsulotlarni boshqaradi.
    ('accounts', 'rewardproduct'),
    ('accounts', 'rewardredemption'),
    # OTP debug: "kod keldimi, necha marta urindi, muddati o'tdimi".
    ('accounts', 'phoneverification'),
    ('accounts', 'emailverification'),
    # Tarif rejalari — API'da faqat o'qiladi, yaratish/tahrirlash yo'li yo'q.
    ('billing', 'subscriptionplan'),
    ('analytics', 'analyticsdashboard'),
)

# `accounts.User` sahifasi ochiq qoladi (`UserAdmin` xavfsiz maydonlarni
# tahrirlashga ruxsat beradi va har bir tahrirni jurnalga yozadi), lekin:
#   * `delete_user` YO'Q — `UserAdmin.has_delete_permission()` ham False,
#     hisob o'chirish faqat soft-delete oqimi orqali;
#   * `add_user` YO'Q — yangi hisob faqat telefon tasdiqlangan ro'yxatdan
#     o'tish oqimidan yaratiladi.
ADMIN_EXTRA_PERMS = (
    ('accounts', 'view_user'),
    ('accounts', 'change_user'),
)


class Command(BaseCommand):
    help = 'Create or update a platform admin from environment variables.'

    def add_arguments(self, parser):
        parser.add_argument('--phone', default=os.environ.get('OLYMPY_BOOTSTRAP_ADMIN_PHONE', ''))
        parser.add_argument('--password', default=os.environ.get('OLYMPY_BOOTSTRAP_ADMIN_PASSWORD', ''))
        parser.add_argument('--full-name', default=os.environ.get('OLYMPY_BOOTSTRAP_ADMIN_FULL_NAME', 'Platform Admin'))

    def handle(self, *args, **options):
        phone = (options.get('phone') or '').strip()
        password = options.get('password') or ''
        full_name = (options.get('full_name') or '').strip() or 'Platform Admin'

        if not phone and not password:
            self.stdout.write('Platform admin bootstrap skipped: phone/password not set.')
            return
        if not phone or not password:
            raise CommandError('Both OLYMPY_BOOTSTRAP_ADMIN_PHONE and OLYMPY_BOOTSTRAP_ADMIN_PASSWORD are required.')

        normalized_phone = normalize_phone(phone)
        if not normalized_phone:
            raise CommandError('OLYMPY_BOOTSTRAP_ADMIN_PHONE is invalid.')

        user = User.objects.filter(normalized_phone=normalized_phone).first()
        created = user is None
        if created:
            user = User(phone=normalized_phone, normalized_phone=normalized_phone, full_name=full_name)
        elif not user.full_name:
            user.full_name = full_name

        roles = list(user.roles or [])
        if 'admin' not in roles:
            roles.append('admin')

        was_superuser = bool(user.is_superuser)

        user.phone = normalized_phone
        user.normalized_phone = normalized_phone
        user.roles = roles
        user.is_platform_admin = True
        # `is_staff` QOLADI: mahsulot UI'siga ega bo'lmagan modellar
        # (RewardProduct, OTP debug, SubscriptionPlan) faqat Django admin
        # orqali boshqariladi.
        user.is_staff = True
        # `is_superuser` ATAYLAB berilmaydi — sabab yuqoridagi izohda.
        # Aniq `False`: avval superuser bo'lgan hisob keyingi deploy'da
        # pasaytiriladi, aks holda o'zgarish faqat yangi o'rnatishlarga
        # tegib, mavjud muhitda hech narsa o'zgarmasdi.
        user.is_superuser = False
        user.is_active = True
        # token_version'ni har deploy'da oshirsak — barcha admin sessiyalari
        # majburiy chiqib ketadi. Faqat parol haqiqatan o'zgargan paytda
        # (yangi user yoki check_password False) bump qilamiz.
        password_changed = created or not user.check_password(password)
        if password_changed:
            user.set_password(password)
            user.token_version = (user.token_version or 0) + 1
        user.save()

        self._grant_admin_permissions(user)
        if was_superuser:
            self.stdout.write(self.style.WARNING(
                'DIQQAT: `is_superuser` olib tashlandi. Django admin endi faqat '
                'quyidagi modellarni ko\'rsatadi: '
                + ', '.join(f'{app}.{model}' for app, model in ADMIN_FULL_PERM_MODELS)
                + ' (+ accounts.user — ko\'rish/tahrirlash). Qolgan modellar '
                'audit yozuvli admin paneli orqali boshqariladi.'
            ))

        action = 'created' if created else 'updated'
        self.stdout.write(self.style.SUCCESS(
            f'Platform admin {action}: {user.normalized_phone} (id={user.id})'
        ))

    def _grant_admin_permissions(self, user):
        """Django admin uchun aniq huquqlarni beradi (`is_superuser` o'rniga).

        Qo'shimcha (additive) ishlaydi: operator qo'lda bergan huquqlar
        olib tashlanmaydi. Huquqlar `migrate` ning `post_migrate` signali
        tomonidan yaratiladi — deploy'da `migrate` bu buyruqdan OLDIN
        yuradi (render_build.sh / docker-entrypoint.sh), ya'ni qatorlar
        shu paytda mavjud bo'ladi.
        """
        from django.contrib.auth.models import Permission

        wanted = {
            (app_label, f'{verb}_{model_name}')
            for app_label, model_name in ADMIN_FULL_PERM_MODELS
            for verb in ('add', 'change', 'delete', 'view')
        }
        wanted.update(ADMIN_EXTRA_PERMS)

        lookup = Q()
        for app_label, codename in wanted:
            lookup |= Q(content_type__app_label=app_label, codename=codename)

        found = list(
            Permission.objects.filter(lookup).select_related('content_type')
        )
        if found:
            user.user_permissions.add(*found)

        missing = wanted - {(p.content_type.app_label, p.codename) for p in found}
        if missing:
            # Huquq topilmasa admin shu modelni umuman ko'rmaydi — bu jimgina
            # o'tib ketmasligi kerak (odatda `migrate` ishlamagani bildiradi).
            self.stdout.write(self.style.WARNING(
                'Topilmagan huquqlar (migrate ishladimi?): '
                + ', '.join(sorted(f'{app}.{code}' for app, code in missing))
            ))
