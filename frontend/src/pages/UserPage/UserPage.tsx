import { useCallback, useEffect, useState } from "react";
import { Role, type User } from "../../types";
import "./UserPage.css";

const ADMIN_USER = "admin";

type UserPageProps = {
    user: User;
    users: User[];
    loading: boolean;
    loadUsers: () => void;
    updateUsers: (users: { [username: string]: Role }) => Promise<boolean>;
};

export default function UserPage(props: UserPageProps) {
    const [editingUsers, setEditingUsers] = useState<{ [username: string]: Role }>({});
    const [adminUser, setAdminUser] = useState<User | undefined>(undefined);
    const [updateUsersMessage, setUpdateUsersMessage] = useState("");
    useEffect(() => {
        if (props.user.role === Role.Admin) {
            props.loadUsers();
        }
    }, [props.user, props.loadUsers]);

    useEffect(() => {
        const admin = props.users.find((user) => user.username === ADMIN_USER);
        setAdminUser(admin);
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

    if (props.user.role !== Role.Admin) {
        return <div>No permission</div>;
    }

    if (props.loading) return <div>Loading users...</div>;

    return (
        <div className="userTable">
            {adminUser && <UserRow user={adminUser} disabled />}
            {props.users
                .filter((user) => user.username !== ADMIN_USER)
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
                {Object.values(Role).map((role) => (
                    <option key={role} value={role}>
                        {role}
                    </option>
                ))}
            </select>
        </div>
    );
}
