"""Serve the local workbench. No uploads, APIs, or external dependencies."""
import argparse
import functools
import http.server
from pathlib import Path
import sys
import threading
from urllib.parse import urlsplit
import webbrowser


class LocalHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mp4': 'video/mp4', '.css': 'text/css'}

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass

    def _allowed_request(self):
        port = self.server.server_address[1]
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host', '').lower() not in hosts:
            self.send_error(403, 'Local host required')
            return False
        origin = self.headers.get('Origin')
        if origin and origin.lower() not in {f'http://{host}' for host in hosts}:
            self.send_error(403, 'Cross-origin requests are not allowed')
            return False
        if self.headers.get('Sec-Fetch-Site', '').lower() == 'cross-site':
            self.send_error(403, 'Cross-site requests are not allowed')
            return False
        return True

    def do_GET(self):
        if self._allowed_request():
            super().do_GET()

    def do_HEAD(self):
        if self._allowed_request():
            super().do_HEAD()

    def do_POST(self):
        self.send_error(405, 'Only GET and HEAD are supported')

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

    def send_head(self):
        root = Path(self.directory).resolve()
        target = Path(self.translate_path(urlsplit(self.path).path)).resolve()
        try:
            relative = target.relative_to(root)
        except ValueError:
            self.send_error(403, 'Path outside application directory')
            return None
        if any(part.startswith('.') for part in relative.parts):
            self.send_error(404)
            return None
        if target.is_file() and target.suffix.lower() not in {
            '.html', '.css', '.js', '.json', '.png', '.svg', '.ico', '.mp4', '.webm'
        }:
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy',
                         "default-src 'none'; script-src 'self'; style-src 'self'; "
                         "img-src 'self' blob: data:; media-src 'self' blob:; "
                         "worker-src 'self'; connect-src 'self'; font-src 'self'; "
                         "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; "
                         "form-action 'none'")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None


def main():
    if sys.version_info < (3, 11):
        raise SystemExit('Python 3.11 or newer is required: https://www.python.org/downloads/')
    parser = argparse.ArgumentParser(description='JS SpriteBake local server')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('--port must be between 1024 and 65535')
    root = Path(__file__).resolve().parent / 'dist'
    handler = functools.partial(LocalHandler, directory=str(root))
    server = None
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('No free local port. Try --port 8900.')
    url = f'http://127.0.0.1:{server.server_address[1]}'
    print(f'\nJS SpriteBake: {url}\nKeep this window open. Ctrl+C to stop.\n', flush=True)
    if not args.no_browser:
        opener = threading.Timer(0.5, lambda: webbrowser.open(url))
        opener.daemon = True
        opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
