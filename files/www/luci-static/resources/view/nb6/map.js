'use strict';
'require view';
'require rpc';
'require poll';
'require nb6.icons as icons';

/*
 * Neufbox 6: network map. The internet and the VPN tunnels above the box, the devices below it in
 * three groups (wired, Wi-Fi, guests), with their live state. Drawn as SVG with DOM calls (device
 * names never become markup). Data: luci.nb6 "home" and "devices".
 */

const callHome = rpc.declare({ object: 'luci.nb6', method: 'home', expect: { '': {} } });
const callDevices = rpc.declare({ object: 'luci.nb6', method: 'devices', expect: { '': {} } });

const NS = 'http://www.w3.org/2000/svg';
/* colours: the neutral ones follow the theme (light or dark), read when the map is drawn */
const tok = (name, light) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || light;
const C = { ok: '#28cd46', warn: '#ff8c00', bad: '#eb2323', off: '#b5b5bf', line: '#cfc8dc', purple: '#5c2483', ink: '#2b2b33', mute: '#6d6d78',
	card: '#fff', edge: '#e4e4ea', soft: '#f3edf8', guestSoft: '#e5f4fb' };
function themeColours() {
	Object.assign(C, {
		line: tok('--nb-map-line', '#cfc8dc'), purple: tok('--nb-accent', '#5c2483'), ink: tok('--nb-text', '#2b2b33'),
		mute: tok('--nb-muted', '#6d6d78'), card: tok('--nb-card', '#fff'), edge: tok('--nb-line', '#e4e4ea'),
		soft: tok('--nb-purple-soft', '#f3edf8'), guestSoft: tok('--nb-guest-soft', '#e5f4fb')
	});
}

function el(tag, attrs, children) {
	const n = document.createElementNS(NS, tag);
	Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
	(children || []).forEach(c => n.appendChild(typeof c == 'string' ? document.createTextNode(c) : c));
	return n;
}

const short = (s, n) => s.length > n ? s.substr(0, n - 1) + '…' : s;

/* one entry per device, with its group (wired, wifi, guest) and state */
function devices(d) {
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
		e.wifi = true; e.online = true;
		if (w.guest) e.guest = true;
	});
	(d.hosts || []).forEach(h => {
		const e = dev[h.mac.toLowerCase()];
		if (e && h.name) e.name = h.name;
	});
	(d.rules || []).forEach(r => {
		const e = dev[r.mac.toLowerCase()];
		if (e) e.blocked = true;
	});
	const all = Object.values(dev);
	const sort = l => l.sort((a, b) => (a.name || a.ips[0] || '').localeCompare(b.name || b.ips[0] || ''));
	return {
		wired: sort(all.filter(e => e.online && !e.wifi && !e.guest)),
		wifi: sort(all.filter(e => e.online && e.wifi && !e.guest)),
		guest: sort(all.filter(e => e.online && e.guest)),
		offline: all.filter(e => !e.online).length
	};
}

function tunnelColor(w) {
	return w == 'up' ? C.ok : w == 'connecting' ? C.warn : C.off;
}

function draw(h, d) {
	themeColours();
	const g = devices(d), v = h.vpn || {}, w = h.wan || {}, l = h.leds || {};
	const W = 1100, cols = [['wired', 200, _('Wired')], ['wifi', 550, _('Wi-Fi')], ['guest', 900, _('Guests')]];
	const rows = Math.max(1, ...cols.map(c => g[c[0]].length));
	const H = 420 + rows * 58 + 30;
	const svg = el('svg', { 'viewBox': '0 0 %d %d'.format(W, H), 'width': '100%', 'role': 'img', 'aria-label': _('Network map') });

	const inetColor = l.internet == 'green' ? C.ok : l.internet == 'orange' ? C.warn : C.bad;
	const inetText = l.internet == 'green' ? _('Internet available') : l.internet == 'orange' ? _('WAN link up, no internet') : _('WAN cable unplugged');

	/* lines first, under the nodes */
	svg.appendChild(el('path', { 'd': 'M550 92 V176', 'stroke': inetColor, 'stroke-width': 4, 'fill': 'none' }));
	[['tailnet', 250], ['commercial', 850]].forEach(([k, x]) => {
		if (v[k] && v[k] != 'unconfigured')
			svg.appendChild(el('path', { 'd': 'M%d 60 H%d'.format(x < 550 ? x + 95 : x - 95, x < 550 ? 480 : 620), 'stroke': tunnelColor(v[k]), 'stroke-width': 3, 'stroke-dasharray': '8 6', 'fill': 'none' }));
	});
	cols.forEach(([k, x]) => {
		svg.appendChild(el('path', { 'd': 'M550 262 V300 H%d V330'.format(x), 'stroke': C.line, 'stroke-width': 3, 'fill': 'none' }));
		if (g[k].length)
			svg.appendChild(el('path', { 'd': 'M%d 364 V380 H%d V%d'.format(x, x - 150, 400 + (g[k].length - 1) * 58 + 23), 'stroke': C.line, 'stroke-width': 2, 'fill': 'none' }));
	});

	/* internet */
	svg.appendChild(el('rect', { 'x': 470, 'y': 28, 'width': 160, 'height': 64, 'rx': 32, 'fill': C.card, 'stroke': inetColor, 'stroke-width': 3 }));
	svg.appendChild(el('text', { 'x': 550, 'y': 57, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, 'fill': C.ink }, [_('Internet')]));
	svg.appendChild(el('text', { 'x': 550, 'y': 78, 'text-anchor': 'middle', 'font-size': 12, 'fill': C.mute }, [short(inetText, 26)]));

	/* VPN tunnels */
	[['tailnet', 250, _('Tailnet')], ['commercial', 850, _('Commercial VPN')]].forEach(([k, x, label]) => {
		const st = v[k] || 'unconfigured';
		const txt = st == 'up' ? _('Connected') : st == 'connecting' ? _('Connecting') : st == 'off' ? _('Off') : _('Not configured');
		svg.appendChild(el('rect', { 'x': x - 95, 'y': 34, 'width': 190, 'height': 52, 'rx': 12, 'fill': C.card, 'stroke': tunnelColor(st), 'stroke-width': 2, 'stroke-dasharray': st == 'up' ? '' : '5 4' }));
		svg.appendChild(el('text', { 'x': x, 'y': 56, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, 'fill': C.ink }, [label]));
		svg.appendChild(el('text', { 'x': x, 'y': 75, 'text-anchor': 'middle', 'font-size': 12, 'fill': tunnelColor(st) == C.off ? C.mute : tunnelColor(st) }, [txt]));
	});

	/* the box */
	svg.appendChild(el('rect', { 'x': 415, 'y': 176, 'width': 270, 'height': 86, 'rx': 16, 'fill': '#5c2483' }));	/* the box: brand purple in both themes */
	svg.appendChild(el('image', { 'href': L.resource('nb6/box.png'), 'x': 427, 'y': 182, 'width': 74, 'height': 74, 'preserveAspectRatio': 'xMidYMid meet' }));
	svg.appendChild(el('text', { 'x': 511, 'y': 212, 'font-size': 17, 'font-weight': 700, 'fill': '#fff' }, ['Neufbox 6']));
	svg.appendChild(el('text', { 'x': 511, 'y': 234, 'font-size': 12, 'fill': '#e9dff2' }, [short((h.box || {}).release ? (h.box.release.replace(/^neufbox6-openwrt /, 'v').replace(/ .*/, '')) : '', 20)]));
	svg.appendChild(el('text', { 'x': 511, 'y': 252, 'font-size': 12, 'fill': '#e9dff2' }, [_('%d device(s) connected').format(g.wired.length + g.wifi.length + g.guest.length)]));

	/* groups and devices */
	cols.forEach(([k, x, label]) => {
		svg.appendChild(el('rect', { 'x': x - 80, 'y': 330, 'width': 160, 'height': 34, 'rx': 17, 'fill': k == 'guest' ? C.guestSoft : C.soft, 'stroke': k == 'guest' ? '#0b5f86' : C.purple, 'stroke-width': 1.5 }));
		svg.appendChild(el('text', { 'x': x, 'y': 352, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, 'fill': k == 'guest' ? '#0b5f86' : C.purple }, ['%s (%d)'.format(label, g[k].length)]));
		if (!g[k].length)
			svg.appendChild(el('text', { 'x': x, 'y': 400, 'text-anchor': 'middle', 'font-size': 13, 'font-style': 'italic', 'fill': C.mute }, [_('nothing connected')]));
		g[k].forEach((e, i) => {
			const y = 400 + i * 58;
			const a = el('a', { 'href': L.url('admin/nb6/devices') });
			a.appendChild(el('path', { 'd': 'M%d %d H%d'.format(x - 150, y + 23, x - 125), 'stroke': C.line, 'stroke-width': 2 }));
			a.appendChild(el('rect', { 'x': x - 125, 'y': y, 'width': 260, 'height': 46, 'rx': 10, 'fill': C.card, 'stroke': C.edge, 'stroke-width': 1.5 }));
			a.appendChild(el('circle', { 'cx': x - 107, 'cy': y + 23, 'r': 6, 'fill': e.blocked ? C.bad : C.ok }));
			a.appendChild(el('text', { 'x': x - 93, 'y': y + 20, 'font-size': 14, 'font-weight': 700, 'fill': C.ink }, [short(e.name || _('Unnamed device'), 26)]));
			a.appendChild(el('text', { 'x': x - 93, 'y': y + 37, 'font-size': 12, 'fill': C.mute }, [(e.ips[0] || '') + (e.blocked ? ' · ' + _('internet blocked or scheduled') : '')]));
			svg.appendChild(a);
		});
	});

	return E('div', { 'id': 'nb6-map' }, [
		svg,
		E('p', { 'style': 'text-align:center;color:var(--nb-muted,#6d6d78);margin-top:.5em' }, [
			g.offline ? _('%d other device(s) seen recently, now offline.').format(g.offline) + ' ' : '',
			E('a', { 'href': L.url('admin/nb6/devices') }, _('All devices and their settings'))
		])
	]);
}

return view.extend({
	load() {
		return Promise.all([L.resolveDefault(callHome(), {}), L.resolveDefault(callDevices(), {})]);
	},

	render([h, d]) {
		poll.add(() => Promise.all([callHome(), callDevices()]).then(([h2, d2]) => {
			const old = document.getElementById('nb6-map');
			if (old) old.replaceWith(draw(h2, d2));
		}), 15);

		return E([], [
			E('style', {}, '.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; } .nb6-head h2 { margin:0; } #nb6-map svg { max-width:1100px; display:block; margin:0 auto; } #nb6-map a:hover rect { stroke:#5c2483; }'),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('map', 64),
				E('div', {}, [
					E('h2', {}, _('Network map')),
					E('div', { 'class': 'cbi-map-descr' }, _('The box, its internet connection and VPN tunnels, and the devices connected right now.'))
				])
			]),
			E('div', { 'class': 'cbi-section' }, draw(h, d))
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
