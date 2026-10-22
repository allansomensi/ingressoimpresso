# 0116. Tour de boas-vindas no painel e marca com logo no certificado

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0087](0087-painel-por-secoes.md) (painel por seções) e
  [0114](0114-certificado-com-editor.md) (certificado com editor)

## Contexto

A maior parte das contas novas entra uma vez e não cria nada: o painel abre vazio, sem dizer por
onde começar. No certificado, a linha "Emitido com Ingresso Impresso" é só texto; pediram uma
versão com o logo, discreta, como marca d'água, sem tirar a opção da linha.

## Decisão

**Tour de boas-vindas.**

- `users.tour_finished_at` e `users.tour_outcome` (`finished`/`skipped`); `MeUser.tourPending`
  diz se falta ver; `POST /api/account/tour` grava como terminou (só a primeira vez conta). A
  migração marca como visto quem já tem evento (próprio ou numa equipe): só quem nunca criou nada
  vê o tour.
- No painel (`components/panel/tour.tsx`, regras em `lib/tour.ts`): na lista de eventos, um
  `<dialog>` nativo (foco preso, página inerte) com seis passos: boas-vindas (como funciona em
  quatro passos e os ingressos grátis que restam), Novo evento, Resultados, sininho, conta e o
  final com "Criar meu primeiro evento", que abre o formulário. Os passos do meio iluminam o
  elemento marcado com `data-tour` (o link do cabeçalho ou a barra do celular, o que estiver na
  tela) e põem o cartão abaixo, acima ou contra a borda (`placeCard`).
- Dá para pular a qualquer momento ("Agora não", "Pular tour", o X ou Esc), e o pulo fica
  registrado. Em manutenção ou com a conta suspensa o tour espera. A janela de um pronunciamento
  espera o tour acabar.
- Minha conta tem "Ver o tour de novo" (`/painel?tour=1`), que não muda o registro.

**Marca do certificado.** `CertificateDesign.brandStyle` (`line`, o de antes, ou `mark`), com
`line` como padrão para os designs salvos. `mark` desenha "EMITIDO COM", o logo numa cor só (o
check e o picote vazados por máscara) e "**Ingresso** Impresso", apagados, na tinta do papel
(escura no papel claro, branca no escuro, pela luminância), numa faixa da cor do papel que
interrompe a moldura. O Typst e a prévia usam a mesma geometria; o editor mostra as duas opções
desenhadas.

## Consequências

- Quem chega vê o que fazer primeiro e tem um botão direto para o primeiro evento; quantos pulam
  fica no banco.
- O certificado pode levar a marca de forma bonita sem chamar atenção, e quem prefere a linha a
  mantém.
