# 0007. Acesso da portaria sem login

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

Quem trabalha na porta (amigos, voluntários) não terá conta. O organizador precisa compartilhar
um acesso simples, normalmente pelo WhatsApp, e conseguir cortá-lo se vazar.

## Opções consideradas

1. **PIN numérico curto (6 dígitos).** Fácil de ditar, mas força bruta online exige rate limit
   agressivo e o espaço é pequeno.
2. **Link com token longo.** Um toque no WhatsApp, ou o voluntário lê com a câmera o QR do link na
   tela do organizador. São 128 bits de entropia.
3. **Link + aprovação de cada dispositivo pelo organizador.** É o mais seguro, mas exige o
   organizador online e atento na hora de montar a porta.

## Decisão

Opção 2, com registro de dispositivo.

- **Link:** `https://ingressoimpresso.com.br/portaria/#acesso=<token>`. O token fica no
  **fragmento**, então não vai para logs de servidor nem para o `Referer`. No banco fica só o
  `sha256(token)`.
- **Registro:** na primeira abertura, o voluntário dá um nome ao celular ("Porta 1 - João"). O app
  troca o token por `device_id + device_secret`, guardados no IndexedDB e enviados como `Bearer`.
- **Escopo:** o acesso vale só para **um evento**, só para ler o manifesto e enviar leituras, e
  expira em `ends_at + 12 h`.
- **Controle pelo organizador:** no painel, ele vê os dispositivos (último contato, leituras) e
  pode revogar um dispositivo ou o link inteiro, gerando um novo.

## Consequências

- Com o link vazado, alguém consegue baixar a lista de cancelamentos e registrar leituras falsas,
  o que pode marcar ingressos legítimos como usados. Mitigações: a revogação, a auditoria por
  dispositivo no relatório e a expiração. Não é possível falsificar ingressos (ADR 0004).
- A aprovação por dispositivo (opção 3) pode virar uma opção por evento no futuro.
