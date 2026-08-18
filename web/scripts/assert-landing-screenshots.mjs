#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const landingDir = path.join(__dirname, '..', 'static', 'img', 'landing');
const listPath = path.join(__dirname, '..', 'src', 'data', 'landing-screenshots.json');
const files = JSON.parse(fs.readFileSync(listPath, 'utf8'));
const missing = files.filter((name) => !fs.existsSync(path.join(landingDir, name)));

if (missing.length > 0) {
  console.error(
    `Missing ${missing.length} landing screenshot(s) in ${landingDir}:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

console.log(`All ${files.length} landing screenshots present in ${landingDir}`);
