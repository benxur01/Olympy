import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from centers.models import CenterMembership, EducationCenter
from notifications.models import Notification, PushSubscription
from olympiads.models import Olympiad
from questions.models import Question

User = get_user_model()


class OlympiadCreateTestCase(APITestCase):
    """POST /api/olympiads/ — manager/owner draft tadbir yaratadi."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300001', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Olimp Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='2+2=?', options=['3', '4'], correct_answer=1, score=5,
        )
        self.client.force_authenticate(user=self.owner)

    def test_create_olympiad_as_draft(self):
        url = reverse('olympiads-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'title': 'Matematika Olimpiadasi',
            'subject': 'Matematika',
            'event_type': Olympiad.EVENT_TYPE_COMPETITION,
            'duration_minutes': 60,
            'question_ids': [self.question.id],
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        olympiad = Olympiad.objects.get(title='Matematika Olimpiadasi')
        self.assertEqual(olympiad.status, Olympiad.STATUS_DRAFT)
        self.assertEqual(olympiad.center_id, self.center.id)
        self.assertIn(self.question, olympiad.questions.all())

    def test_outsider_cannot_create_olympiad(self):
        outsider = User.objects.create_user(
            phone='+998901300002', password='StrongPass123', full_name='Begona',
        )
        self.client.force_authenticate(user=outsider)
        url = reverse('olympiads-list-create')
        response = self.client.post(url, {
            'center': self.center.id,
            'title': 'Ruxsatsiz',
            'subject': 'Matematika',
            'duration_minutes': 60,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class OlympiadExamFormatDetectionTestCase(APITestCase):
    """IELTS/CEFR fanida `exam_format` fan nomidan avtomatik aniqlanishi.

    `Olympiad.save()` fan nomini `.strip().capitalize()` bilan normalize
    qiladi — bazada "IELTS Mock" emas, "Ielts mock" yotadi. Serializer
    aniq satr bo'yicha solishtirganda `subject` qayta yuborilmaydigan PATCH
    (masalan faqat `duration_minutes`) instance'dagi normalize qilingan
    nomni o'qib, hech qachon mos kelmasdi va `exam_format` o'z-o'zini
    tuzatolmay qolardi.
    """

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300020', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='IELTS Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.client.force_authenticate(user=self.owner)

    def test_create_detects_format_from_subject(self):
        response = self.client.post(reverse('olympiads-list-create'), {
            'center': self.center.id,
            'title': 'IELTS Mock Test',
            'subject': 'IELTS Mock',
            'duration_minutes': 60,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        olympiad = Olympiad.objects.get(title='IELTS Mock Test')
        self.assertEqual(olympiad.exam_format, Olympiad.EXAM_FORMAT_IELTS)
        self.assertEqual(olympiad.test_level, 'Standard')
        # Fan nomi saqlashda normalize qilinadi — solishtirish shu shaklga ham
        # bardosh berishi kerak.
        self.assertEqual(olympiad.subject, 'Ielts mock')

    def test_patch_without_subject_still_detects_format(self):
        olympiad = Olympiad.objects.create(
            center=self.center,
            title='Eski IELTS yozuvi',
            subject='IELTS Mock',
            duration_minutes=60,
            start_datetime=timezone.now() + timezone.timedelta(days=1),
        )
        # Eski yozuv: `exam_format` standart bo'lib qolgan
        self.assertEqual(olympiad.exam_format, Olympiad.EXAM_FORMAT_STANDARD)

        response = self.client.patch(
            reverse('olympiad-detail', args=[olympiad.id]),
            {'duration_minutes': 90},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        olympiad.refresh_from_db()
        self.assertEqual(olympiad.duration_minutes, 90)
        self.assertEqual(olympiad.exam_format, Olympiad.EXAM_FORMAT_IELTS)

    def test_patch_without_subject_detects_cefr_format(self):
        olympiad = Olympiad.objects.create(
            center=self.center,
            title='Eski CEFR yozuvi',
            subject='CEFR Mock',
            duration_minutes=60,
            start_datetime=timezone.now() + timezone.timedelta(days=1),
        )
        response = self.client.patch(
            reverse('olympiad-detail', args=[olympiad.id]),
            {'duration_minutes': 75},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        olympiad.refresh_from_db()
        self.assertEqual(olympiad.exam_format, Olympiad.EXAM_FORMAT_CEFR)
        self.assertEqual(olympiad.test_level, 'Multi-level')


class OlympiadStatusFlowTestCase(APITestCase):
    """Olimpiada holati: draft -> active (publish) -> finished (finish)."""

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300003', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Status Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Fizika',
            text='Yer tortishish tezlanishi?', options=['9.8', '10', '11'],
            correct_answer=0, score=5,
        )
        # event_readiness_errors o'tishi uchun: kelajakdagi start_datetime,
        # davomiylik va kamida bitta savol kerak.
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Fizika Tadbiri',
            subject='Fizika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_DRAFT,
            start_datetime=timezone.now() + timezone.timedelta(hours=1),
            duration_minutes=60,
        )
        self.olympiad.questions.add(self.question)
        self.client.force_authenticate(user=self.owner)

    def test_publish_draft_to_active(self):
        url = reverse('olympiad-publish', args=[self.olympiad.id])
        with patch('notifications.services.send_olympiad_published_bulk'):
            response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_ACTIVE)

    def test_publish_not_ready_returns_errors(self):
        """Savolsiz / sanasiz draftni nashr qilib bo'lmaydi."""
        bare = Olympiad.objects.create(
            center=self.center, title='', subject='',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_DRAFT, duration_minutes=60,
        )
        url = reverse('olympiad-publish', args=[bare.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('errors', response.data)
        bare.refresh_from_db()
        self.assertEqual(bare.status, Olympiad.STATUS_DRAFT)

    def test_finish_active_olympiad(self):
        self.olympiad.status = Olympiad.STATUS_ACTIVE
        self.olympiad.save(update_fields=['status'])
        url = reverse('olympiad-finish', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_FINISHED)

    def test_cannot_finish_draft(self):
        url = reverse('olympiad-finish', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_DRAFT)

    def test_deactivate_active_to_inactive(self):
        self.olympiad.status = Olympiad.STATUS_ACTIVE
        self.olympiad.save(update_fields=['status'])
        url = reverse('olympiad-deactivate', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_INACTIVE)


class OlympiadParticipationTestCase(APITestCase):
    """GET /api/olympiads/{id}/questions/ — o'quvchining olimpiadaga kirishi.

    Bu endpoint o'quvchini olimpiadaga "ro'yxatdan o'tkazadi": ruxsatni
    tekshiradi va test sessiyasini yaratadi.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Part Markaz', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Matematika',
            text='3*3=?', options=['6', '9', '12'], correct_answer=1, score=5,
        )
        # Allaqachon boshlangan (start o'tgan), hali tugamagan faol olimpiada.
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Faol Olimpiada',
            subject='Matematika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_ACTIVE,
            start_datetime=timezone.now() - timezone.timedelta(minutes=5),
            duration_minutes=60,
        )
        self.olympiad.questions.add(self.question)

        self.student = User.objects.create_user(
            phone='+998901300010', password='StrongPass123', full_name="O'quvchi",
        )
        CenterMembership.objects.create(
            user=self.student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )

    def test_approved_student_can_enter(self):
        self.client.force_authenticate(user=self.student)
        url = reverse('olympiad-questions', args=[self.olympiad.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['questions']), 1)

    def test_non_member_cannot_enter_competition(self):
        outsider = User.objects.create_user(
            phone='+998901300011', password='StrongPass123', full_name='Begona',
        )
        self.client.force_authenticate(user=outsider)
        url = reverse('olympiad-questions', args=[self.olympiad.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class OlympiadReminderTestCase(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300020', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Reminder Center', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.student = User.objects.create_user(
            phone='+998901300021', password='StrongPass123', full_name="Student",
        )
        CenterMembership.objects.create(
            user=self.student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )
        # Rejalashtirilgan olimpiada — 4 daqiqa qoldi
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Tezkor Musobaqa',
            subject='Informatika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_ACTIVE,
            start_datetime=timezone.now() + timezone.timedelta(minutes=4),
            duration_minutes=60,
            start_reminder_sent=False
        )

    @patch('notifications.services.send_web_push_to_user')
    @patch('notifications.services._send_telegram_to_user')
    def test_reminder_sent_within_timeframe(self, mock_telegram, mock_push):
        from olympiads.tasks import send_starting_soon_reminders
        result = send_starting_soon_reminders()
        self.assertIn("1 ta olimpiada uchun eslatma yuborildi", result)

        self.olympiad.refresh_from_db()
        self.assertTrue(self.olympiad.start_reminder_sent)
        mock_telegram.assert_called_once()
        mock_push.assert_called_once()

        # Keyingi chaqiriqda takroran yuborilmasligi kerak
        result_again = send_starting_soon_reminders()
        self.assertIn("0 ta olimpiada uchun eslatma yuborildi", result_again)


class OlympiadPublishFanOutTestCase(APITestCase):
    """Nashr qilish so'rovi ichida sinxron push fan-out bo'lmasligi kerak.

    Yuzlab studentli markazda `send_olympiad_published_bulk` ni to'g'ridan
    chaqirish manager'ning HTTP so'rovini yuzlab ketma-ket tarmoq chaqiruvi
    davomida ushlab turardi.
    """

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300030', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Fan-out Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.question = Question.objects.create(
            center=self.center, subject='Kimyo', text='H2O nima?',
            options=['Suv', 'Tuz'], correct_answer=0, score=5,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Kimyo Olimpiadasi',
            subject='Kimyo',
            event_type=Olympiad.EVENT_TYPE_OLYMPIAD,
            status=Olympiad.STATUS_DRAFT,
            start_datetime=timezone.now() + timezone.timedelta(hours=2),
            duration_minutes=60,
        )
        self.olympiad.questions.add(self.question)

        self.students = []
        for index in range(3):
            student = User.objects.create_user(
                phone=f'+99890130004{index}', password='StrongPass123',
                full_name=f'Student {index}',
            )
            CenterMembership.objects.create(
                user=student, center=self.center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_APPROVED,
            )
            self.students.append(student)

        # Tasdiqlanmagan o'quvchi va o'qituvchi — fan-out ro'yxatiga kirmasin.
        pending = User.objects.create_user(
            phone='+998901300050', password='StrongPass123', full_name='Pending',
        )
        CenterMembership.objects.create(
            user=pending, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_PENDING,
        )
        teacher = User.objects.create_user(
            phone='+998901300051', password='StrongPass123', full_name='Teacher',
        )
        CenterMembership.objects.create(
            user=teacher, center=self.center,
            role=CenterMembership.ROLE_TEACHER,
            status=CenterMembership.STATUS_APPROVED,
        )

        self.client.force_authenticate(user=self.owner)

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    @patch('notifications.services._send_telegram_to_user')
    @patch('olympiads.tasks.send_olympiad_published_notifications_task.delay')
    def test_publish_enqueues_task_without_blocking_the_request(
        self, mock_delay, mock_telegram, mock_webpush,
    ):
        # Endpoint host'i haqiqiy push xizmatiga tegishli bo'lishi shart —
        # `send_web_push` allowlist'dan o'tmagan manzilga yubormaydi
        # (SSRF himoyasi, notifications.validators).
        for student in self.students:
            PushSubscription.objects.create(
                user=student, endpoint=f'https://fcm.googleapis.com/fcm/send/{student.id}',
                p256dh='fake_p256dh', auth='fake_auth',
            )

        url = reverse('olympiad-publish', args=[self.olympiad.id])
        response = self.client.post(url, {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_ACTIVE)

        mock_delay.assert_called_once()
        student_ids, olympiad_id, center_id = mock_delay.call_args.args
        self.assertEqual(sorted(student_ids), sorted(s.id for s in self.students))
        self.assertEqual(olympiad_id, self.olympiad.id)
        self.assertEqual(center_id, self.center.id)
        # Celery chegarasidan faqat JSON-seriyalanadigan ID'lar o'tadi.
        json.dumps([student_ids, olympiad_id, center_id])

        # So'rov ichida hech qanday bloklovchi yuborish yoki DB fan-out yo'q.
        mock_webpush.assert_not_called()
        mock_telegram.assert_not_called()
        self.assertEqual(Notification.objects.count(), 0)

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    def test_task_creates_notifications_and_pushes(self, mock_webpush):
        """Task'ning o'zi (`.delay` orqali emas) eski xulqni saqlab qoladi."""
        from olympiads.tasks import send_olympiad_published_notifications_task

        # Endpoint host'i haqiqiy push xizmatiga tegishli bo'lishi shart —
        # `send_web_push` allowlist'dan o'tmagan manzilga yubormaydi
        # (SSRF himoyasi, notifications.validators).
        for student in self.students:
            PushSubscription.objects.create(
                user=student, endpoint=f'https://fcm.googleapis.com/fcm/send/{student.id}',
                p256dh='fake_p256dh', auth='fake_auth',
            )

        send_olympiad_published_notifications_task(
            [s.id for s in self.students], self.olympiad.id, self.center.id,
        )

        notifications = Notification.objects.filter(
            type=Notification.TYPE_OLYMPIAD_PUBLISHED,
        )
        self.assertEqual(notifications.count(), len(self.students))
        self.assertEqual(
            sorted(notifications.values_list('user_id', flat=True)),
            sorted(s.id for s in self.students),
        )
        self.assertEqual(notifications.first().title, 'Yangi olimpiada')
        self.assertEqual(mock_webpush.call_count, len(self.students))


class StartingSoonReminderBatchTestCase(APITestCase):
    """Beat task o'zi arzon bo'lishi kerak: 1 ta bulk INSERT + N ta enqueue.

    Celery worker concurrency=1 — bitta ommabop olimpiadaning eslatma fan-out'i
    sinxron bo'lsa butun navbatni (OTP yetkazish va h.k.) ushlab qoladi.
    """

    STUDENT_COUNT = 25

    def setUp(self):
        self.owner = User.objects.create_user(
            phone='+998901300060', password='StrongPass123', full_name='Owner',
        )
        self.center = EducationCenter.objects.create(
            name='Batch Markaz', city='Toshkent', owner=self.owner,
            status=EducationCenter.STATUS_APPROVED,
        )
        self.students = []
        for index in range(self.STUDENT_COUNT):
            student = User.objects.create_user(
                phone=f'+9989013001{index:02d}', password='StrongPass123',
                full_name=f'Student {index}',
            )
            CenterMembership.objects.create(
                user=student, center=self.center,
                role=CenterMembership.ROLE_STUDENT,
                status=CenterMembership.STATUS_APPROVED,
            )
            self.students.append(student)

        # Tasdiqlanmagan o'quvchi eslatma olmasligi kerak.
        self.pending_student = User.objects.create_user(
            phone='+998901300199', password='StrongPass123', full_name='Pending',
        )
        CenterMembership.objects.create(
            user=self.pending_student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_PENDING,
        )

        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Ommabop Musobaqa',
            subject='Informatika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_ACTIVE,
            start_datetime=timezone.now() + timezone.timedelta(minutes=4),
            duration_minutes=60,
            start_reminder_sent=False,
        )

    @patch('notifications.services.send_web_push_to_user')
    @patch('notifications.services._send_telegram_to_user')
    @patch('olympiads.tasks.send_reminder_to_student_task.delay')
    def test_beat_task_batches_inserts_and_defers_sends(
        self, mock_delay, mock_telegram, mock_push,
    ):
        from olympiads.tasks import send_starting_soon_reminders

        with CaptureQueriesContext(connection) as queries:
            result = send_starting_soon_reminders()

        self.assertIn('1 ta olimpiada uchun eslatma yuborildi', result)

        # (a) Notification yozuvlari — N ta alohida INSERT emas, bitta bulk.
        notification_inserts = [
            query['sql'] for query in queries.captured_queries
            if 'INSERT INTO "notifications_notification"' in query['sql']
        ]
        self.assertEqual(len(notification_inserts), 1)
        self.assertEqual(
            Notification.objects.filter(
                type=Notification.TYPE_OLYMPIAD_PUBLISHED,
            ).count(),
            self.STUDENT_COUNT,
        )
        self.assertFalse(
            Notification.objects.filter(user=self.pending_student).exists(),
        )

        # (b) Har bir o'quvchi uchun bitta arzon enqueue, to'g'ri argumentlar.
        self.assertEqual(mock_delay.call_count, self.STUDENT_COUNT)
        notification = Notification.objects.first()
        self.assertEqual(
            sorted(call.args[0] for call in mock_delay.call_args_list),
            sorted(s.id for s in self.students),
        )
        for call in mock_delay.call_args_list:
            self.assertEqual(call.args[1], notification.title)
            self.assertEqual(call.args[2], notification.message)
        self.assertEqual(notification.title, 'Musobaqa boshlanmoqda!')
        self.assertIn('5 daqiqadan so\'ng', notification.message)

        # (c) Bloklovchi yuborishlar beat task ichida umuman bo'lmaydi.
        mock_telegram.assert_not_called()
        mock_push.assert_not_called()

        # Flag har doim o'rnatiladi — partiya takror yuborilmaydi.
        self.olympiad.refresh_from_db()
        self.assertTrue(self.olympiad.start_reminder_sent)
        self.assertIn(
            '0 ta olimpiada uchun eslatma yuborildi',
            send_starting_soon_reminders(),
        )

    @override_settings(VAPID_PRIVATE_KEY='test-vapid-private-key-not-for-prod')
    @patch('pywebpush.webpush')
    @patch('notifications.services._send_telegram_to_user')
    def test_per_student_task_sends_telegram_and_push(
        self, mock_telegram, mock_webpush,
    ):
        """Ajratilgan task haqiqiy yuborishni bajaradi (endi worker ichida)."""
        from olympiads.tasks import send_reminder_to_student_task

        student = self.students[0]
        # Allowlist'dagi haqiqiy push host — notifications.validators.
        PushSubscription.objects.create(
            user=student, endpoint='https://fcm.googleapis.com/fcm/send/reminder',
            p256dh='fake_p256dh', auth='fake_auth',
        )

        send_reminder_to_student_task(student.id, 'Sarlavha', 'Matn')

        mock_telegram.assert_called_once_with(student, 'Matn')
        mock_webpush.assert_called_once()
        _, kwargs = mock_webpush.call_args
        self.assertIn('/student', kwargs['data'])



class FlagOlympiadTestCase(APITestCase):
    """POST /api/olympiads/<id>/flag/ — tadbirni admin tekshiruviga qo'yish.

    `questions.tests` dagi savol bayrog'i testlarining tadbir uchun nusxasi:
    bayroq chora KO'RMAYDI, takrorlanmaydi va faqat markaz xodimiga ochiq.
    """

    def setUp(self):
        self.center = EducationCenter.objects.create(
            name='Bayroq Markaz', city='Toshkent',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.other_center = EducationCenter.objects.create(
            name='Begona Markaz', city='Samarqand',
            status=EducationCenter.STATUS_APPROVED,
        )
        self.author = User.objects.create_user(
            phone='+998901670001', password='StrongPass123', full_name='Muallif',
        )
        # Tadbir muallifi EMAS — bayroqni hamkasb ham qo'ya oladi.
        self.colleague = User.objects.create_user(
            phone='+998901670002', password='StrongPass123', full_name='Hamkasb',
        )
        self.other_teacher = User.objects.create_user(
            phone='+998901670003', password='StrongPass123', full_name='Begona ustoz',
        )
        self.student = User.objects.create_user(
            phone='+998901670004', password='StrongPass123', full_name='Talaba',
        )
        for user, center in [
            (self.author, self.center),
            (self.colleague, self.center),
            (self.other_teacher, self.other_center),
        ]:
            CenterMembership.objects.create(
                user=user, center=center,
                role=CenterMembership.ROLE_TEACHER,
                status=CenterMembership.STATUS_APPROVED,
            )
        CenterMembership.objects.create(
            user=self.student, center=self.center,
            role=CenterMembership.ROLE_STUDENT,
            status=CenterMembership.STATUS_APPROVED,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Fizika Tadbiri',
            subject='Fizika',
            event_type=Olympiad.EVENT_TYPE_COMPETITION,
            status=Olympiad.STATUS_ACTIVE,
            start_datetime=timezone.now() + timezone.timedelta(hours=1),
            duration_minutes=60,
            created_by=self.author,
        )
        self.url = reverse('olympiad-flag', args=[self.olympiad.id])

    def _flag(self, user, reason='Sarlavha nomaqbul'):
        self.client.force_authenticate(user=user)
        return self.client.post(self.url, {'reason': reason}, format='json')

    def test_colleague_flags_olympiad_with_snapshot(self):
        from moderation.models import ModerationFlag

        resp = self._flag(self.colleague)

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data['created'])
        flag = ModerationFlag.objects.get(pk=resp.data['flag_id'])
        self.assertEqual(flag.flag_type, ModerationFlag.FLAG_TYPE_OLYMPIAD)
        self.assertEqual(flag.status, ModerationFlag.STATUS_PENDING)
        self.assertEqual(flag.target_type, 'Olympiad')
        self.assertEqual(flag.target_id, self.olympiad.id)
        self.assertEqual(flag.raised_by, self.colleague)
        self.assertEqual(flag.reason, 'Sarlavha nomaqbul')
        # Dalil nusxasi: tadbir keyin tahrirlansa ham bayroqda asl holat qoladi.
        self.assertEqual(flag.extra['olympiad_id'], self.olympiad.id)
        self.assertEqual(flag.extra['title'], 'Fizika Tadbiri')
        self.assertEqual(flag.extra['subject'], 'Fizika')
        self.assertEqual(flag.extra['status'], Olympiad.STATUS_ACTIVE)
        self.assertEqual(flag.extra['created_by'], 'Muallif')

    def test_flagging_does_not_hide_olympiad(self):
        """Bayroq tadbirni to'xtatmaydi — ketayotgan imtihon buzilmasin."""
        self._flag(self.colleague)
        self.olympiad.refresh_from_db()
        self.assertEqual(self.olympiad.status, Olympiad.STATUS_ACTIVE)
        self.assertFalse(self.olympiad.is_deleted)

    def test_second_flag_returns_existing_open_one(self):
        from moderation.models import ModerationFlag

        first = self._flag(self.author)
        second = self._flag(self.colleague, reason='Yana bir sabab')

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data['created'])
        self.assertEqual(second.data['flag_id'], first.data['flag_id'])
        self.assertEqual(ModerationFlag.objects.count(), 1)
        # Mavjud bayroq qayta yozilmaydi — birinchi sabab va muallif qoladi.
        flag = ModerationFlag.objects.get()
        self.assertEqual(flag.reason, 'Sarlavha nomaqbul')
        self.assertEqual(flag.raised_by, self.author)

    def test_closed_flag_does_not_block_new_one(self):
        from moderation.models import ModerationFlag

        self._flag(self.author)
        ModerationFlag.objects.update(status=ModerationFlag.STATUS_RESOLVED)

        resp = self._flag(self.colleague)

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ModerationFlag.objects.count(), 2)

    def test_question_flag_for_same_id_is_independent(self):
        """Takror tekshiruvi turni ham hisobga oladi, faqat ID'ni emas."""
        from moderation.models import ModerationFlag

        ModerationFlag.objects.create(
            flag_type=ModerationFlag.FLAG_TYPE_QUESTION,
            target_type='Question',
            target_id=self.olympiad.id,
            reason='Boshqa turdagi bayroq',
        )

        resp = self._flag(self.colleague)

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ModerationFlag.objects.count(), 2)

    def test_other_center_teacher_is_forbidden(self):
        from moderation.models import ModerationFlag

        resp = self._flag(self.other_teacher)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_student_is_forbidden(self):
        from moderation.models import ModerationFlag

        resp = self._flag(self.student)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_missing_reason_is_rejected(self):
        from moderation.models import ModerationFlag

        for value in ('', '   '):
            resp = self._flag(self.colleague, reason=value)
            self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ModerationFlag.objects.count(), 0)

    def test_unknown_olympiad_returns_404(self):
        self.client.force_authenticate(user=self.colleague)
        resp = self.client.post(
            reverse('olympiad-flag', args=[self.olympiad.id + 1000]),
            {'reason': 'Sabab'}, format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_is_denied(self):
        resp = self.client.post(self.url, {'reason': 'Sabab'}, format='json')
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
