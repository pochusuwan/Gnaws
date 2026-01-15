import http from "http";
import { randomUUID } from "crypto";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

// IMPORTANT: set this to whatever origin serves your frontend locally.
// Examples:
// - Vite: http://localhost:5173
// - simple http server on 5500: http://localhost:5500
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

// --- In-memory state (resets on server restart) ---
const sessions = new Map(); // sessionId -> { username, role }
let servers = [
  { name: "valheim-1", game: "valheim", instanceType: "t3.small", status: "RUNNING", task: "none" },
  { name: "mc-1", game: "minecraft", instanceType: "t3.small", status: "STOPPED", task: "none" }
];

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map(s => s.trim()).filter(Boolean);
  const out = {};
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    out[p.slice(0, idx)] = decodeURIComponent(p.slice(idx + 1));
  }
  return out;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.session;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function requireAuth(req) {
  const session = getSession(req);
  if (!session) return { ok: false, session: null, error: { status: 401, message: "Not authenticated" } };
  return { ok: true, session, error: null };
}

function requireAdmin(req) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth;
  if (auth.session.role !== "admin") {
    return { ok: false, session: auth.session, error: { status: 403, message: "Forbidden (admin only)" } };
  }
  return auth;
}

// This matches your frontend calling: POST `${API_BASE}call` with body { method, params }
const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    // Preflight
    res.statusCode = 204;
    return res.end();
  }

  if (req.url == "/status" && req.method == "GET") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    return res.end("success");
  }

  if (req.url !== "/call" || req.method !== "POST") {
    return json(res, 404, { status: 404, message: "Not found" });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json(res, 400, { status: 400, message: "Invalid JSON" });
  }

  const method = body?.requestType;
  const params = body?.params || {};

  // ---- ROUTER ----
  try {
    switch (method) {
      case "login": {
        const { username, password } = params;

        // Demo auth rules: any username works. Make "admin"/"admin" admin.
        const role = username === "admin" && password === "admin" ? "admin" : "user";

        const sid = randomUUID();
        sessions.set(sid, { username: username || "localUser", role });

        // Lax is usually fine locally. If you serve frontend+api on different
        // origins and need cookies, keep SameSite=Lax and use credentials: "include".
        res.setHeader("Set-Cookie", `session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`);

        return json(res, 200, { status: 200, username: username || "localUser", role });
      }

      case "logout": {
        const cookies = parseCookies(req);
        if (cookies.session) sessions.delete(cookies.session);
        res.setHeader("Set-Cookie", "session=; Path=/; Max-Age=0; SameSite=Lax");
        return json(res, 200, { status: 200 });
      }

      case "whoami": {
        const session = getSession(req);
        if (!session) return json(res, 200, { status: 200, username: null, role: null });
        return json(res, 200, { status: 200, username: session.username, role: session.role });
      }

      case "getServers": {
        const auth = requireAuth(req);
        if (!auth.ok) return json(res, 200, auth.error); // keep payload style like your frontend expects
        return json(res, 200, { status: 200, servers });
      }

      case "getUsers": {
        const auth = requireAdmin(req);
        if (!auth.ok) return json(res, 200, auth.error);
        return json(res, 200, {
          status: 200,
          users: [
            { username: "admin", role: "admin" },
            { username: "localUser", role: "user" }
          ]
        });
      }

      case "createServer": {
        const auth = requireAdmin(req);
        if (!auth.ok) return json(res, 200, auth.error);

        const { name, game, instanceType } = params;
        if (!name) return json(res, 200, { status: 400, message: "Missing server name" });

        servers = [
          ...servers,
          {
            name,
            game: game || "unknown",
            instanceType: instanceType || "t3.small",
            status: "PROVISIONING",
            task: "create"
          }
        ];

        return json(res, 200, { status: 200 });
      }

      default:
        return json(res, 200, { status: 404, message: `Unknown method: ${method}` });
    }
  } catch (e) {
    return json(res, 500, { status: 500, message: "Mock server error", detail: String(e) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock API listening on http://localhost:${PORT}`);
  console.log(`Allowing frontend origin: ${FRONTEND_ORIGIN}`);
});