# 0075. Conferir ingresso antes de comprar

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0003](0003-formato-qr-v1.md) (formato do QR), [0064](0064-perfil-da-organizacao.md)
  (perfil da organização) e [0065](0065-adiar-ou-cancelar-o-evento.md) (adiar ou cancelar)

## Contexto

Ingresso de show independente, formatura e festa de igreja muda de mão: quem não vai repassa, e
quem compra de outra pessoa não tem como saber se o papel (ou a foto no WhatsApp) é verdadeiro, se
o número foi cancelado, ou se o evento mudou. O QR já carrega uma assinatura Ed25519 que só a
chave do evento produz; falta deixar qualquer pessoa conferir, sem ensinar quem copia ingressos a
escolher quais cópias ainda entram.

## Opções consideradas

1. **Conferir no navegador, com o `DoorCore` e um manifesto público.** Rápido e offline, mas
   publicaria as chaves públicas e a lista de cancelamentos de todo evento, e o navegador precisaria
   achar o evento pelo tag do QR: dá para enumerar eventos.
2. **Conferir no servidor, só a assinatura e o estado do número e do evento.** Uma requisição por
   QR, limitada por endereço; o servidor só revela o evento a quem tem um QR assinado de verdade.
3. **Dizer também se o número já entrou.** Ajudaria o comprador honesto, mas é exatamente o que
   quem faz cópias quer saber (quais delas ainda passam). E vaza o comportamento de quem comprou.

## Decisão

Opção 2.

- **`POST /api/verify`** (sem login, texto no corpo, fora dos logs de acesso; limite de 30 por 10
  minutos por endereço, `ratelimit::VERIFY`). O servidor decodifica o QR v1 com o `ticket-core`,
  acha o evento pelo `qr_tag` e confere a assinatura com as chaves públicas do evento (a mesma
  conta da portaria). Um espaço é caractere do base45: o texto é tentado como veio, depois sem
  quebras de linha e só então aparado.
- **Resposta**: `verdict` e, para um QR autêntico de evento que permite, o evento (nome, data no
  horário do evento, local, endereço, adiamento/cancelamento), a organização (nome, logo e contatos
  públicos do perfil), o número como impresso e a categoria. Os veredictos, do mais importante para
  o menos: `event_canceled`, `ticket_canceled` (número com cancelamento ativo: perda, segunda via,
  estorno), `event_over`, `event_postponed`, `valid`; fora deles, `private` (o organizador desligou)
  e `not_ours` (mal formado, tag desconhecido, chave revogada ou assinatura inválida, sem dizer qual).
- **Nunca** "já usado", nunca quem comprou, nunca o id do evento. A página diz com honestidade:
  *autêntico não quer dizer único*; uma cópia também aparece como autêntica e só a primeira leitura
  entra. Nada do que se confere é guardado.
- **Por evento**, `events.public_verify` (ligado por padrão), na aba Digitais do evento
  (`GET|PUT /api/events/{id}/verify-settings`, parte `delivery` da equipe). Desligado, a resposta é
  só `private`, sem nenhum dado do evento.
- **Página `/conferir`** (indexável, no rodapé e no sitemap, com JSON-LD de FAQ e imagem de
  compartilhamento): câmera, foto ou texto colado. A câmera e a foto usam o leitor da portaria
  (`src/portaria/camera.ts`, zxing-wasm servido pela nossa origem, invariante 8), carregado só
  quando se abre a câmera ou se escolhe a foto, sem o service worker da portaria; a imagem nunca sai
  do aparelho. Colar o link de um ingresso no celular (`/ingresso#…`) explica o que fazer, sem
  enviar o token. A CSP com nonce (ADR 0048) vale como em qualquer página e `e2e/csp.e2e.mjs`
  passa a visitá-la.

## Consequências

- Um evento qualquer não pode ser descoberto: sem um QR assinado, a resposta é sempre `not_ours`.
- Um QR copiado continua "autêntico" aqui; a defesa contra cópia segue sendo a portaria (primeira
  leitura entra). A página não promete mais do que isso.
- O formato do QR e os vetores não mudam; a conferência só lê.
