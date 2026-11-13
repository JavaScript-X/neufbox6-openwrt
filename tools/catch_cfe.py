"""Wait for the box to (re)boot and stop it at the CFE prompt.
Sends a space every 50 ms (no Enter) until "CFE>" appears. Max 5 minutes.
Serial port: $NB6_SERIAL (default COM5 on Windows, /dev/ttyUSB0 elsewhere)."""
import os
import time

import serial

PORT = os.environ.get("NB6_SERIAL", "COM5" if os.name == "nt" else "/dev/ttyUSB0")  # serial adapter

log = open("cfe-catch-log.txt", "wb")
with serial.Serial(PORT, 115200, timeout=0.05) as s:
    s.write(b"\x03")  # leave the login prompt without typing anything
    buf = bytearray()
    start = time.time()
    while time.time() - start < 300:
        chunk = s.read(4096)
        if chunk:
            buf += chunk
            log.write(chunk)
            log.flush()
        if b"Press any key" in buf or b"Auto run" in buf or b"CFE version" in buf:
            s.write(b" ")
        if b"CFE>" in buf[-200:]:
            s.write(b"\r\n")
            time.sleep(0.5)
            log.write(s.read(4096))
            print("CAUGHT CFE PROMPT")
            break
    else:
        print("TIMEOUT - no CFE prompt seen")
log.close()
