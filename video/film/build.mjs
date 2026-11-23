/* global console, process */
/**
 * Builds the demo film with ffmpeg from the recorded clips, caption overlays, narration, music and
 * sound effects. Each scene lasts as long as its narration needs (lead 0.35 s + speech + 0.6 s tail,
 * never shorter than its clip's useful part); a clip shorter than that holds its last frame.
 *
 * Usage: node video/film/build.mjs [--draft]   (draft: missing narration becomes silence of the
 *        estimated length, missing clips are skipped)
 * Output: video/out/envoy-demo.mp4 and video/out/envoy-demo.srt
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = resolve(HERE, '..');
const OUT = join(VIDEO, 'out');
const draft = process.argv.includes('--draft');
const FADE = 0.4;
const LEAD = 0.35;
const TAIL = 0.6;

const probe = (f) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

/** Sound effects per scene: [name, seconds from the scene start]. */
const SFX = {
  'n03-live': [['tick', 2.2], ['tick', 4.4]],
  'n06-approve': [['seal', -1.4]],
  'n07-guard': [['block', 2.6]],
  'n08-answer': [['whoosh', 0.2], ['restore', 4.5]],
  'n10-extension': [['tick', 1.6], ['restore', 6.0]],
  'n12-end': [['seal', 0.6]],
};
/** Clip time to skip at the start (page load) per scene. */
const SKIP = { 'n04-chat': 0.5, 'n05-recorder': 0.5 };

const lines = JSON.parse(readFileSync(join(VIDEO, 'narration.json'), 'utf8'));
const scenes = [];
for (const l of lines) {
  const clip = join(OUT, 'raw', `${l.id}.mp4`);
  if (!existsSync(clip)) {
    if (draft) {
      console.log(`skip ${l.id} (no clip yet)`);
      continue;
    }
    throw new Error(`missing clip ${clip}`);
  }
  const wav = join(VIDEO, 'wav', `${l.id}.wav`);
  const hasWav = existsSync(wav);
  if (!hasWav && !draft) throw new Error(`missing narration ${wav}`);
  const speech = hasWav ? probe(wav) : l.text.split(/\s+/).length / 2.5;
  const clipLen = probe(clip) - (SKIP[l.id] ?? 0);
  const need = LEAD + speech + TAIL;
  const dur = Math.max(l.id === 'n12-end' ? 5 : 3, need, Math.min(clipLen, need + 1.5));
  scenes.push({ ...l, clip, wav: hasWav ? wav : null, speech, clipLen, dur });
}

// Scene start times on the final timeline (crossfades overlap neighbours by FADE).
let t = 0;
for (const [i, s] of scenes.entries()) {
  s.start = t;
  t += s.dur - (i < scenes.length - 1 ? FADE : 0);
}
const total = t;

const args = ['-y', '-loglevel', 'error'];
const filters = [];
let input = 0;
const vids = [];
for (const s of scenes) {
  const vi = input++;
  args.push('-ss', String(SKIP[s.id] ?? 0), '-i', s.clip);
  const pad = Math.max(0, s.dur - s.clipLen + 0.1);
  filters.push(
    `[${vi}:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},trim=duration=${s.dur.toFixed(3)},setpts=PTS-STARTPTS[v${vi}]`,
  );
  let last = `v${vi}`;
  const chip = join(OUT, 'overlays', `${s.id === 'n12-end' ? 'n12-links' : s.id}.png`);
  if (existsSync(chip)) {
    const ci = input++;
    args.push('-loop', '1', '-t', s.dur.toFixed(3), '-i', chip);
    filters.push(
      `[${ci}:v]format=rgba,fade=in:st=0.35:d=0.45:alpha=1,fade=out:st=${(s.dur - 0.7).toFixed(3)}:d=0.45:alpha=1[c${ci}]`,
      `[${last}][c${ci}]overlay=0:0[o${ci}]`,
    );
    last = `o${ci}`;
  }
  if (s.id === 'n05-recorder') {
    const wi = input++;
    args.push('-loop', '1', '-t', s.dur.toFixed(3), '-i', join(OUT, 'overlays', 'wait-cut.png'));
    filters.push(
      `[${wi}:v]format=rgba,fade=in:st=0.6:d=0.4:alpha=1,fade=out:st=${Math.min(6, s.dur - 0.8).toFixed(3)}:d=0.4:alpha=1[w${wi}]`,
      `[${last}][w${wi}]overlay=0:0[ow${wi}]`,
    );
    last = `ow${wi}`;
  }
  vids.push(last);
}
// Crossfade chain.
let chain = vids[0];
let offset = 0;
for (let i = 1; i < vids.length; i++) {
  offset += scenes[i - 1].dur - FADE;
  const outLabel = i === vids.length - 1 ? 'vout' : `x${i}`;
  filters.push(`[${chain}][${vids[i]}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${outLabel}]`);
  chain = outLabel;
}
if (vids.length === 1) filters.push(`[${chain}]null[vout]`);
filters.push(`[vout]fade=in:st=0:d=0.6,fade=out:st=${(total - 0.8).toFixed(3)}:d=0.8,format=yuv420p[video]`);

// Audio: narration, effects, music ducked under the voice.
const voice = [];
for (const s of scenes) {
  if (!s.wav) continue;
  const ai = input++;
  args.push('-i', s.wav);
  const ms = Math.round((s.start + LEAD) * 1000);
  filters.push(`[${ai}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${ai}]`);
  voice.push(`[n${ai}]`);
}
const fx = [];
for (const s of scenes) {
  for (const [name, at] of SFX[s.id] ?? []) {
    const fi = input++;
    args.push('-i', join(VIDEO, 'audio', 'out', `sfx-${name}.wav`));
    const when = at < 0 ? s.start + s.dur + at : s.start + at;
    const ms = Math.round(when * 1000);
    filters.push(`[${fi}:a]volume=0.55,adelay=${ms}|${ms}[f${fi}]`);
    fx.push(`[f${fi}]`);
  }
}
const mi = input;
args.push('-i', join(VIDEO, 'audio', 'out', 'music.wav'));
filters.push(`[${mi}:a]atrim=duration=${total.toFixed(3)},afade=t=out:st=${(total - 3).toFixed(3)}:d=3,volume=0.32[music]`);
if (voice.length) {
  filters.push(`${voice.join('')}amix=inputs=${voice.length}:normalize=0[voice]`, `[voice]asplit=2[voice1][voice2]`);
  filters.push(`[music][voice2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[ducked]`);
  filters.push(`[voice1][ducked]${fx.join('')}amix=inputs=${2 + fx.length}:normalize=0:duration=longest[mix]`);
} else {
  filters.push(`[music]${fx.join('')}amix=inputs=${1 + fx.length}:normalize=0:duration=longest[mix]`);
}
filters.push(`[mix]atrim=duration=${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[audio]`);

const outFile = join(OUT, draft ? 'envoy-demo-draft.mp4' : 'envoy-demo.mp4');
args.push(
  '-filter_complex', filters.join(';'),
  '-map', '[video]', '-map', '[audio]',
  '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'slow', '-crf', draft ? '26' : '18', '-r', '30',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', outFile,
);
console.log(`${scenes.length} scenes, ${total.toFixed(1)} s -> ${outFile}`);
execFileSync('ffmpeg', args, { stdio: 'inherit' });

// English subtitles for YouTube, timed to the narration.
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};
const srt = scenes
  .map((s, i) => `${i + 1}\n${ts(s.start + LEAD)} --> ${ts(s.start + LEAD + s.speech)}\n${s.text}\n`)
  .join('\n');
writeFileSync(outFile.replace(/\.mp4$/, '.srt'), srt);
for (const s of scenes) console.log(`${s.id.padEnd(14)} start ${s.start.toFixed(1).padStart(6)} s  dur ${s.dur.toFixed(1)} s  speech ${s.speech.toFixed(1)} s  clip ${s.clipLen.toFixed(1)} s`);
