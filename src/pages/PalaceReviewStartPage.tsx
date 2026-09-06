import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getCards, getPalace, nowIso } from '../lib/db'
import { buildReviewQueue } from '../lib/review'
import { newId } from '../lib/id'
import { defaultReviewStats, readActiveReviewSession, writeActiveReviewSession } from '../lib/reviewSession'

export default function PalaceReviewStartPage() {
  const navigate = useNavigate()
  const { palaceId } = useParams<{ palaceId: string }>()
  const [busy, setBusy] = useState<string | null>('准备复习…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!palaceId) return
    let alive = true
    void (async () => {
      try {
        const existing = readActiveReviewSession()
        if (existing && existing.palaceId === palaceId && existing.queue.length > 0 && existing.index < existing.queue.length) {
          navigate(`/palace/${palaceId}/map`)
          return
        }

        setBusy('计算复习队列中…')
        const palace = await getPalace(palaceId)
        if (!alive) return
        if (!palace) {
          setError('宫殿不存在或已删除')
          setBusy(null)
          return
        }

        const cards = await getCards(palaceId)
        if (!alive) return
        const now = new Date()
        // Palace-specific “继续背诵” is also a free-practice entry. If nothing
        // is due, keep the route useful by practicing filled cards; Today Review
        // deliberately does not use this fallback.
        const { queue, filledCount } = buildReviewQueue(cards, now, 10, { fallbackToFilled: true })
        if (queue.length === 0) {
          if (filledCount === 0) {
            setError(`宫殿「${palace.title}」暂无可复习内容。请先导入或编辑卡片。`)
          } else {
            setError(`宫殿「${palace.title}」没有可复习的卡片。`)
          }
          setBusy(null)
          return
        }

        writeActiveReviewSession({
          version: 1,
          id: newId('review'),
          kind: 'palace',
          palaceId,
          queue,
          index: 0,
          startedAt: nowIso(),
          stats: defaultReviewStats(),
        })

        navigate(`/palace/${palaceId}/map`)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setBusy(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [navigate, palaceId])

  if (!palaceId) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">开始复习</h1>
        </header>
        <main className="page__body">
          <p className="hint danger-text">缺少 palaceId 参数</p>
          <Link className="btn" to="/">
            返回首页
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">开始复习</h1>
        <p className="hint">正在进入引导背诵路线…</p>
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
              <Link className="btn" to={`/palace/${palaceId}/map`}>
                自由探索
              </Link>
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
