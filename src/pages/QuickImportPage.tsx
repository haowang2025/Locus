import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams, useBlocker } from 'react-router-dom'
import { decodeTextMaterial } from '../lib/palaceTextInput'
import { CUE_SHAPE_LABELS } from '../lib/cueLabels'
import { clearActiveReviewSession, readActiveReviewSession } from '../lib/reviewSession'
import { getCards, getPalace } from '../lib/db'
import type { CardRecord, PalaceRecord } from '../lib/types'
import type { CueSemanticReview, MeaningUnit, MnemonicCue, PalacePlan } from '../lib/palaceTypes'
import { nextUnreviewedUnit, unitReviewStatus } from '../lib/palaceReviewNavigation'
import { acknowledgeSemanticUnit, initializeSemanticCue, invalidateSemanticCue, semanticChecksComplete } from '../lib/palaceSemanticReview'
import { createOfflinePlan, offlineCue, proposeOfflineCues } from '../lib/palacePlanning'
import { mergeUnits, sourceOffsetAtCursor, splitUnit } from '../lib/palaceSegmentation'
import { parsePlanJson, requestPlan, validateEndpoint } from '../lib/palaceProvider'
import { exportFile } from '../lib/exportFile'
import { buildCopyablePrompt, buildModelInput, estimateTokens, MODEL_PROPOSAL_SCHEMA } from '../lib/palaceModelProposal'
import { savePalacePlan } from '../lib/palaceStorage'
import { getSceneVisualContext } from '../lib/sceneVisualContext'
import { buildVisionContextBundle, VISION_PACKAGE_LIMITS } from '../lib/palaceVisionPackage'
import { SAMPLE_MATERIALS, createAuthoredDemo } from '../lib/palaceSamples'
import { sourceCoverage, validatePlan } from '../lib/palaceValidation'
import { getSceneDefinition, listCreatableSceneDefinitions } from '../lib/sceneRegistry'
import ExportOfflineButton from '../ui/ExportOfflineButton'
import MnemonicContextPreview from '../ui/MnemonicContextPreview'
import './QuickImportPage.css'

const EXAMPLE = SAMPLE_MATERIALS[1].source.text

export default function QuickImportPage() {
  const [searchParams] = useSearchParams()
  const focusedAnchor = useRef<string | null>(null)
  const { palaceId } = useParams<{ palaceId: string }>()
  const [palace, setPalace] = useState<PalaceRecord | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [filledCount, setFilledCount] = useState(0)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [sceneId, setSceneId] = useState('reading-hall')
  const [plan, setPlan] = useState<PalacePlan | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null)
  const [savedOutput, setSavedOutput] = useState<{ palace: PalaceRecord; cards: CardRecord[] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [proposalJson, setProposalJson] = useState('')
  const [previewUnitId, setPreviewUnitId] = useState<string | null>(null)
  const [promptPackage, setPromptPackage] = useState<{ text: string; title: string; sceneId: string; prompt: string; estimate: number } | null>(null)
  const [splitAt, setSplitAt] = useState<Record<string, number>>({})
  const abort = useRef<AbortController | null>(null)
  const sourceInputRevision = useRef(0)
  const inputPageActive = useRef(true)
  const activePrompt = promptPackage && promptPackage.text === text && promptPackage.title === title && promptPackage.sceneId === sceneId ? promptPackage : null
  const scenes = listCreatableSceneDefinitions(sceneId)
  const scene = useMemo(() => getSceneDefinition(sceneId), [sceneId])
  const visualContext = getSceneVisualContext(sceneId)
  const issues = useMemo(() => plan ? validatePlan(plan, scene) : [], [plan, scene])
  const coverage = useMemo(() => plan ? sourceCoverage(plan) : null, [plan])
  const activeIndex = plan ? Math.max(0, plan.units.findIndex(unit => unit.id === activeUnitId)) : 0
  const currentUnit = plan?.units[activeIndex]
  const currentCue = plan?.cues.find(cue => cue.unitId === currentUnit?.id)
  const currentStatus = plan && currentUnit ? unitReviewStatus(plan, currentUnit.id) : null
  const approved = plan?.units.filter(u => u.reviewed && plan.cues.find(c => c.unitId === u.id)?.reviewed).length ?? 0
  const dirty = loaded && loadedFor === palaceId && !!palace && (text !== (palace.mnemonicPlan?.source.text ?? '') || title !== (palace.mnemonicPlan?.source.title ?? '') || JSON.stringify(plan) !== JSON.stringify(palace.mnemonicPlan ?? null))
  const blocker = useBlocker(dirty)
  const capacity = scene.anchors.reduce((sum, a) => sum + Math.min(a.capacity, a.cueVolume.maxObjects), 0)

  useEffect(() => {
    if (!palaceId) { setLoaded(true); setLoadedFor(null); return }
    let alive = true
    setLoaded(false); setPlan(null); setText(''); setTitle(''); setStep(1); setActiveUnitId(null); setError(null); setNotice(''); setBusy(null); setProposalJson(''); setPromptPackage(null)
    setPreviewUnitId(null); setSavedOutput(null); focusedAnchor.current = null
    sourceInputRevision.current++; inputPageActive.current = true
    void Promise.all([getPalace(palaceId), getCards(palaceId)]).then(([p, cards]) => {
      if (!alive) return
      setPalace(p ?? null); setFilledCount(cards.length); setLoaded(true); setLoadedFor(palaceId)
      if (!p) { setError('宫殿不存在或已删除。'); return }
      if (p.mnemonicPlan) {
        const saved = structuredClone(p.mnemonicPlan)
        setText(saved.source.text); setTitle(saved.source.title)
        try {
          const definition = getSceneDefinition(saved.sceneId)
          saved.cues = saved.cues.map(cue => {
            const unit = saved.units.find(u => u.id === cue.unitId), anchor = definition.anchors.find(a => a.id === cue.anchorId)
            if (!unit) throw new Error('已保存方案的原文单元需要修复。')
            if (!anchor) return invalidateSemanticCue(cue)
            return initializeSemanticCue(unit, cue, anchor, { preserveChecks: saved.sceneVersion === undefined || saved.sceneVersion === definition.version })
          })
        } catch { setError('旧场景或方案暂不可用，完整原文已经载入。请重新选择场景并审核；原数据库内容尚未覆盖。'); setStep(1); return }
        setPlan(saved); setActiveUnitId(nextUnreviewedUnit(saved) ?? saved.units[0]?.id ?? null); setSavedOutput({ palace: p, cards }); setText(saved.source.text); setTitle(saved.source.title); setSceneId(saved.sceneId); setStep(2)
      }
    }).catch(e => { if (alive) { setLoaded(true); setLoadedFor(palaceId); setPalace(null); setError(e instanceof Error ? e.message : '读取失败。') } })
    return () => { alive = false; inputPageActive.current = false; abort.current?.abort(); abort.current = null }
  }, [palaceId])

  useEffect(() => {
    const target = searchParams.get('anchor')
    if (!plan || step !== 2 || !target || focusedAnchor.current === target) return
    const unitId = plan.cues.find(c => c.anchorId === target)?.unitId
    if (!unitId) return
    if (activeUnitId !== unitId) { setActiveUnitId(unitId); return }
    const timer = window.requestAnimationFrame(() => {
      const heading = document.getElementById(`heading-${unitId}`)
      heading?.scrollIntoView({ block: 'center' }); heading?.focus({ preventScroll: true })
      focusedAnchor.current = target
    })
    return () => window.cancelAnimationFrame(timer)
  }, [plan, searchParams, step, activeUnitId])

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('草案或输入尚未保存。离开会丢失本页的修改，确定离开？')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function sourceReady(): boolean {
    if (!text.trim()) { setError('先粘贴一段要记住的材料，或试用示例。'); return false }
    if (text.length > 200_000) { setError('单次材料限 200,000 字符。当前材料没有被截断，请主动分成多个宫殿。'); return false }
    return true
  }
  function accept(next: PalacePlan) { setPlan(next); setText(next.source.text); setTitle(next.source.title); setActiveUnitId(nextUnreviewedUnit(next) ?? next.units[0]?.id ?? null); setStep(2); setError(null); setNotice('草案已生成，结构检查不代表语义正确。请逐项对照原文核对问题与联想，再保存。') }
  function focusUnit(id: string) {
    setActiveUnitId(id)
    window.requestAnimationFrame(() => { const heading = document.getElementById(`heading-${id}`); heading?.scrollIntoView({ block: 'start' }); heading?.focus({ preventScroll: true }) })
  }
  function focusNextPending() {
    if (!plan) return
    if (issues.length) {
      const issue = issues.find(item => item.unitId && plan.units.some(unit => unit.id === item.unitId)) ?? issues[0]
      if (issue.unitId) focusUnit(issue.unitId)
      else document.getElementById('palace-structural-issues')?.scrollIntoView({ block: 'center' })
      setNotice(`先处理这个问题：${issue.message}`); return
    }
    const next = nextUnreviewedUnit(plan, currentUnit?.id)
    if (next) focusUnit(next)
    else { setNotice('所有记忆片段均已核对，可以保存并进入下载步骤。'); document.getElementById('palace-save-step')?.scrollIntoView({ block: 'center' }); document.getElementById('palace-final-save')?.focus() }
  }
  function loadDemo(id: string, withPlan: boolean) {
    const sample = SAMPLE_MATERIALS.find(item => item.id === id)!
    if (dirty && !window.confirm('这会替换本页未保存的输入和草案，已保存宫殿不会立即改变。继续？')) return
    sourceInputRevision.current++; setText(sample.source.text); setTitle(sample.source.title); setError(null)
    if (withPlan) { setSceneId('reading-hall'); accept(createAuthoredDemo(id)); setNotice('已载入预先编写的示例方案，不是实时模型生成。请先体验逐项核对。') }
    else { setPlan(null); setNotice('示例原文已载入。你可以自己编辑，再选择规则生成或已配置接口。') }
  }
  function generateOffline() {
    if (!sourceReady()) return
    try { accept(createOfflinePlan(text, title, scene)) } catch (e) { setError(e instanceof Error ? e.message : '无法生成草案，原文仍保留。') }
  }
  async function generateAi() {
    if (!sourceReady()) return
    try { validateEndpoint({ endpoint, model }, window.location.origin); buildModelInput({ text, title }, scene) } catch (e) { setError((e as Error).message); return }
    const destination = new URL(endpoint, window.location.origin).origin
    if (!window.confirm(`将把完整材料（${text.length} 字符）和场景地标说明发送给 ${destination}，使用你填写的模型 ${model}。请确认你有权分享这些材料，且已了解该接口的数据使用与费用。继续？`)) return
    const controller = new AbortController(); abort.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 90_000)
    setBusy('等待已配置接口生成方案…可随时取消。'); setError(null)
    try {
      const result = await requestPlan({ endpoint, model }, { text, title }, scene, { signal: controller.signal })
      if (!controller.signal.aborted && abort.current === controller) accept(result)
    }
    catch (e) { if (abort.current === controller) setError(controller.signal.aborted ? '请求已取消或超时。原文和现有草案仍保留。' : e instanceof Error ? e.message : '生成失败。') }
    finally { window.clearTimeout(timeout); if (abort.current === controller) { abort.current = null; setBusy(null) } }
  }
  function preparePromptPackage() {
    if (!sourceReady()) return
    try {
      const source = { text, title }, prompt = buildCopyablePrompt(source, scene)
      setPromptPackage({ text, title, sceneId, prompt, estimate: estimateTokens(prompt) })
      setError(null); setNotice('提示包已在本地准备。没有发送给任何模型；只有你复制或下载后自行使用。')
    } catch (e) { setError((e as Error).message) }
  }
  async function copyPrompt() {
    if (!activePrompt) return
    try { await navigator.clipboard.writeText(activePrompt.prompt); setNotice('已复制提示包。请到你已配置的模型工具使用，再把返回 JSON 粘贴到下方校验。') }
    catch { setError('浏览器未允许自动复制。请在下方文本框全选后手动复制。') }
  }
  async function downloadPrompt(schemaOnly = false) {
    if (!activePrompt && !schemaOnly) return
    try {
      const content = schemaOnly ? JSON.stringify(MODEL_PROPOSAL_SCHEMA, null, 2) : activePrompt!.prompt
      await exportFile({ fileName: schemaOnly ? 'locus-proposal-schema.json' : 'locus-source-indexed-prompt.txt', blob: new Blob([content], { type: schemaOnly ? 'application/json' : 'text/plain;charset=utf-8' }), dialogTitle: '保存本地模型提示包' })
      setNotice('文件已准备保存；没有调用模型。')
    } catch (e) { setError(e instanceof Error ? e.message : '保存文件失败，可手动复制下方文本。') }
  }
  async function downloadVisionPackage() {
    if (!sourceReady() || !visualContext) return
    const controller = new AbortController(); abort.current = controller
    setBusy('正在校验场景版本、图片尺寸与 SHA-256，再准备视觉提示包…'); setError(null)
    try {
      const result = await buildVisionContextBundle({ text, title }, scene, visualContext, { signal: controller.signal, loadAsset: async (path, signal) => {
        const url = new URL(path, new URL(import.meta.env.BASE_URL, window.location.href))
        if (url.origin !== window.location.origin) throw new Error('参考图必须来自当前应用，不会下载外部图片。')
        const response = await fetch(url, { signal, credentials: 'omit', redirect: 'error' })
        if (!response.ok) throw new Error(`参考图加载失败（HTTP ${response.status}）。`)
        const length = Number(response.headers.get('content-length') ?? 0)
        if (length > VISION_PACKAGE_LIMITS.maxImageBytes) throw new Error('参考图超过资源预算。')
        return new Uint8Array(await response.arrayBuffer())
      } })
      if (controller.signal.aborted || abort.current !== controller) return
      await exportFile({ fileName: result.fileName, blob: result.blob, dialogTitle: '保存可选视觉上下文包' })
      if (abort.current === controller) setNotice(`视觉提示包已准备，含 ${result.imageCount} 张经哈希核对的场景图。没有调用或验证任何视觉模型。`)
    } catch (error) { if (abort.current === controller) setError(controller.signal.aborted ? '视觉提示包准备已取消，原文不受影响。' : error instanceof Error ? error.message : '视觉提示包准备失败。') }
    finally { if (abort.current === controller) { abort.current = null; setBusy(null) } }
  }
  function updateUnit(id: string, patch: Partial<MeaningUnit>) {
    setPlan(p => p && ({ ...p, units: p.units.map(u => u.id === id ? { ...u, ...patch, reviewed: patch.reviewed ?? false } : u), cues: p.cues.map(c => c.unitId === id && patch.reviewed === undefined ? invalidateSemanticCue(c) : c) }))
  }
  function updateCue(id: string, patch: Partial<MnemonicCue>) {
    setPlan(p => p && ({ ...p, cues: p.cues.map(c => {
      if (c.unitId !== id) return c
      const unit = p.units.find(u => u.id === id)!, anchor = scene.anchors.find(a => a.id === (patch.anchorId ?? c.anchorId))!
      const imaginedAction = patch.imaginedAction ?? patch.action ?? c.imaginedAction ?? c.action
      const edited = { ...c, ...patch, action: imaginedAction, imaginedAction }
      return anchor ? initializeSemanticCue(unit, edited, anchor) : invalidateSemanticCue(edited)
    }) }))
  }
  function confirmUnit(id: string) {
    if (!plan) return
    try {
      const unit = plan.units.find(item => item.id === id)!, cue = plan.cues.find(item => item.unitId === id)!
      const anchor = scene.anchors.find(item => item.id === cue?.anchorId)
      if (!anchor) throw new Error('请先分配有效地标。')
      const confirmed = acknowledgeSemanticUnit(unit, cue, anchor)
      setPlan({ ...plan, units: plan.units.map(item => item.id === id ? confirmed.unit : item), cues: plan.cues.map(item => item.unitId === id ? confirmed.cue : item) })
    } catch (error) { setError(error instanceof Error ? error.message : String(error)) }
  }

  function updateSemanticReview(id: string, update: (review: CueSemanticReview) => CueSemanticReview) {
    setPlan(p => p && ({ ...p, cues: p.cues.map(c => {
      if (c.unitId !== id || !c.semanticReview) return c
      const semanticReview = update(c.semanticReview)
      return { ...c, semanticReview, reviewed: scene.anchors.some(anchor => anchor.id === c.anchorId) && semanticChecksComplete(semanticReview) }
    }) }))
  }

  function reassign(unit: MeaningUnit, anchorId: string) {
    const anchor = scene.anchors.find(a => a.id === anchorId)
    if (!anchor || !plan) return
    const current = plan.cues.find(c => c.unitId === unit.id)
    const next = current ? { ...current, anchorId, volumeId: anchor.cueVolume.id, spatialRelation: anchor.cueVolume.allowedRelations[0], relationId: anchor.cueVolume.allowedRelationIds[0], reviewed: false } : offlineCue(unit, anchor)
    setPlan({ ...plan, cues: [...plan.cues.filter(c => c.unitId !== unit.id), initializeSemanticCue(unit, next, anchor)] })
  }
  function adoptCurrentSceneVersion() {
    if (!plan || !window.confirm('采用当前场景版本并清除所有审核确认？原文和已有联想文字保留，失效地标仍需手动重新分配。')) return
    const cues = plan.cues.map(cue => {
      const unit = plan.units.find(u => u.id === cue.unitId)!, anchor = scene.anchors.find(a => a.id === cue.anchorId)
      return anchor ? initializeSemanticCue(unit, cue, anchor) : invalidateSemanticCue(cue)
    })
    setPlan({ ...plan, sceneVersion: scene.version, units: plan.units.map(unit => ({ ...unit, reviewed: false })), cues })
    setNotice('当前场景版本已选定。请重新检查全部地标和联想；没有自动替换失效的地标 ID。')
  }
  function restructure(units: MeaningUnit[]) {
    if (!plan) return
    setActiveUnitId(units[Math.min(activeIndex, units.length - 1)]?.id ?? null)
    setPlan({ ...plan, units: units.map(u => ({ ...u, reviewed: false })), cues: proposeOfflineCues(units, scene, plan.ordering), generation: { mode: 'offline-rule-based' } })
    setNotice('结构已更新。地标联想已重新生成离线规则草案，所有项需重新核对。'); setError(null)
  }
  async function save() {
    if (!plan || !palaceId || palace?.id !== palaceId || loadedFor !== palaceId) return
    const blockers = validatePlan(plan, scene, true)
    if (blockers.length) { setError(blockers[0].message); return }
    if (filledCount > 0 && !window.confirm(`将用已审核方案替换本宫殿现有 ${filledCount} 张卡片及其复习进度。上传文件会保留；仍对应原文单元的附件会继续绑定，失效或冲突的附件会留待重新分配。建议先导出备份。确定继续？`)) return
    setBusy('正在保存原文、方案与卡片…'); setError(null)
    const revision = sourceInputRevision.current
    try {
      await savePalacePlan(palaceId, plan, scene)
      if (!inputPageActive.current || revision !== sourceInputRevision.current) return
      if (readActiveReviewSession()?.palaceId === palaceId) clearActiveReviewSession()
      const [stored, cards] = await Promise.all([getPalace(palaceId), getCards(palaceId)])
      if (!inputPageActive.current || revision !== sourceInputRevision.current) return
      if (!stored) throw new Error('保存后未读到宫殿，请重试。')
      setPalace(stored); setPlan(stored.mnemonicPlan ?? plan); setText(stored.mnemonicPlan?.source.text ?? plan.source.text); setTitle(stored.mnemonicPlan?.source.title ?? plan.source.title); setSavedOutput({ palace: stored, cards }); setFilledCount(cards.length); setStep(3)
      setNotice('已保存。下一步下载独立 HTML，或先在应用中浏览。')
      window.scrollTo({ top: 0 })
    }
    catch (e) { if (inputPageActive.current && revision === sourceInputRevision.current) setError(e instanceof Error ? e.message : '保存失败，草案仍保留。') }
    finally { if (inputPageActive.current && revision === sourceInputRevision.current) setBusy(null) }
  }

  if (!loaded || loadedFor !== (palaceId ?? null)) return <main className="page__body" role="status">正在读取宫殿…</main>
  if (!palaceId || !palace) return <main className="page__body"><h1>无法打开材料工作台</h1><p role="alert">{error ?? '缺少宫殿参数。'}</p><Link className="btn" to="/">返回首页</Link></main>

  return <div className="page palace-workbench">
    <header className="page__header"><div className="palace-eyebrow">LOCUS / 材料工作台</div><h1 className="page__title">把含义，放进可以走过的地方</h1><p className="hint">{palace.title} · 材料与场景 → 逐片段核对 → 下载离线 HTML</p></header>
    <main className="page__body">
      <nav className="palace-steps" aria-label="制作进度"><button type="button" aria-current={step === 1 ? 'step' : undefined} disabled={!!busy} onClick={() => setStep(1)}>1 · 输入与场景</button><button type="button" aria-current={step === 2 ? 'step' : undefined} disabled={!plan || !!busy} onClick={() => setStep(2)}>2 · 逐片段核对</button><button type="button" aria-current={step === 3 ? 'step' : undefined} disabled={!!busy || !savedOutput || dirty || !plan || !!issues.length || approved !== plan.units.length} onClick={() => setStep(3)}>3 · 下载离线 HTML</button></nav>
      {error && <div className="palace-alert danger-text" role="alert">{error}</div>}
      <div className="hint" role="status" aria-live="polite">{busy ?? notice}{dirty && !busy ? ' · 有未保存修改，离开前请保存。' : ''}</div>
      {busy && <button className="btn" type="button" onClick={() => abort.current?.abort()} disabled={!abort.current}>取消请求</button>}
      {step === 1 ? <>
        <section className="cardbox"><h2 className="cardbox__title">放入你要记住的材料</h2><p className="hint">可以是段落、知识点、操作步骤或公式。材料只作为数据；其中的“指令”不会被执行。规则模式不调用 AI，不把每一行机械当作一个知识点。为保持审核界面可用，单次规则草案最多识别 240 个候选句段；超过时会保留原文并提示分章。</p>
          <label className="palace-field">材料名称<input value={title} disabled={!!busy} onChange={e => { sourceInputRevision.current++; setTitle(e.target.value); setPlan(null) }} maxLength={240} placeholder="例如：光合作用复习" /></label>
          <label className="palace-field">要记住的原文<textarea className="textarea palace-source" value={text} disabled={!!busy} onChange={e => { sourceInputRevision.current++; setText(e.target.value); setPlan(null) }} placeholder="粘贴完整原文。数字、单位、公式、否定和条件将保留供你核对。" /></label>
          <div className="row"><span className="hint">{text.length.toLocaleString()} 字符 · 不会按 60 行截断</span><button className="btn" type="button" disabled={!!busy} onClick={() => { if (!text || window.confirm('用示例替换当前输入？已有已保存卡片不会立即改变。')) { sourceInputRevision.current++; setText(EXAMPLE); setTitle('牛顿三定律示例'); setPlan(null) } }}>试用示例</button><label className="btn">读取 UTF-8 文本文件<input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={!!busy} className="palace-file" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError('文件过大，请选择小于 1 MB 的文本文件。'); return } const revision = ++sourceInputRevision.current; void file.arrayBuffer().then(decodeTextMaterial).then(value => { if (!inputPageActive.current || sourceInputRevision.current !== revision) return; setText(value); setTitle(file.name.slice(0, 240)); setPlan(null); setError(null) }).catch(error => { if (inputPageActive.current && sourceInputRevision.current === revision) setError(error instanceof Error ? error.message : '无法读取文件。请直接粘贴文本。') }); e.target.value = '' }} /></label></div>
        </section>
        <section className="cardbox"><h2 className="cardbox__title">从三个小样例开始</h2><p className="hint">这些方案是预先编写的示例，展示如何把含义对应到可见物体与地标，并非实时 LLM 结果。载入方案会使用拾光阅览馆；全部审核框仍由你亲自确认。</p><div className="palace-samples">{SAMPLE_MATERIALS.map(sample => <article key={sample.id}><span className="palace-badge">{sample.category}</span><h3>{sample.source.title}</h3><p className="hint">{sample.description}</p><div className="row"><button className="btn" disabled={!!busy} type="button" onClick={() => loadDemo(sample.id, false)}>仅载入原文</button><button className="btn" disabled={!!busy} type="button" onClick={() => loadDemo(sample.id, true)}>查看预编写方案</button></div>{sample.source.references && <details><summary>材料来源</summary>{sample.source.references.map(ref => <p key={ref.url}><a href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a></p>)}</details>}</article>)}</div></section>
        <section className="cardbox"><h2 className="cardbox__title">选择一个有固定位置的场景</h2><label className="palace-field">场景<select value={sceneId} disabled={!!busy} onChange={e => { sourceInputRevision.current++; setSceneId(e.target.value); setPlan(null) }}>{scenes.map(s => <option key={s.id} value={s.id}>{s.title}{s.id === 'dust2' ? '（旧版 v4，保留原位）' : ''}</option>)}</select></label><p>{scene.description}</p>{palace.customMap && <p className="hint">这个宫殿还有自定义地图「{palace.customMap.fileName}」。保存新方案后将使用本次选择的场景；旧地图文件保留在备份中，不用于当前联想定位。</p>}<p className="hint">{scene.familiarityPrompt} 当前 {scene.anchors.length} 个地标，最多容纳 {capacity} 个含义单元；超出时请按章节分成多个宫殿或合并真正相关的含义；不同章节分开练习，避免同一地标承载过多联想。不会丢弃原文。</p><details><summary>查看地标与场景限制</summary><ul>{scene.anchors.map(a => <li key={a.id}>{a.label}{a.calloutAliases?.length ? `（${a.calloutAliases.join(" / ")}）` : ""}：{a.landmark.description}；可用于 {a.affordances.join('、')}；容量 {Math.min(a.capacity, a.cueVolume.maxObjects)}</li>)}</ul>{scene.limitations.map((v, i) => <p className="hint" key={i}>{v}</p>)}</details></section>
        <section className="cardbox"><h2 className="cardbox__title">生成草案，再逐片段检查</h2><p className="hint">离线规则只做初步切分与视觉提示，不理解全部语义。请检查含义边界，并把通用意象改成与你的材料贴合的联想。</p><button className="btn primary" type="button" disabled={!!busy || !text.trim()} onClick={generateOffline}>生成离线规则草案</button><p className="hint">本应用尚未连接模型。也可以展开下面的工具，下载提示包或图片 ZIP，在你已有的模型工具中生成，再把 JSON 导回来。</p>
          <details className="palace-provider"><summary>使用已配置的模型接口 / 导入 AI 方案</summary><p className="hint">此版本没有预置 AI 服务。模型 ID 保持空白；如有可用的 Opus 5.5 或 Astra 接口，请填写服务端提供的真实 ID。这里不创建凭据、不保存密钥。接口必须实现 locus-semantic-proposal-v1 JSON 合约，并自行完成服务端鉴权。</p><label className="palace-field">已配置接口地址<input type="url" value={endpoint} disabled={!!busy} onChange={e => setEndpoint(e.target.value)} placeholder="https://你的服务/api/locus-plan" autoComplete="off" /></label><label className="palace-field">真实模型 ID（不预填）<input value={model} disabled={!!busy} onChange={e => setModel(e.target.value)} autoComplete="off" /></label><button className="btn" type="button" disabled={!!busy || !text.trim() || !endpoint || !model} onClick={() => void generateAi()}>确认发送材料并生成</button><p className="hint">接口与模型设置仅在本页内存中，不写入方案、备份或离线导出。调用前会显示接收方并询问你。</p><div className="palace-prompt-package"><h3>没有直连接口？用本地提示包</h3><p className="hint">模型只需选择来源片段 ID，不必计算中文或 emoji 的字符偏移。应用会在本地还原原文证据。单次最多 12,000 字符、240 个来源片段；同时检查场景容量与上下文估算，不静默截断。</p><button className="btn" type="button" disabled={!!busy || !text.trim()} onClick={preparePromptPackage}>准备提示词与 JSON Schema</button>{activePrompt && <><p className="hint">上下文启发式估算约 {activePrompt.estimate.toLocaleString()} tokens（不代表特定模型的实际分词）。提示包包含完整当前材料；交给外部模型前请自行确认分享权限与接收方。</p><label className="palace-field">可复制的提示包（含 JSON Schema）<textarea className="textarea" readOnly value={activePrompt.prompt} onFocus={e => e.currentTarget.select()} /></label><div className="row"><button className="btn" type="button" onClick={() => void copyPrompt()}>复制完整提示包</button><button className="btn" type="button" onClick={() => void downloadPrompt()}>下载提示包 .txt</button><button className="btn" type="button" onClick={() => void downloadPrompt(true)}>下载 Schema .json</button></div></>}</div><div className="palace-prompt-package"><h3>可选：给支持图片的模型提供场景参考</h3><p className="hint">视觉包包含实际场景总览、地标视图、相机坐标、场景版本、图片尺寸与 SHA-256，以及同一份提示词和 Schema。图片是 Blender 诊断渲染，不是浏览器截图；打包不调用模型，也不证明模型已经理解 3D 场景。使用时需解压并把实际图片附给支持视觉输入的工具；只粘贴文件名无效。</p><button className="btn" type="button" disabled={!!busy || !text.trim() || !visualContext} onClick={() => void downloadVisionPackage()}>下载视觉上下文 ZIP</button><p className="hint">{visualContext ? `${visualContext.title} · ${visualContext.sceneVersion} · ${visualContext.anchors.length + 1} 张版本匹配参考图；图片视觉 token 费用不计入文本估算。` : '当前场景尚无版本匹配的已核对参考图，视觉打包保持关闭。文字协议仍可使用。'}</p></div><label className="palace-field">粘贴模型返回的提案 JSON（或旧版完整方案）<textarea className="textarea" value={proposalJson} disabled={!!busy} onChange={e => setProposalJson(e.target.value)} placeholder='{"format":"locus-semantic-proposal-v1","units":[{"id":"u1","title":"…","question":"…","parts":[{"segmentId":"segment-001"}]}],"cues":[…]}' /></label><button className="btn" type="button" disabled={!!busy || !proposalJson.trim()} onClick={() => { if (!sourceReady()) return; try { accept(parsePlanJson(proposalJson, { text, title }, scene)) } catch (e) { setError((e as Error).message) } }}>校验并导入 JSON</button><details><summary>查看当前草案 JSON 格式示例</summary><p className="hint">先生成一份离线草案，再复制其结构供你的适配器使用。生成的内容始终视为未审核数据。</p><textarea className="textarea" readOnly aria-label="当前方案 JSON" value={plan ? JSON.stringify(plan, null, 2) : '尚无草案。请先点击“生成离线规则草案”。'} /></details></details>
        </section>
      </> : step === 2 && plan ? <>
        <section className="cardbox palace-summary"><h2 className="cardbox__title">一次核对一个记忆片段</h2>{plan.sceneVersion && plan.sceneVersion !== scene.version && <div className="palace-alert"><p>场景版本已变化：{plan.sceneVersion} → {scene.version}。原文和联想仍保留，不能沿用旧的空间确认。</p><button className="btn" type="button" disabled={!!busy} onClick={adoptCurrentSceneVersion}>采用当前版本并重新核对</button></div>}<p className="hint">记忆片段是一组需要回忆的意思；地标是场景里的固定位置；联想道具只是提醒你的创作，不是原文事实。</p><div className="palace-metrics"><span><strong>{plan.units.length}</strong>记忆片段</span><span><strong>{coverage?.percent}%</strong>原文覆盖</span><span><strong>{approved}/{plan.units.length}</strong>完成核对</span><span><strong>{new Set(plan.cues.map(c => c.anchorId)).size}</strong>使用地标</span></div><p className="hint">{plan.generation.mode === 'offline-rule-based' ? '当前为离线规则草案，不是大模型语义理解结果。' : plan.generation.mode === 'authored-demo' ? '当前为预先编写示例，不是实时模型生成。' : plan.generation.mode === 'structured-import' ? '当前为结构化导入草案，未验证其生成来源。' : `当前为模型辅助草案${plan.generation.model ? `（${plan.generation.model}）` : ''}，事实仍须核对。`} 原文顺序将保留在行走路线中；同一地标按单元顺序回忆。原文覆盖 100% 只说明文字没有遗漏，不能证明理解或联想正确；重点检查否定、数字边界和例外是否被倒置。创意联想不是原文事实。拆分或合并会重建全部联想为离线规则草案并清除审核状态。</p>{issues.length > 0 && <div id="palace-structural-issues" className="palace-alert" role="alert"><strong>保存前需处理：</strong><ul>{issues.slice(0, 3).map((i, n) => <li key={n}>{i.unitId ? `片段 ${plan.units.findIndex(unit => unit.id === i.unitId) + 1}：` : ''}{i.message}</li>)}</ul>{issues.length > 3 && <p>另外还有 {issues.length - 3} 项，请继续核对。</p>}</div>}<details><summary>查看完整原文（保留，不可在审核页改写）</summary><pre className="palace-evidence">{plan.source.text}</pre>{plan.source.references?.map(ref => <p key={ref.url}><a href={ref.url} target="_blank" rel="noreferrer">{ref.title}</a></p>)}</details></section>
        <nav className="palace-review-nav" aria-label="逐片段审核导航"><label>当前片段<select value={currentUnit?.id ?? ''} disabled={!!busy} onChange={e => focusUnit(e.target.value)}>{plan.units.map((unit, index) => <option key={unit.id} value={unit.id}>{index + 1}/{plan.units.length} · {unitReviewStatus(plan, unit.id).complete ? '已核对' : '待核对'} · {unit.title.slice(0, 18)}</option>)}</select></label><button className="btn" type="button" disabled={!!busy || activeIndex === 0} onClick={() => focusUnit(plan.units[activeIndex - 1].id)}>上一片段</button><button className="btn primary" type="button" disabled={!!busy} onClick={focusNextPending}>下一个待核对</button><button className="btn" type="button" disabled={!!busy || !currentCue || !scene.anchors.some(anchor => anchor.id === currentCue.anchorId) || (!!plan.sceneVersion && plan.sceneVersion !== scene.version)} onClick={() => currentUnit && setPreviewUnitId(currentUnit.id)}>预览当前地标与道具</button></nav>
        {currentStatus && <p className="hint" role="status">{currentStatus.complete ? '这个片段已完成核对。' : `当前还需：${currentStatus.pending.join('；')}。`} 原文子句：{currentStatus.sourceChecksDone}/{currentStatus.sourceChecksTotal} 条已确认。</p>}{currentUnit?.reviewed && currentCue && !currentCue.reviewed && semanticChecksComplete(currentCue.semanticReview) && <button className="btn" type="button" onClick={() => updateSemanticReview(currentUnit.id, review => review)}>确认本片段审核完成</button>}
        {plan.units.map((unit, index) => {
          if (index !== activeIndex) return null
          const cue = plan.cues.find(c => c.unitId === unit.id)
          const anchor = scene.anchors.find(a => a.id === cue?.anchorId)
          return <article className="cardbox palace-unit" key={unit.id} aria-labelledby={`heading-${unit.id}`}><div className="palace-unit-header"><h2 className="cardbox__title" id={`heading-${unit.id}`} tabIndex={-1}>记忆片段 {index + 1} / {plan.units.length}</h2><span className="palace-badge">{unit.reviewed && cue?.reviewed ? '已核对' : '待核对'}</span></div>
            <div className="palace-review-grid"><section><h3>必须记住的原文</h3><pre className="palace-evidence">{unit.facts}</pre><details><summary>查看原文位置</summary><p className="hint">原文范围：{unit.spans.map(s => `[${s.start}, ${s.end})`).join('、')}（UTF-16 偏移）</p></details>{unit.protectedTokens.length > 0 && <p className="palace-protected">重点核对：{unit.protectedTokens.join(' · ')}</p>}<p className="hint">标题：{unit.title}<br />回忆问题：{unit.question}</p><details><summary>修改提示标题或回忆问题</summary><label className="palace-field">片段标题（只是提示，不改写原文）<input value={unit.title} maxLength={240} disabled={!!busy} onChange={e => updateUnit(unit.id, { title: e.target.value })} /></label><label className="palace-field">回忆问题<textarea value={unit.question} maxLength={2000} disabled={!!busy} onChange={e => updateUnit(unit.id, { question: e.target.value })} /></label><label className="palace-check"><input type="checkbox" checked={unit.reviewed} disabled={!!busy} onChange={e => updateUnit(unit.id, { reviewed: e.target.checked })} />我已核对标题和问题与原文一致，且未遗漏数字、公式、条件与否定</label></details>
              <details><summary>调整含义边界：拆分 / 合并</summary><p className="hint">在下框点击或用方向键移动光标，选择含义边界。请勿拆开条件和结论。拆分后所有联想会重新生成。</p><label className="palace-field">点击原文设置拆分位置<textarea readOnly value={unit.facts} aria-label={`单元 ${index + 1} 拆分位置选择`} onSelect={e => { const cursor = e.currentTarget.selectionStart; setSplitAt(previous => ({ ...previous, [unit.id]: sourceOffsetAtCursor(unit, cursor) })) }} /></label><label className="palace-field">拆分位置<input type="number" min={unit.spans[0]?.start + 1} max={unit.spans.at(-1)!.end - 1} value={splitAt[unit.id] ?? Math.floor((unit.spans[0].start + unit.spans.at(-1)!.end) / 2)} onChange={e => setSplitAt({ ...splitAt, [unit.id]: Number(e.target.value) })} /></label><div className="row"><button className="btn" type="button" disabled={!!busy} onClick={() => { try { const parts = splitUnit(plan.source.text, unit, splitAt[unit.id] ?? Math.floor((unit.spans[0].start + unit.spans.at(-1)!.end) / 2)); restructure([...plan.units.slice(0, index), ...parts, ...plan.units.slice(index + 1)]) } catch (e) { setError((e as Error).message) } }}>在此拆分</button><button className="btn" type="button" disabled={!!busy || index === plan.units.length - 1} onClick={() => restructure([...plan.units.slice(0, index), mergeUnits(plan.source.text, unit, plan.units[index + 1]), ...plan.units.slice(index + 2)])}>与下一单元合并</button></div></details>
            </section><section><h3>帮助回忆的道具与想象</h3><label className="palace-field">地标<select value={cue?.anchorId ?? ''} disabled={!!busy} onChange={e => reassign(unit, e.target.value)}><option value="" disabled>尚未分配，请选择</option>{scene.anchors.map(a => <option key={a.id} value={a.id}>{a.label}（{plan.cues.filter(c => c.anchorId === a.id).length}/{Math.min(a.capacity, a.cueVolume.maxObjects)}）</option>)}</select></label>{anchor && <p className="hint">{anchor.landmark.description} · 可以 {anchor.affordances.join('、')}</p>}{cue ? <><div className="palace-cue-brief"><strong>{cue.object}</strong><p>想象情节：{cue.imaginedAction ?? cue.action}</p><p className="hint">联想理由：{cue.rationale}</p></div><details><summary>修改道具、情节或摆放方式</summary><label className="palace-field">联想物体<input value={cue.object} maxLength={1200} disabled={!!busy} onChange={e => updateCue(unit.id, { object: e.target.value })} /></label><label className="palace-field">想象的情节（不会自动变成物理动作）<textarea value={cue.action} maxLength={2400} disabled={!!busy} onChange={e => updateCue(unit.id, { action: e.target.value })} /></label><label className="palace-field">实际支持的摆放 / 运动方式<select value={cue.spatialRelation} disabled={!!busy} onChange={e => updateCue(unit.id, { spatialRelation: e.target.value, relationId: anchor?.cueVolume.allowedRelationIds[anchor.cueVolume.allowedRelations.indexOf(e.target.value)] })}>{anchor?.cueVolume.allowedRelations.map(r => <option key={r} value={r}>{r}</option>)}</select></label><label className="palace-field">整体联想理由（不是事实依据）<textarea value={cue.rationale} maxLength={4000} disabled={!!busy} onChange={e => updateCue(unit.id, { rationale: e.target.value })} /></label><div className="palace-visual-controls"><label className="palace-field">形状<select value={cue.visual.shape} disabled={!!busy} onChange={e => updateCue(unit.id, { visual: { ...cue.visual, shape: e.target.value as MnemonicCue['visual']['shape'] } })}>{Object.entries(CUE_SHAPE_LABELS).map(([shape, label]) => <option key={shape} value={shape}>{label}</option>)}</select></label><label className="palace-field">颜色<input type="color" value={cue.visual.color} disabled={!!busy} onChange={e => updateCue(unit.id, { visual: { ...cue.visual, color: e.target.value } })} /></label><label className="palace-field">运动<select value={cue.visual.motion} disabled={!!busy} onChange={e => updateCue(unit.id, { visual: { ...cue.visual, motion: e.target.value as MnemonicCue['visual']['motion'] } })}><option value="spin">旋转</option><option value="pulse">脉冲</option><option value="bounce">起伏</option><option value="none">无额外动画</option></select></label></div></details>{cue.semanticReview && <div className="palace-semantic-review"><h4>本段核对摘要</h4><p className="hint">请对照原文、实际画面和需要另行复述的细节；下方一次确认仅记录你对本段的判断。</p>{cue.semanticReview.sourceChecks.map(check => <div key={check.id}><pre className="palace-evidence">{check.quote}</pre><p>{check.explanation}</p></div>)}<p><strong>实际画面：</strong>{cue.renderedDescription}</p><p><strong>画面没有编码：</strong>{cue.semanticReview.notEncoded}</p><button className="btn primary" type="button" disabled={!!busy || !anchor || issues.some(issue => !issue.unitId || issue.unitId === unit.id) || !cue.semanticReview.notEncoded.trim() || cue.semanticReview.sourceChecks.some(check => !check.explanation.trim())} onClick={() => confirmUnit(unit.id)}>{unit.reviewed && cue.reviewed && semanticChecksComplete(cue.semanticReview) ? '已确认本段' : '我已核对原文、实际画面和未编码细节，确认本段'}</button><details><summary>修改映射或逐项查看确认记录</summary><h4>逐条核对：原文是否被联想带偏？</h4><p className="hint">类别是规则提示，可能漏掉授权、并列条件或例外。请读完整原文子句，不能只看标记。勾选记录你的审核，不是系统对语义正确性的证明。</p>{cue.semanticReview.sourceChecks.map(check => <div className="palace-semantic-row" key={check.id}><strong>{check.kinds.join(' · ')}</strong><pre className="palace-evidence">{check.quote}</pre><label className="palace-field">这段原文怎样被提醒？哪些要口头补全？<textarea value={check.explanation} maxLength={4000} disabled={!!busy} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, sourceChecks: review.sourceChecks.map(item => item.id === check.id ? { ...item, explanation: e.target.value, checked: false } : item), limitationsConfirmed: false }))} /></label><label className="palace-check"><input type="checkbox" checked={check.checked} disabled={!!busy || !check.explanation.trim()} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, sourceChecks: review.sourceChecks.map(item => item.id === check.id ? { ...item, checked: e.target.checked } : item) }))} />我逐句核对了含义、条件和关系；没有把否定、边界或例外倒置</label></div>)}{cue.semanticReview.sourceChecks.length > 1 && <label className="palace-check"><input type="checkbox" checked={cue.semanticReview.sourceChecks.every(check => check.checked)} disabled={!!busy || cue.semanticReview.sourceChecks.some(check => !check.explanation.trim())} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, sourceChecks: review.sourceChecks.map(check => ({ ...check, checked: e.target.checked })) }))} />我已逐条阅读并核对上方全部 {cue.semanticReview.sourceChecks.length} 条原文映射（仅批量记录这项确认，不代替下面的渲染与未编码检查）</label>}<h4>引擎实际会显示什么</h4><button className="btn" type="button" disabled={!!busy || !anchor || (!!plan.sceneVersion && plan.sceneVersion !== scene.version)} onClick={() => setPreviewUnitId(unit.id)}>在真实地标里预览这些道具</button><p className="palace-rendered-description">{cue.renderedDescription}</p><label className="palace-check"><input type="checkbox" checked={cue.semanticReview.renderedConfirmed} disabled={!!busy} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, renderedConfirmed: e.target.checked }))} />我已区分实际渲染说明与想象情节，不把未实现的动作当作已发生</label><label className="palace-field">视觉没有编码、必须另行复述的内容<textarea value={cue.semanticReview.notEncoded} maxLength={4000} disabled={!!busy} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, notEncoded: e.target.value, limitationsConfirmed: false }))} /></label><label className="palace-check"><input type="checkbox" checked={cue.semanticReview.limitationsConfirmed} disabled={!!busy || !cue.semanticReview.notEncoded.trim()} onChange={e => updateSemanticReview(unit.id, review => ({ ...review, limitationsConfirmed: e.target.checked }))} />我能补全这些未视觉编码的细节，不从道具数量、颜色或动作推断额外事实</label></details></div>}</> : <p className="palace-alert">地标容量不足，这个单元仍完整保留。请合并单元，或选择有空间的地标。</p>}</section></div>
          </article>
        })}
        <section className="cardbox palace-save" id="palace-save-step"><div><strong>{approved}/{plan.units.length} 个记忆片段已核对</strong><p className="hint">{issues.length ? '先处理上方列出的原文或地标问题。' : approved !== plan.units.length ? '点击“下一个待核对”，完成剩余片段的原文、画面和未编码细节确认。' : '现在可以保存，然后直接下载可独立打开的 HTML。'} 覆盖已有内容会再次询问。</p></div><div className="row">{approved < plan.units.length && <button className="btn" type="button" disabled={!!busy} onClick={focusNextPending}>继续核对下一片段</button>}<button id="palace-final-save" className="btn primary" type="button" disabled={!!busy || !!issues.length || approved !== plan.units.length} onClick={() => void save()}>保存并进入下载步骤</button></div></section>
      </> : step === 3 && savedOutput ? <section className="cardbox palace-result"><div className="palace-eyebrow">03 / 已保存，可以带走</div><h2 className="cardbox__title">下载你的独立记忆宫殿</h2><p>这份 HTML 会包含原文、场景、道具和必要资源。保存后可直接打开练习，不需要连接模型。</p><p className="hint">原文和附件也在文件中，请按材料保密级别保存。浏览器若不保留本地进度，可在 HTML 内导出进度 JSON。</p><ExportOfflineButton palace={savedOutput.palace} cards={savedOutput.cards} /><div className="row" style={{ marginTop: 18 }}><Link className="btn" to={`/palace/${palaceId}/map`}>先在应用里浏览 / 练习</Link><button className="btn" type="button" onClick={() => setStep(2)}>返回修改片段</button></div></section> : null}
      <div className="row"><Link className="btn" to={`/palace/${palaceId}/map`}>返回地图</Link><Link className="btn" to={`/palace/${palaceId}/import`}>文件导入 / 备份</Link><Link className="btn" to="/">首页</Link></div>
    </main>
    {plan && previewUnitId && <MnemonicContextPreview plan={plan} unitId={previewUnitId} onClose={() => setPreviewUnitId(null)} />}
  </div>
}
