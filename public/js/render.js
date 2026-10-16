/* =========================================================
   TELAS
   ========================================================= */

function cellText(col, row){
  const v = row[col.key];
  switch (col.type){
    case "ref":
    case "month": return row._labels?.[col.key] ?? "—";
    case "date": return fmtDate(v);
    case "datetime": return fmtDateTime(v);
    case "money": return fmtMoney(v);
    case "bool": return v ? "Ativo" : "Inativo";
    default: return v ?? "—";
  }
}

function cellHTML(col, row){
  const text = cellText(col, row);
  if (col.type === "status" || col.type === "bool") return badgeHTML(text);
  if (["date","datetime","number","money","hours","month"].includes(col.type)) return `<span class="mono">${esc(text)}</span>`;
  if (col.computed && col.type === "text") return `<span class="t-${classifyStatus(text)}">${esc(text)}</span>`;
  return esc(text);
}

/* =========================================================
   HOME
   ========================================================= */
function renderHomeView(container, meta){
  container.innerHTML = `
    <div class="home-screen">
      <div class="home-header">
        <span class="eyebrow">Painel de Gestão</span>
        <h1>Selecione um painel para acessar os dados</h1>
        <p>Gestão de Pessoas, Ordens de Serviço e Monitoramento de SLA em um só lugar.</p>
      </div>
      ${meta.groups.map(group => `
        <div class="home-group">
          <div class="home-group-title">${esc(group.label)}</div>
          <div class="home-grid">
            ${group.items.map(item => `
              <button class="home-card" data-key="${esc(item.key)}">
                <div class="home-icon acc-${esc(item.accent)}">${iconSVG(item.icon)}</div>
                <h3>${esc(item.label)}</h3>
                <p>${esc(item.desc)}</p>
                <span class="home-link">Acessar painel →</span>
              </button>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
  container.querySelectorAll(".home-card").forEach(card => {
    card.addEventListener("click", () => App.navigate(card.dataset.key));
  });
}

/* =========================================================
   TABELA GENÉRICA
   ========================================================= */
function accentForKind(kind){
  return { ok:"green", warn:"amber", bad:"red", info:"blue" }[kind] || "";
}

function buildKpiRow(rows, statusCol){
  const tiles = [`<div class="kpi kpi-total"><div class="value">${rows.length}</div><div class="label">Total</div></div>`];
  if (statusCol){
    const counts = new Map();
    rows.forEach(r => {
      const label = cellText(statusCol, r);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5).forEach(([label, count]) => {
      tiles.push(`<div class="kpi accent-${accentForKind(classifyStatus(label))}"><div class="value">${count}</div><div class="label">${esc(label)}</div></div>`);
    });
  }
  return `<div class="kpi-row">${tiles.join("")}</div>`;
}

function detectFilterColumns(rows, columns){
  return columns
    .filter(c => ["status","bool","ref"].includes(c.type))
    .map(col => ({ col, values: [...new Set(rows.map(r => cellText(col, r)))].sort((a,b)=>String(a).localeCompare(String(b))) }))
    .filter(f => f.values.length > 1 && f.values.length <= 15)
    .slice(0, 4);
}

async function renderTableView(container, item){
  container.innerHTML = loadingHTML();
  let rows;
  try { rows = await API.get(`/modules/${item.key}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const visible = item.columns.filter(c => c.table);
  const statusCol = visible.find(c => c.key === "status") || visible.find(c => c.type === "status" || c.type === "bool");
  const filterCols = detectFilterColumns(rows, visible);
  const editable = !item.readOnly;

  container.innerHTML = `
    ${buildKpiRow(rows, statusCol)}
    <div class="filters">
      <div class="filters-label">Filtros</div>
      <div class="filters-grid">
        <div class="field">
          <label for="searchInput">Buscar</label>
          <input type="search" id="searchInput" placeholder="Buscar em ${esc(item.label.toLowerCase())}…">
        </div>
        ${filterCols.map(f => `
          <div class="field">
            <label>${esc(f.col.label)}</label>
            <select data-filter-col="${esc(f.col.key)}">
              <option value="">Todos</option>
              ${f.values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}
            </select>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>${esc(item.label)}</h2>
          <p id="rowCountLabel"></p>
        </div>
        ${editable
          ? `<button class="btn btn-primary" id="addRowBtn">+ Adicionar</button>`
          : `<span class="readonly-note">Calculado automaticamente</span>`}
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${visible.map(c => `<th>${esc(c.label)}</th>`).join("")}${editable ? `<th style="width:70px"></th>` : ""}</tr></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const searchEl = container.querySelector("#searchInput");
  const selects = [...container.querySelectorAll("[data-filter-col]")];

  function drawBody(){
    const search = searchEl.value.trim().toLowerCase();
    const active = selects.filter(s => s.value).map(s => [visible.find(c => c.key === s.dataset.filterCol), s.value]);
    const filtered = rows.filter(row => {
      if (search && !visible.map(c => String(cellText(c, row))).join(" ").toLowerCase().includes(search)) return false;
      return active.every(([col, val]) => String(cellText(col, row)) === val);
    });

    const tbody = container.querySelector("#tableBody");
    tbody.innerHTML = filtered.length
      ? filtered.map(row => `
          <tr>
            ${visible.map(c => `<td>${cellHTML(c, row)}</td>`).join("")}
            ${editable ? `<td><div class="row-actions"><button class="icon-btn" data-edit="${row.id}">Editar</button></div></td>` : ""}
          </tr>`).join("")
      : `<tr><td colspan="${visible.length + 1}"><div class="empty-state">Nenhum registro encontrado.</div></td></tr>`;

    container.querySelector("#rowCountLabel").textContent = `${filtered.length} de ${rows.length} registro(s)`;

    tbody.querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => {
        const row = rows.find(r => r.id === Number(btn.dataset.edit));
        App.openFormModal({
          title: `Editar — ${item.label}`,
          fields: item.columns.filter(c => !c.computed),
          initialValues: row,
          onSubmit: async (values) => {
            await API.put(`/modules/${item.key}/${row.id}`, values);
            toast("Registro atualizado");
            await afterChange();
          },
          onDelete: async () => {
            await API.del(`/modules/${item.key}/${row.id}`);
            toast("Registro excluído");
            await afterChange();
          },
        });
      });
    });
  }

  async function afterChange(){
    API.clearLookups();
    await renderTableView(container, item);
    App.refreshNavCounts();
  }

  searchEl.addEventListener("input", drawBody);
  selects.forEach(sel => sel.addEventListener("change", drawBody));

  container.querySelector("#addRowBtn")?.addEventListener("click", () => {
    App.openFormModal({
      title: `Novo registro — ${item.label}`,
      fields: item.columns.filter(c => !c.computed),
      onSubmit: async (values) => {
        await API.post(`/modules/${item.key}`, values);
        toast("Registro criado");
        await afterChange();
      },
    });
  });

  drawBody();
}

/* =========================================================
   KANBAN
   ========================================================= */
async function renderKanbanView(container, item){
  const board = "pessoas";
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get(`/kanban/${board}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const reload = () => renderKanbanView(container, item);

  container.innerHTML = `
    <div class="panel" style="padding:18px;">
      <div class="panel-head" style="border:none; padding:0 0 16px;">
        <div>
          <h2>${esc(item.label)}</h2>
          <p>${data.cards.length} card(s) — arraste entre as colunas</p>
        </div>
        <button class="btn btn-primary" id="addCardBtn">+ Novo card</button>
      </div>
      <div class="kanban">
        ${data.columns.map(col => {
          const cards = data.cards.filter(c => c.colunaId === col.id);
          return `
          <div class="kanban-col" data-col="${col.id}">
            <div class="kanban-col-head"><h3>${esc(col.titulo)}</h3><span>${cards.length}</span></div>
            ${cards.map(c => `
              <div class="kanban-card" draggable="true" data-card="${c.id}">
                <div class="kc-title">${esc(c.titulo)}</div>
                <div class="kc-meta"><span class="kc-tag">${esc(c.etiqueta || "")}</span>
                  <button class="icon-btn kc-del" data-del-card="${c.id}" title="Excluir card" aria-label="Excluir card">✕</button>
                </div>
              </div>`).join("")}
          </div>`;
        }).join("")}
      </div>
    </div>
  `;

  container.querySelectorAll(".kanban-card").forEach(cardEl => {
    cardEl.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", cardEl.dataset.card);
      setTimeout(() => cardEl.style.opacity = "0.4", 0);
    });
    cardEl.addEventListener("dragend", () => cardEl.style.opacity = "1");
  });

  container.querySelectorAll(".kanban-col").forEach(colEl => {
    colEl.addEventListener("dragover", e => { e.preventDefault(); colEl.classList.add("drag-over"); });
    colEl.addEventListener("dragleave", () => colEl.classList.remove("drag-over"));
    colEl.addEventListener("drop", async e => {
      e.preventDefault();
      colEl.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const colunaId = Number(colEl.dataset.col);
      const card = data.cards.find(c => c.id === id);
      if (!card || card.colunaId === colunaId) return;
      try { await API.patch(`/kanban/cards/${id}`, { colunaId }); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelectorAll("[data-del-card]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Excluir este card?")) return;
      try { await API.del(`/kanban/cards/${btn.dataset.delCard}`); toast("Card excluído"); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelector("#addCardBtn").addEventListener("click", () => {
    App.openFormModal({
      title: "Novo card",
      fields: [
        { key:"titulo", label:"Título", type:"text", required:true },
        { key:"etiqueta", label:"Etiqueta", type:"text" },
        { key:"colunaId", label:"Coluna", type:"select", required:true, options: data.columns.map(c => ({ value:c.id, label:c.titulo })) },
      ],
      onSubmit: async (values) => {
        await API.post(`/kanban/${board}/cards`, values);
        toast("Card criado");
        reload();
      },
    });
  });
}

/* =========================================================
   RELATÓRIOS — consolidado por cliente
   ========================================================= */
async function renderReportView(container, item){
  container.innerHTML = loadingHTML();
  let rows;
  try { rows = await API.get("/resumo/clientes"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const tot = rows.reduce((a, r) => ({
    faturado: a.faturado + r.faturado, emAberto: a.emAberto + r.emAberto,
    osAbertas: a.osAbertas + r.osAbertas, atrasados: a.atrasados + r.chamadosAtrasados,
  }), { faturado:0, emAberto:0, osAbertas:0, atrasados:0 });

  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi kpi-total"><div class="value">${rows.length}</div><div class="label">Clientes</div></div>
      <div class="kpi accent-blue"><div class="value">${tot.osAbertas}</div><div class="label">OS abertas</div></div>
      <div class="kpi"><div class="value value-sm">${fmtMoney(tot.faturado)}</div><div class="label">Faturado</div></div>
      <div class="kpi accent-amber"><div class="value value-sm">${fmtMoney(tot.emAberto)}</div><div class="label">A receber</div></div>
      <div class="kpi accent-red"><div class="value">${tot.atrasados}</div><div class="label">Chamados atrasados</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(item.label)} por cliente</h2><p>Calculado a partir de OS, Faturamento e Chamados</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Cliente</th><th>OS (total)</th><th>OS abertas</th><th>Faturado</th><th>A receber</th><th>Chamados abertos</th><th>Atrasados</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td>${esc(r.cliente)}</td>
              <td><span class="mono">${r.osTotal}</span></td>
              <td><span class="mono">${r.osAbertas}</span></td>
              <td><span class="mono">${fmtMoney(r.faturado)}</span></td>
              <td><span class="mono">${fmtMoney(r.emAberto)}</span></td>
              <td><span class="mono">${r.chamadosAbertos}</span></td>
              <td>${r.chamadosAtrasados ? `<span class="badge bad">${r.chamadosAtrasados}</span>` : `<span class="mono">0</span>`}</td>
            </tr>`).join("") || `<tr><td colspan="7"><div class="empty-state">Sem clientes cadastrados.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================
   INDICADORES — OS e financeiro
   ========================================================= */
async function renderIndicatorsView(container){
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/resumo/os"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }
  const k = data.kpis;

  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi accent-blue"><div class="value">${k.osAbertas}</div><div class="label">OS abertas</div></div>
      <div class="kpi accent-green"><div class="value">${k.osConcluidas}</div><div class="label">OS concluídas</div></div>
      <div class="kpi accent-red"><div class="value">${k.osAtrasadas}</div><div class="label">OS fora do prazo</div></div>
      <div class="kpi"><div class="value">${k.osPorColaborador.toFixed(1)}</div><div class="label">OS abertas / colaborador</div></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="value value-sm">${fmtMoney(k.faturado)}</div><div class="label">Faturado</div></div>
      <div class="kpi accent-green"><div class="value value-sm">${fmtMoney(k.recebido)}</div><div class="label">Recebido</div></div>
      <div class="kpi accent-amber"><div class="value value-sm">${fmtMoney(k.emAberto)}</div><div class="label">Em aberto</div></div>
      <div class="kpi accent-red"><div class="value value-sm">${fmtMoney(k.vencido)}</div><div class="label">Vencido</div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Ordens de serviço</h2><p>Ordenadas por prazo</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>OS</th><th>Cliente</th><th>Serviço</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead>
          <tbody>
            ${data.ordens.map(r => `<tr>
              <td><span class="mono">${esc(r.numero)}</span></td><td>${esc(r.cliente)}</td><td>${esc(r.servico)}</td>
              <td>${esc(r.responsavel)}</td>
              <td><span class="mono ${r.atrasada ? "t-bad" : ""}">${fmtDate(r.prazo)}</span></td>
              <td>${badgeHTML(r.atrasada ? `${r.status} · atrasada` : r.status)}</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">Sem ordens de serviço cadastradas.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* =========================================================
   SLA DASHBOARD — medidor + lista de atenção
   ========================================================= */
async function renderSlaDashboardView(container){
  container.innerHTML = loadingHTML();
  let d;
  try { d = await API.get("/resumo/sla"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const emRisco = d.atencao + d.critico;
  const pct = d.abertos ? Math.round((d.noPrazo / d.abertos) * 100) : 100;
  const pct30 = d.concluidos30d ? Math.round((d.concluidosNoPrazo30d / d.concluidos30d) * 100) : null;

  const R = 70, CX = 90, CY = 90;
  const arc = 2 * Math.PI * R * 0.75;
  const dash = (pct / 100) * arc;
  const color = pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)";
  const atencao = d.rows.filter(r => r.status !== "No prazo");

  container.innerHTML = `
    <div class="sla-top">
      <div class="panel gauge-panel">
        <h2>Chamados abertos no prazo</h2>
        <div class="gauge-wrap">
          <svg class="gauge-svg" width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="${pct}% no prazo">
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="14"
              stroke-dasharray="${arc} 999" stroke-linecap="round" transform="rotate(135 ${CX} ${CY})"/>
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="14"
              stroke-dasharray="${dash} 999" stroke-linecap="round" transform="rotate(135 ${CX} ${CY})"/>
          </svg>
          <div class="gauge-center"><div class="gauge-value">${pct}%</div><small>no prazo</small></div>
        </div>
        <div class="gauge-caption">${d.noPrazo} de ${d.abertos} chamados abertos com folga</div>
        <div class="gauge-legend">
          <span><span class="dot" style="background:var(--green)"></span>No prazo (${d.noPrazo})</span>
          <span><span class="dot" style="background:var(--amber)"></span>Em risco (${emRisco})</span>
          <span><span class="dot" style="background:var(--red)"></span>Atrasado (${d.atrasado})</span>
        </div>
        <div class="gauge-foot">${pct30 === null ? "Nenhum chamado concluído nos últimos 30 dias" : `Últimos 30 dias: <strong>${pct30}%</strong> concluídos dentro do SLA (${d.concluidosNoPrazo30d}/${d.concluidos30d})`}</div>
      </div>

      <div class="panel risk-list">
        <h2>Chamados que precisam de atenção agora</h2>
        ${atencao.map(r => `
          <div class="risk-row">
            ${badgeHTML(r.status)}
            <span class="ri-name">${esc(r.chamado)} · ${esc(r.cliente)}<small>${esc(r.responsavel)}</small></span>
            <span class="ri-time">${esc(r.tempoRestante)}</span>
          </div>
        `).join("") || `<div class="empty-state">Nenhum chamado em risco no momento.</div>`}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><div><h2>Todos os chamados abertos</h2><p>Atualize a página para recalcular o tempo restante</p></div>
        <button class="btn" data-go="chamados-risco">Gerenciar chamados →</button></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Chamado</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Tempo restante</th><th>Risco</th></tr></thead>
          <tbody>
            ${d.rows.map(r => `<tr>
              <td><span class="mono">${esc(r.chamado)}</span></td><td>${esc(r.cliente)}</td><td>${esc(r.responsavel)}</td>
              <td><span class="mono">${fmtDateTime(r.prazoEm)}</span></td>
              <td><span class="mono">${esc(r.tempoRestante)}</span></td><td>${badgeHTML(r.status)}</td>
            </tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">Nenhum chamado aberto.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector("[data-go]").addEventListener("click", e => App.navigate(e.currentTarget.dataset.go));
}

/* =========================================================
   EVENTOS DA SEMANA (datas reais)
   ========================================================= */
const WEEKDAY_NAMES = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const MODULO_LABEL = { pessoas:"Pessoas", os:"Ordens de Serviço", sla:"SLA" };

function getMondayOfWeek(date){
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  d.setHours(0,0,0,0);
  return d;
}

async function renderWeekView(container, item){
  const monday = getMondayOfWeek(App.weekAnchor);
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);

  container.innerHTML = loadingHTML();
  let events;
  try { events = await API.get(`/eventos?de=${encodeURIComponent(monday.toISOString())}&ate=${encodeURIComponent(nextMonday.toISOString())}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const today = new Date(); today.setHours(0,0,0,0);
  const fmt = d => d.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" });
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

  const days = WEEKDAY_NAMES.map((name, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const dayEvents = events.filter(ev => {
      const e = new Date(ev.inicio); e.setHours(0,0,0,0);
      return e.getTime() === d.getTime();
    });
    return `
      <div class="week-day ${d.getTime() === today.getTime() ? "is-today" : ""}">
        <div class="week-day-head"><span class="wd-name">${name}</span><span class="wd-num">${fmt(d)}</span></div>
        <div class="week-events">
          ${dayEvents.map(ev => `
            <div class="week-event mod-${esc(ev.modulo || "geral")}" title="${esc(MODULO_LABEL[ev.modulo] || "Geral")}">
              <button class="we-del" data-del-ev="${ev.id}" aria-label="Excluir evento">×</button>
              <span class="we-time">${new Date(ev.inicio).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}</span>${esc(ev.titulo)}
            </div>`).join("")}
        </div>
        <button class="week-day-add" data-add-day="${i}">+ evento</button>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="panel week-rail">
      <div class="week-rail-head">
        <div>
          <h2>${esc(item.label)}</h2>
          <p style="font-size:12px;color:var(--muted);margin-top:3px;">Compromissos dos três módulos</p>
        </div>
        <div class="week-nav">
          <button id="weekPrev" aria-label="Semana anterior">‹</button>
          <span>${fmt(monday)} – ${fmt(sunday)}</span>
          <button id="weekNext" aria-label="Próxima semana">›</button>
          <button id="weekToday" style="padding:0 12px;">Hoje</button>
        </div>
      </div>
      <div class="week-grid">${days}</div>
    </div>
  `;

  const reload = () => renderWeekView(container, item);
  container.querySelector("#weekPrev").addEventListener("click", () => { App.weekAnchor.setDate(App.weekAnchor.getDate() - 7); reload(); });
  container.querySelector("#weekNext").addEventListener("click", () => { App.weekAnchor.setDate(App.weekAnchor.getDate() + 7); reload(); });
  container.querySelector("#weekToday").addEventListener("click", () => { App.weekAnchor = new Date(); reload(); });

  container.querySelectorAll("[data-del-ev]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este evento?")) return;
      try { await API.del(`/eventos/${btn.dataset.delEv}`); toast("Evento excluído"); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelectorAll("[data-add-day]").forEach(btn => {
    btn.addEventListener("click", () => {
      const day = new Date(monday); day.setDate(monday.getDate() + Number(btn.dataset.addDay));
      App.openFormModal({
        title: `Novo evento — ${WEEKDAY_NAMES[btn.dataset.addDay]} ${fmt(day)}`,
        fields: [
          { key:"hora", label:"Horário", type:"time", required:true },
          { key:"titulo", label:"Descrição", type:"text", required:true },
          { key:"modulo", label:"Módulo", type:"select", options:[
            { value:"", label:"Geral" }, { value:"pessoas", label:"Pessoas" },
            { value:"os", label:"Ordens de Serviço" }, { value:"sla", label:"SLA" }] },
        ],
        initialValues: { hora: "09:00" },
        onSubmit: async (values) => {
          const [h, m] = String(values.hora || "09:00").split(":").map(Number);
          const inicio = new Date(day); inicio.setHours(h, m, 0, 0);
          await API.post("/eventos", { titulo: values.titulo, modulo: values.modulo || null, inicio: inicio.toISOString() });
          toast("Evento criado");
          reload();
        },
      });
    });
  });
}

/* =========================================================
   DISPATCH
   ========================================================= */
function renderModule(container, item){
  switch (item.type){
    case "table": return renderTableView(container, item);
    case "kanban": return renderKanbanView(container, item);
    case "report": return renderReportView(container, item);
    case "indicators": return renderIndicatorsView(container, item);
    case "sla-dashboard": return renderSlaDashboardView(container, item);
    case "week": return renderWeekView(container, item);
    default: container.innerHTML = `<div class="empty-state">Módulo não implementado.</div>`;
  }
}
