"""Serve the viewer locally.

The page needs no server at all (open index.html from disk), but over
http://localhost the place labels come from Protomaps instead of the Esri
fallback, and this is what the published site does. Use ``localhost``, not
``127.0.0.1``: the Protomaps key's CORS exemption matches the hostname.

Usage:
    python scripts/serve.py [--port 8000]
"""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class NoStoreHandler(SimpleHTTPRequestHandler):
    """Static files, never cached: a reload always shows the current build."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)
    handler = partial(NoStoreHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("localhost", args.port), handler)
    print(f"Serving {ROOT} at http://localhost:{args.port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
