"""Local HTTP boundaries; Python standard library only."""
import functools
import http.client
import http.server
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import LocalHandler


class QuietHandler(LocalHandler):
    def log_message(self, *_):
        pass


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        (cls.root / 'index.html').write_text('<!doctype html><title>Test</title>')
        (cls.root / 'app.js').write_text('export const test = true;')
        (cls.root / '.env').write_text('PRIVATE_VALUE=not-public')
        (cls.root / 'notes.txt').write_text('not an application asset')
        (cls.root / 'empty').mkdir()
        cls.server = http.server.ThreadingHTTPServer(
            ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(cls.root)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path='/', method='GET', headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
        try:
            conn.request(method, path, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_static_files_and_browser_headers(self):
        status, headers, body = self.request()
        self.assertEqual(status, 200)
        self.assertIn(b'<title>Test</title>', body)
        self.assertEqual(headers['X-Frame-Options'], 'DENY')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
        self.assertIn("connect-src 'self'", headers['Content-Security-Policy'])
        status, headers, body = self.request('/app.js', 'HEAD')
        self.assertEqual(status, 200)
        self.assertEqual(body, b'')
        self.assertIn('text/javascript', headers['Content-type'])

    def test_rejects_other_hosts_and_origins(self):
        self.assertEqual(self.request(headers={'Host': 'external.example'})[0], 403)
        self.assertEqual(self.request(headers={'Origin': 'https://external.example'})[0], 403)
        self.assertEqual(self.request(headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        origin = f'http://127.0.0.1:{self.server.server_address[1]}'
        self.assertEqual(self.request(headers={'Origin': origin})[0], 200)

    def test_no_uploads_or_directory_listing(self):
        for method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            self.assertEqual(self.request(method=method)[0], 405)
        self.assertEqual(self.request('/empty/')[0], 404)
        self.assertEqual(self.request('/.env')[0], 404)
        self.assertEqual(self.request('/notes.txt')[0], 404)

    def test_resolved_paths_cannot_escape_root(self):
        outside = self.root.parent / 'outside-test.js'
        original = QuietHandler.translate_path
        try:
            QuietHandler.translate_path = lambda _self, _path: str(outside)
            self.assertEqual(self.request('/escape.js')[0], 403)
        finally:
            QuietHandler.translate_path = original


if __name__ == '__main__':
    unittest.main()
