import type { Known, Overrides } from "@/lib/event-kind";

// Check a ticket before buying it (ADR 0075).
export const verifyPage = {
  metaTitle: "Conferir ingresso: veja se o QR code é verdadeiro",
  metaDescription:
    "Vai comprar ingresso de outra pessoa? Leia o QR code com a câmera, envie uma foto ou cole o texto e veja se ele é verdadeiro, de qual evento e número.",
  breadcrumb: "Conferir ingresso",
  eyebrow: "Conferir ingresso",
  headline: "Esse ingresso é verdadeiro?",
  lead: "Leia o QR code com a câmera, envie uma foto ou cole o texto. Em segundos você vê se ele foi emitido pelo Ingresso Impresso, de qual evento e número, e se o evento continua de pé.",
  privacyNote: "Grátis e sem cadastro. A imagem da câmera não sai do seu aparelho e não guardamos o que você conferiu.",
  modes: { camera: "Câmera", photo: "Foto", paste: "Colar texto" },
  modesLabel: "Como ler o QR",
  openCamera: "Abrir a câmera",
  cameraHint: "Aponte para o QR code do ingresso, de perto e com boa luz.",
  cameraStarting: "Abrindo a câmera…",
  cameraDenied: "A câmera não abriu. Permita o acesso nas configurações do navegador, ou envie uma foto do QR.",
  cameraUnsupported: "Este navegador não abre a câmera por aqui. Envie uma foto do QR ou cole o texto.",
  closeCamera: "Fechar a câmera",
  torchOn: "Ligar a lanterna",
  torchOff: "Desligar a lanterna",
  choosePhoto: "Escolher foto do QR",
  photoHint: "Uma foto ou captura de tela em que o QR apareça inteiro e nítido. Ela é lida no seu aparelho.",
  photoReading: "Lendo a foto…",
  photoNoQr: "Não achamos um QR code nessa imagem. Tente uma foto mais de perto, reta e sem reflexo.",
  pasteLabel: "Texto do QR code",
  pastePlaceholder: "Cole aqui o texto que um leitor de QR mostrou",
  pasteHint: "Um leitor de QR comum mostra um texto de letras e números. Cole o texto inteiro.",
  check: "Conferir",
  checking: "Conferindo…",
  ticketLink:
    "Isso é o link de um ingresso no celular. Abra o link: o QR code que aparece nele pode ser conferido aqui, com a câmera de outro aparelho ou por um print.",
  otherLink: "Isso é um endereço de site, não o texto de um ingresso. Leia o QR do ingresso com a câmera ou envie uma foto dele.",
  again: "Conferir outro ingresso",
  resultLabel: "Resultado da conferência",
  verdicts: {
    valid: {
      title: "Ingresso autêntico",
      body: "Este QR code foi emitido pelo Ingresso Impresso para o evento abaixo, e o número não foi cancelado.",
    },
    event_postponed: {
      title: "Autêntico, e o evento mudou de data",
      body: "O ingresso foi emitido para o evento abaixo e continua valendo para a nova data.",
    },
    event_over: {
      title: "Autêntico, mas o evento já aconteceu",
      body: "O ingresso foi emitido para um evento que já terminou. Ele não serve para outra data.",
    },
    event_canceled: {
      title: "Autêntico, mas o evento foi cancelado",
      body: "A organização cancelou o evento. Não compre este ingresso; quem já comprou deve falar com a organização.",
    },
    ticket_canceled: {
      title: "Este número foi cancelado",
      body: "O ingresso é do evento abaixo, mas a organização cancelou este número (perda, segunda via ou estorno). Ele não entra na portaria.",
    },
    private: {
      title: "A organização não permite conferir por aqui",
      body: "Quem organiza este evento desligou a conferência pública. Para saber se o ingresso vale, pergunte diretamente à organização.",
    },
    not_ours: {
      title: "Não é um ingresso do Ingresso Impresso",
      body: "Este QR code não foi emitido por nós, ou foi alterado. Se ele veio num ingresso que diz ser do Ingresso Impresso, desconfie e não compre.",
    },
  },
  copyTitle: "Autêntico não quer dizer único",
  copyBody:
    "Uma cópia deste QR (foto, xerox, print) também aparece como autêntica, e só a primeira leitura entra na portaria. Por isso não dizemos se o ingresso já foi usado nem quem comprou. Compre de quem você confia.",
  number: "Número",
  category: "Categoria",
  // A category that asks for a document at the door (ADR 0082).
  document: (category: string, note: string | null) =>
    `${category} pede documento na entrada${note === null ? ": um comprovante do direito, com foto." : `: ${note}.`}`,
  when: "Quando",
  where: "Onde",
  organizedBy: "Organização",
  contactMessage: (number: string, event: string) =>
    `Olá! Conferi no Ingresso Impresso o ingresso nº ${number} de "${event}" e queria confirmar com vocês antes de comprar.`,
  howTitle: "Como a conferência funciona",
  how: [
    {
      title: "Cada ingresso tem uma assinatura",
      body: "O QR code de todo ingresso do Ingresso Impresso leva uma assinatura digital feita com a chave do evento. Ninguém consegue inventar um QR válido nem trocar o número sem quebrar a assinatura.",
    },
    {
      title: "A assinatura é conferida aqui",
      body: "Lemos o QR, achamos o evento e conferimos a assinatura com a chave pública dele: é a mesma conta que o celular da portaria faz no dia.",
    },
    {
      title: "Você vê o que está impresso",
      body: "Evento, data, local, número e categoria, e também se o número foi cancelado ou se o evento mudou de data ou foi cancelado.",
    },
  ],
  limitsTitle: "O que a conferência não diz",
  limits: [
    "Se o ingresso já entrou ou se existe outra cópia dele: a cópia de um QR verdadeiro também é verdadeira.",
    "Quem comprou ou para quem foi vendido: esses dados são da organização.",
    "Se o preço pedido é justo: compare com o valor que a organização anuncia.",
  ],
  tipsTitle: "Para comprar com segurança",
  tips: [
    "Prefira comprar da organização ou dos vendedores dela.",
    "Peça o ingresso impresso em mãos ou o link do ingresso no celular, e não só uma foto do QR.",
    "Desconfie de preço muito baixo e de pressa para fechar o negócio.",
    "Na dúvida, fale com a organização: o contato aparece no resultado da conferência.",
  ],
  faqTitle: "Dúvidas sobre a conferência",
  faq: [
    {
      question: "Que ingressos dá para conferir aqui?",
      answer:
        "Os ingressos feitos no Ingresso Impresso: impressos em casa, na gráfica ou enviados para o celular. Todos têm o mesmo QR code assinado. Ingressos de outras empresas aparecem como “não é um ingresso do Ingresso Impresso”.",
    },
    {
      question: "Se aparecer “autêntico”, posso comprar sem medo?",
      answer:
        "Quer dizer que o QR é verdadeiro e o número não foi cancelado. Mas uma cópia de um QR verdadeiro também é verdadeira, e só a primeira leitura entra na portaria. Por isso, compre de quem você confia: da organização, dos vendedores dela ou de alguém que você conhece.",
    },
    {
      question: "Por que não aparece se o ingresso já foi usado?",
      answer:
        "Porque essa informação ajudaria quem faz cópias a descobrir quais ainda entram. A portaria decide na hora, pela primeira leitura de cada número.",
    },
    {
      question: "Vocês guardam o QR que eu conferi?",
      answer:
        "Não. O texto do QR é usado só para responder esta conferência. A imagem da câmera e as fotos são lidas no seu próprio aparelho e não são enviadas.",
    },
    {
      question: "Sou organizador. Dá para desligar a conferência?",
      answer:
        "Dá. Na aba Digitais do evento, desligue a conferência pública. Quem tentar conferir verá que a organização não permite e será orientado a falar com vocês.",
    },
  ],
  organizerTitle: "Faz eventos?",
  organizerBody:
    "Com o Ingresso Impresso, seus ingressos numerados saem com QR code assinado, que qualquer pessoa confere aqui, e a portaria funciona pelo celular, mesmo sem internet.",
  settings: {
    title: "Conferência pública",
    description: "Quem tem um ingresso deste evento pode conferir no site se ele é verdadeiro, antes de comprar de outra pessoa.",
    toggle: "Permitir conferir os ingressos no site",
    on: "Ligada: o site mostra o evento, o número e a categoria de um QR verdadeiro, nunca quem comprou nem se já entrou.",
    off: "Desligada: quem conferir verá que a organização não permite e será orientado a falar com vocês.",
    saved: (on: boolean) => (on ? "Conferência pública ligada." : "Conferência pública desligada."),
    open: "Abrir a página de conferência",
  },
  // A consumption token (ADR 0086): the result speaks of a ficha.
  tokens: {
    settings: {
      description: "Quem tem uma ficha deste evento pode conferir no site se ela é verdadeira, antes de comprar de outra pessoa.",
      toggle: "Permitir conferir as fichas no site",
      on: "Ligada: o site mostra o evento, o número e o produto de um QR verdadeiro, nunca quem comprou nem se já foi usada.",
    },
    again: "Conferir outra ficha",
    verdicts: {
      valid: {
        title: "Ficha autêntica",
        body: "Este QR code foi emitido pelo Ingresso Impresso para o evento abaixo, e o número não foi cancelado.",
      },
      event_postponed: { body: "A ficha foi emitida para o evento abaixo e continua valendo para a nova data." },
      event_over: { body: "A ficha foi emitida para um evento que já terminou. Ela não serve para outra data." },
      event_canceled: { body: "A organização cancelou o evento. Não compre esta ficha; quem já comprou deve falar com a organização." },
      ticket_canceled: {
        body: "A ficha é do evento abaixo, mas a organização cancelou este número (perda, segunda via ou estorno). Ela não vale nas barracas.",
      },
      private: {
        body: "Quem organiza este evento desligou a conferência pública. Para saber se a ficha vale, pergunte diretamente à organização.",
      },
    },
    copyBody:
      "Uma cópia deste QR (foto, xerox, print) também aparece como autêntica, e só a primeira leitura vale na barraca. Por isso não dizemos se a ficha já foi usada nem quem comprou. Compre de quem você confia.",
    category: "Produto",
    contactMessage: (number: string, event: string) =>
      `Olá! Conferi no Ingresso Impresso a ficha nº ${number} de "${event}" e queria confirmar com vocês antes de comprar.`,
  },
} as const;

/** Fails to compile when a consumption-token text has no ticket text or other parameters. */
type Checked<T extends Overrides<typeof verifyPage> & Known<T, typeof verifyPage>> = T;
export type VerifyPageTokenTexts = Checked<typeof verifyPage.tokens>;
