'use strict';
'require baseclass';

/*
 * Small QR code generator (byte mode, error correction level M, versions 1-40), drawn as SVG in
 * the browser: the Wi-Fi key never goes through another program. Follows ISO/IEC 18004 and the
 * structure of Project Nayuki's QR Code generator (MIT licence).
 */

const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26,
	26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20,
	21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

function rawModules(v) {
	let r = (16 * v + 128) * v + 64;
	if (v >= 2) {
		const n = Math.floor(v / 7) + 2;
		r -= (25 * n - 10) * n - 55;
		if (v >= 7) r -= 36;
	}
	return r;
}

const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v];

function gfMul(x, y) {
	let z = 0;
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d);
		z ^= ((y >>> i) & 1) * x;
	}
	return z;
}

function rsDivisor(degree) {
	const r = new Array(degree).fill(0);
	r[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			r[j] = gfMul(r[j], root);
			if (j + 1 < degree) r[j] ^= r[j + 1];
		}
		root = gfMul(root, 2);
	}
	return r;
}

function rsRemainder(data, div) {
	const r = new Array(div.length).fill(0);
	for (const b of data) {
		const f = b ^ r.shift();
		r.push(0);
		div.forEach((c, i) => r[i] ^= gfMul(c, f));
	}
	return r;
}

function alignPositions(v, size) {
	if (v == 1) return [];
	const n = Math.floor(v / 7) + 2;
	const step = v == 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
	const r = [6];
	for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
	return r;
}

function encode(text) {
	const bytes = Array.from(new TextEncoder().encode(text));

	/* smallest version that fits */
	let v = 1;
	for (; v <= 40; v++) {
		const cc = v < 10 ? 8 : 16;
		if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) break;
	}
	if (v > 40) throw new Error('text too long for a QR code');

	/* bit stream: byte mode, length, data, terminator, padding */
	const bits = [];
	const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
	put(4, 4);
	put(bytes.length, v < 10 ? 8 : 16);
	bytes.forEach(b => put(b, 8));
	const cap = dataCodewords(v) * 8;
	put(0, Math.min(4, cap - bits.length));
	put(0, (8 - bits.length % 8) % 8);
	for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
	const data = [];
	for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

	/* error correction blocks, interleaved */
	const nb = BLOCKS[v], ecl = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8);
	const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecl);
	const blocks = [];
	for (let i = 0, k = 0; i < nb; i++) {
		const d = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1));
		k += d.length;
		const e = rsRemainder(d, div);
		if (i < nShort) d.push(0);
		blocks.push(d.concat(e));
	}
	const words = [];
	for (let i = 0; i < blocks[0].length; i++)
		for (let j = 0; j < nb; j++)
			if (i != shortLen - ecl || j >= nShort) words.push(blocks[j][i]);

	/* function patterns */
	const size = v * 4 + 17;
	const mod = [], fn = [];
	for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
	const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

	for (let i = 0; i < size; i++) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0); }
	[[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++) {
				const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
				if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d != 2 && d != 4);
			}
	});
	const al = alignPositions(v, size), last = al.length - 1;
	al.forEach((ay, i) => al.forEach((ax, j) => {
		if ((i == 0 && j == 0) || (i == 0 && j == last) || (i == last && j == 0)) return;
		for (let dy = -2; dy <= 2; dy++)
			for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
	}));

	const drawFormat = mask => {
		const d = (0 << 3) | mask;	/* level M = 0b00 */
		let r = d;
		for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
		const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) != 0;
		for (let i = 0; i <= 5; i++) set(8, i, bit(i));
		set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
		for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
		for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
		for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
		set(8, size - 8, true);
	};
	drawFormat(0);
	if (v >= 7) {
		let r = v;
		for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
		const b = (v << 12) | r;
		for (let i = 0; i < 18; i++) {
			const dark = ((b >>> i) & 1) != 0, a = size - 11 + i % 3, c = Math.floor(i / 3);
			set(a, c, dark); set(c, a, dark);
		}
	}

	/* data, in the zigzag order */
	let i = 0;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right == 6) right = 5;
		for (let vert = 0; vert < size; vert++)
			for (let j = 0; j < 2; j++) {
				const x = right - j, up = ((right + 1) & 2) == 0, y = up ? size - 1 - vert : vert;
				if (!fn[y][x] && i < words.length * 8) {
					mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) != 0;
					i++;
				}
			}
	}

	/* mask with the lowest penalty */
	const MASKS = [
		(x, y) => (x + y) % 2 == 0, (x, y) => y % 2 == 0, (x, y) => x % 3 == 0, (x, y) => (x + y) % 3 == 0,
		(x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0, (x, y) => x * y % 2 + x * y % 3 == 0,
		(x, y) => (x * y % 2 + x * y % 3) % 2 == 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 == 0
	];
	const applyMask = m => {
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++)
				if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
	};
	const penalty = () => {
		let p = 0, dark = 0;
		for (let a = 0; a < size; a++) {
			let rr = 1, rc = 1;
			for (let b = 1; b < size; b++) {
				if (mod[a][b] == mod[a][b - 1]) { if (++rr == 5) p += 3; else if (rr > 5) p++; } else rr = 1;
				if (mod[b][a] == mod[b - 1][a]) { if (++rc == 5) p += 3; else if (rc > 5) p++; } else rc = 1;
			}
		}
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				if (mod[y][x]) dark++;
				if (x < size - 1 && y < size - 1 && mod[y][x] == mod[y][x + 1] && mod[y][x] == mod[y + 1][x] && mod[y][x] == mod[y + 1][x + 1]) p += 3;
			}
		return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
	};
	let best = 0, bestP = Infinity;
	for (let m = 0; m < 8; m++) {
		applyMask(m); drawFormat(m);
		const p = penalty();
		if (p < bestP) { bestP = p; best = m; }
		applyMask(m);
	}
	applyMask(best); drawFormat(best);
	return mod;
}

/* WIFI: string understood by the phone cameras (Android and iOS) */
function wifiText(ssid, key, enc) {
	const esc = s => String(s || '').replace(/([\\;,:"])/g, '\\$1');
	const t = !key || enc == 'none' ? 'nopass' : (/^sae$/.test(enc || '') ? 'SAE' : 'WPA');
	return 'WIFI:T:%s;S:%s;%s;'.format(t, esc(ssid), t == 'nopass' ? '' : 'P:' + esc(key) + ';');
}

return baseclass.extend({
	encode: encode,
	wifiText: wifiText,

	/* SVG markup of the QR code, with the 4-module quiet zone */
	svg(text, px) {
		const m = encode(text), n = m.length, q = 4, s = n + 2 * q;
		let d = '';
		for (let y = 0; y < n; y++)
			for (let x = 0; x < n; x++)
				if (m[y][x]) d += 'M%d %dh1v1h-1z'.format(x + q, y + q);
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" shape-rendering="crispEdges">'.format(s, s, px, px)
			+ '<rect width="%d" height="%d" fill="#fff"/><path fill="#000" d="%s"/></svg>'.format(s, s, d);
	},

	/* <img> element with the QR code */
	img(text, px) {
		return E('img', {
			'src': 'data:image/svg+xml;utf8,' + encodeURIComponent(this.svg(text, px)),
			'width': px, 'height': px, 'alt': _('QR code'), 'style': 'image-rendering:pixelated'
		});
	}
});
