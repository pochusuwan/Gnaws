import { useState } from "react";
import "./App.css";
import type { User } from "./types";
import { UserContext, useUser } from "./hooks/useUser";
import LoginForm from "./components/Login/Login.tsx";

function App() {
    const [user, setUser] = useState<User | null>(null);
    if (!user) {
        return <LoginForm setUser={setUser} />;
    }
    return (
        <UserContext.Provider value={user}>
            <Content />
        </UserContext.Provider>
    );
}

function Content() {
    const user = useUser();

    return (
        <div>
            {user?.username} {user?.role}
        </div>
    );
}

export default App;
