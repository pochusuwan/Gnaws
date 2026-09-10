// Shown instead of the app in `vite dev` when frontend/.env has no VITE_API_URL.
export default function DevConfigWarning() {
    return (
        <div style={{ padding: 24, lineHeight: 1.6 }}>
            <h2>Backend API URL not set</h2>
            <p>
                Create <code>frontend/.env</code> with your API Gateway URL (with the trailing slash), then reload:
            </p>
            <pre>VITE_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/</pre>
        </div>
    );
}
