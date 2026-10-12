# 0067. Modo ensaio da portaria

- **Status:** Aceito
- **Data:** 2026-10-12
- **Complementa:** [0006](0006-portaria-offline-sync.md) e [0018](0018-portaria-pwa.md).

## Contexto

A lista de prontidão (ADR 0018) pede uma "leitura de teste", mas na portaria de verdade toda
leitura vira registro: ler um ingresso real para testar a câmera gasta a entrada dele, e ler um
QR qualquer suja o relatório com "inválido". Voluntários chegam em cima da hora, com fila, e
descobrem só ali que o som está mudo, que a lanterna não liga pelo navegador ou que a câmera não
foca em papel. O organizador não sabe quais celulares foram testados.

## Opções consideradas

1. **Só a leitura de teste da lista de prontidão.** Não muda nada, mas o teste continua sujando o
   relatório e não cobre som e lanterna.
2. **Evento de ensaio separado no painel.** Exige outro evento, outros links e outras chaves:
   ninguém faz.
3. **Modo ensaio no próprio app.** O mesmo celular, a mesma câmera e o mesmo `DoorCore`, com
   `evaluate` (sem `checkIn`) e nada gravado nem enviado.

## Decisão

Opção 3.

- **Entrada:** botão **Ensaiar** na lista de prontidão e no menu ⋮ do app. Uma faixa amarela fixa
  "ENSAIO · nada é registrado" fica no topo enquanto durar.
- **Leitura:** `DoorCore.evaluate` mostra o que aconteceria (verde, vermelho, amarelo, inclusive
  porta errada e bilheteria), com o selo "Ensaio: nada foi registrado". Nenhuma linha em `scans`,
  no IndexedDB ou no servidor.
- **Amostra:** o QR das prévias e da folha de ensaio é sempre o mesmo texto,
  `ticket_render::sample_qr_text()` (byte de versão 0, por isso nunca é um ingresso v1 válido).
  O app reconhece esse texto exato (`SAMPLE_QR_TEXT` em `portaria/logic.ts`) e mostra "Amostra
  lida: a câmera está boa". Um teste em Rust confere que os dois lados têm o mesmo texto. O
  formato v1 e os vetores não mudam.
- **Outros QR:** "Não é um ingresso", sem número.
- **Som, vibração e lanterna:** botões no painel do ensaio tocam os três avisos e ligam a
  lanterna; sem suporte à lanterna, o app diz isso.
- **Fim:** "Terminar ensaio" (só depois de uma leitura) grava a marca no IndexedDB e chama
  `POST /api/door/rehearsal` (autenticado pelo segredo do celular), que preenche
  `door_devices.rehearsed_at`. Sem sinal, a marca vai no próximo sync.
- **Painel:** cada celular mostra "ensaiado em …" ou "sem ensaio"; a aba Portaria ganha a
  **Folha de ensaio**, `GET /api/events/{id}/door/rehearsal-sheet`: um PDF A4 (Typst, o mesmo da
  impressão em casa) com três ingressos de amostra do desenho atual, marca d'água e o QR de
  amostra. Arte que não pode ser impressa (ADR 0042) fica de fora em vez de recusar a folha.

## Consequências

- O ensaio não toca no relatório nem nas entradas; o organizador vê quem ensaiou.
- Reconhecer a amostra pelo texto exato prende o app ao texto atual de `sample_qr_text`: mudá-lo
  exige mudar os dois lados (o teste avisa).
- A folha usa a mesma trava de renderização das prévias e um limite de 6 por minuto por pessoa.
