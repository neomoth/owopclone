"use strict";

import { EVENTS as e, protocol, options, RANK, elements, PublicAPI, cursors, sounds, misc, keysDown, camera, mouse } from "./conf.js";
import { absMod, setTooltip, line, eventSys } from "./util.js";
import { net } from "./networking.js";
import { player } from "./local_player.js";
import { moveCameraBy, renderer, drawText, setZoom } from "./canvas_renderer.js";
import { windowSys, GUIWindow } from "./windowsys.js";
import { PM } from "./pixelTools.js";
import { PLAYERFX } from "./Fx.js";
import newText from "../json/newText.json";
import cyrillic from "../json/cyrillic.json";

export const tools = {};
export let toolsWindow = null;
export let toolOptsWindow = null;
let windowShown = false;

const textData = { newText, cyrillic }

export function updateToolWindow(name) {
	if (!toolsWindow) return;
	let tool = tools[name];
	let children = toolsWindow.container.children;
	for (let i = 0; i < children.length; i++) {
		let button = children[i];
		let isSelected = button.id.split('-')[1] === name;
		button.className = isSelected ? 'selected' : '';
		button.children[0].style.backgroundImage = "url(" + (isSelected ? cursors.slotset : cursors.set.src) + ")";
	}
	elements.viewport.style.cursor = "url(" + tool.cursorblob + ") " + tool.offset[0] + " " + tool.offset[1] + ", pointer";
}

function createSliderOption(opts, optionName, initialValue, cb, min = 0, max = 100, snapValue = false, stepValue = 1) {
	let sliderOption = document.createElement("div");
	sliderOption.className = "toolOption";
	let optionLabel = document.createElement("div");
	optionLabel.className = "optionName";
	optionLabel.innerText = optionName;
	sliderOption.appendChild(optionLabel);
	let slider = document.createElement("div");
	let sliderBar = document.createElement("div");
	slider.className = "slider";
	sliderBar.className = "sliderBar";
	sliderOption.appendChild(sliderBar);
	sliderBar.appendChild(slider);
	opts.appendChild(sliderOption);

	// console.log(initialValue);
	initialValue = Math.min(Math.max(initialValue, min), max);
	// console.log(initialValue);

	function setInitialPos() {
		let initialPos;
		if (snapValue) {
			// console.log(sliderBar.offsetWidth);
			const stepSize = sliderBar.offsetWidth / ((max - min) / stepValue);
			// console.log(stepSize);
			const stepCount = Math.round((initialValue - min) / stepValue);
			// console.log(stepCount);
			initialPos = stepCount * stepSize;
			// console.log(initialPos);
		}
		else initialPos = (initialValue - min) / (max - min) * sliderBar.offsetWidth;

		slider.style.left = `${initialPos}px`;
	}

	requestAnimationFrame(setInitialPos);

	let dragging = false;
	let moffx = 0;

	function updateSliderPos(event) {
		// console.log(sliderBar.offsetWidth);
		if (!dragging) return;
		const offsetX = event.clientX - sliderOption.getBoundingClientRect().left - moffx;
		let newpos = offsetX;

		if (newpos < 0) newpos = 0;
		else if (newpos > sliderBar.offsetWidth - 12) newpos = sliderBar.offsetWidth - 12;
		let cpos = newpos;

		if (snapValue) {
			const stepSize = sliderBar.offsetWidth / ((max - min) / stepValue);
			const stepCount = Math.round(cpos / stepSize);
			// const stepCount = Math.floor(cpos/(sliderBar.offsetWidth/((max-min)/stepValue)));
			// cpos = stepCount*(sliderBar.offsetWidth/((max-min)/stepValue));
			cpos = stepCount * stepSize;
		}

		slider.style.left = `${cpos}px`;

		let normalizedValue = (cpos / sliderBar.offsetWidth) * (max - min) + min;
		if (snapValue && Number.isInteger(stepValue)) normalizedValue = Math.round(normalizedValue / stepValue) * stepValue;
		cb(normalizedValue);
	}

	function stopDragging() {
		dragging = false;
		document.removeEventListener("mousemove", updateSliderPos);
		document.removeEventListener("mouseup", stopDragging);
	}

	function startDragging(event) {
		dragging = true;
		moffx = event.clientX - slider.getBoundingClientRect().left;
		document.addEventListener("mousemove", updateSliderPos);
		document.addEventListener('mouseup', stopDragging);
	}

	slider.addEventListener("mousedown", startDragging);

	return {
		label: optionLabel,
		slider,
		bar: sliderBar
	};
}

export function showToolOpts(hide) {
	let opts = toolOptsWindow.container;
	const destroy = () => {
		windowSys.delWindow(toolOptsWindow);
		while (opts.firstChild) opts.removeChild(opts.firstChild);
	}
	if (hide) return destroy();
	destroy();
	switch (player.tool.id) {
		case "cursor":
			let currentBrushSize = tools['cursor'].extra.brushSize;
			let brushSizeSlider = createSliderOption(opts, `Brush size: ${currentBrushSize}px`, currentBrushSize, (brushSize) => {
				tools['cursor'].extra.brushSize = brushSize;
				tools['cursor'].extra.brush = new Brush(0, 0, tools['cursor'].extra.brushSize - 1, tools['cursor'].extra.brushSize - 1, 0, 0);
				brushSizeSlider.label.innerText = `Brush size: ${brushSize}px`;
			}, 1, player.rank >= RANK.ARTIST ? 17 : 3, true, 1);
			windowSys.addWindow(toolOptsWindow);
			toolOptsWindow.move(toolsWindow.container.parentElement.getBoundingClientRect().x + toolsWindow.container.parentElement.offsetWidth + 5, toolsWindow.container.parentElement.getBoundingClientRect().y);
			break;
		default: destroy();
	}
}

export function updateToolbar(win = toolsWindow) {
	if (!win) return;

	const container = win.container;
	const toolButtonClick = name => event => {
		player.tool = name;
		showToolOpts(false);
		sounds.play(sounds.click);
	};

	container.innerHTML = "";

	// Add tools to the tool-select menu
	for (const name in tools) {
		let tool = tools[name];
		if (player.rank >= tool.rankRequired) {
			// console.log("fuck");
			let element = document.createElement("button");
			let mask = document.createElement("div");
			setTooltip(element, tool.name + " tool");
			element.id = "tool-" + name;
			mask.style.pointerEvents = "none";
			element.addEventListener("click", toolButtonClick(name));
			if (tool === player.tool) {
				mask.style.backgroundImage = "url(" + cursors.slotset + ")";
				element.className = "selected";
			} else {
				mask.style.backgroundImage = "url(" + cursors.set.src + ")";
			}
			mask.style.backgroundPosition = tool.setposition;
			element.appendChild(mask);
			container.appendChild(element);
		}
	}
	const outputNumber = input => input <= 7 ? 40 : 40 * Math.floor(input / 7);
	toolsWindow.container.style.maxWidth = `${outputNumber(toolsWindow.container.children.length)}px`;
}

export function showToolsWindow(bool) {
	if (windowShown !== bool) {
		if (bool && toolsWindow) {
			windowSys.addWindow(toolsWindow);
		} else if (toolsWindow) {
			windowSys.delWindow(toolsWindow);
		}
		windowShown = bool;
	}
}

export function addTool(tool) {
	tool.id = tool.name.toLowerCase();
	tools[tool.id] = tool;
	updateToolbar();
}

class Tool {
	constructor(name, cursor, fxRenderer, rankNeeded, onInit) {
		this.name = name;
		this.id = null;
		this.fxRenderer = fxRenderer;
		this.cursorblob = cursor.img.shadowblob;
		this.cursor = cursor.img.shadowed;
		this.setposition = (-cursor.imgpos[0] * 36) + "px " + (-cursor.imgpos[1] * 36) + "px";
		this.offset = cursor.hotspot;
		this.rankRequired = rankNeeded;
		this.extra = {}; /* Extra storage for tools */
		this.events = {
			mouseup: null,
			mousedown: null,
			mousemove: null,
			touchstart: null,
			touchmove: null,
			touchend: null,
			touchcancel: null,
			select: null,
			deselect: null,
			keydown: null,
			keyup: null,
			scroll: null,
			tick: null
		};
		onInit(this);
	}

	/* Doesn't update if tool already selected */
	setFxRenderer(func) {
		this.fxRenderer = func;
	}

	isEventDefined(type) {
		return type in this.events;
	}

	setEvent(type, func) {
		let events = type.split(' ');
		for (let i = 0; i < events.length; i++) {
			this.events[events[i]] = func || null;
		}
	}

	call(type, data) {
		let func = this.events[type];
		if (func) {
			return func.apply(this, data);
		} else if (type.indexOf("touch") === 0) {
			return this.defaultTouchHandler(type.slice(5), data);
		}
		return false;
	}

	defaultTouchHandler(type, data) {
		let mouse = data[0];
		let event = data[1]; /* hmm... */
		let handlers = {
			start: this.events.mousedown,
			move: this.events.mousemove,
			end: this.events.mouseup,
			cancel: this.events.mouseup
		};
		let handler = handlers[type];
		if (handler) {
			let touches = event.changedTouches;
			for (let i = 0; i < touches.length; i++) {
				mouse.x = touches[i].pageX;
				mouse.y = touches[i].pageY;
				handler.apply(this, data);
			}
		}
	}
}

export const toolsApi = PublicAPI.tools = {
	class: Tool,
	addToolObject: addTool,
	updateToolbar,
	allTools: tools
};

class Brush {
	constructor(x0, y0, x1, y1, hpx, vpx) {
		this.width = x1 - x0 + 1;
		this.height = y1 - y0 + 1;
		// console.log(this.width, this.height);
		this.centerX = Math.floor(this.width / 2);
		this.centerY = Math.floor(this.height / 2);

		this.bitmap = Array.from({ length: this.height }, () => Array(this.width).fill(0));

		this.algoEllipseFill(x0, y0, x1, y1, hpx, vpx, (x1, y, x2) => this.drawHLine(x1, y, x2));
	}

	// regenerate(sx, sy){
	// 	this.bitmap = null;
	// 	this.width = sx+1;
	// 	this.height = sy+1;
	// 	this.centerX = Math.floor(this.width/2);
	// 	this.centerY = Math.floor(this.height/2);
	// 	this.bitmap = Array.from({length: this.height}, () => Array(this.width).fill(0));
	// 	this.algoEllipseFill(0, 0, this.width, this.height, 0, 0, (x1, y, x2) => this.drawHLine(x1, y, x2));
	// }

	algoEllipseFill(x0, y0, x1, y1, hpx, vpx, cb) {
		// console.log(this);
		let res = this.adjustEllipseArgs(x0, y0, x1, y1, hpx, vpx);
		x0 = res[0];
		y0 = res[1];
		x1 = res[2];
		y1 = res[3];
		hpx = res[4];
		vpx = res[5];
		let h = res[6];

		let a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
		let dx = 4 * (1.0 - a) * b * b, dy = 4 * (b1 + 1) * a * a;
		let err = dx + dy + b1 * a * a, e2;

		y0 += (b + 1) / 2;
		y1 = y0 - b1; // starting pixel
		a = 8 * a * a;
		b1 = 8 * b * b;

		let inity0 = y0;
		let inity1 = y1;
		let initx0 = x0;
		let initx1 = x1 + hpx;

		do {
			cb(x0, y0 + vpx, x1 + hpx);
			cb(x0, y1, x1 + hpx);
			e2 = 2 * err;
			if (e2 <= dy) {
				y0++;
				y1--;
				err += dy += a;
			} // y step
			if (e2 >= dx || 2 * err > dy) {
				x0++;
				x1--;
				err += dx += b1;
			} // x step
		} while (x0 <= x1);

		while (y0 + vpx - y1 + 1 < h) {           // too early stop of flat ellipses a=1
			cb(x0 - 1, ++y0 + vpx, x0 - 1); // -> finish tip of ellipse
			cb(x1 + 1 + hpx, y0 + vpx, x1 + 1 + hpx);
			cb(x0 - 1, --y1, x0 - 1);
			cb(x1 + 1 + hpx, y1, x1 + 1 + hpx);
		}

		if (vpx > 0) {
			for (let i = inity1 + 1; i < inity0 + vpx; i++)
				cb(initx0, i, initx1);
		}
	}

	adjustEllipseArgs(x0, y0, x1, y1, hpx, vpx) {
		// console.log("before: ", x0, y0, x1, y1, hpx, vpx);
		hpx = Math.max(hpx, 0);
		vpx = Math.max(vpx, 0);

		if (x0 > x1) {
			let t;
			t = x0;
			x0 = x1;
			x1 = t;
		}
		if (y0 > y1) {
			let t;
			t = y0;
			y0 = y1;
			y1 = t;
		}
		let w = x1 - x0 + 1;
		let h = y1 - y0 + 1;

		let hDiameter = w - hpx;
		let vDiameter = h - vpx;

		if (w == 8 || w == 12 || w == 22) hpx++;
		if (h == 8 || h == 12 || h == 22) vpx++;

		hpx = hDiameter > 5 ? hpx : 0;
		vpx = vDiameter > 5 ? vpx : 0;

		if ((hDiameter % 2 == 0) && (hDiameter > 5)) hpx--;
		if ((vDiameter % 2 == 0) && (vDiameter > 5)) vpx--;

		x1 -= hpx;
		y1 -= vpx;
		// console.log("after: ", x0, y0, x1, y1, hpx, vpx);
		// console.log("H: ", h);
		return [x0, y0, x1, y1, hpx, vpx, h];
	}

	drawHLine(x1, y, x2) {
		y = Math.floor(y);
		// console.log(this)
		let t;
		if (x1 > x2) {
			t = x1;
			x1 = x2;
			x2 = t;
		}
		// console.log(x1, x2);
		// console.log(y);
		for (let x = x1; x <= x2; x++) {
			this.bitmap[y][x] = 1;
		}
		// console.log("yep");
	}

	draw(x, y, color) {
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j]) {
					const px = x + j - this.centerX;
					const py = y + i - this.centerY;
					let pixel = misc.world.getPixel(px, py);
					if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
						// misc.world.setPixel(px, py, color);
						PM.setPixel(px, py, color);
					}
				}
			}
		}
	}
}

eventSys.once(e.misc.toolsRendered, () => {
	// Cursor tool
	addTool(new Tool('Cursor', cursors.cursor, PLAYERFX.RECT_SELECT_ALIGNED(1), RANK.USER,
		tool => {
			tool.extra.brushSize = 1;
			tool.extra.brush = new Brush(0, 0, tool.extra.brushSize - 1, tool.extra.brushSize - 1, 0, 0);
			let lastX,
				lastY;
			let last1PX;
			let last1PY;
			let last2PX;
			let last2PY;
			let start;
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				let usedButtons = 0b11; /* Left and right mouse buttons are always used... */
				/* White color if right clicking */

				let color = mouse.buttons === 2 ? player.secondaryColor : player.selectedColor;
				let brushSize = tool.extra.brushSize - 1 || 0;

				switch (mouse.buttons) {
					case 1:
						if (event.ctrlKey) {
							let color = misc.world.getPixel(mouse.tileX, mouse.tileY);
							player.selectedColor = color;
							break;
						}
					case 2:
						if (event.ctrlKey) {
							let color = misc.world.getPixel(mouse.tileX, mouse.tileY);
							player.secondaryColor = color;
							break;
						}
						if (!lastX || !lastY) {
							lastX = mouse.tileX;
							lastY = mouse.tileY;
							last1PX = mouse.tileX;
							last1PY = mouse.tileY;
							last2PX = mouse.tileX;
							last2PY = mouse.tileY;
							start = true;
						}
						PM.startHistory();
						line(lastX, lastY, mouse.tileX, mouse.tileY, 1, (x, y) => {
							// brush.drawEllipse(x - brushSize /2, y - brushSize /2, x + brushSize /2, y + brushSize /2, color, (px, py)=>{
							// 	let pixel = misc.world.getPixel(px, py);
							// 	if (pixel !== null && !(color[0] === pixel[0] && color[1] === pixel[1] && color[2] === pixel[2])) {
							// 		misc.world.setPixel(px, py, color);
							// 	}
							// });
							tool.extra.brush.draw(x, y, color);
						});
						lastX = mouse.tileX;
						lastY = mouse.tileY;
						break;
					case 4:
						if (event.ctrlKey) {
							usedButtons |= 0b100;
							let color = misc.world.getPixel(mouse.tileX, mouse.tileY);
							if (color) {
								player.selectedColor = color;
							}
						}
						break;
				}
				return usedButtons;
			});
			tool.setEvent('mouseup deselect', mouse => {
				PM.endHistory();
				lastX = null;
				lastY = null;
				last1PX = undefined;
				last1PY = undefined;
				last2PX = undefined;
				last2PY = undefined;
			});
		}
	));

	// Move tool
	addTool(new Tool('Move', cursors.move, PLAYERFX.NONE, RANK.NONE,
		tool => {
			function move(x, y, startX, startY) {
				moveCameraBy((startX - x) / 16, (startY - y) / 16);
			}
			tool.setEvent('mousemove', (mouse, event) => {
				if (mouse.buttons !== 0) {
					move(mouse.worldX, mouse.worldY, mouse.mouseDownWorldX, mouse.mouseDownWorldY);
					return mouse.buttons;
				}
			});
			tool.setEvent('scroll', (mouse, event, rawEvent) => {
				if (!rawEvent.ctrlKey) {
					let dx = Math.max(-500, Math.min(event.spinX * 16, 500));
					let dy = Math.max(-500, Math.min(event.spinY * 16, 500));
					let pxAmount = camera.zoom//Math.max(camera.zoom, 2);
					moveCameraBy(dx / pxAmount, dy / pxAmount);
					return true;
				}
			});
		}
	));

	// Pipette tool
	addTool(new Tool('Pipette', cursors.pipette, PLAYERFX.NONE, RANK.NONE,
		tool => {
			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons !== 0 && !(mouse.buttons & 0b100)) {
					let color = misc.world.getPixel(mouse.tileX, mouse.tileY);
					if (color) {
						player.selectedColor = color;
					}
					return mouse.buttons;
				}
			});
		}
	));

	// Erase/Fill tool
	addTool(new Tool('Eraser', cursors.erase, PLAYERFX.RECT_SELECT_ALIGNED(16), RANK.MODERATOR,
		tool => {
			function fillChunk(chunkX, chunkY, c) {
				const color = c[2] << 16 | c[1] << 8 | c[0];
				let chunk = misc.world.getChunkAt(chunkX, chunkY);
				if (chunk) {
					let empty = true;
					firstLoop: for (let y = 0; y < protocol.chunkSize; y++) {
						for (let x = 0; x < protocol.chunkSize; x++) {
							if ((chunk.get(x, y) & 0xFFFFFF) != color) {
								empty = false;
								break firstLoop;
							}
						}
					}
					if (!empty) {
						if (net.protocol.clearChunk(chunkX, chunkY, c)) {
							chunk.set(color);
						}
					}
				}
			}

			tool.setEvent('mousedown mousemove', (mouse, event) => {
				if (mouse.buttons & 0b1) {
					fillChunk(Math.floor(mouse.tileX / protocol.chunkSize), Math.floor(mouse.tileY / protocol.chunkSize), player.selectedColor);
					return 1;
				} else if (mouse.buttons & 0b10) {
					fillChunk(Math.floor(mouse.tileX / protocol.chunkSize), Math.floor(mouse.tileY / protocol.chunkSize), [255, 255, 255]);
					return 1;
				}
			});
		}
	));

	// Zoom tool
	addTool(new Tool('Zoom', cursors.zoom, PLAYERFX.NONE, RANK.NONE,
		tool => {
			function zoom(mouse, type) {
				let lzoom = camera.zoom;
				let nzoom = camera.zoom;
				let offX = 0;
				let offY = 0;
				let w = window.innerWidth;
				let h = window.innerHeight;
				if (type === 1) {
					// Zoom in
					nzoom *= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) / nzoom;
					offY = (mouse.y - h / 2) / nzoom;
				} else if (type === 2) {
					// Zoom out
					nzoom /= 1 + options.zoomStrength;
					offX = (mouse.x - w / 2) * (3 / lzoom - 2 / nzoom);
					offY = (mouse.y - h / 2) * (3 / lzoom - 2 / nzoom);
				} else if (type === 3) {
					// Reset zoom (right + left click)
					nzoom = options.defaultZoom;
				}
				nzoom = Math.round(nzoom);
				setZoom(nzoom);
				if (camera.zoom !== lzoom) {
					moveCameraBy(offX, offY);
				}
			}

			tool.setEvent("mousedown", (mouse, event) => {
				zoom(mouse, mouse.buttons);
			});
			tool.setEvent("touchstart", (mouse, event) => {
				tool.extra.maxTouches = Math.max(tool.extra.maxTouches || 0, event.touches.length);
			});
			tool.setEvent("touchend", (mouse, event) => {
				if (event.touches.length === 0) {
					if (tool.extra.maxTouches > 1) {
						zoom(mouse, tool.extra.maxTouches);
					}
					tool.extra.maxTouches = 0;
				}
			});
		}
	));

	// Area to PNG tool
	addTool(new Tool('Export', cursors.select, PLAYERFX.NONE, RANK.NONE,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				let x = fx.extra.player.x;
				let y = fx.extra.player.y;
				let fxx = (Math.floor(x / 16) - camera.x) * camera.zoom;
				let fxy = (Math.floor(y / 16) - camera.y) * camera.zoom;
				let oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					let s = tool.extra.start;
					let e = tool.extra.end;
					let x = (s[0] - camera.x) * camera.zoom + 0.5;
					let y = (s[1] - camera.y) * camera.zoom + 0.5;
					let w = e[0] - s[0];
					let h = e[1] - s[1];
					ctx.beginPath();
					ctx.rect(x, y, w * camera.zoom, h * camera.zoom);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					let oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					let txt = `${!tool.extra.clicking ? "Right click to screenshot " : ""}(${Math.abs(w)}x${Math.abs(h)})`;
					let txtx = window.innerWidth >> 1;
					let txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w * camera.zoom));
					txty = Math.max(y, Math.min(txty, y + h * camera.zoom));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			function dlarea(x, y, w, h, onblob) {
				let c = document.createElement('canvas');
				c.width = w;
				c.height = h;
				let ctx = c.getContext('2d');
				let d = ctx.createImageData(w, h);
				for (let i = y; i < y + h; i++) {
					for (let j = x; j < x + w; j++) {
						let pix = misc.world.getPixel(j, i);
						if (!pix) continue;
						d.data[4 * ((i - y) * w + (j - x))] = pix[0];
						d.data[4 * ((i - y) * w + (j - x)) + 1] = pix[1];
						d.data[4 * ((i - y) * w + (j - x)) + 2] = pix[2];
						d.data[4 * ((i - y) * w + (j - x)) + 3] = 255;
					}
				}
				ctx.putImageData(d, 0, 0);
				c.toBlob(onblob);
			}

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;

			tool.setEvent('mousedown', (mouse, event) => {
				let s = tool.extra.start;
				let e = tool.extra.end;
				const isInside = () => mouse.tileX >= s[0] && mouse.tileX < e[0] && mouse.tileY >= s[1] && mouse.tileY < e[1];
				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [mouse.tileX, mouse.tileY];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [mouse.tileX, mouse.tileY];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						let s = tool.extra.start;
						let e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								let tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								let tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside()) {
						let offx = mouse.tileX;
						let offy = mouse.tileY;
						tool.setEvent('mousemove', (mouse, event) => {
							let dx = mouse.tileX - offx;
							let dy = mouse.tileY - offy;
							tool.extra.start = [s[0] + dx, s[1] + dy];
							tool.extra.end = [e[0] + dx, e[1] + dy];
						});
						const end = () => {
							tool.setEvent('mouseup deselect mousemove', null);
						};
						tool.setEvent('deselect', end);
						tool.setEvent('mouseup', (mouse, event) => {
							if (!(mouse.buttons & 1)) {
								end();
							}
						});
					} else {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside()) {
					tool.extra.start = null;
					tool.extra.end = null;
					let cvs = dlarea(s[0], s[1], e[0] - s[0], e[1] - s[1], b => {
						let url = URL.createObjectURL(b);
						let img = new Image();
						img.onload = () => {
							windowSys.addWindow(new GUIWindow("Resulting image", {
								centerOnce: true,
								closeable: true
							}, function (win) {
								let props = ['width', 'height'];
								if (img.width > img.height) {
									props.reverse();
								}
								let r = img[props[0]] / img[props[1]];
								let shownSize = img[props[1]] >= 128 ? 256 : 128;
								img[props[0]] = r * shownSize;
								img[props[1]] = shownSize;
								win.container.classList.add('centeredChilds')
								let image = win.addObj(img);
								setTooltip(img, "Right click to copy/save!");
								/*let okButton = win.addObj(mkHTML("button", {
									innerHTML: "OK",
									style: "display: block; width: 80px; height: 30px; margin: auto;",
									onclick: function() {
										img.remove();
										URL.revokeObjectURL(url);
										win.getWindow().close();
									}
								}));*/
							}));
						};
						img.src = url;
					});
				}
			});
		}
	));

	// Fill tool
	addTool(new Tool('Fill', cursors.fill, PLAYERFX.NONE, RANK.USER, tool => {
		tool.extra.tickAmount = 9;
		let queue = [];
		let fillingColor = null;
		let defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			let z = camera.zoom;
			if (!fillingColor || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				for (let i = 0; i < queue.length; i++) {
					ctx.rect((queue[i][0] - camera.x) * z, (queue[i][1] - camera.y) * z, z, z);
				}
				ctx.stroke();
			}
		});
		function tick() {
			const eq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
			const check = (x, y) => {
				if (eq(misc.world.getPixel(x, y), fillingColor)) {
					queue.unshift([x, y]);
					return true;
				}
				return false;
			};

			if (!queue.length || !fillingColor) {
				return;
			}

			let selClr = player.selectedColor;
			let painted = 0;
			let tickAmount = tool.extra.tickAmount;
			if (keysDown[17]) { /* Ctrl */
				tickAmount *= 3;
			}

			for (let painted = 0; painted < tickAmount && queue.length; painted++) {
				let current = queue.pop();
				let x = current[0];
				let y = current[1];
				let thisClr = misc.world.getPixel(x, y);
				if (eq(thisClr, fillingColor) && !eq(thisClr, selClr)) {
					if (!PM.setPixel(x, y, selClr)) {
						queue.push(current);
						break;
					}

					// diamond check first
					let top = check(x, y - 1);
					let bottom = check(x, y + 1);
					let left = check(x - 1, y);
					let right = check(x + 1, y);

					// if corners are not closed by parts of the diamond, then they can be accessed
					if (top && left) {
						check(x - 1, y - 1);
					}
					if (top && right) {
						check(x + 1, y - 1);
					}
					if (bottom && left) {
						check(x - 1, y + 1);
					}
					if (bottom && right) {
						check(x + 1, y + 1);
					}

					// Shape diamond, infra not like
					/*check(x    , y - 1);
					check(x - 1, y    );
					check(x + 1, y    );
					check(x    , y + 1);*/
				}
			}
		}
		tool.setEvent('mousedown', mouse => {
			if (!(mouse.buttons & 0b100)) {
				fillingColor = misc.world.getPixel(mouse.tileX, mouse.tileY);
				if (fillingColor) {
					PM.startHistory();
					queue.push([mouse.tileX, mouse.tileY]);
					tool.setEvent('tick', tick);
				}
			}
		});
		tool.setEvent('mouseup deselect', mouse => {
			if (!mouse || !(mouse.buttons & 0b1)) {
				PM.endHistory();
				fillingColor = null;
				queue = [];
				tool.setEvent('tick', null);
			}
		});
	}));

	addTool(new Tool('Line', cursors.wand, PLAYERFX.NONE, RANK.USER, tool => {
		let start = null;
		let end = null;
		let queue = [];
		function line(x1, y1, x2, y2, plot) {
			let dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
			let dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
			let err = dx + dy,
				e2;

			while (true) {
				plot(x1, y1);
				if (x1 == x2 && y1 == y2) break;
				e2 = 2 * err;
				if (e2 >= dy) { err += dy; x1 += sx; }
				if (e2 <= dx) { err += dx; y1 += sy; }
			}
		}
		let defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			let z = camera.zoom;
			if (!start || !end || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				line(start[0], start[1], end[0], end[1], (x, y) => {
					ctx.rect((x - camera.x) * camera.zoom, (y - camera.y) * camera.zoom, camera.zoom, camera.zoom);
				});
				ctx.stroke();
			}
		});
		function tick() {
			for (let painted = 0; painted < 3 && queue.length; painted++) {
				let current = queue.pop();
				let c = misc.world.getPixel(current[0], current[1]);
				let pc = player.selectedColor;
				if ((c[0] != pc[0] || c[1] != pc[1] || c[2] != pc[2]) && !PM.setPixel(current[0], current[1], player.selectedColor)) {
					queue.push(current);
					break;
				}
			}
			if (!queue.length) {
				start = null;
				end = null;
				tool.setEvent('tick', null);
				return;
			}
		}
		tool.setEvent('mousedown', mouse => {
			if (!(mouse.buttons & 0b100)) {
				queue = [];
				tool.setEvent('tick', null);
				start = [mouse.tileX, mouse.tileY];
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent('mousemove', mouse => {
			if (!queue.length) {
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent('mouseup', mouse => {
			if (!(mouse.buttons & 0b11) && !queue.length) {
				end = [mouse.tileX, mouse.tileY];
				if (!start) {
					end = null;
					return;
				}
				if (player.rank >= RANK.ADMIN) {
					PM.startHistory();
					line(start[0], start[1], end[0], end[1], (x, y) => {
						PM.setPixel(x, y, player.selectedColor);
					});
					PM.endHistory();
					start = null;
					end = null;
				} else {
					line(start[0], start[1], end[0], end[1], (x, y) => {
						queue.push([x, y]);
					});
					tool.setEvent('tick', tick);
				}
			}
		});
		tool.setEvent('deselect', mouse => {
			queue = [];
			start = null;
			end = null;
			tool.setEvent('tick', null);
		});
	}));

	addTool(new Tool('Circle', cursors.circle, PLAYERFX.NONE, RANK.USER, tool => {
		let start = null;
		let end = null;
		let queue = [];
		function isFilled(x, y, width, height) {
			return Math.sqrt(Math.pow(x / width, 2) + Math.pow(y / height, 2)) <= 1;
		}
		function isStroked(x, y, width, height) {
			return isFilled(x, y, width, height) && (
				!isFilled(x + 1, y, width, height) ||
				!isFilled(x - 1, y, width, height) ||
				!isFilled(x, y + 1, width, height) ||
				!isFilled(x, y - 1, width, height)
			);
		}
		function circle(x1, y1, x2, y2, plot) {
			if (x2 < x1) [x1, x2] = [x2, x1];
			if (y2 < y1) [y1, y2] = [y2, y1];

			let width = x2 - x1 + 1;
			let height = y2 - y1 + 1;

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					if (isStroked(
						x - width / 2 + 0.5,
						y - height / 2 + 0.5,
						width / 2,
						height / 2)
					) {
						plot(x + x1, y + y1);
					}
				}
			}
		}
		let defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			if (!start || !end || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				circle(start[0], start[1], end[0], end[1], (x, y) => {
					ctx.rect((x - camera.x) * camera.zoom, (y - camera.y) * camera.zoom, camera.zoom, camera.zoom);
				});
				ctx.stroke();
			}
		});
		function tick() {
			for (let i = queue.length - 1; i >= 0; i--) {
				let pixel = queue[i];
				if (PM.setPixel(pixel[0], pixel[1], player.selectedColor)) {
					queue.splice(i, 1);
				}
			}

			if (queue.length === 0) {
				start = null;
				end = null;
				tool.setEvent("tick", null);
				PM.endHistory();
			}
		}
		tool.setEvent("mousedown", mouse => {
			if (!(mouse.buttons & 0b100)) {
				queue = [];
				tool.setEvent("tick", null);
				start = [mouse.tileX, mouse.tileY];
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent("mousemove", mouse => {
			if (!queue.length) {
				end = [mouse.tileX, mouse.tileY];
			}
		});
		tool.setEvent("mouseup", mouse => {
			if (!(mouse.buttons & 0b11) && !queue.length) {
				end = [mouse.tileX, mouse.tileY];
				if (!start) {
					end = null;
					return;
				}
				circle(start[0], start[1], end[0], end[1], (x, y) => {
					queue.push([x, y]);
				});
				PM.startHistory();
				tool.setEvent("tick", tick);
			}
		});
		tool.setEvent("deselect", mouse => {
			queue = [];
			start = null;
			end = null;
			tool.setEvent("tick", null);
		});
	}));

	addTool(new Tool('Rect', cursors.rect, PLAYERFX.NONE, RANK.USER, tool => {
		let start = null;
		let end = null;
		let queue = [];

		function rectangle(x1, y1, x2, y2, plot) {
			if (x2 < x1) [x1, x2] = [x2, x1];
			if (y2 < y1) [y1, y2] = [y2, y1];

			for (let x = x1; x <= x2; x++) {
				plot(x, y1);
				plot(x, y2);
			}
			for (let y = y1; y <= y2; y++) {
				plot(x1, y);
				plot(x2, y);
			}
		}

		let defaultFx = PLAYERFX.RECT_SELECT_ALIGNED(1);
		tool.setFxRenderer((fx, ctx, time) => {
			ctx.globalAlpha = 0.8;
			ctx.strokeStyle = fx.extra.player.htmlRgb;
			if (!start || !end || !fx.extra.isLocalPlayer) {
				defaultFx(fx, ctx, time);
			} else {
				ctx.beginPath();
				rectangle(start[0], start[1], end[0], end[1], (x, y) => {
					ctx.rect((x - camera.x) * camera.zoom, (y - camera.y) * camera.zoom, camera.zoom, camera.zoom);
				});
				ctx.stroke();
			}
		});

		function tick() {

			for (let i = queue.length - 1; i >= 0; i--) {
				let pixel = queue[i];
				if (PM.setPixel(pixel[0], pixel[1], player.selectedColor)) {
					queue.splice(i, 1);
				}
			}

			if (queue.length === 0) {
				start = null;
				end = null;
				tool.setEvent("tick", null);
				PM.endHistory();
			}
		}

		tool.setEvent("mousedown", mouse => {
			if (!(mouse.buttons & 0b100)) {
				queue = [];
				tool.setEvent("tick", null);
				start = [mouse.tileX, mouse.tileY];
				end = [mouse.tileX, mouse.tileY];
			}
		});

		tool.setEvent("mousemove", mouse => {
			if (!queue.length) {
				end = [mouse.tileX, mouse.tileY];
			}
		});

		tool.setEvent("mouseup", mouse => {
			if (!(mouse.buttons & 0b11) && !queue.length) {
				end = [mouse.tileX, mouse.tileY];
				if (!start) {
					end = null;
					return;
				}
				rectangle(start[0], start[1], end[0], end[1], (x, y) => {
					queue.push([x, y]);
				});
				PM.startHistory();
				tool.setEvent("tick", tick);
			}
		});

		tool.setEvent("deselect", mouse => {
			queue = [];
			start = null;
			end = null;
			tool.setEvent("tick", null);
		});
	}));

	addTool(new Tool('Write', cursors.write, PLAYERFX.NONE, RANK.ARTIST, tool => {
		tool.extra.state = {
			rainbow: false
		};
		tool.extra.text = "";
		tool.extra.position = 0;
		tool.extra.start = undefined;
		tool.extra.end = undefined;
		tool.extra.newText = textData.newText;
		tool.extra.cyrillic = textData.cyrillic;
		let queue = [];
		function tick() {
			for (let i = queue.length - 1; i >= 0; i--) {
				let pixel = queue[i];
				if (PM.setPixel(pixel[0], pixel[1], player.selectedColor)) {
					queue.splice(i, 1);
				}
			}

			if (queue.length === 0) {
				tool.extra.start = null;
				tool.extra.end = null;
				tool.setEvent("tick", null);
			}
		}
		function setText(t, pos, func) {
			let localPos = [...pos];
			let furthestPos = [...pos];
			function setLetter(letter, pos, func) {
				if (letter === "\n") return 1;
				let letterData = tool.extra.newText[letter];
				if (!letterData) letterData = tool.extra.cyrillic[letter];
				if (!letterData) letterData = tool.extra.newText[letter.toLocaleLowerCase()];
				if (!letterData) letterData = tool.extra.cyrillic[letter.toLocaleLowerCase()];
				if (!letterData) return 0;
				for (let x = 0; x < letterData.width; x++) {
					for (let y = 0; y < letterData.height; y++) {
						if (letterData.text[x + y * letterData.width] !== "0") func(pos[0] + x, pos[1] + y + letterData.skip);
					}
				}
				return letterData;
			}
			for (let p5 = 0; p5 < t.length; p5++) {
				let l = setLetter(t[p5], localPos, func);
				if (l === 0) continue;
				if (l === 1) {
					localPos[0] = pos[0];
					localPos[1] = localPos[1] + tool.extra.newText.data.height + 1;
				} else {
					localPos[0] += l.width + tool.extra.newText.data.gap;
				}
				if (localPos[0] > furthestPos[0]) furthestPos[0] = localPos[0];
				if (localPos[1] > furthestPos[1]) furthestPos[1] = localPos[1];
			}
			return furthestPos;
		}
		tool.setFxRenderer((fx, ctx, time) => {
			// if (someRenderer(fx, ctx, time, () => 1)) return;

			// let camera = camera;
			let oldlinew = ctx.lineWidth;
			ctx.lineWidth = 2;
			let s = undefined;
			let e = undefined;
			if (!tool.extra.start) {
				s = [mouse.tileX, mouse.tileY];
				ctx.strokeStyle = "#00FF00";
			} else {
				s = tool.extra.start;
				ctx.strokeStyle = "#FF0000";
			}
			let oldFillstyle = ctx.fillStyle;
			ctx.fillStyle = player.htmlRgb;
			let tempEnd = setText(tool.extra.text, [...s], (x, y) => {
				let x1 = (x - camera.x) * camera.zoom + 0.5;
				let y1 = (y - camera.y) * camera.zoom + 0.5;
				ctx.fillStyle = tool.extra.state.rainbow ? Color.toHex(Color.hue(x - y, 8)) : player.htmlRgb;
				ctx.fillRect(x1, y1, camera.zoom, camera.zoom);
			});
			e = [tempEnd[0] + 1, tempEnd[1] + 8]
			if (tool.extra.end) tool.extra.end = e;
			let x = (s[0] - camera.x) * camera.zoom + 0.5;
			let y = (s[1] - camera.y) * camera.zoom + 0.5;
			let w = e[0] - s[0];
			let h = e[1] - s[1];
			ctx.beginPath();
			ctx.rect(x, y, w * camera.zoom, h * camera.zoom);
			ctx.stroke();
			ctx.lineWidth = oldlinew;
			ctx.fillStyle = oldFillstyle;
			return 0;
		});
		tool.setEvent('mousedown', (mouse, _event) => {
			let s = tool.extra.start;
			let e = tool.extra.end;
			const isInside = () => mouse.tileX >= s[0] && mouse.tileX < e[0] && mouse.tileY >= s[1] && mouse.tileY < e[1];
			if (mouse.buttons === 1 && !tool.extra.end) {
				tool.extra.start = [mouse.tileX, mouse.tileY];
				tool.extra.end = [mouse.tileX + 1, mouse.tileY + 7];
				tool.setEvent('keydown', (keysDown, event) => {
					// if (!isNS) return;
					if (event.key.length > 1) {
						switch (event.key) {
							case "Enter": {
								tool.extra.text += "\n";
							} break;
							case "Backspace": {
								let t = tool.extra.text.split("");
								t.pop();
								tool.extra.text = t.join("");
							} break;
						}
						return;
					}
					// console.log(event);
					tool.extra.text += event.key;
					return 1;
				});
			} else if (mouse.buttons === 1 && tool.extra.end) {
				if (isInside()) {
					let offx = mouse.tileX;
					let offy = mouse.tileY;
					tool.setEvent('mousemove', (mouse, _event) => {
						let dx = mouse.tileX - offx;
						let dy = mouse.tileY - offy;
						tool.extra.start = [s[0] + dx, s[1] + dy];
						tool.extra.end = [e[0] + dx, e[1] + dy];
					});
					tool.setEvent('mouseup', () => tool.setEvent('mouseup mousemove', null));
				} else {
					tool.extra.start = undefined;
					tool.extra.end = undefined;
				}
			} else if (mouse.buttons === 2 && tool.extra.end && isInside()) {
				PM.startHistory();
				// setText(tool.extra.text, [...tool.extra.start], (x, y) => PM.setPixel(x, y, tool.extra.state.rainbow ? Color.hue(x - y, 8) : player.selectedColor));
				setText(tool.extra.text, [...tool.extra.start], (x, y) => {
					queue.push([x, y]);
				});
				tool.setEvent('tick', tick);
				PM.endHistory();
				return true;
			}
		});
		tool.setEvent('deselect', () => {
			tool.extra.position = 0;
			tool.extra.start = undefined;
			tool.extra.end = undefined;
			// ! MARK FOR CHANGE
			// tool.extra.text = "";
			tool.setEvent('keydown mouseup mousemove', null);
		});
		tool.setEvent('keyup', () => 1);
	}));

	addTool(new Tool('Protect', cursors.shield, PLAYERFX.RECT_SELECT_ALIGNED(16, "#000000"), RANK.MODERATOR, tool => {
		tool.setFxRenderer((fx, ctx, time) => {
			let x = fx.extra.player.x;
			let y = fx.extra.player.y;
			let fxx = (Math.floor(x / 256) * 16 - camera.x) * camera.zoom;
			let fxy = (Math.floor(y / 256) * 16 - camera.y) * camera.zoom;
			ctx.globalAlpha = 0.5;
			let chunkX = Math.floor(fx.extra.player.tileX / protocol.chunkSize);
			let chunkY = Math.floor(fx.extra.player.tileY / protocol.chunkSize);
			let chunk = misc.world.getChunkAt(chunkX, chunkY);
			if (chunk) {
				ctx.fillStyle = chunk.locked ? "#00FF00" : "#FF0000";
				ctx.fillRect(fxx, fxy, camera.zoom * 16, camera.zoom * 16);
			}
			return 1; /* Rendering finished (won't change on next frame) */
		});
		tool.setEvent('mousedown mousemove', mouse => {
			let chunkX = Math.floor(mouse.tileX / protocol.chunkSize);
			let chunkY = Math.floor(mouse.tileY / protocol.chunkSize);
			let chunk = misc.world.getChunkAt(chunkX, chunkY);
			switch (mouse.buttons) {
				case 0b1:
					if (!chunk.locked) {
						net.protocol.protectChunk(chunkX, chunkY, 1);
					}
					break;

				case 0b10:
					if (chunk.locked) {
						net.protocol.protectChunk(chunkX, chunkY, 0);
					}
					break;
			}
		});
	}));

	addTool(new Tool('Area Protect', cursors.selectprotect, PLAYERFX.NONE, RANK.MODERATOR,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				let x = fx.extra.player.x;
				let y = fx.extra.player.y;
				let fxx = (Math.round(x / 256) * protocol.chunkSize - camera.x) * camera.zoom;
				let fxy = (Math.round(y / 256) * protocol.chunkSize - camera.y) * camera.zoom;
				let oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					let s = tool.extra.start;
					let e = tool.extra.end;
					let x = (s[0] * protocol.chunkSize - camera.x) * camera.zoom + 0.5;
					let y = (s[1] * protocol.chunkSize - camera.y) * camera.zoom + 0.5;
					let rw = (e[0] - s[0]);
					let rh = (e[1] - s[1]);
					let w = rw * camera.zoom * protocol.chunkSize;
					let h = rh * camera.zoom * protocol.chunkSize;
					ctx.beginPath();
					ctx.rect(x, y, w, h);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					if (tool.extra.isSure) {
						ctx.globalAlpha = 0.6;
						ctx.fillStyle = "#00EE00";
						ctx.fill();
					}
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					let oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					let txt = `${tool.extra.isSure ? "Click again to confirm. " : (!tool.extra.clicking ? "Left/Right click to add/remove protection, respectively. " : "")}(${Math.abs(rw)}x${Math.abs(rh)})`;
					let txtx = window.innerWidth >> 1;
					let txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w));
					txty = Math.max(y, Math.min(txty, y + h));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;
			tool.extra.isSure = false;

			let timeout = null;

			const sure = () => {
				if (tool.extra.isSure) {
					clearTimeout(timeout);
					timeout = null;
					tool.extra.isSure = false;
					return true;
				}
				tool.extra.isSure = true;
				setTimeout(() => {
					tool.extra.isSure = false;
					timeout = null;
				}, 1000);
				return false;
			};

			tool.setEvent('mousedown', (mouse, event) => {
				let get = {
					rx() { return mouse.tileX / protocol.chunkSize; },
					ry() { return mouse.tileY / protocol.chunkSize; },
					x() { return Math.round(mouse.tileX / protocol.chunkSize); },
					y() { return Math.round(mouse.tileY / protocol.chunkSize); }
				};
				let s = tool.extra.start;
				let e = tool.extra.end;
				const isInside = () => get.rx() >= s[0] && get.rx() < e[0] && get.ry() >= s[1] && get.ry() < e[1];
				const isChunkSolid = chunk => {
					let lastClr = chunk.get(0, 0);
					return chunk.forEach((x, y, clr) => clr === lastClr);
				};

				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [get.x(), get.y()];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [get.x(), get.y()];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						let s = tool.extra.start;
						let e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								let tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								let tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside() && sure()) {
						tool.extra.start = null;
						tool.extra.end = null;
						let [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
						for (let i = x; i < x + w; i++) {
							for (let j = y; j < y + h; j++) {
								let chunk = misc.world.getChunkAt(i, j);
								if (chunk && !chunk.locked) {
									if (keysDown[17] && isChunkSolid(chunk)) {
										continue;
									}
									net.protocol.protectChunk(i, j, 1);
								}
							}
						}
					} else if (!isInside()) {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside() && sure()) {
					tool.extra.start = null;
					tool.extra.end = null;
					let [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
					for (let i = x; i < x + w; i++) {
						for (let j = y; j < y + h; j++) {
							let chunk = misc.world.getChunkAt(i, j);
							if (chunk && chunk.locked) {
								if (keysDown[17] && !isChunkSolid(chunk)) {
									continue;
								}
								net.protocol.protectChunk(i, j, 0);
							}
						}
					}
				}
			});
		}
	));

	/*addTool(new Tool('Area Delete', cursors.selectprotect, PLAYERFX.NONE, RANK.MODERATOR,
		tool => {
			tool.setFxRenderer((fx, ctx, time) => {
				if (!fx.extra.isLocalPlayer) return 1;
				let x = fx.extra.player.x;
				let y = fx.extra.player.y;
				let fxx = (Math.round(x / 256) * protocol.chunkSize - camera.x) * camera.zoom;
				let fxy = (Math.round(y / 256) * protocol.chunkSize - camera.y) * camera.zoom;
				let oldlinew = ctx.lineWidth;
				ctx.lineWidth = 1;
				if (tool.extra.end) {
					let s = tool.extra.start;
					let e = tool.extra.end;
					let x = (s[0] * protocol.chunkSize - camera.x) * camera.zoom + 0.5;
					let y = (s[1] * protocol.chunkSize - camera.y) * camera.zoom + 0.5;
					let rw = (e[0] - s[0]);
					let rh = (e[1] - s[1]);
					let w = rw * camera.zoom * protocol.chunkSize;
					let h = rh * camera.zoom * protocol.chunkSize;
					ctx.beginPath();
					ctx.rect(x, y, w, h);
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3, 4]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();
					if (tool.extra.isSure) {
						ctx.globalAlpha = 0.6;
						ctx.fillStyle = "#00EE00";
						ctx.fill();
					}
					ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
					ctx.fillStyle = renderer.patterns.unloaded;
					ctx.fill();
					ctx.setLineDash([]);
					let oldfont = ctx.font;
					ctx.font = "16px sans-serif";
					let txt = `${tool.extra.isSure ? "Click again to confirm. " : (!tool.extra.clicking ? "Double click to delete. " : "")}(${Math.abs(rw)}x${Math.abs(rh)})`;
					let txtx = window.innerWidth >> 1;
					let txty = window.innerHeight >> 1;
					txtx = Math.max(x, Math.min(txtx, x + w));
					txty = Math.max(y, Math.min(txty, y + h));

					drawText(ctx, txt, txtx, txty, true);
					ctx.font = oldfont;
					ctx.lineWidth = oldlinew;
					return 0;
				} else {
					ctx.beginPath();
					ctx.moveTo(0, fxy + 0.5);
					ctx.lineTo(window.innerWidth, fxy + 0.5);
					ctx.moveTo(fxx + 0.5, 0);
					ctx.lineTo(fxx + 0.5, window.innerHeight);

					//ctx.lineWidth = 1;
					ctx.globalAlpha = 1;
					ctx.strokeStyle = "#FFFFFF";
					ctx.stroke();
					ctx.setLineDash([3]);
					ctx.strokeStyle = "#000000";
					ctx.stroke();

					ctx.setLineDash([]);
					ctx.lineWidth = oldlinew;
					return 1;
				}
			});

			tool.extra.start = null;
			tool.extra.end = null;
			tool.extra.clicking = false;
			tool.extra.isSure = false;

			let timeout = null;

			const sure = () => {
				if (tool.extra.isSure) {
					clearTimeout(timeout);
					timeout = null;
					tool.extra.isSure = false;
					return true;
				}
				tool.extra.isSure = true;
				setTimeout(() => {
					tool.extra.isSure = false;
					timeout = null;
				}, 1000);
				return false;
			};

			tool.setEvent('mousedown', (mouse, event) => {
				let get = {
					rx() { return mouse.tileX / protocol.chunkSize; },
					ry() { return mouse.tileY / protocol.chunkSize; },
					x() { return Math.round(mouse.tileX / protocol.chunkSize); },
					y() { return Math.round(mouse.tileY / protocol.chunkSize); }
				};
				let s = tool.extra.start;
				let e = tool.extra.end;
				const isInside = () => get.rx() >= s[0] && get.rx() < e[0] && get.ry() >= s[1] && get.ry() < e[1];
				if (mouse.buttons === 1 && !tool.extra.end) {
					tool.extra.start = [get.x(), get.y()];
					tool.extra.clicking = true;
					tool.setEvent('mousemove', (mouse, event) => {
						if (tool.extra.start && mouse.buttons === 1) {
							tool.extra.end = [get.x(), get.y()];
							return 1;
						}
					});
					const finish = () => {
						tool.setEvent('mousemove mouseup deselect', null);
						tool.extra.clicking = false;
						let s = tool.extra.start;
						let e = tool.extra.end;
						if (e) {
							if (s[0] === e[0] || s[1] === e[1]) {
								tool.extra.start = null;
								tool.extra.end = null;
							}
							if (s[0] > e[0]) {
								let tmp = e[0];
								e[0] = s[0];
								s[0] = tmp;
							}
							if (s[1] > e[1]) {
								let tmp = e[1];
								e[1] = s[1];
								s[1] = tmp;
							}
						}
						renderer.render(renderer.rendertype.FX);
					};
					tool.setEvent('deselect', finish);
					tool.setEvent('mouseup', (mouse, event) => {
						if (!(mouse.buttons & 1)) {
							finish();
						}
					});
				} else if (mouse.buttons === 1 && tool.extra.end) {
					if (isInside() && sure()) {
						tool.extra.start = null;
						tool.extra.end = null;
						let [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
						for (let i = x; i < x + w; i++) {
							for (let j = y; j < y + h; j++) {
								let chunk = misc.world.getChunkAt(i, j);
								if (chunk && !chunk.locked) {
									net.protocol.clearChunk(i, j, [255, 255, 255]);
								}
							}
						}
					} else if (!isInside()) {
						tool.extra.start = null;
						tool.extra.end = null;
					}
				} else if (mouse.buttons === 2 && tool.extra.end && isInside() && sure()) {
					tool.extra.start = null;
					tool.extra.end = null;
					let [x, y, w, h] = [s[0], s[1], e[0] - s[0], e[1] - s[1]];
					for (let i = x; i < x + w; i++) {
						for (let j = y; j < y + h; j++) {
							let chunk = misc.world.getChunkAt(i, j);
							if (chunk && chunk.locked) {
								net.protocol.clearChunk(i, j, [255, 255, 255]);
							}
						}
					}
				}
			});
		}
	));*/

	addTool(new Tool('Paste', cursors.paste, PLAYERFX.NONE, RANK.MODERATOR, tool => {
		tool.extra.sendQueue = [];

		tool.setFxRenderer((fx, ctx, time) => {
			let z = camera.zoom;
			let x = fx.extra.player.x;
			let y = fx.extra.player.y;
			let fxx = Math.floor(x / 16) - camera.x;
			let fxy = Math.floor(y / 16) - camera.y;

			let q = tool.extra.sendQueue;
			if (q.length) {
				let cs = protocol.chunkSize;
				ctx.strokeStyle = "#000000";
				ctx.globalAlpha = 0.8;
				ctx.beginPath();
				for (let i = 0; i < q.length; i++) {
					ctx.rect((q[i].x * cs - camera.x) * z, (q[i].y * cs - camera.y) * z, z * cs, z * cs);
				}
				ctx.stroke();
				return 0;
			}

			if (tool.extra.canvas && fx.extra.isLocalPlayer) {
				ctx.globalAlpha = 0.5 + Math.sin(time / 500) / 4;
				ctx.strokeStyle = "#000000";
				ctx.scale(z, z);
				ctx.drawImage(tool.extra.canvas, fxx, fxy);
				ctx.scale(1 / z, 1 / z);
				ctx.globalAlpha = 0.8;
				ctx.strokeRect(fxx * z, fxy * z, tool.extra.canvas.width * z, tool.extra.canvas.height * z);
				return 0;
			}
		});

		const paint = (tileX, tileY) => {
			let tmpBuffer = new Uint32Array(protocol.chunkSize * protocol.chunkSize);
			let ctx = tool.extra.canvas.getContext("2d");
			let dat = ctx.getImageData(0, 0, tool.extra.canvas.width, tool.extra.canvas.height);
			let u32dat = new Uint32Array(dat.data.buffer);
			let totalChunksW = Math.ceil((absMod(tileX, protocol.chunkSize) + dat.width) / protocol.chunkSize);
			let totalChunksH = Math.ceil((absMod(tileY, protocol.chunkSize) + dat.height) / protocol.chunkSize);
			const getModifiedPixel = (x, y) => {
				let imgY = y - tileY;
				let imgX = x - tileX;
				if (imgY < 0 || imgX < 0 || imgY >= dat.height || imgX >= dat.width) {
					let currentPixel = misc.world.getPixel(x, y);
					if (!currentPixel && tool.extra.wreckStuff) {
						currentPixel = [255, 255, 255];
					}

					return currentPixel ? (currentPixel[2] << 16 | currentPixel[1] << 8 | currentPixel[0])
						: null;
				}
				let img = u32dat[imgY * dat.width + imgX];
				let oldPixel = misc.world.getPixel(x, y);
				let alpha = img >> 24 & 0xFF;
				if (!oldPixel) {
					if (tool.extra.wreckStuff) {
						oldPixel = [255, 255, 255];
					} else {
						return null;
					}
				}
				let r = (1 - alpha / 255) * oldPixel[0] + (alpha / 255) * (img & 0xFF);
				let g = (1 - alpha / 255) * oldPixel[1] + (alpha / 255) * (img >> 8 & 0xFF);
				let b = (1 - alpha / 255) * oldPixel[2] + (alpha / 255) * (img >> 16 & 0xFF);
				let rgb = b << 16 | g << 8 | r;
				return (r == oldPixel[0] && g == oldPixel[1] && b == oldPixel[2]) ? rgb : 0xFF000000 | rgb;
			};

			const getModifiedChunk = (chunkX, chunkY) => {
				let modified = 0;
				let offX = chunkX * protocol.chunkSize;
				let offY = chunkY * protocol.chunkSize;
				for (let y = 0; y < protocol.chunkSize; y++) {
					for (let x = 0; x < protocol.chunkSize; x++) {
						let color = getModifiedPixel(x + offX, y + offY);
						if (color !== null) {
							if (color & 0xFF000000) {
								++modified;
							}
							tmpBuffer[y * protocol.chunkSize + x] = color & 0xFFFFFF;
						} else {
							/* Chunk not loaded... */
							throw new Error(`Couldn't paste -- chunk (${chunkX}, ${chunkY}) is unloaded`);
						}
					}
				}
				return modified ? tmpBuffer : null;
			};
			if (!net.protocol.setChunk) {
				throw new Error("Protocol doesn't support pasting");
			}

			for (let y = Math.floor(tileY / protocol.chunkSize), t = totalChunksH; --t >= 0; y++) {
				for (let x = Math.floor(tileX / protocol.chunkSize), tw = totalChunksW; --tw >= 0; x++) {
					let newChunk = getModifiedChunk(x, y);
					if (newChunk) {
						if (!net.protocol.setChunk(x, y, newChunk)) {
							let nbuf = new Uint32Array(newChunk.length);
							nbuf.set(newChunk);
							tool.extra.sendQueue.push({
								x: x,
								y: y,
								buf: nbuf
							});
						}
					}
				}
			}
		}

		tool.setEvent('tick', () => {
			let q = tool.extra.sendQueue;
			if (q.length) {
				if (net.protocol.setChunk(q[0].x, q[0].y, q[0].buf)) {
					q.shift();
				}
			}
		});

		tool.setEvent('mousedown', mouse => {
			if (mouse.buttons & 0b1) {
				if (tool.extra.canvas) {
					if (tool.extra.sendQueue.length) {
						throw new Error("Wait until pasting finishes, or cancel with right click!");
					}

					paint(mouse.tileX, mouse.tileY);
				}
			} else if (mouse.buttons & 0b10) {
				tool.extra.sendQueue = [];
			}
		});

		let input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		tool.setEvent('select', () => {
			input.onchange = event => {
				if (input.files && input.files[0]) {
					let reader = new FileReader();
					reader.onload = e => {
						let image = new Image();
						image.onload = () => {
							tool.extra.canvas = document.createElement("canvas");
							tool.extra.canvas.width = image.width;
							tool.extra.canvas.height = image.height;
							let ctx = tool.extra.canvas.getContext("2d");
							ctx.drawImage(image, 0, 0);
							console.log('Loaded image');
						};
						image.src = e.target.result;
					};
					reader.readAsDataURL(input.files[0]);
				}
			};
			input.click();
		});
	}));

	addTool(new Tool('Copy', cursors.copy, PLAYERFX.NONE, RANK.MODERATOR, function (tool) {
		function drawText(ctx, str, x, y, centered) {
			ctx.strokeStyle = "#000000", ctx.fillStyle = "#FFFFFF", ctx.lineWidth = 2.5, ctx.globalAlpha = 0.5;
			if (centered) {
				x -= ctx.measureText(str).width >> 1;
			}
			ctx.strokeText(str, x, y);
			ctx.globalAlpha = 1;
			ctx.fillText(str, x, y);
		}

		tool.setFxRenderer(function (fx, ctx, time) {
			if (!fx.extra.isLocalPlayer) return 1;
			let x = fx.extra.player.x;
			let y = fx.extra.player.y;
			let fxx = (Math.floor(x / 16) - camera.x) * camera.zoom;
			let fxy = (Math.floor(y / 16) - camera.y) * camera.zoom;
			let oldlinew = ctx.lineWidth;
			ctx.lineWidth = 1;
			if (tool.extra.end) {
				let s = tool.extra.start;
				let e = tool.extra.end;
				let x = (s[0] - camera.x) * camera.zoom + 0.5;
				let y = (s[1] - camera.y) * camera.zoom + 0.5;
				let w = e[0] - s[0];
				let h = e[1] - s[1];
				ctx.beginPath();
				ctx.rect(x, y, w * camera.zoom, h * camera.zoom);
				ctx.globalAlpha = 1;
				ctx.strokeStyle = "#FFFFFF";
				ctx.stroke();
				ctx.setLineDash([3, 4]);
				ctx.strokeStyle = "#000000";
				ctx.stroke();
				ctx.globalAlpha = 0.25 + Math.sin(time / 500) / 4;
				ctx.fillStyle = renderer.patterns.unloaded;
				ctx.fill();
				ctx.setLineDash([]);
				let oldfont = ctx.font;
				ctx.font = "16px sans-serif";
				let txt = (!tool.extra.clicking ? "Right click to copy " : "") + '(' + Math.abs(w) + 'x' + Math.abs(h) + ')';
				let txtx = window.innerWidth >> 1;
				let txty = window.innerHeight >> 1;
				txtx = Math.max(x, Math.min(txtx, x + w * camera.zoom));
				txty = Math.max(y, Math.min(txty, y + h * camera.zoom));

				drawText(ctx, txt, txtx, txty, true);
				ctx.font = oldfont;
				ctx.lineWidth = oldlinew;
				return 0;
			} else {
				ctx.beginPath();
				ctx.moveTo(0, fxy + 0.5);
				ctx.lineTo(window.innerWidth, fxy + 0.5);
				ctx.moveTo(fxx + 0.5, 0);
				ctx.lineTo(fxx + 0.5, window.innerHeight);

				//ctx.lineWidth = 1;
				ctx.globalAlpha = 1;
				ctx.strokeStyle = "#FFFFFF";
				ctx.stroke();
				ctx.setLineDash([3]);
				ctx.strokeStyle = "#000000";
				ctx.stroke();

				ctx.setLineDash([]);
				ctx.lineWidth = oldlinew;
				return 1;
			}
		});

		tool.extra.start = null;
		tool.extra.end = null;
		tool.extra.clicking = false;

		tool.setEvent('mousedown', function (mouse, event) {
			let s = tool.extra.start;
			let e = tool.extra.end;
			let isInside = function isInside() {
				return mouse.tileX >= s[0] && mouse.tileX < e[0] && mouse.tileY >= s[1] && mouse.tileY < e[1];
			};
			if (mouse.buttons === 1 && !tool.extra.end) {
				tool.extra.start = [mouse.tileX, mouse.tileY];
				tool.extra.clicking = true;
				tool.setEvent('mousemove', function (mouse, event) {
					if (tool.extra.start && mouse.buttons === 1) {
						tool.extra.end = [mouse.tileX, mouse.tileY];
						return 1;
					}
				});
				let finish = function finish() {
					tool.setEvent('mousemove mouseup deselect', null);
					tool.extra.clicking = false;
					let s = tool.extra.start;
					let e = tool.extra.end;
					if (e) {
						if (s[0] === e[0] || s[1] === e[1]) {
							tool.extra.start = null;
							tool.extra.end = null;
						}
						if (s[0] > e[0]) {
							let tmp = e[0];
							e[0] = s[0];
							s[0] = tmp;
						}
						if (s[1] > e[1]) {
							let tmp = e[1];
							e[1] = s[1];
							s[1] = tmp;
						}
					}
					renderer.render(renderer.rendertype.FX);
				};
				tool.setEvent('deselect', finish);
				tool.setEvent('mouseup', function (mouse, event) {
					if (!(mouse.buttons & 1)) {
						finish();
					}
				});
			} else if (mouse.buttons === 1 && tool.extra.end) {
				if (isInside()) {
					let offx = mouse.tileX;
					let offy = mouse.tileY;
					tool.setEvent('mousemove', function (mouse, event) {
						let dx = mouse.tileX - offx;
						let dy = mouse.tileY - offy;
						tool.extra.start = [s[0] + dx, s[1] + dy];
						tool.extra.end = [e[0] + dx, e[1] + dy];
					});
					let end = function end() {
						tool.setEvent('mouseup deselect mousemove', null);
					};
					tool.setEvent('deselect', end);
					tool.setEvent('mouseup', function (mouse, event) {
						if (!(mouse.buttons & 1)) {
							end();
						}
					});
				} else {
					tool.extra.start = null;
					tool.extra.end = null;
				}
			} else if (mouse.buttons === 2 && tool.extra.end && isInside()) {
				tool.extra.start = null;
				tool.extra.end = null;
				let x = s[0];
				let y = s[1];
				let w = e[0] - s[0];
				let h = e[1] - s[1];
				let c = document.createElement('canvas');
				c.width = w;
				c.height = h;
				let ctx = c.getContext('2d');
				let d = ctx.createImageData(w, h);
				for (let i = y; i < y + h; i++) {
					for (let j = x; j < x + w; j++) {
						let pix = misc.world.getPixel(j, i);
						if (!pix) continue;
						d.data[4 * ((i - y) * w + (j - x))] = pix[0];
						d.data[4 * ((i - y) * w + (j - x)) + 1] = pix[1];
						d.data[4 * ((i - y) * w + (j - x)) + 2] = pix[2];
						d.data[4 * ((i - y) * w + (j - x)) + 3] = 255;
					}
				}
				ctx.putImageData(d, 0, 0);
				let paste = tools.paste;
				paste.extra.canvas = c;
				let oldSelect = paste.events.select;
				paste.events.select = function () {
					paste.events.select = oldSelect;
				};
				player.tool = "paste";
			}
		});
	}));

	eventSys.emit(e.misc.toolsInitialized);
});

eventSys.once(e.init, () => {
	toolsWindow = new GUIWindow('Tools', {}, wdow => {
		wdow.container.id = "toole-container";
		wdow.container.style.cssText = "max-width: 40px";
	}).move(5, 32);
	toolOptsWindow = new GUIWindow('Tool Options', {}, w => {
		w.container.id = 'tool-options-container';
	});
});

eventSys.once(e.misc.toolsInitialized, () => {
	updateToolbar();
	if (windowShown) {
		windowSys.addWindow(toolsWindow);
	}
});

eventSys.on(e.net.disconnected, () => {
	showToolsWindow(false);
	showToolOpts(true);
});

eventSys.on(e.misc.worldInitialized, () => {
	showToolsWindow(true);
});