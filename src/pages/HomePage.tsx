import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createPalace, deletePalace, getCards, listPalaces } from '../lib/db'
import { LOCUS_COUNT } from '../lib/loci'
import { computePalaceReviewStats, type PalaceReviewStats } from '../lib/review'
import { getGlobalStreak } from '../lib/streak'
import type { CardRecord, PalaceRecord } from '../lib/types'

function isFilled(card: CardRecord) {
  return Boolean(card.prompt.trim() || card.answer.trim() || card.note?.trim() || card.imageIds.length > 0 || card.modelId)
}

export default function HomePage() {
  const navigate = useNavigate()
  const [palaces, setPalaces] = useState<PalaceRecord[]>([])
  const [filledByPalace, setFilledByPalace] = useState<Map<string, number>>(new Map())
  const [reviewStatsByPalace, setReviewStatsByPalace] = useState<Map<string, PalaceReviewStats>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setBusy('加载中…')
    setError(null)
    try {
      const list = await listPalaces()
      const now = new Date()
      const entries = await Promise.all(
        list.map(async (palace) => {
          const cards = await getCards(palace.id)
          return {
            palace,
            filled: cards.filter(isFilled).length,
            stats: computePalaceReviewStats(palace.id, cards, now),
          }
        }),
      )

      entries.sort((a, b) => {
        const aDue = a.stats.dueCount > 0
        const bDue = b.stats.dueCount > 0
        if (aDue !== bDue) return aDue ? -1 : 1
        if (a.stats.dueCount !== b.stats.dueCount) return b.stats.dueCount - a.stats.dueCount
        return a.palace.updatedAt < b.palace.updatedAt ? 1 : -1
      })

      setPalaces(entries.map((entry) => entry.palace))
      setFilledByPalace(new Map(entries.map((entry) => [entry.palace.id, entry.filled] as const)))
      setReviewStatsByPalace(new Map(entries.map((entry) => [entry.palace.id, entry.stats] as const)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const continuePalace = useMemo(() => palaces.find((palace) => (filledByPalace.get(palace.id) ?? 0) > 0) ?? palaces[0], [palaces, filledByPalace])

  async function onCreate() {
    const title = prompt('新建宫殿标题', `宫殿 ${palaces.length + 1}`)
    if (title === null) return
    setBusy('新建中…')
    setError(null)
    try {
      const created = await createPalace(title || '未命名宫殿')
      await reload()
      navigate(`/palace/${created.id}/quick-import`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onDelete(palace: PalaceRecord) {
    if (!confirm(`删除宫殿「${palace.title}」？`)) return
    setBusy('删除中…')
    setError(null)
    try {
      await deletePalace(palace.id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const streak = getGlobalStreak()

  return (
    <div className="page xhs-home">
      <header className="page__header">
        <h1 className="page__title">记忆宫殿</h1>
        <p className="hint">
          连续学习 {streak.streakDays} 天 · 完全离线
        </p>
      </header>

      <main className="page__body">
        <section className="cardbox home-primary-actions">
          <h2 className="cardbox__title">今天背什么？</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            打开后直接进入引导背诵；自由探索放在宫殿卡片的次级入口。
          </p>
          <div className="row home-primary-row">
            {continuePalace ? (
              <Link className="btn primary home-primary-btn" to={`/palace/${continuePalace.id}/review`} aria-disabled={busy !== null}>
                继续背诵
              </Link>
            ) : (
              <button className="btn primary home-primary-btn" onClick={() => void onCreate()} disabled={busy !== null}>
                开始新的记忆宫殿
              </button>
            )}
            <button className="btn home-primary-btn" onClick={() => void onCreate()} disabled={busy !== null}>
              + 新建宫殿
            </button>
          </div>
          {continuePalace ? (
            <p className="hint" style={{ marginBottom: 0 }}>
              当前：{continuePalace.title} · 待复习 {reviewStatsByPalace.get(continuePalace.id)?.dueCount ?? 0} 个点
            </p>
          ) : null}
        </section>

        {busy ? <p className="hint">{busy}</p> : null}
        {error ? <p className="hint danger-text">{error}</p> : null}

        <section className="home-palace-list" aria-label="宫殿列表">
          {palaces.map((palace) => {
            const filled = filledByPalace.get(palace.id) ?? 0
            const stats = reviewStatsByPalace.get(palace.id)
            const mastery = stats?.masteryRate
            const masteryLabel = mastery === null || mastery === undefined ? '—' : `${Math.round(mastery * 100)}%`
            return (
              <article className="cardbox" key={palace.id}>
                <h2 className="cardbox__title">{palace.title}</h2>
                <p className="hint" style={{ marginTop: 0 }}>
                  {filled}/{LOCUS_COUNT} 个记忆点 · 今日待复习 {stats?.dueCount ?? 0} · 掌握率 {masteryLabel}
                </p>
                <div className="row">
                  <Link className="btn primary" to={`/palace/${palace.id}/review`}>
                    继续背诵
                  </Link>
                  <Link className="btn" to={`/palace/${palace.id}/map`}>
                    自由探索
                  </Link>
                  <Link className="btn" to={`/palace/${palace.id}/quick-import`}>
                    编辑内容
                  </Link>
                  <button className="btn danger" onClick={() => void onDelete(palace)} disabled={busy !== null}>
                    删除
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      </main>
    </div>
  )
}
