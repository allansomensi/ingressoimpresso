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

- No celular, o botão **Seções** da página do evento mostra todas as abas de uma vez, agrupadas
  (preparar, vender e entregar, no dia, pessoas) e com o que cada uma faz.
- Na página inicial, no celular, uma barra com "Criar meu evento grátis" acompanha a leitura
  depois do topo e some perto do fim da página.
- Termos, Privacidade e Reembolso ganham um sumário recolhível no celular.

### Alterado

- Interface pensada para o celular (ADR 0060): em telas de toque, botões e áreas de toque maiores,
  retorno visual ao tocar e janelas que sobem de baixo, com alça, e fecham ao arrastar para baixo
  sem rolar a página de trás.
- A lista de eventos mostra primeiro o que está acontecendo e o que é hoje, depois os próximos (o
  mais perto primeiro) e por fim os encerrados; no celular, cada evento ocupa uma linha compacta.
- Na página do evento, no celular, o cabeçalho ficou mais baixo (as ações viraram ícones ao lado de
  "Eventos") e o conteúdo de cada aba começa mais acima.
- No editor do ingresso, no celular, as ferramentas ficam em uma linha e salvar na outra, e as
  opções do elemento tocado aparecem logo abaixo do ingresso.
- Página inicial mais curta no celular, com os passos e os recursos em formato compacto.
- Tabelas largas (relatório e resultados) rolam de lado com uma sombra que mostra que há mais
  colunas, e o teclado também consegue rolá-las.
- Avisos com um botão de ação colocam o botão embaixo do texto no celular.

### Corrigido

- No iPhone, os campos de faixas de números (categorias, mesas e devoluções) abriam um teclado sem
  hífen e sem vírgula. O número da venda, na página do vendedor, aceita vírgula ou ponto entre os
  números.
- O evento de hoje podia aparecer por último na lista de eventos.
- Textos com pouco contraste no rodapé do site, na página do vendedor, no ingresso digital, no botão
  do WhatsApp e no verde de "PODE ENTRAR" da portaria.
- No app instalado no iPhone, a barra de abas do evento, o cabeçalho do site e os avisos respeitam
  a barra de status, e o conteúdo fica longe do entalhe com o celular deitado.
- No celular, o botão "Instalar app" virou só um ícone, para não apertar o cabeçalho do painel.

## [1.2.0] - 2026-10-11

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
- Categorias de ingresso (inteira, meia, VIP, cortesia…) por faixas de números, cada uma com a
  sua cor e, se quiser, o seu preço: saem impressas numa faixa colorida para a portaria reconhecer
  de longe, aparecem na portaria, no ingresso digital e na página do vendedor, e o acerto usa o
  preço de cada categoria (ADR 0056).
- Mesas e lugares para bailes, jantares e formaturas: mapa do salão com as mesas arrastáveis,
  ingressos colocados em cada mesa e "Mesa 5 · Lugar 3" impresso no ingresso (ADR 0057).
- Prestação de contas: lance despesas e outras receitas e baixe o resumo do evento em PDF (com
  espaço para assinaturas) ou em planilha (ADR 0058).
- Patrocinadores no ingresso: uma faixa com até 6 logos, arrastável no editor (ADR 0059).

### Alterado

- O relatório separa "Emitidos" de "Vendidos" (as vendas marcadas pelos vendedores), e o acerto
  mostra só os vendedores, com uma nota sobre os ingressos que estão sem vendedor.
- Os avisos (toasts) seguem as cores do site no tema escuro e fecham com um toque, sem o botão de
  fechar.
- A versão do site saiu do rodapé e das páginas do painel: fica só em Minha conta, na página Sobre
  e na página de status (ADR 0054).
- A equipe abre pelo botão "Equipe" no topo do evento, e o relatório mostra o quadro por categoria.

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

[Não lançado]: https://github.com/allansomensi/ingressoimpresso/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/allansomensi/ingressoimpresso/releases/tag/v1.0.0
