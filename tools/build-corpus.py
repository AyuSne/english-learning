# -*- coding: utf-8 -*-
"""从首批 21 份六级 PDF 提取 63 篇文章，生成 docs/corpus/。

用法: python tools/build-corpus.py
只读源 PDF，不改动原文件。
"""
import fitz
import hashlib
import json
import os
import re
import sys

ROOT = r"D:\AAAA英语"
CORPUS_DIR = os.path.join(ROOT, "docs", "corpus")
BATCH = os.path.join(ROOT, "docs", "first-batch-pdfs.json")

CJK = re.compile(r"[\u4e00-\u9fff]")
GLOSS = re.compile(r"\s*[（(]([^()（）]*[\u4e00-\u9fff][^()（）]*)[）)]")
ABBR = {
    "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "vs", "etc", "e.g", "i.e",
    "u.s", "u.k", "a.m", "p.m", "no", "fig", "inc", "ltd", "co", "jan", "feb",
    "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
}
TERMINAL = re.compile(r'[.!?"”’)]$')
OPEN_Q = {"“", "‘", "«", "「", "『"}
CLOSE_Q = {"”", "’", "»", "」", "』"}


def clean(s):
    s = s.replace("\u00a0", " ").replace("\u3000", " ")
    return re.sub(r"[ \t]+", " ", s).strip()


def read_lines(path):
    """按视觉行重建文本：用词坐标聚行，避免 PDF 把同一行拆成多个 line 对象。"""
    doc = fitz.open(path)
    out = []
    for pno in range(doc.page_count):
        page = pno + 1
        words = [w for w in doc[pno].get_text("words")
                 if w[1] < 800 and not w[4].startswith("http")]
        words.sort(key=lambda w: (round(w[1], 1), w[0]))
        rows = []
        cur = []
        for w in words:
            if cur and w[1] - cur[-1][1] > 3:
                rows.append(cur)
                cur = []
            cur.append(w)
        if cur:
            rows.append(cur)
        for row in rows:
            row.sort(key=lambda w: w[0])
            parts = []
            i = 0
            while i < len(row):
                w = row[i][4]
                if w in OPEN_Q:  # 独立的前引号：贴住后一个词
                    if i + 1 < len(row):
                        parts.append(w + row[i + 1][4])
                        i += 2
                        continue
                    parts.append(w)
                    i += 1
                    continue
                if w in CLOSE_Q:  # 独立的后引号：贴住前一个词
                    if parts:
                        parts[-1] += w
                    else:
                        parts.append(w)
                    i += 1
                    continue
                parts.append(w)
                i += 1
            text = ""
            for p in parts:
                if not text:
                    text = p
                elif text.endswith("-") and p[:1].isalpha():
                    text += p  # 同一行内的连字符复合词
                else:
                    text += " " + p
            out.append({"page": page, "x0": round(row[0][0], 1),
                        "y0": row[0][1], "text": clean(text)})
    doc.close()
    return out


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find(lines, pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    return -1


def build_paragraph(plines, strip_letter=False, joins=None):
    """把若干视觉行拼成段落文本，返回 text 与 页偏移段。"""
    text = ""
    segs = []  # (offset, page)
    for k, ln in enumerate(plines):
        t = ln["text"]
        if k == 0 and strip_letter:
            t = re.sub(r"^[A-Z]\.\s*", "", t)
        if not text:
            text = t
            segs.append((0, ln["page"]))
            continue
        if text.endswith("-") and t[:1].islower():
            text = text[:-1] + t  # 行末连字符：音节断词，去掉连字符
            if joins is not None:
                joins.append((text[-20:], "drop-hyphen"))
            segs.append((len(text) - len(t), ln["page"]))
        elif text.endswith("-") and t[:1].isalpha():
            text = text + t  # 保留连字符（如 non-MRS）
            if joins is not None:
                joins.append((text[-20:], "keep-hyphen"))
            segs.append((len(text) - len(t), ln["page"]))
        else:
            segs.append((len(text) + 1, ln["page"]))
            text = text + " " + t
    return clean(text), segs


def page_at(segs, off):
    page = segs[0][1]
    for o, p in segs:
        if o <= off:
            page = p
        else:
            break
    return page


def strip_glosses(text):
    """移除中文夹注，返回干净正文与注释列表（offset 为干净正文中的位置）。"""
    if not text:
        return text, []
    out = ""
    notes = []
    pos = 0
    for m in GLOSS.finditer(text):
        out += text[pos:m.start()]
        sm = re.search(r"([A-Za-z][A-Za-z'’\-]*)\s*$", out)
        surface = sm.group(1) if sm else ""
        notes.append({
            "surface": surface,
            "gloss": m.group(1).strip(),
            "start": len(out.rstrip()) - len(surface),
            "end": len(out.rstrip()),
        })
        pos = m.end()
    out += text[pos:]
    return clean(out), notes


def split_sentences(text, segs):
    ends = []
    for m in re.finditer(r'[.!?]["”’)]*\s+', text):
        p = m.start()
        head = text[:p]
        tm = re.search(r"([A-Za-z.]+)$", head)
        tok = tm.group(1) if tm else ""
        base = tok.rstrip(".").lower()
        if base in ABBR or re.fullmatch(r"[A-Z]", tok.rstrip(".")):
            continue
        if re.fullmatch(r"(?:[A-Za-z]\.)+[A-Za-z]?", tok):
            continue
        nxt = text[m.end():m.end() + 1]
        if nxt and nxt.islower():
            continue
        ends.append(m.end() - len(m.group(0)) + len(re.match(r'[.!?]["”’)]*', m.group(0)).group(0)))
    if not ends or ends[-1] < len(text.rstrip()):
        ends.append(len(text.rstrip()))
    sent = []
    prev = 0
    for end in ends:
        chunk = text[prev:end]
        s = prev + (len(chunk) - len(chunk.lstrip()))
        body = chunk.strip()
        if body:
            sent.append({"text": body, "start": s, "end": s + len(body),
                         "page": page_at(segs, s)})
        prev = end
    tail = text[prev:]
    if tail.strip():
        s = prev + (len(tail) - len(tail.lstrip()))
        sent.append({"text": tail.strip(), "start": s, "end": s + len(tail.strip()),
                     "page": page_at(segs, s)})
    return sent


def modal_x0(lines):
    counts = {}
    for ln in lines:
        key = round(ln["x0"])
        counts[key] = counts.get(key, 0) + 1
    return max(counts, key=counts.get)


def careful_starts(lines):
    """首行缩进判定：同一页内与下一行比较；跨页与当页正文左边距比较。"""
    margins = {}
    for ln in lines:
        margins.setdefault(ln["page"], []).append(round(ln["x0"]))
    margins = {p: max(set(v), key=v.count) for p, v in margins.items()}
    starts = []
    for i, ln in enumerate(lines):
        if i == 0:
            starts.append(True)
            continue
        prev = lines[i - 1]
        if ln["page"] != prev["page"]:
            starts.append(ln["x0"] - margins[ln["page"]] >= 8
                          and ln["x0"] - prev["x0"] >= 8)
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) and lines[i + 1]["page"] == ln["page"] else None
        before = ln["x0"] - prev["x0"] >= 8
        after = ln["x0"] - nxt["x0"] >= 8 if nxt is not None else False
        starts.append(before or after)
    return starts


def make_article(lines, kind):
    """kind: long_match | careful"""
    if kind == "long_match":
        def para_start(ln):
            return bool(re.match(r"^[A-Z]\.\s", ln["text"]))
        flags = [para_start(ln) for ln in lines]
    else:
        flags = careful_starts(lines)

    groups = []
    cur = None
    for ln, is_start in zip(lines, flags):
        if is_start:
            cur = [ln]
            groups.append(cur)
        elif cur is not None:
            cur.append(ln)

    paragraphs = []
    annotations = []
    for idx, g in enumerate(groups):
        pid = (re.match(r"^([A-Z])\.", g[0]["text"]).group(1)
               if kind == "long_match" else str(idx + 1))
        text, segs = build_paragraph(g, strip_letter=(kind == "long_match"))
        text, notes = strip_glosses(text)
        if not text:
            continue
        sentences = split_sentences(text, segs)
        for nt in notes:
            nt["paragraph"] = pid
            for si, s in enumerate(sentences):
                if s["start"] <= nt["start"] < s["end"]:
                    nt["sentence"] = si
                    break
        annotations.extend(notes)
        paragraphs.append({
            "id": pid,
            "text": text,
            "page_start": g[0]["page"],
            "page_end": g[-1]["page"],
            "sentences": sentences,
        })

    words = sum(len(p["text"].split()) for p in paragraphs)
    sentences = sum(len(p["sentences"]) for p in paragraphs)
    return {
        "paragraphs": paragraphs,
        "annotations": annotations,
        "stats": {"paragraphs": len(paragraphs), "sentences": sentences, "words": words},
    }


def extract(path, meta, log):
    lines = read_lines(path)
    idx3 = find(lines, lambda l: l["text"].startswith("Part III"))
    if idx3 < 0:
        raise RuntimeError("找不到 Part III")
    idx4 = find(lines, lambda l: l["text"].startswith("Part IV"), idx3)
    if idx4 < 0:
        raise RuntimeError("找不到 Part IV")
    idxB = find(lines, lambda l: re.fullmatch(r"Section\s+B", l["text"]), idx3)
    idxC = find(lines, lambda l: re.fullmatch(r"Section\s+C", l["text"]), idxB)
    if min(idxB, idxC) < 0:
        raise RuntimeError("找不到 Section B/C")

    # 长篇匹配：A. 起，36. 止
    startB = find(lines, lambda l: re.match(r"^[A-Z]\.\s", l["text"]), idxB)
    endB = find(lines, lambda l: re.match(r"^\d{1,2}\.\s", l["text"]), startB)
    if endB < 0 or endB > idxC:
        endB = idxC
    long_lines = lines[startB:endB]
    articles = []
    lm = make_article(long_lines, "long_match")
    letters = [p["id"] for p in lm["paragraphs"]]
    expected = [chr(ord("A") + i) for i in range(len(letters))]
    if letters != expected:
        log.append(f"{meta['id_base']} 长篇匹配段落字母异常: {''.join(letters)}")

    # 仔细阅读两篇
    p1 = find(lines, lambda l: re.fullmatch(r"Passage\s+One", l["text"]), idxC)
    q46 = find(lines, lambda l: re.match(r"^46\.\s", l["text"]), p1)
    p2 = find(lines, lambda l: re.fullmatch(r"Passage\s+Two", l["text"]), q46)
    q51 = find(lines, lambda l: re.match(r"^51\.\s", l["text"]), p2)
    if min(p1, q46, p2, q51) < 0:
        raise RuntimeError("仔细阅读锚点缺失")
    q1_text = find(lines, lambda l: l["text"].startswith("Questions 46"), p1)
    q2_text = find(lines, lambda l: l["text"].startswith("Questions 51"), p2)
    c1 = make_article(lines[q1_text + 1:q46], "careful")
    c2 = make_article(lines[q2_text + 1:q51], "careful")
    articles = [("b", "长篇匹配", lm), ("c1", "仔细阅读 Passage One", c1),
                ("c2", "仔细阅读 Passage Two", c2)]
    return articles


def main():
    batch = json.load(open(BATCH, encoding="utf-8"))
    os.makedirs(CORPUS_DIR, exist_ok=True)
    log = []
    manifest = []
    for f in batch["files"]:
        rel = f["path"].replace("/", os.sep)
        path = os.path.join(ROOT, rel)
        actual = sha256(path)
        if actual != f["sha256"]:
            log.append(f"{rel} SHA-256 与清单不符")
        base = f"cet6-{f['year']}-{f['month']:02d}-s{f['set']}"
        meta = {"id_base": base}
        arts = extract(path, meta, log)
        for suffix, label, art in arts:
            aid = f"{base}-{suffix}"
            pages = sorted({p["page_start"] for p in art["paragraphs"]} |
                           {p["page_end"] for p in art["paragraphs"]})
            doc = {
                "schema": 1,
                "id": aid,
                "label": f"{f['year']}年{f['month']}月 · 第{f['set']}套 · {label}",
                "source": {
                    "exam": "CET-6",
                    "year": f["year"], "month": f["month"], "set": f["set"],
                    "kind": "long_match" if suffix == "b" else "careful_reading",
                    "pdf": f["path"], "sha256": actual,
                    "pages": [min(pages), max(pages)],
                },
                "paragraphs": art["paragraphs"],
                "annotations": art["annotations"],
                "stats": art["stats"],
            }
            out = os.path.join(CORPUS_DIR, aid + ".json")
            with open(out, "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=1)
            manifest.append({
                "id": aid, "label": doc["label"], "file": aid + ".json",
                "kind": doc["source"]["kind"], "pages": doc["source"]["pages"],
                "stats": art["stats"], "annotations": len(art["annotations"]),
                "sha256": actual,
            })
    with open(os.path.join(CORPUS_DIR, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump({"schema": 1, "articles": manifest}, fh, ensure_ascii=False, indent=1)
    print(f"articles={len(manifest)}")
    for m in manifest:
        print(f"{m['id']:22} pages={m['pages'][0]:>2}-{m['pages'][1]:<2} "
              f"par={m['stats']['paragraphs']:>2} sent={m['stats']['sentences']:>3} "
              f"words={m['stats']['words']:>4} gloss={m['annotations']}")
    if log:
        print("\nLOGS:")
        for l in log:
            print(" -", l)


if __name__ == "__main__":
    main()
