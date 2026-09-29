---
name: "bilibili-video-transcribe"
description: "Transcribe Bilibili videos to text: fetch audio stream via Bilibili API, convert with ffmpeg-static, and run local Whisper ASR via @huggingface/transformers. Use when the user wants actual spoken content/transcript of a Bilibili video."
version: 9
---
## When to Use
Use when the user shares a Bilibili (bilibili.com) video URL and wants the actual spoken content: transcript, summary, or content extraction. Works fully offline after model download (no Bilibili login, no paid ASR API). Requires Node.js; npm installs ffmpeg-static and @huggingface/transformers.

## Procedure
Run the staged pipeline (`scripts/pipeline/`): `1_fetch.js <BV> [auto|720|1080]` → `2_asr.js` → `3_ocr.js` → `4_merge.js`, then do a **semantic term-correction pass** over the merged transcript before presenting. Domain terms are systematically misrecognized; fix by meaning, not just string matching — the same error appears in different forms (tick→Tik/dick/tik, 桥接→乔接/拆接/析接/折接) and corrections depend on context ("dick数据" = tick数据; "OMT/QMP" → QMT; "行情快到" → 行情快照; "保募级" → 保姆级). Normalize half/full-width punctuation, Simplified vs Traditional mixing, and split function names written with spaces (get full tick → get_full_tick). Keep a per-domain correction map and extend it whenever a new mistranscription is found.

Output naming convention: create one folder per video under the pipeline output directory, named with a **short semantic abbreviation of the video title** (2-8 characters capturing the core topic, e.g. 集合竞价tick获取, tick接口全解析 — NOT the BV id). The final corrected transcript file is named exactly after the full video title from the view API (`meta.title`), sanitized for the filesystem (strip ` / \ : * ? " < > |`). Intermediate artifacts go in a `work/` subfolder (meta.json, asr.txt, ocr_frames.json, subtitle_timeline.txt); large temp files (frames/, video.mp4, audio.wav) are deleted after merging. meta.json retains the BV id for traceability.

## Pipeline behavior (1_fetch.js)
- Subtitle band: crops the bottom **72%~100%** of each frame at 1fps — small subtitles hugging the bottom edge (PPT/screen-recording courses) must not be clipped.
- Adaptive quality (default `auto`): 720P first → OCR-probe 5 frames (at 10/30/50/70/90% of duration) → ≥2 valid frames → keep 720P; else upgrade to real 1080P DASH via `try_look=1` and pick the better score (tie → 720P).
- Anonymous streams cap at 720P (qn 80/112/116 all return 64); `try_look=1` unlocks the id=80 (1920×1080) DASH video track — full-length download verified.
- 1080P DASH is a video-only track (no audio) — the pipeline keeps audio/video separate, so this is compatible.
- Frame ordering beyond 999 frames: numeric sort (string sort puts t1000 before t101).

## Pitfalls
- Bilibili AI-summary/subtitle endpoints require login (SESSDATA cookie); do not rely on them for anonymous access
- playurl DASH audio links expire quickly and require Referer: https://www.bilibili.com/ and a browser User-Agent
- transformers.js in Node cannot decode audio files itself (no AudioContext); WAV must be parsed to Float32Array manually
- Long audio (>30s) needs chunk_length_s/stride_length_s or only the first 30s is transcribed
- onnxruntime-node fails with 'module could not be found' if VC++ Redistributable is missing; silently install vc_redist.x64.exe
- whisper-small output mixes Simplified/Traditional Chinese and mishears jargon (tick, QMT, function names); fix terms when summarizing
- ffmpeg-static npm package blocks its binary download postinstall by default; run node install.js inside the package folder manually
- No-subtitle videos: upgrade ASR to whisper-medium (Xenova/whisper-medium, dtype q8) — small model produces repetition hallucinations on casual rambling speech; medium ~1.5x realtime on CPU
- HuggingFace CDN often unreachable via Node fetch in CN networks: use `node --dns-result-order=ipv4first` AND set `env.remoteHost='https://hf-mirror.com'` programmatically after import (HF_ENDPOINT env var is NOT read by recent @huggingface/transformers)
- glm-asr API exists (10min max per file) but requires paid balance (error 1113) — not usable on Coding Plan; only glm-4v-flash OCR is free
- For higher-accuracy Chinese ASR, FunASR/SenseVoiceSmall (CPU 17x realtime, CER 7.8% vs Whisper-large-v3 20%) is the best local option, but needs Python; FunASR also offers llama.cpp/GGUF SenseVoice runtime usable without Python
- Volcano Engine doubao-seedasr is the Doubao ASR (paid, ~2.5x cheaper than Whisper API, no free tier); requires separate enablement in the Doubao Voice console
- Do not upload copyrighted video audio to third-party file hosts; keep processing local

## Verification
1. transcript.txt contains full-length Chinese text (not just the first 30 seconds)
2. Known jargon corrections applied in the final summary shown to the user
3. Temporary download/upload scripts removed from the working directory
4. OCR step (3_ocr.js) uses glm-4v-flash with concurrency 8 — measured account limit is 10 concurrent calls (≥12 triggers error 1302). It retries 1302/429/network with exponential backoff (max 4) and caches progress to ocr_frames.json so interrupted runs resume; a corrupted cache is auto-backed-up to .bak and restarted
5. glm-4v-flash is completely free and uncapped in call count; limits are ~10 concurrent requests and single image ≤5MB per call
6. Whisper ASR is fully local, no quota; only the OCR step consumes an external API
