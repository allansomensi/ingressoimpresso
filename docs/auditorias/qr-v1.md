# Auditoria do formato de ingresso QR v1

- **Data:** 2026-10-14
- **Commit auditado:** `a0e99ff` (branch `main`, versão 1.5.0)
- **Objeto:** o formato v1 do QR (`crates/ticket-core`), a custódia das chaves e tudo o que
  assina, verifica ou decide com base nele: servidor, renderização, portaria, conferência pública
  e ingresso digital. Antes de congelar o v1 (invariante 1 do `CLAUDE.md`).
- **Modelo de ameaças usado:** organizador pequeno, portaria offline, atacante que é comprador,
  vendedor, alguém da equipe ou alguém com um link vazado. Comprometimento do servidor em
  execução fica fora (limite aceito pelos ADRs 0004 e 0005). Quando um achado só vale com acesso
  de escrita ao banco, o texto diz isso.
- **Regras seguidas:** `payload.rs`, `base45.rs`, `SIGNING_DOMAIN` e `testdata/vectors` não foram
  alterados. Tudo o que foi acrescentado são testes, fuzzers e este relatório.
- **Como ler:** a seção 1 é o veredito; a 2 é a tabela; a 3 detalha cada item; a 4 lista o que
  foi verificado e está certo, com o método, para ninguém precisar refazer; a 5 lista os testes
  acrescentados e as lacunas que ficaram; a 6 diz se algo exige um v2.

Os ids têm três tipos: **A** (achado confirmado, com evidência no código e, quando possível, um
teste que o reproduz), **S** (suspeita: não foi possível confirmar no ambiente desta auditoria)
e **M** (melhoria: não é uma falha, mas é mais barato fazer antes do congelamento).

## 1. Veredito

**Sim, com ressalvas.** O formato v1 em si (74 bytes, Base45 estrito, Ed25519 com separação de
domínio e vínculo ao UUID do evento, `verify_strict`) está correto e pode ser congelado: nenhum
achado exige mudar um byte do payload nem os vetores. As ressalvas estão em volta do formato, e
duas merecem correção antes do primeiro ingresso real: o servidor publica a chave pública da
tabela sem conferir que ela corresponde à semente selada (A-01) e a janela de releitura da
portaria mostra verde para uma cópia lida no mesmo celular dentro de 5 s (A-02).

## 2. Tabela de achados

| Id | Tipo | Severidade | Área | Onde | Resumo |
|---|---|---|---|---|---|
| A-01 | confirmado | **média** | custódia de chaves | `crates/server/src/routes/door.rs:626`, `crates/server/src/routes/verify.rs:50`, `crates/server/src/keys.rs:78`, `crates/server/src/routes/events.rs:310` | A coluna `event_signing_keys.public_key` é publicada no manifesto e usada em `/api/verify` como está. Quem escreve no banco (sem a chave mestra) insere uma geração `retired` com a própria chave pública e falsifica ingressos de qualquer evento. Contraria a promessa do ADR 0005 para "injeção de SQL". PoC: `crates/server/tests/audit_qr.rs` (ignorado, falha hoje). |
| A-02 | confirmado | **média** | portaria | `apps/web/src/portaria/engine.ts:249`, `apps/web/src/portaria/logic.ts:34`, `apps/web/src/components/portaria/door-app.tsx:250`, `docs/arquitetura.md:245` | Depois que o verde de um ingresso sai da tela sozinho, uma cópia do mesmo QR lida no mesmo celular em até 5 s mostra **PODE ENTRAR** de novo (sem som, com um selo pequeno) e não registra leitura. A tabela §5.3 diz que cópia no mesmo celular é bloqueada. PoC: `apps/web/test/portaria-engine-audit.test.ts` (`AUDIT_POC=1`, falha hoje). |
| A-03 | confirmado | baixa | operação de chaves | `crates/server/src/routes/events.rs:316`, `crates/server/src/routes/batches.rs:175`, `crates/server/src/jobs.rs:402`, `crates/server/src/main.rs`, `docs/adr/0005-custodia-chaves.md:42` | Rotação (`retired`), revogação (`revoked`) e a troca da chave mestra (`keys rewrap`) existem no formato e nos ADRs, mas não no código: só o `key_id` 1 é criado, nenhuma rota ou comando muda `status`, e o comando `rewrap` do ADR 0005 não existe. O caminho de desastre seria improvisado em SQL. |
| A-04 | confirmado | baixa | portaria | `apps/web/src/portaria/engine.ts:339`, `apps/web/src/portaria/engine.ts:558`, `apps/web/src/components/portaria/door-app.tsx:378` | Se o IndexedDB falhar (cota, modo privado), a leitura é mostrada e o ingresso entra mesmo assim: a invariante 6 vale "na tentativa". Esse celular deixa de sincronizar e, depois de recarregar, aceita a mesma cópia de novo. Um aviso vermelho aparece, mas a porta continua liberando. |
| A-05 | confirmado | info | documentação do modelo de ameaças | `crates/server/src/routes/door.rs:516`, `docs/arquitetura.md:168` | O manifesto hoje leva a lista de nomes (com acompanhantes e observações), vendedores com faixas, categorias, lugares nas mesas e o registro de entradas (número, hora, celular). O §4.2 e o ADR 0007 ainda descrevem o vazamento de link ou de celular como "chave pública, cancelamentos e leituras". Atualizar a tabela. |
| S-01 | suspeita | baixa | robustez | `crates/ticket-core/src/base45.rs:63`, `crates/server/src/routes/verify.rs:75`, `apps/web/src/portaria/camera.ts` | Em 6 de 256 valores do primeiro byte do `event_tag` (2,3 % dos eventos) o texto do QR **começa com espaço**. O zxing-wasm 3.1.5 devolve o espaço intacto (verificado em Node), e `/api/verify` trata colagem; mas qualquer leitor ou caminho futuro que faça `trim` derruba todos os ingressos desses eventos. O ensaio com celulares reais (critério da fase 4) ainda não aconteceu. Teste adicionado que fixa a propriedade. |
| S-02 | suspeita | info | conferência pública | `crates/server/src/auth.rs:151`, `crates/server/src/ratelimit.rs:82`, `crates/server/src/routes/verify.rs:120` | O limite de 30 por 10 min depende de a API estar atrás da Cloudflare (`CF-Connecting-IP`); fora dela, o primeiro valor de `X-Forwarded-For` é do cliente e o limite some (o ADR 0028 já registra o risco). Com um tag existente, a resposta custa uma consulta e uma verificação a mais, o que distingue "tag existe" de "não existe" por tempo. Enumerar 2³² tags nesse ritmo é inviável; não há oráculo de número, estado ou comprador. |
| M-01 | melhoria | - | evolução (v2) | `crates/ticket-core/src/payload.rs:171`, `packages/ticket-core-wasm/src/decision.ts:13`, `apps/web/src/portaria/logic.ts:45`, `crates/render/src/render.rs:252` | Um ingresso v2 num celular antigo sairia como **INVÁLIDO** (falsificação). Antes do v2: um desfecho próprio `unsupported_version` ("atualize o app") e reservar o byte `0x00` (a amostra) para sempre. Não muda o v1; rascunho de ADR na seção 6. |
| M-02 | melhoria | - | forense | `apps/web/src/portaria/storage.ts:255`, `crates/server/migrations/20261008000002_door.sql:37` | O app sobe `keyId: null` em toda leitura, embora a coluna `scans.key_id` exista. Depois de uma revogação, nada no servidor diz quais entradas usaram a chave revogada. |
| M-03 | melhoria | - | QR físico | `crates/render/src/qr.rs:22` | Correção M mantém a versão 5 (37×37; 0,556 mm por módulo a 25 mm, 0,489 mm a 22 mm). Q já exige a versão 7 (45×45; 0,472 mm) e H a versão 8 (49×49; 0,439 mm): mais módulos menores, pior para impressora caseira. Manter M; só mudar com dados do ensaio. Não muda o payload. |
| M-04 | melhoria | - | operação | `deploy/restore-test.sh`, `crates/server/src/jobs.rs:389` | Nada confere, de tempos em tempos, que cada `sealed_private_key` abre com a chave mestra e bate com `public_key`. Um `keys check` (CLI) rodado no restore mensal e no start da API pegaria chave mestra errada e a adulteração do A-01 antes do dia do evento. |

## 3. Achados em detalhe

### A-01. A chave pública publicada não é autenticada pela chave mestra

**Severidade:** média. **Exige v2:** não.

**Cenário.** Alguém com acesso de escrita ao banco, mas sem `TICKET_KEY_ENCRYPTION_KEY`
(injeção de SQL, credencial do Neon vazada, um backup restaurado com uma linha a mais, o painel
do Neon). O ADR 0005 promete que "um dump do banco (backup vazado, injeção de SQL) não pode
bastar para falsificar" e que "são necessários o dump e a chave mestra para falsificar". Para
leitura isso vale; para escrita, não:

1. O atacante gera um par Ed25519 próprio e insere
   `event_signing_keys (event_id, key_id = 2, public_key = <sua chave>, sealed_private_key =
   <lixo>, status = 'retired')` no evento alvo. O índice `event_signing_keys_one_active`
   (`migrations/20261008000001_init.sql:79`) só limita chaves `active`; uma `retired` não
   conflita com nada e nunca precisa assinar (nenhum lote aponta para ela), então o lixo em
   `sealed_private_key` nunca é desselado.
2. Ele assina ingressos com `key_id = 2`, o `qr_tag` do evento (público) e o UUID (lido do
   banco), com o mesmo `TicketIssuer` do produto.
3. O manifesto (`routes/door.rs:626`, `verifier()`) lê a tabela e manda a chave 2 como
   `retired` para todos os celulares; o `ticket-core` aceita chaves `retired`
   (`crates/ticket-core/src/verify.rs:141` só rejeita `Revoked`). Toda porta admite as
   falsificações. `/api/verify` (`routes/verify.rs:50`) faz o mesmo e responde `valid`.
4. Os ingressos verdadeiros continuam funcionando, então nada chama a atenção do organizador.

**Evidência.** `crates/server/tests/audit_qr.rs::published_keys_must_come_from_the_sealed_seeds`
(`#[ignore]`, roda com `cargo test -p ingressoimpresso-server --test audit_qr -- --ignored`).
Hoje falha em `verdict`: `left: "valid"`, `right: "not_ours"`. A AAD da selagem
(`keys.rs:78`) vincula o blob a `event_id || key_id`, mas não à chave pública; e nem o manifesto
nem a conferência abrem o blob.

**Impacto.** Falsificação de ingressos de **qualquer** evento a partir de acesso de escrita ao
banco. É um comprometimento grave por si só (quem escreve no banco também marca lotes como pagos
do próprio evento), mas a selagem existe exatamente para que o banco sozinho não baste para
falsificar, e hoje basta.

**Correção proposta** (sem tocar no formato):

- Guardar junto da linha um autenticador sob a chave mestra, por exemplo
  `public_key_mac = keyed_hash(master, "event-public-key", event_id || key_id || public_key)`
  (`keys::keyed_hash` já existe), ou incluir a chave pública na AAD da selagem e passar a abrir o
  blob onde a chave é publicada. O MAC é mais barato: o manifesto é pedido a cada 3 s por
  celular e não precisa de desselar nada.
- Conferir o MAC em `door::verifier`, `verify::verifier` e `jobs::issuers`; uma linha que não
  confere é **omitida** do manifesto e registrada como erro (e, de preferência, vira
  notificação ao admin). Omitir é a resposta certa: uma chave que o servidor não reconhece não
  pode liberar ninguém.
- Como consequência, perder a chave mestra passa a derrubar também a verificação dos ingressos
  já impressos (hoje só derruba a assinatura de lotes novos). O procedimento de recuperação
  precisa de um passo explícito e auditado, "confiar nas chaves atuais sob a chave mestra nova"
  (`keys trust-existing`), documentado no `docs/deploy.md` junto com o `rewrap` do A-03.
- Complemento detectivo (M-04): o worker, de hora em hora, abre toda `sealed_private_key`,
  deriva a chave pública e compara com a coluna; divergência vira alerta.

### A-02. A janela de releitura mostra verde para uma cópia no mesmo celular

**Severidade:** média. **Exige v2:** não.

**Cenário.** Duas pessoas na fila com o mesmo QR (uma foto no WhatsApp). A primeira passa:
**PODE ENTRAR**, e a tela verde volta à câmera sozinha depois de 2 s (`RESULT_AUTO_MS`,
`logic.ts:322`). A segunda mostra a cópia em até 5 s depois da última vez em que a câmera viu
o QR (`RESCAN_WINDOW_MS`, `logic.ts:34`). Em `engine.ts:249` isso é `same`; como a tela está
vazia e o resultado não foi dispensado por toque (`dismissed` só é marcado pelo toque,
`door-app.tsx:528`), o ramo de `engine.ts:263` reapresenta a **mesma** vista verde com
`repeat: true`, sem registrar leitura (`#checkIn` não é chamado) e sem som
(`door-app.tsx:250`). O que distingue o verde da cópia é o selo "Mesmo QR lido de novo"
(`door-app.tsx:787`), discreto, numa tela cheia verde.

**Evidência.** `apps/web/test/portaria-engine-audit.test.ts`, caso `A-02`, roda com
`AUDIT_POC=1 pnpm --filter @ingressoimpresso/web test`. Hoje falha:
`expected 'ok' not to be 'ok'`, e só uma leitura foi gravada. O desenho está documentado no
ADR 0018 ("reexibe o resultado anterior, sem som e sem nova leitura") e em
`docs/arquitetura.md:217`; a tabela §5.3 (`docs/arquitetura.md:245`) afirma o contrário para
cópias no mesmo celular.

**Impacto.** Uma cópia entra pela mesma porta sem nenhuma leitura registrada, com a cumplicidade
só do relógio: nenhuma rede, nenhum celular comprometido. O relatório não mostra "entrada
duplicada" porque, para o sistema, a segunda pessoa não existiu. Limita-se ao mesmo celular e a
5 s, por isso média e não alta.

**Correção proposta.** A janela deslizante faz sentido enquanto o resultado está na tela ou foi
dispensado por toque (a pessoa ainda está com o QR na frente da câmera). Depois que um verde sai
sozinho, uma nova leitura do mesmo texto deve ser uma leitura de verdade: o `DoorCore` já
responde **JÁ ENTROU às HH:MM por este celular**, que é a verdade. Se a reexibição silenciosa for
mantida, que nunca seja verde: um amarelo "LIDO HÁ POUCO · já entrou" com som. E a linha da
§5.3 deve descrever o caso. Teste pronto: tirar o guard `AUDIT_POC` do caso A-02.

### A-03. Rotação, revogação e troca da chave mestra só existem no papel

**Severidade:** baixa (operacional). **Exige v2:** não.

**Evidência.** `insert_event` (`routes/events.rs:310-316`) é o único lugar que cria chaves, e
sempre com `key_id = 1`. `batches.rs:175` escolhe a chave `active`; `jobs.rs:402` aceita
`status <> 'revoked'` para assinar (correto: um lote antigo reexportado precisa da chave que o
assinou). Nenhuma rota, migração ou comando muda `status`, cria o `key_id` seguinte ou recifra
as sementes com outra chave mestra; `crates/server/src/main.rs` não tem subcomandos, e o
`ingressoimpresso keys rewrap --from --to` do ADR 0005 (`0005-custodia-chaves.md:42`) não
existe. O `.env.example` avisa que perder a chave "significa rotacionar toda chave de evento",
sem haver como.

**Impacto.** Os dois cenários de desastre do ADR 0004 (perda da chave privada: `retired` + nova
geração; comprometimento: `revoked` + reemissão) seriam executados à mão, em SQL, sob pressão,
no dia de um evento. O formato dá 256 gerações, de sobra; o produto não dá nenhuma.

**Correção proposta.** Três operações só de admin, auditadas (`require_admin` + `audit`):
`POST /api/admin/events/{id}/keys/rotate` (retira a `active`, cria a seguinte),
`POST /api/admin/events/{id}/keys/{key_id}/revoke` (com o aviso de que todo ingresso dessa
geração passa a ser recusado) e o comando `keys rewrap` do ADR 0005 na CLI do servidor. Um teste
de integração que rotaciona, reexporta o lote antigo e confirma que a porta aceita as duas
gerações e recusa a revogada (o `ticket-core` já cobre a decisão, falta a ponta do servidor).

### A-04. Falha de armazenamento não impede a entrada

**Severidade:** baixa. **Exige v2:** não.

**Evidência.** `engine.ts:339-353`: `#persist` é aguardado antes de `viewOf`, mas quando
`storage.recordScan` falha ele devolve `null` e marca `storageFailed` (`engine.ts:558-569`);
a decisão segue para a tela e, se for `admit`, a pessoa entra. O `DoorCore` em memória ainda
barra a cópia enquanto a aba viver; ao recarregar, a entrada some, a cópia entra de novo e nada
chega ao servidor. A interface mostra um aviso vermelho (`door-app.tsx:378`) por cima da câmera.

**Correção proposta.** Tratar a falha como a invariante 6 pede: sem gravar, não há resultado.
Mostrar "ERRO DE ARMAZENAMENTO · use outro celular" em vez do verde, e manter o aviso enquanto
durar. É raro (modo privado, cota cheia, Safari apagando dados), mas o custo da mudança é uma
condição.

### A-05. O modelo de ameaças não descreve o que o manifesto leva hoje

**Severidade:** info. **Exige v2:** não.

**Evidência.** `routes/door.rs:516-575` devolve `sellers` (nomes e faixas), `categories`,
`seats` (número → mesa e lugar), `entries` (número, hora, celular), `guests` (nome,
acompanhantes, observação, categoria) e `guestArrivals`. A tabela §4.2
(`docs/arquitetura.md:168-169`) e o ADR 0007 falam só em chave pública, cancelamentos e
leituras. O que um link vazado dá hoje: além de registrar leituras falsas (negação de serviço
contra portadores legítimos) por até 50 celulares (`MAX_DEVICES_PER_ACCESS`), uma cópia de
dados pessoais da lista de nomes e o mapa de quem senta onde. Continua sem permitir
falsificar. Mitigações existentes: expiração em `ends_at + 12 h`, revogação, limite por
endereço no registro.

**Correção proposta.** Duas linhas na tabela §4.2 e uma frase no ADR 0007 (ou no 0070). Opcional:
a lista de nomes só para links marcados para isso (`door_accesses.guest_list boolean`).

### S-01. Texto do QR que começa com espaço

**Severidade:** baixa (suspeita de campo). **Exige v2:** não.

O primeiro triplo Base45 codifica `(0x01, tag[0])`; o primeiro símbolo é `(256 + tag[0]) mod
45`, e o espaço é o símbolo 36. Para `tag[0] ∈ {5, 50, 95, 140, 185, 230}` o texto começa com
espaço (teste `qr_texts_start_with_a_space_for_exactly_six_tag_values_and_never_end_with_one`
em `crates/ticket-core/tests/audit.rs`). O último símbolo nunca é espaço (o dígito mais
significativo de um triplo vale no máximo 32). O decodificador é estrito de propósito, então
`trim` em qualquer ponto do caminho (leitor, colagem, copiar e colar no WhatsApp, um
`BarcodeDetector` nativo no futuro) torna 2,3 % dos eventos inteiros ilegíveis na porta.

Verificado nesta auditoria: um QR gerado com `uqr` 0.1.3 a partir de um texto com espaço
inicial foi lido pelo `zxing-wasm` 3.1.5 (o mesmo pacote de `camera.ts`) em Node com o texto
idêntico, inclusive o espaço (`contentType: Text`, 111 caracteres). Não verificado: câmeras
reais no Android e no iPhone, que é o critério de pronto da fase 4 e ainda está pendente. O
`/api/verify` já trata o caso na colagem (`verify.rs:75`, teste
`a_ticket_starting_with_a_space_survives_the_blanks_of_a_paste`).

**Recomendação.** Incluir no ensaio com celulares reais um evento cujo `qr_tag` comece com um
desses bytes (basta criar eventos até `qr_tag >> 24` cair em um dos seis valores; ou fixar um
em staging por SQL). Nunca acrescentar `trim` na portaria; o teste novo registra a regra.

### S-02. Oráculos e limites de `/api/verify`

**Severidade:** info. **Exige v2:** não.

- **Enumerar números válidos:** impossível sem a chave privada; qualquer texto sem assinatura
  válida responde `not_ours`, inclusive um número não emitido assinado com outra chave
  (`audit_qr.rs::unpaid_numbers_are_never_signed`).
- **Enumerar eventos:** a resposta é `not_ours` tanto para tag inexistente quanto para assinatura
  inválida, mas o caminho difere (`verify.rs:133` consulta o evento; só com o tag existente
  `verify.rs:141` carrega as chaves e verifica). A diferença de tempo (uma ida ao banco e uma
  verificação Ed25519) revela "tag existe". Com 30 pedidos por 10 min e 2³² tags, enumerar é
  inviável; e o tag não é segredo (ADR 0003). Aceitável.
- **`private` × `not_ours`:** quem tem um ingresso autêntico de um evento com a conferência
  desligada recebe `private`, que confirma a autenticidade. É a semântica escolhida no ADR 0075.
- **Estado e comprador:** nunca "já entrou", nunca quem comprou (teste
  `an_authentic_ticket_shows_its_event_and_nothing_private`). Cancelado, adiado, cancelado o
  evento e a categoria são revelados de propósito.
- **Limite por endereço:** `client_ip` (`auth.rs:151-162`) prefere `CF-Connecting-IP` e, na
  falta, o **primeiro** valor de `X-Forwarded-For`, que é o do cliente em qualquer cadeia de
  proxies. O ADR 0028 registra que isso depende de a API ficar atrás da Cloudflare (o Render
  fica). Se a borda mudar, os limites de `/api/verify`, do registro da portaria e do ingresso
  digital passam a ser contornáveis. Suficiente hoje; vale um teste de integração que mande
  `X-Forwarded-For: a, b` e confira que o endereço usado é o do proxy, para o dia em que a
  borda mudar.

### M-01. Convivência com um v2 e versões reservadas

**Exige v2:** não; é uma regra para os formatos futuros e um desfecho novo no DTO da porta.

Hoje um payload com `version ≠ 0x01` é `UnsupportedVersion` (`payload.rs:171`) → `Malformed`
→ **INVÁLIDO** na tela, o mesmo que uma falsificação. Quando houver v2, todo celular com o app
antigo chamará ingressos legítimos de inválidos, sem dizer por quê. E o enum de motivos do app é
fechado (`decision.ts:13`: um valor desconhecido lança e vira `errorView`), então o motivo novo
precisa entrar no WASM e no wrapper na mesma versão, antes de qualquer v2 circular.

A amostra das prévias é `version = 0x00` (`render.rs:252`, `logic.ts:45`): o byte `0x00` deve
ser reservado para sempre, para que nenhum formato futuro possa dar à amostra uma interpretação
válida. Rascunho de ADR na seção 6.

### M-02. `keyId` nulo nas leituras enviadas

**Exige v2:** não (muda o DTO da porta, não o QR).

`storage.ts:255` manda `keyId: null` em todo upload, embora a decisão conheça a geração
(`VerifiedTicket::key_id`) e a coluna `scans.key_id` exista (`door.sql:37`). Depois de uma
revogação (A-03), o servidor não consegue dizer quais entradas foram de ingressos da geração
revogada. Basta o `DecisionDto` carregar `keyId` nos desfechos de ingresso autêntico e o app
repassá-lo. Mudança de DTO, não de formato.

### M-03. Nível de correção do QR

**Exige v2:** não (o nível de correção é do código QR, não do payload).

Medido com o `qrcodegen` 1.8.0 (o mesmo do `render`) para um texto de 111 símbolos
alfanuméricos:

| Correção | Versão | Módulos | Módulo a 22 mm | Módulo a 25 mm | Módulo a 30 mm |
|---|---|---|---|---|---|
| L (7 %) | 4 | 33×33 | 0,537 mm | 0,610 mm | 0,732 mm |
| **M (15 %)** | **5** | **37×37** | **0,489 mm** | **0,556 mm** | **0,667 mm** |
| Q (25 %) | 7 | 45×45 | 0,415 mm | 0,472 mm | 0,566 mm |
| H (30 %) | 8 | 49×49 | 0,386 mm | 0,439 mm | 0,526 mm |

(Módulo = tamanho impresso ÷ (módulos + 8 de zona de silêncio).) Subir de M para Q custa duas
versões, não uma: a capacidade de 6-Q é 108 símbolos, abaixo dos 111. Para impressora caseira e
tela de celular, módulos menores custam mais leituras perdidas do que a correção extra devolve;
rasuras e dobras em papel de ingresso são pequenas em relação aos 15 % de M. Recomendação:
manter M e, se o ensaio com celulares reais mostrar leitura ruim, subir o **tamanho mínimo**
(hoje 22 mm) antes de mexer na correção. Nada disso toca no payload. Observação útil para um v2:
a versão 5-M comporta 122 símbolos (81 bytes); o v1 usa 111 (74 bytes), sobram 7 bytes no mesmo
QR.

### M-04. Conferência periódica das chaves

**Exige v2:** não.

Nada hoje abre as sementes fora de uma exportação ou de um ingresso digital. Uma chave mestra
errada no Render (ou um backup restaurado com outra) só aparece quando um organizador tenta gerar
um arquivo. Um `ingressoimpresso keys check` que abra toda `sealed_private_key`, derive a chave
pública e compare com a coluna cobre o A-01 (detecção), o A-03 (antes e depois do `rewrap`) e o
restore mensal (`deploy/restore-test.sh` restaura o dump, mas não prova que as chaves abrem).

## 4. O que foi verificado e está correto

Método entre parênteses: **L** leitura do código com a linha; **T** teste existente; **N** teste
novo desta auditoria (seção 5); **F** fuzzing; **E** experimento fora da suíte.

### 4.1 Construção criptográfica

- **Mensagem assinada** `"ingressoimpresso:ticket:v1" (26) || event_id (16) || header (10)`:
  todos os campos têm tamanho fixo, então a concatenação é inequívoca
  (`payload.rs:91`, L; `signing_message_layout`, T). O `version` está dentro do cabeçalho e
  também na string de domínio: um verificador v2 com a mesma chave nunca reinterpreta um v1. O
  UUID completo entra na mensagem sem ocupar espaço no QR (ADR 0004): tag igual, UUID diferente
  → `BadSignature` (`signatures_are_bound_to_the_full_event_id`, T; vetor `tag-collision`, T).
  A assinatura cobre o `key_id`: o mesmo par de chaves registrado sob dois ids não cruza
  (`key_ids_cover_the_whole_byte_and_the_header_binds_them`, N). Qualquer bit
  (`any_single_bit_flip_is_rejected`, T) ou qualquer combinação de bytes
  (`any_byte_mutation_is_rejected`, N; alvo `door` modo 1, F) do payload alterado é rejeitado.
- **Ed25519:** `ed25519-dalek` 3.0.0 sobre `curve25519-dalek` 5.0.0, com as features `fast`
  e `zeroize` apenas (`cargo tree -e features -i ed25519-dalek`, E): `legacy_compatibility`
  desligada em toda a árvore. `verify_strict` (`ed25519-dalek-3.0.0/src/verifying.rs:367-390`,
  L): `S` canônico (`Scalar::from_canonical_bytes`, `signature.rs:87-94`), `R` precisa
  descomprimir, `R` e `A` não podem ter ordem pequena, equação sem cofator e comparação de `R`
  **nos bytes comprimidos** (uma codificação não canônica de `R` também falha). Vetores
  `non-canonical-signature` (`S + L`) e `small-order-r` (T) fixam os dois caminhos.
  Determinismo RFC 8032: vetores reproduzidos byte a byte em Rust, no WASM e por uma
  implementação independente com o OpenSSL do Node (`independent.test.ts`, T).
- **Chaves públicas do manifesto:** `EventPublicKey::from_bytes` (`ids.rs:144-145`) exige
  ponto válido e rejeita ordem pequena (`is_weak`). Os oito pontos de torção, direto e via DTO
  (`every_small_order_public_key_is_refused`, N), duas codificações não canônicas de pontos
  fracos (N), status desconhecido, UUID inválido e manifesto sem chaves (N) são recusados sem
  pânico. Ids duplicados são recusados (`duplicate_key_ids_are_rejected`, T). Observação sem
  impacto: `is_weak` não rejeita pontos de ordem mista (A + torção), que a especificação não
  exige rejeitar; a chave vem do servidor, não de quem ataca.
- **Campos e tamanhos:** `version` u8; `event_tag` u32 aleatório de `getrandom::u32()` com
  índice único e até 8 novos sorteios em conflito (`events.rs:280-287`, L;
  `init.sql:61`); `key_id` u8 com `check (key_id between 0 and 255)`; `ticket_number` u32 ≥ 1 no
  formato, limitado a 9 999 999 pelo servidor (`routes/mod.rs:63`). Zero é recusado antes da
  assinatura mesmo quando assinado (`a_signed_ticket_number_zero_is_still_malformed`, N).
- **Colisão de `event_tag` (aniversário em 2³²):** 1 000 eventos: 0,012 %; 10 000: 1,2 %;
  50 000: 25 %; 77 000: 50 %. Mas colisão **nunca existe no banco**: `qr_tag` é `unique` e a
  inserção sorteia de novo (a chance de 8 sorteios seguidos colidirem com 100 000 eventos é
  8,6 × 10⁻³⁸). Consequências no código: na portaria o `event_tag` só é comparado com o do
  próprio evento (`crates/ticket-core/src/verify.rs:133`), então "outro evento" é por tag e nunca há dois
  eventos com o mesmo tag no mesmo ambiente; em `/conferir` a busca `where qr_tag = $1`
  (`crates/server/src/routes/verify.rs:133`) devolve no máximo uma linha; numa série cada data sorteia o seu
  (`copy_event` → `insert_event`, `series.rs:184`, T). O único caso real é um evento excluído
  liberar o tag para um evento novo: um ingresso antigo apareceria como **INVÁLIDO** (assinatura)
  em vez de amarelo "outro evento"; probabilidade de 10⁻⁶ por evento com 5 000 excluídos, sem
  impacto de segurança. Staging e produção não compartilham portaria.
- **256 gerações de `key_id`:** rotação é operação de desastre (perda ou comprometimento), uma
  ou duas por evento no pior caso; sobra. O desenho faz sentido: `retired` continua verificando
  (e `jobs::issuers` continua assinando com ela para reexportar lotes antigos), `revoked` é
  recusada antes da assinatura (`revoked_and_unknown_keys_are_rejected_before_signature_check`,
  T). A implementação é o A-03.
- **O que não vai no QR vem de fonte autenticada:** data, sessão (`sessions`), categoria
  (`categories` por faixa de números), lugar (`seats`) e cancelamentos chegam pelo manifesto,
  sob HTTPS e o segredo do celular (`DoorDevice`, `door.rs`), nunca do QR; o app só usa o número
  verificado para procurar nessas tabelas (`logic.ts`, `wrongDoor`, `categoryOf`, `seatOf`, L).
  No ingresso digital e em `/conferir`, tudo vem do servidor pela sessão ou pela assinatura
  (L, T).

### 4.2 Codificação e parsing

- Base45 estrito: alfabeto só maiúsculo, comprimento ≡ 1 (mod 3) rejeitado, triplo > 65 535 e
  par > 255 rejeitados (`base45.rs:63-88`, L). Canonicidade provada exaustivamente para todos os
  pares e triplos (`every_short_chunk_is_canonical`, T) e por propriedade (`base45_is_canonical`,
  T; alvo `decode`, F). Exemplos da RFC 9285 (T).
- Comprimento fixo de 111 **bytes** antes de decodificar (`payload.rs:191`): um texto de 1 MiB
  é recusado sem alocar; 109 ASCII + um caractere de dois bytes passa pelo comprimento e cai no
  alfabeto (`oversized_and_non_ascii_texts_are_malformed_without_decoding`, N). Espaço, quebra
  ou BOM em volta: malformado (N; vetores `trailing-newline`, `lowercase`, `truncated`, T).
  Versão desconhecida: todos os 255 valores ≠ 1 (`every_version_byte_but_v1_is_malformed`, N).
- Sem pânico: `#![deny(clippy::indexing_slicing)]` no crate, `unwrap`/`expect`/`panic`
  proibidos; aritmética de `decode` cabe em u32 (máximo 91 124); `from_bytes` desestrutura um
  array fixo (L). Fuzzing com `cargo-fuzz`/libFuzzer: alvo `decode` 13,9 milhões de execuções
  em 151 s, alvo `door` 150 mil em 181 s (cada uma com verificação Ed25519), sem pânico, sem
  entrada aceita indevidamente, sem admissão de texto arbitrário e sem número admitido duas
  vezes (F). `proptest` novo: `arbitrary_text_is_never_admitted`, `long_payloads_round_trip`
  (N).

### 4.3 Custódia das chaves

- **Aleatoriedade:** semente e nonce de `getrandom::fill` (`keys.rs:74`, `:99`, `:173`), o
  gerador do sistema; `uuid::new_v4` idem (L).
- **Selagem:** XChaCha20-Poly1305 com nonce aleatório de 24 bytes (unicidade por aleatoriedade,
  2¹⁹² possibilidades; sem contador para falhar) e AAD `"ingressoimpresso:event-key:v1" ||
  event_id || key_id` (`keys.rs:13`, `:78-115`, L). Testes: ida e volta, outra chave mestra,
  outro evento, outro `key_id`, bit alterado e blob curto são recusados; nonces frescos
  (`keys.rs` testes, T; `the_public_key_column_matches_the_sealed_seed`, N). Dados do ingresso
  digital selados sob outra AAD com propósito e id da linha (`seal_data`, T).
- **Zeroização e logs:** `MasterKey` zera no `Drop` e imprime `<redacted>`; sementes em
  `Zeroizing`; `SigningKey` da dalek com `zeroize`; `Config::Debug` omite segredos (T);
  `EventSigningKey::Debug` só mostra a chave pública (T). Nenhuma macro `tracing::` em
  `verify.rs`, `tickets.rs` ou `door.rs` (grep, E). Produção recusa as chaves mestras de teste
  do repositório (`config.rs`, T).
- **Chave mestra, backup e restauração:** vive só no ambiente do Render e no gerenciador de
  senhas; o backup cifrado com `age` nunca a contém (L, `backup.yml`). Com outra chave mestra, a
  API sobe e os ingressos já impressos continuam verificando (chave pública na tabela), mas
  nenhum lote novo é assinado, nenhum arquivo é regerado e **nenhum ingresso digital abre**
  (`tickets::open` desela o token e o QR). Não há `rewrap` nem checagem (A-03, M-04).
- **Quem chega a `sign_numbers`/`issuers`:** `jobs::generate` (exportações:
  `b.status = 'paid'` e sem cancelamento ativo, `jobs.rs:254`); `tickets::create`,
  `create_bulk`, `send_for_seller` e `replace`, todos via `issuable()` (pago e não cancelado);
  `door_rehearsal` e as prévias usam só `TicketQr::Sample` (grep de `TicketQr::Signed`,
  `TicketIssuer` e `sign_numbers` no servidor, E). Lote `refunded` não é `paid` e ainda ganha
  um cancelamento permanente que `voids::undo` recusa (`refunds.rs:61`, `voids.rs:123-130`, L).
  Só lotes `awaiting_payment` podem ser cancelados (`batches.rs:591-622`, L), então uma faixa
  já assinada nunca volta a ser sorteada para outro lote. Número não emitido não ganha link nem
  passa em `/verify` (`unpaid_numbers_are_never_signed`, N).
- **`ticket-wasm` sem `signing`:** `cargo tree --locked -p ticket-wasm --target
  wasm32-unknown-unknown -e features -i ticket-core` lista apenas `ticket-core feature "default"`
  e `"serde"` (E); `just wasm` compila só `-p ticket-wasm`, sem unificação de features com o
  servidor. E `signing` é uma feature sem dependências: mesmo ligada por engano, o crate
  `ticket-wasm` não expõe nenhuma função que construa `EventSigningKey`.

### 4.4 Cópias e várias datas

`copy_event` chama `insert_event` (`events.rs:440-470`), que sorteia um `qr_tag` novo e gera
uma semente nova (`events.rs:310-316`); nunca copia `event_signing_keys`, lotes, faixas ou links
da portaria (L; `series.rs:184`, T: tags diferentes). Um ingresso de uma data na porta de outra é
`OtherEvent` pelo tag (vetores `other-event`, `other-event-reverse`, T) e, mesmo com tag igual,
`BadSignature` pelo UUID (`tag-collision`, T). O manifesto diz qual sessão é (`sessions`, T em
`series.rs`), e isso nunca libera a entrada (`viewOf`, T em `portaria-logic.test.ts`).

### 4.5 Portaria

- **Decisões** (`door.rs` do core, L; 29 vetores, T): deduplicação por `BTreeMap<TicketNumber,
  EntryInfo>` dentro de um `Door` que é de um evento (invariante 3); no servidor, chave primária
  `(event_id, ticket_number)` em `entries` e a mesma precedência cancelado > já entrou > entra
  (`record_scan`, L; `scans_are_classified_once_across_phones`, T). Cancelados: faixas inteiras
  do manifesto, inclusive os permanentes de estorno (invariante 10). Chave revogada: recusada
  antes da assinatura. Outra sessão: por tag. Porta por categoria: regra do app, antes do
  `checkIn`, registrada como `rejected_wrong_door` e passível de exceção auditada (`exception`).
  Modo ensaio: só `evaluate`, nada gravado nem enviado, nunca verde para ingresso real (T em
  `portaria-features.test.ts`).
- **Atomicidade:** `Door::check_in` avalia e grava a entrada no mesmo passo, em um ambiente de
  uma thread (`check_in_admits_each_ticket_at_most_once`, T; alvo `door` modo 3, F); o app
  serializa leituras com `#scanning` e grava scan e entrada numa só transação do IndexedDB
  antes de mostrar o resultado (`storage.recordScan`, L). Exceção: A-04.
- **Manifesto e cursor:** o cursor é `xid8` e só saem linhas abaixo do `xmin` do snapshot
  (`entries_between`, L; `door_cursor.rs`, T); o cliente deduplica por `scanId` e o `DoorCore`
  converge para a entrada mais antiga em qualquer ordem (`entries_converge_in_any_order`, T;
  relógios extremos, N). Um cursor forjado por um celular só prejudica o próprio celular.
  Campos novos do manifesto são ignorados por apps antigos (`ignores_unknown_manifest_fields`,
  T).
- **Celular comprometido, segredo vazado, link vazado:** não falsificam (só a chave pública);
  registram leituras falsas (`admitted` para qualquer número, inclusive com hora no passado,
  que outros celulares passam a considerar a primeira entrada), até a revogação; não apagam
  nada (G-Set) nem mexem em leituras de outros celulares (`scan_conflict`, T); leem o manifesto
  (A-05). O registro por link é limitado a 50 celulares e por endereço. Coincide com o ADR 0007,
  com a adição do A-05.
- **Tabela §5.3:** além da linha 4 (cópias em celulares diferentes, ambos offline), faltam:
  cópia no mesmo celular em até 5 s depois de um verde que saiu sozinho (A-02); celular com
  armazenamento quebrado (A-04); e vale explicitar que "um celular só, offline" inclui o caso
  de o celular ser recarregado (a entrada está no IndexedDB, então continua bloqueada).

### 4.6 Amostras e prévias

`sample_qr_text()` é Base45 de `[0x00, 0xFF × 73]` = `"U50" + "FGW"×36` (`render.rs:252`;
`SAMPLE_QR_TEXT`, `logic.ts:45`; `sample_qr_text_is_the_door_constant`, T). O byte de versão
`0x00` cai em `UnsupportedVersion` antes de qualquer outra coisa (`payload.rs:171`): nenhuma
chave, tag ou estado faz a amostra passar (`the_sample_qr_is_the_shared_constant_and_never_a_ticket`,
N, inclusive sob uma porta com tag `0xFFFFFFFF` e `key_id` `0xFF`, e com o byte de versão
forçado para 1, que vira `BadSignature`). As prévias, a folha de ensaio e o editor usam só
`TicketQr::Sample` com marca d'água (`events.rs:1182`, `door_rehearsal.rs:70`, L); o único
caminho que produz `TicketQr::Signed` é `jobs.rs` (e `tickets::render_image`, que reutiliza o QR
assinado na criação do link).

### 4.7 Conferência pública

Ver S-02. Verificado: decodificação tolerante só a quebras e espaços em volta (nunca dentro),
sem logar o texto; `not_ours` para tudo o que não verifica; `private` só depois da assinatura;
limite 30/10 min por endereço (`one_address_checks_only_a_few_tickets`, T); `no-store`.

### 4.8 Ingresso digital

É o mesmo QR v1 (`a_link_shows_the_signed_ticket` verifica o `qrText` com as chaves do evento,
T), assinado uma vez em `sign_numbers` (`prepare_links`, L) e guardado selado com o token
(`seal_data`, AAD com o id do link). O token tem 256 bits de `getrandom`, vai no fragmento
(`link_url`, L) e no corpo de `POST /api/ticket`; no banco fica o SHA-256. **Se o link vazar:**
quem o tem vê o QR (uma cópia: a primeira leitura entra, a outra é barrada), o nome do portador,
a categoria, a mesa e o lugar, o mapa das mesas sem os outros nomes, os dados e o contato da
organização, se o ingresso já entrou e quando (`entered_at`), e o estado (cancelado). Revogar o
link fecha a página, não o QR (o ADR 0030 diz isso). O JPEG com o QR fica em cache no disco
por até 30 dias (`TICKET_IMAGE_MAX_AGE`), como os PDFs por 24 h: dado do limite "comprometimento
do servidor".

### 4.9 Robustez física

Ver M-03: versão 5, correção M, 0,556 mm por módulo a 25 mm e 0,489 mm a 22 mm; Q e H custam
duas e três versões a mais. Na tela, `ticket-pass.ts:240` usa M também. Leitura de ida e volta
gerar → rasterizar → decodificar (`rqrr`) → verificar já é testada no `render` (T).

### 4.10 Evolução

O byte de versão é o primeiro e é verificado antes do número (`payload.rs:171`); um v2 com
outro comprimento cai antes ainda em `WrongTextLength`. Os dois caminhos levam a `Malformed`,
nunca a aceitação parcial: celulares antigos **rejeitam** v2, de forma segura mas indistinguível
de falsificação (M-01). O `DoorEventDto` ignora campos desconhecidos, então o manifesto pode
anunciar formatos futuros sem quebrar apps antigos.

## 5. Lacunas de teste e testes acrescentados

### Testes acrescentados (todos rodam no `just check`, salvo os PoCs, que são explícitos)

| Arquivo | O que fixa |
|---|---|
| `crates/ticket-core/tests/audit.rs` (12 testes) | todos os bytes de versão ≠ 1 são malformados; a amostra é a constante compartilhada e nunca é um ingresso, mesmo com versão forçada; número zero assinado continua malformado; textos gigantes e não ASCII sem decodificar; espaço inicial em exatamente 6 valores de tag, nunca no fim; os 8 pontos de torção e 2 codificações não canônicas recusados como chave pública; manifesto com status desconhecido, UUID inválido ou sem chaves; relógios `i64::MIN/MAX` na regra da primeira entrada; 256 `key_id` com o cabeçalho vinculando cada um; propriedades: qualquer mutação de bytes é recusada, texto arbitrário nunca entra, Base45 de até 4 KiB faz ida e volta |
| `crates/ticket-core/fuzz/` (`cargo-fuzz`, nightly) | alvo `decode` (Base45 e parser: sem pânico, canônico) e alvo `door` (texto arbitrário na porta, mutações de ingresso real, DTOs do manifesto a partir de JSON arbitrário, sequências de leituras com admissão única). Rodar: `cd crates/ticket-core && cargo +nightly fuzz run decode` (e `door`). Não entram no CI (exigem nightly) |
| `crates/server/tests/audit_qr.rs` | PoC do A-01 (`#[ignore]`, falha hoje); a coluna `public_key` bate com a semente selada e a selagem é presa à linha; número não pago nunca ganha link nem passa em `/verify` |
| `apps/web/test/portaria-engine-audit.test.ts` | o motor admite e grava a leitura original; PoC do A-02 (só com `AUDIT_POC=1`, falha hoje) |
| `crates/ticket-core/Cargo.toml`, `Cargo.lock` | `curve25519-dalek` como dependência de teste (pontos de torção) |

### Resultados nesta auditoria

- `just test-rust`: 679 testes passaram, 0 falharam, 1 ignorado (o PoC do A-01), em um Postgres
  16 local. `cargo run -p ii-cli -- vectors check` e `just generated-check`: arquivos gerados em
  dia. `cargo clippy --all-targets --all-features -D warnings` e `cargo fmt --check`: limpos.
- Fuzzing: `decode` 13 931 136 execuções em 151 s, `door` 150 225 em 181 s, sem achados.
- `just wasm` e as checagens JS (`pnpm -r run typecheck`, `lint`, `test`): limpas; 67 testes do
  pacote `ticket-core-wasm` (vetores contra o WASM, implementação independente) e 210 do web
  passaram, 1 pulado (o PoC do A-02 sem `AUDIT_POC`).
- Experimento Node (`zxing-wasm` 3.1.5 + `uqr` 0.1.3): texto com espaço inicial lido idêntico.

### Lacunas que ficam

1. **Ensaio com celulares reais** (Android e iPhone, modo avião): critério da fase 4, ainda
   pendente; cobre S-01, M-03 e a invariante 8 na prática.
2. **Rotação e revogação de ponta a ponta no servidor** (A-03): não há teste porque não há
   código.
3. **Integridade das chaves no banco** (A-01/M-04): o teste do PoC vira regressão quando a
   correção entrar.
4. **`X-Forwarded-For` com vários saltos** (S-02): um teste de `client_ip` com a cadeia real do
   Render.
5. **Motor da portaria:** o PoC do A-02 é o primeiro teste do `DoorEngine` fora do e2e; vale
   cobrir também a falha de armazenamento (A-04) com o mesmo esqueleto de mocks.
6. **Fuzzing contínuo:** os alvos existem, mas nenhum job os roda. Um job semanal de 10 min com
   o corpus versionado em `crates/ticket-core/fuzz/corpus` seria barato.

## 6. Mudanças de formato

**Nenhum achado exige um formato v2.** Os campos, os tamanhos, a codificação, a mensagem
assinada e as regras de rejeição do v1 resistiram à análise e aos testes. O que falta é ao redor
do formato: autenticar a chave pública publicada (A-01), fechar a janela de releitura (A-02) e
implementar as operações de chave (A-03).

Uma única decisão vale ser escrita antes do congelamento, porque restringe formatos **futuros**
sem mudar um byte do v1: reservar o byte de versão `0x00` e definir como um celular antigo
trata uma versão desconhecida. Rascunho, para o próximo número livre (0082), a aceitar ou
descartar pelo mantenedor:

> # 0082. Versões reservadas do QR e leitura de versão desconhecida
>
> - **Status:** Proposto (rascunho da auditoria `docs/auditorias/qr-v1.md`)
> - **Data:** 2026-10-14
> - **Complementa:** 0003 (formato v1), 0018 (portaria PWA), 0067 (modo ensaio)
>
> ## Contexto
>
> O v1 será congelado. A amostra das prévias e da folha de ensaio é um payload com byte de
> versão `0x00`, reconhecido pelo texto exato nos dois lados (`sample_qr_text`,
> `SAMPLE_QR_TEXT`). Nada impede um formato futuro de escolher `0x00` e dar à amostra uma
> interpretação válida. E um celular com o app antigo mostra qualquer versão desconhecida como
> **INVÁLIDO**, o mesmo que uma falsificação, sem pedir atualização.
>
> ## Decisão
>
> 1. Os bytes de versão `0x00` e `0xFF` ficam **reservados para sempre**: nunca identificam um
>    formato válido. `0x00` continua sendo a amostra. Um teste no `ticket-core` fixa a regra.
> 2. Um formato novo usa o próximo byte livre a partir de `0x02` e **outra string de domínio**
>    na assinatura (`ingressoimpresso:ticket:v2`); o v1 não muda.
> 3. Antes de qualquer v2 circular, o `DecisionDto` ganha o motivo `unsupported_version`
>    (vermelho "VERSÃO NOVA: atualize o app"), gerado quando `DecodeError::UnsupportedVersion`
>    traz um byte não reservado. Versões reservadas continuam `malformed`. O wrapper
>    (`decision.ts`) e o WASM saem na mesma versão do produto.
> 4. O manifesto pode anunciar `formats: [1, 2]`; apps antigos ignoram o campo
>    (`ignores_unknown_manifest_fields`).
>
> ## Consequências
>
> - O v1 fica congelado como está; a amostra nunca vira ingresso em nenhum formato.
> - Celulares antigos passam a distinguir "ingresso de um formato que não conheço" de
>   "falsificação", e a portaria sabe que precisa atualizar antes do evento.
> - Nenhum vetor muda agora; o v2, quando existir, ganha o próprio arquivo de vetores.

## Anexo: como reproduzir

```
# Rust (precisa de Postgres em DATABASE_URL para os testes do servidor)
just test-rust
cargo run -p ii-cli -- vectors check
cargo test -p ticket-core --all-features --test audit
cargo test -p ingressoimpresso-server --test audit_qr -- --ignored      # PoC do A-01: falha hoje

# Fuzzing (nightly)
cargo install cargo-fuzz && cd crates/ticket-core
cargo +nightly fuzz run decode -- -max_total_time=120
cargo +nightly fuzz run door -- -max_total_time=180

# Portaria
AUDIT_POC=1 pnpm --filter @ingressoimpresso/web exec vitest run test/portaria-engine-audit.test.ts   # PoC do A-02: falha hoje

# Prova de que o WASM nunca compila `signing`
cargo tree --locked -p ticket-wasm --target wasm32-unknown-unknown -e features -i ticket-core
```
