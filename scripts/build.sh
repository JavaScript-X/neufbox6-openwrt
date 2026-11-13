#!/bin/bash
# Reproducible build of OpenWrt for the SFR Neufbox 6 (NB6-SER-r0), with integrated Wi-Fi.
# Runs inside the docker/Dockerfile image (Debian 12, user "builder").
#
#   docker build -t nb6-builder docker/
#   docker run --rm --network host -v $PWD:/port:ro -v /path/to/work:/work nb6-builder /port/scripts/build.sh
#
# Env: OPENWRT_REF (default openwrt-25.12 = latest 25.12 branch; or a tag such as v25.12.6), JOBS (default 3)
set -euo pipefail
REF=${OPENWRT_REF:-openwrt-25.12}
JOBS=${JOBS:-3}
PORT=$(cd "$(dirname "$0")/.." && pwd)
SRC=/work/openwrt

echo "== $(date -u) source: $REF"
if [ ! -d "$SRC/.git" ]; then
  git clone -q --depth 1 --branch "$REF" https://github.com/openwrt/openwrt.git "$SRC"
else
  # reuse the existing tree (keeps build_dir/staging_dir caches) but reset all tracked/untracked sources
  git -C "$SRC" fetch -q --depth 1 origin "$REF"
  git -C "$SRC" checkout -q -f FETCH_HEAD
  git -C "$SRC" clean -q -fd -e /dl -e /feeds -e /build_dir -e /staging_dir -e /bin -e /tmp -e /logs -e /.config
fi
cd "$SRC"
git log -1 --format="   %h %cd %s"

echo "== $(date -u) feeds"
# undo the previous build's LuCI touches (apply-luci.sh) so the feed updates cleanly
[ -d feeds/luci/.git ] && git -C feeds/luci checkout -q -- .
./scripts/feeds update -a >/dev/null
./scripts/feeds install -a >/dev/null 2>&1

echo "== $(date -u) apply Neufbox 6 port"
bash "$PORT/scripts/apply-board.sh" "$PORT/patches/board" "$SRC"
bash "$PORT/scripts/apply-wifi.sh" "$PORT/patches/wifi" "$SRC"
bash "$PORT/scripts/apply-luci.sh" "$SRC"

echo "== $(date -u) image files (LED daemon, button handlers, first-boot defaults)"
rm -rf files && cp -r "$PORT/files" files
chmod 755 files/usr/sbin/* files/etc/init.d/* files/etc/rc.button/* files/etc/uci-defaults/*

echo "== $(date -u) config"
cp "$PORT/config/nb6.config" .config
rm -rf tmp
make defconfig >/dev/null
grep -E "DEVICE_sfr|B43_FW_DSL|kmod-b43=|kmod-switch-rtl8367=|wpad-mbedtls=|kmod-wireguard=" .config

echo "== $(date -u) download"
make -j"$JOBS" download >/dev/null

echo "== $(date -u) build"
make -j"$JOBS" target/linux/clean
nice -n 10 make -j"$JOBS" || { make -j1 V=s 2>&1 | tail -80; exit 1; }

echo "== $(date -u) DONE"
ls -la bin/targets/bmips/bcm6362/ | grep -i neufbox
