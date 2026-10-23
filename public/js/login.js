/* Tela de login e cadastro. */
(function(){
  const loginForm = document.getElementById("loginForm");
  const cadastroForm = document.getElementById("cadastroForm");
  const cadastroOk = document.getElementById("cadastroOk");
  const tabs = document.querySelectorAll(".auth-tab");

  function showTab(name){
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
    });
    loginForm.hidden = name !== "login";
    cadastroForm.hidden = name !== "cadastro";
    cadastroOk.hidden = true;
    (name === "login" ? loginForm : cadastroForm).querySelector("input").focus();
  }
  tabs.forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));
  document.getElementById("voltarLogin").addEventListener("click", () => showTab("login"));

  async function post(path, body){
    const res = await fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo */ }
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  }

  function wire(form, handler){
    const errorEl = form.querySelector(".form-error");
    const btn = form.querySelector(".auth-submit");
    const label = btn.textContent;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      btn.disabled = true;
      btn.textContent = "Aguarde…";
      try {
        await handler(Object.fromEntries(new FormData(form)));
      } catch(err){
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }

  wire(loginForm, async ({ email, senha }) => {
    if (!email || !senha) throw new Error("Informe e-mail e senha");
    await post("login", { email, senha });
    location.replace("/");
  });

  wire(cadastroForm, async ({ nome, email, senha, senha2 }) => {
    if (!nome.trim() || !email.trim() || !senha) throw new Error("Preencha todos os campos");
    const min = document.getElementById("cadSenha").minLength;
    if (senha.length < min) throw new Error(`A senha deve ter pelo menos ${min} caracteres`);
    if (senha !== senha2) throw new Error("As senhas não conferem");
    const r = await post("cadastro", { nome, email, senha });
    if (!r.pendente) return location.replace("/"); // primeiro usuário em ambiente de desenvolvimento
    cadastroForm.reset();
    cadastroForm.hidden = true;
    cadastroOk.hidden = false;
  });

  loginForm.querySelector("input").focus();
})();
