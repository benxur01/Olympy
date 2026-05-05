#!/usr/bin/env bash
# Render web service start command. Runs gunicorn with sane production
# defaults. Render injects $PORT (10000 by default).
set -o errexit

exec gunicorn olympy_api.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
