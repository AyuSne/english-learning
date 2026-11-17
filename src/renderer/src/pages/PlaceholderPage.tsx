/**
 * 视图骨架：其它五个页面的内容随各自 ticket 落地，这里先只占住路由。
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <p className="empty-line">这个页面还没有内容。</p>
    </div>
  )
}
