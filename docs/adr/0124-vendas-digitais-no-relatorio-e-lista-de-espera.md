# 0124. Vendas digitais no Relatório e lista de espera na página do evento

- **Status:** Aceito
- **Data:** 2026-10-30
- **Complementa:** [0050](0050-acerto-com-vendedores.md) (relatório e acerto),
  [0058](0058-prestacao-de-contas.md) (prestação de contas), [0095](0095-pagina-publica-do-evento.md)
  (página do evento), [0123](0123-evento-so-no-celular.md) (evento só no celular)

## Contexto

Depois do ADR 0123, um evento pode vender tudo pelo celular, sem vendedor. O Relatório só sabia
contar vendas por vendedor: o ingresso enviado pela equipe aparecia como "sem vendedor" e não
entrava no recebido, então a prestação de contas mostrava receita zero num evento lotado.

Quando um evento esgota, as pessoas continuam perguntando no WhatsApp. A página pública só dizia
"Esgotado", e o organizador não sabia quantas pessoas ainda queriam ingresso, nem para quem ligar
se alguém desistisse.

## Opções consideradas

1. **Tratar a equipe como um vendedor fictício.** Reaproveitaria o acerto, mas criaria um
   vendedor que ninguém cadastrou, com link, meta e ranking sem sentido.
2. **Contar à parte as vendas digitais da organização.** Um número pago, fora de todo vendedor,
   não cancelado, com um link ativo, é uma venda da organização pelo preço da sua categoria
   (cortesia vale zero).
3. **Lista de espera fora da plataforma** (um link de formulário). Simples, mas sem saber a
   categoria nem ligar o nome ao envio do ingresso.

## Decisão

Opção 2 para o relatório e uma lista de espera própria na página do evento.

- **Relatório:** `report::digital_by_category` conta os ingressos digitais da organização (sem
  vendedor, com link não revogado, lote pago, sem cancelamento) por categoria; o DTO ganha
  `digital` (ingressos, abertos, entradas, cortesias, valor, Pix já registrado e livres) e uma
  coluna "Digitais" por categoria. Num evento só no celular, os números ainda não enviados são
  estoque livre, não "vendidos". A prestação de contas soma as vendas digitais ao recebido, menos
  o Pix já registrado em `ticket_payments` (sem contar duas vezes).
- **Lista de espera:** `waitlist_entries` (nome, WhatsApp, quantidade de 1 a 10, categoria
  opcional) e `events.public_waitlist` (ligada por padrão). `POST
  /api/public/events/{slug}/waitlist` sem login, com limite por endereço (`ratelimit::WAITLIST`),
  campo-isca contra robôs e teto de 2.000 nomes por evento; só aceita uma categoria esgotada (ou o
  evento todo esgotado). O mesmo WhatsApp na mesma categoria atualiza a linha e mantém a posição.
- **No painel:** a lista aparece em Digitais com a procura por categoria, e "Enviar" abre o envio
  já preenchido (categoria, quantidade, nome e WhatsApp); enviado, a pessoa sai da fila. O
  telefone só aparece para quem cuida da entrega (`delivery`). As linhas são apagadas 60 dias
  depois do evento e entram na exportação de dados da conta.

## Consequências

- Um evento só no celular tem receita, prestação de contas e "a receber" verdadeiros.
- Quem chegou tarde deixa o nome e sabe a posição na fila; o organizador vê se vale outro lote.
- O WhatsApp de quem espera é dado pessoal guardado por pouco tempo, como o do ingresso digital.
