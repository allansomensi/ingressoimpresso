# 0118. Lembretes por e-mail, marca móvel no certificado e revisão para produção

- **Status:** Aceito
- **Data:** 2026-10-22
- **Complementa:** [0107](0107-pronunciamentos-por-email.md) (envio e descadastro),
  [0114](0114-certificado-com-editor.md) e [0116](0116-tour-de-boas-vindas-e-marca-do-certificado.md)
  (certificado e tour), [0055](0055-equipe-do-evento.md) (equipe), [0110](0110-lotacao-do-local.md)
  (lotação)

## Contexto

Antes de uma fase longa sem recursos grandes, o produto precisava de quatro coisas:

- chamar de volta quem começou e parou;
- deixar a marca do certificado fora da moldura;
- ver o certificado como imagem, igual ao ingresso;
- uma revisão de segurança, de erros e de interface, pensada para o celular.

## Decisão

### Lembretes por e-mail (`reminders.rs`)

Há cinco lembretes, e cada um vai uma vez por conta (e por evento, quando é sobre um evento):

| Lembrete          | Quando vai                                                              |
| ----------------- | ----------------------------------------------------------------------- |
| `no_event_first`  | conta com dois dias e nenhum evento                                     |
| `no_event_second` | uma semana depois do primeiro                                           |
| `event_stalled`   | evento com três dias, sem ingressos e ainda por acontecer               |
| `door_setup`      | ingressos gerados, evento em até três dias e nenhum link da portaria    |
| `after_event`     | "como foi?", de meio dia a três dias depois de um evento com ingressos |

Regras do envio:

- **O que já foi:** `reminder_sends` guarda cada envio, com índice único em
  `(user_id, kind, event_id)`. O envio é reservado antes de sair. Se a cota acabar, a reserva é
  apagada e o lembrete tenta de novo depois. Se o envio falhar, fica marcado como falho.
- **Quando sai:** o worker roda de hora em hora, só das 9h às 19h59 de Brasília, com no máximo 20
  por rodada.
- **Cota:** usa só o que a cota do dia deixa depois dos códigos e dos pronunciamentos
  (`mailings::reserve`).
- **Quem recebe:** só quem deixou `users.reminder_emails` ligado. A pessoa desliga em Minha conta
  ou pelo link do rodapé. O token é o mesmo HMAC dos pronunciamentos, com o prefixo `r.`, e
  `List-Unsubscribe` funciona com um clique.

### Certificado

- **Marca móvel:** `CertificateDesign.brandPosition` (`{xMm, yMm}`, opcional, o centro da marca)
  diz onde a marca fica. Sem ele, a marca fica no pé da página. No editor, a marca se arrasta como
  um elemento e encaixa no meio. "Voltar ao pé da página" apaga a posição. A regra
  `BrandOutOfBounds` vale nos dois lados.
- **Prévia em imagem:** `POST /api/events/{id}/certificates/sample-image` (`?back=true` para o
  verso) devolve um JPEG do rascunho com "AMOSTRA" atravessado. O painel monta a imagem com a marca
  do Ingresso Impresso, como "Ver como fica" do ingresso, e dá para baixar a imagem ou o PDF.

### Tour

- O botão "Ver o tour de novo" saiu de Minha conta. O tour aparece uma vez para cada conta nova.

### Revisão de segurança

- A lista de ingressos digitais só mostra o link para quem tem a parte `delivery`.
- O link de um arquivo pede a parte `delivery`.
- Os crachás das credenciais pedem a parte `door`.
- O token de descadastro aparece mascarado nos logs.
- `AppState::blocking_render` leva a permissão de renderizar para dentro do `spawn_blocking`.
  Antes, uma requisição cancelada liberava a vaga com o Typst ainda rodando.
- `routes::heavy_render`: no máximo 6 renderizações pesadas por minuto por conta (ZIP de
  certificados, PDF da prestação de contas, crachás, resumo final).
- Contestações: uma contestação fechada não reabre com um webhook atrasado, e bloquear os números
  relê o estado dentro da transação.

### Correções

- **Pronunciamentos por e-mail:** a contagem de quem recebe ignora os envios pulados ou falhos, e
  enfileirar de novo refaz esses envios.
- **Resumo dos admins:**
  - o destaque usa a contagem real de alertas abertos;
  - a linha da cota mostra a média por dia quando o resumo é semanal.
- **Lotação:**
  - o aviso vale por dia do evento (`capacity_alerted_day`);
  - a lista de nomes enviada por planilha também confere a lotação.
- **Portaria:** no modo Saída, ler uma credencial não grava nada.
- **Sininho:** as notas publicadas antes da conta existir não contam como novidade, porque
  `newsSeenAt` é `greatest(news_seen_at, created_at)`.

### Interface

- **Formulários:**
  - borda dos campos com contraste próprio (`--border-input`);
  - erros de carregamento com "Tentar de novo";
  - diálogos com `aria-labelledby`/`aria-describedby`;
  - números de `Stat` sem corte.
- **Celular:**
  - acerto do vendedor e caixa empilhados;
  - colunas fixas no relatório, com legenda;
  - "Gerar de novo" num arquivo que falhou;
  - rodapé fixo no formulário do evento;
  - nomes das seções "Gerar ingressos" e "No celular".
- **Landing:** seção "Muito além do ingresso", com os recursos por momento do evento (vender,
  entregar, na porta, depois), perguntas novas e o link "Recursos" no menu.

## Consequências

- Uma conta parada recebe no máximo dois e-mails sobre isso, e um evento recebe no máximo três
  lembretes. Nada sai fora do horário nem passa da cota.
- O certificado sai igual no editor, na imagem e no PDF, com a marca onde a pessoa deixou.
- Ficou para depois, para um ADR próprio:
  - digitar o número na portaria quando o QR não lê;
  - setas do teclado nos grupos de opções próprios;
  - trocar o `window.confirm` do app da portaria.
