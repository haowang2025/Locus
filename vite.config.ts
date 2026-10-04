import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { offlineRuntimePlugin } from './tools/offlineRuntimePlugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineRuntimePlugin()],
  base: './',
})
