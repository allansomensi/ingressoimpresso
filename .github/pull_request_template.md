<!--
Obrigado pela contribuição! O PR vai para `staging` (o ambiente de testes), nunca direto para `main`.
Não inclua dados reais: e-mails de clientes, tokens, links de portaria (#acesso=) ou de ingresso digital.
-->

## O que muda e por quê

<!-- Uma ou duas frases sobre o problema e a solução. -->

Fecha #

## Tipo de mudança

- [ ] Correção de problema
- [ ] Recurso novo
- [ ] Melhoria de interface ou texto
- [ ] Refatoração, testes ou CI
- [ ] Documentação ou ADR

## Como testei

<!-- Comandos, cenários e aparelhos. Para a portaria: `just e2e` e, se possível, um celular de verdade. -->

## Capturas de tela

<!-- Para mudanças de interface: antes e depois, no celular e no computador, tema claro e escuro. -->

## Checklist

- [ ] `just` (o mesmo que o CI roda) passa sem erros.
- [ ] Commits no formato `tipo(escopo): <gitmoji> assunto`, em inglês.
- [ ] Textos novos da interface estão em `texts/pt-BR.ts` ou `texts.rs`, em português.
- [ ] Nenhuma invariante do `CLAUDE.md` foi quebrada (formato QR v1, só lotes pagos assinados,
      chave privada no servidor, portaria sem esperar a rede...).
- [ ] Mudei consultas do sqlx? Rodei `just db-prepare` e versionei o `.sqlx/`.
- [ ] Arquivos gerados (`packages/api-types`, `src/generated`, `testdata/vectors`) não foram editados à mão.
- [ ] Mudei uma regra do editor? Atualizei os dois lados (`design.rs`/`fields.rs` e `lib/design-rules.ts`/`lib/ticket-fields.ts`).
- [ ] Decisão nova de arquitetura? Escrevi um ADR.
- [ ] Mudei estrutura, comandos ou status? Atualizei o `CLAUDE.md` e o `README.md`.
