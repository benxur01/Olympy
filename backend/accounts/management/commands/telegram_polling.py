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
        parser.add_argument(
            '--bot',
            choices=['auth', 'manager', 'both'],
            default='auth',
            help='Which configured Telegram bot to poll.',
        )

    def handle(self, *args, **options):
        bots = ['auth', 'manager'] if options['bot'] == 'both' else [options['bot']]
        tokens = {bot: self._token_for(bot) for bot in bots}
        missing = [bot for bot, token in tokens.items() if not token]
        if missing:
            raise CommandError(f'Telegram token is not configured for: {", ".join(missing)}')

        offsets = {bot: None for bot in bots}
        timeout = max(0, options['timeout'])
        once = options['once']
        interval = max(0.1, options['interval'])
        self.stdout.write(self.style.SUCCESS(f'Telegram polling started: {", ".join(bots)}.'))

        while True:
            try:
                for bot in bots:
                    updates = self._get_updates(tokens[bot], offsets[bot], timeout)
                    for update in updates:
                        update_id = update.get('update_id')
                        if update_id is not None:
                            offsets[bot] = update_id + 1
                        handle_telegram_update(update, bot=bot)
                        self.stdout.write(f'Processed {bot} update {update_id}')
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

    def _token_for(self, bot):
        if bot == 'manager':
            return (
                getattr(settings, 'TELEGRAM_MANAGER_BOT_TOKEN', '')
                or getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
            )
        return (
            getattr(settings, 'TELEGRAM_AUTH_BOT_TOKEN', '')
            or getattr(settings, 'TELEGRAM_BOT_TOKEN', '')
        )

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
