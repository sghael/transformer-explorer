"""Serve the last successful production build; no source files are exposed."""
import argparse
import http.server
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=4173)
args = parser.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'artifacts/preview'), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
server = http.server.ThreadingHTTPServer(('0.0.0.0', args.port), Handler)
print(f'Preview listening on 0.0.0.0:{server.server_port}', flush=True)
server.serve_forever()
