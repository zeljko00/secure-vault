import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const allowedHosts = env.VITE_ALLOWED_HOSTS
    ? env.VITE_ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean)
    : true

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts,
      // Proxy API requests to the backend service in case the frontend is served from a different origin.
      // Since both frontend and backend are exposed by same reverse proxy (nginx), this is not strictly necessary.
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
