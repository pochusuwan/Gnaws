const config = await fetch("/config.json").then((r) => r.json());
export const API_URL: string = config.apiUrl;
