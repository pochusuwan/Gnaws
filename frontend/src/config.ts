let apiUrl: string;

if (import.meta.env.DEV) {
    // Set your variables in frontend/.env file
    // VITE_API_URL=https://1234.execute-api.us-east-1.amazonaws.com/
    apiUrl = (import.meta.env.VITE_API_URL ?? "").trim();
} else {
    const config = await fetch("/config.json").then(r => r.json());
    apiUrl = config.apiUrl;
}

export const API_URL = apiUrl

// Dev-only: true when frontend/.env has no VITE_API_URL. main.tsx renders a
// setup message instead of the app so requests don't fire at an empty URL.
export const API_URL_MISSING = import.meta.env.DEV && apiUrl === ""
