async function start() {
    alert("start");
}

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const res = await fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType: "login",
            params: { username, password },
        }),
    });

    const data = await res.json();
    console.log(data);
}
