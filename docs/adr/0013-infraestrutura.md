# 0013. Infraestrutura: uma VPS

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

Uma pessoa mantém o sistema, 5 a 10 h por semana. A carga é baixa, com picos na hora dos eventos.
A portaria tolera indisponibilidade do servidor (offline-first), mas a geração de arquivos e o
painel não.

## Opções consideradas

1. **PaaS (Fly.io, Render, Railway) + Postgres gerenciado (Neon, Supabase).** Menos operação de
   SO e backups automáticos, mas mais fornecedores, custo que cresce em degraus e limites de CPU
   ruins para gerar PDFs.
2. **Uma VPS com Docker Compose (Caddy + app + Postgres).** Custo baixo e previsível, um único
   lugar para olhar. Atualizações do SO e backups ficam por nossa conta.
3. **Kubernetes ou vários serviços.** Desproporcional.

## Decisão

Opção 2.

- **Servidor:** uma VPS, de preferência em São Paulo pela latência.
- **Compose:** `caddy` (TLS automático), `app` (binário Rust + estáticos do web) e `postgres`
  (versão fixa).
- **Backup:** `pg_dump` diário cifrado com `restic` para armazenamento de objetos compatível com S3,
  retenção de 30 dias e **teste de restauração mensal** com uma receita do `justfile`.
- **Deploy:** imagem construída no CI e enviada a um registro, seguida de
  `docker compose pull && up -d`. As migrações rodam na inicialização do app.
- **Segredos:** arquivos de segredo do Docker. A chave mestra e a senha do restic também ficam no
  gerenciador de senhas.
- **Atualizações:** atualizações automáticas de segurança do SO (`unattended-upgrades`).

## Consequências

- Os serviços de terceiros ficam em: VPS, domínio, SMTP, armazenamento de backup e, na fase 6,
  o PSP.
- Se o Postgres na VPS virar fardo, a troca por um gerenciado é só uma mudança de
  `DATABASE_URL`.
- Uma janela de manutenção no dia de um show não derruba a portaria (offline-first), mas a regra
  operacional é **não fazer deploy em dia de evento de cliente**.
