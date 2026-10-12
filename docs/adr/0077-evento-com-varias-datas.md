# 0077. Evento com várias datas

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0027](0027-ciclo-de-vida-do-evento.md) (duplicar),
  [0055](0055-equipe-do-evento.md) (equipe), [0060](0060-interface-pensada-para-o-celular.md)
  (lista de eventos) e [0034](0034-resultados-e-financeiro.md) (resultados)

## Contexto

A peça da escola tem sessão na sexta, no sábado e no domingo; a banda faz duas noites no mesmo
bar; a igreja repete a cantata. Hoje o organizador duplica o evento (ADR 0027) e acaba com três
eventos soltos: "Peça (cópia)", "Peça (cópia) (cópia)", sem uma visão de quanto a temporada
vendeu, nem de quanto cada vendedor deve somando as noites. E quem compra não vê no ingresso que
ele vale só para uma das sessões.

Ao mesmo tempo, cada data precisa continuar inteira: a portaria da sexta não pode deixar entrar
o ingresso do sábado, os números de cada noite são vendidos e acertados separadamente, e uma
sessão pode ser adiada ou cancelada sem mexer nas outras.

## Opções consideradas

1. **Um evento com várias datas dentro** (números, lotes e portaria por data dentro do mesmo
   evento). Exigiria mudar o modelo de faixas, o relatório, a portaria, o acerto e o formato do
   QR (ou usar a mesma chave para todas as datas, o que faria o ingresso de uma noite entrar em
   outra). Inaceitável.
2. **Só duplicar, sem ligação.** Não muda nada; nenhuma visão da série.
3. **Cada data é um evento inteiro, ligado aos outros por uma série** (`event_series`). Tudo o que
   existe para um evento continua valendo para cada data; a série só agrupa, dá o nome comum e
   soma.

## Decisão

Opção 3.

- **Dados:** `event_series (id, organization_id, name)` e `events.series_id` (nulo para evento
  de uma data). Uma série tem sempre duas datas ou mais: excluir ou tirar a penúltima desfaz a
  série (a última data segue sozinha). Até 60 datas por série.
- **O que é de cada data** (é um evento como qualquer outro): nome, local, endereço, datas, fuso,
  preço, ingresso desenhado e arte, categorias, mesas, vendedores, equipe, lotes, números,
  cancelamentos, arquivos, ingressos no celular, links e celulares da portaria, lista de nomes,
  acerto, prestação de contas, adiamento, cancelamento e arquivamento. **Chave de assinatura e
  `qr_tag` são de cada data**: um ingresso de uma data nunca entra na portaria de outra
  (invariante 3 e ADR 0027 valem como estão; o formato do QR não muda).
- **O que é da série:** só o nome comum e o agrupamento.
- **Adicionar outra data** (`POST /api/events/{id}/dates`, com início e fim): cria um evento com a
  configuração da data de onde se parte, exatamente como duplicar (ADR 0027, mesma função
  `copy_event`): ingresso (última versão, com a arte e os patrocinadores, respeitando a
  moderação), categorias com as faixas, mesas sem lugares marcados, vendedores sem números,
  equipe e as chaves do evento (vendedores mandam ingressos, conferência pública). Nunca lotes,
  faixas de vendedores, links da portaria ou arquivos. A nova data leva o **nome da série** e
  não ganha "(cópia)". A primeira vez cria a série com o nome do evento. Recusa data igual a outra
  da série (`date_taken`), data já passada (`invalid_dates`) e a 61ª data (`series_full`).
- **Nome:** renomear a série (`PUT /api/series/{id}`) renomeia junto as datas que ainda têm o
  nome antigo da série; uma data renomeada à parte ("Cantata · sessão extra") fica com o nome
  dela. Renomear uma data pelo formulário do evento não muda a série.
- **Tirar desta série** (`POST /api/events/{id}/series/leave`): a data segue sozinha com tudo o
  que tem.
- **Excluir, arquivar, cancelar, adiar:** por data, com as regras de sempre (ADRs 0027, 0065).
  Uma data arquivada continua na página da série e sai do grupo da lista principal.
- **Quem pode:** adicionar data, tirar da série e renomear são da organização (como duplicar e
  excluir): `team::need` não mapeia essas rotas, e o teste `requests_map_to_areas` registra isso.
  A equipe vê a página da série só com as datas em que está (o resto aparece como "você vê 1 de 3
  datas"). Um admin em modo suporte vê todas; renomear entra na auditoria (`support_write`).
- **Página da série** (`GET /api/series/{id}`, `/painel/series/[id]`): as datas lado a lado
  (emitidos, vendidos com a barra contra os emitidos, entradas, a receber, recebido, custo dos
  lotes e resultado), a linha de total e os **vendedores somados por nome** (espaços e
  maiúsculas não importam). Os números vêm do relatório de cada data (`report::build`), com os
  preços de cada categoria e a regra da bilheteria (ADRs 0056, 0069); a série não tem conta
  própria. No celular, cada data é um cartão.
- **Lista de eventos:** as datas de uma série aparecem juntas num cartão (folhas empilhadas,
  "3 datas · próxima 17/10 20h"), no lugar da data que pede atenção primeiro, sem quebrar a ordem
  do ADR 0060; o cartão abre a série e desdobra as datas, cada uma com a sua fase e o seu "faltam
  N" (ADR 0078). Se só uma data da série está no filtro (as outras arquivadas), ela aparece como
  evento comum.
- **"Sessão de 12/11 às 20h"** onde importa saber qual data é: no ingresso no celular, na página
  do vendedor, em `/conferir` (com "este ingresso vale só para esta sessão") e no cabeçalho da
  portaria. Na portaria, o manifesto traz `sessions` (tag e início das outras datas): um
  ingresso de outra data continua recusado como "outro evento", mas a tela diz **INGRESSO DE
  OUTRA DATA · Sessão de 13/11 às 20h: só entra nessa data**. O painel mostra "Data 2 de 3 · Ver
  todas as datas" no cabeçalho do evento.
- **LGPD:** exportar a conta traz a série de cada evento; excluir a conta apaga os nomes das
  séries junto com os nomes dos eventos.

## Consequências

- Nada muda para quem não usa: um evento de uma data não tem série.
- O ingresso desenhado depois de criar as datas não se propaga: cada data edita o seu. Quem quer
  o mesmo ingresso em todas desenha antes de adicionar as datas (o diálogo diz o que vem junto).
- A página da série calcula o relatório de cada data (uma ida ao banco por consulta do relatório,
  vezes as datas); com o limite de 60 datas e alguns milhares de números por data, cabe.
- Vendedores somados por nome dependem de o nome ser o mesmo: os vendedores copiados mantêm o
  nome, então só uma pessoa cadastrada à mão com outro nome aparece em duas linhas.
- `DoorEventInfo` passa a vir no fuso do evento (antes em UTC), para a portaria mostrar a hora
  local; o app só usa as datas para mostrar.
