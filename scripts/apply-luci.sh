#!/bin/bash
# LuCI touches for the Neufbox 6 image, applied to the luci feed of an OpenWrt tree.
#   - bootstrap theme: OpenWrt logo in front of the host name at the top left
# Usage: apply-luci.sh <openwrt-tree>
set -euo pipefail
SRC=${1:?usage: apply-luci.sh <openwrt-tree>}
HDR="$SRC/feeds/luci/themes/luci-theme-bootstrap/ucode/template/themes/bootstrap/header.ut"
[ -f "$HDR" ] || { echo "apply-luci: $HDR not found" >&2; exit 1; }

if ! grep -q 'class="brand-logo"' "$HDR"; then
  sed -i 's#<a class="brand" href="/">{{#<a class="brand" href="/" style="white-space:nowrap"><img class="brand-logo" src="{{ media }}/logo.svg" alt="" width="22" height="22" style="vertical-align:middle;margin:-4px .4em 0 0;border-radius:4px">{{#' "$HDR"
fi
grep -q 'class="brand-logo"' "$HDR" || { echo "apply-luci: brand markup not found, theme changed?" >&2; exit 1; }
echo "apply-luci: logo added to the bootstrap header"
