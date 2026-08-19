#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..');
const names = JSON.parse(
  fs.readFileSync(path.join(webRoot, 'src', 'data', 'landing-screenshots.json'), 'utf8'),
);
const buildImg = path.join(webRoot, 'build', 'img');
const missing = [];
if (!fs.existsSync(path.join(buildImg, 'code.png'))) {
  missing.push('img/code.png');
}
for (const name of names) {
  if (!fs.existsSync(path.join(buildImg, 'landing', name))) {
    missing.push(`img/landing/${name}`);
  }
}
if (missing.length > 0) {
  console.error(`Missing from Docusaurus build:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`Landing screenshots in build: ${names.length}`);
console.log('build/img:', fs.readdirSync(buildImg).join(', '));
console.log('build/img/landing:', fs.readdirSync(path.join(buildImg, 'landing')).join(', '));
