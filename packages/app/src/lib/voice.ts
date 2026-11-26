/**
 * Voice that never leaves the device.
 *
 * Read aloud: an answer, with your real details restored, is spoken only by a voice the browser
 * reports as local (`SpeechSynthesisVoice.localService`). Chrome also lists "Google ..." voices
 * that synthesise on Google's servers; using one would send the restored answer, real values and
 * all, over the network. If no local voice exists, Envoy says so instead of using a network one.
 *
 * Dictation: offered only when Chrome reports on-device speech recognition for the language
 * (`SpeechRecognition.available({ langs, processLocally: true })`), and then run with
 * `processLocally = true`. Without that, there is no microphone button: the standard Web Speech
 * API sends audio to a server, and Envoy never falls back to it.
 */

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LocalRecognitionStatic {
  new (): LocalRecognition;
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
  install?: (opts: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}
interface LocalRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function localVoices(synth: SpeechSynthesis | undefined = globalThis.speechSynthesis) {
  return (synth?.getVoices() ?? []).filter((v) => v.localService);
}

/** The local voice for a language, or null. Never returns a network voice. */
export function pickLocalVoice(
  lang = 'en',
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): SpeechSynthesisVoice | null {
  const local = localVoices(synth);
  return (
    local.find((v) => v.lang.toLowerCase().startsWith(lang) && v.default) ??
    local.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    null
  );
}

/**
 * Speak text with a local voice. Returns false (and says nothing) when there is no local voice.
 * `onEnd` runs when speech ends or is cancelled.
 */
export function speakLocally(
  text: string,
  { lang = 'en', onEnd }: { lang?: string; onEnd?: () => void } = {},
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): boolean {
  const voice = pickLocalVoice(lang, synth);
  if (!synth || !voice) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

/** Chrome's voices load asynchronously; resolves once the list is known (or after 1.5 s). */
export function voicesReady(
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): Promise<void> {
  if (!synth || synth.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    synth.addEventListener('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

function recognitionClass(): LocalRecognitionStatic | null {
  const g = globalThis as unknown as {
    SpeechRecognition?: LocalRecognitionStatic;
    webkitSpeechRecognition?: LocalRecognitionStatic;
  };
  const C = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  // Only a recognizer that can promise local processing is acceptable.
  if (!C || typeof C.available !== 'function' || !('processLocally' in C.prototype)) return null;
  return C;
}

/** Whether on-device dictation can run here: 'available', 'downloadable', or 'unavailable'. */
export async function localDictationStatus(lang = 'en-US'): Promise<Availability> {
  const C = recognitionClass();
  if (!C?.available) return 'unavailable';
  try {
    return await C.available({ langs: [lang], processLocally: true });
  } catch {
    return 'unavailable';
  }
}

/**
 * Dictate on the device. Downloads the language pack first if Chrome needs to (call from a click).
 * Returns a stop function, or null when on-device recognition isn't possible.
 */
export async function startLocalDictation(
  onText: (text: string, final: boolean) => void,
  { lang = 'en-US', onEnd }: { lang?: string; onEnd?: () => void } = {},
): Promise<(() => void) | null> {
  const C = recognitionClass();
  if (!C) return null;
  let status = await localDictationStatus(lang);
  if (status === 'downloadable' && C.install) {
    const ok = await C.install({ langs: [lang], processLocally: true }).catch(() => false);
    status = ok ? 'available' : 'unavailable';
  }
  if (status !== 'available') return null;
  const r = new C();
  r.lang = lang;
  r.processLocally = true;
  // Belt and braces: if the browser ignored the flag, don't start.
  if (r.processLocally !== true) return null;
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      const res = e.results[i]!;
      text += res[0]?.transcript ?? '';
      final = res.isFinal;
    }
    onText(text, final);
  };
  r.onerror = () => onEnd?.();
  r.onend = () => onEnd?.();
  r.start();
  return () => r.stop();
}
