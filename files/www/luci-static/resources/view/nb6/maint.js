'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';

/*
 * Neufbox 6: scheduled maintenance. Health check every 5 minutes (restarts what has stopped, and the
 * statistics when memory runs low) and an optional weekly restart at night (nb6-maint, cron).
 * Data: luci.nb6 "maint".
 */

const callMaint = rpc.declare({ object: 'luci.nb6', method: 'maint', expect: { '': {} } });
const callSet = rpc.declare({ object: 'luci.nb6', method: 'maint_set', params: ['health', 'reboot', 'day', 'time'], expect: { '': {} } });
const callReboot = rpc.declare({ object: 'luci.nb6', method: 'maint_reboot', expect: { '': {} } });

const DAYS = [_('Sunday'), _('Monday'), _('Tuesday'), _('Wednesday'), _('Thursday'), _('Friday'), _('Saturday')];

function duration(s) {
	s = +s || 0;
	const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
	return (d ? _('%d d').format(d) + ' ' : '') + (d || h ? _('%d h').format(h) + ' ' : '') + _('%d min').format(m);
}

const when = t => t > 0 ? new Date(t * 1000).toLocaleString() : _('never');

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:22px; }
.nb6-grid2 .cbi-section { margin:0; }
.nb6-field { margin:.8em 0; }
.nb6-field > div:first-child { font-weight:600; margin-bottom:.3em; }
.nb6-ev td:first-child { white-space:nowrap; color:#6d6d78; width:12em; }
@media (max-width: 900px) { .nb6-grid2 { grid-template-columns: 1fr; } }
`;

return view.extend({
	load() {
		return L.resolveDefault(callMaint(), {});
	},

	render(m) {
		const health = E('input', { 'type': 'checkbox', 'checked': m.health ? '' : null });
		const reboot = E('input', { 'type': 'checkbox', 'checked': m.reboot ? '' : null });
		const day = E('select', { 'class': 'cbi-input-select' }, DAYS.map((d, i) => E('option', { 'value': i, 'selected': String(i) == (m.reboot_day || '0') ? '' : null }, d)));
		const time = E('input', { 'type': 'time', 'value': m.reboot_time || '04:00' });

		const save = () => callSet(health.checked, reboot.checked, day.value, time.value).then(r => {
			if (r && r.error) return ui.addNotification(null, E('p', _(r.error)), 'danger');
			ui.addNotification(null, E('p', _('Maintenance settings saved.')), 'info');
		});

		const events = (m.events || []).slice().reverse().map(e => E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, new Date(e.time * 1000).toLocaleString()),
			E('td', { 'class': 'td' }, _(e.text))
		]));

		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('maint', 64),
				E('div', {}, [
					E('h2', {}, _('Maintenance')),
					E('div', { 'class': 'cbi-map-descr' }, _('Keeps the box running by itself: checks it every 5 minutes, and can restart it once a week at night.'))
				])
			]),
			E('div', { 'class': 'nb6-grid2' }, [
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Health check')),
					E('p', {}, _('Every 5 minutes, the box checks that DNS and DHCP, the Wi-Fi and the web interface are running, and restarts what has stopped. When memory runs low, it restarts the statistics services, which are the first to grow.')),
					E('div', { 'class': 'nb6-field' }, E('label', {}, [health, ' ', _('Check the box every 5 minutes')])),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:50%' }, _('Running for')), E('td', { 'class': 'td' }, duration(m.uptime))]),
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Free memory')), E('td', { 'class': 'td' }, '%.1f MB'.format((m.mem_available || 0) / 1024))]),
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Scheduler')), E('td', { 'class': 'td' }, m.cron ? _('running') : _('stopped'))])
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Weekly restart')),
					E('p', {}, _('A restart once a week clears the memory of this 64 MB box. It takes about 2 minutes, at night when nobody uses the network. It is skipped during an update or if the box started less than an hour before.')),
					E('div', { 'class': 'nb6-field' }, E('label', {}, [reboot, ' ', _('Restart the box every week')])),
					E('div', { 'class': 'nb6-field', 'style': 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, [day, _('at'), time]),
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:50%' }, _('Last weekly restart')), E('td', { 'class': 'td' }, when(m.last_reboot))])
					])
				])
			]),
			E('div', { 'style': 'margin:1em 0 1.6em' }, [
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, save) }, _('Save')), ' ',
				E('button', {
					'class': 'btn cbi-button-reset',
					'click': ui.createHandlerFn(this, () => ui.showModal(_('Restart the box'), [
						E('p', {}, _('Internet, Wi-Fi and the VPN are cut for about 2 minutes. Your settings are kept.')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')), ' ',
							E('button', {
								'class': 'btn cbi-button-reset',
								'click': ui.createHandlerFn(this, () => callReboot().then(() => {
									ui.showModal(_('Restarting'), [E('p', { 'class': 'spinning' }, _('The box restarts. This page reloads when it is back.'))]);
									const t0 = Date.now();
									const ping = () => fetch(L.url('admin'), { cache: 'no-store' }).then(r => {
										if (Date.now() - t0 > 60000 && r.status < 500) window.location.reload();
										else window.setTimeout(ping, 5000);
									}).catch(() => window.setTimeout(ping, 5000));
									window.setTimeout(ping, 20000);
								}))
							}, _('Restart'))
						])
					]))
				}, _('Restart now'))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Recent events')),
				E('table', { 'class': 'table nb6-ev' }, events.length ? events
					: [E('tr', { 'class': 'tr' }, E('td', { 'class': 'td' }, E('em', {}, _('Nothing to report since the box started.'))))])
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
