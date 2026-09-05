import { useCallback, useEffect, useState } from "react";
import { Role, type NetworkDataState, type NewUser, type User } from "../../types";
import "./UserPage.css";
import { useUser } from "../../hooks/useUser";
import { hasAdminPermission, roleRank } from "../../utils";
import { EditableField } from "../../components/EditableField/EditableField";
import { ConfirmDialog, useConfirm } from "../../components/ConfirmDialog/ConfirmDialog";

type UserPageProps = {
    users: NetworkDataState<User[]>;
    loadUsers: () => void;
    updateUsers: (users: { [username: string]: Role }) => Promise<boolean>;
    addUser: (username: string) => Promise<NewUser | undefined>;
    regeneratePin: (username: string) => Promise<string | undefined>;
};

export default function UserPage(props: UserPageProps) {
    const currentUser = useUser();
    const userRole = currentUser.role;
    const [editingUsers, setEditingUsers] = useState<{ [username: string]: Role }>({});
    const [updateUsersMessage, setUpdateUsersMessage] = useState("");
    const [newUsername, setNewUsername] = useState("");
    const [addUserMessage, setAddUserMessage] = useState("");
    const [addingUser, setAddingUser] = useState(false);
    useEffect(() => {
        if (hasAdminPermission(userRole)) {
            props.loadUsers();
        }
    }, [userRole, props.loadUsers]);

    const submitAddUser = useCallback(async () => {
        setAddUserMessage("");
        setAddingUser(true);
        const user = await props.addUser(newUsername);
        setAddingUser(false);
        if (user) {
            setNewUsername("");
            setAddUserMessage(`Added ${user.username} — PIN: ${user.pin}`);
        } else {
            setAddUserMessage("Failed to add user");
        }
    }, [props.addUser, newUsername]);

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
            <div style={{ textAlign: "start" }}>Each user (except the owner) logs in with their own 4-digit PIN, set by an admin</div>
            <div className="addUserRow">
                <EditableField label={"New username"} value={newUsername} editing={true} onValueChange={setNewUsername} />
                <button disabled={!newUsername || addingUser} onClick={submitAddUser}>
                    Add user
                </button>
            </div>
            <div>{addUserMessage}</div>
            <div className="userTable">
                <div className="userTableHeader">
                    <div style={{ fontWeight: "bold" }}>Set users permissions</div>
                    {Object.values(editingUsers).length > 0 && <button onClick={submitUpdate}>Update</button>}
                <div>{updateUsersMessage}</div>
                </div>
                <div>New — View server list and IP addresses only</div>
                <div>User — Can start and stop servers</div>
                <div>Admin — Can start, stop, create, modify servers, and manage permissions</div>
                {props.users.data.map((user) => (
                    <UserRow
                        key={user.username}
                        user={user}
                        currentUser={currentUser}
                        onUpdate={onUpdate}
                        regeneratePin={props.regeneratePin}
                        editting={editingUsers[user.username] !== undefined}
                    />
                ))}
            </div>
        </div>
    );
}

type RowProps = {
    user: User;
    currentUser: User;
    onUpdate?: (username: string, role?: Role) => void;
    regeneratePin: (username: string) => Promise<string | undefined>;
    editting?: boolean;
    disabled?: boolean;
};
function UserRow(props: RowProps) {
    const [regenerating, setRegenerating] = useState(false);
    const [newPin, setNewPin] = useState("");
    const { open: confirmRegenOpen, onResult: confirmRegenResult, confirm: confirmRegen } = useConfirm();
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
    const onRegeneratePin = useCallback(async () => {
        const confirmed = await confirmRegen();
        if (!confirmed?.result) return;
        setRegenerating(true);
        setNewPin("");
        const pin = await props.regeneratePin(props.user.username);
        setRegenerating(false);
        if (pin) setNewPin(pin);
    }, [confirmRegen, props.regeneratePin, props.user.username]);
    const isSelf = props.currentUser.username === props.user.username;
    const outranksTarget = roleRank(props.currentUser.role) > roleRank(props.user.role);
    // Mirror the backend updateUsers rules: a role can be changed only for a lower-ranked,
    // non-owner user, and never your own.
    const canChangeRole = !isSelf && props.user.role !== Role.Owner && outranksTarget;
    // Backend regeneratePin allows a lower-ranked target or yourself, never the owner.
    const canManagePin = props.user.role !== Role.Owner && (isSelf || outranksTarget);
    // Owner is not an assignable permission; only keep it as an option on the owner's own (disabled) row.
    const roleOptions =
        props.user.role === Role.Owner ? Object.values(Role) : Object.values(Role).filter((role) => role !== Role.Owner);
    return (
        <div className={`userRow${props.editting ? " userRowEditing" : ""}`}>
            <div className="userValue">{props.user.username}</div>
            <select id={props.user.username} defaultValue={props.user.role} onChange={onChange} disabled={!canChangeRole}>
                {roleOptions.map((role) => (
                    <option key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                    </option>
                ))}
            </select>
            {canManagePin && (
                <>
                    <button onClick={onRegeneratePin} disabled={regenerating}>
                        New PIN
                    </button>
                    {newPin && <div>New PIN: {newPin}. Copy it now, it won't be shown again</div>}
                </>
            )}
            {confirmRegenOpen && (
                <ConfirmDialog
                    message={`Generate a new PIN for ${isSelf ? "yourself" : props.user.username}? The current PIN stops working immediately.`}
                    yesMessage="Regenerate"
                    onResult={confirmRegenResult}
                />
            )}
        </div>
    );
}
