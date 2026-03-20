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
    hasUpdate: boolean;
};
export function LoggedIn(props: LoggedInProps) {
    const username = useUser().username;
    const { call, state } = useApiCall("logout");
    const [updateOpen, setUpdateOpen] = useState(false);

    const logout = useCallback(async () => {
        if (await call()) props.clearUser();
    }, [call]);
    const notificationClick = useCallback(() => {
        if (props.hasUpdate) {
            setUpdateOpen(true);
        }
    }, [updateOpen, props.hasUpdate]);

    return (
        <div className="loggedIn">
            <div className="usernameContainer" onClick={notificationClick}>
                {props.hasUpdate && <div className="notificationDot" />}
                <div>{username}</div>
            </div>
            <button onClick={logout} disabled={state.state === "Loading"}>
                Log out
            </button>
            {updateOpen && <UpdateDialog close={() => setUpdateOpen(false)} />}
        </div>
    );
}

const UPDATE_SCRIPT = "[ -d Gnaws ] || git clone https://github.com/pochusuwan/Gnaws.git && ./Gnaws/start.sh -u";
type UpdateDialogProps = {
    close: () => void;
};
function UpdateDialog(props: UpdateDialogProps) {
    const [isCopied, setIsCopied] = useState(false);
    const copyCallback = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(UPDATE_SCRIPT);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    }, []);
    return (
        <div className="updateDialogRoot" onMouseDown={() => props.close()}>
            <div className="updateDialog" onMouseDown={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: "bold" }}>Update availble!</div>
                <div>
                    1. Go to AWS{" "}
                    <a href={"https://console.aws.amazon.com/cloudshell"} target="_blank" rel="noopener noreferrer">
                        CloudShell
                    </a>
                </div>
                <div>2. Run this command</div>
                <pre style={{ padding: "10px", background: "#f4f4f4", borderRadius: "5px" }}>
                    <code>{UPDATE_SCRIPT}</code>
                </pre>
                <button onClick={copyCallback}>{isCopied ? "Copied!" : "Copy"}</button>
            </div>
        </div>
    );
}
