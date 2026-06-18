from django.urls import path
from . import views

urlpatterns = [
    path('checkout/', views.create_checkout_session, name='billing-checkout'),
    path('plans/', views.list_subscription_plans, name='billing-plans'),
    path('subscription/status/', views.subscription_status, name='billing-subscription-status'),
    path('subscription/current/', views.current_subscription, name='billing-subscription-current'),
    path('history/', views.billing_history, name='billing-history'),
    path('receipt/<int:transaction_id>/', views.transaction_receipt, name='billing-receipt'),
    path('click/webhook/', views.click_webhook, name='billing-click-webhook'),
    path('payme/webhook/', views.payme_webhook, name='billing-payme-webhook'),
]
