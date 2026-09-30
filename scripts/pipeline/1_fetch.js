#!/usr/bin/env node
/** 1_fetch.js — 下载B站视频音频+视频，生成 WAV 和字幕帧
 *  画质自适应: 默认720P起步，抽5帧OCR探测字幕可读性；
 *  拿得到字幕→继续720P；拿不到→升级1080P(try_look=1 DASH)再测，更好才用1080，否则留在720P。
 *  用法: node 1_fetch.js <BV号或URL> [auto|720|1080]   (默认auto)
 *  产物: work/ 下的 audio.wav, video.mp4, frames/tXXX.png, meta.json
 *  字幕带: 裁画面底部72%~100%（小字贴底边的视频也能覆盖）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36';
const OCR_PROMPT = '提取图中字幕文字，只输出字幕本身，多行保留分行。没有字幕输出：无';
const PROBE_TS = [0.1, 0.3, 0.5, 0.7, 0.9];   // 探测帧时间点（视频时长百分比）
const PROBE_PASS = 2;                          // ≥2帧OCR出有效文字 → 720P达标

function die(m) { console.error('ERROR:', m); process.exit(1); }
async function jget(url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(referer && { Referer: referer }) } });
  return r.json();
}
function ocrKey() {
  if (process.env.ZHIPU_API_KEY) return process.env.ZHIPU_API_KEY;   // 跨机器首选：环境变量
  try { return JSON.parse(fs.readFileSync(process.env.HOME + '/.pi/agent/auth.json', 'utf8'))['zai-coding-cn'].key; }
  catch { return ''; }
}
async function ocrOnce(pngPath, key) {
  if (!key) return '[skip]';
  const b64 = fs.readFileSync(pngPath).toString('base64');
  const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model: 'glm-4v-flash', temperature: 0.1, messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
      { type: 'text', text: OCR_PROMPT }] }] })
  }).then(r => r.json()).catch(() => ({ error: { code: 'network' } }));
  return r.error ? '[ERR ' + (r.error.code ?? '') + ']' : (r.choices?.[0]?.message?.content || '').trim();
}

// 视频下载：720P匿名mp4直链 / 1080P try_look DASH视频轨
async function fetchVideo720(bvid, cid, headers, work) {
  const pv = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16&platform=html5`, `https://www.bilibili.com/video/${bvid}/`);
  if (pv.code === 0 && pv.data.durl) {
    fs.writeFileSync(path.join(work, 'video.mp4'), Buffer.from(await (await fetch(pv.data.durl[0].url, { headers })).arrayBuffer()));
    return true;
  }
  return false;
}
async function fetchVideo1080(bvid, cid, headers, work) {
  const pv = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=116&fnval=16&try_look=1`, `https://www.bilibili.com/video/${bvid}/`);
  const v = pv.code === 0 && pv.data.dash && pv.data.dash.video.find(x => x.id === 80);
  if (!v) return false;
  fs.writeFileSync(path.join(work, 'video.mp4'), Buffer.from(await (await fetch(v.baseUrl, { headers })).arrayBuffer()));
  return true;
}

// 抽探测帧 + OCR打分（有效文字帧数）
function bandFilter(width) { return `fps=1,scale=${width}:-2,crop=iw:ih*0.28:0:ih*0.72,scale=${width}:-1`; }
function probeVideo(videoPath, duration, width, work, tag) {
  const dir = path.join(work, 'probe_' + tag);
  fs.mkdirSync(dir, { recursive: true });
  const shots = PROBE_TS.map((p, i) => {
    const ss = Math.max(1, Math.floor(duration * p));
    const f = path.join(dir, `p${i}.png`);
    execFileSync(require('ffmpeg-static'), ['-y', '-ss', String(ss), '-i', videoPath, '-vf', bandFilter(width), '-frames:v', '1', f], { stdio: 'ignore' });
    return f;
  }).filter(f => fs.existsSync(f) && fs.statSync(f).size > 0);
  return shots;
}
function scoreTexts(texts) {
  return texts.filter(t => t && t !== '无' && !t.startsWith('[ERR') && !t.startsWith('[skip') && t.length >= 2).length;
}

async function main() {
  const arg = process.argv[2] || die('usage: node 1_fetch.js <BV号或URL> [auto|720|1080]');
  const mode = (process.argv[3] || 'auto').toLowerCase();
  const bvid = (arg.match(/BV[0-9A-Za-z]+/) || [])[0] || die('no BV id');
  const work = path.join(process.cwd(), 'work');
  fs.mkdirSync(path.join(work, 'frames'), { recursive: true });
  const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };

  const meta = await jget(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
  if (meta.code !== 0) die(meta.message);
  const { cid } = meta.data;
  const metaOut = { bvid, cid, title: meta.data.title, owner: meta.data.owner.name, duration: meta.data.duration };
  console.log('视频:', meta.data.title, `(${meta.data.duration}s, cid ${cid})`);

  // 音频（最小码率）
  const pa = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnval=16`, `https://www.bilibili.com/video/${bvid}/`);
  if (pa.code !== 0 || !pa.data.dash) die('playurl(dash): ' + (pa.message || 'no dash'));
  const audio = pa.data.dash.audio.slice().sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0))[0];
  const m4a = path.join(work, 'audio.m4a');
  fs.writeFileSync(m4a, Buffer.from(await (await fetch(audio.baseUrl, { headers })).arrayBuffer()));
  execFileSync(require('ffmpeg-static'), ['-y', '-i', m4a, '-ac', '1', '-ar', '16000', '-f', 'wav', path.join(work, 'audio.wav')], { stdio: 'ignore' });
  fs.unlinkSync(m4a);

  // 视频画质自适应：720P起步探测，不达标升1080P对比，取更优
  const key = ocrKey();
  let quality = null, probe = {};
  async function probeScore(tag, width) {
    const shots = probeVideo(path.join(work, 'video.mp4'), meta.data.duration, width, work, tag);
    const texts = [];
    for (const s of shots) texts.push(await ocrOnce(s, key));
    return { score: scoreTexts(texts), texts };
  }

  if (mode === '1080') {
    quality = (await fetchVideo1080(bvid, cid, headers, work)) ? '1080' : null;
  } else {
    if (await fetchVideo720(bvid, cid, headers, work)) {
      quality = '720';
      if (mode === 'auto') {
        probe.q720 = await probeScore('720', 1280);
        console.log(`720P探测: ${probe.q720.score}/${probe.q720.texts.length}帧有效 |`, probe.q720.texts.map(t => t.slice(0, 18)).join(' / '));
        if (probe.q720.score < PROBE_PASS) {
          console.log('720P字幕不可读，尝试1080P…');
          if (await fetchVideo1080(bvid, cid, headers, work)) {
            const p1080 = await probeScore('1080', 1920);
            probe.q1080 = p1080;
            console.log(`1080P探测: ${p1080.score}/${p1080.texts.length}帧有效 |`, p1080.texts.map(t => t.slice(0, 18)).join(' / '));
            if (p1080.score > probe.q720.score) quality = '1080';
            else console.log('1080P无优势，保留720P');
          } else console.log('1080P不可用，保留720P');
        }
      }
    }
    if (!quality && mode !== '720') quality = (await fetchVideo1080(bvid, cid, headers, work)) ? '1080' : null;
  }

  if (quality && fs.statSync(path.join(work, 'video.mp4')).size > 0) {
    console.log('采用画质:', quality);
    execFileSync(require('ffmpeg-static'), ['-y', '-i', path.join(work, 'video.mp4'), '-vf', bandFilter(quality === '1080' ? 1920 : 1280),
      path.join(work, 'frames', 't%03d.png')], { stdio: 'ignore' });
  } else console.warn('warn: 视频流不可用，跳过OCR字幕校正');
  if (!fs.existsSync(path.join(work, 'video.mp4'))) fs.writeFileSync(path.join(work, 'video.mp4'), '');

  metaOut.quality = quality;
  if (probe.q720) metaOut.probe = probe;
  fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(metaOut, null, 1));
  console.log('fetch done:', work);
}
main().catch(e => die(e.message));
