from django.urls import path

from . import views_portfolio

# Mounted under /api/portfolio/
urlpatterns = [
    # Public yutuqlar portfoliosi tekshiruvi (auth shart emas, AllowAny). UUID
    # orqali — certificates/verify konventsiyasi kabi.
    path('verify/<uuid:portfolio_uuid>/', views_portfolio.portfolio_verify,
         name='portfolio-verify'),
]
