import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

/**
 * Regenerates the Figma Community submission images from icon.svg.
 *
 * Usage: pnpm assets:figma
 *
 * The icon is 128x128. The cover is 1920x960 with the icon, the name and the tagline.
 * Text uses the system Helvetica or Arial. Run this on a machine that has one of them.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const submissionDir = join(repoRoot, 'docs', 'dev', 'figma-submission');

const NAVY = '#1E2A44';
const ORANGE = '#C0552F';
const TAGLINE = 'Turn your Figma components into a design kit your AI coding agent follows.';

function renderPng(svg, width, outFile) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
  });
  const png = resvg.render().asPng();
  writeFileSync(outFile, png);
  console.log(`Wrote ${outFile} (${png.length} bytes)`);
}

function inlineIcon(iconSvg, scale, x, y) {
  const inner = iconSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<g transform="translate(${x}, ${y}) scale(${scale})">${inner}</g>`;
}

const iconSvg = readFileSync(join(submissionDir, 'icon.svg'), 'utf-8');
renderPng(iconSvg, 128, join(submissionDir, 'icon.png'));

const coverSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960" viewBox="0 0 1920 960">
  <rect width="1920" height="960" fill="${NAVY}" />
  ${inlineIcon(iconSvg, 1.875, 840, 180)}
  <text x="960" y="570" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="120" font-weight="700" fill="${ORANGE}">Frame-Relay</text>
  <text x="960" y="660" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="44" fill="${ORANGE}">${TAGLINE}</text>
</svg>`;
renderPng(coverSvg, 1920, join(submissionDir, 'cover.png'));
