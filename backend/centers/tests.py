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


class CenterApprovalTrialTestCase(APITestCase):
    """Admin markazni tasdiqlaganda owner uchun 14-kunlik trial yaratilishi."""

    def setUp(self):
        from billing.models import SubscriptionPlan
        self.admin = User.objects.create_user(
            phone='+998901200099', password='StrongPass123', full_name='Admin',
            is_platform_admin=True
        )
        self.owner = User.objects.create_user(
            phone='+998901200098', password='StrongPass123', full_name='Owner'
        )
        self.center = EducationCenter.objects.create(
            name='Yangi O\'quv Markazi', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_PENDING
        )
        # Create an active subscription plan of type 'organization'
        self.plan = SubscriptionPlan.objects.create(
            name='Boshlang\'ich Plan',
            plan_type='organization',
            price=150000,
            duration_days=30,
            is_active=True
        )
        self.client.force_authenticate(user=self.admin)

    @patch('notifications.services.send_center_decision_notification')
    def test_admin_approves_center_creates_trial(self, _mock_notify):
        from billing.models import UserSubscription
        url = reverse('admin-approve-center', args=[self.center.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check that center is approved
        self.center.refresh_from_db()
        self.assertEqual(self.center.status, EducationCenter.STATUS_APPROVED)
        
        # Check that user subscription is created
        sub = UserSubscription.objects.filter(user=self.owner, plan=self.plan).first()
        self.assertIsNotNone(sub)
        self.assertTrue(sub.is_active)
        # Verify 14-day duration roughly (allowing a small delta)
        from django.utils import timezone
        delta = sub.end_date - timezone.now()
        self.assertTrue(13 <= delta.days <= 15)
        
        # Verify the center is premium
        self.assertTrue(self.center.is_premium)


class CenterStudentLimitTestCase(APITestCase):
    """Tashkilotlar uchun o'quvchilar soni limitini tekshirish."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.owner = User.objects.create_user(
            phone='+998901200100', password='StrongPass123', full_name='Owner'
        )
        self.center = EducationCenter.objects.create(
            name='Test Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED
        )
        # Create 12 users to make student requests
        self.students = []
        for i in range(12):
            student = User.objects.create_user(
                phone=f'+99890120011{i}', password='StrongPass123', full_name=f'Student {i}'
            )
            self.students.append(student)

    @patch('notifications.services.send_membership_decision_notification')
    def test_free_tier_student_limit(self, _mock_notify):
        from django.core.exceptions import ValidationError
        from centers.services import decide_membership
        # Create 10 approved student memberships
        for i in range(10):
            req = CenterMembership.objects.create(
                user=self.students[i], center=self.center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_PENDING
            )
            decide_membership(req, self.owner, 'approve')

        # The 11th student approval should fail
        req11 = CenterMembership.objects.create(
            user=self.students[10], center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_PENDING
        )
        with self.assertRaises(ValidationError) as context:
            decide_membership(req11, self.owner, 'approve')
        self.assertIn("limitga yetgan", str(context.exception))

    @patch('notifications.services.send_membership_decision_notification')
    def test_standard_tier_student_limit(self, _mock_notify):
        from billing.models import SubscriptionPlan, UserSubscription
        from django.utils import timezone
        from datetime import timedelta
        from django.core.exceptions import ValidationError
        from centers.services import decide_membership

        # Set owner subscription to Standart
        plan = SubscriptionPlan.objects.create(
            name='Standart Plan',
            plan_type='organization',
            price=200000,
            duration_days=30,
            is_active=True
        )
        UserSubscription.objects.create(
            user=self.owner,
            plan=plan,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True
        )

        # We should be able to approve 11 students now (Standart limit is 50)
        for i in range(11):
            req = CenterMembership.objects.create(
                user=self.students[i], center=self.center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_PENDING
            )
            decide_membership(req, self.owner, 'approve')

        active_count = CenterMembership.objects.filter(
            center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED
        ).count()
        self.assertEqual(active_count, 11)


class CenterActivityTrendTestCase(APITestCase):
    """GET /api/centers/{id}/activity-trend/ — oylik o'rtacha ball trendi."""

    def setUp(self):
        from django.utils import timezone
        from olympiads.models import Olympiad
        from attempts.models import TestAttempt

        self.owner = User.objects.create_user(
            phone='+998901300001', password='StrongPass123', full_name='Direktor',
        )
        self.center = EducationCenter.objects.create(
            name='Trend Markaz', city='Toshkent', region='Toshkent',
            status=EducationCenter.STATUS_APPROVED, is_premium=True, owner=self.owner,
        )
        now = timezone.now()
        self.olympiad = Olympiad.objects.create(
            center=self.center, title='Olimpiada', subject='Matematika',
            status='finished', event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=now - timezone.timedelta(days=20), duration_minutes=60,
        )
        self.s1 = User.objects.create_user(phone='+998901300002', password='p', full_name='A')
        self.s2 = User.objects.create_user(phone='+998901300003', password='p', full_name='B')
        # Joriy oyda 2 ta attempt: 80 va 60 → o'rtacha 70.
        TestAttempt.objects.create(user=self.s1, olympiad=self.olympiad, score=80)
        TestAttempt.objects.create(user=self.s2, olympiad=self.olympiad, score=60)
        # Diskvalifikatsiya qilingan attempt — o'rtachaga ta'sir qilmasligi kerak.
        s3 = User.objects.create_user(phone='+998901300004', password='p', full_name='C')
        TestAttempt.objects.create(
            user=s3, olympiad=self.olympiad, score=10, disqualified=True,
        )
        self.client.force_authenticate(user=self.owner)

    def test_owner_sees_current_month_average(self):
        from django.utils import timezone
        url = reverse('center-activity-trend', args=[self.center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(len(data) >= 1)
        current_key = timezone.now().strftime('%Y-%m')
        current = next((d for d in data if d['month'] == current_key), None)
        self.assertIsNotNone(current)
        # 80 va 60 → 70.0; diskvalifikatsiya qilingan 10 hisobga olinmaydi.
        self.assertEqual(current['avg_score'], 70.0)
        self.assertEqual(current['attempts'], 2)

    def test_non_premium_blocked(self):
        self.center.is_premium = False
        self.center.save(update_fields=['is_premium'])
        url = reverse('center-activity-trend', args=[self.center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(response.json().get('upgrade_required'))

    def test_outsider_forbidden(self):
        stranger = User.objects.create_user(
            phone='+998901300009', password='p', full_name='Begona',
        )
        self.client.force_authenticate(user=stranger)
        url = reverse('center-activity-trend', args=[self.center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class CenterRegionRankTestCase(APITestCase):
    """GET /api/centers/{id}/region-rank/ — hudud bo'yicha anonim o'rin."""

    def _center_with_score(self, name, region, owner, score, premium=False):
        from django.utils import timezone
        from olympiads.models import Olympiad
        from attempts.models import TestAttempt

        center = EducationCenter.objects.create(
            name=name, city='Sh', region=region,
            status=EducationCenter.STATUS_APPROVED, is_premium=premium, owner=owner,
        )
        olympiad = Olympiad.objects.create(
            center=center, title='O', subject='Matematika', status='finished',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            start_datetime=timezone.now() - timezone.timedelta(days=5),
            duration_minutes=60,
        )
        if score is not None:
            # Student telefoni markaz id'siga bog'lab unikal qilinadi —
            # owner telefonlari (+99890140000X) bilan to'qnashmasligi uchun
            # boshqa diapazon (+99890141XXXX) ishlatamiz.
            student = User.objects.create_user(
                phone=f'+998901410{center.id:03d}', password='p', full_name='St',
            )
            TestAttempt.objects.create(user=student, olympiad=olympiad, score=score)
        return center

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901400001', password='StrongPass123', full_name='Mening direktor',
        )
        o2 = User.objects.create_user(phone='+998901400002', password='p', full_name='O2')
        o3 = User.objects.create_user(phone='+998901400003', password='p', full_name='O3')
        o4 = User.objects.create_user(phone='+998901400004', password='p', full_name='O4')
        # Toshkent hududi: 90 (boshqa), 75 (mening), 50 (boshqa) → men 2-o'rinda.
        self.my_center = self._center_with_score('Mening', 'Toshkent', self.owner, 75, premium=True)
        self.rival_top = self._center_with_score('Raqib Top', 'Toshkent', o2, 90)
        self._center_with_score('Raqib Past', 'Toshkent', o3, 50)
        # Boshqa hudud — region reytingga kirmasligi kerak.
        self._center_with_score('Boshqa Hudud', 'Samarqand', o4, 99)
        self.client.force_authenticate(user=self.owner)

    def test_region_rank_correct_and_anonymous(self):
        url = reverse('center-region-rank', args=[self.my_center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['region'], 'Toshkent')
        # Toshkentda 3 markaz; men 90 dan keyin → 2-o'rin.
        self.assertEqual(data['region_rank'], 2)
        self.assertEqual(data['region_total'], 3)
        # Global — 4 markaz; 99 va 90 dan keyin → 3-o'rin.
        self.assertEqual(data['global_total'], 4)
        self.assertEqual(data['global_rank'], 3)
        # Xavfsizlik: javobda boshqa markazlarning nomi oshkor bo'lmasligi kerak.
        body = response.content.decode()
        self.assertNotIn('Raqib Top', body)
        self.assertNotIn('Boshqa Hudud', body)

    def test_non_premium_blocked(self):
        self.my_center.is_premium = False
        self.my_center.save(update_fields=['is_premium'])
        url = reverse('center-region-rank', args=[self.my_center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_outsider_forbidden(self):
        stranger = User.objects.create_user(
            phone='+998901400099', password='p', full_name='Begona',
        )
        self.client.force_authenticate(user=stranger)
        url = reverse('center-region-rank', args=[self.my_center.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


