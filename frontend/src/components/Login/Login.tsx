import { useCallback, useEffect, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { User } from "../../types";
import "./Login.css";
import { useUser } from "../../hooks/useUser";
import Spinner from "../Spinner/Spinner";
import { ConfirmDialog, useConfirm } from "../ConfirmDialog/ConfirmDialog";

type Props = {
    setUser: (user: User) => void;
};
export default function LoginForm(props: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    // Confirm set owner password
    const [passwordMismatch, setPasswordMismatch] = useState(false);
    const { open: confirmPasswordOpen, onResult: confirmPasswordResult, confirm: confirmPassword } = useConfirm();

    // Login with username and password
    const { call, state } = useApiCall<{ user: User | undefined; setPassword: boolean }>("login");
    const login = useCallback(
        async (setPassword?: boolean) => {
            call({ username, password, setPassword });
        },
        [call, username, password],
    );
    const startConfirmPassword = useCallback(async () => {
        const result = await confirmPassword();
        if (result?.result) {
            if (result?.input === password) {
                login(true);
            } else {
                setPasswordMismatch(true);
            }
        }
    }, [login, password]);

    useEffect(() => {
        (async () => {
            if (state.state === "Loaded") {
                if (state.data.user) {
                    props.setUser(state.data.user);
                } else if (state.data.setPassword) {
                    startConfirmPassword();
                }
            }
        })();
    }, [login, state, props.setUser]);

    // Login with JWT
    const { call: autoLogin, state: autoLoginState } = useApiCall<{ user: User | undefined; setPassword: boolean }>("login");
    useEffect(() => {
        (async () => {
            const result = await autoLogin();
            if (result?.user) props.setUser(result.user);
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
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" onClick={() => login()} disabled={state.state === "Loading"}>
                        Login / Create Account
                    </button>
                </form>
                {confirmPasswordOpen && (
                    <ConfirmDialog
                        message={
                            <p style={{ whiteSpace: "pre-line", textAlign: "start" }}>
                                {"Creating owner account\nReenter password to confirm"}
                            </p>
                        }
                        yesMessage="Confirm"
                        noMessage="Cancel"
                        onResult={confirmPasswordResult}
                        inputValue={""}
                        isPassword
                    />
                )}
                <div>{state.state === "Error" && `Login failed: ${state.error}`}</div>
                {passwordMismatch && <div>Password mismatch</div>}
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
