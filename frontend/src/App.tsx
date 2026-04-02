import { useEffect, useState } from "react";
import "./App.css";
import { type User } from "./types";
import LoginForm, { LoggedIn } from "./components/Login/Login.tsx";
import ServerPage from "./pages/ServerPage/ServerPage.tsx";
import UserPage from "./pages/UserPage/UserPage.tsx";
import CreateServerPage from "./pages/CreateServerPage/CreateServerPage.tsx";
import { useServers } from "./hooks/useServers.ts";
import { useUsers } from "./hooks/useUsers.ts";
import { UserContext } from "./hooks/useUser.ts";
import { useGames } from "./hooks/useGames.ts";
import PageSelector from "./components/PageSelector/PageSelector.tsx";
import { hasAdminPermission } from "./utils.ts";
import useApiCall from "./hooks/useApiCall.ts";
import { MetricsProvider } from "./hooks/useMetrics.tsx";

const SERVERS_PAGE = "Servers";
const USERS_PAGE = "Users";
const CREATE_SERVER_PAGE = "Create Server";
const PAGES = [SERVERS_PAGE, USERS_PAGE, CREATE_SERVER_PAGE];

export default function App() {
    const [page, setPage] = useState(SERVERS_PAGE);
    const [user, setUser] = useState<User | null>(null);
    const { servers, refreshServer } = useServers(user);
    const { users, loadUsers, updateUsers } = useUsers(user);
    const { games, loadGames } = useGames(user);
    const { call: checkNewReleaseCall, state: checkNewReleaseState } = useApiCall<{ hasInfraUpdate: boolean }>("checkNewRelease");
    const hasUpdate = checkNewReleaseState.state === "Loaded" && checkNewReleaseState.data.hasInfraUpdate;

    useEffect(() => {
        if (user !== null) {
            setPage(SERVERS_PAGE);
            if (hasAdminPermission(user.role)) {
                checkNewReleaseCall();
            }
        }
    }, [user]);

    if (!user) {
        return <LoginForm setUser={setUser} />;
    }
    return (
        <UserContext.Provider value={user}>
            <MetricsProvider>
                <div className="app">
                    <LoggedIn clearUser={() => setUser(null)} hasUpdate={hasUpdate} />
                    <PageSelector pages={PAGES} current={page} onSelect={setPage} />
                    {page === SERVERS_PAGE && <ServerPage servers={servers} refreshServer={refreshServer} />}
                    {page === USERS_PAGE && <UserPage users={users} loadUsers={loadUsers} updateUsers={updateUsers} />}
                    {page === CREATE_SERVER_PAGE && <CreateServerPage games={games} loadGames={loadGames} refreshServer={refreshServer} />}
                </div>
            </MetricsProvider>
        </UserContext.Provider>
    );
}
