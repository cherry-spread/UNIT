"""Serve the captured SPA on a loopback address."""
import argparse
import io
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "snapshot"
INVENTORY = json.loads((ROOT / "inventory.json").read_text())
ORIGINAL_GEO = "https://forduckapp.vercel.app/api/geo"


def localize_media(text):
    for item in INVENTORY:
        if not item.get("path", "").startswith("external/"):
            continue
        url = item["url"]
        prefix, name = url.rsplit("/", 1)
        local_url = "/__external/" + Path(item["path"]).name
        text = text.replace(url, local_url)
        # The bundle joins a shared CDN prefix with each media filename.
        # Replace only captured files so missing media keep their original URLs.
        binding = re.search(r'([\w$]+)=' + re.escape(json.dumps(prefix + "/")), text)
        if binding:
            expression = binding[1] + "+" + json.dumps(name)
            text = re.sub(r"(?<![\w$])" + re.escape(expression), lambda _: json.dumps(local_url), text)
    return text


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SNAPSHOT), **kwargs)

    def json_response(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def api_unavailable(self):
        self.json_response(501, {"error": "원본 서버 API는 배포본에 포함되지 않아 로컬에서 제공되지 않습니다."})

    def geo(self, query):
        port = self.server.server_port
        if (
            self.headers.get("Host") not in {f"localhost:{port}", f"127.0.0.1:{port}"}
            or self.headers.get("Sec-Fetch-Site") not in {None, "same-origin"}
        ):
            return self.json_response(403, {"error": "로컬 포덕에서만 위치 확인을 요청할 수 있습니다."})
        values = parse_qs(query, keep_blank_values=True)
        try:
            lat, = values["lat"]
            lng, = values["lng"]
            lat, lng = float(lat), float(lng)
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise ValueError
        except (KeyError, ValueError):
            return self.json_response(400, {"error": "유효한 위도와 경도를 입력해 주세요."})

        url = ORIGINAL_GEO + "?" + urlencode({"lat": f"{lat:.5f}", "lng": f"{lng:.5f}"})
        try:
            try:
                response = urlopen(url, timeout=8)
            except HTTPError as error:
                response = error
            with response:
                result = json.loads(response.read(16_384))
                status = response.status if hasattr(response, "status") else response.code
        except (URLError, OSError, ValueError):
            return self.json_response(502, {"error": "원본 위치 확인 서버에 연결할 수 없습니다."})
        self.json_response(status, result)

    def log_request(self, code="-", size="-"):
        if urlsplit(self.path).path == "/api/geo":
            self.log_message('"%s /api/geo %s" %s %s', self.command, self.request_version, code, size)
        else:
            super().log_request(code, size)

    def do_POST(self):
        self.api_unavailable()

    def send_head(self):
        request = urlsplit(self.path)
        path = request.path
        if path == "/api/geo" and self.command == "GET" and getattr(self.server, "use_original_geo", False):
            self.geo(request.query)
            return None
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
            content = localize_media(content.decode()).encode()
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(str(file)))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        return io.BytesIO(content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8040)
    parser.add_argument("--use-original-geo", action="store_true", help="Forward GPS coordinates to the original Vercel deployment")
    args = parser.parse_args()
    with ThreadingHTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.use_original_geo = args.use_original_geo
        print(f"포덕 배포본 미리보기 http://localhost:{server.server_port}/", flush=True)
        server.serve_forever()
