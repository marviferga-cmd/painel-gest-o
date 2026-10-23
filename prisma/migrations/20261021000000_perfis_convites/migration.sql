-- Perfis de acesso, níveis por tela (ver/editar), convites, configurações e histórico.

-- AlterTable (colunas novas primeiro; "permissoes" sai depois de convertida)
ALTER TABLE "usuarios" ADD COLUMN     "acessos" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "colaborador_id" INTEGER,
ADD COLUMN     "convite_expira" TIMESTAMP(3),
ADD COLUMN     "convite_hash" TEXT,
ADD COLUMN     "perfil_id" INTEGER;

-- CreateTable
CREATE TABLE "perfis" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "acessos" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "acao" TEXT NOT NULL,
    "tela" TEXT,
    "descricao" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perfis_nome_key" ON "perfis"("nome");

-- CreateIndex
CREATE INDEX "atividades_created_at_idx" ON "atividades"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_colaborador_id_key" ON "usuarios"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_convite_hash_key" ON "usuarios"("convite_hash");

-- CreateIndex
CREATE INDEX "usuarios_perfil_id_idx" ON "usuarios"("perfil_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Conversão do modelo antigo: quem já usava o painel continua vendo/editando
-- exatamente o que podia antes (telas não restritas + restritas liberadas).
-- Telas calculadas só aceitam "ver".
UPDATE "usuarios" u SET "acessos" = COALESCE((
  SELECT jsonb_object_agg(k, CASE WHEN k IN ('colaboradores-os', 'relatorios', 'indicadores', 'acompanhamento-responsavel', 'dashboards-sla') THEN 'ver' ELSE 'editar' END)
  FROM unnest(ARRAY[
    'colaboradores', 'ferias', 'afastamentos', 'banco-horas', 'cargos-salarios', 'equipamentos',
    'contratacoes', 'execucao-contratual', 'kanban-pessoas', 'clientes', 'controle-os', 'colaboradores-os',
    'faturamento', 'notas-fiscais', 'relatorios', 'indicadores', 'chamados-risco',
    'acompanhamento-responsavel', 'dashboards-sla', 'catalogo-servicos', 'eventos-semana'
  ]) AS k
  WHERE k NOT IN (SELECT "chave" FROM "telas_restritas") OR k = ANY(u."permissoes")
), '{}'::jsonb)
WHERE u."papel" <> 'admin';

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "permissoes";

-- DropTable
DROP TABLE "telas_restritas";

-- Perfis prontos para começar (editáveis em Administração > Perfis de acesso)
INSERT INTO "perfis" ("nome", "descricao", "acessos", "updated_at") VALUES
('Gestão de Pessoas (RH)', 'Cadastros de pessoas, férias, afastamentos, banco de horas, cargos e contratações.',
 '{"colaboradores":"editar","ferias":"editar","afastamentos":"editar","banco-horas":"editar","cargos-salarios":"editar","equipamentos":"editar","contratacoes":"editar","kanban-pessoas":"editar","execucao-contratual":"ver","eventos-semana":"editar"}', CURRENT_TIMESTAMP),
('Operação e Atendimento', 'Ordens de serviço, chamados e catálogo; consulta indicadores e carga da equipe.',
 '{"clientes":"editar","controle-os":"editar","chamados-risco":"editar","catalogo-servicos":"editar","eventos-semana":"editar","colaboradores":"ver","colaboradores-os":"ver","indicadores":"ver","acompanhamento-responsavel":"ver","dashboards-sla":"ver","execucao-contratual":"ver"}', CURRENT_TIMESTAMP),
('Financeiro', 'Faturamento, notas fiscais e contratos; consulta OS, relatórios e salários.',
 '{"faturamento":"editar","notas-fiscais":"editar","clientes":"editar","execucao-contratual":"editar","controle-os":"ver","relatorios":"ver","indicadores":"ver","cargos-salarios":"ver","eventos-semana":"ver"}', CURRENT_TIMESTAMP),
('Consulta (somente leitura)', 'Vê todas as telas operacionais sem poder alterar nada. Sem acesso a salários e financeiro.',
 '{"colaboradores":"ver","ferias":"ver","afastamentos":"ver","banco-horas":"ver","equipamentos":"ver","contratacoes":"ver","execucao-contratual":"ver","kanban-pessoas":"ver","clientes":"ver","controle-os":"ver","colaboradores-os":"ver","relatorios":"ver","indicadores":"ver","chamados-risco":"ver","acompanhamento-responsavel":"ver","dashboards-sla":"ver","catalogo-servicos":"ver","eventos-semana":"ver"}', CURRENT_TIMESTAMP);
