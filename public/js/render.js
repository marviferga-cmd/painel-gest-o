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

/* Valor usado para ordenar: números e datas pelo valor, o resto pelo texto exibido. null vai para o fim. */
function sortValue(col, row){
  const v = row[col.key];
  switch (col.type){
    case "number":
    case "money": return v === null || v === undefined || v === "" ? null : Number(v);
    case "date":
    case "datetime":
    case "month": return v || null;
    case "hours": {
      const m = /^([+-])?(\d+)h(\d{2})$/.exec(String(v ?? ""));
      return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
    }
    default: {
      const t = cellText(col, row);
      return t === "—" || t === null ? null : String(t);
    }
  }
}

function compareSortValues(a, b){
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

/* Texto da célula no CSV: dinheiro como número com vírgula (o Excel soma), vazio em vez de "—". */
function csvValue(col, row){
  const v = row[col.key];
  if (col.type === "money") return v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ",");
  if (col.type === "number") return v ?? "";
  const t = cellText(col, row);
  return t === "—" ? "" : t;
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
        <div class="panel-actions">
          <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
          ${editable
            ? `<button class="btn btn-primary" id="addRowBtn">+ Adicionar</button>`
            : `<span class="readonly-note">Calculado automaticamente</span>`}
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr>${visible.map(c => `<th data-sort="${esc(c.key)}" aria-sort="none"><button type="button" class="th-sort">${esc(c.label)}<span class="sort-ind" aria-hidden="true"></span></button></th>`).join("")}${editable ? `<th style="width:70px"></th>` : ""}</tr></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const searchEl = container.querySelector("#searchInput");
  const selects = [...container.querySelectorAll("[data-filter-col]")];
  const sort = { key: null, dir: 1 }; // clique no cabeçalho: crescente → decrescente → sem ordenação
  let shown = rows;

  function drawBody(){
    const search = searchEl.value.trim().toLowerCase();
    const active = selects.filter(s => s.value).map(s => [visible.find(c => c.key === s.dataset.filterCol), s.value]);
    const filtered = rows.filter(row => {
      if (search && !visible.map(c => String(cellText(c, row))).join(" ").toLowerCase().includes(search)) return false;
      return active.every(([col, val]) => String(cellText(col, row)) === val);
    });
    const sortCol = visible.find(c => c.key === sort.key);
    if (sortCol){
      filtered.sort((a, b) => {
        const va = sortValue(sortCol, a), vb = sortValue(sortCol, b);
        if (va === null) return vb === null ? 0 : 1;
        if (vb === null) return -1;
        return compareSortValues(va, vb) * sort.dir;
      });
    }
    container.querySelectorAll("th[data-sort]").forEach(th => {
      th.setAttribute("aria-sort", th.dataset.sort !== sort.key ? "none" : sort.dir === 1 ? "ascending" : "descending");
    });
    shown = filtered;

    const tbody = container.querySelector("#tableBody");
    tbody.innerHTML = filtered.length
      ? filtered.map(row => `
          <tr>
            ${visible.map(c => `<td>${cellHTML(c, row)}</td>`).join("")}
            ${editable ? `<td><div class="row-actions"><button class="icon-btn" data-edit="${row.id}">Editar</button></div></td>` : ""}
          </tr>`).join("")
      : `<tr><td colspan="${visible.length + 1}"><div class="empty-state">Nenhum registro encontrado.</div></td></tr>`;

    const limite = App.meta.maxRows && rows.length >= App.meta.maxRows
      ? ` · mostrando só os ${App.meta.maxRows} primeiros; use os filtros ou exporte por partes` : "";
    container.querySelector("#rowCountLabel").textContent = `${filtered.length} de ${rows.length} registro(s)${limite}`;

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

  container.querySelectorAll("th[data-sort] .th-sort").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.parentElement.dataset.sort;
      if (sort.key !== key){ sort.key = key; sort.dir = 1; }
      else if (sort.dir === 1) sort.dir = -1;
      else sort.key = null;
      drawBody();
    });
  });

  // exporta o que está na tela (filtros e ordenação aplicados)
  container.querySelector("#exportCsvBtn").addEventListener("click", () => {
    const hoje = new Date().toLocaleDateString("en-CA");
    downloadCSV(`${item.key}-${hoje}.csv`, visible.map(c => c.label), shown.map(row => visible.map(c => csvValue(c, row))));
  });

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
          <p>${data.cards.length} card(s) — arraste para mover ou reordenar</p>
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
      setTimeout(() => cardEl.classList.add("dragging"), 0);
    });
    cardEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));
  });

  // card da coluna antes do qual o arrastado vai entrar (null = fim da coluna)
  const cardBefore = (colEl, y) => [...colEl.querySelectorAll(".kanban-card:not(.dragging)")]
    .find(el => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; }) ?? null;
  const clearMarks = (colEl) => colEl.querySelectorAll(".drop-before").forEach(el => el.classList.remove("drop-before"));

  container.querySelectorAll(".kanban-col").forEach(colEl => {
    colEl.addEventListener("dragover", e => {
      e.preventDefault();
      colEl.classList.add("drag-over");
      clearMarks(colEl);
      cardBefore(colEl, e.clientY)?.classList.add("drop-before");
    });
    colEl.addEventListener("dragleave", e => {
      if (colEl.contains(e.relatedTarget)) return;
      colEl.classList.remove("drag-over");
      clearMarks(colEl);
    });
    colEl.addEventListener("drop", async e => {
      e.preventDefault();
      const before = cardBefore(colEl, e.clientY);
      colEl.classList.remove("drag-over");
      clearMarks(colEl);
      const id = Number(e.dataTransfer.getData("text/plain"));
      const colunaId = Number(colEl.dataset.col);
      const card = data.cards.find(c => c.id === id);
      if (!card) return;
      const others = [...colEl.querySelectorAll(".kanban-card")].filter(el => Number(el.dataset.card) !== id);
      const posicao = before ? others.indexOf(before) : others.length;
      const atual = data.cards.filter(c => c.colunaId === colunaId).map(c => c.id);
      if (card.colunaId === colunaId && atual.indexOf(id) === posicao) return; // soltou no mesmo lugar
      try { await API.patch(`/kanban/cards/${id}`, { colunaId, posicao }); }
      catch(err){ toast(err.message, "bad"); }
      reload();
    });
  });

  container.querySelectorAll("[data-del-card]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await App.confirm("Excluir este card?", { ok: "Excluir", danger: true }))) return;
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
      if (!(await App.confirm("Excluir este evento?", { ok: "Excluir", danger: true }))) return;
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
   USUÁRIOS E ACESSO (só admins)
   ========================================================= */
const STATUS_USUARIO = { pendente: "Pendente", ativo: "Ativo", bloqueado: "Bloqueado" };

function checkGroupsHTML(telas, checked){
  const grupos = [...new Set(telas.map(t => t.grupo))];
  return `<div class="check-groups">${grupos.map(g => `
    <div>
      <div class="check-group-title">${esc(g)}</div>
      <div class="check-grid">
        ${telas.filter(t => t.grupo === g).map(t => `
          <label class="check-item"><input type="checkbox" value="${esc(t.key)}" ${checked.has(t.key) ? "checked" : ""}>${esc(t.label)}</label>
        `).join("")}
      </div>
    </div>`).join("")}</div>`;
}

function openPermissionsModal(user, restritas, onSaved){
  const form = document.getElementById("modalForm");
  document.getElementById("modalTitle").textContent = `Telas liberadas — ${user.nome}`;
  form.innerHTML = `
    <p class="muted-note" style="margin-bottom:14px;line-height:1.5">
      Marque as telas restritas que essa pessoa pode abrir. As telas não restritas já ficam visíveis para todo usuário aprovado.
    </p>
    ${checkGroupsHTML(restritas, new Set(user.permissoes))}
    <p class="form-error" hidden></p>
    <div class="modal-actions"><button type="submit" class="btn btn-primary modal-submit">Salvar</button></div>`;
  App.openModal();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const marcadas = [...form.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
    // mantém liberações de telas que hoje não estão restritas (valem se voltarem a ser)
    const chavesRestritas = new Set(restritas.map(t => t.key));
    const permissoes = [...marcadas, ...user.permissoes.filter(k => !chavesRestritas.has(k))];
    try {
      await API.patch(`/usuarios/${user.id}`, { permissoes });
      App.closeModal();
      toast("Permissões salvas");
      onSaved();
    } catch(err){
      const el = form.querySelector(".form-error");
      el.textContent = err.message; el.hidden = false;
    }
  };
}

async function renderUsersView(container){
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/usuarios"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const { usuarios, telas } = data;
  const me = App.meta.user.id;
  const restritas = telas.filter(t => t.restrita);
  const chavesRestritas = new Set(restritas.map(t => t.key));
  const labelTela = Object.fromEntries(telas.map(t => [t.key, t.label]));
  const pendentes = usuarios.filter(u => u.status === "pendente").length;
  App.setPendingBadge(pendentes);
  const reload = () => renderUsersView(container);

  const telasCell = (u) => {
    if (u.papel === "admin") return `<span class="muted-note">Todas (administrador)</span>`;
    const lib = u.permissoes.filter(k => chavesRestritas.has(k));
    return lib.length
      ? `<div class="tela-chips">${lib.map(k => `<span class="tela-chip">${esc(labelTela[k])}</span>`).join("")}</div>`
      : `<span class="muted-note">Nenhuma</span>`;
  };

  const actionsCell = (u) => {
    const self = u.id === me;
    const main = u.status === "pendente"
      ? `<button class="icon-btn primary" data-act="aprovar" data-id="${u.id}">Aprovar</button>`
      : (u.papel !== "admin" ? `<button class="icon-btn" data-act="permissoes" data-id="${u.id}">Permissões</button>` : "");
    const opts = [
      u.status === "pendente" && ["recusar", "Recusar e excluir"],
      u.status === "ativo" && !self && ["bloquear", "Bloquear acesso"],
      u.status === "bloqueado" && ["ativar", "Desbloquear"],
      u.status === "ativo" && u.papel !== "admin" && ["admin", "Tornar administrador"],
      u.papel === "admin" && !self && ["usuario", "Remover administrador"],
      !self && ["senha", "Definir nova senha"],
      !self && u.status !== "pendente" && ["excluir", "Excluir conta"],
    ].filter(Boolean);
    const more = opts.length
      ? `<select class="icon-btn" data-more="${u.id}" aria-label="Mais ações"><option value="">Mais…</option>${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`
      : "";
    return `<div class="user-actions">${main}${more}</div>`;
  };

  container.innerHTML = `
    <div class="users-stack">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Usuários</h2>
            <p>${usuarios.length} conta(s)${pendentes ? ` · <strong style="color:var(--amber)">${pendentes} aguardando aprovação</strong>` : ""}</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Usuário</th><th>Situação</th><th>Papel</th><th>Telas restritas liberadas</th><th>Último acesso</th><th></th></tr></thead>
            <tbody>
              ${usuarios.map(u => `
                <tr>
                  <td><div class="user-cell"><strong>${esc(u.nome)}${u.id === me ? " (você)" : ""}</strong><span>${esc(u.email)}</span></div></td>
                  <td>${badgeHTML(STATUS_USUARIO[u.status] ?? u.status)}</td>
                  <td>${u.papel === "admin" ? `<span class="badge info">Administrador</span>` : `<span class="badge neutral">Usuário</span>`}</td>
                  <td>${telasCell(u)}</td>
                  <td><span class="mono">${u.ultimoAcesso ? esc(fmtDateTime(u.ultimoAcesso)) : "—"}</span></td>
                  <td>${actionsCell(u)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h2>Telas restritas</h2>
            <p>Telas marcadas só abrem para administradores e para quem você liberar. As demais ficam visíveis para todo usuário aprovado.</p>
          </div>
        </div>
        <form id="restritasForm">
          ${checkGroupsHTML(telas, chavesRestritas)}
          <div class="panel-foot"><button type="submit" class="btn btn-primary">Salvar telas restritas</button></div>
        </form>
      </div>
    </div>
  `;

  const byId = (id) => usuarios.find(u => u.id === Number(id));
  const run = async (fn, okMsg) => {
    try { await fn(); toast(okMsg); reload(); }
    catch(err){ toast(err.message, "bad"); reload(); }
  };

  container.querySelectorAll("[data-act]").forEach(btn => btn.addEventListener("click", async () => {
    const u = byId(btn.dataset.id);
    if (btn.dataset.act === "permissoes"){
      if (!restritas.length) return toast("Nenhuma tela está marcada como restrita", "bad");
      return openPermissionsModal(u, restritas, reload);
    }
    // aprovar: libera a conta e já oferece escolher as telas restritas
    try {
      await API.patch(`/usuarios/${u.id}`, { status: "ativo" });
      toast(`${u.nome} aprovado(a)`);
      if (restritas.length) openPermissionsModal({ ...u, status: "ativo" }, restritas, reload);
    } catch(err){ toast(err.message, "bad"); }
    reload();
  }));

  container.querySelectorAll("[data-more]").forEach(sel => sel.addEventListener("change", () => {
    const u = byId(sel.dataset.more);
    const act = sel.value;
    sel.value = "";
    switch (act){
      case "bloquear":
        App.confirm(`Bloquear o acesso de ${u.nome}? A pessoa será desconectada.`, { ok: "Bloquear", danger: true })
          .then(ok => ok && run(() => API.patch(`/usuarios/${u.id}`, { status: "bloqueado" }), "Acesso bloqueado"));
        break;
      case "ativar": run(() => API.patch(`/usuarios/${u.id}`, { status: "ativo" }), "Acesso liberado"); break;
      case "admin":
        App.confirm(`Tornar ${u.nome} administrador? Administradores veem todas as telas e gerenciam usuários.`, { ok: "Tornar administrador" })
          .then(ok => ok && run(() => API.patch(`/usuarios/${u.id}`, { papel: "admin" }), "Agora é administrador"));
        break;
      case "usuario": run(() => API.patch(`/usuarios/${u.id}`, { papel: "usuario" }), "Administrador removido"); break;
      case "recusar":
      case "excluir":
        App.confirm(`Excluir a conta de ${u.nome}? Essa ação não pode ser desfeita.`, { ok: "Excluir", danger: true })
          .then(ok => ok && run(() => API.del(`/usuarios/${u.id}`), "Conta excluída"));
        break;
      case "senha":
        App.openFormModal({
          title: `Nova senha — ${u.nome}`,
          fields: [{ key: "senha", label: "Nova senha", type: "password", required: true, hint: "Mínimo de 8 caracteres. Repasse para a pessoa por um canal seguro." }],
          onSubmit: async (v) => { await API.post(`/usuarios/${u.id}/senha`, { senha: v.senha }); toast("Senha redefinida"); },
        });
        break;
    }
  }));

  container.querySelector("#restritasForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const chaves = [...e.currentTarget.querySelectorAll("input[type=checkbox]:checked")].map(i => i.value);
    run(() => API.put("/usuarios/telas-restritas", { chaves }), "Telas restritas atualizadas");
  });
}

/* =========================================================
   HISTÓRICO DE ALTERAÇÕES (só admins)
   ========================================================= */
const ACAO = { criou: ["Criou", "ok"], alterou: ["Alterou", "info"], excluiu: ["Excluiu", "bad"] };

/* Campos editáveis que mudaram, como "Status: Aberta → Concluída". */
function auditChangesHTML(entry, mod){
  if (entry.acao !== "alterou" || !mod || !entry.antes || !entry.depois) return "";
  const changed = mod.columns.filter(c => !c.computed && String(cellText(c, entry.antes)) !== String(cellText(c, entry.depois)));
  if (!changed.length) return `<span class="muted-note">Sem mudanças</span>`;
  return `<ul class="audit-changes">${changed.map(c => `
    <li><strong>${esc(c.label)}:</strong> <span class="audit-old">${esc(cellText(c, entry.antes))}</span> → ${esc(cellText(c, entry.depois))}</li>`).join("")}</ul>`;
}

async function renderAuditView(container, item, modulo = ""){
  container.innerHTML = loadingHTML();
  let rows;
  try { rows = await API.get(`/auditoria${modulo ? `?modulo=${encodeURIComponent(modulo)}` : ""}`); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const telas = App.meta.groups.flatMap(g => g.items).filter(i => i.type === "table" && !i.readOnly);
  const modOf = (key) => telas.find(t => t.key === key);

  container.innerHTML = `
    <div class="filters">
      <div class="filters-label">Filtros</div>
      <div class="filters-grid">
        <div class="field">
          <label for="auditModulo">Tela</label>
          <select id="auditModulo">
            <option value="">Todas</option>
            ${telas.map(t => `<option value="${esc(t.key)}" ${t.key === modulo ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>${esc(item.label)}</h2><p>Últimas ${rows.length} alteração(ões) feitas nas telas de cadastro</p></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Quando</th><th>Usuário</th><th>Tela</th><th>Registro</th><th>Ação</th><th>Alterações</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const mod = modOf(r.modulo);
              const reg = r.depois ?? r.antes;
              const [acao, kind] = ACAO[r.acao] ?? [r.acao, "neutral"];
              return `<tr>
                <td><span class="mono">${esc(fmtDateTime(r.quando))}</span></td>
                <td>${esc(r.usuario)}</td>
                <td>${esc(mod?.label ?? r.modulo)}</td>
                <td>${mod && reg ? esc(cellText(mod.columns[0], reg)) : ""} <span class="muted-note">#${r.registroId}</span></td>
                <td><span class="badge ${kind}">${esc(acao)}</span></td>
                <td class="wrap">${auditChangesHTML(r, mod)}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="6"><div class="empty-state">Nenhuma alteração registrada.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
  container.querySelector("#auditModulo").addEventListener("change", (e) => renderAuditView(container, item, e.target.value));
}

/* =========================================================
   DISPATCH
   ========================================================= */
function renderModule(container, item){
  switch (item.type){
    case "users": return renderUsersView(container);
    case "audit": return renderAuditView(container, item);
    case "table": return renderTableView(container, item);
    case "kanban": return renderKanbanView(container, item);
    case "report": return renderReportView(container, item);
    case "indicators": return renderIndicatorsView(container, item);
    case "sla-dashboard": return renderSlaDashboardView(container, item);
    case "week": return renderWeekView(container, item);
    default: container.innerHTML = `<div class="empty-state">Módulo não implementado.</div>`;
  }
}
