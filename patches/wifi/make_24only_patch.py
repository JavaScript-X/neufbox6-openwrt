"""Generate 940-b43-bcm6362-is-2ghz-only.patch: the BCM6362 integrated radio (2057 rev 8) is 2.4 GHz only,
but b43 lists 0x435f among dual-band devices, so LuCI offers 5 GHz and the PHY init fails on it."""
import difflib
import sys

src, out = sys.argv[1], sys.argv[2]
a = open(src).read().splitlines(keepends=True)
b = []
for line in a:
    if line.strip() == "case 0x435f: /* BCM6362 */":
        continue  # drop from the dual-band list
    b.append(line)
    if line.startswith("\tswitch (dev_id) {") and not any("BCM6362 integrated" in x for x in b):
        b += ["\tcase 0x435f: /* BCM6362 integrated WLAN: radio 2057 rev 8, 2.4 GHz only */\n",
              "\t\t*have_2ghz_phy = true;\n",
              "\t\t*have_5ghz_phy = false;\n",
              "\t\treturn;\n"]
assert len(b) == len(a) + 3, "anchors not found"
hdr = ("From: JavaScript_X <73346071+JavaScript-X@users.noreply.github.com>\n"
       "Subject: [PATCH] b43: treat the BCM6362 integrated WLAN as 2.4 GHz only\n\n"
       "The radio of the BCM6362 SoC WLAN (d11 corerev 22, radio 2057 rev 8) has no\n"
       "5 GHz support in b43 (no 5 GHz IPA gain table) and SFR Neufbox 6 boards have\n"
       "no 5 GHz front-end. Advertising band 2 only makes channel switches fail.\n\n")
d = difflib.unified_diff(a, b, "a/drivers/net/wireless/broadcom/b43/main.c",
                         "b/drivers/net/wireless/broadcom/b43/main.c")
open(out, "w").write(hdr + "".join(d))
print(open(out).read())
