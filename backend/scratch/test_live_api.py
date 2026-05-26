import urllib.request
import urllib.parse
import json

base_url = "https://olympy-api.onrender.com"

credentials = [
    {"role": "Direktor", "phone": "+998704750620", "password": "benxur0106"},
    {"role": "Manager", "phone": "+998935048509", "password": "sunnat777"},
    {"role": "O'quvchi", "phone": "+998951875327", "password": "safayev"},
    {"role": "Direktor 2", "phone": "+998990955636", "password": "safayev"}
]

def test_login(cred):
    url = f"{base_url}/api/auth/login/"
    payload = {
        "phone": cred["phone"],
        "password": cred["password"]
    }
    data = json.dumps(payload).encode("utf-8")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw_body = response.read()
            res_data = json.loads(raw_body.decode("utf-8"))
            print(f"[{cred['role']}] Kirish muvaffaqiyatli!")
            user = res_data.get('user', {})
            print(f"   Foydalanuvchi: {user.get('full_name') or user.get('username') or '—'}")
            print(f"   Rollar: {list(user.get('roles_detail', {}).keys())}")
            print(f"   Streak: {user.get('streak_count', 0)} kun")
            print(f"   Nishonlar: {[b.get('title') for b in user.get('badges', [])]}")
            print("-" * 50)
            return True
    except Exception as e:
        print(f"[{cred['role']}] Ulanish xatoligi: {e}")
        if hasattr(e, 'read'):
            try:
                raw_err = e.read()
                err_detail = json.loads(raw_err.decode("utf-8"))
                print(f"   Tafsilot: {err_detail}")
            except Exception:
                pass
        print("-" * 50)
        return False

def main():
    print("Olympy Live API test boshlanmoqda (olympy-api.onrender.com)...\n")
    for cred in credentials:
        test_login(cred)

if __name__ == "__main__":
    main()
