import { imageHeaderDimensions, assertImageDimensions } from './imageHeader'
import type { OfflineAsset } from './types'
import { assertEmbeddedGlb, MAX_BINARY_BYTES } from './serialize'
export async function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') { const image = await createImageBitmap(blob); const size = { width: image.width, height: image.height }; image.close(); return size }
  const url = URL.createObjectURL(blob)
  try { return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => reject(new Error('图片无法解码，请转换为有效的 PNG/JPEG/WebP')); image.src = url }) } finally { URL.revokeObjectURL(url) }
}
export async function prepareOfflineAsset(id: string, blob: Blob, kind: 'image' | 'model'): Promise<OfflineAsset> {
  if (!blob.size || blob.size > MAX_BINARY_BYTES) throw new Error('单个资源须在 0–80 MB 之间')
  let imageWidth: number | undefined, imageHeight: number | undefined, texturePixels: number | undefined
  if (kind === 'model') texturePixels = assertEmbeddedGlb(new Uint8Array(await blob.arrayBuffer())).texturePixels
  else {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) throw new Error('图片只支持 PNG、JPEG、WebP、GIF')
    const header = imageHeaderDimensions(new Uint8Array(await blob.slice(0, 4 * 1024 * 1024).arrayBuffer()), blob.type); assertImageDimensions(header.width, header.height)
    const image = await imageDimensions(blob); imageWidth = image.width; imageHeight = image.height
    assertImageDimensions(imageWidth, imageHeight)
  }
  const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob) })
  return { id, mime: blob.type || 'model/gltf-binary', base64, bytes: blob.size, imageWidth, imageHeight, texturePixels }
}
export function checkAssetBudgets(assets: OfflineAsset[]): void {
  if (assets.reduce((n, a) => n + a.bytes, 0) > MAX_BINARY_BYTES) throw new Error('资源总计超过 80 MB，请压缩资源或拆分宫殿；未丢弃内容')
  if (assets.reduce((n, a) => n + (a.imageWidth ?? 0) * (a.imageHeight ?? 0) + (a.texturePixels ?? 0), 0) > 24000000) throw new Error('图片与模型纹理总计超过 2400 万像素解码预算，请缩小图片；未丢弃内容')
}
export function embeddedAssetBlob(asset: OfflineAsset): Blob {
  const raw = atob(asset.base64), bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  if (bytes.length !== asset.bytes) throw new Error('附件声明大小与实际数据不符：' + asset.id)
  return new Blob([bytes], { type: asset.mime })
}
