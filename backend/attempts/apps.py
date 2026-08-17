from django.apps import AppConfig


class AttemptsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'attempts'

    def ready(self):
        # Dalil qatori o'chganda faylini ham o'chiruvchi signal (post_delete).
        from . import signals  # noqa: F401
