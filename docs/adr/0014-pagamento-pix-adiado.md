# 0014. Pagamento Pix adiado para depois do MVP

- **Status:** Substituído por [0020](0020-pagamento-stripe.md)
- **Data:** 2026-10-08

## Contexto

O organizador paga por lote via Pix. O primeiro cliente sou eu (a banda), e a integração com um
PSP envolve conta PJ ou MEI, credenciais, webhooks, conciliação e testes em sandbox. Nada disso é
necessário para validar o produto num show real.

## Opções consideradas

1. **Integrar um PSP já no MVP** (Efí, Mercado Pago, Asaas, API Pix de banco). Atrasa o MVP em
   semanas, sem benefício para o primeiro uso.
2. **Pix estático (BR Code gerado por nós) + confirmação manual.** Sem terceiros, mas a
   conciliação é manual. Serve para os primeiros clientes externos.
3. **Sem cobrança no MVP.** O lote nasce como `awaiting_payment` e o admin o marca como pago
   (`POST /api/admin/batches/{id}/mark-paid`).

## Decisão

Opção 3 no MVP. O modelo de dados já separa `ticket_batches.status` e reserva a tabela
`payments`, então nada muda na geração.

Na fase 6, decidiremos o PSP num ADR próprio. Critérios:

- cobrança dinâmica com `txid` e webhook assinado;
- taxa por Pix;
- exigência de CNPJ;
- qualidade da API e do sandbox;
- prazo de repasse.

A opção 2 continua como degrau intermediário, se aparecerem clientes antes da fase 6.

## Consequências

- A invariante de segurança "só lotes pagos são assinados" vale desde o primeiro dia. O "pago" do
  MVP é uma ação explícita do admin.
- A precificação (preço por faixa de quantidade) fica para a fase 6.
