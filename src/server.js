import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { prisma } from "./db.js";
import { api } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // atrás do proxy do Render/Railway/Nginx

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
}));
app.use(compression());

/* Health check (fora da autenticação, usado pelo provedor de deploy) */
app.get("/healthz", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

/* Autenticação básica opcional: defina APP_USER e APP_PASSWORD para ativar. */
const { APP_USER, APP_PASSWORD } = process.env;
if (APP_USER && APP_PASSWORD) {
  const expected = Buffer.from(`${APP_USER}:${APP_PASSWORD}`);
  app.use((req, res, next) => {
    const header = req.headers.authorization || "";
    const given = Buffer.from(header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString() : "");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    res.set("WWW-Authenticate", 'Basic realm="Painel de Gestao", charset="UTF-8"').status(401).send("Autenticação necessária");
  });
} else if (isProd) {
  console.warn("⚠ APP_USER/APP_PASSWORD não definidos: o painel está público.");
}

app.use("/api", express.json({ limit: "100kb" }), api);

app.use(express.static(path.join(__dirname, "..", "public"), {
  maxAge: isProd ? "1h" : 0,
  setHeaders(res, file) {
    if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  },
}));

const server = app.listen(PORT, () => {
  console.log(`Painel de Gestão rodando em http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} recebido, encerrando…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
