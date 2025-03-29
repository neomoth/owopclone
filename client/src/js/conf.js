"use strict";
// a bunch of pre defined variables either dynamic/static or otherwise usable by all other files in the codebase
import { eventSys, propertyDefaults, getTime, cookiesEnabled, storageEnabled, absMod, escapeHTML, mkHTML, setTooltip, waitFrames, line, loadScript, getDefaultWorld, getCookie } from "./util.js";
import toolSet from "../img/toolset.png";
import unloadedPat from "../img/unloaded.png";
import launchSoundUrl from "../audio/launch.mp3";
import placeSoundUrl from "../audio/place.mp3";
import clickSoundUrl from "../audio/click.mp3";

export const cameraValues = {
	x: 0,
	y: 0,
	zoom: -1
}

export const camera = {
	get x() { return cameraValues.x; },
	get y() { return cameraValues.y; },
	get zoom() { return cameraValues.zoom; },
}

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

export const activeFx = [];

export let protocol = null;

let evtId = 0;

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

export const keysDown = {};

export const RANK = {
	NONE: 0,
	USER: 1,
	// DONOR: 2,
	ARTIST: 2,
	MODERATOR: 3,
	ADMIN: 4,
	DEVELOPER: 5,
	OWNER: 6,
};

export const EVENTS = {
	loaded: ++evtId,
	init: ++evtId,
	tick: ++evtId,
	misc: {
		toolsRendered: ++evtId,
		toolsInitialized: ++evtId,
		logoMakeRoom: ++evtId,
		worldInitialized: ++evtId,
		windowAdded: ++evtId,
		windowClosed: ++evtId,
		captchaToken: ++evtId,
		loadingCaptcha: ++evtId,
		secondaryColorSet: ++evtId,
	},
	renderer: {
		addChunk: ++evtId,
		rmChunk: ++evtId,
		updateChunk: ++evtId,
	},
	camera: {
		moved: ++evtId,
		zoom: ++evtId,
	},
	net: {
		connecting: ++evtId,
		connected: ++evtId,
		disconnected: ++evtId,
		playerCount: ++evtId,
		chat: ++evtId,
		devChat: ++evtId,
		world: {
			leave: ++evtId,
			join: ++evtId,
			joining: ++evtId,
			setId: ++evtId,
			playersMoved: ++evtId,
			playersLeft: ++evtId,
			tilesUpdated: ++evtId,
			teleported: ++evtId,
		},
		chunk: {
			load: ++evtId,
			unload: ++evtId,
			set: ++evtId,
			lock: ++evtId,
			allLoaded: ++evtId,
		},
		sec: {
			rank: ++evtId,
		},
		maxCount: ++evtId,
		donUntil: ++evtId,
	}
};

export const PUBLIC_EVENTS = {
	loaded: EVENTS.loaded,
	init: EVENTS.init,
	tick: EVENTS.tick,
	toolsInitialized: EVENTS.misc.toolsInitialized,
	allChunksLoaded: EVENTS.net.chunk.allLoaded,
	camMoved: EVENTS.camera.moved,
	camZoomed: EVENTS.camera.zoom,
	chat: EVENTS.net.chat,
	joinedWorld: EVENTS.net.world.join,
	leftWorld: EVENTS.net.world.leave,
	connnecting: EVENTS.net.connecting,
	connected: EVENTS.net.connected,
	disconnected: EVENTS.net.disconnected,
};

export const PublicAPI = window.NWOP = window.WorldOfPixels = {
	RANK: RANK,
	events: PUBLIC_EVENTS,
	util: {
		getTime,
		cookiesEnabled,
		storageEnabled,
		absMod,
		escapeHTML,
		mkHTML,
		setTooltip,
		waitFrames,
		line,
		loadScript
	}
};

export const cursors = PublicAPI.cursors = {
	set: new Image(),
	cursor: { imgpos: [0, 0], hotspot: [0, 0] },
	move: { imgpos: [1, 0], hotspot: [18, 18] },
	pipette: { imgpos: [0, 1], hotspot: [0, 28] },
	erase: { imgpos: [0, 2], hotspot: [4, 26] },
	zoom: { imgpos: [1, 2], hotspot: [19, 10] },
	fill: { imgpos: [1, 1], hotspot: [3, 29] },
	brush: { imgpos: [0, 3], hotspot: [0, 26] },
	select: { imgpos: [2, 0], hotspot: [0, 0] }, // needs better hotspot
	selectprotect: { imgpos: [4, 0], hotspot: [0, 0] },
	copy: { imgpos: [3, 0], hotspot: [0, 0] }, // and this
	paste: { imgpos: [3, 1], hotspot: [0, 0] }, // this too
	cut: { imgpos: [3, 2], hotspot: [11, 5] },
	wand: { imgpos: [3, 3], hotspot: [0, 0] },
	circle: { imgpos: [4, 3], hotspot: [0, 0] },
	rect: { imgpos: [4, 2], hotspot: [0, 0] },
	write: { imgpos: [0, 3], hotspot: [0, 0] },
	shield: { imgpos: [2, 3], hotspot: [18, 18] },
	kick: { imgpos: [2, 1], hotspot: [3, 6] },
	ban: { imgpos: [2, 2], hotspot: [10, 4] },
	write: { imgpos: [1, 3], hotspot: [10, 4] } // fix hotspot
}

export const elements = {
	viewport: null,
	xyDisplay: null,
	chatInput: null,
	chat: null,
};

export function statusMsg(showSpinner, message) {
	// const statusShown = elements.status.isConnected;
	if (message === null) {
		elements.status.style.display = "none";
		return;
	} else {
		elements.status.style.display = "";
	}
	elements.statusMsg.innerHTML = message;
	elements.spinner.style.display = showSpinner ? "" : "none";
}

export const KeyCode = {
	// Alphabet
	a: 65, b: 66, c: 67, d: 68, e: 69, f: 70, g: 71, h: 72, i: 73,
	j: 74, k: 75, l: 76, m: 77, n: 78, o: 79, p: 80, q: 81, r: 82,
	s: 83, t: 84, u: 85, v: 86, w: 87, x: 88, y: 89, z: 90,

	// Numbers (Top row)
	zero: 48, one: 49, two: 50, three: 51, four: 52,
	five: 53, six: 54, seven: 55, eight: 56, nine: 57,

	// Special characters and symbols
	backtick: 192, tilde: 192, dash: 189, underscore: 189,
	equals: 187, plus: 187, leftBracket: 219, leftCurly: 219,
	rightBracket: 221, rightCurly: 221, backslash: 220, pipe: 220,
	semicolon: 186, colon: 186, quote: 222, doubleQuote: 222,
	comma: 188, lessThan: 188, period: 190, greaterThan: 190,
	slash: 191, question: 191, exclamation: 49, at: 50,
	hash: 51, dollar: 52, percent: 53, caret: 54,
	ampersand: 55, asterisk: 56, leftParen: 57, rightParen: 48,

	// Function keys
	f1: 112, f2: 113, f3: 114, f4: 115, f5: 116, f6: 117,
	f7: 118, f8: 119, f9: 120, f10: 121, f11: 122, f12: 123,

	// Control keys
	enter: 13, space: 32, escape: 27, backspace: 8, tab: 9,
	shift: 16, ctrl: 17, alt: 18, capsLock: 20, pause: 19,

	// Navigation keys
	insert: 45, home: 36, delete: 46, end: 35,
	pageUp: 33, pageDown: 34,

	// Arrow keys
	arrowUp: 38, arrowDown: 40, arrowLeft: 37, arrowRight: 39,

	// Numpad keys
	numpad0: 96, numpad1: 97, numpad2: 98, numpad3: 99,
	numpad4: 100, numpad5: 101, numpad6: 102, numpad7: 103,
	numpad8: 104, numpad9: 105,
	numpadMultiply: 106, numpadAdd: 107, numpadSubtract: 109,
	numpadDecimal: 110, numpadDivide: 111, numpadEnter: 13
};

export const AnnoyingAPI = { ws: window.WebSocket };

let userOptions = {};

if (storageEnabled()) {
	try {
		userOptions = JSON.parse(localStorage.getItem('nwopOptions') || '{}');
	} catch (e) {
		console.error('Error parsing user options.', e);
	}
}

export const options = PublicAPI.options = propertyDefaults(userOptions, {
	serverAddress: [{
		default: true,
		title: 'Official Server',
		proto: 'v1',
		url: location.hostname === 'localhost' ? `ws://localhost:8081` : location.href.replace("http", "ws"),
	}],
	fallbackFps: 30,
	maxChatBuffer: 512,
	tickSpeed: 30,
	minGridZoom: 1,
	movementSpeed: 1,
	defaultWorld: getDefaultWorld(),
	enableSounds: true,
	enableIdView: true,
	defaultZoom: 15,
	zoomStrength: 1,
	zoomLimitMin: 1,
	zoomLimitMax: 32,
	unloadDistance: 10,
	toolSetUrl: toolSet,
	unloadedPatternUrl: unloadedPat,
	noUi: false,
	backgroundUrl: null,
	hexCoords: false,
	showProtectionOutlines: true,
	showPlayers: true,
});

export const misc = PublicAPI.misc = {
	localStorage: storageEnabled() && window.localStorage,
	world: null,
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
	guiShown: false,
	cookiesEnabled: cookiesEnabled(),
	storageEnabled: storageEnabled(),
	showEUCookieNag: !options.noUi && cookiesEnabled() && getCookie('nagAccepted') !== 'true',
	usingFirefox: navigator.userAgent.indexOf('Firefox') !== -1,
	donTimer: 0
};

eventSys.on(EVENTS.net.connecting, server => {
	protocol = server.proto;
});