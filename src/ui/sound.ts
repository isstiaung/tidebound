// Tiny synthesized sound effects. No audio files, works offline.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  if (m) {
    ambience?.stop();
    ambience = null;
  }
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; glide?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.glide) osc.frequency.exponentialRampToValueAtTime(opts.glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.15, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  select: () => tone(660, 0.08, { type: 'triangle', gain: 0.05 }),
  play: () => {
    tone(150, 0.18, { type: 'triangle', gain: 0.22, glide: 90 });
    tone(900, 0.05, { type: 'square', gain: 0.02 });
  },
  flip: () => {
    tone(520, 0.35, { gain: 0.07, glide: 780 });
    tone(780, 0.4, { gain: 0.05, delay: 0.08, glide: 1040 });
  },
  pull: () => tone(400, 0.35, { type: 'sawtooth', gain: 0.04, glide: 120 }),
  seal: (good: boolean) => {
    const base = good ? 523.25 : 392;
    [1, 1.25, 1.5].forEach((m, i) => tone(base * m, 0.9, { gain: 0.06, delay: i * 0.05 }));
  },
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.6, { gain: 0.08, delay: i * 0.12 })),
  lose: () => [440, 392, 349.23, 293.66].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.08, delay: i * 0.14 })),
};

// ---------------------------------------------------------------------------
// Ambience: surf (filtered noise that swells like waves) under a slow pad.

let ambience: { stop: () => void } | null = null;
let ambienceWanted = false;

export function setAmbience(on: boolean) {
  ambienceWanted = on;
  if (!on || muted) {
    ambience?.stop();
    ambience = null;
    return;
  }
  if (ambience) return;
  const a = ac();
  if (!a) return;

  const master = a.createGain();
  master.gain.setValueAtTime(0.0001, a.currentTime);
  master.gain.exponentialRampToValueAtTime(1, a.currentTime + 3);
  master.connect(a.destination);

  // Brown noise for surf.
  const len = a.sampleRate * 4;
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = a.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const surf = a.createGain();
  surf.gain.value = 0.05;
  const swell = a.createOscillator();
  swell.frequency.value = 0.09;
  const swellDepth = a.createGain();
  swellDepth.gain.value = 0.035;
  swell.connect(swellDepth).connect(surf.gain);
  noise.connect(lp).connect(surf).connect(master);

  // A low, slowly breathing chord.
  const pad = a.createGain();
  pad.gain.value = 0.012;
  const breath = a.createOscillator();
  breath.frequency.value = 0.05;
  const breathDepth = a.createGain();
  breathDepth.gain.value = 0.008;
  breath.connect(breathDepth).connect(pad.gain);
  const oscs = [110, 164.81, 220.5, 277.18].map((f) => {
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(pad);
    return o;
  });
  pad.connect(master);

  const nodes = [noise, swell, breath, ...oscs];
  nodes.forEach((n) => n.start());
  ambience = {
    stop: () => {
      const t = a.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      nodes.forEach((n) => n.stop(t + 0.7));
    },
  };
}

export function refreshAmbience() {
  setAmbience(ambienceWanted);
}
