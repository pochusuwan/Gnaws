import { useState } from "react";
import "./App.css";

const config = await fetch("/config.json").then((r) => r.json());
export const API_URL: string = config.apiUrl;

function App() {
    const [count, setCount] = useState(0);
    console.log("api", API_URL);
    return (
        <>
            <h1>Vite + React</h1>
            <div className="card">
                <button onClick={() => setCount((count) => count + 1)}>count is {count}</button>
                <p>
                    Edit <code>src/App.tsx</code> and save to test HMR
                </p>
            </div>
        </>
    );
}

export default App;
