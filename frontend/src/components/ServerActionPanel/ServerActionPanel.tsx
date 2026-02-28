import { useCallback, useState } from "react";
import type { Server } from "../../types";
import "./ServerActionPanel.css";

type ServerActionPanelProps = {
    server: Server;
    callAction: (action: string, params?: { [key: string]: string }) => void;
};

export default function ServerActionPanel(props: ServerActionPanelProps) {
    const { server, callAction } = props;
    const [command, setCommand] = useState("");
    const sendCommand = useCallback(() => {
        callAction("SendServerCommand", { command });
        setCommand("");
    }, [command, callAction]);

    const sendCommandKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                sendCommand();
            }
        },
        [sendCommand],
    );

    return (
        <div className="serverActionPanel">
            {server.game?.supportServerCommand && (
                <div className="sendCommandRow">
                    <input
                        className="sendCommandInput"
                        type="text"
                        placeholder="command"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyDown={sendCommandKeyDown}
                    />
                    <button onClick={sendCommand}>Send</button>
                    <div>Send game server command to server. The server must be running.</div>
                </div>
            )}
        </div>
    );
}
