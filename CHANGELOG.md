# Changelog

## 2.6 (2026-11-15)
### Added
- **Network map** page (Neufbox > Network map): the internet connection and the VPN tunnels above the
  box, the devices connected right now below it (wired, Wi-Fi, guests), with their state; refreshed
  every 15 s. Drawn as SVG from the same data as the Home and Devices pages.
- **Maintenance** page (Neufbox > Maintenance), `nb6-maint`:
  - a **health check** every 5 minutes (cron) restarts DNS and DHCP, the web interface or the Wi-Fi
    service if they have stopped, and the statistics services when memory runs low; on by default;
  - an optional **weekly restart** at night (day and time to choose), skipped during an update or
    within an hour of a boot;
  - *Restart now*, and the recent events in plain words.

## 2.5 (2026-11-15)
### Added
- **French interface**: the Neufbox pages, their menus and messages are translated (`po/fr/nb6.po`,
  compiled to `nb6.fr.lmo` at build time), with LuCI's own French packages. LuCI follows the browser
  language. `scripts/i18n-extract.py` updates the catalog from the sources.
- **Wi-Fi** page (Neufbox > Wi-Fi): scans the networks around (names, channel, signal, never their
  hardware addresses), charts how crowded each channel is, recommends the best of channels 1, 6 and 11
  and switches to it in one click.
- **WPS pairing** works (tested with a Windows laptop): from the Wi-Fi page or with the Wi-Fi switch pushed
  past "on" (`nb6-wps`).
  hostapd is driven over ubus.
- **Games and servers** page (Neufbox > Games and servers): open a port towards a device in a few
  clicks, with presets (Minecraft, web server, remote desktop, SSH, Plex, WireGuard); the device keeps a
  fixed address. Warns when the box is behind another router. **UPnP** on/off for consoles
  (`luci-app-upnp`), with the ports they opened.

### Changed
- Error messages from the box are shown translated.

## 2.4 (2026-11-14)
### Added
- **Wi-Fi card** on the Home page: network name, password (hidden until asked), connected devices,
  a **QR code** to join from a phone camera, and editing of the name, password and on/off. The QR code
  is drawn in the browser (`nb6/qr.js`), the password goes to no other program.
- **Guest network** page (Neufbox > Guest network): guests join the same Wi-Fi name with their own
  password (hostapd multi-PSK, the b43 chip has a single access point), which puts them on
  192.168.30.0/24, internet only (and the commercial VPN when it is on). Ethernet port 4 can join it.
  QR code for guests. `nb6-guest`.
- **Names and fixed addresses** on the Devices page: a name and an always-same address per device
  (DHCP host). Guest devices are shown as such.
- **Backup** page (Neufbox > Backup): download the settings archive, or a copy of the whole 16 MB flash
  (CFE, firmware, nvram) in one click, streamed by `/cgi-bin/nb6-backup`; checksums of the CFE and
  nvram to check a copy.

### Fixed
- One-click update: the checksum file is fetched before the image (the update failed with "no checksum
  for the image"), and while flashing the kernel memory reserve is lowered and the image is kept out of
  the zram swap (sysupgrade ran out of memory). Downloads use curl with retries.
- Upgrades no longer turn ad blocking off or reset the Wi-Fi schedule: those defaults are applied
  on the first install only.
- Devices page: impossible signal values reported by the b43 driver (such as -4 dBm) are hidden.

## 2.3 (2026-11-14)
### Added
- **One-click updates**: the Home page shows the latest release on GitHub and installs it (download,
  checksum, `sysupgrade -T`, settings kept), with progress and automatic reconnection. `nb6-update`.
- **Devices** page (Neufbox > Devices): devices on the LAN with address, wired or Wi-Fi (signal) and
  traffic; per device, internet access allowed, blocked or blocked on a schedule, and Wake-on-LAN.
- **Ad blocking** page (Neufbox > Ad blocking): `adblock-fast` with Peter Lowe's ad server list, sized
  for 64 MB of RAM; off by default.

### Changed
- dnsmasq and netifd are protected from the out-of-memory killer (`oom_score_adj` -800).

## 2.2 (2026-11-14)
### Added
- **Home** page (Status > Home, opened after login): connection, box, VPN, connected devices, and a
  photo of the box with the current state of its ring LEDs. Data from `luci.nb6 home`;
  `nb6-leds` publishes the LED states in `/tmp/nb6-leds.state`.
- LuCI theme **Neufbox**: white pages, purple menus, red actions, always light, with a new login page; used by default
  (the bootstrap themes stay available). Built from bootstrap's templates by `scripts/apply-luci.sh`.

### Changed
- The Neufbox pages show drawn icons instead of a photo of the box.
- The ring LEDs are named after their function everywhere: Internet, VPN and System.
- Login page: full OpenWrt logo; Home page title: information icon.

## 2.1 (2026-11-14)
### Added
- Two WireGuard tunnels on the SFR button: tailnet (short press) and commercial VPN (long press),
  set up with `nb6-vpn`; the VPN LED shows which ones are up. See `docs/VPN.md`.
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
