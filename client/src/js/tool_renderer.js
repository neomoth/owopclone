"use strict";

import { EVENTS as e, options, cursors } from "./conf.js";

function reduce(canvas) { /* Removes unused space from the image */
	let nw = canvas.width;
	let nh = canvas.height;
	let ctx = canvas.getContext('2d');
	let idat = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let u32dat = new Uint32Array(idat.data.buffer);
	let xoff = 0;
	let yoff = 0;
	for (let y = 0, x, i = 0; y < idat.height; y++) {
		for (x = idat.width; x--; i += u32dat[y * idat.width + x] >> 26);
		if (i) { break; }
		yoff++;
		nh--;
	}
	for (let x = 0, y, i = 0; x < idat.width; x++) {
		for (y = nh; y--; i += u32dat[y * idat.width + x] >> 26);
		if (i) { break; }
		xoff++;
		nw--;
	}
	for (let y = idat.height, x, i = 0; y--;) {
		for (x = idat.width; x--; i += u32dat[y * idat.width + x] >> 26);
		if (i) { break; }
		nh--;
	}
	for (let x = idat.width, y, i = 0; x--;) {
		for (y = nh; y--; i += u32dat[y * idat.width + x] >> 26);
		if (i) { break; }
		nw--;
	}
	canvas.width = nw;
	canvas.height = nh;
	ctx.putImageData(idat, -xoff, -yoff);
}

function shadow(canvas, img) {
	/* Make a bigger image so the shadow doesn't get cut */
	canvas.width = 2 + img.width + 6;
	canvas.height = 2 + img.height + 6;
	let ctx = canvas.getContext('2d');
	ctx.shadowColor = '#000000';
	ctx.globalAlpha = 0.5; /* The shadow is too dark so we draw it transparent */
	ctx.shadowBlur = 4;
	ctx.shadowOffsetX = 2;
	ctx.shadowOffsetY = 2;
	ctx.drawImage(img, 2, 2);
	ctx.globalAlpha = 1;
	ctx.shadowColor = 'rgba(0, 0, 0, 0)'; /* disables the shadow */
	ctx.drawImage(img, 2, 2);
}

/* makes a hole with the shape of the image */
function popOut(canvas, img) {
	let shadowcolor = 0xFF3B314D;
	let backgroundcolor = 0x4F9C237E;
	canvas.width = img.width;
	canvas.height = img.height;
	let ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	let idat = ctx.getImageData(0, 0, canvas.width, canvas.height);
	let u32dat = new Uint32Array(idat.data.buffer);
	let clr = function (x, y) {
		return (x < 0 || y < 0 || x >= idat.width || y >= idat.height) ? 0
			: u32dat[y * idat.width + x];
	};
	for (let i = u32dat.length; i--;) {
		if (u32dat[i] !== 0) {
			u32dat[i] = backgroundcolor;
		}
	}
	for (let y = idat.height; y--;) {
		for (let x = idat.width; x--;) {
			if (clr(x, y) === backgroundcolor && (!clr(x, y - 1) || !clr(x - 1, y)) && !clr(x - 1, y - 1)) {
				u32dat[y * idat.width + x] = shadowcolor;
			}
		}
	}
	for (let y = idat.height; y--;) {
		for (let x = idat.width; x--;) {
			if (clr(x, y - 1) === shadowcolor
				&& clr(x - 1, y) === shadowcolor) {
				u32dat[y * idat.width + x] = shadowcolor;
			}
		}
	}
	ctx.putImageData(idat, 0, 0);
}

export function load_tool_icons(oncomplete) {
	cursors.set.crossOrigin = "anonymous";
	cursors.set.onload = function () {
		let set = cursors.set;
		let slotcanvas = document.createElement('canvas');
		popOut(slotcanvas, set);
		let j = Object.keys(cursors).length - 1 + 1; /* +1 slotset to blob url */
		for (let tool in cursors) {
			if (tool === 'set') { continue; }
			tool = cursors[tool];
			let original = document.createElement('canvas');
			let i = tool.img = {
				shadowed: document.createElement('canvas'),
				shadowblob: null
			};
			original.width = original.height = 36;
			original.getContext('2d').drawImage(set,
				tool.imgpos[0] * 36,
				tool.imgpos[1] * 36,
				36, 36,
				0, 0,
				36, 36
			);
			reduce(original);
			shadow(i.shadowed, original);
			tool.hotspot[0] += 2;
			tool.hotspot[1] += 2; /* Check shadow() for explanation */

			/* Blob-ify images */
			i.shadowed.toBlob(function (blob) {
				this.img.shadowblob = URL.createObjectURL(blob);
				if (!--j) oncomplete();
			}.bind(tool));
		}
		slotcanvas.toBlob(blob => {
			cursors.slotset = URL.createObjectURL(blob);
			if (!--j) oncomplete();
		});
	};

	cursors.set.src = options.toolSetUrl;
}