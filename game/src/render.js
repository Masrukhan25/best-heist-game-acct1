// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x800 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Flat shapes, canvas gradients for lamp
// light, canvas text for the HUD and the panels. Text that holds a number is
// rebuilt only when the number changes, so a frame allocates nothing.
import {
  CAMERA,
  CONE,
  FIELD,
  FONT,
  FONT_TITLE,
  LIGHT,
  MAX_STRIKES,
  PALETTE,
  TILE,
} from './config.js';
import { CAMPAIGN } from './levels.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_RESULTS = 'results';
export const SCREEN_OVER = 'over';

const HUD_H = 64;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

const CONE_COLORS = {
  patrol: 'rgba(255, 210, 122, 0.20)',
  suspicious: 'rgba(255, 220, 80, 0.28)',
  investigate: 'rgba(255, 154, 46, 0.30)',
  search: 'rgba(255, 154, 46, 0.30)',
  chase: 'rgba(231, 76, 60, 0.34)',
  return: 'rgba(255, 210, 122, 0.20)',
};

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const timeLabel = cachedLabel('');
  const lootLabel = cachedLabel('');
  const scoreLabel = cachedLabel('SCORE ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, font) {
    const key = `${size}|${font || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${font || FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawTiles(state) {
    const grid = state.grid;
    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        const ch = grid[row][col];
        const x = col * TILE;
        const y = row * TILE;
        if (ch === '#') {
          context.fillStyle = PALETTE.wall;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.wallTop;
          context.fillRect(x, y, TILE, 4);
          continue;
        }
        if (ch === ',') {
          context.fillStyle = PALETTE.carpet;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = PALETTE.carpetTrim;
          context.fillRect(x, y, TILE, 3);
          context.fillRect(x, y + TILE - 3, TILE, 3);
          continue;
        }
        if (ch === 'w') {
          context.fillStyle = PALETTE.floorWood;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = 'rgba(0,0,0,0.15)';
          context.fillRect(x, y + 19, TILE, 2);
          continue;
        }
        context.fillStyle = (col + row) % 2 === 0 ? PALETTE.floorStone : PALETTE.floorStoneAlt;
        context.fillRect(x, y, TILE, TILE);
      }
    }
  }

  function drawLights(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const lamp of state.lanterns) {
      if (!lamp.lit) continue;
      const gradient = context.createRadialGradient(lamp.x, lamp.y, 8, lamp.x, lamp.y, LIGHT.lanternRadius);
      gradient.addColorStop(0, 'rgba(255, 210, 122, 0.30)');
      gradient.addColorStop(1, 'rgba(255, 210, 122, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(lamp.x, lamp.y, LIGHT.lanternRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawCones(world, state) {
    for (const guard of state.guards) {
      const points = world.conePolygon(guard.x, guard.y, guard.angle, CONE.halfAngle, CONE.range, CONE.rays);
      context.fillStyle = CONE_COLORS[guard.state] || CONE_COLORS.patrol;
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
      context.closePath();
      context.fill();
    }
    for (const camera of state.cameras) {
      const points = world.conePolygon(camera.x, camera.y, camera.angle, CAMERA.halfAngle, CAMERA.range, 14);
      context.fillStyle = camera.suspicion > 0.5 ? 'rgba(231, 76, 60, 0.30)' : 'rgba(127, 212, 255, 0.18)';
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
      context.closePath();
      context.fill();
    }
  }

  function drawLasers(state) {
    for (const laser of state.lasers) {
      context.strokeStyle = laser.active ? PALETTE.laser : 'rgba(255, 59, 48, 0.25)';
      context.lineWidth = laser.active ? 3 : 1;
      context.beginPath();
      context.moveTo(laser.ax, laser.ay);
      context.lineTo(laser.bx, laser.by);
      context.stroke();
      circle(laser.ax, laser.ay, 5, '#c8ccd4');
      circle(laser.bx, laser.by, 5, '#c8ccd4');
    }
  }

  function drawObjects(state) {
    const grid = state.grid;
    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid[row].length; col += 1) {
        const ch = grid[row][col];
        const x = col * TILE;
        const y = row * TILE;
        const cx = x + TILE / 2;
        const cy = y + TILE / 2;
        if (ch === 'C') {
          context.fillStyle = PALETTE.crate;
          context.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
          context.strokeStyle = PALETTE.crateEdge;
          context.lineWidth = 2;
          context.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
          context.beginPath();
          context.moveTo(x + 4, y + 4);
          context.lineTo(x + TILE - 4, y + TILE - 4);
          context.moveTo(x + TILE - 4, y + 4);
          context.lineTo(x + 4, y + TILE - 4);
          context.stroke();
        } else if (ch === 'P') {
          circle(cx, cy, 15, PALETTE.pillar);
          circle(cx, cy, 15, 'rgba(255,255,255,0.06)');
          context.strokeStyle = '#4a5470';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(cx, cy, 15, 0, Math.PI * 2);
          context.stroke();
        } else if (ch === 'D') {
          context.fillStyle = PALETTE.caseFrame;
          context.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          context.fillStyle = PALETTE.caseGlass;
          context.fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
          context.fillStyle = 'rgba(255,255,255,0.25)';
          context.fillRect(x + 10, y + 8, 5, TILE - 16);
        } else if (ch === 'T') {
          circle(cx, cy, 14, PALETTE.planter);
          circle(cx - 6, cy - 4, 7, PALETTE.planterLeaf);
          circle(cx + 6, cy - 5, 7, PALETTE.planterLeaf);
          circle(cx, cy + 5, 7, PALETTE.planterLeaf);
        } else if (ch === 'B') {
          context.fillStyle = PALETTE.bench;
          context.fillRect(x + 3, y + 10, TILE - 6, 16);
          context.fillStyle = '#5d4630';
          context.fillRect(x + 3, y + 10, TILE - 6, 4);
        } else if (ch === 'L') {
          const lamp = state.lanterns.find((l) => Math.abs(l.x - cx) < 2 && Math.abs(l.y - cy) < 2);
          circle(cx, cy, 7, lamp && lamp.lit ? PALETTE.lanternGlow : PALETTE.lanternOff);
          context.strokeStyle = '#8a6d3b';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(cx, cy, 10, 0, Math.PI * 2);
          context.stroke();
        } else if (ch === 'K') {
          context.fillStyle = PALETTE.camera;
          context.fillRect(cx - 6, cy - 5, 12, 10);
          circle(cx + 8, cy, 3, '#20242e');
        }
      }
    }
    // Exit hatch: green, glowing once it is open.
    if (state.exit) {
      const { x, y } = state.exit;
      context.fillStyle = state.exit.open ? PALETTE.exit : PALETTE.exitDark;
      context.fillRect(x - 14, y - 14, 28, 28);
      context.strokeStyle = '#eef1f5';
      context.lineWidth = 2;
      context.strokeRect(x - 14, y - 14, 28, 28);
      text('EXIT', x, y + 5, 11, '#eef1f5', 'center');
    }
    for (const item of state.loot) {
      if (item.taken) continue;
      context.save();
      context.translate(item.x, item.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.loot;
      context.fillRect(-7, -7, 14, 14);
      context.restore();
    }
    if (state.prize && !state.prize.taken) {
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      const gradient = context.createRadialGradient(state.prize.x, state.prize.y, 4, state.prize.x, state.prize.y, 34);
      gradient.addColorStop(0, `rgba(255, 233, 168, ${0.5 * pulse})`);
      gradient.addColorStop(1, 'rgba(255, 233, 168, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(state.prize.x, state.prize.y, 34, 0, Math.PI * 2);
      context.fill();
      context.save();
      context.translate(state.prize.x, state.prize.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.prize;
      context.fillRect(-11, -11, 22, 22);
      context.strokeStyle = '#8a6d3b';
      context.lineWidth = 2;
      context.strokeRect(-11, -11, 22, 22);
      context.restore();
    }
  }

  function drawActors(state) {
    for (const smoke of state.smokes) {
      const gradient = context.createRadialGradient(smoke.x, smoke.y, 4, smoke.x, smoke.y, 95);
      gradient.addColorStop(0, 'rgba(154, 160, 173, 0.55)');
      gradient.addColorStop(1, 'rgba(154, 160, 173, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(smoke.x, smoke.y, 95, 0, Math.PI * 2);
      context.fill();
    }
    for (const decoy of state.decoys) {
      circle(decoy.x, decoy.y, 8, PALETTE.decoy);
      context.fillStyle = '#20242e';
      context.beginPath();
      context.arc(decoy.x + 3, decoy.y - 2, 2, 0, Math.PI * 2);
      context.fill();
    }
    for (const coin of state.coins) {
      circle(coin.x, coin.y, 5, PALETTE.loot);
    }
    for (const guard of state.guards) {
      circle(guard.x, guard.y, 13, guard.state === 'chase' ? '#c0392b' : PALETTE.guard);
      context.strokeStyle = '#eef1f5';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(guard.x, guard.y);
      context.lineTo(guard.x + Math.cos(guard.angle) * 18, guard.y + Math.sin(guard.angle) * 18);
      context.stroke();
      // Suspicion arc over the guard's head.
      if (guard.suspicion > 0.05) {
        context.strokeStyle = guard.suspicion > 0.55 ? PALETTE.red : PALETTE.gold;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(guard.x, guard.y, 18, -Math.PI / 2, -Math.PI / 2 + guard.suspicion * Math.PI * 2);
        context.stroke();
      }
      if (guard.state === 'chase') text('!', guard.x, guard.y - 20, 20, PALETTE.red, 'center');
      else if (guard.state === 'investigate' || guard.state === 'search') text('?', guard.x, guard.y - 20, 20, PALETTE.gold, 'center');
      text(guard.name, guard.x, guard.y + 26, 10, PALETTE.muted, 'center');
    }
    for (const camera of state.cameras) {
      context.save();
      context.translate(camera.x, camera.y);
      context.rotate(camera.angle);
      context.fillStyle = PALETTE.camera;
      context.fillRect(-4, -6, 16, 12);
      context.restore();
      if (camera.suspicion > 0.05) {
        context.strokeStyle = PALETTE.red;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(camera.x, camera.y, 16, -Math.PI / 2, -Math.PI / 2 + camera.suspicion * Math.PI * 2);
        context.stroke();
      }
    }
    // Vane, the thief: teal, with a facing tick and a ring when lit.
    const p = state.player;
    if (p.invulnerable <= 0 || Math.floor(p.invulnerable * 10) % 2 === 1) {
      if (p.lit) {
        context.strokeStyle = 'rgba(255, 210, 122, 0.8)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(p.x, p.y, 17, 0, Math.PI * 2);
        context.stroke();
      }
      circle(p.x, p.y, PLAYER_RADIUS, PALETTE.player);
      context.strokeStyle = '#0d0f16';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + Math.cos(p.angle) * 17, p.y + Math.sin(p.angle) * 17);
      context.stroke();
      if (p.gait === 'sneak') text('sneak', p.x, p.y + 26, 10, PALETTE.muted, 'center');
    }
    for (const popup of state.popups) {
      context.globalAlpha = Math.min(1, popup.t);
      text(popup.text, popup.x, popup.y - (1.4 - popup.t) * 20, 15, popup.color, 'center');
      context.globalAlpha = 1;
    }
  }

  const PLAYER_RADIUS = 13;

  function drawHud(state) {
    context.fillStyle = 'rgba(13, 15, 22, 0.82)';
    context.fillRect(0, 0, FIELD.width, HUD_H);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, HUD_H - 2, FIELD.width, 2);
    const level = state.level;
    text(`HEIST ${state.levelIndex + 1}/5 — ${level.name.toUpperCase()}`, 16, 26, 17, PALETTE.text, 'left');
    text(`STEAL ${level.prize.toUpperCase()}${state.prizeGot ? ' — THEN ESCAPE' : ''}`, 16, 48, 13, state.prizeGot ? PALETTE.exit : PALETTE.gold, 'left');
    // Timer, centre.
    const minutes = Math.floor(state.timeLeft / 60);
    const seconds = Math.floor(state.timeLeft % 60);
    const timerText = `${minutes}:${String(seconds).padStart(2, '0')}`;
    text(timeLabel(timerText), FIELD.width / 2, 30, 26, state.timeLeft < 30 ? PALETTE.red : PALETTE.text, 'center');
    text(`PAR ${level.par}s`, FIELD.width / 2, 52, 12, PALETTE.muted, 'center');
    // Visibility eye + loot + alarm, right.
    const eyeX = FIELD.width - 330;
    text(state.player.lit ? '◉ LIT' : '◐ DARK', eyeX, 26, 15, state.player.lit ? PALETTE.lanternGlow : PALETTE.eye, 'left');
    text(state.player.gait.toUpperCase(), eyeX, 48, 12, PALETTE.muted, 'left');
    text(lootLabel(`◆ ${state.lootGot}/${state.lootTotal}`), FIELD.width - 220, 26, 16, PALETTE.loot, 'left');
    text(scoreLabel(state.score), FIELD.width - 220, 48, 13, PALETTE.muted, 'left');
    // Alarm meter.
    const ax = FIELD.width - 118;
    text('ALARM', ax, 20, 11, PALETTE.muted, 'left');
    for (let i = 0; i < 3; i += 1) {
      context.fillStyle = i < Math.round(state.alarm) ? PALETTE.red : '#2a3040';
      context.fillRect(ax + i * 26, 26, 22, 12);
    }
    text(`✕ ${state.strikes}/3`, ax, 52, 12, state.strikes > 0 ? PALETTE.red : PALETTE.muted, 'left');
    // Gadget belt along the bottom edge of the field.
    context.fillStyle = 'rgba(13, 15, 22, 0.72)';
    context.fillRect(0, FIELD.height - 30, FIELD.width, 30);
    const g = state.gadgets;
    text(`1 COIN ×${g.coin}   2 SMOKE ×${g.smoke}   3 NIGHTINGALE ×${g.decoy}   R DOUSE ×${g.douse}   ·   M MUTE   P PAUSE`, 16, FIELD.height - 10, 13, PALETTE.muted, 'left');
  }

  function drawAnnotations(annotations) {
    if (!annotations || !annotations.length) return;
    for (const note of annotations) {
      // Keep the label on the canvas: a note that points off the edge is
      // invisible, and only its leader line shows.
      const lx = Math.max(16, Math.min(1000, note.lx));
      const ly = Math.max(HUD_H + 20, Math.min(FIELD.height - 40, note.ly));
      context.strokeStyle = 'rgba(245, 185, 66, 0.9)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(note.x, note.y);
      context.lineTo(lx, ly);
      context.stroke();
      circle(note.x, note.y, 3, PALETTE.gold);
      text(note.text, lx, ly, 15, '#ffe9a8', note.align || 'left', 'italic Georgia, serif');
    }
  }

  function drawPanel(title, lines, prompt, titleColor) {
    const width = 640;
    const lineH = 30;
    const height = 120 + lines.length * lineH + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(13, 15, 22, 0.88)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 64, 44, titleColor || PALETTE.text, 'center', FONT_TITLE);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 116 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 20, PALETTE.gold, 'center');
  }

  function drawTitle(state, ui) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // A quiet backdrop: the first wing's floor, drawn dim.
    context.save();
    context.globalAlpha = 0.5;
    drawTiles(state);
    context.restore();
    context.fillStyle = 'rgba(13, 15, 22, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('THE GILDED HOUR', FIELD.width / 2, 150, 72, PALETTE.gold, 'center', FONT_TITLE);
    text('Five wings. One night. Steal the Hourglass.', FIELD.width / 2, 196, 22, PALETTE.text, 'center');
    text(`${CAMPAIGN.heists} heists · ${CAMPAIGN.guards} guards · ${CAMPAIGN.treasures} treasures · ${CAMPAIGN.gadgets} gadgets`, FIELD.width / 2, 232, 18, PALETTE.muted, 'center');
    const startY = 300;
    for (let i = 0; i < 5; i += 1) {
      const level = state.level;
      const unlocked = i <= ui.unlocked;
      const y = startY + i * 52;
      const label = `${i + 1}. ${['The Marble Atrium', 'The Hall of Kings', 'The Clockwork Gallery', 'The Gilded Salon', "The Director's Vault"][i]} — ${['The Jade Scarab', 'The Obsidian Diadem', 'The Brass Astrolabe', 'The Peacock Fan', 'The Gilded Hourglass'][i]}`;
      text(label, FIELD.width / 2, y, 20, unlocked ? PALETTE.text : '#4a5266', 'center');
      if (ui.best[i] !== undefined) text(`best ${ui.best[i]}`, FIELD.width / 2 + 330, y, 16, PALETTE.gold, 'left');
    }
    text('WASD / arrows to move · Shift sneak · Space sprint · 1 coin · 2 smoke · 3 nightingale · R douse · M mute · P pause', FIELD.width / 2, 600, 16, PALETTE.muted, 'center');
    text('Click or press Enter to play the next unlocked wing', FIELD.width / 2, 640, 18, PALETTE.gold, 'center');
    if (ui.bestScore > 0) text(`Campaign best ${ui.bestScore}`, FIELD.width / 2, 690, 16, PALETTE.muted, 'center');
  }

  function drawResults(state, ui) {
    const seals = ui.seals || { ghost: false, allLoot: false, underPar: false };
    const lines = [
      `${state.level.name} — ${state.level.prize} taken`,
      `Time ${state.time.toFixed(1)}s (par ${state.level.par}s) · Loot ${state.lootGot}/${state.lootTotal} · Spotted ${state.spotted}× · Strikes ${state.strikes}`,
      `Time bonus ${state.timeBonus} · Ghost ${seals.ghost ? '✓' : '—'} · All loot ${seals.allLoot ? '✓' : '—'} · Under par ${seals.underPar ? '✓' : '—'}`,
      `Score ${state.score} · Campaign best ${ui.bestScore}`,
    ];
    drawPanel(`RANK: ${ui.rank || 'GHOST'}`, lines, 'Enter — next wing · T — title', PALETTE.gold);
  }

  /** Paint one frame: the field, the HUD, the annotations, then the screen's panel. */
  function draw(world, state, screen, ui, annotations) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.textBaseline = 'alphabetic';
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawTiles(state);
    drawLights(state);
    drawCones(world, state);
    drawLasers(state);
    drawObjects(state);
    drawActors(state);
    drawAnnotations(annotations);
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The museum waits for you.'], 'P — resume · T — title');
    } else if (screen === SCREEN_CAUGHT) {
      drawPanel('Caught!', [`Strike ${state.strikes} of ${MAX_STRIKES}. The watch drags Vane back to the door.`, 'Your loot stays yours.'], 'Enter — keep going');
    } else if (screen === SCREEN_RESULTS) {
      drawResults(state, ui);
    } else if (screen === SCREEN_OVER) {
      drawPanel('The heist is blown', [state.failReason || 'Three strikes.', `Score ${state.score}`], 'Enter — retry this wing · T — title');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
