'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';
'require nb6.qr as qr';

/*
 * Neufbox 6: setup wizard. Opens by itself on a new box (nb6.setup.done = 0, from the Home page) and
 * stays in the menu to run it again. Steps: language, administrator password, Wi-Fi name and password,
 * time zone, then a summary with the QR code of the Wi-Fi. The Wi-Fi changes are applied at the very
 * end, so a visitor connected over Wi-Fi does not lose the page in the middle of the wizard.
 * Data: luci.nb6 "setup", "wifi"; luci "getTimezones".
 */

const callSetup = rpc.declare({ object: 'luci.nb6', method: 'setup', expect: { '': {} } });
const callWifi = rpc.declare({ object: 'luci.nb6', method: 'wifi', expect: { '': {} } });
const callZones = rpc.declare({ object: 'luci', method: 'getTimezones', expect: { '': {} } });
const callLang = rpc.declare({ object: 'luci.nb6', method: 'setup_lang', params: ['lang'], expect: { '': {} } });
const callPassword = rpc.declare({ object: 'luci.nb6', method: 'setup_password', params: ['password'], expect: { '': {} } });
const callTime = rpc.declare({ object: 'luci.nb6', method: 'setup_time', params: ['zonename', 'timezone'], expect: { '': {} } });
const callWifiSet = rpc.declare({ object: 'luci.nb6', method: 'wifi_set', params: ['ssid', 'key', 'enabled', 'secure'], expect: { '': {} } });
const callDone = rpc.declare({ object: 'luci.nb6', method: 'setup_done', expect: { '': {} } });

const STEP_KEY = 'nb6-setup-step';

function store(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
function stored(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

const STYLE = `
.nb6-wiz { max-width:680px; margin:0 auto 2em; }
.nb6-wiz-head { display:flex; align-items:center; gap:1.1em; margin:.5em 0 1.2em; }
.nb6-wiz-head h2 { margin:0; }
.nb6-steps { display:flex; gap:6px; margin-bottom:1.4em; }
.nb6-steps div { flex:1; text-align:center; font-size:12px; color:var(--nb-muted,#6d6d78); }
.nb6-steps div::before { content:''; display:block; height:5px; border-radius:3px; background:var(--nb-line,#e4e4ea); margin-bottom:6px; }
.nb6-steps div.nb6-done::before { background:#5c2483; }
.nb6-steps div.nb6-now::before { background:#e2001a; }
.nb6-steps div.nb6-now { color:var(--nb-text,#1a1a22); font-weight:600; }
.nb6-wiz-card { border:1px solid var(--nb-line,#e4e4ea); border-radius:16px; padding:22px 24px; background:var(--nb-card,#fff); }
.nb6-wiz-card h3 { margin:0 0 .5em; font-size:20px; }
.nb6-wiz-card p { margin:.4em 0 1em; }
.nb6-field { margin:1em 0; }
.nb6-field > label { display:block; font-weight:600; margin-bottom:.3em; }
.nb6-field input[type=text], .nb6-field input[type=password], .nb6-field select { width:100%; max-width:26em; }
.nb6-choice { display:block; border:1px solid var(--nb-line,#e4e4ea); border-radius:12px; padding:12px 14px; margin:.5em 0; cursor:pointer; }
.nb6-choice input { margin:0 .7em 0 0; vertical-align:middle; }
.nb6-choice small { display:block; margin:.2em 0 0 1.9em; color:var(--nb-muted,#6d6d78); }
.nb6-nav { display:flex; justify-content:space-between; align-items:center; margin-top:1.4em; gap:1em; }
.nb6-err { color:#b90016; font-weight:600; min-height:1.2em; }
.nb6-sum { display:grid; grid-template-columns: 1fr 240px; gap:20px; align-items:start; }
.nb6-sum table td { padding:4px 8px 4px 0; vertical-align:top; }
.nb6-sum .nb6-qrbox { text-align:center; border:1px solid var(--nb-line,#e4e4ea); border-radius:14px; padding:10px; background:var(--nb-card,#fff); }
@media (max-width: 700px) { .nb6-sum { grid-template-columns: 1fr; } }
`;

return view.extend({
	load() {
		return Promise.all([L.resolveDefault(callSetup(), {}), L.resolveDefault(callWifi(), {}), L.resolveDefault(callZones(), {})]);
	},

	render([setup, wifi, zones]) {
		this.setup = setup;
		this.wifi = wifi;
		this.zones = zones || {};
		/* the wizard always leaves a Wi-Fi with a password (a new box starts with an open Wi-Fi, turned off) */
		this.open = !wifi.encryption || wifi.encryption == 'none';
		/* what the last step applies */
		this.plan = {
			ssid: wifi.ssid || '', key: wifi.key || '',
			zone: this.defaultZone(setup.zonename)
		};
		this.titles = [_('Language'), _('Password'), _('Wi-Fi'), _('Time zone'), _('Finish')];
		this.box = E('div', { 'class': 'nb6-wiz' });
		const step = +stored(STEP_KEY) || 0;
		store(STEP_KEY, null);
		this.show(step < this.titles.length ? step : 0);

		return E([], [E('style', {}, STYLE), this.box]);
	},

	defaultZone(current) {
		if (current && current != 'UTC' && this.zones[current]) return current;
		let tz = '';
		try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
		return this.zones[tz] ? tz : (current || 'UTC');
	},

	show(n) {
		this.step = n;
		const steps = this.titles.map((t, i) => E('div', { 'class': i < n ? 'nb6-done' : (i == n ? 'nb6-now' : '') }, t));
		const body = [this.stepLanguage, this.stepPassword, this.stepWifi, this.stepTime, this.stepFinish][n].call(this);
		this.box.replaceChildren(
			E('div', { 'class': 'nb6-wiz-head' }, [
				icons.pageIcon('setup', 56),
				E('div', {}, [
					E('h2', {}, _('Setup wizard')),
					E('div', { 'class': 'cbi-map-descr' }, _('Step %d of %d').format(n + 1, this.titles.length))
				])
			]),
			E('div', { 'class': 'nb6-steps' }, steps),
			E('div', { 'class': 'nb6-wiz-card' }, body)
		);
		window.scrollTo(0, 0);
	},

	nav(next, opts) {
		opts = opts || {};
		this.err = E('div', { 'class': 'nb6-err' });
		return E([], [
			this.err,
			E('div', { 'class': 'nb6-nav' }, [
				this.step > 0
					? E('button', { 'class': 'btn cbi-button', 'click': () => this.show(this.step - 1) }, _('Back'))
					: E('a', {
						'href': '#', 'click': ui.createHandlerFn(this, ev => {
							ev.preventDefault();
							return callDone().then(() => { window.location.href = L.url('admin/status/nb6home'); });
						})
					}, _('Skip the wizard')),
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, next) }, opts.label || _('Next'))
			])
		]);
	},

	fail(msg) {
		this.err.textContent = _(msg);
		return Promise.resolve();
	},

	/* 1. language: applied at once, the page reloads in the new language */
	stepLanguage() {
		const cur = this.setup.lang || 'auto';
		const choice = (v, title, sub) => E('label', { 'class': 'nb6-choice' }, [
			E('input', { 'type': 'radio', 'name': 'nb6lang', 'value': v, 'checked': v == cur ? '' : null }), ' ',
			E('strong', {}, title), sub ? E('small', {}, sub) : ''
		]);
		return [
			E('h3', {}, _('Welcome to your Neufbox')),
			E('p', {}, _('A few steps to make it yours: a password to protect the settings, the Wi-Fi name and password, and the time zone. It takes two minutes.')),
			E('div', { 'class': 'nb6-field' }, [
				E('label', {}, _('Language of the interface')),
				choice('fr', 'Français'),
				choice('en', 'English'),
				choice('auto', _('Automatic'), _('the language of your browser'))
			]),
			this.nav(() => {
				const v = document.querySelector('input[name="nb6lang"]:checked').value;
				if (v == cur) { this.show(1); return; }
				return callLang(v).then(r => {
					if (r && r.error) return this.fail(r.error);
					store(STEP_KEY, '1');
					window.location.reload();
				});
			})
		];
	},

	/* 2. administrator password: applied at once (the current session stays open) */
	stepPassword() {
		const has = this.setup.password;
		const p1 = E('input', { 'type': 'password', 'class': 'cbi-input-password', 'autocomplete': 'new-password', 'maxlength': 64 });
		const p2 = E('input', { 'type': 'password', 'class': 'cbi-input-password', 'autocomplete': 'new-password', 'maxlength': 64 });
		return [
			E('h3', {}, _('Administrator password')),
			E('p', {}, has
				? _('A password already protects the settings. Leave the fields empty to keep it, or type a new one.')
				: _('Choose the password that protects the settings of the box. You will need it to open this interface again (user name: root).')),
			E('div', { 'class': 'nb6-field' }, [E('label', {}, _('New password')), p1,
				E('div', { 'class': 'cbi-value-description' }, _('At least 8 characters. A short sentence is easy to remember and hard to guess.'))]),
			E('div', { 'class': 'nb6-field' }, [E('label', {}, _('Type it again')), p2]),
			this.nav(() => {
				if (!p1.value && !p2.value) {
					if (!has) return this.fail(_('Choose a password: without one, anyone on the network can change the settings.'));
					this.show(2); return;
				}
				if (p1.value.length < 8) return this.fail(_('The password needs at least 8 characters.'));
				if (p1.value != p2.value) return this.fail(_('The two passwords are different.'));
				return callPassword(p1.value).then(r => {
					if (r && r.error) return this.fail(r.error);
					this.setup.password = true;
					this.show(2);
				});
			})
		];
	},

	/* 3. Wi-Fi name and password: kept for the last step */
	stepWifi() {
		const ssid = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'maxlength': 32, 'value': this.plan.ssid });
		const key = E('input', { 'type': 'password', 'class': 'cbi-input-password', 'maxlength': 63, 'autocomplete': 'off', 'value': this.plan.key });
		const show = E('label', { 'style': 'margin-left:.6em;font-weight:normal' }, [
			E('input', { 'type': 'checkbox', 'change': ev => { key.type = ev.target.checked ? 'text' : 'password'; } }), ' ', _('show')
		]);
		return [
			E('h3', {}, _('Wi-Fi')),
			E('p', {}, _('The name your devices see and the password to join. The password printed on the label of the box belongs to the SFR firmware and does not apply here.')),
			(this.open || !this.wifi.enabled) ? E('p', { 'class': 'alert-message notice' },
				_('The Wi-Fi is off or has no password for now: it is turned on with this name and password at the end of the wizard.')) : '',
			E('div', { 'class': 'nb6-field' }, [E('label', {}, _('Wi-Fi name')), ssid]),
			E('div', { 'class': 'nb6-field' }, [E('label', {}, [_('Wi-Fi password'), show]), key,
				E('div', { 'class': 'cbi-value-description' }, _('8 to 63 characters (letters, digits, symbols).'))]),
			this.nav(() => {
				const s = ssid.value.trim(), k = key.value;
				if (s.length < 1 || s.length > 32) return this.fail(_('The Wi-Fi name needs 1 to 32 characters.'));
				if (k.length < 8 || k.length > 63 || /[^ -~]/.test(k))
					return this.fail(_('The Wi-Fi password needs 8 to 63 characters (letters, digits, symbols).'));
				this.plan.ssid = s;
				this.plan.key = k;
				this.show(3);
			})
		];
	},

	/* 4. time zone: kept for the last step (schedules and statistics use it) */
	stepTime() {
		const names = Object.keys(this.zones).sort();
		const sel = E('select', { 'class': 'cbi-input-select' },
			(names.length ? names : [this.plan.zone]).map(z => E('option', { 'value': z, 'selected': z == this.plan.zone ? '' : null }, z.replace(/_/g, ' '))));
		return [
			E('h3', {}, _('Time zone')),
			E('p', {}, _('The box uses it for the Wi-Fi schedule, parental controls, the night mode of the LEDs and the statistics. It is already set to the one of this computer.')),
			E('div', { 'class': 'nb6-field' }, [E('label', {}, _('Time zone')), sel]),
			this.nav(() => { this.plan.zone = sel.value; this.show(4); })
		];
	},

	/* 5. summary, QR code of the new Wi-Fi, then everything is applied */
	stepFinish() {
		const w = this.wifi, p = this.plan;
		const wifiChanged = this.open || !w.enabled || p.ssid != (w.ssid || '') || p.key != (w.key || '');
		return [
			E('h3', {}, _('Ready')),
			E('div', { 'class': 'nb6-sum' }, [
				E('div', {}, [
					E('table', {}, [
						E('tr', {}, [E('td', {}, E('strong', {}, _('Password'))), E('td', {}, this.setup.password ? _('set') : _('not set'))]),
						E('tr', {}, [E('td', {}, E('strong', {}, _('Wi-Fi name'))), E('td', {}, p.ssid)]),
						E('tr', {}, [E('td', {}, E('strong', {}, _('Wi-Fi password'))), E('td', {}, _('%d characters').format(p.key.length))]),
						E('tr', {}, [E('td', {}, E('strong', {}, _('Time zone'))), E('td', {}, p.zone.replace(/_/g, ' '))])
					]),
					wifiChanged
						? E('p', { 'class': 'alert-message notice', 'style': 'margin-top:1em' }, _('The Wi-Fi restarts with its new name and password. If this computer uses the Wi-Fi, join the new network (or scan the code with a phone), then open this page again.'))
						: E('p', { 'style': 'margin-top:1em' }, _('The Wi-Fi stays as it is.'))
				]),
				E('div', { 'class': 'nb6-qrbox' }, [
					qr.img(qr.wifiText(p.ssid, p.key, this.open ? 'psk2' : w.encryption), 220),
					E('div', {}, E('small', {}, _('Scan to join the Wi-Fi')))
				])
			]),
			this.nav(() => callTime(p.zone, (this.zones[p.zone] || {}).tzstring || 'UTC0').then(r => {
				if (r && r.error) return this.fail(r.error);
				return (wifiChanged ? callWifiSet(p.ssid, p.key, true, true) : Promise.resolve({}));
			}).then(r => {
				if (r && r.error) return this.fail(r.error);
				return callDone().then(() => {
					ui.addNotification(null, E('p', _('The box is set up.')), 'info');
					window.setTimeout(() => { window.location.href = L.url('admin/status/nb6home'); }, wifiChanged ? 4000 : 800);
				});
			}), { label: _('Finish') })
		];
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
