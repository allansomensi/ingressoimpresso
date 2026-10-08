# Deploy: Neon + Render + Vercel + Resend

Passo a passo para colocar a API e o painel no ar para testes. Decisões nos ADRs 0009, 0013 e
0016. Nenhum segredo vai para o repositório: tudo fica nos painéis dos serviços.

## 0. Pré-requisitos

- O branch `main` no GitHub (o Render e o CI acompanham ele).
- Uma chave mestra para as chaves dos eventos, gerada no seu computador:

  ```sh
  openssl rand -base64 32
  ```

  Guarde-a no gerenciador de senhas **antes** de usar. Sem ela, nenhum lote novo dos eventos
  existentes pode ser assinado (ADR 0005).

## 1. Neon (banco)

1. Crie o projeto `ingressoimpresso`: Postgres 17, região **AWS US East 1 (N. Virginia)**. A região
   não muda depois e precisa ficar junto da API.
2. Em **Connect**, desligue "Connection pooling" e copie a string **direta** (o host não tem
   `-pooler`). Ela termina com `?sslmode=require`.
3. As migrações rodam sozinhas quando a API sobe; não há nada a criar à mão.

## 2. Resend (e-mail do login)

- **Para testar já:** sem domínio verificado, o Resend só entrega e-mails para o endereço da sua
  conta no Resend, usando o remetente `onboarding@resend.dev`. Faça o login no painel com esse
  e-mail.
- **Depois de comprar o domínio:** em **Domains → Add domain**, use `mail.seudominio.com.br`, crie
  os registros DNS que o Resend mostrar e troque `MAIL_FROM`.
- Crie uma **API key** com permissão de envio.

## 3. Render (API)

1. **New → Blueprint**, escolha o repositório: o Render lê o `render.yaml` da raiz e cria o serviço
   `ingressoimpresso-api` (Docker, Virginia, Starter, health check em `/healthz`).
2. Preencha as variáveis pedidas:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | string direta do Neon |
   | `TICKET_KEY_ENCRYPTION_KEY` | a chave mestra do passo 0 |
   | `RESEND_API_KEY` | a API key do Resend |
   | `MAIL_FROM` | `Ingresso Impresso <onboarding@resend.dev>` (até verificar o domínio) |
   | `ADMIN_EMAILS` | seu e-mail (pode marcar lotes como pagos) |
   | `PUBLIC_API_URL` | a URL do serviço, ex. `https://ingressoimpresso-api.onrender.com` |
   | `ALLOWED_ORIGINS` | já vem `https://ingressoimpresso.vercel.app`; acrescente outras origens separadas por vírgula |

3. O primeiro build compila o Rust em release e leva cerca de 10 a 15 minutos.
4. Teste: `https://<seu-servico>.onrender.com/healthz` deve responder 200.

## 4. Vercel (painel e portaria)

O build da Vercel não tem Rust, e a portaria precisa do WebAssembly do núcleo. Por isso quem
compila e publica é o GitHub Actions (workflow **Deploy web**, ADR 0009). O
`apps/web/vercel.json` desliga os builds automáticos da integração Git da Vercel, que falhariam.

1. No projeto da Vercel, em **Settings → Environment Variables**, crie
   `NEXT_PUBLIC_API_URL` = a URL do Render (sem barra no fim), para Production e Preview.
2. Confirme **Root Directory = `apps/web`** e Node 22.
3. Pegue três valores:
   - **Token:** Vercel → avatar → **Account Settings → Tokens → Create**, escopo da sua conta ou
     do time do projeto;
   - **Project ID:** no projeto, **Settings → General → Project ID**;
   - **Org ID:** o **Team ID** em **Team Settings → General** (conta pessoal: **Account
     Settings → General → Vercel ID**).
4. No GitHub, em **Settings → Secrets and variables → Actions → New repository secret**, crie
   `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` e `VERCEL_ORG_ID`.
5. Publicar:
   - **Produção:** todo push no `main` publica sozinho.
   - **Testar um branch antes do merge:** **Actions → Deploy web → Run workflow**, escolha o
     branch. A prévia fica em `https://ingressoimpresso-preview.vercel.app` (para outro nome, crie
     a variável `VERCEL_PREVIEW_ALIAS` em **Settings → Secrets and variables → Actions →
     Variables**).
6. No Render, acrescente a prévia em `ALLOWED_ORIGINS`:
   `https://ingressoimpresso.vercel.app,https://ingressoimpresso-preview.vercel.app`.

## 5. Primeiro teste de ponta a ponta

1. Abra `https://ingressoimpresso.vercel.app/entrar`, entre com o e-mail de `ADMIN_EMAILS`.
2. Crie um evento, envie a arte e salve o ingresso (aba **Ingresso**).
3. Crie um lote (aba **Lotes**) e clique em **Marcar como pago**.
4. Cadastre vendedores e entregue faixas.
5. Na aba **Arquivos**, gere o A4 e baixe.
6. Na aba **Portaria**, crie um link e abra-o no celular (ou leia o QR do link com a câmera). Dê um
   nome ao celular, toque em **Começar a ler** e leia um ingresso impresso.
7. Teste sem sinal: com a lista de prontidão toda verde, ponha o celular em modo avião, feche e
   abra a página de novo, e leia outro ingresso. Ao voltar o sinal, a leitura sincroniza e aparece
   nos outros celulares.

## 6. Backup (ADR 0013)

O Neon guarda o histórico para restaurar a um ponto no tempo. Além disso, o workflow **Backup**
gera todo domingo um `pg_dump` cifrado com [age](https://age-encryption.org), guardado por 35 dias
como artefato do GitHub. A chave mestra (`TICKET_KEY_ENCRYPTION_KEY`) nunca entra no backup.

1. No seu computador, crie o par de chaves do backup:

   ```sh
   age-keygen -o backup-key.txt
   ```

   O arquivo é a chave **privada**: guarde-o no gerenciador de senhas e apague a cópia solta. A
   linha `# public key: age1...` é a chave pública.
2. No GitHub, em **Settings → Secrets and variables → Actions**, crie:
   - `BACKUP_AGE_RECIPIENT`: a chave pública `age1...`;
   - `BACKUP_DATABASE_URL`: a string **direta** do Neon. Um papel só de leitura basta (Neon →
     **Roles → New role**, depois `grant pg_read_all_data to <papel>` no SQL Editor).
3. Rode uma vez à mão: **Actions → Backup → Run workflow**. O artefato `database-backup` aparece no
   resumo da execução.

**Teste de restauração (uma vez por mês):**

1. Baixe o artefato `database-backup` e descompacte o `.zip` (dentro está o `.dump.age`).
2. Crie um banco **vazio**: localmente, `just db-up` e
   `docker compose -f deploy/compose.dev.yaml exec postgres createdb -U ingressoimpresso restore_test`;
   ou, no Neon, um branch com um banco novo em **Databases → New database**.
3. Restaure e confira as contagens com o painel:

   ```sh
   RESTORE_DATABASE_URL=postgres://ingressoimpresso:ingressoimpresso@127.0.0.1:5432/restore_test \
     just backup-restore-test ingressoimpresso-AAAAMMDD.dump.age backup-key.txt
   ```

   O script se recusa a restaurar num banco que já tenha tabelas.

## Observações

- O disco do Render é efêmero: arquivos gerados somem num novo deploy ou reinício. O painel
  mostra "O arquivo expirou. Gere de novo." e basta gerar outra vez (ADR 0008).
- Regra operacional: não faça deploy em dia de evento de cliente.
