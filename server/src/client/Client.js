import { Quota } from "../util/Quota.js";
import { RANK, setAccountProperty } from "../util/util.js";
import { verifyCaptchaToken } from "../util/util.js";
import { handleCommand } from "../cmd/commandHandler.js";

let textEncoder = new TextEncoder();
let textDecoder = new TextDecoder();

let minChunkCoord = ~0xFFFFF;
let maxChunkCoord = 0xFFFFF;

let minPixelCoord = ~0xFFFFFF;
let maxPixelCoord = 0xFFFFFF;

let maxMessageLengths = [
	128,
	128,
	256,
	512,
	Infinity,
	Infinity,
	Infinity,
]

export class Client {
	constructor(serverClientManager, ws, id) {
		this.serverClientManager = serverClientManager;
		this.server = serverClientManager.server;
		this.id = id;
		this.ws = ws;
		this.ip = ws.ip;

		this.ip.addClient(this);

		this.lastUpdate = null;
		this.connectionTick = this.server.currentTick;
		this.rank = 0;
		this.localStaff = false;
		this.localArtist = false; // maybe unused
		this.uid = null;
		this.world = null;
		// console.log("ws token:", ws.token);
		this.accountToken = ws.token;
		this.isBot = ws.isBot;
		this.accountInfo = null;
		let pquota = this.server.config.defaultPquota.split(',').map(value => parseInt(value));
		this.pquota = new Quota(pquota[0], pquota[1]);
		this.protectquota = new Quota(5000, 7);
		this.pquota.deplete();
		this.cquota = new Quota(4, 6);
		this.regionloadquota = new Quota(350, 5);
		this.captchaState = null;
		this.joiningWorld = false;
		this.nick = null;
		this.noPasteTold = false;
		this.sentX = 0;
		this.sentY = 0;
		this.x = 0;
		this.y = 0;
		this.r = 0;
		this.g = 0;
		this.b = 0;
		this.tool = 0;
		this.updated = false;
		this.mute = false;
		this.stealth = false;

		this.deferredRegionActions = new Map();
		this.deferredAmount = 0;

		this.destroyed = false;
	}

	async destroyWithReason(reason){
		await this.setStatus(reason, true);
		this.destroy();
	}

	async setStatus(message, immediate=false, showLoad=false){
		await this.sendMessage({
			sender: 'server',
			data: {
				action: 'updateStatusMessage',
				immediate,
				showLoad
			},
			text: message
		});
	}

	async checkIsLoggedIn() {
		if(this.ip.ip==="0000:0000:0000:0000:0000:ffff:7f00:0001"){
			console.log("islocalhostdev");
			// await this.fetchUserInfo();
			this.accountInfo = {"data":{"user":{"account":{"id":1,"username":"developer"},"info":{"displayName":"developer"},"owopData":{"global":{"rank":5,"isBanned":0,"banExpiration":0,"banReason":null},"worlds":[{"entryId":0,"id":0,"worldName":"main","rank":5,"isBanned":0,"banExpiration":0,"banReason":null}]}}}};
			return true;
		}
		if(!this.accountToken) {
			console.log("not logged in");
			await this.sendMessage({
				sender: 'server',
				data: {
					action: 'updateConnectionScreen',
					object: 'login',
					state: 'show'
				}
			});
			await this.destroyWithReason("You are required to have an account to access this server. You may log in with the button below.");
			return;
		}
		let status = await this.fetchUserInfo();
		if(!status && !this.destroyed) return this.destroyWithReason("You are required to have an account to access this server. You may log in with the button below.");
		return true;
	}

	async createGlobalData(){
		if(this.destroyed) return;
		this.setStatus("Doing first time setup...", true, true);
		try{
			let response = await fetch('https://neomoth.dev/req/account/owop/createGlobal', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Cookie': `nmToken=${this.accountToken}`
				},
				credentials: 'include',
			});
			if(response.status===200) {
				console.log('realistically this should never happen');
				return true;
			}
			else if(response.status===201) return true;
			return false;
		}catch(e){
			console.error(e);
			return false;
		}
	}

	async createWorldData(worldName){
		if(this.destroyed) return;
		this.setStatus("Creating world data...", true, true);
		try{
			let response = await fetch('https://neomoth.dev/req/account/owop/createWorld', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Cookie': `nmToken=${this.accountToken}`
				},
				credentials: 'include',
				body:JSON.stringify({
					worldName
				}),
			});
			if(response.status===200) {
				console.log('realistically this should never happen');
				return true;
			}
			else if(response.status===201) return true;
			return false;
		}catch(e){
			console.error(e);
			return false;
		}
	}

	getAccountGlobalRank(){
		if (this.accountInfo.data.user.account.id===0) return RANK.OWNER; // always make me owner rank
		if(!this.accountInfo) return RANK.NONE;
		return this.accountInfo.data.user.owopData.global.rank;
	}
	getAccountWorldRank(){
		if(!this.accountInfo) return RANK.NONE;
		return this.accountInfo.data.user.owopData.worlds.find(entry=>entry.worldName===this.world.name).rank;
	}
	getTargetRank(){
		let highestRank = Math.max(this.getAccountGlobalRank(),this.getAccountWorldRank());
		if(highestRank===RANK.MODERATOR||highestRank===RANK.ADMIN){
			if (this.getAccountWorldRank()>this.getAccountGlobalRank()) this.localStaff = true;
			else this.localStaff = false;
		}
		return highestRank;
	}
	getAccountNickname(){
		if(!this.accountInfo) return null;
		return this.accountInfo.data.user.info.displayName;
	}
	getAccountUsername(){
		if(!this.accountInfo) return null;
		return this.accountInfo.data.user.account.username;
	}

	updateNick(){
		this.nick = this.getAccountNickname();
		this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: `[Server]: Updated nickname to ${this.nick}.`
		})
	}

	async fetchUserInfo() {
		async function doFetch(token){
			try{
				let response = await fetch('https://neomoth.dev/req/account/get', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Cookie': `nmToken=${token}`
					},
					credentials: 'include',
				});
				return await response.json();
			}catch(e){
				console.error(e);
				return false;
			}
		}
		let response = await doFetch(this.accountToken);
		if(!response.data.user.owopData){
			if(!await this.createGlobalData()) return this.destroyWithReason('Failed to create global OWOP data.');
			response = await doFetch(this.accountToken);
		}
		this.accountInfo = response;
		return true;
		// console.log(response);
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.deferredRegionActions = null;
		if (!this.ws.closed) this.ws.end();
		if (this.world) this.world.removeClient(this);
		this.ip.removeClient(this);
		this.serverClientManager.clientDestroyed(this);
	}

	keepAlive(tick) {
		if (!this.world) return tick - this.connectionTick < 9000;
		if (this.rank >= RANK.MODERATOR) return true;
		if (this.isBot) return true;
		return tick - this.lastUpdate < 18000;
	}

	sendBuffer(buffer) {
		this.ws.send(buffer.buffer, true);
	}

	async sendMessage(message) {
		return new Promise((resolve, reject) => {
			// console.log("sending");
			const success = this.ws.send(JSON.stringify(message), false, sent => {
				if (sent) {
					// console.log("sent late");
					resolve();
				}
				else {
					reject(new Error("failed"));
				}
			});

			if (success) {
				// console.log("success");
				resolve();
			}
		});
	}

	getNick() {
		if (this.nick) {
			if (this.rank >= RANK.ADMIN) {
				if (this.localStaff) return `(A) ${this.nick}`;
				return this.nick;
			}
			if (this.rank === RANK.MODERATOR) return `${this.world.modPrefix.value} ${this.nick}`;
			if (this.rank === RANK.ARTIST) return `[${this.uid}] ${this.nick}`;
			if (this.rank === RANK.DONOR) return `[${this.uid}] ${this.world.donoPrefix} ${this.nick}`;
			return `[${this.uid}] ${this.nick}`;
		}
		if (this.rank === RANK.OWNER) return `(O) ${this.uid}`;
		if (this.rank === RANK.DEVELOPER) return `(D) ${this.uid}`;
		if (this.rank === RANK.ADMIN) return `(A) ${this.uid}`;
		if (this.rank === RANK.MODERATOR) return `${this.world.modPrefix.value} ${this.uid}`;
		if (this.rank === RANK.ARTIST) return `${this.uid}`;
		if (this.rank === RANK.DONOR) return `${this.world.donoPrefix} ${this.uid}`;
		return this.uid.toString();
	}

	setUid(id) {
		this.uid = id;
		let buffer = Buffer.allocUnsafeSlow(5);
		buffer[0] = 0x00;
		buffer.writeUint32LE(id, 1);
		this.sendBuffer(buffer);
	}

	setPquota(amount, seconds) {
		this.pquota.setParams(amount, seconds)
		let buffer = Buffer.allocUnsafeSlow(5)
		buffer[0] = 0x06
		buffer.writeUint16LE(amount, 1)
		buffer.writeUint16LE(seconds, 3)
		this.sendBuffer(buffer)
	}

	setRank(rank) {
		if (rank === this.rank) return;
		if (rank >= RANK.ADMIN) this.ws.subscribe(this.server.adminTopic);
		else if (this.rank >= RANK.ADMIN && rank < RANK.ADMIN) this.ws.unsubscribe(this.server.adminTopic);
		let pquota = this.world.pquota.value ? this.world.pquota.value : this.server.config.defaultPquota;
		pquota = pquota.split(',').map(value => parseInt(value));
		switch (rank) {
			case RANK.NONE:
				pquota[0] = 0;
				break;
			case RANK.USER:
				pquota = this.server.config.defaultPquota.split(',').map(value => parseInt(value));
				break;
			case RANK.ARTIST:
				if (this.world.doubleModPquota.value) {
					pquota[0] = Math.floor(pquota[0] * 8);
					pquota[1] = Math.ceil(pquota[1] / 2);
					setTimeout(() => {
						if(this.destroyed) return;
						this.sendMessage({
							data: {
								eval: 'NWOP.tools.allTools.fill.extra.tickAmount = 80'
							}
						});
					}, 50);
				}
				break;
			case RANK.MODERATOR:
				if (this.world.doubleModPquota.value) {
					pquota[0] = Math.floor(pquota[0] * 8);
					pquota[1] = Math.ceil(pquota[1] / 2);
					setTimeout(() => {
						if(this.destroyed) return;
						this.sendMessage({
							data: {
								eval: 'NWOP.tools.allTools.fill.extra.tickAmount = 80'
							}
						});
					}, 50);
				}
				break;
			case RANK.ADMIN:
				pquota[1] = 0;
				setTimeout(() => {
					if(this.destroyed) return;
					this.sendMessage({
						data: {
							eval: 'NWOP.tools.allTools.fill.extra.tickAmount = 200'
						}
					});
				}, 50);
				break;
			case RANK.DEVELOPER:
				pquota[1] = 0;
				setTimeout(() => {
					if(this.destroyed) return;
					this.sendMessage({
						data: {
							eval: 'NWOP.tools.allTools.fill.extra.tickAmount = 400'
						}
					});
				}, 50);
				break;
			case RANK.OWNER:
				pquota[1] = 0;
				setTimeout(() => {
					if(this.destroyed) return;
					this.sendMessage({
						data: {
							eval: 'NWOP.tools.allTools.fill.extra.tickAmount = 1200'
						}
					});
				}, 50);
				break;
		}
		this.setPquota(pquota[0], pquota[1]);
		this.rank = rank;
		let buffer = Buffer.allocUnsafeSlow(2);
		buffer[0] = 0x04;
		buffer[1] = rank;
		this.sendBuffer(buffer);
		if (rank === RANK.ARTIST) this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: '[Server]: You have been granted artist rank. You now have access to more utilities.',
		});
		else if (rank === RANK.MODERATOR) this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: '[Server]: You are now a moderator. Do /help for a list of commands.',
		});
		else if (rank === RANK.ADMIN) this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: '[Server]: You are now an administrator. Do /help for a list of commands.',
		});
		else if (rank === RANK.DEVELOPER) this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: '[Server]: You are now a developer. You have been granted additional access.',
		});
		else if (rank === RANK.OWNER) this.sendMessage({
			sender: 'server',
			data: {
				type: 'info',
			},
			text: '[Server]: hi pookie smooch smooch :3',
		});
	}

	startProtocol() {
		if(this.destroyed) return;
		if (this.ip.banExpiration !== 0) {
			if (this.ip.banExpiration === -1) {
				this.sendMessage({
					sender: 'server',
					data: {
						type: 'error',
					},
					text: `You are banned. ${this.server.config.appealMessage}`,
				});
				this.destroyWithReason('You are banned.');
				return;
			}
			if (this.ip.banExpiration > Date.now()) {
				this.sendMessage({
					sender: 'server',
					data: {
						type: 'error',
					},
					text: `Remaining time: ${Math.floor((this.ip.banExpiration - Date.now()) / 1000)} seconds.`
				});
				this.sendMessage({
					sender: 'server',
					data: {
						type: 'error',
					},
					text: `You are banned. ${this.server.config.appealMessage}`,
				});
				this.destroyWithReason('You are banned.');
				return;
			}
			this.ip.setProp("banExpiration", 0);
		}
		// console.log(this.accountInfo);
		if(this.accountInfo){
			// console.log(this.accountInfo);
			// console.log(this.accountInfo.data.user.owopData.global.isBanned)
			if(this.accountInfo.data.user.owopData.global.isBanned){
				// console.log("yeag")
				if(this.accountInfo.data.user.owopData.global.banExpiration===-1){
					this.sendMessage({
						sender: 'server',
						data: {
							type: 'error',
						},
						text: 'You are banned from this server.'
					});
					this.destroyWithReason('You are banned.');
					return;
				}
				if(this.accountInfo.data.user.owopData.global.banExpiration>Date.now()){
					this.sendMessage({
						sender: 'server',
						data: {
							type: 'error',
						},
						text: `Remaining time: ${Math.floor((this.accountInfo.data.user.owopData.global.banExpiration - Date.now()) / 1000)} seconds.`
					});
					this.sendMessage({
						sender: 'server',
						data: {
							type: 'error',
						},
						text: 'You are banned from this server.'
					});
					this.destroyWithReason('You are banned.');
					return;
				}
				setAccountProperty(this, this.getAccountUsername(), "local", "isBanned", false);
			}
		}
		let whitelisted = this.ip.isWhitelisted();
		if (this.server.lockdown && !whitelisted) {
			this.sendMessage({
				sender: 'server',
				data: {
					type: 'error',
				},
				text: 'Sorry, this server is currently not accepting new connections.'
			});
			this.destroy();
			return;
		}
		if (this.ip.tooManyClients()) {
			this.sendMessage({
				sender: 'server',
				data: {
					type: 'error',
				},
				text: `Sorry, but you have reached the maximum number of simultaneous connections, (${this.server.config.maxConnectionsPerIp}).`,
			});
			this.destroy();
			return;
		}
		let requiresVerification;
		switch (this.server.config.captchaSecurity) {
			case 0:
				requiresVerification = false;
				break;
			case 1:
				requiresVerification = !isWhitelisted;
				break;
			case 2:
				requiresVerification = true;
		}
		if (requiresVerification) this.setCaptchaState(0x00);
		else this.setCaptchaState(0x03);
	}

	setCaptchaState(value) {
		this.captchaState = value;
		let buffer = Buffer.allocUnsafeSlow(2);
		buffer[0] = 0x05;
		buffer[1] = value;
		this.sendBuffer(buffer);
	}

	handleMessage(message, isBinary) {
		// console.log("got message:", message);
		if (!this.world) {
			// console.log(message);
			this.handlePreWorld(message, isBinary);
			return;
		}
		if (!isBinary) {
			// console.log(message);
			this.handleString(message, isBinary);
			return;
		}
		message = Buffer.from(message);
		switch (message.length) {
			case 8: {
				let chunkX = message.readInt32LE(0);
				if (chunkX > maxChunkCoord || chunkX < minChunkCoord) {
					this.destroy();
					return;
				}
				let chunkY = message.readInt32LE(4);
				if (chunkY > maxChunkCoord || chunkY < minChunkCoord) {
					this.destroy();
					return;
				}
				let regionId = ((chunkX >> 4) + 0x10000) + (((chunkY >> 4) + 0x10000) * 0x20000);
				let region = this.world.getRegion(regionId);
				if (!region.loaded) {
					let deferredActions = this.handleUnloaded(region);
					if (!deferredActions) return;
					let buffer = Buffer.allocUnsafe(1);
					buffer[0] = (chunkY & 0xf) << 4 | chunkX & 0xf
					deferredActions.push(buffer);
					if (++this.deferredAmount >= 100000 && this.rank < RANK.ADMIN) {
						this.destroy();
					}
					return;
				}
				region.requestChunk(this, (chunkY & 0xf) << 4 | chunkX & 0xf);
				return;
			}
			//set pixel
			case 11: {
				if (this.rank < 1) return;
				let x = message.readInt32LE(0);
				if (x > maxPixelCoord || x < minPixelCoord) {
					this.destroy();
					return;
				}
				let y = message.readInt32LE(4);
				if (y > maxPixelCoord || y < minPixelCoord) {
					this.destroy();
					return;
				}
				if (this.rank < RANK.ADMIN) {
					if (!this.pquota.canSpend()) return;
					let xDistance = (x >> 4) - (this.x >> 8);
					let yDistance = (y >> 4) - (this.y >> 8);
					let distance = Math.sqrt(Math.pow(xDistance, 2) + Math.pow(yDistance, 2));
					if (distance > 4) return;
				}
				let regionId = ((x >> 8) + 0x10000) + (((y >> 8) + 0x10000) * 0x20000);
				let region = this.world.getRegion(regionId);
				if (!region.loaded) {
					let deferredActions = this.handleUnloaded(region);
					if (!deferredActions) return;
					let buffer = Buffer.allocUnsafe(5);
					buffer[0] = x & 0xff;
					buffer[1] = y & 0xff;
					buffer[2] = message[8];
					buffer[3] = message[9];
					buffer[4] = message[10];
					deferredActions.push(buffer);
					if (++this.deferredAmount >= 100000 && this.rank < 3) {
						this.destroy();
					}
					return;
				}
				region.setPixel(this, x & 0xff, y & 0xff, message[8], message[9], message[10]);
				return;
			}
			//chunk paste
			case 776: {
				if (this.rank < 2) return;
				if (this.rank < 3) {
					if (!this.world.pastingAllowed.value) {
						if (!this.noPasteTold) {
							this.noPasteTold = true;
							this.sendMessage({
								sender: 'server',
								data: {
									type: 'error',
								},
								text: `Pasting is disabled in this world, sorry!`,
							});
						}
						return;
					}
					if (!this.pquota.canSpend()) return;
				}
				let chunkX = message.readInt32LE(0);
				if (chunkX > maxChunkCoord || chunkX < minChunkCoord) {
					this.destroy();
					return;
				}
				let chunkY = message.readInt32LE(4);
				if (chunkY > maxChunkCoord || chunkY < minChunkCoord) {
					this.destroy();
					return;
				}
				let regionId = ((chunkX >> 4) + 0x10000) + (((chunkY >> 4) + 0x10000) * 0x20000);
				let region = this.world.getRegion(regionId);
				if (!region.loaded) {
					let deferredActions = this.handleUnloaded(region);
					if (!deferredActions) return;
					let buffer = Buffer.allocUnsafe(769);
					buffer[0] = (chunkY & 0xf) << 4 | chunkX & 0xf;
					message.copy(buffer, 1, 8);
					deferredActions.push(buffer);
					if (++this.deferredAmount >= 100000 && this.rank < 3) {
						this.destroy();
					}
					return;
				}
				region.pasteChunk((chunkY & 0xf) << 4 | chunkX & 0xf, message.subarray(8));
				return;
			}
			//erase chunk
			case 13: {
				if (this.rank < RANK.ARTIST) return;
				if (this.rank < RANK.ADMIN) {
					if (this.world.simpleMods) return;
					if (!this.pquota.canSpend()) return;
				}
				let chunkX = message.readInt32LE(0);
				if (chunkX > maxChunkCoord || chunkX < minChunkCoord) {
					this.destroy();
					return;
				}
				let chunkY = message.readInt32LE(4);
				if (chunkY > maxChunkCoord || chunkY < minChunkCoord) {
					this.destroy();
					return;
				}
				let regionId = ((chunkX >> 4) + 0x10000) + (((chunkY >> 4) + 0x10000) * 0x20000);
				let region = this.world.getRegion(regionId);
				if (!region.loaded) {
					let deferredActions = this.handleUnloaded(region);
					if (!deferredActions) return;
					let buffer = Buffer.allocUnsafe(4);
					buffer[0] = (chunkY & 0xf) << 4 | chunkX & 0xf;
					buffer[1] = message[8];
					buffer[2] = message[9];
					buffer[3] = message[10];
					deferredActions.push(buffer);
					if (++this.deferredAmount >= 100000 && this.rank < 3) {
						this.destroy();
					}
					return;
				}
				region.eraseChunk((chunkY & 0xf) << 4 | chunkX & 0xf, message[8], message[9], message[10]);
				return;
			}
			//protect chunk
			case 10: {
				if (this.rank < 2) return;
				if (this.rank < 3) {
					if (this.world.simpleMods.value) return;
					if (!this.protectquota.canSpend()) return;
				}
				let chunkX = message.readInt32LE(0);
				if (chunkX > maxChunkCoord || chunkX < minChunkCoord) {
					this.destroy();
					return;
				}
				let chunkY = message.readInt32LE(4);
				if (chunkY > maxChunkCoord || chunkY < minChunkCoord) {
					this.destroy();
					return;
				}
				if (message[8] > 1) {
					this.destroy();
					return;
				}
				let regionId = ((chunkX >> 4) + 0x10000) + (((chunkY >> 4) + 0x10000) * 0x20000);
				let region = this.world.getRegion(regionId);
				if (!region.loaded) {
					let deferredActions = this.handleUnloaded(region);
					if (!deferredActions) return;
					let buffer = Buffer.allocUnsafe(2);
					buffer[0] = (chunkY & 0xf) << 4 | chunkX & 0xf;
					buffer[1] = message[8];
					deferredActions.push(buffer);
					if (++this.deferredAmount >= 100000 && this.rank < 3) {
						this.destroy();
					}
					return;
				}
				region.protectChunk((chunkY & 0xf) << 4 | chunkX & 0xf, message[8]);
				return;
			}
			//player update
			case 12: {
				this.updated = true;
				let x = message.readInt32LE(0);
				let y = message.readInt32LE(4);
				this.r = message[8];
				this.g = message[9];
				this.b = message[10];
				let tool = message[11];
				if (this.rank < RANK.MODERATOR) {
					if (tool === 3 || tool === 6 || tool === 9 || tool === 10) tool = 0;
					if (this.rank < RANK.USER) {
						if (tool === 0 || tool === 2 || tool === 5 || tool === 8) tool = 1;
					}
				}
				this.tool = tool;
				if (this.rank < RANK.MODERATOR) {
					let maxTpDistance = this.world.maxTpDistance.value;
					if (Math.abs(x >> 4) > maxTpDistance || Math.abs(y >> 4) > maxTpDistance) {
						let distance = Math.sqrt(Math.pow(x - this.sentX, 2) + Math.pow(y - this.sentY, 2));
						if (distance > 10000) {
							this.teleport(this.sentX, this.sentY);
							return;
						}
					}
				}
				this.x = x;
				this.y = y;
				return;
			}
			//rank verification
			case 1: {
				if (message[0] > this.rank) {
					this.destroy();
					return;
				}
				return;
			}
			default: {
				this.destroy();
			}
		}
	}

	handleUnloaded(region) {
		if (!region.beganLoading) {
			if (this.rank < RANK.ADMIN && !this.regionloadquota.canSpend()) {
				this.server.adminMessage(`DEVKicked ${this.uid} (${this.world.name}, ${this.ip.ip}) for loading too many regions`);
				this.destroy();
				return false;
			}
			region.load();
		}
		let regionId = region.id;
		let deferredActions = this.deferredRegionActions.get(regionId);
		if (!deferredActions) {
			deferredActions = [];
			this.deferredRegionActions.set(regionId, deferredActions);
			this.awaitRegionLoad(regionId);
		}
		return deferredActions;
	}

	async awaitRegionLoad(regionId) {
		let region = this.world.getRegion(regionId);
		await region.loadPromise;
		if (this.destroyed) return;
		let deferredActions = this.deferredRegionActions.get(regionId);
		this.deferredAmount -= deferredActions.length;
		this.deferredRegionActions.delete(regionId);
		for (let action of deferredActions) {
			switch (action.length) {
				//request chunk
				case 1: {
					region.requestChunk(this, action[0]);
					continue;
				}
				//set pixel
				case 5: {
					region.setPixel(this, action[0], action[1], action[2], action[3], action[4]);
					continue;
				}
				//chunk paste
				case 769: {
					region.pasteChunk(action[0], action.subarray(1));
					continue;
				}
				//erase chunk
				case 4: {
					region.eraseChunk(action[0], action[1], action[2], action[3]);
					continue;
				}
				//protect chunk
				case 2: {
					region.protectChunk(action[0], action[1]);
				}
			}
		}
	}

	async handlePreWorld(message, isBinary) {
		let expecting = [2, 0, 0, 1, 0][this.captchaState];
		if (this.joiningWorld) this.expecting = 0;

		if (expecting === 0) {
			//not expecting a message, destroy for protocol violation
			this.destroy();
			return;
		}
		if (expecting === 1) {
			//expecting world join
			if (!isBinary) {
				this.destroy();
				return;
			}
			message = Buffer.from(message)
			//check if too long
			if (message.length > 26) {
				this.destroy();
				return;
			}
			//check worldVerification (minecraft port owo)
			if (message.readUint16LE(message.length - 2) !== 25565) {
				this.destroy();
				return;
			}
			//validate world name
			for (let i = message.length - 2; i--;) {
				let charCode = message[i];
				if (!((charCode > 96 && charCode < 123) || (charCode > 47 && charCode < 58) || charCode === 95 || charCode === 46)) {
					this.destroy();
					return;
				}
			}
			let worldName = message.toString("utf8", 0, message.length - 2);
			this.joiningWorld = true;
			let world = await this.server.worlds.fetch(worldName);
			if (this.destroyed) return;
			if (world.isFull()) {
				this.sendMessage({
					sender: 'server',
					data: {
						type: 'error',
					},
					text: "World full, try again later!",
				});
				this.destroy();
				return;
			}

			world.addClient(this);
			this.joiningWorld = false;
			return;
		}
		//expecting captcha
		if (isBinary) {
			this.destroy();
			return;
		}
		message = textDecoder.decode(message);
		if (!message.startsWith("CaptchA")) {
			this.destroy();
			return;
		}
		let slice = message.substring(7);
		if (slice.startsWith("LETMEINPLZ")) {
			slice = slice.substring(10);
			if (slice !== process.env.CAPTCHAPASS) {
				this.destroy();
				return;
			}
			this.setCaptchaState(0x03);
			return;
		}
		if (!this.ip.captchaquota.canSpend()) {
			this.sendMessage({
				sender: 'server',
				data: {
					type: 'error',
				},
				text: "You've done too many captchas recently. Try again in a few seconds.",
			});
			this.destroy();
			return;
		}
		this.setCaptchaState(0x01);
		let isValid = await verifyCaptchaToken(slice);
		if (this.destroyed) return;
		if (!isValid) {
			this.setCaptchaState(0x04);
			this.destroy();
			return;
		}
		this.ip.setProp("whitelist", this.server.whitelistId);
		this.setCaptchaState(0x03);
	}

	handleString(message) {
		if (this.rank <= RANK.ADMIN && !this.cquota.canSpend()) return;
		message = textDecoder.decode(message);
		if (!message.endsWith("\n")) {
			this.destroy();
			return;
		}
		message = message.substring(0, message.length - 1);
		if (!this.isBot && message.length > maxMessageLengths[this.rank]) return;
		if (message.startsWith("/")) {
			message = message.trim();
			handleCommand(this, message);
		}
		else {
			if (this.rank < RANK.ADMIN && this.mute) return;
			message = message.trim();
			if (message.length === 0) return;
			this.world.sendChat(this, message);
		}
	}

	teleport(x, y) {
		this.updated = true;
		this.x = x;
		this.y = y;

		let buffer = Buffer.allocUnsafeSlow(9);
		buffer[0] = 0x03;
		buffer.writeInt32LE(x >> 4, 1);
		buffer.writeInt32LE(y >> 4, 5);
		this.sendBuffer(buffer);
	}

	tick(tick) {
		if (!this.updated) return;
		this.updated = false;
		this.lastUpdate = tick;
		this.sentX = this.x;
		this.sentY = this.y;
		if (!this.stealth) this.world.playerUpdates.add(this);
	}
}