'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';
'require nb6.qr as qr';

/*
 * Neufbox 6: guest network. The Wi-Fi chip has a single access point, so guests join the same
 * Wi-Fi name with their own password, which puts them on a separate network (192.168.30.0/24)
 * that reaches the internet only. Ethernet port 4 can join it too. Data: luci.nb6 "guest".
 */

const callGuest = rpc.declare({ object: 'luci.nb6', method: 'guest', expect: { '': {} } });
const callGuestSet = rpc.declare({ object: 'luci.nb6', method: 'guest_set', params: ['enabled', 'key', 'port4'], expect: { '': {} } });

/* readable random password: no 0/O, 1/l/I */
function randomKey() {
	const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = new Uint8Array(12);
	window.crypto.getRandomValues(r);
	return Array.from(r, b => c[b % c.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
}

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-guest { display:grid; grid-template-columns: 1fr 300px; gap:24px; align-items:start; }
.nb6-qr { text-align:center; border:1px solid #e4e4ea; border-radius:14px; padding:14px; background:#fff; }
.nb6-qr small { color:#6d6d78; }
.nb6-guest .cbi-value { margin:.8em 0; }
@media (max-width: 800px) { .nb6-guest { grid-template-columns: 1fr; } }
`;

return view.extend({
	load() {
		return L.resolveDefault(callGuest(), {});
	},

	section(g) {
		const on = E('input', { 'type': 'checkbox', 'checked': g.enabled ? '' : null });
		const key = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'maxlength': 63, 'autocomplete': 'off', 'style': 'width:22em;max-width:100%',
			'value': g.key || randomKey()
		});
		const port4 = E('input', { 'type': 'checkbox', 'checked': g.port4 ? '' : null });
		const secured = g.encryption && g.encryption != 'none';

		const qrBox = g.enabled && g.key
			? E('div', { 'class': 'nb6-qr' }, [
				qr.img(qr.wifiText(g.ssid, g.key, g.encryption), 240),
				E('div', { 'style': 'margin-top:.5em' }, [E('strong', {}, g.ssid), E('br'), E('small', {}, _('guest password: %s').format(g.key))]),
				E('small', {}, _('Guests scan this code to join.'))
			])
			: E('div', { 'class': 'nb6-qr' }, E('small', {}, _('The QR code for guests appears here once the guest network is on.')));

		return E('div', { 'class': 'cbi-section', 'id': 'nb6-guest' }, [
			E('div', { 'class': 'nb6-guest' }, [
				E('div', {}, [
					E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:40%' }, _('State')),
							E('td', { 'class': 'td' }, g.enabled ? E('span', { 'class': 'label success' }, _('On')) : E('span', { 'class': 'label' }, _('Off')))]),
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Wi-Fi name')), E('td', { 'class': 'td' }, g.ssid || '-')]),
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Guests connected')), E('td', { 'class': 'td' }, g.enabled ? String(g.clients || 0) : '-')]),
						E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Ethernet port 4')), E('td', { 'class': 'td' }, g.enabled && g.port4 ? _('guest network') : _('home network'))])
					]),
					secured ? E([], [
						E('div', { 'class': 'cbi-value' }, E('label', {}, [on, ' ', _('Guest network on')])),
						E('div', { 'style': 'margin:.8em 0' }, [
							E('div', { 'style': 'font-weight:600;margin-bottom:.3em' }, _('Guest password')),
							key, ' ',
							E('button', { 'class': 'btn cbi-button', 'click': () => { key.value = randomKey(); } }, _('New password')),
							E('div', { 'class': 'cbi-value-description' }, _('8 to 63 characters, different from the main Wi-Fi password. Change it to cut off the current guests.'))
						]),
						E('div', { 'style': 'margin:.8em 0' }, [
							E('label', {}, [port4, ' ', _('Ethernet port 4 also goes to the guest network')]),
							E('div', { 'class': 'cbi-value-description' }, _('For a wired guest, a TV or a games console. A computer plugged into port 4 then no longer reaches the home network.'))
						]),
						E('div', { 'style': 'margin-top:1em' }, E('button', {
							'class': 'btn cbi-button-action',
							'click': ui.createHandlerFn(this, () => callGuestSet(on.checked, key.value.trim(), port4.checked).then(r => {
								if (r && r.error) {
									ui.addNotification(null, E('p', _(r.error)), 'danger');
									return;
								}
								ui.addNotification(null, E('p', _('Saved. The Wi-Fi restarts for a few seconds.')), 'info');
								window.setTimeout(() => this.refresh(), 6000);
							}))
						}, _('Save')))
					]) : E('p', { 'class': 'alert-message warning' }, _('The main Wi-Fi has no password: give it one first (Home page, Wi-Fi card), the guest network uses a password of its own.'))
				]),
				qrBox
			]),
			E('div', { 'class': 'cbi-value-description', 'style': 'margin-top:1.4em' }, [
				E('strong', {}, _('How it works: ')),
				_('this Wi-Fi chip has a single access point, so guests join the same Wi-Fi name as you, with the guest password. That password puts them on a separate network (192.168.30.x) that reaches the internet, and the commercial VPN when it is on, but not your devices, the tailnet or the box settings.')
			])
		]);
	},

	refresh() {
		return callGuest().then(g => {
			const old = document.getElementById('nb6-guest');
			if (old) old.replaceWith(this.section(g));
		});
	},

	render(g) {
		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('guest', 64),
				E('div', {}, [
					E('h2', {}, _('Guest network')),
					E('div', { 'class': 'cbi-map-descr' }, _('Internet access for visitors, kept apart from your devices.'))
				])
			]),
			this.section(g)
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
