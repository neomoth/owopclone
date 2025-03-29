"use strict";

import { colorUtils as color, getTime, eventSys } from "./util.js";
import { EVENTS as e, protocol, activeFx, PublicAPI, camera } from "./conf.js";
import { renderer, isVisible } from "./canvas_renderer.js";

export const PLAYERFX = {
	NONE: null,
	RECT_SELECT_ALIGNED: (pixelSize, htmlColor) => (fx, ctx, time) => {
		let x = fx.extra.player.x;
		let y = fx.extra.player.y;
		let fxx = (Math.floor(x / (16 * pixelSize)) * pixelSize - camera.x) * camera.zoom;
		let fxy = (Math.floor(y / (16 * pixelSize)) * pixelSize - camera.y) * camera.zoom;
		ctx.globalAlpha = 0.8;
		ctx.strokeStyle = htmlColor || fx.extra.player.htmlRgb;
		ctx.strokeRect(fxx, fxy, camera.zoom * pixelSize, camera.zoom * pixelSize);
		return 1; /* Rendering finished (won't change on next frame) */
	}
};

export const WORLDFX = {
	NONE: null,
	RECT_FADE_ALIGNED: (size, x, y, startTime = getTime()) => (fx, ctx, time) => {
		let alpha = 1 - (time - startTime) / 1000;
		if (alpha <= 0) {
			fx.delete();
			return 2; /* 2 = An FX object was deleted */
		}
		let fxx = (x * size - camera.x) * camera.zoom;
		let fxy = (y * size - camera.y) * camera.zoom;
		let s = camera.zoom * size;
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = fx.extra.htmlRgb || "#000000";
		ctx.strokeRect(fxx, fxy, s, s);

		// pixel player id on moderator view
		// if (options.enableIdView && player.rank >= RANK.MODERATOR && camera.zoom >= 8 && fx.extra.tag) {
		// 	fxx += s;
		// 	let str = fx.extra.tag;
		// 	let ts = ctx.measureText(str).width;
		// 	ctx.fillStyle = "#FFFFFF";
		// 	ctx.strokeStyle = "#000000";
		// 	ctx.strokeText(str, fxx, fxy);
		// 	ctx.fillText(str, fxx, fxy);
		// }

		return 0; /* 0 = Animation not finished */
	}
};


/*PublicAPI.activeFx = activeFx;*/

export class Fx {
	constructor(renderFunc, extra) {
		this.visible = true;
		this.renderFunc = renderFunc;
		this.extra = extra || {};
		activeFx.push(this);
	}

	render(ctx, time) {
		if (this.renderFunc && this.visible) {
			return this.renderFunc(this, ctx, time);
		}
		return 1;
	}

	setVisibleFunc(func) {
		Object.defineProperty(this, 'visible', {
			get: func
		});
	}

	setVisible(bool) {
		this.visible = bool;
	}

	setRenderer(func) {
		this.renderFunc = func;
	}

	update(extra) {
		this.extra = extra;
	}

	delete() {
		let i = activeFx.indexOf(this);
		if (i !== -1) {
			activeFx.splice(i, 1);
		}
	}
}

PublicAPI.fx = {
	world: WORLDFX,
	player: PLAYERFX,
	class: Fx
};

eventSys.on(e.net.world.tilesUpdated, tiles => {
	let made = false;

	for (let i = 0; i < tiles.length; i++) {
		let t = tiles[i];

		if (isVisible(t.x, t.y, 1, 1)) {
			new Fx(WORLDFX.RECT_FADE_ALIGNED(1, t.x, t.y), { htmlRgb: color.toHTML(t.rgb ^ 0xFFFFFF), tag: '' + t.id });
			made = true;
		}
	}
	if (made) {
		renderer.render(renderer.rendertype.FX);
	}
});

eventSys.on(e.net.chunk.set, (chunkX, chunkY, data) => {
	let wX = chunkX * protocol.chunkSize;
	let wY = chunkY * protocol.chunkSize;
	if (isVisible(wX, wY, protocol.chunkSize, protocol.chunkSize)) {
		new Fx(WORLDFX.RECT_FADE_ALIGNED(16, chunkX, chunkY));
		renderer.render(renderer.rendertype.FX);
	}
});

eventSys.on(e.net.chunk.lock, (chunkX, chunkY, state, local) => {
	let wX = chunkX * protocol.chunkSize;
	let wY = chunkY * protocol.chunkSize;
	if (!local && isVisible(wX, wY, protocol.chunkSize, protocol.chunkSize)) {
		new Fx(WORLDFX.RECT_FADE_ALIGNED(16, chunkX, chunkY), {
			htmlRgb: state ? "#00FF00" : "#FF0000"
		});
		renderer.render(renderer.rendertype.FX);
	}
});