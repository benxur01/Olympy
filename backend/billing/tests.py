import hashlib
import base64
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.conf import settings
from rest_framework.test import APITestCase
from rest_framework import status
from billing.models import SubscriptionPlan, UserSubscription, PaymentTransaction

User = get_user_model()


class BillingTestCase(APITestCase):

    def setUp(self):
        # Configure secret keys for tests
        settings.CLICK_SECRET_KEY = 'test_click_secret'
        settings.PAYME_SECRET_KEY = 'test_payme_secret'
        settings.CLICK_SERVICE_ID = '123'
        settings.CLICK_MERCHANT_ID = '456'
        settings.PAYME_MERCHANT_ID = '789'
        settings.CLICK_ENABLED = True
        settings.PAYME_ENABLED = True
        settings.BILLING_ENABLED = True

        # Create test user
        self.user = User.objects.create_user(
            username='billing_user',
            phone='+998907777777',
            password='testpassword'
        )
        self.client.force_authenticate(user=self.user)

        # Clear seeded plans to avoid price lookup collisions in tests
        SubscriptionPlan.objects.all().delete()

        # Create active pricing plan
        self.plan = SubscriptionPlan.objects.create(
            name='Professional Plan',
            price=Decimal('99000.00'),
            duration_days=30,
            is_active=True
        )

    def test_create_checkout_session(self):
        """Test that checkout endpoint creates a pending transaction and payment URLs."""
        url = reverse('billing-checkout')
        
        # 1. Click provider
        response = self.client.post(url, {
            'plan_id': self.plan.id,
            'provider': 'click'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tx_id = response.data['transaction_id']
        self.assertTrue(PaymentTransaction.objects.filter(id=tx_id, provider='click', status=PaymentTransaction.STATUS_PENDING).exists())
        self.assertIn('click.uz', response.data['payment_url'])

        # 2. Payme provider
        response = self.client.post(url, {
            'plan_id': self.plan.id,
            'provider': 'payme'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tx_id_payme = response.data['transaction_id']
        self.assertTrue(PaymentTransaction.objects.filter(id=tx_id_payme, provider='payme', status=PaymentTransaction.STATUS_PENDING).exists())
        self.assertIn('paycom.uz', response.data['payment_url'])

    def test_click_webhook_prepare_and_complete(self):
        """Test Click callback webhook Prepare (action=0) and Complete (action=1) phases."""
        tx = PaymentTransaction.objects.create(
            user=self.user,
            amount=self.plan.price,
            provider='click',
            status=PaymentTransaction.STATUS_PENDING
        )

        url = reverse('billing-click-webhook')

        # --- 1. Prepare phase (action = 0) ---
        sign_time = '2026-05-31 12:00:00'
        # sign_string = md5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
        raw_sign = f"1111{settings.CLICK_SERVICE_ID}{settings.CLICK_SECRET_KEY}{tx.id}{self.plan.price:.2f}0{sign_time}"
        sign_string = hashlib.md5(raw_sign.encode()).hexdigest()

        prepare_data = {
            'click_trans_id': '1111',
            'service_id': settings.CLICK_SERVICE_ID,
            'click_paydoc_id': '2222',
            'merchant_trans_id': str(tx.id),
            'amount': f"{self.plan.price:.2f}",
            'action': '0',
            'error': '0',
            'sign_time': sign_time,
            'sign_string': sign_string
        }

        response = self.client.post(url, prepare_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['error'], 0)
        self.assertEqual(response.json()['merchant_prepare_id'], tx.id)

        # Transaction status should still be pending
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)

        # --- 2. Complete phase (action = 1) ---
        raw_sign_complete = f"1111{settings.CLICK_SERVICE_ID}{settings.CLICK_SECRET_KEY}{tx.id}{self.plan.price:.2f}1{sign_time}"
        sign_string_complete = hashlib.md5(raw_sign_complete.encode()).hexdigest()

        complete_data = prepare_data.copy()
        complete_data['action'] = '1'
        complete_data['sign_string'] = sign_string_complete

        response = self.client.post(url, complete_data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['error'], 0)
        self.assertEqual(response.json()['merchant_confirm_id'], tx.id)

        # Transaction should succeed and subscription must activate
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_SUCCESS)
        self.assertEqual(tx.manager_commission, Decimal('19800.00')) # 20% of 99000.00
        
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_premium)
        self.assertTrue(UserSubscription.objects.filter(user=self.user, plan=self.plan, is_active=True).exists())

    def test_payme_webhook_json_rpc(self):
        """Test Payme JSON-RPC 2.0 Webhook integration flow."""
        tx = PaymentTransaction.objects.create(
            user=self.user,
            amount=self.plan.price,
            provider='payme',
            status=PaymentTransaction.STATUS_PENDING
        )

        url = reverse('billing-payme-webhook')

        # Authentication header
        auth_string = f"Paycom:{settings.PAYME_SECRET_KEY}"
        encoded_auth = base64.b64encode(auth_string.encode()).decode()
        self.client.credentials(HTTP_AUTHORIZATION=f"Basic {encoded_auth}")

        # --- 1. CheckPerformTransaction ---
        payload_check = {
            "method": "CheckPerformTransaction",
            "params": {
                "amount": int(self.plan.price * 100),  # In tiyins
                "account": {"transaction_id": str(tx.id)}
            },
            "id": 42
        }
        response = self.client.post(url, payload_check, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()['result']['allow'])

        # --- 2. CreateTransaction ---
        payload_create = {
            "method": "CreateTransaction",
            "params": {
                "id": "payme_tx_999",
                "time": 1717150000000,
                "amount": int(self.plan.price * 100),
                "account": {"transaction_id": str(tx.id)}
            },
            "id": 43
        }
        response = self.client.post(url, payload_create, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['result']['state'], 1)

        # Transaction should store provider transaction ID
        tx.refresh_from_db()
        self.assertEqual(tx.provider_transaction_id, "payme_tx_999")

        # --- 3. PerformTransaction ---
        payload_perform = {
            "method": "PerformTransaction",
            "params": {
                "id": "payme_tx_999"
            },
            "id": 44
        }
        response = self.client.post(url, payload_perform, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['result']['state'], 2)

        # Transaction should succeed and user become premium
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_SUCCESS)
        self.assertEqual(tx.manager_commission, Decimal('19800.00')) # 20% of 99000.00

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_premium)
        self.assertTrue(UserSubscription.objects.filter(user=self.user, plan=self.plan, is_active=True).exists())

    def test_organization_subscription_propagates_premium(self):
        """Test that subscribing to an organization plan sets owner's EducationCenters as premium."""
        from centers.models import EducationCenter
        
        # Create a center owned by this user
        center = EducationCenter.objects.create(
            name="Test Center",
            organization_type="O'quv markaz",
            city="Toshkent",
            owner=self.user,
            status=EducationCenter.STATUS_APPROVED
        )
        self.assertFalse(center.is_premium)
        
        # Create organization plan
        org_plan = SubscriptionPlan.objects.create(
            name='Org Plus (1 oy)',
            plan_type='organization',
            price=Decimal('399000.00'),
            duration_days=30,
            is_active=True
        )
        
        # Subscribe user to org plan
        UserSubscription.objects.create(
            user=self.user,
            plan=org_plan,
            is_active=True
        )
        
        # Verify that center is now premium
        center.refresh_from_db()
        self.assertTrue(center.is_premium)
