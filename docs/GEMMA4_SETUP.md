# Reproduce Private mode on Gemma 4 (Gemini Nano 4)

Envoy's Private mode was built, measured and filmed on Chrome's Gemma 4 built-in model, the model Gemini Nano 4 is built on. It is a Chrome **developer trial**, so it needs one flag. These are the exact steps and versions we used. On Chrome's default model Envoy still works, but its published numbers don't apply.

No setup at all? Open the [recorded run](https://envoy-hybrid-ai.web.app/app?recorded=1): a real Private-mode run on Gemma 4, word for word, labelled as a recording.

## What we used

|                                  |                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Chrome                           | 158.0.8127.38 (stable channel), Windows 11                                                   |
| Flag                             | `chrome://flags/#gemma4-for-built-in-ai` → **Enabled**                                       |
| Model                            | `gemma4_component` 2026.11.3.1140 (about 3 GB on disk)                                       |
| Prompt API                       | `prompt_api_gemma4`: Available                                                               |
| Laptop                           | Intel i7-8750H, 16 GB RAM, Chrome's CPU backend (its 4 GB GPU is below Chrome's requirement) |
| Time per question on that laptop | about 1 to 2.5 minutes for the on-device steps; much faster with a supported GPU             |

## Steps (about 10 minutes, plus the download)

1. **Desktop Chrome 158 or later.** Check `chrome://version`.
2. **Turn on on-device AI:** `chrome://settings/ai`. Since Chrome 157 it's off by default in new profiles.
3. **Turn on Gemma 4:** `chrome://flags/#gemma4-for-built-in-ai` → Enabled, then **Relaunch**.
4. **Download the model:** open [envoy-hybrid-ai.web.app/app?guide=private](https://envoy-hybrid-ai.web.app/app?guide=private) and press **Download Chrome's built-in model**. Chrome needs about 22 GB free on the drive that holds your Chrome profile, and downloads about 3 GB once, in the background. The guide also checks this computer (Chrome version, memory, disk, GPU) and says what's missing.
5. **Check it:** `chrome://on-device-internals` → _Model status_ lists `gemma4_component` as **Ready**, and the Prompt API shows `prompt_api_gemma4: Available`.
6. **Run it:** open [envoy-hybrid-ai.web.app/app?sample=lease](https://envoy-hybrid-ai.web.app/app?sample=lease). The status says **On-device ready**. Ask _"Can my landlord raise my rent 20% this year? What's the most it can go up to?"_. The flight recorder marks each private step **This device · Chrome's built-in model** with its time; approve the excerpt, and the answer comes back with the amount worked out on your device.

**Computers without a supported GPU** (less than 4 GB of video memory): Chrome may report the model as unavailable. Starting Chrome with its CPU backend is what we did for every measurement:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --enable-features=OnDeviceModelForceCpuBackend,OnDeviceModelCpuBackend
```

## If something goes wrong

- **Basic protection instead of Private mode:** the model isn't ready yet (step 4 or 5). Envoy says why in the chat, and Basic protection still masks IDs, numbers, emails and accounts with local rules.
- **The model stops mid-run** (low memory): Envoy switches to Basic protection and says so; nothing is sent without your approval either way. Closing other tabs helps; Chrome's crash counter is on `chrome://on-device-internals`.
- **Which model answered?** Neither Chrome nor Firebase AI Logic tells a page, so Envoy says "Chrome's built-in model". Step 5 is how you confirm it's Gemma 4.
