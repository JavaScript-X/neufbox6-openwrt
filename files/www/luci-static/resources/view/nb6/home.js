'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require nb6.icons as icons';
'require nb6.qr as qr';

/*
 * Neufbox 6 home page: connection, box information, VPN, a photo of the box with the ring LEDs
 * (Internet, VPN, System) in their real colours, and a summary of the devices and services.
 * Data: luci.nb6 "home" (rpcd).
 */

const callHome = rpc.declare({ object: 'luci.nb6', method: 'home', expect: { '': {} } });
const callWifi = rpc.declare({ object: 'luci.nb6', method: 'wifi', expect: { '': {} } });
const callWifiSet = rpc.declare({ object: 'luci.nb6', method: 'wifi_set', params: ['ssid', 'key', 'enabled'], expect: { '': {} } });
/*
 * The update calls go straight to ubus over HTTP: through rpc.declare the update_check reply never
 * reached the page on this box (it works with a direct request, same session and permissions).
 */
function ubusCall(method, args) {
	return fetch(L.env.ubuspath, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'call', params: [L.env.sessionid, 'luci.nb6', method, args || {}] })
	}).then(r => r.json()).then(j => {
		if (!j.result || j.result[0] !== 0) throw new Error('ubus error ' + JSON.stringify(j.error || j.result));
		return j.result[1] || {};
	});
}

const callUpdateCheck = force => ubusCall('update_check', { force: !!force });
const callUpdateInstall = () => ubusCall('update_install');
const callUpdateStatus = () => ubusCall('update_status');

const UPDATE_STEPS = {
	'starting': _('Starting...'),
	'freeing memory': _('Freeing memory (Wi-Fi turns off for a moment)...'),
	'downloading': _('Downloading the new version (about 11 MB)...'),
	'checking': _('Checking the download...'),
	'flashing': _('Installing. The box restarts by itself; do not unplug it.')
};

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
		return Promise.all([L.resolveDefault(callHome(), {}), L.resolveDefault(callWifi(), {})]).then(([h, w]) => {
			this.wifi = w;
			return h;
		});
	},

	/* Wi-Fi card: name, password (hidden until asked), QR code to join, and editing */
	wifiCard() {
		const w = this.wifi || {}, secured = w.encryption && w.encryption != 'none';
		const key = !secured ? _('none (open network)')
			: E('span', {}, [
				E('code', { 'style': 'font-size:13px' }, this.showKey ? w.key : '•'.repeat(10)), ' ',
				E('a', { 'href': '#', 'click': ev => { ev.preventDefault(); this.showKey = !this.showKey; this.redrawWifi(); } },
					this.showKey ? _('hide') : _('show'))
			]);

		return E('div', { 'class': 'nb6-card', 'id': 'nb6-wifi' }, [
			E('h3', {}, _('Wi-Fi')),
			table([
				[_('State'), w.enabled ? dot(LED.green, _('On')) : dot(LED.off, _('Off'))],
				[_('Network name'), w.ssid || '-'],
				[_('Password'), key],
				[_('Connected devices'), String(w.clients || 0)],
				[_('Channel'), w.channel ? _('%s (2.4 GHz)').format(w.channel) : '-']
			]),
			E('div', { 'style': 'margin-top:.6em;text-align:right' }, [
				E('button', {
					'class': 'btn cbi-button', 'disabled': (!w.enabled || !w.ssid) ? '' : null,
					'click': ui.createHandlerFn(this, () => this.showQr())
				}, _('QR code')), ' ',
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, () => this.editWifi()) }, _('Edit'))
			])
		]);
	},

	redrawWifi() {
		const old = document.getElementById('nb6-wifi');
		if (old) old.replaceWith(this.wifiCard());
	},

	showQr() {
		const w = this.wifi || {};
		ui.showModal(_('Join %s').format(w.ssid), [
			E('p', {}, _('Point the camera of a phone or tablet at the code to join the Wi-Fi without typing the password.')),
			E('div', { 'style': 'text-align:center;margin:1em 0' }, qr.img(qr.wifiText(w.ssid, w.key, w.encryption), 260)),
			E('p', { 'style': 'text-align:center' }, E('strong', {}, w.ssid)),
			E('div', { 'class': 'right' }, E('button', { 'class': 'btn cbi-button-action', 'click': ui.hideModal }, _('Close')))
		]);
	},

	editWifi() {
		const w = this.wifi || {}, secured = w.encryption && w.encryption != 'none';
		const on = E('input', { 'type': 'checkbox', 'checked': w.enabled ? '' : null });
		const ssid = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'value': w.ssid || '', 'maxlength': 32, 'style': 'width:100%' });
		const key = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'value': w.key || '', 'maxlength': 63, 'style': 'width:100%', 'autocomplete': 'off' });
		const row = (label, field) => E('div', { 'style': 'margin:.6em 0' }, [E('label', { 'style': 'display:block;font-weight:600' }, label), field]);

		ui.showModal(_('Wi-Fi'), [
			E('label', { 'style': 'display:block;margin:.3em 0' }, [on, ' ', _('Wi-Fi on')]),
			row(_('Network name'), ssid),
			secured ? row(_('Password (8 to 63 characters)'), key) : E([]),
			E('p', { 'class': 'cbi-value-description' }, _('The Wi-Fi restarts for a few seconds. Devices connected over Wi-Fi reconnect by themselves, or with the new password if you change it.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => callWifiSet(ssid.value.trim(), key.value, on.checked).then(r => {
						if (r && r.error) {
							ui.addNotification(null, E('p', _(r.error)), 'danger');
							return;
						}
						ui.hideModal();
						ui.addNotification(null, E('p', _('Wi-Fi settings saved. The Wi-Fi restarts now.')), 'info');
						/* read back after the restart */
						window.setTimeout(() => L.resolveDefault(callWifi(), null).then(n => { if (n) { this.wifi = n; this.redrawWifi(); } }), 8000);
						this.wifi = Object.assign({}, w, { ssid: ssid.value.trim(), key: key.value, enabled: on.checked });
						this.redrawWifi();
					}))
				}, _('Save'))
			])
		]);
	},

	/* the update check runs after the page is shown, never blocking it */
	loadUpdate(force) {
		const timeout = new Promise(resolve => window.setTimeout(() => resolve(null), 30000));
		return Promise.race([L.resolveDefault(callUpdateCheck(!!force), null), timeout]).then(u => {
			this.update = u || { reachable: false };
			const old = document.getElementById('nb6-software');
			if (old) old.replaceWith(this.softwareCard());
		});
	},

	softwareCard() {
		const u = this.update || {};
		let action;
		if (u.available)
			action = E('button', {
				'class': 'btn cbi-button-action',
				'click': ui.createHandlerFn(this, () => this.confirmUpdate())
			}, _('Install version %s').format(u.latest));
		else
			action = E('button', {
				'class': 'btn cbi-button',
				'click': ui.createHandlerFn(this, () => this.loadUpdate(true))
			}, _('Check for updates'));

		return E('div', { 'class': 'nb6-card', 'id': 'nb6-software' }, [
			E('h3', {}, _('Software')),
			table([
				[_('Installed version'), u.current || '-'],
				[_('Latest version'), u.latest ? (u.page ? E('a', { 'href': u.page, 'target': '_blank', 'rel': 'noreferrer' }, u.latest) : u.latest)
					: (this.update == null ? _('checking...') : (u.reachable === false ? _('GitHub not reachable') : '-'))],
				[_('State'), u.available ? dot(LED.orange, _('Update available')) : (u.latest ? dot(LED.green, _('Up to date')) : '-')]
			]),
			E('div', { 'style': 'margin-top:.6em;text-align:right' }, action)
		]);
	},

	confirmUpdate() {
		const u = this.update || {};
		ui.showModal(_('Install version %s').format(u.latest), [
			E('p', {}, _('The box downloads the new version from GitHub, checks it, installs it and restarts. Your settings are kept.')),
			E('p', {}, _('Internet and Wi-Fi are cut for about 10 minutes. Do not unplug the box.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => callUpdateInstall().then(() => this.followUpdate()))
				}, _('Install'))
			])
		]);
	},

	followUpdate() {
		const msg = E('p', {}, _('Starting...'));
		ui.showModal(_('Updating'), [E('div', { 'class': 'spinning' }, msg)]);
		const tick = () => callUpdateStatus().then(r => {
			const st = (r && r.status) || '';
			if (st.indexOf('error') == 0) {
				ui.showModal(_('Update failed'), [
					E('p', {}, _('Error: %s').format(_(st.replace(/^error: /, '')))),
					E('p', {}, _('Nothing was written: the box keeps its current version.')),
					E('div', { 'class': 'right' }, E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Close')))
				]);
				return;
			}
			msg.textContent = UPDATE_STEPS[st] || st;
			if (st == 'flashing') return this.waitForReboot(msg);
			window.setTimeout(tick, 3000);
		}).catch(() => this.waitForReboot(msg));
		tick();
	},

	waitForReboot(msg) {
		msg.textContent = UPDATE_STEPS['flashing'];
		const started = Date.now();
		const ping = () => {
			if (Date.now() - started > 20 * 60000) {
				msg.textContent = _('The box takes longer than expected. Reload this page in a few minutes.');
				return;
			}
			fetch(L.url('admin'), { cache: 'no-store' }).then(r => {
				/* the old system answers until it stops: wait at least 2 minutes */
				if (Date.now() - started > 120000 && r.status < 500) window.location.reload();
				else window.setTimeout(ping, 10000);
			}).catch(() => window.setTimeout(ping, 10000));
		};
		window.setTimeout(ping, 30000);
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
					]),
					this.wifiCard()
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
					]),
					this.softwareCard()
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
		this.update = null;
		window.setTimeout(() => this.loadUpdate(false), 500);
		poll.add(() => callHome().then(n => {
			const old = document.getElementById('nb6-home');
			if (old) old.replaceWith(this.content(n));
		}));

		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-home-title' }, E('h2', {}, [icons.pageIcon('info', 34), _('Information')])),
			this.content(h)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
