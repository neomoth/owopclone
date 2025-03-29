"use strict";

import { Protocol } from "./Protocol.js";
import { EVENTS as e, RANK, options, elements, mouse } from "../conf.js";
import { Chunk } from "../World.js";
import { Bucket, eventSys, decompress } from "../util.js";
import { loadAndRequestCaptcha } from "../captcha.js";
import { player, shouldUpdate, networkRankVerification } from "../local_player.js";
import { net } from "../networking.js";

export const captchaState = {
	CA_WAITING: 0,
	CA_VERIFYING: 1,
	CA_VERIFIED: 2,
	CA_OK: 3,
	CA_INVALID: 4,
};

export const ProtocolV1 = {
	class: null,
	chunkSize: 16,
	netUpdateSpeed: 20,
	clusterChunkAmount: 64,
	maxWorldNameLength: 32,
	worldBorder: 0xFFFFF,
	chatBucket: [4, 6],
	placeBucket: {
		[RANK.NONE]: [0, 1],
		[RANK.USER]: [32, 4],
		// [RANK.DONOR]: [32,3],
		[RANK.ARTIST]: [64, 3],
		[RANK.MODERATOR]: [64, 2],
		[RANK.ADMIN]: [128, 0],
		[RANK.DEVELOPER]: [128, 0],
		[RANK.OWNER]: [128, 0],
	},
	maxMessageLength: {
		[RANK.NONE]: 128,
		[RANK.USER]: 128,
		// [RANK.DONOR]: 256,
		[RANK.ARTIST]: 256,
		[RANK.MODERATOR]: 512,
		[RANK.ADMIN]: 16384,
		[RANK.DEVELOPER]: 16384,
		[RANK.OWNER]: 33760,
	},
	tools: {
		id: {},
		0: 'cursor',
		1: 'move',
		2: 'pipette',
		3: 'eraser',
		4: 'zoom',
		5: 'fill',
		6: 'paste',
		7: 'export',
		8: 'line',
		9: 'protect',
		10: 'copy',
		11: 'circle',
		12: 'rect',
		13: 'write'
		// 0: 'cursor',
		// 1: 'move',
		// 2: 'pipette',
		// 3: 'zoom',
		// 4: 'fill',
		// 5: 'line',
		// 6: 'rect',
		// 7: 'circle',
		// 8: 'export',
		// 9: 'eraser',
		// 10: 'copy',
		// 11: 'paste',
		// 12: 'protect',
	},
	misc: {
		worldVerification: 25565,
		chatVerification: String.fromCharCode(10),
		tokenVerification: 'CaptchA'
	},
	opCode: {
		client: {
			// shrug
		},
		server: {
			setId: 0,
			worldUpdate: 1,
			chunkLoad: 2,
			teleport: 3,
			setRank: 4,
			captcha: 5,
			setPQuota: 6,
			chunkProtected: 7,
			maxCount: 8,
			donUntil: 9
		}
	}
};

for (const id in ProtocolV1.tools) {
	if (+id >= 0) {
		ProtocolV1.tools.id[ProtocolV1.tools[id]] = +id;
	}
}

function stoi(string, max) {
	let ints = [];
	let fstring = "";
	string = string.toLowerCase();
	for (let i = 0; i < string.length && i < max; i++) {
		let charCode = string.charCodeAt(i);
		if ((charCode < 123 && charCode > 96) || (charCode < 58 && charCode > 47) || charCode == 95 || charCode == 46) {
			fstring += String.fromCharCode(charCode);
			ints.push(charCode);
		}
	}
	return [ints, fstring];
}

class ProtocolV1Impl extends Protocol {
	constructor(ws, worldName, captcha) {
		super(ws);
		super.hookEvents(this);
		this.lastSentX = 0;
		this.lastSentY = 0;
		this.playercount = 1;
		this.worldName = worldName ? worldName : options.defaultWorld;
		this.players = {};
		this.chunksLoading = {};
		this.waitingForChunks = 0;
		this.pendingEdits = {};
		this.id = null;
		this.captcha = captcha;

		let params = ProtocolV1.chatBucket;
		this.chatBucket = new Bucket(params[0], params[1]);
		params = ProtocolV1.placeBucket[player.rank];
		this.placeBucket = new Bucket(params[0], params[1]);
		this.placeBucketMult = 1;
		this.donUntilTs = 0;

		this.interval = null;
		this.clet = null;

		this.joinFunc = () => {
			this.placeBucket.lastCheck = Date.now();
			this.placeBucket.allowance = 0;

			this.interval = setInterval(() => this.sendUpdates(), 1000 / ProtocolV1.netUpdateSpeed);
		};

		const rankChanged = rank => {
			this.placeBucket.infinite = rank >= RANK.ADMIN;
			elements.chatInput.maxLength = ProtocolV1.maxMessageLength[rank];
		};

		this.leaveFunc = () => {
			eventSys.removeListener(e.net.sec.rank, rankChanged);
			eventSys.emit(e.net.donUntil, 0, 1);
		};

		eventSys.on(e.net.world.join, this.joinFunc);
		eventSys.on(e.net.sec.rank, rankChanged);
	}

	errorHandler(err) {
		super.errorHandler(err);
	}

	closeHandler() {
		super.closeHandler();
		clearInterval(this.interval);
		eventSys.emit(e.net.sec.rank, RANK.NONE);
		eventSys.removeListener(e.net.world.join, this.joinFunc);
		this.leaveFunc();
	}

	messageHandler(message) {
		// console.log(message);
		message = message.data;
		if (typeof message === 'string') {
			if (message.indexOf("DEV") == 0) {
				// eventSys.emit(e.net.devChat, message.slice(3)); // DEPRECIATED: e.net.devChat
			} else {
				eventSys.emit(e.net.chat, message);
			}
			return;
		}

		let dv = new DataView(message);
		let oc = ProtocolV1.opCode.server;
		switch (dv.getUint8(0)) {
			case oc.setId:
				let id = dv.getUint32(1, true);
				this.id = id;
				eventSys.emit(e.net.world.join, this.worldName);
				eventSys.emit(e.net.world.setId, id);
				eventSys.emit(e.net.playerCount, this.playercount);
				eventSys.emit(e.net.chat, JSON.stringify({
					sender: 'server',
					data: {
						type: 'info',
					},
					text: `[Server]: Joined world \'${this.worldName}\'. Your ID is ${id}!`
				}));
				break;
			case oc.worldUpdate:
				// let shouldRender = 0;

				//cursors
				let updated = false;
				let updates = {};
				let pos = 2;
				for (var i = dv.getUint8(1); i--;) {
					updated = true;
					var pid = dv.getUint32(pos, true);
					pos += 4;
					let pmx = dv.getInt32(pos, true);
					pos += 4;
					let pmy = dv.getInt32(pos, true);
					pos += 4;
					let pr = dv.getUint8(pos);
					pos += 1;
					let pg = dv.getUint8(pos);
					pos += 1;
					let pb = dv.getUint8(pos);
					pos += 1;
					let ptool = dv.getUint8(pos);
					pos += 1;
					let nickLength = dv.getUint32(pos, true);
					pos += 4;
					let pnick = new TextDecoder().decode(new Uint8Array(dv.buffer, pos, nickLength));
					pos += nickLength;
					if (pid === this.id) continue;
					updates[pid] = {
						x: pmx,
						y: pmy,
						rgb: [pr, pg, pb],
						tool: ProtocolV1.tools[ptool],
						nick: pnick
					};
					if (!this.players[pid]) {
						++this.playercount;
						eventSys.emit(e.net.playerCount, this.playercount);
						this.players[pid] = true;
					}
				}
				if (updated) {
					eventSys.emit(e.net.world.playersMoved, updates);
				}
				let off = pos;
				//tile update
				updated = false;
				updates = [];
				for (let i = dv.getUint16(off, true), j = 0; j < i; j++) {
					updated = true;
					let bid = dv.getUint32(2 + off + j * 15, true);
					let bpx = dv.getInt32(2 + off + j * 15 + 4, true);
					let bpy = dv.getInt32(2 + off + j * 15 + 8, true);
					let br = dv.getUint8(2 + off + j * 15 + 12);
					let bg = dv.getUint8(2 + off + j * 15 + 13);
					let bb = dv.getUint8(2 + off + j * 15 + 14);
					let bbgr = bb << 16 | bg << 8 | br;
					updates.push({
						x: bpx,
						y: bpy,
						rgb: bbgr,
						id: bid
					});

					let edkey = `${bpx},${bpy}`;
					let edtmoid = this.pendingEdits[edkey];
					if (edtmoid) {
						clearTimeout(edtmoid);
						delete this.pendingEdits[edkey];
					}
				}
				if (updated) {
					eventSys.emit(e.net.world.tilesUpdated, updates);
				}
				off += dv.getUint16(off, true) * 15 + 2;
				//discoonect
				let decreased = false;
				updated = false;
				updates = [];
				for (let k = dv.getUint8(off); k--;) {
					updated = true;
					let dpid = dv.getUint32(1 + off + k * 4, true);
					updates.push(dpid);
					if (this.players[dpid] && this.playercount > 1) {
						decreased = true;
						--this.playercount;
						delete this.players[dpid];
					}
				}
				if (updated) {
					eventSys.emit(e.net.world.playersLeft, updates);
					if (decreased) {
						eventSys.emit(e.net.playerCount, this.playercount);
					}
				}
				break;
			case oc.chunkLoad:
				let chunkX = dv.getInt32(1, true);
				let chunkY = dv.getInt32(5, true);
				let locked = dv.getUint8(9);
				let u8data = new Uint8Array(message, 10, message.byteLength - 10);

				u8data = decompress(u8data);
				let key = `${chunkX},${chunkY}`;
				let u32data = new Uint32Array(ProtocolV1.chunkSize * ProtocolV1.chunkSize);
				for (let i = 0, u = 0; i < u8data.length; i += 3) { /* Need to make a copy ;-; */
					let color = u8data[i + 2] << 16
						| u8data[i + 1] << 8
						| u8data[i]
					u32data[u++] = 0xFF000000 | color;
				}
				if (!this.chunksLoading[key]) {
					eventSys.emit(e.net.chunk.set, chunkX, chunkY, u32data);
				} else {
					delete this.chunksLoading[key];
					if (--this.waitingForChunks == 0) {
						clearTimeout(this.clet);
						this.clet = setTimeout(() => {
							eventSys.emit(e.net.chunk.allLoaded);
						}, 100);
					}
					let chunk = new Chunk(chunkX, chunkY, u32data, locked);
					eventSys.emit(e.net.chunk.load, chunk);
				}
				break;
			case oc.teleport:
				let x = dv.getInt32(1, true);
				let y = dv.getInt32(5, true);
				eventSys.emit(e.net.world.teleported, x, y);
				break;
			case oc.setRank:
				networkRankVerification[0] = dv.getUint8(1);
				eventSys.emit(e.net.sec.rank, dv.getUint8(1));
				break;
			case oc.captcha:
				switch (dv.getUint8(1)) {
					case captchaState.CA_WAITING:
						// the ws sometimes closes while doing the captcha, showing
						// the reconnect screen afterwards, making the user redo it
						if (this.captcha) {
							let message = ProtocolV1.misc.tokenVerification + this.captcha;
							this.ws.send(message);
						} else {
							loadAndRequestCaptcha();
							eventSys.once(e.misc.captchaToken, token => {
								let message = ProtocolV1.misc.tokenVerification + token;
								if (this.ws.readyState != WebSocket.OPEN) {
									setTimeout(function () {
										net.retryingConnect(() => options.serverAddress[0], this.worldName, token);
									}, 125);
								} else {
									this.ws.send(message);
								}
							});
						}
						break;

					case captchaState.CA_OK:
						this.worldName = this.joinWorld(this.worldName);
						break;
				}
				break;
			case oc.setPQuota:
				let rate = dv.getUint16(1, true);
				let per = dv.getUint16(3, true);
				let oallownc = this.placeBucket.allowance;
				let pmult = dv.byteLength >= 6 ? dv.getUint8(5) / 10 : 1;
				this.placeBucket = new Bucket(rate, per);
				this.placeBucket.allowance = oallownc;
				this.placeBucketMult = pmult;
				eventSys.emit(e.net.donUntil, this.donUntilTs, this.placeBucketMult);
				break;
			case oc.chunkProtected:
				let cx = dv.getInt32(1, true);
				let cy = dv.getInt32(5, true);
				let newState = dv.getUint8(9);
				eventSys.emit(e.net.chunk.lock, cx, cy, newState);
				break;
			case oc.maxCount:
				eventSys.emit(e.net.maxCount, dv.getUint16(1, true));
				break;
			case oc.donUntil:
				this.donUntilTs = dv.getUint32(5, true) * Math.pow(2, 32) + dv.getUint32(1, true);
				eventSys.emit(e.net.donUntil, this.donUntilTs, this.placeBucketMult);
				break;
			default:
				console.error('Unknown op code', dv.getUint8(0));
				return;
		}
	}

	joinWorld(name) {
		let nstr = stoi(name, ProtocolV1.maxWorldNameLength);
		eventSys.emit(e.net.world.joining, nstr[1]);
		let array = new ArrayBuffer(nstr[0].length + 2);
		let dv = new DataView(array);
		for (let i = nstr[0].length; i--;) {
			dv.setUint8(i, nstr[0][i]);
		}
		dv.setUint16(nstr[0].length, ProtocolV1.misc.worldVerification, true);
		this.ws.send(array);
		return nstr[1];
	}

	requestChunk(x, y) {
		let wb = ProtocolV1.worldBorder;
		let key = `${x},${y}`;
		if (x > wb || y > wb || x < ~wb || y < ~wb || this.chunksLoading[key]) {
			return;
		}
		this.chunksLoading[key] = true;
		this.waitingForChunks++;
		let array = new ArrayBuffer(8);
		let dv = new DataView(array);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		this.ws.send(array);
	}

	allChunksLoaded() {
		return this.waitingForChunks === 0;
	}

	updatePixel(x, y, rgb, undocb) {
		let distx = Math.floor(x / ProtocolV1.chunkSize) - Math.floor(this.lastSentX / (ProtocolV1.chunkSize * 16)); distx *= distx;
		let disty = Math.floor(y / ProtocolV1.chunkSize) - Math.floor(this.lastSentY / (ProtocolV1.chunkSize * 16)); disty *= disty;
		let dist = Math.sqrt(distx + disty);

		const statusCodes = {
			"connection": 1,
			"distance": 2,
			"bucket": 3,
			"rank": 4
		}

		if (!this.isConnected()) return statusCodes["connection"];
		if (player.rank < RANK.ADMIN) {
			if (dist >= 4) return statusCodes["distance"];
			if (!this.placeBucket.canSpend(1)) return statusCodes["bucket"];
		}

		let array = new ArrayBuffer(11);
		let dv = new DataView(array);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		dv.setUint8(8, rgb[0]);
		dv.setUint8(9, rgb[1]);
		dv.setUint8(10, rgb[2]);
		this.ws.send(array);
		this.pendingEdits[`${x},${y}`] = setTimeout(undocb, 2000);
		return 0;
	}

	sendUpdates() {
		let worldx = mouse.worldX;
		let worldy = mouse.worldY;
		let lastx = this.lastSentX;
		let lasty = this.lastSentY;
		if (this.isConnected() && shouldUpdate() || (worldx != lastx || worldy != lasty)) {
			let selrgb = player.selectedColor;
			this.lastSentX = worldx;
			this.lastSentY = worldy;
			// Send mouse position
			let array = new ArrayBuffer(12);
			let dv = new DataView(array);
			dv.setInt32(0, worldx, true);
			dv.setInt32(4, worldy, true);
			dv.setUint8(8, selrgb[0]);
			dv.setUint8(9, selrgb[1]);
			dv.setUint8(10, selrgb[2]);
			let tool = player.tool;
			let toolId = tool !== null ? +ProtocolV1.tools.id[tool.id] : 0;
			dv.setUint8(11, toolId);
			this.ws.send(array);
		}
	}

	sendMessage(str) {
		if (str.length && this.id !== null) {
			if (player.rank >= RANK.ADMIN || this.chatBucket.canSpend(1)) {
				this.ws.send(str + ProtocolV1.misc.chatVerification);
				return true;
			} else {
				console.log("slow down");
				eventSys.emit(e.net.chat, JSON.stringify({
					sender: 'server',
					data: {
						type: 'error',
					},
					text: `Slow down! You're talking too fast!`
				}));
				return false;
			}
		}
	}

	protectChunk(x, y, newState) {
		let array = new ArrayBuffer(10);
		let dv = new DataView(array);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		dv.setUint8(8, newState);
		this.ws.send(array);
		eventSys.emit(e.net.chunk.lock, x, y, newState, true);
	}

	setChunk(x, y, data) {
		if (!(player.rank >= RANK.ADMIN || (player.rank == RANK.MODERATOR && this.placeBucket.canSpend(1.25)))) {
			return false;
		}

		let buf = new Uint8Array(8 + ProtocolV1.chunkSize * ProtocolV1.chunkSize * 3);
		let dv = new DataView(buf.buffer);
		dv.setInt32(0, x, true);
		dv.setInt32(4, y, true);
		for (let i = 0, b = 8; i < data.length; i++, b += 3) {
			buf[b] = data[i] & 0xFF;
			buf[b + 1] = data[i] >> 8 & 0xFF;
			buf[b + 2] = data[i] >> 16 & 0xFF;
		}
		this.ws.send(buf.buffer);
		return true;
	}

	clearChunk(x, y, rgb) {
		if (player.rank >= RANK.ADMIN || (player.rank == RANK.MODERATOR && this.placeBucket.canSpend(1))) {
			let array = new ArrayBuffer(13);
			let dv = new DataView(array);
			dv.setInt32(0, x, true);
			dv.setInt32(4, y, true);
			dv.setUint8(8, rgb[0]);
			dv.setUint8(9, rgb[1]);
			dv.setUint8(10, rgb[2]);
			this.ws.send(array);
			return true;
		}
		return false;
	}
}

ProtocolV1.class = ProtocolV1Impl;