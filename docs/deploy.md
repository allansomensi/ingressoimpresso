# Deploy com domínio próprio

Passo a passo para colocar o Ingresso Impresso no ar com o seu domínio: site e portaria na Vercel,
API no Render, banco no Neon, e-mail de login pelo Resend e DNS no Registro.br. As decisões estão
nos ADRs 0009, 0013, 0016 e 0019. Nenhum segredo vai para o repositório, que é público: tudo fica
nos painéis dos serviços e no gerenciador de senhas.

Troque **`seudominio.com.br`** pelo seu domínio em todos os passos.

## Como fica

| Peça | Onde | Endereço |
|---|---|---|
| Site, painel e portaria | Vercel | `https://seudominio.com.br` (o `www` redireciona para ele) |
| API | Render, região Virginia | `https://api.seudominio.com.br` |
| Banco | Neon, região AWS US East (N. Virginia) | (só a API acessa) |
| E-mail de login | Resend, região São Paulo | `login@mail.seudominio.com.br` |
| DNS | Registro.br | (zona do domínio) |
| Deploy do site e backup | GitHub Actions | (workflows **Deploy web** e **Backup**) |

**Custo mensal esperado no MVP** (valores de outubro de 2026):

| Serviço | Plano | Custo |
|---|---|---|
| Render | Starter (0,5 CPU, 512 MB, sempre ligado) | cerca de US$ 7 |
| Neon | Free (100 CU-hora/mês, 1 GB) | US$ 0 |
| Resend | Free (100 e-mails/dia, 3.000/mês) | US$ 0 |
| Vercel | Hobby | US$ 0 (uso não comercial; o Pro custa US$ 20 quando houver clientes pagando) |
| GitHub Actions | repositório público | US$ 0 |

**Ordem:** chaves locais → código no `main` → Neon → Resend + DNS → Render → Vercel → backup →
teste completo. O DNS e a primeira compilação no Render são as partes demoradas, então comece pelo
Resend logo depois do Neon.

## 0. Antes de começar

Você vai precisar de:

- um **gerenciador de senhas** (Bitwarden, 1Password ou similar) para guardar as chaves;
- um **cartão de crédito** para o Render (o plano Starter é pago);
- acesso ao **Registro.br** com o domínio;
- o programa **age**, para o backup: macOS `brew install age`; Ubuntu/Debian `sudo apt install age`;
  Windows `winget install --id FiloSottile.age` (depois abra um terminal novo).

### Chave mestra das assinaturas

É ela que protege as chaves que assinam os ingressos (ADR 0005). Gere uma vez:

- macOS, Linux ou Git Bash no Windows:

  ```sh
  openssl rand -base64 32
  ```

- Windows PowerShell (5.1 ou 7):

  ```powershell
  $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
  ```

O resultado tem 44 caracteres e termina em `=`. **Guarde no gerenciador de senhas antes de usar.**
Ela vai só para o Render, nunca para o GitHub. Se ela se perder, nenhum lote novo dos eventos
existentes pode ser assinado.

### Chave do backup

```sh
age-keygen -o backup-key.txt
```

O terminal mostra `Public key: age1...`: essa é a chave **pública**, que vai para o GitHub. O
arquivo `backup-key.txt` é a chave **privada**: guarde-o no gerenciador de senhas e apague a cópia
solta. Não use a opção `-pq`. No Windows, use sempre `-o` (não redirecione com `>`).

## 1. Levar o código para o `main`

O Render, o **Deploy web** e o **Backup** só enxergam o branch `main`. Hoje todo o trabalho está no
branch `claude/determined-pascal-7svq1h`.

1. Abra
   `https://github.com/allansomensi/ingressoimpresso/compare/main...claude/determined-pascal-7svq1h`
   e clique em **Create pull request**.
2. Espere os checks ficarem verdes (**just check** e **API image**). A primeira vez leva uns
   20–30 minutos, porque o cache do CI começa vazio.
3. Em **Merge pull request**, escolha **Create a merge commit** e confirme. Não apague o branch.

O merge dispara o **Deploy web**, que por enquanto só avisa que faltam os segredos da Vercel e
termina verde. É esperado.

## 2. Neon (banco)

1. Entre em `https://console.neon.tech` → **New Project**:
   - **Project name:** `ingressoimpresso`;
   - **Region:** **AWS US East (N. Virginia)** (`aws-us-east-1`). A região não muda depois e
     precisa ficar junto da API;
   - abra **Postgres database** e escolha **Postgres version 17**. O padrão é a versão mais nova,
     e o backup usa as ferramentas do 17;
   - deixe os outros serviços desligados e clique em **Create project**.
2. Limite o tamanho do banco para não gastar a cota à toa: no branch `production`, em **Computes**
   → **Edit**, deixe o autoscaling entre **0.25 e 1 CU**.
3. Clique em **Connect**, **desligue "Connection pooling"** (o endereço não pode ter `-pooler`) e
   copie a string. Ela vem assim:

   ```
   postgresql://neondb_owner:SENHA@ep-xxxx-xxxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. Troque tudo depois do `?` por `sslmode=verify-full`. É essa a `DATABASE_URL` da API:

   ```
   postgresql://neondb_owner:SENHA@ep-xxxx-xxxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=verify-full
   ```

   Confira que o host termina em `.us-east-1.aws.neon.tech`. Não crie tabelas: a API cria tudo
   quando sobe.

## 3. Resend (e-mail do login)

1. Crie a conta em `https://resend.com/signup` com o e-mail que será o administrador.
2. **Domains** → **Add Domain**:
   - **Name:** `mail.seudominio.com.br` (um subdomínio, como o Resend recomenda);
   - **Region:** **São Paulo (sa-east-1)**. Não dá para mudar depois;
   - mantenha o *Return-Path* padrão (`send`) e clique em **Add**.
3. Deixe a aba **Records** aberta: os valores dela entram no DNS no passo seguinte.

## 4. DNS no Registro.br: modo avançado e registros do e-mail

1. Em `https://registro.br`, entre em **Domínios** → seu domínio → **DNS**.
   - Se o domínio estiver usando servidores DNS de outra empresa, clique em **Alterar servidores
     DNS** e volte para os do Registro.br.
2. Clique em **Configurar endereçamento** (ou **Configurar zona DNS**) → **Modo avançado** →
   **Confirmar**. A troca leva de alguns minutos a algumas horas; atualize a página até aparecer
   **Nova entrada**.
3. Adicione os registros do Resend com **Nova entrada** → **Adicionar**. No Registro.br, o campo
   **Nome** é **relativo ao domínio**: escreva só o que está na tabela, nunca o nome completo.

   | Tipo | Nome | Valor |
   |---|---|---|
   | MX | `send.mail` | `feedback-smtp.sa-east-1.amazonses.com`, prioridade `10` |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `resend._domainkey.mail` | o `p=...` da aba Records, inteiro, sem aspas |
   | TXT | `_dmarc` | `v=DMARC1; p=none;` |

   - Copie os valores **da aba Records do Resend**: se forem diferentes da tabela, valem os do
     Resend.
   - Se o formulário do MX não tiver campo de prioridade, escreva `10 feedback-smtp...`.
   - Só pode existir **um** MX em `send.mail`.
4. Clique em **Salvar alterações**. Nada é publicado sem isso.
5. No Resend: **Domains** → `mail.seudominio.com.br` → **Verify DNS Records**. Costuma ficar
   **Verified** em uns 15 minutos (no pior caso, até 72 horas). Se ficar **Failed**, corrija o
   registro que não ficou verde e clique em **Restart verification**.
6. Depois de verificado: **API Keys** → **Create API Key**:
   - **Name:** `ingressoimpresso-render`;
   - **Permission:** **Sending access**;
   - **Domain:** `mail.seudominio.com.br`.

   Copie a chave (`re_...`) para o gerenciador de senhas: ela só aparece uma vez.

Em **Domains** → **Configuration**, deixe o rastreamento de cliques e aberturas desligado (é o
padrão).

## 5. Render (API)

1. Entre em `https://dashboard.render.com` com o GitHub e cadastre o cartão em **Billing**.
2. **New** → **Blueprint** → escolha o repositório `allansomensi/ingressoimpresso`. Se ele não
   aparecer, clique em **Configure GitHub** e libere o repositório para o app do Render.
3. **Branch:** `main`. Deixe o caminho do Blueprint em branco (`render.yaml`). A revisão deve mostrar
   um serviço: `ingressoimpresso-api`, Docker, Virginia, Starter.
4. Preencha as variáveis pedidas:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a string do Neon com `?sslmode=verify-full` (passo 2) |
   | `TICKET_KEY_ENCRYPTION_KEY` | a chave mestra (passo 0) |
   | `RESEND_API_KEY` | a chave `re_...` (passo 4) |
   | `MAIL_FROM` | `Ingresso Impresso <login@mail.seudominio.com.br>` |
   | `ADMIN_EMAILS` | seu e-mail (pode marcar lotes como pagos); vários, separados por vírgula |
   | `PUBLIC_API_URL` | `https://api.seudominio.com.br` |
   | `ALLOWED_ORIGINS` | `https://seudominio.com.br,https://www.seudominio.com.br` |

   - Sem barra no fim, sem espaços dentro dos endereços.
   - Se o Resend ainda não verificou o domínio, use por enquanto
     `Ingresso Impresso <onboarding@resend.dev>` em `MAIL_FROM`. Nesse modo, só o e-mail da sua conta
     no Resend recebe os códigos.
5. Clique em **Deploy Blueprint**. A primeira compilação do Rust leva de 20 a 40 minutos; as
   seguintes são bem mais rápidas. Acompanhe em `ingressoimpresso-api` → **Events** → o deploy em
   andamento.
6. Quando ficar **Live**, copie o endereço do serviço no topo da página
   (`https://ingressoimpresso-api.onrender.com` ou parecido, às vezes com um sufixo) e teste:
   - `…/healthz` → 200 (a API está de pé);
   - `…/readyz` → 200 (o banco também respondeu).

   Se o deploy falhar, abra **Logs**: um erro de configuração aparece como
   `configuration error: ...` com o nome da variável.
7. **Domínio da API:** em **Settings** → **Custom Domains** → **Add Custom Domain**, digite
   `api.seudominio.com.br` e salve.
8. No Registro.br, **Nova entrada**: tipo **CNAME**, nome `api`, valor = o host do serviço sem
   `https://` (por exemplo `ingressoimpresso-api.onrender.com`). **Salvar alterações**.
9. De volta ao Render, clique em **Verify**. O certificado HTTPS sai sozinho em alguns minutos.
   Teste `https://api.seudominio.com.br/readyz` → 200.

Para mudar uma variável depois: serviço → **Environment** → editar → no botão de salvar, escolha
**Save and deploy**. Ele reaproveita a compilação; **Save, rebuild, and deploy** recompila tudo à toa.

## 6. Vercel (site, painel e portaria)

O build da Vercel não tem Rust, e a portaria precisa do WebAssembly do núcleo. Por isso quem
compila e publica é o GitHub Actions (workflow **Deploy web**). O `apps/web/vercel.json` desliga os
builds automáticos da Vercel.

1. No projeto da Vercel, em **Settings**:
   - **Build and Deployment:** **Root Directory** = `apps/web`, **Node.js Version** = 22.x;
   - **Git:** se houver um repositório conectado, desconecte. Assim nenhum push dispara um build
     que falharia.
2. **Settings** → **Environment Variables** → nova variável:
   - **Key:** `NEXT_PUBLIC_API_URL`;
   - **Value:** `https://api.seudominio.com.br` (sem barra no fim);
   - **Type:** **Config**, não Secret: variáveis `NEXT_PUBLIC_` vão para o navegador, e uma Secret
     chegaria vazia no build;
   - **Environments:** Production e Preview.
3. **Settings** → **Domains** → **Add Domain** → `seudominio.com.br`. Aceite adicionar também o
   `www.seudominio.com.br` e escolha **redirecionar `www` para `seudominio.com.br`** (308). O site
   fica no domínio sem `www`, e o link da portaria também.
4. No Registro.br, **Nova entrada** para cada registro e depois **Salvar alterações**:

   | Tipo | Nome | Valor |
   |---|---|---|
   | A | (vazio) | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

   - A Vercel às vezes sugere valores novos (`216.198.79.1`, `64.29.17.1` ou um CNAME com
     `vercel-dns-0NN.com`). Os valores da tabela continuam aceitos, e em 2026 houve relatos de
     operadoras brasileiras sem acesso aos IPs novos. Para um público no Brasil, prefira os da
     tabela.
   - Só um registro A no domínio raiz, e nenhum AAAA em `@`, `www` ou `api`.
5. Na Vercel, **Domains** → **Refresh** até os dois aparecerem como **Valid Configuration**, com
   certificado emitido.
6. **Token para o GitHub:** avatar → **Account Settings** → **Tokens** → **Create**:
   - **Scope:** o time dono do projeto (não "Full Account");
   - **Expiration:** 1 ano, com um lembrete na agenda para renovar.

   Copie o token: ele só aparece uma vez.
7. **IDs:**
   - **Project ID** (`prj_...`): projeto → **Settings** → **General**;
   - **Team ID** (`team_...`): seu time → **Settings** → **General**. Toda conta pessoal agora é um
     time "Hobby", e é esse o `VERCEL_ORG_ID`.
8. No GitHub: repositório → **Settings** → **Secrets and variables** → **Actions** → aba **Secrets**
   → **New repository secret**, três vezes:

   | Secret | Valor |
   |---|---|
   | `VERCEL_TOKEN` | o token do item 6 |
   | `VERCEL_ORG_ID` | o Team ID (`team_...`) |
   | `VERCEL_PROJECT_ID` | o Project ID (`prj_...`) |

9. **Publicar:** aba **Actions** → **Deploy web** → **Run workflow** → **Branch: main** → marque
   **Production deploy** → **Run workflow**. Quando terminar, o resumo da execução mostra
   `Deployed (production): https://...`. Daqui em diante, todo push no `main` publica sozinho.
10. Teste:
    - `https://seudominio.com.br` abre;
    - `https://www.seudominio.com.br` redireciona para ele;
    - em `https://seudominio.com.br/entrar`, peça um código de login.

Teste o site em mais de uma operadora (Vivo, Claro, TIM e a internet de casa). Se alguma não abrir e
o registro A não for `76.76.21.21`, troque-o por esse valor.

## 7. Backup (ADR 0019)

O Neon gratuito só volta 6 horas no tempo. Além disso, o workflow **Backup** grava todo dia, às
03:17 de Brasília, um `pg_dump` cifrado com age, guardado por 30 dias como artefato do GitHub. O
repositório é público, mas o arquivo só abre com a sua chave privada.

1. **Papel só de leitura no Neon**, criado **depois** que a API subiu (as tabelas precisam
   existir). Gere uma senha só com letras e números:

   ```sh
   openssl rand -hex 24
   ```

   No Neon, **SQL Editor** (banco `neondb`), rode, trocando `SENHA`:

   ```sql
   CREATE ROLE backup_reader WITH LOGIN PASSWORD 'SENHA';
   GRANT CONNECT ON DATABASE neondb TO backup_reader;
   GRANT USAGE ON SCHEMA public TO backup_reader;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader;
   GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO backup_reader;
   ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON TABLES TO backup_reader;
   ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup_reader;
   ```

   Não use **Add role** no painel: os papéis criados por lá são administradores.
2. Monte a URL do backup a partir da string **direta** do Neon (passo 2), trocando o usuário e a
   senha e **mantendo** o final original:

   ```
   postgresql://backup_reader:SENHA@ep-xxxx-xxxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

3. No GitHub, crie mais dois secrets:

   | Secret | Valor |
   |---|---|
   | `BACKUP_DATABASE_URL` | a URL do item 2 |
   | `BACKUP_AGE_RECIPIENT` | só o `age1...` (passo 0), sem `Public key:` na frente |

4. **Actions** → **Backup** → **Run workflow** → **Branch: main**. Na execução, baixe o artefato
   `database-backup` e confira que ele tem mais que alguns KB.

**Teste de restauração (uma vez por mês):**

1. No Neon, **Branches** → **New branch**: pai `production`, nome `restore-test`, **Current data**,
   apagar automaticamente depois de 1 dia → **Create**.
2. Com o branch `restore-test` selecionado no menu do topo: **Postgres database** → **Databases** →
   **Add database** → nome `restore_test` → **Create**.
3. **Connect** → branch `restore-test`, banco `restore_test`, pooling desligado → copie a string.
4. No seu computador (macOS, Linux ou WSL no Windows), com o artefato descompactado:

   ```sh
   RESTORE_DATABASE_URL='<string do item 3>' \
     just backup-restore-test ingressoimpresso-AAAAMMDDTHHMMZ.dump.age backup-key.txt
   ```

   O script se recusa a restaurar num banco que já tenha tabelas, e no fim mostra contagens para
   comparar com o painel. Ele precisa do age e das ferramentas do Postgres 17 (ou do Docker).

## 8. Primeiro uso de ponta a ponta

1. `https://seudominio.com.br/entrar` → entre com o e-mail de `ADMIN_EMAILS`. O código chega em
   segundos.
   - No Gmail, abra o e-mail → **Mostrar original**: SPF, DKIM e DMARC devem estar `PASS`.
   - Teste também um Hotmail/Outlook e confira a caixa de spam.
2. Crie um evento, envie a arte e salve o ingresso (aba **Ingresso**).
3. Crie um lote (aba **Lotes**) e clique em **Marcar como pago**.
4. Cadastre vendedores e entregue faixas.
5. Na aba **Arquivos**, gere o A4 e baixe.
6. Na aba **Portaria**, crie um link e abra no celular (ou leia o QR do link com a câmera). Dê um
   nome ao celular, deixe a lista de prontidão verde e leia um ingresso impresso.
7. Teste sem sinal: ponha o celular em modo avião, feche e abra a página de novo e leia outro
   ingresso. Ao voltar o sinal, a leitura sincroniza.
8. Confira a aba **Relatório**.

Depois disso, siga o ensaio geral em [`docs/ensaio.md`](ensaio.md).

## 9. Rotina

- **Nada de deploy em dia de evento.** Todo push no `main` que mexe na API vai para produção depois
  do CI verde. Em dia de evento, não faça merge.
- **Backup:** confira de vez em quando que o **Backup** rodou (aba **Actions**) e que o artefato
  não está minúsculo. Em repositório público, o GitHub desliga agendamentos depois de 60 dias sem
  atividade e avisa por e-mail. Para religar: **Actions** → **Backup** → **Enable workflow**.
- **Restauração:** uma vez por mês (passo 7).
- **Token da Vercel:** renove antes de expirar. Vencido, o **Deploy web** falha.
- **Neon:** o plano gratuito reinicia o banco para atualizações e avisa no painel com um dia de
  antecedência. Antes de um evento, confira se não há reinício marcado para a hora do show.
- **Limites gratuitos:** Resend, até 100 e-mails por dia (cada código de login é um e-mail); Neon,
  1 GB (a arte fica no banco). Quando houver clientes pagando, a Vercel exige o plano Pro.
- **Logs:** Render → serviço → **Logs**, guardados por 7 dias no plano Hobby.

## 10. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Painel diz "Sem conexão com o servidor", mas há internet | A origem do site não está em `ALLOWED_ORIGINS`, ou `NEXT_PUBLIC_API_URL` está errada | No navegador, abra o console (F12): um erro de CORS confirma. Corrija `ALLOWED_ORIGINS` no Render (**Save and deploy**) ou a variável na Vercel e rode o **Deploy web** de novo |
| O código de login não chega | Domínio não verificado no Resend, `MAIL_FROM` com domínio diferente de `mail.seudominio.com.br`, ou limite diário | Nos **Logs** do Render, procure `resend answered`: a mensagem diz o motivo. Confira o spam |
| "Muitas tentativas" no login | Cinco pedidos de código em 15 minutos (as falhas também contam) | Espere 15 minutos depois de corrigir a causa |
| Deploy do Render falha logo ao subir | Variável faltando ou inválida | **Logs**: `configuration error: ...` mostra qual |
| Um push no `main` não atualizou a API | O CI ficou vermelho (o Render espera os checks) ou o commit não mexeu na API (`buildFilter`) | Corrija o CI, ou use **Manual Deploy** → **Deploy latest commit** |
| **Deploy web** vermelho com "Set NEXT_PUBLIC_API_URL" | Variável ausente ou do tipo Secret na Vercel | Recrie como **Config** para Production e Preview |
| **Deploy web** verde, mas o site não mudou | Faltam os secrets da Vercel (a execução só avisa) | Veja o aviso na execução e crie os três secrets |
| O site não abre em certa operadora | O registro A não é `76.76.21.21` | Troque no Registro.br |
| Vercel mostra "Invalid Configuration" | Registro errado, A ou AAAA a mais, ou DNS ainda propagando | Confira a tabela do passo 6 e espere até uma hora |
| Download diz "O arquivo expirou" | Os arquivos são cache e somem a cada deploy ou reinício | Gere de novo na aba **Arquivos** |
| **Backup** vermelho no tamanho do arquivo | O `pg_dump` falhou (URL, senha ou papel) | Veja o log da execução e confira o secret `BACKUP_DATABASE_URL` |
| Primeiro acesso do dia demora um pouco | O banco do Neon estava dormindo (econômico de propósito) | Normal: leva menos de um segundo para acordar |

## Resumo

**Registros no Registro.br** (nomes relativos ao domínio):

| Tipo | Nome | Valor | Serve para |
|---|---|---|---|
| A | (vazio) | `76.76.21.21` | site (Vercel) |
| CNAME | `www` | `cname.vercel-dns.com` | site (redireciona) |
| CNAME | `api` | host do serviço no Render, ex. `ingressoimpresso-api.onrender.com` | API |
| MX | `send.mail` | `feedback-smtp.sa-east-1.amazonses.com` (prioridade 10) | Resend |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | Resend |
| TXT | `resend._domainkey.mail` | `p=...` (copie do Resend) | Resend |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | e-mail |

**Onde fica cada segredo:**

| Valor | Render | Vercel | GitHub | Gerenciador de senhas |
|---|---|---|---|---|
| Chave mestra | `TICKET_KEY_ENCRYPTION_KEY` | | | sim |
| String do Neon (`neondb_owner`) | `DATABASE_URL` | | | sim |
| Chave do Resend | `RESEND_API_KEY` | | | sim |
| Endereço da API | `PUBLIC_API_URL` | `NEXT_PUBLIC_API_URL` (Config) | | |
| Origens do site | `ALLOWED_ORIGINS` | | | |
| Token e IDs da Vercel | | | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | token |
| Papel de backup | | | `BACKUP_DATABASE_URL` | sim |
| Chave pública do backup | | | `BACKUP_AGE_RECIPIENT` | |
| Chave privada do backup | | | | `backup-key.txt` |

**Prévias de um branch** (opcional): depois do merge, **Actions** → **Deploy web** → **Run workflow**
com outro branch publica uma prévia em `https://ingressoimpresso-preview.vercel.app`, protegida pelo
login da Vercel. Ela usa a API e o banco de **produção**. Para funcionar, acrescente esse endereço em
`ALLOWED_ORIGINS` no Render.
