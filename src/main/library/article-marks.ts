import type { AppDatabase } from '../db/database'
import { readSetting, writeSetting } from '../db/settings'

/**
 * 文章库的内部标记。两者都借 setting 表存 JSON，不新增表、不改 schema：
 *
 * - 删掉的随包文章 id：启动与「重新导入」都会再跑一遍语料导入，没有这个标记，
 *   被删的文章会在下次启动时被清单导回来。它只给语料导入看，生成文章不会走导入。
 *   这个列表不做清理：清掉之后下次导入就会把文章导回来。
 * - 用户改过的显示名：语料内容哈希变化会重写文章元信息，标记让重写保留用户改的名字。
 *
 * 两者都随整库备份/恢复一起走（备份包含 setting 表）；恢复后墓碑与改名仍然生效。
 * 两处写入都必须与删除 / 重命名放在同一笔事务里，避免库改了而标记没跟上。
 * 详见 docs/adr/0004-article-library-maintenance.md。
 */

const DELETED_ARTICLE_KEY = 'library.deleted-articles'
const TITLE_OVERRIDE_KEY = 'library.title-overrides'

function readStringArray(database: AppDatabase, key: string): string[] {
  const raw = readSetting(database, key)
  if (raw === null) {
    return []
  }
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function readStringMap(database: AppDatabase, key: string): Record<string, string> {
  const raw = readSetting(database, key)
  if (raw === null) {
    return {}
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {}
    }
    const map: Record<string, string> = {}
    for (const [id, title] of Object.entries(value)) {
      if (typeof title === 'string' && title.trim() !== '') {
        map[id] = title
      }
    }
    return map
  } catch {
    return {}
  }
}

export function readDeletedArticleIds(database: AppDatabase): Set<string> {
  return new Set(readStringArray(database, DELETED_ARTICLE_KEY))
}

/** 在删除文章的事务里调用。 */
export function markArticleDeleted(database: AppDatabase, articleId: string): void {
  const ids = readDeletedArticleIds(database)
  if (ids.has(articleId)) {
    return
  }
  ids.add(articleId)
  writeSetting(database, DELETED_ARTICLE_KEY, JSON.stringify([...ids].sort()))
}

export function readArticleTitleOverride(database: AppDatabase, articleId: string): string | null {
  return readStringMap(database, TITLE_OVERRIDE_KEY)[articleId] ?? null
}

/** 在重命名文章的事务里调用；与 article.title 一起写。 */
export function rememberArticleTitleOverride(
  database: AppDatabase,
  articleId: string,
  title: string
): void {
  const overrides = readStringMap(database, TITLE_OVERRIDE_KEY)
  overrides[articleId] = title
  writeSetting(database, TITLE_OVERRIDE_KEY, JSON.stringify(overrides))
}

/** 在删除文章的事务里调用，免得标记随文章 id 越积越多。 */
export function forgetArticleTitleOverride(database: AppDatabase, articleId: string): void {
  const overrides = readStringMap(database, TITLE_OVERRIDE_KEY)
  if (!(articleId in overrides)) {
    return
  }
  delete overrides[articleId]
  writeSetting(database, TITLE_OVERRIDE_KEY, JSON.stringify(overrides))
}
