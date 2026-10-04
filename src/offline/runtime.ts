import { attachmentRole } from '../lib/attachmentBindings'
import { sourceFingerprint } from '../lib/palaceModelProposal'
import * as T from 'three'
import { buildMnemonicCueGroup, animateMnemonicCueGroup, setMnemonicCueFocus } from '../three/mnemonicCues'
import { createSceneRouteGuide } from '../three/routeGuide'
import { getSceneDefinition, EXECUTABLE_CUE_RELATIONS, type CueRelationId } from '../lib/sceneRegistry'
import type { MnemonicCardData, PalacePlan } from '../lib/palaceTypes'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createReadingHallWorld } from '../three/readingHall'
import type { OfflinePalace, OfflineCard } from './types'
import { imagePlaneSize, fitAttachmentModel } from './attachments'
import { computeViewerViewport, fitSceneViewport } from './viewport'
import { PortableWalker } from './walkController'
import { fitAnchorFieldOfView } from '../three/anchorCamera'
import { mergeInitialProgress, validateProgress, type ProgressFile } from './progress'

const el = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E
const data = JSON.parse(el('palace-data').textContent!) as OfflinePalace
const allowed = new Set(data.cards.flatMap(c => c.unitIds))
if (data.draftPreview && window.parent !== window) window.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); window.parent.postMessage({ type: 'locus-preview-close' }, '*') } })
let progress: ProgressFile = { version: 1, palaceId: data.id, contentFingerprint: data.contentFingerprint, entries: Object.create(null) }
const initialProgress = validateProgress({ ...progress, entries: data.initialProgress ?? {} }, data.id, allowed, data.contentFingerprint).entries
progress = mergeInitialProgress(initialProgress, progress)
let persistent = true, unsavedProgress = false, pendingProgressSnapshot: string | null = null
const storageKey = 'locus-offline-v1:' + data.id + ':' + data.contentFingerprint
function status(text: string) { el('status').textContent = text }
try { if (data.draftPreview) throw new Error('Authoring preview keeps practice in memory'); const saved = localStorage.getItem(storageKey); if (saved) progress = mergeInitialProgress(initialProgress, validateProgress(JSON.parse(saved), data.id, allowed, data.contentFingerprint)); localStorage.setItem(storageKey, JSON.stringify(progress)) } catch { persistent = false }
function save() { pendingProgressSnapshot = null; el('confirm-progress-saved').hidden = true; unsavedProgress = !data.draftPreview; try { if (data.draftPreview) throw new Error('Temporary preview'); localStorage.setItem(storageKey, JSON.stringify(progress)); unsavedProgress = false } catch { persistent = false } updateProgress() }
window.addEventListener('beforeunload', event => { if (unsavedProgress) { event.preventDefault(); event.returnValue = '' } })
function updateProgress() {
  if (data.sceneTour) { el('progress').textContent = '场景熟悉模式 · 没有载入学习材料'; return }
  const n = Object.values(progress.entries).filter(x => x.rating === 2 && x.reviews > 0).length
  el('progress').textContent = `自评记住 ${n}/${allowed.size} 材料单元${data.draftPreview ? ' · 创作预览：评分不写入工作台，关闭会清空' : persistent ? ' · 已本地保存' : ' · 浏览器存储不可用，请导出进度'}`
}
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000) }
el('save-progress').onclick = () => { pendingProgressSnapshot = JSON.stringify(progress); download(new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' }), 'locus-progress.json'); el('confirm-progress-saved').hidden = false; status('进度文件已准备下载。请确认文件真的保存后，再点击确认；下载发起不代表已保存。') }
el('confirm-progress-saved').onclick = () => { if (pendingProgressSnapshot !== JSON.stringify(progress)) return; unsavedProgress = false; pendingProgressSnapshot = null; el('confirm-progress-saved').hidden = true; status('已按你的确认记录进度文件保存完成') }
el<HTMLInputElement>('restore-progress').onchange = async event => {
  const input = event.target as HTMLInputElement
  try { const file = input.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) throw new Error('进度文件超过 1 MB'); progress = validateProgress(JSON.parse(await file.text()), data.id, allowed, data.contentFingerprint); progress.seedResetAt = new Date().toISOString(); save(); status('进度已恢复') } catch (e) { status('恢复失败：' + String(e)) } finally { input.value = '' }
}
el('title').textContent = (data.sceneTour ? '场景熟悉 · ' : data.draftPreview ? '草稿预览 · ' : '') + data.title
el('credits').textContent = data.attribution.join('\n')
const plan = data.plan as PalacePlan | undefined
const planSourceFingerprint = plan ? sourceFingerprint(plan.source) : undefined
el('source-audit').hidden = !plan
if (plan) { const modes = { 'authored-demo': '人工策划体验样例（不是实时模型生成）', 'offline-rule-based': '离线规则生成的联想线索', 'model-assisted': '模型辅助生成，原文事实与创作线索分开保存', 'structured-import': '结构化规划导入' }; el('provenance').textContent = (modes[plan.generation.mode] ?? '材料规划') + (plan.units.some(u => !u.reviewed) || plan.cues.some(c => !c.reviewed) ? ' · 尚未逐项确认' : ' · 保留逐项确认标记') }
if (plan) { el('source-text').textContent = `${plan.source.title}\n\n${plan.source.text}\n\n${plan.source.references?.map(r => r.title + ' · ' + r.url).join('\n') ?? ''}`; el('save-plan').onclick = () => download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), 'locus-source-audit.json') }
if (data.chapterOrigin) {
  const origin = data.chapterOrigin
  el('provenance').textContent += ` · ${origin.chapterId} / ${origin.chapterCount}章 · 原文范围[${origin.start}, ${origin.end}) · 本文件只练习本章`
  el('source-text').textContent += `\n\n完整来源名称：${origin.sourceTitle}\n原文范围：[${origin.start}, ${origin.end}) / ${origin.totalCharacters}\n来源指纹：${origin.sourceFingerprint}\n章节布局指纹：${origin.collectionFingerprint}\n本文件仅含本章材料，不含其他章节原文。复用场景时请分章练习，避免多章同时占用同一地标。`
  el('save-plan').onclick = () => download(new Blob([JSON.stringify({ plan, chapterOrigin: origin }, null, 2)], { type: 'application/json' }), 'locus-chapter-source-audit.json')
}
if (data.unassignedAttachmentCount) el('provenance').textContent += ` · ${data.unassignedAttachmentCount} 个未绑定附件未打包，请在原应用项目备份中保留并重新绑定`
let attachmentIndex = -1
let unitIndex = 0; const attempted = new Set<string>(); let reviewQueue: { card: number; unit: number }[] | null = null
let index = 0, revealed = false, yaw = 0, pitch = 0
let walker: PortableWalker | undefined, walkingGuide: T.Group | undefined
let scene: T.Scene, camera: T.PerspectiveCamera, renderer: T.WebGLRenderer
let pointer: { x: number; y: number; id: number } | null = null
const keys = new Set<string>(), selectable: T.Object3D[] = [], animations: T.Group[] = []
const attachments = new Map<number, T.Group>(), cueGroups = new Map<number, T.Group>()
const anchorById = new Map(data.anchors.map(a => [a.id, a]))
const assetById = new Map(data.assets.map(a => [a.id, a]))
function bytes(base64: string) { const raw = atob(base64); const b = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i); return b }
function textureLabel(text: string) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#0b2028'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#f2dd9a'; ctx.font = 'bold 38px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text.slice(0, 22), 256, 78, 490)
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace
  return new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false })
}
function current(): OfflineCard { return data.cards[index] }
function unit() { const c = current(); return c.units?.[unitIndex] ?? { id: c.unitIds[unitIndex] ?? c.unitIds[0], question: c.prompt, facts: c.answer } }
function showUnit() { revealed = false; attachmentIndex = firstCueIndex(current(), unit().id); refreshAttachmentMenu(); el('question').textContent = data.sceneTour ? '观察地标的轮廓、材质与周围环境，沿路线熟悉空间。编号标签是导览标注。' : `请回忆此处第 ${unitIndex + 1}/${current().unitIds.length} 个材料单元的原文要点、数字与关系。选择生成道具时，当前单元用亮色强调；其他道具保留为暗色环境。`; el('answer').textContent = ''; el('answer').hidden = true; el('cue-text').textContent = ''; el('cue-text').hidden = true; el('ratings').hidden = true; el('reveal').textContent = '显示原文答案与联想说明'; el<HTMLSelectElement>('unit-select').value = String(unitIndex) }
el<HTMLSelectElement>('unit-select').onchange = e => { unitIndex = Number((e.target as HTMLSelectElement).value); showUnit() }
let viewportCache = '', panelChoiceMade = false, autoCollapsedForSize = false, sceneViewportTooSmall = false
function layoutViewport() {
  if (!renderer || !camera) return
  const header = document.querySelector('header')!.getBoundingClientRect(); let panel = el('practice').getBoundingClientRect()
  let rect = computeViewerViewport(innerWidth, innerHeight, header.bottom, { left: panel.left, top: panel.top, width: panel.width, height: panel.height }, el('practice').classList.contains('collapsed'))
  if (!panelChoiceMade && !el('practice').classList.contains('collapsed') && rect.height < 160) { el('practice').classList.add('collapsed'); el('toggle-panel').textContent = '打开练习面板'; autoCollapsedForSize = true; panel = el('practice').getBoundingClientRect(); rect = computeViewerViewport(innerWidth, innerHeight, header.bottom, { left: panel.left, top: panel.top, width: panel.width, height: panel.height }, true) }
  if (data.sceneId === 'dust2-callouts') rect = fitSceneViewport(rect)
  sceneViewportTooSmall = rect.height < 160 || rect.width < 240
  const key = JSON.stringify(rect)
  if (key !== viewportCache) {
    viewportCache = key
    Object.assign(el('world').style, { left: rect.left + 'px', top: rect.top + 'px', right: 'auto', bottom: 'auto', width: rect.width + 'px', height: rect.height + 'px' })
    renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / rect.height
    Object.assign(el('cross').style, { left: (rect.left + rect.width / 2) + 'px', top: (rect.top + rect.height / 2) + 'px' }); fitCurrentAnchor()
  }
}
function fitCurrentAnchor() {
  if (!camera || !current()) return
  const a = anchorById.get(current().anchorId)!; const point = (p: [number, number, number]) => ({ x: p[0], y: p[1], z: p[2] })
  const framing = fitAnchorFieldOfView({ approach: { eye: point(a.eye), lookAt: point(a.lookAt) }, cueVolume: a.cueVolume ?? { center: point(a.position), size: { x: 1.5, y: 1.5, z: 1.5 } }, landmark: { focusPoint: a.focusPoint ? point(a.focusPoint) : undefined, framingBounds: a.framingBounds } }, camera.aspect)
  camera.fov = framing.fov; camera.updateProjectionMatrix()
  el('framing-warning').textContent = (framing.fits ? '' : '当前画面较窄，部分地标可能靠近边缘。可横屏、收起面板，或使用文字线索；不会把视点移入墙体。') + (sceneViewportTooSmall ? ' 可见场景区域较小，建议收起面板或扩大窗口再观察道具。' : '')
}
function showCard(next: number, teleport = true) {
  if (!data.cards.length) return
  index = (next + data.cards.length) % data.cards.length; revealed = false; for (const group of attachments.values()) group.visible = false
  const card = current(), anchor = anchorById.get(card.anchorId)!
  el('anchor-title').textContent = `${index + 1}/${data.cards.length} · ${anchor.label}`
  el('context').textContent = anchor.context
  unitIndex = 0; const select = el<HTMLSelectElement>('unit-select'); select.replaceChildren(); card.unitIds.forEach((_, n) => { const option = document.createElement('option'); option.value = String(n); option.textContent = `材料单元 ${n + 1}`; select.append(option) }); showUnit()
  el('answer').textContent = ''; el('answer').hidden = true
  el('cue-text').textContent = ''; el('cue-text').hidden = true
  el('reveal').textContent = '显示原文答案与联想说明'
  el('ratings').hidden = true
  if (teleport && camera) { camera.position.fromArray(anchor.eye); walker?.teleportEye(camera.position); if (walker) camera.position.copy(walker.eye()); camera.lookAt(new T.Vector3(...anchor.lookAt)); const e = new T.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); yaw = e.y; pitch = e.x }
  el<HTMLSelectElement>('route').value = String(index); if (camera) fitCurrentAnchor(); drawWalkingOverview()
}
el('previous').onclick = () => showCard(index - 1)
el('next').onclick = () => showCard(index + 1)
el('reset-view').onclick = () => showCard(index)
function cardAssets(card: OfflineCard) { return [...card.imageIds, ...(card.modelId ? [card.modelId] : [])] }
function roleFor(card: OfflineCard, assetId: string, unitId: string) { return attachmentRole({ attachmentBindings: card.attachmentBindings, mnemonic: plan ? { unitIds: card.unitIds, sourceFingerprint: planSourceFingerprint } : undefined }, assetId, unitId) }
function firstCueIndex(card: OfflineCard, unitId: string) { return cardAssets(card).findIndex(id => roleFor(card, id, unitId) === 'cue') }
function refreshAttachmentMenu() {
  const select = el<HTMLSelectElement>('attachment-select'), ids = cardAssets(current()), active = unit().id
  const permitted = (n: number) => { const role = roleFor(current(), ids[n], active); return role === 'cue' || (revealed && role === 'reference') }
  if (attachmentIndex >= 0 && !permitted(attachmentIndex)) attachmentIndex = firstCueIndex(current(), active)
  select.replaceChildren(); const generated = document.createElement('option'); generated.value = '-1'; generated.textContent = '生成道具（当前单元高亮）'; select.append(generated)
  ids.forEach((id, n) => { if (!permitted(n)) return; const option = document.createElement('option'); option.value = String(n); option.textContent = `${roleFor(current(), id, active) === 'cue' ? '助记线索' : '答案参考'} · ${n < current().imageIds.length ? `图片 ${n + 1}` : '静态模型'}`; select.append(option) })
  select.hidden = select.options.length <= 1; select.value = String(attachmentIndex); showAttachment()
}
function showAttachment() {
  for (const [cardIndex, group] of attachments) {
    const card = data.cards[cardIndex], active = cardIndex === index ? unit().id : card.unitIds[0], chosen = cardIndex === index ? attachmentIndex : firstCueIndex(card, active)
    const assetId = cardAssets(card)[chosen], role = assetId ? roleFor(card, assetId, active) : null
    group.visible = chosen >= 0 && (role === 'cue' || (revealed && cardIndex === index && role === 'reference'))
    const cues = cueGroups.get(cardIndex); if (cues) { cues.visible = !group.visible; setMnemonicCueFocus(cues, cardIndex === index ? active : null) }
    group.children.forEach((child, n) => { child.visible = n === chosen })
  }
}
el<HTMLSelectElement>('attachment-select').onchange = e => { attachmentIndex = Number((e.target as HTMLSelectElement).value); showAttachment() }
el('reveal').onclick = () => {
  revealed = !revealed; refreshAttachmentMenu()
  el('answer').hidden = !revealed; el('cue-text').hidden = !revealed; el('ratings').hidden = !revealed || !!data.sceneTour
  el('answer').textContent = revealed ? '原文事实（核对答案）\n' + unit().facts + '\n\n问题：' + unit().question + '\n\n来源：' + current().provenance : ''
  const creative = current().cues?.filter((c, i) => c.unitId ? c.unitId === unit().id : i === unitIndex).map(c => `${c.object}\n生成道具默认呈现：${c.renderedDescription ?? EXECUTABLE_CUE_RELATIONS[c.relationId as CueRelationId] ?? '旧版线索；仅保证有界陈列与基础动画'}\n想象中的故事：${c.imaginedAction ?? c.action}\n为什么：${c.rationale}\n未自动编码、仍需补全：${c.semanticReview?.notEncoded ?? '请逐字核对原文，几何道具不自动显示原文细节。'}\n${c.semanticReview?.sourceChecks.map(s => `原文核对：${s.quote}\n回忆方法：${s.explanation}`).join('\n') ?? ''}`).join('\n')
  el('cue-text').textContent = revealed ? (creative ? '创作联想（不是原文事实）\n' + creative : '用户补充备注（未标为原文证据）\n' + current().cue) : ''
  el('reveal').textContent = revealed ? '隐藏答案，再回忆一次' : '显示原文答案与联想说明'
}
for (const rating of [0, 1, 2] as const) el('rate-' + rating).onclick = () => {
  if (!revealed) return
  const id = unit().id; progress.entries[id] = { rating, reviews: (progress.entries[id]?.reviews ?? 0) + 1, updatedAt: new Date().toISOString() }; attempted.add(id); save()
  el('session-status').textContent = attempted.size === allowed.size ? '本轮完成！可以重练未记住的单元，或继续自由回忆。' : `本轮已练习 ${attempted.size}/${allowed.size} 个单元`
  if (reviewQueue) { const next = reviewQueue.shift(); if (next) { showCard(next.card); unitIndex = next.unit; showUnit() } else { reviewQueue = null; el('session-status').textContent = '未记住单元复习完成。'; showUnit() } }
  else if (unitIndex + 1 < current().unitIds.length) { unitIndex++; showUnit() } else showCard(index + 1)
}
el('repeat-missed').onclick = () => { reviewQueue = data.cards.flatMap((c, card) => c.unitIds.map((id, unit) => ({ id, card, unit }))).filter(x => progress.entries[x.id]?.rating !== 2 || !progress.entries[x.id]?.reviews); const first = reviewQueue.shift(); if (!first) { reviewQueue = null; status('所有单元均已标记记住。'); return } showCard(first.card); unitIndex = first.unit; showUnit(); status('正在重练未记住的材料单元') }
el('reset-progress').onclick = () => { if (!confirm('重置这个宫殿的本地练习进度？建议先导出进度备份。')) return; progress.entries = Object.create(null); progress.seedResetAt = new Date().toISOString(); attempted.clear(); reviewQueue = null; save(); el('session-status').textContent = ''; showCard(0); status('进度已重置') }
const route = el<HTMLSelectElement>('route')
let routeGroup: HTMLOptGroupElement | null = null
let routeZone: string | undefined
data.cards.forEach((card, i) => {
  const anchor = anchorById.get(card.anchorId), o = document.createElement('option')
  o.value = String(i); o.textContent = `${i + 1}. ${anchor?.label ?? card.anchorId}${anchor?.calloutAliases?.length ? ` · ${anchor.calloutAliases.join(' / ')}` : ''}`
  if (anchor?.zone && (anchor.zone !== routeZone || !routeGroup)) { routeGroup = document.createElement('optgroup'); routeGroup.label = anchor.zone; route.append(routeGroup) }
  if (!anchor?.zone) routeGroup = null
  routeZone = anchor?.zone
  ;(routeGroup ?? route).append(o)
})
route.onchange = () => showCard(Number(route.value))
el('toggle-panel').onclick = () => { panelChoiceMade = true; autoCollapsedForSize = false; el('practice').classList.toggle('collapsed'); el('toggle-panel').textContent = el('practice').classList.contains('collapsed') ? '打开练习面板' : '收起练习面板'; layoutViewport() }
const routeMarkers: { x: number; y: number; anchorId: string }[] = []
function drawWalkingOverview() {
  try {
  const walking = data.walkingRoute
  el('walking-overview').hidden = !walking
  if (!walking) return
  el('walking-proof').textContent = `约 ${Math.round(walking.totalMeters)} 米 · ${data.anchors.length} 个地标。已通过不瞬移的 CPU 胶囊控制器回放；浏览器实际行走仍需验证。`
  const canvas = el<HTMLCanvasElement>('walking-canvas'), ctx = canvas.getContext?.('2d')
  if (!ctx) return
  const points = walking.legs.flatMap(leg => leg.waypoints)
  if (!points.length) return
  const minX = Math.min(...points.map(p => p[0])) - 2, maxX = Math.max(...points.map(p => p[0])) + 2, minZ = Math.min(...points.map(p => p[2])) - 2, maxZ = Math.max(...points.map(p => p[2])) + 2
  const scale = Math.min(560 / (maxX - minX), 320 / (maxZ - minZ)), originX = (600 - (maxX - minX) * scale) / 2, originY = (360 - (maxZ - minZ) * scale) / 2
  const xy = (x: number, z: number) => [originX + (x - minX) * scale, originY + (z - minZ) * scale]
  ctx.fillStyle = '#102028'; ctx.fillRect(0, 0, 600, 360); ctx.lineWidth = 2
  walking.legs.forEach((leg, i) => { ctx.strokeStyle = i % 2 ? '#bdb58d' : '#80c9b3'; ctx.beginPath(); leg.waypoints.forEach((p, n) => { const [x, y] = xy(p[0], p[2]); if (n) ctx.lineTo(x, y); else ctx.moveTo(x, y) }); ctx.stroke() })
  routeMarkers.length = 0
  data.anchors.forEach((anchor, i) => { const [x, y] = xy(anchor.eye[0], anchor.eye[2]); routeMarkers.push({ x, y, anchorId: anchor.id }); ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = anchor.id === current()?.anchorId ? '#d9b975' : '#245746'; ctx.fill(); ctx.strokeStyle = '#e8d7a5'; ctx.stroke(); ctx.fillStyle = anchor.id === current()?.anchorId ? '#172c2a' : '#fff4d7'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), x, y + 3.5) })
  } catch { el('walking-canvas').hidden = true; el('walking-proof').textContent += ' 当前设备无法绘制路线示意，可使用地标下拉列表。' }
}
el('toggle-walking-guide').onclick = () => { if (!walkingGuide) { status('当前 3D 场景尚未就绪；仍可查看路线示意和文字材料'); return } walkingGuide.visible = !walkingGuide.visible; el('toggle-walking-guide').textContent = walkingGuide.visible ? '隐藏 3D 步行引导' : '显示 3D 步行引导' }
el<HTMLCanvasElement>('walking-canvas').onclick = event => { const canvas = el<HTMLCanvasElement>('walking-canvas'), rect = canvas.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * 600, y = (event.clientY - rect.top) / rect.height * 360; const marker = routeMarkers.find(m => Math.hypot(x - m.x, y - m.y) < 16); if (!marker) return; const cardIndex = data.cards.findIndex(c => c.anchorId === marker.anchorId); if (cardIndex >= 0) showCard(cardIndex); else status('此地标尚未绑定材料；可以沿步行引导观察它') }
updateProgress(); showCard(0, false)


const textureCache = new Map<string, Promise<T.Texture>>()
function assetTexture(id: string) { const asset = assetById.get(id); if (!asset) throw new Error('缺少图片附件：' + id); let result = textureCache.get(id); if (!result) { result = new T.TextureLoader().loadAsync(`data:${asset.mime};base64,${asset.base64}`).then(texture => { texture.colorSpace = T.SRGBColorSpace; return texture }); textureCache.set(id, result) } return result }
const glbCache = new Map<string, Promise<T.Group>>()
async function glb(assetId: string) {
  const a = assetById.get(assetId); if (!a) throw new Error('缺少内嵌模型：' + assetId)
  let result = glbCache.get(assetId); if (!result) { result = new GLTFLoader().parseAsync(bytes(a.base64).buffer, '').then(gltf => gltf.scene); glbCache.set(assetId, result) }
  return { scene: cloneSkeleton(await result) }
}
async function init() {
  renderer = new T.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); renderer.setSize(innerWidth, innerHeight); renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2
  el('world').append(renderer.domElement)
  scene = new T.Scene(); scene.background = new T.Color('#17252f'); scene.add(new T.HemisphereLight(0xf7ead4, 0x394751, 2.4)); const sun = new T.DirectionalLight(0xffedce, 2.5); sun.position.set(7, 15, 4); scene.add(sun)
  camera = new T.PerspectiveCamera(70, innerWidth / innerHeight, .04, 800); camera.rotation.order = 'YXZ'
  status('正在还原内嵌场景与碰撞数据…')
  let collisionRoot: T.Object3D
  if (data.sceneAssetId) {
    const root = (await glb(data.sceneAssetId)).scene
    const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()); const s = (data.sceneTargetSpan ?? 200) / Math.max(size.x, size.z); root.scale.multiplyScalar(s); root.updateMatrixWorld(true)
    const b = new T.Box3().setFromObject(root), c = b.getCenter(new T.Vector3()); root.position.add(new T.Vector3(-c.x, -b.min.y, -c.z)); scene.add(root); collisionRoot = root
  } else { const hall = createReadingHallWorld({ batchStatic: true }); scene.add(hall.group); collisionRoot = hall.group.getObjectByName('COLLISION') ?? hall.group }
  walker = new PortableWalker(collisionRoot)
  if (data.walkingRoute) { const definition = getSceneDefinition(data.sceneId); walkingGuide = createSceneRouteGuide({ ...definition, version: data.sceneVersion ?? definition.version, route: { ...definition.route, walking: data.walkingRoute } }); walkingGuide.visible = !!data.sceneTour; el('toggle-walking-guide').textContent = walkingGuide.visible ? '隐藏 3D 步行引导' : '显示 3D 步行引导'; scene.add(walkingGuide) }
  for (let i = 0; i < data.cards.length; i++) {
    status(`正在还原记忆点 ${i + 1}/${data.cards.length} 的道具与附件…`)
    const card = data.cards[i], a = anchorById.get(card.anchorId)!, group = new T.Group(); group.position.fromArray(a.position); group.userData.cardIndex = i; scene.add(group)
    const cues = (data.sceneTour ? [] : card.cues?.length ? card.cues : [{ object: '回忆提示环', action: '', relation: '', rationale: '', shape: 'ring', color: '#dbb56f', motion: 'none' }]).map((c, j) => ({ relationId: 'relationId' in c ? c.relationId : undefined, unitId: card.unitIds[j] ?? card.unitIds[0], volumeId: a.cueVolume?.id ?? a.id, object: c.object, action: c.action, spatialRelation: c.relation, rationale: c.rationale, visual: { shape: c.shape, color: c.color, motion: c.motion } })) as MnemonicCardData['cues']
    const volume = a.cueVolume ?? { id: a.id, center: { x: a.position[0], y: a.position[1], z: a.position[2] }, size: { x: 1.5, y: 1.5, z: 1.5 }, maxObjects: 3, allowedRelations: [], allowedRelationIds: [] }
    const props = buildMnemonicCueGroup({ cues }, { id: a.id, cueVolume: volume, approach: { eye: { x: a.eye[0], y: a.eye[1], z: a.eye[2] } } }); props.position.set(0, 0, 0); props.traverse(o => { o.userData.cardIndex = i; if (o instanceof T.Mesh) selectable.push(o) }); group.add(props); animations.push(props); cueGroups.set(i, props)
    const label = new T.Mesh(new T.PlaneGeometry(1.6, .4), textureLabel(`${i + 1} · ${a.label}`)); label.position.set(0, .72, 0); label.lookAt(new T.Vector3(...a.eye).sub(group.position)); group.add(label); label.userData.cardIndex = i; selectable.push(label)
    const attached = new T.Group(); attached.visible = false; group.add(attached); attachments.set(i, attached)
    for (let j = 0; j < card.imageIds.length; j++) {
      const asset = assetById.get(card.imageIds[j]); if (!asset) throw new Error('缺少图片附件')
      const texture = await assetTexture(asset.id)
      const pictureImage = texture.image as HTMLImageElement; const aspect = pictureImage.width / pictureImage.height
      const { width, height } = imagePlaneSize(aspect, volume.size)
      const picture = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false })); picture.lookAt(new T.Vector3(...a.eye).sub(group.position)); attached.add(picture); picture.userData.cardIndex = i; selectable.push(picture)

    }
    if (card.modelId) {
      const model = (await glb(card.modelId)).scene; fitAttachmentModel(model, volume.size, card.modelScale ?? 1); attached.add(model)
    }
    attached.children.forEach((child, n) => { child.visible = n === 0 })

  }
  const start = data.draftPreview && data.previewSelection ? Math.max(0, data.cards.findIndex(c => c.anchorId === data.previewSelection!.anchorId)) : 0
  showCard(start); if (data.draftPreview && data.previewSelection?.unitId) { unitIndex = Math.max(0, current().unitIds.indexOf(data.previewSelection.unitId)); showUnit() } layoutViewport()
  if (data.draftPreview && data.previewSelection?.assetId) { el('reveal').click(); const id = data.previewSelection.assetId; attachmentIndex = current().imageIds.indexOf(id); if (current().modelId === id) attachmentIndex = current().imageIds.length; el<HTMLSelectElement>('attachment-select').value = String(attachmentIndex); showAttachment() }
  status('离线就绪 · 拖动画面转向；WASD / 方向键移动；左右按钮按顺序回忆' + (autoCollapsedForSize ? ' · 小屏先展示场景，点「打开练习面板」开始回忆' : ''))
  let graphicsLost = false
  const canvas = renderer.domElement; canvas.style.touchAction = 'none'; canvas.tabIndex = 0; canvas.setAttribute('aria-label', '三维场景。聚焦后使用 WASD 或方向键移动，拖动画面转向。按 Tab 进入文字与练习控制。'); canvas.onblur = () => keys.clear()
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); graphicsLost = true; status('3D 显存上下文丢失。材料练习仍可用；请先导出进度，再刷新页面重试。') })
  canvas.addEventListener('webglcontextrestored', () => { graphicsLost = false; status('3D 显示已恢复') })
  canvas.onpointerdown = e => { canvas.focus({ preventScroll: true }); pointer = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId) }
  canvas.onpointermove = e => { if (!pointer || pointer.id !== e.pointerId) return; yaw -= (e.clientX - pointer.x) * .004; pitch = T.MathUtils.clamp(pitch - (e.clientY - pointer.y) * .004, -1.35, 1.35); pointer.x = e.clientX; pointer.y = e.clientY }
  canvas.onpointerup = canvas.onpointercancel = () => { pointer = null }
  canvas.ondblclick = e => { const ray = new T.Raycaster(); const bounds = canvas.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((e.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (e.clientY - bounds.top) / bounds.height * 2), camera); const hit = ray.intersectObjects(selectable.filter(o => { let parent: T.Object3D | null = o; while (parent) { if (!parent.visible) return false; parent = parent.parent } return true }))[0]; if (hit) { const obstruction = ray.intersectObject(collisionRoot, true)[0]; if (!obstruction || obstruction.distance + .05 >= hit.distance) showCard(hit.object.userData.cardIndex) } }
  window.addEventListener('keydown', e => { if ((e.target as HTMLElement).closest('input,select,textarea,button')) return; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); keys.add(e.key.toLowerCase()) })
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); window.addEventListener('blur', () => keys.clear()); document.addEventListener('visibilitychange', () => keys.clear())
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-move]')) { const key = button.dataset.move!; button.onpointerdown = e => { keys.add(key); button.setPointerCapture(e.pointerId) }; button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => keys.delete(key); button.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); keys.add(key) } }; button.onkeyup = e => { if (e.key === ' ' || e.key === 'Enter') keys.delete(key) }; button.onblur = () => keys.delete(key) }
  window.onresize = layoutViewport
  if (typeof ResizeObserver === 'function') { const observer = new ResizeObserver(layoutViewport); observer.observe(el('practice')); observer.observe(document.querySelector('header')!) }
  let last = performance.now()
  function frame(t: number) { requestAnimationFrame(frame); if (graphicsLost) return; const dt = Math.min((t - last) / 1000, .05); last = t; camera.rotation.set(pitch, yaw, 0)
    const f = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')), side = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
    if (walker) camera.position.copy(walker.step(dt, f, side, yaw))
    for (const group of animations) animateMnemonicCueGroup(group, t / 1000, matchMedia('(prefers-reduced-motion: reduce)').matches)
    renderer.render(scene, camera)
  }
  requestAnimationFrame(frame)
}
init().catch(error => { status('3D 加载失败：' + String(error) + '。仍可使用下方材料练习与进度导出。'); el('error').textContent = '当前设备可能不支持 WebGL 或资源内存不足。原文与练习仍可用。' })
