-- Campos da planilha de equipe: matrícula, login de rede, setor (lotação), contato e dados pessoais.

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "celular" TEXT,
ADD COLUMN     "formacao" TEXT,
ADD COLUMN     "home_office" TEXT,
ADD COLUMN     "login" TEXT,
ADD COLUMN     "matricula" TEXT,
ADD COLUMN     "nascimento" DATE,
ADD COLUMN     "ramal" TEXT,
ADD COLUMN     "setor" TEXT,
ADD COLUMN     "situacao_vaga" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "colaboradores_matricula_key" ON "colaboradores"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "colaboradores_login_key" ON "colaboradores"("login");

