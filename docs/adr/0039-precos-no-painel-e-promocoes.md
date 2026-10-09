# 0039. Preços editáveis pelo painel e promoções

- **Status:** Aceito
- **Data:** 2026-10-09
- **Substitui:** a parte "preços mudam no código" do [0024](0024-precos-acessiveis-e-ingressos-gratis.md)

## Contexto

Os preços viviam em constantes de `pricing.rs` e os ingressos grátis em `FREE_TICKETS`: qualquer
ajuste exigia commit e deploy, sem histórico e sem aviso aos clientes. Também não havia como fazer
uma promoção por tempo limitado.

## Decisão

- **`price_tables`** guarda versões da tabela: faixas (JSON validado pela API), valor mínimo,
  ingressos grátis e `effective_at`.
  - Vale a última versão com `effective_at <= now()`. Uma versão futura é "anunciada": o site
    avisa a data.
  - O admin cria versões pelo painel, com uma prévia de quanto custam lotes de exemplo antes e
    depois. Só há uma versão futura de cada vez, e ela pode ser retirada antes de começar.
  - Ao criar, o admin pode publicar um pronunciamento (ADR 0038) com a tabela nova e a data.
  - A migração semeia a tabela do ADR 0024. A variável `FREE_TICKETS` deixa de existir.
- **Lotes guardam o preço do momento** (como no ADR 0020) e agora também como ele foi feito:
  `list_price_cents`, `promotion_id`, `discount_cents`, `credit_cents` e `price_table_id`.
- **Promoções** (`promotions`) dão um desconto percentual em todos os lotes entre `starts_at` e
  `ends_at`. Se houver mais de uma, vale a maior.
- **Ordem do cálculo** (`pricing::price`):
  1. ingressos grátis;
  2. preço da tabela (com o mínimo);
  3. a maior entre promoção e cupom de desconto (a promoção ganha o empate, e o cupom fica
     guardado);
  4. crédito.
  A Stripe não cobra menos de R$ 0,50: um resto menor fica no crédito, se houver, ou é perdoado.
- `POST /api/events/{id}/batches/quote` mostra a conta antes de criar o lote. O cálculo de
  verdade continua só no servidor.

## Consequências

- O preço de um lote nunca muda depois de criado, mesmo se a tabela mudar.
- O painel e a landing mostram a tabela em vigor, a promoção e a data dos preços anunciados.
