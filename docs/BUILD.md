# Building

```sh
docker build -t nb6-builder docker/
mkdir -p /srv/nb6-work
docker run --rm --network host -v "$PWD":/port:ro -v /srv/nb6-work:/work nb6-builder /port/scripts/build.sh
```
- `--network host` avoids DNS failures inside the default Docker bridge (seen on ZimaOS).
- `OPENWRT_REF` selects the OpenWrt ref (default `openwrt-25.12`, i.e. latest 25.12; a tag like
  `v25.12.6` also works). `JOBS` sets the parallelism (default 3).
- Output: `/srv/nb6-work/openwrt/bin/targets/bmips/bcm6362/`
  - `…-squashfs-cfe.bin`: first flash from CFE (8 MB, padded)
  - `…-squashfs-sysupgrade.bin`: updates from OpenWrt
- First build ≈ 1.5 h on 3 cores (toolchain + kernel + packages). Later builds reuse the caches;
  `build.sh` always does `make target/linux/clean` so kernel patches/DTS changes are picked up.

## What `build.sh` does
1. Clone (or reset) OpenWrt at `OPENWRT_REF`, update and install the feeds.
2. `scripts/apply-board.sh patches/board`:
   - device tree `bcm6362-sfr-neufbox-6-sercomm-r0.dts`
   - image recipe (`bcm63xx-cfe`, board id `NB6-SER-r0`, chip 6362, lzma-loader)
   - default network (swconfig switch behind DSA port `extsw`)
   - kernel patches: RTL8367R RGMII fix, `nb6-hwmon` LED/sensor driver
   - kernel options: GPIO I²C, PWM, PWM LEDs, hwmon, LED triggers
3. `scripts/apply-wifi.sh patches/wifi`:
   - Alessio Ferri's OpenWrt commits (b43-tools, bcma SoC host for the 6362 WLAN)
   - b43 firmware from the D-Link DSL-3580L GPL `wl` driver (`ucode22_mimo`)
   - b43 patches: 7 upstream (N-PHY r8 / radio 2057 r8), 12 N-PHY fixes, 1 local (2.4 GHz only)
   - NB6 SPROM fixups appended to the DTS, `&wlan` enabled
   - forces `CONFIG_BCMA_HOST_SOC(_BRCM6362_WLAN)=y` (the `$(if …)` in kmod-bcma is evaluated without .config)
4. `scripts/apply-luci.sh`: OpenWrt logo in front of the host name in the bootstrap theme header,
   and the **Neufbox** theme (`theme/neufbox/*.css` over bootstrap's templates of the same LuCI version).
   The luci feed is reset before each update.
5. Copy `files/` into the image, install `config/nb6.config`, `make defconfig`, build.

## Gotchas found while porting
- Do not override `chosen/bootargs` in the DTS: the dtsi sets `earlycon`, without it a crash before
  the console is silent.
- The firmware choice `B43_FW_DSL_3580L` is a Kconfig *choice*: delete `tmp/` before `make defconfig`
  or the default (5.100.138) stays selected.
- Keep scripts with LF line endings (`.gitattributes`): CRLF breaks `set -o pipefail`.
