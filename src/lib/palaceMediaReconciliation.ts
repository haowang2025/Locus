import type { AttachmentBinding, CardRecord, PalaceRecord, UnassignedAttachment } from './types'
import type { PalacePlan } from './palaceTypes'
import { sourceFingerprint } from './palaceModelProposal'

/** Preserve uploaded bytes and exact unit mappings; ambiguity is kept for explicit reassignment. */
export function reconcilePalaceMedia(palace: PalaceRecord, oldCards: CardRecord[], newCards: CardRecord[], plan: PalacePlan): { cards: CardRecord[]; unassignedAttachments: UnassignedAttachment[] } {
  const cards = structuredClone(newCards), unassignedAttachments = structuredClone(palace.unassignedAttachments ?? [])
  const prior = palace.mnemonicPlan, fingerprint = sourceFingerprint(plan.source)
  const unchanged = !!prior && sourceFingerprint(prior.source) === fingerprint
  const validUnits = new Set(plan.units.filter(unit => prior?.units.some(old => old.id === unit.id && old.facts === unit.facts && JSON.stringify(old.spans) === JSON.stringify(unit.spans))).map(unit => unit.id))
  const models = new Map<CardRecord, Array<{ id: string; scale?: number; old: CardRecord; bindings: AttachmentBinding[] }>>()
  const archive = (old: CardRecord, id: string, kind: 'image' | 'model', reason: string) => {
    if (unassignedAttachments.some(item => item.blobId === id && item.originalLocusId === old.locusId && item.sourceFingerprint === (prior ? sourceFingerprint(prior.source) : undefined))) return
    unassignedAttachments.push({ blobId: id, kind, ...(kind === 'model' && old.modelScale ? { modelScale: old.modelScale } : {}), originalLocusId: old.locusId, unitIds: old.mnemonic?.unitIds ?? [], ...(prior ? { sourceFingerprint: sourceFingerprint(prior.source) } : {}), reason })
  }
  for (const old of oldCards) for (const id of [...old.imageIds, ...(old.modelId ? [old.modelId] : [])]) {
    const kind = id === old.modelId ? 'model' : 'image'
    if (!unchanged) { archive(old, id, kind, '原文已变化，保留文件供重新选择单元和用途。'); continue }
    const explicit = old.attachmentBindings?.filter(binding => binding.assetId === id) ?? []
    const destinations = new Map<CardRecord, AttachmentBinding[]>()
    if (!explicit.length) {
      const destination = cards.find(card => card.locusId === old.locusId)
      if (destination) destinations.set(destination, [{ assetId: id, role: 'reference', scope: 'anchor', sourceFingerprint: fingerprint }])
    }
    for (const binding of explicit) {
      if (binding.unitId) {
        const destination = validUnits.has(binding.unitId) ? cards.find(card => card.mnemonic?.unitIds.includes(binding.unitId!)) : undefined
        if (!destination) { archive(old, id, kind, '原单元被拆分、合并或移除，请重新绑定保留的文件。'); continue }
        const moved = destination.mnemonic?.anchorId !== old.mnemonic?.anchorId || destination.locusId !== old.locusId
        const next: AttachmentBinding = { ...binding, sourceFingerprint: fingerprint, role: moved || binding.sourceFingerprint !== fingerprint ? 'reference' : binding.role }
        destinations.set(destination, [...(destinations.get(destination) ?? []), next])
      } else {
        const destination = cards.find(card => card.locusId === old.locusId)
        if (destination) {
          const sameUnits = JSON.stringify(destination.mnemonic?.unitIds) === JSON.stringify(old.mnemonic?.unitIds)
          destinations.set(destination, [...(destinations.get(destination) ?? []), { ...binding, sourceFingerprint: fingerprint, role: sameUnits && binding.sourceFingerprint === fingerprint ? binding.role : 'reference' }])
        }
      }
    }
    if (!destinations.size) archive(old, id, kind, '原地标或单元不再对应当前方案，请重新选择。')
    for (const [destination, bindings] of destinations) {
      if (kind === 'model') models.set(destination, [...(models.get(destination) ?? []), { id, scale: old.modelScale, old, bindings }])
      else if (destination.imageIds.includes(id)) destination.attachmentBindings = [...(destination.attachmentBindings ?? []), ...bindings]
      else if (destination.imageIds.length >= 20) archive(old, id, kind, '合并后图片超过单点容量，保留文件供重新选择。')
      else { destination.imageIds.push(id); destination.attachmentBindings = [...(destination.attachmentBindings ?? []), ...bindings] }
    }
  }
  for (const [card, candidates] of models) {
    const unique = [...new Set(candidates.map(candidate => candidate.id))]
    if (unique.length > 1) { candidates.forEach(candidate => archive(candidate.old, candidate.id, 'model', '多个模型合并到同一地标；没有自动替换，请选择一个，其余文件继续保留。')); continue }
    card.modelId = unique[0]; card.modelScale = candidates[0].scale
    card.attachmentBindings = [...(card.attachmentBindings ?? []), ...candidates.flatMap(candidate => candidate.bindings)]
  }
  for (const card of cards) if (card.attachmentBindings) card.attachmentBindings = [...new Map(card.attachmentBindings.map(binding => [JSON.stringify([binding.assetId, binding.unitId ?? null]), binding])).values()]
  if (unassignedAttachments.length > 1000) throw new Error('待重新分配附件超过 1000 项；请先备份并整理，当前保存未执行。')
  return { cards, unassignedAttachments }
}
