import { imageHeaderDimensions, assertImageDimensions } from '../offline/imageHeader'
import { assertEmbeddedGlb } from '../offline/serialize'
import JSZip from 'jszip'
import { safeAssetPath, validateMpManifest } from './palaceBackupValidation'
import type { BlobRecord, CardRecord, MpFileV1, PalaceRecord } from './types'

export const BACKUP_LIMITS = { compressedBytes: 64 * 1024 * 1024, expandedBytes: 128 * 1024 * 1024, assetBytes: 48 * 1024 * 1024, manifestBytes: 4 * 1024 * 1024, files: 1400 } as const
function extFromMime(mime: string) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf' } as Record<string, string>)[mime] ?? 'bin' }
function sanitizeFileStem(stem: string) { return stem.replaceAll(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'palace' }

/** Reject model URLs before any GLTFLoader can fetch external resources. */
export function validateModelBytes(bytes: Uint8Array, mime: string): void {
  let json: unknown
  if (mime === 'model/gltf-binary') {
    if (bytes.byteLength < 20) throw new Error('GLB 文件过短。')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB 头部无效。')
    const jsonLength = view.getUint32(12, true)
    if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > bytes.byteLength - 20 || jsonLength > BACKUP_LIMITS.manifestBytes) throw new Error('GLB JSON 数据块无效或过大。')
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).replace(/\0+$/, ''))
  } else if (mime === 'model/gltf+json') {
    if (bytes.byteLength > BACKUP_LIMITS.manifestBytes) throw new Error('GLTF JSON 过大。')
    json = JSON.parse(new TextDecoder().decode(bytes))
  } else throw new Error('模型 MIME 类型不受支持。')
  if (!json || typeof json !== 'object' || Array.isArray(json) || (json as { asset?: { version?: string } }).asset?.version !== '2.0') throw new Error('模型必须是 glTF 2.0 对象。')
  const walk = (value: unknown, depth: number) => {
    if (depth > 100) throw new Error('模型 JSON 嵌套过深。')
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'uri' || key === 'url') && typeof child === 'string' && !/^data:(?:image\/(?:png|jpeg|webp|gif)|application\/octet-stream);base64,[A-Za-z0-9+/=\r\n]*$/.test(child)) throw new Error('模型包含外部资源地址；只接受自包含资源。')
      walk(child, depth + 1)
    }
  }
  walk(json, 0)
  if (mime === 'model/gltf-binary') assertEmbeddedGlb(bytes)
  else {
    // Run the same buffer/graph/texture preflight for self-contained JSON glTF.
    const encoded = new TextEncoder().encode(JSON.stringify(json))
    const padded = Math.ceil(encoded.length / 4) * 4
    const glb = new Uint8Array(20 + padded), header = new DataView(glb.buffer)
    header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, glb.length, true)
    header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true)
    glb.fill(32, 20); glb.set(encoded, 20)
    assertEmbeddedGlb(glb)
  }
}
function validateImageBytes(bytes: Uint8Array, mime: string): void {
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 12))
  const valid = mime === 'image/png' ? bytes[0] === 137 && header.slice(1, 4) === 'PNG' : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === 'image/gif' ? /^GIF8[79]a/.test(header) : mime === 'image/webp' ? header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP' : false
  if (!valid) throw new Error('图片字节与 MIME 类型不匹配。')
  const dimensions = imageHeaderDimensions(bytes.subarray(0, 4 * 1024 * 1024), mime)
  assertImageDimensions(dimensions.width, dimensions.height)
}

export async function buildMpFileV1(params: { palace: PalaceRecord; cards: CardRecord[]; blobs: BlobRecord[] }): Promise<{ fileName: string; blob: Blob }> {
  const zip = new JSZip(), blobsById = new Map(params.blobs.map(b => [b.id, b])), files = new Map<string, { id: string; file: string; mime: string }>()
  function ref(id: string, kind: 'images' | 'models' | 'maps') {
    const previous = files.get(id); if (previous) return previous
    const blob = blobsById.get(id); if (!blob) throw new Error(`缺少备份资源 ${id}，已停止导出，避免不完整备份。`)
    const entry = { id, file: `${kind}/asset-${files.size + 1}.${extFromMime(blob.mime)}`, mime: blob.mime }; files.set(id, entry); return entry
  }
  const map = params.palace.customMap
  const manifest: MpFileV1 = {
    formatVersion: 1, exportedAt: new Date().toISOString(), templateId: params.palace.templateId,
    palace: { title: params.palace.title, ...(params.palace.unassignedAttachments?.length ? { unassignedAttachments: params.palace.unassignedAttachments.map(({ blobId, ...metadata }) => ({ ...metadata, ...ref(blobId, metadata.kind === 'image' ? 'images' : 'models') })) } : {}), ...(params.palace.mnemonicPlan ? { mnemonicPlan: params.palace.mnemonicPlan } : {}), ...(map ? { customMap: { ...ref(map.blobId, 'maps'), fileName: map.fileName, size: map.size, importedAt: map.importedAt } } : {}) },
    cards: params.cards.filter(c => c.prompt.trim() || c.answer.trim() || c.note?.trim() || c.imageIds.length || c.modelId || c.mnemonic).map(c => ({ locusId: c.locusId, routeIndex: c.routeIndex, prompt: c.prompt, answer: c.answer, note: c.note, revealedCount: c.revealedCount, confidence: c.confidence, lastReviewedAt: c.lastReviewedAt, reviewCount: c.reviewCount, nextReviewAt: c.nextReviewAt, mnemonic: c.mnemonic, unitProgress: c.unitProgress, attachmentBindings: c.attachmentBindings, images: c.imageIds.map(id => ref(id, 'images')), ...(c.modelId ? { model: { ...ref(c.modelId, 'models'), scale: c.modelScale } } : {}) })),
  }
  const clean = validateMpManifest(manifest)
  zip.file('palace.json', JSON.stringify(clean, null, 2))
  let expanded = 0
  for (const entry of files.values()) {
    const data = new Uint8Array(await blobsById.get(entry.id)!.data.arrayBuffer())
    if (data.length > BACKUP_LIMITS.assetBytes) throw new Error('单个资源超过 48 MB 备份限制。')
    expanded += data.length; if (expanded > BACKUP_LIMITS.expandedBytes) throw new Error('备份解压后大小超过 128 MB 限制。')
    if (entry.mime.startsWith('image/')) validateImageBytes(data, entry.mime); else validateModelBytes(data, entry.mime)
    zip.file(entry.file, data, { binary: true })
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  if (blob.size > BACKUP_LIMITS.compressedBytes) throw new Error('备份超过 64 MB 限制。')
  return { fileName: `${sanitizeFileStem(params.palace.title)}.mpalace`, blob }
}

type ZipMeta = { _data?: { uncompressedSize?: number }; unsafeOriginalName?: string }
export async function parseMpFileV1(file: File): Promise<MpFileV1 & { zip: JSZip }> {
  if (file.size > BACKUP_LIMITS.compressedBytes) throw new Error('备份文件超过 64 MB 限制。')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files)
  if (entries.length > BACKUP_LIMITS.files) throw new Error('备份文件数量过多。')
  let expanded = 0
  for (const entry of entries) {
    const meta = entry as unknown as ZipMeta
    const original = meta.unsafeOriginalName ?? entry.name
    if (original !== entry.name || original.includes('\\') || original.startsWith('/') || original.split('/').some(p => p === '..' || p === '.')) throw new Error('备份含不安全路径。')
    const size = meta._data?.uncompressedSize ?? 0
    if (!Number.isSafeInteger(size) || size < 0 || size > BACKUP_LIMITS.assetBytes) throw new Error('备份资源大小无效或超过限制。')
    expanded += size
    if (expanded > BACKUP_LIMITS.expandedBytes) throw new Error('备份解压后超过 128 MB 限制。')
  }
  const manifestFile = zip.file('palace.json')
  if (!manifestFile) throw new Error('无效 .mpalace：缺少 palace.json。')
  if (((manifestFile as unknown as ZipMeta)._data?.uncompressedSize ?? 0) > BACKUP_LIMITS.manifestBytes) throw new Error('备份清单超过 4 MB 限制。')
  const jsonText = await manifestFile.async('text')
  if (jsonText.length > BACKUP_LIMITS.manifestBytes) throw new Error('备份清单过大。')
  const manifest = validateMpManifest(JSON.parse(jsonText))
  return Object.assign(manifest, { zip })
}

export interface ExtractedAsset { id: string; mime: string; blob: Blob }
export async function extractAllAssetsFromZip(parsed: MpFileV1 & { zip: JSZip }): Promise<ExtractedAsset[]> {
  const entries = [...parsed.cards.flatMap(c => [...c.images, ...(c.model ? [c.model] : [])]), ...(parsed.palace.customMap ? [parsed.palace.customMap] : []), ...(parsed.palace.unassignedAttachments ?? [])]
  const unique = new Map<string, { id: string; file: string; mime: string }>()
  for (const entry of entries) {
    const previous = unique.get(entry.id)
    if (previous && (previous.file !== entry.file || previous.mime !== entry.mime)) throw new Error('同一资源 ID 指向了不同文件。')
    unique.set(entry.id, entry)
  }
  const results: ExtractedAsset[] = []; let expanded = 0
  for (const { id, file, mime } of unique.values()) {
    if (!safeAssetPath(file)) throw new Error('资源路径不安全。')
    const entry = parsed.zip.file(file); if (!entry) throw new Error(`备份缺少资源 ${file}。`)
    const data = await entry.async('uint8array')
    expanded += data.length
    if (data.length > BACKUP_LIMITS.assetBytes || expanded > BACKUP_LIMITS.expandedBytes) throw new Error('解压资源大小超限。')
    if (mime.startsWith('image/')) validateImageBytes(data, mime); else validateModelBytes(data, mime)
    results.push({ id, mime, blob: new Blob([data as BlobPart], { type: mime }) })
  }
  const map = parsed.palace.customMap
  if (map && results.find(r => r.id === map.id)?.blob.size !== map.size) throw new Error('自定义场景大小与备份清单不一致。')
  return results
}
export async function extractImagesFromZip(parsed: MpFileV1 & { zip: JSZip }) { return (await extractAllAssetsFromZip(parsed)).filter(a => a.mime.startsWith('image/')) }
export async function extractModelsFromZip(parsed: MpFileV1 & { zip: JSZip }) { return (await extractAllAssetsFromZip(parsed)).filter(a => a.mime.startsWith('model/')) }
