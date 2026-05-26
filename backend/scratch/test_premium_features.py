import os
import sys

# Setup Django environment
sys.path.append('/home/benxur/Downloads/Olympy/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'olympy_api.settings')

import django
django.setup()

from django.db import transaction
from accounts.models import User, RewardProduct, RewardRedemption, ParentStudentLink
from accounts.utils import predict_success_ai
from questions.ai_generation import explain_mistakes_ai
from notifications.services import send_telegram_markdown

def test_user_coins_and_rewards():
    print("=== Test 1: User Coins and Rewards ===")
    
    # Try to find the student user from the database
    student_phone = '+998951875327'
    student = User.objects.filter(phone=student_phone).first()
    if not student:
        # Fallback by loading all users and checking roles list in Python
        for u in User.objects.all():
            if 'student' in (u.roles or []):
                student = u
                break
        if not student:
            # Fallback to first user
            student = User.objects.first()
            if not student:
                student = User.objects.create_user(
                    phone=student_phone,
                    full_name='Test Student',
                    password='password123'
                )
                student.roles = ['student']
                student.save()
                print(f"Created temporary student user: {student.phone}")
            else:
                print(f"Found fallback user: {student.phone} (ID: {student.id})")
        else:
            print(f"Found student user: {student.phone} (ID: {student.id})")
    else:
        print(f"Found student user by phone: {student.phone} (ID: {student.id})")
        
    initial_coins = student.coins
    print(f"Initial coins: {initial_coins}")
    
    # Award coins
    student.coins += 50
    student.save()
    student.refresh_from_db()
    print(f"Coins after awarding 50: {student.coins}")
    assert student.coins == initial_coins + 50, "Coins not credited correctly"
    
    # Create a dummy reward product
    product = RewardProduct.objects.create(
        title="Test Book",
        description="A book for testing rewards",
        coin_cost=30,
        stock=5
    )
    print(f"Created reward product: '{product.title}' costing {product.coin_cost} coins")
    
    # Redeem reward
    try:
        with transaction.atomic():
            # Check user coins
            if student.coins < product.coin_cost:
                print("Insufficient coins, adding more to test...")
                student.coins += product.coin_cost
                student.save()
            
            student.coins -= product.coin_cost
            student.save()
            
            product.stock -= 1
            product.save()
            
            redemption = RewardRedemption.objects.create(
                user=student,
                product=product,
                status=RewardRedemption.STATUS_PENDING
            )
            print(f"Successfully redeemed product. Redemption ID: {redemption.id}")
            print(f"User remaining coins: {student.coins}")
            print(f"Product remaining stock: {product.stock}")
            
            assert product.stock == 4, "Stock did not decrement"
            assert redemption.status == 'pending', "Status is not pending"
    finally:
        # Clean up
        product.delete()
        print("Cleaned up reward product and associated redemptions.")

def test_mistakes_ai_explanation():
    print("\n=== Test 2: Mistakes AI Explanation ===")
    # Mock some mistakes
    mock_mistakes = [
        {
            "question_text": "Agar 2x - 4 = 10 bo'lsa, x nechaga teng?",
            "options": ["5", "7", "10", "14"],
            "correct_option_idx": 1,
            "selected_option_idx": 0,
            "subject": "Matematika"
        },
        {
            "question_text": "Qaysi so'z to'g'ri yozilgan?",
            "options": ["sentabr", "sentyabr", "sintebr", "sentiyabr"],
            "correct_option_idx": 0,
            "selected_option_idx": 1,
            "subject": "O'zbek tili"
        }
    ]
    
    print("Generating AI explanation for mock mistakes...")
    explanation = explain_mistakes_ai(mock_mistakes)
    print("--------------------------------------------------")
    print(explanation)
    print("--------------------------------------------------")
    assert len(explanation) > 0, "AI explanation should not be empty"

def test_ai_success_predictor():
    print("\n=== Test 3: AI Success Predictor ===")
    student_phone = '+998951875327'
    student = User.objects.filter(phone=student_phone).first()
    if not student:
        for u in User.objects.all():
            if 'student' in (u.roles or []):
                student = u
                break
        if not student:
            student = User.objects.first()
            
    if not student:
        print("No student found, testing raw predict_success_ai function directly...")
        analysis = predict_success_ai("Test Student", 76.5, 8, {"Matematika": 82.0, "Fizika": 67.3})
        print("--------------------------------------------------")
        print(analysis)
        print("--------------------------------------------------")
        assert len(analysis) > 0, "AI analysis should not be empty"
    else:
        from accounts.views import calculate_predictions_for_user
        print(f"Calculating predictions for user: {student.phone}...")
        res = calculate_predictions_for_user(student)
        print("--------------------------------------------------")
        import json
        print(json.dumps(res, indent=2, ensure_ascii=False))
        print("--------------------------------------------------")
        assert "predictions" in res, "Should contain predictions key"
        assert "ai_analysis" in res, "Should contain ai_analysis key"

def test_telegram_weekly_digest_toggle():
    print("\n=== Test 4: Telegram Weekly Digest Toggle ===")
    # Find any parent-student link
    link = ParentStudentLink.objects.first()
    if link:
        initial_status = link.weekly_digest_enabled
        print(f"Initial weekly digest status: {initial_status}")
        link.weekly_digest_enabled = not initial_status
        link.save()
        link.refresh_from_db()
        print(f"Toggled weekly digest status: {link.weekly_digest_enabled}")
        assert link.weekly_digest_enabled != initial_status, "Toggle failed"
        # Revert
        link.weekly_digest_enabled = initial_status
        link.save()
    else:
        print("No ParentStudentLink found in database, skipping toggle test.")

def main():
    print("Running Olympy premium features tests...")
    test_user_coins_and_rewards()
    test_mistakes_ai_explanation()
    test_ai_success_predictor()
    test_telegram_weekly_digest_toggle()
    print("\nAll local tests completed successfully!")

if __name__ == '__main__':
    main()
