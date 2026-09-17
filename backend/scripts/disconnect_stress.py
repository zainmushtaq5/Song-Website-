"""Aggressive disconnect stress test: reproduce the WinError 10054 killer.

Opens many sockets and aborts them mid-request (the exact pattern that used
to kill the Proactor-loop backend). The server must survive every round.
Run: uv run python scripts/disconnect_stress.py [rounds]
"""
import socket
import sys

ROUNDS = int(sys.argv[1]) if len(sys.argv) > 1 else 10

for round_no in range(ROUNDS):
    for _ in range(10):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", 8000))
        # send partial request then abort hard
        s.send(b"GET /api/songs HTTP/1.1\r\nHost: localhost\r\n")
        s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, b"\x01\x00\x00\x00\x00\x00\x00\x00")
        s.close()  # SO_LINGER 0 => hard RST, no graceful close

    # server must still respond
    s2 = socket.create_connection(("127.0.0.1", 8000), timeout=3)
    s2.send(b"GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
    resp = b""
    while True:
        chunk = s2.recv(4096)
        if not chunk:
            break
        resp += chunk
    s2.close()
    ok = b"200" in resp.split(b"\r\n", 1)[0]
    print(f"round {round_no + 1}/{ROUNDS}: health after 10 resets -> {'OK' if ok else 'DEAD'}")
    if not ok:
        sys.exit(1)

print("\nDISCONNECT STRESS: server survived all rounds")
