'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';

/*
 * Neufbox 6: Wi-Fi channel and WPS. Scans the nearby networks (names, channel, signal; never their
 * hardware addresses), recommends the least crowded of channels 1, 6 and 11 and switches to it.
 * Starts WPS push-button pairing like the Wi-Fi switch pushed past "on".
 * Data: luci.nb6 "wifi", "wifi_scan", "wps_status".
 */

const callWifi = rpc.declare({ object: 'luci.nb6', method: 'wifi', expect: { '': {} } });
const callScan = rpc.declare({ object: 'luci.nb6', method: 'wifi_scan', expect: { '': {} } });
const callChannel = rpc.declare({ object: 'luci.nb6', method: 'wifi_channel', params: ['channel'], expect: { '': {} } });
const callWpsStart = rpc.declare({ object: 'luci.nb6', method: 'wps_start', expect: { '': {} } });
const callWpsCancel = rpc.declare({ object: 'luci.nb6', method: 'wps_cancel', expect: { '': {} } });
const callWpsStatus = rpc.declare({ object: 'luci.nb6', method: 'wps_status', expect: { '': {} } });

const CANDIDATES = [1, 6, 11];

/* how much a network disturbs a channel: stronger and closer networks count more */
function weight(sig) {
	if (sig == null) return 0.5;
	return Math.min(1, Math.max(0.1, (sig + 95) / 50));
}
const overlap = (a, b) => Math.max(0, 1 - Math.abs(a - b) / 5);

function load(nets, ch) {
	return nets.reduce((t, n) => t + weight(n.signal) * overlap(ch, n.channel), 0);
}

function quality(sig) {
	if (sig == null) return '-';
	return sig >= -55 ? _('strong') : sig >= -70 ? _('medium') : _('weak');
}

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-chart { display:flex; align-items:flex-end; gap:6px; height:150px; margin:1em 0 .3em; padding:0 4px; border-bottom:2px solid var(--nb-line,#e4e4ea); }
.nb6-bar { flex:1; text-align:center; font-size:11px; color:var(--nb-muted,#6d6d78); display:flex; flex-direction:column; justify-content:flex-end; height:100%; }
.nb6-bar > div { background:var(--nb-bar,#c9c3d6); border-radius:6px 6px 0 0; min-height:3px; }
.nb6-bar.nb6-cur > div { background:#5c2483; }
.nb6-bar.nb6-best > div { background:#28cd46; }
.nb6-axis { display:flex; gap:6px; padding:0 4px; font-size:12px; color:var(--nb-text2,#4a4a55); }
.nb6-axis span { flex:1; text-align:center; }
.nb6-legend { font-size:12px; color:var(--nb-muted,#6d6d78); margin:.4em 0 1em; }
.nb6-legend i { display:inline-block; width:10px; height:10px; border-radius:2px; margin:0 4px 0 12px; vertical-align:middle; }
.nb6-wps { display:flex; align-items:center; gap:1em; flex-wrap:wrap; }
`;

return view.extend({
	load() {
		return L.resolveDefault(callWifi(), {});
	},

	channelSection(w) {
		const cur = w.channel || '-';
		this.scanBox = E('div', {}, E('p', { 'class': 'cbi-value-description' },
			_('Scan to see the Wi-Fi networks around the box and which channel is the least crowded.')));

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Channel')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:35%' }, _('Current channel')),
					E('td', { 'class': 'td', 'id': 'nb6-cur' }, cur == 'auto' ? _('automatic') : _('%s (2.4 GHz)').format(cur))]),
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Network name')), E('td', { 'class': 'td' }, w.ssid || '-')])
			]),
			E('div', { 'style': 'margin:1em 0' }, E('button', {
				'class': 'btn cbi-button-action',
				'click': ui.createHandlerFn(this, () => this.scan(w))
			}, _('Scan the networks around'))),
			this.scanBox
		]);
	},

	scan(w) {
		this.scanBox.replaceChildren(E('p', { 'class': 'spinning' }, _('Scanning (a few seconds, Wi-Fi devices may pause briefly)...')));
		return callScan().then(r => {
			const nets = (r.networks || []).filter(n => n.channel >= 1 && n.channel <= 14);
			const cur = +r.channel || 0;
			const scores = CANDIDATES.map(c => [c, load(nets, c)]);
			const best = scores.reduce((a, b) => b[1] < a[1] ? b : a)[0];
			const max = Math.max(1, ...Array.from({ length: 13 }, (_x, i) => load(nets, i + 1)));

			const bars = Array.from({ length: 13 }, (_x, i) => {
				const ch = i + 1, n = nets.filter(x => x.channel == ch).length;
				const cls = 'nb6-bar' + (ch == cur ? ' nb6-cur' : (ch == best ? ' nb6-best' : ''));
				return E('div', { 'class': cls, 'title': _('%d network(s) on channel %d').format(n, ch) }, [
					n ? E('span', {}, String(n)) : '',
					E('div', { 'style': 'height:%d%%'.format(Math.round(100 * load(nets, ch) / max)) })
				]);
			});

			let advice;
			if (cur == best)
				advice = E('p', {}, [E('strong', {}, _('The box already uses the best channel (%d).').format(best))]);
			else
				advice = E('p', {}, [
					E('strong', {}, _('Recommended: channel %d.').format(best)), ' ',
					_('It is the least crowded of channels 1, 6 and 11, the three that do not overlap.'), ' ',
					E('button', {
						'class': 'btn cbi-button-action',
						'click': ui.createHandlerFn(this, () => callChannel(String(best)).then(res => {
							if (res && res.error) return ui.addNotification(null, E('p', _(res.error)), 'danger');
							ui.addNotification(null, E('p', _('Switching to channel %d. The Wi-Fi restarts for a few seconds.').format(best)), 'info');
							document.getElementById('nb6-cur').textContent = _('%s (2.4 GHz)').format(best);
						}))
					}, _('Use channel %d').format(best))
				]);

			const rows = nets.sort((a, b) => (b.signal || -100) - (a.signal || -100)).map(n => E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td nb6-ssid' }, n.ssid || E('em', {}, _('hidden network'))),
				E('td', { 'class': 'td' }, String(n.channel)),
				E('td', { 'class': 'td' }, quality(n.signal))
			]));

			this.scanBox.replaceChildren(
				E('div', { 'class': 'nb6-chart' }, bars),
				E('div', { 'class': 'nb6-axis' }, Array.from({ length: 13 }, (_x, i) => E('span', {}, String(i + 1)))),
				E('div', { 'class': 'nb6-legend' }, [
					_('Crowding per channel (networks that overlap it, the strongest counting most):'),
					E('i', { 'style': 'background:#5c2483' }), _('current'),
					E('i', { 'style': 'background:#28cd46' }), _('recommended')
				]),
				advice,
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('Network')), E('th', { 'class': 'th' }, _('Channel')), E('th', { 'class': 'th' }, _('Signal'))
					]),
					...(rows.length ? rows : [E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 3 }, E('em', {}, _('No other network found.'))))])
				])
			);
		}).catch(e => {
			this.scanBox.replaceChildren(E('p', { 'class': 'alert-message warning' }, _('The scan failed: %s').format(e.message || e)));
		});
	},

	wpsSection(w) {
		this.wpsState = E('span', {}, '');
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('WPS pairing')),
			E('p', {}, _('For a printer, a TV or a repeater with a WPS button: start pairing here (or push the Wi-Fi switch on the box past "on"), then press the WPS button of the device within 2 minutes. It joins the main Wi-Fi without typing the password.')),
			w.guest ? E('p', { 'class': 'alert-message warning' }, _('WPS is not available while the guest network is on: with it, a device paired by WPS would lose the Wi-Fi at the next restart. Use the QR code of the Home page instead.')) : E([]),
			E('div', { 'class': 'nb6-wps' }, [
				E('button', {
					'class': 'btn cbi-button-action', 'disabled': (w.enabled && !w.guest) ? null : '',
					'click': ui.createHandlerFn(this, () => callWpsStart().then(r => {
						if (r && r.error) return ui.addNotification(null, E('p', _(r.error)), 'danger');
						this.followWps(Date.now());
					}))
				}, _('Start pairing')),
				E('button', {
					'class': 'btn cbi-button',
					'click': ui.createHandlerFn(this, () => callWpsCancel().then(() => { this.wpsStopped = true; this.wpsState.textContent = _('Pairing stopped.'); }))
				}, _('Stop')),
				this.wpsState
			])
		]);
	},

	followWps(started) {
		this.wpsStopped = false;
		const tick = () => {
			if (this.wpsStopped) return;
			callWpsStatus().then(s => {
				const left = Math.max(0, 120 - Math.round((Date.now() - started) / 1000));
				if (s.last == 'Success' && s.status != 'Active') {
					this.wpsState.textContent = _('A device has joined the Wi-Fi.');
					return;
				}
				if (s.status == 'Active') {
					this.wpsState.textContent = _('Waiting for a device: press its WPS button (%d s left).').format(left);
					window.setTimeout(tick, 3000);
				}
				else if (s.status == 'Timed-out' || left == 0)
					this.wpsState.textContent = _('No device paired in 2 minutes.');
				else if (s.last == 'Success')
					this.wpsState.textContent = _('A device has joined the Wi-Fi.');
				else
					this.wpsState.textContent = _('Pairing stopped.');
			});
		};
		this.wpsState.textContent = _('Waiting for a device: press its WPS button (%d s left).').format(120);
		window.setTimeout(tick, 2000);
	},

	render(w) {
		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('wifi', 64),
				E('div', {}, [
					E('h2', {}, _('Wi-Fi')),
					E('div', { 'class': 'cbi-map-descr' }, _('Channel and WPS pairing. The network name and password are on the Home page.'))
				])
			]),
			this.channelSection(w),
			this.wpsSection(w)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
