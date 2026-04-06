import { createPalace, nowIso, putBlob, replaceCards } from './db'
import { extractImagesFromZip, extractModelsFromZip, parseMpFileV1 } from './mpalace'
import type { CardRecord, PalaceRecord } from './types'

export async function importMpFileAsNewPalace(file: File): Promise<PalaceRecord> {
  const parsed = await parseMpFileV1(file)
  if (parsed.templateId !== 'dust2_blockout_v2' && parsed.templateId !== 'dust2like_v1') {
    throw new Error(`当前版本仅支持 dust2_blockout_v2 / dust2like_v1，文件为 ${parsed.templateId}`)
  }

  const created = await createPalace(parsed.palace.title || '从备份恢复', parsed.templateId)

  const images = await extractImagesFromZip(parsed)
  for (const img of images) {
    await putBlob({ id: img.id, mime: img.mime, data: img.blob, createdAt: nowIso() })
  }

  const models = await extractModelsFromZip(parsed)
  for (const m of models) {
    await putBlob({ id: m.id, mime: m.mime, data: m.blob, createdAt: nowIso() })
  }

  const newCards: CardRecord[] = parsed.cards.map((c) => ({
    palaceId: created.id,
    locusId: c.locusId,
    routeIndex: c.routeIndex,
    prompt: c.prompt ?? '',
    answer: c.answer ?? '',
    note: c.note,
    imageIds: c.images.map((i) => i.id),
    modelId: c.model?.id,
    modelScale: c.model?.scale,
    confidence: c.confidence,
    lastReviewedAt: c.lastReviewedAt,
    reviewCount: c.reviewCount,
    nextReviewAt: c.nextReviewAt,
    revealedCount: c.revealedCount ?? 0,
    updatedAt: nowIso(),
  }))

  await replaceCards(created.id, newCards)

  return created
}
