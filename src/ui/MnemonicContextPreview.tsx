import { useEffect, useMemo, useRef, useState } from 'react'
import type { PalacePlan } from '../lib/palaceTypes'
import type { CardRecord } from '../lib/types'
import { getSceneDefinition } from '../lib/sceneRegistry'
import { getSceneVisualContext } from '../lib/sceneVisualContext'
import { describeRenderedCue } from '../lib/palaceSemanticReview'
import { FpsWorld } from '../three/FpsWorld'
import { PreviewInputAdapter } from '../three/PreviewInputAdapter'

/** Uses the app's actual world/prop renderer; never writes or approves the draft. */
export default function MnemonicContextPreview({ plan, unitId, onClose }: { plan: PalacePlan; unitId: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement | null>(null), dialog = useRef<HTMLDivElement | null>(null), world = useRef<FpsWorld | null>(null)
  const [status, setStatus] = useState('正在加载真实场景与同一地标的全部道具…'), [error, setError] = useState<string | null>(null), [warning, setWarning] = useState<string | null>(null)
  const scene = useMemo(() => getSceneDefinition(plan.sceneId), [plan.sceneId])
  const cue = plan.cues.find(c => c.unitId === unitId), anchor = scene.anchors.find(a => a.id === cue?.anchorId)
  const anchorCues = useMemo(() => plan.units.flatMap(unit => { const cue = plan.cues.find(c => c.unitId === unit.id && c.anchorId === anchor?.id); return cue ? [cue] : [] }), [plan, anchor?.id])
  const reference = anchor ? getSceneVisualContext(scene.id)?.anchors.find(view => view.anchorId === anchor.id) : undefined
  const previousFocus = useRef<Element | null>(null)
  useEffect(() => {
    previousFocus.current = document.activeElement
    dialog.current?.focus()
    return () => { if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus() }
  }, [])
  useEffect(() => {
    if (!host.current || !anchor || !cue) return
    let alive = true
    let instance: FpsWorld | undefined
    try { instance = new FpsWorld({ container: host.current, input: new PreviewInputAdapter(), feedbackEnabled: false, onViewWarning: message => { if (alive) setWarning(message) } }); world.current = instance }
    catch (cause) { setError(`WebGL 预览不可用：${cause instanceof Error ? cause.message : String(cause)}。保留静态场景图与实际渲染文字说明。`); setStatus('使用明确标注的静态 / 文字回退。'); return }
    void (async () => {
      try {
        if (anchorCues.length > Math.min(anchor.capacity, anchor.cueVolume.maxObjects)) throw new Error('这个地标超出容量，请先重新分配；预览不会截掉部分道具。')
        await instance!.loadBuiltinScene(scene.id)
        if (!alive) return
        const card: CardRecord = { palaceId: 'draft-preview', locusId: anchor.locusId, routeIndex: anchor.routeOrder, prompt: '未保存的地标预览', answer: '', imageIds: [], revealedCount: 0, updatedAt: plan.createdAt, mnemonic: { schemaVersion: 1, anchorId: anchor.id, unitIds: anchorCues.map(c => c.unitId), cues: anchorCues } }
        instance!.setMnemonicCards([card]); instance!.setFilledLoci(new Set([anchor.locusId])); instance!.teleportNearAndAim(anchor.locusId); instance!.start()
        setStatus('使用与正式宫殿相同的场景、道具和空间操作。可拖动画面观察；未保存，也未自动勾选审核。')
      } catch (cause) { if (alive) { setError(cause instanceof Error ? cause.message : '预览加载失败。'); setStatus('使用明确标注的静态 / 文字回退。') } }
    })()
    return () => { alive = false; instance?.dispose(); world.current = null }
  }, [scene, anchor, cue, anchorCues, plan.createdAt])
  return <div className="palace-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div className="palace-preview-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="palace-preview-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key === 'Tab') {
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')
      if (!focusable?.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}><header className="palace-preview-header"><div><h2 id="palace-preview-title">{anchor?.label ?? '地标'} · 草案情境预览</h2><p className="hint">{scene.title} / {scene.version} · 同地标 {anchorCues.length} 个道具全部显示</p></div><button className="btn" onClick={onClose}>关闭预览</button></header><div className="palace-preview-canvas" ref={host} aria-label="同一引擎的场景与道具预览" />{error && <p className="palace-alert" role="alert">{error}</p>}<p className="hint" role="status">{status}</p>{warning && <p className="hint">{warning}</p>}<button className="btn" disabled={!world.current || !!error} onClick={() => anchor && world.current?.teleportNearAndAim(anchor.locusId)}>回到标准观看点</button>{cue && anchor && <><p className="palace-rendered-description">{describeRenderedCue(cue, anchor)}</p><p className="hint">当前核对：第 {anchorCues.findIndex(c => c.unitId === unitId) + 1} 个道具（标准视点从左至右）。想象叙事不会自动生成碰撞、穿窗、写字或剧情动作。</p></>}{reference && <details open={!!error}><summary>查看场景静态参考图（不包含当前道具或动画）</summary><img className="palace-preview-reference" src={`${import.meta.env.BASE_URL}${reference.path}`} alt={`${reference.label}的 Blender 场景参考；不是当前道具渲染截图`} /><p className="hint">此图由 Blender 在诊断光照下渲染，仅提供地标形状与位置背景，不证明浏览器运行已通过验证。</p></details>}{scene.attribution && <p className="hint"><a href={scene.attribution.url} target="_blank" rel="noopener noreferrer">{scene.attribution.creator} · {scene.attribution.license}</a></p>}</div></div>
}
