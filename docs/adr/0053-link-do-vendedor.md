# 0053. Link do vendedor: as vendas marcadas pelo próprio vendedor

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Com o acerto (ADR 0050), o organizador sabe quanto cada vendedor deve e quanto já passou, mas
não sabe quantos ingressos ele de fato vendeu até o vendedor devolver o que sobrou. O vendedor,
por sua vez, controla as vendas no canhoto ou de cabeça. O relatório também misturava as coisas:
o card "Vendidos" somava todos os ingressos emitidos, inclusive os que nem tinham vendedor.

## Opções consideradas

1. **Conta para cada vendedor**, com login e permissões: completo, mas pede que membros da banda,
   alunos e amigos criem conta para marcar meia dúzia de vendas.
2. **O organizador marca as vendas** que os vendedores contam: não tira o trabalho de ninguém.
3. **Um link pessoal por vendedor**, sem conta, como o link da portaria (ADR 0007) e o do
   ingresso digital (ADR 0030).

## Decisão

Opção 3.

- **Link:** `seller_links` guarda só o `sha256` do token e uma cópia selada com a chave mestra
  (`keys::seal_data`, propósito `seller-link`), para o organizador mandar o mesmo link de novo. O
  token vai no fragmento (`/vendedor#token`) e no corpo das requisições, nunca na URL do
  servidor. Um link ativo por vendedor; gerar outro desativa o anterior; desativar não apaga as
  vendas marcadas.
- **Página do vendedor** (`/vendedor`, sem índice): os números que ele tem nos lotes pagos, o que
  já marcou, o que devolveu ou perdeu, o acerto (como o organizador vê) e os pagamentos
  registrados. Toca num número, ou digita vários (`12, 15, 20-25`), e marca como vendido, com o
  nome e o telefone do comprador se quiser (a coluna da folha de controle; numa rifa, de quem é
  cada número). Uma venda marcada por engano é desfeita.
- **API sem sessão:** `POST /api/seller`, `POST /api/seller/sales` e `POST /api/seller/sales/undo`,
  com limite por endereço (`SELLER_VIEW`, `SELLER_WRITE`). As escritas respeitam o modo de
  manutenção e a organização suspensa. Só números do vendedor, em lote pago e não cancelados;
  marcar de novo atualiza o comprador.
- **`ticket_sales`**: uma marca por número (`(event_id, ticket_number)`), com o vendedor. É a
  palavra do vendedor, não um pagamento: o acerto continua sendo levou − devolveu − perdeu. Uma
  devolução ou uma faixa tirada do vendedor apaga as marcas daqueles números.
- **Painel:** no cartão do vendedor, criar, enviar pelo WhatsApp, copiar, abrir, gerar outro e
  desativar o link; a linha "X de Y marcados como vendidos"; na devolução, o atalho "os que não
  foram marcados como vendidos".
- **Relatório:** "Emitidos" (com quantos estão com vendedores) e "Vendidos" (as vendas marcadas)
  ficam separados; a tabela do acerto mostra "Acerta" e "Marcou vendidos", só com os vendedores e
  o total deles; os ingressos sem vendedor viram uma nota com o atalho para entregá-los.
- **Dados pessoais:** nomes e telefones de compradores entram na exportação da conta e saem com o
  vendedor, o evento ou a conta (ADR 0033).

## Consequências

- O organizador acompanha as vendas sem ligar para cada vendedor, e a devolução do que sobrou vira
  um toque.
- Quem tiver o link marca vendas no nome do vendedor: a página avisa que o link é pessoal, e o
  organizador pode gerar outro a qualquer momento.
- A página do vendedor precisa de internet (diferente da portaria): marcar vendas não é uma
  decisão de porta.
