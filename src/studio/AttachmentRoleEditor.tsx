import type { AttachmentBinding } from '../lib/types'
import type { MeaningUnit } from '../lib/palaceTypes'
import { attachmentRole } from '../lib/attachmentBindings'
import type { StudioMedia } from './core'
export default function AttachmentRoleEditor({ media, units, fingerprint, onChange }: { media: StudioMedia; units: MeaningUnit[]; fingerprint: string; onChange: (bindings: AttachmentBinding[]) => void }) {
  const wide = media.bindings?.some(b => b.scope === 'anchor' && b.role === 'cue' && b.sourceFingerprint === fingerprint) ?? false
  const context = { attachmentBindings: media.bindings, mnemonic: { unitIds: units.map(u => u.id), sourceFingerprint: fingerprint } }
  const references = (): AttachmentBinding[] => units.map(u => ({ assetId: media.assetId, unitId: u.id, role: 'reference', sourceFingerprint: fingerprint }))
  function changeUnit(unitId: string, role: 'cue' | 'reference') {
    const bindings = references().map(binding => ({ ...binding, role: binding.unitId === unitId ? role : attachmentRole(context, media.assetId, binding.unitId) === 'cue' ? 'cue' as const : 'reference' as const }))
    onChange(bindings)
  }
  return <fieldset className="attachment-roles"><legend>附件用途与适用单元</legend><p className="muted">“助记线索”会在回忆前显示，可能提示答案，这是你主动选择的记忆材料；“答案参考”只在显示答案后出现。旧附件默认作为答案参考。</p><label className="check"><input type="checkbox" checked={wide} disabled={!units.length} onChange={e => onChange(e.target.checked ? [{ assetId: media.assetId, scope: 'anchor', role: 'cue', sourceFingerprint: fingerprint }] : references())} />明确将此附件作为本地标所有单元的线索</label>{wide && <p className="error">本地标每个单元回忆前都会显示这份附件；请检查它是否不恰当地提前暴露其他单元内容。</p>}{units.map((unit, n) => <label key={unit.id}>本地标单元 {n + 1} · {unit.title}<select disabled={wide} value={attachmentRole(context, media.assetId, unit.id) === 'cue' ? 'cue' : 'reference'} onChange={e => changeUnit(unit.id, e.target.value as 'cue' | 'reference')}><option value="reference">答案参考：揭示后可见</option><option value="cue">助记线索：回忆前可见</option></select></label>)}<p className="muted">同一地标的附件逐个显示以免重叠；回忆时可在附件列表中切换。用途或绑定改变后需要重新确认。</p></fieldset>
}
