# 0071. Portaria ao vivo

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0006](0006-portaria-offline-sync.md) e [0055](0055-equipe-do-evento.md).

## Contexto

No dia, o organizador quer saber de longe quantos entraram, se a fila andou, se algum celular
ficou sem sinal com leituras paradas e se apareceram cópias. A aba Portaria mostra links e
celulares; o Relatório mostra o acerto. Falta uma tela feita para acompanhar a noite.

## Opções consideradas

1. **Atualizar o Relatório sozinho.** Pesado (expande todos os números) e cheio de dinheiro.
2. **WebSocket/SSE.** A API roda numa instância só e o Neon dorme; uma conexão aberta por pessoa
   não compensa para números que mudam a cada poucos segundos.
3. **Um endpoint de leitura e consulta a cada 10 s**, pausada com a aba escondida.

## Decisão

Opção 3: `GET /api/events/{id}/door/live`, lido por qualquer pessoa da equipe.

- **Conteúdo:** emitidos, vendidos (sem devolvidos nem perdidos), entradas, primeira e última;
  entradas por janela de 5 minutos da última hora (12 janelas; depois do fim do evento, a última
  hora com entradas); entradas por porta (link, com as categorias) e por celular; por categoria;
  cópias barradas, cópias que entraram sem sinal, inválidos, outro evento, cancelados barrados e
  que entraram, porta errada e liberadas; lista de nomes (nomes, pessoas, chegadas); bilheteria
  (vendidos, valor, cortesias).
- **Celulares:** o app manda `pending=<n>` ao baixar o manifesto (leituras e chegadas por
  enviar); o servidor guarda `door_devices.pending_scans` e `last_sync_at` (escrita no máximo a
  cada 10 s, salvo se o número mudar). O painel alerta quem está "sem sincronizar há mais de
  5 minutos" e mostra pendentes e ensaio. Apps antigos não mandam `pending`: o valor fica nulo e
  vale o último contato.
- **Painel:** aba **Ao vivo** no grupo "No dia" (React Query, `refetchInterval` de 10 s, sem
  atualizar em segundo plano) e um cartão na visão geral no dia do evento (de 6 h antes do início
  a 6 h depois do fim).
- **Gráficos** (skill de visualização): a curva é uma série só, em colunas de no máximo 24 px na
  cor da marca, com ponta arredondada de 4 px, grade fina com marcas limpas, o pico rotulado,
  dica por coluna no toque, no mouse e no foco, e uma tabela escondida para leitores de tela. A
  lotação é um medidor (marca sobre um tom claro da mesma cor). Por porta e por categoria são
  barras de uma cor só; a cor da categoria aparece só no ponto ao lado do nome. A cor da marca
  passou no validador de paleta nos dois temas.

## Consequências

- Uma leitura a cada 10 s por pessoa olhando, com consultas por índice (`entries`, `scans`,
  `guest_arrivals`); o Relatório continua sendo a conta fechada.
- O alerta de 5 minutos depende do relógio do navegador do organizador.
