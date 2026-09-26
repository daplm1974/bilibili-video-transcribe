---
name: bilibili-video-transcribe
description: Transcribe Bilibili videos to text (Bilibili API + ffmpeg-static + local Whisper ASR). Use when the user wants the actual spoken content or transcript of a Bilibili video URL.



---
## When to Use
Use when the user shares a Bilibili (bilibili.com) video URL and wants the actual spoken content: transcript, summary, or content extraction. Works fully offline after model download (no Bilibili login, no paid ASR API). Requires Node.js; npm installs ffmpeg-static and @huggingface/transformers.

## Procedure
1. Get video metadata: GET https://api.bilibili.com/x/web-interface/view?bvid=BVID (gives cid, owner, duration, title)
2. Get audio stream URL: GET https://api.bilibili.com/x/player/playurl?bvid=BVID&cid=CID&qn=64&fnval=16 with a browser User-Agent and Referer https://www.bilibili.com/video/BVID/ — anonymous access works; pick the smallest dash.audio entry (id 30216)
3. Download the .m4s audio to audio.m4a with the same UA/Referer headers; streams are ~1MB per 2.5 min at 64kbps
4. Ensure ffmpeg: npm install ffmpeg-static, then run `node install.js` inside node_modules/ffmpeg-static (npm blocks postinstall scripts by default)
5. Convert: ffmpeg -y -i audio.m4a -ac 1 -ar 16000 -f wav audio.wav (16kHz mono 16-bit PCM)
6. npm install @huggingface/transformers; if onnxruntime-node fails with 'module could not be found', install VC++ Redist: curl -sL -o vc_redist.x64.exe https://aka.ms/vs/17/release/vc_redist.x64.exe && ./vc_redist.x64.exe /install /quiet /norestart
7. Run ASR: pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {dtype:'q8'}); parse the WAV manually (find 'data' chunk, readInt16LE / 32768) into Float32Array
8. Transcribe with { language: 'zh', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 }
9. Save transcript, then correct known mistranscriptions when summarizing: Tik→tick, QMP→QMT, GetFullTik→get_full_tick, Context Info→ContextInfo; whisper-small also mixes Traditional/Simplified characters
10. Clean up temp files (audio.m4a, scripts) afterward; keep audio/transcript only if the user wants them

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