// Every tuning number and colour in one place. The playfield is a fixed 1280x800
// logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. One tile is 40 px, so a heist is a 32 by 20 room grid.

export const FIELD = { width: 1280, height: 800 };

export const TILE = 40;
export const COLS = 32;
export const ROWS = 20;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Seconds a heist may run before the night watch locks the wing down. */
export const TIME_LIMIT = 240;

/** Strikes before a heist is blown and Vane is dragged out. */
export const MAX_STRIKES = 3;

/** Three gaits: sneak is silent but slow, walk is the default, sprint is fast and loud. */
export const GAIT = {
  sneak: { speed: 58, noise: 0, visibility: 0.55 },
  walk: { speed: 118, noise: 104, visibility: 1.0 },
  sprint: { speed: 215, noise: 170, visibility: 1.4 },
};

export const PLAYER = { radius: 13 };

/** A guard's vision cone: a raycast fan, 70 degrees wide, 252 px long. */
export const CONE = {
  halfAngle: (35 * Math.PI) / 180,
  range: 252,
  /** Closer than this, a guard sees Vane even in the dark. */
  nearRange: 96,
  rays: 24,
};

/** Suspicion runs 0 to 1. At 0.55 a guard leaves his post to look. */
export const SUSPICION = {
  rise: 0.82,
  decay: 0.2,
  investigateAt: 0.55,
  /** Seconds of not seeing Vane before suspicion starts to fall. */
  grace: 0.9,
};

/** Light: a lantern pool reaches 150 px; a guard's hand lamp reaches 84 px. */
export const LIGHT = {
  lanternRadius: 150,
  handLampRadius: 84,
  /** Below this lit value, the dark halves how fast a guard's suspicion rises. */
  litThreshold: 0.3,
  darkFactor: 0.45,
};

/** A camera's sweeping cone: narrower and shorter than a guard's. */
export const CAMERA = { halfAngle: (22 * Math.PI) / 180, range: 190, sweepSpeed: 0.45 };

/** Gadgets. A coin is thrown and pings where it lands; smoke blinds a cone;
 *  douse kills a lantern; the nightingale walks and chirps, and guards follow it. */
export const GADGETS = {
  coin: { count: 3, range: 330, noise: 236, label: 'COIN' },
  smoke: { count: 2, radius: 95, seconds: 6, label: 'SMOKE' },
  douse: { count: 3, range: 100, label: 'DOUSE' },
  decoy: { count: 1, seconds: 4, noise: 260, speed: 90, label: 'NIGHTINGALE' },
};

/** How far a noise carries, and how far a guard will walk to check one. */
export const NOISE = { coinHear: 320, footstepHear: 150, investigateRadius: 340 };

/** Alarm: 0 calm, 1 stirred, 2 hunting, 3 lockdown (every guard chases). */
export const ALARM = { max: 3, decayPerSecond: 0.05 };

export const PALETTE = {
  backdrop: '#0d0f16',
  floorStone: '#232a3a',
  floorStoneAlt: '#202636',
  floorWood: '#3a2f24',
  carpet: '#40242a',
  carpetTrim: '#54303a',
  wall: '#141824',
  wallTop: '#2c3448',
  pillar: '#39415a',
  crate: '#4a3823',
  crateEdge: '#6b5433',
  caseGlass: '#31445e',
  caseFrame: '#8a6d3b',
  planter: '#2c4a2e',
  planterLeaf: '#3d8a4c',
  bench: '#3d2f22',
  lanternGlow: '#ffd27a',
  lanternOff: '#4a4a52',
  player: '#6ff0dd',
  playerDark: '#2a8a7d',
  guard: '#8f2f2a',
  guardDark: '#5d1f1c',
  guardAmber: '#ff9a2e',
  camera: '#c8ccd4',
  laser: '#ff3b30',
  loot: '#ffd166',
  prize: '#ffe9a8',
  exit: '#39d353',
  exitDark: '#1d6b2e',
  smoke: '#9aa0ad',
  decoy: '#e8b64c',
  panel: '#171b28',
  panelEdge: '#3a435e',
  text: '#eef1f5',
  muted: '#9aa3b5',
  gold: '#f5b942',
  red: '#e74c3c',
  eye: '#7fd4ff',
};

export const FONT_TITLE = 'Georgia, "Times New Roman", serif';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'gilded-hour.save.v1';
export const BEST_KEY = 'gilded-hour.best.v1';
