"use strict";

import { colorUtils as color, eventSys } from "./util.js";
import { EVENTS as e, RANK, misc } from "./conf.js";
import { mouse } from "./main.js";
import { player } from "./local_player.js";
import { net } from "./networking.js";
import { centerCameraTo } from "./canvas_renderer.js";

class Point {
	constructor(x, y) {
		this.x = x;
		this.y = y;
		this.acx = x - 16 * (this.cx = Math.floor(x / 16));
		this.acy = y - 16 * (this.cy = Math.floor(y / 16));
	}
	static distance(p1, p2) {
		if (p1 instanceof Point && p2 instanceof Point) return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
	}
}

// class BPoint extends Point {
// 	constructor(x, y) {
// 		super(x, y);
// 		this.bottom = false;
// 		this.right = false;
// 	}
// 	static check(bp1, bp2, direction) {
// 		let p1 = PM.queue[`${bp1.x},${bp1.y}`];
// 		let p2 = PM.queue[`${bp2.x},${bp2.y}`];
// 		return bp1[direction] = (!!p1 && !p2) || (!p1 && !!p2);
// 	}
// }

class Pixel extends Point {
	constructor(x, y, c, o = false) {
		super(x, y);
		this.c = c;
		this.o = o;
		this.placed = false;
		this.g = false;
		this.time = 0;
	}
}

class Chunk {
	constructor(p) {
		this.t = 0;
		this.pixels = Array(256).fill(undefined);
		this.data = Array(256).fill(-1);
		this.placed = true;
		for (let j = 0; j < 16; j++) {
			for (let i = 0; i < 16; i++) {
				this.data[j * 16 + i] = color.toBGRInt(misc.world.getPixel(p.cx * 16 + i, p.cy * 16 + j));
			}
		}
	}
	setPixel(p) {
		this.pixels[`${p.acx},${p.acy}`] = p;
		if (this.data[p.acy * 16 + p.acx] === color.toBGRInt(p.c)) return;
		this.data[p.acy * 16 + p.acx] = color.toBGRInt(p.c);
		this.t = new Date().getTime();
		this.placed = false;
	}
	deletePixel(p) {
		this.pixels[`${p.acx},${p.acy}`] = undefined;
	}
	setChunkColor(c) { // i dont think im gonna use this
		this.data.fill(c);
	}
}

class Action {
	constructor(p1, p2) {
		this.x = p1.x;
		this.y = p1.y;
		this.before_color = p1.c;
		this.after_color = p2.c;
	}
	undo() {
		return this.before_color;
	}
	redo() {
		return this.after_color;
	}
}

export class PixelManager {
	constructor() {
		this.undoStack = [];
		this.redoStack = [];
		this.actionStack = {};
		this.record = false;
		this.queue = new Map();
		this.chunkQueue = new Map();
		this.moveQueue = new Map();
		this.border = {};
		this.checkMove = true;
		this.renderBorder = false;
		this.autoMove = false;
		this.enableMod = false;
		this.whitelist = new Set();
		this.enabled = true;
		this.extra = {};
		this.extra.placeData = [];
		this.extra.chunkPlaceData = [];
		let p1 = new Point(0, 0);
		for (let y = -47; y < 47; y++) {
			for (let x = -47; x < 47; x++) {
				let p2 = new Point(x, y);
				let d = Point.distance(p1, p2);
				this.extra.placeData.push([d, p2]);
			}
		}
		for (let y = -25; y < 26; y++) {
			for (let x = -25; x < 26; x++) {
				let p2 = new Point(x, y);
				let d = Point.distance(p1, p2);
				this.extra.chunkPlaceData.push([d, p2]);
			}
		}
		this.extra.placeData.sort((a, b) => a[0] - b[0]);
		this.extra.chunkPlaceData.sort((a, b) => a[0] - b[0]);

		eventSys.on(e.tick, () => {
			this.enabled ? this.placePixel() : void 0;
		});
		eventSys.on(e.net.world.tilesUpdated, (message) => {
			for (let i = 0; i < message.length; i++) {
				let p = message[i];
				if (p.id === player.id) continue;
				let placedColor = [(p & (255 << 0)) >> 0, (p & (255 << 8)) >> 8, (p & (255 << 16)) >> 16];
				if (this.whitelist.has(`${p.id}`)) this.setPixel(p.x, p.y, placedColor);
				let pixel = this.queue[`${p.x},${p.y}`];
				if (pixel) {
					this.checkMove = true;
					pixel.placed = false;
					this.moveQueue[`${Math.floor(p.x / 16)},${Math.floor(p.y / 16)}`] = true;
					this.chunkQueue[`${pixel.cx},${pixel.cy}`].placed = false;
					this.chunkQueue[`${pixel.cx},${pixel.cy}`].t = new Date().getTime();
					this.updateBorder(p.x, p.y);
				}
			}
		});
		eventSys.on(e.net.world.leave, () => {
			this.disable();
		});
		eventSys.on(e.net.world.join, () => {
			this.enable();
		});
	}
	moveToNext() {
		if (!this.autoMove) return;
		if (!this.checkMove) return;
		for (let e in this.moveQueue) {
			if (this.moveQueue[e]) {
				let [x, y] = e.split(",");
				for (let i = 0; i < 16; i++) {
					for (let j = 0; j < 16; j++) {
						let p = this.queue[`${x * 16 + i},${y * 16 + j}`];
						if (p && !p.placed) return centerCameraTo(x * 16, y * 16);
					}
				}
				this.moveQueue[e] = false;
			}
		}
		this.checkMove = false;
	}
	updateBorder(x, y) {
		let p = this.border[`${x},${y}`];
		// if (!p) p = this.border[`${x},${y}`] = new BPoint(x, y);

		let t = this.border[`${x},${y - 1}`];
		let l = this.border[`${x - 1},${y}`];
		let b = this.border[`${x},${y + 1}`];
		let r = this.border[`${x + 1},${y}`];

		// if (!t) t = new BPoint(x, y - 1);
		// if (!l) l = new BPoint(x - 1, y);
		// if (!b) b = new BPoint(x, y + 1);
		// if (!r) r = new BPoint(x + 1, y);
		// if (BPoint.check(t, p, "bottom") && (t.bottom || t.right)) this.border[`${x},${y - 1}`] = t;
		// if (BPoint.check(l, p, "right") && (l.bottom || l.right)) this.border[`${x - 1},${y}`] = l;
		// if (BPoint.check(p, b, "bottom") && (b.bottom || b.right)) this.border[`${x},${y + 1}`] = b;
		// if (BPoint.check(p, r, "right") && (r.bottom || r.right)) this.border[`${x + 1},${y}`] = r;
	}
	undo() {
		if (!this.enabled) return;
		if (!this.undoStack.length) return;
		let action = this.undoStack.pop();
		for (let e in action) {
			let e2 = action[e];
			if (!this.queue[`${e2.x},${e2.y}`] && (delete action[e], true)) continue;
			this.setPixel(e2.x, e2.y, e2.undo());
		}
		if (!Object.keys(action).length) {
			this.undo();
			return;
		}
		this.redoStack.push(action);
	}
	redo() {
		if (!this.enabled) return;
		if (!this.redoStack.length) return;
		let action = this.redoStack.pop();
		for (let e in action) {
			let e2 = action[e];
			if (!this.queue[`${e2.x},${e2.y}`] && (delete action[e], true)) continue;
			this.setPixel(e2.x, e2.y, e2.redo());
		}
		if (!Object.keys(action).length) {
			this.redo();
			return;
		}
		this.undoStack.push(action);
	}
	startHistory() {
		this.record = true;
	}
	endHistory() {
		if (!this.record) return;
		this.record = false;
		if (Object.keys(this.actionStack).length) this.undoStack.push(this.actionStack);
		this.actionStack = {};
		this.redoStack = [];
	}
	enable() {
		this.enabled = true;
	}
	disable() {
		this.enabled = false;
	}
	clearQueue() {
		this.queue = {};
		this.chunkQueue = {};
		this.moveQueue = {};
		this.border = {};
	}
	unsetPixel(x, y) {
		if (this.queue[`${x},${y}`]) this.deletePixel(new Point(x, y));
		return true;
	}
	deletePixel(p) {
		delete this.queue[`${p.x},${p.y}`];
		this.chunkQueue[`${p.cx},${p.cy}`].deletePixel(p);
		let found = undefined;
		// ! MARK FOR DELETION
		// i can remove this if i develop the chunks system to manage movequeue
		for (let i = 0; i < 16; i++) {
			for (let j = 0; j < 16; j++) {
				found = this.queue[`${p.cx * 16 + i},${p.cy * 16 + j}`];
				if (found) break;
			}
			if (found) break;
		}
		if (!found) delete this.moveQueue[`${p.cx},${p.cy}`];
		this.updateBorder(p.x, p.y);
	}
	setPixel(x, y, c, placeOnce = false) {
		if (!this.enabled) return misc.world.setPixel(x, y, c);

		this.ignoreProtectedChunks = player.rank >= RANK.MODERATOR;

		if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
		if (!Array.isArray(c) || c.length < 3 || c.length > 4) return false;

		// Ensure color values are valid
		c = c.slice(0, 3); // Remove alpha if present
		for (let i = 0; i < c.length; i++) {
			if (!Number.isInteger(c[i]) || c[i] < 0 || c[i] > 255) return false;
		}

		const p = new Pixel(x, y, c, placeOnce);
		const chunkKey = p.cx + "," + p.cy;

		if (!this.ignoreProtectedChunks && misc.world.protectedChunks[chunkKey]) return false;

		if (this.record) {
			const stack = this.actionStack[x + "," + y];
			if (!(stack instanceof Action)) {
				const beforePixel = new Pixel(x, y, this.getPixel(x, y, 1));
				if (JSON.stringify(beforePixel.c) !== JSON.stringify(p.c)) {
					this.actionStack[x + "," + y] = new Action(beforePixel, p);
				}
			} else {
				stack.after_color = c;
			}
		}

		// **Immediate update in the world**
		misc.world.setPixel(x, y, c);

		// **Queue Processing to Maintain Undo/Redo and Chunk Logic**
		this.queue[p.x + "," + p.y] = p;
		if (!this.chunkQueue[chunkKey]) this.chunkQueue[chunkKey] = new Chunk(p);
		this.chunkQueue[chunkKey].setPixel(p);

		this.moveQueue[chunkKey] = true;
		this.updateBorder(p.x, p.y);

		this.checkMove = true;
		return true;
	}
	getPixel(x, y, a = true) {
		if (!Number.isInteger(x) || !Number.isInteger(y)) {
			console.error('Invalid inputs for "getPixel" on PixelManager instance.');
			return undefined;
		}

		if (a && this.queue && this.queue[x + "," + y] && this.queue[x + "," + y].c) {
			return this.queue[x + "," + y].c;
		}

		if (typeof misc.world.getPixel === "function") {
			return misc.world.getPixel(x, y);
		}

		return undefined;
	}
	// this is an internal function to place pixels every tick.
	placePixel() {
		if (player.rank >= RANK.MODERATOR && this.enableMod) {
			const cx = Math.floor(mouse.tileX / 16);
			const cy = Math.floor(mouse.tileY / 16);

			for (let i = 0; i < this.extra.chunkPlaceData.length; i++) {
				const e = this.extra.chunkPlaceData[i][1];
				const xchunk = cx + e.x;
				const ychunk = cy + e.y;
				const chunkKey = xchunk + "," + ychunk;
				const currentChunk = this.chunkQueue[chunkKey];

				if (!currentChunk || currentChunk.placed || Date.now() - currentChunk.t <= 1) continue;

				if (!net.protocol.setChunk(xchunk, ychunk, currentChunk.data)) break;

				for (let j = 0; j < currentChunk.pixels.length; j++) {
					if (currentChunk.pixels[j]) {
						currentChunk.pixels[j].placed = true;
					}
				}

				currentChunk.placed = true;
			}
		} else {
			const tX = mouse.tileX;
			const tY = mouse.tileY;
			const xcc = Math.floor(tX / 16) * 16;
			const ycc = Math.floor(tY / 16) * 16;

			for (let i = 0; i < this.extra.placeData.length; i++) {
				const e = this.extra.placeData[i][1];
				const p = this.queue[(tX + e.x) + "," + (tY + e.y)];
				if (!p) continue;

				const chunkKey = p.cx + "," + p.cy;
				if (!this.ignoreProtectedChunks && misc.world.protectedChunks[chunkKey]) continue;

				if (p.x < (xcc - 31) || p.y < (ycc - 31) || p.x > (xcc + 46) || p.y > (ycc + 46)) continue;

				const c = this.getPixel(p.x, p.y, 0);
				if (!c) continue;

				if (p.c.int !== color.toInt(c)) {
					if (!p.placed) {
						p.placed = misc.world.setPixel(p.x, p.y, p.c);
					} else if (!p.time || Date.now() - p.time > 250) {
						misc.world.setPixel(p.x, p.y, p.c);
						p.time = Date.now();
					}
				} else if (p.o) {
					this.deletePixel(p);
					p.placed = true;
				}
			}
		}
		this.moveToNext();
	}
}

export const PM = new PixelManager;