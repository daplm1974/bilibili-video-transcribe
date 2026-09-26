#!/usr/bin/env node
/** 2_asr.js — 本地Whisper转录 work/audio.wav → work/asr.txt */
const fs = require('fs'), path = require('path');
function die(m){console.error('ERROR:',m);process.exit(1);}
function parseWavMono16(file){
  const buf=fs.readFileSync(file);
  const i=buf.indexOf(Buffer.from('data'));
  const pcm=buf.subarray(i+8);
  const out=new Float32Array(pcm.length/2);
  for(let k=0;k<out.length;k++)out[k]=pcm.readInt16LE(k*2)/32768;
  return out;
}
(async()=>{
  const work=path.join(process.cwd(),'work');
  let pipeline;
  try{({pipeline}=await import('@huggingface/transformers'));}
  catch{die('先 npm install @huggingface/transformers（在含 node_modules 的目录运行）');}
  const asr=await pipeline('automatic-speech-recognition','Xenova/whisper-small',{dtype:'q8'});
  const t=await asr(parseWavMono16(path.join(work,'audio.wav')),{
    language:'zh',task:'transcribe',chunk_length_s:30,stride_length_s:5});
  fs.writeFileSync(path.join(work,'asr.txt'),t.text||String(t));
  console.log(t.text||t);
})().catch(e=>die(e.message));
