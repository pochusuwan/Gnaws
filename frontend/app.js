let app_currentPage = "servers";

function showPage(element, pageId) {
    document.querySelectorAll(".page").forEach((page) => (page.style.display = "none"));
    document.getElementById(pageId).style.display = "block";
    document.querySelectorAll("nav button").forEach((btn) => btn.classList.remove("active"));
    element.classList.add("active");

    app_currentPage = pageId;
    loadCurrentPage();
}

function loadCurrentPage() {
    if (app_currentPage == "users") {
        loadUsersPage();
    } else if (app_currentPage == "servers") {
        loadServersPage();
    }
}

function resetContent() {
    resetUsers();
    resetServers();
}

function callAPI(requestType, params) {
    return fetch(`${API_BASE}call`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requestType,
            params,
        }),
        credentials: "include",
    });
}
