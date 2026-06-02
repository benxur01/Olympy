import os

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.utils import normalize_phone


class Command(BaseCommand):
    help = 'Create or update a manager from environment variables.'

    def add_arguments(self, parser):
        parser.add_argument('--phone', default=os.environ.get('OLYMPY_BOOTSTRAP_MANAGER_PHONE', ''))
        parser.add_argument('--password', default=os.environ.get('OLYMPY_BOOTSTRAP_MANAGER_PASSWORD', ''))
        parser.add_argument('--full-name', default=os.environ.get('OLYMPY_BOOTSTRAP_MANAGER_FULL_NAME', 'Manager'))

    def handle(self, *args, **options):
        phone = (options.get('phone') or '').strip()
        password = options.get('password') or ''
        full_name = (options.get('full_name') or '').strip() or 'Manager'

        if not phone and not password:
            self.stdout.write('Manager bootstrap skipped: phone/password not set.')
            return
        if not phone or not password:
            raise CommandError('Both OLYMPY_BOOTSTRAP_MANAGER_PHONE and OLYMPY_BOOTSTRAP_MANAGER_PASSWORD are required.')

        normalized_phone = normalize_phone(phone)
        if not normalized_phone:
            raise CommandError('OLYMPY_BOOTSTRAP_MANAGER_PHONE is invalid.')

        user = User.objects.filter(normalized_phone=normalized_phone).first()
        created = user is None
        if created:
            user = User(phone=normalized_phone, normalized_phone=normalized_phone, full_name=full_name)
        elif not user.full_name:
            user.full_name = full_name

        roles = list(user.roles or [])
        if 'manager' not in roles:
            roles.append('manager')

        user.phone = normalized_phone
        user.normalized_phone = normalized_phone
        user.roles = roles
        user.is_platform_admin = False
        user.is_staff = False
        user.is_superuser = False
        user.is_active = True
        # token_version'ni har deploy'da oshirsak — barcha manager sessiyalari
        # majburiy chiqib ketadi. Faqat parol haqiqatan o'zgargan paytda
        # (yangi user yoki check_password False) bump qilamiz.
        password_changed = created or not user.check_password(password)
        if password_changed:
            user.set_password(password)
            user.token_version = (user.token_version or 0) + 1
        user.save()

        # Premium center and membership bootstrap
        try:
            from centers.models import EducationCenter, CenterMembership
            
            # 1. Create a default premium center if the user has no center
            center = EducationCenter.objects.filter(owner=user).first()
            if not center:
                center = EducationCenter.objects.first()
            if not center:
                center = EducationCenter.objects.create(
                    name="Olympy Akademiyasi",
                    city="Toshkent",
                    status="approved",
                    is_premium=True,
                    owner=user
                )
                self.stdout.write(self.style.SUCCESS(f'Created default premium center: {center.name} (id={center.id})'))
            
            # 2. Ensure manager role is approved in CenterMembership
            membership, m_created = CenterMembership.objects.get_or_create(
                user=user,
                center=center,
                role='manager',
                defaults={'status': 'approved'}
            )
            if not m_created and membership.status != 'approved':
                membership.status = 'approved'
                membership.save()
                self.stdout.write(self.style.SUCCESS(f'Approved manager membership for {center.name}'))

            # 3. Ensure teacher role is approved in CenterMembership (for testing both)
            teacher_membership, t_created = CenterMembership.objects.get_or_create(
                user=user,
                center=center,
                role='teacher',
                defaults={'status': 'approved', 'subject': 'Matematika'}
            )
            if not t_created and teacher_membership.status != 'approved':
                teacher_membership.status = 'approved'
                teacher_membership.save()
                self.stdout.write(self.style.SUCCESS(f'Approved teacher membership for {center.name}'))
            
            # Ensure roles list has both roles
            roles = list(user.roles or [])
            roles_updated = False
            if 'manager' not in roles:
                roles.append('manager')
                roles_updated = True
            if 'teacher' not in roles:
                roles.append('teacher')
                roles_updated = True
            if roles_updated:
                user.roles = roles
                user.save(update_fields=['roles'])

        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'Failed to bootstrap premium center/membership: {exc}'))

        action = 'created' if created else 'updated'
        self.stdout.write(self.style.SUCCESS(
            f'Manager {action}: {user.normalized_phone} (id={user.id})'
        ))

