import { useCallback, useEffect, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { User } from "../../types";
import { useUser } from "../../hooks/useUser";
import "./Login.css";

type Props = {
    setUser: (user: User) => void;
};
export default function LoginForm(props: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [autoLoginFailed, setAutoLoginFailed] = useState(false);

    const { call, loading, error } = useApiCall<User>("login");
    const login = useCallback(async () => {
        const user = await call({ username, password });
        if (user) props.setUser(user);
    }, [call, username, password]);

    // Attempt to login with JWT once
    const { call: autoLogin, error: autoLoginError } = useApiCall<User>("login");
    useEffect(() => {
        (async () => {
            const user = await autoLogin();
            if (user) props.setUser(user);
        })();
    }, [autoLogin]);
    useEffect(() => {
        if (autoLoginError) setAutoLoginFailed(true);
    }, [autoLoginError]);

    return (
        <div className="login-container">
            {autoLoginFailed && (
                <div>
                    <form>
                        <div>
                            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        </div>
                        <div>
                            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        <button type="submit" onClick={login} disabled={loading}>
                            Login / Create Account
                        </button>
                    </form>
                    <div>{error?.error}</div>
                </div>
            )}
        </div>
    );
}

type LoggedInProps = {
    clearUser: () => void;
};
export function LoggedIn(props: LoggedInProps) {
    const user = useUser();
    const { call, loading } = useApiCall("logout");

    const logout = useCallback(async () => {
        if (await call()) props.clearUser();
    }, [call]);
    return (
        <div className="loggedIn">
            <div>{user.username}</div>
            <button onClick={logout} disabled={loading}>
                Log out
            </button>
        </div>
    );
}
