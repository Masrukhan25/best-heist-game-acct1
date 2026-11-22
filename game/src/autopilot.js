// The autopilot: a thief who plans. It picks the next objective (the nearest
// loose treasure, then the named prize, then the exit), finds a route with a
// danger-weighted Dijkstra search (tiles inside a sweeping cone cost far more
// than safe ones), and walks it — sneaking near guards, waiting out a cone
// that covers the only way through, and tossing a coin to pull a guard away
// when it has waited too long. It is the same pilot the screenshot scenes
// use, and the same one the win proof runs.
import { CAMERA, COLS, CONE, ROWS, TILE } from './config.js';
import { inCone } from './raycast.js';

function tileOf(x, y) {
  return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
}

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

export function createAutopilot(world, opts) {
  const reckless = !!(opts && opts.reckless);
  const state = world.state;
  let path = [];
  let pathTarget = null;
  let repathIn = 0;
  let waitT = 0;
  let coinCooldown = 0;
  let stuckT = 0;
  let lastPos = { x: 0, y: 0 };

  function dangerAt(col, row) {
    if (reckless) return 0;
    const at = tileCenter(col, row);
    let cost = 0;
    for (const guard of state.guards) {
      if (inCone(state.grid, guard.x, guard.y, guard.angle, CONE.halfAngle, CONE.range, at.x, at.y)) cost += 40;
      else if (Math.hypot(guard.x - at.x, guard.y - at.y) < 70) cost += 12;
    }
    for (const camera of state.cameras) {
      if (inCone(state.grid, camera.x, camera.y, camera.angle, CAMERA.halfAngle, CAMERA.range, at.x, at.y)) cost += 25;
    }
    return cost;
  }

  /** Dijkstra from (sc, sr) to (tc, tr); danger tiles cost more, walls cost ∞. */
  function findPath(sc, sr, tc, tr) {
    const key = (c, r) => r * COLS + c;
    const dist = new Map([[key(sc, sr), 0]]);
    const prev = new Map();
    const open = [[0, sc, sr]];
    const visited = new Set();
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, c, r] = open.shift();
      const k = key(c, r);
      if (visited.has(k)) continue;
      visited.add(k);
      if (c === tc && r === tr) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (!world.walkable(nc, nr)) continue;
        const nk = key(nc, nr);
        const nd = d + 1 + dangerAt(nc, nr);
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, [c, r]);
          open.push([nd, nc, nr]);
        }
      }
    }
    if (!dist.has(key(tc, tr))) return null;
    const route = [];
    let cur = [tc, tr];
    while (!(cur[0] === sc && cur[1] === sr)) {
      route.unshift(cur);
      cur = prev.get(key(cur[0], cur[1]));
      if (!cur) return null;
    }
    return route;
  }

  function pickTarget() {
    if (reckless) {
      if (state.prize) return { x: state.prize.x, y: state.prize.y, kind: 'prize' };
      if (state.exitOpen && state.exit) return { x: state.exit.x, y: state.exit.y, kind: 'exit' };
      return null;
    }
    if (!state.prizeGot) {
      // The nearest loose treasure, but never one a long way back once the
      // prize is close: the prize is worth more than a detour.
      let best = null;
      let bestDist = Infinity;
      for (const item of state.loot) {
        if (item.taken) continue;
        const d = Math.hypot(item.x - state.player.x, item.y - state.player.y);
        if (d < bestDist) { bestDist = d; best = item; }
      }
      const prizeDist = state.prize ? Math.hypot(state.prize.x - state.player.x, state.prize.y - state.player.y) : Infinity;
      if (best && (bestDist < 320 || bestDist < prizeDist)) return { x: best.x, y: best.y, kind: 'loot' };
      if (state.prize) return { x: state.prize.x, y: state.prize.y, kind: 'prize' };
    }
    if (state.exitOpen && state.exit) return { x: state.exit.x, y: state.exit.y, kind: 'exit' };
    if (state.prize) return { x: state.prize.x, y: state.prize.y, kind: 'prize' };
    return null;
  }

  function nearestGuardDist() {
    let best = Infinity;
    for (const guard of state.guards) {
      best = Math.min(best, Math.hypot(guard.x - state.player.x, guard.y - state.player.y));
    }
    return best;
  }

  function chasing() {
    return state.guards.some((g) => g.state === 'chase');
  }

  /**
   * One pilot decision for this step. Returns the same input shape the world
   * takes: moveX/moveY, sneak, sprint, and one-shot gadget flags.
   */
  function pilot(dt) {
    const input = { moveX: 0, moveY: 0, sneak: false, sprint: false, throwCoin: null, useSmoke: false, useDecoy: false, useDouse: false };
    const p = state.player;
    repathIn -= dt;
    coinCooldown -= dt;

    // Stuck detection: barely moved in the last two seconds.
    if (Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 2) stuckT += dt;
    else stuckT = 0;
    lastPos = { x: p.x, y: p.y };

    const target = pickTarget();
    if (!target) return input;
    const targetKey = `${target.kind}:${Math.floor(target.x / TILE)},${Math.floor(target.y / TILE)}`;
    const here = tileOf(p.x, p.y);
    if (targetKey !== pathTarget || repathIn <= 0 || path.length === 0) {
      const there = tileOf(target.x, target.y);
      const route = findPath(here.col, here.row, there.col, there.row);
      path = route ? route.map(([c, r]) => tileCenter(c, r)) : [];
      pathTarget = targetKey;
      repathIn = 0.4;
    }
    if (path.length === 0) return input;

    // A chase means run: sprint for the exit if the prize is taken, else for
    // the door, and drop smoke if a guard is right on Vane's heels.
    if (chasing()) {
      input.sprint = true;
      if (nearestGuardDist() < 150 && state.smokes.length === 0) input.useSmoke = true;
    } else if (!reckless) {
      input.sneak = nearestGuardDist() < 200 || p.lit === 1;
    }

    const next = path[0];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      path.shift();
      return pilot(dt);
    }
    // Standing in a live cone while waiting is how a thief gets seen: if
    // the pilot's own tile is coned, back away from the nearest guard first.
    const hereTile = tileOf(p.x, p.y);
    if (!chasing() && dangerAt(hereTile.col, hereTile.row) >= 40) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const guard of state.guards) {
        const d = Math.hypot(guard.x - p.x, guard.y - p.y);
        if (d < nearestDist) { nearestDist = d; nearest = guard; }
      }
      if (nearest) {
        const ax = p.x - nearest.x;
        const ay = p.y - nearest.y;
        const ad = Math.hypot(ax, ay) || 1;
        input.moveX = ax / ad;
        input.moveY = ay / ad;
        input.sneak = true;
        return input;
      }
    }
    // The next tile is inside a live cone: wait it out, then lure the guard off.
    const nextTile = tileOf(next.x, next.y);
    if (!reckless && !chasing() && dangerAt(nextTile.col, nextTile.row) >= 40) {
      waitT += dt;
      if (waitT > 3 && coinCooldown <= 0) {
        const guard = state.guards[0];
        const lx = guard ? guard.x + 260 : next.x + 200;
        const ly = guard ? guard.y : next.y;
        input.throwCoin = { x: lx, y: ly };
        coinCooldown = 6;
        waitT = 0;
      }
      return input;
    }
    waitT = 0;
    if (!reckless && stuckT > 4 && coinCooldown <= 0) {
      input.throwCoin = { x: p.x + 260, y: p.y - 100 };
      coinCooldown = 6;
      stuckT = 0;
      return input;
    }
    input.moveX = dx / dist;
    input.moveY = dy / dist;
    return input;
  }

  return { pilot };
}
