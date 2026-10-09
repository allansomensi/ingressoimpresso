# Arquitetura proposta: Ingresso Impresso

> **Status: aprovada em 2026-10-08**, com as decisões do mantenedor: Next.js na Vercel com pnpm,
> API no Render, Postgres no Neon, e-mail pelo Resend, MVP sem cobrança, impressão em casa e em
> gráfica. Cada decisão relevante tem um ADR em [`docs/adr/`](adr/README.md) com as alternativas
> consideradas.

## 1. Resumo em uma tela

| Tema | Decisão proposta | ADR |
|---|---|---|
| Repositório | Monorepo: Cargo workspace + pnpm workspaces, `just` como ponto de entrada único (sem Turborepo) | [0001](adr/0001-monorepo.md) |
| Núcleo do ingresso | Crate Rust puro `ticket-core` (sem IO), compilado para WASM e usado pelo servidor e pela portaria | [0002](adr/0002-nucleo-rust-wasm.md) |
| Formato do QR | Binário fixo de 74 bytes → base45 (111 caracteres) → QR alfanumérico versão 5, ECC M | [0003](adr/0003-formato-qr-v1.md) |
| Assinatura | Ed25519, um par de chaves por evento (com `key_id` para rotação); o celular guarda só a chave pública | [0004](adr/0004-assinatura-ed25519.md) |
| Custódia das chaves | Chave privada gerada no servidor e cifrada com XChaCha20-Poly1305 sob uma chave mestra fora do banco | [0005](adr/0005-custodia-chaves.md) |
| Portaria offline | Decisão sempre local e instantânea; log de leituras só-de-acréscimo sincronizado; confirmação online com orçamento de tempo quando há sinal | [0006](adr/0006-portaria-offline-sync.md) |
| Acesso da portaria | Link com token no fragmento (`#`) → registro do celular como dispositivo revogável | [0007](adr/0007-acesso-portaria.md) |
| Arquivos | Typst embutido; dados do usuário entram só como dados (nunca como código Typst); arquivos determinísticos regerados sob demanda, sem armazenamento | [0008](adr/0008-geracao-arquivos-typst.md) |
| Frontend | Next.js na Vercel, sem regra de negócio; fala direto com a API em `api.` do domínio (CORS + token Bearer); deploy pré-compilado pelo GitHub Actions | [0009](adr/0009-frontend-nextjs-vercel.md), [0016](adr/0016-sessao-bearer.md) |
| Leitura de QR | `zxing-wasm` em todos os navegadores (o `BarcodeDetector` não existe no Safari do iPhone) | [0010](adr/0010-leitura-qr-navegador.md) |
| Modelo de dados | Faixas `int4range` com restrições de exclusão; sem tabela com uma linha por ingresso | [0011](adr/0011-modelo-dados-faixas.md) |
| Login do organizador | Código de 6 dígitos por e-mail (sem senha), enviado pelo Resend | [0012](adr/0012-autenticacao-organizador.md) |
| Infraestrutura | API Docker no Render (Virginia) + Neon (`aws-us-east-1`, junto da API) + Resend; imagem compilada pelo Blueprint do Render e testada no CI | [0013](adr/0013-infraestrutura-render-neon.md), [0019](adr/0019-deploy-dominio-proprio.md) |
| Pagamento | Stripe Checkout por lote (Pix ou cartão), confirmado por webhook assinado; preço progressivo por quantidade; o admin ainda pode marcar lotes como pagos | [0020](adr/0020-pagamento-stripe.md) (substitui [0014](adr/0014-pagamento-pix-adiado.md)) |
| Interface e PWA | Identidade visual própria, sistema de design com tokens claro/escuro, painel instalável como app | [0021](adr/0021-interface-e-pwa.md) |

O que muda em relação às suas hipóteses:

- **Confirmadas:** monorepo, núcleo Rust → WASM, Ed25519 por evento, base45, PWA offline-first e
  Typst embutido.
- **Ajustadas:**
  - **base45:** a vantagem não é compactar (ele usa 8,25 bits por byte, contra 8 do modo byte).
    É ser *seguro como texto*: os leitores de QR do navegador devolvem string, e bytes crus se
    corrompem na decodificação de texto. Entre as codificações seguras como texto, base45 no modo
    alfanumérico é a mais compacta, cerca de 23% menor que base64.
  - **Ed25519:** levei em conta uma alternativa forte (token aleatório + manifesto com hashes, que
    dá um QR bem menor) e optei pela assinatura por dois motivos ligados ao requisito "não pode
    falhar na porta", detalhados no ADR 0004.
  - **Typst:** não exporta PDF/X nem converte imagens para CMYK. A "versão para gráfica" do MVP
    sai em RGB, com sangria e marcas de corte. CMYK/PDF-X ficam para depois.
- **Contestadas:**
  - **Turborepo:** não se paga com um único app JS.
  - **`BarcodeDetector`:** não funciona no iPhone.
  - **Arquivos gerados:** não guardamos; regeramos sob demanda.
- **Decididas pelo mantenedor depois da proposta:** Vercel + pnpm (a proposta original era export
  estático servido pelo Axum), Render + Neon (a proposta era uma VPS), Resend e impressão em casa
  e em gráfica como modos de primeira classe.

## 2. Visão geral

```mermaid
flowchart LR
  V[Vercel<br/>Next.js: landing, painel, portaria] -. HTML/JS/WASM .-> P
  V -. HTML/JS/WASM .-> D
  subgraph Navegador do organizador
    P[Painel]
  end
  subgraph Celulares da portaria
    D[PWA da portaria<br/>Service Worker]
    W[ticket-core.wasm<br/>verificação + decisão]
    Z[zxing-wasm<br/>leitura do QR]
    I[(IndexedDB<br/>manifesto + log de leituras)]
    D --- W
    D --- Z
    D --- I
  end
  subgraph Render - Virginia
    S[Binário Rust<br/>Axum + worker de jobs]
    R[render<br/>Typst embutido]
    K[ticket-core<br/>assinatura]
    S --- R
    S --- K
  end
  DB[(Neon Postgres<br/>aws-us-east-1)]
  S --- DB
  P -- HTTPS + Bearer<br/>api.seudominio.com.br --> S
  D -- HTTPS + token do dispositivo<br/>quando houver sinal --> S
  S -. API HTTP .-> E[Resend]
```

Em produção há **um processo nosso** (o binário Rust no Render, que serve a API e roda o worker
de jobs), **um banco gerenciado** (Neon) e o frontend na CDN da Vercel. Os fornecedores são Vercel,
Render, Neon, Resend, Stripe e o domínio. Banco e API ficam na mesma região:
o banco precisa ficar perto da API, não do usuário (ADR 0013).

## 3. Estrutura do repositório

```
ingressoimpresso/
├── Cargo.toml                 # workspace Rust (lints compartilhados, versões fixas)
├── rust-toolchain.toml
├── package.json               # scripts raiz + packageManager (pnpm)
├── pnpm-workspace.yaml
├── justfile                   # ponto de entrada único: just check, just dev, just test...
├── crates/
│   ├── ticket-core/           # formato do QR, base45, assinatura/verificação, decisão de check-in
│   │                          # sem IO, sem async, compila para wasm32
│   ├── ticket-wasm/           # bindings wasm-bindgen do ticket-core (cdylib)
│   ├── render/                # World do Typst, modelos, QR vetorial, PDF/PNG/ZIP
│   ├── server/                # Axum + sqlx + migrações + jobs; binário `ingressoimpresso`
│   └── cli/                   # ferramenta de desenvolvimento/admin: vetores, render local, chaves
├── apps/
│   └── web/                   # Next.js (Vercel): landing, painel, portaria (PWA)
├── packages/
│   ├── ticket-core-wasm/      # wrapper TS tipado do WASM; pkg/ é gerado por `just wasm` (não versionado)
│   └── api-types/             # tipos TS gerados dos DTOs Rust (ts-rs), versionados
├── testdata/
│   └── vectors/ticket-v1.json # vetores de teste compartilhados Rust ↔ WASM/TS
├── deploy/                    # Dockerfile da API, compose de desenvolvimento (Postgres local)
└── docs/
    ├── arquitetura.md
    └── adr/
```

Regras de dependência: `ticket-core` não depende de nenhum outro crate do projeto. `render` depende
de `ticket-core`. `server` depende de ambos. O frontend só conhece o `ticket-core` pelo WASM e a
API pelos tipos gerados.

## 4. Formato e segurança do QR

### 4.1 Formato v1

Payload binário de tamanho fixo (74 bytes), inteiros em big-endian:

| Offset | Tamanho | Campo | Observação |
|---|---|---|---|
| 0 | 1 | `version` | `0x01` |
| 1 | 4 | `event_tag` | u32 aleatório, único por evento; dica para achar o evento (não é segredo) |
| 5 | 1 | `key_id` | geração da chave do evento (rotação) |
| 6 | 4 | `ticket_number` | u32, começa em 1 |
| 10 | 64 | `signature` | Ed25519 sobre a mensagem abaixo |

Mensagem assinada (separação de domínio e vínculo com o UUID completo do evento, que não vai no QR):

```
"ingressoimpresso:ticket:v1" || event_id (UUID, 16 bytes) || payload[0..10]
```

Texto do QR = `base45(payload)` (RFC 9285), 111 caracteres. No modo alfanumérico com correção M,
cabe na **versão 5 (37×37 módulos)**, cuja capacidade é 122. Com a zona de silêncio de 4 módulos,
um QR de 25 mm fica com cerca de 0,55 mm por módulo, folgado para impressão caseira e para a tela
do celular. O editor vai impor no mínimo 22 mm e fundo branco sob o QR.

Regras do decodificador (todas cobertas por testes de propriedade):

- Aceita só base45 canônico em maiúsculas. Rejeita qualquer comprimento diferente de 111 e
  `version` desconhecida.
- Verifica com `verify_strict` (sem maleabilidade). Mesmo assim, **a chave de deduplicação é
  `(evento, número)`, nunca os bytes do QR**.
- Nunca entra em pânico com entrada arbitrária. Sem `unwrap` e sem indexação direta no
  `ticket-core` (o lint `clippy::indexing_slicing` fica como erro nesse crate).
- As assinaturas Ed25519 são determinísticas (RFC 8032): o mesmo ingresso sempre gera o mesmo QR.
  Isso permite reimprimir e regerar arquivos byte a byte e ter vetores de teste estáveis.

### 4.2 Modelo de ameaças

| Ameaça | Resultado |
|---|---|
| Criar um ingresso sem a chave privada | Inviável (EUF-CMA do Ed25519) |
| Extrair dados do celular da portaria | O atacante obtém a chave pública, os cancelamentos e as leituras: **não consegue falsificar**. Com o segredo do dispositivo, poderia registrar leituras falsas até o organizador revogá-lo |
| Vazamento do link da portaria | Mesmo caso anterior. Mitigado por expiração, revogação e lista de dispositivos visível no painel |
| Cópia de ingresso válido (foto, encaminhamento no WhatsApp, xerox) | A primeira leitura entra; as seguintes são bloqueadas. Limite offline na seção 5.3 |
| Ingresso de outro evento | `event_tag`/chave não batem: "ingresso de outro evento" |
| Gerar ingressos sem pagar | O servidor **só assina lotes pagos**. A prévia usa um QR de amostra inválido e marca d'água "AMOSTRA" |
| Bloco perdido ou não vendido | Cancelamento por faixa: o número é bloqueado na porta |
| Vendedor que imprime duas vezes o mesmo número | A segunda cópia é bloqueada, e o relatório atribui a tentativa à faixa daquele vendedor |
| Comprometimento do servidor | Permite falsificar. Mitigação: chaves cifradas, superfície mínima, revogação do `key_id` e reemissão. Esse limite é honesto: não há como evitá-lo sem hardware dedicado |

## 5. Portaria offline e sincronização

### 5.1 Fluxo

```mermaid
sequenceDiagram
  participant Cam as Câmera (zxing-wasm)
  participant Core as ticket-core.wasm
  participant DB as IndexedDB
  participant API as Servidor
  Cam->>Core: texto do QR
  Core->>Core: decodifica + verifica assinatura (chave pública do evento)
  Core->>DB: consulta cancelamentos + entradas conhecidas
  Core-->>Cam: decisão local (instantânea)
  alt com sinal bom (sync OK há < 10 s)
    Core->>API: POST /door/scans (confirm=true, orçamento 1,2 s)
    API-->>Core: primeira entrada / já entrou às 21:03 pela Porta 2
  end
  Core->>DB: grava a leitura no log (uuid gerado no celular)
  loop a cada 3 s com sinal
    DB->>API: envia leituras pendentes (idempotente por uuid)
    API-->>DB: leituras de outros celulares + cancelamentos (cursor)
  end
```

- **A decisão local nunca espera a rede.** Ela usa a assinatura, os cancelamentos e as entradas já
  conhecidas (as locais e as recebidas de outros celulares).
- **Confirmação online:** quando há sinal bom, a leitura é confirmada no servidor por um
  `INSERT ... ON CONFLICT` atômico na tabela `entries`, com orçamento de 1,2 s. Se o tempo acabar,
  vale a decisão local e a leitura fica pendente. Depois de três estouros seguidos, o celular passa
  30 s em modo offline, para não travar a fila.
- **Log de leituras:** é um conjunto só-de-acréscimo (G-Set) identificado por UUID. A fusão é a
  união, então a convergência é trivial e não precisa de biblioteca de CRDT. Cancelamentos e
  atribuições são do servidor e vêm inteiros a cada sync (são pequenos); as leituras vêm de forma
  incremental.
- **Cursor seguro:** sequências do Postgres podem fazer commit fora de ordem. Cada linha guarda o
  `pg_current_xact_id()`, e o servidor só entrega linhas abaixo do `xmin` do snapshot atual (padrão
  outbox). O cliente ainda deduplica pelo UUID.
- **Lote novo gerado depois do último sync:** é aceito, porque a assinatura prova que foi emitido.
  O vendedor aparece como "lote novo" até a próxima sincronização.
- **Releitura do mesmo QR em até 5 s no mesmo celular** (a pessoa ainda está na frente da câmera):
  reexibe o resultado anterior sem registrar outra leitura.
- **Tela de resultado:** cor de tela cheia, som (Web Audio) e vibração quando houver suporte (o
  iPhone não vibra pela web). Os resultados possíveis:
  - verde: **válido**;
  - vermelho: **já entrou** (hora e porta), **cancelado** (motivo) ou **falso/ilegível**;
  - amarelo: **outro evento**.

### 5.2 Prontidão para ficar offline

A tela da portaria tem uma lista de verificação que precisa ficar toda verde antes do evento:

- app em cache (Service Worker controlando a página);
- dados do evento baixados, com a hora da atualização;
- permissão de câmera concedida;
- armazenamento persistente pedido com `navigator.storage.persist()`;
- leitura de teste de um ingresso de amostra.

O Safari do iPhone pode apagar dados de sites não instalados depois de 7 dias sem uso. A
instrução, portanto, é **abrir o link no dia do evento, com internet** (ou adicionar à tela de
início).

### 5.3 Garantias e limites, sem eufemismo

| Situação | O que acontece |
|---|---|
| Todos os celulares com sinal | Cópia bloqueada já na segunda leitura, em qualquer celular (confirmação atômica no servidor) |
| Um celular só, offline | Cópia bloqueada (estado local) |
| Vários celulares offline, cópias lidas **no mesmo** celular | Bloqueada |
| Vários celulares offline, cópias lidas **em celulares diferentes** | **As duas entram.** O caso é detectado no primeiro sync em que os dois logs chegam ao servidor e aparece no relatório como "entrada duplicada offline", com hora, celular e vendedor da faixa |
| Cancelamento feito depois que o celular ficou offline | O celular não sabe; a entrada é marcada depois como "entrou com ingresso cancelado" |
| Sinal intermitente | A janela de risco é o intervalo entre syncs (cerca de 3 s), e a confirmação online cobre os momentos de sinal bom |
| Celular perdeu o cache do app e está sem internet | O app não abre. Mitigação: lista de prontidão e um segundo celular preparado |

O limite da linha 4 é **inerente**. Sem rede, navegadores não conseguem conversar entre si
(WebRTC exige sinalização, Web Bluetooth não existe no iPhone e não há descoberta de rede local).
Mitigações no MVP:

1. Orientação no app: sem sinal, use **um celular por fila**. Se houver mais de um dispositivo
   registrado e este estiver offline há mais de 2 minutos, a tela mostra um aviso.
2. Visibilidade: o contador "N leituras não sincronizadas · offline há X min" fica sempre à vista.
3. Rastreabilidade: o relatório mostra duplicatas por faixa de vendedor.

Pesquisa futura (fora do MVP): sincronização entre celulares por QR animado (um celular mostra, o
outro lê) ou por WebRTC em hotspot local com sinalização trocada via QR.

## 6. Geração de arquivos

- **Especificação do ingresso** (`ticket_designs.spec`, JSON versionado e imutável): tamanho em mm,
  sangria (3 mm), arte, caixa do número (posição, fonte embutida, tamanho, cor, alinhamento,
  prefixo "Nº", dígitos), caixa do QR (posição e tamanho ≥ 22 mm, sempre com fundo branco), canhoto
  opcional (lado, largura, campos "Nome/Telefone"; a altura do ingresso precisa comportar os campos)
  e textos extras. Número, nome do evento e campos nunca saem das suas caixas: são reduzidos ou
  cortados com "…".
- **Saídas:**
  1. **A4 caseiro:** N ingressos por folha, com o encaixe calculado, marcas de corte e linha
     tracejada de picote entre canhoto e ingresso. Pode ser gerado por vendedor.
  2. **Gráfica (impressão digital):** um ingresso por página no tamanho final + 3 mm de sangria
     (TrimBox gravada pelo próprio Typst, BleedBox = corte + 3 mm gravada na junção dos blocos) +
     marcas de corte fora da sangria (opcionais). QR único por ingresso exige impressão digital;
     offset não imprime dados variáveis (ver ADR 0008, modo de sobreimpressão na fase 7). Por ora
     em RGB; CMYK (lcms2) e PDF/X ficam para a fase 7.
  3. **Folha de controle por vendedor:** tabela com número, nome do comprador e "pago?". Ela
     complementa o canhoto.
  4. **WhatsApp:** JPEG de 1080 px por ingresso, sem sangria nem canhoto, em um ZIP com uma pasta
     por vendedor, mais o aviso "envie cada imagem a um só comprador".
- **QR:** a matriz é calculada em Rust e vira **SVG com um único `path`** (vetorial no PDF, nítido
  em qualquer impressora), entregue ao Typst como arquivo virtual. Não usamos pacotes Typst
  baixados da internet.
- **Segurança do template:** os templates são nossos e ficam compilados no binário. O texto do
  usuário (nome do evento, nomes de vendedores) entra **só via `sys.inputs`/JSON**, nunca
  concatenado no código Typst. Isso evita injeção de código Typst.
- **Determinismo:** as entradas (spec versionada + arte + números + assinaturas determinísticas)
  definem a saída por completo. Por isso **não armazenamos os arquivos gerados**: eles ficam em
  disco como cache por 24 horas (e somem a cada deploy), e qualquer arquivo pode ser regerado.
- **Blocos (ADR 0015):** 250 ingressos por compilação nos PDFs (juntados com `lopdf`) e 50 nas
  imagens, com o cache do Typst limpo entre blocos: cerca de 100 MiB de pico para 2.000 ingressos.
- **Execução:** gerar 1.000 ingressos pode levar alguns segundos. A geração roda como **job em
  fila no Postgres** (`SELECT ... FOR UPDATE SKIP LOCKED`) no mesmo processo, via
  `spawn_blocking`. Não há Redis nem worker separado.
- **Prévia fiel:** o editor mostra uma sobreposição HTML para arrastar, mas a prévia oficial é um
  PNG renderizado pelo mesmo pipeline Typst ("o que você vê é o que imprime").
- **Fontes:** um punhado de fontes OFL embutidas com `include_bytes!`.

## 7. Modelo de dados

Esboço. A versão definitiva sai nas migrações da fase 3.

```sql
create extension if not exists btree_gist;
create extension if not exists citext;

-- Contas
create table organizations (id uuid primary key, name text not null, created_at timestamptz not null default now());
create table users (id uuid primary key, email citext not null unique, display_name text, created_at timestamptz not null default now());
create table memberships (organization_id uuid references organizations, user_id uuid references users,
  role text not null check (role in ('owner','member')), primary key (organization_id, user_id));
create table login_codes (id uuid primary key, email citext not null, code_hash bytea not null,
  expires_at timestamptz not null, attempts smallint not null default 0, consumed_at timestamptz);
create table sessions (token_hash bytea primary key, user_id uuid not null references users,
  created_at timestamptz not null default now(), expires_at timestamptz not null, last_seen_at timestamptz);

-- Evento e chaves
create table events (
  id uuid primary key, organization_id uuid not null references organizations,
  name text not null, venue text, starts_at timestamptz not null, ends_at timestamptz not null,
  qr_tag bigint not null unique check (qr_tag between 0 and 4294967295),
  number_digits smallint not null default 4, ticket_price_cents integer,
  status text not null check (status in ('draft','active','closed')),
  created_at timestamptz not null default now());
create table event_signing_keys (
  event_id uuid references events, key_id smallint check (key_id between 0 and 255),
  public_key bytea not null check (length(public_key) = 32),
  sealed_private_key bytea not null,
  status text not null check (status in ('active','retired','revoked')),
  created_at timestamptz not null default now(), primary key (event_id, key_id));

-- Arte e layout (versões imutáveis)
create table blobs (id uuid primary key, sha256 bytea not null unique, content_type text not null,
  byte_size integer not null, data bytea not null, created_at timestamptz not null default now());
create table ticket_designs (id uuid primary key, event_id uuid not null references events,
  version integer not null, spec jsonb not null, art_blob_id uuid references blobs,
  created_at timestamptz not null default now(), unique (event_id, version));

-- Lotes, vendedores, cancelamentos: tudo em faixas
create table ticket_batches (
  id uuid primary key, event_id uuid not null references events,
  numbers int4range not null, design_id uuid not null references ticket_designs, key_id smallint not null,
  status text not null check (status in ('awaiting_payment','paid','canceled')),
  price_cents integer not null, created_at timestamptz not null default now(), paid_at timestamptz,
  exclude using gist (event_id with =, numbers with &&) where (status <> 'canceled'));
create table sellers (id uuid primary key, event_id uuid not null references events, name text not null, phone text);
create table seller_assignments (
  id uuid primary key, event_id uuid not null references events, seller_id uuid not null references sellers,
  numbers int4range not null, created_at timestamptz not null default now(),
  exclude using gist (event_id with =, numbers with &&));
create table ticket_voids (
  id uuid primary key, event_id uuid not null references events, numbers int4range not null,
  reason text not null check (reason in ('unsold','lost','revoked')), note text,
  created_by uuid references users, created_at timestamptz not null default now(),
  undone_at timestamptz, undone_by uuid references users);

-- Portaria
create table door_accesses (id uuid primary key, event_id uuid not null references events, label text not null,
  token_hash bytea not null unique, expires_at timestamptz not null, revoked_at timestamptz,
  created_at timestamptz not null default now());
create table door_devices (id uuid primary key, door_access_id uuid not null references door_accesses,
  event_id uuid not null references events, name text not null, secret_hash bytea not null,
  created_at timestamptz not null default now(), last_seen_at timestamptz, revoked_at timestamptz);
create table scans (                                  -- log só-de-acréscimo (G-Set)
  id uuid primary key,                                -- gerado no celular → envio idempotente
  event_id uuid not null references events, device_id uuid not null references door_devices,
  ticket_number integer, key_id smallint,             -- nulos se o QR for ilegível ou falso
  local_outcome text not null check (local_outcome in
    ('admitted','rejected_used','rejected_void','rejected_invalid','rejected_other_event')),
  scanned_at timestamptz not null,                    -- relógio do celular corrigido pelo offset
  received_at timestamptz not null default now(),
  confirmed_online boolean not null,
  server_class text check (server_class in ('first_entry','duplicate_entry','void_entry')),
  txid xid8 not null default pg_current_xact_id());   -- cursor seguro de sincronização
create table entries (                                -- primeira entrada de cada ingresso
  event_id uuid references events, ticket_number integer,
  first_scan_id uuid not null references scans, primary key (event_id, ticket_number));

-- Pagamentos (ADR 0020): uma linha por Checkout Session da Stripe
create table payments (id uuid primary key, batch_id uuid not null references ticket_batches,
  checkout_session_id text not null unique, checkout_url text not null, amount_cents integer not null,
  currency text not null, status text not null check (status in ('open','paid','expired','failed')),
  payment_intent_id text, created_by uuid not null references users, created_at timestamptz not null,
  expires_at timestamptz not null, paid_at timestamptz);
-- ticket_batches.paid_via: 'stripe' ou 'admin'

-- Jobs (geração de arquivos, e-mails)
create table jobs (id uuid primary key, kind text not null, payload jsonb not null,
  status text not null check (status in ('queued','running','done','failed')),
  attempts smallint not null default 0, run_after timestamptz not null default now(),
  locked_at timestamptz, result jsonb, error text, created_at timestamptz not null default now());
```

O ingresso nº 42 não tem uma linha própria. O estado dele é derivado assim:

- **emitido:** está em um lote pago;
- **vendedor:** dono da atribuição cuja faixa contém o número;
- **cancelado:** existe um cancelamento ativo que contém o número;
- **entrou:** existe linha em `entries`.

Todas as consultas usam índice GiST.

**Relatório por vendedor:**

- atribuídos;
- devolvidos (`unsold`);
- extraviados (`lost`);
- **vendidos declarados** = atribuídos − devolvidos − extraviados;
- entradas;
- entradas duplicadas offline;
- cópias bloqueadas na porta;
- **valor a acertar** = vendidos declarados × preço, se o preço estiver configurado.

O relatório tem ainda uma linha para os números não atribuídos e totais gerais.

## 8. API (esboço)

Organizador (token Bearer no cabeçalho `Authorization`, CORS restrito às origens do site; ADR 0016).
Rotas implementadas na fase 3:

```
POST /api/auth/code            POST /api/auth/verify          POST /api/auth/logout      GET /api/me
GET|POST /api/events           GET|PUT /api/events/{id}
GET|PUT /api/events/{id}/design                POST /api/events/{id}/design/preview (PNG, amostras)
POST /api/events/{id}/art      (PNG/JPEG cru, até 20 MB)
GET|POST /api/events/{id}/batches              POST /api/batches/{id}/cancel
POST /api/admin/batches/{id}/mark-paid         (pagamento por fora, ADMIN_EMAILS)
GET|POST /api/events/{id}/sellers              PUT|DELETE /api/sellers/{id}
POST /api/sellers/{id}/ranges  DELETE /api/ranges/{id}
GET|POST /api/events/{id}/voids                POST /api/voids/{id}/undo
GET|POST /api/events/{id}/exports              GET /api/exports/{id}
POST /api/exports/{id}/link    → link de 10 min  GET /api/downloads/{token} (sem login)
GET /healthz (sem banco)                       GET /readyz (consulta o banco)
```

Pagamento, fase 6 (ADR 0020):

```
GET  /api/pricing                          (sem login) tabela progressiva de preços
POST /api/batches/{id}/checkout            → { url } da Stripe Checkout (reaproveita a sessão aberta)
POST /api/batches/{id}/checkout/sync       → lote, depois de consultar a sessão na Stripe
POST /api/stripe/webhook                   (sem login; assinatura Stripe-Signature)
```

Um Pix gerado e ainda não pago deixa o pagamento `processing`: até a Stripe confirmar ou recusar,
o lote não pode ser cancelado, marcado como pago à mão nem receber outro checkout
(`payment_pending`). Checkout, cancelamento e "marcar como pago" de um mesmo lote rodam um de cada
vez (trava em memória: a API tem uma instância só) e chamam a Stripe sem transação aberta no banco.
Um lote com faixas de vendedor ou cancelamentos não pode ser cancelado (`batch_has_ranges`).

Portaria, fase 4. O organizador gerencia os links pelo painel (sessão Bearer):

```
GET  /api/events/{id}/door                 → { accesses[], devices[], entryCount }
POST /api/events/{id}/door/accesses        { label } → { access, token }   (token mostrado uma vez)
POST /api/door-accesses/{id}/revoke        POST /api/door-devices/{id}/revoke
```

Os celulares usam `Authorization: Bearer <deviceSecret>`:

```
POST /api/door/register        { accessToken, deviceName } → { deviceId, deviceName, deviceSecret, event }
GET  /api/door/manifest?since=<cursor>
     → { event, verifier { eventId, eventTag, keys[] }, voids[], sellers[], entries[], cursor, serverTimeMs }
POST /api/door/scans           { scans: [{ id, number?, keyId?, outcome, scannedAtMs }], confirm? }
     → { results: [{ id, class?, firstEntry?, voidReason? }] }
```

- `verifier` e `voids` têm o formato que o `DoorCore` recebe.
- `entries` traz as leituras aceitas de todos os celulares desde o cursor.
- O cursor é um id de transação: só saem linhas abaixo do `xmin` do snapshot. Uma transação de
  escrita longa no banco segura a sincronização até terminar.
- `confirm` classifica uma leitura só, enquanto o celular espera. A classificação é a primeira
  inserção em `entries`, com a mesma precedência da portaria: cancelado > já entrou > entra.

Os DTOs são structs Rust com `#[derive(TS)]` (`ts-rs`), e os tipos TS são gerados em
`packages/api-types`. Um teste do CI falha se os tipos gerados estiverem desatualizados.

## 9. Frontend

- **Um único app Next.js** (`apps/web`) na Vercel, com pnpm, TypeScript 6 strict, ESLint com
  `no-explicit-any: error`, Tailwind e Vitest. Os testes E2E usam Playwright, cujo Chromium aceita
  vídeo falso para a câmera (`--use-file-for-fake-video-capture`), o que permite testar a leitura
  de QR de ponta a ponta.
- **Rotas:**
  - `/`: landing (com a tabela de preços de `GET /api/pricing`);
  - `/entrar`: login;
  - `/painel/...`: área do organizador, com componentes de cliente que chamam a API Rust. Não há
    Server Actions nem Route Handlers com regra de negócio;
  - `/portaria`: PWA, com o Service Worker no escopo `/portaria/`.
- **Portaria:** o Service Worker faz precache do shell, do `ticket-core.wasm` e do `zxing.wasm`,
  todos servidos por nós (o `zxing-wasm` busca o `.wasm` em CDN por padrão; é preciso configurar
  `locateFile`). O IndexedDB é acessado via `idb`. A sincronização roda em primeiro plano enquanto
  a tela está aberta (não há Background Sync no iPhone), e a tela mantém o Wake Lock ativo.
- **Interface (ADR 0021):** sistema de design próprio sobre Tailwind 4 (tokens claro/escuro em
  `globals.css`, componentes em `src/components/ui`, ícones `lucide-react`, toasts `sonner`, fonte
  Geist servida por nós). A página do evento tem uma visão geral com o passo a passo e abas na URL
  (`?aba=lotes`).
- **PWA do painel (ADR 0021):** `app/manifest.ts` e `public/sw.js` (escopo `/`, ignora
  `/portaria`): arquivos de build em cache e página `/offline` sem rede; botão "Instalar app".
- **Textos centralizados:** `apps/web/src/texts/pt-BR.ts` (objeto tipado `as const`). No Rust, os
  textos de e-mail e PDF ficam em módulos `texts.rs`. Não há framework de i18n.

## 10. Infraestrutura e operação

- **Frontend:** Vercel. O deploy é pré-compilado pelo GitHub Actions (`vercel build` +
  `vercel deploy --prebuilt`), porque o WASM do núcleo precisa de Rust, que o build da Vercel não
  tem.
- **API:** Web Service Docker no Render, região Virginia, em instância paga (sem hibernação). O
  Blueprint (`render.yaml`) compila `deploy/api.Dockerfile` (dependências em camada própria, com
  cargo-chef) e só implanta commits com o CI verde; o CI compila e sobe a mesma imagem. As
  migrações rodam na inicialização. O health check do Render chama `/healthz`, que não consulta o
  banco; `/readyz` consulta (ADR 0019).
- **Banco:** Neon `aws-us-east-1`, na mesma área da API, com conexão direta (o pool fica no sqlx)
  e `sslmode=verify-full`. O banco dorme quando não há uso: o worker só consulta sozinho a cada
  hora. O backup é o PITR do Neon mais um `pg_dump` diário cifrado pelo CI, com teste de
  restauração mensal num branch do Neon.
- **E-mail:** Resend, pela API HTTP, a partir de `mail.` do domínio (região São Paulo).
- **DNS:** no Registro.br. O domínio raiz e `www` (que redireciona para a raiz) apontam para a
  Vercel, e `api.` para o Render. Passo a passo em [`deploy.md`](deploy.md).
- **Segredos:** variáveis secretas no Render. A chave mestra das assinaturas também fica no
  gerenciador de senhas, fora de qualquer backup.
- **Observabilidade mínima:** `tracing` em JSON no stdout (logs do Render), `/healthz`, `/readyz` e um
  monitor externo de disponibilidade (opcional). A portaria guarda os erros no IndexedDB e os
  envia junto com o sync.
- **Configuração:** variáveis de ambiente lidas uma vez em uma struct tipada e validada na
  inicialização (o processo falha cedo se algo estiver errado). Em produção, origens do CORS,
  `PUBLIC_API_URL` em https e `ADMIN_EMAILS` são obrigatórios.
- **Desenvolvimento local:** Postgres via `docker compose` (`deploy/compose.dev.yaml`). O Mailer
  de desenvolvimento escreve o código de login no log.

## 11. Testes e qualidade

- **Lints Rust no workspace:**
  - `clippy::unwrap_used`, `expect_used` e `panic` como erro (liberados em testes via
    `clippy.toml`);
  - `indexing_slicing` como erro no `ticket-core`;
  - `unsafe_code = "forbid"`, exceto no `ticket-wasm`, porque o código gerado pelo wasm-bindgen
    usa `unsafe`.
- **ticket-core:**
  - testes de propriedade (`proptest`): ida e volta da codificação; qualquer bit alterado é
    rejeitado; assinatura de outro evento é rejeitada; entrada arbitrária nunca causa pânico;
    base45 é canônico;
  - **vetores compartilhados** em `testdata/vectors/ticket-v1.json`, positivos e negativos, a
    partir de sementes fixas. Os mesmos vetores rodam no `cargo test` e no Vitest contra o WASM
    compilado;
  - fuzzing do decodificador com `cargo-fuzz` (opcional, fase 1).
- **server:** testes de integração contra um Postgres real (`sqlx::test`), cobrindo a confirmação
  atômica, a fusão de logs e o cursor seguro.
- **render:** testes de snapshot nos metadados do PDF (contagem de páginas, caixas) e de PNGs em
  baixa resolução. Há também um teste que **decodifica o QR renderizado** e verifica a assinatura,
  fechando o ciclo gerar → ler.
- **CI (GitHub Actions):** `just check` roda fmt, clippy, testes Rust, build WASM, vetores no
  Vitest, typecheck, lint e build do web. Os testes de integração usam um Postgres em container
  no CI, não o Neon.

## 12. Fases até o MVP

Estimativas grosseiras, para quem tem 5 a 10 h por semana.

| Fase | Entrega | Critério de pronto | Esforço |
|---|---|---|---|
| **0. Fundação** | Esqueleto do monorepo, `justfile`, CI, compose de dev com Postgres, lints | `just check` verde no CI com crates e app vazios | ~5 h |
| **1. Núcleo do ingresso** | `ticket-core` (formato v1, base45, Ed25519, decisão de check-in) + `ticket-wasm` + vetores | Propriedades e vetores passando em Rust e no WASM/Vitest | ~15 h |
| **2. Geração de arquivos** | `render` + CLI `ii render spec.json`: A4, gráfica, PNG/ZIP e folha de controle | Imprimir uma folha em casa e ler o QR com o celular (teste automatizado de ida e volta) | ~25 h |
| **3. API + painel mínimo** | Login por código, evento, arte + layout por formulário com prévia, lotes (pago manualmente), vendedores, cancelamentos, downloads | Criar um evento real de ponta a ponta pelo navegador | ~30 h |
| **4. Portaria PWA** | Acesso por link, registro do dispositivo, manifesto, leitura, decisão offline, sync, confirmação online, lista de prontidão | Três celulares (Android + iPhone) em modo avião lendo, depois sincronizando e convergindo | ~30 h |
| **5. Relatório + produção** | Relatório por vendedor, deploy (Vercel + Render + Neon), backup testado, ensaio geral | Ensaio com cerca de 50 ingressos impressos e duas portas | ~15 h |
| **MVP: show da banda** | | | **~120 h** |
| 6. Pagamento + interface | Stripe Checkout (Pix e cartão) com webhook, preço por lote; redesign do site e do painel, logo e PWA (ADRs 0020, 0021) | Pagar um lote real e receber os arquivos sem intervenção | |
| 7. Produto para vender | Preços menores e ingressos grátis (0024); textos no ingresso, 16 modelos e editor visual com arrastar (0025); painel de administração, cortesias e página da conta (0026); duplicar, arquivar e excluir eventos (0027) | Montar um ingresso a partir de um modelo, só no celular, e imprimir | |
| 8. Gráfica e abertura | CMYK/PDF-X, modo de sobreimpressão (arte em offset + número/QR em casa); convite de membros, termos/LGPD, limites de abuso | | |

**Atalho, se o show for antes disso:** a fase 3 pode sair sem painel. O evento seria criado por
comandos da CLI admin contra o banco, e o servidor teria só a API da portaria. Assim, o caminho
0 → 1 → 2 → 4 entrega ingressos impressos e uma portaria offline em cerca de 80 h.

## 13. Riscos e questões em aberto

- **Memória do Typst no Render:** gerar lotes grandes numa instância pequena. A mitigação é
  renderizar em blocos e medir na fase 2 (ADR 0013).
- **Latência Brasil ↔ Virginia** (cerca de 130 a 150 ms): cabe com folga no orçamento de 1,2 s da
  confirmação online.
- **Câmeras ruins / pouca luz:** a mitigação é usar a lanterna (`torch`, quando houver suporte),
  QR grande e correção M. O plano B, digitar o número, verifica só o estado (cancelado/usado) e
  **não a autenticidade**; nesse caso a entrada é marcada como "manual".
- **Atualizações do Typst quebram a API com frequência:** a versão fica fixa e todo uso fica
  isolado no crate `render`.
- **Taxa da Stripe:** maior que a de um PSP de Pix. O modelo de pagamento (`payments`, `paid_via`,
  preço no lote) não depende da Stripe; trocar de provedor é um ADR novo (0020).
- **Mais de uma fila sem sinal:** é um limite do produto que precisa ser comunicado ao organizador
  na própria interface.
