# bilibili-video-transcribe

A [Pi](https://github.com/badlogic/pi-mono) / Agent-Skills-compatible skill: get the **actual spoken content** of a Bilibili video as text — no Bilibili login, no paid ASR API, everything runs locally.

Pipeline:
1. Bilibili web API → video metadata (`cid`) → anonymous DASH audio stream URL
2. `ffmpeg-static` → 16 kHz mono WAV
3. `@huggingface/transformers` → local Whisper-small (q8) → Chinese transcript (chunked, handles long videos)

## Install (Pi)

Clone into a skills directory, e.g.:

```bash
git clone https://github.com/daplm1974/bilibili-video-transcribe \
  ~/.pi/agent/skills/bilibili-video-transcribe
```

Or use directly with any agent that supports the [Agent Skills spec](https://agentskills.io/specification).

## Standalone usage

```bash
npm install ffmpeg-static @huggingface/transformers
node node_modules/ffmpeg-static/install.js   # npm blocks postinstall by default

node scripts/bilibili-transcribe.js BV1NPeU6eEB5
# → transcript-BV1NPeU6eEB5.txt
```

## Gotchas

- Audio URLs require a browser `User-Agent` + `Referer: https://www.bilibili.com/` and expire quickly.
- Bilibili subtitle/AI-summary endpoints require login — this skill avoids them entirely.
- Windows: if `onnxruntime-node` fails to load, install the [VC++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe).
- Whisper-small mixes Simplified/Traditional Chinese and mishears domain jargon (`tick`, `QMT`, …) — correct terms when summarizing.

## Pipeline scripts

`scripts/pipeline/` contains the staged pipeline used in production (alternative to the single-file script):

```
1_fetch.js   B站API下载音频+视频 → wav + 1fps字幕帧裁剪放大
2_asr.js     本地Whisper-small转录 (无额度限制)
3_ocr.js     glm-4v-flash逐帧OCR — 并发8 + 1302指数退避重试 + 断点缓存 (实测账户并发上限10)
4_merge.js   合并为带时间轴字幕
```

Concurrency measured empirically: 2/5/8/10 parallel calls all pass; ≥12 triggers error `1302` (rate limit). Script uses 8 with retry to stay safe.

> Note: `3_ocr.js` reads the API key from `~/.pi/agent/auth.json` (zai-coding-cn). Replace with your own Zhipu key source if used standalone.

## Status (2026-09-29)

- Pipeline battle-tested on 3 videos（大QMT直连实盘 / tick接口全解析 / 集合竞价tick获取）— final transcripts in `output/<video>/`.
- `work/` intermediates (raw ASR, downloaded media, frame JSONs) stay local and are gitignored.
- Stable & ready-to-use; no active development. Possible next steps: batch-queue multiple BV ids in one run; word-level subtitle alignment via FunASR :8104 timestamps.
