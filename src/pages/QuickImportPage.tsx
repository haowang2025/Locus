import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getCards, getPalace, nowIso, replaceCards } from '../lib/db'
import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import type { CardRecord, PalaceRecord } from '../lib/types'

function parseBulkLines(text: string): string[] {
  return text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function buildCardsFromLines(palaceId: string, lines: string[]): CardRecord[] {
  const now = nowIso()
  return lines.slice(0, LOCUS_COUNT).map((line, i) => {
    const routeIndex = i + 1
    const locusId = locusIdFromRouteIndex(routeIndex)
    const snippet = line.length > 18 ? `${line.slice(0, 18)}…` : line
    return {
      palaceId,
      locusId,
      routeIndex,
      prompt: `第${routeIndex}条 · ${snippet}`,
      answer: line,
      note: undefined,
      imageIds: [],
      modelId: undefined,
      modelScale: undefined,
      confidence: undefined,
      lastReviewedAt: undefined,
      reviewCount: undefined,
      nextReviewAt: undefined,
      revealedCount: 0,
      updatedAt: now,
    }
  })
}

export default function QuickImportPage() {
  const navigate = useNavigate()
  const { palaceId } = useParams<{ palaceId: string }>()
  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [filledCount, setFilledCount] = useState(0)
  const [bulkText, setBulkText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bulkLines = useMemo(() => parseBulkLines(bulkText), [bulkText])

  useEffect(() => {
    if (!palaceId) return
    let alive = true
    void (async () => {
      try {
        const p = await getPalace(palaceId)
        if (!alive) return
        if (!p) {
          setError('宫殿不存在或已删除')
          setPalace(null)
          return
        }
        setPalace(p)
        const cards = await getCards(palaceId)
        if (!alive) return
        setFilledCount(cards.length)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [palaceId])

  async function onApplyBulk() {
    if (!palaceId) return
    const lines = bulkLines.slice(0, LOCUS_COUNT)
    if (lines.length === 0) {
      setError('请先粘贴内容（每行一条）')
      return
    }

    const ok = confirm(`将把前 ${lines.length} 行映射到 L01..，并覆盖该宫殿的现有卡片，确定？`)
    if (!ok) return

    setBusy('生成中…')
    setError(null)
    try {
      await replaceCards(palaceId, buildCardsFromLines(palaceId, lines))
      setBulkText('')
      navigate(`/palace/${palaceId}/map`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!palaceId) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">快速输入</h1>
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
        <h1 className="page__title">快速输入</h1>
        <p className="hint">
          宫殿：{palace?.title ?? palaceId} · 当前 {filledCount}/{LOCUS_COUNT}
        </p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <h2 className="cardbox__title">每行一条</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            把要记忆的内容按顺序粘贴进来：第 1 行 → L01，第 2 行 → L02…（最多 60 行）。
          </p>
          <textarea
            className="textarea"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'示例：\n第一条要记忆的内容\n第二条要记忆的内容\n…'}
          />
          <p className="hint">
            已识别 {Math.min(bulkLines.length, LOCUS_COUNT)}/{LOCUS_COUNT} 行
          </p>
          {error ? <p className="hint danger-text">{error}</p> : null}
          {busy ? <p className="hint">{busy}</p> : null}
          <div className="row">
            <button className="btn primary" onClick={() => void onApplyBulk()} disabled={busy !== null}>
              覆盖生成
            </button>
            <Link className="btn" to={`/palace/${palaceId}/import`} aria-disabled={busy !== null}>
              高级导入
            </Link>
            <Link className="btn" to={`/palace/${palaceId}/map`} aria-disabled={busy !== null}>
              返回地图
            </Link>
            <Link className="btn" to="/" aria-disabled={busy !== null}>
              返回首页
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
