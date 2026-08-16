"""Unit tests for Admin Broadcast and Push campaigns.
"""
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from notifications.models import BroadcastCampaign, Notification


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminBroadcastTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.student1 = User.objects.create_user(
            phone='+998901000001',
            password='password123',
            full_name='Ahmad Aliyev',
            roles=['student'],
        )
        self.student2 = User.objects.create_user(
            phone='+998901000002',
            password='password123',
            full_name='Bekzod Saidov',
            roles=['student'],
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_create_and_send_broadcast(self):
        # 1. Yaratish va to'g'ridan-to'g'ri yuborish
        resp = self.client.post(
            '/api/notifications/admin/broadcasts/',
            {
                'title': 'Katta Bahor Olimpiadasi!',
                'message': 'Barcha o‘quvchilar uchun ro‘yxatdan o‘tish boshlandi.',
                'target_audience': 'all',
                'send_in_app': True,
                'send_now': True,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['sent_count'], 2)

        # 2. Xabarnomalar yaratilganligini tekshirish
        notifs = Notification.objects.filter(type=Notification.TYPE_ADMIN_BROADCAST)
        self.assertGreaterEqual(notifs.count(), 2)

        # 3. Ro'yxatni olish
        resp_list = self.client.get('/api/notifications/admin/broadcasts/')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_list.data['count'], 1)
