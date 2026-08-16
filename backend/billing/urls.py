from django.urls import path
from . import views, views_admin_promo, views_admin_revenue

urlpatterns = [
    # Admin Promocodes & Revenue
    path('admin/promocodes/', views_admin_promo.admin_list_create_promocodes, name='admin-billing-promocodes'),
    path('admin/promocodes/<int:pk>/toggle/', views_admin_promo.admin_toggle_promocode, name='admin-billing-promocodes-toggle'),
    path('admin/promocodes/<int:pk>/', views_admin_promo.admin_delete_promocode, name='admin-billing-promocodes-delete'),
    path('admin/revenue/', views_admin_revenue.admin_revenue_analytics, name='admin-billing-revenue'),
    path('admin/invoice/generate/', views_admin_revenue.admin_generate_b2b_invoice, name='admin-billing-invoice-generate'),
    path('promocode/validate/', views_admin_promo.validate_promocode_public, name='billing-promocode-validate'),

    path('checkout/', views.create_checkout_session, name='billing-checkout'),
    path('plans/', views.list_subscription_plans, name='billing-plans'),
    path('subscription/status/', views.subscription_status, name='billing-subscription-status'),
    path('subscription/current/', views.current_subscription, name='billing-subscription-current'),
    path('limits/', views.subscription_limits, name='billing-limits'),
    path('history/', views.billing_history, name='billing-history'),
    path('receipt/<int:transaction_id>/', views.transaction_receipt, name='billing-receipt'),
    path('click/webhook/', views.click_webhook, name='billing-click-webhook'),
    path('payme/webhook/', views.payme_webhook, name='billing-payme-webhook'),
]
