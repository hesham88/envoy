/* global console, process */
/**
 * Builds the demo film (v2) with ffmpeg. Two passes:
 *  1. each scene is composed on its own: animated night background + guilloche, the footage in a
 *     framed card with a slow camera move (held on its last frame if the voice needs longer), the
 *     caption sliding in from its margin, and a wait-cut note where a wait was cut;
 *  2. the scenes are joined with directed transitions (layout.mjs), and the narration, music
 *     (ducked under the voice), keyboard sounds at the recorded typing moments, and effects are mixed
 *     and normalised to -16 LUFS. English subtitles (.srt) come from the narration.
 *
 * Usage: node video/film/build.mjs [--v7] [--draft] [--reuse]   (draft: a missing clip becomes a placeholder
 *        card; reuse: keep scenes already composed and only redo pass 2)
 * Output: video/out/envoy-demo.mp4 (+ .srt), or envoy-demo-draft.mp4
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, H, LAYOUTS, SCENES, W } from './layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIDEO = resolve(HERE, '..');
const OUT = join(VIDEO, 'out');
const RAW = join(OUT, 'raw');
const OV = join(OUT, 'overlays');
const PARTS = join(OUT, process.argv.includes('--v7') ? 'scenes-v7' : 'scenes');
const SFX = join(VIDEO, 'audio', 'out');
mkdirSync(PARTS, { recursive: true });
const draft = process.argv.includes('--draft');
const reuse = process.argv.includes('--reuse');
// --flash: the cut where Gemini 3.5 Flash-Lite answers (video/narration-flash.json overrides lines,
// voice files <id>-flash.wav and captions cap-<id>-flash.png).
const flash = process.argv.includes('--flash'); // keep scenes already composed (pass 1)
// --v7: the 26 Nov cut (narration-v7.json, voices in wav7/, out/envoy-demo-v7.mp4); v6 stays as it is.
const v7 = process.argv.includes('--v7');
const NARRATION = v7 ? 'narration-v7.json' : 'narration.json';
const VOICES = v7 ? 'wav7' : 'wav3';
const LEAD = 0.45;
const TAIL = 0.65;
const FPS = 30;

const probe = (f) =>
  Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      f,
    ])
      .toString()
      .trim(),
  );
const readJson = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback);
const ffmpeg = (args) =>
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// ---------- the private take: map its master times onto each scene's own clock ----------
const take = readJson(join(RAW, 'private-marks.json'), { marks: {}, typing: [] });
const cuts = readJson(join(RAW, 'private-cuts.json'), {});
const onScene = (id, t) => {
  let offset = 0;
  for (const [a, b] of cuts[id] ?? []) {
    if (t >= a && t <= b) return offset + t - a;
    offset += b - a;
  }
  return null;
};
const pairs = (list) => {
  const out = [];
  for (let i = 0; i + 1 < list.length; i += 2) out.push([list[i].at, list[i + 1].at]);
  return out;
};

/** Sounds per scene: { typing: [[from, to]], fx: [[name, at]] }, in scene seconds. */
function sounds(id) {
  const m = take.marks;
  const local = readJson(join(RAW, `${id}.marks.json`), []);
  const typing = pairs(local.filter((x) => x.name.startsWith('type-')));
  const fx = [];
  const at = (t) => (t == null ? null : onScene(id, t));
  switch (id) {
    case 'n01-open':
      fx.push(['restore', 1.0]);
      break;
    case 'n02-problem':
      typing.push([0.15, 6.2]);
      fx.push(['whoosh', 6.75]);
      for (let i = 0; i < 5; i++) fx.push(['tick', 8.4 + i * 0.42]);
      break;
    case 'n06-chat':
      fx.push(['tick', m.send != null ? m.send - (m.loaded + 0.3) : 3.5]);
      break;
    case 'n09-guard':
      fx.push(['block', at(m.blocked) ?? 4]);
      break;
    case 'n10-answer':
      fx.push(
        ['seal', at(m.approve) ?? 0.5],
        ['whoosh', (at(m.approve) ?? 0.5) + 0.35],
        ['restore', at(m.answer) ?? 4.5],
      );
      break;
    case 'n11-local':
      fx.push(['restore', at(m.answer2) ?? 6]);
      break;
    case 'n14-extension':
      if (typing[0]) fx.push(['tick', typing[0][1] + 0.95], ['restore', typing[0][1] + 4.8]);
      break;
    case 'n15-upload':
      fx.push(['tick', 1.2], ['tick', 2.2]);
      break;
    case 'n18-end':
      fx.push(['seal', 0.6]);
      break;
  }
  // Typing inside the private take (the excerpt edit, the second question).
  for (const [a, b] of pairs(take.typing)) {
    const x = at(a);
    const y = at(b);
    if (x != null && y != null) typing.push([x, y]);
  }
  return { typing, fx };
}

// ---------- the running order and each scene's length ----------
const overrides = flash
  ? JSON.parse(readFileSync(join(VIDEO, 'narration-flash.json'), 'utf8'))
  : [];
const lines = JSON.parse(readFileSync(join(VIDEO, NARRATION), 'utf8')).map((l) => {
  const o = overrides.find((x) => x.id === l.id);
  return o ? { ...l, text: o.text, variant: '-flash' } : l;
});
const scenes = [];
for (const l of lines) {
  if (CHAPTERS[l.id])
    scenes.push({
      id: `chapter-${l.id}`,
      chapter: CHAPTERS[l.id],
      dur: CHAPTERS[l.id].dur,
      into: CHAPTERS[l.id].into,
    });
  const dir = SCENES[l.id];
  if (!dir) throw new Error(`no direction for ${l.id}`);
  const wav = join(VIDEO, VOICES, `${l.id}${l.variant ?? ''}.wav`);
  if (!existsSync(wav)) throw new Error(`missing narration ${wav}`);
  const speech = probe(wav);
  const need = LEAD + speech + TAIL;
  let clip = join(RAW, `${l.id}.mp4`);
  let clipLen;
  if (existsSync(clip)) clipLen = probe(clip);
  else if (draft) {
    clip = null;
    clipLen = need;
  } else throw new Error(`missing clip ${clip}`);
  let dur = Math.max(3, need, Math.min(clipLen, need + 1.2));
  if (dir.full && clip) dur = Math.max(need, clipLen); // the clip's ending matters: play it all
  if (l.id === 'n02-problem') dur = Math.max(need, 12.8); // let the closing line land
  if (l.id === 'n18-end') dur = Math.max(need, 6);
  scenes.push({ ...l, ...dir, wav, speech, clip, clipLen, dur });
}
let t = 0;
scenes.forEach((s, i) => {
  if (i) t -= s.into?.[1] ?? 0.5;
  s.start = t;
  t += s.dur;
});
const total = t;

// ---------- pass 1: compose each scene ----------
const waitsCut = (id) => {
  const parts = cuts[id];
  return parts && parts.length > 1 ? parts[0][1] - parts[0][0] : null;
};
scenes.forEach((s, i) => {
  const file = join(PARTS, `${String(i).padStart(2, '0')}-${s.id}.mp4`);
  s.file = file;
  if (reuse && existsSync(file)) return;
  const D = s.dur.toFixed(3);
  const F = Math.round(s.dur * FPS);
  const args = [
    '-f',
    'lavfi',
    '-i',
    `gradients=s=${W}x${H}:r=${FPS}:d=${D}:c0=0x110d2e:c1=0x1c1550:c2=0x0b2233:c3=0x140f38:n=4:seed=${11 + i * 7}:speed=0.006:type=linear`,
    '-loop',
    '1',
    '-t',
    D,
    '-i',
    join(OV, 'bg-pattern.png'),
  ];
  const f = ['[0:v][1:v]overlay=0:0,format=rgba[bg]'];
  let last = 'bg';
  let n = 2;
  const input = (path) => {
    args.push('-loop', '1', '-t', D, '-i', path);
    return n++;
  };
  const fadeIn = (st, d = 0.55) => `fade=in:st=${st.toFixed(2)}:d=${d}:alpha=1`;
  const fadeOut = (d = 0.4) =>
    `fade=out:st=${Math.max(0, s.dur - d - 0.15).toFixed(2)}:d=${d}:alpha=1`;

  if (s.chapter) {
    const c = input(join(OV, `${s.id}.png`));
    f.push(
      `[${c}:v]format=rgba,${fadeIn(0.25, 0.6)},${fadeOut(0.45)}[c]`,
      `[${last}][c]overlay=x=0:y='18*pow(max(0,1-(t-0.25)/0.8),3)'[v]`,
    );
    last = 'v';
  } else {
    const L = LAYOUTS[s.layout];
    // Footage: hold the last frame if the voice needs longer, then the camera move, then size it.
    const vi = n++;
    if (s.clip) args.push('-i', s.clip);
    else args.push('-f', 'lavfi', '-i', `color=c=0x1c1a2b:s=1600x900:r=${FPS}:d=${D}`);
    const [cw, ch] = L.crop ? [L.crop[0], L.crop[1]] : [1600, 900];
    // Camera move with sub-pixel precision: the crop window's corners are exact per frame and
    // resampled (bicubic), so a slow push-in glides. (zoompan snaps to whole pixels: it shook.)
    // Eased in and out (smoothstep) so it starts and settles gently.
    const Z = s.move === 'in' ? 0.04 : 0.028;
    const u = `min(1,on/${F})`;
    const ease = `(${u}*${u}*(3-2*${u}))`;
    const z = `(1+${Z}*${ease})`;
    const fx = s.move === 'right' ? ease : s.move === 'left' ? `(1-${ease})` : '0.5';
    const x0 = `(W-W/${z})*${fx}`;
    const y0 = `(H-H/${z})*0.5`;
    const x1 = `${x0}+W/${z}`;
    const y2 = `${y0}+H/${z}`;
    const move =
      `perspective=x0='${x0}':y0='${y0}':x1='${x1}':y1='${y0}':x2='${x0}':y2='${y2}':x3='${x1}':y3='${y2}'` +
      `:interpolation=cubic:sense=source:eval=frame`;
    const pad = Math.max(0, s.dur - s.clipLen + 0.2).toFixed(3);
    const crop = L.crop ? `crop=${L.crop[0]}:${L.crop[1]}:${L.crop[2]}:${L.crop[3]},` : '';
    void cw;
    void ch;
    f.push(
      `[${vi}:v]fps=${FPS},${crop}tpad=stop_mode=clone:stop_duration=${pad},trim=duration=${D},setpts=PTS-STARTPTS,` +
        `${move},scale=${L.w}:${L.h}:flags=lanczos,setsar=1,format=rgba[foot]`,
    );
    if (L.frameless) {
      f.push(`[${last}][foot]overlay=0:0[v0]`);
      last = 'v0';
    } else {
      const key = `${s.layout}-${s.where}`;
      const under = input(join(OV, `under-${key}.png`));
      const over = input(join(OV, `over-${key}.png`));
      const mask = input(join(OV, `mask-${s.layout}.png`));
      f.push(
        `[${mask}:v]format=gray,scale=${L.w}:${L.h}[m]`,
        `[foot][m]alphamerge[card]`,
        `[${last}][${under}:v]overlay=0:0[u]`,
        `[u][card]overlay=${L.x}:${L.y}[uc]`,
        `[uc][${over}:v]overlay=0:0[v0]`,
      );
      last = 'v0';
    }
    // Caption: slides in from its margin, leaves before the cut.
    const capFile = join(OV, `cap-${s.id}${s.variant ?? ''}.png`);
    if (existsSync(capFile)) {
      const c = input(capFile);
      const cin = 0.35;
      const ease = `pow(max(0,1-(t-${cin})/0.75),3)`;
      const pos =
        L.caption === 'column-left'
          ? `x='-46*${ease}':y=0`
          : L.caption === 'column-right'
            ? `x='46*${ease}':y=0`
            : `x=0:y='26*${ease}'`;
      f.push(
        `[${c}:v]format=rgba,${fadeIn(cin)},${fadeOut()}[cap]`,
        `[${last}][cap]overlay=${pos}[v1]`,
      );
      last = 'v1';
    }
    // Wait-cut note: appears at the cut and stays.
    const waitFile = join(OV, `wait-${s.id}.png`);
    // Only where a wait was really cut (a scene of the take made of more than one part).
    if (s.wait && existsSync(waitFile) && (waitsCut(s.id) !== null || (draft && !cuts[s.id]))) {
      const w = input(waitFile);
      const at = Math.max(0.6, (waitsCut(s.id) ?? 1.2) - 0.3);
      f.push(
        `[${w}:v]format=rgba,${fadeIn(at, 0.4)},${fadeOut()}[wc]`,
        `[${last}][wc]overlay=x=0:y='14*pow(max(0,1-(t-${at.toFixed(2)})/0.5),3)'[v2]`,
      );
      last = 'v2';
    }
    if (s.id === 'n18-end') {
      const e = input(join(OV, 'end-links.png'));
      f.push(`[${e}:v]format=rgba,${fadeIn(1.2, 0.6)}[el]`, `[${last}][el]overlay=0:0[v3]`);
      last = 'v3';
    }
  }
  f.push(`[${last}]format=yuv420p[out]`);
  ffmpeg([
    ...args,
    '-filter_complex',
    f.join(';'),
    '-map',
    '[out]',
    '-t',
    D,
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    draft ? 'veryfast' : 'medium',
    '-crf',
    draft ? '22' : '15',
    '-an',
    file,
  ]);
  console.log(`scene ${s.id.padEnd(22)} ${s.dur.toFixed(1)} s`);
});

// ---------- pass 2: cut together, mix the sound ----------
const args = [];
const f = [];
scenes.forEach((s) => args.push('-i', s.file));
let chain = '0:v';
scenes.forEach((s, i) => {
  if (!i) return;
  const [kind, d] = s.into ?? ['fade', 0.5];
  const label = i === scenes.length - 1 ? 'vx' : `x${i}`;
  f.push(
    `[${chain}][${i}:v]xfade=transition=${kind}:duration=${d}:offset=${s.start.toFixed(3)}[${label}]`,
  );
  chain = label;
});
if (scenes.length === 1) f.push('[0:v]null[vx]');
f.push(
  `[vx]fade=in:st=0:d=0.7,fade=out:st=${(total - 0.9).toFixed(3)}:d=0.9,format=yuv420p[video]`,
);

let k = scenes.length;
const voice = [];
const fx = [];
for (const s of scenes) {
  if (!s.wav) continue;
  args.push('-i', s.wav);
  const ms = Math.round((s.start + LEAD) * 1000);
  f.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${k}]`);
  voice.push(`[n${k}]`);
  k++;
}
let typeIdx = 0;
for (const s of scenes) {
  if (s.chapter) {
    args.push('-i', join(SFX, 'sfx-whoosh.wav'));
    const ms = Math.round((s.start + 0.15) * 1000);
    f.push(`[${k}:a]aresample=48000,volume=0.28,adelay=${ms}|${ms}[f${k}]`);
    fx.push(`[f${k}]`);
    k++;
    continue;
  }
  const { typing, fx: hits } = sounds(s.id);
  for (const [name, at] of hits) {
    if (at == null || at < 0 || at > s.dur) continue;
    args.push('-i', join(SFX, `sfx-${name}.wav`));
    const ms = Math.round((s.start + at) * 1000);
    f.push(`[${k}:a]aresample=48000,volume=0.5,adelay=${ms}|${ms}[f${k}]`);
    fx.push(`[f${k}]`);
    k++;
  }
  for (const [a, b] of typing) {
    const from = Math.max(0, a);
    const to = Math.min(s.dur - 0.2, b);
    const len = to - from;
    if (len < 0.2) continue;
    const off = ((typeIdx++ * 7.3) % Math.max(1, 39 - len)).toFixed(2);
    args.push('-i', join(SFX, 'sfx-typing.wav'));
    const ms = Math.round((s.start + from) * 1000);
    f.push(
      `[${k}:a]atrim=start=${off}:duration=${len.toFixed(2)},asetpts=PTS-STARTPTS,aresample=48000,` +
        `afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, len - 0.1).toFixed(2)}:d=0.1,volume=0.42,adelay=${ms}|${ms}[f${k}]`,
    );
    fx.push(`[f${k}]`);
    k++;
  }
}
args.push('-i', join(SFX, 'music.wav'));
f.push(
  `[${k}:a]aresample=48000,atrim=duration=${total.toFixed(3)},afade=t=in:d=1.5,afade=t=out:st=${(total - 3).toFixed(3)}:d=3,volume=0.3[music]`,
);
f.push(
  `${voice.join('')}amix=inputs=${voice.length}:normalize=0[voice]`,
  '[voice]asplit=2[voice1][voice2]',
);
f.push('[music][voice2]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[ducked]');
f.push(
  `[voice1][ducked]${fx.join('')}amix=inputs=${2 + fx.length}:normalize=0:duration=longest[mix]`,
);
f.push(`[mix]atrim=duration=${total.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=11[audio]`);

const outFile = join(
  OUT,
  `envoy-demo${v7 ? '-v7' : ''}${flash ? '-flash' : ''}${draft ? '-draft' : ''}.mp4`,
);
writeFileSync(join(OUT, 'filter-final.txt'), f.join(';\n'));
ffmpeg([
  ...args,
  '-/filter_complex',
  join(OUT, 'filter-final.txt'),
  '-map',
  '[video]',
  '-map',
  '[audio]',
  '-c:v',
  'libx264',
  '-preset',
  draft ? 'veryfast' : 'slow',
  '-crf',
  draft ? '24' : '17',
  '-r',
  String(FPS),
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-ar',
  '48000',
  '-movflags',
  '+faststart',
  outFile,
]);

// English subtitles for YouTube, timed to the narration.
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0');
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`;
};
const spoken = scenes.filter((s) => s.wav);
writeFileSync(
  outFile.replace(/\.mp4$/, '.srt'),
  spoken
    .map(
      (s, i) => `${i + 1}\n${ts(s.start + LEAD)} --> ${ts(s.start + LEAD + s.speech)}\n${s.text}\n`,
    )
    .join('\n'),
);
for (const s of scenes)
  console.log(
    `${s.id.padEnd(24)} start ${s.start.toFixed(1).padStart(6)}  dur ${s.dur.toFixed(1).padStart(5)}  ${s.wav ? `speech ${s.speech.toFixed(1)}` : ''}${s.clip === null ? '  (placeholder)' : ''}`,
  );
console.log(
  `${scenes.length} scenes, ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}) -> ${outFile}`,
);
if (total > 178) console.log('WARNING: longer than 2:58; the rules allow 3:00 at most');
