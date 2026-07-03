import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      // Nginx en producción agrega /api/ prefix y hace proxy_pass removiendo el /api
      // En local, queremos lo mismo: el frontend llama /api/auth/register
      // y el proxy de Vite lo pasa a http://localhost:3200/auth/register (sin /api)
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: 'http://localhost:3200',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})