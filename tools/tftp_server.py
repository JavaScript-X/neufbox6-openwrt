"""Minimal read-only TFTP server (RFC 1350 + blksize option) for flashing the Neufbox from CFE.
Serves the files of one directory only: $NB6_FIRMWARE_DIR, default ./firmware.
Usage: python tftp_server.py [bind_ip]   (port 69 needs administrator / root rights)"""
import os
import socket
import struct
import sys
import threading

ROOT = os.path.abspath(os.environ.get("NB6_FIRMWARE_DIR", "firmware"))
BIND = sys.argv[1] if len(sys.argv) > 1 else "0.0.0.0"


def serve(client, filename, opts):
    path = os.path.join(ROOT, os.path.basename(filename))
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind((BIND, 0))
    s.settimeout(3)
    if not os.path.isfile(path):
        s.sendto(struct.pack("!HH", 5, 1) + b"File not found\0", client)
        print(f"  {client[0]} asked for missing file {filename!r}", flush=True)
        return
    blksize = 512
    if "blksize" in opts:
        blksize = max(8, min(int(opts["blksize"]), 1468))
        oack = b"\0\x06" + b"blksize\0" + str(blksize).encode() + b"\0"
        for _ in range(5):
            s.sendto(oack, client)
            try:
                data, _ = s.recvfrom(1024)
                if data[:2] == b"\0\x04":
                    break
            except socket.timeout:
                continue
    size = os.path.getsize(path)
    print(f"  sending {os.path.basename(path)} ({size} bytes, blksize {blksize}) to {client[0]}", flush=True)
    with open(path, "rb") as f:
        block = 1
        while True:
            chunk = f.read(blksize)
            pkt = struct.pack("!HH", 3, block & 0xFFFF) + chunk
            for attempt in range(8):
                s.sendto(pkt, client)
                try:
                    data, _ = s.recvfrom(1024)
                    op, num = struct.unpack("!HH", data[:4])
                    if op == 4 and num == block & 0xFFFF:
                        break
                except socket.timeout:
                    continue
            else:
                print("  FAILED: no ACK from box", flush=True)
                return
            if len(chunk) < blksize:
                print(f"  DONE: {block} blocks sent", flush=True)
                return
            block += 1


main = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
main.bind((BIND, 69))
print(f"TFTP server on {BIND}:69 serving {ROOT}", flush=True)
while True:
    data, client = main.recvfrom(2048)
    if data[:2] != b"\0\x01":
        continue
    parts = data[2:].split(b"\0")
    filename = parts[0].decode(errors="replace")
    opts = {parts[i].decode().lower(): parts[i + 1].decode() for i in range(2, len(parts) - 1, 2) if parts[i]}
    print(f"request from {client[0]}: {filename} opts={opts}", flush=True)
    threading.Thread(target=serve, args=(client, filename, opts), daemon=True).start()
