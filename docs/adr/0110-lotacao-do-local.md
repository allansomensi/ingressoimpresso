# 0110. Lotação do local

- **Status:** Aceito
- **Data:** 2026-10-21
- **Complementa:** [0071](0071-portaria-ao-vivo.md) (Ao vivo) e [0083](0083-saida-e-volta.md) (saída e volta)

## Contexto

Casas de show, salões e quadras têm uma lotação máxima (alvará, bombeiros, conforto). Hoje a
portaria conta quantos entraram, mas ninguém na porta sabe quantos lugares faltam, e quem organiza
só percebe que lotou olhando o Ao vivo.

## Decisão

- `events.capacity` (1 a 1.000.000 pessoas, vazio: sem limite) e `capacity_warn_percent` (50 a 99,
  padrão 90), na seção Portaria (`PUT /api/events/{id}/capacity`, parte `door` da equipe). Fichas
  de consumo não têm lotação.
- **Quem está dentro**, igual no celular e no servidor: os ingressos que entraram (só os de hoje,
  num evento de vários dias) e, com saída e volta ligada, só os que estão dentro agora; mais as
  pessoas da lista de nomes que chegaram (hoje). Usos de pontos de controle e credenciais
  (ADR 0111) não contam.
- **Celulares da entrada:** o manifesto leva `capacity` e `capacityWarnPercent`; uma faixa abaixo
  do cabeçalho diz "Faltam 50 para lotar", fica amarela a partir do aviso e vermelha com "LOTADO".
  A conta é local (`doorOccupied`), offline, com o que o celular sabe. A portaria **não barra**
  ninguém: quem decide é a organização.
- **Ao vivo:** cartão "Lotação do local" com o contador e a barra, nas mesmas cores.
- **Aviso:** depois de cada envio de entradas, o servidor compara a ocupação com o limite e avisa a
  organização no sininho uma vez ao chegar perto (`capacity_near`) e uma vez ao lotar
  (`capacity_full`); `capacity_alerted` guarda o que já foi avisado e volta a zero quando o limite
  muda.

## Consequências

- Quem está na porta sabe quando parar e chamar a organização.
- Celulares sem sinal contam só o que viram até a última sincronização: o número pode ficar um
  pouco abaixo do real, e o aviso do sininho chega quando as entradas chegam ao servidor.
