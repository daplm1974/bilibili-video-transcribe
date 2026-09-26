# 语义术语校正表（Semantic Term Corrections）

ASR/OCR 对量化交易领域术语有系统性误识别。合并转录后、呈现给用户前，必须按语义做一轮校正——不是简单字符串替换，同一错误有不同形态，需结合上下文判断。

## 音频误识别（Whisper）

| 误识别 | 正确 | 说明 |
|---|---|---|
| Tik / dick / tic / 蒂克 | **tick** | 最常见；"dick数据" → "tick数据" |
| QMP / OMT / QMT专 | **QMT** | 迅投量化平台 |
| GetFullTik / Get Under Score Full Under Score Tick | **get_full_tick** | "under score"是朗读的下划线 |
| Context Info / contestInfo / Gadict | **ContextInfo** | QMT策略上下文对象 |
| 保募级 / 保母级 | **保姆级** | |
| 行情快到 | **行情快照** | |
| 80兆 / 80兆字节 | **80MB** | |
| 着收价 | **昨收价** | |
| 量把 / 贯守率 | **量比 / 换手率** | |
| 指营值损 / 触营值损 | **止盈止损** | |
| 补到 / 补导 | **股票** | |

## 画面OCR误识别（glm-4v-flash）

| 误识别 | 正确 |
|---|---|
| OMT | QMT |
| net_full_tick / net full tick | get_full_tick |
| stock code=7 / stock_code_门 | stock_code |
| 润田 / 活用于 | 数据源 / 适用于 |
| 所设标的 | 所示标的 |
| 损条件（被截断） | 波段策略：止盈止损条件 |
| 抗坏血酸（乱码） | get_full_tick |

## 其他规范化

- 简繁混排 → 统一简体（Whisper 中文常混繁体）
- `get full tick`（带空格）→ `get_full_tick`（函数名）
- 中英文间距、全半角标点统一
- 数字格式：10支20支 → 10 支、20 支；3秒 → 3 秒

> 发现新的误识别时，把映射加进本表（skill 与 GitHub 仓库 references/ 同步）。
