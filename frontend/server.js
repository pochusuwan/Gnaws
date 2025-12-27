let server_servers = null;
let server_loadingServers = false;

async function testStart() {
    const res = await callAPI("startTestServer");
    console.log(await res.json());
}

function resetServers() {
    server_servers = null;
    server_loadingServers = false;
    document.getElementById("serversList").replaceChildren();
}

async function loadServersPage() {
    if (auth_role === ROLE_ADMIN || auth_role === ROLE_MANAGER) {
        if (!server_loadingServers && server_servers === null) {
            server_loadingServers = true;
            const servers = await loadServers();
            console.log("loaded", servers);
            if (servers !== null) {
                server_servers = servers;
                renderServers();
            }
            server_loadingServers = false;
        }
    } else {
        server_loadingServers = true;
        document.getElementById("serversList").textContent = "No permission";
    }
}

async function loadServers() {
    const res = await callAPI("getServers");
    if (res.ok) {
        const data = await res.json();
        if (data.servers) {
            return data.servers;
        }
    }
    return null;
}

function renderServers() {}
