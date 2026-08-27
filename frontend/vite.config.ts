import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nativeFolderBridge } from './scripts/native-folder-bridge'

export default defineConfig({
  plugins: [react(), nativeFolderBridge()],
  server: {
    port: 5173,
  },
})
