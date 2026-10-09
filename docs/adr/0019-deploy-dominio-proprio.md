# 0019. Deploy com domínio próprio: imagem no Render, banco que dorme e configuração explícita

- **Status:** Aceito
- **Data:** 2026-10-09
- **Substitui em parte:** [0013](0013-infraestrutura-render-neon.md) (como a imagem é gerada e
  implantada, e a frequência do backup). Região, Neon, Resend e segredos continuam valendo.

## Contexto

O domínio foi comprado, e a pesquisa para o primeiro deploy de verdade encontrou divergências entre
o ADR 0013 e o que o código faz, além de limites dos serviços que o ADR não previa:

1. **Imagem:** o ADR 0013 previa compilar a imagem no GitHub Actions, publicar no GHCR e acionar um
   deploy hook. O que existe é um Blueprint do Render (`render.yaml`) que compila o Dockerfile no
   próprio Render, e a imagem nunca tinha sido compilada antes do primeiro deploy.
2. **Neon Free:** o plano gratuito dá 100 CU-hora por mês. O worker de exportação consultava o
   banco a cada 10 s, e o health check do Render (a cada poucos segundos) rodava `select 1`. O banco
   nunca dormia: cerca de 183 CU-hora por mês, e o Neon suspenderia o banco no meio do mês.
3. **Render:** variáveis com `value:` no Blueprint voltam ao valor do arquivo a cada sincronização.
   `ALLOWED_ORIGINS` estava fixo no endereço da Vercel, e a troca pelo domínio feita no painel seria
   desfeita.
4. **sqlx e o Neon:** a string que o Neon mostra termina em `sslmode=require&channel_binding=require`.
   O sqlx ignora `channel_binding` e, com `require`, não confere o certificado.
5. **Resend:** recusa requisições sem `User-Agent` (403, erro 1010), e o cliente HTTP da API não
   mandava nenhum. Nenhum código de login seria entregue.
6. **Histórico do Neon:** no plano gratuito, a restauração a um ponto no tempo cobre só 6 horas; o
   backup semanal deixava buracos.
7. **Falhas silenciosas:** sem `pipefail`, um `pg_dump` ou um `vercel deploy` com erro terminava
   verde. Configuração faltando em produção (origens, URL pública, admins) também não impedia a API
   de subir quebrada.

## Opções consideradas

**Neon:**

1. **Plano pago (Launch) com o banco sempre ligado.** Cerca de US$ 19 por mês só de computação.
2. **Deixar o banco dormir.** O health check não toca no banco, e o worker só consulta por conta
   própria a cada hora (novas exportações já o acordam na hora). O custo é o *cold start* de
   centenas de milissegundos no primeiro acesso depois de 5 min parado, que o ADR 0013 já aceitava.

**Imagem:**

1. **Voltar ao plano do ADR 0013** (GHCR + deploy hook). Mais peças e segredos para um mantenedor
   só.
2. **Manter o Blueprint e validar a imagem no CI.** O CI compila e sobe a mesma imagem contra um
   Postgres antes de qualquer deploy.

## Decisão

- **Endereços:** o site fica no domínio raiz (`https://seudominio.com.br`), com `www`
  redirecionando para ele (308), como o ADR 0007 já previa para o link da portaria. A API fica em
  `https://api.seudominio.com.br`, e o e-mail sai de `mail.seudominio.com.br`. O DNS fica no
  Registro.br, que assina a zona com DNSSEC sem custo.
- **Imagem:** o Render compila `deploy/api.Dockerfile` pelo Blueprint. As dependências ficam numa
  camada própria (cargo-chef). O `buildFilter` só recompila quando muda algo da API, e
  `autoDeployTrigger: checksPass` só implanta commits com o CI verde. O CI compila e sobe a mesma
  imagem a cada execução.
- **Banco que dorme:** `/healthz` responde sem consultar o banco (é o que o Render chama), e
  `/readyz` consulta. O worker consulta sozinho a cada hora (cerca de 15 CU-hora por mês). Com isso
  o plano gratuito do Neon basta no MVP.
- **Conexão:** `DATABASE_URL` usa o host direto do Neon com `?sslmode=verify-full`. O sqlx confere a
  cadeia com as raízes embutidas.
- **Configuração explícita:** `ALLOWED_ORIGINS` passa a `sync: false` (vive no painel do Render). As
  origens são normalizadas (minúsculas, sem barra no fim) e recusadas se tiverem caminho. Em
  produção, a API não sobe sem origens, sem `PUBLIC_API_URL` em https e sem `ADMIN_EMAILS`, e avisa
  no log se o remetente ainda for o de teste do Resend.
- **E-mail:** o cliente HTTP manda `User-Agent`, e o motivo de uma recusa do Resend vai para o log.
- **Backup:** diário, guardado por 30 dias, com `pipefail` e tamanho mínimo, feito por um papel só
  de leitura criado por SQL.
- **Web:** o workflow de deploy falha se `NEXT_PUBLIC_API_URL` não estiver definida em https.

## Consequências

- A primeira compilação no Render leva bem mais que as seguintes. As próximas reaproveitam a camada
  de dependências.
- Depois de 5 min sem uso, o primeiro acesso espera o banco acordar. Durante o evento, a portaria
  sincroniza a cada 3 s e mantém o banco acordado.
- O repositório é público: logs e artefatos do Actions são visíveis. O backup só é seguro porque
  sai cifrado com age, e a chave privada nunca vai para o GitHub.
- Limites dos planos gratuitos que pedem atenção quando houver clientes: Vercel Hobby é para uso
  não comercial (Pro custa US$ 20 por mês); Resend gratuito entrega até 100 e-mails por dia; o Neon
  gratuito guarda até 1 GB e transfere até 5 GB por mês para fora, e a arte de cada evento fica no
  banco. O backup diário copia o banco inteiro: com o banco acima de uns 100 MB, só ele gasta mais
  da metade da transferência. Ao esgotar CU-hora ou transferência, o Neon suspende o banco até o
  mês seguinte; o plano Launch não tem mínimo mensal e cobra pelo uso.
- O workspace Hobby do Render inclui 5 GB de saída por mês (US$ 0,15 por GB acima disso), e os
  arquivos gerados são baixados pela API.
