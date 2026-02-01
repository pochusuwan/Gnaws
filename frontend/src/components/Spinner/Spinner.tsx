import "./Spinner.css";

export default function Spinner() {
    return (
        <div
            className="spinner"
            style={{
                width: "16px",
                height: "16px",
                border: "2px solid #f3f3f3",
                borderTop: "2px solid #3498db",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
            }}
        ></div>
    );
}
