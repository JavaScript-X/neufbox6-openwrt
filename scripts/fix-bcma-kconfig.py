"""The $(if $(CONFIG_TARGET_bmips_bcm6362),y,n) in kmod-bcma KCONFIG is evaluated at metadata scan
time (no .config loaded) and always yields n. Force y for this NB6 build."""
import sys

p = sys.argv[1]
s = open(p).read()
for sym in ("CONFIG_BCMA_HOST_SOC", "CONFIG_BCMA_HOST_SOC_BRCM6362_WLAN"):
    s = s.replace(f"{sym}=$(if $(CONFIG_TARGET_bmips_bcm6362),y,n)", f"{sym}=y")
open(p, "w").write(s)
print([l.strip() for l in s.splitlines() if "BCMA_HOST_SOC" in l])
