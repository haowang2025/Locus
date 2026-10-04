import { useState } from 'react'
import type { MeaningUnit, MnemonicCue, CueSemanticReview } from '../lib/palaceTypes'
import type { SceneAnchor } from '../lib/sceneRegistry'
import { initializeSemanticCue, semanticChecksComplete, acknowledgeSemanticUnit } from '../lib/palaceSemanticReview'

export default function SemanticReviewEditor({ unit, cue, anchor, onChange, onAcknowledge }: {
  unit: MeaningUnit; cue: MnemonicCue; anchor: SceneAnchor; onChange: (cue: MnemonicCue) => void; onAcknowledge: (unit: MeaningUnit, cue: MnemonicCue) => void
}) {
  const [error, setError] = useState('')
  const normalized = initializeSemanticCue(unit, cue, anchor, { preserveChecks: true }), review = normalized.semanticReview!
  function update(patch: Partial<CueSemanticReview>) { onChange({ ...normalized, reviewed: false, semanticReview: { ...review, ...patch } }) }
  return <div className="semantic-review-editor">
    <h4>核对当前这一段</h4>
    <p className="muted">先读完下面的原文、提示方式和限制。确认按钮只确认当前单元，不会替你确认其他材料或附件。</p>
    {review.sourceChecks.map(check => <div className="semantic-check" key={'summary-' + check.id}><strong>原文：</strong><p>{check.quote}</p><strong>提示与补全：</strong><p>{check.explanation || '尚未填写，请在详细编辑中补充。'}</p></div>)}
    <div className="rendered-truth"><strong>实际画面：</strong><p>{normalized.renderedDescription}</p><strong>想象故事：</strong><p>{normalized.imaginedAction ?? normalized.action}</p><strong>画面未编码、仍需准确补全：</strong><p>{review.notEncoded}</p></div>
    <button className="primary" disabled={!review.sourceChecks.length || review.sourceChecks.some(c => !c.explanation.trim()) || !review.notEncoded.trim()} onClick={() => { try { const result = acknowledgeSemanticUnit(unit, normalized, anchor); onAcknowledge(result.unit, result.cue); setError('') } catch (e) { setError(String(e)) } }}>{unit.reviewed && normalized.reviewed ? '本单元已确认；可重新核对' : '我已核对本单元的原文、实际画面与未编码细节'}</button>
    {error && <p role="alert" className="error">{error}</p>}
    <details><summary>详细编辑或分别核对</summary>
    <h4>逐条检查：原文里哪些信息真的能回忆？</h4>
    <p className="muted">下面的清单由本地原文子句生成。标签只是提醒，不是自动理解或语义正确性证明。每条都要说明实际看见的提示、脑内想象，以及仍需准确补全的内容。</p>
    {review.sourceChecks.map((check, index) => <div className="semantic-check" key={check.id}>
      <p className="semantic-quote">{check.quote}</p><p className="muted">{check.kinds.join(' · ')} · 来源 {check.spans.map(s => `${s.start}–${s.end}`).join(', ')}</p>
      <label>这条原文怎样被提示，哪些部分还要口头补全？<textarea rows={3} maxLength={4000} value={check.explanation} onChange={e => { const explanation = e.target.value; update({ sourceChecks: review.sourceChecks.map((c, i) => i === index ? { ...c, explanation, checked: false } : c) }) }} /></label>
      <label className="check"><input type="checkbox" checked={check.checked} disabled={!check.explanation.trim()} onChange={e => { const checked = e.target.checked; update({ sourceChecks: review.sourceChecks.map((c, i) => i === index ? { ...c, checked } : c) }) }} />我已核对这整句原文，包括数字、否定、条件与关系</label>
    </div>)}
    <button disabled={!review.sourceChecks.length || review.sourceChecks.some(c => !c.explanation.trim())} onClick={() => update({ sourceChecks: review.sourceChecks.map(c => ({ ...c, checked: true })) })}>我已逐句读完并核对本片段上面的原文与说明</button><p className="muted">只确认当前片段的原文清单；下方的实际画面和未编码细节仍须分别确认。</p>
    <div className="rendered-truth"><strong>生成道具实际会显示什么</strong><p>{normalized.renderedDescription}</p><label className="check"><input type="checkbox" checked={review.renderedConfirmed} onChange={e => update({ renderedConfirmed: e.target.checked })} />我理解实际渲染与想象故事的区别，不把未实现的动作当作已经发生</label></div>
    <label>没有自动编码、仍需从原文准确补全的细节<textarea rows={3} maxLength={4000} value={review.notEncoded} onChange={e => update({ notEncoded: e.target.value, limitationsConfirmed: false })} /></label>
    <label className="check"><input type="checkbox" checked={review.limitationsConfirmed} disabled={!review.notEncoded.trim()} onChange={e => update({ limitationsConfirmed: e.target.checked })} />我已确认这些未编码细节，不用物体数量、颜色或动画代替原文数值</label>
    <label className="check final-semantic"><input type="checkbox" checked={normalized.reviewed} disabled={!semanticChecksComplete(review)} onChange={e => onChange({ ...normalized, reviewed: e.target.checked })} />这一单元的联想审核完成</label>
    </details>
  </div>
}
