-- CreateTable
CREATE TABLE "limite_tentativas" (
    "chave" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "limite_tentativas_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "usuario_nome" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "registro_id" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "limite_tentativas_ate_idx" ON "limite_tentativas"("ate");

-- CreateIndex
CREATE INDEX "auditoria_modulo_registro_id_idx" ON "auditoria"("modulo", "registro_id");

-- CreateIndex
CREATE INDEX "auditoria_created_at_idx" ON "auditoria"("created_at");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
