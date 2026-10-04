/** Filesystem-only asset packaging check. Makes no model requests and controls no browser. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { getSceneVisualContext } from '../src/lib/sceneVisualContext'
import { buildVisionContextBundle } from '../src/lib/palaceVisionPackage'
import { SAMPLE_MATERIALS } from '../src/lib/palaceSamples'

const sourceRoot = resolve(import.meta.dirname, '..')
const destination = resolve(sourceRoot, '../deliverables')
await mkdir(destination, { recursive: true })
const source = SAMPLE_MATERIALS.find(item => item.id === 'science')!.source
const reports = []
for (const sceneId of ['reading-hall', 'dust2', 'dust2-callouts']) {
  const scene = getSceneDefinition(sceneId), manifest = getSceneVisualContext(sceneId)
  if (!manifest) throw new Error(`No current version-matched visual manifest for ${sceneId}`)
  const result = await buildVisionContextBundle(source, scene, manifest, { loadAsset: async path => new Uint8Array(await readFile(resolve(sourceRoot, 'public', path))) })
  await writeFile(resolve(destination, result.fileName), new Uint8Array(await result.blob.arrayBuffer()))
  reports.push({ fileName: result.fileName, sceneId, sceneVersion: scene.version, imageCount: result.imageCount, rawImageBytes: result.rawImageBytes, zipBytes: result.blob.size, sourceTitle: source.title, liveModelCalled: false, browserVerified: false })
}
await writeFile(resolve(destination, 'vision-context-package-report.json'), JSON.stringify(reports, null, 2))
console.log(JSON.stringify(reports, null, 2))
