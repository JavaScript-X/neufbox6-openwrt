"""Box already at the CFE> prompt: send the flash command and log everything (flash + first boot).
Usage: python flash_from_prompt.py <image-cfe.bin>
Serial port: $NB6_SERIAL; TFTP server address: $NB6_TFTP_HOST (default 192.168.22.68)."""
import os
import sys
import time

import serial

if len(sys.argv) != 2:
    sys.exit(__doc__)
IMAGE = sys.argv[1]
PORT = os.environ.get("NB6_SERIAL", "COM5" if os.name == "nt" else "/dev/ttyUSB0")  # serial adapter
HOST = os.environ.get("NB6_TFTP_HOST", "192.168.22.68")  # this PC, as seen by CFE
log = open("flash-log.txt", "wb")
with serial.Serial(PORT, 115200, timeout=0.1) as s:
    s.write(b"\r\n")
    time.sleep(0.5)
    s.write(f"f {HOST}:{IMAGE}\r\n".encode())
    end = time.time() + 420
    buf = bytearray()
    while time.time() < end:
        chunk = s.read(4096)
        if chunk:
            buf += chunk
            log.write(chunk)
            log.flush()
            t = buf.decode(errors="replace")
            if "Please press Enter" in t or "Kernel panic" in t or "Failed to decompress" in t:
                time.sleep(20)
                log.write(s.read(65536))
                break
print("done")
