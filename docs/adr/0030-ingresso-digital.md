# 0030. Ingresso digital: o mesmo ingresso, entregue por link

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0003](0003-formato-qr-v1.md), [0005](0005-custodia-chaves.md) e
  [0015](0015-renderizacao-em-blocos.md)

## Contexto

Nem todo comprador consegue buscar o papel: mora longe, comprou pelo WhatsApp, o vendedor não
cruza com ele antes do evento. O ZIP de imagens para WhatsApp já existia, mas exigia baixar,
descompactar no celular e achar a imagem certa de cada pessoa.

## Opções consideradas

1. **Um formato novo de ingresso digital (outro QR, outra regra na porta).** Quebraria o
   invariante 1 e dobraria a lógica da portaria.
2. **Um link por ingresso que mostra o QR v1 daquele número.** O ingresso é o número; papel ou
   tela são só meios. A porta não muda: a primeira leitura entra, a cópia é barrada.
3. **Carteiras da Apple e do Google.** Exigem certificado, conta de desenvolvedor e manutenção
   por plataforma. Fica para depois.

## Decisão

Opção 2.

- `ticket_links`: um link ativo por número (índice parcial). O token tem 256 bits; a linha guarda
  `sha256(token)` para achar o link e, selados com XChaCha20-Poly1305 sob a chave mestra e
  amarrados ao id da linha, o próprio token (para o organizador copiar o link de novo) e o texto
  do QR. Um dump do banco sozinho não revela nem o link nem o QR.
- O QR é assinado uma vez, na criação, por `jobs::sign_numbers` (as chaves continuam sendo
  desseladas só em `jobs.rs`), e só para números de lotes pagos e não cancelados (invariante 2).
- Organizador: `GET|POST /api/events/{id}/tickets` (número escolhido ou o próximo livre, sem
  vendedor, cancelamento, link ou entrada), `POST /api/events/{id}/tickets/bulk` (até 500, para
  vender on-line, com planilha), `PUT /api/ticket-links/{id}` (nome) e
  `POST /api/ticket-links/{id}/revoke`. A aba "Digitais" envia pelo WhatsApp (`wa.me`); o telefone
  só abre a conversa e não é guardado.
- Comprador: `/ingresso#<token>`. O token fica no fragmento (não chega a servidor, log, métrica nem
  `Referer`) e vai no corpo de `POST /api/ticket`, que devolve o evento, o número, o nome e o QR, e
  conta as aberturas. `POST /api/ticket/image` desenha o ingresso com a arte (Typst, mesmo semáforo
  das prévias). A página guarda o ingresso no `localStorage`, o service worker guarda a página, a
  tela fica acesa (Wake Lock) e "Salvar imagem" gera um PNG no próprio celular.
- Revogar o link só para a página: o QR que a pessoa já viu continua valendo até o número ser
  cancelado. A interface diz isso.

## Consequências

- Se o mesmo número existir no papel e no celular, vale quem chegar primeiro, e o outro é barrado
  como cópia. A aba avisa e sugere números sem vendedor.
- O link funciona enquanto o número valer; quem o recebe pode repassá-lo, como faria com uma foto
  do papel. A porta continua sendo a garantia (dedup por evento e número, invariante 3).
- Aberto uma vez com internet, o ingresso abre sem rede no mesmo navegador. O navegador embutido
  do WhatsApp pode apagar dados: a página recomenda salvar a imagem.
