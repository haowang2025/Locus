import JSZip from 'jszip'

import type { BlobRecord, CardRecord, MpFileV1, PalaceRecord } from './types'

function extFromMime(mime: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'model/gltf-binary') return 'glb'
  if (mime === 'model/gltf+json') return 'gltf'
  return 'bin'
}

function sanitizeFileStem(stem: string) {
  return stem.replaceAll(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'palace'
}

export async function buildMpFileV1(params: {
  palace: PalaceRecord
  cards: CardRecord[]
  blobs: BlobRecord[]
}): Promise<{ fileName: string; blob: Blob }> {
  const zip = new JSZip()

  const blobsById = new Map(params.blobs.map((b) => [b.id, b] as const))

  const mp: MpFileV1 = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    templateId: params.palace.templateId,
    palace: { title: params.palace.title },
    cards: params.cards
      .filter((c) => c.prompt.trim() || c.answer.trim() || c.note?.trim() || c.imageIds.length > 0 || c.modelId)
      .map((c) => ({
        locusId: c.locusId,
        routeIndex: c.routeIndex,
        prompt: c.prompt,
        answer: c.answer,
        note: c.note,
        revealedCount: c.revealedCount,
        confidence: c.confidence,
        lastReviewedAt: c.lastReviewedAt,
        reviewCount: c.reviewCount,
        nextReviewAt: c.nextReviewAt,
        images: c.imageIds
          .map((id) => {
            const blob = blobsById.get(id)
            if (!blob) return null
            const ext = extFromMime(blob.mime)
            return {
              id: blob.id,
              file: `images/${blob.id}.${ext}`,
              mime: blob.mime,
            }
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x)),
        model: (() => {
          if (!c.modelId) return undefined
          const blob = blobsById.get(c.modelId)
          if (!blob) return undefined
          const ext = extFromMime(blob.mime)
          return {
            id: blob.id,
            file: `models/${blob.id}.${ext}`,
            mime: blob.mime,
            scale: c.modelScale,
          }
        })(),
      })),
  }

  zip.file('palace.json', JSON.stringify(mp, null, 2))

  const writtenFiles = new Set<string>()
  for (const c of mp.cards) {
    for (const img of c.images) {
      if (writtenFiles.has(img.file)) continue
      const blobRef = blobsById.get(img.id)
      if (!blobRef) continue
      zip.file(img.file, blobRef.data, { binary: true })
      writtenFiles.add(img.file)
    }
    const model = c.model
    if (model) {
      if (writtenFiles.has(model.file)) continue
      const blobRef = blobsById.get(model.id)
      if (!blobRef) continue
      zip.file(model.file, blobRef.data, { binary: true })
      writtenFiles.add(model.file)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const stem = sanitizeFileStem(params.palace.title)
  const fileName = `${stem}.mpalace`
  return { fileName, blob }
}

export async function parseMpFileV1(file: File): Promise<MpFileV1 & { zip: JSZip }> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const palaceJsonFile = zip.file('palace.json')
  if (!palaceJsonFile) {
    throw new Error('Invalid .mpalace: missing palace.json')
  }
  const jsonText = await palaceJsonFile.async('text')
  const parsed = JSON.parse(jsonText) as MpFileV1
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported .mpalace formatVersion: ${String((parsed as any).formatVersion)}`)
  }
  return Object.assign(parsed, { zip })
}

export async function extractImagesFromZip(parsed: MpFileV1 & { zip: JSZip }) {
  const imageEntries = parsed.cards.flatMap((c) => c.images)
  const unique = new Map<string, { id: string; file: string; mime: string }>()
  for (const img of imageEntries) {
    unique.set(img.id, img)
  }

  const results: Array<{ id: string; mime: string; blob: Blob }> = []
  for (const { id, file, mime } of unique.values()) {
    const f = parsed.zip.file(file)
    if (!f) throw new Error(`Invalid .mpalace: missing image file ${file}`)
    const blob = await f.async('blob')
    results.push({ id, mime, blob })
  }
  return results
}

export async function extractModelsFromZip(parsed: MpFileV1 & { zip: JSZip }) {
  const modelEntries = parsed.cards.flatMap((c) => (c.model ? [c.model] : []))
  const unique = new Map<string, { id: string; file: string; mime: string }>()
  for (const m of modelEntries) {
    unique.set(m.id, m)
  }

  const results: Array<{ id: string; mime: string; blob: Blob }> = []
  for (const { id, file, mime } of unique.values()) {
    const f = parsed.zip.file(file)
    if (!f) throw new Error(`Invalid .mpalace: missing model file ${file}`)
    const blob = await f.async('blob')
    results.push({ id, mime, blob })
  }
  return results
}
