/* Aplica o tema salvo antes de pintar a página (evita "piscar").
   Arquivo externo porque a CSP do servidor bloqueia <script> inline. */
(function(){
  var t = null;
  try { t = localStorage.getItem("theme"); } catch(e){}
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
})();
