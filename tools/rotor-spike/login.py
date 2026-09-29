#!/usr/bin/env python3
"""Device-code login to Yandex Music, the same flow and client as desktop QiYaa (src/yandex/oauth.cpp).

Writes the token to QiYaa's own token file, never prints it.
"""
import json
import os
import pathlib
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d"
CLIENT_SECRET = "53bc75238f0c4d08a118e51fe9203300"
OAUTH = "https://oauth.yandex.ru"
TOKEN_FILE = pathlib.Path(os.environ.get("XDG_CONFIG_HOME", pathlib.Path.home() / ".config")) / "QiYaa" / "token"


def post(path, fields):
    request = urllib.request.Request(OAUTH + path, data=urllib.parse.urlencode(fields).encode())
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as failed:
        return json.load(failed)


def main():
    if TOKEN_FILE.exists() and TOKEN_FILE.read_text().strip():
        sys.exit(f"{TOKEN_FILE} already holds a token; remove it first if you want a new one")
    code = post("/device/code", {"client_id": CLIENT_ID, "device_name": f"QiYaa jam spike ({socket.gethostname()})"})
    if "device_code" not in code:
        sys.exit(f"device/code failed: {code}")
    print(f"Open {code.get('verification_url', 'https://ya.ru/device')} and enter {code['user_code']}", flush=True)
    interval = max(1, int(code.get("interval", 5)))
    deadline = time.time() + int(code.get("expires_in", 300))
    while time.time() < deadline:
        time.sleep(interval)
        reply = post("/token", {"grant_type": "device_code", "code": code["device_code"],
                                "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET})
        if "access_token" in reply:
            TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
            TOKEN_FILE.touch(mode=0o600)
            TOKEN_FILE.write_text(reply["access_token"])
            print(f"Token saved to {TOKEN_FILE} (mode 600). Desktop QiYaa will use it too.")
            return
        if reply.get("error") == "slow_down":
            interval += 5
        elif reply.get("error") != "authorization_pending":
            sys.exit(f"token failed: {reply.get('error_description') or reply.get('error')}")
    sys.exit("the code expired, run again")


if __name__ == "__main__":
    main()
