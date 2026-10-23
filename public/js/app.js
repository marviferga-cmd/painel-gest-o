const App = {
  meta: null,
  currentKey: null,
  weekAnchor: new Date(),

  async init(){
    this.wireGlobalEvents();
    this.renderClock();
    try {
      this.meta = await API.get("/meta");
    } catch(err){
      // Fallback: se a API não estiver disponível (ex.: servindo os arquivos estáticos),
      // tente carregar um meta local `meta.json` para habilitar a navegação.
      try {
        const res = await fetch("meta.json");
        if (res.ok) {
          this.meta = await res.json();
          console.warn("Usando meta.json local como fallback para /api/meta");
        } else {
          throw err;
        }
      } catch(e) {
        document.getElementById("content").innerHTML = errorHTML(err);
        document.getElementById("viewTitle").textContent = "Erro";
        return;
      }
    }
    document.getElementById("resetData").hidden = !this.meta.allowReset;
    this.applyBranding(this.meta.config);
    this.renderUser();
    this.buildNav();
    const initial = decodeURIComponent(location.hash.slice(1)) || "home";
    await this.navigate(this.findItem(initial) ? initial : "home", { replace: true });
    window.addEventListener("hashchange", () => {
      const key = decodeURIComponent(location.hash.slice(1)) || "home";
      if (key !== this.currentKey) this.navigate(key, { replace: true });
    });
  },

  findItem(key){
    for (const group of this.meta.groups){
      const item = group.items.find(i => i.key === key);
      if (item) return { item, group };
    }
    return null;
  },

  buildNav(){
    const nav = document.getElementById("nav");
    nav.innerHTML = `
      <button class="nav-home" data-key="home">${iconSVG("home")} Painéis</button>
      ${this.meta.groups.map(group => `
        <div class="nav-group">
          <div class="nav-group-label">${esc(group.label)}</div>
          ${group.items.map(item => `
            <button class="nav-item" data-key="${esc(item.key)}">
              ${iconSVG(item.icon)}<span>${esc(item.label)}</span>
              <span class="badge-count" data-count-for="${esc(item.key)}" hidden></span>
            </button>
          `).join("")}
        </div>
      `).join("")}
    `;
    nav.querySelectorAll(".nav-item, .nav-home").forEach(btn => {
      btn.addEventListener("click", () => this.navigate(btn.dataset.key));
    });
    this.refreshNavCounts();
    this.setPendingBadge(this.meta.pendentes ?? 0);
  },

  /* cadastros aguardando aprovação (só admins recebem esse número) */
  setPendingBadge(n){
    const el = document.querySelector('[data-count-for="usuarios"]');
    if (!el) return;
    el.hidden = n === 0;
    el.textContent = n;
    el.closest(".nav-item").classList.toggle("risk", n > 0);
  },

  /* nome, subtítulo e cor definidos em Administração → Configurações */
  applyBranding(config){
    if (!config) return;
    this.meta.config = config;
    document.getElementById("brandName").textContent = config.nomePainel;
    document.getElementById("brandSub").textContent = config.subtitulo || "";
    document.getElementById("brandMark").textContent = initials(config.nomePainel);
    document.documentElement.dataset.accent = config.corDestaque;
    try { localStorage.setItem("accent", config.corDestaque); } catch {}
  },

  get brand(){ return this.meta?.config?.nomePainel || "Painel de Gestão"; },

  renderUser(){
    const u = this.meta.user;
    if (!u) return;
    const partes = u.nome.trim().split(/\s+/);
    document.getElementById("userAvatar").textContent = initials(u.nome);
    document.getElementById("userName").textContent = partes[0];
    document.getElementById("userPopName").textContent = u.nome;
    document.getElementById("userPopEmail").textContent = u.email;
    document.getElementById("userPopRole").textContent =
      u.papel === "admin" ? "Administrador" : u.perfil ? `Perfil: ${u.perfil}` : "Acesso personalizado";
    document.getElementById("userMenu").hidden = false;
  },

  /* quantos chamados estão atrasados ou vencem em < 24h */
  async refreshNavCounts(){
    let n = 0;
    try { n = (await API.get("/resumo/alertas")).chamadosEmRisco; }
    catch { return; }
    ["chamados-risco", "dashboards-sla"].forEach(key => {
      const el = document.querySelector(`[data-count-for="${key}"]`);
      if (!el) return;
      el.hidden = n === 0;
      el.textContent = n;
      el.closest(".nav-item").classList.toggle("risk", n > 0);
    });
  },

  async navigate(key, { replace = false } = {}){
    this.currentKey = key;
    if (!replace) history.pushState(null, "", key === "home" ? location.pathname : `#${key}`);
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.key === key));
    document.querySelector(".nav-home")?.classList.toggle("active", key === "home");
    document.body.classList.remove("nav-open");

    const content = document.getElementById("content");
    const pill = document.getElementById("accessPill");
    pill.hidden = true;
    // desfaz a prévia de cor não salva da tela de Configurações
    if (this.meta.config) document.documentElement.dataset.accent = this.meta.config.corDestaque;
    if (key === "home"){
      document.getElementById("viewGroup").textContent = "início";
      document.getElementById("viewTitle").textContent = "Painéis";
      document.title = this.brand;
      content.className = "content content-home";
      renderHomeView(content, this.meta);
      return;
    }

    const found = this.findItem(key);
    if (!found) return this.navigate("home", { replace: true });
    content.className = "content";
    document.getElementById("viewGroup").textContent = found.group.label;
    document.getElementById("viewTitle").textContent = found.item.label;
    document.title = `${found.item.label} · ${this.brand}`;
    pill.hidden = !isConsulta(found.item);
    await renderModule(content, found.item);
  },

  renderClock(){
    document.getElementById("todayLabel").textContent =
      new Date().toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  },

  /* ---------------- MODAL DE FORMULÁRIO ---------------- */
  /* abre o modal vazio e devolve o <form> para quem for preenchê-lo */
  openModal(title, { wide = false } = {}){
    const form = document.getElementById("modalForm");
    document.getElementById("modalTitle").textContent = title;
    document.querySelector("#modalBackdrop .modal").classList.toggle("modal-wide", wide);
    form.onsubmit = null;
    form.innerHTML = "";
    document.getElementById("modalBackdrop").classList.add("open");
    return form;
  },

  async openFormModal({ title, fields, onSubmit, initialValues, onDelete }){
    // formulários longos (ex.: Colaboradores) usam duas colunas
    const grid = fields.length > 8;
    const form = this.openModal(title, { wide: grid });
    form.innerHTML = loadingHTML("Carregando formulário…");

    // carrega as listas das chaves estrangeiras antes de montar o formulário
    const lookups = {};
    try {
      await Promise.all(fields.filter(f => f.type === "ref").map(async f => { lookups[f.ref] = await API.lookup(f.ref); }));
    } catch(err){
      form.innerHTML = errorHTML(err);
      return;
    }

    const init = initialValues || {};
    const campos = fields.map(f => this.fieldHTML(f, init[f.key], lookups, init)).join("");
    form.innerHTML = (grid ? `<div class="form-grid">${campos}</div>` : campos)
      + `<p class="form-error" id="formError" hidden></p>`
      + `<div class="modal-actions">`
      + (onDelete ? `<button type="button" class="modal-delete" id="modalDeleteBtn">Excluir</button>` : "")
      + `<button type="submit" class="btn btn-primary modal-submit">Salvar</button></div>`;

    const errorEl = form.querySelector("#formError");
    const submitBtn = form.querySelector(".modal-submit");
    const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

    form.onsubmit = async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const values = {};
      for (const f of fields){
        const el = form.elements.namedItem(f.key);
        const raw = el.value.trim();
        switch (f.type){
          case "password": values[f.key] = el.value; break;
          case "number": values[f.key] = raw === "" ? null : Number(raw); break;
          case "ref": values[f.key] = raw === "" ? null : Number(raw); break;
          case "bool": values[f.key] = raw === "true"; break;
          case "datetime": values[f.key] = raw ? new Date(raw).toISOString() : null; break;
          default: values[f.key] = raw === "" ? null : raw;
        }
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Salvando…";
      try {
        await onSubmit(values);
        this.closeModal();
      } catch(err){
        showError(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Salvar";
      }
    };

    form.querySelector("#modalDeleteBtn")?.addEventListener("click", async () => {
      if (!confirm("Excluir este registro? Essa ação não pode ser desfeita.")) return;
      try {
        await onDelete();
        this.closeModal();
      } catch(err){ showError(err.message); }
    });

    form.querySelector("input,select")?.focus();
  },

  fieldHTML(f, current, lookups){
    const id = `f_${f.key}`;
    const req = f.required ? "required" : "";
    const star = f.required ? ` <span class="req">*</span>` : "";
    const hint = f.hint ? `<small class="field-hint">${esc(f.hint)}</small>` : "";
    const wrap = (control) => `<div class="field"><label for="${id}">${esc(f.label)}${star}</label>${control}${hint}</div>`;
    const opts = (list, selected) => list.map(o =>
      `<option value="${esc(o.value)}" ${String(o.value) === String(selected ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("");

    switch (f.type){
      case "ref":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>
          <option value="">${f.required ? "Selecione…" : "— nenhum —"}</option>
          ${opts(lookups[f.ref] || [], current)}</select>`);
      case "select":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>${opts(f.options, current)}</select>`);
      case "status":
        return wrap(`<select id="${id}" name="${esc(f.key)}" ${req}>
          ${f.required ? `<option value="">Selecione…</option>` : ""}
          ${opts((f.options || []).map(o => ({ value:o, label:o })), current)}</select>`);
      case "bool":
        return wrap(`<select id="${id}" name="${esc(f.key)}">
          ${opts([{ value:"true", label:"Ativo" }, { value:"false", label:"Inativo" }], current === undefined ? "true" : String(current))}</select>`);
      case "number":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="number" step="1" value="${esc(current ?? "")}" ${req}>`);
      case "money":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(current ?? "")}" placeholder="0,00" ${req}>`);
      case "date":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="date" value="${esc(current ?? "")}" ${req}>`);
      case "datetime":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="datetime-local" value="${esc(toLocalInput(current))}" ${req}>`);
      case "month":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="month" value="${esc(current ?? "")}" ${req}>`);
      case "time":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="time" value="${esc(current ?? "")}" ${req}>`);
      case "password":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="password" autocomplete="new-password" ${req}>`);
      case "hours":
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="text" value="${esc(current ?? "")}" placeholder="ex: +3h20, -1h30, 45min" ${req}>`);
      default:
        return wrap(`<input id="${id}" name="${esc(f.key)}" type="text" maxlength="500" value="${esc(current ?? "")}" ${req}>`);
    }
  },

  /* ---------------- TEMA CLARO / ESCURO ---------------- */
  setTheme(theme){
    document.documentElement.dataset.theme = theme;
    this.syncThemeUI();
  },

  syncThemeUI(){
    const light = document.documentElement.dataset.theme === "light";
    document.getElementById("themeLabel").textContent = light ? "Tema claro" : "Tema escuro";
    document.getElementById("themeToggle").setAttribute("aria-pressed", String(light));
    document.querySelector('meta[name="theme-color"]').setAttribute("content", light ? "#F4F6FB" : "#090E1A");
  },

  closeModal(){
    document.getElementById("modalBackdrop").classList.remove("open");
  },

  wireGlobalEvents(){
    document.getElementById("modalClose").addEventListener("click", () => this.closeModal());
    document.getElementById("modalBackdrop").addEventListener("mousedown", (e) => {
      if (e.target.id === "modalBackdrop") this.closeModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.closeModal(); });
    document.getElementById("navToggle").addEventListener("click", () => document.body.classList.toggle("nav-open"));

    this.syncThemeUI();
    document.getElementById("themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      this.setTheme(next);
      try { localStorage.setItem("theme", next); } catch {}
    });
    // segue o sistema enquanto o usuário não escolher manualmente
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
      let saved = null;
      try { saved = localStorage.getItem("theme"); } catch {}
      if (!saved) this.setTheme(e.matches ? "light" : "dark");
    });

    const chip = document.getElementById("userChip");
    const pop = document.getElementById("userPop");
    const setPop = (open) => { pop.hidden = !open; chip.setAttribute("aria-expanded", String(open)); };
    chip.addEventListener("click", (e) => { e.stopPropagation(); setPop(pop.hidden); });
    document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setPop(false); });

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      try { await API.post("/auth/logout"); } catch {}
      location.replace("/login.html");
    });

    document.getElementById("changePassword").addEventListener("click", () => {
      setPop(false);
      this.openFormModal({
        title: "Alterar senha",
        fields: [
          { key: "atual", label: "Senha atual", type: "password", required: true },
          { key: "nova", label: "Nova senha", type: "password", required: true, hint: "Mínimo de 8 caracteres." },
          { key: "confirma", label: "Confirmar nova senha", type: "password", required: true },
        ],
        onSubmit: async (v) => {
          if (v.nova !== v.confirma) throw new Error("As senhas não conferem");
          await API.post("/auth/senha", { atual: v.atual, nova: v.nova });
          toast("Senha alterada");
        },
      });
    });

    document.getElementById("resetData").addEventListener("click", async () => {
      if (!confirm("Isso APAGA todos os dados do banco e grava os dados de exemplo. Continuar?")) return;
      const content = document.getElementById("content");
      content.innerHTML = loadingHTML("Restaurando dados de exemplo…");
      try {
        await API.post("/admin/reset");
        API.clearLookups();
        toast("Dados de exemplo restaurados");
      } catch(err){ toast(err.message, "bad"); }
      await this.navigate(this.currentKey, { replace: true });
      await this.refreshNavCounts();
    });
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
