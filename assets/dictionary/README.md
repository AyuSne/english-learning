# 内置词典（ECDICT 裁剪版）

`ecdict.db` 是本应用随包分发的只读离线词典。阅读划词卡、词条页右栏与对话划词浮卡
都查这一份库；查词不联网，也不调用模型。

## 来源与许可

- 源数据：[ECDICT](https://github.com/skywind3000/ECDICT)，MIT License，
  版权声明见 [LICENSE-ECDICT](./LICENSE-ECDICT)。分发应用时这份声明必须一起带上
  （构建会把它复制到 `out/main/dictionary/`）。
- 生成时间与源文件的 SHA-256 记在库的 `meta` 表里（`source_sha256`）。当前这一份：
  770,611 行源数据裁出 23,927 条词头、22,517 条词形映射（合计 46,444 条），约 3.6 MB。
- 63 篇语料的 7,013 个词形里有 6,677 个能查到；剩下 336 个是专名、连字符短语或
  ECDICT 本身没收的词（如 `illuminum`、`tiktok`），查的时候按「没收录」处理。
  语料词形数与查不到的数量也写进 `meta`（`corpus_forms` / `corpus_unresolved`）。

## 收录范围

与 `docs/product-scope.md`「已确认的内置词典」一致：

1. 两万核心词：ECDICT `bnc` 或 `frq` 词频前 20000，或 `oxford` 牛津三千；
2. `cet4` / `cet6` 标签词；
3. 首批 63 篇语料（`docs/corpus/`）里出现过的词形，以及它们的原形；
4. 上述词条 `exchange` 字段里各词形变化到原形的映射（lemma 表）。

同一个词形的条目如果只是「X 的过去式」「X 的名词复数」这类没有独立词性释义的
薄变体，就不当词头，只在 `lemma` 表里指回原形 —— 查 approached 得到的是 approach
的音标与完整释义。left、saw、found 这类有独立常用义的同形词仍保留自己的词条。

## 表结构

```sql
entry(key TEXT PRIMARY KEY, word, phonetic, translation, exchange)
lemma(form TEXT PRIMARY KEY, lemma)
meta(key TEXT PRIMARY KEY, value)
```

`key` 是小写词形，`word` 是 ECDICT 的词头原文；查询时先精确匹配 `entry`，再按
`lemma` 回退到原形，都没有就是「没收录」。`translation` 原样保存，词性与释义在
查询时按行拆分。

这份库是只读的参考数据，不是学习资料，不参与本机库的备份与恢复；用户数据仍然
只写在单一的本机库 `english-learning.db` 里（见 `docs/adr/0001-desktop-stack-and-local-data.md`）。

## 重新生成

`tools/build-dictionary.mjs` 从 ECDICT 的 `ecdict.csv` 裁出这份库。源 CSV 约 66 MB，
不随仓库提交：

```powershell
# 1. 下载 ECDICT（放到仓库外的临时目录）
curl.exe -L -o .tmp-dictionary\ecdict.csv `
  https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv
curl.exe -L -o .tmp-dictionary\LICENSE `
  https://raw.githubusercontent.com/skywind3000/ECDICT/master/LICENSE

# 2. 裁剪并写出库与版权声明
node tools/build-dictionary.mjs `
  --source .tmp-dictionary\ecdict.csv `
  --license .tmp-dictionary\LICENSE

# 3. 验证
npx vitest run src/main/dictionary
```

构建时 `electron.vite.config.ts` 会把 `ecdict.db` 与 `LICENSE-ECDICT` 复制到
`out/main/dictionary/`，开发态与 E2E 从这里读；E2E 也可以用环境变量
`DICTIONARY_DIRECTORY` 指向 fixture 词典目录。

打包时 `scripts/package.mjs` 把整个目录额外放到 `resources/dictionary/`，主进程在
打包后按 `process.resourcesPath` 找它（SQLite 文件不能留在 asar 里，native 驱动读不了
asar 内的路径），并把这些文件从 asar 中排除，避免重复占体积。
