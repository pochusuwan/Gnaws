import { useCallback, useEffect, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { User } from "../../types";
import "./Login.css";
import { useUser } from "../../hooks/useUser";
import Spinner from "../Spinner/Spinner";

type Props = {
    setUser: (user: User) => void;
};
export default function LoginForm(props: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    // Login with username and password
    const { call, state } = useApiCall<User>("login");
    const login = useCallback(async () => {
        const user = await call({ username, password });
        if (user) props.setUser(user);
    }, [call, username, password, props.setUser]);

    // Login with JWT
    const { call: autoLogin, state: autoLoginState } = useApiCall<User>("login");
    useEffect(() => {
        (async () => {
            const user = await autoLogin();
            if (user) props.setUser(user);
        })();
    }, [autoLogin, props.setUser]);

    // If auto login failed, render login form
    if (autoLoginState.state === "Error") {
        return (
            <div>
                <form>
                    <div>
                        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                    <div>
                        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" onClick={login} disabled={state.state === "Loading"}>
                        Login / Create Account
                    </button>
                </form>
                <div>{state.state === "Error" && `Login failed: ${state.error}`}</div>
            </div>
        );
    }

    // Otherwise, wait for auto login
    return <Spinner />;
}

type LoggedInProps = {
    clearUser: () => void;
};
export function LoggedIn(props: LoggedInProps) {
    const username = useUser().username;
    const { call, state } = useApiCall("logout");

    const logout = useCallback(async () => {
        if (await call()) props.clearUser();
    }, [call]);
    return (
        <div className="loggedIn">
            <div>{username}</div>
            <button onClick={logout} disabled={state.state === "Loading"}>
                Log out
            </button>
        </div>
    );
}
