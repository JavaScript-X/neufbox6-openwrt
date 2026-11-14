# Changelog

## Unreleased
### Added
- LuCI theme **Neufbox**: white, red and purple, always light, with a new login page; used by default
  (the bootstrap themes stay available). Built from bootstrap's templates by `scripts/apply-luci.sh`.

### Changed
- The Neufbox pages show drawn icons instead of a photo of the box.

## 2.1 (2026-11-14)
### Added
- Two WireGuard tunnels on the SFR button: tailnet (short press) and commercial VPN (long press),
  set up with `nb6-vpn`; LED b shows which ones are up. See `docs/VPN.md`.
- LuCI menu **Neufbox**: VPN page (tunnel status and on / off, tailnet settings and key, import of a
  provider's WireGuard file) and LEDs / eco mode page; backend `luci.nb6` (rpcd). The pages show a
  photo of the box and the logos of Tailscale, WireGuard, OpenWrt and the commercial VPN provider
  (found from the imported file).
- OpenWrt logo next to the host name at the top left of LuCI.
- Eco mode on the ECO button (`nb6-eco`): ring LEDs dimmed, traffic LEDs off, statistics paused,
  optionally Wi-Fi off; kept across reboots. See `docs/LEDS-BUTTONS.md`.

### Changed
- The VPN moves from the ECO button to the SFR button; the ECO button now switches eco mode.
- Faster LuCI: memory tuning for zram (`vm.swappiness=100`, `vm.vfs_cache_pressure=50`), status pages
  refresh every 10 s, uhttpd runs 6 scripts at once. First page after idle: 1.1-2.3 s → 0.4-0.5 s.

## 2.0 (2026-11-13)
### Added
- zram compressed swap.
- LuCI statistics: board temperature, 12 V rail, CPU, memory, traffic, Wi-Fi (`luci-app-statistics`).
- Per-device traffic accounting (`luci-app-nlbwmon`).
- Wi-Fi schedule (`luci-app-wifischedule`), prepared and disabled by default.
- Ring LED brightness and night dimming (`/etc/config/nb6`).
- Wake-on-LAN (`luci-app-wol`) and a LAN-only web terminal (`luci-app-ttyd`).
- `nb6-hwmon`: standard `temp1_input` / `in0_input` sensor attributes.
- Documentation: `docs/EXTRAS.md`, `docs/PORTING.md`, this changelog.
- Documentation: full flash backup from OpenWrt and restore with a CH341A (`docs/FLASHING.md`).

### Changed
- `nb6-leds` checks the states every 5 s (internet every 30 s, DHCP leases every 10 s) instead of every
  second; the 1 s loop only handles blinking.
- Updates from OpenWrt: free memory before `sysupgrade` (documented in `docs/FLASHING.md`).
- Flashing tools read the serial port, TFTP host and firmware directory from `NB6_SERIAL`,
  `NB6_TFTP_HOST` and `NB6_FIRMWARE_DIR`.

### Removed
- The SFR button LED animation. The SFR button is not assigned.
- The French porting journal, replaced by `docs/PORTING.md`.

## 1.0 (2026-11-12)
- OpenWrt 25.12 / Linux 6.12 on the `bmips/bcm6362` target: device tree, CFE image with lzma-loader,
  RTL8367R gigabit switch with RGMII fix.
- Integrated 2.4 GHz Wi-Fi with b43 (access point, WPA2).
- Front LEDs and sensors through the SFR microcontroller (`nb6-hwmon`), `nb6-leds` status daemon.
- ECO button toggles the `vpn` interface; Wi-Fi slide switch turns the radio on and off.
- WireGuard and the full `wpad`.
