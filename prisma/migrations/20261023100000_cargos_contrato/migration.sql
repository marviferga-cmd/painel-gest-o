-- Cargos do contrato: serviço, CBO e equipe mínima.

-- AlterTable
ALTER TABLE "cargos" ADD COLUMN     "cbo" TEXT,
ADD COLUMN     "equipe_minima" INTEGER,
ADD COLUMN     "servico" TEXT;

