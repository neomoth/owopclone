"use strict";

import { EVENTS as e, AnnoyingAPI as aa } from "../conf.js";
import { eventSys } from "../util.js";

export class Protocol {
	constructor(ws) {
		this.ws = ws;
		this.lasterr = null;
	}

	hookEvents(subClass) {
		this.ws.addEventListener('message', subClass.messageHandler.bind(subClass));
		this.ws.addEventListener('open', subClass.openHandler.bind(subClass));
		this.ws.addEventListener('close', subClass.closeHandler.bind(subClass));
		this.ws.addEventListener('error', subClass.errorHandler.bind(subClass));
	}

	isConnected() {
		return this.ws.readyState === aa.ws.OPEN;
	}

	openHandler() {
		eventSys.emit(e.net.connected);
	}

	errorHandler(err) {
		this.lasterr = err;
	}

	closeHandler() {
		eventSys.emit(e.net.disconnected);
	}

	messageHandler(message) { }
	joinWorld(name) { }
	requestChunk(x, y) { }
	updatePizel(x, y, rgb) { }
	sendUpdates() { }
	sendMessage(str) { }
}