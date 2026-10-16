import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import { prisma } from "./db.js";
import { api } from "./routes.js";
import { carregarUsuario, garantirAdmin } from "./auth.js";

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

/* Login: o painel só abre com sessão; sem ela, vai para a tela de login.
   A API se protege sozinha (routes.js). css/js/login.html ficam públicos. */
app.get(["/", "/index.html"], carregarUsuario, (req, res, next) => (req.user ? next() : res.redirect("/login.html")));
app.get("/login.html", carregarUsuario, (req, res, next) => (req.user ? res.redirect("/") : next()));

app.use("/api", express.json({ limit: "100kb" }), api);

app.use(express.static(path.join(__dirname, "..", "public"), {
  maxAge: isProd ? "1h" : 0,
  setHeaders(res, file) {
    if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  },
}));

try {
  await garantirAdmin();
} catch (err) {
  console.error("Não foi possível criar o administrador inicial:", err.message);
}

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
