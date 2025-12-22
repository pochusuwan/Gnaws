let username, role;
let users;
let loadingUsers = false;
let editingUsers = {};
const ROLES = ["new", "manager", "admin"];
let currentPage = "servers";

async function login(isSubmit) {
    let params;
    if (isSubmit) {
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        params = { username, password };
    } else {
        params = {};
    }

    const res = await fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType: "login",
            params,
        }),
        credentials: "include",
    });
    if (res.ok) {
        const data = await res.json();
        username = data.username;
        role = data.role;
        updateCredElements();
        loadPage(currentPage);
    } else {
        username = null;
        role = null;
        updateCredElements(isSubmit ? "Fail" : "");
    }
}

async function logout() {
    const res = await fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType: "logout",
            params: {},
        }),
        credentials: "include",
    });
    if (res.ok) {
        username = null;
        role = null;
        users = null;
        loadingUsers = false;
        editingUsers = {};
    }
    updateCredElements();
}

function updateCredElements(loginMessage) {
    if (username) {
        document.getElementById("login_input").style.display = "none";
        document.getElementById("logged_in_input").style.display = "block";
        document.getElementById("username_logged_in").textContent = username;
        document.getElementById("content").style.display = "block";
    } else {
        document.getElementById("login_input").style.display = "block";
        document.getElementById("logged_in_input").style.display = "none";
        document.getElementById("username_logged_in").textContent = "";
        document.getElementById("content").style.display = "none";
    }
    document.getElementById("usersList").replaceChildren();
    document.getElementById("login_message").textContent = loginMessage ?? "";
}

async function loadPage(pageId) {
    currentPage = pageId;
    if (pageId == "users") {
        if (role === "admin") {
            if (!users && !loadingUsers) {
                loadingUsers = true;
                const fetchedUsers = await loadUsers();
                loadingUsers = false;
                if (fetchedUsers !== null) {
                    const usersMap = {};
                    fetchedUsers.forEach((user) => {
                        usersMap[user.username] = { role: user.role };
                    });
                    users = usersMap;
                    renderUsers(users);
                }
            }
        } else {
            loadingUsers = true;
            document.getElementById("usersList").textContent = "No permission";
        }
    }
}

async function loadUsers() {
    const res = await fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType: "getUsers",
        }),
        credentials: "include",
    });
    if (res.ok) {
        return (await res.json()).users;
    } else {
        return null;
    }
}

function renderUsers(users) {
    const usersList = document.getElementById("usersList");
    usersList.replaceChildren();
    usersList.appendChild(createUserRow(username, role, [role], true));
    Object.entries(users)
        .map(([key, value]) => ({ username: key, role: value.role }))
        .filter((user) => user.username !== username)
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
    usersList.appendChild(row);
    return row;
}

function updateUserRole(username, newRole) {
    const row = document.getElementById("user_" + username);
    if (users[username].role === newRole) {
        delete editingUsers[username];
        row.style.backgroundColor = "";
    } else {
        editingUsers[username] = newRole;
        row.style.backgroundColor = "#90EE90";
    }
    const anyChanged = Object.keys(editingUsers).length > 0;
    document.getElementById("updateUsers").style.display = anyChanged ? "block" : "none";
}

async function updateUsers() {
    const usersToUpdate = Object.entries(editingUsers).map(([username, role]) => ({ username, role }));
    const res = await fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType: "updateUsers",
            params: {
                users: usersToUpdate,
            },
        }),
        credentials: "include",
    });
    if (res.ok && (await res.json()).result === "success") {
        usersToUpdate.forEach((user) => {
            users[user.username].role = user.role;
            document.getElementById("user_" + user.username).style.backgroundColor = "";
        });
        editingUsers = {};
        document.getElementById("updateUsers").style.display = "none";
        document.getElementById("updateUsersMessage").textContent = "";
    } else {
        document.getElementById("updateUsersMessage").textContent = "Update failed";
    }
}
