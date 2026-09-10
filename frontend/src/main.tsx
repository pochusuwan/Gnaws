import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { API_URL_MISSING } from "./config.ts";
import DevConfigWarning from "./components/DevConfigWarning/DevConfigWarning.tsx";

const root = createRoot(document.getElementById("root")!);

if (API_URL_MISSING) {
    root.render(<DevConfigWarning />);
} else {
    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
