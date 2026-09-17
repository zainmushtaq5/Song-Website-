"""Hammer the running backend and watch python.exe memory for runaway growth."""
import json
import re
import subprocess
import sys
import urllib.request

PID = sys.argv[1] if len(sys.argv) > 1 else "23980"


def mem_mb() -> int:
    out = subprocess.check_output(["tasklist", "/FI", f"PID eq {PID}", "/FO", "CSV"]).decode()
    m = re.search(r'"([\d,]+) K"', out)
    return int(m.group(1).replace(",", "")) // 1024 if m else -1


songs = json.load(urllib.request.urlopen("http://localhost:8000/api/songs"))
sid = songs[0]["id"]
print("start WS MB:", mem_mb())
failures = 0
for i in range(300):
    kind = i % 3
    try:
        if kind == 0:
            urllib.request.urlopen("http://localhost:8000/api/songs?sort=trending").read()
        elif kind == 1:
            urllib.request.urlopen(
                f"http://localhost:8000/api/songs/{sid}/play", data=b""
            ).read()
        else:
            urllib.request.urlopen("http://localhost:8000/api/search?q=full").read()
    except Exception as e:  # noqa: BLE001
        failures += 1
        print(f"req {i} failed: {e}")
        break
    if i % 100 == 99:
        print(f"after {i + 1} reqs WS MB:", mem_mb())
print("end WS MB:", mem_mb(), "| failures:", failures)
