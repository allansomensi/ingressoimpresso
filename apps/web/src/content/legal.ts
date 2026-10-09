/**
 * Legal documents of the site (Terms of Use, Privacy Policy, Refund Policy), in Brazilian
 * Portuguese. Rendered by src/components/legal/legal-page.tsx. Changing a document's text means
 * bumping its `updatedAt` (and `TERMS_VERSION` for the Terms or the Privacy Policy).
 */

/** Who provides the service (Decreto 7.962/2013, art. 2º). */
export const LEGAL_ENTITY = {
  name: "Allan Rigo Somensi",
  document: "CPF 055.156.570-55",
  kind: "pessoa física",
  email: "contato@ingressoimpresso.com.br",
  /** Physical address required by Decreto 7.962/2013. */
  address: "Rua Amedeu Arioli, 269, bairro Licorsul, Bento Gonçalves/RS, CEP 95705-832, Brasil" as string | null,
  site: "https://ingressoimpresso.com.br",
} as const;

/** Version of the Terms + Privacy Policy accepted at sign-in (stored with the user). */
export const TERMS_VERSION = "2026-10-09.2";

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: readonly string[] };

export type LegalSection = { id: string; title: string; blocks: readonly LegalBlock[] };

export type LegalSlug = "termos" | "privacidade" | "reembolso";

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  /** One sentence for <meta name="description">. */
  description: string;
  /** ISO date `YYYY-MM-DD` of the last change. */
  updatedAt: string;
  /** Short plain-language summary shown in a box at the top (3–5 bullet points). */
  summary: readonly string[];
  sections: readonly LegalSection[];
};

const ADDRESS = LEGAL_ENTITY.address ?? "informado mediante solicitação pelo e-mail de contato";

function p(text: string): LegalBlock {
  return { type: "p", text };
}

function ul(...items: string[]): LegalBlock {
  return { type: "ul", items };
}

/** Identification of the provider, in the first section of every document. */
const PROVIDER = ul(
  `Fornecedor: ${LEGAL_ENTITY.name}, ${LEGAL_ENTITY.kind}`,
  `Inscrição: ${LEGAL_ENTITY.document}`,
  `E-mail: ${LEGAL_ENTITY.email}`,
  `Endereço: ${ADDRESS}`,
  `Site: ${LEGAL_ENTITY.site}`,
);

const TERMS: LegalDocument = {
  slug: "termos",
  title: "Termos de Uso",
  description:
    "Regras de uso do Ingresso Impresso: o que o serviço faz, preços e pagamento, responsabilidades do organizador e limites da nossa responsabilidade.",
  updatedAt: "2026-10-09",
  summary: [
    "O Ingresso Impresso é uma ferramenta para criar, numerar e imprimir ingressos com QR assinado e conferir a entrada pelo celular. Não vendemos ingressos ao público e não produzimos eventos.",
    "Você paga por lote de números, sem assinatura. Cada organização tem 30 ingressos grátis para experimentar.",
    "O evento, a venda dos ingressos, o atendimento a quem compra e as autorizações legais são responsabilidade do organizador.",
    "É proibido usar o serviço para fraude, ingressos falsos, atividades ilegais ou rifas e sorteios sem a autorização exigida por lei.",
    "Se você é consumidor, os direitos garantidos pelo Código de Defesa do Consumidor continuam valendo. Nada nestes Termos os reduz.",
  ],
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem somos",
      blocks: [
        p(
          "O Ingresso Impresso é um serviço on-line para criar, imprimir e conferir ingressos numerados. Ele é oferecido por:",
        ),
        PROVIDER,
        p(
          "Nestes Termos de Uso, “nós” e “Ingresso Impresso” se referem ao fornecedor acima e ao serviço. “Você” e “organizador” se referem a quem cria uma conta para organizar eventos, inclusive em nome de uma banda, escola, igreja, associação ou empresa.",
        ),
        p(
          "Também usamos estes termos: participante é quem compra ou recebe um ingresso para entrar no evento; vendedor é a pessoa que o organizador cadastra para vender uma faixa de números; lote é um conjunto de números de ingresso comprado de uma vez; portaria é a página aberta no celular de quem confere os ingressos na entrada.",
        ),
      ],
    },
    {
      id: "aceitacao",
      title: "2. Aceitação",
      blocks: [
        p(
          "Ao entrar no Ingresso Impresso pela primeira vez, com o código enviado por e-mail ou com a conta Google, você declara que leu e aceita estes Termos de Uso e que conhece a Política de Privacidade. Registramos a data e a versão que você aceitou.",
        ),
        p(
          "A Política de Reembolso faz parte destes Termos. Todos os documentos ficam publicados no site, podem ser consultados a qualquer momento e podem ser impressos ou salvos.",
        ),
        p("Se você não concorda com estes Termos, não use o serviço."),
      ],
    },
    {
      id: "o-servico",
      title: "3. O que o serviço faz",
      blocks: [
        p(
          "O Ingresso Impresso é uma ferramenta para quem vende ingressos de forma direta. Pelo painel, o organizador pode:",
        ),
        ul(
          "cadastrar eventos e montar ingressos numerados a partir de modelos prontos ou da própria arte;",
          "comprar lotes de números de ingresso;",
          "baixar os arquivos para impressão: PDF em folhas A4 para imprimir em casa, PDF para gráfica, folha de controle por vendedor e imagens para enviar pelo WhatsApp;",
          "enviar ingressos em formato digital, por um link privado que mostra o QR no celular de quem recebe;",
          "cadastrar vendedores, distribuir faixas de números entre eles e cancelar faixas perdidas ou não vendidas;",
          "conferir a entrada no dia do evento com a portaria, que funciona no navegador do celular, inclusive sem internet;",
          "acompanhar o acerto de contas com cada vendedor e os números do evento.",
        ),
        p(
          "Cada ingresso tem um QR assinado digitalmente com uma chave exclusiva do evento. A chave privada fica guardada de forma cifrada no servidor e nunca é entregue ao organizador nem a terceiros. É essa assinatura que permite à portaria reconhecer ingressos falsificados.",
        ),
        p(
          "Prévias e amostras saem com marca d'água e com um QR de amostra, que não vale na portaria. Só os números de lotes pagos recebem QR válido. Um lote coberto por ingressos grátis conta como pago.",
        ),
        p(
          "Podemos melhorar, mudar ou retirar funções do serviço. Mudanças relevantes são anunciadas em “Novidades”, no painel. Não faremos mudanças que impeçam o uso de lotes já pagos no evento a que se referem.",
        ),
      ],
    },
    {
      id: "quem-pode-usar",
      title: "4. Quem pode usar",
      blocks: [
        p(
          "Para criar uma conta, você precisa ter 18 anos ou mais e plena capacidade civil. Menores de 18 anos só podem usar o serviço representados ou assistidos pelos pais ou responsáveis legais, que devem criar e manter a conta e respondem por ela.",
        ),
        p(
          "Se você usa o serviço em nome de uma banda, escola, igreja, associação ou empresa, declara que tem autorização para isso. Nesse caso, estes Termos valem também para a entidade que você representa.",
        ),
        p(
          "As informações que você fornece, como o e-mail e o nome da organização, devem ser verdadeiras e mantidas atualizadas.",
        ),
      ],
    },
    {
      id: "conta-e-acesso",
      title: "5. Conta e acesso",
      blocks: [
        p(
          "O acesso não usa senha. Para entrar, você recebe por e-mail um código de 6 dígitos, válido por 10 minutos, ou usa o botão “Entrar com Google”. Cada conta nova recebe uma organização própria, onde ficam os eventos.",
        ),
        p(
          "Depois que você entra, o navegador guarda uma sessão que dura 30 dias e é renovada enquanto você usa o painel. Por isso:",
        ),
        ul(
          "proteja o acesso ao seu e-mail e à sua conta Google, que funcionam como a chave da sua conta;",
          "não repasse os códigos de acesso a ninguém;",
          "use “Sair” ao terminar, se o computador ou o celular for de outra pessoa;",
          "avise-nos pelo e-mail de contato assim que suspeitar de acesso indevido.",
        ),
        p(
          "Você responde pelo uso da sua conta. Não respondemos por acessos feitos por meio do seu e-mail ou da sua conta Google quando a falha estiver neles ou nos seus aparelhos, mas respondemos, nos termos da lei, por falhas de segurança do nosso serviço.",
        ),
        p(
          "Para prestar suporte, investigar abusos ou cumprir a lei, o fornecedor pode acessar qualquer conta pelo painel de administração. Esses acessos e as ações feitas neles ficam registrados em um log de auditoria. Só fazemos alterações na sua conta a seu pedido, para corrigir falhas, para conceder cortesias ou registrar pagamentos, ou para cumprir estes Termos ou a lei.",
        ),
      ],
    },
    {
      id: "precos-e-pagamento",
      title: "6. Preços e pagamento",
      blocks: [
        p(
          "Não há assinatura nem mensalidade. Você paga por lote de números: o preço por ingresso diminui em faixas, conforme a quantidade, e cada lote tem um valor mínimo de cobrança. A tabela vigente fica no site, e o valor exato do lote aparece antes do pagamento.",
        ),
        p(
          "O preço de um lote é fixado quando o lote é criado. Podemos mudar os preços de lotes futuros. Os novos valores aparecem no site e antes de cada pagamento, e não alteram lotes já criados.",
        ),
        p(
          "O pagamento é feito por Pix ou cartão de crédito no Stripe Checkout, uma página da Stripe. Os dados do cartão e da conta bancária de quem paga são tratados pela Stripe, nunca por nós. Os ingressos de um lote só podem ser gerados com QR válido depois que o pagamento é confirmado. Enquanto um Pix gerado aguarda pagamento, o lote não pode ser cancelado nem pago de outra forma.",
        ),
        p("Um lote ainda não pago pode ser cancelado pelo painel a qualquer momento, sem custo."),
        p(
          "Cada organização recebe 30 ingressos grátis para experimentar o serviço, usados automaticamente nos primeiros lotes, e o fornecedor pode conceder ingressos de cortesia. Ingressos grátis e de cortesia não têm valor em dinheiro e não podem ser vendidos, trocados por dinheiro nem transferidos para outra organização.",
        ),
        p(
          "O valor pago ao Ingresso Impresso remunera apenas o uso da ferramenta. O dinheiro da venda dos ingressos aos participantes não passa por nós.",
        ),
        p("Cancelamentos, reembolsos e o direito de arrependimento seguem a Política de Reembolso."),
      ],
    },
    {
      id: "uso-permitido",
      title: "7. Uso permitido e proibido",
      blocks: [
        p(
          "Você pode usar o Ingresso Impresso para emitir e controlar ingressos dos seus próprios eventos ou de eventos que você tem autorização para organizar. É proibido:",
        ),
        ul(
          "usar o serviço para fraude, golpe ou para enganar participantes, vendedores ou outras pessoas;",
          "emitir ingressos de eventos de terceiros sem autorização, ou imitar ingressos, marcas ou a identidade visual de outras pessoas;",
          "emitir ingressos para eventos ou atividades ilegais;",
          "promover rifa, sorteio, bingo, loteria ou distribuição de prêmios sem a autorização exigida por lei, em especial pela Lei 5.768/1971; promover ou extrair loteria sem autorização legal é contravenção penal (art. 51 da Lei das Contravenções Penais, Decreto-Lei 3.688/1941);",
          "colocar nos ingressos ou nas artes conteúdo que viole direitos autorais, marcas, imagem ou privacidade de outras pessoas, ou que seja discriminatório, de ódio ou ilegal;",
          "copiar, modificar, descompilar ou fazer engenharia reversa do serviço, salvo nos casos permitidos por lei;",
          "atacar, sobrecarregar ou burlar os limites e as proteções do serviço, ou tentar acessar contas, eventos ou dados de outras pessoas;",
          "tentar produzir QR válidos fora do serviço, falsificar assinaturas ou enganar a portaria;",
          "usar o serviço para enviar spam ou mensagens não solicitadas;",
          "criar várias contas ou organizações para obter ingressos grátis mais de uma vez;",
          "cadastrar dados pessoais de outras pessoas sem base legal para isso.",
        ),
        p(
          "Para cumprir a lei e estes Termos, as artes enviadas podem ser analisadas de forma automática e por pessoas da nossa equipe. Uma imagem sinalizada não é impressa até ser revisada. Podemos recusar imagens que violem estes Termos, suspender a conta e, quando a lei exigir, comunicar o conteúdo às autoridades, como no caso de material de abuso sexual infantil.",
        ),
        p(
          "O Ingresso Impresso só imprime e confere ingressos numerados. O serviço não realiza sorteios, não apura resultados e não guarda, entrega ou administra prêmios. Se você usar números de ingresso em qualquer ação com prêmio, obter a autorização e cumprir a lei é responsabilidade sua.",
        ),
        p(
          "Se você encontrar uma falha de segurança, avise-nos pelo e-mail de contato antes de divulgá-la, sem acessar dados de outras pessoas.",
        ),
      ],
    },
    {
      id: "responsabilidades-do-organizador",
      title: "8. Responsabilidades do organizador",
      blocks: [
        p(
          "O organizador é quem realiza o evento e vende os ingressos. Cabe a você, além das demais obrigações legais:",
        ),
        ul(
          "realizar o evento como anunciado e responder por ele, inclusive pela segurança e pela estrutura do local;",
          "vender os ingressos e atender quem compra, cumprindo o Código de Defesa do Consumidor na sua relação com os participantes, com informação clara sobre preço, data, local e regras de entrada;",
          "devolver o dinheiro aos participantes quando a lei ou as suas próprias regras exigirem, como em caso de cancelamento, adiamento ou mudança do evento;",
          "pagar os tributos e emitir os documentos fiscais devidos sobre a venda dos ingressos e o evento;",
          "obter alvarás, licenças, o Auto de Vistoria do Corpo de Bombeiros (AVCB) e as demais autorizações exigidas;",
          "respeitar a lotação máxima do local e não emitir mais ingressos do que ela permite;",
          "garantir a meia-entrada nos casos previstos na Lei 12.933/2013 e nas demais leis aplicáveis;",
          "pagar os direitos autorais devidos, inclusive ao ECAD pela execução pública de músicas, e obter autorização para usar obras, marcas e imagens de terceiros;",
          "conferir na prévia as informações do ingresso, como nome do evento, data, horário, local, preço e numeração, antes de imprimir e distribuir;",
          "guardar com segurança os arquivos, os ingressos impressos ainda não vendidos e os links de ingresso digital, e cancelar pelo painel as faixas perdidas, extraviadas ou não vendidas;",
          "configurar a portaria corretamente, testá-la antes do evento e orientar quem trabalha na entrada;",
          "proteger os dados pessoais de vendedores, participantes e equipe da portaria, conforme a Lei Geral de Proteção de Dados Pessoais (LGPD) e a Política de Privacidade.",
        ),
        p(
          "Os vendedores e as pessoas que trabalham na portaria agem em nome do organizador, que deve orientá-los.",
        ),
        p(
          "Se um participante, vendedor ou autoridade nos procurar por causa do seu evento, poderemos encaminhar o contato a você e, quando a lei exigir ou houver ordem de autoridade competente, informar seus dados de identificação. Se formos condenados a pagar algo por um fato que era de sua responsabilidade, você deverá nos ressarcir, nos termos da lei.",
        ),
      ],
    },
    {
      id: "nosso-papel",
      title: "9. O papel do Ingresso Impresso",
      blocks: [
        p(
          "O Ingresso Impresso é um fornecedor de tecnologia. Não somos produtores, promotores nem revendedores de ingressos, não participamos da venda de ingressos aos participantes e não recebemos o dinheiro dessa venda.",
        ),
        p(
          "Por isso, não somos parte do contrato entre organizador e participante, não verificamos se os eventos acontecem como anunciado e não respondemos pela realização, pelo cancelamento, pelo adiamento, pela qualidade ou pela segurança dos eventos, nem pela devolução de dinheiro aos participantes. Reclamações sobre um evento devem ser feitas ao organizador. Isso não afasta a nossa responsabilidade, nos termos da lei, por falhas do próprio serviço.",
        ),
        p(
          "Quanto aos dados pessoais que o organizador cadastra sobre outras pessoas, atuamos como operador, seguindo as instruções do organizador, como explica a Política de Privacidade.",
        ),
      ],
    },
    {
      id: "ingresso-digital-e-portaria",
      title: "10. Ingresso digital e portaria",
      blocks: [
        p(
          "O ingresso digital é um link privado que mostra o QR do ingresso no celular. Qualquer pessoa com o link consegue ver e apresentar o ingresso. Envie cada link apenas ao portador e oriente-o a não repassá-lo. O nome do portador é opcional.",
        ),
        p(
          "Na portaria, a primeira leitura de um número libera a entrada. As leituras seguintes do mesmo número são bloqueadas como cópia, e os números cancelados pelo organizador ou de lotes reembolsados também são bloqueados.",
        ),
        p(
          "A portaria funciona sem internet: cada celular guarda as leituras e as envia ao servidor quando volta a ter conexão. Isso tem um limite conhecido: se dois celulares estiverem sem internet ao mesmo tempo, a cópia de um ingresso que já entrou por um deles pode entrar pelo outro, e o caso só aparece no relatório depois que os dois sincronizarem. Para reduzir esse risco, mantenha os celulares conectados sempre que possível.",
        ),
        p(
          "Os links de acesso à portaria deixam de funcionar 12 horas depois do evento. Envie esses links só a pessoas de confiança e, se um celular for perdido, revogue o acesso dele pelo painel.",
        ),
        p(
          "Para não depender da internet no dia do evento, gere e baixe os arquivos com antecedência, abra a portaria em cada celular com internet antes do evento e teste a leitura de um ingresso antes de abrir a entrada.",
        ),
      ],
    },
    {
      id: "propriedade-intelectual",
      title: "11. Propriedade intelectual",
      blocks: [
        p(
          "O software, o site, o painel, a portaria, os modelos e fundos de ingresso, a marca e o logotipo do Ingresso Impresso pertencem ao fornecedor ou a quem os licenciou a ele e são protegidos por lei. Você recebe uma licença pessoal, gratuita, não exclusiva e intransferível para usá-los dentro do serviço, enquanto estes Termos estiverem em vigor.",
        ),
        p(
          "Os ingressos e arquivos gerados, inclusive com os nossos modelos, podem ser impressos, distribuídos e usados no evento a que se referem, mesmo depois do fim da sua conta.",
        ),
        p(
          "A arte, as imagens, os logotipos e os textos que você envia continuam sendo seus, ou de quem os licenciou a você. Você nos concede uma licença gratuita, não exclusiva e limitada para armazenar, processar, adaptar ao formato do ingresso e reproduzir esse conteúdo apenas para prestar o serviço: mostrar prévias, gerar arquivos e ingressos digitais e manter cópias de segurança. A licença termina quando o conteúdo é apagado, exceto nas cópias de segurança, até que elas expirem.",
        ),
        p(
          "Você garante que tem os direitos necessários sobre o conteúdo que envia. Podemos remover, avisando você, conteúdo que viole direitos de terceiros ou estes Termos, especialmente após notificação fundamentada.",
        ),
        p(
          "As fontes oferecidas para os ingressos são distribuídas sob a SIL Open Font License, que permite usá-las nos arquivos gerados.",
        ),
      ],
    },
    {
      id: "disponibilidade-e-suporte",
      title: "12. Disponibilidade e suporte",
      blocks: [
        p(
          "Trabalhamos para manter o serviço disponível e funcionando bem, com o melhor esforço possível, mas não garantimos que ele estará sempre livre de interrupções ou erros. O serviço depende da internet e de fornecedores de hospedagem, banco de dados, e-mail e pagamento.",
        ),
        p(
          "Podemos interromper o serviço para manutenção, de preferência em horários de pouco uso, e avisaremos com antecedência sempre que a manutenção puder atrapalhar o uso.",
        ),
        p(
          "Os arquivos gerados ficam disponíveis por até 24 horas e podem ser gerados de novo pelo painel. Cada link de download vale por 10 minutos.",
        ),
        p(`O suporte é feito pelo e-mail ${LEGAL_ENTITY.email}. Respondemos em até 5 dias.`),
      ],
    },
    {
      id: "limites-de-responsabilidade",
      title: "13. Limites da nossa responsabilidade",
      blocks: [
        p(
          "Respondemos pelos danos causados por falhas do nosso serviço, nos termos da lei. Se você é consumidor, nada nestes Termos exclui ou reduz os direitos e as garantias do Código de Defesa do Consumidor.",
        ),
        p("Não respondemos por fatos que não estão sob nosso controle, como:"),
        ul(
          "o evento, a venda dos ingressos e a relação entre organizador, vendedores e participantes;",
          "informações erradas digitadas pelo organizador ou impressas sem conferência da prévia;",
          "a qualidade da impressão, que depende da impressora, do papel e da gráfica escolhidos;",
          "perda, roubo, cópia ou repasse de arquivos, ingressos impressos ou links de ingresso digital que estão com o organizador, com os vendedores ou com quem os recebeu;",
          "uso incorreto da portaria, falta de bateria, câmera com defeito ou falta de internet nos celulares usados na entrada, e o limite da portaria sem internet descrito nestes Termos;",
          "falhas de serviços que não contratamos, como provedores de internet e operadoras de celular;",
          "caso fortuito ou força maior (art. 393 do Código Civil).",
        ),
        p(
          "Quando a relação não é de consumo, como quando você usa o serviço como insumo de uma atividade empresarial, e nos limites permitidos por lei: não respondemos por danos indiretos, lucros cessantes ou perda de receita ou de público do evento; e a nossa responsabilidade total fica limitada ao valor que você nos pagou nos 12 meses anteriores ao fato que causou o dano. Esses limites não se aplicam em caso de dolo ou culpa grave.",
        ),
      ],
    },
    {
      id: "suspensao-e-encerramento",
      title: "14. Suspensão e encerramento",
      blocks: [
        p("Podemos suspender ou encerrar uma conta, ou bloquear lotes e acessos, quando houver:"),
        ul(
          "violação destes Termos ou da lei;",
          "indício razoável de fraude, de ingressos falsos ou de uso do serviço para atividades ilegais;",
          "contestações de pagamento (chargebacks) abusivas ou sem fundamento;",
          "ordem judicial ou de autoridade competente;",
          "risco de dano ao serviço, a outros usuários ou a terceiros.",
        ),
        p(
          "Sempre que possível e permitido, avisaremos antes, com o motivo, e daremos prazo para você se explicar ou corrigir o problema. Em casos graves ou urgentes, a medida pode ser imediata, com aviso logo depois. A devolução de valores, quando houver, segue a Política de Reembolso e a lei.",
        ),
        p(
          "Você pode excluir sua conta a qualquer momento em “Minha conta”, no painel. A exclusão é definitiva: os eventos deixam de existir, a portaria e os ingressos digitais param de funcionar, e os dados são apagados ou anonimizados conforme a Política de Privacidade. Por isso, não exclua a conta antes de eventos que ainda vão acontecer. Antes de excluir, baixe a cópia dos seus dados e os arquivos de que precisar e, se quiser pedir um reembolso, faça o pedido antes.",
        ),
        p(
          "Se decidirmos encerrar o Ingresso Impresso, avisaremos com pelo menos 30 dias de antecedência, para você baixar seus dados e arquivos, e reembolsaremos os lotes pagos de eventos que ainda não tiverem acontecido.",
        ),
      ],
    },
    {
      id: "mudancas",
      title: "15. Mudanças nestes Termos",
      blocks: [
        p(
          "Podemos atualizar estes Termos para acompanhar mudanças no serviço ou na lei. A nova versão é publicada nesta página com a data de atualização. Mudanças relevantes são anunciadas com antecedência razoável em “Novidades”, no painel, e, quando necessário, por e-mail.",
        ),
        p(
          "Podemos pedir que você aceite a nova versão ao entrar. Se você continuar usando o serviço depois do aviso, a nova versão passa a valer para você, nos limites permitidos por lei. Se não concordar, você pode parar de usar o serviço e excluir sua conta. As mudanças não alteram o preço de lotes já criados.",
        ),
      ],
    },
    {
      id: "lei-e-foro",
      title: "16. Lei aplicável e foro",
      blocks: [
        p("Estes Termos são regidos pelas leis do Brasil."),
        p(
          "Se você é consumidor, pode propor ação no foro do seu domicílio (art. 101, I, do Código de Defesa do Consumidor). Nos demais casos, fica eleito o foro da comarca do domicílio do fornecedor.",
        ),
        p(
          "Antes de recorrer à Justiça, procure-nos pelo e-mail de contato: a maioria dos problemas se resolve assim. Isso não impede que você procure o Procon ou outros órgãos de defesa do consumidor.",
        ),
        p("Se alguma cláusula destes Termos for considerada inválida, as demais continuam valendo."),
      ],
    },
    {
      id: "contato",
      title: "17. Contato",
      blocks: [
        p(
          `Dúvidas, pedidos e reclamações: ${LEGAL_ENTITY.email}. Endereço: ${ADDRESS}. Respondemos em até 5 dias.`,
        ),
      ],
    },
  ],
};

const PRIVACY: LegalDocument = {
  slug: "privacidade",
  title: "Política de Privacidade",
  description:
    "Como o Ingresso Impresso trata dados pessoais de organizadores, vendedores e participantes, com quem os compartilha e como exercer seus direitos pela LGPD.",
  updatedAt: "2026-10-09",
  summary: [
    "Tratamos o mínimo necessário: o e-mail de quem entra, o nome da organização, os dados dos eventos e a situação dos pagamentos. Não vendemos dados e não usamos cookies de publicidade.",
    "Os dados de vendedores, portadores de ingresso digital e leituras da portaria são cadastrados pelo organizador. Para esses dados, o organizador é o controlador e nós atuamos como operador.",
    "Usamos fornecedores de hospedagem, banco de dados, e-mail, pagamento e login, a maioria nos Estados Unidos, com garantias contratuais de proteção.",
    "Em “Minha conta” você baixa uma cópia dos seus dados e exclui sua conta. Outros pedidos podem ser feitos por e-mail e são respondidos em até 15 dias.",
    "Registros de pagamento são guardados por 5 anos por obrigação legal, mesmo depois da exclusão da conta.",
  ],
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem somos",
      blocks: [
        p(
          "Esta Política de Privacidade explica como o Ingresso Impresso trata dados pessoais, nos termos da Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018, “LGPD”). Ela vale para o site, o painel, a portaria e as páginas de ingresso digital. O serviço é oferecido por:",
        ),
        PROVIDER,
        p(
          `O encarregado pelo tratamento de dados pessoais (art. 41 da LGPD) é ${LEGAL_ENTITY.name}, que atende pelo e-mail ${LEGAL_ENTITY.email}.`,
        ),
        p(
          "Esta Política complementa os Termos de Uso. Os termos “organizador”, “participante”, “vendedor”, “lote” e “portaria” têm o significado explicado nos Termos de Uso.",
        ),
      ],
    },
    {
      id: "controlador-e-operador",
      title: "2. Controlador e operador",
      blocks: [
        p(
          "A LGPD distingue quem toma as decisões sobre o tratamento de dados (controlador) de quem trata dados em nome de outra pessoa (operador), conforme o art. 5º, VI e VII.",
        ),
        ul(
          "Somos controlador dos dados das contas de organizadores, dos pagamentos, dos registros de segurança e das métricas do site.",
          "Somos operador dos dados que o organizador cadastra sobre outras pessoas: vendedores, portadores de ingresso digital, celulares da portaria e leituras feitas na entrada. Nesses casos, o organizador é o controlador, e nós tratamos os dados apenas para prestar o serviço, conforme as instruções dele e esta Política (art. 39 da LGPD).",
        ),
        p(
          "O organizador deve ter uma base legal para cadastrar esses dados e informar as pessoas envolvidas sobre o tratamento. Se você é vendedor, participante ou trabalhou na portaria de um evento, dirija seus pedidos primeiro ao organizador. Se nos procurar, encaminharemos o pedido a ele e ajudaremos no que nos couber.",
        ),
      ],
    },
    {
      id: "dados-da-conta",
      title: "3. Dados da sua conta",
      blocks: [
        p("Quando você cria e usa uma conta de organizador, tratamos:"),
        ul(
          "o e-mail, usado para entrar e para comunicações sobre o serviço;",
          "o nome, o identificador da conta Google e a informação de que o e-mail foi verificado pelo Google, se você usar “Entrar com Google”;",
          "o nome da organização;",
          "a data e a versão dos Termos de Uso e da Política de Privacidade que você aceitou;",
          "os códigos de acesso enviados por e-mail, guardados apenas como hash (um resumo criptográfico que não permite recuperar o código), com a contagem de tentativas;",
          "as sessões abertas, guardadas apenas como hash do token de sessão;",
          "um hash do endereço IP usado para pedir códigos de acesso, mantido por até 24 horas para impedir abusos;",
          "o registro de auditoria das ações feitas pelo fornecedor na sua conta, e as mensagens de suporte trocadas com você.",
        ),
        p(
          "Não pedimos senha, CPF, endereço ou telefone do organizador. Ao pagar, a Stripe pode pedir outros dados diretamente a você, conforme as regras de privacidade da própria Stripe.",
        ),
        p(
          "Para dar suporte, o fornecedor pode ver os dados da sua conta e dos seus eventos pelo painel de administração, e esses acessos ficam registrados. Também usamos números agregados de contas, eventos, lotes e pagamentos para acompanhar o funcionamento e o uso do serviço.",
        ),
      ],
    },
    {
      id: "eventos-e-pagamentos",
      title: "4. Dados dos eventos e pagamentos",
      blocks: [
        p(
          "Para prestar o serviço, guardamos o que você cadastra nos eventos: nome, local, datas e horários, preços, artes enviadas, modelos e textos do ingresso, lotes, faixas de números e cancelamentos. As artes podem conter imagens de pessoas; envie apenas o que você tem direito de usar.",
        ),
        p(
          "Dos pagamentos, recebemos da Stripe apenas a situação do pagamento, o valor, os identificadores da Stripe e as datas. Os dados do cartão e da conta bancária de quem paga são tratados pela Stripe e nunca chegam até nós.",
        ),
        p(
          "Seu e-mail e os dados dos pagamentos não aparecem nos ingressos. O que é impresso no ingresso são os dados do evento e os textos que você escolhe.",
        ),
      ],
    },
    {
      id: "dados-de-terceiros",
      title: "5. Dados de outras pessoas cadastrados pelo organizador",
      blocks: [
        p("Nestes casos, atuamos como operador do organizador:"),
        ul(
          "vendedores: nome e, se o organizador informar, telefone, além das faixas de números e do acerto de cada um;",
          "portadores de ingresso digital: nome, quando o organizador o digita, o que é opcional;",
          "celulares da portaria: o nome dado a cada celular e os registros de conexão e sincronização;",
          "leituras da portaria: número do ingresso lido, data e hora da leitura e celular que a fez.",
        ),
        p(
          "Não usamos esses dados para finalidades próprias, como publicidade, e não entramos em contato com essas pessoas, salvo para cumprir a lei ou atender um pedido delas.",
        ),
      ],
    },
    {
      id: "ingresso-digital-e-portaria",
      title: "6. Ingresso digital e portaria",
      blocks: [
        p(
          "Quem abre o link de um ingresso digital vê uma página que carrega o ingresso da nossa API e guarda uma cópia no próprio navegador (localStorage), para que ele funcione mesmo sem internet na entrada do evento. Registramos quando o link foi aberto pela primeira e pela última vez e quantas vezes foi aberto, para que o organizador saiba que o ingresso chegou. A cópia fica apenas naquele navegador e pode ser apagada limpando os dados do site.",
        ),
        p(
          "Na portaria, cada celular guarda as leituras no próprio navegador (IndexedDB) antes de mostrar o resultado e as envia ao servidor quando tem internet. Esses dados ficam no celular e podem ser apagados limpando os dados do site no navegador.",
        ),
        p(
          "A portaria usa a câmera do celular apenas para ler os QR. As imagens são processadas no próprio aparelho e não são gravadas nem enviadas ao servidor. A portaria não usa a localização do celular.",
        ),
        p(
          "A portaria decide automaticamente se um ingresso pode entrar, com base apenas no número e na assinatura do QR: libera a primeira leitura e bloqueia cópias, números cancelados e ingressos falsos. Essa decisão não usa nenhum perfil da pessoa. Quem tiver a entrada recusada pode pedir ao organizador que revise o caso (art. 20 da LGPD).",
        ),
      ],
    },
    {
      id: "navegacao-e-cookies",
      title: "7. Navegação, cookies e métricas",
      blocks: [
        p(
          "Como em qualquer site, os servidores registram dados técnicos de cada acesso, como endereço IP, navegador (user agent) e página pedida. Esses registros são mantidos pelos provedores de hospedagem por períodos curtos, para segurança e diagnóstico de falhas.",
        ),
        p(
          "Não usamos cookies de publicidade nem acompanhamos você em outros sites. No navegador, usamos:",
        ),
        ul(
          "localStorage: o token da sua sessão, sua preferência de tema (claro, escuro ou do sistema), a marcação de quais “Novidades” você já viu e as cópias de ingressos digitais abertos;",
          "IndexedDB: as leituras e os dados da portaria nos celulares da entrada;",
          "o cache do navegador: os arquivos do site e da portaria, para carregar mais rápido e funcionar sem internet.",
        ),
        p(
          "Para medir o uso do site, usamos o Vercel Web Analytics, que conta visitas às páginas de forma agregada, sem cookies e sem montar um perfil seu. A portaria não carrega essas métricas.",
        ),
        p(
          "As páginas de login do Google e de pagamento da Stripe são de terceiros e podem usar cookies próprios, conforme as políticas de privacidade dessas empresas.",
        ),
        p(
          "Você pode apagar esses dados nas configurações do navegador. Se apagar o token de sessão, precisará entrar de novo. Se apagar os dados da portaria antes da sincronização, as leituras ainda não enviadas serão perdidas.",
        ),
      ],
    },
    {
      id: "finalidades-e-bases-legais",
      title: "8. Para que usamos os dados e com qual base legal",
      blocks: [
        p("Tratamos dados pessoais com base no art. 7º da LGPD:"),
        ul(
          "execução do contrato (art. 7º, V): criar e manter sua conta, permitir o acesso, gerar arquivos e ingressos digitais, operar a portaria, processar pagamentos e reembolsos e responder pedidos de suporte;",
          "cumprimento de obrigação legal ou regulatória (art. 7º, II): guardar os registros de pagamentos e reembolsos exigidos pela legislação fiscal e atender ordens de autoridades;",
          "exercício regular de direitos (art. 7º, VI): guardar os registros necessários para nossa defesa em processos judiciais, administrativos ou arbitrais;",
          "legítimo interesse (art. 7º, IX): proteger o serviço contra fraude e abuso, como o limite de pedidos de código por IP, manter a segurança, registrar as ações de suporte em log de auditoria, medir o uso do site de forma agregada para melhorá-lo e avisar sobre novidades do serviço;",
          "consentimento (art. 7º, I): quando alguma função depender dele, pediremos de forma destacada, e você poderá revogá-lo a qualquer momento.",
        ),
        p(
          "No legítimo interesse, usamos apenas os dados necessários, e você pode se opor ao tratamento pelos canais desta Política. Para os dados que tratamos como operador, a base legal é definida pelo organizador, que é o controlador.",
        ),
        p(
          "Não vendemos dados pessoais e não os usamos para publicidade. Hoje só enviamos e-mails necessários ao serviço, como os códigos de acesso e avisos importantes.",
        ),
      ],
    },
    {
      id: "compartilhamento",
      title: "9. Com quem compartilhamos",
      blocks: [
        p(
          "Compartilhamos dados apenas com os fornecedores que tornam o serviço possível, na medida do necessário para cada função:",
        ),
        ul(
          "Vercel (Estados Unidos): hospedagem do site e do painel e métricas de acesso agregadas;",
          "Render (Estados Unidos, Virgínia): hospedagem da API;",
          "Neon (Estados Unidos, AWS us-east-1): banco de dados PostgreSQL;",
          "Resend: envio dos e-mails do serviço, como os códigos de acesso;",
          "Stripe: processamento dos pagamentos por Pix e cartão;",
          "Google: login com a conta Google, quando você escolhe essa opção, e análise automática das artes enviadas (Google Cloud Vision), para impedir conteúdo ilegal;",
          "GitHub: guarda das cópias de segurança diárias do banco de dados, cifradas antes do envio, por 30 dias.",
        ),
        p(
          "Esses fornecedores tratam os dados conforme seus contratos e políticas, com obrigações de segurança e confidencialidade. A Stripe e o Google também são controladores dos dados que coletam diretamente de você nas páginas deles.",
        ),
        p(
          "Também podemos compartilhar dados com o organizador do evento, no caso dos dados que tratamos em nome dele; com autoridades, quando houver obrigação legal ou ordem judicial; e para defender nossos direitos em processos. Se o serviço for transferido a outra pessoa ou empresa, os dados poderão ser transferidos junto, mantidas as garantias desta Política e com aviso prévio a você.",
        ),
      ],
    },
    {
      id: "transferencia-internacional",
      title: "10. Transferência internacional",
      blocks: [
        p(
          "Os fornecedores listados guardam e processam dados fora do Brasil, principalmente nos Estados Unidos. Resend, Stripe, Google e GitHub também podem tratar dados em outros países.",
        ),
        p(
          "Essas transferências se apoiam nas garantias contratuais de proteção de dados oferecidas pelos fornecedores (art. 33, II, da LGPD) e, quando aplicável, na necessidade da transferência para executar o contrato com você (art. 33, IX, da LGPD). Os dados são protegidos com as medidas de segurança descritas nesta Política.",
        ),
      ],
    },
    {
      id: "retencao",
      title: "11. Por quanto tempo guardamos",
      blocks: [
        p("Guardamos os dados apenas pelo tempo necessário às finalidades desta Política:"),
        ul(
          "dados da conta e dos eventos: enquanto a conta existir;",
          "arquivos gerados para impressão: são um cache, apagado em até 24 horas, e cada link de download vale 10 minutos;",
          "links de acesso à portaria: expiram 12 horas depois do evento;",
          "códigos de acesso: deixam de valer em 10 minutos;",
          "sessões: expiram depois de 30 dias sem uso ou quando você sai;",
          "hash do IP usado para pedir códigos de acesso: até 24 horas;",
          "registro dos e-mails enviados (destinatário, assunto sem o código e situação da entrega), para suporte e prevenção de abuso: 30 dias;",
          "avisos do painel para a sua conta: 180 dias;",
          "cópias de segurança cifradas do banco de dados: 30 dias;",
          "registros de pagamentos e reembolsos: 5 anos, para cumprir obrigações fiscais e legais, mesmo depois da exclusão da conta;",
          "registros técnicos dos provedores de hospedagem: períodos curtos, definidos por eles.",
        ),
        p(
          "Quando você exclui sua conta, apagamos ou anonimizamos seus dados pessoais e os dados dos seus eventos, inclusive os que tratamos como operador, exceto o que a lei nos obriga a guardar (art. 16 da LGPD). Dados apagados podem continuar nas cópias de segurança até que elas expirem, em no máximo 30 dias.",
        ),
      ],
    },
    {
      id: "seguranca",
      title: "12. Segurança",
      blocks: [
        p(
          "Adotamos medidas técnicas e administrativas para proteger os dados (art. 46 da LGPD), entre elas:",
        ),
        ul(
          "conexões cifradas (HTTPS/TLS) entre o navegador, a API e o banco de dados;",
          "códigos de acesso e tokens de sessão guardados apenas como hash, sem senhas que possam vazar;",
          "chaves de assinatura dos ingressos cifradas com XChaCha20-Poly1305, sob uma chave mestra guardada fora do banco de dados;",
          "códigos dos links da portaria e dos ingressos digitais no fragmento da URL (a parte depois do #), que o navegador não envia ao abrir a página;",
          "acesso administrativo restrito ao fornecedor, com registro das ações em log de auditoria;",
          "cópias de segurança cifradas antes de serem guardadas.",
        ),
        p(
          "Nenhum sistema é totalmente seguro. Se ocorrer um incidente de segurança que possa causar risco ou dano relevante aos titulares, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas, conforme o art. 48 da LGPD. Se o incidente envolver dados que tratamos como operador, avisaremos o organizador para que ele possa cumprir as obrigações dele.",
        ),
        p(
          "Você também ajuda a proteger os dados: mantenha seu e-mail seguro, saia da conta em aparelhos de outras pessoas e guarde com cuidado os links da portaria e dos ingressos digitais.",
        ),
      ],
    },
    {
      id: "seus-direitos",
      title: "13. Seus direitos",
      blocks: [
        p("Pelo art. 18 da LGPD, você pode pedir, a qualquer momento:"),
        ul(
          "confirmação de que tratamos seus dados;",
          "acesso aos dados;",
          "correção de dados incompletos, inexatos ou desatualizados;",
          "anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;",
          "portabilidade dos dados a outro fornecedor;",
          "eliminação dos dados tratados com base no consentimento;",
          "informação sobre com quem compartilhamos seus dados;",
          "informação sobre a possibilidade de não dar consentimento e as consequências da recusa;",
          "revogação do consentimento;",
          "oposição a tratamento feito sem consentimento, em caso de descumprimento da LGPD.",
        ),
        p(
          `No painel, em “Minha conta”, você pode corrigir o nome da organização, baixar uma cópia dos seus dados em formato JSON e excluir sua conta. Os demais pedidos podem ser feitos pelo e-mail ${LEGAL_ENTITY.email}.`,
        ),
        p(
          "Respondemos em até 15 dias (art. 19, II, da LGPD). Podemos pedir informações para confirmar sua identidade antes de atender, para que outra pessoa não tenha acesso aos seus dados. Alguns pedidos podem ser limitados por obrigação legal, como a guarda de registros de pagamento; nesse caso, explicaremos o motivo.",
        ),
        p(
          "Se não ficar satisfeito com a nossa resposta, você pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), pelo site gov.br/anpd.",
        ),
      ],
    },
    {
      id: "criancas-e-adolescentes",
      title: "14. Crianças e adolescentes",
      blocks: [
        p(
          "O serviço não é dirigido a crianças e adolescentes. Para criar uma conta é preciso ter 18 anos ou mais, ou ser representado ou assistido pelos pais ou responsáveis legais. Se soubermos que uma conta foi criada em desacordo com essa regra, poderemos encerrá-la e apagar os dados.",
        ),
        p(
          "Organizadores de eventos com participantes menores de idade, como festas escolares, devem cadastrar apenas os dados necessários e observar o art. 14 da LGPD, que exige que o tratamento seja feito no melhor interesse da criança e do adolescente.",
        ),
      ],
    },
    {
      id: "mudancas",
      title: "15. Mudanças nesta Política",
      blocks: [
        p(
          "Podemos atualizar esta Política para acompanhar mudanças no serviço, nos fornecedores ou na lei. A nova versão é publicada nesta página com a data de atualização. Mudanças relevantes são anunciadas em “Novidades”, no painel, e, quando necessário, por e-mail. Se uma mudança depender do seu consentimento, pediremos de novo.",
        ),
        p(
          "Se você continuar usando o serviço depois do aviso, a nova versão passa a valer, nos limites permitidos por lei.",
        ),
      ],
    },
    {
      id: "contato",
      title: "16. Contato",
      blocks: [
        p(
          `Pedidos sobre seus dados e dúvidas sobre esta Política: ${LEGAL_ENTITY.email}, aos cuidados do encarregado, ${LEGAL_ENTITY.name}. Endereço: ${ADDRESS}.`,
        ),
      ],
    },
  ],
};

const REFUND: LegalDocument = {
  slug: "reembolso",
  title: "Política de Reembolso",
  description:
    "Quando e como pedir o reembolso de um lote pago no Ingresso Impresso, os prazos e o que acontece com os números de ingresso reembolsados.",
  updatedAt: "2026-10-09",
  summary: [
    "Um lote ainda não pago pode ser cancelado no painel a qualquer momento, sem custo.",
    "Até 7 dias depois do pagamento, você pode desistir da compra e receber o valor integral de volta (direito de arrependimento).",
    "Depois disso, reembolsamos total ou parcialmente quando o serviço falha e não conseguimos resolver em prazo razoável.",
    "Os números de um lote reembolsado ficam bloqueados para sempre na portaria, mesmo que os ingressos já tenham sido impressos.",
    "Ingressos grátis e de cortesia não são reembolsáveis nem convertidos em dinheiro.",
  ],
  sections: [
    {
      id: "quem-somos",
      title: "1. Quem somos e a quem se aplica",
      blocks: [
        p("O Ingresso Impresso é oferecido por:"),
        PROVIDER,
        p(
          "Esta Política de Reembolso faz parte dos Termos de Uso e vale para os lotes de números de ingresso comprados pelo organizador no Ingresso Impresso.",
        ),
        p(
          "Ela não trata da devolução do dinheiro de quem comprou ingresso para um evento. Essa devolução é feita pelo organizador do evento, que vendeu o ingresso e recebeu o pagamento.",
        ),
      ],
    },
    {
      id: "lotes-nao-pagos",
      title: "2. Lotes não pagos",
      blocks: [
        p(
          "Um lote que ainda não foi pago pode ser cancelado pelo painel a qualquer momento, sem custo. Nada é cobrado e os números não chegam a ser liberados. Os ingressos grátis usados no lote voltam para a sua organização.",
        ),
        p(
          "Se você gerou um Pix e desistiu de pagar, o lote fica aguardando até esse Pix expirar e depois pode ser cancelado.",
        ),
      ],
    },
    {
      id: "direito-de-arrependimento",
      title: "3. Direito de arrependimento",
      blocks: [
        p(
          "Você pode desistir da compra de um lote em até 7 dias corridos, contados do pagamento, sem precisar dar motivo, conforme o art. 49 do Código de Defesa do Consumidor e o art. 5º do Decreto 7.962/2013.",
        ),
        p(
          "O reembolso é do valor integral pago pelo lote, sem desconto de taxas, e é feito pelo mesmo meio de pagamento, por meio da Stripe. Confirmamos o recebimento do pedido assim que o recebemos e solicitamos o estorno à Stripe sem demora.",
        ),
        p(
          "Vale a data em que o pedido é enviado: um pedido enviado dentro dos 7 dias é atendido mesmo que a nossa resposta chegue depois.",
        ),
      ],
    },
    {
      id: "falha-no-servico",
      title: "4. Falha no serviço",
      blocks: [
        p(
          "Depois dos 7 dias, reembolsamos o valor total ou parcial de um lote quando o serviço apresentar falha que impeça ou prejudique o seu uso, conforme os arts. 18 a 20 do Código de Defesa do Consumidor. Por exemplo:",
        ),
        ul(
          "os arquivos do lote não puderam ser gerados por erro da plataforma, e o suporte não conseguiu resolver em prazo razoável;",
          "os ingressos foram gerados com defeito causado pelo nosso sistema, como um QR que a portaria não consegue ler.",
        ),
        p(
          "Nesses casos, primeiro tentamos corrigir o problema. Se não for possível em prazo razoável, você pode escolher entre refazer o serviço sem custo, receber de volta o valor pago ou um abatimento proporcional do preço (art. 20 do Código de Defesa do Consumidor), sem prejuízo de outros direitos previstos em lei.",
        ),
        p(
          "Depois do prazo de arrependimento, não há reembolso por erros de digitação do organizador, por arte enviada com problema, pela qualidade da impressão ou pelo cancelamento ou adiamento do evento, porque esses fatos não decorrem de falha do serviço. Nesses casos, você pode cancelar faixas pelo painel e comprar um novo lote.",
        ),
      ],
    },
    {
      id: "numeros-reembolsados",
      title: "5. O que acontece com os números reembolsados",
      blocks: [
        p(
          "Quando um lote é reembolsado por inteiro, ele passa a constar como reembolsado no painel, e todos os números dele ficam bloqueados na portaria em definitivo. Isso vale também para ingressos que já foram impressos, enviados pelo WhatsApp ou entregues como ingresso digital: eles não liberam a entrada.",
        ),
        p(
          "Esses números não podem ser reaproveitados, nem com um novo pagamento, porque os ingressos já impressos voltariam a valer. Se precisar de ingressos de novo, compre um novo lote, que terá outros números.",
        ),
        p(
          "Em um reembolso parcial, informaremos por e-mail, antes de fazê-lo, se algum número será bloqueado.",
        ),
        p(
          "Antes de pedir o reembolso, confira se nenhum ingresso do lote foi vendido ou entregue. Se foi, quem tem esses ingressos não conseguirá entrar, e resolver a situação com essas pessoas é responsabilidade do organizador.",
        ),
        p(
          "Os celulares da portaria recebem o bloqueio quando se conectam à internet. Por isso, abra a portaria em cada celular com internet antes do evento.",
        ),
      ],
    },
    {
      id: "como-pedir",
      title: "6. Como pedir",
      blocks: [
        p(`Envie um e-mail para ${LEGAL_ENTITY.email} com:`),
        ul(
          "o e-mail da conta usada no Ingresso Impresso;",
          "o nome do evento;",
          "o lote, identificado pela faixa de números ou pela data do pagamento;",
          "o motivo, apenas quando o pedido for por falha no serviço.",
        ),
        p(
          "Por segurança, atendemos pedidos enviados pelo e-mail da conta ou, se vierem de outro endereço, depois de confirmar que a pessoa é a titular da conta.",
        ),
      ],
    },
    {
      id: "prazos",
      title: "7. Prazos e forma de devolução",
      blocks: [
        ul(
          "Resposta ao pedido: em até 5 dias.",
          "Pix: o valor volta para a mesma conta que fez o pagamento.",
          "Cartão de crédito: o estorno pode levar até 2 faturas para aparecer, conforme o banco emissor do cartão.",
        ),
        p(
          "O prazo de devolução, depois que solicitamos o estorno, depende da Stripe e do banco. Se o valor não aparecer nos prazos acima, escreva para o e-mail de contato e enviaremos o comprovante do estorno.",
        ),
      ],
    },
    {
      id: "ingressos-gratis",
      title: "8. Ingressos grátis e cortesias",
      blocks: [
        p(
          "Os 30 ingressos grátis de cada organização e os ingressos de cortesia concedidos pelo fornecedor não têm valor em dinheiro. Eles não são reembolsáveis e não podem ser convertidos em dinheiro ou em desconto.",
        ),
        p(
          "Em um lote pago em parte com ingressos grátis, o reembolso corresponde apenas ao valor efetivamente pago.",
        ),
        p(
          "O crédito da conta e os cupons promocionais também não têm valor em dinheiro: servem só para pagar lotes, não podem ser sacados e têm as condições informadas em cada cupom. Quando um lote pago em parte com crédito é cancelado ou estornado, essa parte volta como crédito; o valor pago em dinheiro segue as regras desta Política.",
        ),
      ],
    },
    {
      id: "contestacao",
      title: "9. Contestação de pagamento",
      blocks: [
        p(
          "Se você não reconhece uma cobrança ou tem um problema com um pagamento, fale conosco antes de abrir uma contestação (chargeback) no banco ou na operadora do cartão: normalmente resolvemos mais rápido assim. Esse contato é uma recomendação e não impede a contestação.",
        ),
        p(
          "Se a contestação for aceita, o lote pode ser tratado como reembolsado, com os números bloqueados na portaria. Contestações abusivas ou fraudulentas podem levar à suspensão da conta, como previsto nos Termos de Uso.",
        ),
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Readonly<Record<LegalSlug, LegalDocument>> = {
  termos: TERMS,
  privacidade: PRIVACY,
  reembolso: REFUND,
};
