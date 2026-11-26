import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDictationStatus, pickLocalVoice, speakLocally, startLocalDictation } from './voice';

const voice = (name: string, lang: string, localService: boolean, isDefault = false) =>
  ({ name, lang, localService, default: isDefault, voiceURI: name }) as SpeechSynthesisVoice;

function fakeSynth(voices: SpeechSynthesisVoice[]) {
  return {
    getVoices: () => voices,
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis & { speak: ReturnType<typeof vi.fn> };
}

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

describe('read aloud (the restored answer holds real values)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never picks a network voice, even when it is the default', () => {
    const synth = fakeSynth([
      voice('Google US English', 'en-US', false, true),
      voice('Microsoft Zira', 'en-US', true),
    ]);
    expect(pickLocalVoice('en', synth)?.name).toBe('Microsoft Zira');
  });

  it('refuses to speak when only network voices exist', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth([voice('Google US English', 'en-US', false, true)]);
    expect(speakLocally('Your rent can rise to EGP 9,350', {}, synth)).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speaks with the local voice when there is one', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth([voice('Microsoft Zira', 'en-US', true, true)]);
    expect(speakLocally('Hello', {}, synth)).toBe(true);
    const u = synth.speak.mock.calls[0]![0] as FakeUtterance;
    expect(u.voice?.localService).toBe(true);
  });
});

describe('dictation (audio must not leave the device)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is unavailable when the browser can only recognise speech on a server', async () => {
    class ServerOnly {}
    vi.stubGlobal('webkitSpeechRecognition', ServerOnly);
    expect(await localDictationStatus()).toBe('unavailable');
    expect(await startLocalDictation(() => {})).toBeNull();
  });

  it('runs with processLocally when Chrome reports on-device recognition', async () => {
    const started: { processLocally?: boolean }[] = [];
    class Local {
      static available = vi.fn(async () => 'available');
      static install = vi.fn(async () => true);
      // In Chrome this is an accessor on the prototype, which is what voice.ts checks for.
      #local = false;
      get processLocally() {
        return this.#local;
      }
      set processLocally(v: boolean) {
        this.#local = v;
      }
      lang = '';
      interimResults = false;
      continuous = true;
      onresult = null;
      onerror = null;
      onend = null;
      start() {
        started.push({ processLocally: this.processLocally });
      }
      stop() {}
      abort() {}
    }
    vi.stubGlobal('SpeechRecognition', Local);
    expect(await localDictationStatus()).toBe('available');
    const stop = await startLocalDictation(() => {});
    expect(stop).toBeTypeOf('function');
    expect(started).toEqual([{ processLocally: true }]);
    expect(Local.available).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
  });
});
