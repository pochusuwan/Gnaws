import { useState } from "react";
import "./App.css";
import type { User } from "./types";
import LoginForm, { LoggedIn } from "./components/Login/Login.tsx";
import ServerPage from "./pages/ServerPage/ServerPage.tsx";
import UserPage from "./pages/UserPage/UserPage.tsx";
import { useServers } from "./hooks/useServers.ts";
import { useUsers } from "./hooks/useUsers.ts";

enum Page {
    Servers = "Servers",
    Users = "Users",
}

function App() {
    const [page, setPage] = useState<Page>(Page.Servers);
    const [user, setUser] = useState<User | null>(null);
    const { initialized: serverInitialized, servers, loadServers } = useServers(user);
    const { initialized: userInitialized, users, loadUsers, updateUsers } = useUsers(user);

    if (!user) {
        return <LoginForm setUser={setUser} />;
    }
    return (
        <div className="app">
            <LoggedIn user={user} clearUser={() => setUser(null)} />
            <PageSelector current={page} onSelect={setPage} />
            {page === Page.Servers && <ServerPage servers={servers} loading={!serverInitialized} loadServers={loadServers} />}
            {page === Page.Users && <UserPage user={user} users={users} loading={!userInitialized} loadUsers={loadUsers} updateUsers={updateUsers} />}
        </div>
    );
}

type PageSelectorProps = {
    current: Page;
    onSelect: (page: Page) => void;
};
function PageSelector({ current, onSelect }: PageSelectorProps) {
    return (
        <div className="pageSelector">
            {Object.values(Page).map((page) => (
                <button key={page} onClick={() => onSelect(page)} disabled={current === page}>
                    {page}
                </button>
            ))}
        </div>
    );
}

export default App;
