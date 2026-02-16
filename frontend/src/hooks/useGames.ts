import { useState, useEffect, useCallback, useRef } from "react";
import { errorState, loadedState, loadingState, type Game, type NetworkDataState, type User } from "../types";
import useApiCall from "./useApiCall";

export type GamesData = {
    games: { [id: string]: Game };
    initialGame: string;
};

export const useGames = (user: User | null) => {
    const initialized = useRef(false);
    const [games, setGames] = useState<NetworkDataState<GamesData>>(loadingState());
    const { call, state } = useApiCall<{ games: Game[] }>("initCreateServer");

    const loadGames = useCallback(() => {
        if (!initialized.current) {
            initialized.current = true;
            call();
        }
    }, [call]);

    useEffect(() => {
        if (state.state === "Error") {
            setGames(state);
        } else if (state.state === "Loaded") {
            const gamesResponse = state.data.games.sort((a, b) => (a.id > b.id ? 1 : -1));
            if (gamesResponse.length > 0) {
                const games: { [id: string]: Game } = {};
                gamesResponse.forEach((game) => (games[game.id] = game));
                setGames(loadedState({ games, initialGame: gamesResponse[0].id }));
            } else {
                setGames(errorState("No games available"));
            }
        } else {
            setGames(loadingState());
        }
    }, [state]);

    useEffect(() => {
        if (user === null) {
            setGames(loadingState());
        }
    }, [user]);

    return { games, loadGames };
};
