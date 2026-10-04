import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { createAuthoredDemo, SAMPLE_MATERIALS } from '../src/lib/palaceSamples'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards } from '../src/lib/palaceStorage'
import { assembleOfflinePalace } from '../src/offline/assemble'
import { buildOfflineHtml } from '../src/offline/serialize'
import type { PalaceRecord } from '../src/lib/types'
import type { Vec3 } from '../src/offline/types'

const outputDirectory = resolve(process.argv[2] ?? '../deliverables')
await mkdir(outputDirectory, { recursive: true })
const runtime = await build({ entryPoints: ['src/offline/runtime.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline' })
const licenses = await Promise.all([readFile('LICENSE', 'utf8'), readFile('node_modules/three/LICENSE', 'utf8')])
const manifest: { name: string; bytes: number; sha256: string; units: number; scene: string; notice: string }[] = []
const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
for (const sample of SAMPLE_MATERIALS) {
  const plan = createAuthoredDemo(sample.id), scene = getSceneDefinition(plan.sceneId)
  // Preview projection validates structure but never invents user approvals.
  const palace: PalaceRecord = { id: 'authored-demo-' + sample.id, title: sample.source.title + ' · 体验样例', templateId: 'dust2_blockout_v2', createdAt: plan.createdAt, updatedAt: plan.createdAt, mnemonicPlan: plan }
  const cards = planToCards(palace.id, plan, scene, { requireReview: false })
  const data = await assembleOfflinePalace({ palace, cards, scene, assets: [], anchors: scene.anchors.map(a => ({ id: a.id, framingBounds: a.landmark.framingBounds, focusPoint: a.landmark.focusPoint ? vec(a.landmark.focusPoint) : undefined, label: a.label, context: a.landmark.description, position: vec(a.cueVolume.center), eye: vec(a.approach.eye), lookAt: vec(a.approach.lookAt), cueVolume: a.cueVolume })), licenses, previewOnly: true })
  const html = buildOfflineHtml(data, runtime.outputFiles[0].text)
  const name = `Locus-${sample.id}-preview.html`
  await writeFile(resolve(outputDirectory, name), html)
  await writeFile(resolve(outputDirectory, `Locus-${sample.id}-plan.json`), JSON.stringify(plan, null, 2))
  manifest.push({ name, bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), units: plan.units.length, scene: scene.id, notice: 'Authored preview, not a live LLM generation. Original plan review flags remain false. Actual browser/WebGL acceptance is not claimed.' })
}
await writeFile(resolve(outputDirectory, 'offline-demo-manifest.json'), JSON.stringify(manifest, null, 2))
console.log(JSON.stringify({ outputDirectory, demos: manifest }, null, 2))
