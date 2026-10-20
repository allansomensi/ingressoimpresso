# 0096. Aviso para os vendedores, comissão e cortesias com controle

- **Status:** Aceito
- **Data:** 2026-10-20
- **Complementa:** [0050](0050-acerto-com-vendedores.md) (acerto),
  [0053](0053-link-do-vendedor.md) (link do vendedor) e [0058](0058-prestacao-de-contas.md)
  (prestação de contas)

## Contexto

Três combinados com os vendedores viviam fora do produto: o recado do acerto ("sábado às 10h na
secretaria"), a comissão de quem vende e as cortesias que a diretoria ou a banda distribuem sem
controle, que depois aparecem como dívida de algum vendedor.

## Decisão

- **Aviso:** um texto de até 280 caracteres (`events.seller_notice`, `seller_notice_at`), escrito na
  seção Vendedores (parte `delivery`), aparece fixo no topo do link de cada vendedor.
- **Comissão:** percentual (pontos-base, 0,01% a 100%) ou valor por ingresso
  (`sellers.commission_kind`/`commission_value`), para um vendedor ou para todos de uma vez (parte
  `money`). É descontada do que o vendedor entrega no acerto, no relatório, no resumo do WhatsApp
  e no link dele; a prestação de contas mostra o total das comissões. Bilheteria não tem comissão.
- **Cortesias:** a organização cadastra quem pode autorizar (`courtesy_givers`, com limite
  opcional) e dá cortesias com o número, para quem e o motivo (`courtesies`). O número entra na
  porta como qualquer outro e vale zero no acerto: o vendedor que estava com ele não o deve, e o
  relatório conta as cortesias à parte, por quem autorizou. Só números pagos e não cancelados.
- Todas as rotas que alteram algo estão em `team::need` (tabela `LATER`).

## Consequências

- O acerto passa a refletir o combinado real; o organizador não precisa de planilha paralela.
- Uma cortesia dada a um número que já foi vendido é recusada: não há como "desvender" pelo
  caminho da cortesia.
