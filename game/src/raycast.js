// Raycasting against the tile grid: a guard's cone is a fan of rays clipped by
// whatever blocks sight, and line of sight is one ray from eye to target.
// Tiles that block sight: walls and tall cover (crates, pillars, cases, benches).
// Planters, lanterns, loot and the exit never block sight.
import { TILE } from './config.js';

const BLOCKS_SIGHT = new Set(['#', 'C', 'P', 'D', 'B']);

export function blocksSight(tile) {
  return BLOCKS_SIGHT.has(tile);
}

function tileAt(grid, col, row) {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[row].length) return '#';
  return grid[row][col];
}

/**
 * Cast one ray from (x, y) along `angle` for at most maxDist px.
 * Returns the distance to the first sight-blocking tile, or maxDist.
 * DDA over the tile grid: each step crosses one tile boundary.
 */
export function castRay(grid, x, y, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let col = Math.floor(x / TILE);
  let row = Math.floor(y / TILE);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(TILE / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(TILE / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (col + 1) * TILE - x : x - col * TILE) / Math.abs(dx));
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (row + 1) * TILE - y : y - row * TILE) / Math.abs(dy));
  let t = 0;
  // The tile the ray starts in never blocks it: step out of it first.
  for (let guard = 0; guard < 200; guard += 1) {
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      col += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      row += stepY;
    }
    if (t >= maxDist) return maxDist;
    if (blocksSight(tileAt(grid, col, row))) return t;
  }
  return maxDist;
}

/** True when nothing blocks sight between the two points. */
export function hasLineOfSight(grid, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  return castRay(grid, x0, y0, Math.atan2(dy, dx), dist) >= dist - 1;
}

/**
 * The vision cone as a polygon: the eye, then one hit point per ray across
 * the fan. The renderer fills it; the world reuses the same fan to test
 * whether a point lies inside the cone.
 */
export function conePolygon(grid, x, y, angle, halfAngle, range, rays) {
  const points = [{ x, y }];
  for (let i = 0; i <= rays; i += 1) {
    const a = angle - halfAngle + (2 * halfAngle * i) / rays;
    const d = castRay(grid, x, y, a, range);
    points.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d });
  }
  return points;
}

/** Cheap cone test without building a polygon: range, angle, then one ray. */
export function inCone(grid, x, y, angle, halfAngle, range, tx, ty) {
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  let diff = Math.atan2(dy, dx) - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > halfAngle) return false;
  return castRay(grid, x, y, Math.atan2(dy, dx), dist) >= dist - 1;
}
