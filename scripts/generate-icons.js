#!/usr/bin/env node
/**
 * Generates app icons from the white-background logo with rounded corners
 *
 * Source logo dimensions: 880x880 (already square)
 * Background: white with rounded corners (r=180px)
 * Corner radius: 180px (~20% of size for nice curves)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(__dirname);

const whiteLogoPath = path.join(projectRoot, 'assets', 'logo-white.imageset', 'logo-white.svg');
const roundedLogoPath = path.join(projectRoot, 'assets', 'logo-white.imageset', 'logo-white-rounded.svg');

try {
  // Check if logo-white.svg exists
  if (!fs.existsSync(whiteLogoPath)) {
    throw new Error(`Logo file not found: ${whiteLogoPath}`);
  }

  // Read the original SVG
  let svgContent = fs.readFileSync(whiteLogoPath, 'utf-8');

  // Replace the white background rect to have rounded corners
  // Original: <rect id="logo-white" x="1.213" y="1.434" width="875" height="875" style="fill:#fff;fill-opacity:0;"/>
  // New: add rx and ry attributes for rounded corners
  svgContent = svgContent.replace(
    /<rect id="logo-white"[^>]*>/,
    '<rect id="logo-white" x="1.213" y="1.434" width="875" height="875" rx="180" ry="180" style="fill:#fff;"/>'
  );

  // Write the rounded logo SVG
  fs.writeFileSync(roundedLogoPath, svgContent, 'utf-8');

  console.log(`✓ Generated rounded logo: ${path.relative(projectRoot, roundedLogoPath)}`);
  console.log(`  Source: ${path.relative(projectRoot, whiteLogoPath)}`);
  console.log(`  Background: white (#ffffff) with rounded corners`);
  console.log(`  Border radius: 180px (rx="180" ry="180")`);
  console.log(`  Dimensions: 880x880 (square)`);
} catch (error) {
  console.error('✗ Failed to generate rounded logo:', error.message);
  process.exit(1);
}
