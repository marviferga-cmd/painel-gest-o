/* Aceite de convite / redefinição de senha por link.
   O token vem depois do "#", então não vai para logs de servidor nem para o Referer. */
(function(){
  const token = decodeURIComponent(location.hash.slice(1));
  const $ = (id) => document.getElementById(id);
  const form = $("conviteForm");

  function invalido(msg){
    $("conviteLoading").hidden = true;
    if (msg) $("conviteErro").textContent = msg;
    $("conviteInvalido").hidden = false;
  }

  function aplicarMarca(cfg){
    $("brandName").textContent = cfg.nomePainel;
    $("brandSub").textContent = cfg.subtitulo || "";
    $("brandMark").textContent = cfg.nomePainel.trim().split(/\s+/)
      .filter(p => !/^(da|de|do|das|dos|e|&)$/i.test(p)).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
    document.documentElement.dataset.accent = cfg.corDestaque;
  }

  async function carregar(){
    if (!token) return invalido("Abra o link completo que você recebeu.");
    let data;
    try {
      const res = await fetch(`/api/auth/convite/${encodeURIComponent(token)}`);
      data = await res.json().catch(() => null);
      if (!res.ok) return invalido(data?.error);
    } catch { return invalido("Não foi possível falar com o servidor. Tente novamente."); }

    aplicarMarca(data);
    const primeiro = data.nome.trim().split(/\s+/)[0];
    if (data.tipo === "convite"){
      document.title = `Ativar acesso · ${data.nomePainel}`;
      $("conviteTitulo").textContent = `Olá, ${primeiro}!`;
      $("conviteTexto").textContent = `Você foi convidado(a) para o ${data.nomePainel}. Crie sua senha para entrar.`;
    } else {
      document.title = `Nova senha · ${data.nomePainel}`;
      $("conviteTitulo").textContent = "Criar nova senha";
      $("conviteTexto").textContent = `${primeiro}, defina abaixo sua nova senha de acesso.`;
      form.querySelector(".auth-submit").textContent = "Salvar nova senha";
    }
    $("cvEmail").value = data.email;
    $("conviteLoading").hidden = true;
    form.hidden = false;
    $("cvSenha").focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = form.querySelector(".form-error");
    const btn = form.querySelector(".auth-submit");
    const senha = $("cvSenha").value;
    errorEl.hidden = true;
    try {
      if (senha.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres");
      if (senha !== $("cvSenha2").value) throw new Error("As senhas não conferem");
      btn.disabled = true;
      const res = await fetch("/api/auth/convite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, senha }),
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      history.replaceState(null, "", location.pathname); // tira o token da barra de endereço
      location.replace("/");
    } catch(err){
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      btn.disabled = false;
    }
  });

  carregar();
})();
