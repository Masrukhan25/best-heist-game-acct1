// The Gilded Hour — the hand-in program (Node 22, standard library only).
//
// The game it hands in: "The Gilded Hour", a top-down heist game starring
// Vane, the Fox of Carrowmere, working through five wings of the Ashworth
// Museum — the Marble Atrium, the Hall of Kings, the Clockwork Gallery,
// the Gilded Salon, and the Director's Vault. Each wing hides one named
// prize (the Jade Scarab, the Obsidian Diadem, the Brass Astrolabe, the
// Peacock Fan, the Gilded Hourglass) behind 18 patrolling guards in all,
// 33 treasures to lift, and 4 gadgets (coin, smoke, douse, decoy
// nightingale), with cameras and lasers guarding the final vault.
//
// What it does, and nothing else:
//   1. copies this directory's game/ (the playable game: index.html plus its
//      ES modules, no library, no network) into the output directory,
//   2. copies screenshots/ (four JPEG renders of the game, the first by name
//      the cover) into the output directory,
//   3. writes dossier.json there with the vendored make.fun library, so the
//      judge's summary is exactly what the scorer computes from the same
//      files.
//
// Run it outside the grader's container with MAKEFUN_OUTPUT_DIR set:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader it defaults to /output. Serve the game locally first
// with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, from the competition's gate.json. Only text_max_bytes
// shapes the dossier bytes; the other caps refuse an entry the scorer would
// refuse anyway (more than 4 screenshots, one over 256 KiB, more than 993
// files under game/, 48 MiB of game files in all, or a game path over 1000
// bytes — game/ counts beside /output's own 1000-entry cap).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function handIn() {
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  const shots = join(here, 'screenshots');
  if (existsSync(shots)) {
    mkdirSync(join(out, 'screenshots'), { recursive: true });
    cpSync(shots, join(out, 'screenshots'), { recursive: true });
  }
  // Verify the hand-in is complete: the screenshots directory must exist
  // and hold at least one render, otherwise the judge has nothing to see.
  // This throws before the dossier is written, so a broken hand-in fails
  // loudly here instead of shipping an entry with no cover image.
  const handedShots = existsSync(join(out, 'screenshots'))
    ? readdirSync(join(out, 'screenshots')).filter((n) => /\.(jpe?g|png)$/i.test(n))
    : [];
  if (handedShots.length === 0) {
    throw new Error('no screenshots handed in: screenshots/ is missing or empty');
  }
  const dossier = buildDossier(out, CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
  const names = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')).sort() : [];
  console.log(`handed in ${names.length} screenshot(s): ${names.join(', ')}`);
  console.log(`dossier.json: ${dossier.length} bytes`);
}

handIn();
