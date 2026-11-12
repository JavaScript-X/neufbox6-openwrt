# LEDs and buttons

## LEDs (`/sys/class/leds`)
All 9 LEDs are driven by the SFR microcontroller (`nb6-hwmon`, PWM 0..31) through `pwm-leds`:

| sysfs name | Where | Used for |
|---|---|---|
| `red:service1` + `green:service1` | top LED **a** | Internet |
| `red:service2` + `green:service2` | top LED **b** | VPN |
| `red:service3` + `green:service3` | top LED **c** | health |
| `white:wan` | front | WAN traffic (netdev trigger on `extsw.2`) |
| `white:wlan` | front | Wi-Fi traffic (netdev trigger on `phy0-ap0`), blinks during WPS |
| `white:voip` | front | blinks 60 s when a new device gets a DHCP lease |

Orange = red 31 + green 10 (tune `color()` in `/usr/sbin/nb6-leds` if needed).

### `nb6-leds` daemon (`/etc/init.d/nb6-leds`)
| LED | Green | Orange | Red | Off |
|---|---|---|---|---|
| a | WAN link + ping 1.1.1.1 OK | WAN link, no internet | WAN cable unplugged | |
| b | VPN up (WireGuard handshake < 3 min) | blinking: connecting | | VPN down / not configured |
| c | OK | temperature > 70 °C or MemAvailable < 4 MB | blinking: dnsmasq/netifd dead or overlay full | |

**Spiral mode** (`/tmp/nb6-leds/spiral`): a/b/c cycle green → orange → red, one step apart
(1 s per step: BusyBox sleep has no sub-second support), toggled by the SFR button.

## Buttons (`/etc/rc.button/*`)
| Button | Linux key / name | Action |
|---|---|---|
| SFR (top) | `BTN_0` | toggle LED spiral mode |
| ECO (top) | `BTN_1` | toggle the UCI interface `vpn` (`disabled` + ifup/ifdown); 3 red flashes on LED b if no `vpn` interface |
| Wi-Fi slide switch | `wlan` | ON position = radios on, OFF = radios off |
| Wi-Fi switch pushed further | `wps` | `hostapd_cli wps_pbc` on every AP, wlan LED blinks (500 ms) for 120 s |
| Reset (rear) | `reset` | OpenWrt default: < 5 s reboot, > 5 s factory reset |

## Sensors
`/sys/class/hwmon/hwmon*/` exposes `temperature` (m°C), `voltage` (mV), `stats`
(boot/panic/oops counters), `release`, `leds_mode`, `watchdog`, `dmesg` (from the microcontroller).

## VPN
The ECO button and LED b expect a network interface named **`vpn`** (WireGuard recommended: the
image ships `kmod-wireguard`, `wireguard-tools`, `luci-proto-wireguard`). Create it in
LuCI → Network → Interfaces → Add → name `vpn`, protocol WireGuard.

## Hardware test results (2026-11-11)
- LED positions on the ring around the SFR button (same as SFR's documentation): a (service1) = top right,
  b (service2) = bottom, c (service3) = top left. Brightness 0..31; values above 31 switch the LED off.
- SFR spiral: works, one step per second (BusyBox `sleep` has no sub-second resolution).
- ECO: works (3 red flashes on LED b while no `vpn` interface exists).
- Wi-Fi switch: off/on works.
- Sensors: temperature ~51 °C, voltage ~12.2 V, boot counter readable.
- I2C load: the SFR microcontroller refuses (NAKs) writes when LEDs change faster than ~2/s; traffic and WPS blinks are therefore 500 ms. The driver retries up to 5 times.
- **WPS: not working yet.** The press is detected, but hostapd in OpenWrt 25.12 exposes no `hostapd.<iface>` ubus object or `hostapd_cli` here, so `wps_start` cannot be called. In one test the access point dropped ~14 s after the WPS press and needed `wifi up`. To investigate.
