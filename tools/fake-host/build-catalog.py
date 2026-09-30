#!/usr/bin/env python3
"""Builds catalog.json for the fake host from the public Yandex Music catalogue.

Usage: QIYAA_TOKEN=... build-catalog.py. Only catalogue metadata is kept: ids, titles, artist names,
durations and cover templates. Nothing from the account.
"""
import json
import os
import pathlib
import urllib.parse
import urllib.request

QUERIES = [
    "КИНО", "ДДТ", "Сплин", "Би-2", "Агата Кристи", "Земфира", "Мумий Тролль", "Наутилус Помпилиус",
    "Queen", "The Beatles", "Nirvana", "Radiohead", "Daft Punk", "Massive Attack", "Portishead",
    "Miles Davis", "Nina Simone", "Ella Fitzgerald", "Amy Winehouse", "Adele", "Coldplay",
    "Arctic Monkeys", "Muse", "Linkin Park", "Metallica", "Pink Floyd", "David Bowie", "Kraftwerk",
    "ABBA", "Земляне",
]
PER_QUERY = 7
OUT = pathlib.Path(__file__).with_name("catalog.json")


def search(text):
    query = urllib.parse.urlencode({"text": text, "type": "track", "page": 0})
    request = urllib.request.Request(f"https://api.music.yandex.net/search?{query}", headers={
        "Authorization": "OAuth " + os.environ["QIYAA_TOKEN"].strip(), "Accept-Language": "ru"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)["result"].get("tracks", {}).get("results", [])


def to_track(raw):
    album = (raw.get("albums") or [{}])[0]
    title = raw["title"] + (f" ({raw['version']})" if raw.get("version") else "")
    track = {
        "id": str(raw["id"]),
        "title": title[:150],
        "artists": [artist["name"][:64] for artist in raw.get("artists", [])][:10],
        "durationMs": int(raw.get("durationMs", 0)),
    }
    if album.get("id"):
        track["albumId"] = str(album["id"])
    cover = album.get("coverUri") or raw.get("coverUri") or raw.get("ogImage")
    if cover and "%%" in cover:
        track["coverUri"] = cover
    return track


def main():
    catalog, seen = [], set()
    for text in QUERIES:
        taken = 0
        for raw in search(text):
            if taken == PER_QUERY:
                break
            if not raw.get("available", True) or str(raw["id"]) in seen or not raw.get("durationMs"):
                continue
            seen.add(str(raw["id"]))
            catalog.append(to_track(raw))
            taken += 1
    OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(catalog)} tracks → {OUT}")


main()
