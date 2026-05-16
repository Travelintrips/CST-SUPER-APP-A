import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 18442;

const basePath = process.env.BASE_PATH ?? "/bizportal/";

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ""),
    "import.meta.env.VITE_REPLIT_DEV_DOMAIN": JSON.stringify(process.env.REPLIT_DEV_DOMAIN ?? ""),
  },
  plugins: [
    {
      name: "redirect-root-to-base",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/" && basePath !== "/") {
            // Serve an HTML page so client-side JS can forward the hash fragment
            // (e.g. #access_token=... from Supabase OAuth) to the customer portal.
            // A plain 302 redirect would lose the hash because it is client-only.
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Redirecting…</title>
<script>
var h = window.location.hash;
var s = window.location.search;
// If this looks like a Supabase OAuth callback, forward to customer portal
if (h.indexOf('access_token') !== -1 || h.indexOf('error=') !== -1 ||
    s.indexOf('code=') !== -1 || s.indexOf('error=') !== -1) {
  window.location.replace('/customer-portal/' + s + h);
} else {
  window.location.replace('/bizportal/');
}
</script></head><body>Redirecting…</body></html>`);
            return;
          }
          next();
        });
      },
    },
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
      "@workspace/replit-auth-web": path.resolve(import.meta.dirname, "../../lib/replit-auth-web/src/index.ts"),
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
        path.resolve(import.meta.dirname, "../customer-portal/**"),
        path.resolve(import.meta.dirname, "../cst-driver/**"),
        path.resolve(import.meta.dirname, "../logistic-order/**"),
        path.resolve(import.meta.dirname, "../mockup-sandbox/**"),
      ],
    },
    fs: {
      strict: false,
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
