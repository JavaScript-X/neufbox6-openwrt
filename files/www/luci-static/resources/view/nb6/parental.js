'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6: parental controls. A profile groups devices (a child's phone, tablet and console) and
 * cuts their internet during set hours, or right now with a pause; extra time lifts the schedule for
 * a while. The devices stay on the local network. Data: luci.nb6 "parental" and "devices".
 */

const callParental = rpc.declare({ object: 'luci.nb6', method: 'parental', expect: { '': {} } });
const callDevices = rpc.declare({ object: 'luci.nb6', method: 'devices', expect: { '': {} } });
const callSet = rpc.declare({ object: 'luci.nb6', method: 'parental_set', params: ['id', 'name', 'macs', 'windows', 'enabled'], expect: { '': {} } });
const callDelete = rpc.declare({ object: 'luci.nb6', method: 'parental_delete', params: ['id'], expect: { '': {} } });
const callPause = rpc.declare({ object: 'luci.nb6', method: 'parental_pause', params: ['id', 'minutes'], expect: { '': {} } });
const callExtra = rpc.declare({ object: 'luci.nb6', method: 'parental_extra', params: ['id', 'minutes'], expect: { '': {} } });

const DAYS = [['Mon', _('Mon')], ['Tue', _('Tue')], ['Wed', _('Wed')], ['Thu', _('Thu')],
	['Fri', _('Fri')], ['Sat', _('Sat')], ['Sun', _('Sun')]];
const DAY_NAMES = Object.fromEntries(DAYS);

/* known devices of the home network: name and MAC, from the leases, fixed addresses and neighbours */
function deviceList(d) {
	const dev = {};
	const get = mac => (dev[mac = mac.toLowerCase()] ??= { mac: mac });
	(d.leases || []).forEach(l => {
		if (/^192\.168\.30\./.test(l.ip || '')) return;	/* guests are managed on their own page */
		const e = get(l.mac);
		if (l.name && l.name != '*') e.name = l.name;
	});
	(d.neigh || []).forEach(n => { if (!n.guest) { const e = get(n.mac); if (/REACHABLE|DELAY|PROBE/.test(n.state)) e.online = true; } });
	(d.wifi || []).forEach(w => { if (!w.guest) get(w.mac).online = true; });
	(d.hosts || []).forEach(h => { if (h.name) get(h.mac).name = h.name; });
	return dev;
}

function hhmm(epoch) {
	const t = new Date(epoch * 1000);
	return '%02d:%02d'.format(t.getHours(), t.getMinutes());
}

/* "Mon,Tue,Wed,Thu,Sun/21:00-07:00" -> "Mon, Tue, Wed, Thu, Sun · 21:00-07:00" */
function windowText(w) {
	const [days, time] = w.split('/');
	const d = days.split(',');
	const label = d.length == 7 ? _('every day')
		: d.join(',') == 'Mon,Tue,Wed,Thu,Fri' ? _('Monday to Friday')
		: d.join(',') == 'Sat,Sun' ? _('weekend')
		: d.map(x => DAY_NAMES[x] || x).join(', ');
	return '%s · %s'.format(label, time.replace('-', ' - '));
}

function stateText(p) {
	if (!p.enabled) return E('span', { 'class': 'nb6-pill' }, _('Off'));
	switch (p.reason) {
	case 'pause':
		return E('span', { 'class': 'nb6-pill nb6-off' }, p.until ? _('No internet until %s (paused)').format(hhmm(p.until)) : _('No internet (paused until you resume)'));
	case 'schedule':
		return E('span', { 'class': 'nb6-pill nb6-off' }, _('No internet until %s (schedule)').format(p.stop));
	case 'extra':
		return E('span', { 'class': 'nb6-pill nb6-sched' }, _('Extra time until %s').format(hhmm(p.until)));
	default:
		return E('span', { 'class': 'nb6-pill nb6-ok' }, _('Internet on'));
	}
}

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-pill { display:inline-block; padding:3px 11px; border-radius:11px; font-size:12px; font-weight:600; white-space:nowrap; background:var(--nb-chip,#ececf1); color:var(--nb-text2,#4a4a55); }
.nb6-ok { background:#e6f7ea; color:#13793a; }
.nb6-off { background:#fde6e9; color:#b90016; }
.nb6-sched { background:var(--nb-purple-soft,#f3edf8); color:var(--nb-accent,#5c2483); }
.nb6-profiles { display:grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap:18px; }
.nb6-profile { border:1px solid var(--nb-line,#e4e4ea); border-radius:14px; padding:16px 18px; background:var(--nb-card,#fff); }
.nb6-profile h3 { margin:0 0 .4em; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:.4em .6em; font-size:17px; }
.nb6-profile .nb6-list { margin:.6em 0; font-size:13px; }
.nb6-profile .nb6-list div { margin:.2em 0; }
.nb6-profile small { color:var(--nb-muted,#6d6d78); }
.nb6-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:.8em; align-items:center; }
.nb6-days label { margin-right:8px; white-space:nowrap; }
.nb6-slot { border:1px solid var(--nb-line,#e4e4ea); border-radius:10px; padding:8px 10px; margin:.5em 0; }
.nb6-devpick { max-height:220px; overflow:auto; border:1px solid var(--nb-line,#e4e4ea); border-radius:10px; padding:6px 10px; }
.nb6-devpick label { display:block; margin:.25em 0; }
.nb6-empty { text-align:center; padding:2em 1em; color:var(--nb-muted,#6d6d78); }
`;

return view.extend({
	load() {
		return Promise.all([L.resolveDefault(callParental(), {}), L.resolveDefault(callDevices(), {})]);
	},

	devName(mac) {
		const e = this.devices[mac.toLowerCase()];
		return e && e.name ? e.name : mac;
	},

	slotEditor(w) {
		const [days, time] = (w || 'Mon,Tue,Wed,Thu,Sun/21:00-07:00').split('/');
		const [from, to] = time.split('-');
		const box = E('div', { 'class': 'nb6-slot' });
		const checks = DAYS.map(([v, l]) => E('label', {}, [
			E('input', { 'type': 'checkbox', 'value': v, 'checked': days.split(',').includes(v) ? '' : null }), ' ', l
		]));
		const start = E('input', { 'type': 'time', 'value': from });
		const stop = E('input', { 'type': 'time', 'value': to });
		box.appendChild(E('div', { 'class': 'nb6-days' }, checks));
		box.appendChild(E('div', { 'style': 'margin-top:.4em' }, [
			_('No internet from') + ' ', start, ' ' + _('to') + ' ', stop, ' ',
			E('button', { 'class': 'btn cbi-button', 'click': () => box.remove() }, _('Remove'))
		]));
		box.value = () => {
			const d = checks.map(l => l.firstChild).filter(c => c.checked).map(c => c.value);
			return d.length && start.value && stop.value ? '%s/%s-%s'.format(d.join(','), start.value, stop.value) : null;
		};
		return box;
	},

	editDialog(p, presetMac) {
		p = p || { name: '', macs: presetMac ? [presetMac] : [], windows: ['Mon,Tue,Wed,Thu,Sun/21:00-07:00'], enabled: true };
		const name = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'maxlength': 40, 'value': p.name, 'style': 'width:100%', 'placeholder': _('for example Kids, or Anna') });
		const enabled = E('input', { 'type': 'checkbox', 'checked': p.enabled ? '' : null });

		const macs = new Set(p.macs.map(m => m.toLowerCase()));
		const known = Object.values(this.devices);
		p.macs.forEach(m => { if (!this.devices[m.toLowerCase()]) known.push({ mac: m.toLowerCase() }); });
		known.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (a.name || a.mac).localeCompare(b.name || b.mac));
		const picks = known.map(e => E('label', {}, [
			E('input', { 'type': 'checkbox', 'value': e.mac, 'checked': macs.has(e.mac) ? '' : null }), ' ',
			E('strong', {}, e.name || _('Unnamed device')), ' ', E('small', {}, e.mac + (e.online ? ' · ' + _('online') : ''))
		]));

		const slots = E('div', {}, p.windows.map(w => this.slotEditor(w)));

		ui.showModal(p.id ? _('Edit %s').format(p.name) : _('New profile'), [
			E('div', { 'style': 'margin:.3em 0' }, [E('label', { 'style': 'display:block;font-weight:600' }, _('Name')), name]),
			E('div', { 'style': 'margin:1em 0 .3em;font-weight:600' }, _('Devices')),
			picks.length ? E('div', { 'class': 'nb6-devpick' }, picks) : E('p', {}, E('em', {}, _('No device seen yet on the home network.'))),
			E('div', { 'class': 'cbi-value-description' }, _('Give the devices a name on the Devices page to find them easily. Phones may use a private address per Wi-Fi network: it stays the same for this box.')),
			E('div', { 'style': 'margin:1em 0 .3em;font-weight:600' }, _('Hours without internet')),
			slots,
			E('button', { 'class': 'btn cbi-button', 'click': () => slots.appendChild(this.slotEditor('Sat,Sun/22:30-08:00')) }, _('Add a time slot')),
			E('div', { 'class': 'cbi-value-description' }, _('A time slot may cross midnight: Monday 21:00 to 07:00 ends on Tuesday morning. Without any slot, the devices only lose the internet when you pause them.')),
			E('div', { 'style': 'margin-top:1em' }, E('label', {}, [enabled, ' ', _('Profile active')])),
			E('div', { 'class': 'right', 'style': 'margin-top:1em' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
				E('button', {
					'class': 'btn cbi-button-action',
					'click': ui.createHandlerFn(this, () => {
						const chosen = picks.map(l => l.firstChild).filter(c => c.checked).map(c => c.value);
						const wins = Array.from(slots.children).map(b => b.value()).filter(Boolean);
						return callSet(p.id || '', name.value.trim(), chosen.join(' '), wins.join(' '), enabled.checked).then(r => {
							if (r && r.error) return ui.addNotification(null, E('p', _(r.error)), 'danger');
							ui.hideModal();
							return this.refresh();
						});
					})
				}, _('Save'))
			])
		]);
	},

	card(p) {
		const pause = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': '30' }, _('30 minutes')),
			E('option', { 'value': '60' }, _('1 hour')),
			E('option', { 'value': '120' }, _('2 hours')),
			E('option', { 'value': 'morning' }, _('until tomorrow 07:00')),
			E('option', { 'value': 'forever' }, _('until I resume'))
		]);
		const act = (fn, arg) => ui.createHandlerFn(this, () => fn(p.id, arg).then(r => {
			if (r && r.error) ui.addNotification(null, E('p', _(r.error)), 'danger');
			return this.refresh();
		}));

		let actions;
		if (p.reason == 'pause')
			actions = [E('button', { 'class': 'btn cbi-button-positive', 'click': act(callPause, '0') }, _('Resume internet'))];
		else if (p.reason == 'schedule')
			actions = [
				E('button', { 'class': 'btn cbi-button-positive', 'click': act(callExtra, '30') }, _('30 minutes more')),
				E('button', { 'class': 'btn cbi-button', 'click': act(callExtra, '60') }, _('1 hour more'))
			];
		else if (p.reason == 'extra')
			actions = [E('button', { 'class': 'btn cbi-button', 'click': act(callExtra, '0') }, _('End the extra time'))];
		else
			actions = [_('Pause') + ' ', pause, E('button', {
				'class': 'btn cbi-button-negative', 'disabled': p.enabled ? null : '',
				'click': ui.createHandlerFn(this, () => callPause(p.id, pause.value).then(() => this.refresh()))
			}, _('Pause now'))];

		return E('div', { 'class': 'nb6-profile' }, [
			E('h3', {}, [E('span', {}, p.name), stateText(p)]),
			E('div', { 'class': 'nb6-list' }, [
				E('small', {}, _('Devices')),
				...p.macs.map(m => E('div', {}, [E('strong', {}, this.devName(m)), ' ', E('small', {}, m)]))
			]),
			E('div', { 'class': 'nb6-list' }, [
				E('small', {}, _('Hours without internet')),
				...(p.windows.length ? p.windows.map(w => E('div', {}, windowText(w))) : [E('div', {}, E('em', {}, _('none, only when paused')))])
			]),
			E('div', { 'class': 'nb6-actions' }, [
				...actions,
				E('span', { 'style': 'flex:1' }),
				E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => this.editDialog(p)) }, _('Edit')),
				E('button', {
					'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, () => {
						if (!window.confirm(_('Delete the profile %s? Its devices get the internet back.').format(p.name))) return;
						return callDelete(p.id).then(() => this.refresh());
					})
				}, _('Delete'))
			])
		]);
	},

	section(st) {
		const list = st.profiles || [];
		return E('div', { 'class': 'cbi-section', 'id': 'nb6-parental' }, [
			E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:1em' }, [
				E('span', {}, st.time ? _('Time on the box: %s').format(st.time) : ''),
				E('button', { 'class': 'btn cbi-button-add', 'click': ui.createHandlerFn(this, () => this.editDialog(null)) }, _('Add a profile'))
			]),
			list.length ? E('div', { 'class': 'nb6-profiles' }, list.map(p => this.card(p)))
				: E('div', { 'class': 'nb6-empty' }, [
					E('p', {}, _('No profile yet.')),
					E('p', {}, _('Create one for a child: choose their devices and the hours without internet, for example school nights from 21:00 to 07:00.'))
				])
		]);
	},

	refresh() {
		return Promise.all([callParental(), L.resolveDefault(callDevices(), null)]).then(([st, d]) => {
			if (d) this.devices = deviceList(d);
			const old = document.getElementById('nb6-parental');
			if (old) old.replaceWith(this.section(st));
		});
	},

	render([st, d]) {
		this.devices = deviceList(d);
		poll.add(() => this.refresh(), 30);

		/* opened from the Devices page: ?mac=... edits the profile of that device, or starts one */
		const mac = (new URLSearchParams(window.location.search).get('mac') || '').toLowerCase();
		if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac))
			window.setTimeout(() => {
				const p = (st.profiles || []).find(x => x.macs.map(m => m.toLowerCase()).includes(mac));
				this.editDialog(p || null, p ? null : mac);
			}, 0);

		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('parental', 64),
				E('div', {}, [
					E('h2', {}, _('Parental controls')),
					E('div', { 'class': 'cbi-map-descr' }, _('Internet hours for a child\'s devices, a pause at any time and extra time when needed. The devices stay on the home network; they lose the internet at once, even in the middle of a video.'))
				])
			]),
			this.section(st)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
