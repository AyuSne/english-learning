# 参照项目的试卷与题库来源调查

调查日期：2026-11-15。对应研究议题：[调查参照项目的试卷与题库来源](https://github.com/AyuSne/english-learning/issues/2)。

本报告以参照项目 `wssfk12138/english-multiple-choice-practice-machine` 的固定提交 [`1c52f966cc688867bb41f49987a0fded4a088439`](https://github.com/wssfk12138/english-multiple-choice-practice-machine/tree/1c52f966cc688867bb41f49987a0fded4a088439) 为准；独立题库仓库固定到 [`b4a8ccd7005b25497d53cad352a28f09afa0d5d7`](https://github.com/wssfk12138/english-question-banks/tree/b4a8ccd7005b25497d53cad352a28f09afa0d5d7)。仅阅读源码、文档和内容包，没有运行外部项目代码。

## 结论

已确认三条内容路径：随程序提供的考研英语起始题库、用户自己导入的 Word/PDF 材料，以及 ESQ 分享包。**“支持六级”不能直接解释为“内置六级真题”**：启动安装清单只有考研英语一、二；但作者另有独立题库仓库，实际发布了四级和六级 ESQ 包。[内置安装清单，第21—25行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/bundled_banks.py#L21-L25)、[远程目录迁移说明](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/remote-catalog/README.md#L1-L19)

本次实际读取的六级分享包 `manifest.json` 列出 **43套、2020—2026年**；其来源字段只说明从已验证的局域网年度分包合并，未声明原始试卷供应网站。因此，能追溯到作者公开分发的 ESQ 包及其整理方式，**无法据现有公开证据确认原始真题供应者、原始 PDF/Word 下载网站或采集网址**。[六级内容包下载入口](https://github.com/wssfk12138/english-question-banks/releases/download/question-banks-2026-09-20/cet6-complete-v1.2.1.esq)（包内 `manifest.json` 的 `source`、`papers`；核验方法见文末）、[固定目录条目，第83—100行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/question-bank-catalog.json#L83-L100)

## 1. 三类材料分别从哪里来

### 内置起始题库

程序的 `BUNDLED_BANKS` 只列出以下两个包；启动时按包标识和内容版本安装，已安装的相同版本会跳过。[安装实现，第21—25行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/bundled_banks.py#L21-L25)、[第116—173行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/bundled_banks.py#L116-L173)

| 实际检查的包 | 包内试卷范围 | 实际内容版本 | 包内来源声明 |
| --- | --- | --- | --- |
| [postgraduate-english-one.esq](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-one.esq) | 2002、2010—2026，共18套 | `1.2.0`，修订 `2026-09-r5` | `source.type=local_question_bank`；描述为从本地现有考研题库导出，并包含已有智能标注 |
| [postgraduate-english-two.esq](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-two.esq) | 2010—2025，共16套 | `1.1.2`，修订 `2026-09-r2` | 同上 |

以上表格来自实际解包后的 `manifest.json`，不是仅依据 README。两个包都声明 `publisher` 为英语刷题机本地题库，`generator` 为英语刷题机 `0.1.0`，并包含 `papers/`、`answers/`、`labels/` 和 `LICENSE.txt`；包内没有进一步给出原始供应网站。根目录 NOTICE 将这两套起始题库说明为考生回忆、整理校对内容，并明确不是官方试题发布。[固定包文件：英语一](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-one.esq)、[英语二](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-two.esq)、[NOTICE，第8—14行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/NOTICE.md#L8-L14)

### 用户自己导入的材料

材料由用户选择本地 `.docx`、`.doc` 或文本型 `.pdf` 文件，可附答案文件和听力音频。公开批量脚本遍历用户提供的本地目录，匹配试卷、答案及音频；这一输入路径并不提供材料最初下载自哪个网站的信息。[导入说明，第231—252行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/README.md#L231-L252)、[批量文件发现，第190—208行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/tools/batch_import.py#L190-L208)

旧入口 `import_corpus.py` 同样要求调用者传入本地文件夹，再调用文档导入器。公开 ESQ 导出实现从数据库读取试卷，生成文章、题目、答案与标签；默认来源描述只有“从英语刷题机本地库导出”。这些实现能说明整理链路，不能证明某个网络供应者就是原始来源。[本地题库导入入口](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/import_corpus.py#L11-L23)、[ESQ导出，第1213—1224行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/esq.py#L1213-L1224)、[第1356—1384行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/esq.py#L1356-L1384)

### 分享包与独立远程题库

ESQ 是 ZIP 加 UTF-8 JSON，正文、答案、可选标签及音频分别存放；它是已经结构化的内容包。格式包含稳定的试卷、单元、题目标识。[格式说明，第3—32行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/docs/question-bank-format.md#L3-L32)

作者于2026-09-20将四级、六级、考研英语一、二题库迁移到独立仓库 `english-question-banks`。其 README 声明四级包为35套、1825题，六级包为43套、2365题，均为 `1.2.1`；**本次实际核验了六级包的目录、manifest和LICENSE，四级包的内容数量仅核对到发布者README，未实际解包**。[迁移与修订记录，第8—15行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/CHANGELOG.md#L8-L15)、[发布内容表，第39—48行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/README.md#L39-L48)

实际六级包内关键字段如下；发布包属于 Release 附件，没有 Git 文件行号，定位方式为包名加内部条目名：

| 字段 | 实际值 |
| --- | --- |
| `packageId` | `wssfk.cet6.complete` |
| `contentVersion` / `schemaVersion` | `1.2.1` / `1.1` |
| `papers` | 43条；年份2020—2026；包含月份、套次和 `examType=cet6` |
| `source.type` | `local_question_bank` |
| `source.description` | 由已验证的局域网年度分包流式合并为完整题库 |
| `generator` | 英语刷题机局域网完整包合并器，`1.0.0` |
| `features` | 含答案、AI标签和资源 |
| 来源说明条目 | `manifest.json`、`LICENSE.txt`；未含 `README.md` |

来源：[实际六级ESQ附件](https://github.com/wssfk12138/english-question-banks/releases/download/question-banks-2026-09-20/cet6-complete-v1.2.1.esq)。固定目录也列出该附件的版本、大小、SHA-256和年份。[固定目录，第83—100行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/question-bank-catalog.json#L83-L100)

这给出的来源链止于“作者发布包 ← 局域网年度分包”。已检查的声明没有继续指向最初的试卷整理机构、出版物或公开采集网站。独立仓库 README 也明确不包含原始 PDF/Word 和私有校对材料；因此目前不能复原这些文件的完整采集链。[内容说明，第76—78行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/README.md#L76-L78)

另有项目自建演示题库，manifest 声明为 `demo` 和 `CC0-1.0`。它用于格式测试，不能当作六级真题来源证据。[演示包manifest，第6—17行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/demo-bank/manifest.json#L6-L17)

## 2. PDF/Word 如何变成文章和题目

1. **提取文本块。** `.docx` 读取压缩包中的 `word/document.xml` 和编号信息，将段落、表格文本变成块；旧 `.doc` 先经本机 Word COM 转成 `.docx`。[提取实现，第228—245行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L228-L245)、[Word转换，第11—17行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/convert_word.ps1#L11-L17)
2. **PDF读取现有文字层。** 主要用 `pypdf` 的文本提取；针对部分四六级PDF标题断裂问题，可用 `pdfplumber` 的词坐标重建行序。正文去掉空白后不足100字符会报错，要求改用Word或先OCR。[PDF提取，第195—227行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L195-L227)、[坐标重建，第71—102行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L71-L102)
3. **按考试模板拆分。** 解析器识别考试类型，分别调用考研或四六级的规则，产生文章单元、题干、选项、答案等草稿。六级模板包含听力、选词填空、段落匹配和两篇仔细阅读；考研模板与它分开。[六级模板，第22—35行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/exam_templates.py#L22-L35)、[解析分支，第1848—1855行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L1848-L1855)、[草稿字段，第1912—1934行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L1912-L1934)
4. **核对和入库。** 草稿接受人工编辑或模型辅助，发布接口重新校验，再写入正式题库。正常发布遇到校验警告会阻止；API也存在显式 `force` 参数，不能把校验理解为无法绕过的正确性保证。[发布接口，第794—830行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/routers/imports.py#L794-L830)

**限制：** 扫描PDF没有可提取文字时，这段公开导入链路没有自动执行OCR，而是提示先OCR或人工处理。水印、乱码、断行及多栏布局仍会影响文本和题号顺序；字符数阈值只能发现部分失败。答案PDF另有文字层与答案覆盖检查，不可靠时标记需要人工录入；有文字层不等于答案或文章已经解析正确。[正文提取限制](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L199-L226)、[答案检查，第565—600行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/docx_parser.py#L565-L600)、[README对扫描及水印的说明，第242行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/README.md#L242)

当前单次导入只保留识别出的第一套，记录其余套数为忽略；不应向用户承诺一个合订PDF能自动完整拆成全部试卷。[第一套选择实现，第385—388行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/routers/imports.py#L385-L388)、[README，第244行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/README.md#L244)

## 3. LLM和人工校对的位置

模型接收已提取的文档文本、答案文本及规则解析草稿，核对答案对应、题号和结构问题；提示词要求只依据提供材料，没有可靠答案时留空。结构修正默认参数为关闭；开启后可进一步按单元重建四六级内容。这里的模型作用是辅助整理已有材料，不能据此证明原始试题来自模型或某个网络站点。[模型任务与输入，第260—350行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/import_assist.py#L260-L350)、[单元重建要求，第368—379行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/services/import_assist.py#L368-L379)、[默认参数，第285—286行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/routers/imports.py#L285-L286)

模型调用失败会保留本地草稿并记录失败状态。README提供逐字段人工校对流程；实际发布仍由独立接口完成。批量工具也支持校验无警告后发布，因此不能将所有已发布题目都描述为逐题经过人工验证。[失败回退，第237—245行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/backend/app/routers/imports.py#L237-L245)、[人工校对流程，第235—240行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/README.md#L235-L240)、[批量发布逻辑，第437—449行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/tools/batch_import.py#L437-L449)

## 4. 文档版本差异与内容质量线索

- 主README仍称内置考研英语一为 `1.1.0`；固定提交中的真实包manifest为 `1.2.0`。应以实际包为准。提交 `e464f1b` 说明旧Word选项边界导致阅读选项在词中截断，并更换已校正内容包。[README，第294—302行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/README.md#L294-L302)、[实际内置包](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-one.esq)、[修正提交](https://github.com/wssfk12138/english-multiple-choice-practice-machine/commit/e464f1b64442388bb2f155aa3b8377498e3d655c)
- 独立远程仓库考研英语一为 `1.1.3`，与主仓库内置包版本不同，不应混为同一发布物。独立仓库还记录了132个选项、53道题的修复，以及2002、2026年因缺少参照原文而保留原值的情况。[独立仓库变更记录，第1—6行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/CHANGELOG.md#L1-L6)

这些记录能证明存在持续校对和已知解析缺陷；本次没有逐题比对真题原稿，也没有核验发布者所称“完整”是否涵盖每个场次、套次的全部原始内容。

## 5. 程序许可与内容声明

程序代码声明为 `GPL-3.0-only`；NOTICE明确题目文本、答案、AI标签及ESQ内容可有独立条件，程序许可不自动授予第三方题目内容的传播权。[NOTICE，第5—14行](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/NOTICE.md#L5-L14)

实际检查的两个内置考研包和六级分享包都声明 `NOASSERTION`。其使用声明要求在已获授权的个人或局域网范围内使用，再分发前确认原始内容许可；六级包另外提到原始音频许可。独立题库仓库表示沿用原声明，不为原始试题新增授权。这里记录作者给出的内容声明，不据此作出内容再分发是否合法的结论。[内置英语一包](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-one.esq)、[内置英语二包](https://github.com/wssfk12138/english-multiple-choice-practice-machine/blob/1c52f966cc688867bb41f49987a0fded4a088439/examples/bundled-banks/postgraduate-english-two.esq)（均见包内 `manifest.json`、`LICENSE.txt`）、[六级包](https://github.com/wssfk12138/english-question-banks/releases/download/question-banks-2026-09-20/cet6-complete-v1.2.1.esq)（同上）、[独立仓库内容声明](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/README.md#L76-L78)

## 6. 对本项目的启示（推断，待产品讨论）

以下是根据上述证据提出的设计推断，不是参照项目的既有能力或本项目已经作出的决定。

- **先从学习者自己的六级材料建立流程。** 本项目围绕学习者亲自读过的原文、原句和选词组织学习，可先验证本地材料导入后的阅读与选词体验。参照项目的分享包不能代替对题库供应来源的确认。
- **把文本型PDF与扫描PDF分别处理。** 先判断是否有可靠文字层，再进入提取、校对流程；OCR产物仍应允许人工修正。参照项目中实际发生过的截断问题说明，导入成功不等于原文正确。
- **保留原始出处与定位。** 可以记录文件、页码、文章和所选词对应原句，并保留原稿对照入口，帮助学习者核对语境。参照项目公开包的来源字段较粗，提醒我们避免导出后只剩“从本地库导出”的来源描述。
- **先验证一篇文章的闭环。** 六级题库需要文章、题干、答案、音频等多种结构；本项目可以优先讨论“导入一篇已读原文→选词→保存原句→复习”需要哪些结构，再决定是否扩展到整卷判分与题库分享。

## 7. 核验边界与复核信息

已完成：固定两个仓库提交；读取源码和版本说明；完整解包两个内置考研ESQ；通过HTTP明确字节范围读取六级ESQ的ZIP中央目录、`manifest.json`与`LICENSE.txt`。六级包共175个归档条目，其中43个试卷JSON、43个答案JSON、43个标签JSON、44个资源条目；本次没有下载或播放音频，也没有完整读取全部题目内容。因此，未对六级整个文件重新计算SHA-256；下表六级哈希为固定发布目录声明值。[目录校验信息，第83—100行](https://github.com/wssfk12138/english-question-banks/blob/b4a8ccd7005b25497d53cad352a28f09afa0d5d7/question-bank-catalog.json#L83-L100)

| 证据对象 | SHA-256 | 核验方式 |
| --- | --- | --- |
| 固定主仓库的 `postgraduate-english-one.esq` | `c799fbb243a9b3884595265e367ba344a0e10549aa04daca44dd00e4d9a995fe` | 下载固定提交后本地计算，并读取包内声明 |
| 固定主仓库的 `postgraduate-english-two.esq` | `34ab4e9d8cfb221eecb5270513e80a27f4e1162a8ff76a32dff1dae2eccc2572` | 同上 |
| Release附件 `cet6-complete-v1.2.1.esq`，844,864,930字节 | `0adc274514723bfdace623d72646fd8dd96a58dfc9a1efe7464d2c09077244b2` | 哈希取自固定目录；实际读取远程包内部声明，未重算整包哈希 |

仍未确认：原始真题供应者及采集网站；原始Word/PDF、音频各自的完整取得链；逐题准确性；四级包内部声明；远程合并包生成器的完整可复现执行链。报告中的“没有公开上游网址”限于本次检查到的来源声明及相关公开文件，不代表这些材料在其他地方一定不存在。
