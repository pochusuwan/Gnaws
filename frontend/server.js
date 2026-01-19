let server_servers = null;
let server_loadingServers = false;
let server_blockRefresh = false;
let server_refreshScheduled = false;
let server_autoRefreshCount = 0;
let server_createServerInitialized = false;
let server_portCount = 0;
let server_createServerData = null;
let server_initialGame = null;

const BUTTON_START = "Start";
const BUTTON_STOP = "Stop";
const BUTTON_BACKUP = "Backup";
const BUTTONS = [BUTTON_START, BUTTON_STOP, BUTTON_BACKUP];
const HOUR_IN_MS = 60 * 60 * 1000;
const GIB = 1024 * 1024 * 1024;

const games = {
    _blank_server: {
        gameId: "_blank_server",
        displayName: "Blank Instance",
        instanceType: "t3.micro",
        storage: 8,
        ports: [
            {
                port: 25565,
                protocol: "tcp",
            },
        ],
    },
    Minecraft: {
        gameId: "Minecraft",
        displayName: "Minecraft",
        instanceType: "t3.small",
        storage: 9,
        ports: [
            {
                port: 25565,
                protocol: "tcp",
            },
        ],
    },
    Palworld: {
        gameId: "Palworld",
        displayName: "Palworld",
        instanceType: "t3.medium",
        storage: 16,
        ports: [
            {
                port: 8211,
                protocol: "udp",
            },
        ],
    },
};

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
    if (auth_role === ROLE_ADMIN) {
        document.getElementById("openCreateServer").style.display = "block";
    } else {
        document.getElementById("openCreateServer").style.display = "none";
    }
}

function scheduleRefreshServers() {
    const shouldSchedule = server_servers?.some((server) => {
        if (server.workflow?.status === "running") {
            return true;
        }
        if (server.status?.lastRequest && (!server.status?.lastUpdated || new Date(server.status.lastRequest) > new Date(server.status?.lastUpdated))) {
            return true;
        }
        return false;
    });
    if (shouldSchedule && !server_blockRefresh && !server_refreshScheduled && server_autoRefreshCount < 20) {
        server_refreshScheduled = true;
        server_autoRefreshCount += 1;
        setTimeout(() => {
            server_refreshScheduled = false;
            refreshServers();
        }, 20000);
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
        const loadingStatus = server.status?.lastRequest && (!server.status?.lastUpdated || new Date(server.status.lastRequest) > new Date(server.status?.lastUpdated));
        let currentTask = server.workflow?.currentTask;
        if (currentTask) {
            currentTask += ": " + server.workflow.status;
        }
        let timeSinceBackup;
        if (server.status?.lastBackup) {
            const timeSince = (Date.now() - new Date(server.status.lastBackup).getTime()) / HOUR_IN_MS;
            timeSinceBackup = Math.round(timeSince * 100) / 100 + "hr";
        }
        let storageString;
        if (server.status?.usedStorage && server.status?.totalStorage) {
            storageString = "" + Math.round((server.status?.usedStorage / GIB) * 100) / 100 + "/" + Math.ceil(server.status?.totalStorage / GIB) + "GiB";
        }
        serversList.appendChild(
            buildRow(server.name, [
                server.name,
                server.ec2?.instanceType,
                loadingStatus ? "Loading" : server.status?.status,
                currentTask,
                server.status?.ipAddress,
                server.status?.playerCount,
                storageString,
                timeSinceBackup,
            ]),
        );
    });
}

function buildRow(name, attributes) {
    const canManage = auth_role === ROLE_ADMIN || auth_role === ROLE_MANAGER;
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
    const payload = { name, action: action.toLowerCase() };
    if (action === BUTTON_STOP) {
        const shouldBackup = await askBackupDialob();
        if (shouldBackup === null) {
            return;
        }
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

function askBackupDialob() {
    const dialog = document.getElementById("backupDialog");
    const content = document.getElementById("backupDialogContent");
    dialog.showModal();
    return new Promise((resolve) => {
        const cleanup = (value) => {
            dialog.close();
            dialog.removeEventListener("click", onBackdrop);
            resolve(value);
        };

        document.getElementById("yes").onclick = () => cleanup(true);
        document.getElementById("no").onclick = () => cleanup(false);

        const onBackdrop = (e) => {
            if (!content.contains(e.target)) cleanup(null);
        };
        dialog.addEventListener("click", onBackdrop);
    });
}

function openCreateServer() {
    if (server_createServerData == null) {
        // TODO: load from server
        server_initialGame = "_blank_server";
        const initialGame = games[server_initialGame];
        server_createServerData = {
            serverName: "",
            gameId: initialGame.gameId,
            instanceType: initialGame.instanceType,
            storage: 8,
            ports: initialGame.ports.map((p) => ({
                port: p.port,
                protocol: p.protocol,
            })),
        };
        initializeCreateTable();
    }
    refreshCreateServerUI();
    document.getElementById("createServerPanel").style.display = "block";
    document.getElementById("openCreateServer").style.display = "none";
}

function initializeCreateTable() {
    document.getElementById("createServerName").addEventListener("input", (event) => {
        server_createServerData.serverName = event.target.value;
    });
    document.getElementById("createServerInstanceType").addEventListener("input", (event) => {
        server_createServerData.instanceType = event.target.value;
    });
    document.getElementById("createServerStorage").addEventListener("input", (event) => {
        server_createServerData.storage = event.target.value;
    });

    const templateSelect = document.getElementById("createServerTemplate");
    Object.values(games).forEach((game) => {
        const option = document.createElement("option");
        option.value = game.gameId;
        option.textContent = game.displayName;
        option.selected = game.gameId === server_createServerData.gameId;
        templateSelect.appendChild(option);
    });
    templateSelect.addEventListener("change", (event) => {
        const selectedGame = games[event.target.value];
        if (selectedGame) {
            server_createServerData.gameId = selectedGame.gameId;
            server_createServerData.instanceType = selectedGame.instanceType;
            server_createServerData.storage = selectedGame.storage;
            server_createServerData.ports = selectedGame.ports.map((p) => ({
                port: p.port,
                protocol: p.protocol,
            }));
            refreshCreateServerUI();
        }
    });
}

function refreshCreateServerUI() {
    const serverName = document.getElementById("createServerName");
    serverName.value = server_createServerData.serverName;
    const instanceType = document.getElementById("createServerInstanceType");
    instanceType.value = server_createServerData.instanceType;
    const storage = document.getElementById("createServerStorage");
    storage.value = server_createServerData.storage;

    const portGrid = document.getElementById("createServerPortGrid");
    portGrid.replaceChildren();
    server_createServerData.ports.forEach((port, index) => {
        const portLabel = document.createElement("div");
        portLabel.textContent = "Port: ";
        const protocolLabel = document.createElement("div");
        protocolLabel.textContent = "Protocol: ";

        const portInput = document.createElement("input");
        portInput.id = "portNumber" + index;
        portInput.value = port.port;
        portInput.addEventListener("input", (event) => {
            server_createServerData.ports[index].port = event.target.value;
        });

        const protocolSelect = document.createElement("select");
        protocolSelect.id = "protocolSelect" + index;
        ["tcp", "udp"].forEach((protocol) => {
            const option = document.createElement("option");
            option.value = protocol;
            option.selected = port.protocol === protocol;
            option.textContent = protocol.toUpperCase();
            protocolSelect.appendChild(option);
        });
        protocolSelect.addEventListener("change", (event) => {
            const selectedProtocol = event.target.value;
            server_createServerData.ports[index].protocol = selectedProtocol;
        });

        portGrid.appendChild(portLabel);
        portGrid.appendChild(portInput);
        portGrid.appendChild(protocolLabel);
        portGrid.appendChild(protocolSelect);
    });
}

function cancelCreateServer() {
    document.getElementById("createServerPanel").style.display = "none";
    document.getElementById("openCreateServer").style.display = "block";
}

function createServerAddPortClick() {
    server_createServerData.ports.push({
        port: 80,
        protocol: "tcp",
    });
    refreshCreateServerUI();
}

async function createServerClick() {
    const serverName = server_createServerData.serverName;
    const gameId = server_createServerData.gameId;
    const instanceType = server_createServerData.instanceType;
    const storageString = server_createServerData.storage;
    const portsInput = server_createServerData.ports;
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
    for (let i = 0; i < portsInput.length; i++) {
        const portString = portsInput[i].port;
        const protocol = portsInput[i].protocol;

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

    const res = await callAPI("createServer", { serverName, instanceType, ports, gameId, storage });
    const data = await res.json();
    if (res.ok) {
        message.textContent = "Created";
        document.getElementById("createServerName").value = "";
        document.getElementById("createServerPortGrid").replaceChildren();
        server_portCount = 0;
        refreshServers();
    } else {
        message.textContent = data.error;
    }
}
