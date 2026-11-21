'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6: devices on the LAN. Merges DHCP leases, the neighbour table, Wi-Fi stations and
 * per-device traffic (nlbwmon). Per device: a name and a fixed address (DHCP host nb6_host_<mac>),
 * its internet access (parental controls page) and Wake-on-LAN. Data: luci.nb6 "devices", "parental".
 */

const callDevices = rpc.declare({ object: 'luci.nb6', method: 'devices', expect: { '': {} } });
const callParental = rpc.declare({ object: 'luci.nb6', method: 'parental', expect: { '': {} } });
const callWake = rpc.declare({ object: 'luci.nb6', method: 'device_wake', params: ['mac'], expect: { '': {} } });
const callHost = rpc.declare({ object: 'luci.nb6', method: 'host_set', params: ['mac', 'name', 'ip'], expect: { '': {} } });

function bytes(n) {
	n = +n || 0;
	const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
	let i = 0;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return '%.1f %s'.format(n, u[i]);
}

function signalText(dbm) {
	/* b43 on the BCM6362 sometimes reports values like -4 dBm, which are not real measurements */
	if (dbm == null || dbm > -10) return '';
	const q = dbm >= -55 ? _('excellent') : dbm >= -67 ? _('good') : dbm >= -75 ? _('fair') : _('weak');
	return '%d dBm (%s)'.format(dbm, q);
}

/* one entry per MAC address, from all the sources; pc = parental controls status */
function merge(d, pc) {
	const dev = {};
	const get = mac => (dev[mac = mac.toLowerCase()] ??= { mac: mac, ips: [] });

	(d.leases || []).forEach(l => {
		const e = get(l.mac);
		if (l.name && l.name != '*') e.name = l.name;
		if (l.ip && !e.ips.includes(l.ip)) e.ips.push(l.ip);
		if (/^192\.168\.30\./.test(l.ip || '')) e.guest = true;
	});
	(d.neigh || []).forEach(n => {
		const e = get(n.mac);
		if (n.ip && !e.ips.includes(n.ip)) e.ips.push(n.ip);
		if (/REACHABLE|DELAY|PROBE/.test(n.state)) e.online = true;
		if (n.guest) e.guest = true;
	});
	(d.wifi || []).forEach(w => {
		const e = get(w.mac);
		e.wifi = true; e.signal = w.signal; e.online = true;
		if (w.guest) e.guest = true;
	});
	if (d.traffic && d.traffic.columns) {
		const c = d.traffic.columns, im = c.indexOf('mac'), ir = c.indexOf('rx_bytes'), it = c.indexOf('tx_bytes');
		(d.traffic.data || []).forEach(r => {
			if (!dev[String(r[im]).toLowerCase()]) return;	/* only devices seen on the LAN */
			const e = get(r[im]);
			e.down = r[ir]; e.up = r[it];
		});
	}
	(d.hosts || []).forEach(h => {
		if (!dev[h.mac.toLowerCase()]) return;	/* only devices seen on the LAN */
		const e = get(h.mac);
		e.host = h;
		if (h.name) e.name = h.name;
	});
	((pc && pc.profiles) || []).forEach(p => p.macs.forEach(m => {
		const e = dev[m.toLowerCase()];
		if (e) e.profile = p;
	}));

	return Object.values(dev).sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (a.name || a.mac).localeCompare(b.name || b.mac));
}

function accessText(p) {
	if (!p || !p.enabled) return E('span', { 'class': 'nb6-pill nb6-ok' }, _('Allowed'));
	if (p.blocked) return E('span', { 'class': 'nb6-pill nb6-off' }, _('No internet now (%s)').format(p.name));
	return E('span', { 'class': 'nb6-pill nb6-sched' }, _('Parental controls: %s').format(p.name));
}

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-dev td { vertical-align:middle; }
.nb6-dev .nb6-name { font-weight:700; }
.nb6-dev small { color:var(--nb-muted,#6d6d78); }
.nb6-dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
.nb6-pill { display:inline-block; padding:2px 10px; border-radius:11px; font-size:12px; font-weight:600; white-space:nowrap; }
.nb6-ok { background:#e6f7ea; color:#13793a; }
.nb6-off { background:#fde6e9; color:#b90016; }
.nb6-sched { background:var(--nb-purple-soft,#f3edf8); color:var(--nb-accent,#5c2483); }
.nb6-guest { background:#e5f4fb; color:#0b5f86; }
.nb6-days label { margin-right:10px; white-space:nowrap; }
`;

return view.extend({
	load() {
		return Promise.all([L.resolveDefault(callDevices(), {}), L.resolveDefault(callParental(), {})]);
	},

	hostDialog(e) {
		const h = e.host || {};
		const name = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'value': h.name || e.name || '', 'maxlength': 63, 'style': 'width:100%', 'placeholder': _('for example laptop-anna') });
		const fixed = E('input', { 'type': 'checkbox', 'checked': h.ip ? '' : null });
		const ip = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'value': h.ip || e.ips[0] || '', 'style': 'width:12em' });

		ui.showModal(_('Name and address: %s').format(e.name || e.mac), [
			E('div', { 'style': 'margin:.4em 0' }, [E('label', { 'style': 'display:block;font-weight:600' }, _('Name')), name,
				E('div', { 'class': 'cbi-value-description' }, _('Letters, digits and dashes. The device is also reachable under this name on the local network.'))]),
			E('div', { 'style': 'margin:1em 0 .4em' }, [E('label', {}, [fixed, ' ', _('Always give it the same address')]), ' ', ip]),
			E('div', { 'class': 'cbi-value-description' }, _('Useful for a printer, a NAS or a port forward. The device gets the address at its next connection (unplug it or turn its Wi-Fi off and on).')),
			E('div', { 'class': 'right', 'style': 'margin-top:1em' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => callHost(e.mac, name.value.trim(), fixed.checked ? ip.value.trim() : '').then(r => {
						if (r && r.error) {
							ui.addNotification(null, E('p', _(r.error)), 'danger');
							return;
						}
						ui.hideModal();
						return this.refresh();
					}))
				}, _('Save'))
			])
		]);
	},

	table(list) {
		const rows = list.map(e => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, [
				E('span', { 'class': 'nb6-dot', 'style': 'background:' + (e.online ? '#28cd46' : '#b5b5bf') }),
				E('span', { 'class': 'nb6-name' }, e.name || _('Unnamed device')), E('br'),
				E('small', {}, e.mac)
			]),
			E('td', { 'class': 'td' }, [e.ips.join(', ') || '-', e.host && e.host.ip ? [E('br'), E('small', {}, _('fixed address'))] : '']),
			E('td', { 'class': 'td' }, e.wifi ? [e.guest ? _('Guest Wi-Fi') : _('Wi-Fi'), E('br'), E('small', {}, signalText(e.signal))]
				: (e.online ? (e.guest ? _('Guest, wired') : _('Wired')) : '-')),
			E('td', { 'class': 'td' }, e.down != null ? '↓ %s · ↑ %s'.format(bytes(e.down), bytes(e.up)) : '-'),
			E('td', { 'class': 'td' }, e.guest ? E('span', { 'class': 'nb6-pill nb6-guest' }, _('Guest network')) : accessText(e.profile)),
			E('td', { 'class': 'td' }, e.guest ? E('small', {}, _('Internet only, managed on the Guest network page')) : [
				E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.hostDialog(e)) }, _('Name')), ' ',
				E('a', { 'class': 'btn cbi-button', 'href': L.url('admin/nb6/parental') + '?mac=' + encodeURIComponent(e.mac) }, _('Internet access')), ' ',
				E('button', {
					'class': 'btn cbi-button', 'title': _('Wake-on-LAN: start this device from the network'),
					'click': ui.createHandlerFn(this, () => callWake(e.mac).then(r =>
						ui.addNotification(null, E('p', r && r.ok ? _('Wake-on-LAN packet sent to %s').format(e.name || e.mac) : _('Could not send the Wake-on-LAN packet')), r && r.ok ? 'info' : 'danger')))
				}, _('Wake up'))
			])
		]));

		return E('table', { 'class': 'table nb6-dev', 'id': 'nb6-devices' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Device')),
				E('th', { 'class': 'th' }, _('IP address')),
				E('th', { 'class': 'th' }, _('Connection')),
				E('th', { 'class': 'th' }, _('Traffic')),
				E('th', { 'class': 'th' }, _('Internet access')),
				E('th', { 'class': 'th' }, _('Actions'))
			]),
			...(rows.length ? rows : [E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 6 }, E('em', {}, _('No device seen yet.'))))])
		]);
	},

	refresh() {
		return Promise.all([callDevices(), L.resolveDefault(callParental(), {})]).then(([d, pc]) => {
			const old = document.getElementById('nb6-devices');
			if (old) old.replaceWith(this.table(merge(d, pc)));
		});
	},

	render([d, pc]) {
		poll.add(() => this.refresh(), 15);
		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('devices', 64),
				E('div', {}, [
					E('h2', {}, _('Devices')),
					E('div', { 'class': 'cbi-map-descr' },
						_('Devices seen on the local network, with their connection and traffic. Give a device a name and a fixed address, set its internet hours (parental controls) or wake it up.'))
				])
			]),
			E('div', { 'class': 'cbi-section' }, this.table(merge(d, pc)))
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
