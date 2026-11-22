// Sound, synthesised with WebAudio: no audio files, nothing to download.
// A low drone under everything, a soft step, a coin clink, a rising alarm
// while a guard chases, and a chime when the prize is taken. M toggles mute.
// Everything is guarded: in a headless screenshot run there may be no audio
// device at all, and the game must never care.

export function createAudio() {
  let context = null;
  let master = null;
  let drone = null;
  let muted = false;
  let alarmOsc = null;
  let alarmGain = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function startDrone() {
    if (!ensure() || drone) return;
    try {
      drone = context.createOscillator();
      const gain = context.createGain();
      drone.type = 'sine';
      drone.frequency.value = 55;
      gain.gain.value = 0.05;
      const wobble = context.createOscillator();
      const wobbleGain = context.createGain();
      wobble.frequency.value = 0.07;
      wobbleGain.gain.value = 0.02;
      wobble.connect(wobbleGain);
      wobbleGain.connect(gain.gain);
      drone.connect(gain);
      gain.connect(master);
      drone.start();
      wobble.start();
    } catch {
      drone = null;
    }
  }

  function blip(frequency, seconds, type, volume, when) {
    if (!ensure()) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume || 0.12, context.currentTime + (when || 0));
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (when || 0) + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(context.currentTime + (when || 0));
      osc.stop(context.currentTime + (when || 0) + seconds + 0.02);
    } catch {
      // Silence is fine.
    }
  }

  return {
    /** Call from the first user gesture; browsers need one before sound. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
      startDrone();
    },
    step() { blip(190, 0.05, 'triangle', 0.03); },
    coin() { blip(2093, 0.12, 'sine', 0.14); blip(2637, 0.18, 'sine', 0.1, 0.06); },
    loot() { blip(880, 0.1, 'sine', 0.12); blip(1318, 0.16, 'sine', 0.1, 0.07); },
    prize() {
      blip(523, 0.14, 'sine', 0.14);
      blip(659, 0.14, 'sine', 0.14, 0.1);
      blip(784, 0.22, 'sine', 0.14, 0.2);
      blip(1046, 0.3, 'sine', 0.12, 0.3);
    },
    caught() { blip(220, 0.25, 'sawtooth', 0.16); blip(165, 0.3, 'sawtooth', 0.16, 0.12); },
    win() {
      blip(523, 0.16, 'sine', 0.14);
      blip(659, 0.16, 'sine', 0.14, 0.12);
      blip(784, 0.16, 'sine', 0.14, 0.24);
      blip(1046, 0.34, 'sine', 0.14, 0.36);
    },
    setAlarm(on) {
      if (!ensure()) return;
      try {
        if (on && !alarmOsc) {
          alarmOsc = context.createOscillator();
          alarmGain = context.createGain();
          alarmOsc.type = 'sine';
          alarmOsc.frequency.value = 440;
          alarmGain.gain.value = 0.0;
          alarmOsc.connect(alarmGain);
          alarmGain.connect(master);
          alarmOsc.start();
          alarmGain.gain.linearRampToValueAtTime(0.05, context.currentTime + 0.4);
        } else if (!on && alarmOsc) {
          const osc = alarmOsc;
          const gain = alarmGain;
          alarmOsc = null;
          alarmGain = null;
          gain.gain.linearRampToValueAtTime(0.0, context.currentTime + 0.3);
          osc.stop(context.currentTime + 0.35);
        }
      } catch {
        alarmOsc = null;
        alarmGain = null;
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
  };
}
