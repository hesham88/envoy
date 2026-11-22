# Chrome built-in AI (Prompt API / LanguageModel): which model, how to get it, and hardware eligibility (as of Nov 2026)

Target machine: Windows 11, Intel i7-8750H (6 cores / 12 threads), 15.9 GiB RAM as Windows reports it, NVIDIA GTX 1050 Ti with exactly 4 GB VRAM, Chrome 158, profile drive with 6 GB free, second drive with 39.5 GB free.

Context: Chrome 156 was Stable and 157 Beta on 20 Oct 2026, with 157 due for Stable on 3 Nov 2026 ([comment-vibe PR #42, 20 Oct 2026](https://github.com/dzienisz/comment-vibe/pull/42)). Chrome 158 in late November 2026 is therefore most likely the Beta or Dev channel, not Stable. That matters for the settings toggle described under Q3.

## Q1. Model versions: Gemini Nano v2 / v3 / "Nano 4", Gemma 4, the `gemma4-for-built-in-ai` flag, and whether the API tells you which model is loaded

### Takeaway
Chrome's default built-in model is still **Gemini Nano "v3Nano"**. Official Chrome docs give no version number and simply say "Gemini Nano". **"Gemini Nano 4" is an official Google name, but for Android AICore** (based on Gemma 4 E2B/E4B). No Chrome documentation uses that name. In Chrome, the closest thing is the **developer-trial flag `chrome://flags/#gemma4-for-built-in-ai`** (Canary/Dev 153+, present in 154). It swaps every built-in API from Gemini Nano to a downloaded **Gemma 4** model of about 2.4 GB. The Prompt API cannot tell you which model ran, and you cannot choose one.

### Cited Findings
- Official Prompt API docs (last updated 21 Oct 2026) say the Prompt API uses "Gemini Nano" and give no model version number. It is available on the web from Chrome 148 and in Extensions from Chrome 138 — [developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api)
- The Get Started page says the model's "exact size may vary as the browser updates the model" and sends you to `chrome://on-device-internals` to check — [developer.chrome.com/docs/ai/get-started](https://developer.chrome.com/docs/ai/get-started)
- The Prompt API was switched on by default for ordinary websites in Chrome 148 (5 May 2026) — [adsm.dev, 5 May 2026](https://adsm.dev/posts/prompt-api/); [TechTimes, 16 May 2026](https://www.techtimes.com/articles/316729/20260516/google-ships-chrome-prompt-api-over-objections-mozilla-apple-w3c-microsoft.htm)
- `chrome://on-device-internals` showed "Model Name: v3Nano, Version: 2025.06.30.1229, Backend Type: GPU (highest quality)". The weights file was version `2025.8.8.1141`, 4,072.13 MiB — [dev.to hands-on investigation](https://dev.to/jacquesgariepy/inside-chromes-edges-silent-4gb-ai-install-a-complete-hands-on-investigation-54g2) (post date shown as May 2025 but its content references 2025-08 versions, so the date is unreliable)
- There are two v3Nano builds: GPU (v3Nano 2025.06.30.1229, 4.0 GB) and CPU (v3Nano 2025.08.14.1358, 2.7 GB) — [adsm.dev](https://adsm.dev/posts/prompt-api/)
- A user on Chrome 149 and 154 saw "v3Nano" at about 4,072 MiB on the GPU backend — [Ar9av/gemini-nano-chrome](https://github.com/Ar9av/gemini-nano-chrome)
- Older fact: earlier Chrome releases (2024–early 2025) shipped an earlier Nano, which community sources call "v2Nano". I found no 2026 primary source on that version; it is listed here only as history.
- **Gemini Nano 4 is an Android name.** On 2 Apr 2026, Google said of Gemma 4: "These models are the foundation for the next generation of Gemini Nano, so code you write today for Gemma 4 will automatically work on Gemini Nano 4-enabled devices that will be available later this year." The post never mentions Chrome or desktop — [Android Developers Blog, AICore Developer Preview](https://android-developers.googleblog.com/2026/04/AI-Core-Developer-Preview.html)
- Gemini Nano 4 comes in two variants: "Fast" (Gemma 4 E2B) and "Full" (Gemma 4 E4B). It launched on a handful of flagship Android phones and needs at least 12 GB RAM — [9to5Google, 2 Apr 2026](https://9to5google.com/2026/04/02/gemini-nano-4-android/); [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/13389/gemini-nano-4-first-phones-gemma-4) (secondary sources)
- The ML Kit device tables list Gemini Nano 2, 3 and 4, and Android apps can read the version with `getBaseModelName()`. This is Android only — [search summary of nhimg.org](https://nhimg.org/gemini-nano-explained) (secondary source)
- **The Chrome flag:** in Canary, "Gemma 4 for Built-in AI" "enables all built-in AI APIs (Prompt, Summarizer, Writer, etc.) with the Gemma 4 model" on desktop and ChromeOS. The PiunikaWeb author still saw the model reported as "downloadable" — [PiunikaWeb, 8 Jun 2026](https://piunikaweb.com/2026/06/08/google-chrome-gemma-4-built-in-ai/)
- The flag is available "in the canary and dev channel of Chrome v153+", and the author tested it on Chrome Dev 154. The Gemma 4 component was version 2026.8.7.929, against Nano v3 2025.8.8.1141. Both are listed in the `chrome://on-device-internals` "Broker state" tab. "Chrome does not document how Chrome chooses between Gemma4 and nano v3 when both are installed" and "the API gives you no way to request a specific model or to find out which one ran." Only English was tested. The output had small glitches, such as dropped words — [calvin.my, Aug 2026](https://calvin.my/posts/chrome-on-device-ai-with-gemma4-aug-2026)
- In Chrome 154, `chrome://flags/#gemma4-for-built-in-ai` turns on the features `AIApiFoundationalModel:model_version/v4` and `OptimizationGuideManifestBroker`. The model downloaded is **Gemma 4 2B-IT**, model version 2026.06.10.0000, component 2026.8.7.929, **about 2.4 GB**. It is stored under `OptGuideManifestModel/<asset hash>/<version>/`, while Nano stays in `OptGuideOnDeviceModel/`. On machines without a usable GPU, "the model service aborts during start-up with SIGILL" because LiteRT's WebGPU accelerator starts even for CPU inference (that report is from Linux CI). Chrome blocks a model version after three crashes — [swissspidy/web-ai-evals PR #4](https://github.com/swissspidy/web-ai-evals/pull/4)
- The Decisions API (a separate developer trial from Chrome 157, `chrome://flags/#decisions-api`) uses "EmbeddingGemma V1 / Gemma 4 CPU backends" — [comment-vibe PR #42](https://github.com/dzienisz/comment-vibe/pull/42). Its Gemma 4 path is "CPU only" because GPU scoring "returns wrong scores or crashes the model service", and the flag expires at milestone 160 — [dejan.ai, 8 Oct 2026](https://dejan.ai/blog/chrome-decisions-api-decisionmodel/)

### Inferences
- If you mean "Gemini Nano 4 in Chrome", the real thing is the Gemma 4 2B-IT model behind `#gemma4-for-built-in-ai`, which shows internally as `model_version/v4`. That internal "v4" label is probably where the "Nano 4" idea comes from. It is a developer trial behind a flag, not Chrome's shipping model. Chrome 150–158 Stable most likely still serves v3Nano by default; I found no source saying Gemma 4 became the default.
- The flag existed from Canary/Dev 153 and was still present in 154. I found no confirmation of its status in 158, but no source says it was removed either. Check `chrome://flags` on the Chrome 158 install.
- The Gemma 4 model is 2.4 GB against Nano's 4.0 GB, which matters for a machine with little free disk space.
- The Gemma 4 path appears to need a working WebGPU/GPU accelerator even when it runs on the CPU, based on the SIGILL crash report. The GTX 1050 Ti does support D3D12/WebGPU, so this is probably not a blocker on this laptop, but that is not verified.

### Gaps
- No official Google page (developer.chrome.com, chromestatus, release notes) says which Nano version Chrome 150–158 ships, or describes the Gemma 4 flag. All Gemma 4 in Chrome evidence comes from flag text, community posts and an eval-harness PR.
- I could not confirm whether Gemma 4 is a default, a Finch experiment, or a selectable option in Chrome 158.
- I found no API for detecting the model. `LanguageModel` has no model-name property, so model identity is visible only in `chrome://on-device-internals`.

## Q2. Exact hardware eligibility, applied to this laptop

### Takeaway
The docs say: GPU with **strictly more than 4 GB VRAM**, or CPU with **16 GB RAM and 4 cores**, plus **22 GB free on the profile volume**. Chromium's code is looser than the docs. VRAM below 3000 MiB disqualifies the GPU; VRAM below 5500 MiB caps the GPU at the "Medium" class, and Medium is still on the allowed list. The CPU backend reportedly needs **at least 15000 MiB of RAM**, 4 cores and a 64-bit CPU. A machine Windows shows as 15.9 GiB has about 16,280 MiB, so it **should pass the CPU check**. The GTX 1050 Ti with 4096 MiB fails the documented ">4 GB" rule, but in code it would land in Medium or Low, depending on how fast its benchmark runs. **The real blocker on this laptop is disk space:** 6 GB free on the profile drive is far below 22 GB, and below the 10 GB level at which Chrome removes the model.

### Cited Findings
- Official requirements: Windows 10/11, macOS 13+, Linux, or ChromeOS on Chromebook Plus. "At least 22 GB of free space on the volume that contains your Chrome profile". GPU: "Strictly more than 4 GB of VRAM"; CPU: "16 GB of RAM or more and 4 CPU cores or more". Audio input to the Prompt API needs the GPU. An unmetered connection is needed for the download only — [Get started](https://developer.chrome.com/docs/ai/get-started); [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- Chromium source, `services/on_device_model/ml/performance_class.cc`. Feature params under `kOnDeviceModelPerformanceParams`: `on_device_low_ram_threshold_mb` = 3000, `on_device_high_ram_threshold_mb` = 5500, `on_device_low_output_threshold` = 5, `on_device_low_threshold` = 50, `on_device_medium_threshold` = 75, `on_device_high_threshold` = 200, `on_device_very_high_threshold` = 500. The logic runs in this order: GPU blocked → benchmark failed → VRAM < 3000 MB or output < 5 tok/s or input < 50 tok/s = VeryLow; input < 75 = Low; input < 200 **or VRAM < 5500 MB** = Medium; input < 500 = High; otherwise VeryHigh. (These "RAM" thresholds are applied to GPU VRAM.) — [chromium/chromium performance_class.cc](https://raw.githubusercontent.com/chromium/chromium/main/services/on_device_model/ml/performance_class.cc). The same table appears in [adsm.dev](https://adsm.dev/posts/prompt-api/)
- `chrome://on-device-internals` displays "Minimum VRAM required: 3000 MiB" next to the detected VRAM — [dev.to investigation](https://dev.to/jacquesgariepy/inside-chromes-edges-silent-4gb-ai-install-a-complete-hands-on-investigation-54g2)
- Allowed classes: `kPerformanceClassListForOnDeviceModel` defaults to "3,4,5,6", `kLowTierPerformanceClassListForOnDeviceModel` to "3,4", and `kPerformanceClassListForImageInput` to "3,4,5,6" — [services/on_device_model/public/cpp/features.cc](https://raw.githubusercontent.com/chromium/chromium/main/services/on_device_model/public/cpp/features.cc). In the browser-side enum `OnDeviceModelPerformanceClass`: kUnknown=0, kError=1, kVeryLow=2, **kLow=3, kMedium=4, kHigh=5, kVeryHigh=6**, kServiceCrash=7, kGpuBlocked=8, kFailedToLoadLibrary=9 — [components/optimization_guide/core/model_execution/performance_class.h](https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/model_execution/performance_class.h). So Low through VeryHigh are allowed, and Low/Medium count as "low tier".
- Chrome for Testing builds default the class to `kGpuBlocked` (8), which means the CPU path — [performance_class.cc (components)](https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/model_execution/performance_class.cc). A Chromium-based browser pins the class with the switch `optimization-guide-performance-class=8`, which also stops the GPU probe at startup — [bowbrowser PR #145](https://github.com/theopenbrowsercompany/bowbrowser/pull/145)
- The CPU backend "is only available when there is at least 15000 MiB of RAM, 4 CPU cores, and a 64-bit processor" — [adsm.dev](https://adsm.dev/posts/prompt-api/). `kOnDeviceModelCpuBackend` is enabled by default and `kOnDeviceModelForceCpuBackend` is disabled by default — [features.cc](https://raw.githubusercontent.com/chromium/chromium/main/services/on_device_model/public/cpp/features.cc)
- A report says the performance class must be "High" or above and that "an entry-level integrated GPU will be ineligible" — [search summary of community guides (uper.pl / techno360 / multi-toolkit)](https://multi-toolkit.com/blog/how-to-enable-chrome-built-in-ai/). This **conflicts with** the source default "3,4,5,6", which includes Low and Medium.
- A blog says Chrome needs "20 GiB free on the volume holding the Chrome user-data directory, plus more than 2× the model size" in TMPDIR for downloads, and auto-uninstalls after "30 days of API non-use, or if free disk drops below 5 GiB". This **conflicts with** the official docs, which say 22 GB and removal below 10 GB — [adsm.dev](https://adsm.dev/posts/prompt-api/) vs [Get started](https://developer.chrome.com/docs/ai/get-started)
- Status strings in `chrome://on-device-internals` include "Not Eligible", "Not Ready For Unknown Reason", "No On-device Feature Used" and "Insufficient disk space". Chromium split the old `kModelNotAvailable` into `kModelNotEligible`, `kInsufficientDiskSpace` and `kNoOnDeviceFeatureUsed` — [chromium commit 44a75086 (Nov 2024)](https://chromium.googlesource.com/chromium/src/+/44a75086df65d5f2eab8737e64ccc1e0ca06746d%5E!/)

### Inferences (applied to this laptop)
- **RAM:** 15.9 GiB ≈ 16,280 MiB, which is above the reported 15000 MiB CPU threshold. The threshold seems designed so that "16 GB" machines with reserved memory still pass; 15000 MiB is about 14.6 GiB. I did not find the RAM-measurement function itself (probably `base::SysInfo::AmountOfPhysicalMemory`). The i7-8750H has 6 cores and is 64-bit, so it passes. **The CPU path should be eligible.**
- **GPU:** the GTX 1050 Ti reports about 4096 MiB VRAM. That is at least 3000 (not VeryLow by VRAM) and below 5500 (capped at Medium). If its benchmark manages at least 75 input tok/s and at least 5 output tok/s, it is Medium (4). Between 50 and 75 input tok/s it is Low (3). Both are in the default allowed list "3,4,5,6", but both are "low tier". Below 50 tok/s it is VeryLow, the GPU is not used, and Chrome should fall back to the CPU model if CPU-eligible. The documented ">4 GB" rule says this GPU fails; the code says it might be eligible as a low-tier GPU. Expect either outcome. Check the "Device performance class" line in `chrome://on-device-internals`.
- On this machine the CPU path is probably the more dependable route: a 2.7 GB CPU build, about 16 GB RAM, 6 cores. Expect slow output (a few tokens per second).
- **Storage:** Chrome checks free space on the volume that holds the **user data directory**. The model sits at `<User Data>\OptGuideOnDeviceModel` (Gemma 4 at `<User Data>\OptGuideManifestModel`). So launching Chrome with `--user-data-dir="D:\ChromeAI"` on the 39.5 GB drive should satisfy the 22 GB check. Caveats:
  - It creates a new, empty profile. Re-enable the flags and the `chrome://settings/ai` toggle in it.
  - adsm.dev says the download also needs more than 2× the model size free in TMP, which on Windows is usually `%TEMP%` on C:. That is about 8 GB for the GPU build, about 5.4 GB for CPU, about 4.8 GB for Gemma 4. 6 GB on C: may not be enough. Setting TEMP/TMP to the big drive for the Chrome process is a plausible workaround, but unverified.
- With only 6 GB free on the default profile drive, the model will not install there. Even if it did, Chrome would remove it because free space is below 10 GB.

### Gaps
- I could not locate in Chromium source the exact CPU check (15000 MiB, 4 cores, 64-bit) or the function that measures RAM; the figure rests on one blog (adsm.dev).
- No primary source confirms which temp directory Chrome uses for model downloads on Windows, or whether it is checked.
- I found no community report of a GTX 1050 Ti or other 4 GB card and its measured class.
- No source confirms how Chrome chooses between the GPU and CPU paths when the GPU class is Low or Medium. The `kLowTierPerformanceClassListForOnDeviceModel` param suggests a separate model or config for low-tier devices, but its effect is undocumented.

## Q3. How to enable or force it: flags, policy, BypassPerfRequirement

### Takeaway
On Chrome 148+ desktop, the Prompt API is on by default for eligible devices. Since Chrome 157, new Beta/Dev/Canary profiles have **chrome://settings/ai → On-device AI** turned **off** by default. While it is off, every built-in API reports `unavailable`, so a Chrome 158 user must turn it on first. To force eligibility, set `chrome://flags/#optimization-guide-on-device-model` to "Enabled BypassPerfRequirement". Community sources say this still works up to at least Chrome 154. To force CPU, `--optimization-guide-performance-class=8` (kGpuBlocked) is the route Chrome for Testing uses. For Gemma 4, use `#gemma4-for-built-in-ai`. The enterprise policy `GenAILocalFoundationalModelSettings` can only allow (0) or block (1) the model. It cannot override hardware checks.

### Cited Findings
- The On-device AI toggle in `chrome://settings/ai` (Chrome 152+) is "off by default in new Beta/Dev/Canary profiles since 157". When it is off, "every built-in API reports `unavailable`" — [comment-vibe PR #42, 20 Oct 2026](https://github.com/dzienisz/comment-vibe/pull/42) (an automated bot PR; treat as secondary)
- Two flags are needed: `chrome://flags/#optimization-guide-on-device-model` set to "Enabled BypassPerfRequirement", and `chrome://flags/#prompt-api-for-gemini-nano` set to "Enabled". "Chrome 154+ simplifies this to a single flag." Verified on Chrome 149 and 154 — [Ar9av/gemini-nano-chrome](https://github.com/Ar9av/gemini-nano-chrome)
- "If Chrome's benchmark undersells your machine, you can try setting chrome://flags/#optimization-guide-on-device-model to Enabled BypassPerfRequirement to skip the gate" — [adsm.dev, May 2026](https://adsm.dev/posts/prompt-api/)
- Override switch `kOverridePerformanceClassSwitch`; Chrome for Testing defaults to kGpuBlocked — [performance_class.cc](https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/model_execution/performance_class.cc). The switch spelling is `optimization-guide-performance-class=8` — [bowbrowser PR #145](https://github.com/theopenbrowsercompany/bowbrowser/pull/145)
- Gemma 4: `chrome://flags/#gemma4-for-built-in-ai` (Canary/Dev 153+). One source also turned on the Summarizer API flag — [calvin.my](https://calvin.my/posts/chrome-on-device-ai-with-gemma4-aug-2026); [web-ai-evals PR #4](https://github.com/swissspidy/web-ai-evals/pull/4)
- Policy: setting `GenAILocalFoundationalModelSettings = 1` under `HKLM:\SOFTWARE\Policies\Google\Chrome` stops the download and removes existing installs. Supported on Chrome 124+ — [dev.to investigation](https://dev.to/jacquesgariepy/inside-chromes-edges-silent-4gb-ai-install-a-complete-hands-on-investigation-54g2)

### Inferences
- Suggested sequence for this laptop:
  1. Launch Chrome 158 with `--user-data-dir` on the 39.5 GB drive.
  2. Turn on `chrome://settings/ai` → On-device AI.
  3. Set `#optimization-guide-on-device-model` to BypassPerfRequirement, and turn on `#prompt-api-for-gemini-nano` if it is still listed.
  4. Optionally add `--optimization-guide-performance-class=8` to force the CPU model.
  5. Optionally turn on `#gemma4-for-built-in-ai` for the smaller Gemma 4 model.
  6. Check `chrome://on-device-internals`, then run `await LanguageModel.availability()` and `LanguageModel.create()` to start the download. A user gesture may be needed.
- BypassPerfRequirement skips the performance-class gate. It probably does not skip the disk-space check, because disk space is reported as a separate eligibility reason (`kInsufficientDiskSpace`).

### Gaps
- No official 2026 source confirms that BypassPerfRequirement still exists in Chrome 155–158. The latest confirmation is a community source on Chrome 154.
- I did not confirm whether `#prompt-api-for-gemini-nano` is still listed in 158 or has expired.
- I did not get the full value list for `GenAILocalFoundationalModelSettings` from the official policy page. Only value 1 (do not download) is confirmed, and 0 is presumably the default "allowed".

## Q4. Download size, storage location, status checks, removal

### Takeaway
Gemini Nano v3 is about 4.0 GB for the GPU build (4,072 MiB `weights.bin`) and about 2.7 GB for the CPU build. Gemma 4 2B-IT is about 2.4 GB. Nano is stored in `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\<version>\`, or the same folder under a custom `--user-data-dir`. Gemma 4 goes in `OptGuideManifestModel\<hash>\<version>\`. Check status in `chrome://on-device-internals` or with `LanguageModel.availability()`. Officially, the model is removed if free space drops below 10 GB.

### Cited Findings
- Path `%LOCALAPPDATA%\Google\Chrome\User Data\OptGuideOnDeviceModel\<version>\weights.bin`, 4,072.13 MiB. Deleting it by hand does not last, because Chrome downloads it again — [dev.to investigation](https://dev.to/jacquesgariepy/inside-chromes-edges-silent-4gb-ai-install-a-complete-hands-on-investigation-54g2)
- GPU build 4.0 GB, CPU build 2.7 GB — [adsm.dev](https://adsm.dev/posts/prompt-api/). One source reports 4.27 GB — [search summary of pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en)
- Gemma 4 2B-IT is about 2.4 GB, stored in `OptGuideManifestModel/<asset hash>/<version>/` — [web-ai-evals PR #4](https://github.com/swissspidy/web-ai-evals/pull/4)
- `availability()` returns "available", "downloadable", "downloading" or "unavailable". `chrome://on-device-internals` shows model status and size — [Get started](https://developer.chrome.com/docs/ai/get-started)
- `chrome://on-device-internals` tabs and fields seen in the wild: model name/version/backend type; device performance class; minimum and detected VRAM — [dev.to](https://dev.to/jacquesgariepy/inside-chromes-edges-silent-4gb-ai-install-a-complete-hands-on-investigation-54g2). A "Broker state" tab lists every installed model (Nano v3 and Gemma 4) — [calvin.my](https://calvin.my/posts/chrome-on-device-ai-with-gemma4-aug-2026)
- "If the available storage space falls below 10 GB after download, the model is removed" — [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api). A blog conflicts: removal below 5 GiB or after 30 days unused — [adsm.dev](https://adsm.dev/posts/prompt-api/)

### Inferences
- Plan for 22 GB free on the drive holding the user data directory, and keep at least 10 GB free afterwards. The 39.5 GB drive meets both with room to spare.

### Gaps
- I did not obtain a list of every tab in `chrome://on-device-internals` for Chrome 158.

## Q5. Supported languages (and Arabic)

### Takeaway
Officially, from Chrome 149 the built-in model supports **English, Spanish, Japanese, German and French** for input and output text. The Prompt API accepts `"en"`, `"ja"`, `"es"`, `"de"` and `"fr"` in `expectedInputs`/`expectedOutputs`. **Arabic is not supported.** I found no 2026 source adding more languages. The Gemma 4 model supports 140+ languages, but I found no evidence that Chrome lifts the language gate when the Gemma 4 flag is on.

### Cited Findings
- "From Chrome 149 onward ... English, Spanish, Japanese, German, and French for input and output text" — [Get started](https://developer.chrome.com/docs/ai/get-started)
- `expectedInputs`/`expectedOutputs` accept "en", "ja", "es", "de", "fr" (docs updated 21 Oct 2026) — [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- Older fact: before Chrome 149 the list was English, Japanese and Spanish — [adsm.dev](https://adsm.dev/posts/prompt-api/)
- Gemma 4 is "built for a global audience with support for over 140 languages" — [Google Developers Blog, Gemma 4](https://developers.googleblog.com/bring-state-of-the-art-agentic-skills-to-the-edge-with-gemma-4/)
- The Gemma 4 flag test covered only English — [calvin.my](https://calvin.my/posts/chrome-on-device-ai-with-gemma4-aug-2026)

### Inferences
- Asking for `expectedInputs: [{type:"text", languages:["ar"]}]` will most likely make `availability()` or `create()` reject or report unavailable. Arabic prompts sent without declaring a language may get poor-quality or safety-filtered output. Arabic text should be handled by a cloud model, for example through Firebase AI Logic's hybrid fallback.

### Gaps
- I found no source testing Arabic with Gemma 4 in Chrome, and no source saying whether the language allow-list changes when the Gemma 4 flag is on.

## Q6. Context window and token limits

### Takeaway
The current API exposes `session.contextWindow` and `session.contextUsage`, which replaced the older `inputQuota`/`inputUsage` names. Official docs give no number. Community measurements put v3Nano's context window at **9216 tokens**, shared by input and output. I found no Gemma 4 figure.

### Cited Findings
- The docs describe `session.contextUsage` and `session.contextWindow` but give no exact token limits — [Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api)
- Context window of "9216 tokens" — [adsm.dev](https://adsm.dev/posts/prompt-api/); "9216 tokens shared between input and output" — [Ar9av/gemini-nano-chrome](https://github.com/Ar9av/gemini-nano-chrome)
- No quota or context information was published for the Gemma 4 model — [web-ai-evals PR #4](https://github.com/swissspidy/web-ai-evals/pull/4); [calvin.my](https://calvin.my/posts/chrome-on-device-ai-with-gemma4-aug-2026)

### Inferences
- Read `session.contextWindow` at runtime, falling back to `inputQuota` on older builds, and keep a prompt plus its expected output well under about 9K tokens. Use `session.measureContextUsage()` (older name: `measureInputUsage()`) before sending.

### Gaps
- I did not verify the separate per-prompt limit. Earlier explainers in 2024 cited a smaller per-prompt cap than the session limit, but I found no 2026 source and no exact number. I did not confirm the context window of the CPU v3Nano build or of Gemma 4 2B-IT in Chrome.
