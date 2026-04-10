/**
 * dev-server.mjs
 * Servidor local de desenvolvimento para a LOJA RESPEITA.
 * Serve os arquivos estáticos + executa as funções da pasta api/ localmente.
 *
 * Uso: node dev-server.mjs
 * Requer: .env.local com SUPABASE_URL, SUPABASE_KEY, MP_TOKEN, MP_WEBHOOK_SECRET
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Carrega .env.local
import { config } from "node:process";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Carrega variáveis de ambiente do .env.local manualmente
async function loadEnvLocal() {
  try {
    const content = await readFile(join(__dirname, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/\r$/, "");
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
    console.log("[env] .env.local carregado");
  } catch {
    console.warn("[env] .env.local não encontrado — usando variáveis do sistema");
  }
}

// Mapa de Content-Types
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function getMime(filepath) {
  return MIME_TYPES[extname(filepath).toLowerCase()] || "application/octet-stream";
}

// Lê o body de uma request como string JSON
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

// Cria um objeto fake de response compatível com os handlers da Vercel
function createFakeRes(res) {
  const fakeRes = {
    _status: 200,
    _headers: {},
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(key, value) {
      this._headers[key] = value;
      return this;
    },
    json(data) {
      const body = JSON.stringify(data);
      res.writeHead(this._status, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...this._headers,
      });
      res.end(body);
    },
    send(data) {
      const body = typeof data === "string" ? data : JSON.stringify(data);
      res.writeHead(this._status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        ...this._headers,
      });
      res.end(body);
    },
    end(data) {
      res.writeHead(this._status, {
        "Access-Control-Allow-Origin": "*",
        ...this._headers,
      });
      res.end(data || "");
    },
  };
  return fakeRes;
}

// Roteamento das funções API
async function handleApi(pathname, req, res) {
  let handlerPath = null;

  if (pathname === "/api/create-checkout") {
    handlerPath = join(__dirname, "api", "create-checkout.js");
  } else if (pathname === "/api/webhook") {
    handlerPath = join(__dirname, "api", "webhook.js");
  }

  if (!handlerPath) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "API route not found" }));
    return;
  }

  try {
    const body = await readBody(req);
    const fakeReq = {
      method: req.method,
      headers: req.headers,
      body,
      query: Object.fromEntries(new URL(pathname, "http://localhost").searchParams),
    };
    const fakeRes = createFakeRes(res);
    // Usa pathToFileURL para compatibilidade com ESM no Windows
    const handlerUrl = pathToFileURL(handlerPath).href;
    const module = await import(handlerUrl);
    const handler = module.default;
    await handler(fakeReq, fakeRes);
  } catch (err) {
    console.error(`[api] Erro em ${pathname}:`, err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Erro interno", details: err.message }));
  }
}

// Handler principal
async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Rotas da API
  if (pathname.startsWith("/api/")) {
    await handleApi(pathname, req, res);
    return;
  }

  // Arquivos estáticos
  let filePath = join(__dirname, pathname === "/" ? "index.html" : pathname);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, "index.html");
    }
  } catch {
    // Arquivo não existe — tenta com .html ou serve index.html (SPA fallback)
    if (!extname(filePath)) {
      try {
        await stat(filePath + ".html");
        filePath = filePath + ".html";
      } catch {
        filePath = join(__dirname, "index.html");
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": getMime(filePath),
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch (err) {
    res.writeHead(500);
    res.end("Server error");
  }
}

// Inicia o servidor
await loadEnvLocal();

const PORT = process.env.PORT || 3000;
const server = createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log("   Frontend + API funcionando juntos");
  console.log("   Pressione Ctrl+C para parar\n");
});
