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
| Devices, internet blocking and schedules | `nb6/devices` page, firewall rules | on | LuCI > Neufbox > Devices |
| Ad blocking | `adblock-fast`, Peter Lowe's list | off | LuCI > Neufbox > Ad blocking |
| One-click updates | `nb6-update` | on (checks every 6 h) | LuCI > Status > Home, Software card |
| Wi-Fi card and QR code | `nb6/home` page, `nb6/qr.js` | on | LuCI > Status > Home, Wi-Fi card |
| Guest network | `nb6-guest`, hostapd multi-PSK | off | LuCI > Neufbox > Guest network |
| Names and fixed addresses | DHCP hosts `nb6_host_<mac>` | on | LuCI > Neufbox > Devices |
| Settings and full flash backup | `/cgi-bin/nb6-backup` | on | LuCI > Neufbox > Backup |

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

## Devices
LuCI > Neufbox > Devices lists the devices seen on the LAN (DHCP leases, neighbour table, Wi-Fi
stations) with their address, connection (wired, or Wi-Fi with signal) and traffic (nlbwmon).
Per device:
- **Name**: a name, and optionally an address that is always the same (a DHCP host named
  `nb6_host_<mac>`). The name also resolves on the local network. The device gets the address at its
  next connection.
- **Internet access**: allowed, blocked, or blocked during set hours on chosen days (parental control).
  It is a firewall rule named `nb6_block_<mac>` (`src_mac`, `start_time`, `stop_time`, `weekdays`);
  the device keeps its access to the local network.
- **Wake up**: sends a Wake-on-LAN packet.

Guest devices are listed too, marked *Guest network*, without these actions.
The b43 driver sometimes reports impossible signal values (such as -4 dBm); they are not shown.

## Ad blocking
LuCI > Neufbox > Ad blocking turns `adblock-fast` on or off. It answers the ad servers of
[Peter Lowe's list](https://pgl.yoyo.org/adservers/) (about 3 500 domains) with an empty address, for
every device that uses the box as its DNS server. dnsmasq then uses about 1.5 MB of RAM.

Bigger lists do not fit: with the Hagezi Light list (90 000 domains, about 6 MB) dnsmasq was killed for
lack of memory under load, which stops DNS and DHCP for the whole network. As a safety net, `nb6-leds`
gives dnsmasq and netifd an `oom_score_adj` of -800 so that the kernel stops other processes first.

## Updates from the web interface
The **Software** card of the Home page compares the installed version (`/etc/nb6-release`) with the
latest release on GitHub (checked at most every 6 hours, or with *Check for updates*). *Install*
runs `nb6-update install`, which:
1. stops the optional services and Wi-Fi to free memory, lowers the kernel memory reserve and keeps
   the image out of the zram swap (the image is held in RAM and does not compress);
2. downloads the release's `SHA256SUMS`, then the sysupgrade image, and checks the checksum;
3. runs `sysupgrade -T`, then `sysupgrade` with the settings kept.

Nothing is written if any step fails; the services come back and the error is shown. The box restarts
on its own and the page reconnects when it is back (about 10 minutes for the first boot).
From the command line: `nb6-update check`, `nb6-update install`, `nb6-update status`.

## Wi-Fi card and QR code
The **Wi-Fi** card of the Home page shows the network name, the password (hidden until *show*), the
connected devices and the channel. *QR code* shows a code that phone cameras (Android and iOS) read to join
without typing the password. It is generated in the browser by `nb6/qr.js` (byte mode, level M), so the
password goes to no other program. *Edit* changes the name, the password, or turns the Wi-Fi off; the Wi-Fi
restarts for a few seconds.

## Guest network
LuCI > Neufbox > Guest network gives visitors internet access, kept apart from your devices.

The b43 chip has a single access point, so there is no second Wi-Fi name. Instead, guests join the **same
Wi-Fi name with their own password** (hostapd multi-PSK: a `wifi-station` with its own key and VLAN 3, and a
`wifi-vlan` bridged into `br-guest`). The page creates a random password and shows a QR code for guests.

| | Home network | Guest network |
|---|---|---|
| Addresses | 192.168.1.0/24 | 192.168.30.0/24 (DHCP, 2 h leases) |
| Internet | yes | yes (and through the commercial VPN when it is on) |
| Home devices, tailnet | yes | no |
| Box settings (LuCI, SSH) | yes | no (only DHCP and DNS) |

*Ethernet port 4 also goes to the guest network* moves that port into VLAN 3 (switch VLAN 1 keeps ports 1-3).
A computer plugged into port 4 then no longer reaches the home network.
Turning the guest network off keeps its password for next time. From the command line:
`nb6-guest on <password> [port4]`, `nb6-guest off`, `nb6-guest status`.

## Backup
LuCI > Neufbox > Backup offers two downloads, streamed by `/cgi-bin/nb6-backup` (which checks the LuCI
session; nothing is copied to RAM first):
- **Settings**: the same archive as `sysupgrade -b`, to restore in System > Backup / Flash Firmware. It
  contains the Wi-Fi passwords and the VPN private keys.
- **Full flash copy**: the whole 16 MB chip, `cfe` + `firmware` + `nvram` in flash order (about 12 s on the
  LAN). The nvram holds the MAC address and radio calibration of this box, so keep this file: with it the box
  can be brought back to this exact state through the serial console ([FLASHING.md](FLASHING.md)).

The page lists the flash partitions with the SHA-256 of `cfe` and `nvram`: the first and last 64 KB of a
flash copy must match them.
