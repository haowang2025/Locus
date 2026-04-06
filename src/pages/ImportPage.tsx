import Papa from 'papaparse'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { getPalace, nowIso, replaceCards } from '../lib/db'
import { locusIdFromRouteIndex, LOCUS_COUNT } from '../lib/loci'
import type { CardRecord, PalaceRecord } from '../lib/types'

type ImportMode = 'lines' | 'csv'

function parseLines(text: string): Array<{ prompt: string; answer: string; note?: string }> {
  const rows: Array<{ prompt: string; answer: string; note?: string }> = []
  const lines = text
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    const tabParts = line.split('\t')
    if (tabParts.length >= 2) {
      const prompt = tabParts[0] ?? ''
      const answer = tabParts.slice(1).join('\t')
      rows.push({ prompt, answer })
      continue
    }

    // Default (recommended): each line is the content to memorize (Answer).
    rows.push({ prompt: '', answer: line })
  }

  return rows
}

function normalizeImportedRows(rows: Array<{ prompt?: unknown; answer?: unknown; note?: unknown }>) {
  return rows
    .map((r) => ({
      prompt: String(r.prompt ?? '').trim(),
      answer: String(r.answer ?? '').trim(),
      note: String(r.note ?? '').trim(),
    }))
    .filter((r) => r.prompt || r.answer || r.note)
}

function parseCsv(text: string): Array<{ prompt: string; answer: string; note?: string }> {
  const withHeader = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  if (withHeader.data.length > 0 && withHeader.meta.fields?.length) {
    const fields = withHeader.meta.fields.map((f) => f.toLowerCase())
    const hasPrompt = fields.includes('prompt') || fields.includes('question') || fields.includes('q')
    const hasAnswer = fields.includes('answer') || fields.includes('a')

    if (hasPrompt || hasAnswer) {
      const normalized = withHeader.data.map((row) => ({
        prompt: (row as any).prompt ?? (row as any).question ?? (row as any).q,
        answer: (row as any).answer ?? (row as any).a,
        note: (row as any).note,
      }))
      return normalizeImportedRows(normalized)
    }
  }

  const noHeader = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
  const rows = (noHeader.data as string[][]).map((cols) => ({
    prompt: cols.length >= 2 ? cols[0] : '',
    answer: cols.length >= 2 ? cols[1] : cols[0],
    note: cols[2],
  }))
  return normalizeImportedRows(rows)
}

function rowsToCards(palaceId: string, rows: Array<{ prompt: string; answer: string; note?: string }>): CardRecord[] {
  const now = nowIso()
  const limited = rows.slice(0, LOCUS_COUNT)
  return limited.map((row, i) => {
    const routeIndex = i + 1
    const answer = row.answer
    const snippet = answer.length > 18 ? `${answer.slice(0, 18)}…` : answer
    const prompt = row.prompt.trim() ? row.prompt : `第${routeIndex}条 · ${snippet}`
    return {
      palaceId,
      locusId: locusIdFromRouteIndex(routeIndex),
      routeIndex,
      prompt,
      answer,
      note: row.note ? row.note : undefined,
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

export default function ImportPage() {
  const navigate = useNavigate()
  const { palaceId } = useParams<{ palaceId: string }>()
  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [mode, setMode] = useState<ImportMode>('lines')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!palaceId) return
    let alive = true
    void (async () => {
      const p = await getPalace(palaceId)
      if (!alive) return
      setPalace(p ?? null)
    })()
    return () => {
      alive = false
    }
  }, [palaceId])

  const { preview, parseError } = useMemo(() => {
    try {
      const rows = mode === 'csv' ? parseCsv(text) : parseLines(text)
      if (!palaceId) return { preview: [] as CardRecord[], parseError: '缺少 palaceId 参数' }
      return { preview: rowsToCards(palaceId, rows), parseError: null as string | null }
    } catch (e) {
      return {
        preview: [] as CardRecord[],
        parseError: e instanceof Error ? e.message : String(e),
      }
    }
  }, [mode, palaceId, text])

  async function onImport() {
    setActionError(null)
    if (!palaceId) {
      setActionError('缺少 palaceId 参数')
      return
    }
    if (preview.length === 0) {
      setActionError(parseError ?? '没有可导入的内容')
      return
    }
    const ok = confirm(`导入将覆盖该宫殿的卡片（最多 ${LOCUS_COUNT} 条），确定？`)
    if (!ok) return

    setBusy('导入中…')
    try {
      await replaceCards(palaceId, preview)
      navigate(`/palace/${palaceId}/map`)
    } finally {
      setBusy(null)
    }
  }

  if (!palaceId) {
    return (
      <div className="page">
        <header className="page__header">
          <h1 className="page__title">导入</h1>
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
        <h1 className="page__title">导入</h1>
        <p className="hint">支持逐行文本与 CSV（离线本地，不上传）。</p>
        <p className="hint">宫殿：{palace?.title ?? palaceId}</p>
      </header>

      <main className="page__body">
        <section className="cardbox">
          <div className="row">
            <label className="chip">
              <input type="radio" checked={mode === 'lines'} onChange={() => setMode('lines')} /> 逐行
            </label>
            <label className="chip">
              <input type="radio" checked={mode === 'csv'} onChange={() => setMode('csv')} /> CSV
            </label>
          </div>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === 'lines'
                ? '每行一条：answer（推荐） 或 prompt<TAB>answer（最多 60 行）'
                : 'CSV：列名 prompt,answer,note（或：第一列 answer；前两列 prompt/answer）'
            }
          />
          <p className="hint">
            预览：{preview.length}/{LOCUS_COUNT}
            {preview.length > 0 ? ` · 第 1 条：${preview[0]?.answer?.slice(0, 40) ?? ''}` : ''}
          </p>
          {parseError ? <p className="hint danger-text">{parseError}</p> : null}
          {actionError ? <p className="hint danger-text">{actionError}</p> : null}
          <div className="row">
            <button className="btn primary" onClick={() => void onImport()} disabled={busy !== null}>
              覆盖导入
            </button>
            <Link className="btn" to={`/palace/${palaceId}/map`} aria-disabled={busy !== null}>
              返回地图
            </Link>
            <Link className="btn" to="/" aria-disabled={busy !== null}>
              返回首页
            </Link>
          </div>
          {busy ? <p className="hint">{busy}</p> : null}
        </section>
      </main>
    </div>
  )
}
