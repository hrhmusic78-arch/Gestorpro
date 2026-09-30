import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Igual que vercel.json en producción: el buscador de Open Food Facts no permite
    // llamadas directas desde el navegador (CORS), así que pasa por nuestro servidor.
    proxy: {
      '/api/off-search': {
        target: 'https://search.openfoodfacts.org',
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/api\/off-search/, '/search'),
      },
    },
  },
})
