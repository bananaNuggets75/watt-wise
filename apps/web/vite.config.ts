import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind every interface. Vite's default binds IPv6 only, so a browser that
    // resolves "localhost" to 127.0.0.1 gets a connection refused that looks
    // like the dev server never started.
    host: true,
  },
})
