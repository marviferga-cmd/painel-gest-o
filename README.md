# Painel de Gestão v3

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
| URL do Apps Script aberta para "Qualquer pessoa" | **Login com cadastro e aprovação**, permissões por tela |
| Status livre (qualquer texto) | Listas de status por módulo, validadas no servidor |

## Estrutura

```
painel-gestao/
├── prisma/
│   ├── schema.prisma               → modelo de dados (20 tabelas)
│   ├── migrations/                 → SQL versionado (aplicado com migrate deploy)
│   └── seed.js                     → dados de exemplo
├── src/
│   ├── server.js                   → Express, segurança, login, arquivos estáticos
│   ├── routes.js                   → rotas /api
│   ├── auth.js                     → login, cadastro, convites, sessões, nível de acesso por tela
│   ├── admin.js                    → /api/admin: usuários, convites, perfis, configurações, histórico
│   ├── config.js                   → configurações do painel + registro de atividades
│   ├── modules.js                  → definição dos módulos (colunas, validações, cálculos)
│   ├── crud.js                     → CRUD genérico + listas para os selects
│   ├── db.js                       → Prisma Client (driver pg, sem binário nativo)
│   └── lib/format.js               → datas, horas, dinheiro, regras de SLA
├── public/                         → frontend (index.html, login.html, convite.html, css, js)
├── Dockerfile · docker-compose.yml · railway.json · render.yaml
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

Na primeira vez, abra o painel e use **Criar conta**: em desenvolvimento, o primeiro cadastro de um banco vazio já vira administrador. (Ou defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env`.)

Sem Postgres instalado? Suba tudo com Docker:

```bash
docker compose up -d --build
docker compose exec app npm run db:seed   # opcional
```

## Deploy

### Opção 1 — Railway (recomendado)

O `railway.json` já configura tudo: build pelo `Dockerfile`, migrações automáticas na inicialização (`npm run start:prod`) e health check em `/healthz`.

1. No [Railway](https://railway.com): **New Project → Deploy from GitHub repo** e escolha este repositório.
2. No mesmo projeto: **+ Create → Database → PostgreSQL**.
3. No serviço do painel, aba **Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência ao banco do projeto) |
   | `NODE_ENV` | `production` |
   | `APP_TZ` | `America/Sao_Paulo` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | conta do primeiro administrador (senha com 8+ caracteres) |
   | `ALLOW_DEMO_RESET` | `false` |

4. Aba **Settings → Networking → Generate Domain** para ter a URL pública (HTTPS).
5. Dados de exemplo (opcional): `railway run npm run db:seed` com a CLI ligada ao projeto.

Pela CLI (`npm i -g @railway/cli`), o equivalente é `railway init`, `railway add --database postgres`, `railway variables --set ...` e `railway up`.

### Opção 2 — Render

1. No Render: **New → Blueprint** e escolha o repositório. O `render.yaml` cria o banco PostgreSQL e o serviço web.
2. Informe `ADMIN_EMAIL` e `ADMIN_PASSWORD` quando o Render pedir.
3. Para dados de exemplo, abra o **Shell** do serviço e rode `npm run db:seed`.

### Opção 3 — Docker em qualquer servidor/VM

```bash
docker build -t painel-gestao .
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://usuario:senha@host:5432/painel" \
  -e ADMIN_EMAIL=voce@empresa.com -e ADMIN_PASSWORD=troque-esta-senha \
  painel-gestao
```

O contêiner aplica as migrações ao iniciar e expõe `/healthz` para o health check.

## Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL (obrigatória) |
| `PORT` | Porta HTTP (padrão 3000; as plataformas definem sozinhas) |
| `APP_TZ` | Fuso para "hoje" em vencimentos e prazos (padrão `America/Sao_Paulo`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NOME` | Conta do administrador inicial, criada se não existir. **Obrigatório em produção.** A senha só vale na criação. |
| `ALLOW_DEMO_RESET` | `true` mostra o botão "Restaurar dados de exemplo" (apaga o banco). Use `false` em produção. |

Nome do painel, cor, cadastro público, perfil padrão e validade dos convites ficam no banco e são alterados pela tela *Administração → Configurações*.

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
| POST | `/api/auth/login` · `/cadastro` · `/logout` · `/senha` | Sessão e conta do usuário |
| GET | `/api/auth/config` | Nome, cor e se o cadastro público está aberto (usado no login) |
| GET / POST | `/api/auth/convite[/:token]` | Valida o link e define a senha (convite ou redefinição) |
| GET / POST / PATCH / DELETE | `/api/admin/usuarios[/:id]` · POST `/convite` · POST `/:id/link` | Usuários e convites (só admin) |
| GET / POST / PUT / DELETE | `/api/admin/perfis[/:id]` | Perfis de acesso (só admin) |
| GET / PUT | `/api/admin/config` | Configurações do painel (só admin) |
| GET | `/api/admin/atividades?tela=&antes=` | Histórico de alterações (só admin) |
| GET | `/healthz` | Verifica servidor e banco |

## Acesso de colaboradores

**Convite (recomendado).** Em *Administração → Usuários e convites → Convidar colaborador*, escolha o colaborador já cadastrado (nome e e-mail vêm sozinhos) ou digite os dados, defina o acesso e clique em *Criar convite*. O painel gera um link para a pessoa criar a própria senha, com botões para copiar, enviar por e-mail ou WhatsApp. O link vale por alguns dias (configurável), serve uma única vez e não fica salvo: se perder, gere outro.

**Cadastro público.** Opcional (liga/desliga em *Configurações*). A pessoa cria a conta na tela de login e espera a aprovação; ao aprovar, o admin escolhe o acesso, ou o *perfil padrão* é aplicado.

**O que cada pessoa pode fazer.** Cada tela tem um nível por usuário:

| Nível | Efeito |
|---|---|
| Nenhum | A tela não aparece no menu e a API recusa o acesso |
| Ver | Abre a tela, filtra e exporta CSV, mas não cria, altera, exclui nem move cards |
| Editar | Acesso completo à tela |

Telas calculadas (relatórios, indicadores, dashboards) só aceitam *Ver*. Administradores editam tudo e são os únicos que veem a Administração.

**Perfis de acesso.** Modelos reutilizáveis (vêm prontos: *Gestão de Pessoas (RH)*, *Operação e Atendimento*, *Financeiro* e *Consulta*). Quem usa um perfil acompanha as mudanças nele na hora; mexer na matriz de uma pessoa transforma o acesso dela em *personalizado*. Excluir um perfil não tira acesso de ninguém: as pessoas ficam com uma cópia das mesmas permissões.

**Outros recursos.** Bloquear (desconecta na hora), gerar link de nova senha, promover administrador (o sistema nunca fica sem um admin ativo), histórico de quem criou/alterou/excluiu cada registro e configurações de nome, subtítulo e cor de destaque do painel.

**Segurança.** Senhas com scrypt; sessão em cookie `HttpOnly` de 7 dias; no banco ficam só os hashes SHA-256 dos tokens de sessão e de convite; limite de tentativas por IP; trocar a senha desconecta os outros dispositivos.

## Regras de SLA

Chamados abertos são classificados pelo tempo até o prazo: **Atrasado** (venceu), **Crítico** (< 4 h), **Atenção** (< 24 h) e **No prazo**. Ao concluir, o chamado vira "Concluído no prazo" ou "Concluído com atraso". Os limites ficam em `src/lib/format.js` (`SLA_LIMITES`).

## Importando colaboradores de planilha

No Excel, salve a planilha como **CSV UTF-8** e rode:

```bash
npm run db:importar -- equipe.csv --dominio stf.jus.br --simular   # confere sem gravar
npm run db:importar -- equipe.csv --dominio stf.jus.br             # grava
```

Cabeçalhos reconhecidos (com ou sem acento): Nome / Nome completo, Matrícula, Login, E-mail, Setor / Lotação, Função, Ramal, Celular / Tel. Celular, Nascimento / Dt. Nascimento, Formação / Curso, Home Office, Situação da vaga. Quem já existe (mesma matrícula, login ou e-mail) é atualizado; os demais são criados. `--dominio` monta o e-mail como `login@dominio` quando a planilha não tem e-mail. Para gravar no banco do Railway, use a `DATABASE_PUBLIC_URL` do serviço Postgres como `DATABASE_URL`.

## Migrando os dados da planilha da v1

Os cadastros mudaram de formato (ex.: o nome do colaborador agora é uma referência ao cadastro). O caminho mais seguro é cadastrar primeiro **Colaboradores, Cargos, Clientes e Serviços** pelo painel e depois lançar os demais registros; para volumes grandes, exporte as abas em CSV e importe com `psql \copy` após converter os nomes em ids.
