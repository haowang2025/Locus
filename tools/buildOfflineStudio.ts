import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { getSceneVisualContext } from '../src/lib/sceneVisualContext'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { validateVisualManifest, readContextImageDimensions } from '../src/lib/palaceVisionPackage'
import { safeJson, assertEmbeddedGlb } from '../src/offline/serialize'

const output = resolve(process.argv[2] ?? '../deliverables/Locus-Dust2-Callouts-v5.html')
const defaultSceneId = process.argv[3] ?? 'dust2-callouts'
if (!['reading-hall', 'dust2-callouts'].includes(defaultSceneId)) throw new Error('Unsupported new-project scene')
const buildId = '2026-10-04-v5-recovery'
await mkdir(resolve(output, '..'), { recursive: true })
const viewer = await build({ entryPoints: ['src/offline/runtime.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline' })
const bundled = await build({
  entryPoints: ['src/studio/main.tsx'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline', jsx: 'automatic', metafile: true, outfile: 'studio.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'embedded-offline-viewer', setup(plugin) { plugin.onResolve({ filter: /^virtual:locus-offline-runtime$/ }, () => ({ path: 'viewer', namespace: 'embedded-viewer' })); plugin.onLoad({ filter: /.*/, namespace: 'embedded-viewer' }, () => ({ contents: 'export default ' + JSON.stringify(viewer.outputFiles[0].text), loader: 'js' })) } }],
})
const script = bundled.outputFiles.find(f => f.path.endsWith('.js'))!.text, css = bundled.outputFiles.find(f => f.path.endsWith('.css'))!.text
const dust2 = await readFile('public/maps/dust2/de_dust2_cs_map.glb'); const dust2Budget = assertEmbeddedGlb(dust2)
const licenses = await Promise.all([readFile('LICENSE', 'utf8'), readFile('node_modules/three/LICENSE', 'utf8'), readFile('node_modules/react/LICENSE', 'utf8'), readFile('node_modules/react-dom/LICENSE', 'utf8')])
const visualAssets: { path: string; base64: string; bytes: number; mime: string; sha256: string }[] = []
for (const id of ['reading-hall', 'dust2', 'dust2-callouts']) {
  const context = getSceneVisualContext(id); if (!context) throw new Error(`Missing current visual context for built-in scene: ${id}`)
  validateVisualManifest(context, getSceneDefinition(id))
  for (const asset of [context.overview, ...context.anchors]) {
    const bytes = await readFile(resolve('public', asset.path)), hash = createHash('sha256').update(bytes).digest('hex'), dimensions = readContextImageDimensions(bytes, asset.mimeType)
    if (bytes.length !== asset.byteLength || hash !== asset.sha256 || dimensions.width !== asset.width || dimensions.height !== asset.height) throw new Error('Reference image differs from its verified manifest: ' + asset.path)
    visualAssets.push({ path: asset.path, base64: bytes.toString('base64'), bytes: bytes.length, mime: asset.mimeType, sha256: hash })
  }
}
const sceneCatalog = ['reading-hall', 'dust2', 'dust2-callouts'].map(id => { const scene = getSceneDefinition(id); return { id, version: scene.version, anchors: scene.anchors.length, capacity: scene.anchors.reduce((sum, a) => sum + Math.min(a.capacity, a.cueVolume.maxObjects), 0), legacy: id === 'dust2' } })
const assets = { defaultSceneId, buildId, version: 'Dust2 玩家报点修订 v5 · 14 地标 · 构建 2026-10-04', visualAssets, assets: [{ id: 'scene:dust2', mime: 'model/gltf-binary', bytes: dust2.length, texturePixels: dust2Budget.texturePixels, base64: dust2.toString('base64') }], licenses }
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; frame-src blob:; worker-src blob:;"><title>Locus · Dust2 玩家报点修订 v5</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"><p>正在启动本地创作台…</p></div><noscript>本工作台需要浏览器运行 JavaScript。材料不会发送到网络。</noscript><script id="studio-assets" type="application/json">${safeJson(assets)}</script><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
new Function(script)
await writeFile(output, html)
await writeFile(output.replace(/\.html$/i, '-manifest.json'), JSON.stringify({ file: output.split('/').at(-1), bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), standalone: true, defaultSceneId, buildId, sceneCatalog, sceneAsset: { id: 'scene:dust2', bytes: dust2.length, sha256: createHash('sha256').update(dust2).digest('hex') }, visualReferenceImages: visualAssets.length, visualReferenceBytes: visualAssets.reduce((n, a) => n + a.bytes, 0), runtimeBytes: Buffer.byteLength(viewer.outputFiles[0].text), studioScriptBytes: Buffer.byteLength(script), cssBytes: Buffer.byteLength(css), builtAt: new Date().toISOString(), storage: 'in-memory; explicit full-project backup', network: 'blocked by CSP; no built-in model endpoint', testing: 'Build and script syntax only. Actual browser/file:// execution remains unverified.' }, null, 2))
await writeFile(output.replace(/\.html$/i, '-bundle.json'), JSON.stringify(bundled.metafile, null, 2))
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), scriptBytes: Buffer.byteLength(script), cssBytes: Buffer.byteLength(css) }))
