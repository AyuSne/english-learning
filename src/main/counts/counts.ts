import type { NavCounts } from '../../shared/counts'
import type { AppDatabase } from '../db/database'
import { UNFILED_PIN_SQL } from '../pins/pins'

/**
 * 全局栏计数：词条总数、文章总数（真题 + AI 生成）与未归档钉住数。
 *
 * 未归档直接复用钉板那条判定，不另写一套：落点为 unfiled 的、落点 id 为空的，
 * 以及落点目标已经不在的都算未归档，左栏数字和钉板里能看到的卡片始终对得上。
 */
export function readNavCounts(database: AppDatabase): NavCounts {
  const row = database
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM word_entry) AS entries,
         (SELECT COUNT(*) FROM article) AS articles,
         (SELECT COUNT(*) FROM pin p WHERE ${UNFILED_PIN_SQL}) AS unfiled`
    )
    .get() as NavCounts
  return { entries: row.entries, articles: row.articles, unfiled: row.unfiled }
}
