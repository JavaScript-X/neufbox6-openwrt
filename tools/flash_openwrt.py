"""Catch CFE at power-on, then flash the OpenWrt image over TFTP with CFE's 'f' command.
Everything from the serial port is logged to flash-log.txt.
Usage: python flash_openwrt.py <image-cfe.bin>
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


def pump(s, buf, seconds):
    end = time.time() + seconds
    while time.time() < end:
        chunk = s.read(4096)
        if chunk:
            buf += chunk
            log.write(chunk)
            log.flush()
    return buf


with serial.Serial(PORT, 115200, timeout=0.05) as s:
    buf = bytearray()
    start = time.time()
    print("waiting for the box to power on...", flush=True)
    while time.time() - start < 600:
        chunk = s.read(4096)
        if chunk:
            buf += chunk
            log.write(chunk)
            log.flush()
        if b"Press any key" in buf or b"Auto run" in buf:
            s.write(b" ")
        if b"CFE>" in buf[-300:]:
            break
    else:
        print("TIMEOUT: CFE prompt never seen", flush=True)
        sys.exit(1)

    print("CFE caught, starting flash", flush=True)
    time.sleep(0.5)
    buf = bytearray()
    s.write(f"f {HOST}:{IMAGE}\r\n".encode())
    # TFTP + flash write can take a few minutes; stop when CFE reboots or prompts again
    t0 = time.time()
    while time.time() - t0 < 600:
        buf = pump(s, buf, 2)
        text = buf.decode(errors="replace")
        if "CFE>" in text[-200:] and len(text) > 200:
            print("CFE prompt returned (see flash-log.txt)", flush=True)
            break
        if "Starting program" in text or "Linux version" in text or ("Booting" in text and t0 + 20 < time.time()):
            print("box is rebooting into the new image", flush=True)
            pump(s, buf, 60)
            break
    print(buf.decode(errors="replace")[-3000:], flush=True)
log.close()
