---
name: "bilibili-video-transcribe"
description: "Transcribe Bilibili videos to text: fetch audio stream via Bilibili API, convert with ffmpeg-static, and run local Whisper ASR via @huggingface/transformers. Use when the user wants actual spoken content/transcript of a Bilibili video."
---
## When to Use
Use when the user shares a Bilibili (bilibili.com) video URL and wants the actual spoken content: transcript, summary, or content extraction. Works fully offline after model download (no Bilibili login, no paid ASR API). Requires Node.js; npm installs ffmpeg-static and @huggingface/transformers.

## Procedure
After OCR/ASR, run a **semantic term-correction pass** over the merged transcript before presenting it. Domain terms are systematically misrecognized; fix by meaning, not just string matching — the same error appears in different forms (tick→Tik/dick/tik/티크) and corrections depend on context (e.g. "dick数据" is clearly "tick数据"; "OMT/QMP" → QMT; "行情快到" → 行情快照; "保募级" → 保姆级; "under score" sequences spell out underscores in function names like get_full_tick). Also normalize: half/full-width punctuation, Simplified vs Traditional mixing, and split function names written with spaces (get full tick → get_full_tick). Keep a per-domain correction map and extend it whenever a new mistranscription is found.
## Pitfalls
- Bilibili AI-summary/subtitle endpoints require login (SESSDATA cookie); do not rely on them for anonymous access
- playurl DASH audio links expire quickly and require Referer: https://www.bilibili.com/ and a browser User-Agent
- transformers.js in Node cannot decode audio files itself (no AudioContext); WAV must be parsed to Float32Array manually
- Long audio (>30s) needs chunk_length_s/stride_length_s or only the first 30s is transcribed
- onnxruntime-node fails with 'module could not be found' if VC++ Redistributable is missing; silently install vc_redist.x64.exe
- whisper-small output mixes Simplified/Traditional Chinese and mishears jargon (tick, QMT, function names); fix terms when summarizing
- ffmpeg-static npm package blocks its binary download postinstall by default; run node install.js inside the package folder manually
- Do not upload copyrighted video audio to third-party file hosts; keep processing local

## Verification
1. transcript.txt contains full-length Chinese text (not just the first 30 seconds)
2. Known jargon corrections applied in the final summary shown to the user
3. Temporary download/upload scripts removed from the working directory