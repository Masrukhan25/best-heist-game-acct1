// The four screenshot scenes. Each one is a real world, played for real:
// the cover is a posed instant of a live patrol (the cone is raycast from
// real geometry), the spotted and lure scenes run the autopilot until the
// named moment happens, and the win scene is a full autopilot heist from the
// door to the end-of-job report. Nothing here is painted; the renderer draws
// whatever state stageShot leaves behind.
import { TILE } from './config.js';
import { createWorld } from './world.js';
import { createAutopilot } from './autopilot.js';
import { createRandom } from './random.js';

const DT = 1 / 60;

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function stepN(world, input, n) {
  for (let i = 0; i < n; i += 1) world.step(DT, input);
}

/** The cover: Vane crouched behind the display case in the Atrium while
 *  Fenwick's cone stops at the case. The guard is posed mid-patrol, the cone
 *  is live raycast, the lantern pools are real. */
function stageCover() {
  const world = createWorld(createRandom(20261122));
  world.loadLevel(0);
  const s = world.state;
  const fenwick = s.guards[0];
  const at = tileCenter(11, 3);
  fenwick.x = at.x;
  fenwick.y = at.y;
  fenwick.angle = Math.PI / 2;
  fenwick.suspicion = 0.3;
  fenwick.pauseT = 2.5;
  fenwick.route = [];
  const vane = tileCenter(11, 6);
  s.player.x = vane.x;
  s.player.y = vane.y;
  s.player.gait = 'sneak';
  s.player.lit = 0;
  stepN(world, { moveX: 0, moveY: 0, sneak: true, sprint: false }, 30);
  // The pose must survive one step: re-assert it after the step.
  fenwick.x = at.x;
  fenwick.y = at.y;
  fenwick.angle = Math.PI / 2;
  fenwick.pauseT = 2.5;
  s.player.x = vane.x;
  s.player.y = vane.y;
  s.player.gait = 'sneak';
  const annotations = [
    { x: vane.x, y: vane.y, lx: 620, ly: 470, text: 'YOU: hidden where the cone stops at the case', align: 'left' },
    { x: s.exit.x, y: s.exit.y, lx: 150, ly: 150, text: 'EXIT — opens once the Scarab is taken', align: 'left' },
    { x: 660, y: 140, lx: 780, ly: 100, text: 'LANTERN LIGHT: seen from across the room', align: 'left' },
  ];
  return { world, annotations, result: { scene: 'cover' } };
}

/** Spotted: a reckless walk through the Clockwork Gallery until a guard's
 *  suspicion fills and the chase begins. The frame is frozen on the chase. */
function stageSpotted() {
  const world = createWorld(createRandom(20261122));
  world.loadLevel(2);
  const pilot = createAutopilot(world, { reckless: true });
  const s = world.state;
  let steps = 0;
  while (steps < 120 * 60) {
    world.step(DT, pilot.pilot(DT));
    steps += 1;
    if (s.guards.some((g) => g.state === 'chase')) break;
    if (s.over) break;
  }
  return {
    world,
    annotations: [],
    result: { scene: 'spotted', steps, chased: s.guards.some((g) => g.state === 'chase') },
  };
}

/** Lure: the pilot sneaks through the Hall of Kings, then tosses a coin past
 *  a guard and waits until the guard walks off to investigate the sound. */
function stageLure() {
  const world = createWorld(createRandom(20261122));
  world.loadLevel(1);
  const pilot = createAutopilot(world);
  const s = world.state;
  let steps = 0;
  let coinAt = null;
  let phase = 'approach';
  while (steps < 180 * 60) {
    const input = pilot.pilot(DT);
    if (phase === 'approach') {
      const near = s.guards.find((g) => Math.hypot(g.x - s.player.x, g.y - s.player.y) < 260);
      if (near) {
        const dx = near.x - s.player.x;
        const dy = near.y - s.player.y;
        const d = Math.hypot(dx, dy) || 1;
        coinAt = { x: near.x + (dx / d) * 220, y: near.y + (dy / d) * 220 };
        input.throwCoin = coinAt;
        phase = 'thrown';
      }
    }
    world.step(DT, input);
    steps += 1;
    if (phase === 'thrown' && s.guards.some((g) => g.state === 'investigate')) {
      // Let the guard take a few steps toward the sound before freezing.
      stepN(world, { moveX: 0, moveY: 0, sneak: true, sprint: false }, 45);
      break;
    }
    if (s.over) break;
  }
  const investigator = s.guards.find((g) => g.state === 'investigate') || s.guards[0];
  const annotations = [
    { x: investigator.x, y: investigator.y, lx: investigator.x + 60, ly: investigator.y - 90, text: '? HEARD THE COIN — off to look', align: 'left' },
    { x: s.player.x, y: s.player.y, lx: s.player.x - 260, ly: s.player.y + 110, text: 'YOU: the coin did the walking', align: 'left' },
  ];
  return {
    world,
    annotations,
    result: { scene: 'lure', steps, lured: s.guards.some((g) => g.state === 'investigate'), coinAt },
  };
}

/** Win: the pilot plays the whole first heist, door to exit, and the
 *  end-of-job report is the frame. */
function stageWin() {
  const world = createWorld(createRandom(20261122));
  world.loadLevel(0);
  const pilot = createAutopilot(world);
  const s = world.state;
  let steps = 0;
  while (!s.won && !s.over && steps < 240 * 60) {
    world.step(DT, pilot.pilot(DT));
    steps += 1;
  }
  return {
    world,
    annotations: [],
    result: {
      scene: 'win',
      won: s.won,
      time: s.time,
      par: world.state.level.par,
      rank: world.rank(),
      score: s.score,
      loot: `${s.lootGot}/${s.lootTotal}`,
      steps,
    },
  };
}

export function stageShot(shot) {
  if (shot === 'cover') return stageCover();
  if (shot === 'spotted') return stageSpotted();
  if (shot === 'lure') return stageLure();
  if (shot === 'win') return stageWin();
  return null;
}
