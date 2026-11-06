"""Local-only preview of the captured SPA; upstream APIs are not implemented."""
import io
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "snapshot"
INVENTORY = json.loads((ROOT / "inventory.json").read_text())


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SNAPSHOT), **kwargs)

    def api_unavailable(self):
        payload = json.dumps({"error": "원본 서버 API는 배포본에 포함되지 않아 로컬에서 제공되지 않습니다."}, ensure_ascii=False).encode()
        self.send_response(501)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_POST(self):
        self.api_unavailable()

    def send_head(self):
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            self.api_unavailable()
            return None
        if path.startswith("/__external/"):
            name = path.removeprefix("/__external/")
            if name != Path(name).name or name in (".", "..", ""):
                self.send_error(404)
                return None
            file = ROOT / "external" / name
        else:
            file = Path(self.translate_path(self.path))
            if not file.exists() and "." not in path.rsplit("/", 1)[-1]:
                file = SNAPSHOT / "index.html"
        if not file.is_file():
            return super().send_head()
        content = file.read_bytes()
        if file.suffix == ".js":
            text = content.decode()
            for item in INVENTORY:
                if item.get("path", "").startswith("external/"):
                    name = Path(item["path"]).name
                    text = text.replace(item["url"], "/__external/" + name)
                    # Vite's main bundle shares a constant prefix for media URLs.
                    prefix = item["url"].rsplit("/", 1)[0] + "/"
                    text = text.replace('"' + prefix + '"', '"/__external/"')
            content = text.encode()
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file)))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(content)


if __name__ == "__main__":
    print("포덕 배포본 미리보기: http://localhost:8040 (원본 서버 API 제외)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8040), Handler).serve_forever()
