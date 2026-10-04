/** Dimension preflight prevents allocating an oversized decoded bitmap before checking the budget. */
export function imageHeaderDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (from: number, count: number) => String.fromCharCode(...bytes.subarray(from, from + count))
  let width = 0, height = 0
  if (mime === 'image/png' && bytes.length >= 24 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') { width = v.getUint32(16); height = v.getUint32(20) }
  else if (mime === 'image/gif' && bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) { width = v.getUint16(6, true); height = v.getUint16(8, true) }
  else if (mime === 'image/webp' && bytes.length >= 25 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4)
    if (kind === 'VP8X' && bytes.length >= 30) { width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536; height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536 }
    else if (kind === 'VP8L' && bytes[20] === 47) { const bits = v.getUint32(21, true); width = 1 + (bits & 16383); height = 1 + ((bits >>> 14) & 16383) }
    else if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { width = v.getUint16(26, true) & 16383; height = v.getUint16(28, true) & 16383 }
  } else if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      if (marker >= 208 && marker <= 215 || marker === 1) continue
      if (offset + 2 > bytes.length) break
      const length = v.getUint16(offset)
      if (length < 2) break
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7 && offset + 7 <= bytes.length) { height = v.getUint16(offset + 3); width = v.getUint16(offset + 5); break }
      offset += length
    }
  }
  if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error('无法安全读取图片尺寸，文件可能损坏或头部过大。请重新保存为标准 PNG/JPEG/WebP 后重试')
  return { width, height }
}
export function assertImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > 8192 || height > 8192 || width * height > 16000000) throw new Error('图片超过单图 1600 万像素或最长边 8192 限制；请缩小图片，不会自动丢弃内容')
}
