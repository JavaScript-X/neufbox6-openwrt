"""Send one line to the box over the serial console and print what comes back.
Serial port: $NB6_SERIAL (default COM5 on Windows, /dev/ttyUSB0 elsewhere).
Usage: python ser.py "command" [max_seconds] [idle_seconds]
       python ser.py --raw "keys"   (no newline added)"""
import os
import sys
import time

import serial

PORT = os.environ.get("NB6_SERIAL", "COM5" if os.name == "nt" else "/dev/ttyUSB0")  # serial adapter

args = sys.argv[1:]
raw = False
if args and args[0] == "--raw":
    raw = True
    args = args[1:]
cmd = args[0] if args else ""
max_s = float(args[1]) if len(args) > 1 else 5
idle_s = float(args[2]) if len(args) > 2 else 1.5

with serial.Serial(PORT, 115200, timeout=0.2) as s:
    s.reset_input_buffer()
    data = (cmd if raw else cmd + "\n").encode()
    for i in range(0, len(data), 16):  # pace input: the box UART drops bytes on long bursts
        s.write(data[i:i + 16])
        s.flush()
        time.sleep(0.02)
    out = bytearray()
    start = last = time.time()
    while time.time() - start < max_s:
        chunk = s.read(4096)
        if chunk:
            out += chunk
            last = time.time()
        elif out and time.time() - last > idle_s:
            break
    sys.stdout.buffer.write(out)
