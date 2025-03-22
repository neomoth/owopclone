"use strict";

import { ProtocolV1 } from "./v1.js";
import { options } from "../conf.js";

export const definedProtos = {
	'v1': ProtocolV1,
};

export function resolveProtocols() {
	for (let i = 0; i < options.serverAddress.length; i++) {
		let server = options.serverAddress[i];
		server.proto = definedProtos[server.proto];
	}
}