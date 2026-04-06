import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

function safeFileName(name: string) {
  const cleaned = name.replaceAll(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
  return cleaned || 'export.mpalace'
}

function blobToBase64Data(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file as data URL'))
        return
      }
      const comma = result.indexOf(',')
      if (comma === -1) {
        reject(new Error('Invalid data URL'))
        return
      }
      resolve(result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(blob)
  })
}

export async function exportFile(params: { fileName: string; blob: Blob; dialogTitle?: string }) {
  const fileName = safeFileName(params.fileName)

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64Data(params.blob)
    const path = `exports/${fileName}`
    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    })

    await Share.share({
      title: fileName,
      files: [written.uri],
      dialogTitle: params.dialogTitle ?? '导出',
    })
    return
  }

  const url = URL.createObjectURL(params.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

