# 0042. Moderação das artes enviadas

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0033](0033-documentos-legais-e-lgpd.md)

## Contexto

Os organizadores enviam a arte do ingresso, e o serviço imprime o que recebe. Uma imagem sexual,
violenta ou criminosa não pode virar PDF pelas nossas mãos, e os Termos já proíbem esse conteúdo.

## Opções consideradas

1. **Modelo local** (ONNX). Pesa na memória da instância pequena do Render e precisa ser mantido.
2. **Google Cloud Vision SafeSearch**: 1.000 análises grátis por mês, mesma escolha do Setlyst.
3. **Só revisão manual.** Não escala e deixa passar.

## Decisão

Opção 2, com a 3 como reserva.

- Cada upload novo é analisado em segundo plano (`moderation::check_art`), reduzido a 1.024 px.
  - A chave vai em cabeçalho, nunca na URL.
  - Há um orçamento diário (`MODERATION_DAILY_LIMIT`, padrão 30) contado no banco.
- A imagem é sinalizada quando: conteúdo sexual "provável" ou mais, violência "provável" ou mais,
  ou conteúdo sugestivo "muito provável".
- `blobs.moderation_status` é um destes: `unchecked`, `clean`, `flagged`, `approved` ou
  `rejected`. A sinalização vira uma linha aberta em `moderation_flags`.
- **Enquanto sinalizada**, a imagem não é impressa: exportações e a imagem do ingresso digital
  respondem `art_under_review`. A prévia de amostra continua liberada, e o editor avisa.
- **Admins decidem** na central (imagem borrada até clicar):
  - liberar volta a permitir a impressão;
  - recusar impede para sempre, e o mesmo arquivo (mesmo SHA-256) é recusado em qualquer evento;
  - nos dois casos a organização pode ser avisada, e a recusa pode suspender a conta;
  - tudo vai para a auditoria.
- Sem a chave, ou com o orçamento gasto, nada é sinalizado sozinho. A central lista os envios
  recentes para revisão manual, e o admin pode sinalizar qualquer imagem.
- Imagens já analisadas não são analisadas de novo quando o mesmo arquivo volta.

## Consequências

- Uma imagem recusada continua guardada (fora do alcance do organizador) para eventual denúncia
  às autoridades. A central lembra que abuso sexual infantil deve ser denunciado à SaferNet ou à
  Polícia Federal.
