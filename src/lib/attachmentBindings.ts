import type { AttachmentBinding, CardRecord } from './types'

/** A missing assignment is a legacy reference, never an implicitly approved cue. */
export function attachmentRole(card: { mnemonic?: { unitIds: string[]; sourceFingerprint?: string }; attachmentBindings?: AttachmentBinding[] }, assetId: string, unitId?: string): 'cue' | 'reference' | null {
  const bindings = card.attachmentBindings?.filter(binding => binding.assetId === assetId) ?? []
  if (!bindings.length) return 'reference'
  const selected = unitId ?? card.mnemonic?.unitIds[0]
  if (card.mnemonic && (!selected || !card.mnemonic.unitIds.includes(selected))) return null
  const exact = bindings.find(binding => binding.unitId === selected && binding.unitId !== undefined)
  if (exact) return card.mnemonic && (!exact.sourceFingerprint || exact.sourceFingerprint !== card.mnemonic.sourceFingerprint) ? (exact.role === 'reference' && !exact.sourceFingerprint ? 'reference' : null) : exact.role
  const common = bindings.find(binding => binding.scope === 'anchor' || binding.unitId === undefined)
  if (!common) return null
  if (card.mnemonic && common.sourceFingerprint !== undefined && common.sourceFingerprint !== card.mnemonic.sourceFingerprint) return null
  // Semantic unscoped legacy assignments never authorize pre-answer display.
  return common.role === 'cue' && card.mnemonic && (common.scope !== 'anchor' || !common.sourceFingerprint || common.sourceFingerprint !== card.mnemonic.sourceFingerprint) ? 'reference' : common.role
}

export function visibleAttachmentIds(card: CardRecord, unitId: string | undefined, revealed: boolean): { imageIds: string[]; modelId?: string } {
  const visible = (id: string) => { const role = attachmentRole(card, id, unitId); return role === 'cue' || (revealed && role === 'reference') }
  return { imageIds: card.imageIds.filter(visible), ...(card.modelId && visible(card.modelId) ? { modelId: card.modelId } : {}) }
}

export function parseAttachmentBindings(value: unknown, assetIds: string[], unitIds?: string[], fingerprint?: string): AttachmentBinding[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 5040) throw new Error('附件绑定数量无效。')
  const seen = new Set<string>()
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('附件绑定格式无效。')
    const item = raw as Record<string, unknown>
    if (typeof item.assetId !== 'string' || !assetIds.includes(item.assetId)) throw new Error('附件绑定引用了未知文件。')
    const role: AttachmentBinding['role'] = item.role === 'cue' ? 'cue' : 'reference'
    if (item.scope !== undefined && item.scope !== 'anchor') throw new Error('附件绑定范围无效。')
    if (item.unitId !== undefined && (typeof item.unitId !== 'string' || !unitIds?.includes(item.unitId))) throw new Error('附件绑定引用了未知含义单元。')
    if (item.scope === 'anchor' && item.unitId !== undefined) throw new Error('附件不能同时绑定单元和整个地标。')
    if (unitIds && role === 'cue' && item.unitId === undefined && item.scope !== 'anchor') throw new Error('线索附件需要明确指定单元或整个地标。')
    if (item.sourceFingerprint !== undefined && (typeof item.sourceFingerprint !== 'string' || !/^fnv1a64-utf16:[0-9]+:[0-9a-f]{16}$/.test(item.sourceFingerprint))) throw new Error('附件原文指纹无效。')
    if (unitIds && role === 'cue' && (!fingerprint || item.sourceFingerprint !== fingerprint)) throw new Error('线索附件与当前原文不匹配，请重新确认绑定。')
    const key = JSON.stringify([item.assetId, item.unitId ?? null])
    if (seen.has(key)) throw new Error('附件绑定重复。')
    seen.add(key)
    return { assetId: item.assetId, role, ...(typeof item.sourceFingerprint === 'string' ? { sourceFingerprint: item.sourceFingerprint } : {}), ...(typeof item.unitId === 'string' ? { unitId: item.unitId } : {}), ...(item.scope === 'anchor' ? { scope: 'anchor' as const } : {}) }
  })
}
