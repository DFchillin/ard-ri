#!/usr/bin/env node
// Offline sprite generator. Runs on YOUR machine (where api.pixellab.ai is
// reachable), calls Pixellab, and writes PNGs into assets/ to the naming spec
// the in-game loader expects. Never run this from the game/browser — it uses
// your API key.
//
// Usage:
//   export PIXELLAB_API_KEY=...     # never commit this
//   node tools/gen_sprites.mjs             # generate everything in the manifest
//   node tools/gen_sprites.mjs rath druid  # only these entries
//
// Requires Node 18+ (global fetch).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.PIXELLAB_API_KEY;
const DIRS = ['S', 'W', 'N', 'E']; // down, left, up, right — matches the concept art

// What to generate. Buildings = one iso frame; walkers = 8 compass frames.
const MANIFEST = [
  { name: 'rath',  type: 'building', size: 64,
    prompt: 'Celtic Iron Age ringfort dwelling, thatched round house inside an earthen bank, isometric pixel art, transparent background' },
  { name: 'well',  type: 'building', size: 48,
    prompt: 'ancient stone water well, isometric pixel art, transparent background' },
  { name: 'altar', type: 'building', size: 48,
    prompt: 'Celtic pagan standing-stone altar with carved ogham, isometric pixel art, transparent background' },
  { name: 'druid', type: 'walker', size: 32,
    prompt: 'Celtic druid in a hooded robe walking, isometric pixel art character, transparent background' },
  { name: 'water_carrier', type: 'walker', size: 32,
    prompt: 'Celtic villager carrying water pails walking, isometric pixel art character, transparent background' },
];

// ---------------------------------------------------------------------------
// The ONE Pixellab-specific call. Fill this in against the current Pixellab API
// reference (endpoint path, request body field names, and how the PNG comes
// back — base64 vs URL). Everything else in this file is API-agnostic.
// Must return a Buffer of PNG bytes.
async function pixellab({ prompt, size, direction }) {
  const ENDPOINT = 'https://api.pixellab.ai/v1/generate-image-pixflux'; // TODO verify
  const body = {
    description: direction ? `${prompt}, facing ${direction}` : prompt, // TODO verify field names
    image_size: { width: size, height: size },
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const data = await res.json();
  const b64 = data?.image?.base64 ?? data?.images?.[0]?.base64; // TODO verify shape
  if (!b64) throw new Error(`no image in response: ${JSON.stringify(data).slice(0, 300)}`);
  return Buffer.from(b64, 'base64');
}
// ---------------------------------------------------------------------------

async function save(relPath, buf) {
  const full = resolve(ROOT, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buf);
  console.log('  wrote', relPath);
}

async function genBuilding(e) {
  const buf = await pixellab({ prompt: e.prompt, size: e.size });
  await save(`assets/buildings/${e.name}.png`, buf);
}

async function genWalker(e) {
  for (const d of DIRS) {
    const buf = await pixellab({ prompt: e.prompt, size: e.size, direction: d });
    await save(`assets/walkers/${e.name}/${e.name}_${d}.png`, buf);
  }
}

async function main() {
  if (!KEY) {
    console.error('Set PIXELLAB_API_KEY first:  export PIXELLAB_API_KEY=...');
    process.exit(1);
  }
  const only = process.argv.slice(2);
  const jobs = only.length ? MANIFEST.filter((e) => only.includes(e.name)) : MANIFEST;
  if (!jobs.length) {
    console.error('nothing matched; names are:', MANIFEST.map((e) => e.name).join(', '));
    process.exit(1);
  }
  for (const e of jobs) {
    console.log(`${e.name} (${e.type})`);
    if (e.type === 'building') await genBuilding(e);
    else await genWalker(e);
  }
  console.log('done — review the PNGs in assets/, then commit the ones you like.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
