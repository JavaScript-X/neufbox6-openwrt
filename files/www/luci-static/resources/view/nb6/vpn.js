'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require ui';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6: the two WireGuard tunnels driven by the SFR button.
 *   vpn             tailnet (only the remote networks)
 *   vpn_commercial  commercial VPN (all internet traffic)
 * Backend: /usr/libexec/rpcd/luci.nb6. Private keys are never sent to the browser.
 */

const callStatus = rpc.declare({ object: 'luci.nb6', method: 'status', expect: { '': {} } });
const callPubkey = rpc.declare({ object: 'luci.nb6', method: 'pubkey', expect: { pubkey: '' } });
const callRekey = rpc.declare({ object: 'luci.nb6', method: 'rekey', expect: { pubkey: '' } });
const callInit = rpc.declare({ object: 'luci.nb6', method: 'init', expect: { pubkey: '' } });
const callSetTunnel = rpc.declare({
	object: 'luci.nb6', method: 'set_tunnel', params: ['iface', 'enabled'], expect: { '': {} }
});
const callImport = rpc.declare({
	object: 'luci.nb6', method: 'import_commercial',
	params: ['private_key', 'addresses', 'dns', 'public_key', 'preshared_key', 'endpoint_host', 'endpoint_port', 'provider'],
	expect: { '': {} }
});

const TUNNELS = [
	{ iface: 'vpn', name: _('Tailnet'), button: _('SFR button, short press'), brands: () => ['tailscale', 'wireguard'] },
	{ iface: 'vpn_commercial', name: _('Commercial VPN'), button: _('SFR button, long press (3 s)'),
	  brands: () => [uci.get('network', 'vpn_commercial_peer', 'provider') || 'wireguard'] }
];

const PROVIDERS = ['mullvad', 'protonvpn', 'nordvpn', 'surfshark', 'expressvpn', 'privateinternetaccess', 'cloudflare'];

function pageHeader(icon, title, descr) {
	return E('div', { 'style': 'display:flex;align-items:center;gap:1.2em;flex-wrap:wrap;margin-bottom:1em' }, [
		icons.pageIcon(icon, 72),
		E('div', { 'style': 'flex:1;min-width:240px' }, [
			E('h2', { 'style': 'margin-top:0' }, title),
			E('div', { 'class': 'cbi-map-descr' }, descr)
		])
	]);
}

function pageFooter() {
	return E('div', { 'class': 'cbi-section', 'style': 'font-size:90%;opacity:.85' }, [
		E('p', {}, [
			_('Built with') + ' ', icons.badge('openwrt', 18), 'OpenWrt ',
			icons.badge('wireguard', 18), 'WireGuard ', icons.badge('tailscale', 18), 'Tailscale'
		]),
		E('small', {}, _('Product names and logos are trademarks of their owners and only identify their services. Icons: Simple Icons (CC0).'))
	]);
}

const B64KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw480]=$/;

function fmtBytes(n) {
	n = +n || 0;
	const u = ['B', 'KiB', 'MiB', 'GiB'];
	let i = 0;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return '%.1f %s'.format(n, u[i]);
}

function fmtAge(s) {
	if (s == null || s < 0) return _('never');
	if (s < 60) return _('%d s ago').format(s);
	if (s < 3600) return _('%d min ago').format(Math.floor(s / 60));
	return _('%d h ago').format(Math.floor(s / 3600));
}

function tunnelState(t) {
	if (!t || !t.configured) return [_('Not configured'), 'label'];
	if (!t.enabled) return [_('Off'), 'label'];
	if (t.up && t.handshake_age >= 0 && t.handshake_age < 180) return [_('Connected'), 'label success'];
	return [_('Connecting'), 'label warning'];
}

/* parse a provider's wg-quick file ([Interface] / [Peer]) */
function parseWireGuard(text) {
	const out = { addresses: [], dns: [] };
	let section = '', peers = 0;
	for (let line of text.split(/\r?\n/)) {
		line = line.replace(/[#;].*$/, '').trim();
		if (!line) continue;
		const sec = line.match(/^\[(\w+)\]$/);
		if (sec) {
			section = sec[1].toLowerCase();
			if (section == 'peer') peers++;
			continue;
		}
		const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
		if (!kv) continue;
		const key = kv[1].toLowerCase(), val = kv[2].trim();
		const list = val.split(',').map(v => v.trim()).filter(v => v);
		if (section == 'interface') {
			if (key == 'privatekey') out.private_key = val;
			else if (key == 'address') out.addresses.push(...list);
			else if (key == 'dns') out.dns.push(...list.filter(v => /^[0-9a-fA-F:.]+$/.test(v)));
		}
		else if (section == 'peer' && peers == 1) {	/* first peer only */
			if (key == 'publickey') out.public_key = val;
			else if (key == 'presharedkey') out.preshared_key = val;
			else if (key == 'endpoint') {
				const m = val.match(/^\[?([^\]]+?)\]?:(\d+)$/);
				if (m) { out.endpoint_host = m[1]; out.endpoint_port = m[2]; }
			}
		}
	}
	return out;
}

return view.extend({
	load() {
		return Promise.all([
			L.resolveDefault(callStatus(), {}),
			L.resolveDefault(callPubkey(), ''),
			uci.load('network')
		]);
	},

	statusTable(st) {
		const rows = TUNNELS.map(t => {
			const s = st[t.iface] || {};
			const [label, cls] = tunnelState(s);
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, [
					E('div', { 'style': 'display:flex;align-items:center' }, [
						...t.brands().map(b => icons.badge(b, 26)),
						E('div', {}, [E('strong', {}, t.name), E('br'), E('small', {}, t.button)])
					])
				]),
				E('td', { 'class': 'td' }, E('span', { 'class': cls }, label)),
				E('td', { 'class': 'td' }, s.endpoint || '-'),
				E('td', { 'class': 'td' }, s.up ? fmtAge(s.handshake_age) : '-'),
				E('td', { 'class': 'td' }, s.up ? '%s / %s'.format(fmtBytes(s.rx_bytes), fmtBytes(s.tx_bytes)) : '-'),
				E('td', { 'class': 'td' }, s.configured
					? E('button', {
						'class': 'btn cbi-button ' + (s.enabled ? 'cbi-button-reset' : 'cbi-button-apply'),
						'click': ui.createHandlerFn(this, () => callSetTunnel(t.iface, !s.enabled).then(() => this.refresh()))
					}, s.enabled ? _('Turn off') : _('Turn on'))
					: E('em', {}, _('set it up below')))
			]);
		});

		return E('table', { 'class': 'table', 'id': 'nb6-vpn-status' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Tunnel')),
				E('th', { 'class': 'th' }, _('State')),
				E('th', { 'class': 'th' }, _('Endpoint')),
				E('th', { 'class': 'th' }, _('Last handshake')),
				E('th', { 'class': 'th' }, _('Received / sent')),
				E('th', { 'class': 'th' }, _('Action'))
			]),
			...rows
		]);
	},

	refresh() {
		return callStatus().then(st => {
			const old = document.getElementById('nb6-vpn-status');
			if (old) old.replaceWith(this.statusTable(st));
		});
	},

	importDialog() {
		const text = E('textarea', {
			'class': 'cbi-input-textarea', 'rows': 12, 'style': 'width:100%; font-family:monospace',
			'placeholder': '[Interface]\nPrivateKey = ...\nAddress = 10.x.x.x/32\nDNS = ...\n\n[Peer]\nPublicKey = ...\nEndpoint = host:51820'
		});
		let fileName = '';
		const file = E('input', {
			'type': 'file', 'accept': '.conf,text/plain',
			'change': ev => {
				const f = ev.target.files[0];
				if (f) { fileName = f.name; f.text().then(t => { text.value = t; }); }
			}
		});

		ui.showModal(_('Import a WireGuard file'), [
			E('p', {}, PROVIDERS.map(p => icons.badge(p, 28))),
			E('p', {}, _('Download the WireGuard configuration from your provider (Mullvad, Proton VPN, NordVPN, Surfshark, ...), then choose the file or paste its content. It is sent to the box only.')),
			E('p', {}, file),
			text,
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => {
						const c = parseWireGuard(text.value);
						if (!c.private_key || !B64KEY.test(c.private_key) || !c.public_key || !B64KEY.test(c.public_key)
						    || !c.endpoint_host || !c.addresses.length) {
							ui.addNotification(null, E('p', _('This does not look like a WireGuard file: PrivateKey, Address, PublicKey and Endpoint are needed.')), 'danger');
							return;
						}
						/* never look inside the keys: only the file name, comments and server name */
						const comments = text.value.split(/\r?\n/).filter(l => /^\s*#/.test(l)).join(' ');
						const provider = icons.detect([fileName, comments, c.endpoint_host].join(' '));
						return callImport(c.private_key, c.addresses.join(' '), c.dns.join(' '), c.public_key,
							c.preshared_key || '', c.endpoint_host, c.endpoint_port || '51820', provider).then(res => {
							ui.hideModal();
							if (res && res.error)
								ui.addNotification(null, E('p', res.error), 'danger');
							else
								window.location.reload();
						});
					})
				}, _('Import'))
			])
		]);
	},

	render([st, pubkey]) {
		let m, s, o;

		if (!st.initialized) {
			m = new form.Map('network', _('VPN'));
			s = m.section(form.NamedSection, 'lan', 'interface', _('Set up'),
				_('Creates the two WireGuard interfaces (disabled) and their firewall zones, and generates the tailnet key on the box.'));
			o = s.option(form.Button, '_init', _('VPN interfaces'));
			o.inputtitle = _('Set up');
			o.inputstyle = 'apply';
			o.onclick = () => callInit().then(() => window.location.reload());
			return m.render();
		}

		m = new form.Map('network');

		/* ---- tailnet ---- */
		s = m.section(form.NamedSection, 'vpn', 'interface', _('Tailnet'),
			_('Tunnel to a WireGuard server that routes to your Tailscale network (or any private network). Only those networks go through it. See docs/VPN.md for the server side.'));

		o = s.option(form.DummyValue, '_pubkey', _('Public key of the box'),
			_('Add it as a peer on the server, with AllowedIPs = the tunnel address of the box and its LAN.'));
		o.rawhtml = true;
		o.cfgvalue = () => E('code', { 'style': 'user-select:all' }, pubkey || '-');

		o = s.option(form.Button, '_rekey', _('Key'));
		o.inputtitle = _('Generate a new key');
		o.inputstyle = 'remove';
		o.onclick = () => {
			if (!confirm(_('The server will refuse the box until its peer is updated with the new public key. Continue?')))
				return;
			return callRekey().then(() => window.location.reload());
		};

		o = s.option(form.DynamicList, 'addresses', _('Tunnel address of the box'));
		o.datatype = 'cidr4';
		o.placeholder = '10.77.0.2/24';

		s = m.section(form.NamedSection, 'vpn_server', 'wireguard_vpn', _('Tailnet server'));
		s.addremove = true;

		o = s.option(form.Value, 'public_key', _('Server public key'));
		o.rmempty = false;
		o.validate = (id, v) => B64KEY.test(v) || _('A WireGuard key is 44 base64 characters ending with "="');

		o = s.option(form.Value, 'endpoint_host', _('Server address'), _('Host name or IP address of the server.'));
		o.datatype = 'host';
		o.rmempty = false;

		o = s.option(form.Value, 'endpoint_port', _('Server port'));
		o.datatype = 'port';
		o.placeholder = '51820';

		o = s.option(form.DynamicList, 'allowed_ips', _('Remote networks'),
			_('Networks reached through the tunnel. 100.64.0.0/10 is the Tailscale address range.'));
		o.datatype = 'cidr';
		o.default = ['10.77.0.0/24', '100.64.0.0/10'];

		o = s.option(form.Flag, 'route_allowed_ips', _('Route the remote networks'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'persistent_keepalive', _('Keepalive (s)'));
		o.datatype = 'range(0,65535)';
		o.placeholder = '25';
		o.default = '25';

		/* ---- commercial VPN ---- */
		s = m.section(form.NamedSection, 'vpn_commercial', 'interface', _('Commercial VPN'),
			_('All internet traffic of the LAN goes through the provider while this tunnel is up. The tailnet keeps working (its routes are more specific).'));

		o = s.option(form.Button, '_import', _('Provider file'));
		o.inputtitle = _('Import a WireGuard file...');
		o.inputstyle = 'action';
		o.onclick = () => this.importDialog();

		o = s.option(form.Value, 'private_key', _('Private key'));
		o.password = true;
		o.validate = (id, v) => !v || B64KEY.test(v) || _('A WireGuard key is 44 base64 characters ending with "="');

		o = s.option(form.DynamicList, 'addresses', _('Address'));
		o.datatype = 'cidr';

		o = s.option(form.DynamicList, 'dns', _('DNS servers'), _('Resolvers of the provider, used while the tunnel is up.'));
		o.datatype = 'ipaddr';

		s = m.section(form.NamedSection, 'vpn_commercial_peer', 'wireguard_vpn_commercial', _('Provider server'));
		s.addremove = true;

		o = s.option(form.ListValue, 'provider', _('Provider'), _('Only used for the logo; found automatically when importing a file.'));
		o.value('', _('Other'));
		PROVIDERS.forEach(p => o.value(p, icons.list[p].title));

		o = s.option(form.Value, 'public_key', _('Public key'));
		o.validate = (id, v) => !v || B64KEY.test(v) || _('A WireGuard key is 44 base64 characters ending with "="');

		o = s.option(form.Value, 'preshared_key', _('Preshared key'));
		o.password = true;
		o.optional = true;

		o = s.option(form.Value, 'endpoint_host', _('Server address'));
		o.datatype = 'host';

		o = s.option(form.Value, 'endpoint_port', _('Server port'));
		o.datatype = 'port';
		o.placeholder = '51820';

		o = s.option(form.DynamicList, 'allowed_ips', _('Networks through the tunnel'),
			_('Keep 0.0.0.0/1 and 128.0.0.0/1: they carry all internet traffic without removing the WAN default route, so the server stays reachable.'));
		o.datatype = 'cidr';
		o.default = ['0.0.0.0/1', '128.0.0.0/1'];

		o = s.option(form.Flag, 'route_allowed_ips', _('Route them through the tunnel'));
		o.default = '1';
		o.rmempty = false;

		poll.add(() => this.refresh());

		return m.render().then(node => E([], [
			pageHeader('vpn', _('VPN'),
				_('Two WireGuard tunnels, switched with the SFR button. VPN LED: green = tailnet, orange = commercial VPN, alternating = both, orange blinking = connecting.')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Status')),
				this.statusTable(st)
			]),
			node,
			pageFooter()
		]));
	}
});
