import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { webMcpToolsPlugin } from './vite-plugin-web-mcp-tools'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  /** 开发时 `/oah` 转发目标；OAH 未监听时会报 ECONNREFUSED */
  const oahProxyTarget = env.VITE_OAH_DEV_PROXY_TARGET || 'http://127.0.0.1:8787'

  return {
    plugins: [react(), tailwindcss(), webMcpToolsPlugin()],
    server: {
      // 允许 Cloudflare Quick Tunnel / ngrok 等穿透时的 Host 头（子域名每次可能不同）
      allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
      proxy: {
        '/oah': {
          target: oahProxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/oah/, ''),
        },
      },
    },
  }
})
