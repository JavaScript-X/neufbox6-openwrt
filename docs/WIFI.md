# Integrated Wi-Fi (BCM6362)

The BCM6362 has an on-chip 2.4 GHz 802.11n radio (d11 core rev 22, N-PHY rev 8, radio 2057 rev 8).
It was never supported by OpenWrt (SFR used Broadcom's closed `wl` 5.100.138 driver). This port reuses
the 2026 work of **Alessio Ferri** on the D-Link DSL-3580L (same SoC):

| Piece | Source |
|---|---|
| bcma host driver for the SoC WLAN backplane, DT node `wlan: bus@10004000` | Ferri, OpenWrt commit `5ba97f31bc` |
| b43: corerev 22, radio 2057 rev 8 tables, IPA gain, channel table, power offsets | Linux mainline (May 2026), 7 commits |
| b43: 12 N-PHY calibration/PAPD fixes | `b43-6362-wip` |
| b43 firmware `ucode22_mimo`, `n0initvals22`, `n0bsinitvals22` | extracted by b43-fwcutter from the DSL-3580L GPL `wl` driver |
| 2.4 GHz only band declaration | this repo (`patches/wifi/b43-local/940-…`) |

## Calibration (SPROM)
The chip has no programmed SROM/OTP. The SFR firmware contains one calibration file per board
(`/etc/wlan/bcmNB6-SER-r0_map.bin`). Compared with OpenWrt's generic `bcm6362-sprom.bin`, 20 words
differ (PA calibration of both chains, per-rate power offsets); they are applied as
`brcm,sprom-fixups` in `patches/wifi/nb6-wifi.dtsi`, plus the `dev_id = 0x435f` override.
The Wi-Fi MAC is CFE base MAC + 1.

## Results (2026-11-11)
- Scan: all neighbouring 2.4 GHz networks seen with coherent RSSI.
- Access point: WPA2-PSK, client associated, DHCP OK, 802.11g rates (54 Mbit/s), ping 0 % loss
  (5-8 ms average). ~33 % TX retries (rate control / calibration not perfect yet).
- 5 GHz: impossible, the radio and front-end are 2.4 GHz only. Before the local patch b43 advertised
  band 2 and selecting 5 GHz in LuCI killed the AP ("No 5GHz IPA gain table").
- Known harmless messages: `Unknown spuravoidance settings for chip 0x6362`.

## Configuration
LuCI → Network → Wireless: band 2.4 GHz, channel 1-13, country code set (FR here). WPS push button
is enabled by the first-boot defaults (needs `wpad-mbedtls`, the full wpad).
