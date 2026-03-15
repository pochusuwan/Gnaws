import { useCallback, useEffect, useState } from "react";
import { Role, type NetworkDataState, type User } from "../../types";
import "./UserPage.css";
import { useUser } from "../../hooks/useUser";
import { hasAdminPermission, hasOwnerPermission } from "../../utils";

type UserPageProps = {
    users: NetworkDataState<User[]>;
    loadUsers: () => void;
    updateUsers: (users: { [username: string]: Role }) => Promise<boolean>;
};

export default function UserPage(props: UserPageProps) {
    const userRole = useUser().role;
    const [editingUsers, setEditingUsers] = useState<{ [username: string]: Role }>({});
    const [ownerUser, setOwnerUser] = useState<User | undefined>(undefined);
    const [updateUsersMessage, setUpdateUsersMessage] = useState("");
    useEffect(() => {
        if (hasAdminPermission(userRole)) {
            props.loadUsers();
        }
    }, [userRole, props.loadUsers]);

    useEffect(() => {
        if (props.users.state === "Loaded") {
            const owner = props.users.data.find((user) => hasOwnerPermission(user.role));
            setOwnerUser(owner);
        }
    }, [props.users]);

    const onUpdate = useCallback(
        (username: string, role?: Role) => {
            setUpdateUsersMessage("");
            const newEditingUsers = { ...editingUsers };
            if (role) {
                newEditingUsers[username] = role;
            } else {
                delete newEditingUsers[username];
            }
            setEditingUsers(newEditingUsers);
        },
        [editingUsers],
    );

    const submitUpdate = useCallback(async () => {
        if (await props.updateUsers(editingUsers)) {
            setUpdateUsersMessage("Users updated successfully");
            setEditingUsers({});
        } else {
            setUpdateUsersMessage("Failed to update users");
        }
    }, [props.updateUsers, editingUsers]);

    if (!hasAdminPermission(userRole)) {
        return <div>No permission</div>;
    }

    if (props.users.state === "Error") {
        return <div>Failed to load users: {props.users.error}</div>;
    }

    if (props.users.state !== "Loaded") {
        return <div>Loading users...</div>;
    }

    return (
        <div className="userTable">
            {ownerUser && <UserRow user={ownerUser} disabled />}
            {props.users.data
                .filter((user) => !hasOwnerPermission(user.role))
                .map((user) => (
                    <UserRow key={user.username} user={user} onUpdate={onUpdate} editting={editingUsers[user.username] !== undefined} />
                ))}
            {Object.values(editingUsers).length > 0 && <button onClick={submitUpdate}>Update</button>}
            <div>{updateUsersMessage}</div>
        </div>
    );
}

type RowProps = {
    user: User;
    onUpdate?: (username: string, role?: Role) => void;
    editting?: boolean;
    disabled?: boolean;
};
function UserRow(props: RowProps) {
    const onChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            const selectedRole = e.target.value as Role;
            if (selectedRole === props.user.role) {
                props.onUpdate?.(props.user.username, undefined);
            } else {
                props.onUpdate?.(props.user.username, selectedRole);
            }
        },
        [props.user.username, props.onUpdate],
    );
    return (
        <div className="userRow" style={{ backgroundColor: props.editting ? "lightgreen" : "transparent" }}>
            <div>{props.user.username}</div>
            <select defaultValue={props.user.role} onChange={onChange} disabled={props.disabled}>
                {Object.values(Role).filter((role) => role !== Role.Owner).map((role) => (
                    <option key={role} value={role}>
                        {role}
                    </option>
                ))}
            </select>
        </div>
    );
}
