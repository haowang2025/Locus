import { parseAttachmentBindings } from './attachmentBindings'
import { initializeSemanticCue } from './palaceSemanticReview'
import { parsePlanProposal } from './palaceProvider'
import { getSceneDefinition } from './sceneRegistry'
import { planToCards } from './palaceStorage'
import type { PalacePlan, PalaceSource } from './palaceTypes'
import type { MpFileV1, UnitRecallProgress } from './types'

function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('备份中的对象字段无效。'); return v as Record<string, unknown> }
function text(v: unknown, name: string, max = 200_000): string { if (typeof v !== 'string' || v.length > max) throw new Error(`备份字段 ${name} 无效或过长。`); return v }
function optionalText(v: unknown, name: string): string | undefined { return v === undefined ? undefined : text(v, name) }
function count(v: unknown, name: string): number | undefined { if (v === undefined) return undefined; if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw new Error(`备份字段 ${name} 必须为非负整数。`); return v }
function timestamp(v: unknown, name: string): string | undefined { const s = optionalText(v, name); if (s !== undefined && (!s || !Number.isFinite(Date.parse(s)))) throw new Error(`备份时间 ${name} 无效。`); return s }
export function safeAssetPath(path: string): boolean { return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(path) && !path.split('/').some(p => p === '.' || p === '..') }
function asset(value: unknown, kind: 'image' | 'model') {
  const raw = object(value), id = text(raw.id, 'asset.id', 200), file = text(raw.file, 'asset.file', 240), mime = text(raw.mime, 'asset.mime', 100)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(id) || !safeAssetPath(file)) throw new Error('备份资产 ID 或路径不安全。')
  const allowed = kind === 'image' ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] : ['model/gltf-binary', 'model/gltf+json']
  if (!allowed.includes(mime)) throw new Error(`不支持备份资源类型 ${mime}。`)
  return { id, file, mime }
}

/** Backup approvals are preserved only after exact source + scene validation. */
export function sanitizeBackupPlan(value: unknown, options: { allowIncompleteDraft?: boolean } = {}): PalacePlan {
  const raw = object(value), source = object(raw.source)
  const sourceData: PalaceSource = { text: text(source.text, 'source.text'), title: text(source.title, 'source.title', 240) }
  if (source.references !== undefined) {
    if (!Array.isArray(source.references) || source.references.length > 20) throw new Error('来源链接数量无效。')
    sourceData.references = source.references.map(v => {
      const ref = object(v), url = new URL(text(ref.url, 'reference.url', 2048))
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('来源链接须为无凭据的 HTTPS 地址。')
      return { title: text(ref.title, 'reference.title', 240), url: url.href }
    })
  }
  const scene = getSceneDefinition(text(raw.sceneId, 'sceneId', 120))
  const generation = object(raw.generation)
  const model = generation.model === undefined ? undefined : text(generation.model, 'model', 200)
  const plan = parsePlanProposal(raw, sourceData, scene, model, { allowIncompleteDraft: options.allowIncompleteDraft, preserveOrdering: true })
  if (!Array.isArray(raw.units) || !Array.isArray(raw.cues)) throw new Error('备份单元或联想无效。')
  const units = raw.units.map(object), cues = raw.cues.map(object)
  plan.units.forEach(u => { u.reviewed = units.find(v => v.id === u.id)?.reviewed === true })
  plan.cues = plan.cues.map(c => {
    const previous = cues.find(v => v.unitId === c.unitId), rawReview = previous?.semanticReview === undefined ? undefined : object(previous.semanticReview)
    const previousChecks = rawReview?.sourceChecks === undefined ? [] : Array.isArray(rawReview.sourceChecks) ? rawReview.sourceChecks.map(object) : []
    if (c.semanticReview) c.semanticReview = { ...c.semanticReview, sourceChecks: c.semanticReview.sourceChecks.map(check => ({ ...check, checked: previousChecks.some(old => old.id === check.id && old.quote === check.quote && JSON.stringify(old.spans) === JSON.stringify(check.spans) && old.checked === true) })), renderedConfirmed: rawReview?.renderedConfirmed === true && previous?.renderedDescription === c.renderedDescription, limitationsConfirmed: rawReview?.limitationsConfirmed === true }
    c.reviewed = previous?.reviewed === true
    return initializeSemanticCue(plan.units.find(u => u.id === c.unitId)!, c, scene.anchors.find(a => a.id === c.anchorId)!, { preserveChecks: true })
  })
  if (generation.mode !== 'offline-rule-based' && generation.mode !== 'model-assisted' && generation.mode !== 'authored-demo' && generation.mode !== 'structured-import') throw new Error('备份生成模式无效。')
  plan.generation = { mode: generation.mode, ...(model ? { model } : {}) }
  plan.createdAt = timestamp(raw.createdAt, 'createdAt') ?? new Date().toISOString()
  return plan
}

export function validateMpManifest(value: unknown): MpFileV1 {
  const raw = object(value)
  if (raw.formatVersion !== 1) throw new Error('不支持此 .mpalace 备份版本。')
  if (raw.templateId !== 'dust2_blockout_v2' && raw.templateId !== 'dust2like_v1') throw new Error('不支持此备份场景模板。')
  const palace = object(raw.palace)
  if (!Array.isArray(raw.cards) || raw.cards.length > 60) throw new Error('备份卡片必须为数组，且不超过 60 张。')
  const plan = palace.mnemonicPlan === undefined ? undefined : sanitizeBackupPlan(palace.mnemonicPlan)
  const canonical = plan ? planToCards('validation', plan, getSceneDefinition(plan.sceneId), { requireReview: false }) : []
  const seen = new Set<string>()
  const cards: MpFileV1['cards'] = raw.cards.map(value => {
    const c = object(value), locusId = text(c.locusId, 'locusId', 8), routeIndex = count(c.routeIndex, 'routeIndex')
    if (!/^L(?:0[1-9]|[1-5][0-9]|60)$/.test(locusId) || routeIndex !== Number(locusId.slice(1)) || seen.has(locusId)) throw new Error('备份地标 ID、顺序或唯一性无效。')
    seen.add(locusId)
    if (!Array.isArray(c.images) || c.images.length > 20) throw new Error('每张卡片最多允许 20 张图片。')
    const confidence = c.confidence
    if (confidence !== undefined && confidence !== 0 && confidence !== 1 && confidence !== 2) throw new Error('复习评分无效。')
    const modelRaw = c.model === undefined ? undefined : object(c.model)
    const model = modelRaw ? asset(modelRaw, 'model') : undefined
    let scale: number | undefined
    if (modelRaw?.scale !== undefined) { if (typeof modelRaw.scale !== 'number' || !Number.isFinite(modelRaw.scale) || modelRaw.scale <= 0 || modelRaw.scale > 100) throw new Error('模型缩放应在 0 到 100 之间。'); scale = modelRaw.scale }
    const answer = text(c.answer ?? '', 'answer')
    const linked = canonical.find(card => card.locusId === locusId)
    if (c.mnemonic !== undefined && !linked) throw new Error('备份联想卡片缺少对应的原文方案。')
    if (linked && answer !== linked.answer) throw new Error('备份卡片答案与原文方案不一致。请先在工作台核对并保存，避免恢复过期事实。')
    let unitProgress: Record<string, UnitRecallProgress> | undefined
    if (c.unitProgress !== undefined) {
      const rawProgress = object(c.unitProgress)
      unitProgress = Object.create(null) as Record<string, UnitRecallProgress>
      for (const [id, value] of Object.entries(rawProgress)) {
        if (!linked?.mnemonic?.unitIds.includes(id)) throw new Error('单元复习进度引用了未知原文单元。')
        const progress = object(value), rating = progress.rating
        if (rating !== 0 && rating !== 1 && rating !== 2) throw new Error('单元复习评分无效。')
        unitProgress[id] = { rating, reviews: count(progress.reviews, 'unit.reviews') ?? 0, updatedAt: timestamp(progress.updatedAt, 'unit.updatedAt') ?? '', nextReviewAt: timestamp(progress.nextReviewAt, 'unit.nextReviewAt'), reveals: count(progress.reveals, 'unit.reveals') }
        if (!unitProgress[id].updatedAt) throw new Error('单元复习时间缺失。')
      }
    }
    const images = c.images.map(v => asset(v, 'image'))
    const attachmentBindings = parseAttachmentBindings(c.attachmentBindings, [...images.map(i => i.id), ...(model ? [model.id] : [])], linked?.mnemonic?.unitIds, linked?.mnemonic?.sourceFingerprint)
    return { ...(attachmentBindings ? { attachmentBindings } : {}), ...(unitProgress ? { unitProgress } : {}), locusId: locusId as `L${string}`, routeIndex, prompt: text(c.prompt ?? '', 'prompt'), answer, note: optionalText(c.note, 'note'), revealedCount: count(c.revealedCount, 'revealedCount'), confidence, lastReviewedAt: timestamp(c.lastReviewedAt, 'lastReviewedAt'), reviewCount: count(c.reviewCount, 'reviewCount'), nextReviewAt: timestamp(c.nextReviewAt, 'nextReviewAt'), images, ...(model ? { model: { ...model, ...(scale === undefined ? {} : { scale }) } } : {}), ...(linked ? { mnemonic: linked.mnemonic } : {}) }
  })
  if (canonical.some(card => !seen.has(card.locusId))) throw new Error('备份缺少原文方案对应的卡片。')
  let unassignedAttachments: MpFileV1['palace']['unassignedAttachments']
  if (palace.unassignedAttachments !== undefined) {
    if (!Array.isArray(palace.unassignedAttachments) || palace.unassignedAttachments.length > 1000) throw new Error('待重新分配附件数量无效。')
    unassignedAttachments = palace.unassignedAttachments.map(value => {
      const item = object(value)
      if (item.kind !== 'image' && item.kind !== 'model') throw new Error('待分配附件类型无效。')
      const entry = asset(item, item.kind), originalLocusId = text(item.originalLocusId, 'originalLocusId', 4)
      if (!/^L(?:0[1-9]|[1-5][0-9]|60)$/.test(originalLocusId) || !Array.isArray(item.unitIds) || item.unitIds.length > 240 || item.unitIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(id))) throw new Error('待分配附件来源无效。')
      const fingerprint = item.sourceFingerprint === undefined ? undefined : text(item.sourceFingerprint, 'sourceFingerprint', 100)
      if (fingerprint !== undefined && !/^fnv1a64-utf16:[0-9]+:[0-9a-f]{16}$/.test(fingerprint)) throw new Error('待分配附件来源指纹无效。')
      if (item.modelScale !== undefined && (typeof item.modelScale !== 'number' || !Number.isFinite(item.modelScale) || item.modelScale <= 0 || item.modelScale > 100)) throw new Error('待分配模型缩放无效。')
      return { ...entry, kind: item.kind, originalLocusId: originalLocusId as `L${string}`, unitIds: item.unitIds as string[], reason: text(item.reason, 'unassigned.reason', 2000), ...(fingerprint ? { sourceFingerprint: fingerprint } : {}), ...(typeof item.modelScale === 'number' ? { modelScale: item.modelScale } : {}) }
    })
  }
  const mapRaw = palace.customMap === undefined ? undefined : object(palace.customMap)
  const map = mapRaw ? { ...asset(mapRaw, 'model'), fileName: text(mapRaw.fileName, 'customMap.fileName', 240), size: count(mapRaw.size, 'customMap.size') ?? 0, importedAt: timestamp(mapRaw.importedAt, 'customMap.importedAt') ?? new Date().toISOString() } : undefined
  return { formatVersion: 1, exportedAt: timestamp(raw.exportedAt, 'exportedAt') ?? new Date().toISOString(), templateId: raw.templateId, palace: { ...(unassignedAttachments ? { unassignedAttachments } : {}), title: text(palace.title ?? '从备份恢复', 'palace.title', 240), ...(plan ? { mnemonicPlan: plan } : {}), ...(map ? { customMap: map } : {}) }, cards }
}
