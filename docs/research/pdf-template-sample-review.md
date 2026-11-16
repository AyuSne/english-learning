# 真题 PDF 模板与视觉抽样

2026-11-16。限下列11份：用PyMuPDF（fitz）提取文本、渲染并查看至少一张完整阅读页，补查跨页和题型边界；页码均为PDF物理页码，“默认提取顺序”指fitz。结论仅覆盖抽样，未验证208份的每篇文章、答案或逐字准确性。

正文大多单栏、清晰且可提取，适合后续整理为“原文”；但不能据此认定一个固定模板即可无损导入。题号、篇章边界、选项坐标与续页关系需要分别处理。

| 样本与来源 | 实际观察及检查页 |
| --- | --- |
| 专四2022：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2022年专四真题.pdf" purpose="source"} | 第4–5页：Part V / Section A，PASSAGE ONE从上一题型之后起始并跨页；段落用(1)…编号，选择题41起。第8页：Section B简答51–55，重新列出同名PASSAGE，并非新文章。 |
| 专四2025：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2025年专四真题.pdf" purpose="source"} | 第4–5、8页同上述结构，但第一篇选择题为41–44，2022为41–43；每篇题数不能固定。第5页42、44题视觉为两列，默认文本顺序出现A、C、B、D，须按标签绑定。 |
| 专八2022：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2022年专八真题.pdf" purpose="source"} | 第2页：Part II / Section A，3篇、14道选择题，正文段落编号。第6页仍有第三篇正文及选择20–24，随后Section B简答25–32；同页混合文章与两类题。 |
| 专八2025：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2025年专八真题.pdf" purpose="source"} | 第2、6–7页：结构相近；简答25–29在第6页，30–32延至第7页，随后进入LANGUAGE USAGE。不能把页尾或重复PASSAGE标题当整篇结束。 |
| 考研2000统一卷：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2000年考研英语(统一卷).pdf" purpose="source"} | 第2–3页：Section II / Part A / Text 1，文章跨页，题11–14；第11页转Part B翻译。文本提取另见第4、6、8、10页Text 2–5标题；这些页未逐页视觉核验。 |
| 考研2025英语一：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2025年考研英语一.pdf" purpose="source"} | 第3–4页：Text 1正文与21–25题分置两页。第11–12页Part B为A–H段落排序，末尾有41–45方框、箭头及预置C/H/A；提取字词不足以保留排列关系。 |
| 考研2025英语二：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2025年考研英语二.pdf" purpose="source"} | 第3–4页同为Text 1及21–25题；第11–12页Part B却是A–G小标题匹配41–45段，原文跨页。相同Part B标题不能决定题型；与英语一排序应分流。 |
| 四级2014年6月第一套：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年6月英语四级真题(第1套).pdf" purpose="source"} | 第3–4页：Part III / Section A选词填空36–45，文章与词库跨页；第4页词库双列，默认提取A、I、B、J…；接着Section B字母段落匹配。 |
| 四级2025年6月第一套：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年6月英语四级真题(第1套).pdf" purpose="source"} | 第3–4页：同类选词填空改为26–35，词库在下一页且变三列，随后Section B。正文单栏，但题目/词库不能套用“全页单栏”的读取顺序。 |
| 六级2012年6月第一套：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年6月英语六级真题(第1套).pdf" purpose="source"} | 第2页为快速阅读正文；第11–12页Part IV / Reading in Depth，Section A为简答47–51；第13页Section B才是Passage One选择52–56。需要旧版阅读结构。 |
| 六级2013年12月第一套：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年12月英语六级真题(第1套).pdf" purpose="source"} | 第4–5页：Part III / Section A选词36–45，双列词库文本为A、I、B、J…；Section B长文段落[A]从第4页跨到第5页，不是2012年的快速阅读/简答结构。 |

建议共享正文清理流程，按考试、年代和题型识别结构；保留原PDF页码及坐标供回查。先完成完整原文的跨页拼接、题目/说明隔离，再把原句用于选词语境。以上尚未形成或验证导入器，也未证明所有年份可由这11份覆盖。
