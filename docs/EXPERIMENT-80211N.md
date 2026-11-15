# Experiment: 802.11n on the integrated Wi-Fi

Branch `experimental/80211n`. Not part of any release.

## Why it is missing
The BCM6362 radio is an N-PHY (rev 8, radio 2057 rev 8), likely 2x2, and SFR's closed `wl` driver used
802.11n on it. The open `b43` driver has no 802.11n code at all, for any chip: no HT capability, no MCS
rates, and received HT frames are decoded as CCK, fail and are dropped.

## What the patch does
`patches/wifi/b43-local/950-b43-experimental-802.11n.patch`, applied after the other b43 patches:
- advertises HT on 2.4 GHz: MCS 0-7 (one stream), 20 MHz, long guard interval, no A-MPDU (b43 has no
  `ampdu_action`, so mac80211 declines block-ack sessions);
- transmit: HT-SIG PLCP, HT frame type, PHY control word 1 (modulation and coding of the MCS) and the
  mixed-mode L-SIG lengths of the main and fallback rates. These follow `brcmsmac`, whose `d11txh` has the
  same layout as the b43 v4 firmware header (`B43_FW_HDR_598`, firmware 784 here);
- receive: HT frames (frame type 2 and 3) are decoded from the HT-SIG (MCS, 40 MHz, short GI);
- module parameter `ht=0` turns it off without rebuilding.

To try it: build with the patch, then set `option htmode 'HT20'` on `wifi-device radio0` (without it, or
with `ht=0`, the access point stays 802.11g).

## Results (2026-11-15, Windows laptop with an Intel AX211, -28 to -31 dBm)

| | 802.11g (`ht=0`) | 802.11n (`ht=1`, HT20) |
|---|---|---|
| Link rate box to laptop | 24-54 Mbit/s | MCS 4-6, up to 58.5 Mbit/s |
| Link rate laptop to box | 54 Mbit/s | MCS 7, 65 Mbit/s |
| Download through the box (30 MB) | 8.7-10.8 Mbit/s | 7.3-10.1 Mbit/s |
| Upload through the box (20 MB) | 12.5-12.9 Mbit/s | 9.7-10.2 Mbit/s |

The HT link works in both directions (Windows reports 802.11n, the box sends MCS 6 and receives MCS 7), but
real throughput does not improve. Measurements during a download:
- the box's own download from the same server: 80-120 Mbit/s, so the wired side is not the limit;
- CPU: core 0 about 40 % busy, core 1 about 20 %, so the CPU is not the limit either;
- **retries: about 11 800 retries for 21 600 frames sent (55 %), plus about 110 failed frames**, at a very
  strong signal, in 802.11g as much as in 802.11n.

More than half of the airtime goes to retransmissions. Until the transmit quality of the N-PHY is fixed
(calibration: TX IQ/LO, power control, or the receiver of a very close client being overloaded), a faster
modulation cannot help, and aggregation (A-MPDU) would multiply the losses.

## Next steps, if picked up again
1. Find the cause of the retries in 802.11g first: test at several distances (overload of a client at
   -30 dBm), compare TX power indexes and the IQ/LO calibration results with SFR's `wl` (`wl phy_*`
   commands on the SFR firmware), and check the per-rate TX power offsets.
2. Only then: short guard interval, then A-MPDU (TX aggregation in the d11txh fields `max_n_mpdus`,
   `max_a_bytes_*`, and an `ampdu_action`), then two streams (MCS 8-15, `B43_TXH_PHY1_MODE_SDM`).
