let user_users = null;
let user_loadingUsers = false;
let user_editingUsers = {};

function resetUsers() {
    user_users = null;
    user_loadingUsers = false;
    user_editingUsers = {};
    document.getElementById("usersList").replaceChildren();
    document.getElementById("usersListNoPermission").style.display = "none";
}

async function loadUsersPage() {
    if (auth_role === ROLE_ADMIN) {
        if (!user_loadingUsers && user_users === null) {
            user_loadingUsers = true;

            const usersMap = await loadUsers();
            if (usersMap !== null) {
                user_users = usersMap;
                renderUsers();
            }
            user_loadingUsers = false;
        }
    } else {
        user_loadingUsers = true;
        document.getElementById("usersListNoPermission").style.display = "block";
    }
}

async function loadUsers() {
    const res = await callAPI("getUsers");
    if (res.ok) {
        const users = (await res.json()).users;
        if (users) {
            const usersMap = {};
            users.forEach((user) => {
                usersMap[user.username] = { role: user.role };
            });
            return usersMap;
        }
    }
    return null;
}

function renderUsers() {
    document.getElementById("usersListNoPermission").style.display = "none";
    const usersList = document.getElementById("usersList");
    usersList.replaceChildren();
    usersList.appendChild(createUserRow(auth_username, auth_role, [auth_role], true));
    Object.entries(user_users)
        .map(([key, value]) => ({ username: key, role: value.role }))
        .filter((user) => user.username !== auth_username)
        .sort((a, b) => (a.username.toUpperCase() > b.username.toUpperCase() ? 1 : -1))
        .forEach((user) => usersList.appendChild(createUserRow(user.username, user.role, ROLES, false)));
}

function createUserRow(username, selectedRole, roles, isDisabled) {
    const row = document.createElement("div");
    row.className = "user";
    row.id = "user_" + username;

    const select = document.createElement("select");
    select.disabled = isDisabled;
    roles.forEach((role) => {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        if (selectedRole === role) option.selected = true;
        select.appendChild(option);
    });

    select.addEventListener("change", () => {
        updateUserRole(username, select.value);
    });

    const name = document.createElement("div");
    name.style.marginLeft = "10px";
    name.textContent = username;

    row.append(select, name);
    return row;
}

function updateUserRole(username, newRole) {
    const row = document.getElementById("user_" + username);
    if (user_users[username].role === newRole) {
        delete user_editingUsers[username];
        row.style.backgroundColor = "";
    } else {
        user_editingUsers[username] = newRole;
        row.style.backgroundColor = "#90EE90";
    }
    const anyChanged = Object.keys(user_editingUsers).length > 0;
    document.getElementById("updateUsers").style.display = anyChanged ? "block" : "none";
}

async function updateUsers() {
    const usersToUpdate = Object.entries(user_editingUsers).map(([username, role]) => ({ username, role }));
    const res = await callAPI("updateUsers", { users: usersToUpdate });
    if (res.ok && (await res.json()).result === "success") {
        usersToUpdate.forEach((user) => {
            user_users[user.username].role = user.role;
            document.getElementById("user_" + user.username).style.backgroundColor = "";
        });
        editingUsers = {};
        document.getElementById("updateUsers").style.display = "none";
        document.getElementById("updateUsersMessage").textContent = "";
    } else {
        document.getElementById("updateUsersMessage").textContent = "Update failed";
    }
}
