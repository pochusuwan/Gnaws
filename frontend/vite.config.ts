import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    // Proxy /api to the real API Gateway so dev matches production: the browser
    // calls /api/call same-origin, which keeps the JWT cookie first-party.
    // changeOrigin rewrites the Host header so API Gateway accepts the request.
    const apiTarget = loadEnv(mode, process.cwd(), "").VITE_API_URL?.trim();

    return {
        plugins: [react()],
        build: {
            outDir: "dist",
            emptyOutDir: true,
        },
        server: apiTarget
            ? { proxy: { "/api": { target: apiTarget, changeOrigin: true } } }
            : undefined,
    };
});
