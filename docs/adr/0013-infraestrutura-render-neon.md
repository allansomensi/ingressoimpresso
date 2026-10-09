# 0013. Infraestrutura: API no Render, banco no Neon, e-mail pelo Resend

- **Status:** Aceito
- **Data:** 2026-10-08
- **Substituído em parte por:** [0019](0019-deploy-dominio-proprio.md) (compilação e deploy da imagem,
  health check e frequência do backup)

## Contexto

Uma pessoa mantém o sistema, 5 a 10 h por semana. O mantenedor já tem contas no Neon (Postgres) e
no Render, e decidiu usar Vercel (frontend, ADR 0009) e Resend (e-mail, ADR 0012). A portaria
tolera indisponibilidade da API (offline-first), mas a geração de arquivos e o painel não.

## Opções consideradas

1. **VPS própria com Docker Compose (Caddy + app + Postgres).** Custo baixo, mas atualizações de
   SO, TLS e backups ficam por nossa conta. *Proposta original, substituída.*
2. **Render (API) + Neon (Postgres).** Sem servidor para administrar: deploy por imagem, TLS e
   health check gerenciados. O Neon dá backup com restauração a um ponto no tempo (PITR) e branches
   para testes. Custa por uso e cria dependência de dois fornecedores.

**Regiões.** O Render tem Oregon, Ohio, Virginia, Frankfurt e Singapura, nenhuma no Brasil. O Neon
tem São Paulo (`aws-sa-east-1`). **O banco precisa ficar perto da API, não do usuário**: cada
requisição faz várias idas ao banco, e cerca de 120 ms por ida (Virginia ↔ São Paulo)
inviabilizaria a confirmação online da portaria. Com API e banco juntos nos EUA, o usuário paga uma
única viagem Brasil ↔ EUA (cerca de 130 a 150 ms) por requisição.

## Decisão

- **API:** Web Service Docker no Render, região **Virginia**, em instância paga (o plano gratuito
  hiberna, e o primeiro acesso levaria dezenas de segundos). Um único processo roda HTTP e o
  worker de jobs. Health check em `/healthz`. As migrações rodam na inicialização.
- **Banco:** Neon, região **`aws-us-east-1`**, na mesma área da API.
  - O app usa a string de conexão **direta**, porque o pool fica no sqlx e o servidor vive muito
    tempo. O pooler (PgBouncer) não é necessário e complica prepared statements.
  - O backup é o PITR do Neon, mais um `pg_dump` lógico semanal gerado pelo CI e guardado como
    artefato cifrado. Um teste de restauração mensal num branch do Neon é uma receita do `justfile`.
  - Se o plano permitir, desativar a suspensão automática do branch de produção. Caso contrário,
    aceitar o *cold start* de centenas de ms no primeiro acesso após inatividade (a portaria, que
    sincroniza a cada 3 s, mantém o banco acordado durante o evento).
- **E-mail:** Resend, via API HTTP, atrás de uma trait `Mailer` (ADR 0012).
- **Frontend:** Vercel (ADR 0009).
- **Deploy:** o GitHub Actions compila a imagem, publica no GHCR e aciona o deploy hook do Render.
  A mesma execução publica o frontend na Vercel. A imagem compilada uma vez no CI é a que roda.
- **Segredos:** variáveis de ambiente secretas no Render: `DATABASE_URL`,
  `TICKET_KEY_ENCRYPTION_KEY` e `RESEND_API_KEY`. A chave mestra também fica no gerenciador de
  senhas, **fora** de qualquer backup.
- **DNS** (registro.br): o domínio raiz e `www` apontam para a Vercel, e
  `api.ingressoimpresso.com.br` para o Render. Os registros SPF/DKIM do Resend vão no mesmo
  domínio.
- **Arquivos:** o disco do Render é efêmero. Isso basta, porque os arquivos gerados são só cache
  regerável (ADR 0008). A arte enviada pelo usuário fica no Postgres.

## Consequências

- Não há servidor para administrar. Os fornecedores são Vercel, Render, Neon, Resend e o domínio,
  mais o PSP na fase 6.
- **Memória do Typst:** a instância menor do Render tem pouca RAM. Gerar milhares de páginas com
  arte pode estourar. Mitigações: renderizar em blocos (por exemplo, 200 ingressos por compilação)
  e juntar os PDFs com `lopdf`, medir na fase 2 e subir de instância se necessário.
- Os dados ficam nos EUA. A LGPD permite transferência internacional com salvaguardas, e os dados
  pessoais guardados são mínimos (e-mail do organizador, nome e telefone opcionais de vendedores;
  nada do comprador). Isso deve constar nos termos de uso (fase 8).
- **Regra operacional:** não fazer deploy em dia de evento de cliente.
- Migrar para outra hospedagem é trocar a imagem de lugar e a `DATABASE_URL`. Não há dependência
  de recursos proprietários.
