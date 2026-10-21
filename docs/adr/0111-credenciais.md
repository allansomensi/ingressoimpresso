# 0111. Credenciais para staff, imprensa e artistas

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0003](0003-formato-qr-v1.md) (formato do QR), [0092](0092-pontos-de-controle.md)
  (pontos de controle) e [0091](0091-evento-de-varios-dias.md) (vários dias)

## Contexto

Quem trabalha no evento (staff, produção, segurança), a imprensa e os artistas entram sem ingresso.
Hoje a organização imprime ingressos "de cortesia" para eles (que contam como público e somem no
acerto) ou confia no "ela é da banda" na porta. Também não há como deixar a imprensa no palco e
o artista no camarim sem abrir esses lugares para todo mundo.

## Opções consideradas

1. **Cortesias** (ADR 0096): contam como ingresso e como público, valem um dia, e não dizem a
   função.
2. **Lista de nomes** (ADR 0070): não tem QR nem área, e a pessoa precisa ser achada pelo nome a
   cada passagem.
3. **Credenciais com QR do próprio evento**: um número fora da faixa dos ingressos, assinado com a
   chave do evento, que a portaria reconhece pelo manifesto.

## Decisão

Opção 3, nos eventos de ingressos.

- **Dados:** `event_credentials (number, name, role, organization, color, entrance, revoked_at)`
  e `credential_checkpoints` (as áreas). O número começa em **2.000.000.001** e cresce por
  evento; ingressos param em 9.999.999 (`MAX_TICKET_NUMBER`), então nunca se cruzam. O crachá
  mostra o código `C-0001`.
- **QR:** o mesmo formato v1 (ADR 0003), assinado com a chave ativa do evento, só em
  `jobs::sign_credentials`, na hora de imprimir os crachás de credenciais não revogadas. O
  formato, os vetores e o núcleo não mudam: para o `DoorCore` é um número como outro, autêntico
  ou não.
- **Limite:** uma credencial entra de graça, então cada evento tem 20, mais uma a cada 10 ingressos
  pagos, até 500. A invariante 2 passa a ser: só lotes pagos **e credenciais dentro do limite** são
  assinados.
- **Crachá:** PDF A4 com quatro crachás de 10 × 14 cm e linhas de corte (`render::badges_pdf`,
  `templates/badge.typ`): evento, faixa colorida com a função, nome, empresa, QR, código e áreas.
  Texto do usuário só como dado (invariante 5).
- **Na portaria:** o manifesto leva `credentials` com versão (como a lista de nomes, ADR 0070),
  só quando mudam. O celular confere a assinatura com o `DoorCore` (sem registrar nada nele) e
  decide pela lista: **CREDENCIAL · IMPRENSA** (verde, na cor da função) na entrada quando ela
  abre a entrada e num ponto de controle quando ele é uma das áreas, em **qualquer dia**;
  "SEM ACESSO AQUI", "CREDENCIAL REVOGADA" ou "NÃO RECONHECIDA" em vermelho. A leitura é gravada
  no IndexedDB antes da tela (invariante 6) com os desfechos `credential_admitted` e
  `rejected_credential`; não há deduplicação, então a mesma credencial passa quantas vezes for
  preciso. Ensaio e conferência não gravam.
- **Servidor:** os desfechos de credencial exigem um número de credencial, e só eles (constraint
  `scans_credential_number_check`); nunca viram entrada (`entries`), nem livro, nem lotação
  (ADR 0110), nem relatório. O Ao vivo mostra quantas passaram e quantas foram barradas.
- **Conferir ingresso** (ADR 0075): um QR de credencial responde "É uma credencial da equipe,
  não um ingresso".
- **Painel:** seção **Credenciais** no grupo Pessoas (parte `door` da equipe): criar, editar,
  revogar, reativar e imprimir todos ou um crachá.

## Consequências

- A equipe passa em qualquer dia e só onde deve, sem virar público nem cortesia.
- Um crachá perdido é revogado e barrado na próxima sincronização; o novo sai com outro número.
- Um celular que ainda não recebeu uma credencial nova diz "não reconhecida" até sincronizar.
