import { useCallback, useEffect, useMemo, useState } from "react";
import type { Configuration, Game, Server } from "../../types";
import "./GameConfigPanel.css";
import useApiCall from "../../hooks/useApiCall";
import { useUser } from "../../hooks/useUser";
import { buildConfigHint, hasAdminPermission } from "../../utils";

type GameConfigPanelProps = {
    server: Server;
    replaceServerData: (server: Server) => void;
};

export default function GameConfigPanel({ server, replaceServerData }: GameConfigPanelProps) {
    const { call: callGetGame, state: gameState } = useApiCall<{ game: Game }>("getGame");
    const { call: callSave, state: saveState } = useApiCall<{ server: Server }>("saveGameConfig");
    const [configValues, setConfigValues] = useState<Record<string, string | number | boolean>>({});
    const [editting, setEditting] = useState(false);
    const userRole = useUser().role;

    useEffect(() => {
        if (hasAdminPermission(userRole)) {
            callGetGame({ gameId: server.game?.id });
        }
    }, [callGetGame, server.game?.id, userRole]);

    useEffect(() => {
        const values: Record<string, string | number | boolean> = {};
        server.game?.configurations?.forEach((c) => {
            if (c.value !== undefined) {
                values[c.id] = c.value;
            }
        });
        setConfigValues(values);
    }, [server, userRole]);

    const gameConfigSchema = useMemo(() => {
        if (gameState.state !== "Loaded") {
            return null;
        }
        return Object.fromEntries(gameState.data.game.configurations?.map((c) => [c.id, c]) ?? []);
    }, [gameState]);

    const onChange = useCallback((id: string, value: string | number | boolean) => {
        setConfigValues((prev) => ({ ...prev, [id]: value }));
    }, []);

    const onButtonClick = useCallback(async () => {
        if (editting) {
            const result = await callSave({ serverName: server.name, config: configValues });
            if (result?.server) {
                replaceServerData(result?.server);
                setEditting(false);
            }
        } else {
            setEditting(true);
        }
    }, [editting, configValues]);

    const gameConfigs = server.game?.configurations ?? [];
    if (gameConfigs.length === 0) {
        return <div>No configurations for this game server.</div>;
    }

    return (
        <div className="gameConfigPanel">
            <div className="gameConfigRow">
                <button
                    className="gameConfigButton"
                    onClick={onButtonClick}
                    disabled={saveState.state === "Loading" || !hasAdminPermission(userRole)}
                >
                    {editting ? "Save" : "Edit"}
                </button>
                <div>{saveState.state === "Error" ? saveState.error : saveState.state === "Loaded" ? "saved" : ""}</div>
            </div>
            <div className="gameConfigGrid">
                {gameConfigs.map((c) => (
                    <ConfigurationInput
                        key={c.id}
                        id={c.id}
                        value={configValues[c.id]}
                        config={gameConfigSchema?.[c.id]}
                        onChange={(v) => onChange(c.id, v)}
                        editting={editting && hasAdminPermission(userRole)}
                    />
                ))}
            </div>
        </div>
    );
}

type ConfigurationInputProps = {
    id: string;
    config?: Configuration;
    value: string | number | boolean | undefined;
    onChange: (value: string | number | boolean) => void;
    editting: boolean;
};
function ConfigurationInput({ id, config, value, onChange, editting }: ConfigurationInputProps) {
    if (config) {
        const isInputState = editting && config.isCreationOnly !== true;
        let valContent;

        if (config.type === "alphanumeric") {
            if (isInputState) {
                valContent = <input id={id} type={"text"} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
            } else {
                valContent = <div>{value}</div>;
            }
        } else if (config.type === "numeric") {
            if (isInputState) {
                valContent = (
                    <input id={id} type={"number"} value={(value as number) ?? ""} onChange={(e) => onChange(parseFloat(e.target.value))} />
                );
            } else {
                valContent = <div>{value}</div>;
            }
        } else if (config.type === "boolean") {
            valContent = (
                <input
                    id={id}
                    type="checkbox"
                    style={{ justifySelf: "start" }}
                    checked={(value as boolean) ?? config.default}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={!isInputState}
                />
            );
        } else if (config.type === "enum") {
            valContent = (
                <select
                    id={config.id}
                    value={(value as string) ?? config.default}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={!isInputState}
                >
                    {config.values.map((v) => (
                        <option key={v} value={v}>
                            {v}
                        </option>
                    ))}
                </select>
            );
        }
        return (
            <tr style={{ backgroundColor: config.isCreationOnly ? "#e0e0e0" : undefined }}>
                <td>{config.displayName}:</td>
                <td>{valContent}</td>
                <td>
                    {config.description} {buildConfigHint(config)}
                </td>
            </tr>
        );
    } else {
        // Game config is not loaded or no permission. Simple view and edit only
        let valContent;
        if (typeof value === "boolean") {
            valContent = (
                <input
                    id={id}
                    type="checkbox"
                    style={{ justifySelf: "start" }}
                    checked={value}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={!editting}
                />
            );
        } else {
            if (editting) {
                valContent = <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.checked)} />;
            } else {
                valContent = <div>{value}</div>;
            }
        }
        return (
            <tr>
                <td>{id}:</td>
                <td>{valContent}</td>
                <td></td>
            </tr>
        );
    }
}
