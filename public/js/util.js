/* Utilitários compartilhados pelo frontend. */

/* Todo texto vindo do banco passa por aqui antes de ir para innerHTML. */
function esc(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtDate(iso){
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return (y && m && d) ? `${d}/${m}/${y}` : esc(iso);
}

function fmtDateTime(iso){
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

/* ISO -> valor aceito por <input type="datetime-local"> no fuso do navegador */
function toLocalInput(iso){
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtMoney(n){
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

/* Classifica um texto de status em ok | warn | bad | info | neutral (cor do badge). */
function classifyStatus(text){
  const t = String(text || "").toLowerCase();
  if (/^abaixo do mínimo/.test(t)) return "warn";
  if (/(atras|crítico|critico|cancelad|vencid|negativo|inativo|baixad|reprovad|desist|suspens)/.test(t)) return "bad";
  if (/(risco|atenção|atencao|pendente|renovaç|manutenç|ocupado|afastad|férias|vence hoje)/.test(t)) return "warn";
  if (/(conclu|completa|aprovad|pago|emitida|ativo|no prazo|positivo|dispon|admiss|em uso|devolvid|a vencer|encerrad)/.test(t)) return "ok";
  if (/(andamento|execuç|aberto|aberta|triagem|entrevista|document)/.test(t)) return "info";
  return "neutral";
}

function badgeHTML(text){
  return `<span class="badge ${classifyStatus(text)}">${esc(text || "—")}</span>`;
}

function loadingHTML(msg){
  return `<div class="empty-state loading-state">${esc(msg || "Carregando…")}</div>`;
}

function errorHTML(err){
  return `
    <div class="panel" style="padding:24px;border-color:rgba(245,84,74,.4);">
      <h2 style="margin-bottom:8px;">Não foi possível carregar os dados</h2>
      <p style="color:var(--muted);font-size:13px;line-height:1.6;">${esc(err.message || err)}</p>
    </div>`;
}

function toast(message, kind = "ok"){
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3500);
  setTimeout(() => el.remove(), 4000);
}

/* "Maria da Silva" -> "MS" */
function initials(nome){
  const partes = String(nome || "").trim().split(/\s+/).filter(p => !/^(da|de|do|das|dos|e|&)$/i.test(p));
  return partes.slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
}

/* tela que aceita edição, mas o usuário só tem nível "ver" */
function isConsulta(item){
  const editavel = (item.type === "table" && !item.readOnly) || item.type === "kanban" || item.type === "week";
  return editavel && item.nivel === "ver";
}

/* copia texto; fora de HTTPS/localhost cai no prompt */
async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch { window.prompt("Copie o texto abaixo:", text); return false; }
}

/* baixa um CSV que o Excel em português abre direto (BOM + ponto e vírgula) */
function downloadCSV(filename, header, rows){
  const cell = v => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map(r => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function timeAgo(iso){
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  return fmtDateTime(iso);
}

/* Mantém o Tab dentro do diálogo aberto. */
function trapFocus(e, root){
  if (!root) return;
  const items = [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!root.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
