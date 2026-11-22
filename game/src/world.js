// The game's rules and state, with no drawing and no browser in it: Vane, the
// guards and their suspicion, cameras, lasers, lanterns, loot, gadgets, the
// alarm, strikes and the timer. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Nothing here allocates after createWorld.
import {
  ALARM,
  CAMERA,
  COLS,
  CONE,
  FIELD,
  GADGETS,
  GAIT,
  LIGHT,
  MAX_STRIKES,
  NOISE,
  PLAYER,
  ROWS,
  STEP,
  SUSPICION,
  TILE,
  TIME_LIMIT,
} from './config.js';
import { LEVELS } from './levels.js';
import { conePolygon, hasLineOfSight, inCone } from './raycast.js';

export const EVENT_LOOT = 1;
export const EVENT_PRIZE = 2;
export const EVENT_WIN = 4;
export const EVENT_CAUGHT = 8;
export const EVENT_FAIL = 16;
export const EVENT_ALARM = 32;
export const EVENT_NOISE = 64;
export const EVENT_GADGET = 128;

const BLOCKS_MOVE = new Set(['#', 'C', 'P', 'D', 'B']);
const HIDES = new Set(['T']);

function tileCenter(col, row) {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createWorld(random) {
  // No seed passed (the browser boot): plain Math.random. A seeded run
  // passes its own generator so a shot is reproducible.
  random = random || Math.random;
  const state = {
    levelIndex: 0,
    level: null,
    grid: [],
    time: 0,
    timeLeft: TIME_LIMIT,
    score: 0,
    lootGot: 0,
    lootTotal: 0,
    prizeGot: false,
    exitOpen: false,
    strikes: 0,
    alarm: 0,
    spotted: 0,
    gadgetsUsed: 0,
    gadgets: { coin: GADGETS.coin.count, smoke: GADGETS.smoke.count, douse: GADGETS.douse.count, decoy: GADGETS.decoy.count },
    over: false,
    won: false,
    failReason: '',
    timeBonus: 0,
    player: {
      x: 0, y: 0, angle: 0, gait: 'walk', moving: false,
      lit: 0, hidden: false, noise: 0, invulnerable: 0,
    },
    guards: [],
    cameras: [],
    lasers: [],
    lanterns: [],
    loot: [],
    prize: null,
    exit: null,
    start: { x: 0, y: 0 },
    coins: [],
    smokes: [],
    decoys: [],
    pings: [],
    popups: [],
  };

  function tileAt(col, row) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return '#';
    return state.grid[row][col];
  }

  function walkable(col, row) {
    return !BLOCKS_MOVE.has(tileAt(col, row));
  }

  function tileOf(x, y) {
    return { col: Math.floor(x / TILE), row: Math.floor(y / TILE) };
  }

  /** Circle-versus-tile collision: move one axis at a time and stop at walls. */
  function moveCircle(body, dx, dy) {
    const r = PLAYER.radius;
    let nx = body.x + dx;
    const top = Math.floor((body.y - r) / TILE);
    const bottom = Math.floor((body.y + r) / TILE);
    const left = Math.floor((nx - r) / TILE);
    const right = Math.floor((nx + r) / TILE);
    let blocked = false;
    for (let row = top; row <= bottom && !blocked; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (!walkable(col, row)) { blocked = true; break; }
      }
    }
    if (!blocked) body.x = nx;
    let ny = body.y + dy;
    const top2 = Math.floor((ny - r) / TILE);
    const bottom2 = Math.floor((ny + r) / TILE);
    const left2 = Math.floor((body.x - r) / TILE);
    const right2 = Math.floor((body.x + r) / TILE);
    blocked = false;
    for (let row = top2; row <= bottom2 && !blocked; row += 1) {
      for (let col = left2; col <= right2; col += 1) {
        if (!walkable(col, row)) { blocked = true; break; }
      }
    }
    if (!blocked) body.y = ny;
  }

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    state.grid = level.map.map((row) => row.split(''));
    state.time = 0;
    state.timeLeft = TIME_LIMIT;
    state.score = 0;
    state.lootGot = 0;
    state.prizeGot = false;
    state.exitOpen = false;
    state.strikes = 0;
    state.alarm = 0;
    state.spotted = 0;
    state.gadgetsUsed = 0;
    state.gadgets = { coin: GADGETS.coin.count, smoke: GADGETS.smoke.count, douse: GADGETS.douse.count, decoy: GADGETS.decoy.count };
    state.over = false;
    state.won = false;
    state.failReason = '';
    state.guards = [];
    state.cameras = [];
    state.lasers = [];
    state.lanterns = [];
    state.loot = [];
    state.coins = [];
    state.smokes = [];
    state.decoys = [];
    state.pings = [];
    state.popups = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const ch = state.grid[row][col];
        const at = tileCenter(col, row);
        if (ch === 'S') state.start = { x: at.x, y: at.y };
        else if (ch === 'G') state.prize = { x: at.x, y: at.y, taken: false };
        else if (ch === 'E') state.exit = { x: at.x, y: at.y, open: false };
        else if (ch === 'g') state.loot.push({ x: at.x, y: at.y, taken: false, value: 100 });
        else if (ch === 'L') state.lanterns.push({ x: at.x, y: at.y, lit: true });
      }
    }
    state.lootTotal = state.loot.length;
    state.player.x = state.start.x;
    state.player.y = state.start.y;
    state.player.angle = 0;
    state.player.invulnerable = 0;
    for (const def of level.guards) {
      const first = tileCenter(def.path[0][0], def.path[0][1]);
      state.guards.push({
        name: def.name,
        x: first.x, y: first.y,
        angle: 0,
        path: def.path.map(([c, r]) => tileCenter(c, r)),
        wp: 1,
        pause: def.pause,
        pauseT: 0,
        lookDir: 1,
        state: 'patrol',
        suspicion: 0,
        graceT: 0,
        lastSeen: null,
        searchT: 0,
        speed: 55,
        heard: null,
        route: [],
        routeTarget: null,
        repathT: 0,
      });
    }
    for (const def of level.cameras) {
      const at = tileCenter(def.c, def.r);
      state.cameras.push({
        x: at.x, y: at.y, baseAngle: def.angle, sweep: def.sweep,
        angle: def.angle, suspicion: 0, phase: random() * Math.PI * 2,
      });
    }
    for (const def of level.lasers) {
      const a = tileCenter(def.a[0], def.a[1]);
      const b = tileCenter(def.b[0], def.b[1]);
      state.lasers.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, on: def.on, off: def.off, phase: def.phase, cooldown: 0 });
    }
  }

  function litAt(x, y) {
    for (const lamp of state.lanterns) {
      if (!lamp.lit) continue;
      if (Math.hypot(x - lamp.x, y - lamp.y) < LIGHT.lanternRadius && hasLineOfSight(state.grid, lamp.x, lamp.y, x, y)) return 1;
    }
    for (const guard of state.guards) {
      if (Math.hypot(x - guard.x, y - guard.y) < LIGHT.handLampRadius && hasLineOfSight(state.grid, guard.x, guard.y, x, y)) return 1;
    }
    return 0;
  }

  function inSmoke(x, y) {
    for (const smoke of state.smokes) {
      if (Math.hypot(x - smoke.x, y - smoke.y) < GADGETS.smoke.radius) return true;
    }
    return false;
  }

  function playerTileKind() {
    const { col, row } = tileOf(state.player.x, state.player.y);
    return tileAt(col, row);
  }

  /** How visible Vane is right now: 0 in deep dark, 1 under a lamp. */
  function visibilityFactor() {
    let factor = state.player.lit ? 1 : LIGHT.darkFactor;
    factor *= GAIT[state.player.gait].visibility;
    return factor;
  }

  function canGuardSee(guard) {
    const p = state.player;
    const dist = Math.hypot(p.x - guard.x, p.y - guard.y);
    if (dist > CONE.range) return 0;
    if (inSmoke(p.x, p.y) || inSmoke(guard.x, guard.y)) return 0;
    if (HIDES.has(playerTileKind()) && dist > 46) return 0;
    if (dist < CONE.nearRange) return 1;
    if (!inCone(state.grid, guard.x, guard.y, guard.angle, CONE.halfAngle, CONE.range, p.x, p.y)) return 0;
    return visibilityFactor();
  }

  function raiseAlarm(amount) {
    const before = state.alarm;
    state.alarm = Math.min(ALARM.max, state.alarm + amount);
    return state.alarm > before;
  }

  function nearestGuard(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const guard of state.guards) {
      const d = Math.hypot(x - guard.x, y - guard.y);
      if (d < bestDist) { bestDist = d; best = guard; }
    }
    return best;
  }

  function investigate(guard, x, y) {
    if (guard.state === 'chase') return;
    guard.state = 'investigate';
    guard.lastSeen = { x, y };
    guard.searchT = 0;
  }

  function popup(text, x, y, color) {
    state.popups.push({ text, x, y, color: color || '#ffd166', t: 1.4 });
  }

  function addScore(points, x, y, label) {
    state.score += points;
    popup(label || `+$${points}`, x, y);
  }

  function throwCoin(tx, ty) {
    if (state.gadgets.coin <= 0) return false;
    state.gadgets.coin -= 1;
    const p = state.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const range = Math.min(dist, GADGETS.coin.range);
    const lx = p.x + (dx / dist) * range;
    const ly = p.y + (dy / dist) * range;
    state.coins.push({ x: p.x, y: p.y, tx: lx, ty: ly, t: 0, flight: 0.35 });
    state.gadgetsUsed += 1;
    return true;
  }

  function useSmoke() {
    if (state.gadgets.smoke <= 0) return false;
    state.gadgets.smoke -= 1;
    const p = state.player;
    state.smokes.push({ x: p.x, y: p.y, t: GADGETS.smoke.seconds });
    state.gadgetsUsed += 1;
    return true;
  }

  function useDouse() {
    if (state.gadgets.douse <= 0) return false;
    const p = state.player;
    let best = null;
    let bestDist = GADGETS.douse.range;
    for (const lamp of state.lanterns) {
      if (!lamp.lit) continue;
      const d = Math.hypot(p.x - lamp.x, p.y - lamp.y);
      if (d < bestDist) { bestDist = d; best = lamp; }
    }
    if (best) {
      best.lit = false;
      state.gadgets.douse -= 1;
      state.gadgetsUsed += 1;
      popup('LANTERN OUT', best.x, best.y, '#9aa3b5');
      return true;
    }
    return false;
  }

  function useDecoy() {
    if (state.gadgets.decoy <= 0) return false;
    state.gadgets.decoy -= 1;
    const p = state.player;
    state.decoys.push({ x: p.x, y: p.y, angle: p.angle, t: GADGETS.decoy.seconds, chirp: 0 });
    state.gadgetsUsed += 1;
    return true;
  }

  function routeTo(guard, tx, ty) {
    const start = { col: Math.floor(guard.x / TILE), row: Math.floor(guard.y / TILE) };
    const goal = { col: Math.floor(tx / TILE), row: Math.floor(ty / TILE) };
    if (start.col === goal.col && start.row === goal.row) return [{ x: tx, y: ty }];
    const key = (c, r) => r * COLS + c;
    const prev = new Map();
    const seen = new Set([key(start.col, start.row)]);
    const queue = [[start.col, start.row]];
    while (queue.length) {
      const [c, r] = queue.shift();
      if (c === goal.col && r === goal.row) break;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (!walkable(nc, nr)) continue;
        const k = key(nc, nr);
        if (seen.has(k)) continue;
        seen.add(k);
        prev.set(k, [c, r]);
        queue.push([nc, nr]);
      }
    }
    if (!seen.has(key(goal.col, goal.row))) return [{ x: tx, y: ty }];
    const route = [];
    let cur = [goal.col, goal.row];
    while (!(cur[0] === start.col && cur[1] === start.row)) {
      route.unshift({ x: cur[0] * TILE + TILE / 2, y: cur[1] * TILE + TILE / 2 });
      cur = prev.get(key(cur[0], cur[1]));
    }
    route.push({ x: tx, y: ty });
    return route;
  }

  function stepGuard(guard, dt, events) {
    const p = state.player;
    const seen = canGuardSee(guard);
    if (seen > 0) {
      guard.suspicion = Math.min(1, guard.suspicion + SUSPICION.rise * seen * dt);
      guard.graceT = SUSPICION.grace;
      guard.lastSeen = { x: p.x, y: p.y };
      if (guard.state !== 'chase' && guard.suspicion >= 1) {
        guard.state = 'chase';
        state.spotted += 1;
        if (raiseAlarm(1)) events |= EVENT_ALARM;
        popup('SPOTTED!', guard.x, guard.y - 24, '#e74c3c');
      } else if (guard.state === 'patrol' && guard.suspicion >= SUSPICION.investigateAt) {
        guard.state = 'investigate';
      }
    } else {
      if (guard.graceT > 0) guard.graceT -= dt;
      else guard.suspicion = Math.max(0, guard.suspicion - SUSPICION.decay * dt);
    }

    const speed = guard.state === 'chase' ? 150 : guard.state === 'patrol' ? 55 : 95;
    let target = null;
    if (guard.state === 'patrol') {
      target = guard.path[guard.wp];
      if (guard.pauseT > 0) {
        guard.pauseT -= dt;
        guard.angle += Math.sin(state.time * 1.4 + guard.wp) * 0.5 * dt;
        return events;
      }
    } else if (guard.state === 'investigate' || guard.state === 'search') {
      target = guard.lastSeen;
      guard.searchT += dt;
      if (guard.state === 'investigate' && guard.searchT > 3) {
        guard.state = 'search';
        guard.searchT = 0;
      } else if (guard.state === 'search' && guard.searchT > 7) {
        guard.state = 'return';
        guard.suspicion = 0;
      }
    } else if (guard.state === 'chase') {
      target = { x: p.x, y: p.y };
      if (seen === 0) {
        guard.searchT += dt;
        if (guard.searchT > 5) {
          guard.state = 'search';
          guard.searchT = 0;
        }
      } else guard.searchT = 0;
    } else if (guard.state === 'return') {
      // Walk back to the nearest waypoint, then resume the patrol.
      let nearest = guard.path[0];
      let nearestDist = Infinity;
      for (const point of guard.path) {
        const d = Math.hypot(point.x - guard.x, point.y - guard.y);
        if (d < nearestDist) { nearestDist = d; nearest = point; }
      }
      target = nearest;
      if (nearestDist < 12) {
        guard.state = 'patrol';
        guard.wp = guard.path.indexOf(nearest);
      }
    }
    if (!target) return events;
    // Route around furniture: a straight line to the waypoint can cross a
    // pillar, a case, or a vault wall, where axis-separated sliding sticks.
    // A chasing guard repaths twice a second; a patrolling one keeps its
    // route until the waypoint changes.
    const targetKey = `${Math.round(target.x)},${Math.round(target.y)}`;
    guard.repathT -= dt;
    if (!guard.route || guard.route.length === 0 || (guard.routeTarget !== targetKey && guard.repathT <= 0)) {
      guard.route = routeTo(guard, target.x, target.y);
      guard.routeTarget = targetKey;
      guard.repathT = guard.state === 'chase' ? 0.5 : 9999;
    }
    const stepTarget = guard.route[0] || target;
    const dx = stepTarget.x - guard.x;
    const dy = stepTarget.y - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 10) {
      guard.route.shift();
      if (guard.route.length > 0) return events;
      guard.routeTarget = null;
      if (guard.state === 'patrol') {
        guard.wp = (guard.wp + 1) % guard.path.length;
        guard.pauseT = guard.pause;
      } else if (guard.state === 'investigate' || guard.state === 'search') {
        guard.angle += dt * 1.2;
      }
      return events;
    }
    const want = Math.atan2(dy, dx);
    guard.angle = clampAngle(guard.angle + clampAngle(want - guard.angle) * Math.min(1, dt * 8));
    const step = Math.min(dist, speed * dt);
    moveCircle(guard, Math.cos(guard.angle) * step, Math.sin(guard.angle) * step);
    return events;
  }

  function stepCamera(camera, dt, events) {
    camera.angle = camera.baseAngle + Math.sin(state.time * CAMERA.sweepSpeed + camera.phase) * camera.sweep;
    const p = state.player;
    const dist = Math.hypot(p.x - camera.x, p.y - camera.y);
    let seen = 0;
    if (dist < CAMERA.range && !inSmoke(p.x, p.y) && !(HIDES.has(playerTileKind()) && dist > 46)) {
      if (inCone(state.grid, camera.x, camera.y, camera.angle, CAMERA.halfAngle, CAMERA.range, p.x, p.y)) {
        seen = visibilityFactor();
      }
    }
    if (seen > 0) {
      camera.suspicion = Math.min(1, camera.suspicion + SUSPICION.rise * 0.5 * seen * dt);
      if (camera.suspicion >= 1) {
        camera.suspicion = 0.4;
        state.spotted += 1;
        if (raiseAlarm(1)) events |= EVENT_ALARM;
        const guard = nearestGuard(p.x, p.y);
        if (guard) investigate(guard, p.x, p.y);
        popup('CAMERA!', camera.x, camera.y - 20, '#e74c3c');
      }
    } else {
      camera.suspicion = Math.max(0, camera.suspicion - SUSPICION.decay * dt);
    }
    return events;
  }

  function stepLasers(dt, events) {
    const p = state.player;
    for (const laser of state.lasers) {
      if (laser.cooldown > 0) laser.cooldown -= dt;
      const cycle = (state.time + laser.phase) % (laser.on + laser.off);
      const active = cycle < laser.on;
      laser.active = active;
      if (!active || laser.cooldown > 0) continue;
      // Distance from the player to the beam segment.
      const abx = laser.bx - laser.ax;
      const aby = laser.by - laser.ay;
      const len2 = abx * abx + aby * aby || 1;
      let t = ((p.x - laser.ax) * abx + (p.y - laser.ay) * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = laser.ax + abx * t;
      const cy = laser.ay + aby * t;
      if (Math.hypot(p.x - cx, p.y - cy) < PLAYER.radius + 6) {
        laser.cooldown = 3;
        state.spotted += 1;
        if (raiseAlarm(1)) events |= EVENT_ALARM;
        const guard = nearestGuard(p.x, p.y);
        if (guard) investigate(guard, p.x, p.y);
        popup('LASER TRIP!', p.x, p.y - 24, '#e74c3c');
      }
    }
    return events;
  }

  function stepPlayer(input, dt) {
    const p = state.player;
    p.gait = input.sneak ? 'sneak' : input.sprint ? 'sprint' : 'walk';
    const speed = GAIT[p.gait].speed;
    const len = Math.hypot(input.moveX, input.moveY);
    p.moving = len > 0.1;
    if (p.moving) {
      const nx = input.moveX / (len || 1);
      const ny = input.moveY / (len || 1);
      p.angle = Math.atan2(ny, nx);
      moveCircle(p, nx * speed * dt, ny * speed * dt);
    }
    // Footstep noise: carpet hushes it, wood carries it.
    const kind = playerTileKind();
    const hush = kind === ',' ? 0.3 : kind === 'w' ? 1.5 : 1;
    p.noise = p.moving ? GAIT[p.gait].noise * hush : 0;
    if (p.noise > 0) {
      for (const guard of state.guards) {
        if (guard.state === 'chase') continue;
        const d = Math.hypot(guard.x - p.x, guard.y - p.y);
        if (d < NOISE.footstepHear && p.noise > 60) investigate(guard, p.x, p.y);
      }
    }
    if (p.invulnerable > 0) p.invulnerable -= dt;
    p.lit = litAt(p.x, p.y);
    const { col, row } = tileOf(p.x, p.y);
    p.hidden = HIDES.has(tileAt(col, row));
  }

  function stepProjectiles(dt, events) {
    for (const coin of state.coins) {
      coin.t += dt;
      const k = Math.min(1, coin.t / coin.flight);
      coin.x += (coin.tx - coin.x) * Math.min(1, dt * 14);
      coin.y += (coin.ty - coin.y) * Math.min(1, dt * 14);
      if (!coin.landed && k >= 1) {
        coin.landed = true;
        state.pings.push({ x: coin.tx, y: coin.ty, t: 0.9, radius: NOISE.coinHear });
        events |= EVENT_NOISE;
        popup('CLINK', coin.tx, coin.ty - 14, '#ffd166');
      }
    }
    state.coins = state.coins.filter((c) => c.t < 0.6);
    for (const smoke of state.smokes) smoke.t -= dt;
    state.smokes = state.smokes.filter((s) => s.t > 0);
    for (const decoy of state.decoys) {
      decoy.t -= dt;
      decoy.chirp -= dt;
      if (decoy.chirp <= 0) {
        decoy.chirp = 0.7;
        state.pings.push({ x: decoy.x, y: decoy.y, t: 0.5, radius: GADGETS.decoy.noise });
        events |= EVENT_NOISE;
      }
      const step = GADGETS.decoy.speed * dt;
      moveCircle(decoy, Math.cos(decoy.angle) * step, Math.sin(decoy.angle) * step);
    }
    state.decoys = state.decoys.filter((d) => d.t > 0);
    for (const ping of state.pings) {
      ping.t -= dt;
      for (const guard of state.guards) {
        if (guard.state === 'chase') continue;
        const d = Math.hypot(guard.x - ping.x, guard.y - ping.y);
        if (d < ping.radius) investigate(guard, ping.x, ping.y);
      }
    }
    state.pings = state.pings.filter((ping) => ping.t > 0);
    for (const popupItem of state.popups) popupItem.t -= dt;
    state.popups = state.popups.filter((popupItem) => popupItem.t > 0);
    return events;
  }

  function step(dt, input) {
    let events = 0;
    if (state.over) return events;
    state.time += dt;
    state.timeLeft = Math.max(0, TIME_LIMIT - state.time);
    if (state.timeLeft <= 0) {
      state.over = true;
      state.won = false;
      state.failReason = 'The night watch locked the wing.';
      return EVENT_FAIL;
    }

    if (input.throwCoin) { if (throwCoin(input.throwCoin.x, input.throwCoin.y)) events |= EVENT_GADGET; }
    if (input.useSmoke) { if (useSmoke()) events |= EVENT_GADGET; }
    if (input.useDecoy) { if (useDecoy()) events |= EVENT_GADGET; }
    if (input.useDouse) { if (useDouse()) events |= EVENT_GADGET; }

    stepPlayer(input, dt);
    events = stepProjectiles(dt, events);

    for (const guard of state.guards) events = stepGuard(guard, dt, events);
    for (const camera of state.cameras) events = stepCamera(camera, dt, events);
    events = stepLasers(dt, events);

    if (state.alarm >= ALARM.max) {
      for (const guard of state.guards) {
        if (guard.state !== 'chase') {
          guard.state = 'chase';
          guard.lastSeen = { x: state.player.x, y: state.player.y };
        }
      }
    } else if (state.alarm > 0) {
      state.alarm = Math.max(0, state.alarm - ALARM.decayPerSecond * dt);
    }

    // Caught: a chasing guard lays a hand on Vane.
    for (const guard of state.guards) {
      if (guard.state !== 'chase') continue;
      if (Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < 26) {
        state.strikes += 1;
        events |= EVENT_CAUGHT;
        if (state.strikes >= MAX_STRIKES) {
          state.over = true;
          state.won = false;
          state.failReason = 'Dragged out by the night watch — three strikes.';
          return events | EVENT_FAIL;
        }
        state.player.x = state.start.x;
        state.player.y = state.start.y;
        state.player.invulnerable = 2;
        state.alarm = 1;
        for (const other of state.guards) {
          other.state = 'return';
          other.suspicion = 0;
          other.searchT = 0;
        }
        popup('CAUGHT — back to the door', state.player.x, state.player.y - 24, '#e74c3c');
        break;
      }
    }

    // Loot and the prize.
    for (const item of state.loot) {
      if (!item.taken && Math.hypot(item.x - state.player.x, item.y - state.player.y) < 22) {
        item.taken = true;
        state.lootGot += 1;
        addScore(item.value, item.x, item.y - 16, `+$${item.value}`);
        events |= EVENT_LOOT;
      }
    }
    if (!state.prizeGot && state.prize && Math.hypot(state.prize.x - state.player.x, state.prize.y - state.player.y) < 26) {
      state.prizeGot = true;
      state.exitOpen = true;
      state.exit.open = true;
      addScore(state.level.prizeValue, state.prize.x, state.prize.y - 20, `+${state.level.prize}`);
      events |= EVENT_PRIZE;
    }
    if (state.exitOpen && state.exit && Math.hypot(state.exit.x - state.player.x, state.exit.y - state.player.y) < 28) {
      state.over = true;
      state.won = true;
      let bonus = 0;
      if (state.time < state.level.par) bonus += Math.round((state.level.par - state.time) * 10);
      if (state.spotted === 0) bonus += 500;
      if (state.lootGot === state.lootTotal) bonus += 300;
      state.score += bonus;
      state.timeBonus = bonus;
      return events | EVENT_WIN;
    }
    return events;
  }

  function rank() {
    if (state.spotted === 0 && state.strikes === 0) return 'GHOST';
    if (state.spotted <= 1 && state.strikes === 0) return 'SHADOW';
    if (state.spotted <= 3) return 'CUTPURSE';
    return 'RUCKUS';
  }

  function seals() {
    return {
      ghost: state.spotted === 0,
      allLoot: state.lootGot === state.lootTotal,
      underPar: state.time < state.level.par,
    };
  }

  loadLevel(0);
  return {
    state,
    loadLevel,
    step,
    rank,
    seals,
    tileAt,
    walkable,
    conePolygon: (x, y, angle, halfAngle, range, rays) => conePolygon(state.grid, x, y, angle, halfAngle, range, rays),
  };
}
