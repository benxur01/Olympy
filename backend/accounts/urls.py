from django.urls import path

from . import views

# Mounted under /api/auth/
urlpatterns = [
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('token/refresh/', views.refresh_token, name='token-refresh'),
    path('phone/start-telegram-verification/', views.start_telegram_phone_verification,
         name='start-telegram-phone-verification'),
    path('telegram/link/start/', views.start_telegram_account_link,
         name='start-telegram-account-link'),
    path('phone/verify-otp/', views.verify_otp, name='verify-otp'),
]
