import urllib.request
import urllib.parse
import json
import time

base_url = "https://olympy-api.onrender.com"

student_phone = "+998951875327"
student_pass = "safayev"

parent_phone = "+998704750620"
parent_pass = "benxur0106"

def get_auth_token(phone, password):
    url = f"{base_url}/api/auth/login/"
    payload = {"phone": phone, "password": password}
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            return res_data.get("token"), res_data.get("user", {}).get("id")
    except Exception as e:
        print(f"Login failed for {phone}: {e}")
        return None, None

def make_request(path, method="GET", body=None, token=None):
    url = f"{base_url}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
        
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            content_type = res.headers.get("Content-Type", "")
            raw = res.read()
            if "application/json" in content_type:
                return res.status, json.loads(raw.decode("utf-8")), res.headers
            return res.status, raw, res.headers
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode("utf-8"))
        except Exception:
            err = e.reason
        return e.code, err, e.headers
    except Exception as e:
        return 0, str(e), {}

def test_integration():
    print("1. O'quvchi profilini va nishonlarini tekshirish...")
    stu_token, stu_id = get_auth_token(student_phone, student_pass)
    if not stu_token:
        print("Xatolik: Student login qilolmadi.")
        return
        
    status, user_data, _ = make_request("/api/me/", token=stu_token)
    if status == 200:
        print(f"   Student ID: {stu_id}")
        print(f"   Ketma-ketlik (Streak): {user_data.get('streak_count', 0)} kun")
        print(f"   Erishilgan Nishonlar: {user_data.get('badges', [])}")
    else:
        print(f"   Xatolik: {user_data}")
        return

    print("\n2. Activity Leaderboard (Reyting) endpointini tekshirish...")
    status, leaderboard, _ = make_request("/api/me/activity-leaderboard/", token=stu_token)
    if status == 200:
        print(f"   Leaderboard yuklandi! Jami faol: {len(leaderboard)} ta o'quvchi.")
        for entry in leaderboard[:3]:
            print(f"      #{entry['rank']} {entry['name']} (Streak: {entry['streak_count']} kun, Nishonlar: {[b['title'] for b in entry['badges']]})")
    elif status == 404:
        print("   Xatolik: Endpoint topilmadi (404). Loyiha hali live serverga to'liq deploy bo'lmoqda shekilli.")
        return
    else:
        print(f"   Xatolik {status}: {leaderboard}")
        return

    print("\n3. Ota-ona (Direktor akkaunti) orqali bolani bog'lash...")
    parent_token, _ = get_auth_token(parent_phone, parent_pass)
    if not parent_token:
        print("Xatolik: Parent login qilolmadi.")
        return

    # Link child
    status, link_res, _ = make_request("/api/me/parent/link/", method="POST", body={"student_phone": student_phone}, token=parent_token)
    if status in (200, 201):
        print("   Farzand muvaffaqiyatli bog'landi!")
    else:
        print(f"   Bog'lashda xato (kutilyapti: allaqachon bog'langan bo'lsa 400): {link_res}")

    print("\n4. Ota-ona bolalar ro'yxatini olish (nishonlarni tekshirish)...")
    status, children_list, _ = make_request("/api/me/parent/children/", token=parent_token)
    if status == 200:
        child = next((c for c in children_list if c["student_id"] == stu_id), None)
        if child:
            print(f"   Farzand topildi: {child['full_name']}")
            print(f"   Farzand nishonlari: {child.get('badges', [])}")
        else:
            print("   Xatolik: Farzand ro'yxatda chiqmayapti.")
    else:
        print(f"   Ro'yxat olishda xato: {children_list}")

    print("\n5. Ota-ona uchun PDF hisobot generatsiyasini yuklab olish...")
    report_path = f"/api/me/parent/children/{stu_id}/report/"
    status, pdf_data, headers = make_request(report_path, token=parent_token)
    if status == 200:
        print(f"   Hisobot muvaffaqiyatli yuklandi!")
        print(f"   Fayl hajmi: {len(pdf_data)} bytes")
        print(f"   Content-Type: {headers.get('Content-Type')}")
        print(f"   Content-Disposition: {headers.get('Content-Disposition')}")
    else:
        print(f"   Hisobot yuklashda xato {status}: {pdf_data}")

    print("\n6. Akkauntlarni tozalash (Bolani qaytadan olib tashlash)...")
    unlink_path = f"/api/me/parent/link/{stu_id}/"
    status, unlink_res, _ = make_request(unlink_path, method="DELETE", token=parent_token)
    if status == 204:
        print("   Tozalash muvaffaqiyatli: Farzand qayta olib tashlandi.")
    else:
        print(f"   Tozalashda xato: {unlink_res}")

def main():
    print("Live Yangi Imkoniyatlarni E2E Integratsion Test Qilish...\n")
    test_integration()

if __name__ == "__main__":
    main()
