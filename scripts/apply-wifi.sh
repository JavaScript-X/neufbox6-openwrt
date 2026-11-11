#!/bin/bash
# Adds EXPERIMENTAL BCM6362 integrated Wi-Fi to the Neufbox 6 port (OpenWrt 25.12 tree).
# Usage (inside openwrt-builder): apply-wifi.sh <wifi-dir> <openwrt-tree>
set -euo pipefail
W=$1; T=$2
cd "$T"

# 1. Alessio Ferri's OpenWrt commits: b43-tools update + rev22 squash support, bcma SoC host for the 6362 WLAN
for c in 88300c83f3 06bf4fa978 5ba97f31bc; do
  git apply --check "$W/openwrt-commits/$c.patch" 2>/dev/null && git apply "$W/openwrt-commits/$c.patch" && echo "applied $c" || echo "skip $c (already applied?)"
done

# 2. b43 firmware from the D-Link DSL-3580L GPL wl driver (ucode22_mimo) - adapted to 25.12's broadcom.mk
python3 - package/kernel/mac80211/broadcom.mk <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
if "B43_FW_DSL_3580L" not in s:
    fw = ('ifneq ($(CONFIG_B43_FW_DSL_3580L),)\n'
          '  # OEM 6.30-family driver blob from the D-Link DSL-3580L GPL release (BCM6362 ucode22_mimo).\n'
          '  PKG_B43_FWV4_NAME:=DSL-3580_EU\n'
          '  PKG_B43_FWV4_VERSION:=1.00_10232013_GPL\n'
          '  PKG_B43_FWV4_OBJECT:=$(PKG_B43_FWV4_NAME)_$(PKG_B43_FWV4_VERSION)/bcmdrivers/broadcom/net/wl/impl14_v07/wlDSL-3580_EU.o_save\n'
          '  PKG_B43_FWV4_SOURCE:=$(PKG_B43_FWV4_NAME)_$(PKG_B43_FWV4_VERSION).tar.gz\n'
          '  PKG_B43_FWV4_SOURCE_URL:=https://github.com/aleferri/dsl-3580l-sources/releases/download/gpl-release/\n'
          '  PKG_B43_FWV4_HASH:=49d3e23961cc9615feebdffeb0719711d46c803ace4f7a4524e22b8b2f900676\n'
          'else\n')
    a = s.index("#Broadcom firmware\n") + len("#Broadcom firmware\n")
    s = s[:a] + fw + s[a:]
    # close the extra 'else' right before the OPENFIRMWARE block
    b = s.index("ifneq ($(CONFIG_B43_OPENFIRMWARE),)")
    s = s[:b] + "endif\n" + s[b:]
    opt = ('\tconfig B43_FW_DSL_3580L\n'
           '\t\tbool "Firmware ucode22_mimo from D-Link DSL-3580L OEM driver (BCM6362)"\n'
           '\t\thelp\n'
           '\t\t  Firmware for the Broadcom BCM6362 integrated 2.4 GHz N-PHY\n'
           '\t\t  (d11 corerev 22 + radio 2057 rev 8).\n\n')
    c = s.index("\tconfig B43_OPENFIRMWARE")
    s = s[:c] + opt + s[c:]
    s = s.replace('\t\tdefault "16,28,29,30" if TARGET_bcm47xx_mips74k\n',
                  '\t\tdefault "16,28,29,30" if TARGET_bcm47xx_mips74k\n\t\tdefault "22" if TARGET_bmips_bcm6362\n', 1)
    old = ('ifeq ($(CONFIG_B43_OPENFIRMWARE),y)\n\ttar xzf "$(DL_DIR)/$(PKG_B43_FWV4_SOURCE)" -C "$(PKG_BUILD_DIR)"\nelse\n')
    new = ('ifeq ($(CONFIG_B43_OPENFIRMWARE),y)\n\ttar xzf "$(DL_DIR)/$(PKG_B43_FWV4_SOURCE)" -C "$(PKG_BUILD_DIR)"\n'
           'else ifeq ($(CONFIG_B43_FW_DSL_3580L),y)\n'
           '\t# not a gz, even if the extension is gz\n'
           '\ttar xjf "$(DL_DIR)/$(PKG_B43_FWV4_SOURCE)" -C "$(PKG_BUILD_DIR)"\n'
           '\ttar xzf "$(PKG_BUILD_DIR)/$(PKG_B43_FWV4_NAME)_$(PKG_B43_FWV4_VERSION)/bcm963xx_.L._consumer.tar.gz" -C "$(PKG_BUILD_DIR)/$(PKG_B43_FWV4_NAME)_$(PKG_B43_FWV4_VERSION)"\n'
           'else\n')
    assert old in s, "install block not found"
    s = s.replace(old, new, 1)
    open(p, "w").write(s)
    print("broadcom.mk patched")
EOF

# 3. b43 driver: 7 upstream commits (N-PHY r8 + radio 2057 r8, merged in Linux 2026-05) + 12 N-PHY fixes
D=package/kernel/mac80211/patches/brcm
n=900; for f in "$W"/b43-upstream/*.patch; do cp "$f" "$D/$n-b43-$(basename "$f" .patch | cut -d- -f2-).patch"; n=$((n+1)); done
n=920; for f in "$W"/b43-fixes/*.patch; do cp "$f" "$D/$n-$(basename "$f")"; n=$((n+1)); done

# 4. Device tree + packages for the Neufbox 6
DTS=target/linux/bmips/dts/bcm6362-sfr-neufbox-6-sercomm-r0.dts
grep -q "bcm6362-sprom" "$DTS" || cat "$W/nb6-wifi.dtsi" >> "$DTS"
sed -i 's|  DEVICE_PACKAGES += $(USB2_PACKAGES) kmod-switch-rtl8367|  DEVICE_PACKAGES += $(USB2_PACKAGES) kmod-switch-rtl8367 \\\n    $(B43_PACKAGES) broadcom-6362-sprom|' target/linux/bmips/image/bcm6362.mk

echo "wifi support applied (package selection lives in config/nb6.config)"
