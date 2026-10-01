'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const addon = require(path.join(__dirname, 'haze-glass.node'));

assert.deepEqual(Object.getOwnPropertyNames(addon).sort(), ['configure', 'create', 'destroy', 'status', 'test', 'tick']);
assert.equal(addon.create(Buffer.alloc(4)), -2147024809); // E_INVALIDARG
assert.equal(addon.configure(0, 0, 20, 20, [0, 0, 20, 0, 20, 20], 3, 1), -2147024890); // E_HANDLE
assert.deepEqual(addon.tick(), { error: -2147024890, frames: 0 });
assert.equal(addon.test(), -2147024890);
assert.deepEqual(addon.status(), { error: 0, frames: 0, created: 0 });
addon.destroy();
console.log('native-glass smoke: exports and no-instance validation passed');
