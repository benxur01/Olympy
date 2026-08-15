import os
import sys
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'olympy_api.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import RequestFactory
from django.utils import timezone

from centers.models import EducationCenter, CenterMembership
from olympiads.models import Olympiad
from attempts.models import TestSession
from attempts.views import (
    test_session_ping,
    session_live_frame,
    session_proctor_signal,
)

User = get_user_model()

def run_tests():
    print("=== LIVE PROCTORING SYSTEM INTEGRATION TEST ===")
    
    # 1. Setup Test Users
    admin_user, _ = User.objects.get_or_create(
        phone="+998901112233",
        defaults={"first_name": "Platform", "last_name": "Admin", "is_platform_admin": True}
    )
    admin_user.is_platform_admin = True
    admin_user.save()

    director_user, _ = User.objects.get_or_create(
        phone="+998902223344",
        defaults={"first_name": "Center", "last_name": "Director"}
    )
    
    teacher_user, _ = User.objects.get_or_create(
        phone="+998903334455",
        defaults={"first_name": "Center", "last_name": "Teacher"}
    )

    unauthorized_user, _ = User.objects.get_or_create(
        phone="+998904445566",
        defaults={"first_name": "Random", "last_name": "User"}
    )

    student_user, _ = User.objects.get_or_create(
        phone="+998909998877",
        defaults={"first_name": "Test", "last_name": "Student"}
    )

    # 2. Setup Center & Memberships
    center, _ = EducationCenter.objects.get_or_create(
        name="Toshkent Test IT Akademiyasi",
        defaults={"owner": director_user, "status": EducationCenter.STATUS_APPROVED, "city": "Toshkent"}
    )
    center.owner = director_user
    center.status = EducationCenter.STATUS_APPROVED
    center.save()

    CenterMembership.objects.get_or_create(
        center=center, user=teacher_user,
        defaults={"role": "teacher", "status": "approved"}
    )

    # 3. Setup Olympiad & Test Session
    olympiad, _ = Olympiad.objects.get_or_create(
        title="Matematika Jonli Olimpiada 2026",
        defaults={
            "center": center,
            "subject": "Matematika",
            "start_datetime": timezone.now(),
            "duration_minutes": 60,
            "camera_proctoring_enabled": True,
            "voice_proctoring_enabled": True,
            "status": Olympiad.STATUS_ACTIVE,
        }
    )
    olympiad.center = center
    olympiad.camera_proctoring_enabled = True
    olympiad.voice_proctoring_enabled = True
    olympiad.status = Olympiad.STATUS_ACTIVE
    olympiad.save()

    session, _ = TestSession.objects.get_or_create(
        user=student_user,
        olympiad=olympiad,
        defaults={
            "status": TestSession.STATUS_ACTIVE,
            "camera_consent_given": True,
            "microphone_consent_given": True,
        }
    )
    session.status = TestSession.STATUS_ACTIVE
    session.camera_consent_given = True
    session.microphone_consent_given = True
    session.save()

    from rest_framework.test import APIRequestFactory, force_authenticate
    factory = APIRequestFactory()

    # Step A: Proctor views student -> Triggers GET /live-frame/
    # This automatically flags cache `proctor:stream_req:<session_id>` = True
    req_get = factory.get(f'/api/attempts/sessions/{session.id}/live-frame/')
    force_authenticate(req_get, user=director_user)
    resp_get = session_live_frame(req_get, session_id=session.id)
    assert resp_get.status_code == 200, f"Expected 200, got {resp_get.status_code}"
    
    # Step B: Student ping detects stream_requested = True
    req_ping = factory.post(
        '/api/attempts/ping/',
        data=json.dumps({
            "olympiad": olympiad.id,
            "answered_count": 5,
            "tab_escapes": 0
        }),
        content_type='application/json'
    )
    force_authenticate(req_ping, user=student_user)
    resp_ping = test_session_ping(req_ping)
    assert resp_ping.status_code == 200, f"Expected 200, got {resp_ping.status_code}"
    ping_data = resp_ping.data
    assert ping_data.get("stream_requested") is True, f"Expected stream_requested=True, got {ping_data.get('stream_requested')}"
    assert ping_data.get("session_id") == session.id, "Session ID mismatch in ping"
    print("✓ Proctor stream request flag and student ping detection verified")

    # Step C: Student uploads live frame snapshot + screen snapshot + audio + app switch telemetry
    fake_cam_frame = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD_CAM..."
    fake_screen_frame = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD_SCREEN..."
    req_frame = factory.post(
        f'/api/attempts/sessions/{session.id}/live-frame/',
        data=json.dumps({
            "frame": fake_cam_frame,
            "screen_frame": fake_screen_frame,
            "audio_level": 42.5,
            "face_detected": True,
            "speech_detected": True,
            "app_switched": True,
            "tab_escapes": 1,
            "is_in_background": True,
        }),
        content_type='application/json'
    )
    force_authenticate(req_frame, user=student_user)
    resp_frame = session_live_frame(req_frame, session_id=session.id)
    assert resp_frame.status_code == 200, f"Expected 200, got {resp_frame.status_code}"
    print("✓ Student live camera + live screen + app switch telemetry upload verified")

    # Step D: Admin, Director, and Teacher all receive both camera & screen streams and app switch alert
    for role_name, user_obj in [("Platform Admin", admin_user), ("Center Director", director_user), ("Center Teacher", teacher_user)]:
        req_view = factory.get(f'/api/attempts/sessions/{session.id}/live-frame/')
        force_authenticate(req_view, user=user_obj)
        resp_view = session_live_frame(req_view, session_id=session.id)
        assert resp_view.status_code == 200, f"Failed for {role_name}: {resp_view.status_code}"
        vdata = resp_view.data
        assert vdata.get("frame") == fake_cam_frame, f"Camera frame mismatch for {role_name}"
        assert vdata.get("screen_frame") == fake_screen_frame, f"Screen frame mismatch for {role_name}"
        assert vdata.get("app_switched") is True, f"App switched alert mismatch for {role_name}"
        assert vdata.get("tab_escapes") == 1, f"Tab escapes count mismatch for {role_name}"
        assert vdata.get("audio_level") == 42.5, f"Audio level mismatch for {role_name}"
        assert vdata.get("student_name") == "Test Student", f"Student name mismatch for {role_name}"
        print(f"✓ {role_name} successfully received dual camera + screen streams and app-switch alert")

    # Step E: Proctor sends real-time Warning signal to student
    req_sig = factory.post(
        f'/api/attempts/sessions/{session.id}/proctor-signal/',
        data=json.dumps({
            "action": "warning",
            "payload": {"message": "Nazoratchi: Kameraga qarang!"}
        }),
        content_type='application/json'
    )
    force_authenticate(req_sig, user=teacher_user)
    resp_sig = session_proctor_signal(req_sig, session_id=session.id)
    assert resp_sig.status_code == 200, f"Expected 200, got {resp_sig.status_code}"

    # Step F: Student reads proctor signal
    req_sig_get = factory.get(f'/api/attempts/sessions/{session.id}/proctor-signal/')
    force_authenticate(req_sig_get, user=student_user)
    resp_sig_get = session_proctor_signal(req_sig_get, session_id=session.id)
    assert resp_sig_get.status_code == 200
    sig_data = resp_sig_get.data
    assert sig_data.get("signal", {}).get("action") == "warning"
    assert sig_data.get("signal", {}).get("payload", {}).get("message") == "Nazoratchi: Kameraga qarang!"
    print("✓ Proctor warning signal dispatch and student reception verified")

    # Step G: Unauthorized access test (Random user cannot access student's camera stream)
    req_unauth = factory.get(f'/api/attempts/sessions/{session.id}/live-frame/')
    force_authenticate(req_unauth, user=unauthorized_user)
    resp_unauth = session_live_frame(req_unauth, session_id=session.id)
    assert resp_unauth.status_code == 403, f"Expected 403 Forbidden for unauthorized user, got {resp_unauth.status_code}"
    print("✓ Security permissions verified (Unauthorized users cannot spy on student streams)")

    print("\nALL LIVE PROCTORING TESTS PASSED 100% SUCCESSFULLY!")

if __name__ == "__main__":
    run_tests()
