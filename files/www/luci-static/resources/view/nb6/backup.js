'use strict';
'require view';
'require rpc';
'require ui';
'require nb6.icons as icons';

/*
 * Neufbox 6: backups. The settings archive, and a copy of the whole 16 MB flash (CFE bootloader,
 * firmware and nvram with the MAC address and calibration data unique to each box), both streamed
 * by /cgi-bin/nb6-backup. Data: luci.nb6 "backup_info".
 */

const callInfo = rpc.declare({ object: 'luci.nb6', method: 'backup_info', expect: { '': {} } });

function size(n) {
	return n >= 1048576 ? '%.1f MB'.format(n / 1048576) : '%d KB'.format(n / 1024);
}

/* POST in a hidden form: the browser saves the answer as a file */
function download(what) {
	const f = E('form', { 'method': 'post', 'action': L.env.cgi_base + '/nb6-backup', 'style': 'display:none' }, [
		E('input', { 'type': 'hidden', 'name': 'sessionid', 'value': L.env.sessionid }),
		E('input', { 'type': 'hidden', 'name': 'what', 'value': what })
	]);
	document.body.appendChild(f);
	f.submit();
	window.setTimeout(() => f.remove(), 1000);
}

const LABEL = {
	cfe: _('CFE bootloader'), firmware: _('firmware (OpenWrt and its settings)'), kernel: _('kernel'),
	rootfs: _('system'), rootfs_data: _('settings and installed packages'), nvram: _('nvram (MAC address, calibration)')
};

const STYLE = `
.nb6-head { display:flex; align-items:center; gap:1.2em; margin-bottom:1em; }
.nb6-head h2 { margin:0; }
.nb6-bk { display:grid; grid-template-columns: 1fr 1fr; gap:22px; }
.nb6-bk .cbi-section { margin:0; }
.nb6-bk p { color:#4a4a55; }
.nb6-sum code { font-size:11px; word-break:break-all; }
@media (max-width: 900px) { .nb6-bk { grid-template-columns: 1fr; } }
`;

return view.extend({
	load() {
		return L.resolveDefault(callInfo(), {});
	},

	render(info) {
		const parts = (info.parts || []);
		const top = parts.filter(p => ['cfe', 'firmware', 'nvram'].includes(p.name));
		const total = top.reduce((a, p) => a + p.size, 0);

		return E([], [
			E('style', {}, STYLE),
			E('div', { 'class': 'nb6-head' }, [
				icons.pageIcon('backup', 64),
				E('div', {}, [
					E('h2', {}, _('Backup')),
					E('div', { 'class': 'cbi-map-descr' }, _('Keep a copy of the settings, and of the whole flash memory of the box.'))
				])
			]),
			E('div', { 'class': 'nb6-bk' }, [
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Settings')),
					E('p', {}, _('All the settings: network, Wi-Fi, VPN, devices, guest network. Restore it in System > Backup / Flash Firmware, or keep it before an experiment.')),
					E('p', { 'class': 'alert-message warning' }, _('The archive contains the Wi-Fi passwords and the VPN private keys: keep it private.')),
					E('button', { 'class': 'btn cbi-button-action', 'click': () => download('config') }, _('Download the settings'))
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Full flash copy')),
					E('p', {}, _('The whole 16 MB chip, byte for byte: bootloader, firmware and nvram, which holds the MAC address and radio calibration of this box. With it, the box can be brought back to this exact state through the serial console.')),
					E('p', {}, _('Takes under a minute on the local network. Keep the file somewhere safe, it is the only copy of this box\'s nvram.')),
					E('button', {
						'class': 'btn cbi-button-action', 'disabled': total == 16777216 ? null : '',
						'click': () => download('flash')
					}, _('Download the flash (%s)').format(size(total || 16777216)))
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Flash layout')),
				E('table', { 'class': 'table nb6-sum' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, _('Partition')), E('th', { 'class': 'th' }, _('Content')),
						E('th', { 'class': 'th' }, _('Size')), E('th', { 'class': 'th' }, _('SHA-256 (to check a copy)'))
					]),
					...parts.map(p => E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, ['kernel', 'rootfs', 'rootfs_data'].includes(p.name) ? '  ↳ ' + p.name : E('strong', {}, p.name)),
						E('td', { 'class': 'td' }, LABEL[p.name] || '-'),
						E('td', { 'class': 'td' }, size(p.size)),
						E('td', { 'class': 'td' }, p.sha256 ? E('code', {}, p.sha256) : '-')
					]))
				]),
				E('div', { 'class': 'cbi-value-description' }, _('The flash copy is these three parts in order: cfe, firmware, nvram. Its first 64 KB and its last 64 KB must match the checksums above.'))
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
