import { useCallback, useEffect, useState } from "react";
import { Role, type NetworkDataState, type User } from "../../types";
import "./UserPage.css";
import { useUser } from "../../hooks/useUser";
import { hasAdminPermission } from "../../utils";
import useApiCall from "../../hooks/useApiCall";
import { EditableField } from "../../components/EditableField/EditableField";

type UserPageProps = {
    users: NetworkDataState<User[]>;
    loadUsers: () => void;
    updateUsers: (users: { [username: string]: Role }) => Promise<boolean>;
};

export default function UserPage(props: UserPageProps) {
    const userRole = useUser().role;
    const [editingUsers, setEditingUsers] = useState<{ [username: string]: Role }>({});
    const [updateUsersMessage, setUpdateUsersMessage] = useState("");
    const { call: getInviteCodeCall, state: inviteCodeState } = useApiCall<{ code: string }>("getInviteCode");
    const { call: randomizeInviteCode, state: randomizeInviteCodeState } = useApiCall<{ code: string }>("randomizeInviteCode");
    const [inviteCode, setInviteCode] = useState("");
    useEffect(() => {
        if (hasAdminPermission(userRole)) {
            props.loadUsers();
            getInviteCodeCall();
        }
    }, [userRole, props.loadUsers]);

    useEffect(() => {
        if (randomizeInviteCodeState.state === "Loaded") {
            setInviteCode(randomizeInviteCodeState.data.code);
        } else if (inviteCodeState.state === "Loaded") {
            setInviteCode(inviteCodeState.data.code);
        }
    }, [randomizeInviteCodeState, inviteCodeState]);

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
        <div>
            <div style={{ textAlign: "start" }}>All users except the owner log in using a shared invite code</div>
            <div className="inviteCodeRow">
                <EditableField label={"Invite Code"} value={inviteCode} editing={false} onValueChange={setInviteCode} />
                <button
                    disabled={inviteCodeState.state !== "Loaded" || randomizeInviteCodeState.state === "Loading"}
                    onClick={() => randomizeInviteCode()}
                >
                    Randomize
                </button>
            </div>
            <div className="userTable">
                <div style={{ fontWeight: "bold" }}>Set users permissions</div>
                <div>New — View server list and IP addresses only</div>
                <div>User — Can start and stop servers</div>
                <div>Admin — Can start, stop, create, modify servers, and manage permissions</div>
                <div>Owner — All permissions, including changing the invite code</div>
                {props.users.data.map((user) => (
                    <UserRow key={user.username} user={user} onUpdate={onUpdate} editting={editingUsers[user.username] !== undefined} />
                ))}
                {Object.values(editingUsers).length > 0 && <button onClick={submitUpdate}>Update</button>}
                <div>{updateUsersMessage}</div>
            </div>
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
            <div className="userValue">{props.user.username}</div>
            <select id={props.user.username} defaultValue={props.user.role} onChange={onChange} disabled={props.user.role === Role.Owner}>
                {Object.values(Role).map((role) => (
                    <option key={role} value={role} disabled={role === Role.Owner}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                ))}
            </select>
        </div>
    );
}
