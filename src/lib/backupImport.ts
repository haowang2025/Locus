import { nowIso, tx } from './db'
import { newId } from './id'
import { extractAllAssetsFromZip, parseMpFileV1 } from './mpalace'
import type { BlobRecord, CardRecord, PalaceRecord } from './types'

/** Complete parsing/extraction before mutation; remap blob IDs to protect existing palaces. */
export async function prepareMpFileImport(file: File): Promise<{ palace: PalaceRecord; cards: CardRecord[]; blobs: BlobRecord[] }> {
  const parsed = await parseMpFileV1(file)
  const assets = await extractAllAssetsFromZip(parsed)
  const remap = new Map(assets.map(a => [a.id, newId('restored_blob')]))
  const now = nowIso(), map = parsed.palace.customMap
  const palace: PalaceRecord = { id: newId('palace'), title: parsed.palace.title || '从备份恢复', ...(parsed.palace.unassignedAttachments ? { unassignedAttachments: parsed.palace.unassignedAttachments.map(item => ({ blobId: remap.get(item.id)!, kind: item.kind, originalLocusId: item.originalLocusId, unitIds: item.unitIds, reason: item.reason, sourceFingerprint: item.sourceFingerprint, modelScale: item.modelScale })) } : {}), templateId: parsed.templateId, createdAt: now, updatedAt: now, ...(parsed.palace.mnemonicPlan ? { mnemonicPlan: parsed.palace.mnemonicPlan } : {}), ...(map ? { customMap: { blobId: remap.get(map.id)!, fileName: map.fileName, mime: map.mime, size: map.size, importedAt: map.importedAt } } : {}) }
  const cards: CardRecord[] = parsed.cards.map(c => ({ palaceId: palace.id, locusId: c.locusId, routeIndex: c.routeIndex, prompt: c.prompt, answer: c.answer, note: c.note, imageIds: c.images.map(i => remap.get(i.id)!), modelId: c.model ? remap.get(c.model.id) : undefined, modelScale: c.model?.scale, confidence: c.confidence, lastReviewedAt: c.lastReviewedAt, reviewCount: c.reviewCount, nextReviewAt: c.nextReviewAt, revealedCount: c.revealedCount ?? 0, updatedAt: now, mnemonic: c.mnemonic, unitProgress: c.unitProgress, attachmentBindings: c.attachmentBindings?.map(binding => ({ ...binding, assetId: remap.get(binding.assetId)! })) }))
  return { palace, cards, blobs: assets.map(a => ({ id: remap.get(a.id)!, mime: a.mime, data: a.blob, createdAt: now })) }
}
export async function importMpFileAsNewPalace(file: File): Promise<PalaceRecord> {
  const prepared = await prepareMpFileImport(file)
  await tx('readwrite', ['palace', 'cards', 'blobs'], async ({ palace, cards, blobs }) => {
    for (const blob of prepared.blobs) await blobs.put(blob)
    for (const card of prepared.cards) await cards.put(card)
    await palace.put(prepared.palace)
  })
  return prepared.palace
}
