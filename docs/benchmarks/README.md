# What if Envoy ran on faster hardware? (27 November 2026)

Envoy's on-device steps were measured on a 2018 laptop with no usable GPU (Chrome forced onto the CPU
backend). To see what a GPU changes, the same 17 one-click sample questions ran through the same
pipeline (`@envoy/ai` `analyze`, plus the on-device answer where Envoy answers locally) on a cloud
GPU workstation. No cloud model was called in either run.

|                                                 | 2018 laptop (CPU)                                                                              | Cloud workstation (NVIDIA L4 GPU)                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Machine                                         | Intel i7-8750H, 16 GB; GTX 1050 Ti with 4,004 MB VRAM, under Chrome's 4 GB bar, so CPU backend | Google Cloud `g2-standard-4`: 4 vCPU, 16 GB, NVIDIA L4 24 GB (Vulkan, driver 580)                     |
| Chrome                                          | 158.0.8127.38, Windows                                                                         | 158.0.8127.88, Linux                                                                                  |
| Model                                           | `gemma4_component` 2026.11.3.1140 (verified on `chrome://on-device-internals`)                 | Chrome's built-in model with the Gemma 4 flag set; the component version was not captured (see below) |
| Questions completed in Private mode             | 16 of 17 (one stall, re-run later)                                                             | **17 of 17** (run 2)                                                                                  |
| Time per question, median                       | **125 s**                                                                                      | **10.6 s**                                                                                            |
| Time per question, range                        | 93–212 s                                                                                       | 2.7–12.5 s                                                                                            |
| Short documents (lease, job offer)              | 103–179 s                                                                                      | 2.7–3.8 s                                                                                             |
| Longer documents (lab bill, contract, loan)     | 93–212 s                                                                                       | 10.5–12.5 s                                                                                           |
| Local answer (questions answered on the device) | 13–26 s                                                                                        | 0.25–3.3 s                                                                                            |
| Raw Prompt API, warm                            | not measured                                                                                   | first token in 24–34 ms, about 41–50 tokens/s                                                         |
| Cloud calls                                     | 0                                                                                              | 0                                                                                                     |

Per question, the GPU was 8 to 54 times faster (11.8× at the median). Longer documents take several
on-device batches, which is why they cluster around 11 s.

## Evidence

- `2026-11-27-gpu-l4-run2.json`: the run in the table (every question, every step's own time).
- `2026-11-27-gpu-l4-run1.json`: the first run, including the model download. One question
  (the non-compete question, which also stalled once on the laptop) took 154 s and fell back to Basic
  protection, as designed; the other 16 match run 2.
- `2026-11-27-gpu-l4-nvidia-smi.csv`: GPU use every 2 s during run 2: 72–85% while the model works,
  2.2 GB of VRAM, so the model ran on the GPU, not the CPU.
- Chrome's own log on the VM: `Selected adapter: NVIDIA L4, arch=lovelace, backend=Vulkan, adapterType=Discrete GPU`.
- Laptop: `tests/eval/probes/sample-routes.json` (same 17 questions, same script logic).
- The script: `scripts/bench-device.mjs` (`node scripts/bench-device.mjs --label <machine> [--download]`).

## Limits

- The workstation's `chrome://on-device-internals` page was disabled in its fresh profile, and the VM
  was deleted before its Local State was read, so the exact model component on the GPU run is not
  recorded. The Gemma 4 flag was set the same way as on the laptop.
- Different operating systems (Windows laptop, Linux workstation) and Chrome patch versions.
- The laptop numbers were taken while other work was running on it; the eval's own median on the
  laptop is 73.5 s (`docs/EVAL.md`).
- Cost: about 85 minutes of one L4, capped at 2 hours with automatic deletion, in a separate Google
  Cloud project; Envoy's Firebase project (free tier) was not involved.
