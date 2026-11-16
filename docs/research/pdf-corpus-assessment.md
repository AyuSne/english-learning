# 真题 PDF 可提取性与导入差异检查

2026-11-16。范围：D:/AAAA英语/真题PDF。目标是为Windows六级语境学习产品判断材料处理路径，原PDF未修改。

## 结论和核验边界

208份、2036页全部可打开；208个文件SHA-256互不重复。每份都有可提取文字，未发现整份需要先OCR才能取得正文的文件。这不保证分词、阅读顺序、篇章边界与答案已经正确。

全量检查运行PyMuPDF和pypdf，逐页统计文字、图像、特殊字符和提取差异。独立抽查11份、查看32张模板页；另外渲染复核12张异常页，并检查3张空白页像素。没有逐字校对2036页，没有验收通用导入器，也没有逐题验证答案。所有页码指PDF物理页码。
a
| 考试 | 文件数 | 总页数 | 单文件页数范围 |
| --- | ---: | ---: | ---: |
| 专八 | 4 | 42 | 10–11 |
| 专四 | 4 | 42 | 9–11 |
| 六级 | 84 | 776 | 1–39 |
| 四级 | 72 | 567 | 1–25 |
| 考研英语 | 44 | 609 | 12–14 |
| 合计 | 208 | 2036 | 1–39 |

逐份清单：[CSV](./pdf-corpus-inventory.csv)。完整指标、哈希和逐页记录：[JSON](./pdf-corpus-inventory.json)。考试结构与版式细节：[11份视觉抽样报告](./pdf-template-sample-review.md)。

## 文字提取质量

13份、80页同时含大面积图像与可提取文字，不能简单当成没有文字层的扫描件。12份、29页的两种提取结果英文词元一致性低于90%；这是筛查阈值，不是准确率，两组有重叠。

实际例子：四级2014年6月第2套第3页，fitz将部分Directions/Questions粘成连续字符串，pypdf恢复更多空格；六级2022年6月第2套第3页则是pypdf把other、relationships等拆开，fitz较连贯。后者视觉原稿中的德语Umwelt在现有文字层也出现错误字符，因此换提取器不能保证修好源文字层。需保留原页对照，在发现问题时选择提取方式、局部OCR或人工修正。

来源：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年6月英语四级真题(第2套).pdf" purpose="source"}；:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年6月英语六级真题(第2套).pdf" purpose="source"}。

5份专四/专八的特殊字符告警实际都是项目符号U+F06C，非正文乱码；终端编码显示异常没有计作PDF错误。

## 内容组成差异

### 解析混排

已确认5份附答案/解析正文：六级2012年6月第1套（约第20页起），六级2012年12月第1/2/3套（约第16/16/15页起），四级2015年6月第1套（约第9页起）。解析包含重复原文、中文译文和答案解释；整份一并当成学习原文会混入重复和答案。页码只是识别起点，仍应通过预览核对切分边界。

样例来源：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年6月英语六级真题(第1套).pdf" purpose="source"}；:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年6月英语四级真题(第1套).pdf" purpose="source"}。另3份见逐份表。

反例：四级2014年12月第2套的页眉都称“答案与详解”，实际检查8页仍是试题与翻译，未见相应解析正文。不能只靠关键词作结论。来源：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年12月英语四级真题(第2套).pdf" purpose="source"}。

### 补充卷

六级、四级2022年6月第3套各1页，只提供作文与翻译，正文明确提示其余与第2套完全一致。它们不属于仅凭页数可判的损坏文件；若形成完整试卷，应保留与第2套的引用关系，本文件没有独立阅读内容。

来源：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年6月英语六级真题(第3套).pdf" purpose="source"}；:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年6月英语四级真题(第3套).pdf" purpose="source"}。

### 题型、选项和跨页

- 六级2012样本含快速阅读和Reading in Depth简答/选择；2013年12月样本则有选词和长篇匹配。应依据实际章节识别，不能把当前题号套给所有年份。
- 四级2014样本选词题36起，2025样本26起；词库有双列和三列。
- 默认提取可出现A、C、B、D，以及词库A、I、B、J；应按标签和位置关联选项。
- 专四/专八有选择与简答组合、重复Passage引用、题目跨页，分篇题数也会改变。
- 考研2000统一卷与2025英语一/二结构不同；2025英语一排序含方框/箭头，英语二同名Part B是小标题匹配。纯文字不足以保留所有关系。

具体来源、页码和抽样边界见[模板报告](./pdf-template-sample-review.md)，没有据11份样本认定全部年份都已覆盖。

### 空白页和答题纸

3份尾页经像素复核为空白：六级2019年6月第1套第9页、第2套第9页；四级2019年6月第2套第8页。可跳过，未将其判为需要OCR的正文。

专四/专八样本附ANSWER SHEET，含填写空格和重复题号；这不是标准答案，不能只因出现ANSWER就作答案解析。专八2022第9页样例：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2022年专八真题.pdf" purpose="source"}。

## 对产品的建议（待讨论）

1. 先用2023–2026年这21份六级作为优先候选，验证仔细阅读的完整原文、对应题目、原句和来源位置。本次自动指标较稳定，仍需预览与样本验收。
2. 共用正文清理和页面位置处理，结构层按考试、章节、具体题型分流。
3. 检查提取质量后再决定提取器、局部OCR或人工修正；LLM可以帮助整理候选结构，原文不一致时以原稿对照。
4. 导入预览分别标明正文、题目、答案、解析和答题纸；允许拼接跨页、调整题目归属、按字母标签修正选项。
5. 补充卷、解析混排、未识别题型及可疑字词分别提示；原文可先用于阅读选词，确认答案后再用于判分。

以上是检查所得的处理建议，尚未确认为最终产品决定。

## 逐份检查表

“可提取”指双提取器已运行；“未检出答案”不保证完全没有参考答案；优先候选并不代表逐字校验通过。源文件引用保留如下，便于逐份复查。

| 编号 | 考试与源文件 | 页数 | 处理提示 |
| ---: | --- | ---: | --- |
| 1 | 专八：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2022年专八真题.pdf" purpose="source"} | 11 | 特殊字符已核为项目符号U+F06C，非正文乱码；选择与简答混合，分篇题数可变 |
| 2 | 专八：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2023年专八真题.pdf" purpose="source"} | 11 | 选择与简答混合，分篇题数可变 |
| 3 | 专八：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2024年专八真题.pdf" purpose="source"} | 10 | 特殊字符已核为项目符号U+F06C，非正文乱码；选择与简答混合，分篇题数可变 |
| 4 | 专八：:codex-file-citation{path="D:/AAAA英语/真题PDF/专八/2025年专八真题.pdf" purpose="source"} | 10 | 特殊字符已核为项目符号U+F06C，非正文乱码；选择与简答混合，分篇题数可变 |
| 5 | 专四：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2022年专四真题.pdf" purpose="source"} | 11 | 特殊字符已核为项目符号U+F06C，非正文乱码；选择与简答混合，分篇题数可变 |
| 6 | 专四：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2023年专四真题.pdf" purpose="source"} | 11 | 选择与简答混合，分篇题数可变 |
| 7 | 专四：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2024年专四真题.pdf" purpose="source"} | 9 | 特殊字符已核为项目符号U+F06C，非正文乱码；选择与简答混合，分篇题数可变 |
| 8 | 专四：:codex-file-citation{path="D:/AAAA英语/真题PDF/专四/2025年专四真题.pdf" purpose="source"} | 11 | 选择与简答混合，分篇题数可变 |
| 9 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年12月英语六级真题(第1套).pdf" purpose="source"} | 30 | 附答案解析，约自第16页起，需分离；旧版阅读结构需依据章节识别 |
| 10 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年12月英语六级真题(第2套).pdf" purpose="source"} | 30 | 附答案解析，约自第16页起，需分离；旧版阅读结构需依据章节识别 |
| 11 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年12月英语六级真题(第3套).pdf" purpose="source"} | 29 | 附答案解析，约自第15页起，需分离；旧版阅读结构需依据章节识别 |
| 12 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2012年6月英语六级真题(第1套).pdf" purpose="source"} | 39 | 附答案解析，约自第20页起，需分离；旧版阅读结构需依据章节识别 |
| 13 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年12月英语六级真题(第1套).pdf" purpose="source"} | 9 | 旧版阅读结构需依据章节识别 |
| 14 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年12月英语六级真题(第2套).pdf" purpose="source"} | 9 | 旧版阅读结构需依据章节识别 |
| 15 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 旧版阅读结构需依据章节识别 |
| 16 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年6月英语六级真题(第1套).pdf" purpose="source"} | 9 | 旧版阅读结构需依据章节识别 |
| 17 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2013年6月英语六级真题(第2套).pdf" purpose="source"} | 9 | 旧版阅读结构需依据章节识别 |
| 18 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 19 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 20 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年12月英语六级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 21 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年6月英语六级真题(第1套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 22 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 23 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2014年6月英语六级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 24 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年12月英语六级真题(第1套).pdf" purpose="source"} | 9 | 提取器结果差异，需择优并核对分词 |
| 25 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年12月英语六级真题(第2套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 26 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年12月英语六级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 27 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 28 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 29 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2015年6月英语六级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 30 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 31 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年12月英语六级真题(第2套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 32 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 33 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 34 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 35 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2016年6月英语六级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 36 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 37 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 38 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年12月英语六级真题(第3套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 39 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年6月英语六级真题(第1套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 40 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年6月英语六级真题(第2套).pdf" purpose="source"} | 11 | 文字层可用，需常规跨页与版式处理 |
| 41 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2017年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 42 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 43 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 提取器结果差异，需择优并核对分词 |
| 44 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 45 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年6月英语六级真题(第1套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 46 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年6月英语六级真题(第2套).pdf" purpose="source"} | 9 | 提取器结果差异，需择优并核对分词 |
| 47 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2018年6月英语六级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 48 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年12月英语六级真题(第1套).pdf" purpose="source"} | 12 | 文字层可用，需常规跨页与版式处理 |
| 49 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年12月英语六级真题(第2套).pdf" purpose="source"} | 12 | 文字层可用，需常规跨页与版式处理 |
| 50 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年12月英语六级真题(第3套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 51 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年6月英语六级真题(第1套).pdf" purpose="source"} | 9 | 尾部空白页可跳过 |
| 52 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年6月英语六级真题(第2套).pdf" purpose="source"} | 9 | 尾部空白页可跳过 |
| 53 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2019年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 54 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 55 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 56 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 57 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年7月英语六级真题(组合卷).pdf" purpose="source"} | 13 | 文字层可用，需常规跨页与版式处理 |
| 58 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年9月英语六级真题(第1套).pdf" purpose="source"} | 12 | 文字层可用，需常规跨页与版式处理 |
| 59 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2020年9月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 60 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年12月英语六级真题(第1套).pdf" purpose="source"} | 11 | 图像与文字层混合，需抽查识别字词；提取器结果差异，需择优并核对分词 |
| 61 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年12月英语六级真题(第2套).pdf" purpose="source"} | 11 | 图像与文字层混合，需抽查识别字词 |
| 62 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年12月英语六级真题(第3套).pdf" purpose="source"} | 7 | 图像与文字层混合，需抽查识别字词 |
| 63 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 64 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 65 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2021年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 66 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 67 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 68 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年12月英语六级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 69 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年6月英语六级真题(第1套).pdf" purpose="source"} | 10 | 图像与文字层混合，需抽查识别字词 |
| 70 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 图像与文字层混合，需抽查识别字词；提取器结果差异，需择优并核对分词 |
| 71 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2022年6月英语六级真题(第3套).pdf" purpose="source"} | 1 | 作文/翻译补充卷，其余引用第2套；图像与文字层混合，需抽查识别字词 |
| 72 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年12月英语六级真题(第1套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 73 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年12月英语六级真题(第2套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 74 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年12月英语六级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 75 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年6月英语六级真题(第1套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 76 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年6月英语六级真题(第2套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 77 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2023年6月英语六级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 78 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 79 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 80 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 81 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 82 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 83 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2024年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 84 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年12月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 85 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年12月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 86 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年12月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 87 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 88 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 89 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2025年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 90 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2026年6月英语六级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 91 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2026年6月英语六级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 92 | 六级：:codex-file-citation{path="D:/AAAA英语/真题PDF/六级/2026年6月英语六级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 93 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 94 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 仅页眉称答案与详解，未见解析正文 |
| 95 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年12月英语四级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 96 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 97 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 提取器结果差异，需择优并核对分词 |
| 98 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2014年6月英语四级真题(第3套).pdf" purpose="source"} | 7 | 提取器结果差异，需择优并核对分词 |
| 99 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 100 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年12月英语四级真题(第2套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 101 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年12月英语四级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 102 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年6月英语四级真题(第1套).pdf" purpose="source"} | 25 | 提取器结果差异，需择优并核对分词；附答案解析，约自第9页起，需分离 |
| 103 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 104 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2015年6月英语四级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 105 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年12月英语四级真题(第1套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 106 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 107 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年12月英语四级真题(第3套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 108 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年6月英语四级真题(第1套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 109 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年6月英语四级真题(第2套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 110 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2016年6月英语四级真题(第3套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 111 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年12月英语四级真题(第1套).pdf" purpose="source"} | 7 | 提取器结果差异，需择优并核对分词 |
| 112 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年12月英语四级真题(第2套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 113 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年12月英语四级真题(第3套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 114 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年6月英语四级真题(第1套).pdf" purpose="source"} | 12 | 文字层可用，需常规跨页与版式处理 |
| 115 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年6月英语四级真题(第2套).pdf" purpose="source"} | 12 | 文字层可用，需常规跨页与版式处理 |
| 116 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2017年6月英语四级真题(第3套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 117 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 118 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 119 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年12月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 120 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年6月英语四级真题(第1套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 121 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年6月英语四级真题(第2套).pdf" purpose="source"} | 10 | 提取器结果差异，需择优并核对分词 |
| 122 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2018年6月英语四级真题(第3套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 123 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2019年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 124 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2019年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 尾部空白页可跳过 |
| 125 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2019年6月英语四级真题(第3套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 126 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 127 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 128 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年12月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 129 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年7月英语四级真题(组合卷).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 130 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年9月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 131 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2020年9月英语四级真题(第2套).pdf" purpose="source"} | 5 | 文字层可用，需常规跨页与版式处理 |
| 132 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年12月英语四级真题(第1套).pdf" purpose="source"} | 10 | 图像与文字层混合，需抽查识别字词；提取器结果差异，需择优并核对分词 |
| 133 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年12月英语四级真题(第2套).pdf" purpose="source"} | 10 | 图像与文字层混合，需抽查识别字词 |
| 134 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年12月英语四级真题(第3套).pdf" purpose="source"} | 8 | 图像与文字层混合，需抽查识别字词 |
| 135 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 图像与文字层混合，需抽查识别字词 |
| 136 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 137 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2021年6月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 138 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年12月英语四级真题(第1套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 139 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年12月英语四级真题(第2套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 140 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年12月英语四级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 141 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年6月英语四级真题(第1套).pdf" purpose="source"} | 10 | 图像与文字层混合，需抽查识别字词 |
| 142 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年6月英语四级真题(第2套).pdf" purpose="source"} | 7 | 图像与文字层混合，需抽查识别字词；提取器结果差异，需择优并核对分词 |
| 143 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2022年6月英语四级真题(第3套).pdf" purpose="source"} | 1 | 作文/翻译补充卷，其余引用第2套；图像与文字层混合，需抽查识别字词 |
| 144 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 145 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 146 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年12月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 147 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年6月英语四级真题(第1套).pdf" purpose="source"} | 9 | 文字层可用，需常规跨页与版式处理 |
| 148 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年6月英语四级真题(第2套).pdf" purpose="source"} | 10 | 文字层可用，需常规跨页与版式处理 |
| 149 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2023年6月英语四级真题(第3套).pdf" purpose="source"} | 7 | 文字层可用，需常规跨页与版式处理 |
| 150 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 151 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 152 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年12月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 153 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 154 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 155 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2024年6月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 156 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年12月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 157 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年12月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 158 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年12月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 159 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 160 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 161 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2025年6月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 162 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2026年6月英语四级真题(第1套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 163 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2026年6月英语四级真题(第2套).pdf" purpose="source"} | 8 | 文字层可用，需常规跨页与版式处理 |
| 164 | 四级：:codex-file-citation{path="D:/AAAA英语/真题PDF/四级/2026年6月英语四级真题(第3套).pdf" purpose="source"} | 6 | 文字层可用，需常规跨页与版式处理 |
| 165 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2000年考研英语(统一卷).pdf" purpose="source"} | 13 | 按统一卷/英语一/二及具体新题型分流 |
| 166 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2001年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 167 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2002年考研英语(统一卷).pdf" purpose="source"} | 12 | 按统一卷/英语一/二及具体新题型分流 |
| 168 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2003年考研英语(统一卷).pdf" purpose="source"} | 12 | 按统一卷/英语一/二及具体新题型分流 |
| 169 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2004年考研英语(统一卷).pdf" purpose="source"} | 12 | 按统一卷/英语一/二及具体新题型分流 |
| 170 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2005年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 171 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2006年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 172 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2007年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 173 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2008年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 174 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2009年考研英语(统一卷).pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 175 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2010年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 176 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2010年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 177 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2011年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 178 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2011年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 179 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2012年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 180 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2012年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 181 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2013年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 182 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2013年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 183 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2014年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 184 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2014年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 185 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2015年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 186 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2015年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 187 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2016年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 188 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2016年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 189 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2017年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 190 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2017年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 191 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2018年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 192 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2018年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 193 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2019年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 194 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2019年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 195 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2020年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 196 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2020年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 197 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2021年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 198 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2021年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 199 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2022年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 200 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2022年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 201 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2023年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 202 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2023年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 203 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2024年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 204 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2024年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 205 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2025年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 206 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2025年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 207 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2026年考研英语一.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
| 208 | 考研英语：:codex-file-citation{path="D:/AAAA英语/真题PDF/考研英语/2026年考研英语二.pdf" purpose="source"} | 14 | 按统一卷/英语一/二及具体新题型分流 |
