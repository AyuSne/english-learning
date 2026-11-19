import type { AppDatabase } from './database'

export type Migration = {
  version: number
  up: (database: AppDatabase) => void
}

/**
 * 显式版本号迁移：版本只增不减，启动时只在落后时执行，不在加载旧数据时原地改写。
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    up: (database) => {
      database.exec(`
        CREATE TABLE setting (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)
    }
  },
  {
    version: 2,
    up: (database) => {
      // 文章、段落、句子与原文注释是阅读、选词与出处的共同底座：
      // 句子持久化段内字符区间，原文注释按词挂在段落内的字符区间上。
      database.exec(`
        CREATE TABLE article (
          id                TEXT PRIMARY KEY,
          title             TEXT NOT NULL,
          kind              TEXT NOT NULL,
          kind_label        TEXT NOT NULL,
          session_key       TEXT NOT NULL,
          session_label     TEXT NOT NULL,
          set_label         TEXT NOT NULL,
          exam_year         INTEGER NOT NULL,
          exam_month        INTEGER NOT NULL,
          exam_set          INTEGER NOT NULL,
          word_count        INTEGER NOT NULL,
          body_text         TEXT NOT NULL,
          source_pdf        TEXT NOT NULL,
          source_sha256     TEXT NOT NULL,
          page_start        INTEGER,
          page_end          INTEGER,
          ordinal           INTEGER NOT NULL,
          last_opened_at    TEXT,
          last_paragraph_id TEXT,
          last_sentence_index INTEGER,
          created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX article_session ON article (session_key, ordinal);

        CREATE TABLE paragraph (
          article_id TEXT NOT NULL REFERENCES article(id) ON DELETE CASCADE,
          id         TEXT NOT NULL,
          ordinal    INTEGER NOT NULL,
          text       TEXT NOT NULL,
          page_start INTEGER,
          page_end   INTEGER,
          PRIMARY KEY (article_id, id)
        );

        CREATE TABLE sentence (
          article_id   TEXT NOT NULL,
          paragraph_id TEXT NOT NULL,
          ordinal      INTEGER NOT NULL,
          text         TEXT NOT NULL,
          char_start   INTEGER NOT NULL,
          char_end     INTEGER NOT NULL,
          page         INTEGER,
          PRIMARY KEY (article_id, paragraph_id, ordinal),
          FOREIGN KEY (article_id, paragraph_id)
            REFERENCES paragraph(article_id, id) ON DELETE CASCADE
        );

        CREATE TABLE annotation (
          article_id       TEXT NOT NULL,
          paragraph_id     TEXT NOT NULL,
          sentence_ordinal INTEGER NOT NULL,
          ordinal          INTEGER NOT NULL,
          surface          TEXT NOT NULL,
          gloss            TEXT NOT NULL,
          char_start       INTEGER NOT NULL,
          char_end         INTEGER NOT NULL,
          PRIMARY KEY (article_id, paragraph_id, char_start),
          FOREIGN KEY (article_id, paragraph_id)
            REFERENCES paragraph(article_id, id) ON DELETE CASCADE
        );
      `)
    }
  },
  {
    version: 3,
    up: (database) => {
      // 阅读页的字号、行距与注释开关按篇记住；没有这一行时整份用全局默认。
      // 行距存十分之一，避免 1.6 / 1.8 / 2.0 的浮点比较。
      database.exec(`
        CREATE TABLE article_reading_setting (
          article_id          TEXT PRIMARY KEY REFERENCES article(id) ON DELETE CASCADE,
          font_size           INTEGER NOT NULL,
          line_height_tenths  INTEGER NOT NULL,
          annotations_visible INTEGER NOT NULL,
          updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
    }
  },
  {
    version: 4,
    up: (database) => {
      // 选词的落点：一个词或短语归到一个词条，词条下挂着每条来自阅读的原句。
      // 同篇同句重复圈同一个词条只保留一条关联；句子没了，关联跟着删。
      database.exec(`
        CREATE TABLE word_entry (
          id                TEXT PRIMARY KEY,
          main_form         TEXT NOT NULL,
          normalized_key    TEXT NOT NULL UNIQUE,
          created_at        TEXT NOT NULL,
          last_collected_at TEXT NOT NULL
        );

        CREATE TABLE entry_sentence (
          id               TEXT PRIMARY KEY,
          entry_id         TEXT NOT NULL REFERENCES word_entry(id) ON DELETE CASCADE,
          article_id       TEXT NOT NULL,
          paragraph_id     TEXT NOT NULL,
          sentence_ordinal INTEGER NOT NULL,
          surface          TEXT NOT NULL,
          char_start       INTEGER NOT NULL,
          char_end         INTEGER NOT NULL,
          collected_at     TEXT NOT NULL,
          UNIQUE (entry_id, article_id, paragraph_id, sentence_ordinal),
          FOREIGN KEY (article_id, paragraph_id, sentence_ordinal)
            REFERENCES sentence(article_id, paragraph_id, ordinal) ON DELETE CASCADE
        );

        CREATE INDEX entry_sentence_article
          ON entry_sentence (article_id, paragraph_id, sentence_ordinal);
        CREATE INDEX entry_sentence_entry ON entry_sentence (entry_id);

        -- 重读时给已收集的词做弱高亮，可单独关掉；默认开。
        ALTER TABLE article_reading_setting
          ADD COLUMN weak_highlight INTEGER NOT NULL DEFAULT 1;
      `)
    }
  },
  {
    version: 5,
    up: (database) => {
      // 学习内容：词条下的一段材料，可以由对话钉进来，也可以就地手写。
      // 只保留最终稿，不存历史版本；同一个词条最多置顶一条（部分唯一索引兜住）。
      database.exec(`
        CREATE TABLE learning_note (
          id            TEXT PRIMARY KEY,
          entry_id      TEXT NOT NULL REFERENCES word_entry(id) ON DELETE CASCADE,
          body          TEXT NOT NULL,
          pinned        INTEGER NOT NULL DEFAULT 0,
          source_kind   TEXT NOT NULL DEFAULT 'manual',
          source_pin_id TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE INDEX learning_note_entry
          ON learning_note (entry_id, pinned DESC, created_at DESC);
        CREATE UNIQUE INDEX learning_note_entry_pinned
          ON learning_note (entry_id) WHERE pinned = 1;
      `)
    }
  },
  {
    version: 6,
    up: (database) => {
      // 线程与它的条目日志：条目只追加，parent_id 构成树，线程只记一个 leaf_entry_id。
      // 重新生成与改口都新增条目，旧回答一条不删；分支切换只改 leaf 一行。
      database.exec(`
        CREATE TABLE thread (
          id            TEXT PRIMARY KEY,
          title         TEXT NOT NULL,
          main_kind     TEXT NOT NULL,
          main_id       TEXT,
          context_json  TEXT NOT NULL DEFAULT '[]',
          leaf_entry_id TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE TABLE thread_entry (
          id         TEXT PRIMARY KEY,
          thread_id  TEXT NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
          parent_id  TEXT REFERENCES thread_entry(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL,
          payload    TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX thread_updated ON thread (updated_at DESC);
        CREATE INDEX thread_entry_thread ON thread_entry (thread_id, created_at);
        CREATE INDEX thread_entry_parent ON thread_entry (parent_id, created_at);
      `)
    }
  },
  {
    version: 7,
    up: (database) => {
      // 钉住是独立快照，故意不挂外键：删线程、切分支、删回答都不影响已钉住的内容。
      // 出处里的线程名、轮次、模型、原句都是钉住那一刻抄下来的，之后对不上也不改。
      // `start` / `end` 是片段在那一版回答正文里的字符区间，用来在对话里常驻描边。
      database.exec(`
        CREATE TABLE pin (
          id                   TEXT PRIMARY KEY,
          thread_id            TEXT NOT NULL,
          thread_title         TEXT NOT NULL,
          answer_id            TEXT NOT NULL,
          turn_index           INTEGER NOT NULL,
          model                TEXT NOT NULL,
          captured_text        TEXT NOT NULL,
          char_start           INTEGER NOT NULL,
          char_end             INTEGER NOT NULL,
          source_sentence_id   TEXT,
          source_sentence_text TEXT,
          target_kind          TEXT NOT NULL,
          target_id            TEXT,
          created_at           TEXT NOT NULL
        );

        CREATE INDEX pin_thread ON pin (thread_id, created_at DESC);
        CREATE INDEX pin_target ON pin (target_kind, target_id, created_at DESC);
        CREATE INDEX pin_unfiled ON pin (created_at DESC) WHERE target_kind = 'unfiled';
      `)
    }
  },
  {
    version: 8,
    up: (database) => {
      // 多套模型服务配置。密钥只存 safeStorage（DPAPI）加密后的密文，明文不落库；
      // 校验状态区分「确实通过」与「还没验证」，断网时可以先存着，成功调用后自动转已验证。
      // 备份必须跳过 api_key_secret 这一列，密钥默认不进备份（见 #36）。
      database.exec(`
        CREATE TABLE model_profile (
          id               TEXT PRIMARY KEY,
          name             TEXT NOT NULL,
          base_url         TEXT NOT NULL,
          model            TEXT NOT NULL,
          api_key_secret   TEXT,
          verification     TEXT NOT NULL DEFAULT 'unverified',
          last_error       TEXT,
          last_checked_at  TEXT,
          last_verified_at TEXT,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL
        );

        CREATE INDEX model_profile_created ON model_profile (created_at);
      `)
    }
  },
  {
    version: 9,
    up: (database) => {
      // 早期构建把 article 的库内顺序列叫 position；后来实现里改成了 ordinal。
      // 迁移只在版本号落后时跑，所以这些老库停在 8 却带着旧列名，必须单独修一次。
      const columns = database.pragma('table_info(article)') as { name: string }[]
      const hasPosition = columns.some((column) => column.name === 'position')
      const hasOrdinal = columns.some((column) => column.name === 'ordinal')
      if (hasPosition && !hasOrdinal) {
        database.exec('ALTER TABLE article RENAME COLUMN position TO ordinal')
      }
    }
  },
  {
    version: 10,
    up: (database) => {
      // 「进入本篇选词」即视为读完：只追加一个可空的完成时间，旧文章默认 NULL。
      // 进度由此得到第三种状态（已读完、100%）；阅读位置与设置仍是各自独立的列，
      // 完成时间只写一次，重读、滚动、改设置都不该把它清掉或重写。
      database.exec('ALTER TABLE article ADD COLUMN completed_at TEXT')
    }
  }
]

function latestVersion(plan: readonly Migration[]): number {
  return plan.reduce((latest, migration) => Math.max(latest, migration.version), 0)
}

export const LATEST_SCHEMA_VERSION = latestVersion(migrations)

export type MigrationOutcome = {
  from: number
  to: number
  applied: readonly number[]
}

export class SchemaTooNewError extends Error {
  readonly databaseVersion: number
  readonly supportedVersion: number

  constructor(databaseVersion: number, supportedVersion: number) {
    super(
      `本机资料库的 schema 版本是 ${databaseVersion}，高于本程序支持的 ${supportedVersion}`
    )
    this.name = 'SchemaTooNewError'
    this.databaseVersion = databaseVersion
    this.supportedVersion = supportedVersion
  }
}

export function readSchemaVersion(database: AppDatabase): number {
  return database.pragma('user_version', { simple: true }) as number
}

/**
 * 把所有待应用的迁移放在一笔事务里：任何一步失败都整体回滚，版本不前进。
 */
export function migrate(
  database: AppDatabase,
  options: { migrations?: readonly Migration[] } = {}
): MigrationOutcome {
  const plan = options.migrations ?? migrations
  const from = readSchemaVersion(database)
  const supportedVersion = latestVersion(plan)

  if (from > supportedVersion) {
    throw new SchemaTooNewError(from, supportedVersion)
  }

  const pending = plan.filter((migration) => migration.version > from)
  if (pending.length === 0) {
    return { from, to: from, applied: [] }
  }

  const applyPending = database.transaction(() => {
    for (const migration of pending) {
      migration.up(database)
      database.pragma(`user_version = ${migration.version}`)
    }
  })
  applyPending()

  return {
    from,
    to: pending[pending.length - 1].version,
    applied: pending.map((migration) => migration.version)
  }
}
