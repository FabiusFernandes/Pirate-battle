// Builds the runtime asset folder (public/game) from the original asset pack in assets/.
//
// - Copies the UI atlases as-is (they are already in PixiJS/TexturePacker JSON format).
// - Converts the Starling/Sparrow XML ship atlas into PixiJS spritesheet JSON.
// - Generates spritesheet JSON for the 64px tile grid (1x) and its 128px retina version (2x).
// - Copies individual retina UI PNGs used by the React menus, the menu backdrop and the sounds.
//
// The script is deterministic and idempotent: it runs before `dev` and `build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets');
const out = join(root, 'public', 'game');

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function copy(from, to) {
  ensureDir(dirname(to));
  copyFileSync(from, to);
}

function copyDir(from, to, filter = () => true) {
  ensureDir(to);
  for (const entry of readdirSync(from)) {
    const f = join(from, entry);
    const t = join(to, entry);
    if (statSync(f).isDirectory()) copyDir(f, t, filter);
    else if (filter(entry)) copyFileSync(f, t);
  }
}

function writeJson(file, data) {
  ensureDir(dirname(file));
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Reads width/height from a PNG header without decoding the image. */
function pngSize(file) {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function frameEntry(x, y, w, h) {
  return {
    frame: { x, y, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
  };
}

/** Converts a Sparrow/Starling XML atlas into PixiJS spritesheet JSON. */
function convertXmlAtlas(xmlFile, sourceImage, imageName, scale) {
  const xml = readFileSync(xmlFile, 'utf8');
  const frames = {};
  const re = /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"\s*\/>/g;
  for (const m of xml.matchAll(re)) {
    const [, name, x, y, w, h] = m;
    frames[name.replace(/\.png$/, '')] = frameEntry(Number(x), Number(y), Number(w), Number(h));
  }
  const size = pngSize(sourceImage);
  return {
    frames,
    meta: { app: 'scripts/prepare-assets.mjs', image: imageName, format: 'RGBA8888', size, scale: String(scale) },
  };
}

/** Generates a grid spritesheet: frame `tile_N` is cell N-1 in row-major order (verified against the individual PNGs). */
function gridAtlas(imageFile, imageName, cell, scale) {
  const size = pngSize(imageFile);
  const cols = size.w / cell;
  const rows = size.h / cell;
  const frames = {};
  for (let i = 0; i < cols * rows; i++) {
    frames[`tile_${i + 1}`] = frameEntry((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  }
  return {
    frames,
    meta: { app: 'scripts/prepare-assets.mjs', image: imageName, format: 'RGBA8888', size, scale: String(scale) },
  };
}

if (!existsSync(src)) {
  console.error(`[assets] source folder not found: ${src}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
ensureDir(out);

// UI atlases (already PixiJS compatible).
for (const name of ['ui_sheet', 'ui_sheet_retina']) {
  copy(join(src, 'spritesheet', `${name}.json`), join(out, 'atlas', `${name}.json`));
  copy(join(src, 'spritesheet', `${name}.png`), join(out, 'atlas', `${name}.png`));
}

// Ships / parts / effects atlas. The "retina" ship sheet has the same pixel size as the default one,
// so only the default sheet is shipped (scale 1).
copy(join(src, 'spritesheet', 'ships_miscellaneous_sheet.png'), join(out, 'atlas', 'ships_sheet.png'));
writeJson(
  join(out, 'atlas', 'ships_sheet.json'),
  convertXmlAtlas(
    join(src, 'spritesheet', 'ships_miscellaneous_sheet.xml'),
    join(src, 'spritesheet', 'ships_miscellaneous_sheet.png'),
    'ships_sheet.png',
    1,
  ),
);

// Tiles (64px at 1x, 128px at 2x).
copy(join(src, 'tilesheet', 'tiles_sheet.png'), join(out, 'atlas', 'tiles_sheet.png'));
copy(join(src, 'tilesheet', 'tiles_sheet_retina.png'), join(out, 'atlas', 'tiles_sheet_retina.png'));
writeJson(join(out, 'atlas', 'tiles_sheet.json'), gridAtlas(join(src, 'tilesheet', 'tiles_sheet.png'), 'tiles_sheet.png', 64, 1));
writeJson(
  join(out, 'atlas', 'tiles_sheet_retina.json'),
  gridAtlas(join(src, 'tilesheet', 'tiles_sheet_retina.png'), 'tiles_sheet_retina.png', 128, 2),
);

// Individual retina UI images for the React (DOM) menus.
copyDir(join(src, 'png', 'retina', 'ui'), join(out, 'ui'), (f) => f.endsWith('.png'));
copy(join(src, 'ui_scene_background.png'), join(out, 'ui', 'scene_background.png'));

// Sounds, packed as base64 inside JSON bundles. Download managers (IDM and similar) intercept
// requests for media extensions such as .wav and steal the file from the page; JSON is never
// intercepted. The original WAV bytes are embedded unchanged.
const AMBIENCE = new Set(['ocean_ambience_loop', 'ship_sailing_loop']);
function soundBundle(filter) {
  const sounds = {};
  for (const file of readdirSync(join(src, 'sounds')).filter((f) => f.endsWith('.wav')).sort()) {
    const name = file.replace(/\.wav$/, '');
    if (filter(name)) sounds[name] = readFileSync(join(src, 'sounds', file)).toString('base64');
  }
  return { format: 'wav-base64', sounds };
}
ensureDir(join(out, 'sounds'));
// Effects first (small, needed immediately), then the long ambience loops.
writeFileSync(join(out, 'sounds', 'effects.json'), JSON.stringify(soundBundle((n) => !AMBIENCE.has(n))));
writeFileSync(join(out, 'sounds', 'ambience.json'), JSON.stringify(soundBundle((n) => AMBIENCE.has(n))));

console.log(`[assets] runtime assets written to ${out}`);
