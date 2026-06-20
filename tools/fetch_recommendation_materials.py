from __future__ import annotations

import base64
import csv
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import http.client
from pathlib import Path


ROOT = Path(r"G:\图文\影视\三国\瑜相关文包资料 202606")
LIST_PATH = ROOT / "[0]资料" / "三国吴推荐书目@岛民代表心儿" / "三国吴推荐书目@岛民代表心儿_文字版.txt"
OUT_DIR = ROOT / "[0]资料" / "三国吴推荐书目@岛民代表心儿" / "未标勾条目_公开资料"
FILES_DIR = OUT_DIR / "files"
META_JSONL = OUT_DIR / "检索结果.jsonl"
META_CSV = OUT_DIR / "检索结果.csv"

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BLOCKED_DOMAINS = (
    "sci-hub",
    "libgen",
    "z-lib",
    "zlib",
    "book118.com",
    "doc88.com",
    "docin.com",
    "wenku.baidu.com",
    "readpaper.com",
)


def request(url: str, *, method: str = "GET", timeout: int = 20) -> urllib.response.addinfourl | None:
    url = urllib.parse.quote(url, safe=":/?&=%#@!$'()*+,;[]")
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except (
        urllib.error.URLError,
        TimeoutError,
        ValueError,
        http.client.InvalidURL,
        http.client.RemoteDisconnected,
        ConnectionError,
    ):
        return None


def parse_items() -> list[str]:
    items: list[str] = []
    for raw in LIST_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("=") or line.startswith("✅"):
            continue
        items.append(line)
    return items


def title_author(item: str) -> tuple[str, str]:
    item = re.sub(r"^[❌✗×]\ufe0f?", "", item).strip()
    item = re.sub(r"（.*?）", "", item).strip()
    m = re.match(r"(.+?)\[(?:著|编著|编|译著)\](.*)$", item)
    if not m:
        return item, ""
    return m.group(1).strip(), m.group(2).strip()


def safe_name(text: str, max_len: int = 88) -> str:
    text = re.sub(r"^[❌✗×]\ufe0f?", "", text)
    text = re.sub(r'[<>:"/\\|?*\r\n\t]+', "_", text).strip(" ._")
    return text[:max_len].rstrip(" ._") or "untitled"


def clean_bing_url(url: str) -> str | None:
    url = html.unescape(url)
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower()
    if host.endswith("bing.com") and parsed.path.startswith("/ck/"):
        qs = urllib.parse.parse_qs(parsed.query)
        encoded = (qs.get("u") or [""])[0]
        if encoded.startswith("a1"):
            encoded = encoded[2:]
        try:
            pad = "=" * (-len(encoded) % 4)
            decoded = base64.urlsafe_b64decode((encoded + pad).encode()).decode("utf-8", "ignore")
            return decoded if decoded.startswith("http") else None
        except Exception:
            return None
    if url.startswith("http"):
        return url
    return None


def blocked(url: str) -> bool:
    host = urllib.parse.urlparse(url).netloc.lower()
    return any(bad in host for bad in BLOCKED_DOMAINS)


def bing_search(query: str) -> list[str]:
    url = "https://www.bing.com/search?q=" + urllib.parse.quote(query)
    resp = request(url)
    if not resp:
        return []
    try:
        page = resp.read().decode("utf-8", "ignore")
    except TimeoutError:
        return []
    urls: list[str] = []
    for m in re.finditer(r'href="(https?://[^"]+)"', page):
        cleaned = clean_bing_url(m.group(1))
        if not cleaned or blocked(cleaned):
            continue
        host = urllib.parse.urlparse(cleaned).netloc.lower()
        if any(skip in host for skip in ("bing.com", "microsoft.com", "msn.com")):
            continue
        if cleaned not in urls:
            urls.append(cleaned)
    return urls[:10]


def content_type(url: str) -> str:
    resp = request(url, method="HEAD", timeout=12)
    if not resp:
        return ""
    return resp.headers.get("Content-Type", "").lower()


def discover_pdf_links(page_url: str) -> list[str]:
    resp = request(page_url, timeout=15)
    if not resp:
        return []
    ctype = resp.headers.get("Content-Type", "").lower()
    if "html" not in ctype and "text" not in ctype:
        return []
    try:
        body = resp.read(400_000).decode("utf-8", "ignore")
    except TimeoutError:
        return []
    found: list[str] = []
    for m in re.finditer(r'href=["\']([^"\']+?\.pdf(?:\?[^"\']*)?)["\']', body, flags=re.I):
        link = urllib.parse.urljoin(page_url, html.unescape(m.group(1)))
        if not blocked(link) and link not in found:
            found.append(link)
    return found[:3]


def download_pdf(url: str, dest: Path) -> tuple[bool, str]:
    resp = request(url, timeout=30)
    if not resp:
        return False, "request_failed"
    ctype = resp.headers.get("Content-Type", "").lower()
    try:
        data = resp.read(30_000_000)
    except TimeoutError:
        return False, "read_timeout"
    if b"%PDF" not in data[:2048] and "pdf" not in ctype:
        return False, f"not_pdf:{ctype}"
    dest.write_bytes(data)
    return True, f"{len(data)} bytes"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    items = parse_items()
    rows: list[dict[str, str]] = []
    processed: set[int] = set()
    if META_JSONL.exists() and META_JSONL.stat().st_size:
        for line in META_JSONL.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            rows.append(row)
            processed.add(int(row["index"]))

    for index, item in enumerate(items, start=1):
        if index in processed:
            continue
        title, author = title_author(item)
        queries = [
            f'"{title}" "{author}" PDF' if author else f'"{title}" PDF',
            f'"{title}" "{author}"' if author else f'"{title}"',
        ]
        result_urls: list[str] = []
        downloaded = ""
        status = "not_found"
        note = ""

        for query in queries:
            for url in bing_search(query):
                if url not in result_urls:
                    result_urls.append(url)
            time.sleep(0.8)
            if result_urls:
                break

        candidates: list[str] = []
        for url in result_urls[:5]:
            if ".pdf" in urllib.parse.urlparse(url).path.lower() or "pdf" in content_type(url):
                candidates.append(url)
            else:
                candidates.extend(discover_pdf_links(url))
            if candidates:
                break

        for pdf_url in candidates:
            ext = ".pdf"
            dest = FILES_DIR / f"{index:03d}_{safe_name(title)}{ext}"
            ok, msg = download_pdf(pdf_url, dest)
            if ok:
                downloaded = str(dest.relative_to(OUT_DIR))
                status = "downloaded_pdf"
                note = msg
                break
            note = msg
            time.sleep(0.8)

        if result_urls and not downloaded:
            status = "links_only"

        row = {
            "index": str(index),
            "item": item,
            "title": title,
            "author": author,
            "status": status,
            "downloaded": downloaded,
            "urls": " | ".join(result_urls[:6]),
            "note": note,
        }
        rows.append(row)
        with META_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"[{index}/{len(items)}] {status}: {title}")

    with META_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
