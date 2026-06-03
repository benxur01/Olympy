"""Barcha (yoki embeddingi yo'q) savollar uchun RAG embeddingini hisoblaydi.

`embedding` ustuni Django modelida emas (raw SQL vector(768)), shuning uchun
"embeddingi yo'q" savollar raw SQL bilan aniqlanadi. Har savol uchun
`update_question_embedding` Celery task'i navbatga qo'shiladi.

Foydalanish:
    python manage.py embed_questions          # faqat embeddingi yo'qlar
    python manage.py embed_questions --all     # barcha savollar
    python manage.py embed_questions --sync     # navbatga qo'ymay, shu yerda
"""

from django.core.management.base import BaseCommand
from django.db import connection

from questions.tasks import update_question_embedding


class Command(BaseCommand):
    help = 'Savollar uchun RAG embedding hisoblab saqlaydi'

    def add_arguments(self, parser):
        parser.add_argument(
            '--all', action='store_true',
            help='Embeddingi borlarini ham qayta hisoblash',
        )
        parser.add_argument(
            '--sync', action='store_true',
            help="Celery navbatiga qo'ymay, shu jarayonda bajarish",
        )

    def _question_ids(self, include_all):
        """Embedding kerak bo'lgan savol id'lari (raw SQL)."""
        if include_all:
            sql = 'SELECT id FROM questions_question ORDER BY id'
        else:
            sql = (
                'SELECT id FROM questions_question '
                'WHERE embedding IS NULL ORDER BY id'
            )
        with connection.cursor() as cursor:
            cursor.execute(sql)
            return [row[0] for row in cursor.fetchall()]

    def handle(self, *args, **options):
        include_all = options['all']
        run_sync = options['sync']

        try:
            ids = self._question_ids(include_all)
        except Exception as exc:
            self.stderr.write(self.style.ERROR(
                "embedding ustuni topilmadi — avval migration'larni qo'llang "
                f"(pgvector kerak). Xato: {exc}"
            ))
            return

        count = len(ids)
        if not count:
            self.stdout.write('Embedding hisoblash kerak bo\'lgan savol yo\'q.')
            return

        self.stdout.write(f'{count} ta savol uchun embedding hisoblanadi...')
        if run_sync:
            done = 0
            for qid in ids:
                update_question_embedding.run(qid)
                done += 1
                if done % 50 == 0:
                    self.stdout.write(f'  {done}/{count}')
            self.stdout.write(self.style.SUCCESS(f'{done} ta savol vektorlashtirildi'))
        else:
            for qid in ids:
                update_question_embedding.delay(qid)
            self.stdout.write(self.style.SUCCESS(f"{count} ta task navbatga qo'shildi"))
