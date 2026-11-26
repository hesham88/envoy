/** /privacy — the privacy policy for the Envoy web app and Chrome extension. Plain statements of what the code does. */
import { Logo } from '@envoy/ui';

const REPO = 'https://github.com/hesham88/envoy';

const SECTIONS: [string, string[]][] = [
  [
    'What Envoy is',
    [
      'Envoy helps you ask cloud AI about private documents and messages while sharing as little as possible. It finds private details on your device, replaces them with tags, shows you the exact text it would send, and sends nothing until you approve.',
    ],
  ],
  [
    'What stays on your device',
    [
      'Your documents, messages and the real values behind every tag are processed in your browser. By default they are kept in memory for the open tab only, and closing the tab forgets them.',
      'History is off until you turn it on (History > Save chats on this device). Then answered chats, including their documents, answers and real values, are saved in this browser (IndexedDB), encrypted with AES-GCM 256 under a key that cannot be exported from the browser. Without a passcode, anyone who can use this browser profile can open them; with a passcode (PBKDF2-SHA-256, 600,000 iterations), only you can. You can delete one chat or all history, with its key, at any time.',
      "Private steps (finding details, choosing what the question needs, deciding where to answer) run on Chrome's built-in model on your device, or on local rules when that model isn't available.",
      'Photos are read on your device: text with Tesseract.js and barcodes with zxing-wasm, both served from Envoy itself, never a third-party server. In the web app the photo itself is never sent; only its masked text, after you approve it. In the extension, the site you upload to receives only the rebuilt image, with the boxes you kept burned into its pixels and its camera data (EXIF, location) removed. What a barcode encodes is not kept.',
      'Requests you approve while offline wait in memory on your device and are sent, exactly as approved, when the network returns. Closing the tab discards them.',
      'Your own rules (words you mark as private) are stored encrypted in the same way in the web app (while History is locked by its passcode, new rules last for the open tab until you unlock it), and in chrome.storage.local in the extension. Settings (your cloud model choice, whether History is on, the sites you switch the extension on for) are stored in your browser. None of this is sent anywhere.',
    ],
  ],
  [
    'What is sent, and to whom',
    [
      "Only the text you approve: the masked excerpt shown in Envoy's approval card, with your details replaced by tags. It goes to Google's Gemini models through Firebase AI Logic (operated by Google) to produce an answer, which comes back to your device, where the tags are turned back into your details. Google's terms for the Gemini API apply to that request.",
      'Firebase App Check (reCAPTCHA Enterprise) and Firebase Remote Config are used to protect the service and choose the cloud model. They do not receive your documents.',
      'If you choose Local only, or a question can be answered from your document, nothing is sent at all.',
      "Envoy runs on the Gemini Developer API's free tier, where Google may use the content it receives to improve its products. That content is only the masked excerpt you approved, never your document or the real values behind its tags.",
    ],
  ],
  [
    'What Envoy does not do',
    [
      'No accounts, no analytics, no advertising, no tracking, and no selling or sharing of data. Envoy has no server of its own and keeps no copy of anything you type or upload.',
      'The extension does nothing on a website until you switch it on for that site. It never reads password, one-time-code, card or bank-account fields.',
    ],
  ],
  [
    'Limits',
    [
      "Envoy masks the details it detects and blocks detected leaks, including disguised ones. It can't promise that nothing about you can be inferred from the text you approve, so read the excerpt before you send it, and hide anything you don't want to share.",
    ],
  ],
  ['Contact', [`Envoy is open source (Apache-2.0). Questions and reports: ${REPO}/issues`]],
];

export function Privacy() {
  return (
    <div className="envoy-uv min-h-screen font-sans">
      <header className="border-b border-uv-line/70">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-5 py-4">
          <a href="/" aria-label="Envoy home" className="text-uv-text">
            <Logo withWordmark />
          </a>
          <a href="/app" className="text-[15px] text-uv-green underline underline-offset-4">
            Open Envoy
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-5 py-12">
        <h1 className="m-0 font-display text-[clamp(2.2rem,1.6rem+2vw,3rem)] leading-[1.05] font-[560] text-uv-text">
          Privacy policy
        </h1>
        <p className="mt-3 mb-0 text-[15px] text-uv-muted">
          For the Envoy web app and the Envoy Chrome extension. Last updated 23 November 2026.
        </p>
        {SECTIONS.map(([title, paras]) => (
          <section key={title} className="mt-10">
            <h2 className="m-0 text-[20px] font-semibold text-uv-text">{title}</h2>
            {paras.map((p) => (
              <p
                key={p.slice(0, 32)}
                className="mt-3 mb-0 text-[16px] leading-relaxed text-uv-muted"
              >
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
