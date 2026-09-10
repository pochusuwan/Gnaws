// The frontend always calls the API same-origin under /api/, so the JWT cookie is
// first-party (SameSite=Lax) and browsers that block third-party cookies still send
// it. In production CloudFront routes /api/* to API Gateway; in dev the Vite server
// proxies /api to VITE_API_URL (see vite.config.ts). No per-deploy config needed.
export const API_URL = "/api/"

// Dev-only: true when frontend/.env has no VITE_API_URL, so the dev proxy has no
// target. main.tsx renders a setup message instead of the app.
// Set it in frontend/.env, e.g. VITE_API_URL=https://1234.execute-api.us-east-1.amazonaws.com/
export const API_URL_MISSING = import.meta.env.DEV && (import.meta.env.VITE_API_URL ?? "").trim() === ""
