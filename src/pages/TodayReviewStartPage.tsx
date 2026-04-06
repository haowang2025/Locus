import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { getCards, listPalaces, nowIso } from '../lib/db'
import { chooseNextPalaceForTodayReview, computePalaceReviewStats, buildReviewQueue } from '../lib/review'
import { newId } from '../lib/id'
import { defaultReviewStats, readActiveReviewSession, writeActiveReviewSession } from '../lib/reviewSession'

export default function TodayReviewStartPage() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>('准备今日复习…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const existing = readActiveReviewSession()
        if (existing && existing.kind === 'today' && existing.queue.length > 0 && existing.index < existing.queue.length) {
          navigate(`/palace/${existing.palaceId}/map`)
          return
        }

        setBusy('计算今日复习队列中…')
        const palaces = await listPalaces()
        if (!alive) return
        if (palaces.length === 0) {
          setError('暂无宫殿。请先新建一个宫殿并导入内容。')
          setBusy(null)
          return
        }

        const now = new Date()
        const statsEntries = await Promise.all(
          palaces.map(async (p) => {
            const cards = await getCards(p.id)
            return [p.id, computePalaceReviewStats(p.id, cards, now)] as const
          }),
        )
        if (!alive) return
        const statsByPalaceId = new Map(statsEntries)
        const next = chooseNextPalaceForTodayReview({ palaces, statsByPalaceId })
        if (!next) {
          setError('无法选择要复习的宫殿')
          setBusy(null)
          return
        }

        const cards = await getCards(next.id)
        if (!alive) return
        const { queue, filledCount } = buildReviewQueue(cards, now, 10)
        if (queue.length === 0) {
          if (filledCount === 0) {
            setError(`宫殿「${next.title}」暂无可复习内容。请先导入或编辑卡片。`)
          } else {
            setError(`宫殿「${next.title}」没有可复习的卡片。`)
          }
          setBusy(null)
          return
        }

        writeActiveReviewSession({
          version: 1,
          id: newId('review'),
          kind: 'today',
          palaceId: next.id,
          queue,
          index: 0,
          startedAt: nowIso(),
          stats: defaultReviewStats(),
        })

        navigate(`/palace/${next.id}/map`)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setBusy(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [navigate])

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">今日复习</h1>
        <p className="hint">一键进入今日队列（优先选择最该复习的宫殿）。</p>
      </header>

      <main className="page__body">
        {busy ? (
          <section className="cardbox">
            <p className="hint" style={{ marginTop: 0 }}>
              {busy}
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="cardbox">
            <p className="hint danger-text" style={{ marginTop: 0 }}>
              {error}
            </p>
            <div className="row">
              <Link className="btn" to="/">
                返回首页
              </Link>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

