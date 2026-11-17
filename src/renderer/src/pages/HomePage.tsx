import { navigate } from '../navigate'

/**
 * 首屏空态。本机资料库还空着时，只给一条说明与两个入口。
 */
export function HomePage() {
  return (
    <div className="page home">
      <p className="eyebrow">第一次打开</p>
      <h1 className="home-title">先读一篇</h1>
      <p className="home-lede">挑一篇真题开始读，圈下的词会出现在这里。</p>
      <div className="home-actions">
        <button type="button" className="button button-primary" onClick={() => navigate('library')}>
          从文章库挑一篇
        </button>
        <button type="button" className="button" onClick={() => navigate('chat')}>
          用一组词生成
        </button>
      </div>
      <section className="home-section">
        <h2 className="section-label">最近收集</h2>
        <p className="empty-line">还没有词条。读的时候圈一个词，它就会出现在这里。</p>
      </section>
      <section className="home-section">
        <h2 className="section-label">稍后看</h2>
        <p className="empty-line">空着。看到不想现在查的词，标一下会收到这里。</p>
      </section>
    </div>
  )
}
