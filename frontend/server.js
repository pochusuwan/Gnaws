let server_servers = null;
let server_loadingServers = false;
let server_blockRefresh = false;
let server_refreshScheduled = false;
let server_autoRefreshCount = 0;
let server_createServerInitialized = false;
let server_portCount = 0;

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
    const payload = { name, action: action.toLowerCase() };
    if (action === BUTTON_STOP) {
        const shouldBackup = confirm("Do you want to backup server?");
        payload.shouldBackup = shouldBackup;
    }
    const res = await callAPI("serverAction", payload);
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

function openCreateServer() {
    document.getElementById("createServerPanel").style.display = "block";
    document.getElementById("openCreateServer").style.display = "none";

    if (!server_createServerInitialized) {
        server_createServerInitialized = true;
        const templateSelect = document.getElementById("createServerTemplate");
        const blankOption = document.createElement("option");
        blankOption.value = "Blank Instance";
        blankOption.textContent = "Blank Instance";
        templateSelect.appendChild(blankOption);
    }
}

function cancelCreateServer() {
    document.getElementById("createServerPanel").style.display = "none";
    document.getElementById("openCreateServer").style.display = "block";
}

function createServerAddPortClick() {
    const grid = document.getElementById("createServerPortGrid");

    const portLabel = document.createElement("div");
    portLabel.textContent = "Port: ";
    const protocolLabel = document.createElement("div");
    protocolLabel.textContent = "Protocol: ";

    const portInput = document.createElement("input");
    portInput.id = "portNumber"+server_portCount;

    const protocolSelect = document.createElement("select");
    protocolSelect.id = "protocolSelect"+server_portCount;
    const tcpOption = document.createElement("option");
    tcpOption.value = "tcp";
    tcpOption.textContent = "TCP";
    tcpOption.selected = true;
    const udpOption = document.createElement("option");
    udpOption.value = "udp";
    udpOption.textContent = "UDP";
    protocolSelect.appendChild(tcpOption)
    protocolSelect.appendChild(udpOption)

    grid.appendChild(portLabel);
    grid.appendChild(portInput);
    grid.appendChild(protocolLabel);
    grid.appendChild(protocolSelect);
    server_portCount += 1;
}

async function createServerClick() {
    const serverName = document.getElementById("createServerName").value;
    const template = document.getElementById("createServerTemplate").value;
    const instanceType = document.getElementById("createServerInstanceType").value;
    const storageString = document.getElementById("createServerStorage").value;
    const message = document.getElementById("createServerMessage");

    if (serverName.length === 0) {
        message.textContent = "Server name is required";
        return;
    }
    if (instanceType.length === 0) {
        message.textContent = "Instance type is required";
        return;
    }
    if (!/^\d+$/.test(storageString)) {
        message.textContent = "Invalid storage";
        return;
    }
    const storage = parseInt(storageString, 10);
    if (storage < 4) {
        message.textContent = "Invalid storage";
        return;
    }

    const ports = [];
    for (let i = 0; i < server_portCount; i++) {
        const portString = document.getElementById("portNumber"+i).value;
        const protocol = document.getElementById("protocolSelect"+i).value;

        if (!/^\d+$/.test(portString)) {
            message.textContent = "Invalid port";
            return;
        }

        const port = parseInt(portString, 10);
        if (port >= 1 && port <= 65535) {
            ports.push({ port, protocol });
        } else {
            message.textContent = "Invalid port";
            return;
        }
    }
    message.textContent = "";

    const res = await callAPI("createServer", { serverName , instanceType, ports, template, storage });
    const data = await res.json();
    if (res.ok) {
        message.textContent = "Created";
        document.getElementById("createServerName").value="";
        document.getElementById("createServerPortGrid").replaceChildren();
        server_portCount = 0;
        refreshServers();
    } else {
        message.textContent = data.error;
    }
}
