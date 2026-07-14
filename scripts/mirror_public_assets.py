#!/usr/bin/env python3
import hashlib, json, re, sys, urllib.parse, urllib.request
from collections import deque
from pathlib import Path

ORIGIN = "https://quiz-math-6-1-1.vercel.app/"
ROOT = Path(__file__).resolve().parents[1]
TEXT_EXT = {".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".txt"}
ASSET_EXT = r"(?:js|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|m4a|ogg|wav|mp4)"
PATTERNS = [
    re.compile(r'''(?:src|href)=["']([^"'#?]+)["']'''),
    re.compile(r'''url\(\s*["']?([^"')?#]+)'''),
    re.compile(r'''["']((?:\.?\.?/|/)?assets/[^"'?#]+?\.''' + ASSET_EXT + r''')["']'''),
    re.compile(r'''(?:import\(|from\s*)["'](\.?/[^"']+?\.js)["']'''),
]


def local_path(url: str) -> Path:
    p = urllib.parse.urlparse(url).path.lstrip("/") or "index.html"
    return ROOT / p


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 clone-verifier"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def discover(text: str, base_url: str):
    for pattern in PATTERNS:
        for raw in pattern.findall(text):
            if raw.startswith(("data:", "blob:", "mailto:", "javascript:")) or any(c in raw for c in ("$", "{", "}", "+")):
                continue
            if raw.startswith("assets/"):
                url = urllib.parse.urljoin(ORIGIN, raw)
            else:
                url = urllib.parse.urljoin(base_url, raw)
            u = urllib.parse.urlparse(url)
            if u.netloc == urllib.parse.urlparse(ORIGIN).netloc:
                yield urllib.parse.urlunparse((u.scheme, u.netloc, u.path, "", "", ""))


def main():
    queue = deque([ORIGIN, urllib.parse.urljoin(ORIGIN, "assets/generated/manifest.json")])
    seen = set()
    manifest = []
    errors = []
    while queue:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            data = fetch(url)
        except Exception as e:
            errors.append({"url": url, "error": str(e)})
            continue
        out = local_path(url)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        manifest.append({"path": str(out.relative_to(ROOT)), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "source": url})
        if out.suffix.lower() in TEXT_EXT:
            text = data.decode("utf-8", "ignore")
            queue.extend(discover(text, url))
            if urllib.parse.urlparse(url).path == "/assets/generated/manifest.json":
                try:
                    catalog = json.loads(text)
                    for item in catalog.get("assets", []):
                        name = item.get("file")
                        if name and not any(c in name for c in ("$", "{", "}", "+", "/")):
                            queue.append(urllib.parse.urljoin(ORIGIN, "assets/generated/" + name))
                except Exception as e:
                    errors.append({"url": url, "error": f"manifest parse: {e}"})
    (ROOT / "docs/research/ASSET_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (ROOT / "docs/research/ASSET_ERRORS.json").write_text(json.dumps(errors, ensure_ascii=False, indent=2) + "\n")
    print(f"downloaded={len(manifest)} errors={len(errors)} bytes={sum(x['bytes'] for x in manifest)}")
    if errors:
        for e in errors[:20]:
            print("ERROR", e["url"], e["error"], file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
