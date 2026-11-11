# Journal de portage (français)

Journal brut tenu pendant le portage du 11 novembre 2026 (adresses MAC masquées).

# Portage OpenWrt 25.12 pour la SFR Neufbox 6 (NB6-SER-r0)

OpenWrt a abandonné la cible `bcm63xx` (celle de la 23.05) à partir de 24.10. Son successeur `bmips`
gère le BCM6362 mais pas la Neufbox 6. Ce dossier contient le portage maison.

## Ce qui a été fait (2026-11-11)
1. **Environnement de compilation** sur le NAS : image Docker `openwrt-builder:bookworm` (Debian 12, utilisateur non-root),
   dossier `/DATA/openwrt-build`, conteneur limité à 3 cœurs (`nb6-build`).
2. **Sources** : OpenWrt `v25.12.6` (cible) et `v23.05.6` (référence) clonés dans `/DATA/openwrt-build`.
3. **Étude** de la 23.05 :
   - `bcm6361-sfr-neufbox-6-sercomm-r0.dts` : boutons GPIO 10/12/24/25, switch RTL8367R en SMI sur GPIO 18 (SDA) / 20 (SCK),
     `realtek,extif0 = <1 5 1 1 1 1 1 1 2>`, partitions cfe / linux (imagetag) / nvram.
   - `517-board_bcm6362.patch` (board_nb6) : port interne 4 du switch BCM en RGMII, forcé 1000 full -> RTL8367R.
   - `802-rtl8367r_fix_RGMII_support.patch` : correctif RGMII absent de la 25.12.
   - Réseau 23.05 : ports 1-4 LAN, 0 WAN (« Fibre »), 9 = CPU tagué.
4. **Portage** (dossier `patch/`) :
   - `dts/bcm6362-sfr-neufbox-6-sercomm-r0.dts` : nouvelle description au format bmips (DSA), port 4 `extsw` en RGMII 1000 fixe,
     switch Realtek en swconfig avec `realtek,extif = <9 1 5 1 1 1 1 1 1 2>` (nouveau format : port CPU 9 ajouté),
     MAC lue dans CFE à 0x6a0 (même source que la 23.05, qui donnait bien xx:xx:xx:xx:xx:90).
   - `image-bcm6362.mk.append` : image CFE (`bcm63xx-cfe`, board id NB6-SER-r0, chip 6362, 16 Mo) + `kmod-switch-rtl8367`.
   - `patches-6.12/900-rtl8367r-fix-RGMII-support.patch` : correctif RGMII régénéré contre le source 25.12.
   - `02_network` : `ucidef_add_switch "switch0" "1:lan" "2:lan" "3:lan" "4:lan" "0:wan" "9t@extsw"`.
   - `apply.sh` applique tout ça à l'arbre 25.12 ; `build.sh` lance la compilation (journal `/DATA/openwrt-build/build.log`).

## Points incertains (à vérifier au premier démarrage, via le port série)
- Le switch interne BCM (DSA, port `extsw`) laisse-t-il passer les trames VLAN 1/2 venant du Realtek ?
  Si non : LAN/WAN ne marchent pas -> ajuster la config VLAN côté DSA.
- Délais RGMII : `phy-mode = "rgmii"` côté BCM, délais appliqués côté Realtek (comme en 23.05).
- Taille : la 25.12 (noyau 6.12) est plus grosse ; vérifier qu'il reste de la place pour la configuration.

## Retour arrière
Le bootloader CFE n'est jamais touché. En cas d'échec : CFE + TFTP + `firmware/openwrt-23.05.6-…-cfe.bin` (5 min).

## Journal des essais
- **Essai 1 (16:58)** : flash OK (« Image flash done »), mais silence total après « Code Address: 0x81000000 ».
  Cause 1 corrigée : mon DTS écrasait `bootargs = "earlycon"` du dtsi -> bloc `chosen` supprimé.
- **Essai 2 (17:40)** : toujours silence, même avec earlycon -> le noyau ne démarre jamais.
  Cause 2 : le noyau 6.12 décompressé fait 11,3 Mo ; bmips le fait décompresser par CFE à 0x81000000
  (LOADER_ENTRY), or CFE tourne vers 0x81400000-0x81530000 (vu dans les registres lors des plantages CFE)
  -> le noyau écrase CFE pendant la décompression. La 23.05 (bcm63xx) utilisait 0x80a00000 avec un noyau ~7-8 Mo.
  Correctif : `LOADER_ENTRY := 0x81800000` dans target/linux/bmips/image/Makefile (le stub « relocate »
  recopie ensuite le noyau à 0x80010000).
- **Essai 3 (17:55)** : avec `LOADER_ENTRY 0x81800000`, CFE répond « Failed to decompress image. Corrupted image? »
  -> CFE refuse de décompresser ~11 Mo (limite ~4 Mo). La box reste sur l'invite CFE.
  Correctif : `LOADER_ENTRY` remis à 0x81000000, et recette du NB6 :
  `KERNEL := kernel-bin | append-dtb | lzma | loader-lzma bin | lzma` -> CFE ne décompresse que le lzma-loader
  (~3,4 Mo), qui se déplace à 0x82000000 puis décompresse lui-même le noyau à 0x80010000.
- **Essai 4 (18:10) : SUCCÈS.** CFE « Decompression OK! » -> lzma-loader -> Linux 6.12.112 « machine is SFR Neufbox 6 (Sercomm) ».
  - MAC xx:xx:xx:xx:xx:90 (nvmem CFE 0x6a0) OK ; RTL8367R détecté, extif0/cpu 9 ; lien b53 port 4 RGMII 1G.
  - VLAN : port 0 pvid 2 (WAN), ports 1-4 + 9t VLAN 1 (LAN) ; LAN : ping PC 0-1 ms, LuCI OK ;
    WAN (port Fibre) : passerelle 2-6 ms, internet ~36 ms.
  - Overlay jffs2 : 9,6 Mo (9,2 Mo libres). RAM : 54 Mo visibles.
  - Config appliquée : WAN statique 192.168.138.250/24, gw .1, DNS 192.168.138.5 + .1, fuseau Europe/Paris.
  - apk : 9975 paquets, 23 mises à jour userspace disponibles (LuCI, uhttpd…). Pas de flux kmods
    (noyau maison : les modules officiels ne correspondent pas -> ajouter les kmods à la compilation).
  - Mises à jour futures : `sysupgrade.bin` depuis LuCI/`sysupgrade` (garde la config), plus besoin de CFE.
- Bug outillage : le port série de la box perd des octets sur les longues commandes -> ser.py envoie par paquets de 16 octets.

## Mises à jour apk sur le système 25.12 maison (test 2026-11-11)
- `apk add --upgrade` de tous les paquets d'un coup : **tué par manque de mémoire** (OOM, 54 Mo de RAM) puis
  panique noyau + redémarrage automatique (kernel.panic=3). Les fichiers étaient pourtant installés.
- Un paquet à la fois : passe (sauf 1 OOM ponctuel). Résultat : les **20 paquets ordinaires** (LuCI 26.315, uhttpd,
  dnsmasq, ca-bundle, libubox…) sont à jour et **fonctionnent** (LuCI, DNS, DHCP, internet testés).
- `base-files` (officiel) : s'installe (erreur bénigne « rom/note: Read-only »), garde la config en cours, mais
  **remplace /etc/board.d/02_network par la version sans Neufbox** -> une remise à zéro casserait le réseau.
  Restauré depuis /rom. => ne jamais mettre à jour base-files depuis le dépôt officiel.
- `kernel` : paquet virtuel (empreinte du noyau) ; échoue car il réclame les modules officiels. Le noyau ne se met à
  jour que par une nouvelle image. => ne jamais le mettre à jour par apk.
- Conclusion : mises à jour par apk possibles **un paquet à la fois** pour les programmes ordinaires ; pour le reste,
  recompiler l'image avec les flux 25.12 à jour et installer par sysupgrade.

## Variante Wi-Fi
- Piège : dans kmod-bcma, `CONFIG_BCMA_HOST_SOC=$(if $(CONFIG_TARGET_bmips_bcm6362),y,n)` est évalué sans .config
  -> toujours n -> pilote du bus Wi-Fi absent. Forcé à y (wifi/fix-bcma-kconfig.py).
- Firmware : choix `B43_FW_DSL_3580L` à forcer dans .config (le défaut est 5.100.138), corerevs "22" ; il faut
  `rm -rf tmp` pour que le nouveau choix soit pris en compte.
- **Wi-Fi, 1er essai (2026-11-11 19:00) : radio fonctionnelle en réception.** Installé par sysupgrade (config gardée).
  bcma-host-soc-brcm6362-wlan : chip 0x6362, cœur 802.11 rev 0x16 ; SPROM NB6 (21 fixups, MAC …a4:91) ;
  b43-phy0 « Broadcom 6362 WLAN », N-PHY rev 8, radio 2057 rev 8, firmware 784.2.
  Scan 2,4 GHz OK (SFR_DDD4 à -24 dBm, voisins -49 à -73 dBm). Erreurs attendues : « No 5GHz IPA gain table »
  (la puce se dit bi-bande ; le 5 GHz n'est ni câblé ni supporté). Config radio : band 2g, canal 6, pays FR.
  Reste à tester : point d'accès (SSID + mot de passe à définir par Tahar dans LuCI), débit, stabilité.
  Note : le WARN « generic_shutdown_super / jffs2_kill_sb » pendant sysupgrade est bénin.
- **Wi-Fi point d'accès (19:07) : FONCTIONNE.** SSID NB6-OpenWrt (WPA2-PSK, clé saisie par Tahar), canal 6, 20 MHz, pas de HT.
  hostapd AP-ENABLED ; un client s'est associé (EAPOL 4-way OK, DHCP 192.168.1.237) ; signal -25/-35 dBm ;
  débit négocié 54/48 Mbit/s (802.11g, le 11n de b43 pour cette puce n'est pas fini) ; ping 1400 o : 0 % perte,
  ~6,6 ms moy. Beaucoup de « tx retries » (calibration/rate control encore imparfaits) mais 0-1 échec.

## Tests avant finalisation (2026-11-11 19:15)
- **5 GHz : impossible (matériel).** Le pilote annonce une bande 5 GHz (dev_id 0x435f classé bi-bande dans b43),
  mais le scan 36-100 ne trouve rien et b43 dit « No 5GHz IPA gain table / Channel switch failed ».
  La radio 2057 r8 du BCM6362 est 2,4 GHz seulement (la NB6 d'origine aussi ; le 5 GHz est arrivé avec la NB6VAC).
- Ping (0 % de perte partout) :
  | Lien | Paquets | Moy / max |
  |---|---|---|
  | Box -> client Wi-Fi (64 o) | 60 | 5,4 / 83,9 ms |
  | Box -> client Wi-Fi (1400 o) | 30 | 8,3 / 44,8 ms |
  | Box -> PC câble LAN (64 / 1400 o) | 30+30 | 1,1 / 1,3 ms |
  | PC -> box (64 / 1400 o) | 50+20 | 0,08 / 0,35 ms |
  | Box -> passerelle 192.168.138.1 | 60 | 2,4 / 16 ms |
  | Box -> internet 1.1.1.1 | 60 | 35 / 55 ms |
  | Box -> NAS | 30 | 0,9 / 6,6 ms |
- DNS via la box (dnsmasq -> AdGuard) : openwrt.org, lavillamusee.com, google.com OK.
- Téléchargement HTTPS 10 Mo sur la box : 4 s (~20 Mbit/s, chiffrement TLS sur CPU 400 MHz).
- Santé après 16 min : charge 0,15 ; RAM libre ~24 Mo ; overlay 8,1 Mo libres ; 0 erreur noyau hors messages
  5 GHz/IRQ connus. Wi-Fi : 12 869 paquets émis, 33 % de retransmissions, 16 échecs (0,12 %), signal -32 dBm.
