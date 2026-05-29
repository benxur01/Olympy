from django.urls import path

from . import mock_views

# Mounted under /api/mock-olympiads/
urlpatterns = [
    path('<int:mock_id>/start/', mock_views.start_mock, name='mock-start'),
    path('<int:mock_id>/submit/', mock_views.submit_mock, name='mock-submit'),
    path('<int:mock_id>/results/', mock_views.mock_results, name='mock-results'),
]
