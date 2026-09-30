import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // La versión nueva se instala sola al publicar; no hay que borrar caché
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "pwa/apple-touch-icon.png"],
      manifest: {
        name: "Activa Inglés",
        short_name: "Activa Inglés",
        description: "Aprende inglés con misiones, tutor con IA y evaluación de pronunciación.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "/pwa/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa/maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Solo archivos propios de la app. Sin runtimeCaching: /api y Oracle ORDS
        // siempre van a la red (progreso, XP y respuestas del tutor nunca en caché).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
