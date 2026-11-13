# Flashing

The CFE bootloader (first 64 KB of flash) is never written, so a failed flash is always recoverable
from CFE. Keep the serial adapter around.

## What you need
- A 3.3 V USB-serial adapter (e.g. FT232 with the jumper on 3V3). Connect **GND, TX↔RX, RX↔TX only**.
  Do not connect VCC/3.3 V, and power the box only once GND+RXD are wired (otherwise the box gets
  back-powered through the TX line and its LEDs light up without 12 V).
- An Ethernet cable from the PC to a **LAN** port of the box, with the PC at **192.168.22.68/24**
  (CFE defaults: box 192.168.22.22, TFTP host 192.168.22.68).
- A TFTP server on the PC serving the `…-squashfs-cfe.bin` image (`tools/tftp_server.py`, read-only).

## First flash from CFE
1. Put the image in `./firmware` and start the TFTP server: `python tools/tftp_server.py 0.0.0.0`
   (another directory: `NB6_FIRMWARE_DIR`; port 69 needs administrator / root rights).
2. Start `python tools/flash_openwrt.py <image-cfe.bin>`. The serial port is `NB6_SERIAL`
   (default `COM5` on Windows, `/dev/ttyUSB0` elsewhere), the PC address `NB6_TFTP_HOST`
   (default 192.168.22.68). The script sends a key during the 1-second CFE countdown, then runs
   `f <NB6_TFTP_HOST>:<image>`.
3. Power the box. CFE downloads ~8 MB, prints `*** Image flash done ***`, resets and boots OpenWrt.
4. If the box is already sitting at a `CFE>` prompt, use `tools/flash_from_prompt.py <image>` instead.

CFE notes:
- `dm` can only read the first ~64 KB of flash (it crashes beyond); a full flash backup needs a
  SOIC-16 (300 mil) clip + programmer.
- CFE refuses to unpack more than ~4 MB ("Failed to decompress image") and itself lives around
  0x81400000; that is why the image uses the lzma-loader (see [PORTING.md](PORTING.md)).

## Updates from OpenWrt
Use the sysupgrade image (settings are kept). The image (~10.6 MB) is held in RAM during the
upgrade, which leaves little room on a 64 MB box: stop the optional services first.
```sh
service collectd stop; service nlbwmon stop; service ttyd stop; wifi down
sync; echo 3 > /proc/sys/vm/drop_caches
# from a PC on the LAN, e.g. python -m http.server 8000
wget -O /tmp/fw.bin http://<pc>:8000/openwrt-bmips-bcm6362-sfr_neufbox-6-sercomm-r0-squashfs-sysupgrade.bin
sysupgrade -T /tmp/fw.bin && sysupgrade -v /tmp/fw.bin
```
If the box runs out of memory anyway (OOM messages, nothing written yet), save the settings with
`sysupgrade -b /tmp/backup.tgz`, copy the archive off the box, flash the `cfe.bin` image from CFE
(above), then restore it with `sysupgrade -r /tmp/backup.tgz` and reboot.

## Back to the SFR firmware
SFR still serves the NB6 images (e.g. `http://download.nb6thd.neufbox.neuf.fr/nb6_Version%203.5.15rc2/NB6-MAIN-R3.5.15rc2`).
They are CFE image-tag files for chip 6362: flash them from CFE exactly like the OpenWrt `cfe.bin`.
(Untested on this board; the tag says `NB6-FXC-r0`, SFR used the same image for all NB6 boards.)

## Package updates (apk)
- Userspace packages can be updated with `apk add --upgrade <pkg>`, **one package at a time**
  (all at once runs out of the 54 MB of RAM, triggers a kernel panic and a reboot).
- Never update `base-files` from the official feed (it replaces `/etc/board.d/02_network` with a
  version that does not know the Neufbox) nor `kernel` (virtual package of the official kernel).
- Kernel modules from the official feed do not match this custom kernel: add them to
  `config/nb6.config` and rebuild.
