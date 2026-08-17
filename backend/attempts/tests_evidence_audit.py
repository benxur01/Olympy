"""Proktoring dalilini KIM ko'rgani audit jurnaliga tushishi.

`attempts/tests.py` dagi `EvidenceSnapshotTestCase` dalilning saqlanishi,
yopiqligi va retention'ini qamraydi; bu yerda esa faqat bitta savol: kadr
ochilganda iz qoladimi. Dalil kadri — o'quvchining yuzi, ya'ni
`admin_user_detail`/`admin_shared_ip_detail` bilan bir toifadagi ma'lumot,
shuning uchun bir xil action kodi (`admin_sensitive_data_view`) va
`extra.view` diskriminatori tekshiriladi.

Testlarning YARMI salbiy: 401/403/404 holatlarida yozuv YARATILMASLIGI kerak
— muvaffaqiyatsiz urinish "maxfiy ma'lumot ko'rildi" degani emas va jurnalni
shovqin bilan to'ldirsa, undagi har bir qatorning ma'nosi yo'qoladi.
"""
import os
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import AuditLog
from attempts.models import EvidenceSnapshot, TestSession
from centers.models import EducationCenter
from olympiads.models import Olympiad

User = get_user_model()

SENSITIVE_VIEW_ACTION = 'admin_sensitive_data_view'


class EvidenceViewAuditTestCase(APITestCase):
    """GET /api/attempts/admin/evidence/<id>/ — ko'rish fakti jurnalda."""

    CAMERA_BYTES = b'\xff\xd8\xff-camera-jpeg'
    SCREEN_BYTES = b'\xff\xd8\xff-screen-jpeg'

    def setUp(self):
        # Dalil fayllari vaqtinchalik katalogga yoziladi — haqiqiy
        # `EVIDENCE_MEDIA_ROOT` ga tegmasin (`EvidenceSnapshotTestCase` dagi
        # bilan bir xil qoida).
        self.evidence_dir = tempfile.mkdtemp(prefix='olympy-evidence-audit-')
        overridden = override_settings(EVIDENCE_MEDIA_ROOT=self.evidence_dir)
        overridden.enable()
        self.addCleanup(overridden.disable)
        self.addCleanup(shutil.rmtree, self.evidence_dir, ignore_errors=True)

        self.student = User.objects.create_user(
            phone='+998901238001', password='StrongPass123', full_name="O'quvchi",
        )
        self.admin = User.objects.create_user(
            phone='+998901238002', password='StrongPass123', full_name='Admin',
        )
        self.admin.is_platform_admin = True
        self.admin.save(update_fields=['is_platform_admin'])
        self.owner = User.objects.create_user(
            phone='+998901238003', password='StrongPass123', full_name='Markaz egasi',
        )
        self.center = EducationCenter.objects.create(
            name='ProSkill', city='Toshkent', owner=self.owner,
        )
        self.olympiad = Olympiad.objects.create(
            center=self.center,
            title='Matematika Olimpiadasi',
            subject='Matematika',
            status=Olympiad.STATUS_ACTIVE,
            duration_minutes=60,
        )
        self.session = TestSession.objects.create(
            user=self.student,
            olympiad=self.olympiad,
            status=TestSession.STATUS_DISQUALIFIED,
        )
        self.snapshot = EvidenceSnapshot.objects.create(
            session=self.session, trigger=EvidenceSnapshot.TRIGGER_DISQUALIFIED,
        )
        self.snapshot.image.save(
            'camera.jpg', ContentFile(self.CAMERA_BYTES), save=True,
        )

    def _download(self, params=None, snapshot_id=None):
        return self.client.get(
            reverse('admin-evidence-image', args=[snapshot_id or self.snapshot.id]),
            params or {},
        )

    def _logs(self):
        return AuditLog.objects.filter(action=SENSITIVE_VIEW_ACTION)

    # --- ko'rildi: yozuv bor ------------------------------------------------

    def test_view_writes_audit_log_bound_to_the_student(self):
        self.client.force_authenticate(user=self.admin)

        response = self._download()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = self._logs().get()
        self.assertEqual(log.actor_id, self.admin.id)
        # Nishon — KADRDAGI o'quvchi: jurnal `target_type='User'` bo'yicha
        # o'qiladi ("Batafsil" oynasidagi amallar tarixi).
        self.assertEqual(log.target_type, 'User')
        self.assertEqual(log.target_id, self.student.id)
        self.assertEqual(log.extra['view'], 'evidence_image')
        self.assertEqual(log.extra['kind'], 'camera')
        self.assertEqual(log.extra['session_id'], self.session.id)
        self.assertEqual(log.extra['snapshot_id'], self.snapshot.id)
        # Yorliq mavjud action kodidan keladi (xom kod emas).
        self.assertEqual(log.get_action_display(), "Maxfiy ma'lumot ko'rildi")

    def test_each_frame_kind_is_recorded_separately(self):
        """Kamera va ekran kadri — ikki alohida ko'rish fakti."""
        self.snapshot.screen_image.save(
            'screen.jpg', ContentFile(self.SCREEN_BYTES), save=True,
        )
        self.client.force_authenticate(user=self.admin)

        self.assertEqual(self._download().status_code, status.HTTP_200_OK)
        self.assertEqual(
            self._download({'kind': 'screen'}).status_code, status.HTTP_200_OK,
        )

        self.assertEqual(
            [log.extra['kind'] for log in self._logs().order_by('id')],
            ['camera', 'screen'],
        )

    # --- ko'rilmadi: yozuv YO'Q ---------------------------------------------

    def test_forbidden_request_writes_no_log(self):
        """O'quvchining o'zi ham, markaz egasi ham dalilni ko'ra olmaydi."""
        for user in (self.student, self.owner):
            self.client.force_authenticate(user=user)
            self.assertEqual(
                self._download().status_code, status.HTTP_403_FORBIDDEN,
                msg=f'{user.full_name} uchun 403 kutilgan',
            )

        self.assertFalse(self._logs().exists())

    def test_unauthenticated_request_writes_no_log(self):
        self.client.force_authenticate(user=None)

        self.assertEqual(self._download().status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(self._logs().exists())

    def test_missing_snapshot_writes_no_log(self):
        self.client.force_authenticate(user=self.admin)

        self.assertEqual(
            self._download(snapshot_id=self.snapshot.id + 1000).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertFalse(self._logs().exists())

    def test_missing_frame_or_unknown_kind_writes_no_log(self):
        """Ekran kadri saqlanmagan yoki `kind` noma'lum — 404, iz yo'q."""
        self.client.force_authenticate(user=self.admin)

        self.assertEqual(
            self._download({'kind': 'screen'}).status_code, status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self._download({'kind': 'nomalum'}).status_code, status.HTTP_404_NOT_FOUND,
        )
        self.assertFalse(self._logs().exists())

    def test_file_lost_from_disk_writes_no_log(self):
        """DB qatori bor, fayl yo'q (retention/disk nosozligi) — 404, iz yo'q."""
        os.remove(self.snapshot.image.path)
        self.client.force_authenticate(user=self.admin)

        self.assertEqual(self._download().status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(self._logs().exists())
