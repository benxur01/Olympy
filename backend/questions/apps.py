from django.apps import AppConfig


class QuestionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'questions'

    def ready(self):
        # RAG embedding signalini ulaymiz (post_save).
        from . import signals  # noqa: F401
