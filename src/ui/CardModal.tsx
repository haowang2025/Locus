import { useEffect, useMemo, useRef, useState } from 'react'

import { getBlobs, getCards, nowIso, putBlob, upsertCard } from '../lib/db'
import { newId } from '../lib/id'
import type { BlobId, CardRecord, LocusId } from '../lib/types'

type ExistingImage = { kind: 'existing'; id: BlobId; mime: string; url: string }
type NewImage = { kind: 'new'; id: string; file: File; url: string }
type ImageItem = ExistingImage | NewImage

type ModelItem = { kind: 'existing'; id: BlobId } | { kind: 'new'; file: File }
type ModelCandidate = { id: BlobId; locusId: LocusId; routeIndex: number; scale: number }

function makeObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob)
}

export default function CardModal(props: {
  locusId: LocusId
  initialCard: CardRecord
  onClose: () => void
  onSaved?: (card: CardRecord) => void
}) {
  const [prompt, setPrompt] = useState(props.initialCard.prompt)
  const [answer, setAnswer] = useState(props.initialCard.answer)
  const [note, setNote] = useState(props.initialCard.note ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [revealedCount, setRevealedCount] = useState(props.initialCard.revealedCount ?? 0)
  const [images, setImages] = useState<ImageItem[]>([])
  const [model, setModel] = useState<ModelItem | null>(() =>
    props.initialCard.modelId ? { kind: 'existing', id: props.initialCard.modelId } : null,
  )
  const [modelScaleDraft, setModelScaleDraft] = useState(() => String(props.initialCard.modelScale ?? 1))
  const [modelCandidates, setModelCandidates] = useState<ModelCandidate[]>([])
  const urlsRef = useRef<Set<string>>(new Set())

  const existingImageIds = useMemo(() => props.initialCard.imageIds, [props.initialCard.imageIds])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const blobs = await getBlobs(existingImageIds)
      if (cancelled) return
      const items: ExistingImage[] = blobs.map((b) => ({
        kind: 'existing',
        id: b.id,
        mime: b.mime,
        url: (() => {
          const url = makeObjectUrl(b.data)
          urlsRef.current.add(url)
          return url
        })(),
      }))
      setImages(items)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [existingImageIds])

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cards = await getCards(props.initialCard.palaceId)
        if (cancelled) return
        const byModelId = new Map<BlobId, ModelCandidate>()
        for (const c of cards) {
          if (!c.modelId) continue
          if (byModelId.has(c.modelId)) continue
          byModelId.set(c.modelId, {
            id: c.modelId,
            locusId: c.locusId,
            routeIndex: c.routeIndex,
            scale: c.modelScale ?? 1,
          })
        }
        setModelCandidates(Array.from(byModelId.values()).sort((a, b) => a.routeIndex - b.routeIndex))
      } catch {
        if (!cancelled) setModelCandidates([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.initialCard.palaceId])

  function onAddFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const next: ImageItem[] = []
    for (const f of Array.from(files)) {
      const url = makeObjectUrl(f)
      urlsRef.current.add(url)
      next.push({ kind: 'new', id: newId('img'), file: f, url })
    }
    setImages((prev) => [...prev, ...next])
  }

  function onRemoveImage(id: string) {
    setImages((prev) => {
      const found = prev.find((x) => x.id === id)
      if (found) {
        URL.revokeObjectURL(found.url)
        urlsRef.current.delete(found.url)
      }
      return prev.filter((x) => x.id !== id)
    })
  }

  function onSelectModel(file: File | null) {
    if (!file) return
    setModel({ kind: 'new', file })
    setError(null)
  }

  function onRemoveModel() {
    setModel(null)
  }

  function onChooseExistingModel(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setModel({ kind: 'existing', id: trimmed })
    const candidate = modelCandidates.find((c) => c.id === trimmed)
    if (candidate) setModelScaleDraft(String(candidate.scale ?? 1))
    setError(null)
  }

  async function onSave() {
    setError(null)
    setBusy('保存中…')
    try {
      const existingIds: BlobId[] = images.filter((x) => x.kind === 'existing').map((x) => x.id)
      const newFiles = images.filter((x) => x.kind === 'new')

      const newIds: BlobId[] = []
      for (const item of newFiles) {
        const id = newId('blob')
        newIds.push(id)
        await putBlob({ id, mime: item.file.type || 'application/octet-stream', data: item.file, createdAt: nowIso() })
      }

      let modelId: BlobId | undefined
      if (model?.kind === 'existing') {
        modelId = model.id
      } else if (model?.kind === 'new') {
        const id = newId('model')
        modelId = id
        await putBlob({ id, mime: model.file.type || 'model/gltf-binary', data: model.file, createdAt: nowIso() })
      }

      const parsedScale = Number.parseFloat(modelScaleDraft)
      const modelScale = Number.isFinite(parsedScale) ? Math.max(0.05, Math.min(10, parsedScale)) : 1

      const trimmedPrompt = prompt.trim()
      const trimmedAnswer = answer.trim()
      const trimmedNote = note.trim()

      const next: CardRecord = {
        ...props.initialCard,
        prompt: trimmedPrompt,
        answer: trimmedAnswer,
        note: trimmedNote ? trimmedNote : undefined,
        imageIds: [...existingIds, ...newIds],
        modelId: modelId,
        modelScale: modelId ? modelScale : undefined,
        revealedCount,
        updatedAt: nowIso(),
      }

      await upsertCard(next)
      props.onSaved?.(next)
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRevealAnswer() {
    if (showAnswer) {
      setShowAnswer(false)
      return
    }
    setShowAnswer(true)
    const nextCount = revealedCount + 1
    setRevealedCount(nextCount)
    try {
      const next: CardRecord = {
        ...props.initialCard,
        updatedAt: nowIso(),
        revealedCount: nextCount,
      }
      await upsertCard(next)
      props.onSaved?.(next)
    } catch {
      // best-effort; ignore
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={props.onClose} />
      <div className="modal__panel">
        <div className="modal__header">
          <div className="modal__title">点位 {props.locusId}</div>
          <button className="btn" onClick={props.onClose}>
            关闭
          </button>
        </div>

        <div className="modal__body">
          <label className="field field--stack">
            <span className="field__label">Prompt</span>
            <textarea className="textarea textarea--small" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>

          <label className="field field--stack">
            <span className="field__label">Answer</span>
            <div className="row">
              <button className="btn" onClick={() => void onRevealAnswer()}>
                {showAnswer ? '隐藏答案' : '显示答案'}
              </button>
              <span className="hint">已揭示 {revealedCount} 次</span>
            </div>
            {showAnswer ? (
              <textarea className="textarea textarea--small" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            ) : (
              <div className="answer-locked">答案已隐藏</div>
            )}
          </label>

          <label className="field field--stack">
            <span className="field__label">Note（可选）</span>
            <textarea className="textarea textarea--small" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <div className="field field--stack">
            <span className="field__label">图片（可选）</span>
            <div className="row">
              <label className="btn file">
                添加图片
                <input type="file" accept="image/*" multiple onChange={(e) => onAddFiles(e.target.files)} />
              </label>
            </div>
            {images.length > 0 ? (
              <div className="image-grid">
                {images.map((img) => (
                  <div className="image-grid__item" key={img.id}>
                    <img className="image-grid__img" src={img.url} alt="" />
                    <button className="btn danger image-grid__remove" onClick={() => onRemoveImage(img.id)}>
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">暂无图片</p>
            )}
          </div>

          <div className="field field--stack">
            <span className="field__label">3D 模型（可选）</span>
            <div className="row">
              <label className="btn file">
                上传 .glb
                <input
                  type="file"
                  accept=".glb,model/gltf-binary"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.currentTarget.value = ''
                    onSelectModel(f)
                  }}
                />
              </label>
              {model ? (
                <button className="btn danger" onClick={onRemoveModel}>
                  移除
                </button>
              ) : null}
            </div>
            <label className="field">
              <span className="field__label">从库选择</span>
              <select
                className="field__input"
                value={model?.kind === 'existing' ? model.id : ''}
                onChange={(e) => onChooseExistingModel(e.target.value)}
              >
                <option value="">（选择已上传模型）</option>
                {modelCandidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.locusId} · {m.id}
                  </option>
                ))}
              </select>
            </label>
            {modelCandidates.length === 0 ? <p className="hint">模型库为空：上传一个 .glb 后即可在其它点位复用。</p> : null}
            {model?.kind === 'existing' ? (
              <p className="hint">当前：{model.id}</p>
            ) : model?.kind === 'new' ? (
              <p className="hint">
                当前：{model.file.name || 'model.glb'} · {Math.round((model.file.size / 1024 / 1024) * 10) / 10}MB
              </p>
            ) : (
              <p className="hint">暂无模型</p>
            )}
            {model ? (
              <label className="field">
                <span className="field__label">缩放</span>
                <input
                  className="field__input"
                  type="number"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={modelScaleDraft}
                  onChange={(e) => setModelScaleDraft(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          {error ? <p className="hint danger-text">{error}</p> : null}
          {busy ? <p className="hint">{busy}</p> : null}
        </div>

        <div className="modal__footer">
          <button className="btn primary" onClick={() => void onSave()} disabled={busy !== null}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
