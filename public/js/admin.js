/* =========================================================
   ADMINISTRAÇÃO (só admins) — fala com /api/admin
   - Usuários e convites
   - Perfis de acesso
   - Histórico
   - Configurações
   ========================================================= */

const STATUS_USUARIO = { convidado: "Convite enviado", pendente: "Aguardando aprovação", ativo: "Ativo", bloqueado: "Bloqueado" };
const STATUS_TOM = { convidado: "info", pendente: "warn", ativo: "ok", bloqueado: "bad" };
const STATUS_ORDEM = { pendente: 0, convidado: 1, ativo: 2, bloqueado: 3 };
const NIVEIS = ["nenhum", "ver", "editar"];
const NIVEL_LABEL = { nenhum: "Nenhum", ver: "Ver", editar: "Editar" };

function avatarHTML(nome){
  return `<span class="avatar">${esc(initials(nome))}</span>`;
}

/* =========================================================
   MATRIZ DE ACESSO (tela × nível)
   ========================================================= */
function accessMatrixHTML(telas, acessos){
  const grupos = [...new Set(telas.map(t => t.grupo))];
  return `<div class="access-matrix">${grupos.map(g => `
    <div class="am-group">
      <div class="am-group-head">
        <span>${esc(g)}</span>
        <div class="am-bulk" role="group" aria-label="Aplicar a todas as telas do grupo">
          <small>Todas:</small>
          ${NIVEIS.map(n => `<button type="button" data-bulk="${n}">${NIVEL_LABEL[n]}</button>`).join("")}
        </div>
      </div>
      ${telas.filter(t => t.grupo === g).map(t => {
        const atual = acessos[t.key] || "nenhum";
        return `<div class="am-row">
          <span class="am-label">${iconSVG(t.icon)}${esc(t.label)}</span>
          <div class="seg" role="radiogroup" aria-label="${esc(t.label)}">
            ${NIVEIS.map(n => {
              const off = n === "editar" && !t.editavel;
              return `<label class="seg-opt seg-${n}${off ? " is-off" : ""}"${off ? ` title="Tela calculada: só permite consulta"` : ""}>
                <input type="radio" name="acc:${esc(t.key)}" value="${n}" ${atual === n ? "checked" : ""} ${off ? "disabled" : ""}><span>${NIVEL_LABEL[n]}</span></label>`;
            }).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`).join("")}</div>`;
}

function readMatrix(root){
  const out = {};
  root.querySelectorAll(".access-matrix input:checked").forEach(i => {
    if (i.value !== "nenhum") out[i.name.slice(4)] = i.value;
  });
  return out;
}

function setMatrix(root, acessos){
  root.querySelectorAll(".access-matrix input").forEach(i => {
    i.checked = (acessos[i.name.slice(4)] || "nenhum") === i.value;
  });
}

function wireMatrix(root, onUserChange){
  root.querySelectorAll("[data-bulk]").forEach(btn => btn.addEventListener("click", () => {
    btn.closest(".am-group").querySelectorAll(".am-row").forEach(row => {
      const want = row.querySelector(`input[value="${btn.dataset.bulk}"]`);
      (want.disabled ? row.querySelector('input[value="ver"]') : want).checked = true;
    });
    onUserChange?.();
  }));
  root.querySelectorAll(".access-matrix input").forEach(i => i.addEventListener("change", () => onUserChange?.()));
}

function resumoAcessos(acessos){
  const v = Object.values(acessos || {});
  const ed = v.filter(x => x === "editar").length;
  const ver = v.filter(x => x === "ver").length;
  if (!ed && !ver) return "Nenhuma tela liberada";
  return [ed && `${ed} para editar`, ver && `${ver} só consulta`].filter(Boolean).join(" · ");
}

function formErrorEl(form){ return form.querySelector(".form-error"); }
function showFormError(form, msg){ const el = formErrorEl(form); el.textContent = msg; el.hidden = false; }

/* Envia o formulário do modal com botão travado e mensagem de erro no próprio modal. */
function submitWith(form, handler){
  form.onsubmit = async (e) => {
    e.preventDefault();
    formErrorEl(form).hidden = true;
    const btn = form.querySelector(".modal-submit");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try { await handler(); }
    catch(err){ showFormError(form, err.message); }
    finally { btn.disabled = false; btn.textContent = label; }
  };
}

/* =========================================================
   CONVITE / APROVAÇÃO / EDIÇÃO DE ACESSO
   ========================================================= */
function openAccessModal({ modo, user, data, onDone }){
  const { perfis, telas, colaboradores, perfilPadraoId } = data;
  const titulo = { convite: "Convidar colaborador", aprovar: `Aprovar acesso — ${user?.nome}`, editar: `Acesso — ${user?.nome}` }[modo];
  const form = App.openModal(titulo, { wide: true });
  const perfilInicial = String(modo === "editar" ? (user.perfilId ?? "") : (perfilPadraoId ?? ""));
  const acessosDe = (id) => id ? (perfis.find(p => String(p.id) === id)?.acessos ?? {}) : (user?.acessos ?? {});
  const livres = colaboradores.filter(c => !c.temAcesso || c.id === user?.colaboradorId);
  const papel = user?.papel ?? "usuario";

  form.innerHTML = `
    ${modo === "convite" ? `
      <p class="modal-intro">A pessoa recebe um link para criar a própria senha. O acesso definido aqui já vale no primeiro login.</p>
      <div class="form-grid">
        ${livres.length ? `<div class="field field-span">
          <label for="acColab">Colaborador cadastrado <span class="opt">(opcional)</span></label>
          <select id="acColab" name="colaboradorId">
            <option value="">— não vincular —</option>
            ${livres.map(c => `<option value="${c.id}">${esc(c.nome)}${c.email ? ` · ${esc(c.email)}` : ""}</option>`).join("")}
          </select>
          <small class="field-hint">Escolher um colaborador preenche nome e e-mail e liga a conta ao cadastro dele.</small>
        </div>` : ""}
        <div class="field"><label for="acNome">Nome <span class="req">*</span></label><input id="acNome" name="nome" maxlength="120" autocomplete="off" required></div>
        <div class="field"><label for="acEmail">E-mail <span class="req">*</span></label><input id="acEmail" name="email" type="email" autocomplete="off" required></div>
      </div>` : `
      <div class="ac-person">${avatarHTML(user.nome)}<div><strong>${esc(user.nome)}</strong><span>${esc(user.email)}</span></div></div>
      ${modo === "editar" && livres.length ? `<div class="field">
        <label for="acColab">Vinculado ao colaborador</label>
        <select id="acColab" name="colaboradorId"><option value="">— nenhum —</option>
          ${livres.map(c => `<option value="${c.id}" ${c.id === user.colaboradorId ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
        </select></div>` : ""}`}

    <div class="field">
      <label>Tipo de conta</label>
      <div class="choice-cards">
        <label class="choice-card"><input type="radio" name="papel" value="usuario" ${papel === "usuario" ? "checked" : ""}>
          <strong>Colaborador</strong><span>Vê e edita só as telas liberadas abaixo.</span></label>
        <label class="choice-card"><input type="radio" name="papel" value="admin" ${papel === "admin" ? "checked" : ""}>
          <strong>${iconSVG("shield")}Administrador</strong><span>Acesso total, inclusive usuários e configurações.</span></label>
      </div>
    </div>

    <div class="ac-acesso">
      <div class="field">
        <label for="acPerfil">Perfil de acesso</label>
        <select id="acPerfil" name="perfilId">
          ${perfis.map(p => `<option value="${p.id}" ${String(p.id) === perfilInicial ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
          <option value="" ${perfilInicial === "" ? "selected" : ""}>Personalizado (só para esta pessoa)</option>
        </select>
        <small class="field-hint" id="acPerfilHint"></small>
      </div>
      ${accessMatrixHTML(telas, acessosDe(perfilInicial))}
    </div>
    <p class="form-error" hidden></p>
    <div class="modal-actions"><button type="submit" class="btn btn-primary modal-submit">${
      { convite: "Criar convite", aprovar: "Aprovar e liberar acesso", editar: "Salvar acesso" }[modo]}</button></div>`;

  const perfilSel = form.querySelector("#acPerfil");
  const hint = form.querySelector("#acPerfilHint");
  const blocoAcesso = form.querySelector(".ac-acesso");
  const syncHint = () => {
    hint.textContent = perfilSel.value
      ? "As permissões seguem o perfil (e mudam junto com ele). Alterar qualquer tela abaixo torna o acesso personalizado."
      : "Permissões válidas só para esta pessoa.";
  };
  const syncPapel = () => { blocoAcesso.hidden = form.querySelector("input[name=papel]:checked").value === "admin"; };
  perfilSel.addEventListener("change", () => { if (perfilSel.value) setMatrix(form, acessosDe(perfilSel.value)); syncHint(); });
  wireMatrix(form, () => { if (perfilSel.value){ perfilSel.value = ""; syncHint(); } });
  form.querySelectorAll("input[name=papel]").forEach(i => i.addEventListener("change", syncPapel));
  syncHint();
  syncPapel();

  // convite: escolher o colaborador preenche nome/e-mail (sem apagar o que foi digitado)
  const colabSel = form.querySelector("#acColab");
  if (modo === "convite" && colabSel){
    colabSel.addEventListener("change", () => {
      const c = livres.find(x => String(x.id) === colabSel.value);
      if (!c) return;
      form.elements.nome.value = c.nome;
      if (c.email) form.elements.email.value = c.email;
    });
  }

  submitWith(form, async () => {
    const perfilId = perfilSel.value === "" ? null : Number(perfilSel.value);
    const body = {
      papel: form.querySelector("input[name=papel]:checked").value,
      perfilId,
      acessos: perfilId === null ? readMatrix(form) : {},
    };
    if (colabSel) body.colaboradorId = colabSel.value === "" ? null : Number(colabSel.value);

    if (modo === "convite"){
      body.nome = form.elements.nome.value.trim();
      body.email = form.elements.email.value.trim();
      const r = await API.post("/admin/usuarios/convite", body);
      onDone?.();
      showLinkModal(r.usuario, r.token, "convite", r.dias);
      return;
    }
    if (modo === "aprovar") body.status = "ativo";
    await API.patch(`/admin/usuarios/${user.id}`, body);
    App.closeModal();
    toast(modo === "aprovar" ? `${user.nome} aprovado(a)` : "Acesso atualizado");
    onDone?.();
  });

  form.querySelector("input:not([type=radio]), select")?.focus();
}

/* Mostra o link gerado (ele não fica salvo em lugar nenhum). */
function showLinkModal(user, token, tipo, dias){
  const link = `${location.origin}/convite.html#${token}`;
  const primeiro = user.nome.trim().split(/\s+/)[0];
  const msg = tipo === "convite"
    ? `Olá, ${primeiro}! Você recebeu acesso ao ${App.brand}. Crie sua senha por este link (válido por ${dias} dia(s)): ${link}`
    : `Olá, ${primeiro}! Use este link para criar uma nova senha no ${App.brand} (válido por ${dias} dia(s)): ${link}`;
  const mailto = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent(`Acesso ao ${App.brand}`)}&body=${encodeURIComponent(msg)}`;
  const form = App.openModal(tipo === "convite" ? "Convite criado" : "Link de nova senha");
  form.innerHTML = `
    <div class="link-done">
      <div class="link-icon">${iconSVG("link")}</div>
      <p>Envie o link abaixo para <strong>${esc(user.nome)}</strong>. Ele vale por <strong>${dias} dia(s)</strong> e só pode ser usado uma vez.</p>
      <div class="link-box"><input type="text" readonly value="${esc(link)}" aria-label="Link"><button type="button" class="btn btn-primary" id="copyLink">Copiar</button></div>
      <div class="link-share">
        <a class="btn" href="${esc(mailto)}">${iconSVG("mail")}Enviar por e-mail</a>
        <a class="btn" href="${esc(`https://wa.me/?text=${encodeURIComponent(msg)}`)}" target="_blank" rel="noopener">WhatsApp</a>
        <button type="button" class="btn" id="copyMsg">Copiar mensagem</button>
      </div>
      <small class="field-hint">Por segurança o link não fica salvo. Se perder, gere outro pela lista de usuários (o anterior deixa de valer).</small>
    </div>
    <div class="modal-actions"><button type="submit" class="btn modal-submit">Concluir</button></div>`;
  form.onsubmit = (e) => { e.preventDefault(); App.closeModal(); };
  form.querySelector("#copyLink").addEventListener("click", async () => { if (await copyText(link)) toast("Link copiado"); });
  form.querySelector("#copyMsg").addEventListener("click", async () => { if (await copyText(msg)) toast("Mensagem copiada"); });
  form.querySelector(".link-box input").addEventListener("focus", (e) => e.target.select());
}

/* =========================================================
   USUÁRIOS E CONVITES
   ========================================================= */
let usersFilter = "todos";

async function renderUsersView(container){
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/admin/usuarios"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }

  const usuarios = data.usuarios.sort((a, b) => STATUS_ORDEM[a.status] - STATUS_ORDEM[b.status] || a.nome.localeCompare(b.nome));
  const me = App.meta.user.id;
  const perfilNome = Object.fromEntries(data.perfis.map(p => [p.id, p.nome]));
  const count = (s) => usuarios.filter(u => u.status === s).length;
  App.setPendingBadge(count("pendente"));
  const reload = () => renderUsersView(container);
  const expirado = (u) => u.status === "convidado" && u.conviteExpira && new Date(u.conviteExpira) < new Date();

  const situacao = (u) => expirado(u)
    ? `<span class="badge bad">Convite expirado</span>`
    : `<span class="badge ${STATUS_TOM[u.status]}">${STATUS_USUARIO[u.status]}</span>`;

  const acesso = (u) => {
    if (u.papel === "admin") return `<span class="tag tag-admin">${iconSVG("shield")}Administrador</span>`;
    if (u.perfilId) return `<span class="tag">${esc(perfilNome[u.perfilId] ?? "Perfil")}</span>`;
    return `<span class="tag tag-custom">Personalizado</span><small class="tag-sub">${esc(resumoAcessos(u.acessos))}</small>`;
  };

  const acoes = (u) => {
    const self = u.id === me;
    const main = u.status === "pendente"
      ? `<button class="icon-btn primary" data-act="aprovar" data-id="${u.id}">Aprovar</button>`
      : u.status === "convidado"
        ? `<button class="icon-btn" data-act="link" data-id="${u.id}">${iconSVG("link")}Novo link</button>`
        : `<button class="icon-btn" data-act="editar" data-id="${u.id}">Acesso</button>`;
    const opts = [
      u.status === "convidado" && ["editar", "Editar acesso"],
      u.status === "pendente" && ["recusar", "Recusar e excluir"],
      u.status === "ativo" && ["link", "Gerar link de nova senha"],
      u.status === "ativo" && !self && ["bloquear", "Bloquear acesso"],
      u.status === "bloqueado" && ["ativar", "Desbloquear"],
      u.status === "bloqueado" && ["editar", "Editar acesso"],
      !self && ["ativo", "bloqueado"].includes(u.status) && ["senha", "Definir senha manualmente"],
      !self && u.status !== "pendente" && ["excluir", u.status === "convidado" ? "Cancelar convite" : "Excluir conta"],
    ].filter(Boolean);
    const more = opts.length
      ? `<select class="icon-btn more-select" data-more="${u.id}" aria-label="Mais ações"><option value="">Mais…</option>${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`
      : "";
    return `<div class="user-actions">${main}${more}</div>`;
  };

  const filtros = [
    ["todos", "Todos", usuarios.length],
    ["pendente", "Aguardando aprovação", count("pendente")],
    ["convidado", "Convites", count("convidado")],
    ["ativo", "Ativos", count("ativo")],
    ["bloqueado", "Bloqueados", count("bloqueado")],
  ].filter(([k, , n]) => k === "todos" || n > 0);
  if (!filtros.some(([k]) => k === usersFilter)) usersFilter = "todos";

  container.innerHTML = `
    <div class="kpi-row">
      <div class="kpi kpi-total"><div class="value">${usuarios.length}</div><div class="label">Contas</div></div>
      <div class="kpi accent-green"><div class="value">${count("ativo")}</div><div class="label">Ativas</div></div>
      <div class="kpi accent-blue"><div class="value">${count("convidado")}</div><div class="label">Convites em aberto</div></div>
      <div class="kpi accent-amber"><div class="value">${count("pendente")}</div><div class="label">Aguardando aprovação</div></div>
    </div>
    <div class="panel">
      <div class="panel-head">
        <div>
          <h2>Usuários</h2>
          <p>Convide colaboradores e defina, tela a tela, o que cada um pode ver ou editar.</p>
        </div>
        <div class="panel-actions">
          <input type="search" class="inline-search" id="userSearch" placeholder="Buscar nome ou e-mail…" aria-label="Buscar usuário">
          <button class="btn btn-primary" id="inviteBtn">${iconSVG("userplus")}Convidar colaborador</button>
        </div>
      </div>
      <div class="chip-tabs" role="tablist">
        ${filtros.map(([k, l, n]) => `<button type="button" role="tab" class="chip-tab ${k === usersFilter ? "active" : ""}" data-filter="${k}">${esc(l)} <span>${n}</span></button>`).join("")}
      </div>
      <div class="table-wrap">
        <table class="data-table users-table">
          <thead><tr><th>Usuário</th><th>Situação</th><th>Acesso</th><th>Último acesso</th><th></th></tr></thead>
          <tbody id="usersBody"></tbody>
        </table>
      </div>
    </div>`;

  const searchEl = container.querySelector("#userSearch");
  const byId = (id) => usuarios.find(u => u.id === Number(id));
  const run = async (fn, okMsg) => {
    try { await fn(); toast(okMsg); }
    catch(err){ toast(err.message, "bad"); }
    reload();
  };
  const novoLink = async (u) => {
    try {
      const r = await API.post(`/admin/usuarios/${u.id}/link`);
      showLinkModal(u, r.token, r.tipo, r.dias);
      reload();
    } catch(err){ toast(err.message, "bad"); }
  };

  function draw(){
    const q = searchEl.value.trim().toLowerCase();
    const lista = usuarios.filter(u =>
      (usersFilter === "todos" || u.status === usersFilter) &&
      (!q || `${u.nome} ${u.email}`.toLowerCase().includes(q)));
    const tbody = container.querySelector("#usersBody");
    tbody.innerHTML = lista.map(u => `
      <tr>
        <td><div class="user-cell">${avatarHTML(u.nome)}<div>
          <strong>${esc(u.nome)}${u.id === me ? ` <span class="you">você</span>` : ""}</strong>
          <span>${esc(u.email)}${u.colaborador ? ` · ${iconSVG("users")}${esc(u.colaborador)}` : ""}</span>
        </div></div></td>
        <td>${situacao(u)}</td>
        <td><div class="tag-cell">${acesso(u)}</div></td>
        <td><span class="mono" title="${esc(u.ultimoAcesso ? fmtDateTime(u.ultimoAcesso) : "")}">${u.ultimoAcesso ? esc(timeAgo(u.ultimoAcesso)) : "—"}</span></td>
        <td>${acoes(u)}</td>
      </tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">Nenhum usuário encontrado.</div></td></tr>`;

    tbody.querySelectorAll("[data-act]").forEach(btn => btn.addEventListener("click", () => {
      const u = byId(btn.dataset.id);
      if (btn.dataset.act === "link") return novoLink(u);
      openAccessModal({ modo: btn.dataset.act, user: u, data, onDone: reload });
    }));

    tbody.querySelectorAll("[data-more]").forEach(sel => sel.addEventListener("change", () => {
      const u = byId(sel.dataset.more);
      const act = sel.value;
      sel.value = "";
      switch (act){
        case "editar": openAccessModal({ modo: "editar", user: u, data, onDone: reload }); break;
        case "link": novoLink(u); break;
        case "bloquear":
          if (confirm(`Bloquear o acesso de ${u.nome}? A pessoa será desconectada.`))
            run(() => API.patch(`/admin/usuarios/${u.id}`, { status: "bloqueado" }), "Acesso bloqueado");
          break;
        case "ativar": run(() => API.patch(`/admin/usuarios/${u.id}`, { status: "ativo" }), "Acesso liberado"); break;
        case "recusar":
        case "excluir":
          if (confirm(`${act === "excluir" && u.status === "convidado" ? "Cancelar o convite de" : "Excluir a conta de"} ${u.nome}? Essa ação não pode ser desfeita.`))
            run(() => API.del(`/admin/usuarios/${u.id}`), u.status === "convidado" ? "Convite cancelado" : "Conta excluída");
          break;
        case "senha":
          App.openFormModal({
            title: `Nova senha — ${u.nome}`,
            fields: [{ key: "senha", label: "Nova senha", type: "password", required: true, hint: "Mínimo de 8 caracteres. Prefira “Gerar link de nova senha”, assim só a pessoa conhece a senha." }],
            onSubmit: async (v) => { await API.post(`/admin/usuarios/${u.id}/senha`, { senha: v.senha }); toast("Senha redefinida"); },
          });
          break;
      }
    }));
  }

  searchEl.addEventListener("input", draw);
  container.querySelectorAll("[data-filter]").forEach(btn => btn.addEventListener("click", () => {
    usersFilter = btn.dataset.filter;
    container.querySelectorAll("[data-filter]").forEach(b => b.classList.toggle("active", b === btn));
    draw();
  }));
  container.querySelector("#inviteBtn").addEventListener("click", () => openAccessModal({ modo: "convite", data, onDone: reload }));
  draw();
}

/* =========================================================
   PERFIS DE ACESSO
   ========================================================= */
function openProfileModal({ perfil, base, telas, onDone }){
  const form = App.openModal(perfil ? `Perfil — ${perfil.nome}` : "Novo perfil de acesso", { wide: true });
  const fonte = perfil || base || { nome: "", descricao: "", acessos: {} };
  form.innerHTML = `
    <div class="form-grid">
      <div class="field"><label for="pfNome">Nome do perfil <span class="req">*</span></label>
        <input id="pfNome" name="nome" maxlength="60" required value="${esc(perfil ? perfil.nome : base ? `${base.nome} (cópia)` : "")}" placeholder="Ex.: Supervisão de campo"></div>
      <div class="field"><label for="pfDesc">Descrição</label>
        <input id="pfDesc" name="descricao" maxlength="200" value="${esc(fonte.descricao || "")}" placeholder="Para quem é este perfil"></div>
    </div>
    ${perfil?.usuarios ? `<p class="modal-intro">${perfil.usuarios} usuário(s) usam este perfil — as mudanças valem para todos imediatamente.</p>` : ""}
    ${accessMatrixHTML(telas, fonte.acessos)}
    <p class="form-error" hidden></p>
    <div class="modal-actions"><button type="submit" class="btn btn-primary modal-submit">${perfil ? "Salvar perfil" : "Criar perfil"}</button></div>`;
  wireMatrix(form);
  submitWith(form, async () => {
    const body = { nome: form.elements.nome.value, descricao: form.elements.descricao.value, acessos: readMatrix(form) };
    if (perfil) await API.put(`/admin/perfis/${perfil.id}`, body);
    else await API.post("/admin/perfis", body);
    App.closeModal();
    toast(perfil ? "Perfil atualizado" : "Perfil criado");
    onDone();
  });
  form.elements.nome.focus();
}

async function renderProfilesView(container){
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/admin/perfis"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }
  const { perfis, telas, perfilPadraoId } = data;
  const reload = () => renderProfilesView(container);
  const grupos = [...new Set(telas.map(t => t.grupo))];

  const barras = (acessos) => grupos.map(g => {
    const doGrupo = telas.filter(t => t.grupo === g);
    const ed = doGrupo.filter(t => acessos[t.key] === "editar").length;
    const ver = doGrupo.filter(t => acessos[t.key] === "ver").length;
    const pct = (n) => `${(n / doGrupo.length) * 100}%`;
    return `<div class="pf-bar" title="${esc(`${g}: ${ed} editar, ${ver} ver, ${doGrupo.length - ed - ver} sem acesso`)}">
      <span class="pf-bar-label">${esc(g)}</span>
      <span class="pf-bar-track"><i class="b-ed" style="width:${pct(ed)}"></i><i class="b-ver" style="width:${pct(ver)}"></i></span>
    </div>`;
  }).join("");

  container.innerHTML = `
    <div class="section-intro">
      <p>Perfis são modelos de permissão. Ao convidar alguém, escolha um perfil e a pessoa já entra com o acesso certo; mudar o perfil atualiza todos que o usam.</p>
      <div class="legend"><span><i class="b-ed"></i>Editar</span><span><i class="b-ver"></i>Ver</span><span><i class="b-none"></i>Sem acesso</span></div>
    </div>
    <div class="profile-grid">
      ${perfis.map(p => `
        <div class="profile-card">
          <div class="pf-head">
            <div class="home-icon acc-violet">${iconSVG("shield")}</div>
            <div>
              <h3>${esc(p.nome)}</h3>
              ${p.id === perfilPadraoId ? `<span class="tag tag-default">Padrão para novos cadastros</span>` : ""}
            </div>
          </div>
          <p class="pf-desc">${esc(p.descricao || "Sem descrição.")}</p>
          <div class="pf-bars">${barras(p.acessos)}</div>
          <div class="pf-foot">
            <span class="muted-note">${iconSVG("users")}${p.usuarios} usuário(s)</span>
            <div class="row-actions">
              <button class="icon-btn" data-edit="${p.id}">Editar</button>
              <button class="icon-btn" data-dup="${p.id}" title="Criar um perfil novo a partir deste">Duplicar</button>
              <button class="icon-btn danger" data-del="${p.id}">Excluir</button>
            </div>
          </div>
        </div>`).join("")}
      <button class="profile-card profile-new" id="newProfile">
        <span class="pn-plus">+</span>
        <strong>Novo perfil</strong>
        <span class="muted-note">Monte um conjunto de permissões reutilizável</span>
      </button>
    </div>`;

  const byId = (id) => perfis.find(p => p.id === Number(id));
  container.querySelector("#newProfile").addEventListener("click", () => openProfileModal({ telas, onDone: reload }));
  container.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openProfileModal({ perfil: byId(b.dataset.edit), telas, onDone: reload })));
  container.querySelectorAll("[data-dup]").forEach(b => b.addEventListener("click", () => openProfileModal({ base: byId(b.dataset.dup), telas, onDone: reload })));
  container.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const p = byId(b.dataset.del);
    const aviso = p.usuarios ? `\n\n${p.usuarios} usuário(s) continuarão com as mesmas permissões, como acesso personalizado.` : "";
    if (!confirm(`Excluir o perfil "${p.nome}"?${aviso}`)) return;
    try { await API.del(`/admin/perfis/${p.id}`); toast("Perfil excluído"); }
    catch(err){ toast(err.message, "bad"); }
    reload();
  }));
}

/* =========================================================
   HISTÓRICO
   ========================================================= */
const ACAO = {
  criou: ["Criou", "ok"], alterou: ["Alterou", "info"], moveu: ["Moveu", "info"],
  excluiu: ["Excluiu", "bad"], admin: ["Acesso", "neutral"],
};

async function renderActivityView(container){
  const telas = App.meta.groups.filter(g => g.key !== "admin").flatMap(g => g.items);
  const nomeTela = Object.fromEntries(telas.map(t => [t.key, t.label]));
  let itens = [];

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Histórico de alterações</h2><p>Últimos 12 meses: quem criou, alterou ou excluiu registros e mudanças de acesso.</p></div>
        <div class="panel-actions">
          <select class="inline-search" id="actTela" aria-label="Filtrar por tela">
            <option value="">Todas as telas</option>
            ${telas.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div id="actList" class="timeline">${loadingHTML()}</div>
      <div class="panel-foot" id="actMore" hidden><button class="btn" type="button">Carregar mais</button></div>
    </div>`;

  const listEl = container.querySelector("#actList");
  const moreEl = container.querySelector("#actMore");
  const telaSel = container.querySelector("#actTela");

  const dia = (iso) => {
    const d = new Date(iso); d.setHours(0,0,0,0);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const diff = Math.round((hoje - d) / 86400e3);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Ontem";
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  };

  function draw(){
    if (!itens.length){ listEl.innerHTML = `<div class="empty-state">Nenhuma atividade registrada ainda.</div>`; return; }
    let ultimoDia = null;
    listEl.innerHTML = itens.map(a => {
      const d = dia(a.quando);
      const head = d !== ultimoDia ? `<div class="tl-day">${esc(d)}</div>` : "";
      ultimoDia = d;
      const [label, tom] = ACAO[a.acao] ?? [a.acao, "neutral"];
      return `${head}<div class="tl-item">
        <span class="tl-time mono">${new Date(a.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        ${avatarHTML(a.usuario)}
        <div class="tl-body"><strong>${esc(a.usuario)}</strong> <span class="badge ${tom}">${esc(label)}</span>
          <span class="tl-desc">${esc(a.descricao)}</span>
          ${a.tela && nomeTela[a.tela] ? `<small>${esc(nomeTela[a.tela])}</small>` : ""}</div>
      </div>`;
    }).join("");
  }

  async function load(reset){
    const params = new URLSearchParams();
    if (telaSel.value) params.set("tela", telaSel.value);
    if (!reset && itens.length) params.set("antes", itens[itens.length - 1].id);
    try {
      const novos = await API.get(`/admin/atividades?${params}`);
      itens = reset ? novos : itens.concat(novos);
      moreEl.hidden = novos.length < 100;
      draw();
    } catch(err){ listEl.innerHTML = errorHTML(err); }
  }

  telaSel.addEventListener("change", () => { listEl.innerHTML = loadingHTML(); load(true); });
  moreEl.querySelector("button").addEventListener("click", () => load(false));
  load(true);
}

/* =========================================================
   CONFIGURAÇÕES
   ========================================================= */
const CORES = [
  ["indigo", "Índigo"], ["azul", "Azul"], ["verde", "Verde"],
  ["violeta", "Violeta"], ["laranja", "Laranja"], ["rosa", "Rosa"],
];

async function renderSettingsView(container){
  container.innerHTML = loadingHTML();
  let data;
  try { data = await API.get("/admin/config"); }
  catch(err){ container.innerHTML = errorHTML(err); return; }
  const { config, perfis } = data;
  // ao entrar na tela, a cor aplicada é a salva (desfaz prévias não salvas)
  document.documentElement.dataset.accent = config.corDestaque;

  container.innerHTML = `
    <form id="settingsForm" class="settings">
      <div class="panel settings-panel">
        <div class="panel-head"><div><h2>Identidade</h2><p>Aparece no menu, na aba do navegador e na tela de login.</p></div></div>
        <div class="settings-body">
          <div class="brand-preview" aria-hidden="true">
            <span class="brand-mark" id="pvMark"></span>
            <div class="brand-text"><strong id="pvName"></strong><span id="pvSub"></span></div>
          </div>
          <div class="field"><label for="cfNome">Nome do painel <span class="req">*</span></label>
            <input id="cfNome" name="nomePainel" maxlength="40" required value="${esc(config.nomePainel)}"></div>
          <div class="field"><label for="cfSub">Subtítulo</label>
            <input id="cfSub" name="subtitulo" maxlength="60" value="${esc(config.subtitulo)}" placeholder="Ex.: nome da empresa"></div>
        </div>
      </div>

      <div class="panel settings-panel">
        <div class="panel-head"><div><h2>Aparência</h2><p>Cor de destaque de botões, menu e indicadores. Cada pessoa escolhe tema claro ou escuro no topo.</p></div></div>
        <div class="settings-body">
          <div class="swatches" role="radiogroup" aria-label="Cor de destaque">
            ${CORES.map(([k, l]) => `<label class="swatch"><input type="radio" name="corDestaque" value="${k}" ${config.corDestaque === k ? "checked" : ""}>
              <span class="swatch-dot sw-${k}"></span><span>${l}</span></label>`).join("")}
          </div>
        </div>
      </div>

      <div class="panel settings-panel">
        <div class="panel-head"><div><h2>Acesso de novas pessoas</h2><p>Como colaboradores entram no painel.</p></div></div>
        <div class="settings-body">
          <label class="switch-row">
            <input type="checkbox" name="cadastroAberto" ${config.cadastroAberto ? "checked" : ""}>
            <span class="switch" aria-hidden="true"></span>
            <span><strong>Permitir cadastro pela tela de login</strong>
              <small>A pessoa cria a conta e espera sua aprovação. Desligado, só entra quem receber convite.</small></span>
          </label>
          <div class="form-grid">
            <div class="field"><label for="cfPerfil">Perfil aplicado ao aprovar cadastros</label>
              <select id="cfPerfil" name="perfilPadraoId">
                <option value="">Nenhum (escolher na hora)</option>
                ${perfis.map(p => `<option value="${p.id}" ${p.id === config.perfilPadraoId ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}
              </select>
              <small class="field-hint">Também vem pré-selecionado ao convidar alguém.</small></div>
            <div class="field"><label for="cfDias">Validade dos links de convite (dias)</label>
              <input id="cfDias" name="diasConvite" type="number" min="1" max="30" step="1" required value="${esc(config.diasConvite)}"></div>
          </div>
        </div>
      </div>

      <p class="form-error" hidden></p>
      <div class="settings-actions"><button type="submit" class="btn btn-primary">Salvar configurações</button></div>
    </form>`;

  const form = container.querySelector("#settingsForm");
  const preview = () => {
    const nome = form.elements.nomePainel.value.trim() || "Painel";
    container.querySelector("#pvMark").textContent = initials(nome);
    container.querySelector("#pvName").textContent = nome;
    container.querySelector("#pvSub").textContent = form.elements.subtitulo.value;
  };
  form.elements.nomePainel.addEventListener("input", preview);
  form.elements.subtitulo.addEventListener("input", preview);
  // prévia da cor na página inteira
  form.querySelectorAll("input[name=corDestaque]").forEach(i => i.addEventListener("change", () => {
    document.documentElement.dataset.accent = i.value;
  }));
  preview();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector(".form-error");
    err.hidden = true;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const { config: salvo } = await API.put("/admin/config", {
        nomePainel: form.elements.nomePainel.value,
        subtitulo: form.elements.subtitulo.value,
        corDestaque: form.querySelector("input[name=corDestaque]:checked").value,
        cadastroAberto: form.elements.cadastroAberto.checked,
        perfilPadraoId: form.elements.perfilPadraoId.value === "" ? null : Number(form.elements.perfilPadraoId.value),
        diasConvite: Number(form.elements.diasConvite.value),
      });
      App.applyBranding(salvo);
      document.title = `Configurações · ${App.brand}`;
      toast("Configurações salvas");
    } catch(ex){
      err.textContent = ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  });
}

/* =========================================================
   IMPORTAR COLABORADORES (CSV salvo pelo Excel)
   ========================================================= */
function openImportModal(onDone){
  const form = App.openModal("Importar colaboradores", { wide: true });
  form.innerHTML = `
    <p class="modal-intro">No Excel, use <strong>Arquivo → Salvar como → CSV UTF-8</strong>. Colunas reconhecidas:
      Nome, Matrícula, Login, E-mail, Setor/Lotação, Função, Ramal, Celular, Nascimento, Formação/Curso, Home Office e Situação da vaga.
      Quem já existe (mesma matrícula, login ou e-mail) é <strong>atualizado</strong>; os demais são criados.</p>
    <div class="form-grid">
      <div class="field"><label for="impArq">Arquivo CSV <span class="req">*</span></label>
        <input id="impArq" type="file" accept=".csv,text/csv" required></div>
      <div class="field"><label for="impDom">Domínio de e-mail <span class="opt">(opcional)</span></label>
        <input id="impDom" placeholder="ex.: stf.jus.br" value="stf.jus.br">
        <small class="field-hint">Sem coluna de e-mail, ele vira login@domínio.</small></div>
    </div>
    <div class="import-preview" id="impPrev" hidden></div>
    <p class="form-error" hidden></p>
    <div class="modal-actions"><button type="submit" class="btn btn-primary modal-submit">Conferir</button></div>`;

  let csv = null;
  let conferido = false;
  const prev = form.querySelector("#impPrev");
  const btn = form.querySelector(".modal-submit");
  const reset = () => { conferido = false; prev.hidden = true; btn.textContent = "Conferir"; };
  form.querySelector("#impArq").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    csv = f ? await f.text() : null;
    reset();
  });
  form.querySelector("#impDom").addEventListener("input", reset);

  submitWith(form, async () => {
    if (!csv) throw new Error("Escolha o arquivo CSV");
    const body = { csv, dominio: form.querySelector("#impDom").value, simular: !conferido };
    const r = await API.post("/admin/importar/colaboradores", body);
    if (!conferido){
      prev.innerHTML = `<strong>${r.linhas}</strong> linha(s) lida(s): <span class="badge ok">${r.criados} novo(s)</span> <span class="badge info">${r.atualizados} atualização(ões)</span>`;
      prev.hidden = false;
      conferido = true;
      setTimeout(() => { btn.textContent = "Importar agora"; });
      return;
    }
    App.closeModal();
    toast(`Importação concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s)`);
    onDone?.();
  });
}
