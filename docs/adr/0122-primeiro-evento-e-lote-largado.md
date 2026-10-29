# 0122. Primeiro evento guiado e lote largado no pagamento

- **Status:** Aceito
- **Data:** 2026-10-29
- **Complementa:** [0116](0116-tour-de-boas-vindas-e-marca-do-certificado.md) (tour),
  [0118](0118-lembretes-marca-movel-e-revisao-de-producao.md) (lembretes),
  [0093](0093-catalogo-ampliado-de-modelos.md) (modelos), [0020](0020-pagamento-stripe.md)
  (pagamento)

## Contexto

O funil do admin (ADR 0099) mostrava que muita gente cria a conta e vai embora sem criar um
evento, e quem cria um evento muitas vezes não chega a desenhar o ingresso. Olhando o caminho de
uma conta nova:

- o tour de boas-vindas tinha como ação principal "Começar o tour": seis cartões sobre partes do
  painel (Resultados, sininho, conta) antes do primeiro passo de verdade;
- a lista de eventos vazia era um título e um botão;
- depois de criar o evento, a pessoa caía na visão geral, longe do ingresso;
- aplicar um modelo só mudava o rascunho: quem saía da página sem tocar em Salvar perdia o
  ingresso, e o evento continuava "sem ingresso" no funil;
- o lembrete de conta sem evento só saía dois dias depois.

E no admin, um lote pedido, levado à Stripe e não pago continuava "Aguardando" por dias, sem
dizer que a pessoa largou o pagamento, e ninguém era avisado.

## Decisão

### Primeiro evento

- **Lista vazia vira "Primeiros passos"** (`components/panel/first-event.tsx`): os três passos
  (evento, modelo, gerar), os ingressos grátis que sobram e a pergunta "Que tipo de evento?" com
  oito atalhos (show, festa, formatura, escola, igreja, rifa, esporte e fichas de consumo), além
  de "Outro tipo de evento" e "Ver os modelos antes".
- **Um atalho preenche o formulário** (`EventPreset`): o tipo (ingressos ou fichas) e um nome de
  exemplo no campo. Nada além disso: o formulário é o mesmo de sempre.
- **O primeiro evento vai direto para o ingresso:** depois de criado, o painel abre
  `/painel/eventos/{id}?aba=ingresso&modelos=<categoria>` (`todos` sem atalho). O editor abre a
  galeria na categoria do atalho e tira o `modelos` da URL, para um recarregamento não abri-la de
  novo. Só vale enquanto o ingresso nunca foi salvo.
- **O primeiro modelo já fica salvo:** aplicar um modelo num ingresso nunca salvo salva na hora,
  se o design não tem problemas (`designIssues`). Daí em diante, salvar volta a ser manual.
- **O tour começa pelo evento:** a ação principal das boas-vindas é "Criar meu primeiro evento",
  que fecha o tour (registrado como `finished`) e leva o foco à pergunta "Que tipo de evento?".
  "Conhecer o painel" segue o tour de antes; "Agora não" pula.

### Lembretes

- `no_event_first` sai com **um dia** de conta, não dois. O segundo continua uma semana depois.
- Lembrete novo, `unpaid_batch`: um lote de evento ainda por acontecer (mais de um dia), pedido há
  mais de um dia, com preço, sem pagamento em andamento na Stripe e sem checkout aberto no último
  dia. Vai uma vez por evento, com o botão "Pagar o lote" (`?aba=lotes`). Enquanto houver um lote
  assim, `event_stalled` não vai: o lembrete do lote já diz o que falta.

### Lote largado no admin

O estado do lote não muda: ele segue `awaiting_payment`, com os números reservados, e o
organizador pode pagar quando quiser (cancelar sozinho mudaria números já combinados). O que muda
é o que o admin vê: `AdminBatchDto.lastCheckoutAt` (o último checkout aberto) separa "Largou o
pagamento" (abriu a Stripe e não pagou) de "Pagamento não iniciado" (nunca abriu), e o filtro
Aguardando explica a regra e o lembrete.

### Campo numérico com unidade

`NumberInput` com `suffix` desenhava a unidade por cima do campo, e uma unidade longa
("ingressos", "pessoas") cobria as setas do navegador e o número. A unidade agora fica ao lado do
número, dentro da mesma moldura.

## Consequências

- O funil do admin passa a medir o efeito: mais contas chegando a "evento" e "ingresso".
- O tour antigo continua a um toque, para quem quer conhecer o painel.
- Um lote largado gera no máximo um e-mail por evento, dentro da cota que sobra (ADR 0118).
