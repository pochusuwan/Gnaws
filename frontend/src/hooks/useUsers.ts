import { useState, useEffect, useCallback, useRef } from "react";
import { loadedState, loadingState, Role, type NetworkDataState, type NewUser, type User } from "../types";
import useApiCall from "./useApiCall";

export const useUsers = (user: User | null) => {
    const initialized = useRef(false);
    const [users, setUsers] = useState<NetworkDataState<User[]>>(loadingState());
    const { call: callLoadUsers, state } = useApiCall<{ users: User[] }>("getUsers");
    const { call: callUpdateUsers } = useApiCall<{ success: boolean }>("updateUsers");
    const { call: callAddUser } = useApiCall<{ user: NewUser }>("addUser");
    const { call: callRegeneratePin } = useApiCall<{ pin: string }>("regeneratePin");

    const loadUsers = useCallback(async () => {
        if (!initialized.current) {
            initialized.current = true;
            callLoadUsers();
        }
    }, [callLoadUsers]);

    useEffect(() => {
        if (state.state === "Error") {
            setUsers(state);
        } else if (state.state === "Loaded") {
            // Owner first, then everyone else alphabetically by username.
            const sorted = [...state.data.users].sort((a, b) => {
                if (a.role === Role.Owner && b.role !== Role.Owner) return -1;
                if (b.role === Role.Owner && a.role !== Role.Owner) return 1;
                return a.username.toLowerCase() > b.username.toLowerCase() ? 1 : -1;
            });
            setUsers(loadedState(sorted));
        } else {
            setUsers(loadingState());
        }
    }, [state]);

    const updateUsers = useCallback(
        async (usersToUpdate: { [username: string]: Role }) => {
            const toUpdate = Object.entries(usersToUpdate).map(([username, role]) => ({ username, role }));
            const res = await callUpdateUsers({ users: toUpdate });
            if (res?.success && users.state === "Loaded") {
                const newUsers = users.data.map((u) => {
                    const user = { ...u };
                    const updatedRole = usersToUpdate[user.username];
                    if (updatedRole !== undefined) {
                        user.role = updatedRole;
                    }
                    return user;
                });
                setUsers(loadedState(newUsers));
                return true;
            }
            return false;
        },
        [users, callUpdateUsers],
    );

    useEffect(() => {
        if (user === null) {
            initialized.current = false;
            setUsers(loadingState());
        }
    }, [user]);

    const addUser = useCallback(
        async (username: string) => {
            const res = await callAddUser({ username });
            if (res?.user && users.state === "Loaded") {
                const { username, role } = res.user;
                setUsers(loadedState([...users.data, { username, role, hasPin: true }]));
            }
            return res?.user;
        },
        [users, callAddUser],
    );

    const regeneratePin = useCallback(
        async (username: string) => {
            const res = await callRegeneratePin({ username });
            if (res?.pin && users.state === "Loaded") {
                setUsers(loadedState(users.data.map((u) => (u.username === username ? { ...u, hasPin: true } : u))));
            }
            return res?.pin;
        },
        [users, callRegeneratePin],
    );

    return { users, loadUsers, updateUsers, addUser, regeneratePin };
};
