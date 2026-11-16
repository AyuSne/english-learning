# -*- coding: utf-8 -*-
"""语料自检：结构、字词、边界、注释。用法: python tools/check-corpus.py"""
import json
import os
import re
import sys

ROOT = r"D:\AAAA英语"
CORPUS = os.path.join(ROOT, "docs", "corpus")
CJK = re.compile(r"[\u4e00-\u9fff]")
BAD = ["Directions", "Answer Sheet", "Section", "Passage", "Questions ",
       "Which of the following", "A)", "B)", "C)", "D)"]
TERMINAL = re.compile(r'[.!?"”’]')

issues = []


def add(aid, msg):
    issues.append(f"{aid}: {msg}")


def main():
    manifest = json.load(open(os.path.join(CORPUS, "manifest.json"), encoding="utf-8"))
    arts = manifest["articles"]
    total_words = total_sent = 0
    short, long_ = [], []
    for m in arts:
        aid = m["id"]
        d = json.load(open(os.path.join(CORPUS, m["file"]), encoding="utf-8"))
        text = "\n\n".join(p["text"] for p in d["paragraphs"])
        total_words += len(text.split())
        total_sent += sum(len(p["sentences"]) for p in d["paragraphs"])

        if CJK.search(text):
            add(aid, "正文含中文")
        for b in BAD:
            if b in text:
                add(aid, f"正文含残留标记 {b!r}")
        if "  " in text:
            add(aid, "正文有连续空格")

        for p in d["paragraphs"]:
            t = p["text"].strip()
            if not t:
                add(aid, f"段落 {p['id']} 为空")
                continue
            if not (t[0].isupper() or t[0] in '“"\'('):
                add(aid, f"段落 {p['id']} 首字符可疑: {t[:40]!r}")
            if not TERMINAL.search(t[-2:]):
                add(aid, f"段落 {p['id']} 结尾无句末标点: ...{t[-40:]!r}")
            if p["page_start"] > p["page_end"]:
                add(aid, f"段落 {p['id']} 页序异常")
            for s in p["sentences"]:
                n = len(s["text"].split())
                if n < 3:
                    short.append((aid, p["id"], s["text"]))
                if n > 60:
                    long_.append((aid, p["id"], s["text"][:80], n))
                if not TERMINAL.search(s["text"][-1]):
                    add(aid, f"句子无句末标点: {s['text'][:50]!r}")
            if any(s["start"] >= s["end"] for s in p["sentences"]):
                add(aid, f"段落 {p['id']} 句子区间异常")

        for a in d["annotations"]:
            seg = None
            for p in d["paragraphs"]:
                if p["id"] == a["paragraph"]:
                    seg = p["text"][a["start"]:a["end"]]
                    break
            if seg != a["surface"]:
                add(aid, f"注释定位不符: {a['surface']!r} vs {seg!r}")
            if not a["gloss"] or not CJK.search(a["gloss"]):
                add(aid, f"注释内容可疑: {a!r}")

        if d["stats"]["words"] != len(text.split()):
            add(aid, "stats.words 与正文不符")
        if d["stats"]["sentences"] != sum(len(p["sentences"]) for p in d["paragraphs"]):
            add(aid, "stats.sentences 与正文不符")

    print(f"articles={len(arts)} words={total_words} sentences={total_sent}")
    print(f"short sentences(<3w)={len(short)}  long sentences(>60w)={len(long_)}")
    for s in short[:10]:
        print("  SHORT", s[0], s[1], repr(s[2][:60]))
    for s in long_[:10]:
        print("  LONG ", s[0], s[1], s[3], repr(s[2]))
    print(f"issues={len(issues)}")
    for i in issues[:40]:
        print(" -", i)


if __name__ == "__main__":
    main()
