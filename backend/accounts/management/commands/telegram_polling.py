import json
import time
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.views import handle_telegram_update


class Command(BaseCommand):
    help = 'Poll Telegram updates for local phone verification development.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Poll once and exit.')
        parser.add_argument('--timeout', type=int, default=25, help='Long-poll timeout in seconds.')
        parser.add_argument('--interval', type=float, default=1.0, help='Delay after errors.')

    def handle(self, *args, **options):
        token = getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        if not token:
            raise CommandError('TELEGRAM_BOT_TOKEN is not configured.')

        offset = None
        timeout = max(0, options['timeout'])
        once = options['once']
        interval = max(0.1, options['interval'])
        self.stdout.write(self.style.SUCCESS('Telegram polling started.'))

        while True:
            try:
                updates = self._get_updates(token, offset, timeout)
                for update in updates:
                    update_id = update.get('update_id')
                    if update_id is not None:
                        offset = update_id + 1
                    handle_telegram_update(update)
                    self.stdout.write(f'Processed update {update_id}')
            except KeyboardInterrupt:
                self.stdout.write(self.style.WARNING('Telegram polling stopped.'))
                return
            except Exception as exc:
                if once:
                    raise CommandError(str(exc)) from exc
                self.stderr.write(f'Telegram polling error: {exc}')
                time.sleep(interval)

            if once:
                return

    def _get_updates(self, token, offset, timeout):
        params = {
            'timeout': timeout,
            'allowed_updates': json.dumps(['message', 'edited_message', 'callback_query']),
        }
        if offset is not None:
            params['offset'] = offset
        query = urllib.parse.urlencode(params)
        url = f'https://api.telegram.org/bot{token}/getUpdates?{query}'
        with urllib.request.urlopen(url, timeout=timeout + 10) as response:
            payload = json.loads(response.read().decode('utf-8'))
        if not payload.get('ok'):
            raise CommandError(payload.get('description') or 'Telegram getUpdates failed.')
        return payload.get('result') or []
