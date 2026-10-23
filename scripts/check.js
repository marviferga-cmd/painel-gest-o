/* Confere a sintaxe de todos os .js do projeto (npm run check). */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const PASTAS = ["src", "public/js", "prisma", "scripts", "test"];

function arquivos(pasta) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) return arquivos(p);
    return e.name.endsWith(".js") ? [p] : [];
  });
}

const lista = PASTAS.flatMap(arquivos);
for (const f of lista) execFileSync(process.execPath, ["--check", f], { stdio: "inherit" });
console.log(`${lista.length} arquivo(s) sem erro de sintaxe`);
