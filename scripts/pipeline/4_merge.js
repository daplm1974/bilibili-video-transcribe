#!/usr/bin/env node
/** 4_merge.js — 合并OCR帧为带时间轴字幕 → work/subtitle_timeline.txt */
const fs=require('fs'),path=require('path');
function die(m){console.error('ERROR:',m);process.exit(1);}
const work=path.join(process.cwd(),'work');
let r;
try{r=JSON.parse(fs.readFileSync(path.join(work,'ocr_frames.json'),'utf8'));}
catch(e){die('无法读取 ocr_frames.json（先跑 3_ocr.js）: '+e.message);}
r=r.slice().sort((a,b)=>a.t-b.t); // 防御：按时间排序（>999帧缓存可能乱序）
const segs=[];let cur=null;
for(const {t,txt} of r){
  const clean=txt.replace(/^字幕[：:]?\s*/,'').trim();
  if(!clean||clean==='无'||clean==='（无字幕）'||clean==='[ERR]')continue;
  if(cur&&cur.txt===clean){cur.end=t;continue;}
  if(cur)segs.push(cur);
  cur={txt:clean,start:t,end:t};
}
if(cur)segs.push(cur);
const fmt=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const out=segs.map(s=>`[${fmt(s.start)}-${fmt(s.end+1)}] ${s.txt}`).join('\n');
fs.writeFileSync(path.join(work,'subtitle_timeline.txt'),out);
console.log(out);
