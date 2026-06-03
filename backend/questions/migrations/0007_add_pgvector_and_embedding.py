from django.db import migrations


class Migration(migrations.Migration):
    """RAG uchun pgvector kengaytmasi va `embedding` ustuni.

    Maydon Django modelida emas — raw SQL ustun (vector(768)). Postgres'da
    `vector` kengaytmasi mavjud bo'lmasa (masalan, lokal SQLite/Postgres'siz
    muhit yoki ruxsat yo'q), CREATE EXTENSION xato berishi mumkin. Shu sababli
    har bir operatsiya alohida va IF NOT EXISTS bilan — qayta ishga
    tushirilsa ham xavfsiz.
    """

    dependencies = [
        ('questions', '0006_question_questions_q_center__10ac6f_idx'),
    ]

    operations = [
        migrations.RunSQL(
            'CREATE EXTENSION IF NOT EXISTS vector;',
            'DROP EXTENSION IF EXISTS vector;',
        ),
        migrations.RunSQL(
            'ALTER TABLE questions_question ADD COLUMN IF NOT EXISTS embedding vector(768);',
            'ALTER TABLE questions_question DROP COLUMN IF EXISTS embedding;',
        ),
        migrations.RunSQL(
            'CREATE INDEX IF NOT EXISTS questions_embedding_idx '
            'ON questions_question USING ivfflat (embedding vector_cosine_ops) '
            'WITH (lists = 100);',
            'DROP INDEX IF EXISTS questions_embedding_idx;',
        ),
    ]
