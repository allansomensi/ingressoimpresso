# 0041. Registro de e-mails e painel de envios

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0028](0028-emails-html-e-cota.md)

## Contexto

`mail_sends` só contava envios para a cota. Quando alguém dizia "o código não chegou", não havia
como saber se o e-mail saiu, se a Resend recusou ou se caiu no spam.

## Decisão

- `mail_sends` passa a guardar o destinatário, o assunto, o status (`sending`, `sent`, `failed`,
  `quota`, `delivered`, `delivery_delayed`, `bounced`, `complained`), o id da Resend e o erro.
  - Os dígitos do assunto de códigos são mascarados: quem lê o painel não consegue entrar na conta
    de ninguém.
  - Linhas somem em 30 dias. Excluir a conta apaga o endereço dos registros dela.
- Recusas pela cota ficam registradas como `quota` e não contam na cota.
- **Webhook da Resend** (`POST /api/resend/webhook`): a Resend assina com Svix (`svix-id`,
  `svix-timestamp`, `svix-signature`, HMAC-SHA256 com a chave de `RESEND_WEBHOOK_SECRET`).
  - Aceitamos até 5 minutos de diferença de relógio.
  - O status nunca volta atrás: uma devolução não vira "entregue".
- O painel mostra o uso da cota nas últimas 24 h, envios por dia (14 dias), contagens por status e
  por tipo, a lista com busca e filtros, e um botão de teste que envia para o próprio admin.

## Consequências

- Sem `RESEND_WEBHOOK_SECRET`, o status para em "enviado".
- Guardar o destinatário por 30 dias é legítimo interesse (suporte e prevenção de abuso) e consta
  na Política de Privacidade.
