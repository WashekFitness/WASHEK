import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(async ({ command }) => {
  const plugins = [react()];

  if (command === "build") {
    const { VitePWA } = await import("vite-plugin-pwa");
    plugins.push(
      VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icon.svg",
        "apple-touch-icon.png",
        "washek-fitness-logo.jpg",
        "manifest.webmanifest",
      ],
      manifest: {
        id: "/",
        name: "WASHEK Fitness",
        short_name: "WASHEK",
        description: "High-performance fitness training, workout programming, nutrition tracking, and coaching.",
        theme_color: "#05070b",
        background_color: "#05070b",
        display: "standalone",
        start_url: "/",
        scope: "/",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/(workout_programs|workout_logs|movement_baselines|form_analyses).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "washek-workout-data",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days offline access
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "washek-media-cache",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days media cache
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    })
    );
  } else {
    plugins.push({
      name: "pwa-register-dev-stub",
      resolveId(id) {
        if (id === "virtual:pwa-register") {
          return "\0virtual:pwa-register";
        }
      },
      load(id) {
        if (id === "\0virtual:pwa-register") {
          return "export function registerSW() { return async () => {}; }\n";
        }
      },
    });
  }

  return {
    plugins,

  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
      "lucide-react",
      "framer-motion",
      "sonner",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "date-fns",
      "canvas-confetti",
    ],
  },

  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    hmr: false,
    ws: false,
    watch: {
      ignored: [
        "**/.confirmed_subscriptions.json",
        "**/.athlete_credentials.json",
        "**/.deleted_accounts.json",
        "**/.washek_session_secret",
        "**/.kael_usage.json",
        "**/.i18n_cache.json",
        "**/dist/**",
        "**/supabase/**",
      ],
    },
  },
  };
});
