import { useCallback, useEffect, useState } from "react";
import { useUser } from "../../hooks/useUser";
import { Protocol, Role, type Game, type NetworkDataState, type Port, type TermsOfService } from "../../types";
import type { GamesData } from "../../hooks/useGames";
import "./CreateServerPage.css";
import useApiCall from "../../hooks/useApiCall";

type CreateServerPageProps = {
    games: NetworkDataState<GamesData>;
    loadGames: () => void;
    refreshServer: (serverName: string) => void;
};

type Terms = {
    term: TermsOfService;
    accepted: boolean;
};

export default function CreateServerPage(props: CreateServerPageProps) {
    const userRole = useUser().role;
    const [serverName, setServerName] = useState("");
    const [game, setGame] = useState("");
    const [instanceType, setInstanceType] = useState("");
    const [storage, setStorage] = useState(4);
    const [ports, setPorts] = useState<Port[]>([]);
    const [message, setMessage] = useState("");
    const [instanceTypeRec, setInstanceTypeRec] = useState("");
    const [instanceTypeMinRec, setInstanceTypeMinRec] = useState("");
    const [terms, setTerms] = useState<Terms[]>([]);
    const { call: createServerCall, state: createServerResponse } = useApiCall<{ message: string, serverName: string }>("createServer");

    // Load games on page load
    useEffect(() => {
        if (userRole === Role.Admin) {
            props.loadGames();
        }
    }, [userRole, props.loadGames]);

    // Set initial game when games are loaded
    useEffect(() => {
        if (props.games.state === "Loaded" && game === "" && props.games.data.initialGame !== "") {
            setGame(props.games.data.initialGame);
        }
    }, [props.games, game, setGame]);

    const setDataFromGame = useCallback((game: Game) => {
        setInstanceType(game.ec2.instanceType);
        setStorage(game.ec2.storage);
        setPorts(game.ec2.ports.map((p) => ({ ...p })));
        setInstanceTypeRec(game.ec2.instanceType);
        setInstanceTypeMinRec(game.ec2.minimumInstanceType);
        const terms = game.termsOfService ?? [];
        setTerms(terms.map((term) => ({ term, accepted: false })));
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
    const addPortClick = useCallback(() => {
        setPorts([
            ...ports,
            {
                port: 80,
                protocol: Protocol.TCP,
            },
        ]);
    }, [ports]);
    const onPortNumberChange = useCallback(
        (value: string, index: number) => {
            const newPorts = [...ports];
            newPorts[index].port = parseInt(value);
            setPorts(newPorts);
        },
        [ports],
    );
    const onPortProtocolChange = useCallback(
        (value: string, index: number) => {
            const newPorts = [...ports];
            newPorts[index].protocol = value as Protocol;
            setPorts(newPorts);
        },
        [ports],
    );
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
        createServerCall({ serverName, gameId: game, instanceType, storage, ports });
    }, [serverName, game, instanceType, storage, ports]);

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

    if (userRole !== Role.Admin) {
        return <div>No permission</div>;
    }
    if (props.games.state === "Error") return <div>Failed to load games: {props.games.error}</div>;

    if (props.games.state !== "Loaded") return <div>Loading games...</div>;

    const selectedGame = props.games.data.games[game];
    const allTermsAccepted = terms.every((t) => t.accepted);

    return (
        <div className="createServerPage">
            <div className="createServerGrid">
                <div>Server Name:</div>
                <input type="text" value={serverName} onChange={(e) => setServerName(e.target.value)} />
                <div>Valid characters: a-z, A-Z, 0-9, _-</div>

                <div>Game:</div>
                <select value={game} onChange={(e) => onGameChange(e.target.value)}>
                    {Object.values(props.games.data.games).map((game) => (
                        <option key={game.id} value={game.id}>
                            {game.displayName}
                        </option>
                    ))}
                </select>
                <div>Select game to install</div>

                <div>Instance Type:</div>
                <input type="text" value={instanceType} onChange={(e) => setInstanceType(e.target.value)} />
                <div>
                    {instanceTypeMinRec} (2-4 players) {instanceTypeRec} (5-8 players) recommended. This can be changed later.
                </div>

                <div>Storage:</div>
                <input type="number" value={storage} onChange={(e) => setStorage(parseInt(e.target.value))} />
                <div>GiB. This can be changed later.</div>
            </div>
            {ports.map((port, i) => (
                <div className="createServerPortGrid" key={i} style={{ backgroundColor: i < selectedGame.ec2.ports.length ? "#bebebe63" : undefined }}>
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
            <div>Modify pre-configured ports will require manual server modification.</div>
            <button className="createServerPageButton" onClick={addPortClick}>
                Add Port
            </button>
            <div className="createServerPageDivider"></div>
            {selectedGame?.messages !== undefined && selectedGame.messages.length > 0 && (
                <div>
                    <div>Additional Infomation:</div>
                    <ul className="createServerPageList">
                        {selectedGame.messages.map((m) => (
                            <li>{m.text}</li>
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
                                <div>
                                    <a href={t.term.url} target="_blank" rel="noopener noreferrer">
                                        {t.term.name}
                                    </a>
                                    <div className="createServerRow">
                                        <input type="checkbox" checked={t.accepted} onChange={(e) => onTermCheckboxChange(e.target.checked, i)} />
                                        <div>I AGREE</div>
                                    </div>
                                </div>
                            ))}
                    </ul>
                </div>
            )}
            <button className="createServerPageButton" onClick={createServerClick} disabled={createServerResponse.state === "Loading" || !allTermsAccepted}>
                Create Server
            </button>
            <div>{message}</div>
        </div>
    );
}
