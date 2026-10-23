/* =========================================================
   DADOS DE EXEMPLO
   - `npm run db:seed` (ou `npx prisma db seed`) popula um banco vazio.
   - O botão "Restaurar dados de exemplo" chama a mesma função
     (só fica ativo com ALLOW_DEMO_RESET=true).
   Prazos de chamados e eventos são relativos a "agora", para o
   painel sempre mostrar uma situação realista.
   ========================================================= */
import { pathToFileURL } from "node:url";

const H = 3600e3;
const d = (s) => new Date(`${s}T00:00:00.000Z`);

function mondayOfThisWeek() {
  const now = new Date();
  const m = new Date(now);
  const day = m.getDay();
  m.setDate(m.getDate() + ((day === 0 ? -6 : 1) - day));
  m.setHours(0, 0, 0, 0);
  return m;
}
function at(dayOffset, hhmm) {
  const [h, min] = hhmm.split(":").map(Number);
  const x = mondayOfThisWeek();
  x.setDate(x.getDate() + dayOffset);
  x.setHours(h, min, 0, 0);
  return x;
}

export async function seed(prisma) {
  const now = Date.now();

  await prisma.$transaction(async (tx) => {
    // limpa na ordem das dependências
    await tx.notaFiscal.deleteMany();
    await tx.fatura.deleteMany();
    await tx.chamado.deleteMany();
    await tx.ordemServico.deleteMany();
    await tx.contrato.deleteMany();
    await tx.ferias.deleteMany();
    await tx.afastamento.deleteMany();
    await tx.bancoHoras.deleteMany();
    await tx.equipamento.deleteMany();
    await tx.contratacao.deleteMany();
    await tx.kanbanCard.deleteMany();
    await tx.kanbanColuna.deleteMany();
    await tx.evento.deleteMany();
    await tx.auditoria.deleteMany(); // o histórico apontaria para registros que não existem mais
    await tx.colaborador.deleteMany();
    await tx.cargo.deleteMany();
    await tx.servico.deleteMany();
    await tx.cliente.deleteMany();

    // ---- cadastros
    const cargo = {};
    for (const c of [
      { nome: "Técnico de Campo", nivel: "Pleno", salarioBase: "3200.00" },
      { nome: "Técnico de Campo", nivel: "Júnior", salarioBase: "2500.00" },
      { nome: "Analista Financeiro", nivel: "Sênior", salarioBase: "5800.00" },
      { nome: "Coordenador de RH", nivel: "Coordenação", salarioBase: "7400.00" },
      { nome: "Assistente Administrativo", nivel: "Júnior", salarioBase: "2300.00" },
    ]) cargo[`${c.nome}|${c.nivel}`] = await tx.cargo.create({ data: c });

    const col = {};
    for (const c of [
      { nome: "Marina Alves", cargo: "Analista Financeiro|Sênior", funcao: "Financeiro", disponibilidade: "Disponível" },
      { nome: "Diego Ramos", cargo: "Técnico de Campo|Pleno", funcao: "Técnico de Campo", disponibilidade: "Ocupado" },
      { nome: "Paula Nogueira", cargo: "Coordenador de RH|Coordenação", funcao: "RH", disponibilidade: "Disponível" },
      { nome: "Rafael Sousa", cargo: "Técnico de Campo|Júnior", funcao: "Técnico Júnior", disponibilidade: "Disponível" },
      { nome: "Bruno Castro", cargo: "Técnico de Campo|Pleno", funcao: "Técnico de Campo", disponibilidade: "Afastado" },
      { nome: "Sônia Prado", cargo: "Assistente Administrativo|Júnior", funcao: "Administrativo", disponibilidade: "Afastado" },
    ]) {
      col[c.nome] = await tx.colaborador.create({
        data: { nome: c.nome, funcao: c.funcao, disponibilidade: c.disponibilidade, cargoId: cargo[c.cargo].id },
      });
    }

    const cli = {};
    for (const nome of ["Prefeitura Municipal", "Condomínio Atlântico", "Shopping Villa Rica", "Escola Municipal Vale Verde"]) {
      cli[nome] = await tx.cliente.create({ data: { nome } });
    }

    const srv = {};
    for (const s of [
      { nome: "Manutenção elétrica preventiva", categoria: "Manutenção", slaHoras: 24, preco: "350.00" },
      { nome: "Poda e paisagismo", categoria: "Serviços externos", slaHoras: 72, preco: "480.00" },
      { nome: "Dedetização", categoria: "Higienização", slaHoras: 48, preco: "600.00", ativo: false },
      { nome: "Atendimento emergencial", categoria: "Manutenção", slaHoras: 4, preco: "520.00" },
    ]) srv[s.nome] = await tx.servico.create({ data: s });

    // ---- pessoas
    await tx.ferias.createMany({ data: [
      { colaboradorId: col["Marina Alves"].id, inicio: d("2026-09-01"), fim: d("2026-09-30"), status: "Concluída" },
      { colaboradorId: col["Diego Ramos"].id, inicio: d("2026-08-18"), fim: d("2026-08-27"), status: "Concluída" },
      { colaboradorId: col["Paula Nogueira"].id, inicio: d("2026-10-05"), fim: d("2026-10-19"), status: "Em andamento" },
      { colaboradorId: col["Rafael Sousa"].id, inicio: d("2026-12-14"), fim: d("2026-12-28"), status: "Pendente" },
    ] });
    await tx.afastamento.createMany({ data: [
      { colaboradorId: col["Bruno Castro"].id, tipo: "Atestado médico", inicio: d("2026-10-06"), fim: d("2026-10-10"), status: "Em andamento" },
      { colaboradorId: col["Sônia Prado"].id, tipo: "Licença maternidade", inicio: d("2026-07-01"), fim: d("2026-12-27"), status: "Em andamento" },
    ] });
    await tx.bancoHoras.createMany({ data: [
      { colaboradorId: col["Diego Ramos"].id, competencia: d("2026-09-01"), saldoAnteriorMin: 200, movimentacaoMin: 105 },
      { colaboradorId: col["Marina Alves"].id, competencia: d("2026-09-01"), saldoAnteriorMin: -120, movimentacaoMin: 30 },
      { colaboradorId: col["Rafael Sousa"].id, competencia: d("2026-09-01"), saldoAnteriorMin: 0, movimentacaoMin: 0 },
    ] });
    await tx.equipamento.createMany({ data: [
      { descricao: "Notebook Dell Latitude", patrimonio: "PAT-0231", responsavelId: col["Marina Alves"].id, entrega: d("2025-03-11"), status: "Em uso" },
      { descricao: "Furadeira industrial", patrimonio: "PAT-0104", responsavelId: col["Diego Ramos"].id, entrega: d("2024-11-02"), status: "Manutenção" },
      { descricao: "Notebook Lenovo ThinkPad", patrimonio: "PAT-0245", status: "Disponível" },
    ] });
    await tx.contratacao.createMany({ data: [
      { candidato: "Lucas Medeiros", vaga: "Técnico de Campo", etapa: "Entrevista final", previsao: d("2026-10-20"), status: "Em andamento" },
      { candidato: "Camila Duarte", vaga: "Assistente Administrativo", etapa: "Documentação", previsao: d("2026-10-15"), status: "Aprovado" },
    ] });
    await tx.contrato.createMany({ data: [
      { numero: "CT-2026-014", clienteId: cli["Prefeitura Municipal"].id, escopo: "Manutenção predial", vigenciaFim: d("2027-02-28"), status: "Em execução" },
      { numero: "CT-2025-098", clienteId: cli["Condomínio Atlântico"].id, escopo: "Portaria e limpeza", vigenciaFim: d("2026-10-31"), status: "Em renovação" },
    ] });

    const colunas = [];
    for (const [i, titulo] of ["A Fazer", "Em Andamento", "Revisão", "Concluído"].entries()) {
      colunas.push(await tx.kanbanColuna.create({ data: { quadro: "pessoas", titulo, ordem: i } }));
    }
    await tx.kanbanCard.createMany({ data: [
      { colunaId: colunas[0].id, titulo: "Fechar folha de ponto de setembro", etiqueta: "RH", ordem: 0 },
      { colunaId: colunas[1].id, titulo: "Homologar contratação Camila Duarte", etiqueta: "Recrutamento", ordem: 0 },
      { colunaId: colunas[1].id, titulo: "Emitir novos crachás de acesso", etiqueta: "Facilities", ordem: 1 },
      { colunaId: colunas[2].id, titulo: "Revisar tabela salarial 2027", etiqueta: "C&B", ordem: 0 },
      { colunaId: colunas[3].id, titulo: "Entregar EPI para equipe de campo", etiqueta: "Equipamentos", ordem: 0 },
    ] });

    // ---- ordens de serviço e financeiro
    const os1 = await tx.ordemServico.create({ data: { numero: "OS-2451", clienteId: cli["Condomínio Atlântico"].id, servicoId: srv["Manutenção elétrica preventiva"].id, responsavelId: col["Diego Ramos"].id, prazo: d("2026-10-14"), status: "Em execução" } });
    await tx.ordemServico.create({ data: { numero: "OS-2452", clienteId: cli["Prefeitura Municipal"].id, servicoId: srv["Poda e paisagismo"].id, responsavelId: col["Rafael Sousa"].id, prazo: d("2026-10-07"), status: "Em risco" } });
    const os3 = await tx.ordemServico.create({ data: { numero: "OS-2438", clienteId: cli["Shopping Villa Rica"].id, servicoId: srv["Dedetização"].id, responsavelId: col["Diego Ramos"].id, prazo: d("2026-09-20"), status: "Concluída", concluidaEm: d("2026-09-19") } });
    void os1;

    const f1 = await tx.fatura.create({ data: { clienteId: cli["Shopping Villa Rica"].id, ordemId: os3.id, referencia: "Dedetização setembro", valor: "4200.00", vencimento: d("2026-10-20"), status: "Em aberto" } });
    const f2 = await tx.fatura.create({ data: { clienteId: cli["Condomínio Atlântico"].id, referencia: "Mensalidade setembro", valor: "2150.00", vencimento: d("2026-09-15"), status: "Pago", pagoEm: d("2026-09-14") } });
    await tx.fatura.create({ data: { clienteId: cli["Prefeitura Municipal"].id, referencia: "Medição agosto", valor: "8900.00", vencimento: d("2026-10-01"), status: "Em aberto" } });

    await tx.notaFiscal.createMany({ data: [
      { numero: "NF-000871", clienteId: cli["Shopping Villa Rica"].id, faturaId: f1.id, valor: "4200.00", emissao: d("2026-09-21"), status: "Emitida" },
      { numero: "NF-000864", clienteId: cli["Condomínio Atlântico"].id, faturaId: f2.id, valor: "2150.00", emissao: d("2026-09-14"), status: "Cancelada" },
    ] });

    // ---- chamados (prazos relativos a agora)
    await tx.chamado.createMany({ data: [
      { codigo: "CH-1092", clienteId: cli["Prefeitura Municipal"].id, responsavelId: col["Diego Ramos"].id, servicoId: srv["Atendimento emergencial"].id, abertoEm: new Date(now - 2 * H), prazoEm: new Date(now + 2 * H + 10 * 60e3) },
      { codigo: "CH-1095", clienteId: cli["Condomínio Atlântico"].id, responsavelId: col["Rafael Sousa"].id, servicoId: srv["Manutenção elétrica preventiva"].id, abertoEm: new Date(now - 18 * H), prazoEm: new Date(now + 5 * H + 40 * 60e3) },
      { codigo: "CH-1088", clienteId: cli["Shopping Villa Rica"].id, responsavelId: col["Diego Ramos"].id, servicoId: srv["Poda e paisagismo"].id, abertoEm: new Date(now - 45 * H), prazoEm: new Date(now + 27 * H) },
      { codigo: "CH-1081", clienteId: cli["Escola Municipal Vale Verde"].id, responsavelId: col["Rafael Sousa"].id, servicoId: srv["Atendimento emergencial"].id, abertoEm: new Date(now - 5 * H), prazoEm: new Date(now - 40 * 60e3) },
      { codigo: "CH-1075", clienteId: cli["Prefeitura Municipal"].id, responsavelId: col["Marina Alves"].id, abertoEm: new Date(now - 96 * H), prazoEm: new Date(now - 48 * H), concluidoEm: new Date(now - 50 * H) },
    ] });

    // ---- eventos da semana atual
    await tx.evento.createMany({ data: [
      { titulo: "Reunião de alinhamento RH", inicio: at(0, "09:00"), modulo: "pessoas" },
      { titulo: "Vistoria OS-2451", inicio: at(1, "14:00"), modulo: "os" },
      { titulo: "Fechamento do banco de horas", inicio: at(3, "10:30"), modulo: "pessoas" },
      { titulo: "Revisão de SLA com clientes", inicio: at(3, "16:00"), modulo: "sla" },
      { titulo: "Prazo CH-1092 (crítico)", inicio: at(4, "08:00"), modulo: "sla" },
    ] });
  }, { timeout: 30000 });
}

/* Execução direta: node prisma/seed.js */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { prisma } = await import("../src/db.js");
  try {
    await seed(prisma);
    console.log("✔ Dados de exemplo gravados.");
  } finally {
    await prisma.$disconnect();
  }
}
