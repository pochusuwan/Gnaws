import { useCallback, useState } from "react";
import type { Server } from "../../types";
import "./GameActionPanel.css";

type GameActionPanelProps = {
    server: Server;
    callAction: (action: string, refreshAfterSuccess: boolean, params?: { [key: string]: string }) => void;
};

export default function GameActionPanel(props: GameActionPanelProps) {
    const { server, callAction } = props;
    const [command, setCommand] = useState("");
    const sendCommand = useCallback(() => {
        callAction("Send_Server_Command", false, { command });
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
        <div className="gameActionPanel">
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
