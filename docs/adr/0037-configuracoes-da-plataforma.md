# 0037. Configurações da plataforma: manutenção, novas contas e domínios bloqueados

- **Status:** Aceito
- **Data:** 2026-10-09
- **Complementa:** [0028](0028-emails-html-e-cota.md) e [0032](0032-controle-do-admin.md)

## Contexto

Para atualizar o banco ou conter um problema, o admin precisava derrubar a API. Também não havia
como pausar cadastros nem barrar domínios de e-mail descartáveis, usados para gastar a cota.

## Opções consideradas

1. **Variáveis de ambiente.** Exigem um deploy para cada mudança.
2. **Uma linha em `platform_settings`, editada pelo painel**, com cache curto em memória.
3. **Tabela chave/valor com JSON.** Flexível, mas sem restrição por coluna.

## Decisão

Opção 2.

- `platform_settings` tem uma linha com colunas tipadas: modo de manutenção, mensagem, previsão de
  volta, início, `registrations_open` e `blocked_email_domains`.
- A leitura passa por um cache de 5 s (`platform::SettingsCache`). Quem salva atualiza o cache na
  hora, e a API roda em uma instância só (ADR 0013).
- **Manutenção** tem três modos: `off`, `read_only` e `full`.
  - `read_only`: organizadores só fazem GET; sair continua liberado.
  - `full`: organizadores recebem 503 `maintenance` em tudo (menos sair) e o painel mostra uma
    tela de manutenção.
  - Admins nunca são bloqueados.
  - A portaria, o ingresso digital e o webhook da Stripe não usam sessão e nunca param
    (invariante 6).
- **Novas contas e domínios** são conferidos no primeiro login (código ou Google):
  - cadastros fechados respondem `registrations_closed`;
  - domínio bloqueado (ou subdomínio dele) responde `email_domain_blocked`;
  - durante qualquer manutenção não há cadastros;
  - contas existentes não são afetadas.
- Domínios são normalizados: minúsculas, sem `@` ou `.` no começo, ASCII (o `xn--` de domínios
  internacionais). A lista tem no máximo 1.000.
- `GET /api/platform` (sem login) diz ao site o modo, se há cadastros, a promoção do momento e se
  há preços novos anunciados.
- `PUT /api/admin/settings` recebe todos os campos de uma vez (um corpo parcial nunca reabre nada)
  e grava na auditoria.

## Consequências

- Uma segunda instância da API veria a mudança em até 5 s.
- A previsão de volta é só informativa: a manutenção não desliga sozinha.
