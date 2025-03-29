"use strict";
// no idea what this does if it does anything at all, just adding here as a "just in case" kinda thing yknow?

const types = {
	u8: (offset, isSetter) => [`.${isSetter ? 'get' : 'set'}Uint8(${offset});`, 1],
};

function makeParser(ocList) { }

function makeBuilders(ocList) { }