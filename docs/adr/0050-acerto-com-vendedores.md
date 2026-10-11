# 0050. Acerto com vendedores: recebimentos e devoluções

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

O caso mais comum do produto é o de uma banda que manda imprimir 200 ingressos, divide os blocos
entre os membros e outros vendedores e, no fim, cada um volta com o dinheiro e com o que não
vendeu. A plataforma já entregava faixas a cada vendedor e um relatório com o **valor a acertar**
(vendidos declarados × preço), mas não guardava o que cada um já tinha pago. O organizador
continuava com o caderno para saber quem pagou, quanto falta e quem pagou a mais, que é
justamente a parte que gera discussão. Registrar uma devolução também era trabalhoso: a aba
Cancelamentos pedia uma faixa por vez, sem saber de quem eram os números.

## Opções consideradas

1. **Marcar cada ingresso como pago** (uma linha por número): fiel ao canhoto, mas o vendedor
   paga em dinheiro, aos poucos, e ninguém lembra quais números cada nota cobre. Um ingresso
   também não tem linha própria (ADR 0011).
2. **Só um campo "já recebido" por vendedor**, editado à mão: simples, mas sem histórico, sem
   saber se foi Pix ou dinheiro, e um erro de digitação apaga o anterior.
3. **Lançamentos de recebimento por vendedor** (valor, forma, dia e observação), somados no
   relatório, e **devoluções por vendedor** que viram cancelamentos.

## Decisão

Opção 3.

- **Tabela `seller_payments`**: valor em centavos (R$ 0,01 a R$ 1.000.000,00), forma (`pix`,
  `cash`, `other`), dia do recebimento (até amanhã, por causa dos fusos), observação de uma linha
  e quem lançou. São anotações do organizador: a plataforma não movimenta esse dinheiro, e o
  pagamento dos lotes (ADR 0020) continua separado. Um lançamento errado é excluído (com
  confirmação) e lançado de novo; excluir o vendedor exclui os lançamentos dele.
- **Relatório**: cada linha ganha **recebido** e **saldo** (a acertar − recebido). Saldo positivo
  é o que falta receber, negativo é o que foi pago a mais. Os ingressos sem vendedor não têm
  saldo (ninguém responde por eles), e o saldo do total soma só os vendedores. Sem preço no
  evento, o recebido aparece e o saldo fica em branco. Enquanto o vendedor não devolve nada, ele
  responde por todos os números que levou: o saldo cai com dinheiro ou com devolução.
- **Devoluções por vendedor** (`POST /api/sellers/{id}/returns`): vários números de uma vez
  (`12, 15, 40-50`), como devolvidos sem vender ou perdidos. Todos precisam ser do vendedor e
  ainda não estar cancelados; ou todos viram cancelamentos, ou nenhum. Cancelados, são barrados
  na porta como qualquer outro (nada muda no formato do QR nem na portaria).
- **No painel**, a aba Vendedores vira o lugar do acerto: o resumo geral (a receber, recebido,
  falta e quantos estão quitados), e em cada vendedor o progresso do dinheiro, os botões
  **Registrar pagamento** (com "tudo o que falta" num toque) e **Devolução**, o histórico com
  desfazer e o resumo pronto para mandar pelo WhatsApp. O vendedor continua sem conta própria: o
  resumo do WhatsApp é o que ele recebe.
- **Exportar meus dados** (ADR 0033) leva os recebimentos de cada vendedor.

## Consequências

- O acerto inteiro sai do caderno: quem levou quais números, o que devolveu, o que pagou e quanto
  falta, com histórico.
- O preço é o mesmo para todos os ingressos do evento. Meia-entrada, lotes com preços diferentes
  ou comissão de vendedor ficam para quando alguém pedir; até lá, a observação do lançamento e um
  valor menor resolvem.
- O saldo depende das devoluções lançadas: um vendedor que vendeu tudo e ainda não pagou aparece
  devendo o bloco inteiro, que é o certo.
