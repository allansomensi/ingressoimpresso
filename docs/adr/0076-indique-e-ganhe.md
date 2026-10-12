# 0076. Indique e ganhe

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0040](0040-cupons-e-credito.md) (crédito), [0037](0037-configuracoes-da-plataforma.md)
  (configurações da plataforma), [0063](0063-reembolsos-do-stripe-e-receita-liquida.md) (reembolsos)

## Contexto

Quem faz eventos conhece quem faz eventos: a banda indica a outra banda, a escola indica a escola
vizinha. Um programa de indicação precisa recompensar os dois lados sem virar uma máquina de gerar
crédito: contas de mentira, a mesma pessoa com outro e-mail, lotes de centavos, ou o pagamento
confirmado duas vezes (webhook e retorno do pagador) creditando em dobro.

## Opções consideradas

1. **Cupom por organização** (ADR 0040) que a indicada digita. Reaproveita tudo, mas o crédito sai
   no resgate, antes de qualquer pagamento: basta criar contas.
2. **Recompensa no cadastro.** Simples e igualmente explorável.
3. **Vínculo no cadastro, recompensa no primeiro lote pago em dinheiro**, idempotente, com limites.

## Decisão

Opção 3.

- **Código** por organização (`organizations.referral_code`, 8 letras e números sem os parecidos),
  criado na primeira vez que o cartão aparece. O link é `/i/<código>`: a página guarda o código no
  navegador por 30 dias e abre `/entrar?indicacao=<código>`, que mostra quem convida e o que a
  conta nova ganha (`GET /api/referrals/{code}`, sem login, limite por endereço; código desconhecido
  ou programa desligado: 404). `/i/` fica fora da busca.
- **Cadastro**: `POST /api/auth/verify` e `POST /api/auth/google` aceitam `referralCode`; só uma
  conta **nova** (as regras de cadastro da plataforma continuam valendo: novas contas fechadas,
  domínios bloqueados) é ligada à indicadora em `referrals`, e a resposta diz `referred`. Um código
  ruim nunca impede o cadastro. Não há indicação quando: o programa está desligado; a indicadora
  está suspensa; o e-mail é a mesma caixa de alguém da indicadora (minúsculas, sem `+tag` e, no
  Gmail, sem pontos) ou do mesmo domínio próprio (provedores de webmail não contam); a pessoa está
  na equipe de algum evento da indicadora; ou esse e-mail já foi indicado alguma vez
  (`referred_email_hash`, hash com chave do e-mail normalizado, único e mantido mesmo depois de a
  conta ser excluída).
- **Recompensa**: quando um lote da indicada vira pago **por dinheiro** (`paid_via` `stripe` ou
  `admin`) com `price_cents` de pelo menos o mínimo, na **mesma transação** que muda o lote para
  pago. Só quem muda o lote (o `UPDATE … where status = 'awaiting_payment'`) chega lá, e a indicação
  é tomada por um `UPDATE … where status = 'pending'`: webhook e retorno do pagador ao mesmo tempo
  creditam uma vez; um índice único no extrato (`reference_id, organization_id, reason`) garante o
  resto. Lotes grátis ou pagos com crédito nunca contam. As duas organizações ganham crédito
  (`credit_ledger.reason = 'referral'`) e um aviso no sininho (`referral_rewarded`). A linha da
  indicadora é travada para contar o **limite por 30 dias**; passou dele (ou a indicadora está
  suspensa), só a indicada ganha e a indicação fica marcada `referrer_capped`.
- **Estorno total** do lote que valeu (admin ou Stripe, ADRs 0032 e 0063, via `refund_batch`)
  revoga a indicação: sai de cada conta o crédito que ela deu e **ainda sobra** (nunca abaixo de
  zero, `referral_revoked`). Usado antes, fica usado. O admin também pode cancelar uma indicação
  (pendente ou recompensada) com o mesmo efeito.
- **Configuração** em `platform_settings` (`referrals_enabled`, crédito de cada lado, padrão R$ 10;
  limite por 30 dias, padrão 10; lote mínimo, padrão R$ 15, um lote de 100 ingressos na tabela de
  lançamento), por `PUT /api/admin/referrals/settings`, auditada. Seção **Indicações** no admin com
  totais, regras e a lista (`GET /api/admin/referrals`, `POST /api/admin/referrals/{id}/revoke`).
- **Painel**: cartão **Indique e ganhe** em Minha conta (link, copiar, WhatsApp com mensagem
  pronta, compartilhar, como funciona em três passos, regras, lista com status e o e-mail mascarado,
  `ma•••@gmail.com`) e, para quem chegou por indicação, o que ganhou ou vai ganhar. A exportação de
  dados (ADR 0033) traz o código e as indicações mascaradas.

## Consequências

- Ao excluir a conta convidada, a dica do e-mail (`referred_email_hint`) é apagada: quem convidou
  vê "Conta excluída". Fica só o hash com chave, para o mesmo e-mail não valer de novo; a Política
  de Privacidade (versão 2026-10-12.1) diz isso.

- Burlar exige pagar lotes de verdade com e-mails distintos, e cada indicadora tem um teto mensal.
  O admin vê tudo e cancela o que parecer combinado.
- O hash do e-mail indicado fica depois da exclusão da conta, só para impedir a repetição; não
  identifica ninguém sem a chave mestra.
- O crédito continua não sendo dinheiro (ADR 0040): não se saca e não volta pela Stripe.
