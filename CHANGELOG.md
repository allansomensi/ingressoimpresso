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

## [1.6.1] - 2026-10-16

### Alterado

- O botão do financeiro do admin que relê os reembolsos na Stripe agora se chama **Sincronizar com
  a Stripe**.
- No admin, a visão geral troca "Usuários" (que repetia o número de organizações, já que cada
  organização tem uma conta) por **Contas ativas**, as que entraram nos últimos 30 dias; na página
  da organização, "Pessoas" virou **Conta de acesso**.

### Corrigido

- O sino do painel lembra das novidades já lidas na sua conta: sair e entrar de novo, ou abrir em
  outro navegador ou celular, não mostra outra vez como não lidas as que você já viu.

## [1.6.0] - 2026-10-15

### Adicionado

- Categorias que pedem documento na portaria, como a meia-entrada: a tela verde mostra "Meia:
  peça o documento" com os documentos que valem e espera o porteiro conferir. O ingresso digital
  e a página Conferir ingresso avisam quem vai entrar.
- Saída e volta: com a opção ligada na aba Portaria, quem sai pode voltar com o mesmo ingresso. Um
  celular lê a saída (tela azul), a volta entra pela portaria normal e uma cópia continua barrada
  enquanto o ingresso está lá dentro. O Ao vivo mostra quem está dentro e quem está fora.
- Fichas de consumo: um evento pode imprimir fichas de bebida e comida em vez de ingressos. Cada
  produto tem cor e preço, a ficha sai com o produto em letras grandes (modelos novos, 21 por folha
  A4) e cada barraca dá baixa pelo celular, mesmo sem internet. Ficha usada ou copiada não passa
  duas vezes. O painel, o link do vendedor, o app da barraca, a ficha no celular, os arquivos e os
  e-mails falam de ficha, barraca e produto, e um evento novo de fichas já começa com o desenho da
  ficha.
- Campo `{categoria}` nos textos do ingresso: imprime a categoria de cada número.
- Pix copia e cola direto para quem organiza: com a chave cadastrada em Minha organização (ou a de
  cada vendedor), o link do vendedor e o ingresso no celular mostram o QR e o código com o valor
  e um identificador por número. O dinheiro não passa pela plataforma. Em Vendedores, **Conferir
  Pix** marca o que chegou no extrato, e o que a organização recebeu sai do acerto do vendedor.
  Número vendido em mãos e segunda via não pedem pagamento de novo no celular.
- Medição de velocidade do site nos aparelhos de quem visita (Vercel Speed Insights), fora da
  portaria, para acompanhar o efeito das melhorias de desempenho.
- Guias para quem organiza evento, em `/guias`: como fazer ingresso para festa, evitar ingresso
  falso, controlar a entrada pelo celular, vender com vendedores, imprimir rifa numerada, vender
  sem taxa sobre a venda, imprimir em casa ou na gráfica, organizar convites de formatura e mandar
  ingresso pelo WhatsApp.
- Página de preços própria, em `/precos`, com o simulador, como a cobrança funciona e as dúvidas
  sobre pagamento.
- Páginas de ingresso para festa, campeonato, palestra e curso, carnaval e Réveillon, e uma página
  com todos os tipos de evento. Todas as páginas por tipo de evento ganharam um passo a passo e
  mais perguntas frequentes.

### Alterado

- O painel ficou mais fácil de entender: as seções do evento (Visão geral, Ingresso, Lotes,
  Vendedores, Portaria…) aparecem agrupadas pela ordem do trabalho numa lista ao lado do conteúdo,
  com um ponto na seção onde ainda falta algo; no celular, uma barra mostra a seção atual e abre
  todas elas com o que cada uma faz. Cada seção começa pelo nome, uma linha do que ela faz, um
  `?` com a explicação completa e os botões de criar (lote, vendedor, ingresso no celular, link da
  portaria, arquivo, cancelamento), que agora abrem uma janela em vez de ocupar o alto da tela. O
  cartão de cada vendedor mostra os números, o dinheiro e o link, e o resto (acerto, meta,
  reservas, histórico) abre pelo pé do cartão. A administração usa a mesma navegação.
- Links do site mandados no WhatsApp, no Facebook ou no X mostram o título, a descrição e a
  imagem da própria página, e não mais os da página inicial.
- Os preços aparecem assim que a página inicial e a de preços abrem, sem o bloco de carregamento
  que empurrava a página; o fim de uma promoção aparece no horário de Brasília.
- Na página inicial, cada tipo de evento leva à sua página; o menu ganhou Guias, e Preços abre a
  página de preços.
- O site ficou mais fácil de entender para buscadores e assistentes de IA: dados estruturados
  completos (organização, perguntas, preços, artigos e trilhas), imagens grandes nos resultados
  do Google, `/llms.txt` com o resumo do produto e sitemap com as datas das páginas.
- O site abre mais rápido no celular: as fontes dos ingressos ficaram três vezes menores e a
  galeria de modelos da página inicial só é desenhada quando chega perto da tela.
- Todas as páginas carregam menos código: cada uma leva só os textos que usa (antes, o catálogo
  inteiro ia em toda página) e a página inicial deixou de instalar o aplicativo do painel por
  baixo dos panos.
- A API responde comprimida e com menos idas ao banco: o manifesto da portaria, a página do
  vendedor, o Ao vivo, a série e o relatório da organização fazem suas leituras ao mesmo tempo,
  ingressos digitais em lote entram numa só gravação e a conexão com o banco deixou de ser
  testada antes de cada consulta.
- Portaria no celular: a tela não é redesenhada a cada segundo (só o "sincronizado há 5 s"), a
  câmera lê mais devagar enquanto um resultado espera um toque, a cópia offline do app espera um
  momento de folga em vez de disputar com o primeiro manifesto e as gravações da sincronização
  vão em lote; o núcleo da portaria ficou um quarto menor.
- Painel: as abas Portaria, Lista, Relatório e Resultados só ficam perguntando ao servidor em
  volta do dia do evento; a galeria de modelos desenha cada modelo quando ele aparece na tela; a
  prévia do editor chega como JPEG, dez vezes menor; o logo da organização e a imagem do ingresso
  digital ficam guardados por mais tempo.

## [1.5.0] - 2026-10-13

### Adicionado

- Admin: seção **Eventos** para achar qualquer evento de qualquer organização (por nome,
  organização, e-mail ou código) e abri-lo em modo suporte, e o **Perfil público** de cada
  organização, para corrigir contato e cor, enviar o logo por quem não conseguiu ou tirar do ar
  (e recusar) um logo impróprio, tudo registrado na auditoria (ADR 0079).
- Portaria no painel: **Link e QR** ao lado de cada link ativo gera um link novo para a mesma
  porta (mesmo nome e categorias), para passar de novo a quem perdeu; os celulares já conectados
  continuam funcionando (ADR 0080).
- Vendedores: **Todos os livres** entrega de uma vez todos os números que ainda não estão com
  ninguém (de todas as categorias ou de uma só), o jeito mais simples de abastecer a bilheteria; e
  **Escolher números** aceita vários soltos (`1-50, 75, 80-90`), com as faixas livres a um toque.
- Aba **Ao vivo** em **Tela cheia**, para deixar o painel da porta numa TV ou num notebook, com a
  tela sempre acesa.
- Página **Suporte** com respostas rápidas, status, como escrever para a gente e o que contar; o
  item Suporte do menu leva para ela em vez de abrir o programa de e-mail.
- Editor do ingresso: selecione vários elementos com Shift-clique ou arrastando um retângulo no
  fundo (no celular, com **Selecionar vários**) e mova todos juntos, com o mouse ou as setas;
  alinhe entre si ou ao ingresso, distribua o espaço por igual, duplique e exclua os textos de uma
  vez. Ao arrastar, guias mostram quando um elemento se alinha às bordas, ao centro ou a outro
  elemento (segure Alt para soltar), e o botão **Atalhos** lista os atalhos do teclado.

### Alterado

- Categorias: o preço aparece em destaque e muda com um toque; **Usar Inteira, Meia, VIP e
  Cortesia** abre uma lista para conferir o preço de cada uma antes de criar. O campo `{preco}`
  impresso no ingresso passa a mostrar o preço da categoria (um VIP sai com o preço do VIP).
- O ensaio da portaria virou opcional: não conta mais em **O que falta**, os celulares não mostram
  "sem ensaio" e a folha de ensaio fica recolhida no fim da aba Portaria.
- Minha conta não mostra mais a tabela de preços (ela segue na página inicial e na compra do lote).
- Abas do evento no computador: setas nas pontas e a rodinha do mouse passeiam pelas abas, e o
  botão **Seções** aparece sempre que nem todas cabem.
- Portaria: a tela de resultado não some mais antes de você ler. Só o verde **PODE ENTRAR** volta
  sozinho para a câmera, com uma barra que mostra o tempo e para enquanto você segura a tela; recusas
  e avisos ficam até você tocar. Tocar no número de entradas, no topo, mostra as últimas leituras
  deste celular (hora, número, categoria, lugar, motivo da recusa e se já foi enviada), mesmo sem
  internet.

### Corrigido

- **Criar mesas** mostrava "Algo deu errado" mesmo criando as mesas.
- **Adicionar outra data** dizia "Já existe" quando a mesma imagem era usada duas vezes no
  ingresso (arte e patrocinador, ou dois patrocinadores iguais).
- O ícone de **Baile de formatura** sumia nos exemplos da página inicial no computador.
- **Conferir ingresso** não reconhecia, quando o texto era colado com espaços em volta, os
  ingressos de alguns eventos (cerca de 2 em 100) cujo código começa com um espaço.

## [1.4.0] - 2026-10-12

### Adicionado

- Perfil da organização, em Minha conta: logo, cor da marca, WhatsApp, e-mail, site e Instagram
  aparecem no ingresso no celular e na página dos vendedores, com o botão **Falar com a
  organização**; local, endereço e preço de sempre já vêm preenchidos em cada evento novo. O logo
  passa pela mesma revisão das artes, e o campo `{organizacao}` pode ser impresso no ingresso
  (ADR 0064).
- Adiar ou cancelar o evento pelo menu do evento, com motivo e uma mensagem pronta para os
  vendedores repassarem no WhatsApp. O ingresso no celular e a página do vendedor mostram o aviso
  (com a data original e a nova); os links da portaria passam para a nova data; num evento
  cancelado, os vendedores param de marcar vendas, não dá para criar lotes e a portaria mostra a
  faixa "Evento cancelado" sem deixar de ler. O cancelamento pode ser desfeito, e a equipe recebe o
  aviso no sininho (ADR 0065).
- No ingresso no celular: **Adicionar à agenda** (funciona sem internet, com lembrete), Google
  Agenda, **Como chegar** com o novo campo de endereço do evento e, para quem tem lugar marcado,
  o mapa das mesas com a sua mesa e o seu lugar em destaque (ADR 0066).
- Modo ensaio na portaria: antes de o evento começar, **Ensaiar** (no menu ⋮ do celular) lê a
  folha de ensaio, uma prévia ou um ingresso e mostra o que aconteceria, sem registrar nada, e
  testa som, vibração e lanterna. A opção some quando o primeiro ingresso entra, para não
  atrapalhar o trabalho. O painel mostra quais celulares já ensaiaram e oferece a folha de ensaio
  em PDF (ADR 0067).
- Porta por categoria: um link da portaria pode aceitar só algumas categorias. Ingresso de outra
  categoria aparece em amarelo com a porta certa, e o porteiro pode deixar entrar mesmo assim,
  com a exceção registrada (ADR 0068).
- Bilheteria na porta: um vendedor marcado como bilheteria vende na entrada. O celular diz quanto
  cobrar e soma os vendidos na porta, e o acerto da bilheteria conta o que entrou (ADR 0069).
- Lista de nomes: a aba **Lista** guarda convidados e acompanhantes (dá para colar a lista
  inteira), e na portaria o celular busca o nome mesmo sem internet, marca quem chegou e quantas
  pessoas, e todos os celulares ficam sabendo (ADR 0070).
- Portaria ao vivo: a aba **Ao vivo** mostra, atualizando sozinha, as entradas contra os
  vendidos, a curva da última hora, cada porta, categoria e celular (com alerta de quem está sem
  sincronizar), as recusas, a lista de nomes e a bilheteria; no dia do evento, a visão geral
  ganha um resumo (ADR 0071).
- Reservas do vendedor: na página do vendedor e na aba Vendedores, dá para separar números para
  alguém até amanhã, daqui a 3 dias, sexta ou uma data, e depois marcar como vendido num toque ou
  cancelar. Reserva vencida volta a ficar livre sozinha; as que vencem em 24 horas aparecem em
  destaque, com o lembrete pronto para mandar no WhatsApp. O relatório e o acerto mostram os
  reservados à parte, e a reserva nunca muda nada na portaria (ADR 0072).
- Metas e ranking: meta de ingressos por vendedor (ou a mesma meta para todos de uma vez), com a
  barra de progresso na página do vendedor e a visão **Ranking e metas** na aba Vendedores. Se o
  organizador ligar, cada vendedor vê a própria posição e os 5 primeiros, só com o primeiro nome e
  a inicial (ADR 0073).
- O link do vendedor funciona sem internet: a página abre com os dados da última visita, aceita
  vendas e reservas guardadas no celular ("Sem internet · 3 alterações para enviar") e envia tudo
  quando a conexão volta, sem duplicar; o que mudou em outro aparelho é explicado em palavras
  simples (ADR 0074).
- Página **Conferir ingresso** (`/conferir`): quem vai comprar o ingresso de outra pessoa lê o QR
  com a câmera, envia uma foto ou cola o texto e vê se ele é nosso, de qual evento, número e
  categoria, e se o número foi cancelado ou o evento mudou. Nunca mostra quem comprou nem se já
  entrou, e avisa que uma cópia também aparece como autêntica. O organizador pode desligar a
  conferência na aba Digitais (ADR 0075).
- **Indique e ganhe**, em Minha conta: um link para mandar no WhatsApp; quando quem chegou por ele
  paga o primeiro lote, as duas contas ganham crédito (R$ 10 cada, pelas regras de agora). Quem
  chega pelo convite vê na entrada o que vai ganhar; o admin ajusta valores, limite e lote mínimo e
  acompanha as indicações (ADR 0076).
- Evento com várias datas: **Adicionar outra data**, no menu do evento, cria uma nova sessão com o
  mesmo ingresso, categorias, mesas, vendedores e equipe. Cada data tem os seus números, lotes,
  portaria e acerto, e um ingresso de uma data nunca entra na outra. Na lista, as datas aparecem
  juntas; a página da série mostra as datas lado a lado, os totais e os vendedores somados. O
  ingresso no celular, a página do vendedor, a conferência e a portaria dizem "Sessão de 12/11 às
  20h", e a portaria avisa quando o ingresso é de outra data (ADR 0077).
- **O que falta**, na visão geral do evento: a lista do que deixa o evento pronto (endereço,
  ingresso, arte liberada, lote pago, links dos vendedores, ingressos entregues, portaria, ensaio,
  contato da organização e os opcionais), cada item levando à aba certa, para cada pessoa da
  equipe o que é dela. A lista de eventos mostra "Faltam 3" (ADR 0078).

### Alterado

- A Política de Privacidade descreve os dados das novidades desta versão: o perfil público da
  organização, as indicações, a lista de nomes da portaria, os compradores e as reservas anotados
  pelos vendedores, a página do vendedor sem internet e a conferência de ingressos. Ao entrar, cada
  conta aceita a nova versão. Quando uma conta convidada é excluída, quem convidou deixa de ver o
  e-mail dela.

### Corrigido

- Duplicar um evento (ou adicionar outra data) passa a manter a bilheteria e a meta de cada
  vendedor, se os vendedores mandam ingressos no celular e veem o ranking, e se a conferência
  pública está ligada.
- A imagem do ingresso no celular com a arte passa a mostrar a data, o local e o preço atuais
  depois de uma mudança no evento (antes ficava a versão antiga por até um dia).

## [1.3.0] - 2026-10-12

### Adicionado

- Reembolsos feitos no Stripe, inclusive parciais, passam a ser registrados em cada pagamento. Um
  reembolso total cancela os ingressos do lote na portaria, como o estorno pelo painel, e fica
  registrado em Cancelamentos do evento (ADR 0063).
- No admin, a visão geral mostra receita bruta, reembolsos e receita líquida, desde o início e
  nos últimos 30 dias, com a líquida em destaque, e o botão **Conferir reembolsos no Stripe**
  corrige os reembolsos feitos antes.
- Galeria pública de modelos em `/modelos`, com uma página para cada um dos 16 modelos: o modelo
  preenchido com um evento de exemplo, as combinações de cores, o que vem nele e o tipo de evento
  em que ele se encaixa (ADR 0062).
- Cada página de tipo de evento e de modelo ganha a sua imagem de compartilhamento, com o título
  e os modelos dela: o link mandado no WhatsApp ou nas redes mostra o que a pessoa vai encontrar.
- Páginas para cada tipo de evento (festa junina, formatura, show de banda, festa de escola,
  evento de igreja, jantar beneficente, teatro e dança, baile) em `/ingresso-para/…`, com as dores,
  os benefícios, as dúvidas e os modelos de cada um, ligadas no rodapé do site e no mapa do site.
  O site passa a descrever o produto e as perguntas frequentes para os buscadores (dados
  estruturados).
- O vendedor manda o ingresso no celular de quem comprou, pelo WhatsApp, direto da página dele: o
  mesmo QR do papel, para o comprador que está longe. O organizador pode desligar na aba
  Vendedores, e a aba Digitais mostra quem enviou cada ingresso (ADR 0061).
- Segunda via de ingresso perdido, num passo só, na aba Digitais: o número perdido é cancelado na
  portaria, um número livre da mesma categoria vai para a mesma pessoa como ingresso no celular, o
  lugar na mesa vai junto e o motivo fica registrado. Em Cancelamentos, aparece "Segunda via: nº X"
  (ADR 0061).
- No celular, o botão **Seções** da página do evento mostra todas as abas de uma vez, agrupadas
  (preparar, vender e entregar, no dia, pessoas) e com o que cada uma faz.
- Na página inicial, no celular, uma barra com "Criar meu evento grátis" acompanha a leitura
  depois do topo e some perto do fim da página.
- Termos, Privacidade e Reembolso ganham um sumário recolhível no celular.

### Alterado

- Todos os e-mails (código de login, pagamento confirmado, convite da equipe) passam a sair de
  "Ingresso Impresso <contato@ingressoimpresso.com.br>".
- "Modelos", no menu e no rodapé do site, leva à galeria de modelos. Na página inicial, cada
  exemplo de uso aponta para a página do tipo de evento ou do modelo dele.
- O título da página inicial nos buscadores começa por "Ingresso numerado com QR code para
  imprimir".
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

- A receita do admin deixava de contar os lotes estornados e não descontava reembolsos feitos no
  Stripe.
- No iPhone, os campos de faixas de números (categorias, mesas e devoluções) abriam um teclado sem
  hífen e sem vírgula. O número da venda, na página do vendedor, aceita vírgula ou ponto entre os
  números.
- O evento de hoje podia aparecer por último na lista de eventos.
- Textos com pouco contraste no rodapé do site, na página do vendedor, no ingresso digital, no botão
  do WhatsApp e no verde de "PODE ENTRAR" da portaria.
- No app instalado no iPhone, a barra de abas do evento, o cabeçalho do site e os avisos respeitam
  a barra de status, e o conteúdo fica longe do entalhe com o celular deitado.
- No celular, o botão "Instalar app" virou só um ícone, para não apertar o cabeçalho do painel.
- Na página inicial, no tema claro, o quadro do que está incluso no preço deixou de ser um bloco
  preto e acompanha o tema.
- O `robots.txt` bloqueava, sem querer, qualquer endereço que começasse com `/ingresso`; agora só
  o ingresso digital fica fora dos buscadores.

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

[Não lançado]: https://github.com/allansomensi/ingressoimpresso/compare/v1.6.1...HEAD
[1.6.1]: https://github.com/allansomensi/ingressoimpresso/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/allansomensi/ingressoimpresso/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/allansomensi/ingressoimpresso/releases/tag/v1.0.0
