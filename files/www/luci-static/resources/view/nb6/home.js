'use strict';
'require view';
'require rpc';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6 home page: connection, box information, VPN, a photo of the box with the ring LEDs
 * (Internet, VPN, System) in their real colours, and a summary of the devices and services.
 * Data: luci.nb6 "home" (rpcd).
 */

const callHome = rpc.declare({ object: 'luci.nb6', method: 'home', expect: { '': {} } });

const LED = { green: '#28cd46', orange: '#ff8c00', red: '#eb2323', off: '#9a9aa6' };

function ledColor(state) {
	switch (state) {
	case 'green': case 'both': return LED.green;
	case 'orange': case 'connecting': return LED.orange;
	case 'red': case 'error': return LED.red;
	default: return LED.off;
	}
}

function duration(s) {
	s = +s || 0;
	const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return (d ? _('%d d').format(d) + ' ' : '') + (d || h ? _('%d h').format(h) + ' ' : '') + _('%d min').format(m);
}

function dot(color, text) {
	return E('span', { 'class': 'nb6-dot' }, [
		E('span', { 'style': 'background:%s;box-shadow:0 0 6px %s'.format(color, color) }), ' ', text
	]);
}

function internetText(state) {
	switch (state) {
	case 'green': return dot(LED.green, _('Internet available'));
	case 'orange': return dot(LED.orange, _('WAN link up, no internet'));
	case 'red': return dot(LED.red, _('WAN cable unplugged'));
	default: return dot(LED.off, _('Unknown'));
	}
}

function tunnelText(word) {
	switch (word) {
	case 'up': return dot(LED.green, _('Connected'));
	case 'connecting': return dot(LED.orange, _('Connecting'));
	case 'off': return dot(LED.off, _('Off'));
	default: return dot(LED.off, _('Not configured'));
	}
}

/* photo of the box with the current state of its Internet, VPN and System LEDs below it */
function boxPhoto(h) {
	const l = h.leds || {};
	const led = (label, state) => E('span', { 'class': 'nb6-led' }, [
		E('span', { 'style': 'background:%s;box-shadow:0 0 7px %s'.format(ledColor(state), ledColor(state)) }), label
	]);
	return E('div', {}, [
		E('img', {
			'src': L.resource('nb6/box.png'), 'alt': _('SFR Neufbox 6'),
			'title': _('SFR Neufbox 6 (product photo (c) SFR)'),
			'style': 'width:100%;max-width:300px;height:auto'
		}),
		E('div', { 'class': 'nb6-leds' }, [
			led(_('Internet'), l.internet), led(_('VPN'), l.vpn), led(_('System'), l.system)
		])
	]);
}

function table(rows) {
	return E('table', { 'class': 'nb6-kv' }, rows.map(([k, v]) => E('tr', {}, [E('th', {}, k), E('td', {}, v)])));
}

const GLYPH = {
	lan: 'M3 6h18v10h-5v3h-8v-3H3z M7 9v4 M10 9v4 M14 9v4 M17 9v4',
	wifi: 'M2 9a15 15 0 0 1 20 0 M5.5 12.5a10 10 0 0 1 13 0 M9 16a5 5 0 0 1 6 0 M12 19.5h.01',
	devices: 'M4 5h16v10H4z M2 19h20 M9 15v4 M15 15v4',
	vpn: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z M9 12l2 2 4-4'
};

function tile(glyph, value, label) {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="%s"/></svg>'.format(GLYPH[glyph]);
	return E('div', { 'class': 'nb6-tile' }, [
		E('img', { 'src': 'data:image/svg+xml;utf8,' + encodeURIComponent(svg), 'alt': '' }),
		E('div', { 'class': 'nb6-tile-value' }, value),
		E('div', { 'class': 'nb6-tile-label' }, label)
	]);
}

const STYLE = `
.nb6-home-title { text-align:center; margin:.4em 0 1em; }
.nb6-home-title h2 { display:inline-flex; align-items:center; gap:.5em; letter-spacing:.06em; text-transform:uppercase; }
.nb6-grid { display:grid; grid-template-columns: 1fr minmax(240px, 420px) 1fr; gap:22px; align-items:start; }
.nb6-card { background:#fff; border:1px solid #e4e4ea; border-radius:14px; padding:14px 18px 10px; box-shadow:0 1px 4px rgba(30,20,50,.05); }
.nb6-card + .nb6-card { margin-top:18px; }
.nb6-card h3 { margin:0 0 .6em; font-size:15px; text-transform:uppercase; letter-spacing:.05em; }
.nb6-kv { width:100%; border-collapse:collapse; font-size:13px; }
.nb6-kv th, .nb6-kv td { padding:7px 6px; border-top:1px solid #eeeef3; text-align:left; vertical-align:top; }
.nb6-kv tr:first-child th, .nb6-kv tr:first-child td { border-top:0; }
.nb6-kv th { color:#6d6d78; font-weight:600; width:42%; }
.nb6-kv td { color:#2b2b33; word-break:break-word; }
.nb6-dot { display:inline-flex; align-items:center; gap:4px; }
.nb6-dot > span:first-child { width:10px; height:10px; border-radius:50%; display:inline-block; }
.nb6-center { text-align:center; padding-top:10px; }
.nb6-leds { display:flex; justify-content:center; gap:16px; margin-top:.4em; font-size:12px; color:#6d6d78; }
.nb6-led { display:inline-flex; align-items:center; gap:5px; font-weight:700; }
.nb6-led > span { width:12px; height:12px; border-radius:50%; display:inline-block; }
.nb6-center .nb6-name { font-weight:700; color:#5c2483; margin-top:.6em; font-size:16px; }
.nb6-center .nb6-sub { color:#6d6d78; font-size:12px; }
.nb6-band { margin:26px -5px 10px; padding:22px 20px 26px; border-radius:16px; color:#fff;
            background:linear-gradient(135deg, #5c2483 0%, #7a2a8c 60%, #8e1f6a 100%); text-align:center; }
.nb6-band h3 { color:#fff; border:0; padding:0; margin:0 0 .2em; text-transform:uppercase; letter-spacing:.08em; }
.nb6-band p { margin:0 0 1.2em; opacity:.85; font-size:13px; }
.nb6-tiles { display:grid; grid-template-columns: repeat(4, 1fr); gap:14px; }
.nb6-tile { background:rgba(255,255,255,.12); border-radius:14px; padding:14px 8px; }
.nb6-tile-value { font-size:20px; font-weight:700; margin-top:.3em; }
.nb6-tile-label { font-size:12px; opacity:.9; }
@media (max-width: 900px) { .nb6-grid { grid-template-columns: 1fr; } .nb6-tiles { grid-template-columns: repeat(2, 1fr); } }
`;

return view.extend({
	load() {
		return L.resolveDefault(callHome(), {});
	},

	content(h) {
		const w = h.wan || {}, b = h.box || {}, v = h.vpn || {}, d = h.devices || {};
		const memPct = b.mem_total ? Math.round(100 * (b.mem_total - b.mem_available) / b.mem_total) : 0;
		const tunnels = (v.tailnet == 'up' ? 1 : 0) + (v.commercial == 'up' ? 1 : 0);

		return E('div', { 'id': 'nb6-home' }, [
			E('div', { 'class': 'nb6-grid' }, [
				E('div', {}, [
					E('div', { 'class': 'nb6-card' }, [
						E('h3', {}, _('Connection')),
						table([
							[_('Internet'), internetText(w.internet)],
							[_('Connection type'), _('Fibre port (WAN)') + (w.link ? ', %s Mbit/s'.format(w.link) : '')],
							[_('Addressing'), w.proto == 'dhcp' ? _('automatic (DHCP)') : (w.proto == 'static' ? _('static') : (w.proto || '-'))],
							[_('Connected for'), w.uptime ? duration(w.uptime) : '-'],
							[_('IPv4 address'), w.ipv4 || '-'],
							[_('IPv6 address'), w.ipv6 || '-']
						])
					])
				]),
				E('div', { 'class': 'nb6-center' }, [
					boxPhoto(h),
					E('div', { 'class': 'nb6-name' }, b.model || 'SFR Neufbox 6'),
					E('div', { 'class': 'nb6-sub' }, b.release || 'neufbox6-openwrt')
				]),
				E('div', {}, [
					E('div', { 'class': 'nb6-card' }, [
						E('h3', {}, _('The box')),
						table([
							[_('Running for'), duration(b.uptime)],
							[_('System'), b.openwrt || '-'],
							[_('Kernel'), 'Linux ' + (b.kernel || '-')],
							[_('Temperature'), b.temperature ? '%.1f °C'.format(b.temperature / 1000) : '-'],
							[_('Power supply'), b.voltage ? '%.1f V'.format(b.voltage / 1000) : '-'],
							[_('Memory in use'), '%d %%'.format(memPct)],
							[_('Eco mode'), b.eco ? dot(LED.green, _('On')) : dot(LED.off, _('Off'))]
						])
					]),
					E('div', { 'class': 'nb6-card' }, [
						E('h3', {}, [icons.badge('wireguard', 18), _('VPN')]),
						table([
							[_('Tailnet'), tunnelText(v.tailnet)],
							[_('Commercial VPN'), tunnelText(v.commercial)]
						])
					])
				])
			]),
			E('div', { 'class': 'nb6-band' }, [
				E('h3', {}, _('Devices and services')),
				E('p', {}, _('What is connected to the box right now.')),
				E('div', { 'class': 'nb6-tiles' }, [
					tile('lan', '%d / 4'.format(d.lan_ports || 0), _('Ethernet ports in use')),
					tile('wifi', String(d.wifi_clients || 0), d.ssid ? _('Wi-Fi clients on %s').format(d.ssid) : _('Wi-Fi is off')),
					tile('devices', String(d.leases || 0), _('devices with an address (DHCP)')),
					tile('vpn', '%d / 2'.format(tunnels), _('VPN tunnels up'))
				])
			])
		]);
	},

	render(h) {
		poll.add(() => callHome().then(n => {
			const old = document.getElementById('nb6-home');
			if (old) old.replaceWith(this.content(n));
		}));

		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-home-title' }, E('h2', {}, [icons.pageIcon('leds', 34), _('Information')])),
			this.content(h)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
