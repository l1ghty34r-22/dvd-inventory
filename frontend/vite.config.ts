import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api calls are proxied to the backend so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
