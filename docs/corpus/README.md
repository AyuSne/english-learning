# 首批文章库

2023—2026 年 21 份六级真题 PDF 中的 63 篇阅读正文，供软件阅读、选词与回查来源。源 PDF 不入库，按 SHA-256 与页码引用。

## 内容

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | 63 篇索引：id、标题、文件、页码、统计、注释数、源文件哈希 |
| `<id>.json` | 单篇文章，含段落、句子与原文注释 |
| `review-checklist.md` | 人工核对清单，由脚本生成 |
| `spot-check.md` | 每场次抽 1 篇的全文抽检稿，由脚本生成 |

文章单元：每套 3 篇 —— 长篇匹配 1 篇、仔细阅读 2 篇（Passage One / Two）。题干、选项、答案、听力、选词填空与翻译不入库。

命名：`cet6-<年>-<月>-s<套>-<b|c1|c2>`，如 `cet6-2024-06-s1-c1`。

## 单篇结构

```json
{
  "schema": 1,
  "id": "cet6-2024-06-s1-c1",
  "label": "2024年6月 · 第1套 · 仔细阅读 Passage One",
  "source": {
    "exam": "CET-6", "year": 2024, "month": 6, "set": 1,
    "kind": "careful_reading",          // 或 long_match
    "pdf": "真题PDF/六级/2024年6月英语六级真题(第1套).pdf",
    "sha256": "…", "pages": [6, 7]
  },
  "paragraphs": [
    {
      "id": "1",                        // 长篇匹配用原卷字母 A、B…；仔细阅读按顺序 1、2…
      "text": "……",
      "page_start": 6, "page_end": 6,
      "sentences": [
        {"text": "……", "start": 0, "end": 88, "page": 6}
      ]
    }
  ],
  "annotations": [
    {"surface": "reciprocate", "gloss": "回报",
     "start": 266, "end": 277, "paragraph": "G", "sentence": 2}
  ],
  "stats": {"paragraphs": 9, "sentences": 22, "words": 453}
}
```

约定：

- 页码是 PDF 物理页码，不是印刷页码。
- 句子的 `start`/`end` 是段内字符偏移，据此可从句子反查正文片段。
- 中文夹注（如 `reciprocate（回报）`）不进入正文，记在 `annotations`，按 `surface` 定位到词。
- 正文保留原卷的段落字母、引号、破折号与拼写；源文本的缺字、缺标点不擅自改动。
- `source.sha256` 用于确认原 PDF 未被替换；对照原页时按页码打开该文件。

## 重新生成

```powershell
python tools/build-corpus.py    # 从 PDF 重建 63 篇与 manifest
python tools/check-corpus.py    # 结构、中文残留、标点、注释定位、统计一致性
python tools/make-review.py     # 重新生成核对清单
python tools/make-spotcheck.py  # 重新生成 7 篇抽检稿
```

提取按 2023—2026 年六级版面模板定位（Part III 的 Section B / Section C、Passage One/Two、题号 36—55）。他人改动版面或换年份时，先跑 `check-corpus.py` 与 `review-checklist.md` 再采信。

## 状态

- 自动检查：63 篇结构完整，正文无中文残留、无题干/选项/说明残留，2,176 句逐句可在源页文字层中原样找到。
- 人工核对：待进行。`review-checklist.md` 末尾列出一处源文本缺句末标点（2023 年 6 月第 3 套仔细阅读 Passage One 第 5 段），按原样保留。
