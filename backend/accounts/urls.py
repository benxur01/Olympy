from django.urls import path

from . import views

# Mounted under /api/auth/
urlpatterns = [
    path('register/', views.register, name='register'),
    path('register-organization/', views.register_organization, name='register-organization'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('token/refresh/', views.refresh_token, name='token-refresh'),
    path('me/avatar/', views.update_my_avatar, name='update-my-avatar'),
    path('me/change-password/', views.change_my_password, name='change-my-password'),
    path('phone/start-telegram-verification/', views.start_telegram_phone_verification,
         name='start-telegram-phone-verification'),
    path('password-reset/start/', views.start_password_reset, name='start-password-reset'),
    path('password-reset/confirm/', views.confirm_password_reset, name='confirm-password-reset'),
    path('telegram/link/start/', views.start_telegram_account_link,
         name='start-telegram-account-link'),
    path('phone/verify-otp/', views.verify_otp, name='verify-otp'),
]
