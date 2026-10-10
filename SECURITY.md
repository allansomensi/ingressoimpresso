# Política de Segurança

O Ingresso Impresso protege duas coisas que não podem falhar: **a assinatura dos ingressos** (um
QR falso ou copiado não pode entrar) e **os dados de quem organiza e de quem compra**. Se você
encontrou uma falha, obrigado por nos avisar antes de qualquer pessoa.

## Como relatar

**Não abra uma issue, discussão ou pull request público.** Use um destes canais privados:

1. **GitHub:** aba [Security → Report a vulnerability](https://github.com/allansomensi/ingressoimpresso/security/advisories/new)
   (relato privado de vulnerabilidade);
2. **E-mail:** **contato@ingressoimpresso.com.br**, com "Segurança" no assunto.

Inclua, se puder:

- o que a falha permite fazer e qual o impacto;
- os passos para reproduzir (requisições, trechos de código ou uma prova de conceito);
- a parte afetada (API, painel, portaria, ingresso digital, formato do QR, código deste
  repositório) e o commit ou a data do teste;
- como você quer ser creditado, se quiser.

Pode escrever em português ou em inglês.

## O que acontece depois

| Etapa | Prazo |
|---|---|
| Confirmação de recebimento | até 5 dias |
| Avaliação inicial e severidade | até 10 dias |
| Correção de falha crítica (ex.: forjar um QR válido, ler dados de outra organização) | o quanto antes, com meta de 7 dias |
| Correção das demais | conforme a severidade, com meta de 90 dias |

Mantemos você informado até a correção. Quando ela estiver em produção, publicamos um aviso de
segurança no GitHub e, se o problema afetou clientes, uma nota em
[Novidades](https://ingressoimpresso.com.br/novidades). Com a sua permissão, damos o crédito a
você. Pedimos que a divulgação pública espere a correção (ou 90 dias, o que vier primeiro, salvo
combinação diferente).

Não temos programa de recompensa em dinheiro por enquanto.

## Versões cobertas

| O quê | Coberto |
|---|---|
| O serviço em [ingressoimpresso.com.br](https://ingressoimpresso.com.br) e `api.ingressoimpresso.com.br` | ✅ |
| O branch `main` deste repositório | ✅ |
| Branches de trabalho, commits antigos e forks | ❌ |

## O que mais nos interessa

- Forjar um ingresso que a portaria aceite, ou fazer uma cópia entrar duas vezes na mesma porta.
- Obter a chave privada de um evento, a chave mestra ou segredos da verificação em duas etapas.
- Fazer o servidor assinar números de um lote não pago ou cancelado.
- Ler ou alterar dados de outra organização, ou entrar na conta de outra pessoa (inclusive
  contornando o código por e-mail, o Google ou o segundo passo).
- Virar admin sem as duas condições (`ADMIN_EMAILS` e verificação em duas etapas).
- Executar script no painel (XSS, desvio da CSP) ou injetar código nos templates Typst.
- Obter o token de um link de portaria ou de um ingresso digital que não é seu.

O desenho da segurança está em [`docs/arquitetura.md`](docs/arquitetura.md) e nos
[ADRs](docs/adr/README.md) (principalmente 0003 a 0007, 0016, 0045, 0047 e 0048).

## Fora do escopo

- Negação de serviço, testes de carga ou varredura automática em volume.
- Engenharia social, phishing e ataques físicos.
- Falhas em serviços de terceiros (Stripe, Resend, Vercel, Render, Neon, Google, Cloudflare):
  relate a eles diretamente.
- Relatórios de ferramentas automáticas sem prova de impacto, cabeçalhos ausentes sem exploração,
  self-XSS e clickjacking em páginas sem ação sensível.
- Ataques que exigem um aparelho já comprometido ou um navegador sem suporte.

## Regras para testar

- **Como o código é aberto, prefira reproduzir no seu ambiente local** (veja o
  [README](README.md#rodando-localmente)).
- Em produção, use só contas e eventos **seus**. Não acesse, altere nem apague dados de outras
  pessoas; se acessar sem querer, pare, não guarde nada e nos avise.
- Não degrade o serviço e não use os dados de ninguém para outro fim.
- Não faça pagamentos com dados de terceiros nem abuse de estornos.

Não tomaremos medidas legais contra quem pesquisar de boa-fé e seguindo estas regras. Se tiver
dúvida se algo é permitido, pergunte antes pelo e-mail.
