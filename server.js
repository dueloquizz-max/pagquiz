// QUIZZBARCA — serveur temps réel (zéro dépendance)
// Animateur lance une manche + chrono, les joueurs répondent depuis leur tél,
// les réponses s'affichent en direct chez l'animateur, doublons signalés.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Jeton animateur (protège les commandes) — affiché au démarrage.
const HOST_TOKEN = process.env.HOST_TOKEN || crypto.randomBytes(3).toString("hex");

// ---------- État en mémoire (une seule salle) ----------
const state = {
  players: new Map(), // id -> { id, name, eliminated, connected, answers: [] }
  round: {
    active: false,
    number: 0,
    question: "",
    startedAt: 0,
    endsAt: 0,
    durationMs: 60000,
    used: new Set(), // réponses normalisées déjà données (par n'importe qui)
  },
  endTimer: null,
};

// Clients SSE connectés : { res, role: 'host'|'player', playerId }
const clients = new Set();

// ---------- Utilitaires ----------
function normalize(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // ponctuation -> espace
    .trim()
    .replace(/\s+/g, " ");
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    eliminated: p.eliminated,
    connected: p.connected,
    answers: p.answers,
  };
}

// Vue destinée à l'animateur : tout.
function hostSnapshot() {
  return {
    role: "host",
    serverNow: Date.now(),
    round: {
      active: state.round.active,
      number: state.round.number,
      question: state.round.question,
      endsAt: state.round.endsAt,
      durationMs: state.round.durationMs,
    },
    players: [...state.players.values()].map(publicPlayer),
  };
}

// Vue destinée à un joueur : son propre état + la manche.
function playerSnapshot(playerId) {
  const p = state.players.get(playerId);
  return {
    role: "player",
    serverNow: Date.now(),
    you: p ? publicPlayer(p) : null,
    playersCount: state.players.size,
    round: {
      active: state.round.active,
      number: state.round.number,
      question: state.round.question,
      endsAt: state.round.endsAt,
      durationMs: state.round.durationMs,
    },
  };
}

function sendTo(client) {
  let payload;
  if (client.role === "host") payload = hostSnapshot();
  else payload = playerSnapshot(client.playerId);
  try {
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {
    /* ignore */
  }
}

function broadcast() {
  for (const c of clients) sendTo(c);
}

// ---------- Logique de manche ----------
function startRound(question, durationSec) {
  if (state.endTimer) {
    clearTimeout(state.endTimer);
    state.endTimer = null;
  }
  const durationMs = Math.max(5, Math.min(600, durationSec || 60)) * 1000;
  state.round.active = true;
  state.round.number += 1;
  state.round.question = (question || "").toString().slice(0, 300);
  state.round.startedAt = Date.now();
  state.round.endsAt = Date.now() + durationMs;
  state.round.durationMs = durationMs;
  state.round.used = new Set();
  // Nouvelle manche : on efface les réponses et on réintègre tout le monde.
  for (const p of state.players.values()) {
    p.answers = [];
    p.eliminated = false;
  }
  state.endTimer = setTimeout(() => {
    state.round.active = false;
    broadcast();
  }, durationMs);
  broadcast();
}

function stopRound() {
  if (state.endTimer) {
    clearTimeout(state.endTimer);
    state.endTimer = null;
  }
  state.round.active = false;
  broadcast();
}

function submitAnswer(playerId, text) {
  const p = state.players.get(playerId);
  if (!p) return { error: "Joueur inconnu." };
  if (!state.round.active || Date.now() > state.round.endsAt)
    return { error: "La manche n'est pas active." };
  if (p.eliminated) return { error: "Tu es éliminé pour cette manche." };
  const clean = (text || "").toString().trim().slice(0, 120);
  if (!clean) return { error: "Réponse vide." };
  const norm = normalize(clean);
  if (!norm) return { error: "Réponse invalide." };

  const duplicate = state.round.used.has(norm);
  p.answers.push({
    text: clean,
    duplicate,
    at: Date.now(),
  });
  state.round.used.add(norm);
  broadcast();
  return { ok: true, duplicate };
}

// ---------- Serveur HTTP ----------
function serveFile(res, file, type) {
  fs.readFile(path.join(PUBLIC_DIR, file), (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // Pages
  if (req.method === "GET" && (p === "/" || p === "/play"))
    return serveFile(res, "player.html", "text/html; charset=utf-8");
  if (req.method === "GET" && p === "/host")
    return serveFile(res, "host.html", "text/html; charset=utf-8");

  // SSE
  if (req.method === "GET" && p === "/events") {
    const role = url.searchParams.get("role") === "host" ? "host" : "player";
    if (role === "host" && url.searchParams.get("token") !== HOST_TOKEN) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    const playerId = url.searchParams.get("playerId") || "";
    if (role === "player") {
      const pl = state.players.get(playerId);
      if (pl) pl.connected = true;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n\n");
    const client = { res, role, playerId };
    clients.add(client);
    sendTo(client);
    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (_) {}
    }, 20000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(client);
      if (role === "player") {
        const pl = state.players.get(playerId);
        if (pl) pl.connected = false;
        broadcast();
      }
    });
    return;
  }

  // API joueur : rejoindre
  if (req.method === "POST" && p === "/join") {
    const body = await readBody(req);
    const name = (body.name || "").toString().trim().slice(0, 24);
    if (!name) return json(res, 400, { error: "Pseudo requis." });
    const id = crypto.randomBytes(6).toString("hex");
    state.players.set(id, {
      id,
      name,
      eliminated: false,
      connected: false,
      answers: [],
    });
    broadcast();
    return json(res, 200, { id, name });
  }

  // API joueur : répondre
  if (req.method === "POST" && p === "/answer") {
    const body = await readBody(req);
    const result = submitAnswer(body.playerId, body.text);
    if (result.error) return json(res, 400, result);
    return json(res, 200, result);
  }

  // ---- Commandes animateur (protégées par token) ----
  const isHostCmd =
    req.method === "POST" &&
    ["/host/start", "/host/stop", "/host/eliminate", "/host/reset", "/host/mark"].includes(p);
  if (isHostCmd) {
    const body = await readBody(req);
    if (body.token !== HOST_TOKEN) return json(res, 403, { error: "Jeton invalide." });

    if (p === "/host/start") {
      startRound(body.question, Number(body.duration));
      return json(res, 200, { ok: true });
    }
    if (p === "/host/stop") {
      stopRound();
      return json(res, 200, { ok: true });
    }
    if (p === "/host/mark") {
      // L'animateur (dé)marque manuellement une réponse comme doublon.
      const pl = state.players.get(body.playerId);
      const idx = Number(body.index);
      if (pl && pl.answers[idx]) {
        pl.answers[idx].duplicate = !!body.duplicate;
        broadcast();
      }
      return json(res, 200, { ok: true });
    }
    if (p === "/host/eliminate") {
      const pl = state.players.get(body.playerId);
      if (pl) {
        pl.eliminated = !!body.eliminated;
        broadcast();
      }
      return json(res, 200, { ok: true });
    }
    if (p === "/host/reset") {
      // Réinitialise tout (nouvelle partie)
      if (state.endTimer) clearTimeout(state.endTimer);
      state.endTimer = null;
      state.round = {
        active: false,
        number: 0,
        question: "",
        startedAt: 0,
        endsAt: 0,
        durationMs: 60000,
        used: new Set(),
      };
      if (body.clearPlayers) state.players.clear();
      else
        for (const pl of state.players.values()) {
          pl.answers = [];
          pl.eliminated = false;
        }
      broadcast();
      return json(res, 200, { ok: true });
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  const line = "=".repeat(52);
  console.log("\n" + line);
  console.log("  PagQUIZ est lancé  ⚽");
  console.log(line);
  console.log(`  Joueurs (à partager) : http://localhost:${PORT}/`);
  console.log(`  Animateur (toi)      : http://localhost:${PORT}/host`);
  console.log(`  Jeton animateur      : ${HOST_TOKEN}`);
  console.log(line + "\n");
});
