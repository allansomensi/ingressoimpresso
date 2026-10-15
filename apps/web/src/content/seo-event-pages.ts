// Conteúdo das páginas de SEO por tipo de evento, em app/ingresso-para/[slug]/page.tsx.

export type EventSeoPage = {
  slug: string;
  label: string; // nome curto, nos links do rodapé e na trilha da página
  title: string; // <title>, até ~60 caracteres
  description: string; // meta description, até ~155 caracteres
  h1: string;
  intro: string;
  dores: string[]; // problemas que o organizador tem hoje
  beneficios: { titulo: string; texto: string }[];
  passos: { titulo: string; texto: string }[]; // como funciona para esse tipo de evento, em 4 passos
  faq: { pergunta: string; resposta: string }[];
  cta: string;
};

/** Last change to the content below (the sitemap's `lastmod`): update it with the content. */
export const EVENT_PAGES_UPDATED_AT = "2026-10-15";

export const eventSeoPages: readonly EventSeoPage[] = [
  {
    slug: "festa",
    label: "Festa",
    title: "Ingresso para festa numerado, com QR code e para imprimir",
    description:
      "Faça ingresso para festa e balada com número e QR code à prova de cópia. Imprima em casa ou na gráfica e confira a entrada pelo celular. 30 grátis.",
    h1: "Ingresso para festa, numerado e com QR code que não dá para copiar",
    intro:
      "Festa no salão, no sítio, no clube ou na casa de show: monte o ingresso com um modelo pronto, divida os números entre quem vende e confira cada entrada com o celular, mesmo quando o sinal some no meio da festa.",
    dores: [
      "Ingresso copiado ou foto repassada no grupo da festa",
      "Promoters vendendo sem ninguém saber quanto entrou",
      "Fila na porta e lista de nomes que não fecha",
    ],
    beneficios: [
      {
        titulo: "Faixa por promoter",
        texto:
          "Cada promoter ou vendedor leva a sua faixa de números, e o painel mostra quem vendeu, quem pagou e quanto falta.",
      },
      {
        titulo: "Pista, VIP e lotes",
        texto:
          "Crie categorias com faixas de números, cor e preço próprios. O acerto de cada vendedor usa o preço de cada número.",
      },
      {
        titulo: "Ingresso no celular",
        texto:
          "Quem comprou pelo Instagram ou pelo WhatsApp recebe um link com o próprio nome e mostra o QR na porta.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Escolha um modelo de festa ou envie a arte do flyer. Nome, data, local e preço entram sozinhos." },
      { titulo: "Divida entre os promoters", texto: "Cada promoter recebe a sua faixa e um link no celular para marcar o que vendeu." },
      { titulo: "Imprima ou mande", texto: "PDF para imprimir em casa ou na gráfica e ingresso digital pelo WhatsApp." },
      { titulo: "Confira na porta", texto: "Celulares da equipe leem o QR com tela verde ou vermelha. Cópia é barrada na hora." },
    ],
    faq: [
      {
        pergunta: "Dá para vender 1º lote e 2º lote com preços diferentes?",
        resposta:
          "Dá. Crie uma categoria para cada lote, com a sua faixa de números e o seu preço. O acerto de cada vendedor usa o preço de cada número.",
      },
      {
        pergunta: "E a lista VIP, de quem entra sem ingresso?",
        resposta:
          "Cadastre os nomes na lista do evento. Na porta, o mesmo celular que lê os ingressos encontra o nome e marca a entrada.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "Os primeiros 30 ingressos são grátis. Depois, de R$ 0,15 a R$ 0,05 por ingresso, pago por lote, sem mensalidade e sem porcentagem da venda.",
      },
      {
        pergunta: "Funciona sem internet na festa?",
        resposta:
          "Sim. Cada celular decide na hora, sem esperar a rede, e as leituras se acertam quando o sinal volta.",
      },
    ],
    cta: "Criar os ingressos da minha festa",
  },
  {
    slug: "festa-junina",
    label: "Festa junina",
    title: "Ingresso para Festa Junina numerado e com QR code",
    description:
      "Crie ingressos para festa junina e arraiá, imprima em casa ou na gráfica e confira na entrada pelo celular, mesmo sem internet. 30 ingressos grátis.",
    h1: "Ingresso para festa junina que não dá para copiar",
    intro:
      "Arraiá de escola, quermesse ou festa da comunidade: monte o ingresso com um modelo junino, gere a numeração, imprima e confira cada entrada com o celular, sem depender do sinal no pátio ou na quadra.",
    dores: [
      "Ingresso feito no Word e copiado na fotocopiadora",
      "Vários vendedores e ninguém sabe quanto cada um vendeu",
      "Internet ruim na quadra ou no salão no dia da festa",
    ],
    beneficios: [
      {
        titulo: "Modelo junino pronto",
        texto:
          "Escolha o modelo, troque as cores e o nome, a data e o local da festa entram sozinhos.",
      },
      {
        titulo: "Cada vendedor com a sua faixa",
        texto:
          "Entregue blocos de números para cada turma, pai ou voluntário e acompanhe quem pagou e quanto falta acertar.",
      },
      {
        titulo: "Portaria sem internet",
        texto:
          "Qualquer celular lê o QR na hora. Cópia ou foto de um ingresso já usado é barrada.",
      },
    ],
    passos: [
      { titulo: "Escolha o modelo junino", texto: "Bandeirinhas e xadrez prontos. O nome do arraiá, a data e o local entram sozinhos." },
      { titulo: "Divida entre as turmas", texto: "Cada turma, pai ou voluntário leva uma faixa de números, e o painel mostra quem já acertou." },
      { titulo: "Imprima na escola", texto: "PDF A4 com marcas de corte para a impressora da secretaria, quantas vezes precisar." },
      { titulo: "Confira no portão", texto: "Os celulares da equipe leem o QR na entrada, mesmo sem sinal na quadra." },
    ],
    faq: [
      {
        pergunta: "Posso imprimir os ingressos da festa junina em casa?",
        resposta:
          "Sim. Você baixa um PDF A4 com marcas de corte para a impressora de casa, ou um PDF com sangria para levar à gráfica.",
      },
      {
        pergunta: "Precisa de internet na entrada da festa?",
        resposta:
          "Não. A conferência funciona offline e os celulares sincronizam as leituras quando o sinal volta.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "Os primeiros 30 ingressos são grátis. Depois você paga por lote, a partir de R$ 0,05 por ingresso, sem mensalidade.",
      },
      {
        pergunta: "Dá para separar ingresso de adulto e de criança?",
        resposta:
          "Sim. Crie uma categoria para cada um, com a sua faixa de números e o seu preço. Cada ingresso sai com uma faixa colorida da categoria.",
      },
      {
        pergunta: "Dá para fazer as fichas de comida e bebida?",
        resposta:
          "Sim. Crie um evento de fichas de consumo: cada produto (pastel, quentão, refrigerante) tem a sua cor e o seu preço, e cada barraca dá baixa pelo celular. Ficha usada ou falsificada não passa duas vezes.",
      },
    ],
    cta: "Criar os ingressos do meu arraiá",
  },
  {
    slug: "formatura",
    label: "Formatura",
    title: "Convite e ingresso para formatura com QR code",
    description:
      "Ingressos e convites numerados para baile de formatura, com controle por formando e conferência na porta pelo celular. Teste com 30 ingressos grátis.",
    h1: "Convites de formatura com controle por formando",
    intro:
      "Cada formando tem direito a um número de convites, e a comissão precisa saber quem já retirou, quem pagou e quem entrou. Distribua faixas de números por formando e confira tudo na porta do baile.",
    dores: [
      "Convite extra impresso por fora e gente entrando sem pagar",
      "Planilha da comissão desatualizada no dia do baile",
      "Fila na entrada conferindo nome em lista de papel",
    ],
    beneficios: [
      {
        titulo: "Faixa de convites por formando",
        texto:
          "Cada formando recebe a sua faixa de números, e o painel mostra quem retirou, quem pagou e quanto falta.",
      },
      {
        titulo: "Convite com a cara da turma",
        texto:
          "Use o modelo de formatura ou envie a arte da turma e posicione número e QR arrastando.",
      },
      {
        titulo: "Convite pelo WhatsApp",
        texto:
          "Familiares que moram longe recebem o convite no celular, com o nome, e mostram o QR na entrada.",
      },
    ],
    passos: [
      { titulo: "Combine as regras", texto: "Quantos convites cada formando recebe, quantos extras pode vender e por quanto." },
      { titulo: "Distribua as faixas", texto: "Cada formando é um vendedor, com a sua faixa de números e um link para marcar o que vendeu." },
      { titulo: "Papel e celular", texto: "Convite impresso para quem está perto e digital pelo WhatsApp para quem mora longe: o mesmo QR." },
      { titulo: "Entrada do baile", texto: "Celulares da comissão conferem os convites e a contagem de quem chegou aparece ao vivo." },
    ],
    faq: [
      {
        pergunta: "Dá para usar a arte que a turma já tem?",
        resposta:
          "Sim. Envie a imagem e posicione o número e o QR code no editor visual.",
      },
      {
        pergunta: "E se um formando perder os convites?",
        resposta:
          "Você cancela aquela faixa de números e eles passam a ser barrados na porta.",
      },
      {
        pergunta: "Vários celulares podem conferir ao mesmo tempo?",
        resposta:
          "Sim, quantos você quiser, inclusive na mesma porta, sem pagar a mais por isso.",
      },
      {
        pergunta: "Dá para marcar mesa e lugar no convite?",
        resposta:
          "Dá. Monte o mapa das mesas, ligue cada número a uma mesa e a um lugar, e o convite sai com \"Mesa 5 · Lugar 3\" impresso.",
      },
    ],
    cta: "Criar os convites da formatura",
  },
  {
    slug: "show-de-banda",
    label: "Show de banda",
    title: "Ingresso para show de banda independente",
    description:
      "Venda ingresso na mão sem perder o controle: numeração por integrante, QR à prova de cópia e conferência na porta do bar pelo celular.",
    h1: "Ingresso para o show da sua banda, vendido na mão e sem dor de cabeça",
    intro:
      "Banda independente vende ingresso entre amigos, no bar e no grupo do WhatsApp. Divida os números entre os integrantes, mande o ingresso digital para quem compra de longe e confira tudo na porta.",
    dores: [
      "Acerto com a banda feito de memória ou no caderno",
      "Ingresso copiado ou foto repassada no grupo",
      "Sinal fraco dentro do bar na hora da entrada",
    ],
    beneficios: [
      {
        titulo: "Acerto entre os integrantes",
        texto:
          "Cada integrante leva uma faixa de números, e o painel mostra quem vendeu e quanto cada um precisa repassar.",
      },
      {
        titulo: "Ingresso pelo WhatsApp",
        texto:
          "Quem comprou pelo grupo recebe um link com o próprio nome. É o mesmo ingresso do papel: o primeiro que passar entra.",
      },
      {
        titulo: "Porta que não para",
        texto:
          "Tela verde, vermelha ou amarela com som, lanterna para lugar escuro e funcionamento offline.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Modelo de show com o nome da banda, a data, o bar e o preço, ou a arte do cartaz." },
      { titulo: "Divida entre a banda", texto: "Cada integrante leva uma faixa de números. O acerto mostra quem já repassou o dinheiro." },
      { titulo: "Mande pelo WhatsApp", texto: "Quem comprou no grupo recebe um link com o próprio nome e mostra o QR no celular." },
      { titulo: "Confira na porta", texto: "O celular do bar vira leitor. Cópia e print repassado são barrados na hora." },
    ],
    faq: [
      {
        pergunta: "Quanto custa para um show de 200 pessoas?",
        resposta:
          "Os 30 primeiros ingressos são grátis e o restante sai por centavos cada. O simulador na página de preços mostra o valor exato.",
      },
      {
        pergunta: "A plataforma fica com parte do valor do ingresso?",
        resposta:
          "Não. Você vende do seu jeito e recebe direto. Só paga pelo lote de ingressos gerados.",
      },
      {
        pergunta: "Funciona no iPhone?",
        resposta:
          "Sim. A portaria roda no navegador do celular, em Android ou iPhone, sem instalar aplicativo.",
      },
      {
        pergunta: "Dá para vender ingresso na porta, no dia do show?",
        resposta:
          "Dá. Separe uma faixa de números para a bilheteria: na porta, o ingresso vendido na hora conta como vendido quando entra.",
      },
    ],
    cta: "Criar os ingressos do show",
  },
  {
    slug: "festa-de-escola",
    label: "Festa de escola",
    title: "Ingresso para festa de escola numerado",
    description:
      "Ingressos para festa da família, festa da primavera e eventos escolares, com venda por turma e conferência na entrada pelo celular.",
    h1: "Ingressos para eventos da escola, com venda organizada por turma",
    intro:
      "Na festa da escola, quem vende são os professores, as turmas e a associação de pais. Distribua os números por turma, acompanhe o que voltou e confira a entrada sem fila e sem lista de papel.",
    dores: [
      "Envelopes de ingressos por turma sem controle de devolução",
      "Ingresso falsificado com impressora de casa",
      "Secretaria sobrecarregada no acerto final",
    ],
    beneficios: [
      {
        titulo: "Faixas por turma",
        texto:
          "Cada turma recebe a sua faixa de números, e o painel mostra vendidos, devolvidos e o valor a acertar.",
      },
      {
        titulo: "Relatório para a direção",
        texto:
          "Vendidos, faturamento, custo e entradas do evento, com exportação para planilha.",
      },
      {
        titulo: "Impressão na própria escola",
        texto:
          "PDF A4 com marcas de corte para imprimir na secretaria, quantas vezes precisar.",
      },
    ],
    passos: [
      { titulo: "Escolha o modelo", texto: "Festa da família, da primavera ou feira cultural: o nome, a data e o local entram sozinhos." },
      { titulo: "Faixas por turma", texto: "Cada turma ou professor recebe a sua faixa, e o painel mostra vendidos e devolvidos." },
      { titulo: "Imprima na secretaria", texto: "PDF A4 com marcas de corte e uma folha de controle por turma." },
      { titulo: "Entrada sem fila", texto: "Os celulares da equipe conferem a entrada, sem lista de papel." },
    ],
    faq: [
      {
        pergunta: "Preciso saber design para montar o ingresso?",
        resposta:
          "Não. Escolha um dos modelos prontos e o nome, a data e o local do evento entram sozinhos.",
      },
      {
        pergunta: "Posso reimprimir se faltar ingresso?",
        resposta:
          "Sim. Arquivos e reimpressões são ilimitados para os ingressos que você já gerou.",
      },
      {
        pergunta: "Como a escola paga?",
        resposta:
          "Por Pix ou cartão, só quando gerar um novo lote. Não há mensalidade.",
      },
      {
        pergunta: "Outras pessoas da escola podem ajudar sem usar a minha conta?",
        resposta:
          "Podem. Chame a equipe por e-mail e escolha o que cada pessoa cuida: vendedores e dinheiro, arte do ingresso, portaria ou o evento inteiro.",
      },
    ],
    cta: "Criar os ingressos da festa",
  },
  {
    slug: "evento-de-igreja",
    label: "Evento de igreja",
    title: "Ingresso para evento de igreja e congresso",
    description:
      "Ingressos numerados para congressos, retiros, jantares e eventos da igreja, com conferência na entrada pelo celular, mesmo sem internet.",
    h1: "Ingressos para congressos e eventos da igreja",
    intro:
      "Congresso de jovens, retiro, jantar ou culto especial: monte o ingresso, distribua entre os líderes e ministérios que vão vender e confira a entrada com os celulares da equipe.",
    dores: [
      "Vários ministérios vendendo e acerto confuso no final",
      "Lista de nomes na porta e fila na entrada",
      "Internet instável no templo ou no salão",
    ],
    beneficios: [
      {
        titulo: "Venda por ministério ou líder",
        texto:
          "Cada líder recebe a sua faixa de números, e você sabe quem vendeu e quanto falta acertar.",
      },
      {
        titulo: "Equipe de recepção no celular",
        texto:
          "Mande o link da portaria para a equipe. Cada celular vira um leitor, sem instalar nada.",
      },
      {
        titulo: "Ingresso para quem vem de fora",
        texto:
          "Caravanas de outras cidades recebem o ingresso pelo WhatsApp e mostram o QR na entrada.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Modelo para congresso, retiro ou jantar, com o nome do evento, a data e o local." },
      { titulo: "Líderes vendem", texto: "Cada ministério ou líder recebe uma faixa de números e um link para marcar as vendas." },
      { titulo: "Caravanas pelo WhatsApp", texto: "Quem vem de outra cidade recebe o ingresso no celular, com o nome de cada pessoa." },
      { titulo: "Recepção confere", texto: "A equipe de recepção lê o QR com o celular, mesmo com a internet do templo instável." },
    ],
    faq: [
      {
        pergunta: "Serve para eventos gratuitos com inscrição?",
        resposta:
          "Sim. O ingresso controla a entrada mesmo quando não há valor cobrado.",
      },
      {
        pergunta: "Precisa de internet no local?",
        resposta:
          "Não. A leitura é decidida no próprio celular, e as leituras se sincronizam quando o sinal volta.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "30 ingressos grátis para começar. Depois, a partir de R$ 0,05 por ingresso, pago por lote.",
      },
      {
        pergunta: "E um congresso de vários dias?",
        resposta:
          "Crie o evento com várias datas: cada dia tem os seus ingressos e a sua portaria, e você vê as datas lado a lado.",
      },
    ],
    cta: "Criar os ingressos do evento",
  },
  {
    slug: "jantar-beneficente",
    label: "Jantar beneficente",
    title: "Ingresso para jantar beneficente e feijoada",
    description:
      "Ingressos e convites numerados para jantares beneficentes, feijoadas e ações solidárias, com controle de vendedores e entrada pelo celular.",
    h1: "Ingressos para jantares beneficentes e ações solidárias",
    intro:
      "Em evento beneficente, cada real conta. Saiba exatamente quantos convites cada voluntário vendeu, evite convite copiado e tenha o relatório pronto para prestar contas.",
    dores: [
      "Convites distribuídos entre voluntários sem controle",
      "Dificuldade para fechar as contas depois do evento",
      "Gente entrando com convite repetido",
    ],
    beneficios: [
      {
        titulo: "Prestação de contas pronta",
        texto:
          "Relatório com vendidos, faturamento, custo e acerto por vendedor, com exportação para planilha.",
      },
      {
        titulo: "Modelo para ação solidária",
        texto:
          "Modelos prontos para jantar, feijoada e evento de contribuição, ou envie a sua arte.",
      },
      {
        titulo: "Custo de centavos",
        texto:
          "Sem mensalidade e sem porcentagem sobre o valor arrecadado. Você paga só pelos ingressos gerados.",
      },
    ],
    passos: [
      { titulo: "Escolha o modelo", texto: "Jantar, feijoada ou almoço solidário, com o nome da causa, a data e o local." },
      { titulo: "Voluntários vendem", texto: "Cada voluntário leva uma faixa de convites e o painel soma o que cada um arrecadou." },
      { titulo: "Convite impresso e no celular", texto: "Entregue em mãos ou mande pelo WhatsApp para quem não vai buscar o papel." },
      { titulo: "Preste contas", texto: "Lance despesas e receitas e baixe o resumo em PDF ou planilha." },
    ],
    faq: [
      {
        pergunta: "A plataforma cobra porcentagem da arrecadação?",
        resposta:
          "Não. Você paga apenas pelo lote de ingressos, e todo o valor arrecadado fica com o evento.",
      },
      {
        pergunta: "Posso cancelar convites que não foram vendidos?",
        resposta:
          "Sim. Cancele a faixa de números e eles passam a ser barrados na entrada.",
      },
      {
        pergunta: "Como os convidados recebem o convite?",
        resposta:
          "Impresso, entregue pelos voluntários, ou por link no WhatsApp para quem não vai buscar o papel.",
      },
      {
        pergunta: "Dá para colocar o logo dos patrocinadores no convite?",
        resposta:
          "Dá. O ingresso pode ter uma faixa com até seis logos de apoiadores, revisados como a arte antes de imprimir.",
      },
    ],
    cta: "Criar os convites do jantar",
  },
  {
    slug: "teatro-e-danca",
    label: "Teatro e dança",
    title: "Ingresso para espetáculo de teatro e dança",
    description:
      "Ingressos numerados para apresentações de teatro, balé e escolas de dança, vendidos pelos alunos e conferidos na porta pelo celular.",
    h1: "Ingressos para espetáculos de teatro, dança e recitais",
    intro:
      "Na apresentação de fim de ano, quem vende são os alunos e as famílias. Distribua os ingressos por aluno, acompanhe o acerto e faça a entrada do auditório sem fila.",
    dores: [
      "Cada aluno com um envelope e o acerto feito no dia",
      "Ingresso impresso sem numeração nem controle",
      "Entrada lenta no auditório com lista de nomes",
    ],
    beneficios: [
      {
        titulo: "Faixa por aluno ou turma",
        texto:
          "Cada aluno leva a sua faixa de números, e você acompanha vendas e devoluções no painel.",
      },
      {
        titulo: "Ingresso com cara de espetáculo",
        texto:
          "Modelos para teatro e recital, ou a arte do próprio espetáculo com número e QR posicionados no editor.",
      },
      {
        titulo: "Várias sessões",
        texto:
          "Crie um evento para cada sessão e controle a entrada de cada uma separadamente.",
      },
    ],
    passos: [
      { titulo: "Ingresso do espetáculo", texto: "Modelo de teatro ou recital, ou a arte do espetáculo com número e QR posicionados." },
      { titulo: "Faixa por aluno", texto: "Cada aluno ou turma leva os seus ingressos, e o acerto mostra quem já pagou." },
      { titulo: "Pais recebem no celular", texto: "Familiares recebem o ingresso pelo WhatsApp, com o nome de quem comprou." },
      { titulo: "Entrada do auditório", texto: "Celulares conferem a entrada de cada sessão, sem lista de nomes." },
    ],
    faq: [
      {
        pergunta: "Dá para imprimir na gráfica?",
        resposta:
          "Sim. Baixe o PDF com sangria e cada ingresso sai com o seu número e um QR que não se repete.",
      },
      {
        pergunta: "Os pais podem receber o ingresso no celular?",
        resposta:
          "Sim, por um link no WhatsApp com o nome de quem comprou.",
      },
      {
        pergunta: "Funciona sem internet no teatro?",
        resposta:
          "Sim. A portaria funciona offline e sincroniza quando a conexão volta.",
      },
      {
        pergunta: "Como funciona com mais de uma sessão?",
        resposta:
          "Crie as sessões como várias datas do mesmo espetáculo. Cada sessão tem os seus ingressos e a sua portaria, e o ingresso mostra o dia e a hora.",
      },
    ],
    cta: "Criar os ingressos do espetáculo",
  },
  {
    slug: "baile",
    label: "Baile",
    title: "Ingresso para baile e festa em clube",
    description:
      "Ingressos numerados para bailes, festas em clube e eventos tradicionalistas, com QR à prova de cópia e entrada conferida pelo celular.",
    h1: "Ingressos para bailes e festas em clube",
    intro:
      "Baile de clube, festa temática ou fandango: monte o ingresso, distribua entre os diretores e sócios que vendem e confira a entrada com o celular, mesmo com o salão cheio e sem sinal.",
    dores: [
      "Ingresso de papel simples, fácil de falsificar",
      "Diretoria sem saber quanto cada vendedor deve",
      "Portaria travada esperando a internet",
    ],
    beneficios: [
      {
        titulo: "QR assinado contra cópia",
        texto:
          "Ingresso falso não passa, e a cópia de um verdadeiro é barrada na segunda leitura.",
      },
      {
        titulo: "Acerto por vendedor",
        texto:
          "Faixas de números por diretor ou sócio, com o valor que cada um precisa acertar.",
      },
      {
        titulo: "Feito para o salão",
        texto:
          "Tela cheia com cor e som para cada leitura e lanterna para ambientes escuros.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Modelo de festa ou a arte do clube, com o nome do baile, a data e o preço." },
      { titulo: "Diretores e sócios vendem", texto: "Cada vendedor recebe a sua faixa de números, e o acerto fica pronto no painel." },
      { titulo: "Mesas e lugares", texto: "Se o baile tem mesas, o ingresso sai com a mesa e o lugar impressos." },
      { titulo: "Porta do salão", texto: "Tela cheia com cor e som e lanterna para o salão escuro, com ou sem internet." },
    ],
    faq: [
      {
        pergunta: "Posso usar o mesmo sistema em todos os bailes do ano?",
        resposta:
          "Sim. Cada baile é um evento, e você paga só pelos ingressos de cada lote, sem mensalidade.",
      },
      {
        pergunta: "Quantos celulares posso usar na portaria?",
        resposta: "Quantos quiser, sem custo adicional.",
      },
      {
        pergunta: "O ingresso pode ter preço impresso?",
        resposta:
          "Sim. Os modelos trazem nome, data, local e valor do evento, e você ajusta no editor.",
      },
      {
        pergunta: "Dá para vender mesas?",
        resposta:
          "Dá. Monte o mapa do salão com as mesas, ligue cada número a uma mesa e a um lugar e acompanhe o que já foi vendido.",
      },
    ],
    cta: "Criar os ingressos do baile",
  },
  {
    slug: "campeonato",
    label: "Campeonato",
    title: "Ingresso para jogo e campeonato com QR code",
    description:
      "Ingressos numerados para jogos, torneios e campeonatos amadores, vendidos pelos times e conferidos no portão do ginásio ou do campo pelo celular.",
    h1: "Ingressos para jogos e campeonatos, do bairro ao ginásio",
    intro:
      "Final do campeonato do bairro, torneio da escola ou jogo beneficente: divida os ingressos entre os times e a organização, controle quem vendeu e confira a entrada no portão com o celular, mesmo sem sinal no campo.",
    dores: [
      "Bilheteria improvisada no portão e dinheiro sem conferência",
      "Cada time vendendo por conta própria, sem controle",
      "Ingresso de papel simples, fácil de copiar",
    ],
    beneficios: [
      {
        titulo: "Faixa por time",
        texto:
          "Cada time ou diretor recebe a sua faixa de números, e o painel mostra o que cada um vendeu e precisa acertar.",
      },
      {
        titulo: "Bilheteria no portão",
        texto:
          "Separe números para vender na hora: o ingresso vendido no portão conta como vendido quando a pessoa entra.",
      },
      {
        titulo: "Rodadas e finais",
        texto:
          "Cada jogo pode ser uma data do mesmo campeonato, com os seus ingressos, a sua portaria e o seu relatório.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Modelo de esporte com gramado ou quadra, com o nome do campeonato, a data e o local." },
      { titulo: "Divida entre os times", texto: "Cada time leva a sua faixa de números e acerta com a organização pelo painel." },
      { titulo: "Venda também no portão", texto: "Uma faixa fica com a bilheteria para quem chega na hora." },
      { titulo: "Confira no portão", texto: "Celulares leem o QR na entrada do ginásio ou do campo, mesmo sem internet." },
    ],
    faq: [
      {
        pergunta: "Dá para ter inteira e meia-entrada?",
        resposta:
          "Dá. Crie uma categoria para cada uma, com a sua faixa de números e o seu preço. Cada ingresso sai com a faixa colorida da categoria.",
      },
      {
        pergunta: "O campeonato tem várias rodadas. Preciso criar tudo de novo?",
        resposta:
          "Não. Adicione outra data ao evento: a configuração é copiada, e cada data tem os seus ingressos e a sua portaria.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "Os primeiros 30 ingressos são grátis. Depois, a partir de R$ 0,05 por ingresso, pago por lote e sem mensalidade.",
      },
    ],
    cta: "Criar os ingressos do campeonato",
  },
  {
    slug: "palestra-e-curso",
    label: "Palestra e curso",
    title: "Ingresso para palestra, curso e workshop com QR code",
    description:
      "Ingressos e inscrições com QR code para palestras, cursos, workshops e congressos, enviados pelo WhatsApp e conferidos na entrada pelo celular.",
    h1: "Ingressos para palestras, cursos e workshops",
    intro:
      "Palestra, curso, workshop ou congresso: mande o ingresso digital com o nome de cada participante, imprima ingressos numerados se preferir e confira a entrada na recepção pelo celular.",
    dores: [
      "Planilha de inscritos conferida à mão na recepção",
      "Participante sem comprovante e fila no credenciamento",
      "Inscrição repassada para quem não pagou",
    ],
    beneficios: [
      {
        titulo: "Ingresso com o nome",
        texto:
          "Cada participante recebe pelo WhatsApp um link com o próprio nome, que abre no celular mesmo sem internet.",
      },
      {
        titulo: "Credenciamento rápido",
        texto:
          "A recepção lê o QR com o celular. Convidados e palestrantes entram pela lista de nomes, no mesmo aparelho.",
      },
      {
        titulo: "Vários dias",
        texto:
          "Curso ou congresso de mais de um dia vira um evento com várias datas, cada uma com a sua portaria.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Modelo limpo e corporativo, com o nome do curso, a data e o local." },
      { titulo: "Mande para os inscritos", texto: "Crie o ingresso digital de cada participante e envie pelo WhatsApp." },
      { titulo: "Equipe na recepção", texto: "Mande o link da portaria para quem faz o credenciamento." },
      { titulo: "Acompanhe ao vivo", texto: "Veja quantos participantes já chegaram, por porta e por hora." },
    ],
    faq: [
      {
        pergunta: "Serve para evento gratuito com inscrição?",
        resposta:
          "Sim. O ingresso controla a entrada mesmo sem valor cobrado, e você paga só pelos ingressos gerados.",
      },
      {
        pergunta: "Posso mandar muitos ingressos de uma vez?",
        resposta:
          "Pode. Gere uma planilha com vários links e envie conforme as inscrições forem confirmadas.",
      },
      {
        pergunta: "Dá para separar participante, estudante e convidado?",
        resposta:
          "Dá. Use categorias com faixas de números, cor e preço próprios, e links da portaria que aceitam só algumas categorias.",
      },
    ],
    cta: "Criar os ingressos do curso",
  },
  {
    slug: "carnaval",
    label: "Carnaval",
    title: "Ingresso para bloco e baile de carnaval com QR code",
    description:
      "Ingressos numerados para bloco, baile e matinê de carnaval, com QR code à prova de cópia e entrada conferida pelo celular, mesmo sem sinal.",
    h1: "Ingressos para bloco e baile de carnaval",
    intro:
      "Baile no clube, matinê para as crianças ou bloco com área fechada: monte o ingresso com cores de carnaval, divida entre os vendedores e confira a entrada no meio da folia, quando a internet do celular some.",
    dores: [
      "Rede de celular congestionada no dia da festa",
      "Ingresso de papel fácil de falsificar",
      "Várias noites de folia e o controle de cada uma",
    ],
    beneficios: [
      {
        titulo: "Portaria sem internet",
        texto:
          "Cada celular decide na hora, sem esperar a rede, e as leituras se acertam quando o sinal volta.",
      },
      {
        titulo: "Uma data para cada noite",
        texto:
          "Sábado, domingo, segunda e terça como datas do mesmo evento, cada uma com os seus ingressos.",
      },
      {
        titulo: "Camarote e pista",
        texto:
          "Categorias com faixas de números, cor e preço próprios, e portas que aceitam só a categoria certa.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Confete e serpentina prontos, nas cores da folia ou do frevo." },
      { titulo: "Crie as noites", texto: "Uma data para cada noite de baile, com a configuração copiada." },
      { titulo: "Divida entre os vendedores", texto: "Cada vendedor leva a sua faixa e acerta pelo painel." },
      { titulo: "Confira na entrada", texto: "Tela cheia com cor e som, para ler o QR no meio do barulho." },
    ],
    faq: [
      {
        pergunta: "Funciona se a rede de celular cair no carnaval?",
        resposta:
          "Funciona. A portaria decide no próprio celular. Com vários celulares sem sinal, prefira um por fila até a rede voltar.",
      },
      {
        pergunta: "Dá para separar camarote e pista?",
        resposta:
          "Dá. Crie as categorias e um link de portaria para cada entrada, aceitando só a categoria daquela porta.",
      },
      {
        pergunta: "Quanto custa?",
        resposta:
          "Os primeiros 30 ingressos são grátis. Depois, a partir de R$ 0,05 por ingresso, sem mensalidade e sem porcentagem da venda.",
      },
    ],
    cta: "Criar os ingressos do carnaval",
  },
  {
    slug: "reveillon",
    label: "Réveillon",
    title: "Ingresso para festa de Réveillon com QR code",
    description:
      "Ingressos numerados para festa de Réveillon e virada do ano, com mesas e lugares, QR à prova de cópia e entrada conferida pelo celular, sem internet.",
    h1: "Ingressos para a festa de Réveillon",
    intro:
      "Virada no clube, no salão ou na praia: venda os ingressos com antecedência, marque mesas e lugares e confira a entrada com o celular, mesmo com a rede congestionada perto da meia-noite.",
    dores: [
      "Rede de celular lotada na noite da virada",
      "Mesas vendidas em planilha e lugar duplicado",
      "Ingresso copiado na festa mais cara do ano",
    ],
    beneficios: [
      {
        titulo: "Mesa e lugar no ingresso",
        texto:
          "Monte o mapa do salão e ligue cada número a uma mesa e a um lugar, impressos no ingresso.",
      },
      {
        titulo: "Portaria sem internet",
        texto:
          "Os celulares conferem a entrada sem esperar a rede, mesmo com a cidade inteira no celular.",
      },
      {
        titulo: "Para quem vem de longe",
        texto:
          "O ingresso digital chega pelo WhatsApp, com o nome, a rota até o local e a mesa no mapa.",
      },
    ],
    passos: [
      { titulo: "Monte o ingresso", texto: "Fogos dourados prontos, com o nome da festa, o local e o preço." },
      { titulo: "Organize as mesas", texto: "Desenhe o salão e reserve números para quem vai pagar depois." },
      { titulo: "Venda com antecedência", texto: "Vendedores com faixas próprias e ingresso digital para quem viaja." },
      { titulo: "Virada tranquila", texto: "Portaria no celular e contagem de quem entrou, ao vivo." },
    ],
    faq: [
      {
        pergunta: "Dá para reservar um ingresso até a pessoa pagar?",
        resposta:
          "Dá. O vendedor reserva o número com um prazo. Se o pagamento não vier até lá, a reserva vence e o vendedor pode oferecer o número a outra pessoa.",
      },
      {
        pergunta: "O ingresso mostra a mesa?",
        resposta:
          "Mostra. Mesa e lugar saem impressos no ingresso, e o ingresso digital mostra a mesa no mapa do salão.",
      },
      {
        pergunta: "Precisa de internet na entrada?",
        resposta:
          "Não. Abra o link da portaria antes, com internet, e o celular continua lendo ingressos sem sinal.",
      },
    ],
    cta: "Criar os ingressos do Réveillon",
  },
];

/** The page of `slug`, or `undefined` for an unknown one. */
export function eventSeoPage(slug: string): EventSeoPage | undefined {
  return eventSeoPages.find((page) => page.slug === slug);
}
