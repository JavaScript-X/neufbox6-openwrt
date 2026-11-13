'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require ui';

/*
 * Neufbox 6: ring LED brightness, night dimming and eco mode (/etc/config/nb6).
 * nb6-leds reloads these settings when they are applied (procd reload trigger).
 */

const callStatus = rpc.declare({ object: 'luci.nb6', method: 'status', expect: { '': {} } });
const callEco = rpc.declare({ object: 'luci.nb6', method: 'eco', params: ['enabled'], expect: { '': {} } });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

return view.extend({
	load() {
		return Promise.all([
			L.resolveDefault(callStatus(), {}),
			uci.load('nb6')
		]);
	},

	render([st]) {
		let m, s, o;

		m = new form.Map('nb6', _('LEDs and eco mode'),
			_('Ring LEDs a (Internet), b (VPN) and c (health), and the eco mode switched by the ECO button.'));

		/* ---- LEDs ---- */
		s = m.section(form.NamedSection, 'leds', 'leds', _('Ring LEDs'));
		s.addremove = false;

		o = s.option(form.Value, 'brightness', _('Brightness'), _('1 (dim) to 31 (full).'));
		o.datatype = 'range(1,31)';
		o.placeholder = '31';

		o = s.option(form.Flag, 'night', _('Night dimming'));
		o.rmempty = false;

		o = s.option(form.Value, 'night_start', _('From'), _('HH:MM, 24 h. The window may cross midnight.'));
		o.depends('night', '1');
		o.placeholder = '23:00';
		o.validate = (id, v) => !v || HHMM.test(v) || _('Use HH:MM, e.g. 23:00');

		o = s.option(form.Value, 'night_end', _('Until'));
		o.depends('night', '1');
		o.placeholder = '07:00';
		o.validate = (id, v) => !v || HHMM.test(v) || _('Use HH:MM, e.g. 07:00');

		o = s.option(form.Value, 'night_brightness', _('Night brightness'));
		o.depends('night', '1');
		o.datatype = 'range(1,31)';
		o.placeholder = '4';

		/* ---- eco ---- */
		s = m.section(form.NamedSection, 'eco', 'eco', _('Eco mode'),
			_('The ECO button switches it. This hardware cannot slow its LAN ports down nor lower its Wi-Fi power, so eco mode dims the LEDs and pauses background work.'));
		s.addremove = false;

		o = s.option(form.Button, '_eco', _('State'));
		o.inputtitle = st.eco ? _('On: turn off') : _('Off: turn on');
		o.inputstyle = st.eco ? 'reset' : 'apply';
		o.onclick = () => callEco(!st.eco).then(() => window.location.reload());

		o = s.option(form.Value, 'led_brightness', _('Ring brightness in eco mode'));
		o.datatype = 'range(1,31)';
		o.placeholder = '4';

		o = s.option(form.Flag, 'traffic_leds', _('Keep the traffic LEDs'), _('White Wi-Fi and Accès LEDs keep blinking with traffic.'));
		o.rmempty = false;

		o = s.option(form.Flag, 'pause_stats', _('Pause statistics'), _('Stops collectd (graphs) and nlbwmon (per-device traffic) while eco mode is on.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'wifi_off', _('Turn Wi-Fi off'));
		o.rmempty = false;

		return m.render();
	}
});
