"""Serve a prototype and persist review batches outside the public directory."""
import json
import os
import sys
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

stage = Path(os.environ["AFM_STAGE_DIR"])
site = Path(sys.argv[1]).resolve()
studio = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/__capture.js":
            data = (studio / "vendor/html2canvas.min.js").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.end_headers()
            self.wfile.write(data)
            return
        if route in ("/__review", "/__review.js"):
            name = "review.html" if route == "/__review" else "review.js"
            data = (studio / name).read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8" if name.endswith("html") else "text/javascript")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/__feedback":
            return self.send_error(404)
        if self.headers.get("Origin") != "http://" + self.headers.get("Host", ""):
            return self.send_error(403)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 32 * 1024 * 1024:
                return self.send_error(413)
            batch = json.loads(self.rfile.read(size))
            key = str(uuid.UUID(batch["id"]))
            if not isinstance(batch["notes"], list) or (not batch["notes"] and batch.get("kind") != "approval"):
                raise ValueError()
        except (ValueError, TypeError, KeyError):
            return self.send_error(400)
        inbox = stage / "feedback"
        inbox.mkdir(exist_ok=True)
        target = inbox / (key + ".json")
        if not target.exists():
            tmp = inbox / (uuid.uuid4().hex + ".tmp")
            tmp.write_text(json.dumps(batch, ensure_ascii=False))
            tmp.replace(target)
        self.send_response(204)
        self.end_headers()


bind = "0.0.0.0" if os.environ.get("AFM_IN_DOCKER") else "127.0.0.1"
ThreadingHTTPServer((bind, int(os.environ["AFM_BROWSER_APP_PORT"])),
                    partial(Handler, directory=str(site))).serve_forever()
