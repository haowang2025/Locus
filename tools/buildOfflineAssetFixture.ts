import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { createMnemonicProp } from '../src/three/mnemonicProps'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards } from '../src/lib/palaceStorage'
import { assembleOfflinePalace } from '../src/offline/assemble'
import { assertEmbeddedGlb, buildOfflineHtml } from '../src/offline/serialize'
import type { PalaceRecord } from '../src/lib/types'
import type { Vec3 } from '../src/offline/types'

class NodeFileReader {
  result: ArrayBuffer | string | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}
Object.assign(globalThis, { FileReader: NodeFileReader })
const scene = getSceneDefinition('dust2')
const plan = createOfflinePlan('这是离线资源打包测试材料，不是学习内容。\n测试图片是一个白色像素；模型是一辆程序化小车。\n图片、模型与场景都应完整内嵌，不应请求网络。', '离线资源打包测试（QA）', scene)
plan.generation.mode = 'authored-demo'
const palace: PalaceRecord = { id: 'qa-dust2-embedded-assets', title: 'QA：Dust2、图片与模型内嵌验证', templateId: 'dust2_blockout_v2', createdAt: plan.createdAt, updatedAt: plan.createdAt, mnemonicPlan: plan }
const cards = planToCards(palace.id, plan, scene, { requireReview: false })
cards[0].imageIds = ['qa-png']; cards[0].modelId = 'qa-cart'; cards[0].modelScale = 3
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC8sAAAAASUVORK5CYII=', 'base64')
const cart = Buffer.from(await new GLTFExporter().parseAsync(createMnemonicProp('cart', '#438fb9'), { binary: true }) as ArrayBuffer)
const dust2 = await readFile('public/maps/dust2/de_dust2_cs_map.glb')
assertEmbeddedGlb(cart); assertEmbeddedGlb(dust2)
const originals = [{ id: 'qa-png', mime: 'image/png', data: png }, { id: 'qa-cart', mime: 'model/gltf-binary', data: cart }, { id: 'scene:dust2', mime: 'model/gltf-binary', data: dust2 }]
const assets = originals.map(a => ({ id: a.id, mime: a.mime, base64: a.data.toString('base64'), bytes: a.data.length, texturePixels: a.mime === 'model/gltf-binary' ? assertEmbeddedGlb(a.data).texturePixels : undefined }))
const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
const data = await assembleOfflinePalace({ palace, cards, scene, assets, sceneAssetId: 'scene:dust2', sceneTargetSpan: scene.worldTransform!.targetSpan, anchors: scene.anchors.map(a => ({ id: a.id, framingBounds: a.landmark.framingBounds, focusPoint: a.landmark.focusPoint ? vec(a.landmark.focusPoint) : undefined, label: a.label, context: a.landmark.description, position: vec(a.cueVolume.center), eye: vec(a.approach.eye), lookAt: vec(a.approach.lookAt), cueVolume: a.cueVolume })), licenses: await Promise.all([readFile('LICENSE', 'utf8'), readFile('node_modules/three/LICENSE', 'utf8')]), previewOnly: true })
const runtime = await build({ entryPoints: ['src/offline/runtime.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true })
const html = buildOfflineHtml(data, runtime.outputFiles[0].text)
await writeFile('../qa/standalone-assets-smoke.html', html)
await writeFile('../qa/standalone-assets-manifest.json', JSON.stringify({ file: 'standalone-assets-smoke.html', bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), assets: originals.map(a => ({ id: a.id, bytes: a.data.length, sha256: createHash('sha256').update(a.data).digest('hex') })), sceneTargetSpan: data.sceneTargetSpan, note: 'Packaging smoke fixture only. No actual browser/WebGL execution claimed.' }, null, 2))
console.log('Created QA-only standalone asset fixture:', Buffer.byteLength(html), 'bytes')
