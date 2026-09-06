import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function xhsInlineDust2Plugin(): Plugin {
  const target = `async function loadDust2Glb(): Promise<GLTF> {
  const url = new URL('maps/dust2/de_dust2_cs_map.glb', document.baseURI).toString()
  const loader = new GLTFLoader()
  return new Promise<GLTF>((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, reject)
  })
}`

  const replacement = `async function loadDust2Glb(): Promise<GLTF> {
  // XHS mini-tool containers disallow fetch/XHR. The GLB is inlined by Vite and
  // decoded to an ArrayBuffer, then parsed directly by Three.js in memory.
  const dataUrl = dust2GlbDataUrl
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('内置 Dust2 数据格式无效')
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  let bytes: Uint8Array
  if (meta.includes(';base64')) {
    const binary = atob(payload)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload))
  }

  const loader = new GLTFLoader()
  return new Promise<GLTF>((resolve, reject) => {
    loader.parse(bytes.buffer, '', (gltf) => resolve(gltf), reject)
  })
}`

  return {
    name: 'xhs-inline-dust2',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/three/dust2glb.ts')) return null
      if (!code.includes(target)) {
        this.error('Unable to patch Dust2 loader for XHS: source signature changed')
      }
      return {
        code: `import dust2GlbDataUrl from '../assets/de_dust2_cs_map.glb?inline'\n${code.replace(target, replacement)}`,
        map: null,
      }
    },
  }
}

// Xiaohongshu offline build: all runtime-critical assets stay inside JS and
// the app never needs network fetches to enter the 3D map.
export default defineConfig({
  plugins: [xhsInlineDust2Plugin(), react()],
  assetsInclude: ['**/*.glb'],
  build: {
    assetsInlineLimit: 10 * 1024 * 1024,
  },
  base: './',
})
