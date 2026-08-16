"""Unit tests for System Health, Cache Purge, and Dynamic Feature Flags.
"""
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import SystemConfig, User


@override_settings(SECURE_SSL_REDIRECT=False)
class SystemHealthTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_system_health_endpoint(self):
        resp = self.client.get('/api/admin/system/health/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('services', resp.data)
        self.assertEqual(resp.data['services']['database']['status'], 'healthy')
        self.assertIn('workload', resp.data)
        self.assertIn('feature_flags', resp.data)

    def test_purge_cache_endpoint(self):
        resp = self.client.post('/api/admin/system/purge-cache/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['ok'])

    def test_system_config_get_and_update(self):
        # 1. GET
        resp_get = self.client.get('/api/admin/system/config/')
        self.assertEqual(resp_get.status_code, status.HTTP_200_OK)
        self.assertFalse(resp_get.data['config']['is_maintenance_mode'])

        # 2. Update to maintenance mode
        resp_post = self.client.post(
            '/api/admin/system/config/',
            {
                'is_maintenance_mode': True,
                'maintenance_message': 'Serverda yangilanish ketyapti!',
                'allow_registrations': False,
            },
            format='json',
        )
        self.assertEqual(resp_post.status_code, status.HTTP_200_OK)
        config = SystemConfig.get_settings()
        self.assertTrue(config.is_maintenance_mode)
        self.assertFalse(config.allow_registrations)
