#!/usr/bin/env node
/** 1_fetch.js — 下载B站视频音频+视频，生成 WAV 和字幕帧
 *  用法: node 1_fetch.js <BV号或URL>
 *  产物: work/ 下的 audio.wav, video.mp4, frames/tXXX.png, meta.json
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';

function die(m) { console.error('ERROR:', m); process.exit(1); }
async function jget(url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(referer && { Referer: referer }) } });
  return r.json();
}

async function main() {
  const arg = process.argv[2] || die('usage: node 1_fetch.js <BV号或URL>');
  const bvid = (arg.match(/BV[0-9A-Za-z]+/) || [])[0] || die('no BV id');
  const work = path.join(process.cwd(), 'work');
  fs.mkdirSync(path.join(work, 'frames'), { recursive: true });

  const meta = await jget(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  if (meta.code !== 0) die(meta.message);
  const { cid } = meta.data;
  fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify({ bvid, cid, title: meta.data.title, owner: meta.data.owner.name, duration: meta.data.duration }, null, 1));
  console.log('视频:', meta.data.title, `(${meta.data.duration}s, cid ${cid})`);

  const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };

  // 音频（最小码率）
  const pa = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16`, `https://www.bilibili.com/video/${bvid}/`);
  if (pa.code !== 0 || !pa.data.dash) die('playurl(dash): ' + (pa.message || 'no dash'));
  const audio = pa.data.dash.audio.slice().sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0))[0];
  const m4a = path.join(work, 'audio.m4a');
  fs.writeFileSync(m4a, Buffer.from(await (await fetch(audio.baseUrl, { headers })).arrayBuffer()));

  // 视频（匿名 mp4）
  const pv = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16&platform=html5`, `https://www.bilibili.com/video/${bvid}/`);
  if (pv.code === 0 && pv.data.durl) {
    fs.writeFileSync(path.join(work, 'video.mp4'), Buffer.from(await (await fetch(pv.data.durl[0].url, { headers })).arrayBuffer()));
  } else console.warn('warn: 匿名视频流不可用，跳过OCR字幕校正');
  if (!fs.existsSync(path.join(work, 'video.mp4'))) fs.writeFileSync(path.join(work, 'video.mp4'), '');

  const ffmpeg = require('ffmpeg-static');
  execFileSync(ffmpeg, ['-y', '-i', m4a, '-ac', '1', '-ar', '16000', '-f', 'wav', path.join(work, 'audio.wav')], { stdio: 'ignore' });
  fs.unlinkSync(m4a);
  if (fs.statSync(path.join(work, 'video.mp4')).size > 0) {
    execFileSync(ffmpeg, ['-y', '-i', path.join(work, 'video.mp4'), '-vf',
      'fps=1,scale=1280:-2,crop=iw:ih*0.20:0:ih*0.75,scale=1280:-1',
      path.join(work, 'frames', 't%03d.png')], { stdio: 'ignore' });
  }
  console.log('fetch done:', work);
}
main().catch(e => die(e.message));
