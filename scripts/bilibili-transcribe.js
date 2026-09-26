#!/usr/bin/env node
/**
 * bilibili-transcribe.js — Download a Bilibili video's audio and transcribe it
 * locally with Whisper (transformers.js). No Bilibili login, no paid ASR API.
 *
 * Usage:
 *   node scripts/bilibili-transcribe.js <BV号或完整URL> [输出文件]
 *
 * First run: npm install ffmpeg-static @huggingface/transformers
 *   (if the ffmpeg-static binary is missing, run:
 *    node node_modules/ffmpeg-static/install.js)
 *   (on Windows, if onnxruntime-node fails to load, install VC++ Redist:
 *    https://aka.ms/vs/17/release/vc_redist.x64.exe)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';

function die(msg) { console.error('ERROR:', msg); process.exit(1); }

async function jget(url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(referer && { Referer: referer }) } });
  return r.json();
}

function parseWavMono16(file) {
  const buf = fs.readFileSync(file);
  const idx = buf.indexOf(Buffer.from('data'));
  const pcm = buf.subarray(idx + 8);
  const out = new Float32Array(pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) die('usage: node bilibili-transcribe.js <BV号或URL> [输出文件]');
  const m = arg.match(/BV[0-9A-Za-z]+/);
  if (!m) die('no BV id found in argument');
  const bvid = m[0];
  const outFile = process.argv[3] || `transcript-${bvid}.txt`;

  // 1. metadata
  const meta = await jget(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  if (meta.code !== 0) die(`view api: ${meta.message}`);
  const { cid, duration } = meta.data;
  console.log(`# ${meta.data.title}\n# UP: ${meta.data.owner.name}  duration: ${Math.round(duration)}s`);

  // 2. playurl -> smallest audio stream
  const play = await jget(
    `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16`,
    `https://www.bilibili.com/video/${bvid}/`);
  if (play.code !== 0 || !play.data.dash) die(`playurl api: ${play.message || 'no dash streams (login may be required)'}`);
  const streams = play.data.dash.audio.slice().sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0));
  const audio = streams[0];

  // 3. download
  const res = await fetch(audio.baseUrl, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } });
  if (!res.ok) die(`audio download: HTTP ${res.status}`);
  const m4a = path.join(process.cwd(), `.${bvid}.m4a`);
  fs.writeFileSync(m4a, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded audio: ${(fs.statSync(m4a).size / 1e6).toFixed(1)} MB`);

  // 4. convert (16kHz mono wav)
  let ffmpeg;
  try { ffmpeg = require('ffmpeg-static'); } catch { die('npm install ffmpeg-static first'); }
  const wav = path.join(process.cwd(), `.${bvid}.wav`);
  execFileSync(ffmpeg, ['-y', '-i', m4a, '-ac', '1', '-ar', '16000', '-f', 'wav', wav], { stdio: 'ignore' });
  fs.unlinkSync(m4a);

  // 5. ASR
  let pipeline;
  try { ({ pipeline } = await import('@huggingface/transformers')); }
  catch { die('npm install @huggingface/transformers first'); }
  console.log('loading whisper-small (first run downloads ~125MB)...');
  const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', { dtype: 'q8' });

  console.log('transcribing...');
  const text = await asr(parseWavMono16(wav), {
    language: 'zh', task: 'transcribe',
    chunk_length_s: 30, stride_length_s: 5,
  });
  fs.unlinkSync(wav);

  const result = `# ${meta.data.title}\n# ${meta.data.owner.name}\n\n${text.text || text}\n`;
  fs.writeFileSync(outFile, result);
  console.log(`\n=== TRANSCRIPT (${outFile}) ===\n${text.text || text}`);
}

main().catch(e => die(e.message));
