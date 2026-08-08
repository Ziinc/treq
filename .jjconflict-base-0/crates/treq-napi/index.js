/* eslint-disable */
'use strict';

const { platform, arch } = process;

const platformMap = {
  'darwin-arm64': 'treq-napi.darwin-arm64.node',
  'darwin-x64': 'treq-napi.darwin-x64.node',
  'linux-x64': 'treq-napi.linux-x64-gnu.node',
  'win32-x64': 'treq-napi.win32-x64-msvc.node',
};

const key = `${platform}-${arch}`;
const binding = platformMap[key];

if (!binding) {
  throw new Error(`treq-napi: unsupported platform ${key}`);
}

const path = require('path');
module.exports = require(path.join(__dirname, binding));
