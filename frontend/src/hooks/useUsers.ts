import { useState, useEffect, useCallback } from "react";
import { loadedState, loadingState, type NetworkDataState, type Role, type User } from "../types";
import useApiCall from "./useApiCall";

export const useUsers = (user: User | null) => {
    const [users, setUsers] = useState<NetworkDataState<User[]>>(loadingState());
    const { call: callLoadUsers, state } = useApiCall<{ users: User[] }>("getUsers");
    const { call: callUpdateUsers } = useApiCall<{ success: boolean }>("updateUsers");

    const loadUsers = useCallback(async () => {
        if (users.state !== "Loaded") {
            callLoadUsers();
        }
    }, [callLoadUsers, users]);

    useEffect(() => {
        if (state.state === "Error") {
            setUsers(state);
        } else if (state.state === "Loaded") {
            setUsers(loadedState(state.data.users));
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
            setUsers(loadingState());
        }
    }, [user]);

    return { users, loadUsers, updateUsers };
};
