# Hardware: SFR Neufbox 6 (NB6-SER-r0)

Values read from the serial console (CFE + SFR firmware boot log) and by probing the board.

| Part | Detail |
|---|---|
| Board id (CFE) | `NB6-SER-r0` (Sercomm). The same SFR firmware also targets `NB6-FXC-r0/r1/r2`, `NB6-SER-r2` |
| SoC | Broadcom BCM6362B0 (BMIPS4350, 2 threads) @ 400 MHz, DDR 333 MHz |
| RAM | 64 MB |
| Flash | 16 MB SPI NOR, Macronix MX25L12845EMI-10G (SOP-16, 300 mil) |
| Bootloader | CFE 1.0.37-106.5, `NB6-BOOTLOADER-R1.28.0`, interruptible (1 s), runs at ~0x81400000 |
| Switch | Realtek RTL8367R, SMI on GPIO 18 (SDA) / 20 (SCK), RGMII to BCM6362 switch port 4 |
| Ports | RTL8367R port 0 = "Fibre" (WAN), ports 1-4 = LAN, port 9 = CPU |
| Wi-Fi | BCM6362 integrated: d11 core rev 22, N-PHY rev 8, radio 2057 rev 8, **2.4 GHz only**, PCI id 14e4:435f |
| Wi-Fi calibration | Not in OTP/SROM: the SFR firmware loads `/etc/wlan/bcmNB6-SER-r0_map.bin` (SROM rev 8, 448 bytes) |
| LEDs / sensors | SFR microcontroller on GPIO I²C (SDA = GPIO 30, SCL = GPIO 2), address `0x60` |
| USB | 1 × USB 2.0 (EHCI/OHCI) |
| Serial | 4-pin header: GND, TX, RX, 3.3 V, 115200 8N1, **3.3 V logic, do not connect VCC** |

## Flash layout
| Offset | Size | SFR firmware | OpenWrt |
|---|---|---|---|
| 0x000000 | 64 KB | bootloader (CFE) | `cfe` (read-only, holds the MAC at 0x6a0) |
| 0x010000 | 11.4 MB | main firmware | `firmware` (CFE image tag + kernel + squashfs + jffs2 overlay) |
| 0xB80000 | 1.5 MB | local data (jffs2) | ↑ |
| 0xD00000 | 1 MB | adsl PHY | ↑ |
| 0xE00000 | 1.9 MB | rescue firmware | ↑ |
| 0xFF0000 | 64 KB | bootloader config | `nvram` (read-only) |

## GPIOs (BCM6362, base 512 in Linux)
| GPIO | Function |
|---|---|
| 2 | I²C SCL (LED/hwmon microcontroller) |
| 10 | SFR button (active low) |
| 12 | Wi-Fi slide switch, ON position (active low) |
| 16 | ECO button (active low), found by probing, not in OpenWrt 23.05 |
| 18 / 20 | RTL8367R SMI SDA / SCK |
| 24 | Reset button (rear, active low) |
| 25 | Wi-Fi switch pushed further = WPS (active low) |
| 30 | I²C SDA (LED/hwmon microcontroller) |

## LED / hwmon microcontroller (I²C 0x60)
Protocol from Álvaro Fernández Rojas' 2020 `nb6-hwmon` driver (SMBus byte read/write):

| Register | Meaning |
|---|---|
| 0x10-0x18 | PWM of the 9 LEDs (0..31): red service1-3, green service1-3, white wan, voip, wlan |
| 0x22-0x23 | temperature (ADC) |
| 0x24-0x25 | voltage (ADC) |
| 0x26 / 0x27 | kernel log ring control / data |
| 0x31 | LED mode: disable, boot, boot-main, boot-tftp, boot-rescue, login, burning, downloading, wdt-temperature, wdt-voltage, panic, control |
| 0x90 | microcontroller firmware release |
| 0xa0-0xa2 | boot / panic / oops counters |
| 0xee | watchdog |

Without a driver the microcontroller keeps its own "boot" animation (orange blinking service LEDs).
Bit-banging it from userspace through sysfs GPIOs is too slow (it ACKs its address but NACKs the
register byte), so the in-kernel `i2c-gpio` bus is required.

## Not supported
- 5 GHz: the radio and the board front-end are 2.4 GHz only (SFR's own firmware only offers 11g/11n/11ng).
- ADSL/VDSL and VoIP (Broadcom closed drivers).
