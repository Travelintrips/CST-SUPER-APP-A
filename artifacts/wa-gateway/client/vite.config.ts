import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const BACKEND_PORT = Number(process.env.BACKEND_PORT ?? 21173);

export default defineConfig({
  base: "/wa-gateway/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 21174,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/wa-gateway/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        ws: false,
      },
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../public"),
    emptyOutDir: true,
  },
});
