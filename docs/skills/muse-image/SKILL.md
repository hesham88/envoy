---
name: muse-image
description: Use when generating or editing images with Meta's Muse Image model (muse-image-1.0) — logos concepts, app illustrations, hero art, OG/social images, sticker or asset sheets, demo-video stills, mockup imagery, or restyling/combining reference images. Triggers - "Muse", "Muse Image", "generate an image", "make assets", "logo concepts", "asset sheet", "OG image", "illustration for the app".
---

# Muse Image (Meta, `muse-image-1.0`)

Text-to-image and image editing through Meta's official API (`https://api.meta.ai/v1`). The endpoints mirror OpenAI's Images API, are synchronous, and cost a flat **$0.01 per image** (failed or safety-blocked images aren't billed). The limit is **150 requests per minute per team**.

## Budget: $8 cap, enforced
- The owner set a **$8 total cap** (800 images). The script keeps `spend-ledger.csv` next to itself and **refuses** any call that could go over it. Never raise `MUSE_BUDGET_USD` without the owner's explicit OK.
- Spend carefully. Explore with `--n 2–4 --low`, then make finals with `--n 1`. Write the prompt carefully before calling rather than iterating blindly.

## The key
- Read from `MODEL_API_KEY` if set; otherwise from the owner's local key file, which is outside every repo (ask the owner where).
- **Never print, echo, log or commit the key.** Never copy it into a project, `.env.example`, a prompt or a chat. The script reads it itself; don't `cat` the file.

## Generate: use the script
```bash
python -I <skills-dir>/muse-image/muse_image.py "PROMPT" --out OUT_DIR --name NAME [--n 4] [--size 1536x1024] [--format png] [--low]
```
- `--ref a.png --ref b.png` switches to **edit / compose** mode (`/v1/images/edits`, 1–10 reference images).
- `--n` makes 1–10 variations in one call (each is billed).
- `--size WxH` sets only the **aspect ratio** (e.g. `1024x1024`, `1536x1024`, `1792x1024`, `1200x630`). Output resolution is fixed by the model (up to ~1600px). Ratios beyond 16:1 are rejected.
- `--low` uses one pass (`reasoning_strength: low`); the default `high` refines over several passes. The price is the same, and high is slower.
- `--allow-tools` lets Muse use its built-in web search, image search and shell. **They're off by default** so brand assets don't pull in third-party imagery or trademarks.
- It writes `NAME-1.png …` plus `NAME.json`, which records the prompt, any revised prompt, size and time. Keep the sidecar: it's the provenance record for "AI-generated assets" disclosures.

## What Muse can't do (plan around it)
- **No transparent background** (always opaque). For logos and icons, generate concepts with Muse, then **redraw the chosen mark as hand-written SVG**. An icon must work at 16px and be crisp vector; a raster from Muse is a reference, not the deliverable. Or cut it out of a flat solid background.
- No seed (every call is non-deterministic), no negative prompt, no style parameter, no mask. Put style and "avoid X" in the prompt text.
- Unknown fields are rejected with HTTP 400. `moderation` is rejected for this model too.

## Prompting that works
- State the subject, composition, style, palette (hex colors), lighting and aspect, plus what to avoid: "no text, no logos, no watermark, no people".
- For a consistent asset set, write one shared style paragraph and reuse it verbatim in every prompt. Or generate one hero image and pass it as `--ref` for the rest.
- For a sheet (icons, stickers, states), ask for "a grid of N items on a flat #XXXXXX background, evenly spaced, same style", then crop them in code.
- Don't rely on rendered text in the image. Add type in code or SVG.

## Rules (Meta terms, read 2026-11-22)
- **You own your inputs and outputs** (ToS 4.1). Commercial use in your own products is allowed, with no attribution required. Outputs aren't unique.
- Don't remove watermarks, labels, metadata or other provenance signals Meta applies, and don't claim outputs are human-made. Disclose AI-generated assets where a contest or law asks. **The #BuildHybridAI rules require disclosing tools used.**
- Forbidden: real identifiable people without consent, sexual content, minors, violence, fraud, impersonation, weapons. Users must be 18+. Don't resell or proxy the API.
- For hackathon work: **no third-party logos, trademarks or brand look-alikes** in any asset.

## Raw API (if the script doesn't fit)
`POST https://api.meta.ai/v1/images/generations` with headers `Authorization: Bearer $MODEL_API_KEY`, `Content-Type: application/json` and body
`{"model":"muse-image-1.0","prompt":"…","n":1,"size":"1536x1024","output_format":"png","response_format":"b64_json","tool_enablement":{"enable_image_search":false,"enable_web_search":false,"enable_shell":false}}`
returns `{"data":[{"b64_json":"…","revised_prompt":"…"}],"output_format":"png","usage":{…}}`.
For edits, post the same body plus `"images":[{"image_url":"data:image/png;base64,…"}]` to `/v1/images/edits`.
Errors use the OpenAI shape. A 400 `content_policy_violation` means you should reword. Retry 429 and 503 with backoff, honoring `Retry-After`.
Docs: https://dev.meta.ai/docs/image-generation · https://dev.meta.ai/docs/api-reference/images/create-image · https://dev.meta.ai/docs/pricing-rate-limits
