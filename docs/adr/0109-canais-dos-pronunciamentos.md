# 0109. Canais dos pronunciamentos: sininho, janela e e-mail

- **Status:** Aceito
- **Data:** 2026-10-21
- **Substitui:** a escolha "só no sininho" ou "janela ao entrar" do [0038](0038-pronunciamentos-e-notificacoes.md)
- **Complementa:** [0107](0107-pronunciamentos-por-email.md) (pronunciamentos por e-mail)

## Contexto

Um pronunciamento aparecia no sininho ou, além dele, numa janela ao entrar no painel (`display`).
O e-mail (ADR 0107) era um passo à parte, depois de publicar. Não dava para mandar só por e-mail
(um aviso para quem não entra no painel) nem só a janela, e quem queria os três precisava lembrar
de enviar o e-mail depois.

## Decisão

- Três canais independentes, em qualquer combinação, pelo menos um: `announcements.bell`,
  `announcements.modal` e `announcements.email_audience` (+ `email_tag` para `tagged`). A coluna
  `display` sai; a migração leva `modal` para `modal = true` (a janela continuava no sininho, então
  `bell = true` para todos os antigos).
- **Sininho:** a lista e o contador de não lidos só têm os pronunciamentos com `bell`.
- **Janela:** abre ao entrar no painel quando `modal`, com ou sem sininho.
- **E-mail:** a audiência é escolhida no próprio pronunciamento. Ele entra na fila (a mesma do ADR
  0107, com a cota e o descadastro) quando está publicado e começou: na hora, ao publicar; se
  começa depois, por um temporizador (início em menos de um dia) e pela verificação de hora em hora
  do worker. `email_queued_at` garante uma vez só; depois do envio, o canal e a audiência ficam
  fixos (outra audiência continua por **Enviar por e-mail**).
- O anúncio de preços novos (ADR 0039) escolhe os mesmos canais; o e-mail dele vai para todas as
  contas.

## Consequências

- Um aviso de manutenção pode ir só por e-mail, e uma novidade pode ir aos três de uma vez.
- `AnnouncementDisplay` sai da API; o painel antigo em cache recebe `bell`/`modal` e simplesmente
  não mostra a janela até recarregar.
