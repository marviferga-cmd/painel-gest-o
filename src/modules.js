/* =========================================================
   DEFINIÇÃO DOS MÓDULOS
   Fonte única: o servidor usa para validar/gravar no banco e
   o frontend recebe a parte "pública" via GET /api/meta.

   Tipos de coluna:
     text | number | money | date | datetime | month | hours
     status (select com options) | bool (Ativo/Inativo) | ref (FK)
   Flags:
     required      obrigatório no formulário
     compute(rec)  calculado no servidor (não aparece no formulário)
     table:false   só aparece no formulário, não na tabela
     field         nome do campo no Prisma, se diferente de key
     relation      (ref) relação do Prisma usada para mostrar o nome
     ref           (ref) nome da lista em GET /api/lookups/:ref
   ========================================================= */
import {
  daysBetween, formatHours, slaStatus, tempoRestante,
  todayDate, toDateString, ValidationError,
} from "./lib/format.js";

const nomeSel = { select: { nome: true } };

export const GROUPS = [
  { key: "pessoas", label: "Gestão de Pessoas" },
  { key: "os", label: "Gestão de Ordens de Serviço" },
  { key: "sla", label: "Monitoramento de SLA" },
  { key: "geral", label: "Geral" },
];

export const OS_FINALIZADAS = ["Concluída", "Cancelada"];

export const MODULES = [
  /* ---------------------------- PESSOAS ---------------------------- */
  {
    key: "colaboradores", group: "pessoas", label: "Colaboradores", icon: "users", accent: "indigo",
    desc: "Cadastro único de pessoas usado em férias, OS, chamados e equipamentos.",
    type: "table", model: "colaborador",
    include: { cargo: { select: { nome: true, nivel: true } } },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    columns: [
      { key: "nome", label: "Nome", type: "text", required: true },
      { key: "email", label: "E-mail", type: "text", table: false },
      { key: "cargoId", label: "Cargo", type: "ref", ref: "cargos",
        label_of: (r) => (r.cargo ? `${r.cargo.nome} — ${r.cargo.nivel}` : null) },
      { key: "funcao", label: "Função", type: "text" },
      { key: "disponibilidade", label: "Disponibilidade", type: "status",
        options: ["Disponível", "Ocupado", "Férias", "Afastado"] },
      { key: "ativo", label: "Situação", type: "bool" },
    ],
  },
  {
    key: "ferias", group: "pessoas", label: "Férias", icon: "palm", accent: "rose",
    desc: "Levantamento de férias por colaborador, período e distribuição de dias no ano.",
    type: "table", model: "ferias",
    include: { colaborador: { select: { nome: true, cargo: nomeSel } } },
    orderBy: { inicio: "desc" },
    columns: [
      { key: "colaboradorId", label: "Colaborador", type: "ref", ref: "colaboradores", relation: "colaborador", required: true },
      { key: "cargo", label: "Cargo", type: "text", compute: (r) => r.colaborador?.cargo?.nome ?? "—" },
      { key: "inicio", label: "Início", type: "date", required: true },
      { key: "fim", label: "Fim", type: "date", required: true },
      { key: "dias", label: "Dias", type: "number", compute: (r) => daysBetween(r.inicio, r.fim) },
      { key: "status", label: "Status", type: "status",
        options: ["Pendente", "Aprovada", "Em andamento", "Concluída", "Cancelada"] },
    ],
    validate(d) {
      if (d.inicio && d.fim && d.fim < d.inicio) throw new ValidationError("Fim deve ser igual ou posterior ao início");
    },
  },
  {
    key: "afastamentos", group: "pessoas", label: "Afastamentos", icon: "bandage", accent: "red",
    desc: "Atestados médicos e licenças, com motivo e histórico por colaborador.",
    type: "table", model: "afastamento",
    include: { colaborador: nomeSel },
    orderBy: { inicio: "desc" },
    columns: [
      { key: "colaboradorId", label: "Colaborador", type: "ref", ref: "colaboradores", relation: "colaborador", required: true },
      { key: "tipo", label: "Tipo", type: "status",
        options: ["Atestado médico", "Licença maternidade", "Licença paternidade", "Licença não remunerada", "Outro"], required: true },
      { key: "inicio", label: "Início", type: "date", required: true },
      { key: "fim", label: "Fim previsto", type: "date" },
      { key: "status", label: "Situação", type: "status", options: ["Em andamento", "Encerrado"] },
    ],
    validate(d) {
      if (d.inicio && d.fim && d.fim < d.inicio) throw new ValidationError("Fim deve ser igual ou posterior ao início");
    },
  },
  {
    key: "banco-horas", group: "pessoas", label: "Banco de Horas", icon: "clock", accent: "blue",
    desc: "Acompanhamento do saldo de horas por colaborador, mês a mês.",
    type: "table", model: "bancoHoras",
    include: { colaborador: nomeSel },
    orderBy: [{ competencia: "desc" }, { colaboradorId: "asc" }],
    columns: [
      { key: "colaboradorId", label: "Colaborador", type: "ref", ref: "colaboradores", relation: "colaborador", required: true },
      { key: "competencia", label: "Mês ref.", type: "month", required: true },
      { key: "saldoAnterior", field: "saldoAnteriorMin", label: "Saldo anterior", type: "hours" },
      { key: "movimentacao", field: "movimentacaoMin", label: "Movimentação", type: "hours" },
      { key: "saldoAtual", label: "Saldo atual", type: "text",
        compute: (r) => formatHours(r.saldoAnteriorMin + r.movimentacaoMin) },
      { key: "status", label: "Status", type: "status", compute: (r) => {
        const s = r.saldoAnteriorMin + r.movimentacaoMin;
        return s > 0 ? "Positivo" : s < 0 ? "Negativo" : "Zerado";
      } },
    ],
  },
  {
    key: "cargos-salarios", group: "pessoas", label: "Cargos e Salários", icon: "coins", accent: "green",
    desc: "Base de cargos: nível, salário-base e quantitativo de ocupação (calculado).",
    type: "table", model: "cargo",
    include: { _count: { select: { colaboradores: { where: { ativo: true } } } } },
    orderBy: [{ nome: "asc" }, { nivel: "asc" }],
    columns: [
      { key: "nome", label: "Cargo", type: "text", required: true },
      { key: "nivel", label: "Nível", type: "status",
        options: ["Júnior", "Pleno", "Sênior", "Coordenação", "Gerência"], required: true },
      { key: "salarioBase", label: "Salário base", type: "money", required: true },
      { key: "ativos", label: "Colaboradores ativos", type: "number", compute: (r) => r._count?.colaboradores ?? 0 },
      { key: "ativo", label: "Status", type: "bool" },
    ],
  },
  {
    key: "equipamentos", group: "pessoas", label: "Equipamentos", icon: "laptop", accent: "violet",
    desc: "Controle de notebooks, patrimônio e devolução de equipamentos.",
    type: "table", model: "equipamento",
    include: { responsavel: nomeSel },
    orderBy: { patrimonio: "asc" },
    columns: [
      { key: "descricao", label: "Equipamento", type: "text", required: true },
      { key: "patrimonio", label: "Nº patrimônio", type: "text", required: true },
      { key: "responsavelId", label: "Responsável", type: "ref", ref: "colaboradores", relation: "responsavel" },
      { key: "entrega", label: "Entrega", type: "date" },
      { key: "devolucao", label: "Devolução", type: "date", table: false },
      { key: "status", label: "Status", type: "status",
        options: ["Em uso", "Disponível", "Manutenção", "Devolvido", "Baixado"] },
    ],
  },
  {
    key: "contratacoes", group: "pessoas", label: "Contratações", icon: "userplus", accent: "teal",
    desc: "Acompanhamento de vagas, candidatos e etapas do processo seletivo.",
    type: "table", model: "contratacao",
    orderBy: { previsao: "asc" },
    columns: [
      { key: "candidato", label: "Candidato", type: "text", required: true },
      { key: "vaga", label: "Vaga", type: "text", required: true },
      { key: "etapa", label: "Etapa", type: "status",
        options: ["Triagem", "Entrevista", "Entrevista final", "Documentação", "Admissão"], required: true },
      { key: "previsao", label: "Previsão", type: "date" },
      { key: "status", label: "Status", type: "status", options: ["Em andamento", "Aprovado", "Reprovado", "Desistiu"] },
    ],
  },
  {
    key: "execucao-contratual", group: "pessoas", label: "Execução Contratual", icon: "trend", accent: "amber",
    desc: "Visão executiva dos contratos: escopo, vigência e status.",
    type: "table", model: "contrato",
    include: { cliente: nomeSel },
    orderBy: { vigenciaFim: "asc" },
    columns: [
      { key: "numero", label: "Contrato", type: "text", required: true },
      { key: "clienteId", label: "Cliente", type: "ref", ref: "clientes", relation: "cliente", required: true },
      { key: "escopo", label: "Escopo", type: "text", required: true },
      { key: "vigenciaFim", label: "Vigência até", type: "date", required: true },
      { key: "vence", label: "Vencimento", type: "text", compute: (r) => prazoTexto(r.vigenciaFim) },
      { key: "status", label: "Status", type: "status", options: ["Em execução", "Em renovação", "Suspenso", "Encerrado"] },
    ],
  },
  {
    key: "kanban-pessoas", group: "pessoas", label: "Kanban", icon: "kanban", accent: "indigo",
    desc: "Quadro de tarefas do time de gente & gestão — arraste entre colunas.",
    type: "kanban", board: "pessoas",
  },

  /* ------------------------ ORDENS DE SERVIÇO ------------------------ */
  {
    key: "clientes", group: "os", label: "Clientes", icon: "people", accent: "slate",
    desc: "Cadastro de clientes usado em contratos, OS, faturamento e chamados.",
    type: "table", model: "cliente",
    orderBy: { nome: "asc" },
    columns: [
      { key: "nome", label: "Cliente", type: "text", required: true },
      { key: "documento", label: "CNPJ/CPF", type: "text" },
      { key: "contato", label: "Contato", type: "text" },
    ],
  },
  {
    key: "controle-os", group: "os", label: "Controle de OS", icon: "clipboard", accent: "blue",
    desc: "Abertura, prazos e status de todas as ordens de serviço.",
    type: "table", model: "ordemServico",
    include: { cliente: nomeSel, servico: nomeSel, responsavel: nomeSel },
    orderBy: { prazo: "asc" },
    columns: [
      { key: "numero", label: "Nº OS", type: "text", required: true },
      { key: "clienteId", label: "Cliente", type: "ref", ref: "clientes", relation: "cliente", required: true },
      { key: "servicoId", label: "Serviço", type: "ref", ref: "servicos", relation: "servico" },
      { key: "responsavelId", label: "Responsável", type: "ref", ref: "colaboradores", relation: "responsavel" },
      { key: "prazo", label: "Prazo", type: "date", required: true },
      { key: "situacao", label: "Prazo (situação)", type: "text",
        compute: (r) => (OS_FINALIZADAS.includes(r.status) ? "—" : prazoTexto(r.prazo)) },
      { key: "status", label: "Status", type: "status",
        options: ["Aberta", "Em execução", "Em risco", "Concluída", "Cancelada"] },
    ],
    // concluidaEm não está no formulário: preserva a data original ao reeditar uma OS já concluída
    beforeSave(d, prisma, existing) {
      if (d.status === "Concluída") d.concluidaEm = existing?.concluidaEm ?? new Date();
      else if (d.status) d.concluidaEm = null;
    },
  },
  {
    key: "colaboradores-os", group: "os", label: "Colaboradores", icon: "users", accent: "teal",
    desc: "Carga atual de cada pessoa: OS e chamados em aberto (calculado).",
    type: "table", readOnly: true,
    columns: [
      { key: "nome", label: "Nome", type: "text" },
      { key: "funcao", label: "Função", type: "text" },
      { key: "osAtivas", label: "OS ativas", type: "number" },
      { key: "chamadosAbertos", label: "Chamados abertos", type: "number" },
      { key: "disponibilidade", label: "Disponibilidade", type: "status" },
    ],
    async list(prisma) {
      const rows = await prisma.colaborador.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        include: {
          _count: {
            select: {
              ordens: { where: { status: { notIn: OS_FINALIZADAS } } },
              chamados: { where: { concluidoEm: null } },
            },
          },
        },
      });
      return rows.map((c) => ({
        id: c.id, nome: c.nome, funcao: c.funcao ?? "—",
        osAtivas: c._count.ordens, chamadosAbertos: c._count.chamados,
        disponibilidade: c.disponibilidade,
      }));
    },
  },
  {
    key: "faturamento", group: "os", label: "Faturamento", icon: "invoice", accent: "green",
    desc: "Lançamentos a receber por cliente, com vencimento e status de pagamento.",
    type: "table", model: "fatura",
    include: { cliente: nomeSel, ordem: { select: { numero: true } } },
    orderBy: { vencimento: "desc" },
    columns: [
      { key: "ordemId", label: "OS", type: "ref", ref: "ordens", label_of: (r) => r.ordem?.numero ?? null },
      { key: "referencia", label: "Descrição", type: "text" },
      { key: "clienteId", label: "Cliente", type: "ref", ref: "clientes", relation: "cliente", required: true },
      { key: "valor", label: "Valor", type: "money", required: true },
      { key: "vencimento", label: "Vencimento", type: "date", required: true },
      { key: "status", label: "Pagamento", type: "status", options: ["Em aberto", "Pago", "Cancelado"] },
      { key: "situacao", label: "Situação", type: "status", compute: (r) => {
        if (r.status !== "Em aberto") return r.status;
        return new Date(r.vencimento) < hojeUTC() ? "Vencida" : "A vencer";
      } },
    ],
    // pagoEm não está no formulário: preserva a data original ao reeditar uma fatura já paga
    beforeSave(d, prisma, existing) {
      if (d.status === "Pago") d.pagoEm = existing?.pagoEm ?? hojeUTC();
      else if (d.status) d.pagoEm = null;
    },
  },
  {
    key: "notas-fiscais", group: "os", label: "Notas Fiscais", icon: "invoice", accent: "slate",
    desc: "Notas fiscais emitidas, valores e situação de cada uma.",
    type: "table", model: "notaFiscal",
    include: { cliente: nomeSel, fatura: { select: { id: true, valor: true, cliente: nomeSel } } },
    orderBy: { emissao: "desc" },
    columns: [
      { key: "numero", label: "Nº NF", type: "text", required: true },
      { key: "clienteId", label: "Cliente", type: "ref", ref: "clientes", relation: "cliente", required: true },
      { key: "faturaId", label: "Fatura vinculada", type: "ref", ref: "faturas", table: false,
        label_of: (r) => (r.fatura ? `#${r.fatura.id} · ${r.fatura.cliente.nome} · R$ ${Number(r.fatura.valor).toFixed(2)}` : null) },
      { key: "valor", label: "Valor", type: "money", required: true },
      { key: "emissao", label: "Emissão", type: "date", required: true },
      { key: "status", label: "Status", type: "status", options: ["Emitida", "Cancelada", "Substituída"] },
    ],
  },
  {
    key: "relatorios", group: "os", label: "Relatórios", icon: "bars", accent: "violet",
    desc: "Consolidado por cliente: ordens de serviço, faturado e em aberto.",
    type: "report",
  },
  {
    key: "indicadores", group: "os", label: "Indicadores", icon: "gauge", accent: "amber",
    desc: "Indicadores-chave da operação de ordens de serviço.",
    type: "indicators",
  },

  /* ------------------------------- SLA ------------------------------- */
  {
    key: "chamados-risco", group: "sla", label: "Chamados", icon: "alert", accent: "red",
    desc: "Chamados com prazo de SLA; risco e tempo restante são calculados automaticamente.",
    type: "table", model: "chamado",
    include: { cliente: nomeSel, responsavel: nomeSel, servico: nomeSel },
    orderBy: [{ concluidoEm: { sort: "desc", nulls: "first" } }, { prazoEm: "asc" }],
    columns: [
      { key: "codigo", label: "Chamado", type: "text", required: true },
      { key: "clienteId", label: "Cliente", type: "ref", ref: "clientes", relation: "cliente", required: true },
      { key: "servicoId", label: "Serviço", type: "ref", ref: "servicos", relation: "servico", table: false,
        hint: "Se o prazo ficar vazio, ele é calculado pelo SLA do serviço." },
      { key: "responsavelId", label: "Responsável", type: "ref", ref: "colaboradores", relation: "responsavel" },
      { key: "abertoEm", label: "Aberto em", type: "datetime", table: false },
      { key: "prazoEm", label: "Prazo", type: "datetime" },
      { key: "concluidoEm", label: "Concluído em", type: "datetime", table: false },
      { key: "tempoRestante", label: "Tempo restante", type: "text", compute: (r) => tempoRestante(r) },
      { key: "status", label: "Risco", type: "status", compute: (r) => slaStatus(r) },
    ],
    async beforeSave(d, prisma, existing) {
      if (!d.abertoEm) d.abertoEm = existing?.abertoEm ?? new Date();
      if (d.prazoEm === undefined && existing) d.prazoEm = existing.prazoEm;
      if (!d.prazoEm) {
        const servicoId = d.servicoId ?? existing?.servicoId;
        const servico = servicoId ? await prisma.servico.findUnique({ where: { id: servicoId } }) : null;
        if (!servico) throw new ValidationError("Informe o prazo ou escolha um serviço do catálogo (o prazo vem do SLA dele)");
        d.prazoEm = new Date(d.abertoEm.getTime() + servico.slaHoras * 3600e3);
      }
      if (d.prazoEm < d.abertoEm) throw new ValidationError("Prazo não pode ser anterior à abertura");
    },
  },
  {
    key: "acompanhamento-responsavel", group: "sla", label: "Acompanhamento por Responsável", icon: "usercheck", accent: "blue",
    desc: "Carga de chamados abertos e risco por responsável (calculado).",
    type: "table", readOnly: true,
    columns: [
      { key: "responsavel", label: "Responsável", type: "text" },
      { key: "ativos", label: "Chamados abertos", type: "number" },
      { key: "noPrazo", label: "No prazo", type: "number" },
      { key: "emRisco", label: "Em risco", type: "number" },
      { key: "atrasados", label: "Atrasados", type: "number" },
      { key: "status", label: "Status geral", type: "status" },
    ],
    async list(prisma) {
      const abertos = await prisma.chamado.findMany({
        where: { concluidoEm: null },
        include: { responsavel: nomeSel },
      });
      const porResp = new Map();
      for (const c of abertos) {
        const id = c.responsavelId ?? 0;
        if (!porResp.has(id)) {
          porResp.set(id, { id, responsavel: c.responsavel?.nome ?? "(sem responsável)", ativos: 0, noPrazo: 0, emRisco: 0, atrasados: 0 });
        }
        const r = porResp.get(id);
        const s = slaStatus(c);
        r.ativos++;
        if (s === "No prazo") r.noPrazo++;
        else if (s === "Atrasado") r.atrasados++;
        else r.emRisco++;
      }
      return [...porResp.values()]
        .map((r) => ({ ...r, status: r.atrasados ? "Crítico" : r.emRisco ? "Atenção" : "No prazo" }))
        .sort((a, b) => b.atrasados - a.atrasados || b.emRisco - a.emRisco || a.responsavel.localeCompare(b.responsavel));
    },
  },
  {
    key: "dashboards-sla", group: "sla", label: "Dashboards", icon: "gauge", accent: "indigo",
    desc: "Medidor geral de cumprimento de SLA e lista de atenção imediata.",
    type: "sla-dashboard",
  },
  {
    key: "catalogo-servicos", group: "sla", label: "Catálogo de Serviços", icon: "catalog", accent: "teal",
    desc: "Serviços oferecidos, SLA padrão (em horas) e preço de cada um.",
    type: "table", model: "servico",
    orderBy: { nome: "asc" },
    columns: [
      { key: "nome", label: "Serviço", type: "text", required: true },
      { key: "categoria", label: "Categoria", type: "text", required: true },
      { key: "slaHoras", label: "SLA padrão (h)", type: "number", required: true },
      { key: "preco", label: "Preço", type: "money", required: true },
      { key: "ativo", label: "Status", type: "bool" },
    ],
    validate(d) {
      if (d.slaHoras !== undefined && d.slaHoras !== null && d.slaHoras <= 0) throw new ValidationError("SLA deve ser maior que zero");
    },
  },

  /* ------------------------------ GERAL ------------------------------ */
  {
    key: "eventos-semana", group: "geral", label: "Eventos da Semana", icon: "calendar", accent: "amber",
    desc: "Agenda semanal com os compromissos dos três módulos.",
    type: "week",
  },
];

/* ---------- helpers ---------- */
const hojeUTC = todayDate;

function prazoTexto(date) {
  if (!date) return "—";
  const dias = Math.round((new Date(toDateString(date)) - hojeUTC()) / 86400e3);
  if (dias < 0) return `Vencido há ${-dias}d`;
  if (dias === 0) return "Vence hoje";
  return `Em ${dias}d`;
}

export const findModule = (key) => MODULES.find((m) => m.key === key);

/* Versão serializável enviada ao navegador (sem funções nem detalhes do Prisma). */
export function publicMeta() {
  return {
    groups: GROUPS.map((g) => ({
      ...g,
      items: MODULES.filter((m) => m.group === g.key).map((m) => ({
        key: m.key, label: m.label, icon: m.icon, accent: m.accent, desc: m.desc,
        type: m.type, readOnly: !!m.readOnly,
        columns: m.columns?.map((c) => ({
          key: c.key, label: c.label, type: c.type,
          required: !!c.required, options: c.options, ref: c.ref, hint: c.hint,
          computed: !!c.compute || !!m.readOnly, table: c.table !== false,
        })),
      })),
    })),
  };
}
