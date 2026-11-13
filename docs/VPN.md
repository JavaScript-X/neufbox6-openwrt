# VPN

Two WireGuard tunnels, switched with the ECO button and shown on LED b.

| | Tailnet (`vpn`) | Commercial VPN (`vpn_commercial`) |
|---|---|---|
| ECO button | short press | long press (3 s or more) |
| What goes through it | only the remote networks (by default `10.77.0.0/24` and Tailscale's `100.64.0.0/10`) | all internet traffic of the LAN |
| LED b | green | orange |

Both up: LED b alternates green and orange. Orange blinking: a tunnel is enabled but has no recent
handshake. Off: no tunnel. 3 red flashes: the tunnel for that press is not configured.

Tailscale itself does not fit on this box (it needs 30-40 MB of RAM and ~24 MB of storage). The
tailnet tunnel goes to a machine that already runs Tailscale, which routes between the two.

```
 LAN 192.168.1.0/24 ── Neufbox (10.77.0.2) ══ WireGuard ══ server (10.77.0.1) ── tailscale0 ── tailnet
```

## Box side
```sh
nb6-vpn init                                  # interfaces, firewall zones, key; prints the public key
nb6-vpn tailnet <server-public-key> <server-host> [port]
nb6-vpn status
```
`init` creates both interfaces disabled. The private keys are generated on the box and never printed.

Firewall zones:
- `vpn` (tailnet): input accepted (LuCI and SSH reachable from the tailnet), forwarding both ways with the LAN, masquerading.
- `vpnc` (commercial): forwarding from the LAN only, masquerading.

### Commercial VPN
Download a WireGuard configuration from the provider (Mullvad, Proton VPN, IVPN, ...), then in
LuCI > Network > Interfaces > `vpn_commercial` > Edit:
- *General*: private key and address(es) from the `[Interface]` section;
- *Peers* > `provider`: public key and endpoint from the `[Peer]` section. Keep the allowed IPs
  `0.0.0.0/1` and `128.0.0.0/1`: they take over the internet traffic without removing the WAN default
  route, so the tunnel endpoint stays reachable;
- *Advanced*: the provider's DNS server, if you want DNS through the tunnel too.

Then press ECO for 3 s. Tailnet routes are more specific, so the tailnet keeps working through `vpn`.

## Server side (example: a Linux machine running Tailscale)
The server needs the kernel WireGuard module and Tailscale. Example `wg0.conf` (`wg-quick`):
```ini
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/wg0.key
# box -> tailnet: hide the tunnel addresses behind the server's tailnet address
PostUp = iptables -t nat -A POSTROUTING -s 10.77.0.0/24 -o tailscale0 -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -s 10.77.0.0/24 -o tailscale0 -j MASQUERADE

[Peer]
# Neufbox 6: public key printed by nb6-vpn init
PublicKey = <box-public-key>
AllowedIPs = 10.77.0.2/32, 192.168.1.0/24
```
With Docker on the same machine, also accept `wg0` in the `DOCKER-USER` chain if its FORWARD policy is DROP.
IP forwarding must be on (`net.ipv4.ip_forward = 1`).

Then advertise the box's LAN on the tailnet, keeping any routes already advertised, and approve it
in the Tailscale admin console (Machines > the server > Edit route settings):
```sh
tailscale set --advertise-routes=<existing routes>,192.168.1.0/24
```

Choose a LAN subnet for the box that is not used elsewhere: Tailscale clients that accept routes
send that subnet to the box, even when their local network uses the same range.

## Test results (2026-11-13)
- Box → tailnet devices through the tunnel: OK.
- Tailnet → box: LuCI opened from a phone on mobile data through Tailscale, the server and the tunnel.
- ECO short press: tunnel down (LED b off) and back up (orange blinking, then green).
- ECO long press without a provider configured: 3 red flashes on LED b.
- Commercial VPN: not tested yet (needs a provider configuration).

## Away from home
The tailnet tunnel connects to `<server-host>:51820`. Outside the server's network, use a public
address or name and forward UDP 51820 to the server.
