let username, role;

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
    }
    updateCredElements();
}

function updateCredElements(loginMessage) {
    if (username) {
        document.getElementById("login_input").style.display = "none";
        document.getElementById("logged_in_input").style.display = "block";
        document.getElementById("username_logged_in").innerHTML = username;
        document.getElementById("content").style.display = "block";
    } else {
        document.getElementById("username_logged_in").innerHTML = "";
        document.getElementById("login_input").style.display = "block";
        document.getElementById("logged_in_input").style.display = "none";
        document.getElementById("content").style.display = "none";
    }
    document.getElementById("login_message").innerHTML = loginMessage ?? "";
}

async function getUsers() {
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
    const data = await res.json();
    console.log(data);
    console.log(typeof data);
}
