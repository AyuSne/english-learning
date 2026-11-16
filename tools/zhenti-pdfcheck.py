import json, os, re, sys
import fitz

ROOT = r"D:\AAAA英语\真题PDF"
rows = []
for folder in sorted(os.listdir(ROOT)):
    d = os.path.join(ROOT, folder)
    if not os.path.isdir(d):
        continue
    for name in sorted(os.listdir(d)):
        if not name.lower().endswith(".pdf"):
            continue
        p = os.path.join(d, name)
        try:
            doc = fitz.open(p)
            pages = doc.page_count
            text = ""
            for i in range(min(2, pages)):
                text += doc[i].get_text()
            text = re.sub(r"\s+", " ", text).strip()
            rows.append({"folder": folder, "name": name, "pages": pages,
                         "chars": len(text), "size": os.path.getsize(p),
                         "head": text[:120]})
            doc.close()
        except Exception as e:
            rows.append({"folder": folder, "name": name, "error": str(e)})

errs = [r for r in rows if "error" in r]
print(f"files={len(rows)} errors={len(errs)}")
for e in errs:
    print("ERR", e["folder"], e["name"], e["error"])

pages = [r["pages"] for r in rows if "pages" in r]
print(f"pages min={min(pages)} max={max(pages)} avg={sum(pages)/len(pages):.1f}")

nearly_empty = [r for r in rows if r.get("chars", 9999) < 200]
print(f"low-text files (<200 chars on first 2 pages): {len(nearly_empty)}")
for r in nearly_empty[:15]:
    print("  LOWTEXT", r["folder"], r["name"], r["pages"], r["chars"])

# keyword sanity: does the paper text match its exam type?
def expect(folder):
    return {"四级": ["四级", "College English Test Band 4", "Band 4", "CET-4", "CET4"],
            "六级": ["六级", "Band 6", "CET-6", "CET6", "College English Test"],
            "考研英语": ["考研", "研究生", "入学考试", "英语"],
            "专四": ["专业四级", "TEM-4", "TEM4", "四级"],
            "专八": ["专业八级", "TEM-8", "TEM8", "八级"]}[folder]

mismatch = []
for r in rows:
    if "error" in r:
        continue
    t = r["head"]
    if not any(k in t for k in expect(r["folder"])):
        mismatch.append(r)
print(f"header-keyword mismatches: {len(mismatch)}")
for r in mismatch[:15]:
    print("  MISMATCH", r["folder"], r["name"], "|", r["head"][:100])

with open(r"D:\AAAA英语\tools\pdf-check.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print("sample:", json.dumps(rows[0], ensure_ascii=False)[:300])
