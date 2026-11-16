# -*- coding: utf-8 -*-
"""生成 docs/corpus/review-checklist.md，供人工核对使用。"""
import json
import os
import re

ROOT = r"D:\AAAA英语"
CORPUS = os.path.join(ROOT, "docs", "corpus")
TERMINAL = re.compile(r'[.!?"”’)]')
CJK = re.compile(r"[\u4e00-\u9fff]")

man = json.load(open(os.path.join(CORPUS, "manifest.json"), encoding="utf-8"))
arts = man["articles"]

lines = []
lines.append("# 首批文章库核对清单")
lines.append("")
lines.append("由 `tools/make-review.py` 从 `docs/corpus/manifest.json` 生成，勿手工编辑。")
lines.append("")
lines.append(f"共 {len(arts)} 篇，"
             f"{sum(a['stats']['words'] for a in arts):,} 词，"
             f"{sum(a['stats']['sentences'] for a in arts):,} 句，"
             f"{sum(a['annotations'] for a in arts)} 条原文注释。")
lines.append("")
lines.append("每篇请核对：首句是否完整、末句是否收尾、跨页段落是否连续、夹注是否落在正确的词上。")
lines.append("")

quirks = []
for a in arts:
    d = json.load(open(os.path.join(CORPUS, a["file"]), encoding="utf-8"))
    for p in d["paragraphs"]:
        t = p["text"].strip()
        if t and not TERMINAL.search(t[-1]):
            quirks.append((a["id"], p["id"], "段末无句末标点", t[-50:]))
        if t and t[-1].islower():
            quirks.append((a["id"], p["id"], "段末为小写词", t[-50:]))
    for s in (s for p in d["paragraphs"] for s in p["sentences"]):
        if not TERMINAL.search(s["text"][-1]):
            quirks.append((a["id"], "-", "句末无标点", s["text"][-50:]))

by_set = {}
for a in arts:
    parts = a["id"].split("-")
    set_key = "-".join(parts[:4])
    by_set.setdefault(set_key, []).append(a)

for set_key in sorted(by_set):
    group = by_set[set_key]
    parts = set_key.split("-")
    lines.append(f"## {parts[1]}年{int(parts[2])}月 · 第{parts[3][1:]}套")
    lines.append("")
    for a in group:
        d = json.load(open(os.path.join(CORPUS, a["file"]), encoding="utf-8"))
        paras = d["paragraphs"]
        first = paras[0]["sentences"][0]["text"]
        first = (first[:90].rstrip() + "…") if len(first) > 90 else first
        last = paras[-1]["sentences"][-1]["text"]
        last = ("…" + last[-90:]) if len(last) > 90 else last
        cross = [f"{p['id']}(p{p['page_start']}→{p['page_end']})"
                 for p in paras if p["page_start"] != p["page_end"]]
        kind = "长篇匹配" if d["source"]["kind"] == "long_match" else "仔细阅读"
        lines.append(f"### {kind} · {a['id']}")
        lines.append("")
        lines.append(f"- 页码 {a['pages'][0]}–{a['pages'][1]}；段落 {a['stats']['paragraphs']}"
                     f"（{paras[0]['id']}–{paras[-1]['id']}）；{a['stats']['words']} 词；"
                     f"{a['stats']['sentences']} 句；原文注释 {a['annotations']} 条")
        if cross:
            lines.append(f"- 跨页段落：{'、'.join(cross)}")
        lines.append(f"- 首句：{first}")
        lines.append(f"- 末句：{last}")
        lines.append("")

lines.append("## 需人工确认")
lines.append("")
if quirks:
    for q in quirks:
        lines.append(f"- {q[0]} 段落 {q[1]}：{q[2]} —— …{q[3]}")
else:
    lines.append("- 无")
lines.append("")

open(os.path.join(CORPUS, "review-checklist.md"), "w", encoding="utf-8").write("\n".join(lines))
print("checklist written; quirks:", len(quirks))
for q in quirks:
    print(q[0], q[1], q[2], q[3])
