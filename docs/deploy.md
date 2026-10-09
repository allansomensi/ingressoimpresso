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
| Render | Starter (0,5 CPU, 512 MB, sempre ligado) | cerca de US$ 7, mais US$ 0,15 por GB baixado acima de 5 GB/mês (os PDFs e ZIPs saem pela API) |
| Neon | Free (100 CU-hora, 1 GB de banco e 5 GB de transferência por mês) | US$ 0 |
| Resend | Free (100 e-mails/dia, 3.000/mês) | US$ 0 |
| Vercel | Pro | US$ 20 por mês por membro (o Hobby gratuito não permite uso comercial) |
| GitHub Actions | repositório público | US$ 0 |

**Ordem:** chaves locais → código no `main` → Neon → Resend + DNS → Render → Vercel → backup →
teste completo. O DNS e a primeira compilação no Render são as partes demoradas, então comece pelo
Resend logo depois do Neon.

## 0. Antes de começar

Você vai precisar de:

- um **gerenciador de senhas** (Bitwarden, 1Password ou similar) para guardar as chaves;
- um **cartão de crédito** para o Render (o plano Starter é pago);
- contas no **GitHub** (o repositório), na **Vercel** (plano Pro, entrando com o GitHub), no
  **Neon**, no **Resend** e no **Render**;
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
3. Deixe a aba **Records** aberta: os registros dela entram no DNS no passo seguinte.
4. **API Keys** → **Create API Key**:
   - **Name:** `ingressoimpresso-render`;
   - **Permission:** **Sending access**;
   - **Domain:** **All domains**. Uma chave restrita a `mail.seudominio.com.br` só pode ser criada
     depois da verificação e não envia pelo remetente de teste do Resend.

   Copie a chave (`re_...`) para o gerenciador de senhas: ela só aparece uma vez.

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

   - Copie os registros **da aba Records do Resend**, inclusive o **tipo**: se forem diferentes da
     tabela, valem os do Resend. Domínios novos podem receber, no lugar do MX e do TXT de
     `send.mail`, dois registros **CNAME** (por exemplo `send.mail` e `rsend.mail`). Nesse caso,
     crie só os CNAME, e não o MX nem o TXT de `send.mail`: um CNAME não divide o nome com nenhum
     outro registro.
   - Se o formulário do MX não tiver campo de prioridade, escreva `10 feedback-smtp...`.
   - Só pode existir **um** MX em `send.mail`.
4. Clique em **Salvar alterações**. Nada é publicado sem isso.
5. No Resend: **Domains** → `mail.seudominio.com.br` → **Verify DNS Records**. Costuma ficar
   **Verified** em uns 15 minutos (no pior caso, até 72 horas). Se ficar **Failed**, corrija o
   registro que não ficou verde e clique em **Restart verification**. Com dois CNAME, o domínio
   pode aparecer como **Partially verified** até o segundo ser confirmado.

Em **Domains** → **Configuration**, deixe o rastreamento de cliques e aberturas desligado (é o
padrão).

## 5. Render (API)

1. Entre em `https://dashboard.render.com` com o GitHub e cadastre o cartão em **Billing**.
2. **New** → **Blueprint** → escolha o repositório `allansomensi/ingressoimpresso`. Se ele não
   aparecer, clique em **Configure GitHub** e libere o repositório para o app do Render.
3. **Blueprint Name:** `ingressoimpresso`; **Branch:** `main`. Deixe o caminho do Blueprint em
   branco (`render.yaml`). A revisão deve mostrar um serviço: `ingressoimpresso-api`, Docker,
   Virginia, Starter.
4. Preencha as variáveis pedidas:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a string do Neon com `?sslmode=verify-full` (passo 2) |
   | `TICKET_KEY_ENCRYPTION_KEY` | a chave mestra (passo 0) |
   | `RESEND_API_KEY` | a chave `re_...` (passo 3) |
   | `MAIL_FROM` | `Ingresso Impresso <login@mail.seudominio.com.br>` |
   | `ADMIN_EMAILS` | seu e-mail (pode marcar lotes como pagos); vários, separados por vírgula |
   | `PUBLIC_API_URL` | `https://api.seudominio.com.br` |
   | `ALLOWED_ORIGINS` | `https://seudominio.com.br,https://www.seudominio.com.br` |

   - Sem barra no fim, sem espaços dentro dos endereços.
   - Se o Resend ainda não verificou o domínio, use por enquanto
     `Ingresso Impresso <onboarding@resend.dev>` em `MAIL_FROM`. Nesse modo, só o e-mail da sua conta
     no Resend recebe os códigos. Quando ficar **Verified**, troque `MAIL_FROM` por
     `Ingresso Impresso <login@mail.seudominio.com.br>` (**Save and deploy**, abaixo).
5. Clique em **Deploy Blueprint**. A primeira compilação do Rust leva de 20 a 40 minutos; as
   seguintes são bem mais rápidas. Acompanhe em `ingressoimpresso-api` → **Events** → o deploy em
   andamento.
6. Quando ficar **Live**, copie o endereço do serviço no topo da página
   (`https://ingressoimpresso-api.onrender.com` ou parecido, às vezes com um sufixo) e teste:
   - `…/healthz` → 200 (a API está de pé);
   - `…/readyz` → 200 (o banco também respondeu).

   Se o deploy falhar, abra **Logs**. Uma variável faltando ou inválida aparece como
   `configuration error: ...`, com o nome dela. Um problema na `DATABASE_URL` (senha, host com
   `-pooler` ou `sslmode`) aparece como `server stopped` com `connecting to the database`: copie de
   novo a string do Neon (passo 2).
7. **Domínio da API:** em **Settings** → **Custom Domains** → **Add Custom Domain**, digite
   `api.seudominio.com.br` e salve.
8. No Registro.br, **Nova entrada**: tipo **CNAME**, nome `api`, valor = o host do serviço sem
   `https://` (por exemplo `ingressoimpresso-api.onrender.com`). **Salvar alterações**.
9. De volta ao Render, clique em **Verify**. O certificado HTTPS sai sozinho em alguns minutos.
   Teste `https://api.seudominio.com.br/readyz` → 200.

Para mudar uma variável depois: serviço → **Environment** → editar → no botão de salvar, escolha
**Save and deploy**. Ele reaproveita a compilação; **Save, rebuild, and deploy** recompila tudo à toa.

## 5.1 Stripe (pagamento dos lotes, ADR 0020)

Sem a Stripe a API funciona, mas só o admin libera lotes (**Marcar como pago**). Para o
organizador pagar sozinho, com Pix ou cartão:

1. Crie a conta em `https://dashboard.stripe.com/register`, com país **Brasil**, e complete a
   ativação (dados da pessoa ou da empresa e a conta bancária do repasse).
2. **Settings** → **Payments** → **Payment methods**: ative **Cartões** e **Pix**. O Checkout mostra
   o que estiver ativo aqui; nada muda no código.
3. Comece em **modo de teste** (chave `sk_test_...`): faça o passo a passo abaixo, pague um lote
   com o cartão `4242 4242 4242 4242` (qualquer validade futura e CVC) e só depois repita com as
   chaves de produção.
4. **Developers** → **Webhooks** → **Add endpoint**:
   - **Endpoint URL:** `https://api.seudominio.com.br/api/stripe/webhook`;
   - **Events:** `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed` e `checkout.session.expired`.

   Depois de criar, copie o **Signing secret** (`whsec_...`).
5. **Developers** → **API keys**: copie a **Secret key** (`sk_live_...`). Uma **restricted key** com
   escrita em **Checkout Sessions** também serve e é mais segura.
6. No Render → serviço → **Environment**, acrescente (e **Save and deploy**):

   | Variável | Valor |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_live_...` (ou `sk_test_...` no ensaio) |
   | `STRIPE_WEBHOOK_SECRET` | o `whsec_...` do passo 4 |
   | `PUBLIC_WEB_URL` | `https://seudominio.com.br` (para onde a Stripe devolve o pagador) |

   Preços, ingressos grátis por conta, promoções e cupons ficam no painel, em **Admin** →
   **Preços**, **Promoções** e **Cupons** (ADRs 0039 e 0040). A variável `FREE_TICKETS` não existe
   mais: se ela estiver no Render, pode apagar.

   As duas chaves vão juntas: com uma só, a API não sobe e o log diz qual falta. Em produção, uma
   chave de teste só gera um aviso no log.
7. Teste: crie um lote, clique em **Pagar** e pague. Ao voltar ao painel, o lote aparece **Pago**.
   Em **Developers** → **Webhooks** → o endpoint, as entregas devem estar com `200`.

Desenvolvimento local: com a [Stripe CLI](https://docs.stripe.com/stripe-cli), rode
`stripe listen --forward-to localhost:8080/api/stripe/webhook`, ponha o `whsec_...` que ela mostra
em `STRIPE_WEBHOOK_SECRET` e uma `sk_test_...` em `STRIPE_SECRET_KEY` no `.env`.

Estornos (raros: lote cancelado e pago ao mesmo tempo, ou pago duas vezes) aparecem no log como
`refund it in Stripe` e são feitos à mão no painel da Stripe, em **Payments**.

Pedidos de reembolso de um lote pago (arrependimento em 7 dias, Política de Reembolso) são feitos
pelo painel: **Admin** → **Lotes** → filtro **Pagos** → menu do lote → **Estornar**. Com
"Devolver o dinheiro pela Stripe agora" ligado, a API pede o estorno à Stripe; a chave precisa de
escrita em **Refunds** (uma restricted key com Checkout Sessions e Refunds). Em qualquer caso, o
lote vira **Estornado** e os números dele ficam cancelados na porta para sempre (ADR 0032).

## 5.2 Login com Google (ADR 0029)

Opcional, mas recomendado: o plano grátis da Resend envia 100 e-mails por dia, e com o Google o
login não depende de e-mail.

1. Em `https://console.cloud.google.com`, crie um projeto (`Ingresso Impresso`).
2. **APIs e serviços** → **Tela de consentimento OAuth** (ou **Google Auth Platform**): tipo
   **Externo**, nome `Ingresso Impresso`, e-mail de suporte, logo (opcional), domínio autorizado
   `seudominio.com.br` e os links `https://seudominio.com.br/privacidade` e
   `https://seudominio.com.br/termos`. Escopos: só os padrão (`openid`, `email`, `profile`).
   Publique o app (**Em produção**); com esses escopos não há revisão do Google.
3. **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → **Aplicativo da Web**:
   - **Origens JavaScript autorizadas:** `https://seudominio.com.br` e
     `https://www.seudominio.com.br` (e `http://localhost:3000` para testar em casa);
   - **URIs de redirecionamento:** deixe em branco (o botão usa popup).
4. Copie o **ID do cliente** (`...apps.googleusercontent.com`). Não é segredo; o "segredo do
   cliente" não é usado.
5. No Render → serviço → **Environment**: `GOOGLE_CLIENT_ID` = o ID do passo 4 → **Save and
   deploy**. O botão "Continuar com Google" aparece no `/entrar` sozinho (o site pergunta à API).

Teste: entre com uma conta Google cujo e-mail já tem conta por código. É a mesma conta, agora com
"Login com Google ligado" em **Minha conta**.

## 5.3 Limite de e-mails (ADR 0028)

`MAIL_DAILY_LIMIT` (padrão `95`) é o máximo de e-mails em 24 horas, abaixo dos 100 do plano grátis
da Resend. Ao chegar nele, o login por código pede para entrar com o Google até o dia virar. Se
mudar de plano na Resend, suba o valor (ou `0` para não limitar). Códigos para e-mails sem conta
usam no máximo dois terços do limite, para quem já tem conta sempre conseguir entrar. Cada IP pede
no máximo 10 códigos por hora (o IP vem do `CF-Connecting-IP` que o Render recebe da Cloudflare).

## 5.4 Webhook da Resend (opcional, ADR 0041)

Sem ele, o painel **Admin** → **E-mails** mostra cada e-mail como "Enviado". Com ele, mostra também
"Entregue", "Devolvido" e "Marcado como spam", o que ajuda quando alguém diz que o código não
chegou.

1. Na Resend: **Webhooks** → **Add Webhook**.
2. Endpoint: `https://api.seudominio.com.br/api/resend/webhook`.
3. Eventos: `email.delivered`, `email.delivery_delayed`, `email.bounced` e `email.complained`.
4. Copie o **Signing secret** (`whsec_...`).
5. No Render → serviço → **Environment**: `RESEND_WEBHOOK_SECRET` com esse valor → **Save and
   deploy**.

Teste: em **Admin** → **E-mails**, clique em **Enviar teste**. Em alguns segundos o e-mail aparece
como "Entregue".

## 5.5 Análise automática das artes (opcional, ADR 0042)

Sem a chave, nenhuma imagem é sinalizada sozinha. Você revê as artes em **Admin** → **Moderação** →
**Envios recentes**. Com a chave, o Google Cloud Vision analisa cada arte nova, e as que parecem
sexuais ou violentas esperam a sua decisão antes de serem impressas.

1. Em `https://console.cloud.google.com`, use o projeto do login com Google (passo 5.2) ou crie um.
2. **APIs e serviços** → **Biblioteca** → ative a **Cloud Vision API**. O Google pede uma conta de
   faturamento, mas as primeiras 1.000 imagens de cada mês são grátis.
3. **Credenciais** → **Criar credenciais** → **Chave de API**. Em **Restringir chave**, permita só a
   **Cloud Vision API**.
4. No Render → serviço → **Environment**: `MODERATION_VISION_API_KEY` com a chave → **Save and
   deploy**.

Opcional: `MODERATION_DAILY_LIMIT` (padrão `30` imagens por dia, dentro da cota grátis). Passado o
limite, as artes do dia ficam para revisão manual.

## 6. Vercel (site, painel e portaria)

O build da Vercel não tem Rust, e a portaria precisa do WebAssembly do núcleo. Por isso quem
compila e publica é o GitHub Actions (workflow **Deploy web**). O `apps/web/vercel.json` desliga os
builds automáticos da Vercel.

1. Se ainda não tem o projeto: **Add New** → **Project** → importe `allansomensi/ingressoimpresso`.
   Antes de clicar em **Deploy**, escolha **Root Directory** = `apps/web` e confira que o
   **Framework Preset** ficou **Next.js**. Esse primeiro build falha, porque a Vercel não tem Rust:
   é esperado.
2. No projeto da Vercel, em **Settings**:
   - **Build and Deployment:** **Root Directory** = `apps/web`, **Framework Preset** = Next.js,
     **Node.js Version** = 22.x;
   - **Git:** se houver um repositório conectado, desconecte. Assim nenhum push dispara um build
     que falharia.
3. **Settings** → **Environment Variables** → nova variável:
   - **Key:** `NEXT_PUBLIC_API_URL`;
   - **Value:** `https://api.seudominio.com.br` (sem barra no fim);
   - **Type:** **Config**, não Secret: variáveis `NEXT_PUBLIC_` vão para o navegador, e uma Secret
     chegaria vazia no build;
   - **Environments:** Production e Preview.
4. **Settings** → **Domains** → **Add Domain** → `seudominio.com.br`. Aceite adicionar também o
   `www.seudominio.com.br` e escolha **redirecionar `www` para `seudominio.com.br`** (308). O site
   fica no domínio sem `www`, e o link da portaria também.
5. No Registro.br, **Nova entrada** para cada registro e depois **Salvar alterações**:

   | Tipo | Nome | Valor |
   |---|---|---|
   | A | (vazio) | `76.76.21.21` |
   | CNAME | `www` | `cname.vercel-dns.com` |

   - A Vercel às vezes sugere valores novos (`216.198.79.1`, `64.29.17.1` ou um CNAME com
     `vercel-dns-0NN.com`). Os valores da tabela continuam aceitos, e em 2026 houve relatos de
     operadoras brasileiras sem acesso aos IPs novos. Para um público no Brasil, prefira os da
     tabela.
   - Só um registro A no domínio raiz, e nenhum AAAA em `@`, `www` ou `api`.
6. Na Vercel, **Domains** → **Refresh** até os dois aparecerem como **Valid Configuration**, com
   certificado emitido.
7. **Token para o GitHub:** avatar → **Account Settings** → **Tokens** → **Create**:
   - **Scope:** clique no time dono do projeto e escolha **All Projects** (não "Full Account" nem um
     projeto só);
   - **Expiration:** 1 ano, com um lembrete na agenda para renovar.

   Copie o token: ele só aparece uma vez.
8. **IDs:**
   - **Project ID** (`prj_...`): projeto → **Settings** → **General**;
   - **Team ID** (`team_...`): seu time → **Settings** → **General**. Toda conta pessoal agora é um
     time, e é o ID do time do plano Pro que vai no `VERCEL_ORG_ID`.
9. No GitHub: repositório → **Settings** → **Secrets and variables** → **Actions** → aba **Secrets**
   → **New repository secret**, três vezes:

   | Secret | Valor |
   |---|---|
   | `VERCEL_TOKEN` | o token do item 7 |
   | `VERCEL_ORG_ID` | o Team ID (`team_...`) |
   | `VERCEL_PROJECT_ID` | o Project ID (`prj_...`) |

10. **Publicar:** aba **Actions** → **Deploy web** → **Run workflow** → **Branch: main** → marque
    **Production deploy** → **Run workflow**. Quando terminar, o resumo da execução mostra
    `Deployed (production): https://...`. Daqui em diante, todo push no `main` publica sozinho.

    A Vercel pode recusar o deploy quando o autor do último commit não tem acesso ao time, e os
    commits do branch de trabalho são de `Claude <noreply@anthropic.com>`. Por isso, leve código ao
    `main` sempre por pull request com **Create a merge commit** feito por você no GitHub: o commit
    de merge é seu.
11. Teste:
    - `https://seudominio.com.br` abre;
    - `https://www.seudominio.com.br` redireciona para ele;
    - em `https://seudominio.com.br/entrar`, peça um código de login.

Teste o site em mais de uma operadora (Vivo, Claro, TIM e a internet de casa). Se alguma não abrir e
o registro A não for `76.76.21.21`, troque-o por esse valor.

### Métricas (Vercel Web Analytics, ADR 0022)

No projeto da Vercel → **Analytics** → **Enable**. O site já carrega o script; a portaria não
(ela precisa abrir offline). Os dados aparecem na própria aba **Analytics** em alguns minutos.
O endereço canônico do site (sitemap, Open Graph) é `https://ingressoimpresso.com.br`; para outro
domínio, crie a variável `NEXT_PUBLIC_SITE_URL` (Config) na Vercel.

## 7. Backup (ADR 0019)

O Neon gratuito só volta 6 horas no tempo. Além disso, o workflow **Backup** grava todo dia, às
03:17 de Brasília, um `pg_dump` cifrado com age, guardado por 30 dias como artefato do GitHub. O
repositório é público, mas o arquivo só abre com a sua chave privada.

1. **Papel só de leitura no Neon**, criado **depois** que a API subiu (as tabelas precisam
   existir). Gere uma senha só com letras e números:

   - macOS, Linux ou Git Bash no Windows:

     ```sh
     openssl rand -hex 24
     ```

   - Windows PowerShell:

     ```powershell
     $b = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
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
4. Prepare o computador (macOS, Linux ou WSL no Windows) uma vez: instale o `git`, o
   [`just`](https://just.systems) (macOS `brew install just`; Ubuntu/Debian/WSL
   `sudo apt install just`), o age (no WSL, `sudo apt install age`: o do Windows não vale lá
   dentro) e as ferramentas do Postgres 17 (ou o Docker). Depois clone o repositório:

   ```sh
   git clone https://github.com/allansomensi/ingressoimpresso
   ```

5. Copie para a pasta do clone o `.dump.age` descompactado e recrie o `backup-key.txt` a partir do
   gerenciador de senhas (o `.gitignore` impede que eles sejam commitados). Na pasta do clone:

   ```sh
   RESTORE_DATABASE_URL='<string do item 3>' \
     just backup-restore-test ingressoimpresso-AAAAMMDDTHHMMZ.dump.age backup-key.txt
   ```

   O script se recusa a restaurar num banco que já tenha tabelas, e no fim mostra contagens para
   comparar com o painel. Depois, apague o `backup-key.txt` e o `.dump.age` da pasta.

## 8. Primeiro uso de ponta a ponta

1. `https://seudominio.com.br/entrar` → entre com o e-mail de `ADMIN_EMAILS`. O código chega em
   segundos.
   - No Gmail, abra o e-mail → **Mostrar original**: SPF, DKIM e DMARC devem estar `PASS`.
   - Teste também um Hotmail/Outlook e confira a caixa de spam.
2. Crie um evento, envie a arte e salve o ingresso (aba **Ingresso**).
3. Crie um lote (aba **Lotes**) e clique em **Pagar** (com a Stripe configurada, passo 5.1) ou em
   **Marcar como pago** (admin).
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
  dos checks verdes. Em dia de evento, não faça merge.
- **Backup:** confira de vez em quando que o **Backup** rodou (aba **Actions**) e que o artefato
  não está minúsculo. Em repositório público, o GitHub desliga agendamentos depois de 60 dias sem
  atividade e avisa por e-mail. Para religar: **Actions** → **Backup** → **Enable workflow**.
- **Restauração:** uma vez por mês (passo 7).
- **Token da Vercel:** renove antes de expirar. Vencido, o **Deploy web** falha, e com ele o Render
  deixa de publicar a API: ele só publica commits com todos os checks verdes.
- **Neon:** o plano gratuito reinicia o banco para atualizações e avisa no painel com um dia de
  antecedência. Antes de um evento, confira se não há reinício marcado para a hora do show.
- **Limites gratuitos e uso:**
  - Resend: até 100 e-mails por dia (cada código de login é um e-mail).
  - Neon, por mês: 100 CU-hora, 1 GB de banco e 5 GB de transferência para fora. Se a CU-hora ou a
    transferência acabar, o Neon **suspende o banco até o mês seguinte** e a API para. Só a API
    acordando o banco de hora em hora gasta uns 15 CU-hora. O backup diário baixa o banco inteiro
    todo dia, e cada prévia ou arquivo gerado lê a arte do banco: com o banco acima de uns 100 MB,
    o backup sozinho passa da metade dos 5 GB. Uma vez por semana, confira no **Dashboard** do
    projeto **Compute** e **Network transfer** do mês. Perto do limite, mude para o plano **Launch** (sem
    mínimo mensal, paga pelo uso), principalmente antes de um evento.
  - Render: o workspace Hobby inclui 5 GB de saída por mês; acima disso, US$ 0,15 por GB. Os PDFs
    e ZIPs são baixados pela API.
  - Vercel: plano Pro (uso comercial). Web Analytics entra na cota do plano.
- **Logs:** Render → serviço → **Logs**, guardados por 7 dias no plano Hobby.

## 10. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Painel diz "Sem conexão com o servidor", mas há internet | A origem do site não está em `ALLOWED_ORIGINS`, ou `NEXT_PUBLIC_API_URL` está errada | No navegador, abra o console (F12): um erro de CORS confirma. Corrija `ALLOWED_ORIGINS` no Render (**Save and deploy**) ou a variável na Vercel e rode o **Deploy web** de novo |
| O código de login não chega | Domínio não verificado no Resend, `MAIL_FROM` com domínio diferente de `mail.seudominio.com.br`, ou limite diário | Nos **Logs** do Render, procure `resend answered`: a mensagem diz o motivo. Confira o spam |
| Login diz "Os códigos por e-mail acabaram por hoje" | `MAIL_DAILY_LIMIT` atingido em 24 horas | Entre com o Google (passo 5.2). Se for frequente, mude o plano da Resend e suba `MAIL_DAILY_LIMIT` |
| Organizadores veem "Voltamos em instantes" | O modo manutenção está ligado | **Admin** → **Configurações** → **Modo manutenção** → **Desligado** → **Salvar** |
| Ninguém consegue criar conta | Cadastros fechados ou domínio bloqueado | **Admin** → **Configurações**: ligue **Aceitar novas contas** e confira os domínios |
| Uma arte não gera arquivos ("em análise") | A imagem foi sinalizada | **Admin** → **Moderação** → **Liberar** ou **Recusar** |
| O botão do Google não aparece no login | `GOOGLE_CLIENT_ID` ausente, ou a origem do site não está nas **Origens JavaScript autorizadas** | Passo 5.2. No console do navegador, o Google avisa `origin is not allowed` |
| "Muitas tentativas" no login | Cinco pedidos de código em 15 minutos (as falhas também contam) | Espere 15 minutos depois de corrigir a causa |
| Deploy do Render falha logo ao subir | Variável faltando ou inválida, ou `DATABASE_URL` errada | **Logs**: `configuration error: ...` mostra qual variável. `server stopped` com `connecting to the database` aponta a `DATABASE_URL`: copie de novo a string do Neon (sem `-pooler`, com `?sslmode=verify-full`) |
| Um push no `main` não atualizou a API | Algum check do commit ficou vermelho, o **CI** ou o **Deploy web** (o Render espera todos), ou o commit não mexeu na API (`buildFilter`) | Corrija o check vermelho (no **Deploy web**, quase sempre é o token da Vercel vencido), ou use **Manual Deploy** → **Deploy latest commit** |
| **Deploy web** vermelho com "Set NEXT_PUBLIC_API_URL" | Variável ausente ou do tipo Secret na Vercel | Recrie como **Config** para Production e Preview |
| **Deploy web** verde, mas o site não mudou | Faltam os secrets da Vercel (a execução só avisa) | Veja o aviso na execução e crie os três secrets |
| **Deploy web** vermelho com `Git author ... must have access to the team` | O último commit não é de um membro do time da Vercel | Faça o merge pelo GitHub com **Create a merge commit**, ou um commit seu no topo do branch, e rode de novo |
| O site não abre em certa operadora | O registro A não é `76.76.21.21` | Troque no Registro.br |
| Vercel mostra "Invalid Configuration" | Registro errado, A ou AAAA a mais, ou DNS ainda propagando | Confira a tabela do passo 6 e espere até uma hora |
| Download diz "O arquivo expirou" | Os arquivos são cache: somem depois de 24 horas e a cada deploy ou reinício | Gere de novo na aba **Arquivos** |
| **Backup** vermelho no passo *Dump and encrypt* | O `pg_dump` falhou (URL, senha ou papel) ou gerou um arquivo quase vazio | Veja o log da execução e confira o secret `BACKUP_DATABASE_URL` |
| A API para de responder no fim do mês, e o Neon mostra o banco suspenso | Acabou a CU-hora ou a transferência do plano gratuito | Mude o projeto do Neon para o plano **Launch**; o banco volta na hora |
| O pagamento foi feito, mas o lote continua **Aguardando pagamento** | O webhook da Stripe não chega ou é recusado (`STRIPE_WEBHOOK_SECRET` de outro endpoint, URL errada) | Em **Developers** → **Webhooks**, veja as entregas: `400` é segredo errado. Corrija e clique em **Resend**. No painel, **Já paguei** consulta a Stripe direto |
| Botão **Pagar** diz "Pagamento online indisponível" | `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` não configuradas | Passo 5.1; enquanto isso, o admin marca o lote como pago |
| Primeiro acesso do dia demora um pouco | O banco do Neon estava dormindo (econômico de propósito) | Normal: leva menos de um segundo para acordar |

## Resumo

**Registros no Registro.br** (nomes relativos ao domínio):

| Tipo | Nome | Valor | Serve para |
|---|---|---|---|
| A | (vazio) | `76.76.21.21` | site (Vercel) |
| CNAME | `www` | `cname.vercel-dns.com` | site (redireciona) |
| CNAME | `api` | host do serviço no Render, ex. `ingressoimpresso-api.onrender.com` | API |
| MX | `send.mail` | `feedback-smtp.sa-east-1.amazonses.com` (prioridade 10), **ou** os CNAME que a aba Records mostrar (nunca os dois jeitos juntos) | Resend |
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
| Endereço do site (retorno da Stripe) | `PUBLIC_WEB_URL` | | | |
| Chave da Stripe | `STRIPE_SECRET_KEY` | | | sim |
| Segredo do webhook da Stripe | `STRIPE_WEBHOOK_SECRET` | | | |
| ID do cliente Google (não é segredo) | `GOOGLE_CLIENT_ID` | | | |
| Limite de e-mails por dia | `MAIL_DAILY_LIMIT` (opcional) | | | |
| Segredo do webhook da Resend | `RESEND_WEBHOOK_SECRET` (opcional) | | | |
| Chave do Google Cloud Vision | `MODERATION_VISION_API_KEY` (opcional) | | | |
| Token e IDs da Vercel | | | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | token |
| Papel de backup | | | `BACKUP_DATABASE_URL` | sim |
| Chave pública do backup | | | `BACKUP_AGE_RECIPIENT` | |
| Chave privada do backup | | | | `backup-key.txt` |

**Prévias de um branch** (opcional): depois do merge, **Actions** → **Deploy web** → **Run workflow**
com outro branch publica uma prévia em `https://ingressoimpresso-preview.vercel.app`, protegida pelo
login da Vercel. Ela usa a API e o banco de **produção**. Para funcionar, acrescente esse endereço em
`ALLOWED_ORIGINS` no Render. Se a execução avisar `Could not alias the preview`, esse nome não está
livre: em **Settings** → **Secrets and variables** → **Actions** → aba **Variables**, crie
`VERCEL_PREVIEW_ALIAS` com outro nome (por exemplo `seudominio-preview.vercel.app`) e use esse
endereço em `ALLOWED_ORIGINS`. O último commit do branch precisa ser de um membro do time (veja o
passo 6).

## Antes de abrir ao público

- **Identificação do fornecedor** (Decreto 7.962/2013): preencha o endereço físico em
  `LEGAL_ENTITY.address` (`apps/web/src/content/legal.ts`). Pode ser um endereço comercial ou de
  escritório virtual. Ele aparece nos três documentos legais.
- **E-mail de contato:** `contato@seudominio.com.br` (em `LEGAL_ENTITY.email`) precisa receber
  mensagens. A Resend só envia: use o encaminhamento de e-mail do seu provedor de domínio, ou um
  serviço como ImprovMX ou Cloudflare Email Routing, para mandar esse endereço para o seu e-mail.
- **Novidades:** publique a primeira nota em **Admin** → **Novidades**; ela aparece em `/novidades`
  e no sino do painel de todo mundo.

