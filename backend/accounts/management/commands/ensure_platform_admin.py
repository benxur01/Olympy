import os

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.utils import normalize_phone


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

        user.phone = normalized_phone
        user.normalized_phone = normalized_phone
        user.roles = roles
        user.is_platform_admin = True
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        # token_version'ni har deploy'da oshirsak — barcha admin sessiyalari
        # majburiy chiqib ketadi. Faqat parol haqiqatan o'zgargan paytda
        # (yangi user yoki check_password False) bump qilamiz.
        password_changed = created or not user.check_password(password)
        if password_changed:
            user.set_password(password)
            user.token_version = (user.token_version or 0) + 1
        user.save()

        action = 'created' if created else 'updated'
        self.stdout.write(self.style.SUCCESS(
            f'Platform admin {action}: {user.normalized_phone} (id={user.id})'
        ))
