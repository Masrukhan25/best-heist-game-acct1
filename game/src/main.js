// Boot and the game loop. Screens: title, play, paused, caught, results,
// over. ?shot=cover|spotted|lure|win stages one frozen scene instead of a
// playable game and raises window.__shotReady once it is drawn, so a
// screenshot runner knows the frame is complete. Progress (unlocked wings,
// best scores) lives in localStorage under one key.
import { createWorld, EVENT_ALARM, EVENT_CAUGHT, EVENT_FAIL, EVENT_LOOT, EVENT_PRIZE, EVENT_WIN } from './world.js';
import { createInput, ACTION_COIN, ACTION_CONFIRM, ACTION_DECOY, ACTION_DOUSE, ACTION_MUTE, ACTION_PAUSE, ACTION_SMOKE } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_RESULTS, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'gilded-hour-save-v1';
const SHOT_PARAM = new URLSearchParams(window.location.search).get('shot');

function loadSave() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return {
        unlocked: Math.max(0, Math.min(4, saved.unlocked | 0)),
        best: saved.best && typeof saved.best === 'object' ? saved.best : {},
        bestScore: saved.bestScore | 0,
      };
    }
  } catch {
    // A corrupt save starts fresh.
  }
  return { unlocked: 0, best: {}, bestScore: 0 };
}

function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode: the game still plays, it just forgets.
  }
}

const canvas = document.getElementById('game');
let world = createWorld();
const input = createInput(canvas);
const audio = createAudio();
const renderer = createRenderer(canvas);
const save = loadSave();

let screen = SCREEN_TITLE;
let levelIndex = 0;
let ui = { unlocked: save.unlocked, best: save.best, bestScore: save.bestScore, rank: '', seals: null };
let annotations = [];
let shotStaged = null;
let lastTime = performance.now();
let stepSoundT = 0;

function startLevel(index) {
  levelIndex = index;
  world.loadLevel(index);
  annotations = [];
  screen = SCREEN_PLAY;
}

function openTitle() {
  world.loadLevel(Math.min(save.unlocked, 4));
  screen = SCREEN_TITLE;
}

function finishLevel() {
  const state = world.state;
  const score = state.score;
  const idx = state.levelIndex;
  if (score > (save.best[idx] || 0)) save.best[idx] = score;
  if (idx < 4 && save.unlocked < idx + 1) save.unlocked = idx + 1;
  const total = Object.values(save.best).reduce((a, b) => a + b, 0);
  save.bestScore = total;
  storeSave(save);
  ui = { unlocked: save.unlocked, best: save.best, bestScore: save.bestScore, rank: world.rank(), seals: world.seals() };
}

function handlePlayInput(dt) {
  const actions = input.takeActions();
  const move = input.move();
  const mouse = input.mouse();
  const state = world.state;
  const worldInput = {
    moveX: move.x,
    moveY: move.y,
    sneak: input.sneak(),
    sprint: input.sprint(),
    throwCoin: null,
    useSmoke: false,
    useDecoy: false,
    useDouse: false,
  };
  if (actions & ACTION_COIN) {
    worldInput.throwCoin = mouse || { x: state.player.x + 200, y: state.player.y };
  }
  if (actions & ACTION_SMOKE) worldInput.useSmoke = true;
  if (actions & ACTION_DECOY) worldInput.useDecoy = true;
  if (actions & ACTION_DOUSE) worldInput.useDouse = true;
  if (actions & ACTION_MUTE) audio.toggleMute();
  if (actions & ACTION_PAUSE) {
    screen = SCREEN_PAUSED;
    return;
  }
  const events = world.step(dt, worldInput);
  if (events & EVENT_LOOT) audio.loot();
  if (events & EVENT_PRIZE) audio.prize();
  if (events & EVENT_CAUGHT) {
    audio.caught();
    screen = SCREEN_CAUGHT;
    return;
  }
  if (events & EVENT_WIN) {
    audio.win();
    finishLevel();
    screen = SCREEN_RESULTS;
    return;
  }
  if (events & EVENT_FAIL) {
    screen = SCREEN_OVER;
    return;
  }
  if (events & EVENT_ALARM) audio.setAlarm(true);
  else if (state.alarm <= 0) audio.setAlarm(false);
  if (state.player.moving) {
    stepSoundT -= dt;
    if (stepSoundT <= 0) {
      audio.step();
      stepSoundT = state.player.gait === 'sneak' ? 0.55 : 0.38;
    }
  }
}

function handlePanelInput() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.toggleMute();
  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) startLevel(Math.min(save.unlocked, 4));
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
    return;
  }
  if (screen === SCREEN_CAUGHT) {
    if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
    return;
  }
  if (screen === SCREEN_RESULTS) {
    if (actions & ACTION_CONFIRM) {
      if (levelIndex < 4 && levelIndex < save.unlocked) startLevel(levelIndex + 1);
      else openTitle();
    }
    return;
  }
  if (screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) startLevel(levelIndex);
  }
}

function frame(now) {
  const dt = Math.min(1 / 30, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (shotStaged) {
    renderer.draw(world, world.state, screen, ui, annotations);
    return;
  }
  if (screen === SCREEN_PLAY) handlePlayInput(dt);
  else handlePanelInput();
  renderer.draw(world, world.state, screen, ui, annotations);
  window.requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
});
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

if (SHOT_PARAM) {
  const staged = stageShot(SHOT_PARAM);
  if (staged) {
    shotStaged = staged;
    world = staged.world;
    annotations = staged.annotations || [];
    if (SHOT_PARAM === 'win') {
      ui = { ...ui, rank: staged.result.rank, seals: world.seals() };
      screen = SCREEN_RESULTS;
    } else {
      screen = SCREEN_PLAY;
    }
    renderer.draw(world, world.state, screen, ui, annotations);
    window.__shotReady = true;
    window.__shotResult = staged.result;
  } else {
    openTitle();
    window.requestAnimationFrame(frame);
  }
} else {
  openTitle();
  window.requestAnimationFrame(frame);
}
