# 0043. Página pública de status

- **Status:** Aceito
- **Data:** 2026-10-09

## Contexto

Quando algo falha, organizadores perguntam por WhatsApp se "caiu". Faltava um lugar público com o
estado de cada parte e os incidentes.

## Decisão

- `GET /api/status` (sem login, com cache de 15 s no servidor e 30 s no navegador) responde estas
  partes, cada uma como operando, instável, fora do ar ou em manutenção:
  - **site**;
  - **painel**: o banco responde, e lento acima de 800 ms;
  - **portaria**;
  - **arquivos**: o worker deu sinal na última hora e 15 minutos;
  - **e-mails**: cota e falhas recentes;
  - **pagamentos**: só aparece se configurados.
- Incidentes e manutenções programadas (`status_incidents` e `status_incident_updates`) são
  escritos pelos admins, com linha do tempo. Um incidente aberto piora as partes que cita.
- A página `/status` mostra o estado geral, os serviços, uma barra dos últimos 90 dias (pelos
  incidentes), as manutenções programadas e o histórico. Ela se atualiza a cada minuto e, se a API
  não responder, diz isso.
- Não há amostragem periódica do lado do servidor: manteria o Neon acordado o dia inteiro
  (ADR 0013). O histórico vem dos incidentes registrados.

## Consequências

- Uma queda curta que ninguém registrou não aparece no histórico.
