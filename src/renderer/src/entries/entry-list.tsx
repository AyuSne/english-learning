import type { EntryListResult } from '../../../shared/entries'
import { entryListMetaText } from './format'

export type EntrySort = 'recent' | 'alpha'
export type EntryFilter = 'all' | 'has-notes' | 'no-notes'

const FILTERS: readonly { value: EntryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'has-notes', label: '有学习内容' },
  { value: 'no-notes', label: '没有学习内容' }
]

/** 词条页左栏：词条列表、搜索、排序与「有/无学习内容」筛选。 */
export function EntryList({
  listing,
  selectedId,
  query,
  sort,
  filter,
  onQuery,
  onSort,
  onFilter,
  onSelect
}: {
  listing: EntryListResult | null
  selectedId: string | null
  query: string
  sort: EntrySort
  filter: EntryFilter
  onQuery: (query: string) => void
  onSort: (sort: EntrySort) => void
  onFilter: (filter: EntryFilter) => void
  onSelect: (entryId: string) => void
}) {
  return (
    <aside className="entries-list" aria-label="词条列表">
      <header className="entries-list-head">
        <h1 className="page-title">词条</h1>
        <span className="entries-total">{listing === null ? '…' : listing.total}</span>
      </header>

      <label className="entries-search">
        <input
          type="search"
          aria-label="搜词条名或原句"
          placeholder="搜词条名或原句"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>

      <div className="entries-toolbar">
        <div className="entries-segments" role="group" aria-label="词条排序">
          <button
            type="button"
            className="entries-segment"
            aria-pressed={sort === 'recent'}
            onClick={() => onSort('recent')}
          >
            最近收集
          </button>
          <button
            type="button"
            className="entries-segment"
            aria-pressed={sort === 'alpha'}
            onClick={() => onSort('alpha')}
          >
            字母
          </button>
        </div>
        <label className="entries-filter">
          <span className="entries-filter-label">筛选</span>
          <select
            aria-label="按学习内容筛选"
            value={filter}
            onChange={(event) => onFilter(event.target.value as EntryFilter)}
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listing !== null && listing.entries.length === 0 ? (
        <p className="empty-line entries-empty">
          {listing.total === 0
            ? '还没有词条。读的时候圈一个词，它就会出现在这里。'
            : '没有对上的词条。换个词，或把筛选放回全部。'}
        </p>
      ) : (
        <ul className="entries-rows">
          {(listing?.entries ?? []).map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="entries-row"
                aria-current={entry.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(entry.id)}
              >
                <span className="entries-row-name">{entry.mainForm}</span>
                <span className="entries-row-meta">{entryListMetaText(entry)}</span>
                {entry.noteCount > 0 ? (
                  <span className="entries-row-notes">学习 {entry.noteCount}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
