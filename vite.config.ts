import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 允许 Cloudflare Quick Tunnel / ngrok 等穿透时的 Host 头（子域名每次可能不同）
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
    proxy: {
      '/oah': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/oah/, ''),
      },
    },
  },
})
