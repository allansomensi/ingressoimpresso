# Ensaio geral (fase 5)

Roteiro do ensaio antes do primeiro show com ingressos de verdade. O critério da fase é este
roteiro feito com cerca de 50 ingressos impressos e duas portas.

## Preparação (uma semana antes)

1. **Deploy:** API no Render, banco no Neon e painel na Vercel, publicados a partir do `main`
   (`docs/deploy.md`). A chave mestra está no gerenciador de senhas.
2. **Backup:** rode o workflow **Backup** e faça o teste de restauração
   (`just backup-restore-test`, ver `docs/deploy.md`).
3. **Evento:** crie o evento com data e hora reais e o preço do ingresso.
4. **Ingresso:** envie a arte, posicione número e QR e confira a prévia.
5. **Lotes:** crie um lote de 50 e marque como pago.
6. **Vendedores:** cadastre dois vendedores e entregue faixas (por exemplo, 1–25 e 26–45). Deixe
   46–50 sem vendedor.
7. **Arquivos:** gere o A4 caseiro e imprima. Gere também a folha de controle de cada vendedor.
8. **Cancelamentos:** cancele dois números como devolvidos e um como perdido.

## Portaria (no dia do ensaio, com internet)

1. Na aba **Portaria**, crie um link e abra-o em dois celulares: um Android e um iPhone. Dê nomes
   diferentes ("Porta 1", "Porta 2").
2. Em cada celular, deixe a **lista de prontidão** toda verde: app salvo, dados do evento,
   câmera, armazenamento e uma leitura de teste.
3. No iPhone, adicione a página à tela de início (Compartilhar → Adicionar à Tela de Início).

## Leituras

| Teste | Esperado |
|---|---|
| Ingresso válido na Porta 1 | Verde, número e vendedor |
| O mesmo ingresso na Porta 2, com internet | Vermelho: "já entrou às HH:MM por Porta 1" |
| Fotocópia de um ingresso que ainda não entrou, nas duas portas | Verde na primeira, vermelho na segunda |
| Ingresso cancelado (devolvido ou perdido) | Vermelho com o motivo |
| QR de outro evento ou de uma prévia (AMOSTRA) | Amarelo (outro evento) ou vermelho (inválido) |
| QR qualquer (site, Pix) | Vermelho: inválido |
| Lanterna em ambiente escuro | Liga e lê |

## Sem internet

1. Ponha as duas portas em **modo avião**.
2. Feche o navegador e abra a portaria de novo: ela precisa abrir e mostrar "sem sinal".
3. Leia ingressos diferentes em cada porta: verde. O contador "leituras não sincronizadas" sobe.
4. Leia **o mesmo** ingresso nas duas portas: as duas aceitam. Esse é o limite conhecido
   (ADR 0006).
5. Tire o modo avião: as leituras sincronizam em alguns segundos, e a mesma leitura repetida
   passa a dar vermelho nas duas portas.

## Depois

1. No painel, aba **Relatório**: confira por vendedor os atribuídos, devolvidos, perdidos,
   entradas, a entrada duplicada offline do passo 4 e o valor a acertar.
2. Baixe o CSV do relatório.
3. Na aba **Portaria**, desconecte um celular e confirme que ele mostra "acesso encerrado".
4. Anote tudo o que confundiu as pessoas da porta: vira tarefa antes do show.
