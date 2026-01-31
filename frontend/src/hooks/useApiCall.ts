import { useCallback, useRef, useState } from "react";
import { API_URL } from "../config";

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

type ApiState<R> = {
    loading: boolean;
    data: R | null;
    error: any;
};

export default function useApiCall<R>(requestType: string) {
    const inFlight = useRef(false);
    const [state, setState] = useState<ApiState<R>>({
        loading: false,
        data: null,
        error: null,
    });

    const call = useCallback(async (params: Record<string, any> = {}): Promise<R | undefined> => {
        if (inFlight.current) return;
        inFlight.current = true;
        setState({ loading: true, data: null, error: null });

        try {
            const res = await callApi(requestType, params);
            const data = await res.json();
            if (res.ok) {
                setState({ loading: false, error: null, data });
                return data;
            } else {
                console.log("Request failed", res.status, data);
                setState({ loading: false, error: data, data: null });
                return;
            }
        } catch (e) {
            setState({ loading: false, error: "Unknown", data: null });
        } finally {
            inFlight.current = false;
        }
    }, []);

    return { call, ...state };
}
