import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import User
from accounts.utils import normalize_phone
from centers.models import CenterMembership, EducationCenter


class Command(BaseCommand):
    help = 'Create or update a center owner from environment variables.'

    def add_arguments(self, parser):
        parser.add_argument('--phone', default=os.environ.get('OLYMPY_BOOTSTRAP_OWNER_PHONE', ''))
        parser.add_argument('--password', default=os.environ.get('OLYMPY_BOOTSTRAP_OWNER_PASSWORD', ''))
        parser.add_argument('--full-name', default=os.environ.get('OLYMPY_BOOTSTRAP_OWNER_FULL_NAME', ''))
        parser.add_argument('--center', default=os.environ.get('OLYMPY_BOOTSTRAP_OWNER_CENTER', ''))
        parser.add_argument('--city', default=os.environ.get('OLYMPY_BOOTSTRAP_OWNER_CITY', 'Toshkent'))

    def handle(self, *args, **options):
        phone = (options.get('phone') or '').strip()
        password = (options.get('password') or '').strip()
        full_name = (options.get('full_name') or '').strip()
        center_name = (options.get('center') or '').strip()
        city = (options.get('city') or 'Toshkent').strip()

        if not phone and not center_name:
            self.stdout.write('Center owner bootstrap skipped: phone/center not set.')
            return
        if not phone or not center_name:
            raise CommandError(
                'Both OLYMPY_BOOTSTRAP_OWNER_PHONE and OLYMPY_BOOTSTRAP_OWNER_CENTER are required.'
            )

        norm = normalize_phone(phone)
        if not norm:
            raise CommandError('OLYMPY_BOOTSTRAP_OWNER_PHONE is invalid.')

        with transaction.atomic():
            user = User.objects.filter(normalized_phone=norm).first()
            user_created = user is None
            if user_created:
                if not password:
                    raise CommandError('OLYMPY_BOOTSTRAP_OWNER_PASSWORD is required for new user.')
                user = User(
                    phone=norm,
                    normalized_phone=norm,
                    full_name=full_name or norm,
                    is_active=True,
                )
                user.set_password(password)
            else:
                if full_name and not user.full_name:
                    user.full_name = full_name
                if password and not user.check_password(password):
                    user.set_password(password)
                    user.token_version = (user.token_version or 0) + 1

            roles = list(user.roles or [])
            if 'owner' not in roles:
                roles.append('owner')
            user.roles = roles
            user.is_active = True
            user.save()

            center, center_created = EducationCenter.objects.get_or_create(
                name=center_name,
                defaults={
                    'owner': user,
                    'city': city,
                    'status': EducationCenter.STATUS_APPROVED,
                },
            )
            if not center_created and center.owner_id != user.pk:
                center.owner = user
                center.save(update_fields=['owner'])
            if not center_created and center.status != EducationCenter.STATUS_APPROVED:
                center.status = EducationCenter.STATUS_APPROVED
                center.save(update_fields=['status'])

            membership, m_created = CenterMembership.objects.get_or_create(
                user=user,
                center=center,
                role=CenterMembership.ROLE_OWNER,
                defaults={'status': CenterMembership.STATUS_APPROVED, 'approved_by': user},
            )
            if not m_created and membership.status != CenterMembership.STATUS_APPROVED:
                membership.status = CenterMembership.STATUS_APPROVED
                membership.approved_by = user
                membership.save(update_fields=['status', 'approved_by'])

        u_action = 'created' if user_created else 'updated'
        c_action = 'created' if center_created else 'found'
        self.stdout.write(self.style.SUCCESS(
            f'Owner {u_action}: {norm} (id={user.id}) → '
            f'Center {c_action}: {center_name} (id={center.id})'
        ))
