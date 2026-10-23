/* Helpers de rota compartilhados (routes.js, auth.js, crud.js). */
import { ValidationError } from "./format.js";

/* Erro com status HTTP; o tratador de erros de routes.js devolve a mensagem. */
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("id inválido");
  return id;
}
