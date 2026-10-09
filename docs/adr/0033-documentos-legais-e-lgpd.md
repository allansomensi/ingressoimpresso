# 0033. Documentos legais, aceite dos termos e direitos do titular

- **Status:** Aceito
- **Data:** 2026-10-09

## Contexto

O serviço vai cobrar de organizadores (muitos consumidores, pelo CDC) e trata dados pessoais de
terceiros (vendedores, compradores de ingresso digital, celulares da portaria). É oferecido por
pessoa física, sem CNPJ. Faltavam Termos de Uso, Política de Privacidade, regras de reembolso, a
identificação do fornecedor exigida pelo Decreto 7.962/2013 e os meios para a pessoa exercer os
direitos da LGPD.

## Opções consideradas

1. **Gerador genérico de termos.** Não descreve o que o serviço faz de verdade (portaria offline,
   chaves, ingressos digitais).
2. **Textos próprios, versionados no repositório**, coerentes com o código, e as funções que eles
   prometem implementadas.

## Decisão

Opção 2.

- `apps/web/src/content/legal.ts`: Termos de Uso, Política de Privacidade e Política de Reembolso
  (arrependimento em 7 dias, falha do serviço, números bloqueados após estorno), mais
  `LEGAL_ENTITY` (nome, CPF, e-mail, endereço) mostrado no rodapé e no início de cada documento.
  Páginas `/termos`, `/privacidade` e `/reembolso`, linkadas no rodapé, no login e antes de pagar.
- Aceite: entrar (código ou Google) aceita a versão atual, gravada em `users.terms_version` e
  `terms_accepted_at`. `TERMS_VERSION` existe nos dois lados (`auth.rs` e `legal.ts`).
- Direitos: `GET /api/account/export` baixa um JSON com a conta e os eventos;
  `DELETE /api/account` (com o e-mail digitado como confirmação) apaga a organização inteira ou,
  se houver lotes pagos, anonimiza usuário, organização e eventos, apaga arte, vendedores,
  ingressos digitais, portaria e arquivos e mantém só lotes e pagamentos (obrigação fiscal).
- Rifas: o produto imprime números; sorteio, prêmios e autorização são do organizador (ADR 0035).

## Consequências

- Mudou um documento: mude a data; mudou Termos ou Privacidade: mude também `TERMS_VERSION` nos
  dois lados.
- O endereço físico ainda precisa ser preenchido em `LEGAL_ENTITY.address` pelo mantenedor.
