import { imageHeaderDimensions, assertImageDimensions } from '../offline/imageHeader'
import { useEffect, useState } from 'react'
import { getBlobs } from '../lib/db'

/** Scoped IDs are selected before this component ever loads an image. */
export default function RecallImages({ ids, label, onSelect }: { ids: string[]; label: string; onSelect?: (id: string) => void }) {
  const [loaded, setLoaded] = useState<{ key: string; urls: { id: string; url: string }[] }>({ key: '', urls: [] })
  const [error, setError] = useState<{key:string;message:string} | null>(null)
  const key = JSON.stringify(ids)
  useEffect(() => {
    let cancelled = false
    const urls: { id: string; url: string }[] = []
    void getBlobs(JSON.parse(key) as string[]).then(async blobs => {
      let pixels = 0
      for (const blob of blobs) {
        const size = imageHeaderDimensions(new Uint8Array(await blob.data.slice(0, 4 * 1024 * 1024).arrayBuffer()), blob.mime)
        assertImageDimensions(size.width, size.height); pixels += size.width * size.height
        if (pixels > 24000000) throw new Error('当前图片合计超过 2400 万像素，请缩小或分开附件。')
      }
      if (cancelled) return
      urls.push(...blobs.map(blob => ({ id: blob.id, url: URL.createObjectURL(blob.data) })))
      setLoaded({ key, urls })
    }).catch(reason => { if (!cancelled) { setLoaded({ key, urls: [] }); setError({key,message:reason instanceof Error ? reason.message : String(reason)}) } })
    return () => { cancelled = true; urls.forEach(item => URL.revokeObjectURL(item.url)) }
  }, [key])
  if (!ids.length) return null
  return <section aria-label={label}><p className="hint">{label}</p>{error?.key === key && <p role="alert">{error.message} 原文件仍保留。</p>}<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{loaded.key === key ? loaded.urls.map((item, index) => <div key={item.id}><img src={item.url} alt={`${label} ${index + 1}`} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }} />{onSelect && <button className="btn" type="button" onClick={() => onSelect(item.id)}>在地标中显示第 {index + 1} 张</button>}</div>) : <span role="status">读取附件…</span>}</div></section>
}
