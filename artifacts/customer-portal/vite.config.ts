import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT ?? "3000");

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL ??
      process.env.SUPABASE_URL ??
      "https://nzdweipzckfszczzqtuw.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56ZHdlaXB6Y2tmc3pjenpxdHV3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDI4NDQsImV4cCI6MjA5Mzk3ODg0NH0.p9k3-qyRjPuXsHLizUrSRMyS-0yJAatUyjQU9NIIu1U"
    ),
    "import.meta.env.VITE_SUPABASE_URL_DEV": JSON.stringify(process.env.VITE_SUPABASE_URL_DEV ?? process.env.SUPABASE_URL_DEV ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY_DEV": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY_DEV ?? process.env.SUPABASE_ANON_KEY_DEV ?? ""),
    "import.meta.env.VITE_REPLIT_DEV_DOMAIN": JSON.stringify(process.env.REPLIT_DEV_DOMAIN ?? ""),
  },
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "@workspace/product-templates": path.resolve(import.meta.dirname, "../../lib/product-templates/src/index.ts"),
      "@workspace/logistics-constants": path.resolve(import.meta.dirname, "../../lib/logistics-constants/src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "SOURCEMAP_ERROR") return;
        warn(warning);
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "::",
    allowedHosts: true,
    watch: {
      ignored: [
        "**/node_modules/**",
        path.resolve(import.meta.dirname, "../api-server/**"),
        path.resolve(import.meta.dirname, "../bizportal/**"),
        path.resolve(import.meta.dirname, "../cst-driver/**"),
        path.resolve(import.meta.dirname, "../logistic-order/**"),
        path.resolve(import.meta.dirname, "../mockup-sandbox/**"),
      ],
    },
    hmr: process.env.REPLIT_DEV_DOMAIN ? false : true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/q": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // BizPortal dev server — proxied so /bizportal/* works via main entry port
      "/bizportal": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
      "/logistic-order": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
