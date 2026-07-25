from django.urls import path

from . import views_internal

# Mounted under /api/accounts/ — internal, server-to-server only (shared-secret
# gated). Not part of the public API surface.
urlpatterns = [
    path('introspect/', views_internal.introspect, name='internal-introspect'),
]
