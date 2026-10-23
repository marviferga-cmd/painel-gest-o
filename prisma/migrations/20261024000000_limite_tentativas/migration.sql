-- CreateTable
CREATE TABLE "limite_tentativas" (
    "chave" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "limite_tentativas_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "limite_tentativas_ate_idx" ON "limite_tentativas"("ate");
