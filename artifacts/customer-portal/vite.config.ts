import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT ?? "3000");

const basePath = process.env.BASE_PATH ?? "/";
const isPosMode = process.env.VITE_POS_MODE === "true";

// Plugin: paksa semua request ke /kasir/login saat mode POS aktif,
// kecuali path kasir itu sendiri, API, dan asset internal Vite
function posRedirectPlugin() {
  return {
    name: "pos-redirect",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        if (!isPosMode) { next(); return; }
        const url = req.url ?? "/";
        const isAllowed =
          url.startsWith("/kasir") ||
          url.startsWith("/menu-board") ||
          url.startsWith("/api/") ||
          url.startsWith("/@") ||
          url.startsWith("/node_modules") ||
          url.startsWith("/__vite") ||
          url.includes(".") // file statis (js, css, png, dll.)
        if (!isAllowed) {
          res.writeHead(302, { Location: "/kasir/login" });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ""),
    "import.meta.env.VITE_SUPABASE_URL_DEV": JSON.stringify(process.env.VITE_SUPABASE_URL_DEV ?? process.env.SUPABASE_URL_DEV ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY_DEV": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY_DEV ?? process.env.SUPABASE_ANON_KEY_DEV ?? ""),
    "import.meta.env.VITE_REPLIT_DEV_DOMAIN": JSON.stringify(process.env.REPLIT_DEV_DOMAIN ?? ""),
    "import.meta.env.VITE_POS_MODE": JSON.stringify(process.env.VITE_POS_MODE ?? ""),
  },
  plugins: [
    posRedirectPlugin(),
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
    strictPort: false,
    host: "0.0.0.0",
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
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/q": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/pos-images": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      // BizPortal dev server — proxied so /bizportal/* works via main entry port
      "/bizportal": {
        target: "http://localhost:18442",
        changeOrigin: true,
        ws: true,
      },
      "/logistic-order": {
        target: "http://localhost:19368",
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
