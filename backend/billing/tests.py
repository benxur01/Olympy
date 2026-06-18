import hashlib
import base64
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.conf import settings
from django.utils import timezone
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


class BillingSecurityTestCase(APITestCase):
    """Pul bilan bog'liq webhook'larning xavfsizlik va edge-case senariylari:
    soxta imzo, idempotency (takror webhook), refund, muvaffaqiyatsiz/cancel
    holatlari va trial -> paid o'tishi. Haqiqiy Payme/Click serverga so'rov
    yuborilmaydi — webhook formati simulyatsiya qilinadi.
    """

    def setUp(self):
        settings.CLICK_SECRET_KEY = 'test_click_secret'
        settings.PAYME_SECRET_KEY = 'test_payme_secret'
        settings.CLICK_SERVICE_ID = '123'
        settings.CLICK_MERCHANT_ID = '456'
        settings.PAYME_MERCHANT_ID = '789'
        settings.CLICK_ENABLED = True
        settings.PAYME_ENABLED = True
        settings.BILLING_ENABLED = True

        self.user = User.objects.create_user(
            username='sec_user',
            phone='+998901112233',
            password='testpassword',
        )

        # Narx bo'yicha qidiruvdagi to'qnashuvlardan qochish uchun seed planlarni
        # tozalaymiz va bitta aniq plan yaratamiz.
        SubscriptionPlan.objects.all().delete()
        self.plan = SubscriptionPlan.objects.create(
            name='Pro Plan',
            price=Decimal('99000.00'),
            duration_days=30,
            is_active=True,
        )

    # ─── Click yordamchilari ─────────────────────────────────────────────
    def _click_sign(self, tx_id, action, amount, sign_time):
        raw = (
            f"1111{settings.CLICK_SERVICE_ID}{settings.CLICK_SECRET_KEY}"
            f"{tx_id}{amount}{action}{sign_time}"
        )
        return hashlib.md5(raw.encode()).hexdigest()

    def _click_payload(self, tx, action, sign_string=None, amount=None, error='0'):
        sign_time = '2026-05-31 12:00:00'
        amount = amount if amount is not None else f"{self.plan.price:.2f}"
        if sign_string is None:
            sign_string = self._click_sign(tx.id, action, amount, sign_time)
        return {
            'click_trans_id': '1111',
            'service_id': settings.CLICK_SERVICE_ID,
            'click_paydoc_id': '2222',
            'merchant_trans_id': str(tx.id),
            'amount': amount,
            'action': str(action),
            'error': error,
            'sign_time': sign_time,
            'sign_string': sign_string,
        }

    # ─── Payme yordamchilari ─────────────────────────────────────────────
    def _payme_auth(self):
        auth_string = f"Paycom:{settings.PAYME_SECRET_KEY}"
        return base64.b64encode(auth_string.encode()).decode()

    def _payme_post(self, payload, auth=None):
        if auth is None:
            auth = self._payme_auth()
        self.client.credentials(HTTP_AUTHORIZATION=f"Basic {auth}")
        return self.client.post(
            reverse('billing-payme-webhook'), payload, format='json'
        )

    # =====================================================================
    # 1. SOXTA / NOTO'G'RI IMZO -> RAD ETILISHI (xavfsizlik)
    # =====================================================================
    def test_click_webhook_rejects_invalid_signature(self):
        """Click: noto'g'ri sign_string bilan kelgan Complete so'rovi rad
        etilishi va obuna BERILMASLIGI kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='click', status=PaymentTransaction.STATUS_PENDING,
        )
        url = reverse('billing-click-webhook')
        bad = self._click_payload(tx, action=1, sign_string='deadbeefdeadbeef')

        response = self.client.post(url, bad)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['error'], -1)  # SIGN CHECK FAILED

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)
        self.assertFalse(self.user.is_premium)
        self.assertFalse(
            UserSubscription.objects.filter(user=self.user).exists()
        )

    def test_payme_webhook_rejects_invalid_auth(self):
        """Payme: noto'g'ri Basic auth (soxta secret) bilan kelgan
        PerformTransaction rad etilishi (-32504) kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_fake_1',
        )
        wrong_auth = base64.b64encode(b"Paycom:WRONG_SECRET").decode()
        payload = {
            'method': 'PerformTransaction',
            'params': {'id': 'payme_fake_1'},
            'id': 7,
        }
        response = self._payme_post(payload, auth=wrong_auth)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['error']['code'], -32504)

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)
        self.assertFalse(self.user.is_premium)

    def test_payme_webhook_rejects_missing_auth(self):
        """Payme: Authorization header umuman bo'lmasa ham rad etilishi kerak
        (autentifikatsiyasiz hech kim to'lovni 'to'langan' deb belgilay
        olmasligi uchun)."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_fake_2',
        )
        self.client.credentials()  # header yo'q
        response = self.client.post(
            reverse('billing-payme-webhook'),
            {'method': 'PerformTransaction', 'params': {'id': 'payme_fake_2'}, 'id': 8},
            format='json',
        )
        self.assertEqual(response.json()['error']['code'], -32504)
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)

    # =====================================================================
    # 2. NOTO'G'RI SUMMA -> RAD ETILISHI (narxni o'zgartirib yuborishga qarshi)
    # =====================================================================
    def test_click_webhook_rejects_wrong_amount(self):
        """Click: to'g'ri imzo, lekin summa tx summasiga mos kelmasa rad
        etilishi (-2) va obuna berilmasligi kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='click', status=PaymentTransaction.STATUS_PENDING,
        )
        url = reverse('billing-click-webhook')
        # Imzo 1.00 summa uchun to'g'ri hisoblanadi — imzo tekshiruvidan o'tadi,
        # lekin amount != tx.amount bo'lgani uchun -2 bilan rad etilishi kerak.
        payload = self._click_payload(tx, action=1, amount='1.00')
        response = self.client.post(url, payload)
        self.assertEqual(response.json()['error'], -2)  # Incorrect amount

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_PENDING)
        self.assertFalse(self.user.is_premium)

    def test_payme_check_rejects_wrong_amount(self):
        """Payme: CheckPerformTransaction noto'g'ri summa bilan -31001
        qaytarishi kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
        )
        payload = {
            'method': 'CheckPerformTransaction',
            'params': {
                'amount': 100,  # 1.00 UZS — noto'g'ri
                'account': {'transaction_id': str(tx.id)},
            },
            'id': 9,
        }
        response = self._payme_post(payload)
        self.assertEqual(response.json()['error']['code'], -31001)

    # =====================================================================
    # 3. IDEMPOTENCY -> takror webhook ikki marta premium bermasligi
    # =====================================================================
    def test_click_complete_is_idempotent(self):
        """Click: bir xil to'lov ID bilan Complete IKKI marta kelsa, faqat
        BITTA UserSubscription yaratilishi kerak (ikki marta premium emas)."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='click', status=PaymentTransaction.STATUS_PENDING,
        )
        url = reverse('billing-click-webhook')
        payload = self._click_payload(tx, action=1)

        r1 = self.client.post(url, payload)
        r2 = self.client.post(url, payload)  # takror — Click qayta urinishi

        self.assertEqual(r1.json()['error'], 0)
        self.assertEqual(r2.json()['error'], 0)  # ikkinchisi ham OK qaytaradi
        self.assertEqual(
            UserSubscription.objects.filter(user=self.user, is_active=True).count(),
            1,
            "Takror Complete webhook dublikat obuna yaratmasligi kerak",
        )
        tx.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_SUCCESS)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_premium)

    def test_payme_perform_is_idempotent(self):
        """Payme: PerformTransaction IKKI marta chaqirilsa state=2 qaytaradi,
        lekin faqat bitta obuna yaratiladi."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_idem_1',
        )
        payload = {
            'method': 'PerformTransaction',
            'params': {'id': 'payme_idem_1'},
            'id': 11,
        }
        r1 = self._payme_post(payload)
        r2 = self._payme_post(payload)  # takror

        self.assertEqual(r1.json()['result']['state'], 2)
        self.assertEqual(r2.json()['result']['state'], 2)
        self.assertEqual(
            UserSubscription.objects.filter(user=self.user, is_active=True).count(),
            1,
            "Takror PerformTransaction dublikat obuna yaratmasligi kerak",
        )

    def test_payme_create_transaction_is_idempotent(self):
        """Payme: bir xil CreateTransaction takror kelsa, provider ID
        bir xil saqlanadi (ikkinchi marta xato emas, state=1)."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
        )
        payload = {
            'method': 'CreateTransaction',
            'params': {
                'id': 'payme_create_1',
                'time': 1717150000000,
                'amount': int(self.plan.price * 100),
                'account': {'transaction_id': str(tx.id)},
            },
            'id': 12,
        }
        r1 = self._payme_post(payload)
        r2 = self._payme_post(payload)
        self.assertEqual(r1.json()['result']['state'], 1)
        self.assertEqual(r2.json()['result']['state'], 1)
        tx.refresh_from_db()
        self.assertEqual(tx.provider_transaction_id, 'payme_create_1')

    # =====================================================================
    # 4. REFUND / BEKOR QILISH -> premium holatini o'chirishi
    # =====================================================================
    def test_payme_cancel_after_perform_revokes_premium(self):
        """Payme: bajarilgan to'lov CancelTransaction bilan bekor qilinsa,
        obuna deaktivatsiya qilinib is_premium=False bo'lishi kerak (refund)."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_refund_1',
        )
        # Avval to'lovni bajaramiz (premium beriladi).
        self._payme_post({
            'method': 'PerformTransaction',
            'params': {'id': 'payme_refund_1'}, 'id': 20,
        })
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_premium)
        self.assertTrue(
            UserSubscription.objects.filter(user=self.user, is_active=True).exists()
        )

        # Endi bekor qilamiz (refund, reason=5 = pul qaytarildi).
        response = self._payme_post({
            'method': 'CancelTransaction',
            'params': {'id': 'payme_refund_1', 'reason': 5},
            'id': 21,
        })
        self.assertEqual(response.json()['result']['state'], -2)

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_CANCELLED)
        self.assertEqual(tx.cancel_reason, 5)
        self.assertFalse(
            self.user.is_premium,
            "Refunddan keyin foydalanuvchi premium bo'lmasligi kerak",
        )
        self.assertFalse(
            UserSubscription.objects.filter(user=self.user, is_active=True).exists()
        )

    def test_payme_cancel_is_idempotent(self):
        """Payme: allaqachon bekor qilingan tranzaksiya uchun CancelTransaction
        takror kelsa, xuddi shu state=-2 javobi qaytarilishi kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_refund_2',
        )
        self._payme_post({
            'method': 'PerformTransaction',
            'params': {'id': 'payme_refund_2'}, 'id': 22,
        })
        cancel_payload = {
            'method': 'CancelTransaction',
            'params': {'id': 'payme_refund_2', 'reason': 5},
            'id': 23,
        }
        r1 = self._payme_post(cancel_payload)
        r2 = self._payme_post(cancel_payload)  # takror cancel
        self.assertEqual(r1.json()['result']['state'], -2)
        self.assertEqual(r2.json()['result']['state'], -2)
        # Bekor qilingan tranzaksiyalar soni o'zgarmaydi (bitta).
        self.assertEqual(
            PaymentTransaction.objects.filter(
                status=PaymentTransaction.STATUS_CANCELLED
            ).count(),
            1,
        )

    # =====================================================================
    # 5. MUVAFFAQIYATSIZ / CANCEL HOLATLARI -> hech narsa o'zgarmasligi
    # =====================================================================
    def test_click_error_marks_failed_no_premium(self):
        """Click: error_code < 0 (to'lov xato) kelsa tx FAILED bo'lishi,
        lekin obuna BERILMASLIGI kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='click', status=PaymentTransaction.STATUS_PENDING,
        )
        url = reverse('billing-click-webhook')
        # error='-5' — Click tomonidan xato. Imzo error qiymatini ham
        # o'z ichiga oladi, shuning uchun to'g'ri imzo hisoblaymiz.
        payload = self._click_payload(tx, action=1, error='-5')
        sign_time = payload['sign_time']
        raw = (
            f"1111{settings.CLICK_SERVICE_ID}{settings.CLICK_SECRET_KEY}"
            f"{tx.id}{payload['amount']}1{sign_time}"
        )
        payload['sign_string'] = hashlib.md5(raw.encode()).hexdigest()

        response = self.client.post(url, payload)
        self.assertEqual(response.json()['error'], -9)

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_FAILED)
        self.assertFalse(self.user.is_premium)
        self.assertFalse(
            UserSubscription.objects.filter(user=self.user).exists()
        )

    def test_payme_cancel_pending_no_premium(self):
        """Payme: hali bajarilmagan (pending) tranzaksiya bekor qilinsa
        state=-1 (FAILED) bo'lishi va premium berilmasligi kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_cancel_pending',
        )
        # CreateTransaction qilingan, lekin Perform qilinmagan — keyin Cancel.
        response = self._payme_post({
            'method': 'CancelTransaction',
            'params': {'id': 'payme_cancel_pending', 'reason': 3},
            'id': 30,
        })
        self.assertEqual(response.json()['result']['state'], -1)

        tx.refresh_from_db()
        self.user.refresh_from_db()
        self.assertEqual(tx.status, PaymentTransaction.STATUS_FAILED)
        self.assertFalse(self.user.is_premium)
        self.assertFalse(
            UserSubscription.objects.filter(user=self.user, is_active=True).exists()
        )

    def test_payme_perform_rejected_after_cancel(self):
        """Payme: bekor qilingan tranzaksiyani PerformTransaction qilishga
        urinish -31008 bilan rad etilishi (premium berilmasligi) kerak."""
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_FAILED,
            provider_transaction_id='payme_dead',
        )
        response = self._payme_post({
            'method': 'PerformTransaction',
            'params': {'id': 'payme_dead'}, 'id': 31,
        })
        self.assertEqual(response.json()['error']['code'], -31008)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_premium)

    # =====================================================================
    # 6. TRIAL -> PAID o'tishi
    # =====================================================================
    def test_trial_user_upgrades_to_paid(self):
        """Trial holatidagi foydalanuvchi to'lov qilsa, is_premium=True
        bo'lishi va is_premium_active TRUE qolishi kerak (trial -> paid)."""
        # Foydalanuvchi hozir trial'da: premium_trial_end kelajakda.
        self.user.premium_trial_end = timezone.now() + timedelta(days=10)
        self.user.is_premium = False
        self.user.save(update_fields=['premium_trial_end', 'is_premium'])
        self.assertTrue(self.user.trial_active)
        self.assertTrue(self.user.is_premium_active)
        self.assertFalse(self.user.is_premium)  # hali pulli emas, faqat trial

        # To'lov qiladi (Payme to'liq oqim).
        tx = PaymentTransaction.objects.create(
            user=self.user, plan=self.plan, amount=self.plan.price,
            provider='payme', status=PaymentTransaction.STATUS_PENDING,
            provider_transaction_id='payme_trial_up',
        )
        self._payme_post({
            'method': 'PerformTransaction',
            'params': {'id': 'payme_trial_up'}, 'id': 40,
        })

        self.user.refresh_from_db()
        # Endi pulli premium (is_premium=True), obuna mavjud.
        self.assertTrue(self.user.is_premium)
        self.assertTrue(self.user.is_premium_active)
        sub = UserSubscription.objects.filter(
            user=self.user, is_active=True
        ).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.plan_id, self.plan.id)
        # Obuna muddati trial tugashidan keyin ham davom etishi kerak
        # (plan.duration_days=30 kun, trial 10 kun edi).
        self.assertGreater(sub.end_date, self.user.premium_trial_end)


class SubscriptionServiceTestCase(APITestCase):
    """SubscriptionService limit enforcement va /api/billing/limits/ endpoint."""

    def setUp(self):
        from centers.models import EducationCenter, CenterMembership
        self.EducationCenter = EducationCenter
        self.CenterMembership = CenterMembership

        SubscriptionPlan.objects.all().delete()

        self.owner = User.objects.create_user(
            username='svc_owner', phone='+998901000001', password='pw',
        )
        self.center = EducationCenter.objects.create(
            name='Svc Center',
            city='Toshkent',
            owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
            is_premium=False,
        )

    def _make_students(self, n):
        from centers.models import CenterMembership
        for i in range(n):
            u = User.objects.create_user(
                username=f'stu{i}_{self.center.id}',
                phone=f'+99893000{i:04d}',
                password='pw',
            )
            CenterMembership.objects.create(
                user=u, center=self.center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_APPROVED,
            )

    def _give_org_plan(self, max_students=50, max_teachers=5, max_olympiads=10):
        plan = SubscriptionPlan.objects.create(
            name='Org Standart', plan_type='organization',
            price=Decimal('199999.00'), duration_days=30, is_active=True,
            max_students=max_students, max_teachers=max_teachers,
            max_olympiads_monthly=max_olympiads,
        )
        UserSubscription.objects.create(
            user=self.owner, plan=plan,
            start_date=timezone.now(),
            end_date=timezone.now() + timedelta(days=30),
            is_active=True,
        )
        return plan

    def test_free_center_student_limit(self):
        """Obunasiz, premium bo'lmagan markaz — FREE_LIMITS (10 o'quvchi)."""
        from billing.services import SubscriptionService, FREE_LIMITS
        svc = SubscriptionService(self.center)
        self.assertEqual(svc.student_limit, FREE_LIMITS['students'])
        self.assertTrue(svc.can_add_student())
        self._make_students(FREE_LIMITS['students'])
        # Limitga yetdi — yana qo'shib bo'lmaydi.
        self.assertFalse(SubscriptionService(self.center).can_add_student())

    def test_org_plan_uses_plan_limits(self):
        """Aktiv organization obunasi — plan.max_students limit beradi."""
        from billing.services import SubscriptionService
        self._give_org_plan(max_students=50)
        svc = SubscriptionService(self.center)
        self.assertEqual(svc.student_limit, 50)
        self.assertTrue(svc.can_add_student())

    def test_pro_plan_unlimited(self):
        """max_students=0 (UNLIMITED) — cheksiz, hech qachon bloklamaydi."""
        from billing.services import SubscriptionService
        self._give_org_plan(max_students=SubscriptionPlan.UNLIMITED)
        self._make_students(20)
        svc = SubscriptionService(self.center)
        self.assertTrue(svc.student_limit == SubscriptionPlan.UNLIMITED)
        self.assertTrue(svc.can_add_student())

    def test_teacher_limit_enforced(self):
        from billing.services import SubscriptionService
        from centers.models import CenterMembership
        self._give_org_plan(max_teachers=2)
        for i in range(2):
            u = User.objects.create_user(
                username=f't{i}', phone=f'+99894000{i:04d}', password='pw',
            )
            CenterMembership.objects.create(
                user=u, center=self.center,
                role=CenterMembership.ROLE_TEACHER,
                status=CenterMembership.STATUS_APPROVED,
            )
        svc = SubscriptionService(self.center)
        self.assertEqual(svc.teacher_limit, 2)
        self.assertFalse(svc.can_add_teacher())

    def test_check_student_limit_raises(self):
        """centers.services.check_student_limit yangi servicega delegatsiya qiladi."""
        from centers.services import check_student_limit
        from django.core.exceptions import ValidationError
        self._make_students(10)  # FREE limit = 10
        with self.assertRaises(ValidationError):
            check_student_limit(self.center)

    def test_limits_endpoint_owner(self):
        """GET /api/billing/limits/ owner uchun usage_summary qaytaradi."""
        self._give_org_plan(max_students=50, max_teachers=5, max_olympiads=10)
        self._make_students(45)
        self.client.force_authenticate(user=self.owner)
        res = self.client.get('/api/billing/limits/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data['students']['used'], 45)
        self.assertEqual(data['students']['limit'], 50)
        self.assertFalse(data['students']['unlimited'])
        # 45/50 = 90% > 80% — "limit tugayapti" ogohlantirishi.
        self.assertTrue(data['students']['near_limit'])
        self.assertEqual(data['center_id'], self.center.id)

    def test_limits_endpoint_no_center(self):
        """Markazi yo'q foydalanuvchi uchun null qaytariladi."""
        nobody = User.objects.create_user(
            username='nobody', phone='+998905000099', password='pw',
        )
        self.client.force_authenticate(user=nobody)
        res = self.client.get('/api/billing/limits/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data)

    def test_limits_endpoint_forbidden_other_center(self):
        """Boshqa markaz limitlarini ko'rib bo'lmaydi (403)."""
        intruder = User.objects.create_user(
            username='intruder', phone='+998905000088', password='pw',
        )
        self.client.force_authenticate(user=intruder)
        res = self.client.get(f'/api/billing/limits/?center_id={self.center.id}')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
