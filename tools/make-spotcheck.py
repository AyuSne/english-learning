# -*- coding: utf-8 -*-
"""生成 docs/corpus/spot-check.md：每场次抽 1 篇，供人工核对。"""
import json
import os

ROOT = r"D:\AAAA英语"
CORPUS = os.path.join(ROOT, "docs", "corpus")

# 每个场次 1 篇；3 篇长篇匹配 + 4 篇仔细阅读，并刻意纳入两处自动检查标出的异常。
PICKS = [
    "cet6-2023-06-s3-c1",  # 源文本缺句末标点
    "cet6-2023-12-s2-b",   # 长篇匹配
    "cet6-2024-06-s1-b",   # 长篇匹配，A–N
    "cet6-2024-12-s3-c1",  # 词数偏低（442）
    "cet6-2025-06-s3-c2",
    "cet6-2025-12-s3-b",   # 段落/句数偏多（18 段 87 句）
    "cet6-2026-06-s1-c1",
]


def render(p, anns):
    text = p["text"]
    out, cur = [], 0
    for a in sorted(anns, key=lambda x: x["start"]):
        out.append(text[cur:a["start"]])
        out.append(text[a["start"]:a["end"]] + f"〔{a['gloss']}〕")
        cur = a["end"]
    out.append(text[cur:])
    return "".join(out)


lines = ["# 首批文章库抽检（7 篇）", ""]
lines.append("每场次 1 篇，覆盖 3 篇长篇匹配与 4 篇仔细阅读；其中两篇是自动检查标出的异常样本"
             "（2023 年 6 月第 3 套第 5 段缺句末标点；2025 年 12 月第 3 套长篇匹配 18 段 87 句）。")
lines.append("")
lines.append("核对时看四处：首句是否完整、末句是否收尾、跨页段落有没有接断、夹注是否落在正确的词后面。"
             "发现问题记下文章 id 与段落号，修脚本重跑，不改 JSON。")
lines.append("")

for aid in PICKS:
    d = json.load(open(os.path.join(CORPUS, aid + ".json"), encoding="utf-8"))
    kind = "长篇匹配" if d["source"]["kind"] == "long_match" else "仔细阅读"
    paras = d["paragraphs"]
    cross = [f"{p['id']}（p{p['page_start']}→{p['page_end']}）"
             for p in paras if p["page_start"] != p["page_end"]]
    by_par = {}
    for a in d["annotations"]:
        by_par.setdefault(a["paragraph"], []).append(a)

    lines.append(f"## {d['label']}  ·  `{aid}`")
    lines.append("")
    lines.append(f"- 页码 {d['source']['pages'][0]}–{d['source']['pages'][1]}；"
                 f"{len(paras)} 段（{paras[0]['id']}–{paras[-1]['id']}）；"
                 f"{d['stats']['words']} 词；{d['stats']['sentences']} 句；"
                 f"夹注 {len(d['annotations'])} 条")
    lines.append(f"- 跨页段落：{'、'.join(cross) if cross else '无'}")
    lines.append(f"- 首句：{paras[0]['sentences'][0]['text']}")
    lines.append(f"- 末句：{paras[-1]['sentences'][-1]['text']}")
    lines.append("")
    lines.append("核对：□ 首尾完整　□ 跨页连续　□ 夹注落点正确　□ 段落划分正确")
    lines.append("")
    for p in paras:
        mark = " （跨页）" if p["page_start"] != p["page_end"] else ""
        lines.append(f"**[{p['id']}]**{mark} {render(p, by_par.get(p['id'], []))}")
        lines.append("")
    lines.append("---")
    lines.append("")

open(os.path.join(CORPUS, "spot-check.md"), "w", encoding="utf-8").write("\n".join(lines))
print("written", len(PICKS), "articles")
