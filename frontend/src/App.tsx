import { useState } from "react";
import "./App.css";
import type { User } from "./types";
import { UserContext } from "./hooks/useUser";
import LoginForm, { LoggedIn } from "./components/Login/Login.tsx";
import ServerPage from "./pages/ServerPage/ServerPage.tsx";
import UserPage from "./pages/UserPage/UserPage.tsx";

enum Page {
    Servers = "Servers",
    Users = "Users",
}

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [page, setPage] = useState<Page>(Page.Servers);
    if (!user) {
        return <LoginForm setUser={setUser} />;
    }
    return (
        <UserContext.Provider value={user}>
            <div className="app">
                <LoggedIn clearUser={() => setUser(null)} />
                <PageSelector current={page} onSelect={setPage} />
                {page === Page.Servers && <ServerPage />}
                {page === Page.Users && <UserPage />}
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
