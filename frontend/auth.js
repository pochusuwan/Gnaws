let auth_username, auth_role;

async function login(isSubmit) {
    let params = {};
    if (isSubmit) {
        params = {
            username: document.getElementById("username").value,
            password: document.getElementById("password").value,
        };
    }

    const res = await callAPI("login", params);
    if (res.ok) {
        const data = await res.json();
        auth_username = data.username;
        auth_role = data.role;
        updateCredElements();
        loadCurrentPage();
    } else {
        auth_username = null;
        auth_role = null;
        updateCredElements(isSubmit ? "Fail" : "");
    }
}

async function logout() {
    const res = await callAPI("logout");
    if (res.ok) {
        auth_username = null;
        auth_role = null;
    }
    updateCredElements();
}

function updateCredElements(loginMessage) {
    if (auth_username) {
        document.getElementById("login_input").style.display = "none";
        document.getElementById("logged_in_input").style.display = "block";
        document.getElementById("username_logged_in").textContent = auth_username;
        document.getElementById("content").style.display = "block";
    } else {
        document.getElementById("login_input").style.display = "block";
        document.getElementById("logged_in_input").style.display = "none";
        document.getElementById("username_logged_in").textContent = "";
        document.getElementById("content").style.display = "none";
    }
    resetContent();
    document.getElementById("login_message").textContent = loginMessage ?? "";
}
