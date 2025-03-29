"use strict";

import { EVENTS as e, AnnoyingAPI as aa, misc, statusMsg, elements } from "./conf.js";
import { eventSys, eventOnce } from "./util.js";

export const net = {
	currentServer: null,
	protocol: null,
	isConnected,
	connect,
	retryingConnect,
	showLoadScr
}

function isConnected() {
	return net.protocol !== null && net.protocol.isConnected();
}

function connect(server, worldName, captcha) {
	eventSys.emit(e.net.connecting, server);
	net.connection = new aa.ws(server.url);
	net.connection.binaryType = 'arraybuffer';
	net.currentServer = server;
	net.protocol = new server.proto.class(net.connection, worldName, captcha);
}

function showLoadScr(bool, showOptions) {
    elements.loadOptions.className = showOptions ? "framed" : "hide";
    if (!bool) {
        elements.loadScr.style.transform = "translateY(-110%)"; /* +10% for shadow */
        eventOnce(elements.loadScr, "transitionend webkitTransitionEnd oTransitionEnd msTransitionEnd", () => {
            if (isConnected()) elements.loadScr.className = "hide";
        });
    } else {
        elements.loadScr.className = "";
        elements.loadScr.style.transform = "";
    }
}

function inGameDisconnected() {
	showLoadScr(true, true);
	misc.world = null;
	elements.chat.style.transform = "initial";
	elements.chatInput.style.display = "";
}

function retryingConnect(serverGetter, worldName, token) {
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
			console.debug(`Trying '${currentServer.title}'...`);
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