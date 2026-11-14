# Extras

Features added on top of the board port to make the most of 64 MB of RAM and a 400 MHz CPU.
All of them are in the image; the ones that change the box's behaviour are off until you turn them on.

| Feature | Package | Default | Where |
|---|---|---|---|
| Compressed swap in RAM | `zram-swap` | on | automatic |
| Faster LuCI (memory and polling tuning) | `/etc/sysctl.d/90-nb6.conf`, first-boot defaults | on | automatic |
| Hardware watchdog | kernel `bcm7038-wdt` + procd | on | automatic |
| Graphs: temperature, 12 V, CPU, RAM, traffic, Wi-Fi | `luci-app-statistics`, `collectd-mod-sensors` | on | LuCI > Statistics > Graphs |
| Per-device traffic | `luci-app-nlbwmon` | on | LuCI > Services > Bandwidth Monitor |
| Wi-Fi schedule | `luci-app-wifischedule` | prepared, off | LuCI > Services > Wifi Schedule |
| LED brightness and night mode | `nb6-leds` | full brightness, night mode off | `/etc/config/nb6` |
| Wake-on-LAN | `luci-app-wol`, `etherwake` | on | LuCI > Services > Wake on LAN |
| Web terminal | `luci-app-ttyd` | LAN only, root login | LuCI > Services > Terminal |

## zram swap
Part of the RAM is used as a compressed swap device (lzo), so the 54 MB that Linux sees behave like
roughly 80 MB. Package installs with `apk`, which used to be OOM-killed, and bursts of traffic no longer
kill services. Check it with `free` or `cat /proc/swaps`.

## Faster LuCI
Measured on the box: the first page after a few idle minutes took 1.1 to 2.3 s (LuCI's files had been
evicted from the cache and were read again from the xz-compressed squashfs), and 0.4 to 0.5 s with:
- `vm.swappiness=100` and `vm.vfs_cache_pressure=50` (`/etc/sysctl.d/90-nb6.conf`): idle program
  memory goes to the zram swap instead of the file cache being dropped;
- `luci.main.pollinterval=10`: status pages refresh every 10 s instead of 5 s;
- `uhttpd.main.max_requests=6`: up to 6 scripts at once instead of 3.

Pages also load faster with eco mode on (statistics paused) and with fewer LuCI apps installed.

## Watchdog
The BCM6362 has a hardware watchdog (`brcm,bcm7038-wdt`), and procd feeds `/dev/watchdog`. If the
system freezes, the SoC resets the box after a few seconds. The SFR firmware did the same
(`watchdog -t 10 -T 120`). Check it with `ubus call system watchdog`.

## Statistics
`nb6-hwmon` exposes the standard `temp1_input` (board temperature, m°C) and `in0_input` (12 V rail, mV),
so `lm-sensors` and collectd see them like any other sensor. collectd samples every 30 s and keeps its
RRD files in RAM (`/tmp/rrd`), so graphs restart after a reboot but the flash is never written.

## Wi-Fi schedule
A rule named `awake` is prepared: Wi-Fi on from 07:00 to 00:30 every day. To use it, enable both the
rule and the module in LuCI > Services > Wifi Schedule. The radio stays off outside that window; the
Wi-Fi slide switch still turns it on by hand.

## LED brightness and night mode
```sh
uci set nb6.leds.brightness='31'        # Internet, VPN and System LEDs: 1..31
uci set nb6.leds.night='1'              # dim between night_start and night_end
uci set nb6.leds.night_start='23:00'
uci set nb6.leds.night_end='07:00'
uci set nb6.leds.night_brightness='4'
uci commit nb6
```
`nb6-leds` reads these values every 30 s, so no restart is needed. The white traffic LEDs are not dimmed.

## Wake-on-LAN
LuCI > Services > Wake on LAN sends a magic packet to a machine on the LAN (a NAS or a PC set to wake on LAN).

## Web terminal
LuCI > Services > Terminal opens a shell in the browser (`ttyd`, port 7681, LAN only). It asks for the
root login, like SSH.
