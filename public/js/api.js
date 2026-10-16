/* Cliente HTTP da API do painel (mesma origem: /api). */
const API = {
  async request(method, path, body){
    const res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    if (res.status === 401){ location.replace("/login.html"); throw new Error("Sessão expirada"); }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* resposta sem JSON */ }
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  },
  get(path){ return this.request("GET", path); },
  post(path, body){ return this.request("POST", path, body ?? {}); },
  put(path, body){ return this.request("PUT", path, body ?? {}); },
  patch(path, body){ return this.request("PATCH", path, body ?? {}); },
  del(path){ return this.request("DELETE", path); },

  /* listas para <select> de chaves estrangeiras, com cache curto */
  _lookupCache: new Map(),
  async lookup(name){
    const hit = this._lookupCache.get(name);
    if (hit && Date.now() - hit.at < 15000) return hit.data;
    const data = await this.get(`/lookups/${encodeURIComponent(name)}`);
    this._lookupCache.set(name, { at: Date.now(), data });
    return data;
  },
  clearLookups(){ this._lookupCache.clear(); },
};
