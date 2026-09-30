# bilibili-video-transcribe

A [Pi](https://github.com/badlogic/pi-mono) / [Agent-Skills](https://agentskills.io/specification)-compatible skill: get the **actual spoken content** of a Bilibili video as text — no Bilibili login, no paid ASR API, everything runs locally. **Total cost: ¥0.**

```text
B站视频 BVxxx
   │
   ├─ 1_fetch.js ─► audio.wav + frames/*.png     匿名拉流 · 1fps字幕帧 · 画质自适应(720P→1080P)
   │
   ├─ 2_asr.js   ─► asr.txt                      本地 Whisper-small（零额度、离线）
   │
   ├─ 3_ocr.js   ─► ocr_frames.json              glm-4v-flash 逐帧OCR（免费模型，并发8+退避）
   │
   └─ 4_merge.js ─► subtitle_timeline.txt        带时间轴字幕 → 与ASR互补校正 → 最终文稿
```

## Highlights

- **零登录**：只用 B 站匿名 web API，不碰需要 SESSDATA 的字幕/AI总结接口
- **零成本**：ASR 用本地 Whisper-small(q8)；OCR 用智谱 GLM-4V-Flash（官方免费、不限量）
- **画质自适应**：默认 720P 起步，抽 5 帧做 OCR 探测——拿得到字幕就用 720P；拿不到（小字贴底边的视频）才经 `try_look=1` 升级真 1080P DASH
- **双通道互补**：语音转录覆盖口播内容，画面 OCR 捕获幻灯片/代码/屏幕文字，两者对齐校正
- **长视频可用**：音频分块转录（30s 窗口+5s 步进）、OCR 断点缓存、帧序按数字排序（>999 帧不乱序）

## Install

### As a Pi skill

```bash
git clone https://github.com/daplm1974/bilibili-video-transcribe \
  ~/.pi/agent/skills/bilibili-video-transcribe
```

### Standalone

```bash
npm install ffmpeg-static @huggingface/transformers
node node_modules/ffmpeg-static/install.js   # npm 默认拦截 postinstall，需手动装二进制
```

Requirements: Node.js 18+（内置 fetch）；Windows 上若 `onnxruntime-node` 报 "module could not be found"，先装 [VC++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)。

## Usage

### Quick: ASR only

只要语音转写文字，一条命令：

```bash
node scripts/bilibili-transcribe.js BV1NPeU6eEB5
# → transcript-BV1NPeU6eEB5.txt
```

### Full pipeline: ASR + OCR 字幕校正

```bash
cd scripts/pipeline
node 1_fetch.js BV1eZuH6LEvo          # [auto|720|1080] 可选，默认auto
node 2_asr.js
node 3_ocr.js
node 4_merge.js
# 产物都在 work/：audio.wav, frames/, meta.json, asr.txt, ocr_frames.json, subtitle_timeline.txt
```

**画质模式**（`1_fetch.js` 第2参数）：

| 模式 | 行为 |
|---|---|
| `auto`（默认） | 720P 下载 → 按 10%/30%/50%/70%/90% 时长抽 5 帧 OCR 探测 → ≥2 帧有效即用 720P；否则升 1080P 再探测，取更优（打平留 720P） |
| `720` / `1080` | 跳过探测，强制指定画质 |

> 实测：匿名请求 qn=80/112/116 一律被压回 720P（DASH/HTML5 同）；`playurl` 加 `try_look=1` 后 DASH 列表解锁 id=80 真 1080P，可全量下载、末尾字节可访问（206）。字幕带裁剪为画面底部 **72%~100%**——小字贴底边的视频（PPT/录屏课）实测 720P 即可读清，1080P 保真度更高。

### 最终文稿

把 `work/asr.txt` 与 `work/subtitle_timeline.txt` 交给 agent（或人工）做**语义校正**后输出到 `output/<视频名>/`，成品格式见 [`output/`](output/) 里的 4 个例子：时间轴正文 + 三方案对比表（如有）+ "OCR 相对语音转录的关键修正"清单。

**校正要点**（领域术语系统性误识别，按语义而非字符串匹配）：

- 同一错误多种形态：桥接 → 乔接/拆接/析接/折接；tick → Tik/řek/티크
- 函数名/接口名：SandOrder → `send_order`，Password → `passorder`，getPoison → `get_positions`，下划线被空格拆散（get full tick → `get_full_tick`）
- 简繁混排、全半角标点归一化；每领域维护一份修正映射，遇到新误识随时扩充

## Pipeline notes

- **OCR key**：`3_ocr.js`/`1_fetch.js` 优先读环境变量 **`ZHIPU_API_KEY`**，否则回退 `~/.pi/agent/auth.json` 的 `zai-coding-cn`（独立使用请二选一）；
- **OCR 并发**：实测 2/5/8/10 并发全通过，≥12 触发 `1302` 限流——脚本用 **8 并发 + 指数退避（最多4次）**保持安全；17.8 分钟视频 1066 帧 OCR 约 150s，0 失败
- **断点续跑**：`3_ocr.js` 以 `work/ocr_frames.json` 为缓存，中断后重跑只补缺失帧；缓存损坏自动备份为 `.bak` 重开
- **1080P 说明**：1080P DASH 是独立视频轨（无音轨），流水线本就音视频分离，直接兼容

## Gotchas

- 音频/视频直链需要浏览器 `User-Agent` + `Referer: https://www.bilibili.com/`，且**很快过期**（跑流水线时现取现用）
- B 站字幕/AI总结接口需要登录——本技能完全绕开
- `ffmpeg-static` 的 postinstall 默认被 npm 拦截，手动 `node install.js`
- Windows：`onnxruntime-node` 加载失败 = 缺 VC++ 运行库
- Whisper-small 简繁混写、领域黑话误听多——总结前先做语义校正（见上）
- 帧号超过 999 后字符串排序会乱序（`t1000` < `t101`）——`3_ocr.js`/`4_merge.js` 已按数字排序，别改回 `.sort()`
- 不要把视频音频上传第三方文件host，保持全流程本地处理

## Project layout

```text
scripts/
├── bilibili-transcribe.js    单文件版：仅ASR，一条命令出转录
└── pipeline/
    ├── 1_fetch.js            匿名拉流 + 1fps字幕帧 + 画质自适应
    ├── 2_asr.js              本地Whisper-small转录
    ├── 3_ocr.js              glm-4v-flash逐帧OCR（并发8+退避+断点缓存）
    └── 4_merge.js            合并为带时间轴字幕
output/<视频名>/               最终修正文稿（含transcript.txt原始转录）
SKILL.md                       Pi/Agent-Skills 技能描述
```

## Status (2026-09-29)

- Pipeline battle-tested on 4 videos（大QMT直连实盘 / tick接口全解析 / 集合竞价tick获取 / 外部程序与大QMT通信）— final transcripts in `output/<video>/`.
- Stable & ready-to-use; no active development. Possible next steps: batch-queue multiple BV ids in one run; word-level subtitle alignment via FunASR :8104 timestamps.
