import { useCallback, useRef, useState } from "react";
import { API_URL } from "../config";
import { emptyState, errorState, loadedState, loadingState, type NetworkDataState } from "../types";

function callApi(requestType: string, params: Record<string, any>): Promise<any> {
    return fetch(`${API_URL}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType,
            params,
        }),
        credentials: "include",
    });
}

export default function useApiCall<T>(requestType: string) {
    const inFlight = useRef(false);
    const [state, setState] = useState<NetworkDataState<T>>(emptyState());

    const call = useCallback(async (params: Record<string, any> = {}): Promise<T | undefined> => {
        if (inFlight.current) return;
        inFlight.current = true;
        setState(loadingState());

        try {
            const res = await callApi(requestType, params);
            const data = await res.json();
            if (res.ok) {
                setState(loadedState(data));
                return data;
            } else {
                console.log("Request failed:", res.status, data);
                const error = typeof data?.error === "string" ? data?.error : "Unknown";
                setState(errorState(error));
            }
        } catch (e) {
            setState(errorState("Unknown"));
        } finally {
            inFlight.current = false;
        }
    }, []);

    return { call, state };
}
