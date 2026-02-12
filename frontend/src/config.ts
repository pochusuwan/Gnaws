let apiUrl: string;

if (import.meta.env.DEV) {
    apiUrl = import.meta.env.VITE_API_URL!!
} else {
    const config = await fetch("/config.json").then(r => r.json());
    apiUrl = config.apiUrl;
}

export const API_URL = apiUrl
