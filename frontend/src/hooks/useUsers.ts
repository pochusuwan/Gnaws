import { useState, useEffect, useCallback } from "react";
import type { Role, User } from "../types";
import useApiCall from "./useApiCall";

export const useUsers = (user: User | null) => {
    const [initialized, setInitialized] = useState(false);
    const [users, setUsers] = useState<User[]>([]);
    const { call: callLoadUsers } = useApiCall<{ users: User[] }>("getUsers");
    const { call: callUpdateUsers } = useApiCall<{ success: boolean }>("updateUsers");

    const loadUsers = useCallback(async () => {
        if (initialized) return;
        const data = await callLoadUsers();
        if (data?.users) {
            setInitialized(true);
            setUsers(data.users);
        }
    }, [callLoadUsers, initialized]);

    const updateUsers = useCallback(
        async (usersToUpdate: { [username: string]: Role }) => {
            const toUpdate = Object.entries(usersToUpdate).map(([username, role]) => ({ username, role }));
            const res = await callUpdateUsers({ users: toUpdate });
            if (res?.success) {
                const newUsers = users.map((u) => {
                    const user = { ...u };
                    const updatedRole = usersToUpdate[user.username];
                    if (updatedRole !== undefined) {
                        user.role = updatedRole;
                    }
                    return user;
                });
                setUsers(newUsers);
                return true;
            }
            return false;
        },
        [users, callUpdateUsers],
    );

    useEffect(() => {
        if (user === null) {
            setUsers([]);
            setInitialized(false);
        }
    }, [user]);

    return { initialized, users, loadUsers, updateUsers };
};
