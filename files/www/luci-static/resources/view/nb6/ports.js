'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';

/*
 * Neufbox 6: games and servers. Port forwards from the internet to a device (firewall redirects
 * named nb6_fwd_*; the device keeps a fixed address), and UPnP for consoles (miniupnpd).
 * Data: luci.nb6 "forwards" and "devices".
 */

const callForwards = rpc.declare({ object: 'luci.nb6', method: 'forwards', expect: { '': {} } });
const callDevices = rpc.declare({ object: 'luci.nb6', method: 'devices', expect: { '': {} } });
const callAdd = rpc.declare({ object: 'luci.nb6', method: 'forward_add', params: ['name', 'proto', 'ext', 'int', 'ip', 'mac'], expect: { '': {} } });
const callSet = rpc.declare({ object: 'luci.nb6', method: 'forward_set', params: ['id', 'action'], expect: { '': {} } });
const callUpnp = rpc.declare({ object: 'luci.nb6', method: 'upnp_set', params: ['enabled'], expect: { '': {} } });

/* [label, rule name, protocol, port] */
const PRESETS = [
	[_('Other (choose the ports)'), '', 'tcp udp', ''],
	['Minecraft', 'Minecraft', 'tcp', '25565'],
	[_('Web server (HTTP)'), 'Web', 'tcp', '80'],
	[_('Web server (HTTPS)'), 'Web HTTPS', 'tcp', '443'],
	[_('Remote desktop'), 'Remote desktop', 'tcp', '3389'],
	['SSH', 'SSH', 'tcp', '22'],
	['Plex', 'Plex', 'tcp', '32400'],
	['WireGuard', 'WireGuard', 'udp', '51820']
];

const PROTO = { 'tcp': 'TCP', 'udp': 'UDP', 'tcp udp': 'TCP + UDP' };

/* devices on the home network (not the guests), named when possible */
function deviceList(d) {
	const dev = {};
	(d.leases || []).forEach(l => {
		if (/^192\.168\.30\./.test(l.ip)) return;
		dev[l.mac.toLowerCase()] = { mac: l.mac.toLowerCase(), ip: l.ip, name: l.name != '*' ? l.name : '' };
	});
	(d.neigh || []).forEach(n => {
		if (n.guest) return;
		const m = n.mac.toLowerCase();
		dev[m] = Object.assign({ mac: m, name: '' }, dev[m], { ip: (dev[m] && dev[m].ip) || n.ip });
	});
	(d.hosts || []).forEach(h => {
		const m = h.mac.toLowerCase();
		if (!dev[m]) return;
		if (h.name) dev[m].name = h.name;
		if (h.ip) dev[m].ip = h.ip;
	});
	return Object.values(dev).filter(x => x.ip).sort((a, b) => (a.name || a.ip).localeCompare(b.name || b.ip));
}

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-form label { display:block; font-weight:600; margin:.7em 0 .2em; }
.nb6-form input, .nb6-form select { width:100%; }
.nb6-row { display:flex; gap:12px; }
.nb6-row > div { flex:1; }
.nb6-pill { display:inline-block; padding:2px 10px; border-radius:11px; font-size:12px; font-weight:600; }
.nb6-ok { background:#e6f7ea; color:#13793a; }
.nb6-off { background:#ececf1; color:#6d6d78; }
`;

return view.extend({
	load() {
		return Promise.all([L.resolveDefault(callForwards(), {}), L.resolveDefault(callDevices(), {})]);
	},

	addDialog(devs) {
		const preset = E('select', { 'class': 'cbi-input-select' }, PRESETS.map((p, i) => E('option', { 'value': i }, p[0])));
		const name = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'maxlength': 40, 'placeholder': _('for example Game server') });
		const dev = E('select', { 'class': 'cbi-input-select' }, devs.length
			? devs.map((d, i) => E('option', { 'value': i }, (d.name || _('Unnamed device')) + ' (' + d.ip + ')'))
			: [E('option', { 'value': '' }, _('No device on the home network'))]);
		const proto = E('select', { 'class': 'cbi-input-select' }, Object.keys(PROTO).map(k => E('option', { 'value': k }, PROTO[k])));
		const ext = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('e.g. 25565 or 27000-27030') });
		const int = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'placeholder': _('same as the internet port') });

		preset.addEventListener('change', () => {
			const p = PRESETS[+preset.value];
			if (p[1]) { name.value = p[1]; proto.value = p[2]; ext.value = p[3]; int.value = ''; }
		});

		ui.showModal(_('Open a port'), [
			E('div', { 'class': 'nb6-form' }, [
				E('label', {}, _('Service')), preset,
				E('label', {}, _('Name')), name,
				E('label', {}, _('Device')), dev,
				E('div', { 'class': 'nb6-row' }, [
					E('div', {}, [E('label', {}, _('Protocol')), proto]),
					E('div', {}, [E('label', {}, _('Internet port')), ext]),
					E('div', {}, [E('label', {}, _('Device port')), int])
				]),
				E('p', { 'class': 'cbi-value-description' }, _('The device keeps its current address from now on, so the rule keeps working. Only open ports for services you trust: they become reachable from the whole internet.'))
			]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => {
						const d = devs[+dev.value];
						if (!d) return;
						return callAdd(name.value.trim(), proto.value, ext.value.trim(), int.value.trim() || ext.value.trim(), d.ip, d.mac).then(r => {
							if (r && r.error) return ui.addNotification(null, E('p', _(r.error)), 'danger');
							ui.hideModal();
							return this.refresh();
						});
					})
				}, _('Open'))
			])
		]);
	},

	content(f, d) {
		const devs = deviceList(d);
		const byIp = {};
		devs.forEach(x => byIp[x.ip] = x.name);
		const list = f.forwards || [], up = f.upnp || {};

		const rows = list.map(r => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, E('strong', {}, r.name || '-')),
			E('td', { 'class': 'td' }, [byIp[r.ip] || _('Unnamed device'), E('br'), E('small', {}, r.ip)]),
			E('td', { 'class': 'td' }, PROTO[r.proto] || r.proto),
			E('td', { 'class': 'td' }, r.ext + (r.int && r.int != r.ext ? ' → ' + r.int : '')),
			E('td', { 'class': 'td' }, E('span', { 'class': 'nb6-pill ' + (r.enabled ? 'nb6-ok' : 'nb6-off') }, r.enabled ? _('Open') : _('Paused'))),
			E('td', { 'class': 'td' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => callSet(r.id, r.enabled ? '0' : '1').then(() => this.refresh())) },
					r.enabled ? _('Pause') : _('Resume')), ' ',
				E('button', { 'class': 'btn cbi-button-remove', 'click': ui.createHandlerFn(this, () => callSet(r.id, 'delete').then(() => this.refresh())) }, _('Delete'))
			])
		]));

		const leases = (up.leases || []).map(l => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, l.desc || '-'),
			E('td', { 'class': 'td' }, [byIp[l.ip] || l.ip]),
			E('td', { 'class': 'td' }, (l.proto || '').toUpperCase()),
			E('td', { 'class': 'td' }, l.ext + (l.int && l.int != l.ext ? ' → ' + l.int : ''))
		]));

		return E('div', { 'id': 'nb6-ports' }, [
			f.wan_private ? E('p', { 'class': 'alert-message warning' },
				_('The box is behind another router (its internet address is a private one). Open the same ports on that router too, towards this box, or nothing will reach your devices.')) : E([]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Open ports')),
				E('p', {}, _('Lets a game server, a NAS or a camera be reached from the internet: connections to a port of the box go to the device you choose.')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('Name')), E('th', { 'class': 'th' }, _('Device')), E('th', { 'class': 'th' }, _('Protocol')),
						E('th', { 'class': 'th' }, _('Port')), E('th', { 'class': 'th' }, _('State')), E('th', { 'class': 'th' }, _('Actions'))
					]),
					...(rows.length ? rows : [E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 6 }, E('em', {}, _('No port is open.'))))])
				]),
				E('div', { 'style': 'margin-top:1em' }, E('button', {
					'class': 'btn cbi-button-add', 'click': ui.createHandlerFn(this, () => this.addDialog(devs))
				}, _('Open a port')))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Automatic opening (UPnP)')),
				E('p', {}, _('Consoles (PlayStation, Xbox, Switch) and some games open the ports they need by themselves. It improves online play (open NAT type), but any program on the home network can then open ports.')),
				!up.installed ? E('p', {}, E('em', {}, _('UPnP is not installed in this firmware.'))) : E([], [
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:35%' }, _('State')),
							E('td', { 'class': 'td' }, E('span', { 'class': 'nb6-pill ' + (up.enabled ? 'nb6-ok' : 'nb6-off') }, up.enabled ? _('On') : _('Off')))])
					]),
					up.enabled ? E('table', { 'class': 'table', 'style': 'margin-top:.6em' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th' }, _('Opened by')), E('th', { 'class': 'th' }, _('Device')),
							E('th', { 'class': 'th' }, _('Protocol')), E('th', { 'class': 'th' }, _('Port'))
						]),
						...(leases.length ? leases : [E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 4 }, E('em', {}, _('No port opened automatically right now.'))))])
					]) : E([]),
					E('div', { 'style': 'margin-top:1em' }, E('button', {
						'class': 'btn ' + (up.enabled ? 'cbi-button-reset' : 'cbi-button-action'),
						'click': ui.createHandlerFn(this, () => callUpnp(!up.enabled).then(r => {
							if (r && r.error) ui.addNotification(null, E('p', _(r.error)), 'danger');
							return this.refresh();
						}))
					}, up.enabled ? _('Turn off') : _('Turn on')))
				])
			])
		]);
	},

	refresh() {
		return Promise.all([callForwards(), callDevices()]).then(([f, d]) => {
			const old = document.getElementById('nb6-ports');
			if (old) old.replaceWith(this.content(f, d));
		});
	},

	render([f, d]) {
		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('ports', 64),
				E('div', {}, [
					E('h2', {}, _('Games and servers')),
					E('div', { 'class': 'cbi-map-descr' }, _('Open ports towards a device, and automatic opening for consoles.'))
				])
			]),
			this.content(f, d)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
