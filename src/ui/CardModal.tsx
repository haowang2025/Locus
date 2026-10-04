import { useEffect, useMemo, useRef, useState } from 'react'

import { getBlobs, getCards, nowIso, putBlob, upsertCard } from '../lib/db'
import { newId } from '../lib/id'
import { parseAttachmentBindings } from '../lib/attachmentBindings'
import { attachmentBindingKey, initialAttachmentDraft, remapAttachmentDraft, replaceAttachmentBinding, validateAttachmentUpload } from '../lib/attachmentEditor'
import type { AttachmentBinding, BlobId, CardRecord, LocusId, UnassignedAttachment } from '../lib/types'

type ExistingImage = { kind: 'existing'; id: BlobId; mime: string; url: string }
type NewImage = { kind: 'new'; id: string; file: File; url: string }
type ImageItem = ExistingImage | NewImage

type ModelItem = { kind: 'existing'; id: BlobId } | { kind: 'new'; id: string; file: File }
type ModelCandidate = { id: BlobId; locusId: LocusId; routeIndex: number; scale: number }

function makeObjectUrl(blob: Blob) {
  return URL.createObjectURL(blob)
}

export default function CardModal(props: {
  locusId: LocusId
  initialCard: CardRecord
  attachmentsOnly?: boolean
  unassignedAttachments?: UnassignedAttachment[]
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
  const aliveRef = useRef(true)
  const urlsRef = useRef<Set<string>>(new Set())
  const [selectedScope, setSelectedScope] = useState(props.initialCard.mnemonic?.unitIds[0] ?? '')
  const [bindings, setBindings] = useState(() => initialAttachmentDraft(props.initialCard))
  const [unconfirmedCues, setUnconfirmedCues] = useState<Set<string>>(() => new Set())
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const semantic = props.initialCard.mnemonic
  const activeAssetIds = new Set([...images.map(image => image.id), ...(model ? [model.id] : [])])
  const pendingCueKeys = bindings.filter(binding => binding.role === 'cue' && activeAssetIds.has(binding.assetId) && unconfirmedCues.has(attachmentBindingKey(binding))).map(attachmentBindingKey)
  const cueConfirmationNeeded = pendingCueKeys.length > 0

  function scopedBinding(assetId: string, role: AttachmentBinding['role']): AttachmentBinding {
    return { assetId, role, ...(semantic ? selectedScope === '@anchor' ? { scope: 'anchor' as const } : { unitId: selectedScope } : {}), ...(semantic?.sourceFingerprint ? { sourceFingerprint: semantic.sourceFingerprint } : {}) }
  }

  function changeRole(assetId: string, role: AttachmentBinding['role']) {
    const next = scopedBinding(assetId, role)
    setBindings(previous => replaceAttachmentBinding(previous, next))
    setUnconfirmedCues(previous => {
      const result = new Set(previous), key = attachmentBindingKey(next)
      if (role === 'cue') result.add(key)
      else result.delete(key)
      return result
    })
  }

  function roleControl(assetId: string) {
    const target = scopedBinding(assetId, 'reference')
    const exact = bindings.find(binding => attachmentBindingKey(binding) === attachmentBindingKey(target))
    return <label className="field field--stack">
      <span className="field__label">当前范围附件用途</span>
      <select className="field__input" aria-label={`附件 ${assetId} 的用途`} disabled={busy !== null} value={exact?.role ?? ''} onChange={event => changeRole(assetId, event.target.value as AttachmentBinding['role'])}>
        <option value="" disabled>未明确绑定当前范围</option>
        <option value="reference">答案参考（揭晓后显示）</option>
        <option value="cue" disabled={!!semantic && !semantic.sourceFingerprint}>记忆线索（揭晓前显示）</option>
      </select>
      {!exact && <span className="hint">整个地标的绑定仍可能适用；请明确指定当前单元用途。</span>}
    </label>
  }


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
      setImagesLoaded(true)
    }
    void load().catch(error => { if (!cancelled) setError(`附件读取失败：${error instanceof Error ? error.message : String(error)}`) })
    return () => {
      cancelled = true
    }
  }, [existingImageIds])

  useEffect(() => {
    const urls = urlsRef.current
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
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

  async function onAddFiles(files: FileList | null) {
    if (!files || files.length === 0 || busy) return
    setBusy('检查图片安全尺寸…'); setError(null)
    try {
      const selected = Array.from(files)
      for (const file of selected) await validateAttachmentUpload(file, 'image')
      if (!aliveRef.current) return
      const next: ImageItem[] = selected.map(file => {
        const url = makeObjectUrl(file)
        urlsRef.current.add(url)
        return { kind: 'new', id: newId('img'), file, url }
      })
      setImages(previous => [...previous, ...next])
      setBindings(previous => next.reduce((result, item) => replaceAttachmentBinding(result, scopedBinding(item.id, 'reference')), previous))
    } catch (error) {
      if (aliveRef.current) setError(error instanceof Error ? error.message : String(error))
    } finally { if (aliveRef.current) setBusy(null) }
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

  async function onSelectModel(file: File | null) {
    if (!file || busy) return
    setBusy('检查模型附件…'); setError(null)
    try {
      await validateAttachmentUpload(file, 'model')
      if (!aliveRef.current) return
      const id = newId('draft_model')
      setModel({ kind: 'new', id, file })
      changeRole(id, 'reference')
    } catch (error) {
      if (aliveRef.current) setError(error instanceof Error ? error.message : String(error))
    } finally { if (aliveRef.current) setBusy(null) }
  }

  function onRemoveModel() {
    setModel(null)
  }

  function onChooseExistingModel(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setModel({ kind: 'existing', id: trimmed })
    if (trimmed !== model?.id) changeRole(trimmed, 'reference')
    const candidate = modelCandidates.find((c) => c.id === trimmed)
    if (candidate) setModelScaleDraft(String(candidate.scale ?? 1))
    setError(null)
  }

  async function choosePreservedAttachment(item: UnassignedAttachment) {
    if (busy || !imagesLoaded) return
    setBusy('读取保留附件…'); setError(null)
    try {
      const blob = (await getBlobs([item.blobId]))[0]
      if (!blob) throw new Error('保留附件文件缺失，请从原备份恢复。')
      await validateAttachmentUpload(new Blob([blob.data], { type: blob.mime }), item.kind)
      if (!aliveRef.current) return
      if (item.kind === 'image') {
        if (!images.some(image => image.id === item.blobId)) {
          const url = makeObjectUrl(blob.data)
          urlsRef.current.add(url)
          setImages(previous => [...previous, { kind: 'existing', id: item.blobId, mime: blob.mime, url }])
        }
      } else {
        setModel({ kind: 'existing', id: item.blobId })
        setModelScaleDraft(String(item.modelScale ?? 1))
      }
      changeRole(item.blobId, 'reference')
    } catch (error) {
      if (aliveRef.current) setError(error instanceof Error ? error.message : String(error))
    } finally { if (aliveRef.current) setBusy(null) }
  }

  async function onSave() {
    if (cueConfirmationNeeded || !imagesLoaded || busy) return
    setError(null)
    setBusy('保存中…')
    try {
      const draftAssets = new Map([...activeAssetIds].map(id => [id, id]))
      parseAttachmentBindings(remapAttachmentDraft(bindings, draftAssets), [...activeAssetIds], semantic?.unitIds, semantic?.sourceFingerprint)
      const assetMap = new Map<string, string>()
      const existingIds: BlobId[] = images.filter((x) => x.kind === 'existing').map((x) => x.id)
      for (const id of existingIds) assetMap.set(id, id)
      const newFiles = images.filter((x) => x.kind === 'new')

      const newIds: BlobId[] = []
      for (const item of newFiles) {
        const id = newId('blob')
        newIds.push(id)
        assetMap.set(item.id, id)
        await putBlob({ id, mime: item.file.type || 'application/octet-stream', data: item.file, createdAt: nowIso() })
      }

      let modelId: BlobId | undefined
      if (model?.kind === 'existing') {
        modelId = model.id
        assetMap.set(model.id, model.id)
      } else if (model?.kind === 'new') {
        const id = newId('model')
        modelId = id
        assetMap.set(model.id, id)
        await putBlob({ id, mime: model.file.type || 'model/gltf-binary', data: model.file, createdAt: nowIso() })
      }

      const parsedScale = Number.parseFloat(modelScaleDraft)
      const modelScale = Number.isFinite(parsedScale) ? Math.max(0.05, Math.min(10, parsedScale)) : 1

      const trimmedPrompt = prompt.trim()
      const trimmedAnswer = answer.trim()
      const trimmedNote = note.trim()

      const next: CardRecord = {
        ...props.initialCard,
        prompt: props.attachmentsOnly ? props.initialCard.prompt : trimmedPrompt,
        answer: props.attachmentsOnly ? props.initialCard.answer : trimmedAnswer,
        note: props.attachmentsOnly ? props.initialCard.note : trimmedNote ? trimmedNote : undefined,
        attachmentBindings: parseAttachmentBindings(remapAttachmentDraft(bindings, assetMap), [...assetMap.values()], semantic?.unitIds, semantic?.sourceFingerprint),
        imageIds: [...existingIds, ...newIds],
        modelId: modelId,
        modelScale: modelId ? modelScale : undefined,
        revealedCount: props.attachmentsOnly ? props.initialCard.revealedCount : revealedCount,
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
          {props.attachmentsOnly && <p className="hint">仅编辑附件，原文、问题和答案保持不变。默认作为揭晓后参考资料。</p>}
          {semantic && <label className="field field--stack"><span className="field__label">附件绑定范围</span><select className="field__input" disabled={busy !== null} value={selectedScope} onChange={event => setSelectedScope(event.target.value)}>{semantic.unitIds.map((id, index) => <option key={id} value={id}>含义单元 {index + 1} · {id}</option>)}<option value="@anchor">整个地标（所有含义单元）</option></select><span className="hint">各单元独立设置，单元专属绑定优先于整个地标绑定。整个地标的线索可能在所有单元揭晓前显示，请勿包含任何单元的答案。</span></label>}
          {!!props.unassignedAttachments?.length && <details><summary>重新绑定保留的附件（{props.unassignedAttachments.length}）</summary><p className="hint">以下文件未被自动匹配到新材料。选择后默认作为当前范围的答案参考；原附件记录仍会保留。</p>{props.unassignedAttachments.map((item, index) => <div key={`${item.blobId}:${index}`} className="field field--stack"><span>{item.kind === 'image' ? '图片' : '模型'} · {item.originalLocusId} · {item.blobId}</span><span className="hint">{item.reason}</span><button className="btn" disabled={busy !== null || !imagesLoaded} onClick={() => void choosePreservedAttachment(item)}>作为答案参考重新绑定</button></div>)}</details>}
          {!props.attachmentsOnly && <>

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

          </>}

          <div className="field field--stack">
            <span className="field__label">图片（可选）</span>
            <div className="row">
              <label className="btn file">
                添加图片
                <input type="file" accept="image/*" disabled={!imagesLoaded || busy !== null} multiple onChange={(e) => { void onAddFiles(e.target.files); e.currentTarget.value = '' }} />
              </label>
            </div>
            {images.length > 0 ? (
              <div className="image-grid">
                {images.map((img) => (
                  <div className="image-grid__item" key={img.id}>
                    <img className="image-grid__img" src={img.url} alt="" />
                    {roleControl(img.id)}
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
                  disabled={busy !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    e.currentTarget.value = ''
                    void onSelectModel(f)
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
            {model && roleControl(model.id)}
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

          {cueConfirmationNeeded && <label className="field field--stack" style={{ padding: 12, border: '2px solid #b97825', borderRadius: 8 }}><span>线索会在答案揭晓前显示。我已检查新增或修改的线索，不包含当前单元或其他单元的答案；整个地标线索对所有单元均安全。</span><span><input type="checkbox" checked={false} onChange={event => { if (event.target.checked) setUnconfirmedCues(previous => new Set([...previous].filter(key => !pendingCueKeys.includes(key)))) }} /> 我确认以上线索用途</span></label>}
          {!imagesLoaded && <p className="hint">正在读取现有附件，读取完成后可保存。</p>}
          {error ? <p className="hint danger-text">{error}</p> : null}
          {busy ? <p className="hint">{busy}</p> : null}
        </div>

        <div className="modal__footer">
          <button className="btn primary" onClick={() => void onSave()} disabled={busy !== null || !imagesLoaded || cueConfirmationNeeded}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
