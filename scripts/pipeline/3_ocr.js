#!/usr/bin/env node
/** 3_ocr.js — 字幕帧OCR (glm-4v-flash, 免费) 并发8 + 1302退避重试
 *  输入: work/frames/*.png   输出: work/ocr_frames.json (支持断点缓存)
 */
let key='';
try{key=JSON.parse(require('fs').readFileSync(process.env.HOME+'/.pi/agent/auth.json','utf8'))['zai-coding-cn'].key;}
catch(e){console.error('无法读取 auth.json',e.message);process.exit(1);}
const fs=require('fs'),path=require('path');
const work=path.join(process.cwd(),'work');
const framesDir=path.join(work,'frames');
// 按帧号数字排序（>999帧时字符串排序会乱序）
const files=fs.existsSync(framesDir)?fs.readdirSync(framesDir).filter(f=>f.endsWith('.png')).sort((a,b)=>parseInt(a.match(/\d+/)[0],10)-parseInt(b.match(/\d+/)[0],10)):[];
if(!files.length){console.log('无字幕帧，跳过OCR');process.exit(0);}

const CONCURRENCY=8, MAX_RETRY=4;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function ocrOne(b64,retries){
  const r=await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:'glm-4v-flash',temperature:0.1,messages:[{role:'user',content:[
      {type:'image_url',image_url:{url:'data:image/png;base64,'+b64}},
      {type:'text',text:'提取图中字幕文字，只输出字幕本身，多行保留分行。没有字幕输出：无'}
    ]}]})
  }).then(r=>r.json()).catch(()=>({error:{code:'network'}}));
  if(r.error){
    const code=r.error.code;
    // 1302=并发速率限制 / 429=限流 → 指数退避重试
    if((code===1302||code===429||code==='network')&&retries<MAX_RETRY){
      await sleep(1000*Math.pow(2,retries));
      return ocrOne(b64,retries+1);
    }
    return '[ERR '+(code??'')+']';
  }
  return (r.choices[0].message.content||'').trim();
}

(async()=>{
  const cachePath=path.join(work,'ocr_frames.json');
  let cache=[];
  try{cache=JSON.parse(fs.readFileSync(cachePath,'utf8'));}
  catch{ // 缓存损坏：备份后从空缓存重新开始，避免整个OCR崩溃
    if(fs.existsSync(cachePath)){fs.copyFileSync(cachePath,cachePath+'.bak');console.error('warn: 缓存损坏，已备份为 ocr_frames.json.bak，重新开始OCR');}
  }
  const results=new Array(files.length);
  let done=cache.filter(Boolean).length;
  files.forEach((_f,i)=>{
    if(cache[i]&&cache[i].txt){results[i]=cache[i];}
  });
  const pending=files.map((f,i)=>({f,i})).filter(x=>!results[x.i]);
  console.error(`OCR: 共${files.length}帧, 已缓存${done}, 待处理${pending.length}, 并发${CONCURRENCY}`);
  const t0=Date.now();
  let idx=0;
  async function worker(){
    while(idx<pending.length){
      const {f,i}=pending[idx++];
      const b64=fs.readFileSync(path.join(framesDir,f)).toString('base64');
      results[i]={t:parseInt(f.match(/\d+/)[0],10),txt:await ocrOne(b64,0)};
      done++;
      if(done%10===0||done===files.length){
        fs.writeFileSync(cachePath,JSON.stringify(results.filter(Boolean),null,1));
        console.error(`进度 ${done}/${files.length} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
      }
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY},worker));
  fs.writeFileSync(cachePath,JSON.stringify(results,null,1));
  const fails=results.filter(r=>/\[ERR/.test(r&&r.txt||'')).length;
  console.error(`OCR DONE ${files.length}帧, 失败${fails}, 总耗时${((Date.now()-t0)/1000).toFixed(1)}s`);
})().catch(e=>{console.error(e.message);process.exit(1);});
