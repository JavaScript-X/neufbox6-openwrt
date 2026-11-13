# Porting notes

How the Neufbox 6 went from OpenWrt 23.05 (`bcm63xx`, Linux 5.15) to 25.12 (`bmips`, Linux 6.12),
what broke on the way and how it was fixed.

## Starting point
OpenWrt dropped the `bcm63xx` target after 23.05. Its successor `bmips` supports the BCM6362 SoC but
had no Neufbox 6 device. The 23.05 port was used as the reference:

- `bcm6361-sfr-neufbox-6-sercomm-r0.dts`: buttons on GPIO 10/12/24/25, RTL8367R switch on SMI
  (GPIO 18 SDA / 20 SCK), `realtek,extif0 = <1 5 1 1 1 1 1 1 2>`, partitions cfe / linux (imagetag) / nvram.
- `517-board_bcm6362.patch`: internal switch port 4 in RGMII, forced 1000 full, towards the RTL8367R.
- `802-rtl8367r_fix_RGMII_support.patch`: RGMII fix that 25.12 no longer carries.
- Network: ports 1-4 LAN, port 0 WAN ("Fibre"), port 9 tagged CPU.

## Port to bmips
- New device tree in the `bmips` (DSA) style: internal port 4 is `extsw`, fixed 1000 Mbit/s RGMII; the
  Realtek switch stays on swconfig with `realtek,extif = <9 1 5 1 1 1 1 1 1 2>` (the 6.12 driver
  expects the CPU port first). MAC address read from CFE at 0x6a0, as in 23.05.
- Image recipe: `bcm63xx-cfe` image tag, board id `NB6-SER-r0`, chip 6362, 16 MiB flash.
- RTL8367R RGMII fix regenerated against the 25.12 driver (`patches-6.12/900-…`).
- `02_network`: `ucidef_add_switch "switch0" "1:lan" "2:lan" "3:lan" "4:lan" "0:wan" "9t@extsw"`.

## Bring-up
| Try | Result | Cause | Fix |
|---|---|---|---|
| 1 | flash OK, silence after `Code Address: 0x81000000` | the DTS replaced the dtsi `bootargs = "earlycon"` | drop the `chosen` node |
| 2 | still silent, even with earlycon | the 6.12 kernel is 11.3 MB unpacked; CFE unpacks it at 0x81000000 while CFE itself runs at ~0x81400000-0x81530000, so the kernel overwrites CFE | move the load address |
| 3 | `Failed to decompress image. Corrupted image?` at 0x81800000 | CFE cannot unpack more than ~4 MB | boot through the lzma-loader |
| 4 | boots | `KERNEL := kernel-bin \| append-dtb \| lzma \| loader-lzma bin \| lzma`: CFE only unpacks the loader (~3.4 MB), which moves to 0x82000000 and unpacks the kernel to 0x80010000 | |

First boot checks: CFE MAC read correctly, RTL8367R detected (extif CPU 9), b53 port 4 linked at
1 Gbit/s RGMII, VLAN 1 = ports 1-4 + 9t, VLAN 2 = port 0. LAN, WAN and LuCI working.
Overlay (jffs2) 9.6 MB, 54 MB of RAM visible.

The box's UART drops bytes on long bursts: `tools/ser.py` sends 16-byte chunks.

## Integrated Wi-Fi
- `kmod-bcma` sets `CONFIG_BCMA_HOST_SOC=$(if $(CONFIG_TARGET_bmips_bcm6362),y,n)`, which is evaluated
  before `.config` is read, so the SoC host driver was never built. `scripts/fix-bcma-kconfig.py` forces it.
- `B43_FW_DSL_3580L` is a Kconfig choice; `tmp/` must be deleted before `make defconfig` or the default
  firmware (5.100.138) stays selected.
- First boot: `bcma-host-soc-brcm6362-wlan` finds chip 0x6362, 802.11 core rev 0x16; b43 reports
  "Broadcom 6362 WLAN", N-PHY rev 8, radio 2057 rev 8, firmware 784.2. 2.4 GHz scan and access point work
  (WPA2, channel 6, 20 MHz, 802.11g rates).
- The driver listed the chip as dual band, so LuCI offered 5 GHz and channel switches failed ("No 5GHz IPA
  gain table"). The radio has no 5 GHz front-end; patch 940 declares it 2.4 GHz only.

## Test results (first Wi-Fi build)
All links 0 % packet loss.

| Link | Packets | Average / max |
|---|---|---|
| Box → Wi-Fi client (64 B) | 60 | 5.4 / 83.9 ms |
| Box → Wi-Fi client (1400 B) | 30 | 8.3 / 44.8 ms |
| Box → wired LAN client (64 / 1400 B) | 30 + 30 | 1.1 / 1.3 ms |
| Wired LAN client → box (64 / 1400 B) | 50 + 20 | 0.08 / 0.35 ms |
| Box → upstream gateway | 60 | 2.4 / 16 ms |
| Box → 1.1.1.1 | 60 | 35 / 55 ms |

- HTTPS download on the box: 10 MB in 4 s (~20 Mbit/s, TLS on the 400 MHz CPU).
- After 16 min: load 0.15, ~24 MB free RAM, 8.1 MB free overlay, no kernel errors besides the known 5 GHz
  messages. Wi-Fi: 33 % retransmissions but 0.12 % failures at -32 dBm (rate control still imperfect).

## Package updates on a custom kernel
- `apk add --upgrade` of everything at once runs out of memory and panics the kernel (`kernel.panic=3`
  reboots it). One package at a time works for ordinary userspace packages. zram swap (see
  [EXTRAS.md](EXTRAS.md)) makes this much more reliable.
- `base-files` from the official feed replaces `/etc/board.d/02_network` with a version that does not
  know the Neufbox: a factory reset would then break the network. Do not update it with apk.
- `kernel` is a virtual package tied to the official kernel build: it cannot be updated with apk.
  Kernel and kernel modules change only with a new image.
