'use strict';
'require view';
'require rpc';
'require ui';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6: ad and tracker blocking for the whole network (adblock-fast + dnsmasq,
 * Peter Lowe's ad server list, sized for 64 MB of RAM). Data: luci.nb6 "adblock_status".
 */

const callStatus = rpc.declare({ object: 'luci.nb6', method: 'adblock_status', expect: { '': {} } });
const callSet = rpc.declare({ object: 'luci.nb6', method: 'adblock_set', params: ['enabled'], expect: { '': {} } });
const callUpdate = rpc.declare({ object: 'luci.nb6', method: 'adblock_update', expect: { '': {} } });

function when(t) {
	return t ? new Date(t * 1000).toLocaleString() : '-';
}

return view.extend({
	load() {
		return L.resolveDefault(callStatus(), {});
	},

	card(s) {
		const on = !!s.enabled, busy = !!s.busy;
		let state;
		if (!s.installed)
			state = E('span', { 'class': 'label' }, _('Not installed'));
		else if (busy)
			state = E('span', { 'class': 'label warning' }, _('Working... (about 1 minute)'));
		else if (on && s.domains > 0)
			state = E('span', { 'class': 'label success' }, _('Active'));
		else if (on)
			state = E('span', { 'class': 'label warning' }, _('Starting'));
		else
			state = E('span', { 'class': 'label' }, _('Off'));

		return E('div', { 'class': 'cbi-section', 'id': 'nb6-adblock' }, [
			E('h3', {}, _('Ad and tracker blocking')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td', 'style': 'width:35%' }, _('State')), E('td', { 'class': 'td' }, state)]),
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Blocked domains')), E('td', { 'class': 'td' }, on ? String(s.domains || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '-')]),
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('List')), E('td', { 'class': 'td' }, _('Peter Lowe\'s ad servers'))]),
				E('tr', { 'class': 'tr' }, [E('td', { 'class': 'td' }, _('Last update')), E('td', { 'class': 'td' }, on ? when(s.updated) : '-')])
			]),
			E('div', { 'style': 'margin-top:1em' }, [
				E('button', {
					'class': 'btn ' + (on ? 'cbi-button-reset' : 'cbi-button-action'),
					'disabled': (busy || !s.installed) ? '' : null,
					'click': ui.createHandlerFn(this, () => callSet(!on).then(() => this.refresh()))
				}, on ? _('Turn off') : _('Turn on')), ' ',
				E('button', {
					'class': 'btn cbi-button',
					'disabled': (busy || !on) ? '' : null,
					'click': ui.createHandlerFn(this, () => callUpdate().then(() => this.refresh()))
				}, _('Update the list now'))
			])
		]);
	},

	refresh() {
		return callStatus().then(s => {
			const old = document.getElementById('nb6-adblock');
			if (old) old.replaceWith(this.card(s));
		});
	},

	render(s) {
		poll.add(() => this.refresh(), 10);
		return E([], [
			E('div', { 'style': 'display:flex;align-items:center;gap:1.2em;margin-bottom:1em' }, [
				icons.pageIcon('adblock', 64),
				E('div', {}, [
					E('h2', { 'style': 'margin:0' }, _('Ad blocking')),
					E('div', { 'class': 'cbi-map-descr' },
						_('Blocks advertising servers for every device on the network, through the box\'s DNS. The list is updated automatically and uses about 1.5 MB of RAM while active.'))
				])
			]),
			this.card(s),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Good to know')),
				E('ul', {}, [
					E('li', {}, _('Devices must use the box as their DNS server (the default with DHCP).')),
					E('li', {}, _('If a site no longer works, turn blocking off to check, then report the domain to the list maintainers.')),
					E('li', {}, _('The list is Peter Lowe\'s ad server list (about 3 500 domains). Bigger lists do not fit in the 64 MB of RAM of this box: the DNS service would be stopped for lack of memory.'))
				])
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
