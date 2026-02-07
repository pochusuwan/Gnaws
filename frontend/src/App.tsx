import { useEffect, useState } from "react";
import "./App.css";
import { Role, type User } from "./types";
import LoginForm, { LoggedIn } from "./components/Login/Login.tsx";
import ServerPage from "./pages/ServerPage/ServerPage.tsx";
import UserPage from "./pages/UserPage/UserPage.tsx";
import { useServers } from "./hooks/useServers.ts";
import { useUsers } from "./hooks/useUsers.ts";
import { UserContext } from "./hooks/useUser.ts";
import { useGames } from "./hooks/useGames.ts";

enum Page {
    Servers = "Servers",
    Users = "Users",
    CreateServer = "CreateServer",
}

function App() {
    const [page, setPage] = useState<Page>(Page.Servers);
    const [user, setUser] = useState<User | null>(null);
    const { servers, refreshServers } = useServers(user);
    const { users, loadUsers, updateUsers } = useUsers(user);
    const { games, loadGames } = useGames(user);

    useEffect(() => {
        if (user !== null) {
            setPage(Page.Servers);
        }
    }, [user]);

    if (!user) {
        return <LoginForm setUser={setUser} />;
    }
    return (
        <UserContext.Provider value={user}>
            <div className="app">
                <LoggedIn clearUser={() => setUser(null)} />
                {user.role === Role.Admin && <PageSelector current={page} onSelect={setPage} />}
                {page === Page.Servers && <ServerPage servers={servers} refreshServers={refreshServers} />}
                {page === Page.Users && <UserPage users={users} loadUsers={loadUsers} updateUsers={updateUsers} />}
            </div>
        </UserContext.Provider>
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
