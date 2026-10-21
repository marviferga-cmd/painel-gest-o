/* Aplica o tema e a cor de destaque salvos antes de pintar a página (evita "piscar").
   Arquivo externo porque a CSP do servidor bloqueia <script> inline. */
(function(){
  var t = null, a = null;
  try { t = localStorage.getItem("theme"); a = localStorage.getItem("accent"); } catch(e){}
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  if (a) document.documentElement.setAttribute("data-accent", a);
})();
