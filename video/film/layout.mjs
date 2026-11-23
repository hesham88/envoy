/**
 * The film's direction sheet, shared by overlays.mjs (draws captions and frames) and build.mjs
 * (composes and cuts). Footage sits in a framed card on an animated night background; captions live
 * in the margins, never over the product's own text. Layouts alternate so the eye travels.
 *
 * where: 'device' (green), 'cloud' (blue), 'you' (white), 'guard' (amber).
 */
export const W = 1920;
export const H = 1080;

/** Card geometry per layout (clips are 1600x900, so 16:9 everywhere except the opening). */
export const LAYOUTS = {
  wide: { x: 160, y: 40, w: 1600, h: 900, caption: 'bottom' },
  left: { x: 448, y: 148, w: 1392, h: 784, caption: 'column-left' }, // card right, caption left
  right: { x: 80, y: 148, w: 1392, h: 784, caption: 'column-right' }, // card left, caption right
  open: { x: 160, y: 250, w: 1600, h: 620, crop: [1600, 620, 0, 0], caption: 'open' },
  bleed: { x: 0, y: 0, w: 1920, h: 1080, caption: 'none', frameless: true },
};

export const COLOR = { device: '#3dffb0', cloud: '#7aa7ff', you: '#ece9ff', guard: '#ffb547' };
export const LABEL = {
  device: 'On this device',
  cloud: 'Cloud, tags only',
  you: 'You decide',
  guard: 'The guard',
};

/**
 * Per scene: layout, caption, camera move ('in' push-in, 'left'/'right' drift) and the transition
 * INTO the scene (ffmpeg xfade name and seconds). Within the one private take the cuts are quick.
 */
export const SCENES = {
  'n01-open': {
    layout: 'open',
    where: 'device',
    title: 'Envoy',
    sub: 'Your private AI agent to the cloud',
    move: 'in',
  },
  'n02-problem': { layout: 'bleed', move: 'in', into: ['fadeblack', 0.8] },
  'n03-promise': {
    layout: 'wide',
    where: 'device',
    title: 'The cloud sees tags, never your details',
    sub: 'Private steps run on Chrome’s built-in model',
    move: 'in',
    into: ['circlecrop', 1.0],
  },
  'n04-live': {
    layout: 'left',
    where: 'device',
    title: 'Masked as you type',
    sub: 'Local rules on the page. Nothing is sent.',
    move: 'right',
    into: ['smoothup', 0.7],
  },
  'n05-usecases': {
    layout: 'right',
    where: 'device',
    title: 'For anyone with something private',
    sub: 'Offer letters, lab results, API keys',
    move: 'left',
    into: ['slideleft', 0.7],
  },
  'n06-chat': {
    layout: 'wide',
    where: 'device',
    title: 'Private mode, live on this laptop',
    sub: 'Gemma 4 in Chrome, the model Gemini Nano 4 is built on',
    move: 'in',
    into: ['fade', 0.5],
  },
  'n07-recorder': {
    layout: 'left',
    where: 'device',
    title: 'Privacy flight recorder',
    sub: 'Every step: where it ran, which model, how long',
    move: 'right',
    into: ['smoothleft', 0.6],
    wait: 'analysis',
  },
  'n08-approve': {
    layout: 'right',
    where: 'you',
    title: 'You approve what leaves',
    sub: 'Only the clauses the question needs, as tags',
    move: 'left',
    into: ['smoothleft', 0.6],
  },
  'n09-guard': {
    layout: 'left',
    where: 'guard',
    title: 'Raw details are blocked',
    sub: 'Even spaced out or disguised',
    move: 'in',
    into: ['hblur', 0.5],
  },
  'n10-answer': {
    layout: 'right',
    where: 'cloud',
    title: 'Gemini 4 Hydrogen reasons over tags',
    sub: 'The maths and the real values come back on your device',
    move: 'left',
    into: ['smoothleft', 0.6],
    wait: 'hydrogen',
  },
  'n11-local': {
    layout: 'left',
    where: 'device',
    title: 'Answered on the device',
    sub: '0 bytes left this laptop',
    move: 'right',
    into: ['smoothup', 0.6],
    wait: 'local',
  },
  'n12-ledger': {
    layout: 'right',
    where: 'device',
    title: 'Network ledger',
    sub: 'Every request, and what reached the cloud',
    move: 'left',
    into: ['wipeleft', 0.6],
  },
  'n13-hybrid': {
    layout: 'wide',
    where: 'cloud',
    title: 'Hybrid inference with Firebase AI Logic',
    sub: 'ONLY_ON_DEVICE for private steps, PREFER_IN_CLOUD for reasoning',
    move: 'in',
    into: ['zoomin', 0.8],
  },
  'n14-extension': {
    layout: 'left',
    where: 'device',
    title: 'In any AI chat',
    sub: 'The Chrome extension, on the sites you choose',
    move: 'right',
    into: ['fade', 0.5],
  },
  'n15-upload': {
    layout: 'right',
    where: 'device',
    title: 'Upload with Envoy',
    sub: 'Location data removed, the ID number blacked out',
    move: 'left',
    into: ['slideleft', 0.7],
  },
  'n16-guide': {
    layout: 'left',
    where: 'device',
    title: 'Set up private mode',
    sub: 'Envoy checks this computer and shows each step',
    move: 'right',
    into: ['smoothright', 0.7],
  },
  'n17-measured': {
    layout: 'wide',
    where: 'device',
    title: 'Measured, not promised',
    sub: '36 documents, 0 leaks, 28 of 28 attacks blocked',
    move: 'in',
    into: ['fadeblack', 0.8],
  },
  'n18-end': { layout: 'bleed', move: 'in', into: ['circlecrop', 1.0] },
};

/** Chapter cards (no narration), shown before the named scene. Sparing: two acts. */
export const CHAPTERS = {
  'n06-chat': {
    title: 'A real session',
    sub: 'Private mode on Gemma 4, on a CPU-only laptop',
    dur: 2.6,
    into: ['fadeblack', 0.8],
  },
  'n14-extension': {
    title: 'Beyond the app',
    sub: 'The Envoy Chrome extension',
    dur: 2.4,
    into: ['fadeblack', 0.8],
  },
};

/** Wait-cut notes, filled with the take's real times (video/out/raw/private-waits.json). */
export const WAIT_TEXT = {
  analysis: (s) =>
    `Wait cut: ${minutes(s)} of on-device work on this CPU-only laptop. Times vary a lot by device.`,
  hydrogen: (s) => `Wait cut: Gemini 4 Hydrogen took ${Math.round(s)} seconds.`,
  local: (s) => `Wait cut: ${minutes(s)} on this CPU-only laptop.`,
};
function minutes(s) {
  if (s < 90) return `about ${Math.round(s)} seconds`;
  return `about ${(Math.round((s / 60) * 2) / 2).toString()} minutes`;
}
