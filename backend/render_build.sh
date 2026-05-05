#!/usr/bin/env bash
# Render web service build hook. Runs on every deploy.
# Steps:
#   1) Install Python deps from requirements.txt
#   2) Collect static files into STATIC_ROOT (served by WhiteNoise)
#   3) Apply database migrations
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate --no-input
