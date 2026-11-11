#!/bin/bash
# Applies the SFR Neufbox 6 (NB6-SER-r0) port to an OpenWrt 25.12 tree (bmips/bcm6362).
# Usage: apply.sh <patchdir> <openwrt-tree>
set -euo pipefail
P=$1; T=$2
B=$T/target/linux/bmips

cp "$P/target/linux/bmips/dts/bcm6362-sfr-neufbox-6-sercomm-r0.dts" "$B/dts/"
cp "$P/target/linux/bmips/patches-6.12/900-rtl8367r-fix-RGMII-support.patch" "$B/patches-6.12/"

grep -q "sfr_neufbox-6-sercomm-r0" "$B/image/bcm6362.mk" || cat "$P/image-bcm6362.mk.append" >> "$B/image/bcm6362.mk"

# Default network: RTL8367R swconfig switch behind DSA user port "extsw".
# Ports as on 23.05: 1-4 LAN, 0 WAN ("Fibre"), 9 = CPU (tagged).
N=$B/bcm6362/base-files/etc/board.d/02_network
if ! grep -q "sfr,neufbox-6-sercomm-r0" "$N"; then
  python3 - "$N" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
entry = ('sfr,neufbox-6-sercomm-r0)\n'
         '\tucidef_add_switch "switch0" \\\n'
         '\t\t"1:lan" "2:lan" "3:lan" "4:lan" "0:wan" "9t@extsw"\n'
         '\t;;\n')
s = s.replace("esac\n", entry + "esac\n", 1)
open(p, "w").write(s)
EOF
fi

echo "applied:"; ls -1 "$B/dts/" | grep neufbox; grep -n -A3 neufbox "$N"; tail -12 "$B/image/bcm6362.mk"
