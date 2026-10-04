import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { buildVisionContextBundle, readContextImageDimensions, sha256Bytes, validateVisualManifest } from '../src/lib/palaceVisionPackage'
import type { SceneVisualContextManifest } from '../src/lib/sceneVisualContext'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
const scene = getSceneDefinition('reading-hall')
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7fQAAAAASUVORK5CYII=', 'base64'))
async function manifest(): Promise<SceneVisualContextManifest> {
  const hash = await sha256Bytes(png), anchor = scene.anchors[0], common = { mimeType: 'image/png' as const, sha256: hash, byteLength: png.length, width: 1, height: 1 }
  return { schemaVersion: 1, sceneId: scene.id, sceneVersion: scene.version, title: 'TEST FIXTURE: not a real scene render', coordinateConvention: 'Three.js Y-up; Blender conversion (x,-z,y)', generation: { method: 'blender-geometry-inspection', tool: 'TEST FIXTURE', sourceGeometrySha256: '0'.repeat(64), browserVerified: false, lighting: 'TEST ONLY', notes: ['Fixture validates the packaging contract, not any actual visual scene.'] }, overview: { ...common, id: 'overview', path: `scene-context/${scene.id}/${scene.version}/overview.png`, projection: { kind: 'orthographic', horizontalSpanMeters: 20, verticalSpanMeters: 20 } }, anchors: [{ ...common, id: 'anchor:one', path: `scene-context/${scene.id}/${scene.version}/one.png`, anchorId: anchor.id, label: anchor.label, eye: anchor.approach.eye, lookAt: anchor.approach.lookAt, projection: { kind: 'perspective', verticalFovDeg: 70, aspectRatio: 1 }, visibleFeatures: anchor.landmark.visibleFeatures, cueVolume: { id: anchor.cueVolume.id, center: anchor.cueVolume.center, size: anchor.cueVolume.size } }] }
}
test('vision bundle contains actual bytes, prompt/schema, versioned cameras and honest limitations', async () => {
  const context = await manifest(), requested: string[] = []
  const result = await buildVisionContextBundle({ title: '材料', text: '不得省略条件。' }, scene, context, { loadAsset: async path => { requested.push(path); return png } })
  assert.equal(result.imageCount, 2); assert.equal(requested.length, 2)
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer())
  assert.ok(zip.file('prompt.txt')); assert.ok(zip.file('proposal.schema.json')); assert.ok(zip.file('scene-context.json'))
  assert.ok(zip.file('images/01-anchor_one.png'))
  const prompt = await zip.file('prompt.txt')!.async('text')
  assert.match(prompt, /not a completed vision-model run/); assert.match(prompt, /Browser verification is explicitly false/)
  const metadata = JSON.parse(await zip.file('scene-context.json')!.async('text'))
  assert.equal(metadata.sceneVersion, scene.version); assert.ok(metadata.missingAnchorIds.length)
  assert.deepEqual(metadata.anchors[0].eye, scene.anchors[0].approach.eye)
})
test('version drift and external/traversal image paths are rejected before loading', async () => {
  const context = await manifest()
  context.sceneVersion = 'old'; assert.throws(() => validateVisualManifest(context, scene), /版本/)
  context.sceneVersion = scene.version
  for (const path of ['https://outside.invalid/image.png', `scene-context/${scene.id}/${scene.version}/../secret.png`]) { context.overview.path = path; assert.throws(() => validateVisualManifest(context, scene), /路径/) }
})
test('corrupt image bytes or inconsistent dimensions fail the entire bundle', async () => {
  const context = await manifest()
  await assert.rejects(buildVisionContextBundle({ text: '原文。', title: 'test' }, scene, context, { loadAsset: async () => { const changed = png.slice(); changed[changed.length - 1] ^= 1; return changed } }), /SHA-256/)
  context.overview.width = 2
  await assert.rejects(buildVisionContextBundle({ text: '原文。', title: 'test' }, scene, context, { loadAsset: async () => png }), /实际尺寸/)
})
test('unknown anchor selection and canceled downloads never produce a partial ZIP', async () => {
  const context = await manifest()
  await assert.rejects(buildVisionContextBundle({ text: '原文。', title: 'test' }, scene, context, { includeAnchorIds: ['unknown'], loadAsset: async () => png }), /没有对应/)
  const controller = new AbortController(); controller.abort(); let calls = 0
  await assert.rejects(buildVisionContextBundle({ text: '原文。', title: 'test' }, scene, context, { signal: controller.signal, loadAsset: async () => { calls++; return png } }), /Aborted/)
  assert.equal(calls, 0)
})
test('image dimension parser rejects unsupported or truncated file headers', () => {
  assert.deepEqual(readContextImageDimensions(png, 'image/png'), { width: 1, height: 1 })
  assert.throws(() => readContextImageDimensions(new Uint8Array([255, 216]), 'image/jpeg'))
  assert.throws(() => readContextImageDimensions(new Uint8Array(24), 'image/png'))
})
