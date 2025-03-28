// 'use strict';
import { normalizeWheel } from "./util/normalizeWheel";
import anchrome from './util/anchrome';

import { EVENTS as e, RANK } from './conf';
// import { Bucket } from '../util/Bucket';
import { escapeHTML, getTime, getCookie, setCookie, cookiesEnabled, storageEnabled, loadScript, eventOnce, KeyCode } from './util/misc';

import { eventSys, PublicAPI, AnnoyingAPI as aa, wsTroll } from './global';
import { options } from './conf';
import { World } from './World';
import { camera, renderer, moveCameraBy } from './canvas_renderer';
import { net } from './networking';
import { updateClientFx, player } from './local_player.js';
import { resolveProtocols, definedProtos } from './protocol/all';
import { windowSys, GUIWindow, NWOPDropDown, UtilDialog } from './windowsys';

import { createContextMenu } from './context';

import launchSoundUrl from '../audio/launch.mp3';
import placeSoundUrl from '../audio/place.mp3';
import clickSoundUrl from '../audio/click.mp3';

import imgref from '../img/bignwop.png';

import { stickyimg } from './stickyimg.js';
import { tools } from "./tools.js";
import { colorUtils } from "./util/color.js";
import { PixelManager } from "./util/pixelTools.js";

export { showDevChat, showPlayerList, statusMsg };

const noticeId=0;

export const PM = new PixelManager;
PM.setup();

export const keysDown = {};

let statusSet = false;

export const mouse = {
	x: 0,
	y: 0,
	lastX: 0,
	lastY: 0,
	get worldX() { return camera.x * 16 + this.x / (camera.zoom / 16); },
	get worldY() { return camera.y * 16 + this.y / (camera.zoom / 16); },
	mouseDownWorldX: 0,
	mouseDownWorldY: 0,
	get tileX() { return Math.floor(this.worldX / 16); },
	get tileY() { return Math.floor(this.worldY / 16); },
	buttons: 0,
	validTile: false,
	insideViewport: false,
	touches: [],
	cancelMouseDown: function () { this.buttons = 0; },
};

export const elements = {
	viewport: null,
	xyDisplay: null,
	chatInput: null,
	chat: null,
	devChat: null,
};

export const misc = {
	localStorage: storageEnabled() && window.localStorage,
	_world: null,
	lastXYDisplay: [-1, -1],
	devRecvReader: msg => { },
	chatPostFormatRecvModifier: msg => msg,
	chatRecvModifier: msg => msg,
	chatSendModifier: msg => msg,
	exceptionTimeout: null,
	worldPasswords: {},
	tick: 0,
	urlWorldName: null,
	connecting: false,
	tickInterval: null,
	lastMessage: null,
	lastCleanup: 0,
	set world(value) {
		PublicAPI.world = getNewWorldApi();
		return this._world = value;
	},
	get world() { return this._world; },
	guiShown: false,
	cookiesEnabled: cookiesEnabled(),
	storageEnabled: storageEnabled(),
	showEUCookieNag: !options.noUi && cookiesEnabled() && getCookie('nagAccepted') !== 'true',
	usingFirefox: navigator.userAgent.indexOf('Firefox') !== -1,
	donTimer: 0,
};

export const sounds = {
	play: function (sound) {
		sound.currentTime = 0;
		if (options.enableSounds) {
			sound.play();
		}
	}
};

sounds.launch = new Audio();
sounds.launch.src = launchSoundUrl;
sounds.place = new Audio();
sounds.place.src = placeSoundUrl;
sounds.click = new Audio();
sounds.click.src = clickSoundUrl;

let plWidth = 0;
export var playerList = {};
export var playerListTable = document.createElement("table");
export var playerListWindow = new GUIWindow('Players', { closeable: true }, wdow => {
	var tableHeader = document.createElement("tr");
	tableHeader.innerHTML = "<th>Id</th><th>Nick</th><th>X</th><th>Y</th>";
	playerListTable.appendChild(tableHeader);
	wdow.container.appendChild(playerListTable);
	wdow.container.id = "player-list";
}).move(window.innerWidth - 240, 32);
playerListWindow.container.updateDisplay = function(){
	// console.log("update");
	let diff = playerListWindow.container.parentElement.offsetWidth - plWidth
	// console.log(playerListWindow.container.parentElement.offsetWidth);
	// console.log(plWidth);
	// console.log(diff);
	if(diff!==0){
		playerListWindow.move(playerListWindow.x - diff, playerListWindow.y);
		plWidth = playerListWindow.container.parentElement.offsetWidth;
	}	
}

function getNewWorldApi() {
	let obj = {
		get name() { return misc.world.name; },
	};
	let defProp = function (prop) {
		Object.defineProperty(obj, prop, {
			get: function () { return misc.world && this['_' + prop] || (this['_' + prop] = misc.world[prop].bind(misc.world)); },
		});
	}

	defProp('getPixel');
	defProp('setPixel');
	defProp('undo');
	defProp('redo');
	defProp('unloadFarChunks');
	return obj;
}

function receiveMessage(rawText) {
	rawText = misc.chatRecvModifier(rawText);
	if (!rawText) return;

	let addContext = (el, nick, id) => {
		el.addEventListener('click', function (event) {
			createContextMenu(event.clientX, event.clientY, [
				["Mute " + nick, function () {
					PublicAPI.muted.push(id);
					receiveMessage({
						sender: 'server',
						data: {
							type: 'error',
						},
						text: `Muted ${nick} (${id}).`,
					});
				}]
			]);
			event.stopPropagation();
		});
	};

	let message = document.createElement('li');

	let parsedJson = JSON.parse(rawText);
	// console.log(parsedJson);
	let text = parsedJson.text;
	let realText = text;
	let sender = parsedJson.sender;
	let data = parsedJson.data;
	let clientInfo = parsedJson.clientInfo;
	let allowHTML = false;
	statusSet = false;
	if (sender === 'server') {
		allowHTML = data.allowHTML || false;
		if (data.type === 'info') message.className = 'serverInfo';
		if (data.type === 'error') message.className = 'serverError';
		if (data.type === 'motd') allowHTML = true;
		// if (data.action === 'updatePlayerNick'){
		// 	let newNick = data.newNick;
		// 	let target = data.targetId;
		// 	function waitForPlayer(){
		// 		// console.log(playerList[target.toString()]);
		// 		if(!misc.world||misc.world==null) return;
		// 		if(!misc.world.players[target.toString()]) return;
		// 		misc.world.players[target.toString()].knownNick = newNick;
		// 		// playerList[target].childNodes[1].innerHTML = newNick;
		// 		clearInterval(waitForPlayer);
		// 	}
		// 	setInterval(waitForPlayer, 10);
		// 	// find player in misc.world.players with id == target, players is an object not an array
			
		// 	// if(playerList[target]) playerList[target].childNodes[1].innerHTML = newNick;
		// }
		if (data.action === 'updateNick') {
			let newNick = data.newNick;
			player.knownNick = newNick;
			if (newNick) misc.localStorage.nick = newNick;
			else delete misc.localStorage.nick;
		}
		if (data.action === 'staffPasswordAttempt') {
			switch(data.desiredRank){
				case RANK.OWNER:
					misc.localStorage.ownerlogin = data.password;
					return;
				case RANK.DEVELOPER:
					misc.localStorage.devlogin = data.password;
					return;
				case RANK.ADMIN:
					misc.localStorage.adminlogin = data.password;
					return;
				case RANK.MODERATOR:
					misc.localStorage.modlogin = data.password;
					return;
			}
		}
		if (data.action === 'passwordSuccess') {
			misc.worldPasswords[net.protocol.worldName] = data.password;
			saveWorldPasswords();
			if(!data.text) return;
		}
		if (data.action === 'updateStatusMessage') {
			// console.log(text);
			statusSet = true;
			if(data.immediate) statusMsg(data.showLoad, text);
			return;
		}
		if (data.action === 'updateConnectionScreen') {
			if(data.object==='login'){
				elements.loginButton.className = data.state==='show'?'':'hide';
				// elements.register.style.display = data.state==='show'?'none':'';
			}
		}
	}
	else if (sender === 'notif') {
		if (data.type === 'whisperRecieved') {
			if (PublicAPI.muted.includes(data.senderId)) return;
			let nick = document.createElement('span');
			nick.className = 'whisper';
			nick.innerHTML = escapeHTML(`-> ${data.senderId} tells you: `);
			addContext(nick, data.senderNick, data.senderId);
			message.appendChild(nick);
		}
		else if (data.type === 'whisperSent') {
			let nick = document.createElement('span');
			message.className = 'whisper';
			nick.innerHTML = escapeHTML(`-> You tell ${data.targetId}: `);
			message.appendChild(nick);
		}
		else {
			text = `-> ${text}`;
			message.className = 'whisper';
		}
	}
	else if (sender === 'world') {
		if (data.type === 'spawnStickyImage') {
			stickyimg(data.imageURL, data.imageSize[0], data.imageSize[1], data.imageOpacity);
			return;
		}	
	}
	else if (sender === 'player') {
		if (data.type === 'chatMessage' || data.type === 'broadcastMessage') {
			let nick = document.createElement('span');
			message.style.display = 'block';
			if (data.isWorldMessage) {
				allowHTML = true;
				message.className = 'adminMessage';
			}
			else {
				if (PublicAPI.muted.includes(data.senderId) && data.senderRank < RANK.MODERATOR) return;
				if (data.senderRank >= RANK.ADMIN && !data.isLocalStaff) allowHTML = true;

				if (data.senderRank === RANK.OWNER) message.className = 'ownerMessage';
				else if (data.senderRank === RANK.DEVELOPER) message.className = 'developerMessage';
				else if (data.senderRank === RANK.ADMIN) message.className = 'adminMessage';
				else if (data.senderRank === RANK.MODERATOR) message.className = 'moderatorMessage';
				else if (data.senderRank === RANK.ARTIST) nick.className = 'artistMessage';
				// else if (data.senderRank === RANK.DONOR) nick.className = 'donorMessage';
				else if (data.senderRank === RANK.USER) nick.className = 'userMessage';
				else if (data.senderRank === RANK.NONE) nick.className = 'noneMessage';

				if (!allowHTML) nick.innerHTML = escapeHTML(`${data.senderNick}: `);
				else nick.innerHTML = `${data.senderNick}: `;

				if (data.type === 'broadcastMessage'){
					let broadcast = document.createElement('span');
					broadcast.className = 'broadcastMessage';
					broadcast.innerText = '[Broadcast] ';
					message.appendChild(broadcast);
				}

				if(data.isBot) {
					nick.className = 'nick';
					message.classList.add('discordMessage');
				}

				message.appendChild(nick);
			}
		}
	}
	else if (sender === 'rawChat') {
		allowHTML = true;
	}
	if(data.eval){
		eval(data.eval);
	}
	if (false) {/* do spam prevention here later */ }
	else {
		if(!text) return;
		let span = document.createElement('span');
		/* more spam prevention here later */
		console.log(text);
		if (!allowHTML) text = escapeHTML(text).replace(/\&#x2F;/g, '/');
		let textByNls = text.split('\n');
		let firstNl = textByNls.shift();
		firstNl = firstNl.replace(/(?:&lt;|<)a:(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.gif?v=1">'); // animated
		firstNl = firstNl.replace(/(?:&lt;|<):(.+?):([0-9]{8,32})(?:&gt;|>)/g, '<img class="emote" src="https://cdn.discordapp.com/emojis/$2.png?v=1">'); // static
		text = firstNl + '\n' + textByNls.join('\n');
		text = misc.chatPostFormatRecvModifier(text);
		span.innerHTML = anchrome(text, {
			attributes: [{
				name: 'target',
				value: '_blank'
			}]
		});
		message.appendChild(span);
		scrollChatToBottom(() => {
			elements.chatMessages.appendChild(message);
			let children = elements.chatMessages.children;
			if (children.length > options.maxChatBuffer) children[0].remove();
		}, true);
	}
}

function receiveDevMessage(text) {
	try {
		misc.devRecvReader(text);
	} catch (e) { }
	let message = document.createElement("li");
	let span = document.createElement("span");
	span.innerHTML = text;
	message.appendChild(span);
	elements.devChatMessages.appendChild(message);
	elements.devChatMessages.scrollTop = elements.devChatMessages.scrollHeight;
}

function scrollChatToBottom(callback, dontScrollIfNotTop = false) {
	let shouldScroll = !dontScrollIfNotTop || elements.chatMessages.scrollHeight - elements.chatMessages.scrollTop === elements.chatMessages.clientHeight;
	if (callback)
		callback(); // add all elements here
	if (shouldScroll)
		elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function clearChat() {
	elements.chatMessages.innerHTML = "";
	elements.devChatMessages.innerHTML = "";
}

function tick() {
	let tickNum = ++misc.tick;
	let speed = Math.max(Math.min(options.movementSpeed, 64), 0);
	let offX = 0;
	let offY = 0;
	if (keysDown[38]) { // Up
		offY -= speed;
	}
	if (keysDown[37]) { // Left
		offX -= speed;
	}
	if (keysDown[40]) { // Down
		offY += speed;
	}
	if (keysDown[39]) { // Right
		offX += speed;
	}
	if (offX !== 0 || offY !== 0) {
		moveCameraBy(offX, offY);
		updateMouse({}, 'mousemove', mouse.x, mouse.y);
	}

	eventSys.emit(e.tick, tickNum);
	if (player.tool !== null && misc.world !== null) {
		player.tool.call('tick', mouse);
	}
}

function updateMouse(event, eventName, mouseX, mouseY) {
	mouse.x = mouseX;
	mouse.y = mouseY;
	let cancelled = 0;
	if (misc.world !== null) {
		mouse.validTile = misc.world.validMousePos(mouse.tileX, mouse.tileY);
		if (player.tool !== null) {
			cancelled = player.tool.call(eventName, [mouse, event]);
		}
		if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
			updateClientFx();
		}
	}
	return cancelled;
}

function openChat() {
	elements.chat.className = "active selectable";
	elements.devChat.className = "active selectable";
	elements.chatMessages.className = "active";
	scrollChatToBottom();
}

function closeChat() {
	elements.chat.className = "";
	elements.devChat.className = "";
	elements.chatMessages.className = "";
	elements.chatInput.blur();
	scrollChatToBottom();
}

function showDevChat(bool) {
	elements.devChat.style.display = bool ? "" : "none";
}

export function revealSecrets(bool) {
	if (bool) {
		PublicAPI.net = net;
		//window.WebSocket = aa.ws;
	} else {
		delete PublicAPI.net;
		//delete PublicAPI.tool;
		//window.WebSocket = wsTroll;
	}
}

function showPlayerList(bool) {
	if (bool) {
		windowSys.addWindow(playerListWindow);
		plWidth = playerListWindow.container.parentElement.offsetWidth;
	} else {
		windowSys.delWindow(playerListWindow);
	}
}

function updateXYDisplay(x, y) {
	if (misc.lastXYDisplay[0] !== x || misc.lastXYDisplay[1] !== y) {
		misc.lastXYDisplay = [x, y];
		if (!options.hexCoords) {
			elements.xyDisplay.innerHTML = "X: " + x + ", Y: " + y;
		} else {
			let hexify = i => `${(i < 0 ? '-' : '')}0x${Math.abs(i).toString(16)}`;
			elements.xyDisplay.innerHTML = `X: ${hexify(x)}, Y: ${hexify(y)}`;
		}
		return true;
	}
	return false;
}

function updatePlayerCount() {
	let text = ' cursor' + (misc.playerCount !== 1 ? 's online' : ' online');
	let countStr = '' + misc.playerCount;
	if (misc.world && 'maxCount' in misc.world) {
		countStr += '/' + misc.world.maxCount;
	}

	let final = countStr + text;
	elements.playerCountDisplay.innerHTML = final;

	let title = 'World of Pixels';
	if (misc.world) {
		title = '(' + countStr + '/' + misc.world.name + ') ' + title;
	}

	document.title = title;
}

function logoMakeRoom(bool) {
	elements.loadUl.style.transform = bool ? "translateY(-75%) scale(0.5)" : "";
}

function dismissNotice() {
	misc.localStorage.dismissedId=noticeId;
	elements.noticeDisplay.style.transform="translateY(-100%)";
}

function showWorldUI(bool) {
	misc.guiShown = bool;
	// elements.xyDisplay.style.transform = bool ? "initial" : "";
	elements.playerCountDisplay.style.transform = bool ? "initial" : "";
	// elements.pBucketDisplay.style.transform = bool ? "initial" : "";
	elements.rankDisplay.style.transform = bool ? "initial" : "";
	elements.palette.style.transform = bool ? "translateY(-50%)" : "";
	elements.chat.style.transform = bool ? "initial" : "";
	elements.chatInput.disabled = !bool;
	for(let element of elements.topLeftDisplays.children) element.style.transform = bool ? "initial" : "";
	for(let element of elements.topRightDisplays.children) element.style.transform = bool ? "initial" : "";
	elements.chatInput.style.display = "initial";
	elements.paletteBg.style.visibility = bool ? "" : "hidden";
	elements.helpButton.style.visibility = bool ? "" : "hidden";
	elements.topRightDisplays.classList[bool ? 'remove' : 'add']('hideui');
	elements.topLeftDisplays.classList[bool ? 'remove' : 'add']('hideui');
	elements.paletteBg.classList[bool ? 'remove' : 'add']('hideui');
	elements.pBucketDisplay.textContent = `Place bucket: ${net.protocol.placeBucket.allowance.toFixed(1)} (${net.protocol.placeBucket.rate}/${net.protocol.placeBucket.time}s).`;
}

function showLoadScr(bool, showOptions) {
	elements.loadOptions.className = showOptions ? "framed" : "hide";
	if (!bool) {
		elements.loadScr.style.transform = "translateY(-110%)"; /* +10% for shadow */
		eventOnce(elements.loadScr, "transitionend webkitTransitionEnd oTransitionEnd msTransitionEnd",
			() => {
				if (net.isConnected()) {
					elements.loadScr.className = "hide";
				}
			});
	} else {
		elements.loadScr.className = "";
		elements.loadScr.style.transform = "";
	}
}

function statusMsg(showSpinner, message) {
	const statusShown = elements.status.isConnected;
	if (message === null) {
		elements.status.style.display = "none";
		return;
	} else {
		elements.status.style.display = "";
	}
	elements.statusMsg.innerHTML = message;
	elements.spinner.style.display = showSpinner ? "" : "none";
}

function inGameDisconnected() {
	showWorldUI(false);
	showLoadScr(true, true);
	if(!statusSet) statusMsg(false, "Lost connection with the server.");
	misc.world = null;
	elements.chat.style.transform = "initial";
	elements.chatInput.style.display = "";
}

export function retryingConnect(serverGetter, worldName, token) {
	if (misc.connecting && !net.isConnected()) { /* We're already connected/trying to connect */
		return;
	}
	misc.connecting = true;
	let currentServer = serverGetter(false);
	const tryConnect = (tryN) => {
		if (tryN >= (currentServer.maxRetries || 3)) {
			let ncs = serverGetter(true);
			if (ncs != currentServer) {
				currentServer = ncs;
				tryN = 0;
			}
		}
		eventSys.once(e.net.connecting, () => {
			console.debug(`Trying '${currentServer.title}'...`)
			statusMsg(true, `Connecting to '${currentServer.title}'...`);
			showLoadScr(true, false);
		});
		net.connect(currentServer, worldName, token);
		const disconnected = () => {
			++tryN;
			statusMsg(true, `Couldn't connect to server${tryN >= 5 ? ". Your IP may have been flagged as a proxy (or banned). Proxies are disallowed on OWOP due to bot abuse, sorry. R" : ", r"}etrying... (${tryN})`);
			setTimeout(tryConnect, Math.min(tryN * 2000, 10000), tryN);
			eventSys.removeListener(e.net.connected, connected);
		};
		const connected = () => {
			statusMsg(false, "Connected!");
			eventSys.removeListener(e.net.disconnected, disconnected);
			eventSys.once(e.net.disconnected, inGameDisconnected);
			misc.connecting = false;
			// net.protocol.placeBucket.update();
		};

		eventSys.once(e.net.connected, connected);
		eventSys.once(e.net.disconnected, disconnected);
	};
	tryConnect(0);
}

function saveWorldPasswords() {
	if (misc.storageEnabled) {
		misc.localStorage.worldPasswords = JSON.stringify(misc.worldPasswords);
	}
}

function checkFunctionality(callback) {
	/* Multi Browser Support */
	window.requestAnimationFrame =
		window.requestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function (f) {
			setTimeout(f, 1000 / options.fallbackFps);
		};

	Number.isInteger = Number.isInteger || (n => Math.floor(n) === n && Math.abs(n) !== Infinity);
	Math.trunc = Math.trunc || (n => n | 0);

	let toBlob = HTMLCanvasElement.prototype.toBlob = HTMLCanvasElement.prototype.toBlob || HTMLCanvasElement.prototype.msToBlob;

	if (!toBlob) { /* Load toBlob polyfill */
		loadScript(require('./polyfill/canvas-toBlob.js'), callback);
	} else {
		callback();
	}
}

function init() {
	let viewport = elements.viewport;
	let chatinput = elements.chatInput;

	if (misc.storageEnabled && misc.localStorage.worldPasswords) {
		try {
			misc.worldPasswords = JSON.parse(misc.localStorage.worldPasswords);
		} catch (e) { }
	}

	misc.lastCleanup = 0;

	viewport.oncontextmenu = () => false;

	viewport.addEventListener("mouseenter", () => {
		mouse.insideViewport = true;
		updateClientFx();
	});
	viewport.addEventListener("mouseleave", () => {
		mouse.insideViewport = false;
		updateClientFx();
	});

	let chatHistory = [];
	let historyIndex = 0;
	chatinput.addEventListener("keydown", event => {
		event.stopPropagation();
		let keyCode = event.which || event.keyCode;
		if (historyIndex === 0 || keyCode == 13 && !event.shiftKey) {
			chatHistory[0] = chatinput.value;
		}
		switch (keyCode) {
			case 27:
				closeChat();
				break;
			case 13:
				if (!event.shiftKey) {
					event.preventDefault();
					let text = chatinput.value;
					historyIndex = 0;
					chatHistory.unshift(text);
					if (misc.storageEnabled) {
						// if (text.startsWith("/adminlogin ")) {
							// misc.localStorage.adminlogin = text.slice(12);
						// } else if (text.startsWith("/modlogin ")) {
							// misc.localStorage.modlogin = text.slice(10);
						// } if (text.startsWith("/nick")) {
						// 	let nick = text.slice(6);
						// 	if (nick.length) {
						// 		misc.localStorage.nick = nick;
						// 	} else {
						// 		delete misc.localStorage.nick;
						// 	}
						// } 
						// if (text.startsWith("/pass ") && misc.world) {
						// 	let pass = text.slice(6);
						// 	misc.worldPasswords[net.protocol.worldName] = pass;
						// 	saveWorldPasswords();
						// }
					}
					if (!event.ctrlKey) {
						text = misc.chatSendModifier(text);
					}
					net.protocol.sendMessage(text);
					chatinput.value = '';
					chatinput.style.height = "16px";
					event.stopPropagation();
				}
				break;
			case 38: // Arrow up
				if (event.shiftKey && historyIndex < chatHistory.length - 1) {
					historyIndex++;
					chatinput.value = chatHistory[historyIndex];
					chatinput.style.height = 0;
					chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
				}
				break;
			case 40: // Arrow Down
				if (event.shiftKey && historyIndex > 0) {
					historyIndex--;
					chatinput.value = chatHistory[historyIndex];
					chatinput.style.height = 0;
					chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
				}
				break;
		}
	});
	chatinput.addEventListener("keyup", event => {
		event.stopPropagation();
		let keyCode = event.which || event.keyCode;
		if (keyCode == 13 && !event.shiftKey) {
			closeChat();
		}
	})
	chatinput.addEventListener("input", event => {
		chatinput.style.height = 0;
		chatinput.style.height = Math.min(chatinput.scrollHeight - 8, 16 * 4) + "px";
	});
	chatinput.addEventListener("focus", event => {
		if (!mouse.buttons) {
			openChat();
		} else {
			chatinput.blur();
		}
	});

	window.addEventListener("keydown", event => {
		let keyCode = event.which || event.keyCode;
		if (document.activeElement.tagName !== "INPUT" && misc.world !== null) {
			keysDown[keyCode] = true;
			let tool = player.tool;
			if (tool !== null && misc.world !== null && tool.isEventDefined('keydown')) {
				if (tool.call('keydown', [keysDown, event])) {
					return false;
				}
			}
			switch (keyCode) {
				case KeyCode.q: /* P */
					player.tool = "pipette";
					break;

				case KeyCode.b: /* O */
					player.tool = "cursor";
					break;

				case KeyCode.v: /* M */
				case KeyCode.shift: /* Shift */
					player.tool = "move";
					break;

				case KeyCode.f:
					player.tool = "fill";
					break;

				case KeyCode.t:
					player.tool = "line";
					break;

				case KeyCode.x:
					player.tool = "zoom";
					break;

				case KeyCode.r:
					player.tool = "rect";
					break;

				case KeyCode.c:
					player.tool = "circle";
					break;

				case KeyCode.e:
					player.tool = "export";
					break;

				case KeyCode.w:
					player.tool = "protect";
					break;

				case KeyCode.three:
					player.tool = "area protect";
					break;

				case KeyCode.one:
					player.tool = "copy";
					break;

				case KeyCode.two:
					player.tool = "paste";
					break;

				case KeyCode.a:
					player.tool = "eraser";
					break;

				case KeyCode.z: /* Ctrl + Z */
					if (!event.ctrlKey || !misc.world) {
						break;
					}
					if(event.shiftKey) PM.redo(event.altKey);
					else PM.undo(event.altKey);
					event.preventDefault();
					break;

				case KeyCode.backtick: /* F */
					let parseClr = clr => {
						let tmp = clr.split(',');
						let nrgb = null;
						if (tmp.length == 3) {
							nrgb = tmp;
							for (let i = 0; i < tmp.length; i++) {
								tmp[i] = +tmp[i];
								if (!(tmp[i] >= 0 && tmp[i] < 256)) {
									return null;
								}
							}
						} else if (clr[0] == '#' && clr.length == 7) {
							let colr = parseInt(clr.replace('#', '0x'));
							/* The parsed HTML color doesn't have red as the first byte, so invert it. */
							nrgb = [colr >> 16 & 0xFF, colr >> 8 & 0xFF, colr & 0xFF];
						}
						return nrgb;
					}
					let input = prompt("Custom color\nType three values separated by a comma: r,g,b\n(...or the hex string: #RRGGBB)\nYou can add multiple colors at a time separating them with a space.");
					if (!input) {
						break;
					}
					input = input.split(' ');
					for (let j = 0; j < input.length; j++) {
						let rgb = parseClr(input[j]);
						if (rgb) {
							player.selectedColor = rgb;
						}
					}

					break;

				case 71: /* G */
					renderer.showGrid(!renderer.gridShown);
					break;

				case 72: /* H */
					options.showProtectionOutlines = !options.showProtectionOutlines;
					renderer.render(renderer.rendertype.FX);
					break;

				case 112: /* F1 */
					showWorldUI(!misc.guiShown);
					event.preventDefault();
					break;

				case 113: /* F2 */
					options.showPlayers = !options.showPlayers;
					renderer.render(renderer.rendertype.FX);
					break;

				case 107:
				case 187:
					++camera.zoom;
					break;

				case 109:
				case 189:
					--camera.zoom;
					break;

				default:
					return true;
					break;
			}
			return false;
		}
	});
	window.addEventListener("keyup", event => {
		let keyCode = event.which || event.keyCode;
		delete keysDown[keyCode];
		if (document.activeElement.tagName !== "INPUT") {
			let tool = player.tool;
			if (tool !== null && misc.world !== null && tool.isEventDefined('keyup')) {
				if (tool.call('keyup', [keysDown, event])) {
					return false;
				}
			}
			if (keyCode == 13) {
				elements.chatInput.focus();
			} else if (keyCode == 16) {
				player.tool = "cursor";
			}
		}
	});
	viewport.addEventListener("mousedown", event => {
		closeChat();
		mouse.lastX = mouse.x;
		mouse.lastY = mouse.y;
		mouse.x = event.pageX;
		mouse.y = event.pageY;
		mouse.mouseDownWorldX = mouse.worldX;
		mouse.mouseDownWorldY = mouse.worldY;
		if ('buttons' in event) {
			mouse.buttons = event.buttons;
		} else {
			let realBtn = event.button;
			if (realBtn === 2) {
				realBtn = 1;
			} else if (realBtn === 1) {
				realBtn = 2;
			}
			mouse.buttons |= 1 << realBtn;
		}

		let tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mousedown', [mouse, event]);
		}
	});

	window.addEventListener("mouseup", event => {
		/* Old versions of firefox have the buttons property as the
		 * buttons released, instead of the currently pressed buttons.
		 **/
		if ('buttons' in event && !misc.usingFirefox) {
			mouse.buttons = event.buttons;
		} else {
			let realBtn = event.button;
			if (realBtn === 2) {
				realBtn = 1;
			} else if (realBtn === 1) {
				realBtn = 2;
			}
			mouse.buttons &= ~(1 << realBtn);
		}
		let tool = player.tool;
		if (tool !== null && misc.world !== null) {
			player.tool.call('mouseup', [mouse, event]);
		}
	});

	window.addEventListener("mousemove", event => {
		let cancelledButtons = updateMouse(event, 'mousemove', event.pageX, event.pageY);
		let remainingButtons = mouse.buttons & ~cancelledButtons;
		if (remainingButtons & 0b100) { /* If middle click was not used for anything */
			moveCameraBy((mouse.mouseDownWorldX - mouse.worldX) / 16, (mouse.mouseDownWorldY - mouse.worldY) / 16);
		}
	});

	const mousewheel = event => {
		const nevt = normalizeWheel(event);
		if (player.tool !== null && misc.world !== null && player.tool.isEventDefined('scroll')) {
			if (player.tool.call('scroll', [mouse, nevt, event])) {
				return;
			}
		}
		if (event.ctrlKey) {
			camera.zoom += Math.max(-1, Math.min(1, -nevt.pixelY));
			//-nevt.spinY * camera.zoom / options.zoomLimitMax; // <- needs to be nicer
		} else {
			let delta = Math.max(-1, Math.min(1, nevt.spinY));
			let pIndex = player.paletteIndex;
			if (delta > 0) {
				pIndex++;
			} else if (delta < 0) {
				pIndex--;
			}
			player.paletteIndex = pIndex;
		}
	};

	let wheelEventName = ('onwheel' in document) ? 'wheel' : ('onmousewheel' in document) ? 'mousewheel' : 'DOMMouseScroll';

	viewport.addEventListener(wheelEventName, mousewheel, { passive: true });
	viewport.addEventListener(wheelEventName, e => {
		e.preventDefault();
		return false;
	}, { passive: false });

	// Touch support
	const touchEventNoUpdate = evtName => event => {
		let tool = player.tool;
		mouse.buttons = 0;
		if (tool !== null && misc.world !== null) {
			player.tool.call(evtName, [mouse, event]);
		}
	};
	viewport.addEventListener("touchstart", event => {
		let moved = event.changedTouches[0];
		mouse.buttons = 1;
		if (moved) {
			updateMouse(event, 'touchstart', moved.pageX, moved.pageY);
			mouse.mouseDownWorldX = mouse.worldX;
			mouse.mouseDownWorldY = mouse.worldY;
		}
	}, { passive: true });
	viewport.addEventListener("touchmove", event => {
		let moved = event.changedTouches[0];
		if (moved) {
			updateMouse(event, 'touchmove', moved.pageX, moved.pageY);
		}
	}, { passive: true });
	viewport.addEventListener("touchend", touchEventNoUpdate('touchend'), { passive: true });
	viewport.addEventListener("touchcancel", touchEventNoUpdate('touchcancel'), { passive: true });

	elements.soundToggle.addEventListener('change', e => {
		options.enableSounds = !elements.soundToggle.checked;
	});
	options.enableSounds = !elements.soundToggle.checked;

	elements.hexToggle.addEventListener('change', e => {
		options.hexCoords = elements.hexToggle.checked;
	});
	options.hexCoords = elements.hexToggle.checked;

	// Some cool custom css
	console.log("%c" +
		" _ _ _         _   _    _____ ___    _____ _         _     \n" +
		"| | | |___ ___| |_| |  |     |  _|  |  _  |_|_ _ ___| |___ \n" +
		"| | | | . |  _| | . |  |  |  |  _|  |   __| |_'_| -_| |_ -|\n" +
		"|_____|___|_| |_|___|  |_____|_|    |__|  |_|_,_|___|_|___|",
		"font-size: 15px; font-weight: bold;"
	);
	console.log("%cWelcome to the developer console!", "font-size: 20px; font-weight: bold; color: #F0F;");

	//windowSys.addWindow(new OWOPDropDown());
	resolveProtocols();

	/* Calls other initialization functions */
	eventSys.emit(e.init);

	updateXYDisplay(0, 0);

	let worldName = decodeURIComponent(window.location.pathname);
	if (worldName[0] === '/') {
		worldName = worldName.slice(1);
	}

	misc.urlWorldName = worldName;
}

function connect() {
	const serverGetter = (serverList => {
		let defaults = [];
		let availableServers = [];
		for (let i = 0; i < serverList.length; i++) {
			if (serverList[i].default) {
				defaults.push(serverList[i]);
			}
			availableServers.push(serverList[i]);
		}
		let index = 0;
		return (next) => {
			if (next) {
				if (defaults.length) {
					defaults.shift();
				} else {
					++index;
				}
			}
			if (defaults.length) {
				let sv = defaults[0];
				availableServers.push(sv);
				return sv;
			}
			return availableServers[index % availableServers.length];
		};
	})(options.serverAddress);

	retryingConnect(serverGetter, misc.urlWorldName);

	elements.reconnectBtn.onclick = () => retryingConnect(serverGetter, misc.urlWorldName);

	misc.tickInterval = setInterval(tick, 1000 / options.tickSpeed);
	//delete window.localStorage;
}

eventSys.once(e.loaded, () => statusMsg(true, "Initializing..."));
eventSys.once(e.misc.loadingCaptcha, () => statusMsg(true, "Trying to load captcha..."));
eventSys.once(e.misc.logoMakeRoom, () => {
	statusMsg(false, null);
	logoMakeRoom();
});

eventSys.once(e.loaded, function () {
	init();
	if (misc.showEUCookieNag) {
		windowSys.addWindow(new UtilDialog('Cookie notice',
			`This box alerts you that we're going to use cookies!
If you don't accept their usage, disable cookies and reload the page.`, false, () => {
			setCookie('nagAccepted', 'true');
			misc.showEUCookieNag = false;
			logoMakeRoom(false);
			connect();
		}));
	} else {
		connect();
	}
});

eventSys.on(e.net.maxCount, count => {
	misc.world.maxCount = count;
	updatePlayerCount();
});

eventSys.on(e.net.playerCount, count => {
	misc.playerCount = count;
	updatePlayerCount();
});

eventSys.on(e.net.donUntil, (ts, pmult) => {
	const updTimer = () => {
		const now = Date.now();

		const secs = Math.floor(Math.max(0, ts - now) / 1000);
		const mins = Math.floor(secs / 60);
		const hours = Math.floor(mins / 60);
		let tmer = (hours > 0 ? hours + ':' : '')
			+ ((mins % 60) < 10 ? '0' : '') + (mins % 60) + ':'
			+ ((secs % 60) < 10 ? '0' : '') + (secs % 60);
		// elements.dInfoDisplay.setAttribute("data-tmo", tmer);

	};

	clearInterval(misc.donTimer);
	// elements.dInfoDisplay.setAttribute("data-pm", ''+pmult);
	// elements.dInfoDisplay.setAttribute("data-ts", ''+ts);
	updTimer();
	if (ts > Date.now()) {
		misc.donTimer = setInterval(updTimer, 1000);
	}
});

eventSys.on(e.net.chat, receiveMessage);
eventSys.on(e.net.devChat, receiveDevMessage);

eventSys.on(e.net.world.setId, id => {
	if (!misc.storageEnabled) {
		return;
	}

	// function autoNick() {
	// 	if (misc.localStorage.nick) {
	// 		net.protocol.sendMessage("/nick " + misc.localStorage.nick);
	// 	}
	// }

	// Automatic login
	// let desiredRank = misc.localStorage.adminlogin ? RANK.ADMIN : misc.localStorage.modlogin ? RANK.MODERATOR : net.protocol.worldName in misc.worldPasswords ? RANK.USER : RANK.NONE;
	let desiredRank =
	misc.localStorage.ownerlogin ? RANK.OWNER : misc.localStorage.devlogin ? RANK.DEVELOPER : misc.localStorage.adminlogin ? RANK.ADMIN : misc.localStorage.modlogin ? RANK.MODERATOR : net.protocol.worldName in misc.worldPasswords ? RANK.USER : RANK.NONE;
	if (desiredRank > RANK.NONE) {
		let mightBeMod = false;
		let onWrong = function () {
			console.log("WRONG");
			eventSys.removeListener(e.net.sec.rank, onCorrect);
			if (desiredRank == RANK.OWNER) {
				delete misc.localStorage.ownerlogin;
			} else if (desiredRank == RANK.DEVELOPER) {
				delete misc.localStorage.devlogin;
			} else if (desiredRank == RANK.ADMIN) {
				delete misc.localStorage.adminlogin;
			} else if (desiredRank == RANK.MODERATOR) {
				delete misc.localStorage.modlogin;
			} else if (desiredRank == RANK.USER) {
				delete misc.worldPasswords[net.protocol.worldName];
				saveWorldPasswords();
			}
			retryingConnect(() => net.currentServer, net.protocol.worldName)
		};
		let onCorrect = function (newrank) {
			console.log("yeppers")
			// console.log(newrank);
			// console.log(desiredRank);
			if((mightBeMod && (newrank==RANK.ADMIN||newrank==RANK.MODERATOR))||!mightBeMod&&newrank==desiredRank){
				eventSys.removeListener(e.net.disconnected, onWrong);
				eventSys.removeListener(e.net.sec.rank, onCorrect);
				// autoNick();
			}
			// if (newrank == desiredRank || (mightBeMod && (newrank == RANK.MODERATOR || newrank == RANK.ADMIN))) {
			// 	eventSys.removeListener(e.net.disconnected, onWrong);
			// 	// setTimeout(() => {
			// 	// 	/* Ugly fix for wrong password on worlds without one */
					
			// 	// }, 1000);
			// 	eventSys.removeListener(e.net.sec.rank, onCorrect);
			// 	autoNick();
			// }
		};
		eventSys.once(e.net.disconnected, onWrong);
		eventSys.on(e.net.sec.rank, onCorrect);
		let msg;
		if (desiredRank == RANK.OWNER) {
			msg = "/adminlogin " + misc.localStorage.ownerlogin;
		} else if (desiredRank == RANK.DEVELOPER) {
			msg = "/adminlogin " + misc.localStorage.devlogin;
		} else if (desiredRank == RANK.ADMIN) {
			msg = "/adminlogin " + misc.localStorage.adminlogin;
		} else if (desiredRank == RANK.MODERATOR) {
			msg = "/modlogin " + misc.localStorage.modlogin;
		} else if (desiredRank == RANK.USER) {
			msg = "/pass " + misc.worldPasswords[net.protocol.worldName];
			mightBeMod = true;
		}
		net.protocol.sendMessage(msg);
	} else {
		// autoNick();
	}
});

eventSys.on(e.misc.windowAdded, window => {
	if (misc.world === null) {
		statusMsg(false, null);
		logoMakeRoom(true);
	}
});

eventSys.on(e.net.world.joining, name => {
	logoMakeRoom(false);
	console.log(`Joining world: ${name}`);
});

eventSys.on(e.net.world.join, world => {
	showLoadScr(false, false);
	showWorldUI(!options.noUi);
	renderer.showGrid(!options.noUi);
	sounds.play(sounds.launch);
	misc.world = new World(world);
	eventSys.emit(e.misc.worldInitialized);
});

eventSys.on(e.net.connected, () => {
	clearChat();
});

eventSys.on(e.camera.moved, camera => {
	let time = getTime();
	if (misc.world !== null && time - misc.lastCleanup > 1000) {
		misc.lastCleanup = time;
		renderer.unloadFarClusters();
	}
	if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
		updateClientFx();
	}
});

eventSys.on(e.camera.zoom, camera => {
	if (updateXYDisplay(mouse.tileX, mouse.tileY)) {
		updateClientFx();
	}
});

eventSys.on(e.misc.secondaryColorSet, () => {
	elements.secondaryColor.style.backgroundColor = colorUtils.toHTML(colorUtils.u24_888(...player.secondaryColor));
});

window.addEventListener("error", e => {
	showDevChat(true);
	let errmsg = e && e.error ? (e.error.message || e.error.stack) : e.message || "Unknown error occurred";
	errmsg = escapeHTML(errmsg);
	errmsg = errmsg.split('\n');
	for (let i = 0; i < errmsg.length; i++) {
		/* Should be some kind of dissapearing notification instead */
		receiveDevMessage(errmsg[i]);
	}
	if (player.rank !== RANK.ADMIN) { /* TODO */
		if (misc.exceptionTimeout) {
			clearTimeout(misc.exceptionTimeout);
		}
		misc.exceptionTimeout = setTimeout(() => showDevChat(false), 5000);
	}
});

window.addEventListener("load", () => {
	elements.loadScr = document.getElementById("load-scr");
	elements.loadUl = document.getElementById("load-ul");
	elements.loadOptions = document.getElementById("load-options");
	elements.reconnectBtn = document.getElementById("reconnect-btn");
	elements.topLeftDisplays = document.getElementById("topleft-displays");
	elements.spinner = document.getElementById("spinner");
	elements.statusMsg = document.getElementById("status-msg");
	elements.status = document.getElementById("status");
	elements.logo = document.getElementById("logo");

	elements.noticeDisplay = document.getElementById("notice-display");
	console.log("dismissed id: ", misc.localStorage.dismissedId);
	if(misc.localStorage.dismissedId!=noticeId) elements.noticeDisplay.addEventListener("click", dismissNotice);
	else elements.noticeDisplay.style.display = 'none';

	elements.secondaryColor = document.getElementById("secondary-color");
	elements.xyDisplay = document.getElementById("xy-display");
	elements.pBucketDisplay = document.getElementById("pbucket-display");
	elements.devChat = document.getElementById("dev-chat");
	elements.chat = document.getElementById("chat");
	elements.devChatMessages = document.getElementById("dev-chat-messages");
	elements.chatMessages = document.getElementById("chat-messages");
	elements.playerCountDisplay = document.getElementById("playercount-display");
	elements.topRightDisplays = document.getElementById("topright-displays");
	elements.dInfoDisplay = document.getElementById("dinfo-display");
	elements.rankDisplay = document.getElementById("rank-display");

	elements.palette = document.getElementById("palette");
	elements.paletteColors = document.getElementById("palette-colors");
	elements.paletteCreate = document.getElementById("palette-create");
	elements.paletteInput = document.getElementById("palette-input");
	elements.paletteBg = document.getElementById("palette-bg");

	elements.animCanvas = document.getElementById("animations");
	elements.loginButton = document.getElementById("login-button");

	elements.viewport = document.getElementById("viewport");
	elements.windows = document.getElementById("windows");

	elements.chatInput = document.getElementById("chat-input");

	elements.soundToggle = document.getElementById("no-sound");
	elements.hexToggle = document.getElementById("hex-coords");

	elements.helpButton = document.getElementById("help-button");

	let donateBtn = document.getElementById("donate-button");
	elements.helpButton.addEventListener("click", function () {
		document.getElementById("help").className = "";
		// donateBtn.innerHTML = "";

		// window.PayPal.Donation.Button({
		// 	env: 'production',
		// 	hosted_button_id: 'HLLU832GVG824',
		// 	custom: 'g=owop&w=' + (misc.world ? encodeURIComponent(misc.world.name) : 'main') + '&i=' + (net.protocol ? net.protocol.id : 0),
		// 	image: {
		// 		src: donateBtn.getAttribute("data-isrc"),
		// 		alt: 'Donate with PayPal button',
		// 		title: 'PayPal - The safer, easier way to pay online!',
		// 	}
		// }).render('#donate-button');
	});

	document.getElementById("help-close").addEventListener("click", function () {
		document.getElementById("help").className = "hidden";
	});

	checkFunctionality(() => eventSys.emit(e.loaded));

	setInterval(()=>{
		let pb = net.protocol.placeBucket;
		pb.update();
		elements.pBucketDisplay.textContent = `Place bucket: ${pb.allowance.toFixed(1)} (${pb.rate}/${pb.time}s).`;
	}, 100);
});


/* Public API definitions */
PublicAPI.emit = eventSys.emit.bind(eventSys);
PublicAPI.on = eventSys.on.bind(eventSys);
PublicAPI.once = eventSys.once.bind(eventSys);
PublicAPI.removeListener = eventSys.removeListener.bind(eventSys);
PublicAPI.elements = elements;
PublicAPI.mouse = mouse;
PublicAPI.world = getNewWorldApi();
PublicAPI.chat = {
	send: (msg) => net.protocol && net.protocol.sendMessage(msg),
	clear: clearChat,
	local: receiveMessage,
	get onDevMsg() { return misc.devRecvReader; },
	set onDevMsg(fn) { misc.devRecvReader = fn; },
	get postFormatRecvModifier() { return misc.chatPostFormatRecvModifier; },
	set postFormatRecvModifier(fn) { misc.chatPostFormatRecvModifier = fn; },
	get recvModifier() { return misc.chatRecvModifier; },
	set recvModifier(fn) { misc.chatRecvModifier = fn; },
	get sendModifier() { return misc.chatSendModifier; },
	set sendModifier(fn) { misc.chatSendModifier = fn; }
};
PublicAPI.sounds = sounds;
PublicAPI.poke = () => {
	if (net.protocol) {
		net.protocol.lastSentX = Infinity;
	}
};
PublicAPI.muted = [];