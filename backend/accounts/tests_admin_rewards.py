"""Unit tests for Admin Rewards Shop and Fulfillment views.
"""
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import RewardProduct, RewardRedemption, User


@override_settings(SECURE_SSL_REDIRECT=False)
class AdminRewardsTestCase(APITestCase):

    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            phone='+998901112233',
            password='AdminPassword123!',
            full_name='Platform Admin',
            is_platform_admin=True,
        )
        self.student = User.objects.create_user(
            phone='+998901000001',
            password='pw1',
            full_name='Sardor Rashidov',
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_create_toggle_and_redemption_fulfillment(self):
        # 1. Mahsulot yaratish
        resp = self.client.post(
            '/api/admin/rewards/products/',
            {
                'title': 'Olympy Futbolkasi',
                'description': 'Paxtali premium futbolka',
                'coin_cost': 500,
                'stock': 20,
                'icon': '👕',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        prod_id = resp.data['product']['id']

        # 2. Ro'yxatni olish
        resp_list = self.client.get('/api/admin/rewards/products/')
        self.assertEqual(resp_list.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_list.data['count'], 1)

        # 3. Buyurtma yaratish va statusini yangilash
        prod = RewardProduct.objects.get(pk=prod_id)
        redemption = RewardRedemption.objects.create(
            user=self.student,
            product=prod,
            status=RewardRedemption.STATUS_PENDING,
        )

        resp_red_list = self.client.get('/api/admin/rewards/redemptions/')
        self.assertEqual(resp_red_list.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_red_list.data['count'], 1)

        resp_fulfill = self.client.post(
            f'/api/admin/rewards/redemptions/{redemption.id}/status/',
            {'status': 'delivered'},
            format='json',
        )
        self.assertEqual(resp_fulfill.status_code, status.HTTP_200_OK)
        redemption.refresh_from_db()
        self.assertEqual(redemption.status, 'delivered')
