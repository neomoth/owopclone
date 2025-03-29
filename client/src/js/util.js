"use strict";
// a bunch of pre defined functions either dynamic/static or otherwise usable by all other files in the codebase
import { EventEmitter } from "events";

export const eventSys = new EventEmitter();

export const colorUtils = {
	to888: (R, G, B) => [(R * 527 + 23) >> 6, (G * 259 + 33) >> 6, (B * 527 + 23) >> 6],
	to565: (R, G, B) => [(R * 249 + 1014) >> 11, (G * 253 + 505) >> 10, (B * 249 + 1014) >> 11],
	u16_565: (R, G, B) => B << 11 | G << 5 | R,
	u24_888: (R, G, B) => B << 16 | G << 8 | R,
	u32_888: (R, G, B) => colorUtils.u24_888(R, G, B) | 0xFF000000,
	u16_565_to_888: color => {
		const R = ((color & 0b11111) * 527 + 23) >> 6;
		const G = ((color >> 5 & 0b11111) * 527 + 23) >> 6;
		const B = ((color >> 11 & 0b11111) * 527 + 23) >> 6;
		return B << 16 | G << 8 | R;
	},
	arrFrom565: color => [color & 0b11111, color >> 5 & 0b111111, color >> 11 & 0b11111],
	toHTML: color => {
		color = (color >> 16 & 0xFF | color & 0xFF00 | color << 16 & 0xFF0000).toString(16);
		return '#' + ('000000' + color).substring(color.length);
	},
	toBGRInt(c) {
		return (c[2] << 16 & 16711680) | (c[1] << 8 & 65280) | (c[0] & 255);
	},
	toInt(c) {
		return (c[0] << 16 & 16711680) | (c[1] << 8 & 65280) | (c[2] & 255);
	},
	fromInt(n) {
		return [(n & 16711680) >> 16, (n & 65280) >> 8, n & 255];
	}
};

let shouldFool = false; //(d=>d,getMonth()==3&&d.getDate()==1)(newDate())
export function getDefaultWorld() {
	try {
		return shouldFool ? 'aprilFools' : 'main';
	} catch (e) {
		return 'main';
	}
}

let time = Date.now();
export function getTime(update) {
	return update ? (time = Date.now()) : time;
}

export function setCookie(name, value) {
	document.cookie = `${name}=${value}; expires=Fri, 31 Dec 99999 23:59:59 GMT`;
}

export function getCookie(name) {
	let cookie = document.cookie.split(';');
	for (let i = 0; i < cookie.length; i++) {
		let index = cookie[i].indexOf(name);
		if (index === 0 || (index === 1 && cookie[i][0] === ' ')) {
			let offset = index + name.length + 1;
			return cookie[i].substring(offset, cookie[i].length);
		}
	}
	return null;
}

export function cookiesEnabled() {
	return navigator.cookieEnabled;
}

export function storageEnabled() {
	try { return !!window.localStorage; }
	catch (e) { return false };
}

export function propertyDefaults(obj, defaults) {
	if (obj) {
		for (let prop in obj) {
			if (obj.hasOwnProperty(prop)) {
				defaults[prop] = obj[prop];
			}
		}
	}
	return defaults;
}

export function absMod(n1, n2) {
	return ((n1 % n2) + n2) % n2;
}

export function HTMLOListElement(html) {
	return mkHTML("template", {
		innerHTML: html
	}).content.firstChild;
}

export function escapeHTML(text) {
	return text.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\"/g, '&quot;')
		.replace(/\'/g, '&#39;')
		.replace(/\//g, '&#x2F;');
}

export function mkHTML(tag, opts) {
	let element = document.createElement(tag);
	for (let i in opts) {
		element[i] = opts[i];
	}
	return element;
}

export function loadScript(name, callback) {
	document.getElementsByTagName('head')[0].appendChild(mkHTML("script", {
		type: "text/javascript",
		src: name,
		onload: callback,
	}));
}

export function eventOnce(element, events, func) {
	let ev = events.split(' ');
	let f = e => {
		for (let i = 0; i < ev.length; i++) {
			element.removeEventListener(ev[i], f);
		}
		return func();
	};

	for (let i = 0; i < ev.length; i++) {
		element.addEventListener(ev[i], f);
	}
}

let lastTooltipText = '';

export function initializeTooltips() {
	initDOMTooltips();
	let tooltip = document.createElement('div');
	tooltip.id = 'tooltip';
	document.body.appendChild(tooltip);
	tooltip.style.opacity = '0%';
}

export function setTooltip(element, message) {
	element.setAttribute('tooltip', message);
	element.setAttribute('ttApplied', 'true');
	element.addEventListener('mousemove', e => { tooltipHover(e); });
	element.addEventListener('mouseleave', tooltipLeave);
}

document.addEventListener("DOMContentLoaded", initializeTooltips);

function initDOMTooltips() {
	let elements = document.querySelectorAll('[tooltip]');
	for (let element of elements) {
		if (element.getAttribute('ttApplied') == 'true') continue;
		element.addEventListener('mousemove', e => { tooltipHover(e); });
		element.addEventListener('mouseleave', tooltipLeave);
		element.setAttribute('ttApplied', 'true');
	}
}

function tooltipHover(e) {
	const tooltip = document.getElementById('tooltip');
	const tooltipText = e.target.getAttribute('tooltip');
	if (tooltipText != lastTooltipText) {
		tooltip.innerHTML = tooltipText;
		lastTooltipText = tooltipText;
	}
	tooltip.style.opacity = '100%';
	const tipRect = tooltip.getBoundingClientRect();
	let tipX = e.clientX + 20;
	let tipY = e.clientY + 20;
	if (tipX + tipRect.width > window.innerWidth) {
		tipX = e.clientX - tooltip.offsetWidth - 20;
	}

	if (tipY + tipRect.height > window.innerHeight) {
		tipY = e.clientY - tooltip.offsetHeight - 20;
	}

	if (tipY < 0) {
		tipY = 0;
	}

	tooltip.style.top = tipY + 'px';
	tooltip.style.left = tipX + 'px';
}

function tooltipLeave() {
	document.getElementById('tooltip').style.opacity = '0%';
}

export function waitFrames(n, cb) {
	window.requestAnimationFrame(() => {
		return n > 0 ? waitFrames(--n, cb) : cb();
	});
}

export function decompress(u8arr) {
	let originalLength = u8arr[1] << 8 | u8arr[0];
	let u8decompressedarr = new Uint8Array(originalLength);
	let numOfRepeats = u8arr[3] << 8 | u8arr[2];
	let offset = numOfRepeats * 2 + 4;
	let uptr = 0;
	let cptr = offset;
	for (let i = 0; i < numOfRepeats; i++) {
		let currentRepeatLoc = (u8arr[4 + i * 2 + 1] << 8 | u8arr[4 + i * 2]) + offset;
		while (cptr < currentRepeatLoc) {
			u8decompressedarr[uptr++] = u8arr[cptr++];
		}
		let repeatedNum = u8arr[cptr + 1] << 8 | u8arr[cptr];
		let repeatedColorR = u8arr[cptr + 2];
		let repeatedColorG = u8arr[cptr + 3];
		let repeatedColorB = u8arr[cptr + 4];
		cptr += 5;
		while (repeatedNum--) {
			u8decompressedarr[uptr] = repeatedColorR;
			u8decompressedarr[uptr + 1] = repeatedColorG;
			u8decompressedarr[uptr + 2] = repeatedColorB;
			uptr += 3;
		}
	}
	while (cptr < u8arr.length) {
		u8decompressedarr[uptr++] = u8arr[cptr++];
	}
	return u8decompressedarr;
}

export function line(x1, y1, x2, y2, size, plot) {
	var dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
	var dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
	var err = dx + dy,
		e2;

	while (true) {
		plot(x1, y1);
		if (x1 == x2 && y1 == y2) break;
		e2 = 2 * err;
		if (e2 >= dy) { err += dy; x1 += sx; }
		if (e2 <= dx) { err += dx; y1 += sy; }
	}
}

export function createContextMenu(x, y, buttons) {
	let shown = false;
	let contextMenu = document.createElement("div");
	contextMenu.className = "context-menu";
	
	function removeMenu(event) {
		document.body.removeChild(contextMenu);
		document.removeEventListener("click", removeMenu);
		shown = false;
	}

	if (shown) {
		removeMenu();
	}

	contextMenu.innerHTML = "";
	for (let i = 0; i < buttons.length; i++) {
		let button = document.createElement("button");
		button.textContent = buttons[i][0];
		button.addEventListener("click", buttons[i][1]);
		contextMenu.appendChild(button);
	}
	document.body.appendChild(contextMenu);
	shown = true;
	let height = contextMenu.offsetHeight;
	// console.log(height);
	if (y + height > window.innerHeight - 20) {
		contextMenu.style.top = (y - height) + "px";
	} else {
		contextMenu.style.top = y + "px";
	}
	contextMenu.style.left = x + "px";

	document.addEventListener("click", removeMenu);
}

export class Lerp {
	constructor(start, end, ms) {
		this.start = start;
		this.end = end;
		this.ms = ms;
		this.time = getTime();
	}

	get val() {
		let amt = Math.min((getTime() - this.time) / this.ms, 1);
		return (1 - amt) * this.start + amt * this.end;
	}

	set val(v) {
		this.start = this.val;
		this.end = v;
		this.time = getTime(true);
	}
}

export class Bucket {
	constructor(rate, time) {
		this.lastCheck = Date.now();
		this.allowance = rate;
		this.rate = rate;
		this.time = time;
		this.infinite = false;
	}
	canSpend(count) {
		if (this.infinite) return true;
		this.allowance += (Date.now() - this.lastCheck) / 1000 * (this.rate / this.time);
		// console.log(this.allowance);
		this.lastCheck = Date.now();
		if (this.allowance > this.rate) this.allowance = this.rate;
		if (this.allowance < count) return false;
		this.allowance -= count;
		return true;
	}
	update() {
		if (this.infinite) return this.allowance = Infinity;
		this.allowance += (Date.now() - this.lastCheck) / 1000 * (this.rate / this.time);
		if (this.allowance > this.rate) this.allowance = this.rate;
	}
}