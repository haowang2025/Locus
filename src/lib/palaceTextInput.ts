/** Decode material explicitly; never silently replace undecodable bytes with U+FFFD. */
export function decodeTextMaterial(bytes: ArrayBuffer): string {
  if (bytes.byteLength > 1_000_000) throw new Error('文件过大，请选择小于 1 MB 的 UTF-8 文本文件。')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { throw new Error('文件不是有效的 UTF-8 文本。请转换为 UTF-8 后重试，或直接粘贴正确内容；当前输入没有被覆盖。') }
}
