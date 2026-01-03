let server_servers = null;
let server_loadingServers = false;
let server_blockRefresh = false;
let server_refreshScheduled = false;
let server_autoRefreshCount = 0;

const BUTTON_START = "Start";
const BUTTON_STOP = "Stop";
const BUTTON_BACKUP = "Backup";
const BUTTONS = [BUTTON_START, BUTTON_STOP, BUTTON_BACKUP];

function resetServers() {
    server_servers = null;
    server_loadingServers = false;
    document.getElementById("serversListBody").replaceChildren();
}

async function loadServersPage() {
    if (!server_loadingServers && server_servers === null) {
        server_loadingServers = true;
        const servers = await loadServers(true);
        if (servers !== null) {
            server_servers = servers;
            renderServers();
        }
        scheduleRefreshServers();
        server_loadingServers = false;
    }
}

function scheduleRefreshServers() {
    const shouldSchedule = server_servers?.some((server) => !server.status?.status || server.workflow?.status === "running");
    if (shouldSchedule && !server_blockRefresh && !server_refreshScheduled && server_autoRefreshCount < 10) {
        server_refreshScheduled = true;
        server_autoRefreshCount += 1;
        setTimeout(() => {
            server_refreshScheduled = false;
            refreshServers();
        }, 3500);
    }
}

async function refreshServers() {
    const servers = await loadServers(false);
    if (servers !== null) {
        server_servers = servers;
        renderServers();
        scheduleRefreshServers();
    } else {
        server_blockRefresh = true;
    }
}

async function loadServers(refreshStatus) {
    const res = await callAPI("getServers", { refreshStatus });
    if (res.ok) {
        const data = await res.json();
        if (data.servers) {
            return data.servers;
        }
    }
    return null;
}

function renderServers() {
    const serversList = document.getElementById("serversListBody");
    serversList.replaceChildren();

    server_servers.forEach((server) => {
        let currentTask = server.workflow?.currentTask;
        if (currentTask) {
            currentTask += ": " + server.workflow.status;
        }
        serversList.appendChild(buildRow(server.name, server.game?.name, server.ec2?.instanceType, server.status?.status ?? "Loading", currentTask));
    });
}

function buildRow(name, game, instanceType, status, currentTask) {
    const canManage = auth_role === ROLE_ADMIN || auth_role === ROLE_MANAGER;

    const attributes = [name, game, instanceType, status, currentTask];
    if (!canManage) {
        attributes.push("No permission");
    }

    const tr = document.createElement("tr");
    attributes.forEach((attr) => {
        const td = document.createElement("td");
        td.textContent = attr;
        tr.appendChild(td);
    });

    if (canManage) {
        const actionTd = document.createElement("td");
        BUTTONS.forEach((action) => {
            const btn = document.createElement("button");
            btn.textContent = action;
            btn.addEventListener("click", () => onActionClick(name, action));
            actionTd.append(btn);
        });
        tr.appendChild(actionTd);
    }
    return tr;
}

async function onActionClick(name, action) {
    document.getElementById("serverMessage").textContent = "";
    const res = await callAPI("serverAction", { name, action: action.toLowerCase() });
    const data = await res.json();
    if (res.ok) {
        document.getElementById("serverMessage").textContent = data.message;
        if (!server_refreshScheduled) {
            refreshServers();
        }
    } else {
        document.getElementById("serverMessage").textContent = "Error: " + data.error;
    }
}
