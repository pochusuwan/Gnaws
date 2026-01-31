import { useCallback, useEffect, useState } from "react";
import useApiCall from "../../hooks/useApiCall";
import type { User } from "../../types";

type Props = {
    setUser: (user: User) => void;
};
export default function LoginForm(props: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const { call, loading, error } = useApiCall<User>("login");

    const login = useCallback(
        async (submit: boolean) => {
            const user = await call(submit ? { username, password } : undefined);
            if (user) props.setUser(user);
        },
        [call, username, password],
    );
    // Attempt to login with JWT once
    useEffect(() => {
        login(false);
    }, []);

    return (
        <div className="login-container">
            <form>
                <div>
                    <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div>
                    <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" onClick={() => login(true)} disabled={loading}>
                    Login / Create Account
                </button>
            </form>
            <div>{error?.error}</div>
        </div>
    );
}
