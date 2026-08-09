import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Referer": "https://movie.douban.com/",
}
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "movies.json"
POSTER_DIR = ROOT / "posters"
REQUEST_DELAY = 0.8

session = requests.Session()
session.headers.update(HEADERS)


def subject_id(url):
    match = re.search(r"/subject/(\d+)", url or "")
    return match.group(1) if match else None


def main():
    movies = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    POSTER_DIR.mkdir(exist_ok=True)
    failed = []

    for index, movie in enumerate(movies, 1):
        remote = movie.get("poster")
        sid = subject_id(movie.get("url"))
        if not remote or not sid:
            failed.append((movie.get("title"), "no url/poster"))
            movie["poster"] = ""
            continue

        target = POSTER_DIR / f"{sid}.jpg"
        if target.exists() and target.stat().st_size > 1000:
            movie["poster"] = f"posters/{sid}.jpg"
            continue

        try:
            response = session.get(remote, timeout=30)
            response.raise_for_status()
            if not response.content or len(response.content) < 1000:
                raise ValueError("empty or too small")
            target.write_bytes(response.content)
            movie["poster"] = f"posters/{sid}.jpg"
            print(f"[{index}/{len(movies)}] {sid} {movie['title']}")
        except Exception as exc:
            failed.append((movie.get("title"), str(exc)))
            movie["poster"] = ""
            print(f"[{index}/{len(movies)}] FAIL {movie.get('title')}: {exc}")

        time.sleep(REQUEST_DELAY)

    DATA_PATH.write_text(json.dumps(movies, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. {len(movies) - len(failed)} posters saved, {len(failed)} failed.")
    for title, reason in failed:
        print(f"  - {title}: {reason}")


if __name__ == "__main__":
    main()
