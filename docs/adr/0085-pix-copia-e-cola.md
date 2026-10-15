# 0085. Pix copia e cola do organizador

- **Status:** Aceito
- **Data:** 2026-10-15
- **Complementa:** [0050](0050-acerto-com-vendedores.md), [0053](0053-link-do-vendedor.md) e
  [0030](0030-ingresso-digital.md).

## Contexto

Quem vende ingresso na mão recebe quase tudo por Pix. Hoje o vendedor dita a chave, o comprador
digita o valor errado ou esquece de dizer de qual número é o pagamento, e no fim da noite o
organizador não sabe o que o extrato do banco deve a cada vendedor. O ADR 0014 avaliou o Pix
estático só para pagar os lotes da plataforma (depois resolvido pelo Stripe, ADR 0020), não para o
comprador pagar o organizador.

A plataforma promete "sem taxa sobre a venda": ela não pode intermediar esse dinheiro, nem ficar
com parte dele, nem virar instituição de pagamento.

## Opções consideradas

1. **Cobrança dinâmica por um PSP (Pix com `txid` e webhook).** Daria a confirmação automática,
   mas o dinheiro passaria por uma conta da plataforma ou exigiria que cada organizador
   integrasse o próprio PSP. Fere a promessa e afasta o público (escolas, igrejas, bandas).
2. **Só mostrar a chave Pix.** Simples, mas volta o problema do valor e do número errados.
3. **Pix estático com valor e identificador (BR Code), gerado no aparelho, e conferência
   manual.** O dinheiro vai direto para a chave do organizador ou do vendedor; o código já leva
   o valor do número e um identificador que o extrato mostra.

## Decisão

Opção 3.

- **Chaves:** a organização cadastra uma chave em Minha organização (`organization_profiles`:
  tipo, chave, nome de quem recebe e cidade, os quatro ou nenhum). Cada vendedor pode ter a sua
  (`sellers`, mesmas colunas), cadastrada no painel por quem cuida do dinheiro. O servidor
  confere e normaliza a chave (`pix.rs`): CPF e CNPJ com dígitos verificadores (o CNPJ
  alfanumérico de julho de 2026 incluído), e-mail, celular com `+55` e chave aleatória. Nome até
  25 e cidade até 15 caracteres, como o BR Code pede.
- **Quem recebe, por evento:** `events.pix_receiver` = `off` (padrão), `organization` (toda
  cobrança na chave da organização) ou `seller` (na chave do vendedor do número; quem não tem
  chave usa a da organização). Duplicar o evento leva a escolha e as chaves dos vendedores.
- **BR Code no aparelho:** `lib/pix.ts` monta o "copia e cola" do Manual de Padrões para
  Iniciação do Pix (campos EMV, CRC16-CCITT-FALSE), com o valor do número (preço da categoria,
  senão o do evento; cortesia não cobra) e o identificador `ING` + número + `E` + quatro
  caracteres do evento (`ING0042EA3F9`). Gerado no celular, funciona offline na página do
  vendedor e no ingresso digital, que já abrem sem internet. O teste reproduz byte a byte o
  exemplo do manual do Banco Central.
- **Onde aparece:** na página do vendedor, cada número vendido mostra o QR do Pix (o comprador
  lê da tela do vendedor), o botão de copiar e "Mandar o Pix pelo WhatsApp"; vender um número
  só abre direto nessa tela. No ingresso digital, o portador vê o valor, o código para copiar e
  o QR a um toque, ou "Pago" quando alguém confirmou.
- **Referência de pagamento por número:** `ticket_payments` (`event_id`, `ticket_number`) guarda
  que alguém viu o dinheiro chegar, quanto e quem recebeu (`organization` ou `seller`). A
  organização confere o extrato em **Conferir Pix** (aba Vendedores: busca pelo identificador,
  número ou nome, filtros "A receber"/"Recebidos") e marca em lote
  (`POST /api/events/{id}/pix/receipts`). O vendedor com chave própria marca "Recebi o Pix" no
  link (`POST /api/seller/pix`); ele nunca confirma o que caiu na chave da organização
  (`pix_not_yours`).
- **Acerto (ADR 0050):** o Pix que a organização recebeu por um número de um vendedor conta como
  dinheiro entregue por ele (`received_cents` inclui `pix_cents`), no relatório, no acerto do
  painel e no link do vendedor ("R$ 60,00 pagos por Pix direto à organização"). O Pix que caiu na
  chave do vendedor não muda nada: ele continua devendo esse dinheiro à organização, como em
  espécie.
- **Equipe (ADR 0055):** chaves dos vendedores, quem recebe e a conferência são da parte
  `money`; a chave da organização é só da organização.

## Consequências

- A plataforma não recebe, não repassa e não cobra nada sobre o Pix; não há PSP, webhook nem
  credencial de banco. A confirmação é manual, como no acerto em dinheiro.
- O comprador pode pagar errado (outro valor, sem identificador). O painel mostra o valor e o
  identificador de cada número para a conferência; nada é bloqueado por falta de pagamento: o
  ingresso continua valendo na portaria, que nunca espera a rede (invariante 6).
- Comprador de vários números paga um Pix por número. Um Pix só para vários números exigiria uma
  referência de grupo e fica para depois, se fizer falta.
- Formato do QR do ingresso, vetores e deduplicação não mudam. O app e as páginas salvas antes
  leem `pix` como ausente.
