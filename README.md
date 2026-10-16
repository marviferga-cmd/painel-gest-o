# Painel de Gestão v2

Painel único de **Gestão de Pessoas**, **Ordens de Serviço** e **Monitoramento de SLA**, agora com backend próprio e banco relacional:

- **Node.js 22 + Express 5** — API REST e servidor dos arquivos do painel
- **Prisma 6 + PostgreSQL** — esquema relacional com migrações versionadas
- **Frontend em HTML/CSS/JS puro** (mesmo visual da v1), servido pela própria API

## O que mudou em relação à v1

| v1 (Google Sheets / localStorage) | v2 (Prisma + PostgreSQL) |
|---|---|
| Cada gravação **apagava a aba inteira e regravava** tudo — duas pessoas editando ao mesmo tempo perdiam dados | Cada registro é criado/alterado/excluído **individualmente, pelo id** |
| Nomes de pessoas e clientes digitados em cada tabela (erros de digitação, duplicidade) | **Cadastros únicos** de Colaboradores, Clientes, Cargos e Serviços, ligados por chave estrangeira |
| Datas, valores e horas como texto (`"R$ 4.200,00"`, `"+3h20"`) | Datas reais, `DECIMAL(12,2)` para dinheiro e minutos inteiros para o banco de horas |
| "Tempo restante" e "risco" do chamado digitados à mão (ficavam desatualizados) | **Calculados a partir do prazo**; o prazo pode vir do SLA do serviço |
| "Ativos", "OS ativas", "Acompanhamento por responsável" digitados | **Calculados** a partir dos dados (sem duplicação) |
| Eventos presos a "segunda/terça…" (repetiam toda semana) | Eventos com **data e hora reais**; navegar entre semanas mostra eventos diferentes |
| Texto do banco inserido direto no HTML (risco de XSS) | Todo conteúdo é escapado; CSP com Helmet |
| URL do Apps Script aberta para "Qualquer pessoa" | Login opcional (HTTP Basic) via variáveis de ambiente |
| Status livre (qualquer texto) | Listas de status por módulo, validadas no servidor |

## Estrutura

```
painel-gestao/
├── prisma/
│   ├── schema.prisma               → modelo de dados (17 tabelas)
│   ├── migrations/                 → SQL versionado (aplicado com migrate deploy)
│   └── seed.js                     → dados de exemplo
├── src/
│   ├── server.js                   → Express, segurança, login, arquivos estáticos
│   ├── routes.js                   → rotas /api
│   ├── modules.js                  → definição dos módulos (colunas, validações, cálculos)
│   ├── crud.js                     → CRUD genérico + listas para os selects
│   ├── db.js                       → Prisma Client (driver pg, sem binário nativo)
│   └── lib/format.js               → datas, horas, dinheiro, regras de SLA
├── public/                         → frontend (index.html, css, js)
├── Dockerfile · docker-compose.yml · render.yaml
└── .env.example
```

Para **adicionar uma coluna** a um módulo: inclua o campo no `schema.prisma`, rode `npm run db:migrate -- --name nome-da-mudanca` e acrescente a coluna em `src/modules.js`. Tabela, filtros e formulário se ajustam sozinhos.

## Rodando localmente

Pré-requisitos: Node 22+ e um PostgreSQL (local ou Docker).

```bash
cp .env.example .env            # ajuste DATABASE_URL
npm install
npm run db:deploy               # cria as tabelas
npm run db:seed                 # opcional: dados de exemplo
npm run dev                     # http://localhost:3000
```

Sem Postgres instalado? Suba tudo com Docker:

```bash
docker compose up -d --build
docker compose exec app npm run db:seed   # opcional
```

## Deploy

### Opção 1 — Render (mais simples, tem plano gratuito)

1. Suba esta pasta para um repositório no GitHub.
2. No Render: **New → Blueprint** e escolha o repositório. O `render.yaml` cria o banco PostgreSQL e o serviço web.
3. Informe `APP_USER` e `APP_PASSWORD` quando o Render pedir (é o login do painel).
4. Ao final do deploy, as migrações já terão rodado (`npm run start:prod`). Para dados de exemplo, abra o **Shell** do serviço e rode `npm run db:seed`.

### Opção 2 — Docker em qualquer servidor/VM

```bash
docker build -t painel-gestao .
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://usuario:senha@host:5432/painel" \
  -e APP_USER=admin -e APP_PASSWORD=troque-esta-senha \
  painel-gestao
```

O contêiner aplica as migrações ao iniciar e expõe `/healthz` para o health check.

### Opção 3 — Railway, Fly.io, Koyeb etc.

Qualquer plataforma Node funciona: build `npm ci`, start `npm run start:prod`, variável `DATABASE_URL` apontando para um PostgreSQL (Neon e Supabase têm planos gratuitos; use a URL com `sslmode=require`).

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL (obrigatória) |
| `PORT` | Porta HTTP (padrão 3000; as plataformas definem sozinhas) |
| `APP_TZ` | Fuso para "hoje" em vencimentos e prazos (padrão `America/Sao_Paulo`) |
| `APP_USER` / `APP_PASSWORD` | Ativam o login do painel. **Defina em produção.** |
| `ALLOW_DEMO_RESET` | `true` mostra o botão "Restaurar dados de exemplo" (apaga o banco). Use `false` em produção. |

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/meta` | Módulos, colunas e opções (o frontend monta as telas a partir disso) |
| GET | `/api/modules/:modulo` | Lista registros (já com campos calculados) |
| POST / PUT / DELETE | `/api/modules/:modulo[/:id]` | Cria, altera ou exclui um registro |
| GET | `/api/lookups/:lista` | Opções dos selects (`colaboradores`, `clientes`, `servicos`, `cargos`, `ordens`, `faturas`) |
| GET / POST / PATCH / DELETE | `/api/kanban/...` | Quadro Kanban |
| GET / POST / DELETE | `/api/eventos` | Agenda (`?de=ISO&ate=ISO`) |
| GET | `/api/resumo/os` · `/clientes` · `/sla` · `/alertas` | Indicadores calculados |
| GET | `/healthz` | Verifica servidor e banco |

## Regras de SLA

Chamados abertos são classificados pelo tempo até o prazo: **Atrasado** (venceu), **Crítico** (< 4 h), **Atenção** (< 24 h) e **No prazo**. Ao concluir, o chamado vira "Concluído no prazo" ou "Concluído com atraso". Os limites ficam em `src/lib/format.js` (`SLA_LIMITES`).

## Migrando os dados da planilha da v1

Os cadastros mudaram de formato (ex.: o nome do colaborador agora é uma referência ao cadastro). O caminho mais seguro é cadastrar primeiro **Colaboradores, Cargos, Clientes e Serviços** pelo painel e depois lançar os demais registros; para volumes grandes, exporte as abas em CSV e importe com `psql \copy` após converter os nomes em ids.
