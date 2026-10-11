# 0055. Equipe do evento: cada pessoa cuida da sua parte

- **Status:** Aceito
- **Data:** 2026-10-11

## Contexto

Um evento raramente é tocado por uma pessoa só. Na banda, um recebe o dinheiro dos vendedores,
outro entrega os ingressos (impressos ou digitais), outro faz a arte; na escola, a secretaria
cuida da portaria e a comissão de formatura das vendas. Até aqui o evento pertencia a uma
organização com um único dono (a organização pessoal criada no primeiro login), e quem ajudava
precisava usar a conta de quem organizava.

## Opções consideradas

1. **Equipe da organização** (convidar para a organização inteira): reaproveita `memberships`,
   mas cada pessoa passaria a ter duas organizações e precisaria de um seletor no painel; e quem
   ajuda num show veria todos os outros eventos e o financeiro da conta.
2. **Equipe por evento, todos com poder total:** simples, mas o colega que só faz a arte poderia
   apagar vendedores ou registrar dinheiro por engano.
3. **Equipe por evento, com as partes de cada um:** cada pessoa vê o evento inteiro e mexe só no
   que cuida.

## Decisão

Opção 3.

- **Quem está na equipe:** a organização continua dona do evento (`events.organization_id`); a
  tabela `event_team` liga um e-mail a um evento, com as partes (`areas`) que a pessoa cuida.
  Quem é da organização não entra na lista: já pode tudo.
- **Partes:** `manage` (Coordenação: tudo, inclusive chamar pessoas e comprar lotes), `money`
  (Recebimentos: o que os vendedores passam e devolvem), `delivery` (Ingressos e vendedores:
  vendedores, faixas, links, arquivos, ingressos digitais e cancelamentos), `art` (Arte do
  ingresso) e `door` (Portaria). Escolher Coordenação guarda só ela.
- **Sem aceite:** adicionar é convidar. Se o e-mail já tem conta, o evento aparece na hora (e
  chega uma notificação no sininho); se não tem, aparece no primeiro login, por código ou Google,
  que prova que o e-mail é da pessoa. Um e-mail avisa em todo caso, dentro da cota diária; sem
  cota, o painel oferece mandar o convite pelo WhatsApp. Com novas contas fechadas (ADR 0037),
  quem foi convidado entra assim mesmo; domínio bloqueado não pode ser convidado.
- **Permissões num lugar só:** `routes::event_access` já é a porta de toda rota de evento. Para
  quem é da equipe, `team::need` traduz método e caminho da requisição na parte exigida: leitura
  vale para todos; rota não mapeada é só da organização (uma rota nova nasce fechada para a
  equipe). Fora da sua parte, a API responde 403 `not_your_area`. Excluir, arquivar e duplicar o
  evento continuam só da organização. Lotes comprados pela Coordenação usam os ingressos grátis,
  o crédito e os cupons da organização dona do evento. Evento de organização suspensa é só
  leitura para a equipe também.
- **Painel:** o evento ganha a aba Equipe (responsabilidades de cada parte, adicionar, mudar partes, remover,
  sair); na lista de eventos, os da equipe mostram de quem são; nas outras abas, o que a pessoa não
  cuida aparece só para leitura, com um aviso de quem cuida.
- **Vendedor:** a página do vendedor (ADR 0053) mostra o nome de quem recebe o dinheiro (parte
  `money`, só quando a equipe deu um nome: o e-mail não aparece para os vendedores).
- **Duplicar** um evento leva a equipe junto. **Exportar a conta** inclui a equipe de cada evento
  e as equipes de que a pessoa participa; **excluir a conta** tira a pessoa de todas as equipes,
  inclusive convites ainda esperando aquele e-mail.

## Consequências

- Ninguém precisa compartilhar senha ou código de acesso; cada alteração fica com quem a fez.
- Uma pessoa pode estar em equipes de várias organizações sem trocar de conta.
- Toda rota nova de evento que altera algo precisa entrar em `team::need`, senão só a
  organização consegue usá-la (o teste `requests_map_to_areas` lista os casos).
- Limite de 30 pessoas por evento.
