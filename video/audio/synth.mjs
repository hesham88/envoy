/* global console, process, Buffer */
/**
 * Envoy's soundtrack, synthesised from code: an original ambient music bed and the UI sound effects.
 * No samples, no third-party audio: everything here is ours (Apache-2.0 with the repo). Deterministic:
 * the same seconds give byte-identical files.
 *
 * Usage: node video/audio/synth.mjs <music-seconds>   -> video/audio/out/{music,sfx-*}.wav
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(OUT, { recursive: true });
const SR = 44100;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function wav(name, left, right = left) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(join(OUT, `${name}.wav`), buf);
  console.log(`${name}.wav  ${(n / SR).toFixed(2)} s`);
}

/** A small stereo reverb: four feedback combs per side, then soft mixing. */
function reverb(x, mix = 0.28) {
  const out = [new Float32Array(x.length), new Float32Array(x.length)];
  const sets = [
    [1557, 1617, 1491, 1422],
    [1277, 1356, 1188, 1116],
  ];
  sets.forEach((delays, side) => {
    for (const d of delays) {
      const len = Math.round((d * SR) / 25000);
      const line = new Float32Array(len);
      let idx = 0;
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        const y = line[idx];
        lp = y * 0.6 + lp * 0.4; // damping
        line[idx] = x[i] + lp * 0.82;
        idx = (idx + 1) % len;
        out[side][i] += y / delays.length;
      }
    }
    for (let i = 0; i < x.length; i++) out[side][i] = x[i] * (1 - mix) + out[side][i] * mix;
  });
  return out;
}

function normalize(chs, peak = 0.7) {
  let m = 0;
  for (const c of chs) for (const v of c) m = Math.max(m, Math.abs(v));
  const g = m ? peak / m : 1;
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
  return chs;
}

// ---------- music: calm, hopeful, D dorian; pads + soft plucks at 84 BPM ----------
function music(seconds) {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  const bar = (60 / 84) * 4; // seconds per bar
  // Chords as MIDI notes (two bars each): Dm9, Bbmaj7, Fmaj7/A, C6/G
  const chords = [
    [50, 57, 60, 64, 65],
    [46, 53, 57, 62, 65],
    [45, 53, 57, 60, 64],
    [43, 52, 55, 60, 64],
  ];
  const chordLen = bar * 2;
  // Pads: slow attack and release, gently detuned sines with a soft second harmonic.
  for (let c = 0; c * chordLen < seconds + chordLen; c++) {
    const notes = chords[c % chords.length];
    const start = c * chordLen;
    const len = chordLen + 1.5;
    for (const note of notes) {
      const f = hz(note);
      for (const det of [-0.0025, 0.0025]) {
        const s0 = Math.round(start * SR);
        const s1 = Math.min(n, Math.round((start + len) * SR));
        for (let i = s0; i < s1; i++) {
          const t = (i - s0) / SR;
          const env = Math.min(1, t / 1.6) * Math.min(1, (len - t) / 1.5);
          const ph = TAU * f * (1 + det) * t;
          x[i] += env * (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * 0.035;
        }
      }
    }
  }
  // Plucks: an eighth-note arpeggio from the chord, high and quiet, from bar 3.
  const eighth = 60 / 84 / 2;
  for (let k = 0; k * eighth < seconds; k++) {
    const t0 = k * eighth;
    if (t0 < bar * 2) continue;
    const notes = chords[Math.floor(t0 / chordLen) % chords.length];
    const pattern = [4, 2, 3, 1, 4, 3, 2, 3];
    const note = notes[pattern[k % pattern.length]] + 12;
    const f = hz(note);
    const s0 = Math.round(t0 * SR);
    const dur = Math.round(1.2 * SR);
    const accent = k % 4 === 0 ? 1 : 0.7;
    for (let i = 0; i < dur && s0 + i < n; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 4.5) * Math.min(1, t / 0.004);
      x[s0 + i] +=
        env * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t)) * 0.028 * accent;
    }
  }
  // Fade in and out.
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    x[i] *= Math.min(1, t / 3) * Math.min(1, (seconds - t) / 4);
  }
  return normalize(reverb(x, 0.35), 0.5);
}

// ---------- sound effects ----------
function tone(seconds, fn) {
  const n = Math.round(seconds * SR);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = fn(i / SR);
  return x;
}
/** Soft glass tick: a detail turns into a tag. */
const tick = () =>
  normalize(
    reverb(
      tone(
        0.5,
        (t) => Math.exp(-t * 28) * (Math.sin(TAU * 2093 * t) + 0.4 * Math.sin(TAU * 3136 * t)),
      ),
      0.2,
    ),
    0.45,
  );
/** The seal: approve and send. Two rising notes, warm. */
const seal = () =>
  normalize(
    reverb(
      tone(1.6, (t) => {
        const a = Math.exp(-t * 3.2) * Math.sin(TAU * hz(74) * t);
        const b = t > 0.12 ? Math.exp(-(t - 0.12) * 3) * Math.sin(TAU * hz(81) * (t - 0.12)) : 0;
        return (a + b) * Math.min(1, t / 0.006);
      }),
      0.35,
    ),
    0.5,
  );
/** Whoosh: the excerpt leaves for the cloud. Filtered noise with a rising sweep (seeded). */
const whoosh = () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  let lp = 0;
  const x = tone(1.1, (t) => {
    const env = Math.sin((Math.PI * Math.min(t, 1.1)) / 1.1) ** 2;
    const cut = 0.02 + 0.25 * (t / 1.1);
    lp += cut * (rnd() - lp);
    return lp * env;
  });
  return normalize(reverb(x, 0.3), 0.35);
};
/** Guard block: a short low thud with a muted second hit. */
const block = () =>
  normalize(
    reverb(
      tone(0.7, (t) => {
        const hit = (t0) =>
          t > t0 ? Math.exp(-(t - t0) * 18) * Math.sin(TAU * 110 * (t - t0)) : 0;
        return hit(0) + 0.6 * hit(0.11);
      }),
      0.2,
    ),
    0.55,
  );
/** Restore: a soft rising shimmer as real values come back. */
const restore = () =>
  normalize(
    reverb(
      tone(1.4, (t) => {
        let v = 0;
        [76, 79, 83, 86].forEach((m, i) => {
          const t0 = i * 0.08;
          if (t > t0) v += Math.exp(-(t - t0) * 4) * Math.sin(TAU * hz(m) * (t - t0));
        });
        return v * 0.5;
      }),
      0.4,
    ),
    0.4,
  );

/**
 * Typing: 40 s of keystrokes on a laptop keyboard (seeded, so every build is the same). Each key is
 * a short band-limited click plus a soft low thock; the rhythm is uneven like a person typing, with
 * a longer pause now and then (a space, a thought). The film trims it to each typing moment.
 */
const typing = () => {
  // mulberry32: integer-exact, unlike an LCG multiplied in doubles (which loses precision and sticks).
  let s = 424242;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const n = Math.round(40 * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  let t = 0.05;
  let k = 0;
  while (t < 39.8) {
    const start = Math.round(t * SR);
    const gain = 0.55 + 0.45 * rnd();
    const pan = 0.35 + 0.3 * rnd();
    const pitch = 0.85 + 0.3 * rnd();
    let hp = 0;
    let prev = 0;
    const len = Math.round(0.06 * SR);
    for (let i = 0; i < len && start + i < n; i++) {
      const u = i / SR;
      const noise = rnd() * 2 - 1;
      hp = 0.82 * (hp + noise - prev); // high-pass: the click
      prev = noise;
      const click = hp * Math.exp(-u * 160) * 0.9;
      const thock = Math.sin(TAU * 190 * pitch * u) * Math.exp(-u * 70) * 0.55;
      const v = (click + thock) * gain;
      l[start + i] += v * (1 - pan);
      r[start + i] += v * pan;
    }
    k++;
    t += 0.075 + 0.07 * rnd() + (k % (5 + Math.floor(rnd() * 4)) === 0 ? 0.12 + 0.15 * rnd() : 0);
  }
  return normalize([reverb(l, 0.08)[0], reverb(r, 0.08)[1]], 0.5);
};

const seconds = Number(process.argv[2] ?? 150);
const [ml, mr] = music(seconds);
wav('music', ml, mr);
for (const [name, fx] of Object.entries({ tick, seal, whoosh, block, restore, typing })) {
  const [l, r] = fx();
  wav(`sfx-${name}`, l, r);
}
