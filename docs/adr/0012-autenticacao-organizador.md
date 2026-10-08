# 0012. Login do organizador por código via e-mail

- **Status:** Proposto
- **Data:** 2026-10-08

## Contexto

Organizadores são bandas, escolas e igrejas, pessoas pouco técnicas que usam muito o celular.
Queremos pouca superfície de segurança e poucos serviços externos.

## Opções consideradas

1. **E-mail + senha (argon2id).** Familiar, mas a recuperação exige e-mail de qualquer forma, e
   guardar senhas é responsabilidade a mais.
2. **Link mágico por e-mail.** Sem senha, mas no celular o link costuma abrir no navegador
   embutido do app de e-mail, e não onde a pessoa estava. É uma fonte conhecida de confusão.
3. **Código de 6 dígitos por e-mail.** Sem senha. A pessoa digita o código onde estiver, em
   qualquer navegador ou dispositivo.
4. **"Entrar com Google".** Prático para quem usa Gmail, mas exclui quem não usa, cria dependência
   de terceiro e burocracia de OAuth.
5. **Código por WhatsApp.** É o canal ideal no Brasil, mas a API oficial do WhatsApp Business é cara
   e burocrática para começar.

## Decisão

Opção 3.

- **Código:** 6 dígitos, válido por 10 min. No banco fica só o hash. Máximo de 5 tentativas por
  código e rate limit por e-mail e por IP.
- **Sessão:** guardada no servidor (`sessions`, com hash do token), em cookie `HttpOnly; Secure;
  SameSite=Lax`, válida por 30 dias e renovada com o uso.
- **Envio:** SMTP via `lettre`, com provedor intercambiável por configuração. Em desenvolvimento, o
  código aparece no log.

## Consequências

- Um serviço externo (SMTP) passa a ser necessário a partir da fase 3.
- Login com Google ou WhatsApp pode ser acrescentado depois, sem mudar o modelo de sessão.
