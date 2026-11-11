"""Box already at the CFE> prompt: send the flash command and log everything (flash + first boot)."""
import sys
import time

import serial

IMAGE = sys.argv[1]
log = open("flash-log.txt", "wb")
with serial.Serial("COM5", 115200, timeout=0.1) as s:
    s.write(b"\r\n")
    time.sleep(0.5)
    s.write(f"f 192.168.22.68:{IMAGE}\r\n".encode())
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
