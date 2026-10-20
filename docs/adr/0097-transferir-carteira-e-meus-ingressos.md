# 0097. Transferir o ingresso digital, carteiras do celular e "Meus ingressos"

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0030](0030-ingresso-digital.md) (ingresso digital) e
  [0061](0061-ingresso-do-vendedor-e-segunda-via.md) (segunda via)

## Contexto

Quem comprou e não vai mais precisava pedir ao organizador para "passar" o ingresso. Quem vai
queria o ingresso na carteira do celular, e quem tem vários ingressos não achava o link no
WhatsApp na hora da entrada.

## Decisão

- **Transferir:** no ingresso digital, o portador digita o nome de quem recebe; o servidor cria um
  link novo (token novo, selado como os outros) e o antigo passa a responder `410
  ticket_transferred` (`ticket_links.transferred_at`, `transfer_count`, `transferred_from`). O
  número e o QR continuam os mesmos (invariante 11): não há nova assinatura, e a porta não muda.
  No máximo três transferências seguidas; o organizador desliga por evento
  (`events.ticket_transfers`, aba Digitais).
- **Carteiras:** com as credenciais da plataforma, o ingresso oferece **Adicionar à Apple Wallet**
  (um `.pkpass` com assinatura PKCS#7 destacada feita com `ring`, `wallet.rs`) e **Salvar no
  Google Wallet** (um JWT RS256 de uma conta de serviço). Os dois mostram o mesmo QR v1, em data e
  local do evento, e aparecem sozinhos no dia. Sem as variáveis `APPLE_WALLET_*` ou
  `GOOGLE_WALLET_*` o botão não aparece. O token do link vai no corpo da requisição, nunca na URL.
- **Meus ingressos:** os ingressos já abertos ficam no aparelho (o mesmo armazenamento do modo
  offline, por hash do token) e `/ingresso` sem fragmento lista os próximos primeiro; abrem sem
  internet. Para reabrir com dados novos, o token do link é guardado cifrado com uma chave AES-GCM
  que o navegador cria e nunca deixa sair (`extractable: false`, `lib/my-tickets.ts`). Um ingresso
  cancelado ou transferido sai da lista; "Esquecer" apaga só do aparelho.

## Consequências

- Uma transferência é definitiva para quem passou: o link antigo não volta a abrir.
- Um `.pkpass` ou um passe do Google já salvo continua mostrando o QR mesmo depois de transferido
  o link; como o QR é o mesmo, só uma entrada vale (deduplicação por número, invariante 3).
