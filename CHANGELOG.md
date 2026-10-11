# Histórico de versões

Todas as mudanças relevantes do Ingresso Impresso ficam registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa
[Versionamento Semântico](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH`. As regras de
versão, o fluxo de release e a relação com a página [Novidades](https://ingressoimpresso.com.br/novidades)
estão em [`docs/versionamento.md`](docs/versionamento.md) (ADR 0049).

Toda mudança que alguém percebe (organizador, público, portaria ou quem opera a plataforma) ganha
uma linha em **Não lançado** no mesmo pull request. A versão do formato do QR (`v1`) é outra coisa
e não acompanha estes números.

## [Não lançado]

### Adicionado

- Link do vendedor: cada vendedor recebe pelo WhatsApp um link pessoal, sem criar conta, onde marca
  os números que vendeu (com o nome e o telefone de quem comprou, se quiser), vê o que ainda tem e
  quanto falta acertar (ADR 0053).
- No cartão do vendedor, quantos ingressos ele já marcou como vendidos e, na devolução, o atalho
  para devolver de uma vez os que não foram vendidos.
- Equipe do evento: chame pessoas pelo e-mail e escolha o que cada uma cuida (Coordenação,
  Recebimentos, Ingressos e vendedores, Arte do ingresso ou Portaria). Cada pessoa vê o evento
  inteiro na própria conta e mexe só na sua parte, sem compartilhar senha; quem ainda não tem conta
  entra com o mesmo e-mail (ADR 0055).
- A página do vendedor mostra para quem passar o dinheiro, quando alguém da equipe cuida dos
  recebimentos.

### Alterado

- O relatório separa "Emitidos" de "Vendidos" (as vendas marcadas pelos vendedores), e o acerto
  mostra só os vendedores, com uma nota sobre os ingressos que estão sem vendedor.
- Os avisos (toasts) seguem as cores do site no tema escuro e fecham com um toque, sem o botão de
  fechar.
- A versão do site saiu do rodapé e das páginas do painel: fica só em Minha conta, na página Sobre
  e na página de status (ADR 0054).

## [1.1.0] - 2026-10-11

### Adicionado

- Acerto com vendedores na aba Vendedores: registre o que cada um paga (Pix, dinheiro ou outro) e
  veja quanto falta, quem está quitado e quem pagou a mais, com resumo geral e histórico
  (ADR 0050).
- Devolução por vendedor com vários números de uma vez (`12, 15, 40-50`), como devolvidos sem vender
  ou perdidos, conferida contra os números de cada vendedor.
- Resumo do acerto pronto para mandar pelo WhatsApp ou copiar, para cada vendedor.
- Simulador de preços na página inicial: escolha quantos ingressos e veja o custo na hora, com os
  ingressos grátis e a conta detalhada.
- Exemplos de uso na página inicial (show de banda, rifa da turma e baile de formatura), passo a
  passo e com ilustrações.
- Página Sobre, com a ideia do produto, os princípios, quem faz e a versão em uso (ADR 0051).

### Alterado

- O relatório separa o acerto (com recebido e falta) da portaria, e a planilha traz as colunas de
  dinheiro recebido e saldo.
- A versão do site ficou discreta, no canto do rodapé do site e no fim das páginas do painel (fora
  do menu da conta), e leva à página Sobre em vez das Novidades (ADRs 0051 e 0052).
- Textos mais claros: "emitidos" no lugar de "pagos" quando se fala dos ingressos gerados.

## [1.0.0] - 2026-10-10

Primeira versão numerada: o produto que já estava em produção, das fases 0 a 9 e da blindagem
(`docs/arquitetura.md` §12).

### Adicionado

- Versionamento do produto: número da versão no rodapé do site, no menu da conta e na página de
  status (site e API), tags `vX.Y.Z` com GitHub Release criadas pelo CI quando a versão chega ao
  `main`, e Novidades agrupadas por versão, como notas de lançamento (ADR 0049).
- Ingresso impresso e numerado com QR assinado (formato v1, Ed25519): arquivos para imprimir em
  casa (A4), na gráfica (com sangria) e ZIP para o WhatsApp, com folha de controle.
- Ingresso digital por link, que abre offline no celular do público (ADR 0030).
- Editor visual do ingresso com arrastar, desfazer, oito fontes, campos automáticos e 16 modelos
  por tipo de evento, com prévia ao vivo (ADR 0025).
- Painel do organizador: eventos (duplicar, arquivar e excluir), lotes, vendedores com faixas de
  números, cancelamentos, relatório por vendedor e resultados com planilha.
- Rifas sem sorteio: só a impressão dos números (ADR 0035).
- Portaria offline no navegador do celular, com vários aparelhos na mesma porta e sincronização
  quando há rede (ADR 0018).
- Pagamento dos lotes com Stripe Checkout (Pix e cartão), preços com vigência, promoções, cupons,
  crédito e ingressos grátis (ADRs 0020, 0039 e 0040).
- Login sem senha (código por e-mail ou Google) e verificação em duas etapas opcional (ADRs 0028,
  0029 e 0045).
- Novidades, sininho com avisos e notificações, e página pública de status (ADRs 0031, 0038 e
  0043).
- Painel de admin: métricas, financeiro, organizações, modo suporte com auditoria, suspensão,
  estorno, configurações da plataforma, registro de e-mails e moderação das artes.
- Termos de Uso, Política de Privacidade e Política de Reembolso, com exportação e exclusão da
  conta (ADR 0033).
- PWA instalável, tema claro, escuro ou do sistema, e interface feita primeiro para o celular.

### Segurança

- Admin só com verificação em duas etapas, limites por endereço nos endpoints sem sessão, caminhos
  da API validados no painel e checagens que impedem chaves de teste em produção (ADR 0047).
- Política de segurança de conteúdo (CSP) com nonce por requisição em todo o site (ADR 0048).
- Verificação anti-robô antes do envio do código de login (ADR 0044).

[Não lançado]: https://github.com/allansomensi/ingressoimpresso/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/allansomensi/ingressoimpresso/releases/tag/v1.0.0
