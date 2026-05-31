from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from centers.models import CenterMembership, EducationCenter

User = get_user_model()


# join_center va approval oqimlari Celery notification tasklarini ishga
# tushiradi (test muhitida EAGER) hamda Telegram/in-app xabar yuborishga
# urinadi. Testlar tashqi I/O'ga bog'liq bo'lmasligi uchun shularni mock
# qilamiz — biznes logikasi (membership yaratish/tasdiqlash) o'zgarmaydi.
NOTIFY_PATCHES = (
    'centers.tasks.send_student_join_notifications_task.delay',
    'centers.tasks.send_staff_join_notification_task.delay',
)


class CenterCreateTestCase(APITestCase):
    """POST /api/centers/ — yangi markaz (pending) yaratish."""

    def setUp(self):
        self.user = User.objects.create_user(
            phone='+998901200001', password='StrongPass123', full_name='Direktor',
        )
        self.client.force_authenticate(user=self.user)

    @patch('notifications.services.send_center_approval_request_notification')
    def test_create_center_pending(self, _mock_notify):
        url = reverse('centers-list-create')
        response = self.client.post(url, {
            'name': 'Yangi Markaz',
            'city': 'Toshkent',
            'region': 'Toshkent',
            'district': 'Yunusobod',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        center = EducationCenter.objects.get(name='Yangi Markaz')
        self.assertEqual(center.status, EducationCenter.STATUS_PENDING)
        self.assertEqual(center.owner_id, self.user.id)
        # Owner uchun pending membership ham yaratiladi.
        self.assertTrue(
            CenterMembership.objects.filter(
                user=self.user, center=center,
                role=CenterMembership.ROLE_OWNER,
                status=CenterMembership.STATUS_PENDING,
            ).exists()
        )

    def test_anonymous_cannot_create_center(self):
        self.client.force_authenticate(user=None)
        url = reverse('centers-list-create')
        response = self.client.post(url, {
            'name': 'Anon Markaz', 'city': 'Toshkent',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class JoinCenterTestCase(APITestCase):
    """POST /api/centers/{id}/join/ — o'quvchi markazga ariza yuboradi."""

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Approved Markaz', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901200002', password='StrongPass123', full_name="O'quvchi",
        )
        self.client.force_authenticate(user=self.student)

    def test_student_join_creates_pending_membership(self):
        url = reverse('center-join', args=[self.center.id])
        with patch(NOTIFY_PATCHES[0]), patch(NOTIFY_PATCHES[1]):
            response = self.client.post(url, {'role': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        membership = CenterMembership.objects.get(
            user=self.student, center=self.center, role=CenterMembership.ROLE_STUDENT,
        )
        self.assertEqual(membership.status, CenterMembership.STATUS_PENDING)

    def test_join_unapproved_center_404(self):
        pending_center = EducationCenter.objects.create(
            name='Pending Markaz', city='Toshkent',
            status=EducationCenter.STATUS_PENDING,
        )
        url = reverse('center-join', args=[pending_center.id])
        response = self.client.post(url, {'role': 'student'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MembershipApprovalTestCase(APITestCase):
    """POST /api/centers/{id}/approve-student/ — ariza tasdiqlash / rad etish."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901200003', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Owner Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901200004', password='StrongPass123', full_name='Talaba',
        )
        self.membership = CenterMembership.objects.create(
            user=self.student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_PENDING,
            approval_code='ABC123',
        )
        self.client.force_authenticate(user=self.owner)

    def test_owner_approves_student(self):
        url = reverse('approve-student', args=[self.center.id])
        response = self.client.post(url, {
            'membership_id': self.membership.id,
            'decision': 'approve',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.status, CenterMembership.STATUS_APPROVED)
        self.student.refresh_from_db()
        self.assertIn(CenterMembership.ROLE_STUDENT, self.student.roles)

    def test_owner_rejects_student(self):
        url = reverse('approve-student', args=[self.center.id])
        response = self.client.post(url, {
            'membership_id': self.membership.id,
            'decision': 'reject',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.status, CenterMembership.STATUS_REJECTED)

    def test_outsider_cannot_approve(self):
        outsider = User.objects.create_user(
            phone='+998901200005', password='StrongPass123', full_name='Begona',
        )
        self.client.force_authenticate(user=outsider)
        url = reverse('approve-student', args=[self.center.id])
        response = self.client.post(url, {
            'membership_id': self.membership.id,
            'decision': 'approve',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.status, CenterMembership.STATUS_PENDING)


class CreateStaffTestCase(APITestCase):
    """POST /api/centers/{id}/managers/create/ — owner staff tayinlaydi."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901200006', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Staff Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.client.force_authenticate(user=self.owner)

    def test_owner_creates_manager(self):
        url = reverse('create-manager', args=[self.center.id])
        response = self.client.post(url, {
            'full_name': 'Yangi Menejer',
            'phone': '+998901200007',
            'password': 'StrongPass123',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_user = User.objects.get(normalized_phone='+998901200007')
        self.assertTrue(
            CenterMembership.objects.filter(
                user=new_user, center=self.center,
                role=CenterMembership.ROLE_MANAGER,
                status=CenterMembership.STATUS_APPROVED,
            ).exists()
        )
        self.assertIn(CenterMembership.ROLE_MANAGER, new_user.roles)

    def test_non_owner_cannot_create_manager(self):
        other = User.objects.create_user(
            phone='+998901200008', password='StrongPass123', full_name='Boshqa',
        )
        self.client.force_authenticate(user=other)
        url = reverse('create-manager', args=[self.center.id])
        response = self.client.post(url, {
            'full_name': 'Ruxsatsiz',
            'phone': '+998901200009',
            'password': 'StrongPass123',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(normalized_phone='+998901200009').exists())
