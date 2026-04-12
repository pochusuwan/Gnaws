import { useCallback, useEffect, useState } from "react";
import { useUser } from "../../hooks/useUser";
import { type Configuration, type Game, type NetworkDataState, type Port, type TermsOfService } from "../../types";
import type { GamesData } from "../../hooks/useGames";
import "./CreateServerPage.css";
import useApiCall from "../../hooks/useApiCall";
import { buildConfigHint, hasAdminPermission } from "../../utils";

type CreateServerPageProps = {
    games: NetworkDataState<GamesData>;
    loadGames: () => void;
    refreshServer: (serverName: string) => void;
};

type Terms = {
    term: TermsOfService;
    accepted: boolean;
};

// Create server with specific version of game bundle release. E.g. "infra-0.0.11_games-0.0.3"
const VERSION_OVERRIDE: string | undefined = undefined;

export default function CreateServerPage(props: CreateServerPageProps) {
    const userRole = useUser().role;
    const [serverName, setServerName] = useState("");
    const [game, setGame] = useState("");
    const [version, setVersion] = useState("");
    const [instanceType, setInstanceType] = useState("");
    const [storage, setStorage] = useState(4);
    const [ports, setPorts] = useState<Port[]>([]);
    const [message, setMessage] = useState("");
    const [terms, setTerms] = useState<Terms[]>([]);
    const [configValues, setConfigValues] = useState<Record<string, string | number | boolean>>({});
    const { call: createServerCall, state: createServerResponse } = useApiCall<{ message: string; serverName: string }>("createServer");

    // Load games on page load
    useEffect(() => {
        if (hasAdminPermission(userRole)) {
            props.loadGames();
        }
    }, [userRole, props.loadGames]);

    // Set initial game when games are loaded
    useEffect(() => {
        if (props.games.state === "Loaded" && game === "" && props.games.data.initialGame !== "") {
            setGame(props.games.data.initialGame);
            setVersion(props.games.data.version);
        }
    }, [props.games, game, setGame]);

    const setDataFromGame = useCallback((game: Game) => {
        setInstanceType(game.ec2.instanceType);
        setStorage(game.ec2.storage);
        setPorts(game.ec2.ports.map((p) => ({ ...p })));
        const terms = game.termsOfService ?? [];
        setTerms(terms.map((term) => ({ term, accepted: false })));
        const defaults: Record<string, string | number | boolean> = {};
        (game.configurations ?? []).forEach((c) => {
            if (c.default !== undefined) defaults[c.id] = c.default;
        });
        setConfigValues(defaults);
    }, []);

    // On game select change, set data
    useEffect(() => {
        if (props.games.state === "Loaded") {
            const selectedGame = props.games.data.games[game];
            if (selectedGame) {
                setDataFromGame(selectedGame);
            }
        }
    }, [props.games, game, setDataFromGame]);

    // Update states from UI
    const onGameChange = useCallback((gameId: string) => setGame(gameId), [props.games, setGame]);
    // const addPortClick = useCallback(() => {
    //     setPorts([
    //         ...ports,
    //         {
    //             port: 22,
    //             protocol: Protocol.TCP,
    //         },
    //     ]);
    // }, [ports]);
    // const onPortNumberChange = useCallback(
    //     (value: string, index: number) => {
    //         const newPorts = [...ports];
    //         newPorts[index].port = parseInt(value);
    //         setPorts(newPorts);
    //     },
    //     [ports],
    // );
    // const onPortProtocolChange = useCallback(
    //     (value: string, index: number) => {
    //         const newPorts = [...ports];
    //         newPorts[index].protocol = value as Protocol;
    //         setPorts(newPorts);
    //     },
    //     [ports],
    // );
    const onTermCheckboxChange = useCallback(
        (checked: boolean, index: number) => {
            const newTerms = [...terms];
            newTerms[index].accepted = checked;
            setTerms(newTerms);
        },
        [terms],
    );

    // Validate and call create server
    const createServerClick = useCallback(() => {
        if (serverName.length === 0) {
            setMessage("Server name is required");
            return;
        }
        if (instanceType.length === 0) {
            setMessage("Instance type is required");
            return;
        }
        if (storage < 4 || storage > 128) {
            setMessage("Invalid storage. Storage must be between 4 and 128 GiB");
            return;
        }

        const parsedPorts = [];
        for (let i = 0; i < ports.length; i++) {
            if (1 <= ports[i].port && ports[i].port <= 65535) {
                parsedPorts.push({ ...ports[i] });
            } else {
                setMessage("Invalid port");
                return;
            }
        }
        if (parsedPorts.length === 0) {
            setMessage("At least one port required");
            return;
        }
        setMessage("Creating");
        createServerCall({
            serverName,
            gameId: game,
            instanceType,
            storage,
            ports,
            releaseVersion: VERSION_OVERRIDE ?? version,
            configurations: configValues,
        });
    }, [configValues, serverName, game, instanceType, storage, ports]);

    // Update states from create server response
    useEffect(() => {
        if (createServerResponse.state === "Loaded") {
            setMessage("Success");
            if (props.games.state === "Loaded") {
                setServerName("");
                setGame(props.games.data.initialGame);
                setDataFromGame(props.games.data.games[props.games.data.initialGame]);
                props.refreshServer(createServerResponse.data.serverName);
            }
        } else if (createServerResponse.state === "Error") {
            setMessage(createServerResponse.error);
        }
    }, [createServerResponse, props.games, props.refreshServer]);

    if (!hasAdminPermission(userRole)) {
        return <div>No permission</div>;
    }
    if (props.games.state === "Error") return <div>Failed to load games: {props.games.error}</div>;

    if (props.games.state !== "Loaded") return <div>Loading games...</div>;

    if (props.games.data.version === "") return <div>Failed to load games. Invalid version</div>;

    const selectedGame = props.games.data.games[game];
    const allTermsAccepted = terms.every((t) => t.accepted);

    return (
        <div className="createServerPage">
            <table className="createServerGrid">
                <tbody>
                    <tr>
                        <td>Server Name:</td>
                        <td>
                            <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} />
                        </td>
                        <td>Valid characters: a-z, A-Z, 0-9, _-</td>
                    </tr>
                    <tr>
                        <td>Game:</td>
                        <td>
                            <select value={game} onChange={(e) => onGameChange(e.target.value)}>
                                {Object.values(props.games.data.games).map((game) => (
                                    <option key={game.id} value={game.id}>
                                        {game.displayName}
                                    </option>
                                ))}
                            </select>
                        </td>
                        <td>Select game to install</td>
                    </tr>
                    <tr>
                        <td>Instance Type:</td>
                        <td>
                            <input type="text" value={instanceType} onChange={(e) => setInstanceType(e.target.value)} />
                        </td>
                        <td>
                            {selectedGame?.ec2?.minimumInstanceType} (2-4 players) {selectedGame?.ec2?.instanceType} (5-8 players)
                            recommended. This can be changed later.
                        </td>
                    </tr>
                    {/* <tr>
                        <td>Storage:</td>
                        <td>
                            <input type="number" value={storage} onChange={(e) => setStorage(parseInt(e.target.value))} />
                        </td>
                        <td>GiB. Can be increased later but cannot be decreased.</td>
                    </tr> */}
                </tbody>
            </table>
            {/* 
            Hide ports. User dont need to see this.
            {ports.map((port, i) => (
                <div
                    className="createServerPortGrid"
                    key={i}
                    style={{ backgroundColor: i < selectedGame?.ec2.ports.length ? "#bebebe63" : undefined }}
                >
                    <div>Port {i + 1}:</div>
                    <input type="number" value={port.port} onChange={(e) => onPortNumberChange(e.target.value, i)} />
                    <select value={port.protocol} onChange={(e) => onPortProtocolChange(e.target.value, i)}>
                        {Object.values(Protocol).map((protocol) => (
                            <option key={protocol} value={protocol}>
                                {protocol.toUpperCase()}
                            </option>
                        ))}
                    </select>
                </div>
            ))}
            <div className="createServerRow">
                <button className="createServerPageButton" onClick={addPortClick}>
                    Add Port
                </button>
                <div>Modify pre-configured ports will require manual server modification.</div>
            </div> */}
            <div className="createServerPageDivider"></div>
            <CreateServerConfigurations game={selectedGame} configValues={configValues} setConfigValues={setConfigValues} />
            {selectedGame?.messages !== undefined && selectedGame.messages.length > 0 && (
                <div>
                    <div>Additional Infomation:</div>
                    <ul className="createServerPageList">
                        {selectedGame.messages.map((m, i) => (
                            <li key={i}>{m.text}</li>
                        ))}
                    </ul>
                </div>
            )}
            {terms.length > 0 && (
                <div>
                    <div>Accept Terms and Conditions:</div>
                    <ul className="createServerPageList">
                        {terms
                            .filter((t) => t.term.type === "checkbox")
                            .map((t, i) => (
                                <div key={i}>
                                    <a href={t.term.url} target="_blank" rel="noopener noreferrer">
                                        {t.term.name}
                                    </a>
                                    <div className="createServerRow">
                                        <input
                                            type="checkbox"
                                            checked={t.accepted}
                                            onChange={(e) => onTermCheckboxChange(e.target.checked, i)}
                                        />
                                        <div>I AGREE</div>
                                    </div>
                                </div>
                            ))}
                    </ul>
                </div>
            )}
            <button
                className="createServerPageButton"
                onClick={createServerClick}
                disabled={createServerResponse.state === "Loading" || !allTermsAccepted}
            >
                Create Server
            </button>
            <div>{message}</div>
        </div>
    );
}

type CreateServerConfigurationsProps = {
    game: Game;
    configValues: Record<string, string | number | boolean>;
    setConfigValues: (values: Record<string, string | number | boolean>) => void;
};
function CreateServerConfigurations({ game, configValues, setConfigValues }: CreateServerConfigurationsProps) {
    const configurations = game?.configurations ?? [];
    if (configurations.length === 0) return null;

    const onChange = (id: string, value: string | number | boolean) => setConfigValues({ ...configValues, [id]: value });

    const nonCreateOnly = configurations.filter((c) => c.isCreationOnly !== true);
    const createOnly = configurations.filter((c) => c.isCreationOnly === true);
    return (
        <div>
            <div style={{ fontWeight: "bold", marginBottom: "12px" }}>Game Configuration</div>
            <table className="createServerGrid">
                <tbody>
                    {nonCreateOnly.map((c: Configuration) => (
                        <ConfigurationInput key={c.id} config={c} value={configValues[c.id]} onChange={(v) => onChange(c.id, v)} />
                    ))}
                    {createOnly.length > 0 && (
                        <tr style={{ backgroundColor: "#e0e0e0" }}>
                            <td colSpan={3}>Cannot be changed after creation:</td>
                        </tr>
                    )}

                    {createOnly.map((c: Configuration) => (
                        <ConfigurationInput key={c.id} config={c} value={configValues[c.id]} onChange={(v) => onChange(c.id, v)} />
                    ))}
                </tbody>
            </table>
            <div className="createServerPageDivider"></div>
        </div>
    );
}

type ConfigurationInputProps = {
    config: Configuration;
    value: string | number | boolean | undefined;
    onChange: (value: string | number | boolean) => void;
};
function ConfigurationInput({ config, value, onChange }: ConfigurationInputProps) {
    if (config.type === "boolean") {
        return (
            <tr style={{ backgroundColor: config.isCreationOnly ? "#e0e0e0" : undefined }}>
                <td>{config.displayName}:</td>
                <td>
                    <input
                        id={config.id}
                        style={{ justifySelf: "start" }}
                        type="checkbox"
                        checked={(value as boolean) ?? config.default}
                        onChange={(e) => onChange(e.target.checked)}
                    />
                </td>
                <td>
                    {config.description} {buildConfigHint(config)}
                </td>
            </tr>
        );
    }
    if (config.type === "enum") {
        return (
            <tr style={{ backgroundColor: config.isCreationOnly ? "#e0e0e0" : undefined }}>
                <td>{config.displayName}:</td>
                <td>
                    <select id={config.id} value={(value as string) ?? config.default} onChange={(e) => onChange(e.target.value)}>
                        {config.values.map((v) => (
                            <option key={v} value={v}>
                                {v}
                            </option>
                        ))}
                    </select>
                </td>
                <td>
                    {config.description} {buildConfigHint(config)}
                </td>
            </tr>
        );
    }
    return (
        <tr style={{ backgroundColor: config.isCreationOnly ? "#e0e0e0" : undefined }}>
            <td>{config.displayName}:</td>
            <td>
                <input
                    id={config.id}
                    type={config.type === "numeric" ? "number" : "text"}
                    value={(value as string | number) ?? config.default ?? ""}
                    onChange={(e) => onChange(config.type === "numeric" ? parseFloat(e.target.value) : e.target.value)}
                />
            </td>
            <td>
                {config.description} {buildConfigHint(config)}
            </td>
        </tr>
    );
}
