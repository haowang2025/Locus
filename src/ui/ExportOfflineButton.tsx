import { useState } from 'react'
import type { CardRecord, PalaceRecord } from '../lib/types'
export default function ExportOfflineButton({ palace, cards }: { palace: PalaceRecord; cards: CardRecord[] }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  return <div>{!!palace.unassignedAttachments?.length && <p className="hint">有 {palace.unassignedAttachments.length} 个未绑定附件：不会包含在本 HTML 中。请先在附件编辑器重新绑定，或用 .mpalace 项目备份保留全部文件。</p>}<button className="btn" disabled={busy} onClick={async () => { setBusy(true); setMessage(''); try { const { exportOfflinePalace } = await import('../lib/offlineExport'); await exportOfflinePalace(palace, cards); setMessage('HTML 已生成，包含原文与附件。保存后可离线打开；请按材料保密级别保管。') } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) } }}>{busy ? '正在打包完整离线 HTML…' : '导出独立离线 HTML'}</button>{message && <p className="hint" role="status">{message}</p>}</div>
}
