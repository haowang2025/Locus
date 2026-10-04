import { isDust2Scene, isOfflineBuiltinScene } from '../lib/sceneRegistry'
import { parseAttachmentBindings } from '../lib/attachmentBindings'
import { sourceFingerprint } from '../lib/palaceModelProposal'
import type { PalacePlan } from '../lib/palaceTypes'
import { imageHeaderDimensions, assertImageDimensions } from './imageHeader'
import type { OfflinePalace } from './types'
export const MAX_BINARY_BYTES = 80 * 1024 * 1024
export const MAX_HTML_BYTES = 120 * 1024 * 1024
export function assertEmbeddedGlb(bytes: Uint8Array): { texturePixels: number; textureCount: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error('仅支持完整的 GLB 2.0 模型')
  const jsonLength = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength + 20 > bytes.length) throw new Error('GLB JSON 块无效')
  if (jsonLength > 8 * 1024 * 1024) throw new Error('GLB 结构描述超过 8 MB，请简化模型后重试')
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim())
  const numericScan: unknown[] = [json]
  while (numericScan.length) { const value = numericScan.pop(); if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 3.4e38)) throw new Error('GLB 元数据含非有限或超出渲染范围的数值'); if (Array.isArray(value)) { for (const item of value) numericScan.push(item) } else if (value && typeof value === 'object') { for (const item of Object.values(value)) numericScan.push(item) } }
  if (json.asset?.version !== '2.0') throw new Error('GLB asset.version 必须为 2.0')
  for (const key of ['buffers', 'bufferViews', 'accessors', 'images', 'meshes', 'nodes', 'scenes', 'skins', 'cameras']) if (json[key] !== undefined && !Array.isArray(json[key])) throw new Error('GLB 资源列表格式无效：' + key)
  const safeInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  const buffers = json.buffers ?? [], views = json.bufferViews ?? [], accessors = json.accessors ?? []
  let binLength = 0, binOffset = 0, cursor = 20 + jsonLength
  while (cursor + 8 <= bytes.length) { const length = view.getUint32(cursor, true); if (cursor + 8 + length > bytes.length) throw new Error('GLB 数据块截断'); if (view.getUint32(cursor + 4, true) === 0x004e4942) { if (binOffset) throw new Error('GLB 不能包含多个 BIN 块'); binLength = length; binOffset = cursor + 8 } cursor += 8 + length }
  if (cursor !== bytes.length) throw new Error('GLB 数据块尾部不完整')
  for (const b of buffers) if (!safeInt(b.byteLength) || (!b.uri && b.byteLength > binLength)) throw new Error('GLB 缓冲区长度无效')
  for (const v of views) if (!safeInt(v.buffer) || !buffers[v.buffer] || !safeInt(v.byteLength) || !safeInt(v.byteOffset ?? 0) || (v.byteOffset ?? 0) + v.byteLength > buffers[v.buffer].byteLength) throw new Error('GLB 缓冲区引用越界')
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  for (const a of accessors) {
    if (!safeInt(a.count) || !components[a.type] || !sizes[a.componentType] || !safeInt(a.byteOffset ?? 0)) throw new Error('GLB 属性格式无效')
    if (a.bufferView !== undefined) { const v = views[a.bufferView]; if (!safeInt(a.bufferView) || !v) throw new Error('GLB 属性引用无效'); const width = components[a.type] * sizes[a.componentType]; const stride = v.byteStride ?? width; if (!safeInt(stride) || stride < width || (a.byteOffset ?? 0) + Math.max(0, a.count - 1) * stride + (a.count ? width : 0) > v.byteLength) throw new Error('GLB 属性数据越界') }
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined && (!safeInt(image.bufferView) || !views[image.bufferView])) throw new Error('GLB 图片引用无效')
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) for (const ref of [...Object.values(primitive.attributes ?? {}), ...(primitive.indices !== undefined ? [primitive.indices] : [])]) if (!safeInt(ref) || !accessors[ref]) throw new Error('GLB 网格引用无效')
  for (const entry of [...(json.buffers ?? []), ...(json.images ?? [])]) if (entry.uri && !/^data:/.test(entry.uri)) throw new Error('模型引用了外部文件，请先打包为内嵌纹理 GLB')
  for (const node of json.nodes ?? []) for (const key of ['translation', 'rotation', 'scale', 'matrix']) if (node[key] && (!Array.isArray(node[key]) || node[key].length !== (key === 'matrix' ? 16 : key === 'rotation' ? 4 : 3) || !node[key].every((v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000000))) throw new Error('模型含无效或过大的变换坐标')
  if (accessors.reduce((n: number, a: { count: number; type: string }) => n + a.count * components[a.type], 0) > 30000000) throw new Error('模型属性数据超过 3000 万个分量，请简化模型')
  if ((json.accessors ?? []).reduce((n: number, a: { count?: number }) => n + (a.count ?? 0), 0) > 10000000) throw new Error('模型几何数据超过离线预算，请简化模型')
  const unsupported = ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression'].filter(x => [...(json.extensionsRequired ?? []), ...(json.extensionsUsed ?? [])].includes(x))
  if (unsupported.length) throw new Error('模型使用尚未内嵌的解码器：' + unsupported.join(', '))
  const nodes = json.nodes ?? [], meshes = json.meshes ?? [], scenes = json.scenes ?? []
  if (nodes.length > 20000) throw new Error('GLB 节点超过 20000 个，请简化模型')
  const parentCounts = new Uint32Array(nodes.length), depth = new Uint32Array(nodes.length)
  for (const node of nodes) {
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('GLB 子节点列表无效')
    for (const child of node.children ?? []) { if (!safeInt(child) || child >= nodes.length) throw new Error('GLB 子节点引用越界'); if (++parentCounts[child] > 1) throw new Error('GLB 节点不能有多个父节点或重复绑定') }
    if (node.mesh !== undefined && (!safeInt(node.mesh) || !meshes[node.mesh])) throw new Error('GLB 节点网格引用无效')
    if (node.skin !== undefined && (!safeInt(node.skin) || !json.skins?.[node.skin])) throw new Error('GLB 骨骼引用无效')
    if (node.camera !== undefined && (!safeInt(node.camera) || !json.cameras?.[node.camera])) throw new Error('GLB 相机引用无效')
  }
  const queue: number[] = []
  for (let i = 0; i < nodes.length; i++) if (!parentCounts[i]) queue.push(i)
  let consumed = 0
  while (consumed < queue.length) { const index = queue[consumed++]; for (const child of nodes[index].children ?? []) { depth[child] = depth[index] + 1; if (depth[child] > 256) throw new Error('GLB 层级超过 256 层，请展平模型'); if (--parentCounts[child] === 0) queue.push(child) } }
  if (consumed !== nodes.length) throw new Error('GLB 节点图包含循环，不能安全加载')
  for (const scene of scenes) { if (scene.nodes !== undefined && !Array.isArray(scene.nodes)) throw new Error('GLB 场景节点列表无效'); for (const node of scene.nodes ?? []) if (!safeInt(node) || node >= nodes.length) throw new Error('GLB 场景引用了未知节点') }
  if (json.scene !== undefined && (!safeInt(json.scene) || !scenes[json.scene])) throw new Error('GLB 默认场景引用无效')
  const decodedBuffers = new Map<number, Uint8Array>()
  function dataUri(uri: string): { mime: string; bytes: Uint8Array } {
    const match = /^data:([^;,]*)(?:;[^,;]+)*;base64,([A-Za-z0-9+/]*={0,2})$/i.exec(uri)
    if (!match || match[2].length % 4 !== 0) throw new Error('GLB 内嵌 data URI 必须使用有效 base64 编码')
    const text = atob(match[2]), output = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) output[i] = text.charCodeAt(i)
    return { mime: match[1].toLowerCase(), bytes: output }
  }
  function bufferBytes(index: number): Uint8Array {
    const cached = decodedBuffers.get(index); if (cached) return cached
    const b = buffers[index]
    if (!b) throw new Error('GLB 纹理缓冲区无效')
    const value = b.uri ? dataUri(b.uri).bytes : bytes.subarray(binOffset, binOffset + binLength)
    if (value.length < b.byteLength) throw new Error('GLB 实际缓冲区短于声明长度')
    decodedBuffers.set(index, value); return value
  }
  for (let index = 0; index < buffers.length; index++) bufferBytes(index)
  function checkNumericValues(bufferViewIndex: number, byteOffset: number, count: number, width: number, componentType: number, stride?: number): void {
    const v = views[bufferViewIndex]; if (!v || !safeInt(byteOffset) || !safeInt(count)) throw new Error('GLB 属性数据引用无效')
    const size = sizes[componentType], step = stride ?? width * size, offset = (v.byteOffset ?? 0) + byteOffset
    if (!size || offset % size !== 0 || step % size !== 0 || byteOffset + Math.max(0, count - 1) * step + (count ? width * size : 0) > v.byteLength) throw new Error('GLB 属性数据边界或对齐无效')
    if (componentType !== 5126) return
    const buffer = bufferBytes(v.buffer), reader = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    for (let i = 0; i < count; i++) for (let c = 0; c < width; c++) if (!Number.isFinite(reader.getFloat32(offset + i * step + c * size, true))) throw new Error('GLB 顶点或动画属性含 NaN / Infinity，无法安全显示')
  }
  for (const a of accessors) {
    const width = components[a.type]
    if (a.bufferView !== undefined) checkNumericValues(a.bufferView, a.byteOffset ?? 0, a.count, width, a.componentType, views[a.bufferView].byteStride)
    if (a.sparse) {
      const sparse = a.sparse, indices = sparse.indices, values = sparse.values
      if (!safeInt(sparse.count) || sparse.count > a.count || !indices || !values || ![5121,5123,5125].includes(indices.componentType) || !views[indices.bufferView] || !views[values.bufferView]) throw new Error('GLB sparse 属性无效')
      checkNumericValues(indices.bufferView, indices.byteOffset ?? 0, sparse.count, 1, indices.componentType)
      checkNumericValues(values.bufferView, values.byteOffset ?? 0, sparse.count, width, a.componentType)
      const iv = views[indices.bufferView], buffer = bufferBytes(iv.buffer), reader = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength), offset = (iv.byteOffset ?? 0) + (indices.byteOffset ?? 0), size = sizes[indices.componentType]
      let previous = -1
      for (let i = 0; i < sparse.count; i++) { const at = offset + i * size; const index = size === 1 ? reader.getUint8(at) : size === 2 ? reader.getUint16(at, true) : reader.getUint32(at, true); if (index <= previous || index >= a.count) throw new Error('GLB sparse 索引越界或顺序无效'); previous = index }
    }
  }
  let texturePixels = 0
  const images = json.images ?? []
  if (images.length > 256) throw new Error('GLB 纹理数量超过 256 张预算，请合并材质')
  for (const image of images) {
    let content: Uint8Array, mime: string
    if (image.uri) { const decoded = dataUri(image.uri); content = decoded.bytes; mime = image.mimeType || decoded.mime }
    else { const bufferView = views[image.bufferView]; if (!bufferView) throw new Error('GLB 图片没有有效的内嵌数据'); const buffer = bufferBytes(bufferView.buffer), offset = bufferView.byteOffset ?? 0; content = buffer.subarray(offset, offset + bufferView.byteLength); mime = image.mimeType }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw new Error('GLB 纹理须使用 PNG/JPEG/WebP/GIF 栅格图片')
    const dimensions = imageHeaderDimensions(content.subarray(0, 4 * 1024 * 1024), mime)
    assertImageDimensions(dimensions.width, dimensions.height); texturePixels += dimensions.width * dimensions.height
    if (texturePixels > 24000000) throw new Error('模型纹理超过 2400 万像素解码预算，请缩小纹理后重试')
  }
  return { texturePixels, textureCount: images.length }

}
export function safeJson(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') }
export function validateOfflinePalace(data: OfflinePalace): void {
  if (data.unassignedAttachmentCount !== undefined && (!Number.isSafeInteger(data.unassignedAttachmentCount) || data.unassignedAttachmentCount < 0)) throw new Error('未绑定附件计数无效')
  if (data.chapterOrigin) {
    const origin = data.chapterOrigin, plan = data.plan as PalacePlan | undefined
    if (!plan || typeof origin.sourceTitle !== 'string' || origin.sourceTitle.length > 500 || !/^chapter-\d{3}$/.test(origin.chapterId) || ![origin.chapterCount, origin.start, origin.end, origin.totalCharacters].every(Number.isSafeInteger) || origin.chapterCount < 1 || origin.chapterCount > 120 || Number(origin.chapterId.slice(8)) < 1 || Number(origin.chapterId.slice(8)) > origin.chapterCount || origin.start < 0 || origin.end <= origin.start || origin.end > origin.totalCharacters || origin.totalCharacters > 200000 || origin.end - origin.start !== plan.source.text.length || !/^fnv1a64-utf16:\d{1,8}:[a-f0-9]{16}$/.test(origin.sourceFingerprint) || !/^fnv1a64-utf16:\d{1,8}:[a-f0-9]{16}$/.test(origin.collectionFingerprint)) throw new Error('章节原文范围或来源版本不一致')
  }
  if (!isOfflineBuiltinScene(data.sceneId)) throw new Error('不支持的离线场景')
  if (isDust2Scene(data.sceneId) && !data.sceneAssetId) throw new Error('Dust2 场景必须内嵌 GLB 文件')
  if (data.sceneTargetSpan !== undefined && (!Number.isFinite(data.sceneTargetSpan) || data.sceneTargetSpan <= 0 || data.sceneTargetSpan > 1000)) throw new Error('场景比例无效')
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(data.contentFingerprint)) throw new Error('材料版本指纹无效')
  if (new Set(data.cards.map(c => c.id)).size !== data.cards.length) throw new Error('材料卡片 ID 重复')
  const exportedPlan = data.plan as PalacePlan | undefined
  for (const card of data.cards) parseAttachmentBindings(card.attachmentBindings, [...card.imageIds, ...(card.modelId ? [card.modelId] : [])], exportedPlan ? card.unitIds : undefined, exportedPlan ? sourceFingerprint(exportedPlan.source) : undefined)
  const unitIds = data.cards.flatMap(c => c.unitIds)
  if (new Set(unitIds).size !== unitIds.length) throw new Error('材料单元 ID 重复')
  for (const a of data.assets) if (!Number.isSafeInteger(a.bytes) || a.bytes < 0 || typeof a.base64 !== 'string') throw new Error('资源大小无效')
  if (!data.cards.length) throw new Error('没有可导出的材料')
  if (data.cards.length > 120) throw new Error('单个 HTML 最多支持 120 个记忆点，请拆分宫殿')
  const anchors = new Set(data.anchors.map(a => a.id)), assets = new Set(data.assets.map(a => a.id))
  if (anchors.size !== data.anchors.length || assets.size !== data.assets.length) throw new Error('资源或锚点 ID 重复')
  for (const a of data.anchors) { if (a.zone !== undefined && (typeof a.zone !== 'string' || a.zone.length > 160)) throw new Error('场景分组无效'); if (a.calloutAliases !== undefined && (!Array.isArray(a.calloutAliases) || a.calloutAliases.length > 20 || a.calloutAliases.some(alias => typeof alias !== 'string' || alias.length > 160))) throw new Error('玩家报点别名无效') }
  for (const a of data.anchors) for (const p of [a.position, a.eye, a.lookAt]) if (p.length !== 3 || !p.every(Number.isFinite)) throw new Error('场景坐标无效：' + a.id)
  for (const c of data.cards) { if (!anchors.has(c.anchorId)) throw new Error('缺少锚点：' + c.anchorId); const anchor = data.anchors.find(a => a.id === c.anchorId)!; if ((c.cues?.length ?? 0) > (anchor.cueVolume?.maxObjects ?? 3)) throw new Error('锚点道具数量超过容量：' + c.anchorId); for (const id of [...c.imageIds, ...(c.modelId ? [c.modelId] : [])]) if (!assets.has(id)) throw new Error('缺少附件：' + id); if (!c.unitIds.length) throw new Error('材料单元 ID 缺失'); if (c.imageIds.length > 6) throw new Error('每个记忆点最多 6 张离线图片，请拆分内容'); if (c.modelScale !== undefined && (!Number.isFinite(c.modelScale) || c.modelScale <= 0)) throw new Error('模型比例无效') }
  if (data.walkingRoute) { if (data.walkingRoute.sceneVersion !== data.sceneVersion) throw new Error('步行路线与场景版本不一致'); let points = 0; for (const leg of data.walkingRoute.legs) { if (!anchors.has(leg.from) || !anchors.has(leg.to)) throw new Error('步行路线引用未知地标'); for (const point of leg.waypoints) { points++; if (point.length !== 3 || !point.every(Number.isFinite)) throw new Error('步行路线坐标无效') } } if (points > 100000) throw new Error('步行路线超过离线预算') }
  if (data.sceneAssetId && !assets.has(data.sceneAssetId)) throw new Error('缺少场景模型')
  if (data.assets.reduce((n, a) => n + a.bytes, 0) > MAX_BINARY_BYTES) throw new Error('资源超过 80 MB；为避免浏览器内存耗尽，请压缩资源或拆分宫殿（未丢弃任何内容）')
}
export function buildOfflineHtml(data: OfflinePalace, runtime: string): string {
  validateOfflinePalace(data)
  const bindingPlan = data.plan as PalacePlan | undefined
  data = { ...data, cards: data.cards.map(card => ({ ...card, attachmentBindings: parseAttachmentBindings(card.attachmentBindings, [...card.imageIds, ...(card.modelId ? [card.modelId] : [])], bindingPlan ? card.unitIds : undefined, bindingPlan ? sourceFingerprint(bindingPlan.source) : undefined) })) }
  if (data.chapterOrigin) { const o = data.chapterOrigin; data = { ...data, chapterOrigin: { sourceTitle: o.sourceTitle, sourceFingerprint: o.sourceFingerprint, collectionFingerprint: o.collectionFingerprint, chapterId: o.chapterId, chapterCount: o.chapterCount, start: o.start, end: o.end, totalCharacters: o.totalCharacters } } }
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; worker-src blob:;"><title>离线记忆宫殿</title><style>
*{box-sizing:border-box}body{margin:0;background:#122028;color:#f3eddd;font:15px/1.5 system-ui,sans-serif}#world{position:fixed;inset:0}#world canvas{display:block}header{position:fixed;top:12px;left:12px;right:12px;padding:10px 14px;background:#102028ed;border:1px solid #80948e;border-radius:12px;pointer-events:auto;max-height:130px;overflow:auto}h1{font-size:20px;margin:0}button,select,.filelabel{font:inherit;color:#f5e9cc;background:#29434a;border:1px solid #8d9a89;border-radius:7px;padding:9px 12px;cursor:pointer;min-height:42px}button:hover{background:#486061}button:focus-visible,select:focus-visible,.filelabel:focus-within{outline:3px solid #ffcb74}#practice{position:fixed;right:12px;bottom:12px;width:min(430px,calc(100vw - 24px));max-height:calc(100dvh - 152px);overflow:auto;background:#102028f5;border:1px solid #80948e;border-radius:14px;padding:14px}#practice.collapsed .panel-body{display:none}#toggle-panel{width:100%}.row{display:flex;gap:7px;flex-wrap:wrap;margin:9px 0}.row>*{flex:1}h2{font-size:19px;margin:10px 0}#answer,#cue-text,#credits{white-space:pre-wrap;overflow-wrap:anywhere}#answer{background:#233c3c;padding:12px;border-left:3px solid #dfba73}#cue-text{color:#d6c2eb}#status,#progress,#context,.hint{font-size:12px;color:#c3d3ce}#move{position:fixed;left:16px;bottom:18px;display:flex;gap:5px}#move button{touch-action:none;padding:8px;width:48px;height:48px;user-select:none}#move .up{grid-column:2}#move .left{grid-column:1}#route{max-width:100%;width:100%}#error{color:#ffc5a6}.filelabel input{position:absolute;opacity:0;width:1px;height:1px}details{margin-top:10px}summary{cursor:pointer}#credits{font-size:11px}#question{font-size:17px}#cross{position:fixed;left:50%;top:50%;pointer-events:none;color:#ffe1a8}body:has(#practice:not(.collapsed)) #move{bottom:18px}@media(max-width:640px){header{max-height:105px}#practice{max-height:43dvh;bottom:80px}#move{bottom:12px}#status{max-height:36px;overflow:auto}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style></head><body><div id="world" aria-label="三维场景"></div><header><h1 id="title"></h1><div id="provenance" class="hint"></div><div id="status" role="status">正在初始化离线场景…</div><div id="progress"></div><div id="framing-warning" class="hint" role="status"></div><div id="error" role="alert"></div></header><span id="cross" aria-hidden="true">＋</span><nav id="move" aria-label="移动控制"><button class="up" data-move="w" aria-label="向前">↑</button><button class="left" data-move="a" aria-label="向左">←</button><button data-move="s" aria-label="向后">↓</button><button data-move="d" aria-label="向右">→</button></nav><section id="practice" aria-label="检索练习"><button id="toggle-panel">收起练习面板</button><div class="panel-body"><h2 id="anchor-title"></h2><p id="context"></p><select id="route" aria-label="选择记忆点"></select><div class="row"><button id="previous">← 上一点</button><button id="reset-view">回到视点</button><button id="next">下一点 →</button></div><p id="question"></p><select id="unit-select" aria-label="选择材料单元"></select><button id="reveal">显示原文答案与联想说明</button><p id="answer" hidden></p><p id="cue-text" hidden></p><select id="attachment-select" aria-label="选择锚点附件" hidden></select><p id="session-status" class="hint"></p><div id="ratings" hidden><p class="hint">先回忆，再核对原文。按自己的实际回忆评分：</p><div class="row"><button id="rate-0">没记住</button><button id="rate-1">模糊</button><button id="rate-2">记住了</button></div></div><details id="walking-overview" hidden><summary>步行路线与地标概览</summary><p id="walking-proof" class="hint"></p><button id="toggle-walking-guide">显示 3D 步行引导</button><canvas id="walking-canvas" width="600" height="360" style="display:block;width:100%;height:auto;margin-top:10px" aria-label="已检查的步行路线俯视示意"></canvas><p class="hint">线条沿实际测试过的通道。编号为地标观看点；点击已绑定材料的点可跳转。此图是几何示意，不是现场照片或浏览器截图。</p></details><details><summary>控制、隐私与备份</summary><p class="hint">拖动画面转向；WASD / 方向键或左下按钮移动；双击道具选点。移动使用静态场景胶囊碰撞、重力和低台阶跟随；助记物与附件是视觉提示，不参与碰撞。若迷路或受阻，路线按钮返回设计视点。几何道具是创作记忆提示；原文和问题在揭示后出现；明确绑定当前单元的线索附件在回忆前显示，答案参考附件在揭示后显示。线索可能提示答案，这是作者有意的助记选择，不是安全隐藏。图片和静态模型按锚点安全范围等比适配，通过附件列表逐个查看。收起面板可扩大视野。</p><p class="hint">本文件包含全部原文与附件，请按原材料的保密级别保存。无需联网或模型；不会发送材料。浏览器可能不持久保存 file:// 进度，请主动导出备份。资源预算：二进制 80 MB，HTML 120 MB；每点最多 6 张图，单图 1600 万像素、图片与模型纹理合计 2400 万像素；大模型解码可能额外占用内存。</p><div class="row"><button id="repeat-missed">重练未记住的单元</button><button id="reset-progress">重置进度</button><button id="save-progress">导出进度 JSON</button><button id="confirm-progress-saved" hidden>确认进度文件已保存</button><label class="filelabel">恢复进度<input id="restore-progress" type="file" accept=".json,application/json"></label></div><details id="source-audit"><summary>原始材料与出处（展开会显示全部答案）</summary><pre id="source-text" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><button id="save-plan">导出原文审计 JSON</button></details><details><summary>授权与来源</summary><pre id="credits"></pre></details></details></div></section><script id="palace-data" type="application/json">${safeJson(data)}</script><script>${runtime.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  if (new Blob([html]).size > MAX_HTML_BYTES) throw new Error('HTML 超过 120 MB，请缩小材料或资源后重试（未丢弃内容）')
  return html
}
