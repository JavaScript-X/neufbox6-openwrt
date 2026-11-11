"""Create patches-6.12/900-rtl8367r-fix-RGMII-support.patch from the real 25.12 rtl8367.c."""
import difflib
import sys

src = sys.argv[1]
out = sys.argv[2]
a = open(src).read().splitlines(keepends=True)
b = []
for line in a:
    b.append(line)
    if line.startswith("#define   RTL8367_EXT_RGMXF_RXDELAY_MASK"):
        b += ["\n",
              "#define RTL8367_PHY_AD_REG\t\t\t0x130f\n",
              "#define    RTL8370_PHY_AD_DUMMY_1_OFFSET\t5\n",
              "#define    RTL8370_PHY_AD_DUMMY_1_MASK\t\t0xe0\n"]
    if "REG_WR(smi, RTL8367_CHIP_DEBUG1_REG, 0x7777);" in line:
        b.append("\t\tREG_RMW(smi, RTL8367_PHY_AD_REG, BIT(5), 0);\n")
assert len(b) == len(a) + 5, "anchors not found exactly once"
header = ("From: Miguel GAIO <miguel.gaio@efixo.com>\n"
          "Subject: [PATCH] rtl8367r: Fix RGMII support\n\n"
          "Ported from OpenWrt 23.05 bcm63xx 802-rtl8367r_fix_RGMII_support.patch\n"
          "(needed by the SFR Neufbox 6: RTL8367R on RGMII).\n\n")
diff = difflib.unified_diff(a, b, "a/drivers/net/phy/rtl8367.c", "b/drivers/net/phy/rtl8367.c")
open(out, "w").write(header + "".join(diff))
print(open(out).read())
