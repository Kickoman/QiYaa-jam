#!/usr/bin/env python3
"""Rotor spike (Kickoman/QiYaa-jam#1): does POST /rotor/session/new accept several seeds, and what comes back.

Usage: QIYAA_TOKEN=... spike.py <out-dir>
Seeds are public tracks found by search, not the account's likes. No feedback is sent to any session.
Writes <out-dir>/<case>.json (scrubbed replies) and prints a Markdown table.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.music.yandex.net"
TOKEN = os.environ.get("QIYAA_TOKEN", "").strip()

ROCK = ["Кино Группа крови", "ДДТ Что такое осень", "Сплин Выхода нет", "Агата Кристи Как на войне",
        "Би-2 Полковнику никто не пишет"]
JAZZ = ["Miles Davis So What", "Dave Brubeck Take Five", "John Coltrane Naima"]


def call(method, path, body=None, query=None):
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "OAuth " + TOKEN, "Accept-Language": "ru", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as failed:
        raw = failed.read().decode(errors="replace")
        try:
            return failed.code, json.loads(raw)
        except json.JSONDecodeError:
            return failed.code, raw


def find_track(text):
    status, reply = call("GET", "/search", query={"text": text, "type": "track", "page": 0})
    if status != 200:
        sys.exit(f"search {text!r}: HTTP {status} {reply}")
    track = reply["result"]["tracks"]["results"][0]
    return {"id": str(track["id"]), "albumId": str(track["albums"][0]["id"]),
            "title": track["title"], "artists": [(str(a["id"]), a["name"]) for a in track["artists"]]}


def scrub(reply):
    if isinstance(reply, dict):
        info = reply.get("invocationInfo")
        if isinstance(info, dict):
            reply["invocationInfo"] = {key: "scrubbed" if key in ("req-id", "hostname") else value
                                       for key, value in info.items()}
        result = reply.get("result")
        if isinstance(result, dict):
            if "radioSessionId" in result:
                result["radioSessionId"] = "S-scrubbed"
            if "batchId" in result:
                result["batchId"] = "B-scrubbed"
    return reply


def batch_summary(result, seed_artist_ids):
    tracks = [item["track"] for item in result.get("sequence", []) if item.get("type") == "track"]
    genres = [(track.get("albums") or [{}])[0].get("genre", "?") for track in tracks]
    near = sum(1 for track in tracks if {str(a["id"]) for a in track.get("artists", [])} & seed_artist_ids)
    artists = [", ".join(a["name"] for a in track.get("artists", [])) for track in tracks]
    return tracks, genres, near, artists


def main():
    if not TOKEN:
        sys.exit("set QIYAA_TOKEN")
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    rock = [find_track(text) for text in ROCK]
    jazz = [find_track(text) for text in JAZZ]
    kino = rock[0]["artists"][0][0]
    splin = rock[2]["artists"][0][0]

    def tracks(items):
        return [f"track:{item['id']}" for item in items]

    cases = [
        ("one-track", tracks(rock[:1])),
        ("one-track-with-album", [f"track:{rock[0]['id']}:{rock[0]['albumId']}"]),
        ("three-tracks", tracks(rock[:3])),
        ("five-tracks", tracks(rock)),
        ("one-artist", [f"artist:{kino}"]),
        ("tracks-and-artists", tracks(rock[:2]) + [f"artist:{kino}", f"artist:{splin}"]),
        ("with-my-wave", ["user:onyourwave"] + tracks(rock[:2])),
        ("three-jazz-tracks", tracks(jazz)),
        ("rock-and-jazz", tracks(rock[:2]) + tracks(jazz[:2])),
    ]
    seed_artists = {case: set() for case, _ in cases}
    by_track = {item["id"]: item for item in rock + jazz}
    for case, seeds in cases:
        for seed in seeds:
            kind, _, rest = seed.partition(":")
            if kind == "track":
                seed_artists[case] |= {artist_id for artist_id, _ in by_track[rest.split(":")[0]]["artists"]}
            elif kind == "artist":
                seed_artists[case].add(rest)

    print("Seed tracks:")
    for item in rock + jazz:
        print(f"- track:{item['id']} (album {item['albumId']}): {', '.join(n for _, n in item['artists'])} — {item['title']}")
    print()
    print("| Case | Seeds sent | HTTP | Session | Accepted seeds | Description seed | Tracks | By seed artists | Genres |")
    print("|---|---|---|---|---|---|---|---|---|")
    sessions = {}
    details = []
    for case, seeds in cases:
        status, reply = call("POST", "/rotor/session/new", {
            "seeds": seeds, "includeTracksInResponse": True, "includeWaveModel": True, "interactive": True})
        result = reply.get("result", {}) if isinstance(reply, dict) else {}
        session = result.get("radioSessionId")
        if session:
            sessions[case] = (session, result)
        accepted = [seed.get("value") for seed in result.get("acceptedSeeds", [])]
        description = (result.get("descriptionSeed") or {}).get("value", "—")
        tracks_, genres, near, artists = batch_summary(result, seed_artists[case])
        print(f"| {case} | {len(seeds)}: `{' '.join(seeds)}` | {status} | {'yes' if session else 'no'} | "
              f"{len(accepted)}: `{' '.join(accepted)}` | `{description}` | {len(tracks_)} | {near}/{len(tracks_)} | "
              f"{', '.join(sorted(set(genres)))} |")
        details.append((case, artists))
        (out / f"{case}.json").write_text(json.dumps(scrub(reply), ensure_ascii=False, indent=2) + "\n")

    print()
    for case, artists in details:
        print(f"- {case}: {'; '.join(artists)}")

    print()
    print("| Load more for | HTTP | Tracks | By seed artists | Genres |")
    print("|---|---|---|---|---|")
    for case in ("five-tracks", "rock-and-jazz", "tracks-and-artists"):
        if case not in sessions:
            continue
        session, first = sessions[case]
        queue = [str(item["track"]["id"]) for item in first.get("sequence", []) if item.get("type") == "track"]
        status, reply = call("POST", f"/rotor/session/{session}/tracks", {"queue": queue})
        result = reply.get("result", {}) if isinstance(reply, dict) else {}
        tracks_, genres, near, artists = batch_summary(result, seed_artists[case])
        print(f"| {case} | {status} | {len(tracks_)} | {near}/{len(tracks_)} | {', '.join(sorted(set(genres)))} |")
        print(f"|  | | | | {'; '.join(artists)} |")
        (out / f"{case}-more.json").write_text(json.dumps(scrub(reply), ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
