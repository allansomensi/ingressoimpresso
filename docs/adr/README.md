# Architecture Decision Records

Cada decisão relevante fica registrada aqui: o contexto, as alternativas consideradas, a escolha
feita e as consequências.

- Numeração sequencial (`NNNN-titulo.md`). Um ADR aceito não é reescrito: uma decisão nova o
  **substitui** e os dois apontam um para o outro.
- Status possíveis: `Proposto`, `Aceito`, `Substituído por NNNN`, `Rejeitado`.
- Use o [modelo](0000-modelo.md).

| ADR | Título | Status |
|---|---|---|
| [0001](0001-monorepo.md) | Monorepo com Cargo + pnpm workspaces e `just` | Aceito |
| [0002](0002-nucleo-rust-wasm.md) | Núcleo do ingresso em Rust puro, compartilhado via WASM | Aceito |
| [0003](0003-formato-qr-v1.md) | Formato do QR v1: binário fixo + base45 alfanumérico | Aceito |
| [0004](0004-assinatura-ed25519.md) | Assinatura Ed25519 com chave por evento | Aceito |
| [0005](0005-custodia-chaves.md) | Custódia das chaves privadas | Aceito |
| [0006](0006-portaria-offline-sync.md) | Portaria offline-first e sincronização | Aceito |
| [0007](0007-acesso-portaria.md) | Acesso da portaria sem login | Aceito |
| [0008](0008-geracao-arquivos-typst.md) | Geração de arquivos com Typst embutido | Aceito |
| [0009](0009-frontend-nextjs-vercel.md) | Frontend Next.js na Vercel, API Rust em outro domínio | Aceito (cookie substituído por 0016) |
| [0010](0010-leitura-qr-navegador.md) | Leitura de QR no navegador com zxing-wasm | Aceito |
| [0011](0011-modelo-dados-faixas.md) | Modelo de dados baseado em faixas | Aceito |
| [0012](0012-autenticacao-organizador.md) | Login do organizador por código via e-mail | Aceito (sessão por cookie substituída por 0016) |
| [0013](0013-infraestrutura-render-neon.md) | Infraestrutura: Render + Neon + Resend | Aceito (deploy e backup substituídos por 0019) |
| [0014](0014-pagamento-pix-adiado.md) | Pagamento Pix adiado para depois do MVP | Substituído por 0020 |
| [0015](0015-renderizacao-em-blocos.md) | Renderização em blocos, sangria nativa e JPEG para WhatsApp | Aceito (junção e folha de controle substituídas por 0017) |
| [0016](0016-sessao-bearer.md) | Sessão do painel por token Bearer e links de download assinados | Aceito |
| [0017](0017-juncao-pdf-e-sangria.md) | Junção de PDFs com objetos compartilhados, BleedBox e folha de controle em blocos | Aceito |
| [0018](0018-portaria-pwa.md) | Portaria no navegador: service worker, WebAssembly e regras da leitura | Aceito |
| [0019](0019-deploy-dominio-proprio.md) | Deploy com domínio próprio: imagem no Render, banco que dorme e configuração explícita | Aceito |
| [0020](0020-pagamento-stripe.md) | Pagamento dos lotes com Stripe Checkout | Aceito |
| [0021](0021-interface-e-pwa.md) | Identidade visual, sistema de design e painel instalável (PWA) | Aceito |
| [0022](0022-tema-e-analytics.md) | Tema escolhido pelo usuário e Vercel Web Analytics | Aceito (seletor do site movido por 0036) |
| [0023](0023-nova-marca.md) | Nova marca: ingresso com "check" | Aceito |
| [0024](0024-precos-acessiveis-e-ingressos-gratis.md) | Preços acessíveis e ingressos grátis para testar | Aceito (preços no painel em 0039) |
| [0025](0025-textos-e-modelos-de-ingresso.md) | Textos no ingresso, modelos prontos e horário local do evento | Aceito |
| [0026](0026-painel-admin-e-conta.md) | Painel de administração, cortesias e página da conta | Aceito (auditoria em 0032) |
| [0027](0027-ciclo-de-vida-do-evento.md) | Ciclo de vida do evento: duplicar, arquivar e excluir | Aceito |
| [0028](0028-emails-html-e-cota.md) | E-mails em HTML, cota diária e limite por endereço | Aceito |
| [0029](0029-login-com-google.md) | Login com Google | Aceito |
| [0030](0030-ingresso-digital.md) | Ingresso digital: o mesmo ingresso, entregue por link | Aceito |
| [0031](0031-novidades.md) | Novidades publicadas pelos admins | Aceito |
| [0032](0032-controle-do-admin.md) | Controle do admin: modo suporte, auditoria, suspensão e estorno | Aceito |
| [0033](0033-documentos-legais-e-lgpd.md) | Documentos legais, aceite dos termos e direitos do titular | Aceito |
| [0034](0034-resultados-e-financeiro.md) | Resultados do organizador e financeiro do admin | Aceito |
| [0035](0035-rifas-sem-sorteio.md) | Rifas: imprimir números sim, sortear não | Aceito |
| [0036](0036-tema-do-site.md) | O site segue o tema do sistema | Aceito |
| [0037](0037-configuracoes-da-plataforma.md) | Configurações da plataforma: manutenção, novas contas e domínios bloqueados | Aceito |
| [0038](0038-pronunciamentos-e-notificacoes.md) | Pronunciamentos e notificações | Aceito |
| [0039](0039-precos-no-painel-e-promocoes.md) | Preços editáveis pelo painel e promoções | Aceito |
| [0040](0040-cupons-e-credito.md) | Cupons e crédito | Aceito |
| [0041](0041-registro-de-emails.md) | Registro de e-mails e painel de envios | Aceito |
| [0042](0042-moderacao-de-imagens.md) | Moderação das artes enviadas | Aceito |
| [0043](0043-pagina-de-status.md) | Página pública de status | Aceito |
| [0044](0044-captcha-no-login.md) | Verificação anti-robô antes do código por e-mail | Aceito |
| [0045](0045-verificacao-em-duas-etapas.md) | Verificação em duas etapas (opcional) | Aceito |
| [0046](0046-ambiente-de-staging.md) | Ambiente de staging | Aceito |
| [0047](0047-blindagem-da-plataforma.md) | Blindagem da plataforma: admin com duas etapas, limites por endereço e checagens de produção | Aceito |
| [0048](0048-csp-com-nonce.md) | CSP com nonce por requisição no site | Aceito |
| [0049](0049-versionamento-e-releases.md) | Versionamento semântico, releases e branches | Aceito |
