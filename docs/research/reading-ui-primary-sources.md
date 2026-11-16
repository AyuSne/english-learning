# 阅读界面的第一手依据：英文正文、中文界面、配色、词状态与键盘

调查日期：2026-11-16。

这份笔记只查**一手来源**：厂商设计规范原文、规范/标准正文、开源阅读器的样式表与源码。二手汇总见 [reading-ui-design-references.md](./reading-ui-design-references.md)，本文不重复它的内容，只回答“数值和做法到底是谁定的、定成多少”。

抓取时间 2026-11-16。引用到的源码版本：Firefox `mozilla-central`（searchfox 当时显示 commit `f898416c`，2026-11-15）、Material Web `tokens` v0.192、Readium CSS `develop` 分支、Tufte CSS `gh-pages` 分支、KOReader `master`。

---

## 0. 先给五条结论

1. **英文长文的一手默认值集中在 16–21px、行高 1.43–1.6。** Material 3 的 body-large 是 16/24（1.5），Firefox 阅读模式 1.6，Readium 基准 1.5（回退 1.6），Tufte 21px/30px（1.43），微软正文 14/20（1.43）。我们四个方向的 1.72–1.92（A 1.86、B 1.72、C 1.92、D 1.8）都比这些官方默认松。
2. **行长的一手建议比我们现在的 720px 窄。** 微软写死“每行 50–60 个字母，不要少于 20、多于 60”；Firefox 阅读模式正文宽 22em；Tufte 正文列约为 55% 版心（674px，按 0.5em 估算约 64 字符）。720px 配 19px 按同一算法约 76 字符，明显超出。
3. **中文界面文字有可引用的行高与字体，但没有“官方字号表”。** Readium 给中文的行高补偿系数是 1.167（1.5 × 1.167 ≈ 1.75）；微软规定简体中文 UI 字体是 Microsoft YaHei UI、UI 文字最小 12px（Regular）/14px（Semibold）；W3C clreq 只定义“行高 = 字号 + 行距”，不给统一倍数。
4. **对比度：正文 4.5:1、大字 3:1、非文字 3:1 是硬线；Apple 还要求自定义前景/背景尽量做到 7:1。** 现原型里 A 的 `--muted` 4.14:1、B 的 `--muted` 4.20:1、B 的 `--accent` 3.97:1 都不达 4.5（且都用于 11–12.5px 小字）。
5. **词状态不要只靠颜色。** Readwise 官方明确“不支持多色高亮”，改用标签；KOReader 用下划线/删除线/反白/淡色底等**样式**区分高亮，颜色只是附加；纯色编码同时违反 WCAG 1.4.1 和 Apple HIG 的“不要只靠颜色传达信息”。

---

## 1. 英文长文阅读的排版参数

### 1.1 Apple HIG

- **平台默认字号与最小字号**：iOS/iPadOS 17pt / 11pt，macOS 13pt / 10pt（[Typography](https://developer.apple.com/design/human-interface-guidelines/typography)）。
- **内置文本样式的字号与行高**：macOS 的 Body 是 13pt / 16pt（1.23），Title 3 是 15/20，Headline 13/16；iOS 的 Body 是 17pt / 22pt（1.29），Footnote 13/18（同页 Dynamic Type 表）。
- **行长没有数值规定**，只有定性建议：宽栏或长段落用 loose leading（更松的行距），并明确“三行以上不要用 tight leading”。
- **衬线/非衬线**：SF 是界面无衬线体，New York（NY）是“设计成可单独阅读、也可与 SF 并排”的衬线体；用 `Font.Design.serif` 取 NY。HIG 同时要求“尽量少用字体族”“避免 Light/Thin 等细字重”。
- 对我们的意义：HIG 没有给正文字号/行长，只给了“界面 13pt 基准 + 正文用衬线是被官方支持的”。**未找到 Apple 对行长（字符数）的数值规定。**

### 1.2 Material Design 3

Material 3 的类型比例以 token 形式发布（[material-web `_md-sys-typescale.scss` v0.192](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss)）：

| Token | 字号 | 行高 | 行高倍数 | 字距 |
| --- | --- | --- | --- | --- |
| body-large | 1rem（16px） | 1.5rem（24px） | 1.5 | 0.03125rem（16px 下 0.5px） |
| body-medium | 0.875rem（14px） | 1.25rem（20px） | 1.43 | 0.015625rem |
| body-small | 0.75rem（12px） | 1rem（16px） | 1.33 | 0.025rem |
| label-large | 0.875rem（14px） | 1.25rem（20px） | 1.43 | 0.00625rem |

M3 没有“行长”这一项（类型比例只管字号/行高/字距），也**未找到** Material 对每行字符数的规范值。

### 1.3 Firefox 阅读模式（about:reader）

样式表：[`toolkit/themes/shared/aboutReader.css`](https://searchfox.org/mozilla-central/source/toolkit/themes/shared/aboutReader.css)（[raw](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/toolkit/themes/shared/aboutReader.css)）。

- `--content-width: 22em`；`--line-height: 1.6em`；`--body-padding: 64px`。
- 正文容器：`max-width: var(--content-width)`、`line-height: var(--line-height)`，字号由用户设置注入，样式表不固定 px。
- 标题：h1 `1.6em / 1.25em`，h2 `1.2em / 1.51em`，h3 `1em / 1.66em`；图注 `0.9em / 1.48em`。
- 主题色：light `#fff` / `rgb(21,20,26)`；sepia `rgb(244,236,216)` = `#F4ECD8` / `rgb(91,70,54)` = `#5B4636`；dark `rgb(28,27,34)` = `#1C1B22` / `rgb(251,251,254)` = `#FBFBFE`；contrast `#000` / `#fff`。
- 22em 的正文宽在 16px 下只有 352px，20px 下 440px——这是“窄栏、强行长控制”的一手证据，说明主流浏览器阅读模式的默认行长比我们窄得多。
- **Safari Reader 没有公开的样式表/规范**，其默认字号、行高、宽度无法引用（见 §11 第 1 条）。

### 1.4 Readium CSS（开源 EPUB 阅读系统样式）

- 基准行高：`--RS__baseLineHeight: calc(1.5 * var(--RS__lineHeightCompensation))`，并在 CSS 里写“fallback 1.6，比 1.5 更适合所有语言”（[`ReadiumCSS-base.css`](https://github.com/readium/css/blob/develop/css/src/modules/ReadiumCSS-base.css)）。
- 未指定样式时的默认：正文 100%、段间距 0、首行缩进 1em、块间距 1.5rem、类型比例 1.125（[`ReadiumCSS-default.css`](https://github.com/readium/css/blob/develop/css/src/ReadiumCSS-default.css)）。
- 用户设置的建议范围：字号 75%–250%，行高 **1–2**，段间距 0–2rem，缩进 0–3rem，词距 0–1rem，字距 0–0.5rem（[User Settings and Themes](https://readium.org/css/docs/CSS12-user_prefs.html)）。
- 行长不设默认值（`--RS__defaultLineLength` 默认 100%），由阅读系统自己控制（[Inject and paginate](https://readium.org/css/docs/CSS03-injection_and_pagination.html)）。

### 1.5 KOReader

官方用户指南（[koreader.rocks/user_guide](https://koreader.rocks/user_guide/)）把字号、行距、词距、字距、对齐、分栏、页边距都列为可调项，但**不公布默认数值**——所以“KOReader 默认 20px / 1.5”这类说法属于二手传闻，本文不采用。可引用的只有它的调节范围与做法：字距、词距、词扩展只在两端对齐时生效，字体字距（kerning）默认用 best。

### 1.6 Tufte CSS

源码：[`tufte.css`](https://github.com/edwardtufte/tufte-css/blob/gh-pages/tufte.css)。

- `html { font-size: 15px }`；正文 `p { font-size: 1.4rem; line-height: 2rem }` → **21px / 30px（1.43）**；段间距 `margin: 1.4rem 0`（≈1em）。
- 版心：`body { width: 87.5%; padding-left: 12.5%; max-width: 1400px }`，`section > p { width: 55% }`。按 1400px 上限算，正文列约 674px；按 0.5em 平均字符宽估算约 64 字符——这是“页边注 + 窄正文列”的结构性做法。
- 无首行缩进；正文无 letter-spacing。
- 衬线：`et-book, Palatino, ... Georgia, serif`。

### 1.7 衬线还是非衬线

- Apple 提供 New York 衬线体给阅读场景，SF 给界面（[Typography](https://developer.apple.com/design/human-interface-guidelines/typography)）。
- 微软把“大量文本”直接指向衬线体：serif fonts are good for presenting large amounts of text（[Typography in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)）。
- Literata 的官方定位是“serif screen font family … conceived for intensive editorial use … excels at text typesetting for continuous reading”（[TypeTogether](https://www.type-together.com/fonts/literata)）。
- 结论：**英文正文用衬线、界面用无衬线**有一手支持；但一手来源都没有说“衬线一定比无衬线快”，只说衬线适合长文。

---

## 2. 中文界面文字的排版要求

### 2.1 W3C clreq（中文排版需求）

[Requirements for Chinese Text Layout（clreq）](https://www.w3.org/TR/clreq/)，2026-11-04 Group Note Draft。

- 汉字与标点“原则上都是 1:1 的正方形”，标点占一个字宽（§1.2、§2.1.2）。
- §6.4「基线、行高等」给出的是**定义与换算**：行高是相邻两行基准点之间的距离，行高 = 字号 ÷ 2 + 行距 + 字号 ÷ 2 = 字号 + 行距。也就是说 clreq 把“行距”与“行高”分开，**没有规定统一的行高倍数**（本次抓取该节只取得定义部分，正文其余内容未获取）。
- 标点规则是可落地的：行首行尾禁则、行尾点号悬挂、省略号占两个汉字且不得拆行、着重号在横排时置于字下（§5.3.1、§5.4.1、§6.1）。
- 行长：clreq 正文本身未给数值；W3C 公共归档里的 clreq 讨论（issue #555“Best line length”）给了一个参考值——**书籍正文行长一般设在 17–40 字**（[W3C 归档](https://lists.w3.org/Archives/Public/public-i18n-archive/2023JulSep/0280.html)）。这是讨论，不是规范正文，引用时需注明。

### 2.2 Readium 对中文的处理（最可直接落地的数值）

- 语言补偿表里 `zh`（含 `zh-Hant`/`zh-TW`/`zh-HK`）的 `lineHeightCompensation` 是 **1.167**，基准行高 1.5 × 1.167 = **1.75**（[`vars/i18n.json`](https://github.com/readium/css/blob/develop/css/vars/i18n.json)、[`ReadiumCSS-base.css`](https://github.com/readium/css/blob/develop/css/src/modules/ReadiumCSS-base.css)）。日文、韩文同为 1.167。
- 中文横排时应**关闭** Readium 的对齐设置（`--USER__textAlign`）与首行缩进、词距、断词设置，并开启 `line-break: strict`（[User Settings and Themes · CJK](https://readium.org/css/docs/CSS12-user_prefs.html)、[base 模块](https://github.com/readium/css/blob/develop/css/src/modules/ReadiumCSS-base.css)）。
- 中文默认字体栈：`PingFang SC / 黑体 / Heiti SC / Microsoft JhengHei UI / Noto Sans CJK SC`（同上 i18n.json）——注意它优先用**黑体**，不是宋体。

### 2.3 微软的中文 UI 规定

- 简体中文 UI 字体是 **Microsoft YaHei UI**，繁体是 Microsoft JhengHei UI（[Typography in Windows · Fonts for non-Latin languages](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)）。
- UI 最小字号：**12px Regular / 14px Semibold**；Windows 11 类型阶梯：caption 12/16、body 14/20、body large 18/24、subtitle 20/28、title 28/36（同页）。
- 对齐：默认左对齐、不用两端对齐；句首大写（sentence case）；不用 Bold/Italic 做强调，用 Semibold。

### 2.4 Apple 的中文排版

**未找到一手依据**：HIG 的 Typography 页面没有按语言给出中文字号/行高/标点规则，只有 Dynamic Type 与字体族建议。

小结：中文界面文字可采用 **12px 下限 + 14px 正文标签 + 1.75 行高（段落）/1.4（单行标签）**；这几项分别有微软与 Readium 的一手支持，但“中文一定要比英文大 1px”这类说法没有来源。

---

## 3. 配色与对比度

### 3.1 硬性阈值

- WCAG 2.2 SC 1.4.3：正文 **4.5:1**，大字 **3:1**；“大字”指 ≥18pt（≈24px）或 ≥14pt 粗体（≈18.5px）；计算不四舍五入（[Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)）。
- SC 1.4.11 非文字对比度 3:1（图标、边界、状态指示）（[WCAG 2.2](https://www.w3.org/TR/WCAG22/#non-text-contrast)）。
- SC 1.4.1 颜色不能是唯一的信息载体（[WCAG 2.2](https://www.w3.org/TR/WCAG22/#use-of-color)）。
- Apple HIG：最低 4.5:1；自定义前景/背景“尤其在小字号时”尽量做到 **7:1**（[Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)）。
- Apple HIG 还要求不要只靠颜色表达状态，要同时给文字或形状（[Color · Inclusive color](https://developer.apple.com/design/human-interface-guidelines/color)）。

### 3.2 各家的实际取值

| 来源 | 浅色底/字 | 深色底/字 | 实测对比度 |
| --- | --- | --- | --- |
| Tufte CSS | `#FFFFF8` / `#111` | `#151515` / `#ddd` | 18.80:1 / 13.44:1 |
| Firefox 阅读模式 | `#FFFFFF` / `#15141A` | `#1C1B22` / `#FBFBFE` | 18.31:1 / 16.54:1 |
| Firefox sepia | `#F4ECD8` / `#5B4636` | — | 7.51:1 |
| Material 3 baseline | `#FEF7FF` / `#1D1B20` | `#141218` / `#E6E0E9` | 16.23:1 / 14.35:1 |
| Readium 默认 | `#FFFFFF` / `#121212` | — | 18.73:1（计算值） |

（Tufte/Firefox/Material/Readium 色值分别来自上面的 tufte.css、aboutReader.css、[`_md-ref-palette.scss`](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-ref-palette.scss) 与 [`colors.json`](https://github.com/readium/css/blob/develop/css/vars/colors.json)；对比度按 WCAG 公式计算。）

Material 3 次级文字的官方 token 是 `on-surface-variant`：浅色 `#49454F`（对 `#FEF7FF` 8.88:1）、深色 `#CAC4D0`（对 `#141218` 10.91:1），都远高于 4.5。

Apple 不给十六进制值，只给语义规则：深色模式用 **base / elevated 两套背景色**（base 更暗、让背景后退；elevated 更亮、让前景前进），并要求优先使用系统背景色而不是自定义值；文字用 primary/secondary/tertiary/quaternary label 四级语义色自动适配（[Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)）。所以 Apple 的“建议”只能落到**语义层级 + 对比度**，不能落到具体色值。

### 3.3 暖白纸色 `#FBFAF3` 有没有规范值

**没有。** 一手来源里能引用的“纸色”只有实现值：

- Tufte `#FFFFF8`（几乎白，带一点黄）；
- Firefox sepia `#F4ECD8`（明显更黄、更暗，配深棕字 7.51:1）；
- Material 浅色 surface `#FEF7FF`（带轻微紫调，不是暖白）。

`#FBFAF3` 落在 Tufte 与 Firefox sepia 之间，属于自定义值；**未找到任何规范把 `#FBFAF3` 定为标准纸色**。它配 `#1A1A17` 的实测对比度 16.67:1，作为正文没问题；问题在次级文字（见下）。

### 3.4 现有原型里已经踩线的颜色

用 WCAG 公式实测（背景取各方向自己的 `--bg`）：

| 方向 | 变量 | 色值 | 对比度 | 用途 |
| --- | --- | --- | --- | --- |
| A | `--muted` | `#7C7465` | **4.14:1** | 11–12.5px 的面包屑、页码、图注、夹注 |
| B | `--muted` | `#6B7280` | **4.20:1** | 11–13px 的栏目标签、列表副标题 |
| B | `--accent` | `#2F6FEB` | **3.97:1** | 11px 的“收下”按钮文字 |
| C | `--muted` | `#9A9488` | 6.05:1 | 通过 |
| D | `--muted` | `#6E6A5E` | 5.16:1 | 通过 |
| D | `--collected` | `#8A6A45` | 4.75:1 | 作为下划线颜色通过 3:1，作为文字色也刚好过 4.5 |

另一个具体坑：把琥珀色当文字色。`#B08A3E` 在 `#FBFAF3` 上只有 **3.06:1**，做正文/小字不合格；同色系压到 `#8A6A28` 才是 4.81:1。所以“已收集”的琥珀只适合做**下划线/底色**，不要做文字颜色。

---

## 4. 词状态标注与高亮

### 4.1 LingQ：三态、纯颜色

官方帮助中心（[How do I create LingQs?](https://lingq-support.groovehq.com/help/how-do-i-create-lingqs)）：

- 打开课文时，所有生词**蓝色**高亮；
- 选好释义后成为 LingQ，**黄色**，直到标记为 Known；
- 标记 Known 后变**白色**（正文色）；若翻页时仍有未处理的蓝词，它们会被视为 Known 并转白；
- 键盘：`K` 标 Known，`X` 忽略。

可复用：三态语义清晰（生词→已保存→已知），且“翻页时蓝词转白”把状态变化和翻页动作绑定。
已知问题：**只靠色相**区分，官方文档没有给非颜色的冗余编码；蓝/黄在色觉缺陷下不是可靠区分（这是 WCAG 1.4.1 的通用风险，不是 LingQ 官方声明）。

### 4.2 Readwise Reader：官方明确“不做多色高亮”

- “Reader doesn't support multiple colors of highlights. If you use highlight colors as a kind of workflow or system, you might try using highlight tags instead.”（[Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)）
- 键盘即阅读：上下方向键逐段移动蓝色焦点，`H` 高亮当前段，`T` 加标签，`N` 加笔记，`[` / `]` 收起两侧栏（同页）。
- 局限也写在文档里：键盘高亮目前只能按**整段**，不能按句/词（同页）。

可复用：**单一高亮色 + 标签**回避了“颜色语义冲突”，也天然满足“不只靠颜色”。代价是标签比颜色多一步操作。

### 4.3 KOReader：用“样式”而不是色相

- 高亮有不同样式：lighten（淡色底）、underscore（下划线）、strikeout（删除线）、invert（反白）——源码里的 drawer 名称见 [`readerhighlight.lua`](https://github.com/koreader/koreader/blob/master/frontend/apps/reader/modules/readerhighlight.lua)，PDF 注释类型映射也在这段（`PDF_ANNOT_HIGHLIGHT → lighten` 等）。
- 颜色是可选的附加项，且允许自定义色值（同文件 `editCustomColor`）；在有笔记的高亮上另有 note marker 图标（[用户指南](https://koreader.rocks/user_guide/) 3.1 节）。
- 官方指南解释了自己的克制：KOReader 的界面之所以“简单、以黑白为主”，是因为渐变和不同深浅的灰在电子墨水屏上会造成闪烁与残影（同页第 3 节）。

可复用：**形状/线型是第一编码，颜色是第二编码**；这在电子墨水与色盲场景都成立。

### 4.4 我们的结论

- 最多两级状态：**已收集**（虚线下划线，必要时加浅底）与**本次选中**（实底）。
- 不要做蓝/黄/绿三色语义；不要用颜色单独表示“生词/已保存/已知”。
- 强调色只出现在“可点/已收集/选中”三处，且文字色必须过 4.5:1。

---

## 5. 页边注（sidenote）的 Web 实现与断点

一手实现只有 Tufte CSS（[源码](https://github.com/edwardtufte/tufte-css/blob/gh-pages/tufte.css)）：

```css
.sidenote, .marginnote {
  float: right; clear: right;
  margin-right: -60%; width: 50%;
  margin-top: 0.3rem;
  font-size: 1.1rem;   /* 16.5px，正文 21px 的 0.79 倍 */
  line-height: 1.3;
  position: relative;
}
```

- 页边栏不是 grid，而是靠 `body { width: 87.5%; padding-left: 12.5% }` 让出的左侧空白 + 负右边距 `-60%` 把注文推进右侧。也就是说：**正文列本身只有版心的 55%**（`section > p { width: 55% }`）。
- 编号用 CSS counter（`counter-increment: sidenote-counter`），`label.sidenote-number` 与 `.sidenote:before` 各显示一次编号。
- 窄屏退化在 `@media (max-width: 760px)`：`.sidenote, .marginnote { display: none }`；`label.margin-toggle` 显示为可点标签；`input.margin-toggle:checked + .sidenote` 时改为 `display: block; float: left; width: 95%` 的行内展开块。即**窄屏 = 隐藏 + 点编号展开**，不是把注文挤进正文。
- 已知限制：这是纯 CSS 的 checkbox hack，注文在 DOM 里必须紧跟 label；`float` + 负边距在容器有 `overflow: hidden` 或 transform 时会失效；浏览器没有原生的 CSS margin-note 机制所以“页边注”只能靠 float / 绝对定位 / JS，**未找到浏览器原生支持的一手依据**（CSS GCPM 的 `float: footnote` 在主流浏览器中未实现）。

对我们的意义：D 现在是 `grid-template-columns: minmax(0,660px) 200px`，比 Tufte 的 55%/50% 更稳（不依赖负边距），但需要明确断点：**< 1000px 时 200px 栏放不下，应改为行内展开或抽屉**，而不是继续挤。

---

## 6. 专注模式 / 打字机模式

iA Writer 官方支持页（[Focus Mode](https://ia.net/writer/support/editor/focus-mode)）：

- 三个选项：**Sentence**（当前句亮、其余变灰）、**Paragraph**（当前段亮、其余变灰）、**Typewriter**（不压暗，光标始终垂直居中）。
- 开关：菜单 Focus → Enable Focus Mode，快捷键 `⌘D`，标题栏按钮。
- 官方提醒：Focus Mode 适合写作阶段，编辑时建议关掉——因为“选区”和“垂直居中”会打架，屏幕会跳。
- 官方还给了偏好：据用户反馈，该功能在全屏 + 深色下体验最好；建议同时试“白底黑字”和“深底浅字”。

对我们的意义：阅读页只需要“压暗非当前段”，不需要打字机；打字机模式属于词条页/笔记编辑，不属于阅读页。压暗比例官方没给数值（iA 只说 gray/dimmed），我们原型用 `opacity: .24` 属于自定值。

---

## 7. 键盘优先阅读

### 7.1 Readwise Reader（有官方键位文档）

来源：[Navigation](https://docs.readwise.io/reader/docs/faqs/navigation)、[Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)。

| 键 | 行为 |
| --- | --- |
| `↑` / `↓` | 逐段移动蓝色焦点（不是滚动一行） |
| `H` | 高亮当前段（图片也可） |
| `T` | 给高亮加标签 |
| `N` | 给高亮加笔记 |
| `Shift + N` | 文档级笔记 |
| `[` / `]` | 显示/隐藏左右侧栏 |
| `Cmd/Ctrl + K` | 命令面板（可搜所有动作） |
| `?` | 快捷键参考 |
| `Shift + H` | 开关“选中即高亮” |
| `Cmd/Ctrl + C` | 复制当前焦点段落 |

它的设计原则写在文档里：“Reader on web is fully keyboard shortcut driven, including while reading documents.”

### 7.2 KOReader

官方指南没有固定键位表：键盘快捷键是**把任意手势/动作绑定到按键**（[用户指南](https://koreader.rocks/user_guide/) §10.4 “Keyboard Shortcuts”）。所以“KOReader 默认 j/k 翻页”这类说法没有依据。

### 7.3 建议键位（对齐 Readwise 的语义）

`↑/↓` 或 `j/k` = 上一句/下一句；`Space`/`PageDown` = 翻页；`H` = 收下当前句/词；`T` = 标签；`N` = 笔记；`Esc` = 取消选择；`?` = 键位帮助；`Cmd/Ctrl+K` = 命令面板。**不要**把翻页做成 `j/k`（与“按句移动”冲突，Readwise 的箭头是焦点而非滚动）。

---

## 8. Windows 上可用的字体

### 8.1 Segoe UI Variable（系统 UI 字体）

[Typography in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)：

- Windows 的新系统字体，可变字体；`wght` 100–700，`opsz` **8pt–36pt 自动**（小字号优先可读性、大字号优先个性）。
- XAML 控件默认就用它；HTML 里需要显式写 `Segoe UI Variable`，光学尺寸才会自动匹配。
- 类型阶梯：12/16、14/20、18/24、20/28、28/36、40/52、68/92 epx；最小 12px Regular / 14px Semibold。
- 定位：**界面**字体，不是长文正文字体；官方把“大量文本”指向 serif。

### 8.2 Sitka（Windows 自带的可变光学尺寸衬线）

[Sitka font family](https://learn.microsoft.com/en-us/typography/font-list/sitka)：

- Matthew Carter 设计，**主要为屏幕使用**，按光学尺寸分档：Sitka Small 0–9.5pt、**Sitka Text 9.5–13.5pt**、Subheading 13.5–18.5pt、Heading 18.5–23.5pt、Display 23.5–27.5pt、Banner 27.5pt+。
- 对我们的坑：正文 19px ≈ 14.25pt，已经超出 **Sitka Text** 的 9.5–13.5pt 区间，应写 `Sitka`（让 opsz 自动）或直接用 Subheading，而不是 `"Sitka Text"`。现在 A/C/D 的字体栈都写了 `"Sitka Text"`，在 19px 下选错了光学尺寸。

### 8.3 开源衬线

- **Source Serif 4**：Adobe 官方说明它有 5 个光学尺寸（Caption / Small Text / Text / Subhead / Display）、共 60 个样式，OFL 开源，变量字体；官方 readme 说它在纸面或屏幕上排长文时最见其长（[Adobe 博客](https://blog.adobe.com/en/publish/2021/03/04/source-serif-gets-optical-sizes)、[官方 readme](https://github.com/adobe-fonts/source-serif/wiki/Source-Serif-Readme)）。光学尺寸名称只是“建议用途”，不绑定 pt 值，Web 上可用 CSS 把 opsz 与字号关联。
- **Literata**：TypeTogether 官方说它最初是 Google Play Books 的定制字体，是为密集编辑阅读/连续阅读设计的屏幕衬线，变量字体、OFL；其样张给 Regular 的示例 leading 是 **1.48**（[TypeTogether · Literata](https://www.type-together.com/fonts/literata)）。Readium 的用户调研也把 Literata/Bookerly 列为读者已经熟悉的默认字体（[User Preferences' insights](https://readium.org/css/docs/CSS15-user_pref_insights.html)）。

建议：正文优先 `"Source Serif 4"`（可随包分发，OFL）→ `Sitka`（Windows 自带）→ `Georgia`；界面 `"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI"`。19px 时不要指定 `"Sitka Text"`。

---

## 9. 参数 → 建议值 → 依据

| 参数 | 建议值 | 依据 |
| --- | --- | --- |
| 英文正文字号 | 19px 默认，16/18/20/22 可选 | Tufte 21px；M3 body-large 16px；iOS Body 17pt≈22.7px；Sitka Text 上限 13.5pt≈18px（[tufte.css](https://github.com/edwardtufte/tufte-css/blob/gh-pages/tufte.css)、[M3](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss)、[HIG](https://developer.apple.com/design/human-interface-guidelines/typography)） |
| 英文正文行高 | **1.6** 默认（舒适档 1.8） | Firefox 1.6；Readium 1.5（回退 1.6）；M3 1.5；Tufte 1.43（[aboutReader.css](https://searchfox.org/mozilla-central/source/toolkit/themes/shared/aboutReader.css)、[Readium base](https://github.com/readium/css/blob/develop/css/src/modules/ReadiumCSS-base.css)） |
| 正文列宽 | 620px（19px 下约 65 字符），可选 580–660px | 微软 50–60 字母/行；Tufte 55%×1400≈674px≈64 字符；Firefox 22em（[Windows 排版](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)） |
| 行长上限 | 60 字符（Tufte 约 64，硬上限 70） | 微软“不要多于 60”；Tufte 测算约 64（同上） |
| 段间距 | 1em（19px），无首行缩进 | Tufte 1.4rem≈1em；Readium `flowSpacing 1.5rem`、`paraSpacing 0`（[default.css](https://github.com/readium/css/blob/develop/css/src/ReadiumCSS-default.css)） |
| 首行缩进 | 英文 0；中文横排按 Readium 建议关闭缩进，用段间距 | Readium 对 CJK 横排明确关闭 `paraIndent`（[CSS12](https://readium.org/css/docs/CSS12-user_prefs.html)） |
| 字距 | 正文 0；大写小标签 0.03–0.08em | Tufte `.sans { letter-spacing:.03em }`；M3 body tracking 0.03125rem（[tufte.css](https://github.com/edwardtufte/tufte-css/blob/gh-pages/tufte.css)） |
| 中文行高 | 段落 **1.75**；单行标签 1.4 | Readium zh 补偿 1.167 × 1.5（[i18n.json](https://github.com/readium/css/blob/develop/css/vars/i18n.json)） |
| 中文 UI 字号 | 标签 ≥12px，正文标签 13–14px | 微软最小 12px Regular / 14px Semibold（[Windows 排版](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)） |
| 中文 UI 字体 | Microsoft YaHei UI | 微软官方中文 UI 字体（同上） |
| 正文对比度 | ≥4.5:1；目标 7:1 | WCAG 1.4.3；Apple HIG 7:1（[WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[HIG Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)） |
| 次级文字 | 浅色 ≥`#6B665C`（5.45:1），深色 ≥`#A8A29A`（6.86:1） | WCAG 4.5:1；实测值 |
| 纸色 | `#FBFAF3` + 墨 `#1A1A17`（16.67:1） | 自定义值；最近的规范/实现值是 Tufte `#FFFFF8`、Firefox sepia `#F4ECD8` |
| 深色底/字 | `#1A1A1E` / `#E8E4DA`（13.67:1） | Firefox `#1C1B22`/`#FBFBFE`；M3 `#141218`/`#E6E0E9`；Tufte `#151515`/`#ddd` |
| 已收集标记 | 虚线下划线（≥3:1），不要只变颜色 | WCAG 1.4.11 / 1.4.1；KOReader 用样式区分 |
| 选中底色 | `#F2E4BE`（文字仍 `#1A1A17`，13.8:1） | 自定值；需保证底色上的文字对比度 |
| UI 最小字号 | 12px；低于 12px 的 9.5–11px 全部上调 | 微软最小 12px；现原型 D 的 `.lbl` 9.5px、A 的 11px 均不合规 |

---

## 10. 可以直接落进原型的 10 条规则

1. **正文默认 19px / 行高 1.6**，1.8 只作为“舒适”档；把 A 的 1.86、B 的 1.72、C 的 1.92、D 的 1.8 统一收口到 1.6–1.8 两档。*（改变 A、B、C、D）*
2. **正文列收到 620px**（19px 下约 65 字符，按 0.5em 估算），720px 只留给“宽屏对照/PDF”；行长超过 70 字符时自动加左右留白。*（改变 A 的 700px、B 的 660px 版心、D 的 660px 正文列）*
3. **次级文字按背景实测 ≥4.5:1**（纸色上约 `#6E6A5E`，5.16:1）：A 的 `#7C7465`（4.14:1）与 B 的 `#6B7280`（4.20:1）必须加深；B 的 `#2F6FEB`（3.97:1）不能做 11px 文字色。*（改变 A、B）*
4. **英文正文用衬线、UI 用无衬线**；字体栈改为 `"Source Serif 4", Sitka, Georgia, serif`，**删掉 `"Sitka Text"`**（19px 超出它的 9.5–13.5pt 光学区间）。*（改变 A、C、D）*
5. **中文 UI 文案下限 12px**：D 的 `.d-note .lbl`（9.5px）、`.d-letter`（10px）、C 的 `.c-letter`（10.5px）、A 的 `.gloss`（≈11.8px）都要上调；中文段落行高 1.75。*（改变 A、C、D）*
6. **词状态只保留两级，且有非颜色编码**：已收集 = 虚线下划线（`#8A6A28` 或 `#8A6A45`），本次选中 = 底色 `#F2E4BE`；不再用 accent 色文字表示“可收下”。*（改变 A、B、C、D 的 `.take`）*
7. **页边注的断点写在 1000px**：≥1000px 用现在的 200px 页边栏；<1000px 退化为“点编号在行内展开”（照 Tufte 760px 的 checkbox 方案），不要继续挤 200px。*（主要改变 D；C 目前是行内注文块，不受影响）*
8. **键盘先按 Readwise 对齐**：`↑/↓` 逐句、`Space` 翻页、`H` 收下、`T` 标签、`N` 笔记、`Esc` 取消、`?` 帮助；不要用 `j/k` 翻页。*（改变 A、B、C、D：现在都没有键位）*
9. **深色主题不用纯黑**：C 的 `#14151A/#E9E4D8` 可保留（14.37:1），但强调色 `#D9A441` 只做小面积文字（8.11:1 可用），不要做大段正文色；纸色方向固定 `#FBFAF3/#1A1A17`。*（改变 C 的强调色用法，A/B/D 不受影响）*
10. **专注模式只做“压暗非当前段”**：阅读页不提供打字机；把打字机留给词条页的笔记编辑（iA 官方也提醒编辑时两者会打架）。*（改变 A、B、C：现在没有专注模式；D 已有 `opacity:.24`，保留）*

---

## 11. 明确“未找到一手依据”的项

以下十项均**未找到一手依据**，或只能找到“实现值/讨论”而不能当作规范引用：

1. **Safari 阅读模式的默认字号/行高/宽度**：Safari Reader 的样式表不公开，Apple 支持文档只描述“可改字号与背景”，没有数值。未找到。
2. **Apple HIG 的中文排版数值**（中文字号、行高、标点规则）：HIG 未按语言给出。未找到。
3. **Apple 系统背景色的官方十六进制值**：HIG 明说文档中的颜色值仅供设计参考，公开的是语义色名与强调色值，没有 `systemBackground` 的 hex。未找到。
4. **`#FBFAF3` 作为“暖白纸色”的规范值**：没有任何规范定义它；可引用的只有 Tufte `#FFFFF8`、Firefox sepia `#F4ECD8` 等实现值。未找到。
5. **clreq 对行高的统一倍数**：clreq §6.4 只给“行高 = 字号 + 行距”的定义，未给倍数（本次抓取只拿到该节定义部分）。未找到。
6. **KOReader 的默认字号/行距数值**：官方指南只说明可调，不公布默认值。未找到。
7. **Material 3 对行长（字符数）的规定**：类型比例只有字号/行高/字距，没有行长。未找到。
8. **Apple HIG 对行长（字符数）的数值**：只有“宽栏/长段落用 loose leading”的定性建议。未找到。
9. **LingQ / Readwise / KOReader 官方对色盲的专门方案**：三家的文档都没有色盲章节；只有 Apple HIG 与 WCAG 的通用要求。未找到。
10. **“中文比英文同字号看起来更大、应 +1px”的官方依据**：中英文排版指南均未给出这条换算。未找到。

---

## 12. 来源清单

**规范与标准**

- [WCAG 2.2 · Understanding 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [WCAG 2.2 正文（1.4.1 Use of Color、1.4.11 Non-text Contrast）](https://www.w3.org/TR/WCAG22/)
- [W3C clreq《中文排版需求》](https://www.w3.org/TR/clreq/)（[§6.4 行高](https://www.w3.org/TR/clreq/#h_baselines)）
- [W3C 公共归档 · clreq issue #555（行长 17–40 字）](https://lists.w3.org/Archives/Public/public-i18n-archive/2023JulSep/0280.html)

**厂商规范**

- [Apple HIG · Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple HIG · Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- [Apple HIG · Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Material 3 typescale tokens（v0.192）](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-typescale.scss)
- [Material 3 color tokens](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-color.scss) / [palette](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-ref-palette.scss)
- [Microsoft · Typography in Windows](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography)
- [Microsoft Typography · Sitka](https://learn.microsoft.com/en-us/typography/font-list/sitka)

**开源实现（源码）**

- [Firefox 阅读模式样式 aboutReader.css](https://searchfox.org/mozilla-central/source/toolkit/themes/shared/aboutReader.css)
- [Readium CSS 基准模块](https://github.com/readium/css/blob/develop/css/src/modules/ReadiumCSS-base.css)
- [Readium CSS 默认模块](https://github.com/readium/css/blob/develop/css/src/ReadiumCSS-default.css)
- [Readium 语言补偿 i18n.json](https://github.com/readium/css/blob/develop/css/vars/i18n.json)
- [Readium 默认色 colors.json](https://github.com/readium/css/blob/develop/css/vars/colors.json)
- [Readium 用户设置文档](https://readium.org/css/docs/CSS12-user_prefs.html)
- [Tufte CSS](https://github.com/edwardtufte/tufte-css/blob/gh-pages/tufte.css)
- [KOReader 高亮实现 readerhighlight.lua](https://github.com/koreader/koreader/blob/master/frontend/apps/reader/modules/readerhighlight.lua)
- [KOReader 用户指南](https://koreader.rocks/user_guide/)

**产品文档**

- [LingQ 支持 · How do I create LingQs?](https://lingq-support.groovehq.com/help/how-do-i-create-lingqs)
- [Readwise Reader · Navigation](https://docs.readwise.io/reader/docs/faqs/navigation)
- [Readwise Reader · Highlights, Tags, and Notes](https://docs.readwise.io/reader/docs/faqs/highlights-tags-notes)
- [iA Writer · Focus Mode](https://ia.net/writer/support/editor/focus-mode)
- [iA Writer · Write With Focus](https://ia.net/writer/how-to/write-with-focus)

**字体**

- [Adobe · Source Serif gets optical sizes](https://blog.adobe.com/en/publish/2021/03/04/source-serif-gets-optical-sizes)
- [Source Serif 官方 readme](https://github.com/adobe-fonts/source-serif/wiki/Source-Serif-Readme)
- [TypeTogether · Literata](https://www.type-together.com/fonts/literata)

**仓库内参照**

- 现有三方向（含 D）原型：[reading-ui-directions.html](../prototypes/reading-ui-directions.html)
- 二手汇总（供对照，不作为依据）：[reading-ui-design-references.md](./reading-ui-design-references.md)
