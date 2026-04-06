import { Link } from 'react-router-dom'

import { getGlobalStreak } from '../lib/streak'
import { readLastReviewSummary } from '../lib/reviewSession'

export default function ReviewSummaryPage() {
  const summary = readLastReviewSummary()
  const streak = getGlobalStreak()

  if (!summary) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">复习总结</h1>
        </header>
        <main className="page__body">
          <section className="cardbox">
            <p className="hint" style={{ marginTop: 0 }}>
              暂无可显示的复习记录。
            </p>
            <div className="row">
              <Link className="btn" to="/">
                返回首页
              </Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const { rated, c0, c1, c2 } = summary.stats
  const primaryLink = summary.kind === 'today' ? '/today' : `/palace/${summary.palaceId}/review`
  const primaryLabel = summary.kind === 'today' ? '继续今日复习' : '继续复习'

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">复习完成</h1>
        <p className="hint">
          连胜 {streak.streakDays} 天 · {streak.studiedToday ? '今日已学习' : '今日未学习'}
        </p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <h2 className="cardbox__title">本次统计</h2>
          <div className="progress">
            <div className="hint" style={{ marginTop: 0 }}>
              共打分 {rated} 张
            </div>
            <div className="progress__bar" aria-hidden="true">
              <div className="progress__fill" style={{ width: rated > 0 ? `${Math.round((c2 / rated) * 100)}%` : '0%' }} />
            </div>
            <p className="hint">
              记住 {c2} · 模糊 {c1} · 没记住 {c0}
            </p>
          </div>
          <div className="row">
            <Link className="btn primary" to={primaryLink}>
              {primaryLabel}
            </Link>
            <Link className="btn" to={`/palace/${summary.palaceId}/map`}>
              进入探索
            </Link>
            <Link className="btn" to="/">
              返回首页
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
