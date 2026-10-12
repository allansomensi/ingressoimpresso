# 0072. Reservas do vendedor

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0050](0050-acerto-com-vendedores.md), [0053](0053-link-do-vendedor.md) e
  [0069](0069-bilheteria-na-porta.md).

## Contexto

Quem vende na mão separa números para quem prometeu comprar ("guardei o 42 para a Maria até
sexta"). Hoje isso fica no caderno ou na cabeça: o número continua "com você" na página do
vendedor, outro aparelho pode vendê-lo e ninguém lembra a pessoa quando o prazo acaba. O
organizador também não vê quantos números estão prometidos e ainda não pagos.

## Opções consideradas

1. **Marcar como vendido com o nome** e desfazer se a pessoa não pagar: mistura promessa com
   venda e infla o relatório.
2. **Reserva como estado do ingresso na portaria:** errado: reserva não é pagamento, e a portaria
   decide sozinha pelo QR (invariantes 6 e 11).
3. **Reserva como a palavra do vendedor, com prazo**, ao lado das vendas marcadas.

## Decisão

Opção 3.

- **`ticket_reservations`**: uma linha por número (`(event_id, ticket_number)`), com
  `reservation_id` (os números reservados juntos), vendedor, nome e telefone da pessoa, prazo
  (`expires_at`) e `created_by` (o organizador no painel; nulo pelo link). Ativa enquanto
  `expires_at > now()`: a vencida libera os números sozinha, sem depender de job, e a limpeza
  horária (`jobs::prune`) apaga as vencidas há mais de 7 dias (até lá o vendedor ainda vê "1
  reserva vencida" e pode marcar a venda de quem pagou atrasado).
- **Regras** (`routes/seller_ops.rs`, as mesmas no link e no painel): só números do vendedor, em
  lote pago e não cancelados; número vendido não se reserva; número com reserva ativa de outra
  pessoa não se reserva nem se vende (a venda pela própria reserva, com o `reservationId`, vira
  venda e apaga a reserva). A mesma reserva enviada de novo muda nome e prazo. Prazo no futuro,
  antes do fim do evento e em até 120 dias. Evento cancelado não aceita reserva nova (cancelar
  continua valendo).
- **Bilheteria** (ADR 0069) não reserva: vende na porta. Marcar um vendedor como bilheteria apaga
  as reservas e a meta dele.
- **Devolução, segunda via e faixa tirada:** uma devolução ou faixa tirada do vendedor apaga as
  reservas daqueles números (`clear_marks`); números cancelados por outro motivo (segunda via,
  ADR 0061) saem das reservas porque as consultas só contam números do vendedor, pagos, não
  cancelados e não vendidos. Nada disso toca a portaria nem o QR.
- **Prazos no horário do evento** (`utc_offset_minutes`): os atalhos Amanhã, 3 dias e Sexta
  terminam às 23:59 daquele dia onde o evento acontece; "Escolher" abre data e hora.
- **Página do vendedor:** botão **Reservar** ao lado de **Marcar venda**, números reservados em
  amarelo na grade, seção **Reservas** com as que vencem em 24 horas em destaque e o lembrete
  pronto no WhatsApp ("Separei o número 42 do *Show* para você até amanhã, 23:59…"), **Pagou**
  num toque e cancelar.
- **Painel:** `GET /api/events/{id}/reservations`, `POST /api/sellers/{id}/reservations` (tudo ou
  nada), `POST /api/reservations/{id}/sell` e `DELETE /api/reservations/{id}`, na parte
  `delivery` da equipe. No cartão do vendedor, a lista de reservas e o botão **Reservar**.
- **Relatório e acerto:** `ReportRowDto.reserved` e `SellerSummaryDto.reserved` mostram os
  reservados à parte; o acerto continua levou − devolveu − perdeu (reserva não é dinheiro). O
  atalho de devolução "os que não foram marcados como vendidos" deixa de fora os reservados, e o
  resumo do WhatsApp lembra quantos estão reservados.
- **Dados pessoais:** nome e telefone da pessoa entram na exportação da conta e saem com o
  vendedor, o evento ou a conta (ADR 0033).

## Consequências

- O id de uma reserva vem do celular do vendedor; ele só pode crescer uma reserva do mesmo
  vendedor e evento (outro id igual é recusado como inválido), e o painel vende e cancela
  filtrando por evento e vendedor.
- O vendedor para de vender duas vezes o mesmo número prometido e lembra a pessoa na hora certa.
- Uma reserva esquecida não prende o número: o prazo resolve.
- "Com você" na página do vendedor soma livres e reservados (todos ainda estão na mão dele); o
  disponível para vender é só o livre.
