#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const destImg = path.join(__dirname, '..', 'static', 'img');
const destLanding = path.join(destImg, 'landing');
const srcRoot = process.argv[2];

if (!srcRoot) {
  console.error('usage: place-landing-screenshots.mjs <source-dir>');
  process.exit(1);
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const next = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(next, acc);
    else acc.push(next);
  }
  return acc;
}

fs.mkdirSync(destLanding, {recursive: true});
const files = walk(srcRoot).filter((file) => file.endsWith('.png'));
if (files.length === 0) {
  console.error(`No PNG files under ${srcRoot}`);
  process.exit(1);
}

let hero = 0;
let landing = 0;
for (const file of files) {
  const base = path.basename(file);
  if (base === 'code.png') {
    fs.copyFileSync(file, path.join(destImg, 'code.png'));
    hero += 1;
    continue;
  }
  fs.copyFileSync(file, path.join(destLanding, base));
  landing += 1;
}

console.log(
  `Placed ${hero} hero PNG and ${landing} landing PNG(s) from ${srcRoot} into ${destImg}`,
);
