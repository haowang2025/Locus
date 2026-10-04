import { BACKUP_LIMITS, validateModelBytes } from './mpalace'
import { assertImageDimensions, imageHeaderDimensions } from '../offline/imageHeader'
import type { AttachmentBinding, CardRecord } from './types'

export function initialAttachmentDraft(card: CardRecord): AttachmentBinding[] {
  const bindings = [...(card.attachmentBindings ?? [])]
  for (const assetId of [...card.imageIds, ...(card.modelId ? [card.modelId] : [])]) {
    if (bindings.some(binding => binding.assetId === assetId)) continue
    if (card.mnemonic) for (const unitId of card.mnemonic.unitIds) bindings.push({ assetId, unitId, role: 'reference' })
    else bindings.push({ assetId, role: 'reference' })
  }
  return bindings
}

export function attachmentBindingKey(binding: Pick<AttachmentBinding, 'assetId' | 'unitId' | 'scope'>): string {
  return JSON.stringify([binding.assetId, binding.unitId ?? null])
}

export function replaceAttachmentBinding(bindings: AttachmentBinding[], next: AttachmentBinding): AttachmentBinding[] {
  const key = attachmentBindingKey(next)
  return [...bindings.filter(binding => attachmentBindingKey(binding) !== key), next]
}

export function remapAttachmentDraft(bindings: AttachmentBinding[], assetMap: Map<string, string>): AttachmentBinding[] {
  return bindings.flatMap(binding => {
    const assetId = assetMap.get(binding.assetId)
    return assetId ? [{ ...binding, assetId }] : []
  })
}

/** Validate before allocating a browser image/model preview or persisting bytes. */
export async function validateAttachmentUpload(file: Blob, kind: 'image' | 'model'): Promise<void> {
  if (!file.size || file.size > BACKUP_LIMITS.assetBytes) throw new Error('附件为空或超过 48 MB 限制。')
  if (kind === 'model') {
    validateModelBytes(new Uint8Array(await file.arrayBuffer()), file.type === 'model/gltf+json' ? file.type : 'model/gltf-binary')
  } else {
    const size = imageHeaderDimensions(new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer()), file.type)
    assertImageDimensions(size.width, size.height)
  }
}
