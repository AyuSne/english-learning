# 阅读界面可借鉴的设计参考

调查日期：2026-11-16。看的是公开的产品与排版资料，不是截图拼贴；重点挑“能落到数值和结构上”的做法。

## 看了什么

- [Tufte CSS](https://edwardtufte.github.io/tufte-css/)：页边注（sidenote）、`#fffff8` 纸色与 `#111` 墨色、灰度为主、颜色只留给图表。
- [Butterick's Practical Typography 要点](https://practicaltypography.com/summary-of-key-rules.html)：正文字号 15–25px、行距 120–145%、行长 45–90 字符、全大写加 5–12% 字距、缩进与段间距二选一。
- [iA Writer 的 Focus Mode](https://ia.net/writer/how-to/write-with-focus)：只保留当前句/段清晰，其余变灰；另有打字机模式。
- [Readwise Reader](https://readwise.io/read) 与[外观说明](https://docs.readwise.io/reader/docs/faqs/appearance)：高亮是一等公民、键盘式阅读、阅读主题与字号行距设置、六种高亮色。
- [LingQ 的词状态配色](https://forum.lingq.com/t/i-dont-understand-blue-and-yellow-words/169807)：蓝色是生词、黄色是已保存释义的词、其余是已知词——同一种“重读时看见自己学过什么”的做法。
- [Linea 的阅读应用对比](https://lineareads.com/guides/best-reading-apps-2026)：确认主流阅读应用的共性——极简阅读页、可调主题、标注与回看分离。
- [Quiet Hours 概念稿](https://dribbble.com/shots/27572148-Quiet-Hours-Editorial-Reading-App-iOS-UI-UX-Design)：暖色纸张 + 衬线 + 大留白的编辑式方向。

## 可以落地的做法

1. **纸与墨别用纯白纯黑**：Tufte 用 `#fffff8` / `#111`，比纯白纯黑柔和。我们的 `#F6F2E9` 偏黄，可收敛到 `#FBFAF3`，墨色 `#1A1A17`。
2. **行长和行距要有数**：19px 衬线、行长约 70 字符、行距 1.75–1.85，落在 Butterick 的建议区间里；现在的 720px 合适，不需要更宽。
3. **页边注而不是行内夹注**：Tufte 的 sidenote 把次要信息放在页边，正文不被打断。我们的中文夹注最适合这个位置，而不是缩小上标塞在词后。
4. **词状态用颜色分层**：LingQ 用蓝/黄区分生词与已保存词。我们可以只留两级——已收集（淡琥珀下划线）与本次选中（麦色底），不再多。
5. **专注模式**：iA 的做法是当前段之外全部变淡。阅读长文时按一下，只留正在读的一段。
6. **键盘优先**：Readwise 的阅读页不依赖鼠标。翻页、下一条原句、收下，都该有键位。
7. **颜色克制**：Tufte 正文全灰度，颜色只给图表。我们的强调色应该只出现在“可点/已收集/选中”三处，其余靠字重与间距。
8. **设置项就是三样**：主题（纸/夜/深灰）、字号、行距。不要做十项排版设置。

## 对我们三个方向的影响

- A 书页：把纸色调淡、夹注移到页边、加专注模式，基本就是方向 D。
- B 工作台：保留三栏，但右栏的卡片密度可以降一档，用留白分组而不是边框。
- C 夜读：页边注的做法保留，正文颜色从纯米色改为 `#E7E2D6`，减少暖色饱和。

据此新增了方向 **D · 素读**：浅色纸、页边注、专注模式、两级词状态。它不是第四个风格，而是把上面这些做法收进一版。
