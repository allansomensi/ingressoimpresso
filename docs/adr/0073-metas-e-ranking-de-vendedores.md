# 0073. Metas e ranking de vendedores

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0053](0053-link-do-vendedor.md).

## Contexto

Formaturas, bandas e igrejas dividem a meta do evento entre os vendedores ("cada um vende 20").
Uma barra de progresso anima quem vende, e muitos grupos gostam de uma competição saudável; outros
não querem expor ninguém. O nome completo dos colegas, ao lado das vendas, é dado pessoal que o
vendedor não precisa ver.

## Opções consideradas

1. **Ranking sempre visível, com nomes:** expõe quem vende pouco e quem não quer aparecer.
2. **Só a meta, sem ranking:** perde o estímulo que muitos grupos pedem.
3. **Meta sempre (se definida) e ranking opcional, desligado por padrão, só com primeiro nome e
   inicial.**

## Decisão

Opção 3.

- **`sellers.goal`** (1–100.000, opcional). `PUT /api/sellers/{id}/goal` e
  `POST /api/events/{id}/sellers/goals` ("meta de 20 para todos", com a opção de só preencher quem
  não tem), na parte `delivery` da equipe. A bilheteria (ADR 0069) não tem meta nem ranking.
- **`events.sellers_ranking`**, desligado por padrão, em `seller-settings` (o corpo do `PUT` passa
  a ter campos opcionais: o que falta fica como está).
- **Progresso** = vendas marcadas no link (não canceladas): é a única medida em tempo real; o
  acerto (levou − devolveu) só fecha no fim.
- **Ranking:** entram os vendedores com números em lote pago, sem a bilheteria; mais vendas
  primeiro, empate divide a posição ("1º, 2º, 2º, 4º") e é listado pelo nome; ninguém tem posição
  antes da primeira venda. O vendedor vê a própria posição e os 5 primeiros, com o nome reduzido
  no servidor ("Ana S.", `seller_goals::short_name`): o nome completo dos outros nunca sai da API.
- **Painel:** a visão **Ranking e metas** na aba Vendedores (todos, com nome completo e a barra da
  meta), o botão **Meta para todos** e a chave **Mostrar o ranking aos vendedores**; a meta de
  cada um no cartão.

## Consequências

- O organizador acompanha quem está perto da meta sem planilha.
- Um grupo que não quer competição simplesmente não liga o ranking.
- O ranking reflete o que foi marcado no link: quem não usa o link aparece com zero.
