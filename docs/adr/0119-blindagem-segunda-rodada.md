# 0119. Blindagem, segunda rodada: abusos sem sessão, dinheiro, portaria e limites

- **Status:** Aceito
- **Data:** 2026-10-22
- **Complementa:** [0047](0047-blindagem-da-plataforma.md) (primeira rodada), [0028](0028-emails-html-e-cota.md)
  (cota de e-mail), [0104](0104-contestacoes-de-pagamento.md) (contestações), [0076](0076-indique-e-ganhe.md)
  (indicações), [0024](0024-precos-acessiveis-e-ingressos-gratis.md) (ingressos grátis), [0055](0055-equipe-do-evento.md)
  (equipe), [0042](0042-moderacao-de-imagens.md) (moderação), [0048](0048-csp-com-nonce.md) (CSP),
  [0037](0037-configuracoes-da-plataforma.md) (manutenção)

## Contexto

Uma segunda auditoria de segurança de ponta a ponta (API, painel, portaria, renderização, CI e
deploy), feita em 2026-10-22 com o produto inteiro implementado, não achou nenhuma brecha crítica:
as invariantes do `CLAUDE.md` seguem de pé, os tokens são aleatórios e guardados só como hash, as
assinaturas são conferidas em tempo constante, e cada rota de evento passa por `event_access`.
O que apareceu foram caminhos de abuso que, isolados, não derrubam uma invariante, mas que uma
pessoa mal-intencionada usaria:

- **O organizador desfazia o bloqueio de uma contestação.** O bloqueio dos números de um lote
  contestado (ADR 0104) era um cancelamento comum em `ticket_voids`; `POST /api/voids/{id}/undo`
  o desfazia, e o admin não conseguia bloquear de novo (`dispute_already_blocked`). Durante as
  semanas da contestação os ingressos voltavam a entrar.
- **Um celular registrado na portaria dizia o que quisesse.** `POST /api/door/scans` aceitava
  qualquer número até 2 bilhões, qualquer chave e qualquer hora (de 1970 a 9999): um link de
  portaria vazado bastava para "entrar" todos os números do evento (os portadores de verdade viam
  "JÁ ENTROU"), cobrar a bilheteria por entradas falsas e lotar o local.
- **Um estranho bloqueava o login por e-mail de qualquer pessoa.** Os erros de código eram contados
  por e-mail, não por quem errava: dez chutes trancavam a vítima por uma hora. A janela de cinco
  códigos por 15 minutos também era por e-mail, então pedir códigos para a vítima a impedia de
  pedir o dela.
- **A cota diária de e-mail era de quem chegasse primeiro.** Códigos de login para contas
  conhecidas e convites à equipe (40 por hora por conta, para qualquer endereço, com o texto do
  organizador) contavam na cota inteira: esgotá-la parava os e-mails de lote pago, de alerta e de
  todo mundo.
- **Ingressos grátis por caixa de e-mail, não por conta.** `me+1@gmail.com`, `me+2@gmail.com`…
  cada um criava uma organização com os 30 ingressos grátis da tabela, assinados e imprimíveis.
- **Indicação com estorno.** O crédito da indicação (ADR 0076) só era retirado até o saldo: gasto
  em lotes e com o lote qualificador estornado, ficava; e o crédito de um lote podia ser devolvido
  duas vezes (preço zerado pelo admin e depois estorno).
- **Pequenas fugas:** a conferência pública dizia se um QR era autêntico mesmo com a conferência
  desligada no evento; a página do vendedor mostrava links digitais que ele não mandou (os de uma
  transferência do portador, inclusive); a cotação de lote revelava saldo de crédito e cupom a
  quem só cuida da porta; convidar alguém à equipe dizia na hora se o e-mail tinha conta; pedir
  um código com cadastros fechados dizia se o e-mail existia; a exclusão da conta deixava o
  e-mail no histórico dos eventos de outras organizações.
- **Recursos sem teto:** ZIP de certificados montado inteiro em memória (2.000 PDFs, cada um com
  as imagens do design); uploads de arte sem limite por conta, com cada reenvio dos mesmos bytes
  gastando uma análise do Cloud Vision até esgotar o dia (e aí a arte ficava "não verificada" e
  imprimível); eventos, faixas por vendedor ou categoria e links de portaria sem máximo; um
  cabeçalho `Stripe-Signature` com milhares de `v1=` custava um HMAC do corpo inteiro por entrada.
- **Site:** a CSP só era aplicada a caminhos que não terminassem como arquivo estático
  (`.js`, `.json`…), mas `/i/abc.js` ou `/painel/eventos/x.json` são páginas (todo segmento
  dinâmico aceita qualquer texto): quem escolhe a URL da vítima tirava o nonce, o
  `frame-ancestors` e o `connect-src` da página.
- **Manutenção e suspensão** valiam só para quem tem sessão: a portaria, a transferência do
  ingresso e o registro de celular continuavam escrevendo em modo `full`.

## Decisão

### Dinheiro

- **O bloqueio de uma contestação é do admin.** `voids::undo` recusa (`void_locked`) um
  cancelamento apontado por `payment_disputes.block_void_id`, e a lista marca `locked`. Só o
  admin desbloqueia, pela contestação.
- **Ingressos grátis uma vez por caixa de e-mail.** No primeiro login, a forma canônica do e-mail
  (a mesma de `referrals::canonical_email`: sem `+sufixo`, sem pontos no Gmail) vira um hash com
  chave em `known_mailboxes`, que sobrevive à exclusão da conta. A segunda organização da mesma
  caixa nasce com `organizations.free_tickets_eligible = false`: a tabela de preços não dá
  ingressos grátis a ela (o bônus do admin continua valendo).
- **Indicação revogada devolve tudo.** `referrals::revoke` lança o valor inteiro, mesmo que o
  saldo fique negativo: o preço já trata saldo negativo como zero, e os próximos lotes quitam a
  dívida. `credit_balance` deixa de saturar em `i32::MAX`.
- **Crédito de um lote volta uma vez.** `ticket_batches.credit_returned_at` marca a devolução;
  `give_back` só lança a linha quando é a primeira.
- **Pagamento órfão vira alerta** (ADR 0103) em vez de uma linha de log: dinheiro recebido para
  um lote cancelado ou já pago precisa ser devolvido na Stripe.
- **Cotação sem dinheiro** para quem não tem a parte `manage`: `creditBalanceCents` zero e sem
  cupom. **`checkout/sync`** tem 12 chamadas por minuto por conta.
- **Stripe-Signature** com no máximo 8 assinaturas, e só as de 32 bytes são conferidas.

### Portaria

- **O servidor confere os fatos de cada leitura** (`door::check_scan_facts`): um desfecho que
  afirma um QR autêntico (`admitted`, `readmitted`, `exited`, `rejected_used`, `rejected_void`,
  `rejected_wrong_door`/`day`, `benefit_*`, `rejected_not_entitled`) precisa de um número dentro
  de um lote `paid` ou `refunded` do evento (invariante 10) e, se trouxer chave, de uma chave do
  evento; `credential_admitted` precisa de uma credencial do evento. Um lote inteiro de leituras
  com um fato falso é recusado (`invalid_scans`), e o celular fica no log. Leituras inválidas, de
  outro evento ou de credencial recusada não afirmam nada e passam como antes.
- **O relógio do celular** só pode estar errado por dias: hora anterior a 2020 ou mais de 31 dias
  à frente do servidor é recusada (uma leitura "de 1970" tomaria a entrada de todo mundo).
- **Limite por celular:** 240 requisições por minuto no extrator `DoorDevice`; no máximo 60 links
  ativos por evento.
- **Manutenção vale para os escritores com token:** `token_writers_maintenance` em `app.rs`
  aplica `check_request` a `POST /api/door/{register,scans,guests,rehearsal}` e
  `/api/ticket/transfer` (os celulares guardam e tentam depois, invariante 6).

### Identidade e e-mail

- **Erros de código por endereço:** 10 por hora por `(e-mail, endereço)` em memória, com um
  teto de 50 por hora por e-mail como última barreira; o pedido de código é 5 por 15 minutos por
  `(e-mail, endereço)` e 20 por hora por e-mail (a caixa não é inundada).
- **Cota de e-mail dividida:** códigos de login e cadastro usam no máximo três quartos do dia;
  convites à equipe, um quarto, e 20 por hora por conta. O resto fica para lote pago, alertas e
  o que uma conta já fez.
- **`POST /api/auth/code` responde 204 sem mandar nada** para um e-mail sem conta quando os
  cadastros estão fechados, o domínio está bloqueado ou a manutenção é `read_only` (a página de
  login já avisa). Um convite à equipe só dispensa "cadastros fechados": manutenção e domínio
  bloqueado continuam valendo. Um e-mail com dois `@` é recusado.
- **`joined` na equipe** passa a significar "abriu o evento depois do convite" (`joined_at`,
  gravado no login e na primeira visita), não "já tinha conta". **Admins não entram em equipes**
  (`already_admin`): um admin é sempre modo suporte, auditado, mesmo com uma linha em `event_team`.
- **Sessão com validade absoluta** de 90 dias além dos 30 deslizantes; ligar, desligar ou o admin
  zerar a verificação em duas etapas encerra as outras sessões da conta.
- **Exclusão da conta** anonimiza `event_activity` (`actor_email` = "conta excluída"). O nome
  vindo do Google perde caracteres de controle.
- **Link de pronunciamento** sem barra invertida (`/\evil.com` seria `//evil.com`), nos dois lados.
- `GET /api/platform` e `/api/changelog` contam no limite `public-read` (600 por 5 minutos).

### Eventos, uploads e moderação

- **Excluir um vendedor com recebimentos ou fechamentos de caixa** exige a parte `money`.
- **Uploads de arte:** 30 por hora por conta; os mesmos bytes de novo devolvem a linha existente
  sem nova análise (`xmax = 0`); a análise lê os bytes só depois de pegar o permit de render; o
  orçamento diário esgotado vira alerta aos admins (a arte segue "não verificada", como o ADR 0042
  prevê, mas alguém olha a lista de envios recentes).
- **Amostra e prévia do design** recusam arte em revisão ou recusada (`check_printable`); a
  prévia da arte (`art_preview`) recusa a recusada.
- **Tetos:** 500 eventos por organização e 60 criações (ou cópias) por hora por conta; 300 faixas
  por vendedor ou categoria; excluir um evento com uma arte em revisão aberta é recusado
  (`art_under_review`), para a decisão existir e ir para `rejected_art` (invariante 17).

### Site e renderização

- **A CSP é decidida pelo lugar do arquivo, não pela terminação do caminho:** o `matcher` do
  `proxy.ts` exclui só `_next/`, `icons/`, `brand/`, `fonts/`, `modelos/`, `.well-known/` e os
  arquivos de nome fixo (service workers, manifestos, `robots.txt`, `sitemap.xml`, `llms.txt`,
  ícones e imagens de compartilhamento). `X-Frame-Options: DENY` vale para toda resposta pelo
  `next.config.ts`. O `csp.e2e.mjs` cobre `/nao-existe.js`, `/i/abc.json` e afins.
- **ZIP de certificados em disco:** `certificates_zip_to` escreve num `Write + Seek` (um arquivo
  temporário da instância, apagado assim que aberto para a resposta), um PDF em memória por vez,
  com as imagens decodificadas uma vez para o lote todo (`compile_keeping`); acima de 1 GiB
  (imagens × pessoas) a rota recusa (`certificates_too_heavy`). O PDF público de um certificado
  tem 4 por minuto por certificado.
- **`Art::from_bytes` confere as dimensões** (10.000 px de lado, 24 MP) pelo cabeçalho, como o
  upload do servidor: a crate `render` é segura sozinha. Os textos dos crachás têm 200 caracteres e
  o QR 512. A imagem do ingresso digital leva o permit de render para dentro do `spawn_blocking`.
- **Página do vendedor** lista só os links digitais que o próprio vendedor mandou
  (`ticket_links.seller_id`); mandar um ingresso de um número que já entrou é recusado
  (`ticket_entered`). **`POST /api/verify`** lê `events.public_verify` antes de conferir a
  assinatura. `seller_sync_ops` fica 7 dias.

### CI e deploy

- `actions/checkout` com `persist-credentials: false` em todo job (o `gh` usa `GH_TOKEN`);
  permissões por job no workflow **Branches**; `restore-test.sh` passa a URL do banco pelo
  ambiente, nunca pela linha de comando.

## Alternativas consideradas

- **Conferir a assinatura Ed25519 de cada leitura no servidor** (o celular mandaria o texto do
  QR). Fecharia de vez a porta a celulares mentirosos, mas muda o contrato do app (os antigos não
  mandam o texto) e o manifesto; os fatos conferidos agora (número emitido, chave do evento, hora
  plausível) barram tudo o que um celular honesto não produziria. Fica para um ADR futuro se
  aparecer motivo.
- **Recusar a segunda conta da mesma caixa de e-mail.** Simples, mas há usos legítimos (uma
  pessoa cuidando de duas organizações). Negar só os ingressos grátis atinge exatamente o abuso.
- **Segurar o crédito da indicação por N dias** antes de lançar. Mais código e um estado a mais
  para o organizador entender; a devolução integral com saldo negativo tem o mesmo efeito
  econômico com o que já existe.
- **Contar erros de código só por endereço**, sem teto por e-mail. Abriria força bruta a quem tem
  muitos endereços (5 chutes por código × 5 códigos por 15 minutos); o teto de 50 por hora
  mantém a chance em menos de 0,2% por dia.
- **Marcar como "em revisão" toda arte sem análise com o orçamento esgotado.** Travaria a
  impressão de organizadores de boa-fé num dia de ataque; o alerta aos admins mantém a revisão
  manual que o ADR 0042 já prevê.

## Consequências

- Uma migração: `ticket_batches.credit_returned_at`, `known_mailboxes` e
  `organizations.free_tickets_eligible`. Contas antigas da mesma caixa de e-mail seguem como
  estão (só as novas perdem os grátis).
- `TeamMemberDto.joined` muda de significado; o painel mostra "entrou" quando a pessoa abriu o
  evento. `BatchQuoteDto` segue igual, com zeros para quem não coordena.
- Um ensaio de portaria com números fora dos lotes pagos passa a ser recusado: o ensaio usa a
  amostra (`SAMPLE_QR_TEXT`), que nunca é gravada, então nada muda para ele.
- O que fica para o mantenedor: nada obrigatório. Opcionalmente, fixar por digest as imagens
  `postgres:17`/`postgres:18` do CI e do backup (o Dependabot só vigia `/deploy`).
