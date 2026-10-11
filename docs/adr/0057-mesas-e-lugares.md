# 0057. Mesas e lugares

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Bailes, jantares e formaturas vendem mesa: cada ingresso tem um lugar numa mesa, e a comissão
monta o mapa do salão.

## Decisão

- `event_tables` (nome, lugares 1–50, formato redondo ou retangular, posição no mapa como fração
  0–1 da largura e da altura) e `ticket_seats` (um lugar por número, um número por lugar).
- Colocar ingressos numa mesa ocupa os lugares livres em ordem; um número já sentado em outra
  mesa só muda com confirmação (`moveSeated`). Diminuir a mesa exige os últimos lugares livres.
- O painel mostra o mapa (mesas arrastáveis, cadeiras ocupadas preenchidas, busca "onde está o
  ingresso") e a lista; "Criar mesas" faz várias de uma vez em fileiras.
- "Mesa 5 · Lugar 3" sai na faixa do ingresso (ADR 0056), no ingresso digital e na portaria,
  para indicar a mesa a quem chega.
- Mesas são da parte Ingressos e vendedores na equipe; duplicar o evento leva as mesas, vazias.

## Consequências

- Não há venda por lugar escolhido pelo comprador: quem organiza distribui (é assim que esses
  eventos funcionam).
