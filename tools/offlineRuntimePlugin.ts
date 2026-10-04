import { build } from 'esbuild'
import type { Plugin } from 'vite'
import { resolve } from 'node:path'
export function offlineRuntimePlugin(): Plugin {
  const id = 'virtual:locus-offline-runtime'
  return {
    name: 'locus-offline-runtime',
    resolveId(source) { if (source === id) return '\0' + id },
    async load(source) {
      if (source !== '\0' + id) return
      const result = await build({ entryPoints: [resolve('src/offline/runtime.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'inline', metafile: true })
      for (const input of Object.keys(result.metafile?.inputs ?? {})) if (input.startsWith('src/')) this.addWatchFile(resolve(input))
      return 'export default ' + JSON.stringify(result.outputFiles[0].text)
    },
  }
}
