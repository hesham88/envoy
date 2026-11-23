"""
Runs the video-narration skill's narrate.py with a leaner Chatterbox loader for low-memory machines.

Chatterbox's own from_local keeps each weight dictionary alive and copies it into freshly allocated
parameters, so loading peaks at roughly twice the model size; on this machine that ran out of commit
memory (an access violation inside safetensors). Here each dictionary is assigned in place and freed
before the next one loads, then cast to float32 as the original copy does. Same files, same model,
same output.

Usage: python video/narrate_lowmem.py <lines.json> <out_dir> [narrate.py options]
"""
import gc
import os
import runpy
import sys
from pathlib import Path

import torch
from safetensors.torch import load_file
from chatterbox import tts as T

SCRIPT = os.path.expanduser("~/.claude/skills/video-narration/scripts/narrate.py")


def lean_from_local(cls, ckpt_dir, device):
    ckpt_dir = Path(ckpt_dir)
    ve = T.VoiceEncoder()
    ve.load_state_dict(load_file(ckpt_dir / "ve.safetensors"), assign=True)
    ve.float().to(device).eval()
    gc.collect()

    t3 = T.T3()
    state = load_file(ckpt_dir / "t3_cfg.safetensors")
    if "model" in state.keys():
        state = state["model"][0]
    t3.load_state_dict(state, assign=True)
    del state
    gc.collect()
    t3.float().to(device).eval()

    s3gen = T.S3Gen()
    state = load_file(ckpt_dir / "s3gen.safetensors")
    s3gen.load_state_dict(state, strict=False, assign=True)
    del state
    gc.collect()
    s3gen.float().to(device).eval()

    tokenizer = T.EnTokenizer(str(ckpt_dir / "tokenizer.json"))
    conds = None
    builtin = ckpt_dir / "conds.pt"
    if builtin.exists():
        conds = T.Conditionals.load(builtin, map_location=torch.device("cpu")).to(device)
    return cls(t3, s3gen, ve, tokenizer, device, conds=conds)


T.ChatterboxTTS.from_local = classmethod(lean_from_local)
sys.argv = [SCRIPT] + sys.argv[1:]
runpy.run_path(SCRIPT, run_name="__main__")
