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

# LuCI theme "Neufbox": a style layer over bootstrap (theme/neufbox/*.css), shipped inside the
# luci-theme-bootstrap package so it always uses the templates of the same LuCI version.
PORT=$(cd "$(dirname "$0")/.." && pwd)
THEME="$SRC/feeds/luci/themes/luci-theme-bootstrap"
mkdir -p "$THEME/htdocs/luci-static/neufbox" "$THEME/ucode/template/themes/neufbox"
cp "$PORT"/theme/neufbox/*.css "$THEME/htdocs/luci-static/neufbox/"
cp "$THEME/htdocs/luci-static/bootstrap/logo.svg" "$THEME/htdocs/luci-static/bootstrap/logo_48.png" \
   "$THEME/htdocs/luci-static/neufbox/"
for t in header footer sysauth; do
  cp "$THEME/ucode/template/themes/bootstrap/$t.ut" "$THEME/ucode/template/themes/neufbox/$t.ut"
done
# always light: the theme has no dark variant
sed -i "s/^\tconst darkpref = .*/\tconst darkpref = 'false';/" "$THEME/ucode/template/themes/neufbox/header.ut"
grep -q "const darkpref = 'false';" "$THEME/ucode/template/themes/neufbox/header.ut" \
  || { echo "apply-luci: darkpref line not found in header.ut" >&2; exit 1; }
echo "apply-luci: Neufbox theme added"
