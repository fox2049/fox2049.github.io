import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://movie.douban.com/people/61283490/collect"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Referer": "https://movie.douban.com/",
}
PAGE_SIZE = 15
TOTAL_PAGES = 15
REQUEST_DELAY = 2.5
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "data" / "movies.json"

session = requests.Session()
session.headers.update(HEADERS)


def parse_item(item):
    link = item.select_one(".pic a.nbg")
    poster = item.select_one(".pic img")
    title_node = item.select_one(".title a")
    em = title_node.select_one("em")
    title = em.get_text(strip=True) if em else ""
    sub = title_node.get_text(" ", strip=True)
    alt = ""
    match = re.search(r"/\s*(.+?)\s*$", sub)
    if match:
        alt = match.group(1).strip()
    date_node = item.select_one(".date")
    watched = date_node.get_text(strip=True) if date_node else ""
    comment_node = item.select_one(".comment")
    comment = comment_node.get_text(" ", strip=True) if comment_node else ""

    intro = item.select_one(".intro")
    intro_text = intro.get_text(" ", strip=True) if intro else ""
    year = ""
    match = re.search(r"(19\d{2}|20\d{2})", intro_text)
    if match:
        year = match.group(1)

    type_label = "电影"
    if " 电视剧" in intro_text or re.search(r"集(?: )?$|共\d+集", intro_text):
        type_label = "剧集"

    return {
        "title": title,
        "alt": alt,
        "year": year,
        "url": link["href"] if link else "",
        "poster": poster["src"] if poster else "",
        "watched": watched,
        "type": type_label,
        "comment": comment,
        "intro": intro_text,
    }


def fetch_page(start):
    params = {"start": start, "sort": "time", "type": "all", "filter": "all", "mode": "grid"}
    response = session.get(BASE_URL, params=params, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "lxml")
    return [parse_item(item) for item in soup.select(".item.comment-item")]


def main():
    movies = []
    for page in range(TOTAL_PAGES):
        start = page * PAGE_SIZE
        print(f"Fetching page {page + 1}/{TOTAL_PAGES} (start={start}) ...")
        movies.extend(fetch_page(start))
        time.sleep(REQUEST_DELAY)
        if page == 0:
            time.sleep(2)

    movies.sort(key=lambda m: m["watched"], reverse=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(movies, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(movies)} movies to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
