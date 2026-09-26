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
