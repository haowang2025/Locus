import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createPalace, deletePalace, getBlobs, getCards, listPalaces } from '../lib/db'
import { importMpFileAsNewPalace } from '../lib/backupImport'
import { buildMpFileV1 } from '../lib/mpalace'
import { LOCUS_COUNT } from '../lib/loci'
import { exportFile } from '../lib/exportFile'
import { computePalaceReviewStats, type PalaceReviewStats } from '../lib/review'
import { getGlobalStreak } from '../lib/streak'
import type { CardRecord, PalaceRecord, TemplateId } from '../lib/types'

function isFilled(card: CardRecord) {
  return Boolean(card.prompt.trim() || card.answer.trim() || card.note?.trim() || card.imageIds.length > 0 || card.modelId)
}

function templateLabel(templateId: TemplateId) {
  if (templateId === 'dust2_blockout_v2') return 'Dust2 灰盒 v2'
  if (templateId === 'dust2like_v1') return 'Dust2Like v1'
  return templateId
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
        list.map(async (p) => {
          const cards = await getCards(p.id)
          const filled = cards.filter(isFilled).length
          const stats = computePalaceReviewStats(p.id, cards, now)
          return { palace: p, filled, stats }
        }),
      )

      const filledMap = new Map(entries.map((e) => [e.palace.id, e.filled] as const))
      const statsMap = new Map(entries.map((e) => [e.palace.id, e.stats] as const))
      const sortedPalaces = entries
        .slice()
        .sort((a, b) => {
          // Due first.
          const aDue = a.stats.dueCount > 0
          const bDue = b.stats.dueCount > 0
          if (aDue !== bDue) return aDue ? -1 : 1
          // More due first.
          if (a.stats.dueCount !== b.stats.dueCount) return b.stats.dueCount - a.stats.dueCount
          // Older last-reviewed first.
          const aLast = a.stats.lastReviewedAt ?? ''
          const bLast = b.stats.lastReviewedAt ?? ''
          if (aLast !== bLast) return aLast < bLast ? -1 : 1
          // Fallback: most recently updated first.
          return a.palace.updatedAt < b.palace.updatedAt ? 1 : -1
        })
        .map((e) => e.palace)

      setPalaces(sortedPalaces)
      setFilledByPalace(filledMap)
      setReviewStatsByPalace(statsMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const palaceCount = palaces.length

  async function onCreate() {
    const title = prompt('新建宫殿标题（可稍后修改）', `宫殿 ${palaceCount + 1}`)
    if (title === null) return
    setBusy('新建中…')
    setError(null)
    try {
      const created = await createPalace(title || '未命名宫殿')
      await reload()
      navigate(`/palace/${created.id}/import`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onDelete(palace: PalaceRecord) {
    const ok = confirm(`删除宫殿「${palace.title}」？其卡片将被删除（图片文件不会立刻清理）。`)
    if (!ok) return
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

  async function onExport(palace: PalaceRecord) {
    setBusy('导出中…')
    setError(null)
    try {
      const cards = await getCards(palace.id)
      const blobIds = Array.from(new Set(cards.flatMap((c) => (c.modelId ? [...c.imageIds, c.modelId] : c.imageIds))))
      const blobs = await getBlobs(blobIds)
      const { fileName, blob } = await buildMpFileV1({ palace, cards, blobs })
      await exportFile({ fileName, blob, dialogTitle: '导出 .mpalace' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRestoreFromBackup(file: File) {
    setBusy('恢复中…')
    setError(null)
    try {
      const ok = confirm('将从备份创建一个新宫殿并导入卡片与图片，确定？')
      if (!ok) return

      const created = await importMpFileAsNewPalace(file)
      await reload()
      navigate(`/palace/${created.id}/map`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1 className="page__title">记忆宫殿</h1>
        <p className="hint">
          连胜 {getGlobalStreak().streakDays} 天 · {palaceCount} 个宫殿 · 离线本地存储
        </p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <h2 className="cardbox__title">今日复习</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            一键进入今日队列（优先选择最该复习的宫殿）。
          </p>
          <div className="row">
            <Link className="btn primary" to="/today" aria-disabled={busy !== null}>
              今日复习
            </Link>
          </div>
        </section>

        <section className="cardbox">
          <h2 className="cardbox__title">宫殿列表</h2>
          <div className="row">
            <button className="btn primary" onClick={() => void onCreate()} disabled={busy !== null}>
              + 新建宫殿
            </button>
          </div>
          {busy ? <p className="hint">{busy}</p> : null}
          {error ? <p className="hint danger-text">{error}</p> : null}
          {palaces.length === 0 && busy === null ? <p className="hint">暂无宫殿。点击“新建宫殿”开始。</p> : null}
        </section>

        {palaces.map((p) => {
          const filled = filledByPalace.get(p.id) ?? 0
          const stats = reviewStatsByPalace.get(p.id)
          const dueCount = stats?.dueCount ?? 0
          const mastery = stats?.masteryRate
          const masteryLabel = mastery === null || mastery === undefined ? '—' : `${Math.round(mastery * 100)}%`
          const lastReviewed = stats?.lastReviewedAt ? new Date(stats.lastReviewedAt).toLocaleString() : '从未'
          return (
            <section className="cardbox" key={p.id}>
              <h2 className="cardbox__title">{p.title}</h2>
              <p className="hint" style={{ marginTop: 0 }}>
                模板：{templateLabel(p.templateId)} · 卡片：{filled}/{LOCUS_COUNT} · 今日待复习：{dueCount} · 掌握率：{masteryLabel} · 上次复习：{lastReviewed}
                {p.customMap ? ` · 地图：${p.customMap.fileName}` : ' · 地图：内置'}
              </p>
              <div className="row">
                <Link className="btn primary" to={`/palace/${p.id}/review`} aria-disabled={busy !== null}>
                  开始复习
                </Link>
                <button className="btn" onClick={() => navigate(`/palace/${p.id}/map`)} disabled={busy !== null}>
                  进入探索
                </button>
                <Link className="btn" to={`/palace/${p.id}/quick-import`} aria-disabled={busy !== null}>
                  快速输入
                </Link>
                <Link className="btn" to={`/palace/${p.id}/import`} aria-disabled={busy !== null}>
                  高级导入
                </Link>
              </div>
              <div className="row">
                <button className="btn" onClick={() => void onExport(p)} disabled={busy !== null || filled === 0}>
                  导出备份 (.mpalace)
                </button>
                <Link className="btn" to={`/palace/${p.id}/transfer`} aria-disabled={busy !== null}>
                  扫码传输
                </Link>
                <button className="btn danger" onClick={() => void onDelete(p)} disabled={busy !== null}>
                  删除
                </button>
              </div>
            </section>
          )
        })}

        <section className="cardbox">
          <h2 className="cardbox__title">从备份恢复</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            选择 `.mpalace` 文件后，会创建一个新宫殿并导入（不会覆盖已有宫殿）。
          </p>
          <div className="row">
            <label className="btn file" aria-disabled={busy !== null}>
              选择 .mpalace
              <input
                type="file"
                accept=".mpalace"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.currentTarget.value = ''
                  if (f) void onRestoreFromBackup(f)
                }}
              />
            </label>
            <Link className="btn" to="/transfer/receive" aria-disabled={busy !== null}>
              扫码接收
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
