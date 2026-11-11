"""Send one line to the box over COM5 and print what comes back.
Usage: python ser.py "command" [max_seconds] [idle_seconds]
       python ser.py --raw "keys"   (no newline added)"""
import sys
import time

import serial

args = sys.argv[1:]
raw = False
if args and args[0] == "--raw":
    raw = True
    args = args[1:]
cmd = args[0] if args else ""
max_s = float(args[1]) if len(args) > 1 else 5
idle_s = float(args[2]) if len(args) > 2 else 1.5

with serial.Serial("COM5", 115200, timeout=0.2) as s:
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
